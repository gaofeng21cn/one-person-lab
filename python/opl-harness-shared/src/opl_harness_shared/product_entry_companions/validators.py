from __future__ import annotations

from typing import Any, Mapping

from .internal import (
    _clone_mapping,
    _normalize_frontdoor_summary,
    _normalize_progress_surface,
    _normalize_resume_contract,
    _normalize_start_mode,
    _normalize_start_resume_surface,
    _normalize_step,
    _non_empty_text,
    _optional_string_list,
    _read_optional_string_field,
    _require_bool,
    _require_int,
    _require_mapping,
    _require_string,
    _require_string_list,
    _validate_domain_entry_contract_shape,
    _validate_family_reference_ref,
    _validate_gateway_interaction_contract_shape,
    _validate_optional_family_reference_ref,
    _validate_shared_handoff,
)
from .shell_surfaces import validate_family_frontdoor_entry_surfaces

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
        "frontdoor_command": _require_string(payload.get("frontdoor_command"), f"{field}.frontdoor_command"),
        "recommended_command": _require_string(payload.get("recommended_command"), f"{field}.recommended_command"),
        "operator_loop_command": _require_string(payload.get("operator_loop_command"), f"{field}.operator_loop_command"),
        "progress_surface": _normalize_progress_surface(payload.get("progress_surface"), f"{field}.progress_surface"),
        "resume_surface": {
            **_normalize_resume_contract(resume_surface, f"{field}.resume_surface"),
            "command": command,
        },
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
        "shared_handoff": _validate_shared_handoff(
            payload.get("shared_handoff"),
            "product_entry_manifest.shared_handoff",
        ),
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
        "frontdoor_surface",
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
    for field in (
        "runtime_inventory",
        "task_lifecycle",
        "session_continuity",
        "progress_projection",
        "artifact_inventory",
        "skill_catalog",
        "automation",
    ):
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
        if payload.get("session_continuity") is not None:
            normalized["session_continuity"] = _validate_surface_kind_mapping(
                payload.get("session_continuity"),
                "product_entry_manifest.session_continuity",
                "session_continuity",
            )
        if payload.get("progress_projection") is not None:
            normalized["progress_projection"] = _validate_surface_kind_mapping(
                payload.get("progress_projection"),
                "product_entry_manifest.progress_projection",
                "progress_projection",
            )
        if payload.get("artifact_inventory") is not None:
            normalized["artifact_inventory"] = _validate_surface_kind_mapping(
                payload.get("artifact_inventory"),
                "product_entry_manifest.artifact_inventory",
                "artifact_inventory",
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


def validate_family_product_frontdoor(
    value: object,
    *,
    require_contract_bundle: bool = False,
    require_runtime_companions: bool = False,
) -> dict[str, Any]:
    payload = _require_mapping(value, "product_frontdoor")
    normalized: dict[str, Any] = {
        **dict(payload),
        "surface_kind": "product_frontdoor",
        "recommended_action": _require_string(payload.get("recommended_action"), "product_frontdoor.recommended_action"),
        "target_domain_id": _require_string(payload.get("target_domain_id"), "product_frontdoor.target_domain_id"),
        "workspace_locator": _clone_mapping(payload.get("workspace_locator"), "product_frontdoor.workspace_locator"),
        "runtime": _clone_mapping(payload.get("runtime"), "product_frontdoor.runtime"),
        "product_entry_status": _clone_mapping(payload.get("product_entry_status"), "product_frontdoor.product_entry_status"),
        "frontdoor_surface": _clone_mapping(payload.get("frontdoor_surface"), "product_frontdoor.frontdoor_surface"),
        "operator_loop_surface": _clone_mapping(
            payload.get("operator_loop_surface"),
            "product_frontdoor.operator_loop_surface",
        ),
        "operator_loop_actions": _clone_mapping(
            payload.get("operator_loop_actions"),
            "product_frontdoor.operator_loop_actions",
        ),
        "product_entry_start": _validate_product_entry_start_surface(
            payload.get("product_entry_start"),
            "product_frontdoor.product_entry_start",
        ),
        "product_entry_overview": _validate_product_entry_overview_surface(
            payload.get("product_entry_overview"),
            "product_frontdoor.product_entry_overview",
        ),
        "product_entry_preflight": _validate_product_entry_preflight_surface(
            payload.get("product_entry_preflight"),
            "product_frontdoor.product_entry_preflight",
        ),
        "product_entry_readiness": _validate_product_entry_readiness_surface(
            payload.get("product_entry_readiness"),
            "product_frontdoor.product_entry_readiness",
        ),
        "product_entry_quickstart": _validate_product_entry_quickstart_surface(
            payload.get("product_entry_quickstart"),
            "product_frontdoor.product_entry_quickstart",
        ),
        "family_orchestration": _validate_family_orchestration_companion(
            payload.get("family_orchestration"),
            "product_frontdoor.family_orchestration",
        ),
        "product_entry_manifest": validate_family_product_entry_manifest(
            payload.get("product_entry_manifest"),
            require_contract_bundle=require_contract_bundle,
            require_runtime_companions=require_runtime_companions,
        ),
        "entry_surfaces": validate_family_frontdoor_entry_surfaces(
            payload.get("entry_surfaces"),
            "product_frontdoor.entry_surfaces",
        ),
        "summary": _normalize_frontdoor_summary(payload.get("summary"), "product_frontdoor.summary"),
        "notes": _require_string_list(payload.get("notes"), "product_frontdoor.notes"),
    }
    if payload.get("schema_ref") is not None or require_contract_bundle:
        normalized["schema_ref"] = _require_string(payload.get("schema_ref"), "product_frontdoor.schema_ref")
    if payload.get("domain_entry_contract") is not None or require_contract_bundle:
        normalized["domain_entry_contract"] = _validate_domain_entry_contract_shape(
            payload.get("domain_entry_contract"),
            "product_frontdoor.domain_entry_contract",
        )
    if payload.get("gateway_interaction_contract") is not None or require_contract_bundle:
        normalized["gateway_interaction_contract"] = _validate_gateway_interaction_contract_shape(
            payload.get("gateway_interaction_contract"),
            "product_frontdoor.gateway_interaction_contract",
        )
    return normalized
