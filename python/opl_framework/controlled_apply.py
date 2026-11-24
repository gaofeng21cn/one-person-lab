"""Domain-neutral controlled-apply verification protocol helpers.

Provides deterministic proposal digesting, exact approval binding checks,
pre-submit refresh gating, independent target-state readback verification,
idempotency key generation, and durable append-only JSONL audit logging.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PreSubmitRefreshVerdict:
    """Outcome of checking freshly observed state right before an external apply."""

    ok: bool
    status: str
    reason: str | None = None


def canonical_payload_json(payload: Any) -> str:
    """Serialize payload canonically with strict JSON number rules."""
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, allow_nan=False)


def compute_proposal_digest(body: Mapping[str, Any]) -> str:
    """Compute a deterministic SHA-256 hex digest for a structured proposal body."""
    return sha256(canonical_payload_json(dict(body)).encode("utf-8")).hexdigest()


def make_idempotency_key(
    request_id: str,
    proposal_digest: str,
    snapshot_revision: str,
) -> str:
    """Bind request identity, proposal digest, and observed snapshot revision."""
    return f"{request_id}:{proposal_digest}:{snapshot_revision}"


def verify_approval_binding(
    *,
    task_id: str,
    actor_id: str,
    proposal_digest: str,
    facts_revision: str,
    expected_task_id: str,
    expected_proposal_digest: str,
    expected_facts_revision: str,
) -> bool:
    """Return True only when an explicit actor approval binds all expected fields."""
    if not isinstance(actor_id, str) or not actor_id:
        return False
    return (
        task_id == expected_task_id
        and proposal_digest == expected_proposal_digest
        and facts_revision == expected_facts_revision
    )


def evaluate_pre_submit_refresh(
    *,
    expected_subject: Any,
    expected_revision: str,
    expected_facts: Any,
    expected_coverage: Any,
    current_subject: Any,
    current_revision: str,
    current_facts: Any,
    current_coverage: Any,
    required_scopes: Iterable[str],
    complete_scopes: Iterable[str],
    strict_fact_equality: bool = False,
    can_apply: bool | Callable[[], bool] = True,
) -> PreSubmitRefreshVerdict:
    """Gate external apply against fresh source coverage, revision/fact drift, and writability."""
    if not set(required_scopes) <= set(complete_scopes):
        return PreSubmitRefreshVerdict(
            ok=False,
            status="needs_information",
            reason="incomplete_sources",
        )
    if (
        current_subject != expected_subject
        or current_revision != expected_revision
        or (
            strict_fact_equality
            and (current_facts != expected_facts or current_coverage != expected_coverage)
        )
    ):
        return PreSubmitRefreshVerdict(
            ok=False,
            status="needs_refresh",
            reason="stale_facts",
        )
    writable = can_apply() if callable(can_apply) else bool(can_apply)
    if not writable:
        return PreSubmitRefreshVerdict(
            ok=False,
            status="draft_only",
            reason="write_unqualified",
        )
    return PreSubmitRefreshVerdict(ok=True, status="ready", reason=None)


def verify_independent_readback(
    *,
    expected_subject: Any,
    expected_object_ref: str,
    expected_proposal_digest: str,
    expected_payload: Any,
    expected_state: str | None,
    readback_subject: Any,
    readback_object_ref: str,
    readback_proposal_digest: str,
    readback_visible_payload: Any,
    readback_state: str | None,
    readback_screenshot_ref: str | None,
    readback_resource_version_ref: str | None,
    readback_observed_at: str | None,
    readback_trace_refs: Iterable[str],
) -> bool:
    """Verify independent post-apply readback matches expected subject, payload, state, and proof."""
    trace_refs = tuple(readback_trace_refs)
    has_proof = bool(
        readback_screenshot_ref or (readback_resource_version_ref and readback_observed_at)
    )
    if not (has_proof and bool(trace_refs)):
        return False
    return (
        readback_subject == expected_subject
        and readback_object_ref == expected_object_ref
        and readback_proposal_digest == expected_proposal_digest
        and json.dumps(readback_visible_payload, ensure_ascii=False, sort_keys=True)
        == json.dumps(expected_payload, ensure_ascii=False, sort_keys=True)
        and readback_state == expected_state
    )


def resolve_post_readback_status(
    readback_valid: bool,
    *,
    accepted_status: str = "needs_acceptance",
    uncertain_status: str = "execution_uncertain",
) -> str:
    """Map readback verification outcome to target lifecycle state."""
    return accepted_status if readback_valid else uncertain_status


def append_jsonl_audit_record(
    path: Path | str,
    payload: Mapping[str, Any],
    *,
    mode: int = 0o600,
) -> None:
    """Append one JSON record durably with fsync and restrictive permissions."""
    data = json.dumps(dict(payload), ensure_ascii=False, sort_keys=True) + "\n"
    fd = os.open(Path(path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            fd = -1
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        if fd >= 0:
            os.close(fd)


__all__ = [
    "PreSubmitRefreshVerdict",
    "append_jsonl_audit_record",
    "canonical_payload_json",
    "compute_proposal_digest",
    "evaluate_pre_submit_refresh",
    "make_idempotency_key",
    "resolve_post_readback_status",
    "verify_approval_binding",
    "verify_independent_readback",
]
