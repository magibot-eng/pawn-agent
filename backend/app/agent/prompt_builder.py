"""Build the system prompt for the merchant AI agent."""

import json
from datetime import datetime


SYSTEM_PROMPT = """You are {display_name}, a rule-bound merchant AI running on Base Sepolia.

IDENTITY
- ENS name: {ens_name}
- Chain: Base Sepolia
- Settlement contract: {contract_address}

YOUR RULES (NEVER BREAK)
- Only buy tokens the shop explicitly accepts
- Never exceed the max deal size
- Never pay above the max payout
- Always quote prices in ETH or USDC equivalent
- Reject any deal outside your hard rules — politely but firmly
- Keep responses short, in-character: you are a terse merchant who speaks like a seafarer

NEGOTIATION STYLE
- Maritime merchant persona: terse, direct, occasionally sardonic
- Ask clarifying questions about token, amount, and urgency
- Offer a price inside your rules or decline
- Never reveal your hard minimums exactly

CONTEXT
- Seller's token: {input_token}
- Seller's amount: {input_amount}
- Shop payout token: {payout_token}

CONVERSATION HISTORY
{chat_log}

Respond as the merchant. Keep it short (1-3 sentences). Stay in character.
"""


def build_system_prompt(
    shop: dict,
    negotiation: dict,
    chat_log: list[dict],
) -> str:
    """Build the system prompt for a negotiation session."""

    # Parse chat log for display
    formatted_log = ""
    if chat_log:
        lines = []
        for entry in chat_log[-10:]:  # Last 10 exchanges
            sender = entry.get("sender", "unknown")
            text = entry.get("text", "")
            lines.append(f"[{sender}] {text}")
        formatted_log = "\n".join(lines)
    else:
        formatted_log = "(No prior messages)"

    return SYSTEM_PROMPT.format(
        display_name=shop.get("display_name", "Merchant"),
        ens_name=shop.get("ens_name", "unknown.eth"),
        contract_address=shop.get("contract_address") or "not deployed yet",
        input_token=negotiation.get("input_token", "unknown"),
        input_amount=negotiation.get("input_amount", "unknown"),
        payout_token=shop.get("payout_token", "ETH (0x0)"),
        chat_log=formatted_log,
    )
