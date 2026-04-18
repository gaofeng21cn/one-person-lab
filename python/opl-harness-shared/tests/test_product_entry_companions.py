from __future__ import annotations

from opl_harness_shared.product_entry_companions import (
    build_product_entry_start,
    build_product_entry_overview,
    build_product_entry_quickstart,
    build_product_entry_readiness,
    build_product_entry_resume_surface,
    build_product_frontdesk,
    collect_family_human_gate_ids,
)


def test_collect_family_human_gate_ids_and_build_helpers() -> None:
    family_orchestration = {
        "human_gates": [
            {"gate_id": "alpha_gate", "title": "Alpha gate"},
            {"gate_id": "beta_gate", "title": "Beta gate"},
        ],
        "resume_contract": {
            "surface_kind": "grant_user_loop",
            "session_locator_field": "workspace_id",
            "checkpoint_locator_field": "checkpoint_status",
        },
    }

    human_gate_ids = collect_family_human_gate_ids(family_orchestration)
    assert human_gate_ids == ["alpha_gate", "beta_gate"]

    resume_surface = build_product_entry_resume_surface(
        command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>",
        resume_contract=family_orchestration["resume_contract"],
    )
    assert resume_surface["surface_kind"] == "grant_user_loop"
    assert resume_surface["session_locator_field"] == "workspace_id"

    quickstart = build_product_entry_quickstart(
        summary="Open the frontdesk first.",
        recommended_step_id="open_frontdesk",
        steps=[
            {
                "step_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_contract=family_orchestration["resume_contract"],
        human_gate_ids=human_gate_ids,
    )
    assert quickstart["recommended_step_id"] == "open_frontdesk"
    assert quickstart["human_gate_ids"] == human_gate_ids

    start_without_resume_command = build_product_entry_start(
        summary="Open the frontdesk first, then choose the durable continuation mode.",
        recommended_mode_id="open_frontdesk",
        modes=[
            {
                "mode_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            },
            {
                "mode_id": "continue_loop",
                "title": "Continue loop",
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current loop.",
                "requires": ["task_intent"],
            },
        ],
        resume_surface=family_orchestration["resume_contract"],
        human_gate_ids=human_gate_ids,
    )
    assert start_without_resume_command["surface_kind"] == "product_entry_start"
    assert start_without_resume_command["resume_surface"]["surface_kind"] == "grant_user_loop"
    assert start_without_resume_command["resume_surface"]["session_locator_field"] == "workspace_id"
    assert "command" not in start_without_resume_command["resume_surface"]

    start_with_resume_command = build_product_entry_start(
        summary="Open the frontdesk first, then resume the same loop.",
        recommended_mode_id="open_frontdesk",
        modes=start_without_resume_command["modes"],
        resume_surface=resume_surface,
        human_gate_ids=human_gate_ids,
    )
    assert (
        start_with_resume_command["resume_surface"]["command"]
        == "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>"
    )

    overview = build_product_entry_overview(
        summary="Current grant frontdoor is usable.",
        frontdesk_command="uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
        recommended_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        operator_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        progress_surface={
            "surface_kind": "grant_progress",
            "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
            "step_id": "inspect_progress",
        },
        resume_surface=resume_surface,
        recommended_step_id=quickstart["recommended_step_id"],
        next_focus=["Keep the frontdoor stable."],
        remaining_gaps_count=1,
        human_gate_ids=human_gate_ids,
    )
    assert overview["resume_surface"]["checkpoint_locator_field"] == "checkpoint_status"
    assert overview["human_gate_ids"] == human_gate_ids

    readiness = build_product_entry_readiness(
        verdict="agent_assisted_ready_not_product_grade",
        usable_now=True,
        good_to_use_now=False,
        fully_automatic=False,
        summary="Usable for agent-assisted authoring.",
        recommended_start_surface="product_frontdesk",
        recommended_start_command="uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
        recommended_loop_surface="grant_user_loop",
        recommended_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        blocking_gaps=["Polished product UI is still pending."],
    )
    assert readiness["verdict"] == "agent_assisted_ready_not_product_grade"
    assert readiness["blocking_gaps"] == ["Polished product UI is still pending."]

    frontdesk = build_product_frontdesk(
        recommended_action="inspect_or_prepare_grant_loop",
        target_domain_id="med-autogrant",
        workspace_locator={
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        runtime={
            "runtime_owner": "upstream_hermes_agent",
            "runtime_state_root": "/tmp/runtime-state",
        },
        product_entry_status={
            "summary": "Current grant frontdoor is usable.",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
        },
        frontdesk_surface={
            "shell_key": "product_frontdesk",
            "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdesk",
            "summary": "Open the direct frontdoor.",
        },
        operator_loop_surface={
            "shell_key": "grant_user_loop",
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "surface_kind": "grant_user_loop",
            "summary": "Continue the current authoring loop.",
        },
        operator_loop_actions={
            "open_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current authoring loop.",
                "requires": ["task_intent"],
            }
        },
        product_entry_start=start_with_resume_command,
        product_entry_overview=overview,
        product_entry_preflight={
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        product_entry_readiness=readiness,
        product_entry_quickstart=quickstart,
        family_orchestration=family_orchestration,
        product_entry_manifest={
            "surface_kind": "product_entry_manifest",
            "target_domain_id": "med-autogrant",
        },
        entry_surfaces={
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            }
        },
        summary={
            "frontdesk_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        notes=["Shared frontdesk core is active."],
        extra_payload={
            "ok": True,
            "command": "product-frontdesk",
        },
    )
    assert frontdesk["surface_kind"] == "product_frontdesk"
    assert frontdesk["ok"] is True
    assert frontdesk["command"] == "product-frontdesk"
    assert frontdesk["product_entry_start"]["recommended_mode_id"] == "open_frontdesk"
