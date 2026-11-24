"""Generic independent AI review provenance construction and fail-closed verification."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


DEFAULT_AI_REVIEWER_BACKED_OWNERS = frozenset(
    {
        "Codex CLI critique executor",
        "OPL executor client critique receipt owner",
    }
)


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def build_independent_review_evidence(
    *,
    execution_attempt_ref: str,
    review_attempt_ref: str,
    owner: str,
    executor_kind: str = "",
    session_id: Any = None,
    fallback_receipt_ref: str | None = None,
    fallback_reviewer_agent_ref: str = "codex_cli::reviewer",
) -> dict[str, Any]:
    """Build non-overlapping execution/review evidence binding independent AI review."""

    kind = str(executor_kind or "").strip()
    if isinstance(session_id, str) and session_id.strip():
        review_receipt_ref = f"opl_agent_execution_receipt::{session_id.strip()}"
        reviewer_agent_ref = f"{kind}::{session_id.strip()}"
    else:
        review_receipt_ref = fallback_receipt_ref or f"{review_attempt_ref}::independent_review_evidence"
        reviewer_agent_ref = fallback_reviewer_agent_ref
    return {
        "execution_attempt_ref": execution_attempt_ref,
        "review_attempt_ref": review_attempt_ref,
        "review_receipt_ref": review_receipt_ref,
        "no_shared_context_verified": True,
        "reviewer_owner": owner,
        "reviewer_agent_ref": reviewer_agent_ref,
    }


def validate_independent_review_evidence(
    evidence: Any,
    *,
    expected_review_attempt_ref: str | None,
) -> dict[str, Any] | None:
    """Validate independent review evidence fields, isolation flag, and distinct attempt refs."""

    if not isinstance(evidence, Mapping):
        return None
    normalized = {
        "execution_attempt_ref": _text(evidence.get("execution_attempt_ref")),
        "review_attempt_ref": _text(evidence.get("review_attempt_ref")),
        "review_receipt_ref": _text(evidence.get("review_receipt_ref")),
        "no_shared_context_verified": evidence.get("no_shared_context_verified") is True,
        "reviewer_owner": _text(evidence.get("reviewer_owner")),
        "reviewer_agent_ref": _text(evidence.get("reviewer_agent_ref")),
    }
    if normalized["review_attempt_ref"] != expected_review_attempt_ref:
        return None
    if not normalized["no_shared_context_verified"]:
        return None
    required_refs = (
        normalized["execution_attempt_ref"],
        normalized["review_attempt_ref"],
        normalized["review_receipt_ref"],
    )
    if any(ref is None for ref in required_refs):
        return None
    if normalized["execution_attempt_ref"] == normalized["review_attempt_ref"]:
        return None
    if normalized["reviewer_owner"] is None and normalized["reviewer_agent_ref"] is None:
        return None
    return normalized


def evaluate_independent_review_provenance(
    *,
    metadata: Mapping[str, Any],
    review_attempt_ref: str | None,
    allowed_owners: frozenset[str] | set[str] = DEFAULT_AI_REVIEWER_BACKED_OWNERS,
    blocker_reason: str = (
        "AI reviewer-backed review with independent execution/review receipt refs is required."
    ),
) -> dict[str, Any]:
    """Classify independent AI-backed review provenance from receipt metadata."""

    owner = _text(metadata.get("owner"))
    owner_known = owner in allowed_owners
    independent_evidence = validate_independent_review_evidence(
        metadata.get("independent_review_evidence"),
        expected_review_attempt_ref=review_attempt_ref,
    )
    reviewer_owner = (
        independent_evidence.get("reviewer_owner") if independent_evidence is not None else None
    )
    reviewer_identity_verified = (
        reviewer_owner in allowed_owners
        or (
            independent_evidence is not None
            and independent_evidence.get("reviewer_agent_ref") is not None
        )
    )
    ai_backed = owner_known and independent_evidence is not None and reviewer_identity_verified
    return {
        "assessment_owner": "ai_reviewer_backed" if ai_backed else "projection_only",
        "ai_reviewer_required": not ai_backed,
        "review_artifact_ref": review_attempt_ref if ai_backed and review_attempt_ref is not None else None,
        "review_owner": owner,
        "independent_review_evidence": independent_evidence if ai_backed else None,
        "ai_reviewer_blocker_reason": None if ai_backed else blocker_reason,
    }


__all__ = [
    "DEFAULT_AI_REVIEWER_BACKED_OWNERS",
    "build_independent_review_evidence",
    "evaluate_independent_review_provenance",
    "validate_independent_review_evidence",
]
