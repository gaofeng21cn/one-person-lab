from __future__ import annotations

from typing import Any, Mapping

_PERSISTENCE_STORAGE_ROLES = {
    "file_authority",
    "sqlite_sidecar_index",
    "projection_cache",
    "source_provenance_only",
}


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"runtime/task companion 缺少字符串字段: {field}")
    return text


def _require_string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value)]


def _normalize_ref(value: object, field: str) -> dict[str, str] | None:
    if not isinstance(value, Mapping):
        return None
    payload = {
        "ref_kind": _require_string(value.get("ref_kind"), f"{field}.ref_kind"),
        "ref": _require_string(value.get("ref"), f"{field}.ref"),
    }
    role = _non_empty_text(value.get("role"))
    if role is not None:
        payload["role"] = role
    label = _non_empty_text(value.get("label"))
    if label is not None:
        payload["label"] = label
    return payload


def _require_ref(value: object, field: str) -> dict[str, str]:
    normalized = _normalize_ref(value, field)
    if normalized is None:
        raise ValueError(f"runtime/task companion 缺少 reference 字段: {field}")
    return normalized


def _normalize_refs(values: object, field: str) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []
    return [_require_ref(entry, f"{field}[{index}]") for index, entry in enumerate(values)]


def _require_sha256(value: object, field: str) -> str:
    text = _require_string(value, field).lower()
    if len(text) != 64 or any(char not in "0123456789abcdef" for char in text):
        raise ValueError(f"runtime/task companion {field} 必须是 64 位 sha256")
    return text


def _build_family_persistence_surface(
    entry: Mapping[str, Any],
    *,
    expected_storage_role: str,
    field: str,
) -> dict[str, Any]:
    storage_role = _require_string(entry.get("storage_role"), f"{field}.storage_role")
    if storage_role != expected_storage_role:
        raise ValueError(f"runtime/task companion {field}.storage_role 必须是 {expected_storage_role}")
    if storage_role not in _PERSISTENCE_STORAGE_ROLES:
        raise ValueError(f"runtime/task companion {field}.storage_role 不受支持: {storage_role}")
    return {
        "surface_id": _require_string(entry.get("surface_id"), f"{field}.surface_id"),
        "surface_role": _require_string(entry.get("surface_role"), f"{field}.surface_role"),
        "storage_role": storage_role,
        "owner": _require_string(entry.get("owner"), f"{field}.owner"),
        "ref": _require_ref(entry.get("ref"), f"{field}.ref"),
        "rebuild_from_refs": _normalize_refs(entry.get("rebuild_from_refs"), f"{field}.rebuild_from_refs"),
    }


def build_family_persistence_policy(
    *,
    target_domain_id: str,
    policy_id: str,
    summary: str,
    authority_surfaces: list[Mapping[str, Any]],
    sidecar_indexes: list[Mapping[str, Any]] | None = None,
    projection_caches: list[Mapping[str, Any]] | None = None,
    source_provenance: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    normalized_authority_surfaces = [
        _build_family_persistence_surface(
            entry,
            expected_storage_role="file_authority",
            field=f"authority_surfaces[{index}]",
        )
        for index, entry in enumerate(authority_surfaces)
    ]
    if not normalized_authority_surfaces:
        raise ValueError("runtime/task companion family_persistence_policy 至少需要一个 file_authority surface")
    return {
        "surface_kind": "family_persistence_policy",
        "version": "family-persistence-policy.v1",
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "policy_id": _require_string(policy_id, "policy_id"),
        "summary": _require_string(summary, "summary"),
        "authority_surfaces": normalized_authority_surfaces,
        "sidecar_indexes": [
            _build_family_persistence_surface(
                entry,
                expected_storage_role="sqlite_sidecar_index",
                field=f"sidecar_indexes[{index}]",
            )
            for index, entry in enumerate(sidecar_indexes or [])
        ],
        "projection_caches": [
            _build_family_persistence_surface(
                entry,
                expected_storage_role="projection_cache",
                field=f"projection_caches[{index}]",
            )
            for index, entry in enumerate(projection_caches or [])
        ],
        "source_provenance": [
            _build_family_persistence_surface(
                entry,
                expected_storage_role="source_provenance_only",
                field=f"source_provenance[{index}]",
            )
            for index, entry in enumerate(source_provenance or [])
        ],
    }


def _build_family_lifecycle_action(entry: Mapping[str, Any], field: str) -> dict[str, Any]:
    return {
        "action_id": _require_string(entry.get("action_id"), f"{field}.action_id"),
        "action_kind": _require_string(entry.get("action_kind"), f"{field}.action_kind"),
        "target_ref": _require_ref(entry.get("target_ref"), f"{field}.target_ref"),
        "authority_owner": _require_string(entry.get("authority_owner"), f"{field}.authority_owner"),
        "safety_gate": _require_string(entry.get("safety_gate"), f"{field}.safety_gate"),
        "result": _require_string(entry.get("result"), f"{field}.result"),
        "manifest_ref": _require_ref(entry.get("manifest_ref"), f"{field}.manifest_ref"),
        "sha256": _require_sha256(entry.get("sha256"), f"{field}.sha256"),
        "restore_ref": _require_ref(entry.get("restore_ref"), f"{field}.restore_ref"),
    }


def build_family_lifecycle_ledger(
    *,
    target_domain_id: str,
    ledger_id: str,
    phase: str,
    status: str,
    summary: str,
    actions: list[Mapping[str, Any]],
) -> dict[str, Any]:
    normalized_actions = [
        _build_family_lifecycle_action(entry, f"actions[{index}]")
        for index, entry in enumerate(actions)
    ]
    if not normalized_actions:
        raise ValueError("runtime/task companion family_lifecycle_ledger 至少需要一个 action")
    return {
        "surface_kind": "family_lifecycle_ledger",
        "version": "family-lifecycle-ledger.v1",
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "ledger_id": _require_string(ledger_id, "ledger_id"),
        "phase": _require_string(phase, "phase"),
        "status": _require_string(status, "status"),
        "summary": _require_string(summary, "summary"),
        "actions": normalized_actions,
    }


def build_family_owner_route(
    *,
    target_domain_id: str,
    route_id: str,
    route_epoch: str,
    source_fingerprint: str,
    next_owner: str,
    allowed_actions: list[str],
    idempotency_key: str,
    status: str,
    summary: str,
    handoff_refs: list[Mapping[str, Any]] | None = None,
    projection_refs: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    normalized_allowed_actions = _require_string_list(allowed_actions, "allowed_actions")
    if not normalized_allowed_actions:
        raise ValueError("runtime/task companion family_owner_route 至少需要一个 allowed action")
    return {
        "surface_kind": "family_owner_route",
        "version": "family-owner-route.v1",
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "route_id": _require_string(route_id, "route_id"),
        "route_epoch": _require_string(route_epoch, "route_epoch"),
        "source_fingerprint": _require_string(source_fingerprint, "source_fingerprint"),
        "next_owner": _require_string(next_owner, "next_owner"),
        "allowed_actions": normalized_allowed_actions,
        "idempotency_key": _require_string(idempotency_key, "idempotency_key"),
        "status": _require_string(status, "status"),
        "summary": _require_string(summary, "summary"),
        "handoff_refs": _normalize_refs(handoff_refs, "handoff_refs"),
        "projection_refs": _normalize_refs(projection_refs, "projection_refs"),
    }


def build_task_surface_descriptor(
    *,
    surface_kind: str,
    summary: str,
    command: str | None = None,
    ref: Mapping[str, Any] | None = None,
    step_id: str | None = None,
    locator_fields: list[str] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": _require_string(surface_kind, "surface_kind"),
        "summary": _require_string(summary, "summary"),
    }
    if _non_empty_text(command) is not None:
        payload["command"] = _non_empty_text(command)
    normalized_ref = _normalize_ref(ref, "ref")
    if normalized_ref is not None:
        payload["ref"] = normalized_ref
    if _non_empty_text(step_id) is not None:
        payload["step_id"] = _non_empty_text(step_id)
    normalized_locator_fields = _require_string_list(locator_fields, "locator_fields")
    if normalized_locator_fields:
        payload["locator_fields"] = normalized_locator_fields
    return payload


def build_checkpoint_summary(
    *,
    status: str,
    summary: str,
    checkpoint_id: str | None = None,
    recorded_at: str | None = None,
    lineage_ref: Mapping[str, Any] | None = None,
    verification_ref: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "checkpoint_summary",
        "status": _require_string(status, "status"),
        "summary": _require_string(summary, "summary"),
    }
    if _non_empty_text(checkpoint_id) is not None:
        payload["checkpoint_id"] = _non_empty_text(checkpoint_id)
    if _non_empty_text(recorded_at) is not None:
        payload["recorded_at"] = _non_empty_text(recorded_at)
    normalized_lineage_ref = _normalize_ref(lineage_ref, "lineage_ref")
    if normalized_lineage_ref is not None:
        payload["lineage_ref"] = normalized_lineage_ref
    normalized_verification_ref = _normalize_ref(verification_ref, "verification_ref")
    if normalized_verification_ref is not None:
        payload["verification_ref"] = normalized_verification_ref
    return payload


def build_runtime_inventory(
    *,
    summary: str,
    runtime_owner: str,
    domain_owner: str,
    executor_owner: str,
    substrate: str,
    availability: str,
    health_status: str,
    status_surface: Mapping[str, Any] | None = None,
    attention_surface: Mapping[str, Any] | None = None,
    recovery_surface: Mapping[str, Any] | None = None,
    workspace_binding: Mapping[str, Any] | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "runtime_inventory",
        "summary": _require_string(summary, "summary"),
        "runtime_owner": _require_string(runtime_owner, "runtime_owner"),
        "domain_owner": _require_string(domain_owner, "domain_owner"),
        "executor_owner": _require_string(executor_owner, "executor_owner"),
        "substrate": _require_string(substrate, "substrate"),
        "availability": _require_string(availability, "availability"),
        "health_status": _require_string(health_status, "health_status"),
    }
    for key, value in (
        ("status_surface", status_surface),
        ("attention_surface", attention_surface),
        ("recovery_surface", recovery_surface),
    ):
        normalized = _normalize_ref(value, key)
        if normalized is not None:
            payload[key] = normalized
    if isinstance(workspace_binding, Mapping):
        payload["workspace_binding"] = dict(workspace_binding)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload


def build_task_lifecycle(
    *,
    task_kind: str,
    task_id: str,
    status: str,
    summary: str,
    session_id: str | None = None,
    run_id: str | None = None,
    progress_surface: Mapping[str, Any] | None = None,
    resume_surface: Mapping[str, Any] | None = None,
    checkpoint_summary: Mapping[str, Any] | None = None,
    human_gate_ids: list[str] | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "task_lifecycle",
        "task_kind": _require_string(task_kind, "task_kind"),
        "task_id": _require_string(task_id, "task_id"),
        "status": _require_string(status, "status"),
        "summary": _require_string(summary, "summary"),
        "human_gate_ids": _require_string_list(human_gate_ids, "human_gate_ids"),
    }
    if _non_empty_text(session_id) is not None:
        payload["session_id"] = _non_empty_text(session_id)
    if _non_empty_text(run_id) is not None:
        payload["run_id"] = _non_empty_text(run_id)
    if isinstance(progress_surface, Mapping):
        payload["progress_surface"] = build_task_surface_descriptor(**progress_surface)
    if isinstance(resume_surface, Mapping):
        payload["resume_surface"] = build_task_surface_descriptor(**resume_surface)
    if isinstance(checkpoint_summary, Mapping):
        normalized_checkpoint_summary = dict(checkpoint_summary)
        normalized_checkpoint_summary.pop("surface_kind", None)
        payload["checkpoint_summary"] = build_checkpoint_summary(**normalized_checkpoint_summary)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload


def build_session_continuity(
    *,
    summary: str,
    domain_agent_id: str,
    runtime_owner: str,
    domain_owner: str,
    executor_owner: str,
    status: str,
    session_id: str | None = None,
    run_id: str | None = None,
    entry_surface: Mapping[str, Any] | None = None,
    progress_surface: Mapping[str, Any] | None = None,
    artifact_surface: Mapping[str, Any] | None = None,
    restore_surface: Mapping[str, Any] | None = None,
    checkpoint_summary: Mapping[str, Any] | None = None,
    human_gate_ids: list[str] | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "session_continuity",
        "summary": _require_string(summary, "summary"),
        "domain_agent_id": _require_string(domain_agent_id, "domain_agent_id"),
        "runtime_owner": _require_string(runtime_owner, "runtime_owner"),
        "domain_owner": _require_string(domain_owner, "domain_owner"),
        "executor_owner": _require_string(executor_owner, "executor_owner"),
        "status": _require_string(status, "status"),
        "human_gate_ids": _require_string_list(human_gate_ids, "human_gate_ids"),
    }
    if _non_empty_text(session_id) is not None:
        payload["session_id"] = _non_empty_text(session_id)
    if _non_empty_text(run_id) is not None:
        payload["run_id"] = _non_empty_text(run_id)
    for key, value in (
        ("entry_surface", entry_surface),
        ("progress_surface", progress_surface),
        ("artifact_surface", artifact_surface),
        ("restore_surface", restore_surface),
    ):
        if isinstance(value, Mapping):
            payload[key] = build_task_surface_descriptor(**value)
    if isinstance(checkpoint_summary, Mapping):
        normalized_checkpoint_summary = dict(checkpoint_summary)
        normalized_checkpoint_summary.pop("surface_kind", None)
        payload["checkpoint_summary"] = build_checkpoint_summary(**normalized_checkpoint_summary)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload


def build_progress_projection(
    *,
    headline: str,
    latest_update: str,
    next_step: str,
    status_summary: str,
    session_id: str | None = None,
    current_status: str | None = None,
    runtime_status: str | None = None,
    progress_surface: Mapping[str, Any] | None = None,
    artifact_surface: Mapping[str, Any] | None = None,
    inspect_paths: list[str] | None = None,
    attention_items: list[str] | None = None,
    human_gate_ids: list[str] | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "progress_projection",
        "headline": _require_string(headline, "headline"),
        "latest_update": _require_string(latest_update, "latest_update"),
        "next_step": _require_string(next_step, "next_step"),
        "status_summary": _require_string(status_summary, "status_summary"),
        "inspect_paths": _require_string_list(inspect_paths, "inspect_paths"),
        "attention_items": _require_string_list(attention_items, "attention_items"),
        "human_gate_ids": _require_string_list(human_gate_ids, "human_gate_ids"),
    }
    if _non_empty_text(session_id) is not None:
        payload["session_id"] = _non_empty_text(session_id)
    if _non_empty_text(current_status) is not None:
        payload["current_status"] = _non_empty_text(current_status)
    if _non_empty_text(runtime_status) is not None:
        payload["runtime_status"] = _non_empty_text(runtime_status)
    if isinstance(progress_surface, Mapping):
        payload["progress_surface"] = build_task_surface_descriptor(**progress_surface)
    if isinstance(artifact_surface, Mapping):
        payload["artifact_surface"] = build_task_surface_descriptor(**artifact_surface)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload


def build_artifact_file_descriptor(
    *,
    file_id: str,
    label: str,
    kind: str,
    path: str,
    summary: str,
    ref: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "file_id": _require_string(file_id, "file_id"),
        "label": _require_string(label, "label"),
        "kind": _require_string(kind, "kind"),
        "path": _require_string(path, "path"),
        "summary": _require_string(summary, "summary"),
    }
    normalized_ref = _normalize_ref(ref, "ref")
    if normalized_ref is not None:
        payload["ref"] = normalized_ref
    return payload


def build_artifact_inventory(
    *,
    deliverable_files: list[Mapping[str, Any]],
    supporting_files: list[Mapping[str, Any]] | None = None,
    session_id: str | None = None,
    workspace_path: str | None = None,
    progress_headline: str | None = None,
    artifact_surface: Mapping[str, Any] | None = None,
    inspect_paths: list[str] | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_deliverable_files = [
        build_artifact_file_descriptor(
            file_id=entry.get("file_id"),
            label=entry.get("label"),
            kind="deliverable",
            path=entry.get("path"),
            summary=entry.get("summary"),
            ref=entry.get("ref"),
        )
        for entry in deliverable_files
    ]
    normalized_supporting_files = [
        build_artifact_file_descriptor(
            file_id=entry.get("file_id"),
            label=entry.get("label"),
            kind="supporting",
            path=entry.get("path"),
            summary=entry.get("summary"),
            ref=entry.get("ref"),
        )
        for entry in (supporting_files or [])
    ]
    payload: dict[str, Any] = {
        "surface_kind": "artifact_inventory",
        "summary": {
            "deliverable_files_count": len(normalized_deliverable_files),
            "supporting_files_count": len(normalized_supporting_files),
            "total_files_count": len(normalized_deliverable_files) + len(normalized_supporting_files),
        },
        "deliverable_files": normalized_deliverable_files,
        "supporting_files": normalized_supporting_files,
        "inspect_paths": _require_string_list(inspect_paths, "inspect_paths"),
    }
    if _non_empty_text(session_id) is not None:
        payload["session_id"] = _non_empty_text(session_id)
    if _non_empty_text(workspace_path) is not None:
        payload["workspace_path"] = _non_empty_text(workspace_path)
    if _non_empty_text(progress_headline) is not None:
        payload["progress_headline"] = _non_empty_text(progress_headline)
    if isinstance(artifact_surface, Mapping):
        payload["artifact_surface"] = build_task_surface_descriptor(**artifact_surface)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload
