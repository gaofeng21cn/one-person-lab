from __future__ import annotations

from opl_framework.runtime_task_companions import (
    build_artifact_file_descriptor,
    build_artifact_inventory,
    build_checkpoint_summary,
    build_family_lifecycle_ledger,
    build_family_owner_route,
    build_family_persistence_policy,
    build_progress_projection,
    build_runtime_inventory,
    build_session_continuity,
    build_task_lifecycle,
    build_task_surface_descriptor,
)


def test_runtime_task_companion_helpers_normalize_mas_mag_and_rca_payloads() -> None:
    runtime_inventory = build_runtime_inventory(
        summary="MAS monolith study runtime is ready.",
        runtime_owner="mas_runtime_core",
        domain_owner="medautoscience",
        executor_owner="codex_cli",
        substrate="mas_monolith_runtime",
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
    assert runtime_inventory["runtime_owner"] == "mas_runtime_core"

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


def test_family_persistence_policy_separates_file_authority_from_sidecar_indexes() -> None:
    policy = build_family_persistence_policy(
        target_domain_id="medautoscience",
        policy_id="mas_runtime_lifecycle_policy",
        summary="Runtime history is indexed in SQLite while study truth stays file-owned.",
        authority_surfaces=[
            {
                "surface_id": "publication_eval_latest",
                "surface_role": "publication_quality_authority",
                "storage_role": "file_authority",
                "owner": "medautoscience",
                "ref": {
                    "ref_kind": "repo_path",
                    "ref": "artifacts/publication_eval/latest.json",
                },
            }
        ],
        sidecar_indexes=[
            {
                "surface_id": "runtime_lifecycle_sqlite",
                "surface_role": "runtime_history_index",
                "storage_role": "sqlite_sidecar_index",
                "owner": "medautoscience",
                "ref": {
                    "ref_kind": "repo_path",
                    "ref": "artifacts/runtime/runtime_lifecycle.sqlite",
                },
                "rebuild_from_refs": [
                    {
                        "ref_kind": "repo_path",
                        "ref": "artifacts/runtime/lifecycle_migration/latest.json",
                    }
                ],
            }
        ],
        projection_caches=[
            {
                "surface_id": "study_progress_shadow",
                "surface_role": "read_model_cache",
                "storage_role": "projection_cache",
                "owner": "medautoscience",
                "ref": {
                    "ref_kind": "json_pointer",
                    "ref": "/progress_projection/domain_projection",
                },
            }
        ],
        source_provenance=[
            {
                "surface_id": "historical_quest_archive_import",
                "surface_role": "explicit_archive_import_ref",
                "storage_role": "source_provenance_only",
                "owner": "medautoscience",
                "ref": {
                    "ref_kind": "cli",
                    "ref": "runtime lifecycle-quest-git-inventory",
                },
            }
        ],
    )

    assert policy["surface_kind"] == "family_persistence_policy"
    assert policy["authority_surfaces"][0]["storage_role"] == "file_authority"
    assert policy["sidecar_indexes"][0]["storage_role"] == "sqlite_sidecar_index"
    assert policy["sidecar_indexes"][0]["rebuild_from_refs"][0]["ref"] == "artifacts/runtime/lifecycle_migration/latest.json"


def test_family_lifecycle_ledger_requires_checksum_and_restore_proof_for_retention_actions() -> None:
    ledger = build_family_lifecycle_ledger(
        target_domain_id="redcube_ai",
        ledger_id="redcube_managed_run_retention_20260508",
        phase="dry_run",
        status="planned",
        summary="Managed run retention candidate is planned with restore proof.",
        actions=[
            {
                "action_id": "archive_old_managed_run",
                "action_kind": "archive",
                "target_ref": {
                    "ref_kind": "repo_path",
                    "ref": "runtime-state/managed-runs/run-1",
                },
                "authority_owner": "redcube_ai",
                "safety_gate": "restore_proof_required",
                "result": "planned",
                "manifest_ref": {
                    "ref_kind": "repo_path",
                    "ref": "runtime-state/managed-runs/run-1.manifest.json",
                },
                "sha256": "f" * 64,
                "restore_ref": {
                    "ref_kind": "repo_path",
                    "ref": "runtime-state/restore/run-1.restore.json",
                },
            }
        ],
    )

    assert ledger["surface_kind"] == "family_lifecycle_ledger"
    assert ledger["actions"][0]["sha256"] == "f" * 64
    assert ledger["actions"][0]["restore_ref"]["ref"] == "runtime-state/restore/run-1.restore.json"


def test_family_owner_route_carries_epoch_source_fingerprint_and_idempotency_token() -> None:
    route = build_family_owner_route(
        target_domain_id="med-autogrant",
        route_id="mag_grant_authoring_route",
        route_epoch="2026-05-08T00:00:00Z#1",
        source_fingerprint="grant-progress:abc123",
        next_owner="med-autogrant",
        allowed_actions=["resume_grant_user_loop"],
        idempotency_key="resume_grant_user_loop:abc123",
        status="ready_for_owner",
        summary="Grant progress can resume through the grant user loop.",
        handoff_refs=[
            {
                "ref_kind": "cli",
                "ref": "uv run python -m med_autogrant grant-user-loop --input <workspace> --task-intent <intent>",
            }
        ],
        projection_refs=[
            {
                "ref_kind": "repo_path",
                "ref": "contracts/runtime-program/current-program.json",
            }
        ],
    )

    assert route["surface_kind"] == "family_owner_route"
    assert route["allowed_actions"] == ["resume_grant_user_loop"]
    assert route["idempotency_key"] == "resume_grant_user_loop:abc123"
