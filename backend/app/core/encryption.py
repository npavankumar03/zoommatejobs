from __future__ import annotations

import base64
import hashlib
import os
from secrets import token_bytes

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_NONCE_BYTES = 12


def _get_key() -> bytes:
    raw = os.getenv("ENCRYPTION_KEY")
    if not raw:
        raise RuntimeError("ENCRYPTION_KEY is required")
    # Deterministically derive 32 bytes for AES-256.
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt(text: str) -> str:
    if text is None:
        raise ValueError("text cannot be None")
    aes = AESGCM(_get_key())
    nonce = token_bytes(_NONCE_BYTES)
    ciphertext = aes.encrypt(nonce, text.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")


def decrypt(encrypted: str) -> str:
    if not encrypted:
        return ""
    payload = base64.urlsafe_b64decode(encrypted.encode("utf-8"))
    nonce = payload[:_NONCE_BYTES]
    ciphertext = payload[_NONCE_BYTES:]
    aes = AESGCM(_get_key())
    plain = aes.decrypt(nonce, ciphertext, None)
    return plain.decode("utf-8")
