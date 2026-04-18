from __future__ import annotations

from opl_harness_shared.family_orchestration import (
    build_family_human_gate,
    build_family_orchestration_companion,
    resolve_active_run_id,
    resolve_program_id,
)


def test_resolve_active_run_id_and_program_id_normalize_runtime_identifiers() -> None:
    assert resolve_active_run_id(None, "", "run-123") == "run-123"
    assert resolve_program_id({"runtime_program_id": "program-xyz"}) == "program-xyz"


def test_build_family_human_gate_normalizes_required_fields() -> None:
    gate = build_family_human_gate(
        gate_id="gate-1",
        gate_kind="operator_review",
        requested_at="2026-04-18T00:00:00Z",
        request_surface_kind="runtime_watch",
        request_surface_id="runtime_watch/latest.json",
        evidence_refs=[{"ref_kind": "repo_path", "ref": "runtime_watch/latest.json", "label": "watch report"}],
        decision_options=["approve", "pause"],
    )

    assert gate["gate_id"] == "gate-1"
    assert gate["request_surface"]["surface_kind"] == "runtime_watch"
    assert gate["decision_options"] == ["approve", "pause"]


def test_build_family_orchestration_companion_materializes_event_and_lineage() -> None:
    payload = build_family_orchestration_companion(
        surface_kind="runtime_watch",
        surface_id="runtime_watch/latest.json",
        event_name="runtime_watch.runtime_scanned",
        source_surface="runtime_watch",
        session_id="session-1",
        program_id="program-1",
        study_id="study-1",
        quest_id="quest-1",
        active_run_id="run-1",
        runtime_decision="continue",
        runtime_reason="healthy",
        target_domain_id="medautoscience",
        human_gates=[{"gate_id": "gate-1", "status": "requested"}],
        event_envelope_surface={"ref_kind": "json_pointer", "ref": "/runtime_watch/latest"},
        checkpoint_lineage_surface={"ref_kind": "json_pointer", "ref": "/runtime_watch/lineage"},
    )

    assert payload["resume_contract"]["session_locator_field"] == "event_envelope.session.session_id"
    assert payload["resume_contract"]["checkpoint_locator_field"] == "checkpoint_lineage.checkpoint_id"
    assert payload["event_envelope"]["session"]["active_run_id"] == "run-1"
    assert payload["event_envelope"]["payload"]["runtime_decision"] == "continue"
    assert payload["checkpoint_lineage"]["checkpoint_id"].startswith("checkpoint-")
    assert payload["human_gates"][0]["gate_id"] == "gate-1"
