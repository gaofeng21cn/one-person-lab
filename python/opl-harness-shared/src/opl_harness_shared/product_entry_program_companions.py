from __future__ import annotations

from typing import Any, Mapping, Sequence


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"product entry program companion 缺少字符串字段: {field}")
    return text


def _require_bool(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"product entry program companion 缺少布尔字段: {field}")
    return value


def _require_mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"product entry program companion 缺少对象字段: {field}")
    return value


def _require_string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"product entry program companion 缺少数组字段: {field}")
    return [_require_string(item, f"{field}[{index}]") for index, item in enumerate(value)]


def _normalize_program_check(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        "check_id": _require_string(payload.get("check_id"), f"{field}.check_id"),
        "title": _require_string(payload.get("title"), f"{field}.title"),
        "status": _require_string(payload.get("status"), f"{field}.status"),
        "blocking": _require_bool(payload.get("blocking"), f"{field}.blocking"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "command": _require_string(payload.get("command"), f"{field}.command"),
    }


def _normalize_program_step(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    normalized = {
        "step_id": _require_string(payload.get("step_id"), f"{field}.step_id"),
        "command": _require_string(payload.get("command"), f"{field}.command"),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
    }
    title = _non_empty_text(payload.get("title"))
    if title is not None:
        normalized["title"] = title
    return normalized


def _normalize_program_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    command = _non_empty_text(payload.get("command"))
    ref = _non_empty_text(payload.get("ref"))
    if command is None and ref is None:
        raise ValueError("product entry program surface 至少要提供 command 或 ref。")
    normalized = {
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
    }
    if command is not None:
        normalized["command"] = command
    if ref is not None:
        normalized["ref"] = ref
    return normalized


def _normalize_guardrail_class(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    return {
        "guardrail_id": _require_string(payload.get("guardrail_id"), f"{field}.guardrail_id"),
        "trigger": _require_string(payload.get("trigger"), f"{field}.trigger"),
        "symptom": _require_string(payload.get("symptom"), f"{field}.symptom"),
        "recommended_command": _require_string(
            payload.get("recommended_command"),
            f"{field}.recommended_command",
        ),
    }


def _normalize_clearance_target(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        "target_id": _require_string(payload.get("target_id"), f"{field}.target_id"),
        "title": _require_string(payload.get("title"), f"{field}.title"),
        "commands": _require_string_list(payload.get("commands"), f"{field}.commands"),
    }


def _normalize_capability(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    return {
        "capability_id": _require_string(payload.get("capability_id"), f"{field}.capability_id"),
        "owner": _require_string(payload.get("owner"), f"{field}.owner"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
    }


def _normalize_workflow_coverage_item(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    return {
        "step_id": _require_string(payload.get("step_id"), f"{field}.step_id"),
        "manual_flow_label": _require_string(
            payload.get("manual_flow_label"),
            f"{field}.manual_flow_label",
        ),
        "coverage_status": _require_string(payload.get("coverage_status"), f"{field}.coverage_status"),
        "current_surface": _require_string(payload.get("current_surface"), f"{field}.current_surface"),
        "remaining_gap": _require_string(payload.get("remaining_gap"), f"{field}.remaining_gap"),
    }


def _normalize_sequence_step(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    normalized = {
        "step_id": _require_string(payload.get("step_id"), f"{field}.step_id"),
        "phase_id": _require_string(payload.get("phase_id"), f"{field}.phase_id"),
        "status": _require_string(payload.get("status"), f"{field}.status"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
    }
    title = _non_empty_text(payload.get("title"))
    if title is not None:
        normalized["title"] = title
    return normalized


def build_program_check(
    *,
    check_id: str,
    title: str,
    status: str,
    blocking: bool,
    summary: str,
    command: str,
) -> dict[str, Any]:
    return _normalize_program_check(
        {
            "check_id": check_id,
            "title": title,
            "status": status,
            "blocking": blocking,
            "summary": summary,
            "command": command,
        },
        "program_check",
    )


def build_product_entry_preflight(
    *,
    summary: str,
    recommended_check_command: str,
    recommended_start_command: str,
    checks: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    normalized_checks = [
        _normalize_program_check(check, f"checks[{index}]")
        for index, check in enumerate(checks)
    ]
    blocking_check_ids = [
        check["check_id"]
        for check in normalized_checks
        if check["blocking"] and check["status"] != "pass"
    ]
    return {
        "surface_kind": "product_entry_preflight",
        "summary": _require_string(summary, "summary"),
        "ready_to_try_now": not blocking_check_ids,
        "recommended_check_command": _require_string(
            recommended_check_command,
            "recommended_check_command",
        ),
        "recommended_start_command": _require_string(
            recommended_start_command,
            "recommended_start_command",
        ),
        "blocking_check_ids": blocking_check_ids,
        "checks": normalized_checks,
    }


def build_workflow_coverage_item(
    *,
    step_id: str,
    manual_flow_label: str,
    coverage_status: str,
    current_surface: str,
    remaining_gap: str,
) -> dict[str, str]:
    return _normalize_workflow_coverage_item(
        {
            "step_id": step_id,
            "manual_flow_label": manual_flow_label,
            "coverage_status": coverage_status,
            "current_surface": current_surface,
            "remaining_gap": remaining_gap,
        },
        "workflow_coverage_item",
    )


def build_detailed_readiness(
    *,
    surface_kind: str,
    verdict: str,
    usable_now: bool,
    good_to_use_now: bool,
    fully_automatic: bool,
    user_experience_level: str,
    summary: str,
    recommended_start_surface: str,
    recommended_start_command: str,
    recommended_loop_surface: str,
    recommended_loop_command: str,
    workflow_coverage: Sequence[Mapping[str, Any]],
    blocking_gaps: list[str],
) -> dict[str, Any]:
    return {
        "surface_kind": _require_string(surface_kind, "surface_kind"),
        "verdict": _require_string(verdict, "verdict"),
        "usable_now": _require_bool(usable_now, "usable_now"),
        "good_to_use_now": _require_bool(good_to_use_now, "good_to_use_now"),
        "fully_automatic": _require_bool(fully_automatic, "fully_automatic"),
        "user_experience_level": _require_string(
            user_experience_level,
            "user_experience_level",
        ),
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
        "workflow_coverage": [
            _normalize_workflow_coverage_item(item, f"workflow_coverage[{index}]")
            for index, item in enumerate(workflow_coverage)
        ],
        "blocking_gaps": _require_string_list(blocking_gaps, "blocking_gaps"),
    }


def build_guardrail_class(
    *,
    guardrail_id: str,
    trigger: str,
    symptom: str,
    recommended_command: str,
) -> dict[str, str]:
    return _normalize_guardrail_class(
        {
            "guardrail_id": guardrail_id,
            "trigger": trigger,
            "symptom": symptom,
            "recommended_command": recommended_command,
        },
        "guardrail_class",
    )


def build_product_entry_program_step(
    *,
    step_id: str,
    command: str,
    surface_kind: str,
    title: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "step_id": step_id,
        "command": command,
        "surface_kind": surface_kind,
    }
    if title is not None:
        payload["title"] = title
    return _normalize_program_step(payload, "program_step")


def build_product_entry_program_surface(
    *,
    surface_kind: str,
    command: str | None = None,
    ref: str | None = None,
) -> dict[str, str]:
    payload: dict[str, Any] = {"surface_kind": surface_kind}
    if command is not None:
        payload["command"] = command
    if ref is not None:
        payload["ref"] = ref
    return _normalize_program_surface(payload, "program_surface")


def build_product_entry_guardrails(
    *,
    summary: str,
    guardrail_classes: Sequence[Mapping[str, Any]],
    recovery_loop: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return {
        "surface_kind": "product_entry_guardrails",
        "summary": _require_string(summary, "summary"),
        "guardrail_classes": [
            _normalize_guardrail_class(item, f"guardrail_classes[{index}]")
            for index, item in enumerate(guardrail_classes)
        ],
        "recovery_loop": [
            _normalize_program_step(item, f"recovery_loop[{index}]")
            for index, item in enumerate(recovery_loop)
        ],
    }


def build_clearance_target(
    *,
    target_id: str,
    title: str,
    commands: list[str],
) -> dict[str, Any]:
    return _normalize_clearance_target(
        {
            "target_id": target_id,
            "title": title,
            "commands": commands,
        },
        "clearance_target",
    )


def build_clearance_lane(
    *,
    surface_kind: str,
    summary: str,
    recommended_step_id: str,
    recommended_command: str,
    clearance_targets: Sequence[Mapping[str, Any]],
    clearance_loop: Sequence[Mapping[str, Any]],
    proof_surfaces: Sequence[Mapping[str, Any]],
    recommended_phase_command: str,
) -> dict[str, Any]:
    return {
        "surface_kind": _require_string(surface_kind, "surface_kind"),
        "summary": _require_string(summary, "summary"),
        "recommended_step_id": _require_string(recommended_step_id, "recommended_step_id"),
        "recommended_command": _require_string(recommended_command, "recommended_command"),
        "clearance_targets": [
            _normalize_clearance_target(item, f"clearance_targets[{index}]")
            for index, item in enumerate(clearance_targets)
        ],
        "clearance_loop": [
            _normalize_program_step(item, f"clearance_loop[{index}]")
            for index, item in enumerate(clearance_loop)
        ],
        "proof_surfaces": [
            _normalize_program_surface(item, f"proof_surfaces[{index}]")
            for index, item in enumerate(proof_surfaces)
        ],
        "recommended_phase_command": _require_string(
            recommended_phase_command,
            "recommended_phase_command",
        ),
    }


def build_program_capability(
    *,
    capability_id: str,
    owner: str,
    summary: str,
) -> dict[str, str]:
    return _normalize_capability(
        {
            "capability_id": capability_id,
            "owner": owner,
            "summary": summary,
        },
        "program_capability",
    )


def build_backend_deconstruction_lane(
    *,
    summary: str,
    substrate_targets: Sequence[Mapping[str, Any]],
    backend_retained_now: list[str],
    current_backend_chain: list[str],
    optional_executor_proofs: Sequence[Mapping[str, Any]],
    promotion_rules: list[str],
    deconstruction_map_doc: str,
    recommended_phase_command: str,
    surface_kind: str = "phase4_backend_deconstruction_lane",
) -> dict[str, Any]:
    return {
        "surface_kind": _require_string(surface_kind, "surface_kind"),
        "summary": _require_string(summary, "summary"),
        "substrate_targets": [
            _normalize_capability(item, f"substrate_targets[{index}]")
            for index, item in enumerate(substrate_targets)
        ],
        "backend_retained_now": _require_string_list(
            backend_retained_now,
            "backend_retained_now",
        ),
        "current_backend_chain": _require_string_list(
            current_backend_chain,
            "current_backend_chain",
        ),
        "optional_executor_proofs": [
            dict(_require_mapping(item, f"optional_executor_proofs[{index}]"))
            for index, item in enumerate(optional_executor_proofs)
        ],
        "promotion_rules": _require_string_list(promotion_rules, "promotion_rules"),
        "deconstruction_map_doc": _require_string(
            deconstruction_map_doc,
            "deconstruction_map_doc",
        ),
        "recommended_phase_command": _require_string(
            recommended_phase_command,
            "recommended_phase_command",
        ),
    }


def build_program_sequence_step(
    *,
    step_id: str,
    phase_id: str,
    status: str,
    summary: str,
    title: str | None = None,
) -> dict[str, str]:
    payload = {
        "step_id": step_id,
        "phase_id": phase_id,
        "status": status,
        "summary": summary,
    }
    if title is not None:
        payload["title"] = title
    return _normalize_sequence_step(payload, "program_sequence_step")


def build_platform_target(
    *,
    summary: str,
    sequence_scope: str,
    current_step_id: str,
    current_readiness_summary: str,
    north_star_topology: Mapping[str, Any],
    target_internal_modules: list[str],
    landing_sequence: Sequence[Mapping[str, Any]],
    completed_step_ids: list[str],
    remaining_step_ids: list[str],
    promotion_gates: list[str],
    recommended_phase_command: str,
    surface_kind: str = "phase5_platform_target",
    land_now: list[str] | None = None,
    not_yet: list[str] | None = None,
) -> dict[str, Any]:
    normalized_landing_sequence = [
        _normalize_sequence_step(item, f"landing_sequence[{index}]")
        for index, item in enumerate(landing_sequence)
    ]
    known_step_ids = {item["step_id"] for item in normalized_landing_sequence}
    for field, values in (
        ("completed_step_ids", completed_step_ids),
        ("remaining_step_ids", remaining_step_ids),
    ):
        for step_id in _require_string_list(values, field):
            if step_id not in known_step_ids:
                raise ValueError(f"platform target {field} 必须引用 landing_sequence 中的 step_id。")
    return {
        "surface_kind": _require_string(surface_kind, "surface_kind"),
        "summary": _require_string(summary, "summary"),
        "sequence_scope": _require_string(sequence_scope, "sequence_scope"),
        "current_step_id": _require_string(current_step_id, "current_step_id"),
        "current_readiness_summary": _require_string(
            current_readiness_summary,
            "current_readiness_summary",
        ),
        "north_star_topology": dict(_require_mapping(north_star_topology, "north_star_topology")),
        "target_internal_modules": _require_string_list(
            target_internal_modules,
            "target_internal_modules",
        ),
        "landing_sequence": normalized_landing_sequence,
        "completed_step_ids": _require_string_list(completed_step_ids, "completed_step_ids"),
        "remaining_step_ids": _require_string_list(remaining_step_ids, "remaining_step_ids"),
        "promotion_gates": _require_string_list(promotion_gates, "promotion_gates"),
        "recommended_phase_command": _require_string(
            recommended_phase_command,
            "recommended_phase_command",
        ),
        **({"land_now": _require_string_list(land_now, "land_now")} if land_now is not None else {}),
        **({"not_yet": _require_string_list(not_yet, "not_yet")} if not_yet is not None else {}),
    }
