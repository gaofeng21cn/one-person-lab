"""Pure-stdlib digest and stdio contribution envelope helpers."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any


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


class AppContributionError(ValueError):
    """Domain-neutral App contribution validation or boundary error."""

    def __init__(self, message: str, *, reason_code: str = "app_contribution_invalid") -> None:
        super().__init__(message)
        self.reason_code = reason_code


def resolve_workspace_root(
    workspace: str | None = None,
    *,
    env_var: str = "OPL_PROFILE_WORKSPACE",
) -> Path | None:
    """Resolve explicit workspace or env workspace cleanly; return None if unset or non-absolute."""
    selected = workspace if workspace is not None else os.environ.get(env_var, "")
    if not selected or not Path(selected).is_absolute():
        return None
    return Path(selected).resolve(strict=True)


def verify_work_item_identity(
    input_value: Mapping[str, Any],
    *,
    expected_agent_ids: Iterable[str] = (),
    expected_domain_ids: Iterable[str] = (),
    require_resolved: bool = True,
) -> tuple[dict[str, Any], str | None]:
    """Validate optional `work_item_identity` envelope and extract domain work-item id."""
    identity = input_value.get("work_item_identity") or {}
    if not isinstance(identity, dict):
        raise AppContributionError("work_item_identity must be an object.")
    if not identity:
        return {}, None
    allowed_agents = set(expected_agent_ids)
    allowed_domains = set(expected_domain_ids)
    if require_resolved and identity.get("identity_state") != "resolved":
        raise AppContributionError("work_item_identity must have identity_state 'resolved'.")
    if allowed_agents and identity.get("agent_id") not in allowed_agents:
        raise AppContributionError("work_item_identity agent_id does not match the selected package.")
    if allowed_domains and identity.get("domain_id") not in allowed_domains:
        raise AppContributionError("work_item_identity domain_id does not match the selected package.")
    work_item_id = identity.get("domain_work_item_id") or identity.get("work_item_id")
    return identity, str(work_item_id) if isinstance(work_item_id, str) and work_item_id else None
