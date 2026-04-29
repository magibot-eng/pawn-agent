"""AES-256-GCM encryption utilities using the application master key."""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EncryptionError(Exception):
    """Raised when encryption or decryption fails."""
    pass


def _load_key() -> bytes:
    """Load and validate the 32-byte master key from settings."""
    from app.config import get_settings
    key_hex = get_settings().master_encryption_key
    if not key_hex:
        raise EncryptionError(
            "PAWN_AGENT_MASTER_ENCRYPTION_KEY is not set. "
            "Set it to a 64-character hex string (32 bytes) in your .env file."
        )
    try:
        key = bytes.fromhex(key_hex)
    except ValueError:
        raise EncryptionError("MASTER_ENCRYPTION_KEY must be a valid 64-character hex string.")
    if len(key) != 32:
        raise EncryptionError("MASTER_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars).")
    return key


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string and return a base64-encoded ciphertext.

    Uses AES-256-GCM with a random 12-byte nonce per call.
    Returns format: base64(nonce || ciphertext)
    """
    if not plaintext:
        raise EncryptionError("Cannot encrypt empty plaintext.")

    key = _load_key()
    aes = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM

    ciphertext = aes.encrypt(nonce, plaintext.encode("utf-8"), aad=None)
    # Prepend nonce to ciphertext for storage
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode("utf-8")


def decrypt(encrypted: str) -> str:
    """Decrypt a base64-encoded ciphertext back to plaintext.

    Expects the format produced by encrypt(): base64(nonce || ciphertext)
    """
    if not encrypted:
        raise EncryptionError("Cannot decrypt empty ciphertext.")

    key = _load_key()
    aes = AESGCM(key)

    try:
        combined = base64.b64decode(encrypted.encode("utf-8"))
    except Exception as e:
        raise EncryptionError(f"Invalid base64 encoding: {e}")

    if len(combined) < 12:
        raise EncryptionError("Encrypted data is too short to contain a nonce.")

    nonce = combined[:12]
    ciphertext = combined[12:]

    try:
        plaintext = aes.decrypt(nonce, ciphertext, aad=None)
    except Exception as e:
        raise EncryptionError(f"Decryption failed (wrong key or tampered data): {e}")

    return plaintext.decode("utf-8")
