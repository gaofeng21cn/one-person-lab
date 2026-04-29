from __future__ import annotations

import pytest

from opl_harness_shared.product_entry_program_companions import (
    build_backend_deconstruction_lane,
    build_clearance_lane,
    build_clearance_target,
    build_detailed_readiness,
    build_guardrail_class,
    build_platform_target,
    build_product_entry_guardrails,
    build_product_entry_preflight,
    build_product_entry_program_step,
    build_product_entry_program_surface,
    build_program_capability,
    build_program_check,
    build_program_sequence_step,
    build_workflow_coverage_item,
)


def test_build_product_entry_preflight_derives_ready_truth_from_checks() -> None:
    preflight = build_product_entry_preflight(
        summary="Current preflight is green.",
        recommended_check_command="uv run python -m domain doctor",
        recommended_start_command="uv run python -m domain product-frontdoor",
        checks=[
            build_program_check(
                check_id="workspace_ready",
                title="Workspace Ready",
                status="pass",
                blocking=True,
                summary="workspace ready",
                command="uv run python -m domain doctor",
            ),
            build_program_check(
                check_id="runtime_ready",
                title="Runtime Ready",
                status="warn",
                blocking=False,
                summary="runtime needs attention",
                command="uv run python -m domain doctor",
            ),
        ],
    )
    assert preflight == {
        "surface_kind": "product_entry_preflight",
        "summary": "Current preflight is green.",
        "ready_to_try_now": True,
        "recommended_check_command": "uv run python -m domain doctor",
        "recommended_start_command": "uv run python -m domain product-frontdoor",
        "blocking_check_ids": [],
        "checks": [
            {
                "check_id": "workspace_ready",
                "title": "Workspace Ready",
                "status": "pass",
                "blocking": True,
                "summary": "workspace ready",
                "command": "uv run python -m domain doctor",
            },
            {
                "check_id": "runtime_ready",
                "title": "Runtime Ready",
                "status": "warn",
                "blocking": False,
                "summary": "runtime needs attention",
                "command": "uv run python -m domain doctor",
            },
        ],
    }

    blocked = build_product_entry_preflight(
        summary="Current preflight is blocked.",
        recommended_check_command="uv run python -m domain doctor",
        recommended_start_command="uv run python -m domain product-frontdoor",
        checks=[
            build_program_check(
                check_id="workspace_ready",
                title="Workspace Ready",
                status="fail",
                blocking=True,
                summary="workspace missing",
                command="uv run python -m domain doctor",
            ),
        ],
    )
    assert blocked["ready_to_try_now"] is False
    assert blocked["blocking_check_ids"] == ["workspace_ready"]


def test_build_detailed_readiness_and_lane_companions() -> None:
    detailed_readiness = build_detailed_readiness(
        surface_kind="grant_authoring_readiness",
        verdict="agent_assisted_ready_not_product_grade",
        usable_now=True,
        good_to_use_now=False,
        fully_automatic=False,
        user_experience_level="agent_assisted_cli",
        summary="Current workflow is usable with operator guidance.",
        recommended_start_surface="product_frontdoor",
        recommended_start_command="uv run python -m domain product-frontdoor",
        recommended_loop_surface="grant_user_loop",
        recommended_loop_command="uv run python -m domain grant-user-loop",
        workflow_coverage=[
            build_workflow_coverage_item(
                step_id="collect_materials",
                manual_flow_label="Collect materials",
                coverage_status="landed_route",
                current_surface="workspace_cockpit",
                remaining_gap="Need real user materials.",
            )
        ],
        blocking_gaps=["Managed web shell pending."],
    )
    assert detailed_readiness["surface_kind"] == "grant_authoring_readiness"
    assert detailed_readiness["workflow_coverage"][0]["step_id"] == "collect_materials"

    guardrails = build_product_entry_guardrails(
        summary="Guardrails keep the loop supervised.",
        guardrail_classes=[
            build_guardrail_class(
                guardrail_id="runtime_gap",
                trigger="runtime watch",
                symptom="runtime stale",
                recommended_command="uv run python -m domain watch",
            )
        ],
        recovery_loop=[
            build_product_entry_program_step(
                step_id="inspect_progress",
                command="uv run python -m domain study-progress",
                surface_kind="study_progress",
            )
        ],
    )
    assert guardrails["surface_kind"] == "product_entry_guardrails"
    assert guardrails["guardrail_classes"][0]["guardrail_id"] == "runtime_gap"

    clearance_lane = build_clearance_lane(
        surface_kind="phase3_host_clearance_lane",
        summary="Clear host/runtime proof.",
        recommended_step_id="external_runtime_contract",
        recommended_command="uv run python -m domain doctor",
        clearance_targets=[
            build_clearance_target(
                target_id="external_runtime_contract",
                title="Check runtime contract",
                commands=[
                    "uv run python -m domain doctor",
                    "uv run python -m domain runtime-check",
                ],
            )
        ],
        clearance_loop=[
            build_product_entry_program_step(
                step_id="external_runtime_contract",
                title="Check runtime contract",
                command="uv run python -m domain doctor",
                surface_kind="doctor_runtime_contract",
            )
        ],
        proof_surfaces=[
            build_product_entry_program_surface(
                surface_kind="runtime_watch",
                ref="studies/<study_id>/artifacts/runtime_watch/latest.json",
            )
        ],
        recommended_phase_command="uv run python -m domain mainline-phase --phase phase_3",
    )
    assert clearance_lane["surface_kind"] == "phase3_host_clearance_lane"
    assert clearance_lane["proof_surfaces"][0]["ref"] == "studies/<study_id>/artifacts/runtime_watch/latest.json"

    backend_lane = build_backend_deconstruction_lane(
        summary="Move generic runtime capability outward.",
        substrate_targets=[
            build_program_capability(
                capability_id="session_run_watch_recovery",
                owner="upstream Hermes-Agent",
                summary="Move run/watch/recovery outward.",
            )
        ],
        backend_retained_now=["domain-specific executor"],
        current_backend_chain=["controller -> executor"],
        optional_executor_proofs=[{"executor_kind": "hermes_native_proof"}],
        promotion_rules=["proof-backed promotion only"],
        deconstruction_map_doc="docs/program/deconstruction_map.md",
        recommended_phase_command="uv run python -m domain mainline-phase --phase phase_4",
    )
    assert backend_lane["surface_kind"] == "phase4_backend_deconstruction_lane"
    assert backend_lane["substrate_targets"][0]["capability_id"] == "session_run_watch_recovery"

    platform_target = build_platform_target(
        summary="Converge to monorepo-ready topology.",
        sequence_scope="monorepo_landing_readiness",
        current_step_id="stabilize_user_product_loop",
        current_readiness_summary="gateway/runtime truth is frozen",
        north_star_topology={
            "domain_gateway": "Example Domain",
            "outer_runtime_substrate_owner": "upstream Hermes-Agent",
            "controlled_backend": "Example Backend",
            "monorepo_status": "post_gate_target",
        },
        target_internal_modules=["controller_charter", "runtime"],
        landing_sequence=[
            build_program_sequence_step(
                step_id="freeze_gateway_runtime_truth",
                phase_id="phase_1",
                status="completed",
                summary="Freeze gateway/runtime truth.",
            ),
            build_program_sequence_step(
                step_id="stabilize_user_product_loop",
                phase_id="phase_2",
                status="in_progress",
                summary="Stabilize the user product loop.",
            ),
        ],
        completed_step_ids=["freeze_gateway_runtime_truth"],
        remaining_step_ids=["stabilize_user_product_loop"],
        promotion_gates=["external_runtime_gate"],
        recommended_phase_command="uv run python -m domain mainline-phase --phase phase_5",
    )
    assert platform_target["surface_kind"] == "phase5_platform_target"
    assert platform_target["landing_sequence"][1]["status"] == "in_progress"


def test_program_surface_requires_command_or_ref() -> None:
    with pytest.raises(ValueError, match="command 或 ref"):
        build_product_entry_program_surface(surface_kind="runtime_watch")
