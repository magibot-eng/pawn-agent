"""Merchant AI negotiator — stateless, calls LLM providers via HTTP."""

import json
import logging
from typing import Literal

import httpx

from app.agent.prompt_builder import build_system_prompt

logger = logging.getLogger(__name__)

Provider = Literal["openai", "anthropic", "openrouter"]


class NegotiationError(Exception):
    """Raised when LLM call or response parsing fails."""
    pass


async def call_llm(
    provider: Provider,
    api_key: str,
    model: str,
    system_prompt: str,
    user_message: str,
    chat_history: list[dict],
) -> str:
    """Call the appropriate LLM provider and return the response text."""

    messages = []
    for entry in chat_history:
        role = entry.get("sender", "user")
        if role not in ("user", "assistant", "merchant", "seller"):
            role = "user"
        messages.append({"role": role, "content": entry.get("text", "")})
    messages.append({"role": "user", "content": user_message})

    if provider == "openai":
        return await _call_openai(api_key, model, system_prompt, messages)
    elif provider == "anthropic":
        return await _call_anthropic(api_key, model, system_prompt, messages)
    elif provider == "openrouter":
        return await _call_openrouter(api_key, model, system_prompt, messages)
    else:
        raise NegotiationError(f"Unknown provider: {provider}")


async def _call_openai(api_key: str, model: str, system_prompt: str, messages: list[dict]) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model or "gpt-4o-mini",
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "max_tokens": 200,
        "temperature": 0.7,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code != 200:
        raise NegotiationError(f"OpenAI API error {resp.status_code}: {resp.text}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def _call_anthropic(api_key: str, model: str, system_prompt: str, messages: list[dict]) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    # Merge system into first user message for Anthropic
    body = {
        "model": model or "claude-3-5-sonnet-20241022",
        "max_tokens": 200,
        "system": system_prompt,
        "messages": messages,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code != 200:
        raise NegotiationError(f"Anthropic API error {resp.status_code}: {resp.text}")
    data = resp.json()
    return data["content"][0]["text"]


async def _call_openrouter(api_key: str, model: str, system_prompt: str, messages: list[dict]) -> str:
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model or "openai/gpt-4o-mini",
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "max_tokens": 200,
        "temperature": 0.7,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code != 200:
        raise NegotiationError(f"OpenRouter API error {resp.status_code}: {resp.text}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def run_merchant_response(
    provider: Provider,
    api_key: str,
    model: str,
    shop: dict,
    negotiation: dict,
    chat_history: list[dict],
    seller_message: str,
) -> str:
    """Main entry point — build prompt, call LLM, return merchant text."""
    system_prompt = build_system_prompt(shop, negotiation, chat_history)
    return await call_llm(provider, api_key, model, system_prompt, seller_message, chat_history)
