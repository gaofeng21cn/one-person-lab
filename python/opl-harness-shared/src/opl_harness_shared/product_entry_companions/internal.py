from __future__ import annotations

from typing import Any, Mapping

from ..family_entry_contracts import (
    validate_family_domain_entry_contract as _validate_shared_family_domain_entry_contract,
    validate_gateway_interaction_contract as _validate_shared_gateway_interaction_contract,
    validate_shared_handoff as _validate_shared_handoff,
    validate_shared_handoff_builder as _validate_shared_handoff_builder,
)

_FRONTDESK_SHARED_HANDOFF_KEYS = ("direct_entry_builder", "opl_handoff_builder")


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"product entry companion 缺少字符串字段: {field}")
    return text


def _require_bool(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"product entry companion 缺少布尔字段: {field}")
    return value


def _require_int(value: object, field: str) -> int:
    if not isinstance(value, int):
        raise ValueError(f"product entry companion 缺少整数字段: {field}")
    return value


def _require_mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"product entry companion 缺少对象字段: {field}")
    return value


def _require_string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"product entry companion 缺少数组字段: {field}")
    return [_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value)]


def _optional_string_list(value: object, field: str) -> list[str] | None:
    if not isinstance(value, list):
        return None
    return [_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value)]


def _normalize_resume_contract(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    normalized = {
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "session_locator_field": _require_string(
            payload.get("session_locator_field"),
            f"{field}.session_locator_field",
        ),
    }
    checkpoint_locator_field = _non_empty_text(payload.get("checkpoint_locator_field"))
    if checkpoint_locator_field is not None:
        normalized["checkpoint_locator_field"] = checkpoint_locator_field
    return normalized


def _normalize_step(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        "step_id": _require_string(payload.get("step_id"), f"{field}.step_id"),
        "title": _require_string(payload.get("title"), f"{field}.title"),
        "command": _require_string(payload.get("command"), f"{field}.command"),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "requires": _require_string_list(payload.get("requires"), f"{field}.requires"),
    }


def _normalize_progress_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    normalized = {
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "command": _require_string(payload.get("command"), f"{field}.command"),
    }
    step_id = _non_empty_text(payload.get("step_id"))
    if step_id is not None:
        normalized["step_id"] = step_id
    return normalized


def _read_optional_string_field(payload: Mapping[str, Any], key: str, field: str) -> str | None:
    if key not in payload:
        return None
    return _require_string(payload.get(key), field)


def _normalize_start_mode(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        "mode_id": _require_string(payload.get("mode_id"), f"{field}.mode_id"),
        "title": _require_string(payload.get("title"), f"{field}.title"),
        "command": _require_string(payload.get("command"), f"{field}.command"),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "requires": _require_string_list(payload.get("requires"), f"{field}.requires"),
    }


def _normalize_start_resume_surface(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    normalized = {
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
    }
    command = _read_optional_string_field(payload, "command", f"{field}.command")
    if command is not None:
        normalized["command"] = command
    session_locator_field = _read_optional_string_field(
        payload,
        "session_locator_field",
        f"{field}.session_locator_field",
    )
    if session_locator_field is not None:
        normalized["session_locator_field"] = session_locator_field
    checkpoint_locator_field = _read_optional_string_field(
        payload,
        "checkpoint_locator_field",
        f"{field}.checkpoint_locator_field",
    )
    if checkpoint_locator_field is not None:
        normalized["checkpoint_locator_field"] = checkpoint_locator_field
    return normalized


def _normalize_product_entry_shell_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    normalized: dict[str, Any] = {
        **dict(payload),
        "command": _require_string(payload.get("command"), f"{field}.command"),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
    }
    summary = _read_optional_string_field(payload, "summary", f"{field}.summary")
    if summary is not None:
        normalized["summary"] = summary
    purpose = _read_optional_string_field(payload, "purpose", f"{field}.purpose")
    if purpose is not None:
        normalized["purpose"] = purpose
    command_template = _read_optional_string_field(
        payload,
        "command_template",
        f"{field}.command_template",
    )
    if command_template is not None:
        normalized["command_template"] = command_template
    requires = _optional_string_list(payload.get("requires"), f"{field}.requires")
    if requires is not None:
        normalized["requires"] = requires
    return normalized


def _normalize_operator_loop_action(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        **dict(payload),
        "command": _require_string(payload.get("command"), f"{field}.command"),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "requires": _require_string_list(payload.get("requires"), f"{field}.requires"),
    }


def _clone_mapping(value: object, field: str) -> dict[str, Any]:
    return dict(_require_mapping(value, field))


def _normalize_frontdoor_summary(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    return {
        "frontdoor_command": _require_string(payload.get("frontdoor_command"), f"{field}.frontdoor_command"),
        "recommended_command": _require_string(payload.get("recommended_command"), f"{field}.recommended_command"),
        "operator_loop_command": _require_string(
            payload.get("operator_loop_command"),
            f"{field}.operator_loop_command",
        ),
    }


def _normalize_frontdesk_summary(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    return {
        "frontdesk_command": _require_string(payload.get("frontdesk_command"), f"{field}.frontdesk_command"),
        "recommended_command": _require_string(payload.get("recommended_command"), f"{field}.recommended_command"),
        "operator_loop_command": _require_string(
            payload.get("operator_loop_command"),
            f"{field}.operator_loop_command",
        ),
    }


def _merge_extra_payload(base: dict[str, Any], extra_payload: object | None, *, surface_kind: str) -> dict[str, Any]:
    if extra_payload is None:
        return base
    normalized_extra_payload = _clone_mapping(extra_payload, "extra_payload")
    for key in normalized_extra_payload:
        if key in base:
            raise ValueError(f"{surface_kind} extra_payload 不允许覆盖核心字段: {key}")
    return {
        **base,
        **normalized_extra_payload,
    }


def _validate_family_reference_ref(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    normalized = {
        **dict(payload),
        "ref_kind": _require_string(payload.get("ref_kind"), f"{field}.ref_kind"),
        "ref": _require_string(payload.get("ref"), f"{field}.ref"),
    }
    label = _read_optional_string_field(payload, "label", f"{field}.label")
    if label is not None:
        normalized["label"] = label
    return normalized


def _validate_optional_family_reference_ref(value: object, field: str) -> dict[str, Any] | None:
    if value is None:
        return None
    return _validate_family_reference_ref(value, field)


def _validate_domain_entry_contract_shape(value: object, field: str) -> dict[str, Any]:
    return _validate_shared_family_domain_entry_contract(value, field)


def _validate_gateway_interaction_contract_shape(value: object, field: str) -> dict[str, Any]:
    return _validate_shared_gateway_interaction_contract(value, field)

