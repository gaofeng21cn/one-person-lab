from __future__ import annotations

from opl_harness_shared.family_orchestration import (
    build_family_human_gate,
    build_family_human_gate_preview,
    build_family_frontdesk_product_entry_orchestration,
    build_family_product_entry_orchestration,
    build_family_orchestration_companion,
    build_family_orchestration_template,
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


def test_build_family_orchestration_template_normalizes_shared_preview_surfaces() -> None:
    payload = build_family_orchestration_template(
        action_graph={
            "version": "family-action-graph.v1",
            "graph_id": "graph-1",
            "target_domain_id": "med-autoscience",
            "graph_kind": "study_runtime_orchestration",
            "graph_version": "2026-04-18",
            "nodes": [{"node_id": "step:open_frontdesk"}],
            "edges": [],
            "entry_nodes": ["step:open_frontdesk"],
            "exit_nodes": ["step:open_frontdesk"],
            "human_gates": [{"gate_id": "gate-1", "trigger_nodes": ["step:open_frontdesk"], "blocking": True}],
            "checkpoint_policy": {"mode": "explicit_nodes", "checkpoint_nodes": ["step:open_frontdesk"]},
        },
        human_gates=[{"gate_id": "gate-1", "title": "Gate 1", "status": "requested"}],
        resume_surface_kind="launch_study",
        session_locator_field="study_id",
        checkpoint_locator_field="controller_decision_path",
        event_envelope_surface={
            "ref_kind": "workspace_locator",
            "ref": "studies/<study_id>/runtime_watch/latest.json",
        },
        checkpoint_lineage_surface={
            "ref_kind": "workspace_locator",
            "ref": "studies/<study_id>/controller_decisions/latest.json",
        },
    )

    assert payload["action_graph_ref"]["ref"] == "/family_orchestration/action_graph"
    assert payload["action_graph"]["graph_id"] == "graph-1"
    assert "family_human_gates" not in payload
    assert payload["resume_contract"] == {
        "surface_kind": "launch_study",
        "session_locator_field": "study_id",
        "checkpoint_locator_field": "controller_decision_path",
    }
    assert payload["event_envelope_surface"]["ref_kind"] == "workspace_locator"
    assert payload["checkpoint_lineage_surface"]["ref_kind"] == "workspace_locator"


def test_build_family_human_gate_preview_normalizes_shared_preview_fields() -> None:
    payload = build_family_human_gate_preview(
        gate_id="route-review",
        title="Route review gate",
        status="approved",
        review_surface={
            "ref_kind": "json_pointer",
            "ref": "/product_entry_manifest/operator_loop_surface",
            "label": "operator loop surface",
        },
    )

    assert payload == {
        "gate_id": "route-review",
        "title": "Route review gate",
        "status": "approved",
        "review_surface": {
            "ref_kind": "json_pointer",
            "ref": "/product_entry_manifest/operator_loop_surface",
            "label": "operator loop surface",
        },
    }


def test_build_family_product_entry_orchestration_materializes_action_graph_and_gate_previews() -> None:
    payload = build_family_product_entry_orchestration(
        graph_id="redcube_frontdoor_product_entry_graph",
        target_domain_id="redcube_ai",
        graph_kind="visual_deliverable_orchestration",
        graph_version="2026-04-18",
        nodes=[
            {
                "node_id": "step:open_frontdesk",
                "node_kind": "frontdoor",
                "title": "Open RedCube frontdesk",
                "surface_kind": "product_frontdesk",
            },
            {
                "node_id": "step:continue_current_loop",
                "node_kind": "deliverable_runtime",
                "title": "Continue current loop",
                "surface_kind": "product_entry",
                "produces_checkpoint": True,
            },
            {
                "node_id": "step:inspect_current_progress",
                "node_kind": "progress_read",
                "title": "Inspect current progress",
                "surface_kind": "product_entry_session",
                "produces_checkpoint": True,
            },
        ],
        edges=[
            {
                "from": "step:open_frontdesk",
                "to": "step:continue_current_loop",
                "on": "start_direct",
            },
            {
                "from": "step:continue_current_loop",
                "to": "step:inspect_current_progress",
                "on": "session_started",
            },
        ],
        entry_nodes=["step:open_frontdesk"],
        exit_nodes=["step:inspect_current_progress"],
        human_gates=[
            {
                "gate_id": "redcube_operator_review_gate",
                "trigger_nodes": ["step:inspect_current_progress"],
                "blocking": True,
            }
        ],
        checkpoint_nodes=["step:continue_current_loop", "step:inspect_current_progress"],
        human_gate_previews=[
            {
                "gate_id": "redcube_operator_review_gate",
                "title": "RedCube operator review gate",
                "status": "requested",
                "review_surface": {
                    "ref_kind": "json_pointer",
                    "ref": "/operator_loop_actions/continue_session",
                    "label": "continue session surface",
                },
            }
        ],
        resume_surface_kind="product_entry_session",
        session_locator_field="entry_session.entry_session_id",
        checkpoint_locator_field="continuation_snapshot.latest_managed_run_id",
        action_graph_ref={
            "ref_kind": "json_pointer",
            "ref": "/family_orchestration/action_graph",
            "label": "redcube family action graph",
        },
        event_envelope_surface={
            "ref_kind": "json_pointer",
            "ref": "/recommended_command",
            "label": "recommended command",
        },
    )

    assert payload["action_graph_ref"] == {
        "ref_kind": "json_pointer",
        "ref": "/family_orchestration/action_graph",
        "label": "redcube family action graph",
    }
    assert payload["action_graph"]["graph_id"] == "redcube_frontdoor_product_entry_graph"
    assert payload["action_graph"]["checkpoint_policy"] == {
        "mode": "explicit_nodes",
        "checkpoint_nodes": ["step:continue_current_loop", "step:inspect_current_progress"],
    }
    assert payload["human_gates"][0]["gate_id"] == "redcube_operator_review_gate"
    assert payload["human_gates"][0]["review_surface"]["ref"] == "/operator_loop_actions/continue_session"
    assert payload["resume_contract"] == {
        "surface_kind": "product_entry_session",
        "session_locator_field": "entry_session.entry_session_id",
        "checkpoint_locator_field": "continuation_snapshot.latest_managed_run_id",
    }
    assert payload["event_envelope_surface"]["ref"] == "/recommended_command"


def test_build_family_frontdesk_product_entry_orchestration_materializes_canonical_frontdesk_graph() -> None:
    payload = build_family_frontdesk_product_entry_orchestration(
        graph_id="redcube_frontdoor_product_entry_graph",
        target_domain_id="redcube_ai",
        graph_kind="visual_deliverable_orchestration",
        graph_version="2026-04-20",
        frontdesk_title="Open RedCube frontdesk",
        frontdesk_surface_kind="product_frontdesk",
        direct_title="Start or continue the direct product loop",
        direct_surface_kind="product_entry",
        federated_title="Enter the same loop through internal OPL bridge",
        federated_surface_kind="federated_product_entry",
        progress_title="Inspect current product-entry progress",
        progress_surface_kind="product_entry_session",
        review_gate_id="redcube_operator_review_gate",
        review_gate_title="RedCube operator review gate",
        review_gate_status="requested",
        review_surface={
            "ref_kind": "json_pointer",
            "ref": "/operator_loop_actions/continue_session",
            "label": "continue session surface",
        },
        resume_surface_kind="product_entry_session",
        session_locator_field="entry_session.entry_session_id",
        checkpoint_locator_field="continuation_snapshot.latest_managed_run_id",
        action_graph_ref={
            "ref_kind": "json_pointer",
            "ref": "/family_orchestration/action_graph",
            "label": "redcube family action graph",
        },
    )

    assert [node["node_id"] for node in payload["action_graph"]["nodes"]] == [
        "step:open_frontdesk",
        "step:continue_current_loop",
        "step:opl_bridge_handoff",
        "step:inspect_current_progress",
    ]
    assert [edge["on"] for edge in payload["action_graph"]["edges"]] == [
        "start_direct",
        "enter_via_opl_bridge",
        "session_started",
        "handoff_completed",
    ]
    assert payload["action_graph"]["checkpoint_policy"] == {
        "mode": "explicit_nodes",
        "checkpoint_nodes": [
            "step:continue_current_loop",
            "step:opl_bridge_handoff",
            "step:inspect_current_progress",
        ],
    }
    assert payload["human_gates"][0]["gate_id"] == "redcube_operator_review_gate"
    assert payload["human_gates"][0]["review_surface"]["ref"] == "/operator_loop_actions/continue_session"
    assert payload["resume_contract"]["session_locator_field"] == "entry_session.entry_session_id"
