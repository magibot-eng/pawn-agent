"""Negotiation service — orchestrates the agent with database persistence."""

import hashlib
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.negotiator import run_merchant_response, NegotiationError, parse_quote_from_response
from app.models.negotiation import NegotiationSession
from app.models.shop import Shop
from app.models.provider_key import ProviderKey
from app.crypto import decrypt, EncryptionError


# ---------------------------------------------------------------------------
# Seller quote extraction helpers
# ---------------------------------------------------------------------------

_SELLER_QUOTE_PATTERNS = [
    # "sell 18,000 TIDE at $0.12 each"
    re.compile(
        r"sell\s+([\d,]+(?:\.\d+)?)\s+([A-Z]{2,10})\s+(?:at\s+)?\$?([\d.]+)\s*(?:each|per)?",
        re.IGNORECASE,
    ),
    # "offering 18,000 TIDE @ $0.12"
    re.compile(
        r"offering\s+([\d,]+(?:\.\d+)?)\s+([A-Z]{2,10})\s*[@]\s*\$?([\d.]+)",
        re.IGNORECASE,
    ),
    # "I have 18,000 TIDE I want to move at $0.12"
    re.compile(
        r"([\d,]+(?:\.\d+)?)\s+([A-Z]{2,10}).*?(?:at|for)\s+\$?([\d.]+)",
        re.IGNORECASE,
    ),
]


def extract_seller_quote(message: str) -> dict | None:
    """Parse structured seller quote: amount + token + asking price.

    Returns dict with keys: amount, token, price  or None if no match.
    """
    for pat in _SELLER_QUOTE_PATTERNS:
        m = pat.search(message)
        if m:
            amount_str = m.group(1).replace(",", "")
            return {
                "amount": amount_str,
                "token": m.group(2).upper(),
                "price": m.group(3),
            }
    return None


def extract_message_terms(message: str, fallback_token: str, fallback_amount: str) -> tuple[str, str, str]:
    """Extract best-effort token, amount, and seller ask display text from free text.

    This supports fallback scripted chat and looser natural language than the stricter
    structured quote parser above.
    """
    token = fallback_token
    amount = fallback_amount
    ask_display = "unknown"

    amount_token_match = re.search(r"([\d,]+(?:\.\d+)?)\s+([A-Z]{2,10})", message, re.IGNORECASE)
    if amount_token_match:
        amount = amount_token_match.group(1).replace(",", "")
        token = amount_token_match.group(2).upper()

    ask_match = re.search(
        r"(?:asking|need|want|for)\s+\$?([\d,]+(?:\.\d+)?)\s*([A-Z]{2,10})",
        message,
        re.IGNORECASE,
    )
    if ask_match:
        ask_display = f"{ask_match.group(1).replace(',', '')} {ask_match.group(2).upper()}"

    return token, amount, ask_display


def _quote_seed(negotiation: NegotiationSession, seller_message: str) -> int:
    digest = hashlib.sha256(f"{negotiation.id}:{seller_message.strip().lower()}".encode()).hexdigest()
    return int(digest[:8], 16)


def _demo_quote_for_negotiation(negotiation: NegotiationSession, seller_message: str) -> dict | None:
    try:
        quantity = Decimal(str(negotiation.input_amount or "0"))
    except Exception:
        return None

    if quantity <= 0:
        return None

    seed = _quote_seed(negotiation, seller_message)
    steps = 9
    rate_min = Decimal("0.00001")
    rate_max = Decimal("0.00010")
    rate = rate_min + (Decimal(seed % (steps + 1)) / Decimal(steps)) * (rate_max - rate_min)
    payout = (quantity / Decimal("100")) * rate
    payout = payout.quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    if payout <= 0:
        payout = Decimal("0.000001")

    return {
        "token": "ETH",
        "amount": format(payout.normalize(), "f"),
        "expiry": "10m",
    }


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

async def process_seller_message(
    negotiation_id: str,
    seller_message: str,
    db: AsyncSession,
) -> dict:
    """Process a seller's message, get merchant response, persist to DB.

    Returns:
        dict with keys: merchant_response, success, error, chat_log,
        response_mode, provider, model, used_fallback, negotiation_state,
        quote (the active merchant quote if any)
    """
    # Load negotiation
    result = await db.execute(
        select(NegotiationSession).where(NegotiationSession.id == negotiation_id)
    )
    negotiation = result.scalar_one_or_none()
    if negotiation is None:
        raise ValueError(f"Negotiation {negotiation_id} not found")

    # Load shop
    result = await db.execute(select(Shop).where(Shop.id == negotiation.shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise ValueError(f"Shop {negotiation.shop_id} not found")

    # Load active provider key
    result = await db.execute(
        select(ProviderKey)
        .where(ProviderKey.shop_id == shop.id, ProviderKey.is_active == True)
        .order_by(ProviderKey.created_at.desc())
    )
    provider_key = result.scalar_one_or_none()

    # Parse chat log
    try:
        chat_log = json.loads(negotiation.chat_log or "[]")
    except Exception:
        chat_log = []

    response_mode = "scripted_fallback"
    response_provider = None
    response_model = None
    response_error = None
    used_fallback = False
    parsed_quote = None

    if provider_key is None:
        # No provider key — return a scripted response for prototype
        merchant_text = _scripted_response(seller_message, shop, negotiation)
        used_fallback = True
    else:
        response_provider = provider_key.provider
        response_model = provider_key.model
        # Decrypt API key
        try:
            api_key_plaintext = decrypt(provider_key.encrypted_key)
        except EncryptionError:
            merchant_text = _scripted_response(seller_message, shop, negotiation)
            response_mode = "provider_error_fallback"
            response_error = "Failed to decrypt provider key"
            used_fallback = True
        else:
            # Call LLM
            try:
                raw_response = await run_merchant_response(
                    provider=provider_key.provider,
                    api_key=api_key_plaintext,
                    model=provider_key.model,
                    shop={
                        "display_name": shop.display_name,
                        "ens_name": shop.ens_name,
                        "description": shop.description,
                        "merchant_persona": shop.merchant_persona,
                        "buying_preferences": shop.buying_preferences,
                        "pricing_style": shop.pricing_style,
                        "refusal_rules": shop.refusal_rules,
                        "welcome_message": shop.welcome_message,
                        "contract_address": shop.contract_address,
                        "payout_token": shop.payout_token,
                    },
                    negotiation={
                        "input_token": negotiation.input_token,
                        "input_amount": negotiation.input_amount,
                    },
                    chat_history=chat_log,
                    seller_message=seller_message,
                )
                # Strip and parse embedded QUOTE:: line
                merchant_text, parsed_quote = parse_quote_from_response(raw_response)
                response_mode = "live_llm"
                provider_key.last_used_at = datetime.now(timezone.utc)
            except NegotiationError as e:
                merchant_text = _scripted_response(seller_message, shop, negotiation)
                response_mode = "provider_error_fallback"
                response_error = str(e)
                used_fallback = True

    # Parse seller structured quote
    seller_quote = extract_seller_quote(seller_message)

    if parsed_quote is None and negotiation.input_token != "0x0000000000000000000000000000000000000000":
        parsed_quote = _demo_quote_for_negotiation(negotiation, seller_message)
        if parsed_quote:
            merchant_text = (
                f"{merchant_text.rstrip()} Today, I would take that lot for {parsed_quote['amount']} ETH."
            ).strip()

    # Append messages to chat log
    timestamp = datetime.now(timezone.utc).isoformat()
    chat_log.append({"sender": "seller", "text": seller_message, "timestamp": timestamp})
    chat_log.append({"sender": "merchant", "text": merchant_text, "timestamp": timestamp})

    # Update negotiation state and quote fields
    negotiation.chat_log = json.dumps(chat_log, default=str)
    _apply_negotiation_state(negotiation, seller_message, seller_quote, parsed_quote, shop)

    await db.flush()
    await db.refresh(negotiation)

    return {
        "merchant_response": merchant_text,
        "success": True,
        "chat_log": chat_log,
        "response_mode": response_mode,
        "provider": response_provider,
        "model": response_model,
        "used_fallback": used_fallback,
        "error": response_error,
        "negotiation_state": _build_negotiation_state(negotiation, seller_quote),
        "quote": _build_quote_response(negotiation) if negotiation.quote_status != "none" else None,
    }


_KNOWN_TOKEN_SYMBOLS = {"ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "LINK", "UNI", "AAVE", "MKR", "CRV", "LDO", "SNX", "COMP", "BAT", "ZRX", "ENJ", "MANA", "SAND", "AXS", "SOL"}


def _is_valid_evm_address(value: str) -> bool:
    """Return True if value is a valid EVM address (0x + 40 hex chars, 42 chars total)."""
    if not isinstance(value, str):
        return False
    return len(value) == 42 and value.startswith("0x") and all(c in "0123456789abcdefABCDEF" for c in value[2:])


def _is_valid_token_symbol(value: str) -> bool:
    """Return True if value is a recognized token symbol (2–10 uppercase letters) that is
    NOT a raw EVM address string.

    Guards against cases where the unstructured amount+token regex accidentally captures
    English words (e.g. the "address" in "Base, address 0x...") as a token label.
    """
    if not isinstance(value, str):
        return False
    if value in _KNOWN_TOKEN_SYMBOLS:
        return True
    # Reject any all-uppercase string that is not a known symbol and is not an EVM address.
    # This catches accidental captures like "ADDRESS", "BASE", "ETHER", etc.
    if value.isupper() and value.isalpha() and len(value) <= 10:
        return False
    return True


def _apply_negotiation_state(
    negotiation: NegotiationSession,
    seller_message: str,
    seller_quote: dict | None,
    parsed_quote: dict | None,
    shop: Shop,
) -> None:
    """Derive and persist compact structured negotiation summary to the model."""
    normalized_message = seller_message.strip()
    parsed_token, parsed_amount, parsed_ask_display = extract_message_terms(
        normalized_message,
        fallback_token=negotiation.input_token,
        fallback_amount=str(negotiation.input_amount),
    )

    # Guard: if parsed_token looks like a raw EVM address (42-char 0x...) OR an accidental
    # uppercase word captured by the amount+token regex (e.g. "ADDRESS" from "Base, address"),
    # fall back to input_token.  This keeps negotiation_state.token meaningful.
    if _is_valid_evm_address(parsed_token) or not _is_valid_token_symbol(parsed_token):
        parsed_token = negotiation.input_token

    # Seller asking price
    if seller_quote:
        negotiation.seller_ask_token = seller_quote["token"]
        negotiation.seller_ask_amount = seller_quote["amount"]
        negotiation.seller_ask_price = seller_quote["price"]
    else:
        negotiation.seller_ask_token = parsed_token
        negotiation.seller_ask_amount = parsed_amount

    # Merchant quote
    if parsed_quote:
        negotiation.merchant_quote_token = parsed_quote["token"]
        negotiation.merchant_quote_amount = parsed_quote["amount"]
        negotiation.merchant_quote_expiry = parsed_quote["expiry"]
        negotiation.quote_status = "quoted"

    # Urgency
    urgency = "high" if re.search(
        r"\b(urgent|urgently|asap|today|immediately|now)\b",
        normalized_message,
        flags=re.IGNORECASE,
    ) else "normal"

    # Next action
    if negotiation.quote_status == "quoted":
        next_action = "await seller accept/counter"
    elif negotiation.input_token == "0x0000000000000000000000000000000000000000":
        next_action = "provide token contract"
    elif not seller_quote and parsed_ask_display == "unknown":
        next_action = "state asking price"
    else:
        next_action = "await merchant quote"

    negotiation.negotiation_state = {
        "token": seller_quote["token"] if seller_quote else parsed_token,
        "amount": seller_quote["amount"] if seller_quote else parsed_amount,
        "seller_ask": (
            f"{seller_quote['price']} {seller_quote['token']}"
            if seller_quote else parsed_ask_display
        ),
        "urgency": urgency,
        "merchant_stance": "reviewing",
        "next_action": next_action,
    }


def _build_negotiation_state(negotiation: NegotiationSession, seller_quote: dict | None) -> dict | None:
    """Build the public NegotiationState dict from model fields."""
    raw = negotiation.negotiation_state
    # Handle: dict (already parsed), JSON string, or None
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return None
    return None

    return {
        "token": seller_quote["token"] if seller_quote else (
            negotiation.seller_ask_token or negotiation.input_token
        ),
        "amount": seller_quote["amount"] if seller_quote else (
            negotiation.seller_ask_amount or negotiation.input_amount
        ),
        "seller_ask": (
            f"{seller_quote['price']} {seller_quote['token']}"
            if seller_quote else
            f"{negotiation.seller_ask_price} {negotiation.seller_ask_token}"
            if negotiation.seller_ask_price and negotiation.seller_ask_token
            else "unknown"
        ),
        "urgency": "normal",
        "merchant_stance": "reviewing",
        "next_action": "await merchant quote",
    }


def _build_quote_response(negotiation: NegotiationSession) -> dict | None:
    """Build the public quote dict for ChatResponse if a quote is active."""
    if not negotiation.quote_status or negotiation.quote_status == "none":
        return None
    return {
        "status": negotiation.quote_status,
        "payout_token": negotiation.merchant_quote_token or "",
        "payout_amount": negotiation.merchant_quote_amount or "",
        "expiry": negotiation.merchant_quote_expiry or "",
        "seller_ask_token": negotiation.seller_ask_token or "",
        "seller_ask_amount": negotiation.seller_ask_amount or "",
        "seller_ask_price": negotiation.seller_ask_price or "",
        "input_token": negotiation.input_token or "",
        "input_amount": negotiation.input_amount or "",
    }


def _scripted_response(message: str, shop: Shop, negotiation: NegotiationSession) -> str:
    """Fallback scripted responses when no provider key is configured."""
    msg_lower = message.lower()

    if any(greet in msg_lower for greet in ["hello", "hi", "hey", "help"]):
        return (
            f"⚓ {shop.display_name} hears you. Bring your cargo to the counter. "
            f"State your token, amount, and what you're asking."
        )
    if "token" in msg_lower or "amount" in msg_lower or "sell" in msg_lower:
        return (
            "⚓ Your terms are noted. Show me the token contract and how much you carry. "
            "I'll tell you what I can offer — if anything — by my rules."
        )
    if "accept" in msg_lower or "deal" in msg_lower or "yes" in msg_lower:
        return "⚓ Before I seal this — confirm the token contract address and your wallet are ready for settlement."
    if "counter" in msg_lower or "better" in msg_lower or "more" in msg_lower:
        return "⚓ I don't improve on rumours. Show me your proof of holdings and I may move the number."
    return (
        "⚓ Speak plainly. Token, amount, and your asking price. "
        "I have rules — state your business."
    )
