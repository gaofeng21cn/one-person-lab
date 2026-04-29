from __future__ import annotations

from opl_harness_shared.family_orchestration import (
    buildFamilyIntakeEvidenceCompanion,
    buildFamilyProjectProfileCompanion,
    build_family_human_gate,
    build_family_human_gate_preview,
    build_family_intake_evidence_companion,
    build_family_project_profile_companion,
    build_family_frontdoor_product_entry_orchestration,
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


def test_build_family_intake_evidence_companion_normalizes_shape_and_alias() -> None:
    payload = build_family_intake_evidence_companion(
        target_domain_id="med-autogrant",
        intake_audit={
            "summary": "  intake audit passed with tracked caveats ",
            "verdict": "ready_for_routing",
            "audited_at": "2026-04-21T01:02:03Z",
            "summary_ref": {
                "ref_kind": "repo_path",
                "ref": "runtime_watch/intake-audit/latest.json",
                "label": "latest intake audit",
            },
        },
        trust_ranked_evidence_refs=[
            {
                "ref_kind": "repo_path",
                "ref": "evidence/secondary-notes.md",
                "trust_rank": 3,
                "trust_note": "secondary operator note",
            },
            {
                "ref_kind": "workspace_locator",
                "ref": "grant_runs/<grant_run_id>/input/critique-package.json",
                "trust_rank": 1,
                "trust_note": "primary intake package",
                "supports": ["scope_grounding", "route_selection"],
            },
        ],
        grounding_scope={
            "scope_kind": "grant_route_scope",
            "summary": "route grounding frozen against intake package and critique context",
            "scope_refs": [
                {
                    "ref_kind": "json_pointer",
                    "ref": "/product_entry_manifest/domain_focus",
                    "label": "domain focus",
                },
            ],
        },
        human_gate_refs=[
            {
                "ref_kind": "family_human_gate_id",
                "ref": "mag_route_gate_revision",
            },
        ],
        checkpoint_lineage_refs=[
            {
                "ref_kind": "family_checkpoint_lineage_id",
                "ref": "lineage-intake-20260421",
            },
        ],
    )
    alias_payload = buildFamilyIntakeEvidenceCompanion(
        target_domain_id="med-autogrant",
        intake_audit={"summary": "intake audit passed"},
        trust_ranked_evidence_refs=[
            {"ref_kind": "repo_path", "ref": "a.md", "trust_rank": 1},
        ],
        grounding_scope={
            "scope_kind": "grant_route_scope",
            "summary": "scope summary",
            "scope_refs": [{"ref_kind": "repo_path", "ref": "scope.md"}],
        },
    )

    assert payload["version"] == "family-intake-evidence-companion.v1"
    assert payload["target_domain_id"] == "med-autogrant"
    assert payload["intake_audit"]["summary"] == "intake audit passed with tracked caveats"
    assert [entry["trust_rank"] for entry in payload["trust_ranked_evidence_refs"]] == [1, 3]
    assert payload["trust_ranked_evidence_refs"][0]["supports"] == ["scope_grounding", "route_selection"]
    assert payload["grounding_scope"]["scope_refs"][0]["ref"] == "/product_entry_manifest/domain_focus"
    assert payload["human_gate_refs"][0]["ref"] == "mag_route_gate_revision"
    assert payload["checkpoint_lineage_refs"][0]["ref"] == "lineage-intake-20260421"
    assert alias_payload["version"] == "family-intake-evidence-companion.v1"


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
        intake_evidence_companion={
            "version": "family-intake-evidence-companion.v1",
            "target_domain_id": "medautoscience",
        },
        project_profile_companion={
            "version": "family-project-profile-companion.v1",
            "target_domain_id": "medautoscience",
        },
    )

    assert payload["resume_contract"]["session_locator_field"] == "event_envelope.session.session_id"
    assert payload["resume_contract"]["checkpoint_locator_field"] == "checkpoint_lineage.checkpoint_id"
    assert payload["event_envelope"]["session"]["active_run_id"] == "run-1"
    assert payload["event_envelope"]["payload"]["runtime_decision"] == "continue"
    assert payload["checkpoint_lineage"]["checkpoint_id"].startswith("checkpoint-")
    assert payload["human_gates"][0]["gate_id"] == "gate-1"
    assert payload["intake_evidence_companion"]["version"] == "family-intake-evidence-companion.v1"
    assert payload["project_profile_companion"]["version"] == "family-project-profile-companion.v1"


def test_build_family_project_profile_companion_normalizes_family_level_template_profile() -> None:
    payload = build_family_project_profile_companion(
        target_domain_id="med-autogrant",
        project_profile={
            "profile_id": "grant_nsfc_project_profile_v1",
            "project_kind": "grant_program",
            "template_family": "research_grant",
            "template_id": "nsfc_blueprint_v2026",
            "selection_mode": "preset",
            "summary": "  NSFC preset selected for grant planning and authoring ",
            "summary_ref": {
                "ref_kind": "repo_path",
                "ref": "docs/presets/nsfc-blueprint.md",
                "label": "NSFC template brief",
            },
        },
        preference_signals=[
            "favor_explicit_scope_freeze",
            "prefer_structured_review_rhythm",
        ],
        grounding_refs=[
            {
                "ref_kind": "repo_path",
                "ref": "docs/project-profile/selection-context.md",
                "label": "selection context",
            }
        ],
    )
    alias_payload = buildFamilyProjectProfileCompanion(
        target_domain_id="med-autogrant",
        project_profile={
            "profile_id": "grant_default_profile",
            "project_kind": "grant_program",
            "template_family": "research_grant",
            "template_id": "default_grant_template",
            "selection_mode": "default",
            "summary": "default family grant template profile",
        },
        preference_signals=[],
        grounding_refs=[{"ref_kind": "repo_path", "ref": "docs/project-profile/default.md"}],
    )

    assert payload["version"] == "family-project-profile-companion.v1"
    assert payload["target_domain_id"] == "med-autogrant"
    assert payload["project_profile"]["profile_id"] == "grant_nsfc_project_profile_v1"
    assert payload["project_profile"]["summary"] == "NSFC preset selected for grant planning and authoring"
    assert payload["project_profile"]["summary_ref"]["ref"] == "docs/presets/nsfc-blueprint.md"
    assert payload["preference_signals"] == [
        "favor_explicit_scope_freeze",
        "prefer_structured_review_rhythm",
    ]
    assert payload["grounding_refs"][0]["ref"] == "docs/project-profile/selection-context.md"
    assert alias_payload["version"] == "family-project-profile-companion.v1"


def test_build_family_orchestration_template_normalizes_shared_preview_surfaces() -> None:
    payload = build_family_orchestration_template(
        action_graph={
            "version": "family-action-graph.v1",
            "graph_id": "graph-1",
            "target_domain_id": "med-autoscience",
            "graph_kind": "study_runtime_orchestration",
            "graph_version": "2026-04-18",
            "nodes": [{"node_id": "step:open_frontdoor"}],
            "edges": [],
            "entry_nodes": ["step:open_frontdoor"],
            "exit_nodes": ["step:open_frontdoor"],
            "human_gates": [{"gate_id": "gate-1", "trigger_nodes": ["step:open_frontdoor"], "blocking": True}],
            "checkpoint_policy": {"mode": "explicit_nodes", "checkpoint_nodes": ["step:open_frontdoor"]},
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


def test_build_family_orchestration_template_passes_through_intake_evidence_companion() -> None:
    payload = build_family_orchestration_template(
        action_graph={
            "version": "family-action-graph.v1",
            "graph_id": "graph-1",
            "target_domain_id": "med-autogrant",
            "graph_kind": "grant_intake_orchestration",
            "graph_version": "2026-04-21",
            "nodes": [{"node_id": "step:intake"}],
            "edges": [],
            "entry_nodes": ["step:intake"],
            "exit_nodes": ["step:intake"],
            "human_gates": [],
            "checkpoint_policy": {"mode": "explicit_nodes", "checkpoint_nodes": ["step:intake"]},
        },
        resume_surface_kind="grant_entry",
        session_locator_field="grant_run_id",
        checkpoint_locator_field="checkpoint_id",
        intake_evidence_companion={"version": "family-intake-evidence-companion.v1", "target_domain_id": "med-autogrant"},
    )

    assert payload["intake_evidence_companion"]["version"] == "family-intake-evidence-companion.v1"


def test_build_family_orchestration_template_passes_through_project_profile_companion() -> None:
    payload = build_family_orchestration_template(
        action_graph={
            "version": "family-action-graph.v1",
            "graph_id": "graph-2",
            "target_domain_id": "med-autogrant",
            "graph_kind": "grant_intake_orchestration",
            "graph_version": "2026-04-21",
            "nodes": [{"node_id": "step:intake"}],
            "edges": [],
            "entry_nodes": ["step:intake"],
            "exit_nodes": ["step:intake"],
            "human_gates": [],
            "checkpoint_policy": {"mode": "explicit_nodes", "checkpoint_nodes": ["step:intake"]},
        },
        resume_surface_kind="grant_entry",
        session_locator_field="grant_run_id",
        checkpoint_locator_field="checkpoint_id",
        project_profile_companion={
            "version": "family-project-profile-companion.v1",
            "target_domain_id": "med-autogrant",
        },
    )

    assert payload["project_profile_companion"]["version"] == "family-project-profile-companion.v1"


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
                "node_id": "step:open_frontdoor",
                "node_kind": "frontdoor",
                "title": "Open RedCube frontdoor",
                "surface_kind": "product_frontdoor",
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
                "from": "step:open_frontdoor",
                "to": "step:continue_current_loop",
                "on": "start_direct",
            },
            {
                "from": "step:continue_current_loop",
                "to": "step:inspect_current_progress",
                "on": "session_started",
            },
        ],
        entry_nodes=["step:open_frontdoor"],
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


def test_build_family_product_entry_orchestration_passes_through_intake_evidence_companion() -> None:
    payload = build_family_product_entry_orchestration(
        graph_id="mag_product_entry_graph",
        target_domain_id="med-autogrant",
        graph_kind="grant_intake_orchestration",
        graph_version="2026-04-21",
        nodes=[
            {
                "node_id": "step:open_frontdoor",
                "node_kind": "frontdoor",
                "title": "Open frontdoor",
            }
        ],
        edges=[],
        entry_nodes=["step:open_frontdoor"],
        exit_nodes=["step:open_frontdoor"],
        resume_surface_kind="grant_entry",
        session_locator_field="grant_run_id",
        checkpoint_locator_field="checkpoint_id",
        intake_evidence_companion={"version": "family-intake-evidence-companion.v1", "target_domain_id": "med-autogrant"},
    )

    assert payload["intake_evidence_companion"]["target_domain_id"] == "med-autogrant"


def test_build_family_product_entry_orchestration_passes_through_project_profile_companion() -> None:
    payload = build_family_product_entry_orchestration(
        graph_id="mag_product_entry_graph",
        target_domain_id="med-autogrant",
        graph_kind="grant_intake_orchestration",
        graph_version="2026-04-21",
        nodes=[
            {
                "node_id": "step:open_frontdoor",
                "node_kind": "frontdoor",
                "title": "Open frontdoor",
            }
        ],
        edges=[],
        entry_nodes=["step:open_frontdoor"],
        exit_nodes=["step:open_frontdoor"],
        resume_surface_kind="grant_entry",
        session_locator_field="grant_run_id",
        checkpoint_locator_field="checkpoint_id",
        project_profile_companion={
            "version": "family-project-profile-companion.v1",
            "target_domain_id": "med-autogrant",
        },
    )

    assert payload["project_profile_companion"]["target_domain_id"] == "med-autogrant"


def test_build_family_frontdoor_product_entry_orchestration_materializes_canonical_frontdoor_graph() -> None:
    payload = build_family_frontdoor_product_entry_orchestration(
        graph_id="redcube_frontdoor_product_entry_graph",
        target_domain_id="redcube_ai",
        graph_kind="visual_deliverable_orchestration",
        graph_version="2026-04-20",
        frontdoor_title="Open RedCube frontdoor",
        frontdoor_surface_kind="product_frontdoor",
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
        "step:open_frontdoor",
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
