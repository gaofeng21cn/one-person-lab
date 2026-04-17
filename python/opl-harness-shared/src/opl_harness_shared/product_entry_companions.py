from __future__ import annotations

from typing import Any, Mapping


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


def collect_family_human_gate_ids(family_orchestration: object) -> list[str]:
    if not isinstance(family_orchestration, Mapping):
        return []
    human_gates = family_orchestration.get("human_gates")
    if not isinstance(human_gates, list):
        return []
    gate_ids: list[str] = []
    for index, gate in enumerate(human_gates):
        if isinstance(gate, Mapping):
            gate_id = _non_empty_text(gate.get("gate_id"))
            if gate_id is not None:
                gate_ids.append(_require_string(gate_id, f"human_gates[{index}].gate_id"))
    return gate_ids


def build_product_entry_resume_surface(*, command: str, resume_contract: Mapping[str, Any]) -> dict[str, str]:
    normalized_contract = _normalize_resume_contract(resume_contract, "resume_contract")
    normalized = {
        "surface_kind": normalized_contract["surface_kind"],
        "command": _require_string(command, "command"),
        "session_locator_field": normalized_contract["session_locator_field"],
    }
    checkpoint_locator_field = normalized_contract.get("checkpoint_locator_field")
    if checkpoint_locator_field is not None:
        normalized["checkpoint_locator_field"] = checkpoint_locator_field
    return normalized


def build_product_entry_quickstart(
    *,
    summary: str,
    recommended_step_id: str,
    steps: list[Mapping[str, Any]],
    resume_contract: Mapping[str, Any],
    human_gate_ids: list[str],
) -> dict[str, Any]:
    normalized_steps = [_normalize_step(step, f"steps[{index}]") for index, step in enumerate(steps)]
    resolved_recommended_step_id = _require_string(recommended_step_id, "recommended_step_id")
    if all(step["step_id"] != resolved_recommended_step_id for step in normalized_steps):
        raise ValueError("product entry quickstart recommended_step_id 必须引用现有 step_id")
    return {
        "surface_kind": "product_entry_quickstart",
        "recommended_step_id": resolved_recommended_step_id,
        "summary": _require_string(summary, "summary"),
        "steps": normalized_steps,
        "resume_contract": _normalize_resume_contract(resume_contract, "resume_contract"),
        "human_gate_ids": _require_string_list(human_gate_ids, "human_gate_ids"),
    }


def build_product_entry_overview(
    *,
    summary: str,
    frontdesk_command: str,
    recommended_command: str,
    operator_loop_command: str,
    progress_surface: Mapping[str, Any],
    resume_surface: Mapping[str, Any],
    recommended_step_id: str,
    next_focus: list[str],
    remaining_gaps_count: int,
    human_gate_ids: list[str],
) -> dict[str, Any]:
    return {
        "surface_kind": "product_entry_overview",
        "summary": _require_string(summary, "summary"),
        "frontdesk_command": _require_string(frontdesk_command, "frontdesk_command"),
        "recommended_command": _require_string(recommended_command, "recommended_command"),
        "operator_loop_command": _require_string(operator_loop_command, "operator_loop_command"),
        "progress_surface": _normalize_progress_surface(progress_surface, "progress_surface"),
        "resume_surface": build_product_entry_resume_surface(
            command=_require_string(resume_surface.get("command"), "resume_surface.command"),
            resume_contract=resume_surface,
        ),
        "recommended_step_id": _require_string(recommended_step_id, "recommended_step_id"),
        "next_focus": _require_string_list(next_focus, "next_focus"),
        "remaining_gaps_count": _require_int(remaining_gaps_count, "remaining_gaps_count"),
        "human_gate_ids": _require_string_list(human_gate_ids, "human_gate_ids"),
    }


def build_product_entry_readiness(
    *,
    verdict: str,
    usable_now: bool,
    good_to_use_now: bool,
    fully_automatic: bool,
    summary: str,
    recommended_start_surface: str,
    recommended_start_command: str,
    recommended_loop_surface: str,
    recommended_loop_command: str,
    blocking_gaps: list[str],
) -> dict[str, Any]:
    return {
        "surface_kind": "product_entry_readiness",
        "verdict": _require_string(verdict, "verdict"),
        "usable_now": _require_bool(usable_now, "usable_now"),
        "good_to_use_now": _require_bool(good_to_use_now, "good_to_use_now"),
        "fully_automatic": _require_bool(fully_automatic, "fully_automatic"),
        "summary": _require_string(summary, "summary"),
        "recommended_start_surface": _require_string(
            recommended_start_surface,
            "recommended_start_surface",
        ),
        "recommended_start_command": _require_string(
            recommended_start_command,
            "recommended_start_command",
        ),
        "recommended_loop_surface": _require_string(
            recommended_loop_surface,
            "recommended_loop_surface",
        ),
        "recommended_loop_command": _require_string(
            recommended_loop_command,
            "recommended_loop_command",
        ),
        "blocking_gaps": _require_string_list(blocking_gaps, "blocking_gaps"),
    }
