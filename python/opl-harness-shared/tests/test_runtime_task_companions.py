from __future__ import annotations

from opl_harness_shared.runtime_task_companions import (
    build_checkpoint_summary,
    build_runtime_inventory,
    build_task_lifecycle,
    build_task_surface_descriptor,
)


def test_runtime_task_companion_helpers_normalize_mas_mag_and_rca_payloads() -> None:
    runtime_inventory = build_runtime_inventory(
        summary="Hermes-managed study runtime is ready.",
        runtime_owner="upstream_hermes_agent",
        domain_owner="medautoscience",
        executor_owner="med_deepscientist",
        substrate="external_hermes_agent_target",
        availability="ready",
        health_status="healthy",
        status_surface={
            "ref_kind": "repo_path",
            "ref": "studies/<study_id>/artifacts/runtime_watch/latest.json",
            "label": "runtime_watch_latest",
        },
        workspace_binding={
            "workspace_root": "/tmp/mas",
            "profile_name": "as-biologics",
        },
    )
    assert runtime_inventory["surface_kind"] == "runtime_inventory"
    assert runtime_inventory["runtime_owner"] == "upstream_hermes_agent"

    checkpoint_summary = build_checkpoint_summary(
        status="freeze_ready",
        summary="Grant checkpoint is ready for freeze.",
        checkpoint_id="checkpoint-123",
        lineage_ref={
            "ref_kind": "json_pointer",
            "ref": "/progress_projection/checkpoint_status",
        },
    )
    assert checkpoint_summary["status"] == "freeze_ready"
    assert checkpoint_summary["checkpoint_id"] == "checkpoint-123"

    progress_surface = build_task_surface_descriptor(
        surface_kind="product_entry_session",
        summary="Inspect the current RedCube session.",
        command="redcube product session --entry-session-id <entry-session-id>",
        step_id="inspect_current_progress",
        locator_fields=["entry_session_id"],
    )
    assert progress_surface["surface_kind"] == "product_entry_session"
    assert progress_surface["locator_fields"] == ["entry_session_id"]

    task_lifecycle = build_task_lifecycle(
        task_kind="visual_deliverable_loop",
        task_id="deliverable-1",
        status="resumable",
        summary="Current deliverable loop can continue from the same session.",
        session_id="entry-session-1",
        run_id="run-1",
        checkpoint_summary=checkpoint_summary,
        progress_surface=progress_surface,
        resume_surface={
            "surface_kind": "product_entry_session",
            "summary": "Resume the same deliverable loop.",
            "command": "redcube product session --entry-session-id <entry-session-id>",
            "locator_fields": ["entry_session_id"],
        },
        human_gate_ids=["redcube_operator_review_gate"],
    )
    assert task_lifecycle["surface_kind"] == "task_lifecycle"
    assert task_lifecycle["resume_surface"]["surface_kind"] == "product_entry_session"
    assert task_lifecycle["human_gate_ids"] == ["redcube_operator_review_gate"]
