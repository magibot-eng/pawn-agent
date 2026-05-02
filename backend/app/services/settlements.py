"""Quote acceptance and settlement orchestration."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from web3 import Web3
from eth_account import Account

from app.config import get_settings
from app.models.deal import DealOffer, Execution
from app.models.negotiation import NegotiationSession
from app.models.shop import Shop, ShopWalletStatus
from app.services.wallets import (
    ZERO_ADDRESS,
    WalletProvisioningError,
    AlchemyClient,
    _decrypt_privkey,
    _alchemy_rpc_url,
)


# Minimal ERC-20 ABI with transferFrom and allowance
_ERC20_ABI = [
    {
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "transferFrom",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


# PAWN token address on Base Sepolia (curated test token deployed for Pawn Agent)
PAWN_TOKEN_ADDRESS = "0x621B62fBFe0ABEf52eD2aAfd0787Fb1DAEEed1e5"

# BuyoutSettlement contract — no longer used (direct wallet settlement replaces contract path)
BUYOUT_CONTRACT_ADDRESS = "0x754e37A77c177B92873e3057e5884dc6D0c0C4CE"

# Base Sepolia chain ID
BASE_SEPOLIA_CHAIN_ID = 84532


class SettlementError(Exception):
    """Raised when an accepted quote cannot proceed to settlement."""


def _parse_expiry_label(expiry: str) -> datetime:
    now = datetime.now(timezone.utc)
    if expiry.endswith("m") and expiry[:-1].isdigit():
        return now + timedelta(minutes=int(expiry[:-1]))
    if expiry.endswith("h") and expiry[:-1].isdigit():
        return now + timedelta(hours=int(expiry[:-1]))
    return now + timedelta(minutes=5)


def _deal_id(seed: str) -> str:
    return "0x" + hashlib.sha256(seed.encode()).hexdigest()


def _is_eth_payout_token(token: str) -> bool:
    normalized = (token or "").strip().lower()
    return normalized in {"eth", ZERO_ADDRESS.lower()}


def _eth_amount_to_wei(amount: str) -> str:
    try:
        decimal_amount = Decimal(amount)
    except InvalidOperation as exc:
        raise SettlementError(f"Invalid ETH payout amount: {amount}") from exc

    if decimal_amount <= 0:
        raise SettlementError("ETH payout amount must be greater than zero.")

    wei_amount = decimal_amount * Decimal("1000000000000000000")
    if wei_amount != wei_amount.to_integral_value():
        raise SettlementError("ETH payout amount must use 18 decimals or fewer.")

    return str(int(wei_amount))


def _input_amount_to_wei(amount: str) -> int:
    """Convert a decimal string amount to integer wei (18 decimal places)."""
    try:
        decimal_amount = Decimal(amount)
    except InvalidOperation as exc:
        raise SettlementError(f"Invalid input amount: {amount}") from exc

    if decimal_amount <= 0:
        raise SettlementError("Input amount must be greater than zero.")

    wei_amount = decimal_amount * Decimal("1000000000000000000")
    if wei_amount != wei_amount.to_integral_value():
        raise SettlementError("Input amount must use 18 decimals or fewer.")

    return int(wei_amount)


def _submit_eth_settlement(shop: Shop, recipient: str, payout_amount: str) -> tuple[str, str, str]:
    """Send ETH from the merchant wallet to the seller via Alchemy SDK."""
    settings = get_settings()
    if not settings.cdp_wallet_live_enabled:
        raise SettlementError("Live wallet mode must be enabled for real Base Sepolia settlement. Set CDP_WALLET_LIVE_ENABLED=true.")
    if not settings.alchemy_api_key:
        raise SettlementError("ALCHEMY_API_KEY is not set.")
    if not settings.alchemy_wallet_master_seed:
        raise SettlementError("ALCHEMY_WALLET_MASTER_SEED is not set.")

    payout_sent_wei = _eth_amount_to_wei(payout_amount)

    encrypted_key = shop.wallet_encrypted_key
    if not encrypted_key:
        raise SettlementError("Merchant wallet private key not found. Re-provision the wallet.")
    privkey = _decrypt_privkey(encrypted_key, settings.master_encryption_key)

    try:
        client = AlchemyClient(_alchemy_rpc_url())
        tx_hash, state = client.send_eth(privkey, recipient, int(payout_sent_wei))
    except WalletProvisioningError as exc:
        raise SettlementError(f"Base Sepolia settlement failed: {exc}") from exc
    except Exception as exc:
        raise SettlementError(f"Base Sepolia settlement failed: {type(exc).__name__}: {exc}") from exc

    return tx_hash, state, payout_sent_wei


def _pull_tokens_and_settle(
    shop: Shop,
    seller: str,
    input_token: str,
    input_amount_wei: int,
    payout_amount_wei: int,
) -> tuple[str, str, str]:
    """
    Step 1: Pull ERC-20 tokens from seller into merchant wallet via transferFrom.
    Step 2: Send ETH from merchant wallet to seller.

    Returns (tx_hash, execution_state, payout_sent_wei).
    Raises SettlementError if either step fails.
    """
    settings = get_settings()

    if not settings.cdp_wallet_live_enabled:
        raise SettlementError("Live wallet mode must be enabled for real Base Sepolia settlement. Set CDP_WALLET_LIVE_ENABLED=true.")
    if not settings.alchemy_api_key:
        raise SettlementError("ALCHEMY_API_KEY is not set.")
    if not settings.alchemy_wallet_master_seed:
        raise SettlementError("ALCHEMY_WALLET_MASTER_SEED is not set.")

    encrypted_key = shop.wallet_encrypted_key
    if not encrypted_key:
        raise SettlementError("Merchant wallet private key not found. Re-provision the wallet.")
    privkey = _decrypt_privkey(encrypted_key, settings.master_encryption_key)

    rpc_url = _alchemy_rpc_url()
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise SettlementError(f"Cannot connect to Alchemy RPC at {rpc_url}.")

    merchant_address = shop.merchant_address
    merchant_account = Account.from_key(privkey)

    # Step 0 — Pre-flight: check merchant ETH balance for payout + gas buffer
    balance_wei = w3.eth.get_balance(merchant_address)
    base_fee = w3.eth.fee_history(1, "latest")["baseFeePerGas"][0]
    max_priority_fee = w3.eth.max_priority_fee
    max_fee = max(base_fee * 2 + max_priority_fee, max_priority_fee * 3)
    gas_buffer_wei = 200_000 * max_fee  # rough buffer for 2 txs
    required_wei = payout_amount_wei + gas_buffer_wei
    if balance_wei < required_wei:
        raise SettlementError(
            f"Merchant wallet balance ({balance_wei} wei) insufficient. "
            f"Need at least {required_wei} wei for payout + gas. "
            f"Fund the wallet or reduce the payout amount."
        )

    token_contract = w3.eth.contract(address=Web3.to_checksum_address(input_token), abi=_ERC20_ABI)

    # Step 1 — Pull tokens from seller into merchant wallet
    nonce = w3.eth.get_transaction_count(merchant_address)
    token_tx = token_contract.functions.transferFrom(
        seller,             # from — seller must have approved merchant wallet
        merchant_address,   # to — merchant wallet receives tokens
        input_amount_wei,   # amount
    ).build_transaction({
        "nonce": nonce,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": max_priority_fee,
        "chainId": BASE_SEPOLIA_CHAIN_ID,
        "from": merchant_address,
        "gas": 150_000,
    })

    signed_token_tx = merchant_account.sign_transaction(token_tx)
    token_tx_hash_bytes = w3.eth.send_raw_transaction(signed_token_tx.raw_transaction)
    token_tx_hash = token_tx_hash_bytes.hex()
    token_receipt = w3.eth.wait_for_transaction_receipt(token_tx_hash, timeout=120)

    if token_receipt["status"] != 1:
        raise SettlementError(
            f"Token pull failed. Seller may not have approved the merchant wallet. tx: {token_tx_hash}"
        )

    # Step 2 — Send ETH payout to seller
    nonce2 = w3.eth.get_transaction_count(merchant_address)
    eth_tx_unsigned = {
        "nonce": nonce2,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": max_priority_fee,
        "to": seller,
        "value": payout_amount_wei,
        "data": b"",
        "chainId": BASE_SEPOLIA_CHAIN_ID,
        "type": 2,
    }
    eth_tx_unsigned["gas"] = w3.eth.estimate_gas(eth_tx_unsigned)
    signed_eth_tx = merchant_account.sign_transaction(eth_tx_unsigned)
    eth_tx_hash_bytes = w3.eth.send_raw_transaction(signed_eth_tx.raw_transaction)
    eth_tx_hash = eth_tx_hash_bytes.hex()
    eth_receipt = w3.eth.wait_for_transaction_receipt(eth_tx_hash, timeout=120)

    if eth_receipt["status"] != 1:
        raise SettlementError(
            f"ETH transfer failed but tokens were already pulled. "
            f"Manual intervention required. token_tx: {token_tx_hash}, eth_tx: {eth_tx_hash}"
        )

    return eth_tx_hash, "executed", str(payout_amount_wei)


def _simulate_eth_settlement(recipient: str, payout_amount: str, negotiation_id: str) -> tuple[str, str, str]:
    payout_sent_wei = _eth_amount_to_wei(payout_amount)
    fake_hash = "0x" + hashlib.sha256(f"{negotiation_id}:{recipient}:{payout_amount}:simulated".encode()).hexdigest()
    return fake_hash, "simulated", payout_sent_wei


def submit_offer_to_contract(
    shop: Shop,
    seller: str,
    input_token: str,
    input_amount_wei: int,
    payout_amount_wei: int,
    expires_at_ts: int,
    nonce: int,
) -> tuple[str, int]:
    """Submit a buyout offer to the BuyoutSettlement contract via Alchemy web3.

    Returns (tx_hash, deal_id) where deal_id is the uint256 returned by the contract.
    """
    settings = get_settings()

    if not settings.cdp_wallet_live_enabled:
        raise SettlementError("Live wallet mode must be enabled for contract calls.")
    if not settings.alchemy_api_key:
        raise SettlementError("ALCHEMY_API_KEY is not set.")
    if not settings.alchemy_wallet_master_seed:
        raise SettlementError("ALCHEMY_WALLET_MASTER_SEED is not set.")
    if not settings.buyout_contract_address:
        raise SettlementError("BUYOUT_CONTRACT_ADDRESS is not set.")

    # Decrypt merchant private key
    encrypted_key = shop.wallet_encrypted_key
    if not encrypted_key:
        raise SettlementError("Merchant wallet private key not found. Re-provision the wallet.")
    privkey = _decrypt_privkey(encrypted_key, settings.master_encryption_key)

    # Connect to Base Sepolia via Alchemy
    rpc_url = _alchemy_rpc_url()
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise SettlementError(f"Cannot connect to Alchemy RPC at {rpc_url}.")

    # Load contract ABI
    contract_address = settings.buyout_contract_address
    abi_path = "abis/BuyoutSettlement.json"
    try:
        with open(abi_path) as f:
            contract_data = json.load(f)
    except Exception as exc:
        raise SettlementError(f"Failed to load contract ABI: {exc}") from exc

    contract = w3.eth.contract(address=contract_address, abi=contract_data["abi"])

    # Build transaction
    sender = Account.from_key(privkey)
    nonce_eth = w3.eth.get_transaction_count(sender.address)
    base_fee = w3.eth.fee_history(1, "latest")["baseFeePerGas"][0]
    max_priority_fee = w3.eth.max_priority_fee
    max_fee = max(base_fee * 2 + max_priority_fee, max_priority_fee * 3)

    tx_unsigned = contract.functions.submitOffer(
        seller,
        input_token,
        input_amount_wei,
        payout_amount_wei,
        expires_at_ts,
        nonce,
    ).build_transaction({
        "nonce": nonce_eth,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": max_priority_fee,
        "chainId": BASE_SEPOLIA_CHAIN_ID,
        "from": sender.address,
    })

    # Estimate gas
    try:
        gas_estimate = w3.eth.estimate_gas(tx_unsigned)
        tx_unsigned["gas"] = gas_estimate
    except Exception:
        tx_unsigned["gas"] = 500_000

    # Sign and send
    signed = sender.sign_transaction(tx_unsigned)
    tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
    tx_hash = tx_hash_bytes.hex()

    # Wait for receipt
    try:
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    except Exception as exc:
        raise SettlementError(f"Transaction receipt timeout for {tx_hash}: {exc}") from exc

    if receipt["status"] != 1:
        raise SettlementError(f"submitOffer transaction {tx_hash} failed on-chain.")

    # Extract dealId from transaction logs (OfferSubmitted event)
    deal_id = None
    try:
        logs = receipt.get("logs", [])
        for log in logs:
            if log.get("address", "").lower() == contract_address.lower():
                # The OfferSubmitted event has topics:
                # topic[0] = keccak256("OfferSubmitted(uint256,address,address,address,uint256,uint256,uint256,uint256)")
                # We need to decode the first unindexed param (dealId)
                # For simplicity, decode via the contract function
                receipt_decoded = contract.events.OfferSubmitted().process_receipt(receipt)
                if receipt_decoded:
                    deal_id = receipt_decoded[0]["args"]["dealId"]
                    break
    except Exception:
        pass

    if deal_id is None:
        raise SettlementError(
            f"submitOffer succeeded but could not find OfferSubmitted event in logs for tx {tx_hash}. "
            "Verify the transaction on BaseScan."
        )

    return tx_hash, deal_id


async def accept_quote_and_execute(
    negotiation_id: str,
    payout_token: str,
    payout_amount: str,
    expiry: str,
    db: AsyncSession,
) -> tuple[DealOffer, Execution, NegotiationSession]:
    result = await db.execute(select(NegotiationSession).where(NegotiationSession.id == negotiation_id))
    negotiation = result.scalar_one_or_none()
    if negotiation is None:
        raise SettlementError(f"Negotiation {negotiation_id} not found")

    result = await db.execute(select(Shop).where(Shop.id == negotiation.shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise SettlementError(f"Shop {negotiation.shop_id} not found")

    # Allow stub wallets (merchant_address = ZERO_ADDRESS but wallet_provider_account_id starts with 'stub_')
    is_stub_wallet = (
        shop.wallet_provider_account_id is not None
        and shop.wallet_provider_account_id.startswith("stub_")
    )
    if (
        shop.wallet_status != ShopWalletStatus.ACTIVE
        or not shop.merchant_address
        or (shop.merchant_address == ZERO_ADDRESS and not is_stub_wallet)
    ):
        raise SettlementError("Merchant wallet is not active. Provision the merchant wallet before accepting quotes.")

    simulate_only = False
    settings = get_settings()
    if (
        not settings.cdp_wallet_live_enabled
        or not shop.wallet_provider_account_id
        or not shop.wallet_provider_account_id.startswith(("alchemy_live_", "cdpwa_live_"))
    ):
        simulate_only = True

    if not _is_eth_payout_token(payout_token):
        raise SettlementError("Real Base Sepolia settlement currently supports ETH payouts only.")

    seller = negotiation.seller_address
    if not seller:
        raise SettlementError("Negotiation is missing seller address.")

    # Generate a unique per-shop nonce for the on-chain deal
    # Use a hash of the negotiation id + timestamp to ensure uniqueness
    nonce_seed = f"{shop.id}:{negotiation.id}:{datetime.now(timezone.utc).isoformat()}"
    nonce = int(hashlib.sha256(nonce_seed.encode()).hexdigest()[:16], 16)

    expires_at_dt = _parse_expiry_label(expiry)
    expires_at_ts = int(expires_at_dt.timestamp())

    input_token = negotiation.input_token
    input_amount_wei = _input_amount_to_wei(str(negotiation.input_amount))
    payout_amount_wei_str = _eth_amount_to_wei(payout_amount)
    payout_amount_wei = int(payout_amount_wei_str)

    # Pre-create DealOffer first so we have a DB record even if contract call fails
    offer = DealOffer(
        id=str(uuid.uuid4()),
        shop_id=shop.id,
        negotiation_id=negotiation.id,
        chain_deal_id="pending",  # Will be updated after contract call
        seller=seller,
        input_token=input_token,
        input_amount=str(negotiation.input_amount),
        payout_amount=payout_amount,
        expires_at=expires_at_dt,
        state="pending",
    )
    db.add(offer)
    await db.flush()

    execution = Execution(
        id=str(uuid.uuid4()),
        shop_id=shop.id,
        deal_offer_id=offer.id,
        tx_hash=None,
        payout_sent_wei=payout_amount_wei_str,
        tokens_received=str(negotiation.input_amount),
        state="pending",
        error_message=None,
    )
    db.add(execution)
    await db.flush()

    # Owner approval gate: if auto_settlement is disabled, stub the settlement
    auto_settlement_blocked = (
        shop.auto_settlement_enabled is False
        and not simulate_only  # don't double-stub if already in sim mode
    )

    try:
        if simulate_only or auto_settlement_blocked:
            tx_hash, execution_state, payout_sent_wei = _simulate_eth_settlement(seller, payout_amount, negotiation.id)
            if auto_settlement_blocked:
                execution_state = "pending_review"
                execution.error_message = "Settlement blocked: auto_settlement disabled. Owner must approve from dashboard."
                offer.state = "pending_review"
            deal_id = nonce  # Use nonce as stand-in deal_id for simulation
            offer.chain_deal_id = _deal_id(f"{negotiation.id}:{seller}:{payout_amount}:simulated")
        else:
            # Two-step direct wallet settlement: pull ERC-20 tokens, then send ETH payout
            # Pre-flight: verify seller has approved the merchant wallet for the input token
            if input_token != ZERO_ADDRESS.lower() and not _is_eth_payout_token(input_token):
                rpc_url = _alchemy_rpc_url()
                w3_check = Web3(Web3.HTTPProvider(rpc_url))
                token_contract_check = w3_check.eth.contract(address=Web3.to_checksum_address(input_token), abi=_ERC20_ABI)
                allowance = token_contract_check.functions.allowance(seller, shop.merchant_address).call()
                if allowance < input_amount_wei:
                    raise SettlementError(
                        f"Seller has not approved the merchant wallet for this token. "
                        f"Allowance: {allowance}, Required: {input_amount_wei}. "
                        f"Seller must approve the token first."
                    )

            tx_hash, execution_state, payout_sent_wei = _pull_tokens_and_settle(
                shop=shop,
                seller=seller,
                input_token=input_token,
                input_amount_wei=input_amount_wei,
                payout_amount_wei=int(payout_amount_wei),
            )
            offer.chain_deal_id = tx_hash  # Use ETH tx hash as the on-chain deal record
    except SettlementError as exc:
        offer.state = "failed"
        execution.state = "failed"
        execution.error_message = str(exc)
        negotiation.error_message = str(exc)
        await db.flush()
        await db.refresh(offer)
        await db.refresh(execution)
        await db.refresh(negotiation)
        raise

    offer.state = execution_state
    execution.tx_hash = tx_hash
    execution.payout_sent_wei = payout_amount_wei_str
    execution.tokens_received = str(negotiation.input_amount)
    execution.input_token = input_token
    execution.input_amount = str(negotiation.input_amount)
    execution.state = execution_state
    execution.error_message = None

    negotiation.settled = True
    negotiation.agreed_payout = payout_amount
    negotiation.outcome = "accepted"
    negotiation.quote_status = "accepted"
    negotiation.error_message = None

    await db.flush()
    await db.refresh(offer)
    await db.refresh(execution)
    await db.refresh(negotiation)
    return offer, execution, negotiation


async def poll_offer_accepted(shop_id: str, db: AsyncSession) -> list[Execution]:
    """Poll for recent OfferAccepted events from BuyoutSettlement and update Execution records.

    For each OfferAccepted event found, looks up the Execution by chain_deal_id,
    updates its state to "executed" and stores the input_tx_hash from the event.

    Returns the list of Execution records that were updated.
    """
    settings = get_settings()

    if not settings.buyout_contract_address:
        raise SettlementError("BUYOUT_CONTRACT_ADDRESS is not configured.")

    if not settings.alchemy_api_key:
        raise SettlementError("ALCHEMY_API_KEY is not set.")

    # Connect via Alchemy
    rpc_url = _alchemy_rpc_url()
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise SettlementError(f"Cannot connect to Alchemy RPC at {rpc_url}.")

    # Load contract ABI
    contract_address = settings.buyout_contract_address
    abi_path = "abis/BuyoutSettlement.json"
    try:
        with open(abi_path) as f:
            contract_data = json.load(f)
    except Exception as exc:
        raise SettlementError(f"Failed to load contract ABI: {exc}") from exc

    contract = w3.eth.contract(address=contract_address, abi=contract_data["abi"])

    # Get events from the last 100 blocks
    try:
        latest_block = w3.eth.block_number
        from_block = max(0, latest_block - 100)
        events = contract.events.OfferAccepted().get_logs(from_block=from_block, to_block="latest")
    except Exception as exc:
        raise SettlementError(f"Failed to fetch OfferAccepted events: {exc}") from exc

    updated_executions: list[Execution] = []

    for event in events:
        try:
            args = event["args"]
            deal_id_hex = hex(args["dealId"]) if isinstance(args["dealId"], int) else args["dealId"]
            input_tx_hash = event["transactionHash"].hex()
        except Exception:
            continue

        # Find Execution by chain_deal_id
        result = await db.execute(
            select(Execution)
            .join(DealOffer, Execution.deal_offer_id == DealOffer.id)
            .where(
                DealOffer.shop_id == shop_id,
                DealOffer.chain_deal_id == deal_id_hex,
            )
        )
        execution = result.scalar_one_or_none()
        if execution is None:
            continue

        if execution.state == "executed":
            continue

        execution.state = "executed"
        execution.input_tx_hash = input_tx_hash
        execution.error_message = None
        updated_executions.append(execution)

        # Also update the associated DealOffer
        result2 = await db.execute(
            select(DealOffer).where(DealOffer.id == execution.deal_offer_id)
        )
        offer = result2.scalar_one_or_none()
        if offer:
            offer.state = "executed"

    if updated_executions:
        await db.flush()
        for exec in updated_executions:
            await db.refresh(exec)

    return updated_executions
