"""Server-side ENS resolution helpers for authoritative storefront verification."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from Crypto.Hash import keccak

from app.config import get_settings

ENS_REGISTRY_RESOLVER_SELECTOR = "0178b8bf"
ENS_ADDR_SELECTOR = "3b3b57de"


@dataclass
class EnsVerificationResult:
    status: str
    verified_owner_address: str | None


def _keccak(data: bytes) -> bytes:
    h = keccak.new(digest_bits=256)
    h.update(data)
    return h.digest()


def namehash(name: str) -> bytes:
    node = b"\x00" * 32
    normalized = name.strip().lower()
    if not normalized:
        return node
    for label in reversed(normalized.split(".")):
        node = _keccak(node + _keccak(label.encode("utf-8")))
    return node


def _encode_bytes32(value: bytes) -> str:
    return value.hex().rjust(64, "0")


def _checksumless(address: str) -> str:
    return address.strip().lower()


async def _eth_call(to_address: str, data: str) -> str:
    settings = get_settings()
    payload: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to_address,
                "data": data,
            },
            "latest",
        ],
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(settings.ens_rpc_url, json=payload)
        response.raise_for_status()
        body = response.json()
    if body.get("error"):
        raise RuntimeError(body["error"].get("message", "Unknown ENS RPC error"))
    result = body.get("result")
    if not isinstance(result, str):
        raise RuntimeError("Invalid ENS RPC response")
    return result


async def resolve_ens_owner_address(ens_name: str) -> str | None:
    settings = get_settings()
    node = namehash(ens_name)
    resolver_call = f"0x{ENS_REGISTRY_RESOLVER_SELECTOR}{_encode_bytes32(node)}"
    resolver_response = await _eth_call(settings.ens_registry_address, resolver_call)
    resolver_hex = resolver_response[2:] if resolver_response.startswith("0x") else resolver_response
    if len(resolver_hex) < 64:
        return None
    resolver_address = "0x" + resolver_hex[-40:]
    if int(resolver_address, 16) == 0:
        return None

    addr_call = f"0x{ENS_ADDR_SELECTOR}{_encode_bytes32(node)}"
    addr_response = await _eth_call(resolver_address, addr_call)
    addr_hex = addr_response[2:] if addr_response.startswith("0x") else addr_response
    if len(addr_hex) < 64:
        return None
    resolved_address = "0x" + addr_hex[-40:]
    if int(resolved_address, 16) == 0:
        return None
    return resolved_address


async def verify_ens_route(ens_name: str, owner_address: str) -> EnsVerificationResult:
    try:
        resolved_address = await resolve_ens_owner_address(ens_name)
    except Exception:
        return EnsVerificationResult(status="manual", verified_owner_address=None)

    if resolved_address and _checksumless(resolved_address) == _checksumless(owner_address):
        return EnsVerificationResult(status="verified", verified_owner_address=resolved_address)
    return EnsVerificationResult(status="manual", verified_owner_address=None)
