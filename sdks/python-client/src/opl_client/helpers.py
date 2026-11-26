"""Pure-stdlib digest and stdio contribution envelope helpers."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Mapping


def sha256_bytes(data: bytes) -> str:
    """Return prefixed SHA-256 digest `sha256:<hex>` for raw bytes."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def sha256_file(path: str | Path) -> str:
    """Return lowercase hex SHA-256 digest of a file using stdlib file_digest."""
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def read_stdin_json() -> dict[str, Any]:
    """Read and parse a JSON object from standard input."""
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Expected JSON object on stdin")
    return parsed


def write_json_stdout(payload: Mapping[str, Any]) -> None:
    """Write compact JSON payload line to standard output."""
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def ready_envelope(
    *,
    package_id: str,
    data: Mapping[str, Any] | None = None,
    summary: str = "",
) -> dict[str, Any]:
    """Build a standard ready contribution envelope."""
    return {
        "status": "ready",
        "package_id": package_id,
        "summary": summary,
        "data": dict(data or {}),
    }


def unavailable_envelope(
    *,
    package_id: str,
    reason: str,
    code: str = "UNAVAILABLE",
) -> dict[str, Any]:
    """Build a standard unavailable contribution envelope."""
    return {
        "status": "unavailable",
        "package_id": package_id,
        "error": {"code": code, "message": reason},
    }
