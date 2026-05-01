"""Server-side ENS resolution helpers for authoritative storefront verification."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from Crypto.Hash import keccak

from app.config import get_settings

ENS_REGISTRY_RESOLVER_SELECTOR = "0178b8bf"
ENS_ADDR_SELECTOR = "3b3b57de"
ENS_NAME_SELECTOR = "691f3431"


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


def _decode_abi_string(result: str) -> str | None:
    payload = result[2:] if result.startswith("0x") else result
    if len(payload) < 128:
        return None
    try:
        string_length = int(payload[64:128], 16)
    except ValueError:
        return None
    data_hex = payload[128:128 + string_length * 2]
    if not data_hex:
        return None
    try:
        return bytes.fromhex(data_hex).decode("utf-8").strip() or None
    except Exception:
        return None


async def _resolver_address_for_name(name: str) -> str | None:
    settings = get_settings()
    node = namehash(name)
    resolver_call = f"0x{ENS_REGISTRY_RESOLVER_SELECTOR}{_encode_bytes32(node)}"
    resolver_response = await _eth_call(settings.ens_registry_address, resolver_call)
    resolver_hex = resolver_response[2:] if resolver_response.startswith("0x") else resolver_response
    if len(resolver_hex) < 64:
        return None
    resolver_address = "0x" + resolver_hex[-40:]
    if int(resolver_address, 16) == 0:
        return None
    return resolver_address


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


async def _fetch_web3bio_profiles(address: str) -> list[dict[str, Any]]:
    normalized_address = address.strip().lower()
    url = f"https://api.web3.bio/profile/{normalized_address}"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url)
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list):
        return []
    return [entry for entry in payload if isinstance(entry, dict)]


async def _lookup_primary_ens_via_web3bio(address: str) -> tuple[str | None, bool]:
    profiles = await _fetch_web3bio_profiles(address)
    if not profiles:
        return None, False

    first = profiles[0]
    identity = str(first.get("identity") or "")
    display_name = str(first.get("displayName") or "")
    for candidate in (identity, display_name):
        if candidate and candidate.lower().endswith(".eth"):
            return candidate, False
    return None, False


async def resolve_owned_ens_names(address: str) -> list[str]:
    profiles = await _fetch_web3bio_profiles(address)
    names: list[str] = []
    seen: set[str] = set()
    for profile in profiles:
        for raw in (profile.get("identity"), profile.get("displayName")):
            candidate = str(raw or "").strip().lower()
            if not candidate.endswith(".eth"):
                continue
            if candidate in seen:
                continue
            seen.add(candidate)
            names.append(candidate)
    return names


async def resolve_ens_owner_address(ens_name: str) -> str | None:
    node = namehash(ens_name)
    resolver_address = await _resolver_address_for_name(ens_name)
    if not resolver_address:
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


async def resolve_primary_ens_name(address: str) -> tuple[str | None, bool]:
    normalized = address.strip().lower().removeprefix("0x")
    if len(normalized) != 40:
        return None, False

    reverse_name = f"{normalized}.addr.reverse"
    reverse_node = namehash(reverse_name)
    try:
        resolver_address = await _resolver_address_for_name(reverse_name)
        if not resolver_address:
            return await _lookup_primary_ens_via_web3bio(address)

        name_call = f"0x{ENS_NAME_SELECTOR}{_encode_bytes32(reverse_node)}"
        name_response = await _eth_call(resolver_address, name_call)
        primary_name = _decode_abi_string(name_response)
        if not primary_name:
            return await _lookup_primary_ens_via_web3bio(address)

        try:
            resolved_owner = await resolve_ens_owner_address(primary_name)
        except Exception:
            resolved_owner = None
        verified = bool(resolved_owner and _checksumless(resolved_owner) == _checksumless(address))
        return primary_name, verified
    except Exception:
        return await _lookup_primary_ens_via_web3bio(address)


async def verify_ens_route(ens_name: str, owner_address: str) -> EnsVerificationResult:
    try:
        resolved_address = await resolve_ens_owner_address(ens_name)
    except Exception:
        return EnsVerificationResult(status="manual", verified_owner_address=None)

    if resolved_address and _checksumless(resolved_address) == _checksumless(owner_address):
        return EnsVerificationResult(status="verified", verified_owner_address=resolved_address)
    return EnsVerificationResult(status="manual", verified_owner_address=None)
