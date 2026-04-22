from __future__ import annotations

from opl_harness_shared.runtime_task_companions import (
    build_artifact_file_descriptor,
    build_artifact_inventory,
    build_checkpoint_summary,
    build_progress_projection,
    build_runtime_inventory,
    build_session_continuity,
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

    session_continuity = build_session_continuity(
        summary="Current RedCube deliverable loop stays resumable in the same entry session.",
        domain_agent_id="rca",
        runtime_owner="upstream_hermes_agent",
        domain_owner="redcube_ai",
        executor_owner="codex_cli",
        status="resumable",
        session_id="entry-session-1",
        run_id="run-1",
        progress_surface=progress_surface,
        artifact_surface={
            "surface_kind": "artifact_inventory",
            "summary": "Inspect current deliverable outputs.",
            "command": "redcube product session --entry-session-id <entry-session-id>",
        },
        restore_surface={
            "surface_kind": "product_entry_session",
            "summary": "Resume the same deliverable loop.",
            "command": "redcube product session --entry-session-id <entry-session-id>",
            "locator_fields": ["entry_session_id"],
        },
        checkpoint_summary=checkpoint_summary,
        human_gate_ids=["redcube_operator_review_gate"],
    )
    assert session_continuity["surface_kind"] == "session_continuity"
    assert session_continuity["domain_agent_id"] == "rca"
    assert session_continuity["restore_surface"]["surface_kind"] == "product_entry_session"

    progress_projection = build_progress_projection(
        session_id="entry-session-1",
        headline="当前 deliverable loop 正在等待 operator review。",
        latest_update="2m ago · operator review requested",
        next_step="先查看同一 entry session 的最新 review 结论。",
        status_summary="当前状态：resumable；运行态：healthy",
        current_status="resumable",
        runtime_status="healthy",
        progress_surface=progress_surface,
        artifact_surface={
            "surface_kind": "artifact_inventory",
            "summary": "Inspect current deliverable outputs.",
            "command": "redcube product session --entry-session-id <entry-session-id>",
        },
        inspect_paths=["/tmp/redcube/runtime-state", "/tmp/redcube/workspace"],
        attention_items=["operator review gate active"],
        human_gate_ids=["redcube_operator_review_gate"],
    )
    assert progress_projection["surface_kind"] == "progress_projection"
    assert progress_projection["headline"] == "当前 deliverable loop 正在等待 operator review。"
    assert progress_projection["inspect_paths"] == ["/tmp/redcube/runtime-state", "/tmp/redcube/workspace"]

    artifact_file = build_artifact_file_descriptor(
        file_id="deck_pptx",
        label="Final PPTX",
        kind="deliverable",
        path="/tmp/redcube/workspace/output/final.pptx",
        summary="当前最值得先看的主交付件。",
    )
    assert artifact_file["kind"] == "deliverable"

    artifact_inventory = build_artifact_inventory(
        session_id="entry-session-1",
        workspace_path="/tmp/redcube/workspace",
        progress_headline=progress_projection["headline"],
        artifact_surface={
            "surface_kind": "product_entry_session",
            "summary": "Inspect deliverable artifacts from the same entry session.",
            "command": "redcube product session --entry-session-id <entry-session-id>",
        },
        deliverable_files=[artifact_file],
        supporting_files=[
            {
                "file_id": "deck_pdf",
                "label": "Review PDF",
                "kind": "supporting",
                "path": "/tmp/redcube/workspace/output/review.pdf",
                "summary": "辅助 review 的导出件。",
            }
        ],
        inspect_paths=["/tmp/redcube/workspace/output/final.pptx"],
    )
    assert artifact_inventory["surface_kind"] == "artifact_inventory"
    assert artifact_inventory["summary"]["total_files_count"] == 2
    assert artifact_inventory["supporting_files"][0]["kind"] == "supporting"
