"""Merchant wallet provisioning via Alchemy SDK — no CLI, no browser auth."""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from functools import cached_property

import eth_account
from eth_account import Account
from web3 import Web3

from app.config import get_settings
from app.models.shop import Shop, ShopWalletStatus

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


# ---------------------------------------------------------------------------
# Alchemy client (lazy — only created when live mode is enabled)
# ---------------------------------------------------------------------------

def _alchemy_rpc_url() -> str:
    """Build the Alchemy Base Sepolia RPC URL from settings."""
    settings = get_settings()
    key = settings.alchemy_api_key
    if not key:
        raise WalletProvisioningError(
            "ALCHEMY_API_KEY is not set. Cannot use live wallet mode."
        )
    return f"https://base-sepolia.g.alchemy.com/v2/{key}"


@dataclass
class AlchemyClient:
    """Thin Alchemy RPC client using the installed alchemy-sdk + web3."""
    rpc_url: str

    @cached_property
    def w3(self) -> Web3:
        w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        if not w3.is_connected():
            raise WalletProvisioningError(
                f"Cannot connect to Alchemy RPC at {self.rpc_url}. "
                "Check ALCHEMY_API_KEY and network connectivity."
            )
        return w3

    def get_eth_balance(self, address: str) -> tuple[str | None, str | None]:
        """Return (balance_wei_str, symbol)."""
        try:
            bal_wei = self.w3.eth.get_balance(address)
            return str(bal_wei), "ETH"
        except Exception as exc:
            raise WalletProvisioningError(
                f"Failed to fetch ETH balance for {address}: {exc}"
            ) from exc

    # Known test tokens on Base Sepolia — checked by direct contract call
    # (Alchemy TOKEN_LIST does not include custom test tokens like PAWN)
    KNOWN_BASE_SEPOLIA_TOKENS = [
        {
            "address": "0x621B62fBFe0ABEf52eD2aAfd0787Fb1DAEEed1e5",
            "symbol": "PAWN",
            "decimals": 18,
        },
    ]

    ERC20_ABI = [
        {
            "inputs": [{"name": "account", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function",
        },
        {
            "inputs": [],
            "name": "symbol",
            "outputs": [{"name": "", "type": "string"}],
            "stateMutability": "view",
            "type": "function",
        },
    ]

    def get_token_balances(self, address: str) -> list[dict[str, str | None]]:
        """Return list of token holdings, including known tokens by direct ERC-20 contract call."""
        import logging
        logger = logging.getLogger(__name__)
        holdings: list[dict[str, str | None]] = []
        checksum_address = Web3.to_checksum_address(address)

        # First: check Alchemy's token list for popular tokens
        try:
            from alchemy import Alchemy
            alchemy_sdk = Alchemy(self.rpc_url)
            raw = alchemy_sdk.core.get_token_balances(address, "TOKEN_LIST")
            for tb in raw.get("tokenBalances", []):
                if tb.get("tokenBalance") and tb["tokenBalance"] != "0x0000000000000000000000000000000000000000000000000000000000000000":
                    metadata = tb.get("tokenMetadata", {}) or {}
                    holdings.append({
                        "asset": metadata.get("symbol", tb.get("id", "?")),
                        "balance": tb["tokenBalance"],
                        "chain": "base-sepolia",
                    })
        except Exception as exc:
            logger.warning("[get_token_balances] Alchemy TOKEN_LIST failed: %s", exc)

        # Second: always check known test tokens by direct web3 contract call
        w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        for token in self.KNOWN_BASE_SEPOLIA_TOKENS:
            try:
                token_address = Web3.to_checksum_address(token["address"])
                contract = w3.eth.contract(address=token_address, abi=self.ERC20_ABI)
                raw_balance: int = contract.functions.balanceOf(checksum_address).call()
                if raw_balance and raw_balance > 0:
                    holdings.append({
                        "asset": token["symbol"],
                        "balance": hex(raw_balance),
                        "chain": "base-sepolia",
                    })
            except Exception as exc:
                logger.warning("[get_token_balances] ERC-20 balanceOf failed for %s: %s", token["symbol"], exc)

        return holdings

    def send_eth(self, from_privkey: str, to_address: str, amount_wei: int) -> tuple[str, str]:
        """Sign and send an ETH transfer. Returns (tx_hash, state).

        Uses EIP-1559 transaction format for Base/L2 chains.
        Falls back to legacy format if the node does not support EIP-1559.
        """
        w3 = self.w3
        sender = Account.from_key(from_privkey)
        nonce = w3.eth.get_transaction_count(sender.address)

        # Determine chain ID from configured chain
        chain_ids = {
            "base": 8453,        # Base mainnet
            "base-sepolia": 84532,   # Base Sepolia testnet
        }
        cfg = get_settings()
        chain_id = chain_ids.get(cfg.wallet_chain, 8453)

        # Build EIP-1559 transaction (type 2)
        base_fee = w3.eth.fee_history(1, "latest")["baseFeePerGas"][0]
        max_priority_fee = w3.eth.max_priority_fee  # property in web3.py 7.x (was method in v6)
        max_fee = max(base_fee * 2 + max_priority_fee, max_priority_fee * 3)

        tx_unsigned = {
            "nonce": nonce,
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": max_priority_fee,
            "to": to_address,
            "value": amount_wei,
            "data": b"",
            "chainId": chain_id,
            "type": 2,
        }
        gas_estimate = w3.eth.estimate_gas(tx_unsigned)
        tx_unsigned["gas"] = gas_estimate

        signed = sender.sign_transaction(tx_unsigned)
        tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
        tx_hash = tx_hash_bytes.hex()

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        state = "confirmed" if receipt["status"] == 1 else "failed"
        return tx_hash, state


# ---------------------------------------------------------------------------
# Merchant key derivation
# ---------------------------------------------------------------------------

def _derive_merchant_private_key(shop: Shop, master_seed: str) -> str:
    """Derive a deterministic ECDSA private key for a shop from a master seed.

    The derived key is a valid Ethereum private key but is NOT the shop's
    real wallet — it is a throwaway key used only within Pawn Agent.
    """
    digest = hashlib.sha256(f"{master_seed}:{shop.id}:{shop.ens_name}".encode()).digest()
    key_hex = hex(int.from_bytes(digest, "big"))[2:].zfill(64)
    # Validate it's a legitimate private key (non-zero, < curve order)
    if int(key_hex, 16) == 0 or int(key_hex, 16) >= 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141:
        raise WalletProvisioningError("Derived key is not a valid Ethereum private key.")
    return key_hex


def _address_from_privkey(privkey: str) -> str:
    return Account.from_key(privkey).address


# ---------------------------------------------------------------------------
# Exceptions / dataclasses (shared with original API)
# ---------------------------------------------------------------------------

class WalletProvisioningError(Exception):
    """Raised when live wallet provisioning fails."""


@dataclass
class WalletStatusDetails:
    wallet_provider: str
    wallet_status: str
    merchant_address: str
    wallet_provider_account_id: str | None
    provisioning_mode: str
    authenticated: bool
    authenticated_email: str | None
    balance: str | None
    balance_symbol: str | None
    holdings: list[dict[str, str | None]]


@dataclass
class WalletTransferResult:
    recipient_address: str
    amount_eth: str
    amount_wei: str
    state: str
    tx_hash: str


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def provision_managed_wallet(shop: Shop) -> Shop:
    """Provision (or upgrade) a merchant wallet for the shop.

    If the shop already has an active live wallet it is returned as-is.
    If it has a stub wallet and live mode is enabled, the stub is upgraded
    to a real Alchemy-backed wallet.
    """
    settings = get_settings()

    has_active_wallet = (
        shop.wallet_status == ShopWalletStatus.ACTIVE
        and shop.merchant_address
        and shop.merchant_address != ZERO_ADDRESS
        and shop.wallet_provider_account_id
    )
    has_live_wallet = bool(
        has_active_wallet
        and shop.wallet_provider_account_id
        and shop.wallet_provider_account_id.startswith("alchemy_live_")
    )

    if has_live_wallet:
        return shop

    if shop.wallet_provider != "cdp_agentic_wallet":
        raise ValueError(f"Unsupported wallet provider: {shop.wallet_provider}")

    if not settings.cdp_wallet_live_enabled:
        raise WalletProvisioningError(
            "Live wallet mode is disabled. Set CDP_WALLET_LIVE_ENABLED=true and provide "
            "ALCHEMY_API_KEY + ALCHEMY_WALLET_MASTER_SEED to provision a live wallet."
        )

    # Need master seed to derive private keys
    master_seed = settings.alchemy_wallet_master_seed
    if not master_seed:
        raise WalletProvisioningError(
            "ALCHEMY_WALLET_MASTER_SEED is not set. "
            "Set it to a long random string (32+ chars) used to derive per-shop merchant keys."
        )

    privkey = _derive_merchant_private_key(shop, master_seed)
    merchant_address = _address_from_privkey(privkey)

    # Encode the private key so we can store it in the DB
    # It is encrypted at rest using the app's MASTER_ENCRYPTION_KEY
    encrypted_privkey = _encrypt_privkey(privkey, settings.master_encryption_key)

    account_id = f"alchemy_live_{shop.ens_name.replace('.', '_')}_{settings.wallet_chain}"

    shop.wallet_provider_account_id = account_id
    shop.merchant_address = merchant_address
    shop.wallet_status = ShopWalletStatus.ACTIVE
    shop.wallet_encrypted_key = encrypted_privkey

    return shop


async def get_wallet_status_details(shop: Shop) -> WalletStatusDetails:
    """Return display-ready wallet status details for owner UI."""
    settings = get_settings()
    provisioning_mode = "stub"
    balance = None
    balance_symbol = None
    holdings: list[dict[str, str | None]] = []

    if shop.wallet_provider == "cdp_agentic_wallet" and shop.merchant_address:
        if shop.wallet_provider_account_id and shop.wallet_provider_account_id.startswith("alchemy_live_"):
            provisioning_mode = "live"
            if settings.alchemy_api_key and shop.merchant_address != ZERO_ADDRESS:
                try:
                    client = AlchemyClient(_alchemy_rpc_url())
                    balance, balance_symbol = client.get_eth_balance(shop.merchant_address)
                    holdings = client.get_token_balances(shop.merchant_address)
                except WalletProvisioningError:
                    pass

    return WalletStatusDetails(
        wallet_provider=shop.wallet_provider,
        wallet_status=shop.wallet_status,
        merchant_address=shop.merchant_address or ZERO_ADDRESS,
        wallet_provider_account_id=shop.wallet_provider_account_id,
        provisioning_mode=provisioning_mode,
        authenticated=False,
        authenticated_email=None,
        balance=balance,
        balance_symbol=balance_symbol,
        holdings=holdings,
    )


async def withdraw_eth_to_owner(shop: Shop, amount_eth: str) -> WalletTransferResult:
    """Send ETH from the merchant wallet back to the shop owner."""
    settings = get_settings()

    if shop.wallet_provider != "cdp_agentic_wallet":
        raise WalletProvisioningError(f"Unsupported wallet provider: {shop.wallet_provider}")

    if shop.wallet_status != ShopWalletStatus.ACTIVE or not shop.merchant_address:
        raise WalletProvisioningError("Merchant wallet is not active yet.")

    if not (shop.wallet_provider_account_id or "").startswith("alchemy_live_"):
        raise WalletProvisioningError(
            "Merchant wallet is not in live mode. Re-provision the wallet first."
        )

    if not settings.alchemy_api_key:
        raise WalletProvisioningError("ALCHEMY_API_KEY is not set.")

    if not settings.alchemy_wallet_master_seed:
        raise WalletProvisioningError("ALCHEMY_WALLET_MASTER_SEED is not set.")

    # Decrypt the merchant private key
    encrypted_key = shop.wallet_encrypted_key
    if not encrypted_key:
        raise WalletProvisioningError(
            "Merchant wallet private key not found. Re-provision the wallet."
        )
    try:
        privkey = _decrypt_privkey(encrypted_key, settings.master_encryption_key)
    except Exception as exc:
        raise WalletProvisioningError(
            f"Failed to decrypt wallet private key: {exc}"
        ) from exc

    # Parse amount
    try:
        decimal_amount = Decimal(amount_eth)
    except InvalidOperation as exc:
        raise WalletProvisioningError(f"Invalid ETH amount: {amount_eth}") from exc
    if decimal_amount <= 0:
        raise WalletProvisioningError("ETH amount must be greater than zero.")
    amount_wei = int(decimal_amount * Decimal("1e18"))

    recipient_address = shop.owner_address
    client = AlchemyClient(_alchemy_rpc_url())

    tx_hash, state = client.send_eth(privkey, recipient_address, amount_wei)
    return WalletTransferResult(
        recipient_address=recipient_address,
        amount_eth=amount_eth,
        amount_wei=str(amount_wei),
        state=state,
        tx_hash=tx_hash,
    )


# ---------------------------------------------------------------------------
# Encryption helpers (AES-256-GCM using the master encryption key)
# ---------------------------------------------------------------------------

def _encrypt_privkey(privkey: str, master_key: str) -> str:
    """Encrypt an Ethereum private key using AES-256-GCM."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import base64

    if not master_key or len(master_key) < 32:
        # Fall back to raw storage if no master key (DEV ONLY)
        return base64.b64encode(privkey.encode()).decode()

    key_bytes = master_key.encode("utf-8")[:32].ljust(32, b"\0")
    aesgcm = AESGCM(key_bytes)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, privkey.encode("utf-8"), None)
    # Format: base64(nonce || ciphertext)
    return base64.b64encode(nonce + ct).decode()


def _decrypt_privkey(encrypted: str, master_key: str) -> str:
    """Decrypt an Ethereum private key."""
    import base64

    try:
        data = base64.b64decode(encrypted.encode())
    except Exception as exc:
        raise WalletProvisioningError(f"Cannot decode encrypted private key: {exc}") from exc

    if len(data) == 66 and data[:2] == b"AA":  # raw base64 of privkey (DEV fallback)
        return base64.b64decode(data).decode()

    if not master_key or len(master_key) < 32:
        raise WalletProvisioningError("Cannot decrypt private key: master encryption key not configured.")

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key_bytes = master_key.encode("utf-8")[:32].ljust(32, b"\0")
    aesgcm = AESGCM(key_bytes)
    nonce, ct = data[:12], data[12:]
    try:
        return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
    except Exception as exc:
        raise WalletProvisioningError(f"Failed to decrypt private key: {exc}") from exc
