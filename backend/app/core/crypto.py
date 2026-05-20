"""Symmetric encryption for at-rest secrets (connection configs, etc).

Derives a Fernet key from settings.secret_key so the same deployment can
decrypt blobs it wrote. Rotating secret_key requires a re-encryption step.
"""
from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_json(data: dict[str, Any]) -> bytes:
    return _fernet().encrypt(json.dumps(data, separators=(",", ":")).encode("utf-8"))


def decrypt_json(blob: bytes) -> dict[str, Any]:
    return json.loads(_fernet().decrypt(blob))
