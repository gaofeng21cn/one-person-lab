"""Tests for opl_framework.controlled_apply."""
from __future__ import annotations

import json
import stat
from pathlib import Path

import pytest

from opl_framework.controlled_apply import (
    PreSubmitRefreshVerdict,
    append_jsonl_audit_record,
    canonical_payload_json,
    compute_proposal_digest,
    evaluate_pre_submit_refresh,
    make_idempotency_key,
    resolve_post_readback_status,
    verify_approval_binding,
    verify_independent_readback,
)


def test_digest_and_idempotency_key_are_deterministic_and_reject_nan() -> None:
    a = compute_proposal_digest({"b": 2, "a": 1})
    b = compute_proposal_digest({"a": 1, "b": 2})
    assert a == b
    assert canonical_payload_json({"z": 1, "a": 2}) == '{"a": 2, "z": 1}'
    assert make_idempotency_key("req-1", a, "rev-9") == f"req-1:{a}:rev-9"
    with pytest.raises(ValueError):
        compute_proposal_digest({"bad": float("nan")})


def test_verify_approval_binding() -> None:
    assert verify_approval_binding(
        task_id="t1",
        actor_id="actor-1",
        proposal_digest="d1",
        facts_revision="r1",
        expected_task_id="t1",
        expected_proposal_digest="d1",
        expected_facts_revision="r1",
    )
    assert not verify_approval_binding(
        task_id="t1",
        actor_id="",
        proposal_digest="d1",
        facts_revision="r1",
        expected_task_id="t1",
        expected_proposal_digest="d1",
        expected_facts_revision="r1",
    )
    assert not verify_approval_binding(
        task_id="t1",
        actor_id="actor-1",
        proposal_digest="wrong",
        facts_revision="r1",
        expected_task_id="t1",
        expected_proposal_digest="d1",
        expected_facts_revision="r1",
    )


def test_evaluate_pre_submit_refresh_verdicts() -> None:
    base = dict(
        expected_subject=("s1", "p1"),
        expected_revision="rev-1",
        expected_facts=("f1",),
        expected_coverage=("c1",),
        current_subject=("s1", "p1"),
        current_revision="rev-1",
        current_facts=("f1",),
        current_coverage=("c1",),
        required_scopes=("orders",),
        complete_scopes=("orders", "labs"),
    )
    assert evaluate_pre_submit_refresh(**base) == PreSubmitRefreshVerdict(True, "ready", None)

    incomplete = dict(base, complete_scopes=("labs",))
    assert evaluate_pre_submit_refresh(**incomplete) == PreSubmitRefreshVerdict(
        False, "needs_information", "incomplete_sources"
    )

    stale_rev = dict(base, current_revision="rev-2")
    assert evaluate_pre_submit_refresh(**stale_rev) == PreSubmitRefreshVerdict(
        False, "needs_refresh", "stale_facts"
    )

    fact_drift = dict(base, current_facts=("f2",))
    assert evaluate_pre_submit_refresh(**fact_drift, strict_fact_equality=False).ok is True
    assert evaluate_pre_submit_refresh(**fact_drift, strict_fact_equality=True) == PreSubmitRefreshVerdict(
        False, "needs_refresh", "stale_facts"
    )

    assert evaluate_pre_submit_refresh(**base, can_apply=False) == PreSubmitRefreshVerdict(
        False, "draft_only", "write_unqualified"
    )
    called = False

    def _boom() -> bool:
        nonlocal called
        called = True
        return True

    assert evaluate_pre_submit_refresh(**stale_rev, can_apply=_boom).status == "needs_refresh"
    assert called is False
    assert evaluate_pre_submit_refresh(**base, can_apply=lambda: False) == PreSubmitRefreshVerdict(
        False, "draft_only", "write_unqualified"
    )


def test_verify_independent_readback_and_status_resolution() -> None:
    common = dict(
        expected_subject="subj-1",
        expected_object_ref="obj-1",
        expected_proposal_digest="dig-1",
        expected_payload={"k": "v"},
        expected_state="draft",
        readback_subject="subj-1",
        readback_object_ref="obj-1",
        readback_proposal_digest="dig-1",
        readback_visible_payload={"k": "v"},
        readback_state="draft",
        readback_screenshot_ref="shot-1",
        readback_resource_version_ref=None,
        readback_observed_at=None,
        readback_trace_refs=("trace-1",),
    )
    assert verify_independent_readback(**common) is True
    assert resolve_post_readback_status(True, accepted_status="needs_clinician_acceptance") == "needs_clinician_acceptance"

    structured_proof = dict(
        common,
        readback_screenshot_ref=None,
        readback_resource_version_ref="ver-2",
        readback_observed_at="2026-11-24T00:00:00Z",
    )
    assert verify_independent_readback(**structured_proof) is True

    no_trace = dict(common, readback_trace_refs=())
    assert verify_independent_readback(**no_trace) is False
    assert resolve_post_readback_status(False) == "execution_uncertain"

    bad_payload = dict(common, readback_visible_payload={"k": "other"})
    assert verify_independent_readback(**bad_payload) is False


def test_append_jsonl_audit_record_writes_mode_0600(tmp_path: Path) -> None:
    log_path = tmp_path / "audit.jsonl"
    append_jsonl_audit_record(log_path, {"b": 2, "a": 1})
    append_jsonl_audit_record(log_path, {"c": 3})
    mode = stat.S_IMODE(log_path.stat().st_mode)
    assert mode == 0o600
    lines = log_path.read_text(encoding="utf-8").splitlines()
    assert lines == ['{"a": 1, "b": 2}', '{"c": 3}']
    assert [json.loads(line) for line in lines] == [{"a": 1, "b": 2}, {"c": 3}]
