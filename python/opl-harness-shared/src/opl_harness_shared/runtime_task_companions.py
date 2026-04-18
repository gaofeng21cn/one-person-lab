from __future__ import annotations

from typing import Any, Mapping


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
