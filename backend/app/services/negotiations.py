"""Negotiation service — orchestrates the agent with database persistence."""

import json
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.negotiator import run_merchant_response, NegotiationError
from app.models.negotiation import NegotiationSession
from app.models.shop import Shop
from app.models.provider_key import ProviderKey
from app.crypto import decrypt, EncryptionError


async def process_seller_message(
    negotiation_id: str,
    seller_message: str,
    db: AsyncSession,
) -> dict:
    """Process a seller's message, get merchant response, persist to DB.

    Returns:
        dict with keys: merchant_response, success, error
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
                merchant_text = await run_merchant_response(
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
                response_mode = "live_llm"
                provider_key.last_used_at = datetime.now(timezone.utc)
            except NegotiationError as e:
                merchant_text = _scripted_response(seller_message, shop, negotiation)
                response_mode = "provider_error_fallback"
                response_error = str(e)
                used_fallback = True

    # Append messages to chat log
    timestamp = datetime.now(timezone.utc).isoformat()
    chat_log.append({"sender": "seller", "text": seller_message, "timestamp": timestamp})
    chat_log.append({"sender": "merchant", "text": merchant_text, "timestamp": timestamp})
    negotiation.chat_log = json.dumps(chat_log, default=str)
    negotiation.negotiation_state = extract_negotiation_state(seller_message, negotiation)

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
        "negotiation_state": negotiation.negotiation_state,
    }


def extract_negotiation_state(message: str, negotiation: NegotiationSession) -> dict[str, str]:
    """Derive a compact structured negotiation summary for the MVP UI."""
    normalized_message = message.strip()
    normalized_upper = normalized_message.upper()

    amount_token_match = re.search(r"\b[\d,]+(?:\.\d+)?\s*([A-Z]{2,10})\b", normalized_upper)
    if amount_token_match:
        token = amount_token_match.group(1)
    else:
        token_match = re.search(r"\b([A-Z]{2,10})\b", normalized_upper)
        token = token_match.group(1) if token_match else negotiation.input_token

    ask_match = re.search(
        r"(?:asking|need|want|for)\s+\$?([\d,]+(?:\.\d+)?)\s*([A-Z]{2,10})?",
        normalized_message,
        flags=re.IGNORECASE,
    )
    if ask_match:
        ask_amount = ask_match.group(1).replace(",", "")
        ask_currency = (ask_match.group(2) or "").upper()
        seller_ask = f"{ask_amount} {ask_currency}".strip()
    else:
        seller_ask = "unknown"

    urgency = "high" if re.search(r"\b(urgent|urgently|asap|today|immediately|now)\b", normalized_message, flags=re.IGNORECASE) else "normal"

    next_action = "await merchant quote"
    if negotiation.input_token == "0x0000000000000000000000000000000000000000":
        next_action = "provide token contract"
    elif seller_ask == "unknown":
        next_action = "state asking price"

    return {
        "token": token,
        "amount": str(negotiation.input_amount).replace(",", ""),
        "seller_ask": seller_ask,
        "urgency": urgency,
        "merchant_stance": "reviewing",
        "next_action": next_action,
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
