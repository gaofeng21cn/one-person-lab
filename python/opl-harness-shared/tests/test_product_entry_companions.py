from __future__ import annotations

from opl_harness_shared.product_entry_companions import (
    build_product_entry_overview,
    build_product_entry_quickstart,
    build_product_entry_readiness,
    build_product_entry_resume_surface,
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
