from __future__ import annotations

from opl_framework import (
    build_independent_review_evidence,
    evaluate_independent_review_provenance,
)


def test_review_provenance_accepts_isolated_evidence_and_blocks_missing_refs() -> None:
    evidence = build_independent_review_evidence(
        execution_attempt_ref="exec://item-1",
        review_attempt_ref="reviews::r1",
        owner="Codex CLI critique executor",
        executor_kind="codex_cli",
        session_id="sess-1",
    )
    provenance = evaluate_independent_review_provenance(
        metadata={"owner": "Codex CLI critique executor", "independent_review_evidence": evidence},
        review_attempt_ref="reviews::r1",
    )
    assert provenance["assessment_owner"] == "ai_reviewer_backed"
    assert provenance["ai_reviewer_required"] is False
    assert provenance["review_artifact_ref"] == "reviews::r1"

    overlapping = evaluate_independent_review_provenance(
        metadata={
            "owner": "Codex CLI critique executor",
            "independent_review_evidence": {**evidence, "execution_attempt_ref": "reviews::r1"},
        },
        review_attempt_ref="reviews::r1",
    )
    assert overlapping["assessment_owner"] == "projection_only"
    assert overlapping["ai_reviewer_required"] is True
