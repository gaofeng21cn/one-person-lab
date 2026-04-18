from __future__ import annotations

from typing import Any, Mapping

from .family_entry_contracts import (
    validate_family_domain_entry_contract as _validate_shared_family_domain_entry_contract,
    validate_gateway_interaction_contract as _validate_shared_gateway_interaction_contract,
)


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


def _clone_mapping(value: object, field: str) -> dict[str, Any]:
    return dict(_require_mapping(value, field))


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


def _validate_surface_kind_mapping(value: object, field: str, expected_surface_kind: str) -> dict[str, Any]:
    payload = _clone_mapping(value, field)
    surface_kind = _require_string(payload.get("surface_kind"), f"{field}.surface_kind")
    if surface_kind != expected_surface_kind:
        raise ValueError(
            f"product entry companion {field}.surface_kind 必须是 {expected_surface_kind}，当前为 {surface_kind}"
        )
    payload["surface_kind"] = surface_kind
    return payload


def _validate_family_orchestration_companion(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    human_gates = payload.get("human_gates")
    if not isinstance(human_gates, list):
        human_gates = []
    normalized_human_gates: list[dict[str, Any]] = []
    for index, gate in enumerate(human_gates):
        normalized_gate = _clone_mapping(gate, f"{field}.human_gates[{index}]")
        normalized_gate["gate_id"] = _require_string(
            normalized_gate.get("gate_id"),
            f"{field}.human_gates[{index}].gate_id",
        )
        review_surface = _validate_optional_family_reference_ref(
            normalized_gate.get("review_surface"),
            f"{field}.human_gates[{index}].review_surface",
        )
        if review_surface is not None:
            normalized_gate["review_surface"] = review_surface
        normalized_human_gates.append(normalized_gate)
    normalized = {
        **dict(payload),
        "human_gates": normalized_human_gates,
        "resume_contract": _normalize_resume_contract(
            payload.get("resume_contract"),
            f"{field}.resume_contract",
        ),
    }
    action_graph_ref = _validate_optional_family_reference_ref(
        payload.get("action_graph_ref"),
        f"{field}.action_graph_ref",
    )
    if action_graph_ref is not None:
        normalized["action_graph_ref"] = action_graph_ref
    if payload.get("action_graph") is not None:
        normalized["action_graph"] = _clone_mapping(payload.get("action_graph"), f"{field}.action_graph")
    event_envelope_surface = _validate_optional_family_reference_ref(
        payload.get("event_envelope_surface"),
        f"{field}.event_envelope_surface",
    )
    if event_envelope_surface is not None:
        normalized["event_envelope_surface"] = event_envelope_surface
    checkpoint_lineage_surface = _validate_optional_family_reference_ref(
        payload.get("checkpoint_lineage_surface"),
        f"{field}.checkpoint_lineage_surface",
    )
    if checkpoint_lineage_surface is not None:
        normalized["checkpoint_lineage_surface"] = checkpoint_lineage_surface
    return normalized


def _validate_product_entry_quickstart_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    steps = payload.get("steps")
    if not isinstance(steps, list):
        steps = []
    normalized_steps = [_normalize_step(step, f"{field}.steps[{index}]") for index, step in enumerate(steps)]
    recommended_step_id = _require_string(payload.get("recommended_step_id"), f"{field}.recommended_step_id")
    if all(step["step_id"] != recommended_step_id for step in normalized_steps):
        raise ValueError(f"product entry companion {field}.recommended_step_id 必须引用现有 step_id")
    return {
        **dict(payload),
        "surface_kind": "product_entry_quickstart",
        "recommended_step_id": recommended_step_id,
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "steps": normalized_steps,
        "resume_contract": _normalize_resume_contract(payload.get("resume_contract"), f"{field}.resume_contract"),
        "human_gate_ids": _require_string_list(payload.get("human_gate_ids"), f"{field}.human_gate_ids"),
    }


def _validate_product_entry_start_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    modes = payload.get("modes")
    if not isinstance(modes, list):
        modes = []
    normalized_modes = [_normalize_start_mode(mode, f"{field}.modes[{index}]") for index, mode in enumerate(modes)]
    recommended_mode_id = _require_string(payload.get("recommended_mode_id"), f"{field}.recommended_mode_id")
    if all(mode["mode_id"] != recommended_mode_id for mode in normalized_modes):
        raise ValueError(f"product entry companion {field}.recommended_mode_id 必须引用现有 mode_id")
    return {
        **dict(payload),
        "surface_kind": "product_entry_start",
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "recommended_mode_id": recommended_mode_id,
        "modes": normalized_modes,
        "resume_surface": _normalize_start_resume_surface(payload.get("resume_surface"), f"{field}.resume_surface"),
        "human_gate_ids": _require_string_list(payload.get("human_gate_ids"), f"{field}.human_gate_ids"),
    }


def _validate_product_entry_overview_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    resume_surface = _normalize_start_resume_surface(payload.get("resume_surface"), f"{field}.resume_surface")
    command = _require_string(resume_surface.get("command"), f"{field}.resume_surface.command")
    return {
        **dict(payload),
        "surface_kind": "product_entry_overview",
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "frontdesk_command": _require_string(payload.get("frontdesk_command"), f"{field}.frontdesk_command"),
        "recommended_command": _require_string(payload.get("recommended_command"), f"{field}.recommended_command"),
        "operator_loop_command": _require_string(payload.get("operator_loop_command"), f"{field}.operator_loop_command"),
        "progress_surface": _normalize_progress_surface(payload.get("progress_surface"), f"{field}.progress_surface"),
        "resume_surface": build_product_entry_resume_surface(
            command=command,
            resume_contract=resume_surface,
        ),
        "recommended_step_id": _require_string(payload.get("recommended_step_id"), f"{field}.recommended_step_id"),
        "next_focus": _require_string_list(payload.get("next_focus"), f"{field}.next_focus"),
        "remaining_gaps_count": _require_int(payload.get("remaining_gaps_count"), f"{field}.remaining_gaps_count"),
        "human_gate_ids": _require_string_list(payload.get("human_gate_ids"), f"{field}.human_gate_ids"),
    }


def _validate_product_entry_readiness_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        **dict(payload),
        "surface_kind": "product_entry_readiness",
        "verdict": _require_string(payload.get("verdict"), f"{field}.verdict"),
        "usable_now": _require_bool(payload.get("usable_now"), f"{field}.usable_now"),
        "good_to_use_now": _require_bool(payload.get("good_to_use_now"), f"{field}.good_to_use_now"),
        "fully_automatic": _require_bool(payload.get("fully_automatic"), f"{field}.fully_automatic"),
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "recommended_start_surface": _require_string(
            payload.get("recommended_start_surface"),
            f"{field}.recommended_start_surface",
        ),
        "recommended_start_command": _require_string(
            payload.get("recommended_start_command"),
            f"{field}.recommended_start_command",
        ),
        "recommended_loop_surface": _require_string(
            payload.get("recommended_loop_surface"),
            f"{field}.recommended_loop_surface",
        ),
        "recommended_loop_command": _require_string(
            payload.get("recommended_loop_command"),
            f"{field}.recommended_loop_command",
        ),
        "blocking_gaps": _require_string_list(payload.get("blocking_gaps"), f"{field}.blocking_gaps"),
    }


def _validate_product_entry_preflight_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    checks = payload.get("checks")
    if not isinstance(checks, list):
        checks = []
    return {
        **dict(payload),
        "surface_kind": "product_entry_preflight",
        "summary": _require_string(payload.get("summary"), f"{field}.summary"),
        "ready_to_try_now": _require_bool(payload.get("ready_to_try_now"), f"{field}.ready_to_try_now"),
        "recommended_check_command": _require_string(
            payload.get("recommended_check_command"),
            f"{field}.recommended_check_command",
        ),
        "recommended_start_command": _require_string(
            payload.get("recommended_start_command"),
            f"{field}.recommended_start_command",
        ),
        "blocking_check_ids": _require_string_list(payload.get("blocking_check_ids"), f"{field}.blocking_check_ids"),
        "checks": checks,
    }


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


def build_product_entry_start(
    *,
    summary: str,
    recommended_mode_id: str,
    modes: list[Mapping[str, Any]],
    resume_surface: Mapping[str, Any],
    human_gate_ids: list[str],
) -> dict[str, Any]:
    normalized_modes = [_normalize_start_mode(mode, f"modes[{index}]") for index, mode in enumerate(modes)]
    resolved_recommended_mode_id = _require_string(recommended_mode_id, "recommended_mode_id")
    if all(mode["mode_id"] != resolved_recommended_mode_id for mode in normalized_modes):
        raise ValueError("product entry start recommended_mode_id 必须引用现有 mode_id")
    return {
        "surface_kind": "product_entry_start",
        "summary": _require_string(summary, "summary"),
        "recommended_mode_id": resolved_recommended_mode_id,
        "modes": normalized_modes,
        "resume_surface": _normalize_start_resume_surface(resume_surface, "resume_surface"),
        "human_gate_ids": _require_string_list(human_gate_ids, "human_gate_ids"),
    }


def build_product_frontdesk(
    *,
    recommended_action: str,
    target_domain_id: str,
    workspace_locator: Mapping[str, Any],
    runtime: Mapping[str, Any],
    product_entry_status: Mapping[str, Any],
    frontdesk_surface: Mapping[str, Any],
    operator_loop_surface: Mapping[str, Any],
    operator_loop_actions: Mapping[str, Any],
    product_entry_start: Mapping[str, Any],
    product_entry_overview: Mapping[str, Any],
    product_entry_preflight: Mapping[str, Any],
    product_entry_readiness: Mapping[str, Any],
    product_entry_quickstart: Mapping[str, Any],
    family_orchestration: Mapping[str, Any],
    product_entry_manifest: Mapping[str, Any],
    entry_surfaces: Mapping[str, Any],
    summary: Mapping[str, Any],
    notes: list[str],
    schema_ref: str | None = None,
    domain_entry_contract: Mapping[str, Any] | None = None,
    gateway_interaction_contract: Mapping[str, Any] | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "product_frontdesk",
        "recommended_action": _require_string(recommended_action, "recommended_action"),
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "workspace_locator": _clone_mapping(workspace_locator, "workspace_locator"),
        "runtime": _clone_mapping(runtime, "runtime"),
        "product_entry_status": _clone_mapping(product_entry_status, "product_entry_status"),
        "frontdesk_surface": _clone_mapping(frontdesk_surface, "frontdesk_surface"),
        "operator_loop_surface": _clone_mapping(operator_loop_surface, "operator_loop_surface"),
        "operator_loop_actions": _clone_mapping(operator_loop_actions, "operator_loop_actions"),
        "product_entry_start": _clone_mapping(product_entry_start, "product_entry_start"),
        "product_entry_overview": _clone_mapping(product_entry_overview, "product_entry_overview"),
        "product_entry_preflight": _clone_mapping(product_entry_preflight, "product_entry_preflight"),
        "product_entry_readiness": _clone_mapping(product_entry_readiness, "product_entry_readiness"),
        "product_entry_quickstart": _clone_mapping(product_entry_quickstart, "product_entry_quickstart"),
        "family_orchestration": _clone_mapping(family_orchestration, "family_orchestration"),
        "product_entry_manifest": _clone_mapping(product_entry_manifest, "product_entry_manifest"),
        "entry_surfaces": _clone_mapping(entry_surfaces, "entry_surfaces"),
        "summary": _normalize_frontdesk_summary(summary, "summary"),
        "notes": _require_string_list(notes, "notes"),
    }
    resolved_schema_ref = _non_empty_text(schema_ref)
    if resolved_schema_ref is not None:
        payload["schema_ref"] = resolved_schema_ref
    if domain_entry_contract is not None:
        payload["domain_entry_contract"] = _clone_mapping(domain_entry_contract, "domain_entry_contract")
    if gateway_interaction_contract is not None:
        payload["gateway_interaction_contract"] = _clone_mapping(
            gateway_interaction_contract,
            "gateway_interaction_contract",
        )
    return _merge_extra_payload(payload, extra_payload, surface_kind="product frontdesk")


def build_family_product_frontdesk(
    *,
    recommended_action: str,
    product_entry_manifest: Mapping[str, Any],
    entry_surfaces: Mapping[str, Any],
    notes: list[str],
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    manifest = _clone_mapping(product_entry_manifest, "product_entry_manifest")
    frontdesk_surface = _clone_mapping(
        manifest.get("frontdesk_surface"),
        "product_entry_manifest.frontdesk_surface",
    )
    operator_loop_surface = _clone_mapping(
        manifest.get("operator_loop_surface"),
        "product_entry_manifest.operator_loop_surface",
    )
    return build_product_frontdesk(
        recommended_action=_require_string(recommended_action, "recommended_action"),
        target_domain_id=_require_string(
            manifest.get("target_domain_id"),
            "product_entry_manifest.target_domain_id",
        ),
        workspace_locator=_clone_mapping(
            manifest.get("workspace_locator"),
            "product_entry_manifest.workspace_locator",
        ),
        runtime=_clone_mapping(manifest.get("runtime"), "product_entry_manifest.runtime"),
        product_entry_status=_clone_mapping(
            manifest.get("product_entry_status"),
            "product_entry_manifest.product_entry_status",
        ),
        frontdesk_surface=frontdesk_surface,
        operator_loop_surface=operator_loop_surface,
        operator_loop_actions=_clone_mapping(
            manifest.get("operator_loop_actions"),
            "product_entry_manifest.operator_loop_actions",
        ),
        product_entry_start=_clone_mapping(
            manifest.get("product_entry_start"),
            "product_entry_manifest.product_entry_start",
        ),
        product_entry_overview=_clone_mapping(
            manifest.get("product_entry_overview"),
            "product_entry_manifest.product_entry_overview",
        ),
        product_entry_preflight=_clone_mapping(
            manifest.get("product_entry_preflight"),
            "product_entry_manifest.product_entry_preflight",
        ),
        product_entry_readiness=_clone_mapping(
            manifest.get("product_entry_readiness"),
            "product_entry_manifest.product_entry_readiness",
        ),
        product_entry_quickstart=_clone_mapping(
            manifest.get("product_entry_quickstart"),
            "product_entry_manifest.product_entry_quickstart",
        ),
        family_orchestration=_clone_mapping(
            manifest.get("family_orchestration"),
            "product_entry_manifest.family_orchestration",
        ),
        product_entry_manifest=manifest,
        entry_surfaces=_clone_mapping(entry_surfaces, "entry_surfaces"),
        summary={
            "frontdesk_command": _require_string(
                frontdesk_surface.get("command"),
                "product_entry_manifest.frontdesk_surface.command",
            ),
            "recommended_command": _require_string(
                manifest.get("recommended_command"),
                "product_entry_manifest.recommended_command",
            ),
            "operator_loop_command": _require_string(
                operator_loop_surface.get("command"),
                "product_entry_manifest.operator_loop_surface.command",
            ),
        },
        notes=_require_string_list(notes, "notes"),
        schema_ref=_non_empty_text(manifest.get("schema_ref")),
        domain_entry_contract=(
            _clone_mapping(manifest.get("domain_entry_contract"), "product_entry_manifest.domain_entry_contract")
            if isinstance(manifest.get("domain_entry_contract"), Mapping)
            else None
        ),
        gateway_interaction_contract=(
            _clone_mapping(
                manifest.get("gateway_interaction_contract"),
                "product_entry_manifest.gateway_interaction_contract",
            )
            if isinstance(manifest.get("gateway_interaction_contract"), Mapping)
            else None
        ),
        extra_payload=extra_payload,
    )


def build_family_product_entry_manifest(
    *,
    manifest_kind: str,
    target_domain_id: str,
    formal_entry: Mapping[str, Any],
    workspace_locator: Mapping[str, Any],
    product_entry_shell: Mapping[str, Any],
    shared_handoff: Mapping[str, Any],
    product_entry_start: Mapping[str, Any],
    family_orchestration: Mapping[str, Any],
    runtime: Mapping[str, Any] | None = None,
    managed_runtime_contract: Mapping[str, Any] | None = None,
    repo_mainline: Mapping[str, Any] | None = None,
    product_entry_status: Mapping[str, Any] | None = None,
    frontdesk_surface: Mapping[str, Any] | None = None,
    operator_loop_surface: Mapping[str, Any] | None = None,
    operator_loop_actions: Mapping[str, Any] | None = None,
    recommended_shell: str | None = None,
    recommended_command: str | None = None,
    runtime_inventory: Mapping[str, Any] | None = None,
    task_lifecycle: Mapping[str, Any] | None = None,
    skill_catalog: Mapping[str, Any] | None = None,
    automation: Mapping[str, Any] | None = None,
    product_entry_overview: Mapping[str, Any] | None = None,
    product_entry_preflight: Mapping[str, Any] | None = None,
    product_entry_readiness: Mapping[str, Any] | None = None,
    product_entry_quickstart: Mapping[str, Any] | None = None,
    remaining_gaps: list[str] | None = None,
    notes: list[str] | None = None,
    schema_ref: str | None = None,
    domain_entry_contract: Mapping[str, Any] | None = None,
    gateway_interaction_contract: Mapping[str, Any] | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "product_entry_manifest",
        "manifest_version": 2,
        "manifest_kind": _require_string(manifest_kind, "manifest_kind"),
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "formal_entry": _clone_mapping(formal_entry, "formal_entry"),
        "workspace_locator": _clone_mapping(workspace_locator, "workspace_locator"),
        "product_entry_shell": _clone_mapping(product_entry_shell, "product_entry_shell"),
        "shared_handoff": _clone_mapping(shared_handoff, "shared_handoff"),
        "product_entry_start": _clone_mapping(product_entry_start, "product_entry_start"),
        "family_orchestration": _clone_mapping(family_orchestration, "family_orchestration"),
    }

    for key, value in (
        ("runtime", runtime),
        ("managed_runtime_contract", managed_runtime_contract),
        ("repo_mainline", repo_mainline),
        ("product_entry_status", product_entry_status),
        ("frontdesk_surface", frontdesk_surface),
        ("operator_loop_surface", operator_loop_surface),
        ("operator_loop_actions", operator_loop_actions),
        ("runtime_inventory", runtime_inventory),
        ("task_lifecycle", task_lifecycle),
        ("skill_catalog", skill_catalog),
        ("automation", automation),
        ("product_entry_overview", product_entry_overview),
        ("product_entry_preflight", product_entry_preflight),
        ("product_entry_readiness", product_entry_readiness),
        ("product_entry_quickstart", product_entry_quickstart),
    ):
        if value is not None:
            payload[key] = _clone_mapping(value, key)

    resolved_recommended_shell = _non_empty_text(recommended_shell)
    if resolved_recommended_shell is not None:
        payload["recommended_shell"] = resolved_recommended_shell
    resolved_recommended_command = _non_empty_text(recommended_command)
    if resolved_recommended_command is not None:
        payload["recommended_command"] = resolved_recommended_command
    normalized_remaining_gaps = _optional_string_list(remaining_gaps, "remaining_gaps")
    if normalized_remaining_gaps is not None:
        payload["remaining_gaps"] = normalized_remaining_gaps
    normalized_notes = _optional_string_list(notes, "notes")
    if normalized_notes is not None:
        payload["notes"] = normalized_notes
    resolved_schema_ref = _non_empty_text(schema_ref)
    if resolved_schema_ref is not None:
        payload["schema_ref"] = resolved_schema_ref
    if domain_entry_contract is not None:
        payload["domain_entry_contract"] = _clone_mapping(domain_entry_contract, "domain_entry_contract")
    if gateway_interaction_contract is not None:
        payload["gateway_interaction_contract"] = _clone_mapping(
            gateway_interaction_contract,
            "gateway_interaction_contract",
        )
    return _merge_extra_payload(payload, extra_payload, surface_kind="product entry manifest")


def validate_family_product_entry_manifest(
    value: object,
    *,
    require_contract_bundle: bool = False,
    require_runtime_companions: bool = False,
) -> dict[str, Any]:
    payload = _require_mapping(value, "product_entry_manifest")
    normalized: dict[str, Any] = {
        **dict(payload),
        "surface_kind": "product_entry_manifest",
        "manifest_version": _require_int(payload.get("manifest_version"), "product_entry_manifest.manifest_version"),
        "manifest_kind": _require_string(payload.get("manifest_kind"), "product_entry_manifest.manifest_kind"),
        "target_domain_id": _require_string(payload.get("target_domain_id"), "product_entry_manifest.target_domain_id"),
        "formal_entry": _clone_mapping(payload.get("formal_entry"), "product_entry_manifest.formal_entry"),
        "workspace_locator": _clone_mapping(payload.get("workspace_locator"), "product_entry_manifest.workspace_locator"),
        "product_entry_shell": _clone_mapping(payload.get("product_entry_shell"), "product_entry_manifest.product_entry_shell"),
        "shared_handoff": _clone_mapping(payload.get("shared_handoff"), "product_entry_manifest.shared_handoff"),
        "product_entry_start": _validate_product_entry_start_surface(
            payload.get("product_entry_start"),
            "product_entry_manifest.product_entry_start",
        ),
        "family_orchestration": _validate_family_orchestration_companion(
            payload.get("family_orchestration"),
            "product_entry_manifest.family_orchestration",
        ),
    }
    for field in (
        "runtime",
        "managed_runtime_contract",
        "repo_mainline",
        "product_entry_status",
        "frontdesk_surface",
        "operator_loop_surface",
        "operator_loop_actions",
    ):
        if payload.get(field) is not None:
            normalized[field] = _clone_mapping(payload.get(field), f"product_entry_manifest.{field}")
    recommended_shell = _read_optional_string_field(
        payload,
        "recommended_shell",
        "product_entry_manifest.recommended_shell",
    )
    if recommended_shell is not None:
        normalized["recommended_shell"] = recommended_shell
    recommended_command = _read_optional_string_field(
        payload,
        "recommended_command",
        "product_entry_manifest.recommended_command",
    )
    if recommended_command is not None:
        normalized["recommended_command"] = recommended_command
    for field in ("runtime_inventory", "task_lifecycle", "skill_catalog", "automation"):
        if payload.get(field) is not None:
            normalized[field] = _clone_mapping(payload.get(field), f"product_entry_manifest.{field}")
    if payload.get("product_entry_overview") is not None:
        normalized["product_entry_overview"] = _validate_product_entry_overview_surface(
            payload.get("product_entry_overview"),
            "product_entry_manifest.product_entry_overview",
        )
    if payload.get("product_entry_preflight") is not None:
        normalized["product_entry_preflight"] = _validate_product_entry_preflight_surface(
            payload.get("product_entry_preflight"),
            "product_entry_manifest.product_entry_preflight",
        )
    if payload.get("product_entry_readiness") is not None:
        normalized["product_entry_readiness"] = _validate_product_entry_readiness_surface(
            payload.get("product_entry_readiness"),
            "product_entry_manifest.product_entry_readiness",
        )
    if payload.get("product_entry_quickstart") is not None:
        normalized["product_entry_quickstart"] = _validate_product_entry_quickstart_surface(
            payload.get("product_entry_quickstart"),
            "product_entry_manifest.product_entry_quickstart",
        )
    remaining_gaps = _optional_string_list(payload.get("remaining_gaps"), "product_entry_manifest.remaining_gaps")
    if remaining_gaps is not None:
        normalized["remaining_gaps"] = remaining_gaps
    notes = _optional_string_list(payload.get("notes"), "product_entry_manifest.notes")
    if notes is not None:
        normalized["notes"] = notes
    if payload.get("schema_ref") is not None or require_contract_bundle:
        normalized["schema_ref"] = _require_string(payload.get("schema_ref"), "product_entry_manifest.schema_ref")
    if payload.get("domain_entry_contract") is not None or require_contract_bundle:
        normalized["domain_entry_contract"] = _validate_domain_entry_contract_shape(
            payload.get("domain_entry_contract"),
            "product_entry_manifest.domain_entry_contract",
        )
    if payload.get("gateway_interaction_contract") is not None or require_contract_bundle:
        normalized["gateway_interaction_contract"] = _validate_gateway_interaction_contract_shape(
            payload.get("gateway_interaction_contract"),
            "product_entry_manifest.gateway_interaction_contract",
        )
    if require_runtime_companions:
        normalized["runtime_inventory"] = _validate_surface_kind_mapping(
            payload.get("runtime_inventory"),
            "product_entry_manifest.runtime_inventory",
            "runtime_inventory",
        )
        normalized["task_lifecycle"] = _validate_surface_kind_mapping(
            payload.get("task_lifecycle"),
            "product_entry_manifest.task_lifecycle",
            "task_lifecycle",
        )
        normalized["skill_catalog"] = _validate_surface_kind_mapping(
            payload.get("skill_catalog"),
            "product_entry_manifest.skill_catalog",
            "skill_catalog",
        )
        normalized["automation"] = _validate_surface_kind_mapping(
            payload.get("automation"),
            "product_entry_manifest.automation",
            "automation",
        )
    return normalized


def validate_family_product_frontdesk(
    value: object,
    *,
    require_contract_bundle: bool = False,
    require_runtime_companions: bool = False,
) -> dict[str, Any]:
    payload = _require_mapping(value, "product_frontdesk")
    normalized: dict[str, Any] = {
        **dict(payload),
        "surface_kind": "product_frontdesk",
        "recommended_action": _require_string(payload.get("recommended_action"), "product_frontdesk.recommended_action"),
        "target_domain_id": _require_string(payload.get("target_domain_id"), "product_frontdesk.target_domain_id"),
        "workspace_locator": _clone_mapping(payload.get("workspace_locator"), "product_frontdesk.workspace_locator"),
        "runtime": _clone_mapping(payload.get("runtime"), "product_frontdesk.runtime"),
        "product_entry_status": _clone_mapping(payload.get("product_entry_status"), "product_frontdesk.product_entry_status"),
        "frontdesk_surface": _clone_mapping(payload.get("frontdesk_surface"), "product_frontdesk.frontdesk_surface"),
        "operator_loop_surface": _clone_mapping(
            payload.get("operator_loop_surface"),
            "product_frontdesk.operator_loop_surface",
        ),
        "operator_loop_actions": _clone_mapping(
            payload.get("operator_loop_actions"),
            "product_frontdesk.operator_loop_actions",
        ),
        "product_entry_start": _validate_product_entry_start_surface(
            payload.get("product_entry_start"),
            "product_frontdesk.product_entry_start",
        ),
        "product_entry_overview": _validate_product_entry_overview_surface(
            payload.get("product_entry_overview"),
            "product_frontdesk.product_entry_overview",
        ),
        "product_entry_preflight": _validate_product_entry_preflight_surface(
            payload.get("product_entry_preflight"),
            "product_frontdesk.product_entry_preflight",
        ),
        "product_entry_readiness": _validate_product_entry_readiness_surface(
            payload.get("product_entry_readiness"),
            "product_frontdesk.product_entry_readiness",
        ),
        "product_entry_quickstart": _validate_product_entry_quickstart_surface(
            payload.get("product_entry_quickstart"),
            "product_frontdesk.product_entry_quickstart",
        ),
        "family_orchestration": _validate_family_orchestration_companion(
            payload.get("family_orchestration"),
            "product_frontdesk.family_orchestration",
        ),
        "product_entry_manifest": validate_family_product_entry_manifest(
            payload.get("product_entry_manifest"),
            require_contract_bundle=require_contract_bundle,
            require_runtime_companions=require_runtime_companions,
        ),
        "entry_surfaces": _clone_mapping(payload.get("entry_surfaces"), "product_frontdesk.entry_surfaces"),
        "summary": _normalize_frontdesk_summary(payload.get("summary"), "product_frontdesk.summary"),
        "notes": _require_string_list(payload.get("notes"), "product_frontdesk.notes"),
    }
    if payload.get("schema_ref") is not None or require_contract_bundle:
        normalized["schema_ref"] = _require_string(payload.get("schema_ref"), "product_frontdesk.schema_ref")
    if payload.get("domain_entry_contract") is not None or require_contract_bundle:
        normalized["domain_entry_contract"] = _validate_domain_entry_contract_shape(
            payload.get("domain_entry_contract"),
            "product_frontdesk.domain_entry_contract",
        )
    if payload.get("gateway_interaction_contract") is not None or require_contract_bundle:
        normalized["gateway_interaction_contract"] = _validate_gateway_interaction_contract_shape(
            payload.get("gateway_interaction_contract"),
            "product_frontdesk.gateway_interaction_contract",
        )
    return normalized
