from __future__ import annotations

from typing import Any, Mapping


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"automation companion 缺少字符串字段: {field}")
    return text


def _require_string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"automation companion 缺少数组字段: {field}")
    return [_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value)]


def build_automation_descriptor(
    *,
    automation_id: str,
    title: str,
    owner: str,
    trigger_kind: str,
    target_surface_kind: str,
    summary: str,
    readiness_status: str,
    gate_policy: str,
    output_expectation: list[str],
    target_command: str | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "automation_descriptor",
        "automation_id": _require_string(automation_id, "automation_id"),
        "title": _require_string(title, "title"),
        "owner": _require_string(owner, "owner"),
        "trigger_kind": _require_string(trigger_kind, "trigger_kind"),
        "target_surface_kind": _require_string(target_surface_kind, "target_surface_kind"),
        "summary": _require_string(summary, "summary"),
        "readiness_status": _require_string(readiness_status, "readiness_status"),
        "gate_policy": _require_string(gate_policy, "gate_policy"),
        "output_expectation": _require_string_list(output_expectation, "output_expectation"),
    }
    if _non_empty_text(target_command) is not None:
        payload["target_command"] = _non_empty_text(target_command)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload


def build_automation_catalog(
    *,
    summary: str,
    automations: list[Mapping[str, Any]],
    readiness_summary: str | None = None,
) -> dict[str, Any]:
    if not automations:
        raise ValueError("automation catalog 需要至少一个 automation descriptor。")
    payload: dict[str, Any] = {
        "surface_kind": "automation",
        "summary": _require_string(summary, "summary"),
        "automations": [dict(entry) for entry in automations if isinstance(entry, Mapping)],
    }
    if _non_empty_text(readiness_summary) is not None:
        payload["readiness_summary"] = _non_empty_text(readiness_summary)
    return payload
