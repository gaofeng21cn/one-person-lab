from __future__ import annotations

from typing import Any, Mapping

from .internal import (
    _clone_mapping,
    _merge_extra_payload,
    _non_empty_text,
    _normalize_frontdesk_summary,
    _normalize_frontdoor_summary,
    _normalize_progress_surface,
    _normalize_resume_contract,
    _normalize_start_mode,
    _normalize_start_resume_surface,
    _normalize_step,
    _optional_string_list,
    _require_bool,
    _require_int,
    _require_mapping,
    _require_string,
    _require_string_list,
    _validate_shared_handoff,
)
from .shell_surfaces import (
    build_family_frontdesk_entry_surfaces,
    build_family_frontdoor_entry_surfaces,
    validate_family_frontdesk_entry_surfaces,
    validate_family_frontdoor_entry_surfaces,
)
from .validators import (
    _validate_family_orchestration_companion,
    validate_family_product_entry_manifest,
    validate_family_product_frontdesk,
    validate_family_product_frontdoor,
)

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
    recommended_command: str,
    operator_loop_command: str,
    progress_surface: Mapping[str, Any],
    resume_surface: Mapping[str, Any],
    recommended_step_id: str,
    next_focus: list[str],
    remaining_gaps_count: int,
    human_gate_ids: list[str],
    frontdoor_command: str | None = None,
    frontdesk_command: str | None = None,
) -> dict[str, Any]:
    resolved_frontdoor_command = _non_empty_text(frontdoor_command)
    resolved_frontdesk_command = _non_empty_text(frontdesk_command)
    if resolved_frontdoor_command is None and resolved_frontdesk_command is None:
        raise ValueError("product entry overview 必须提供 frontdoor_command 或 frontdesk_command")
    payload: dict[str, Any] = {
        "surface_kind": "product_entry_overview",
        "summary": _require_string(summary, "summary"),
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
    if resolved_frontdoor_command is not None:
        payload["frontdoor_command"] = resolved_frontdoor_command
    if resolved_frontdesk_command is not None:
        payload["frontdesk_command"] = resolved_frontdesk_command
    return payload


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


def build_product_frontdoor(
    *,
    recommended_action: str,
    target_domain_id: str,
    workspace_locator: Mapping[str, Any],
    runtime: Mapping[str, Any],
    product_entry_status: Mapping[str, Any],
    frontdoor_surface: Mapping[str, Any],
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
        "surface_kind": "product_frontdoor",
        "recommended_action": _require_string(recommended_action, "recommended_action"),
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "workspace_locator": _clone_mapping(workspace_locator, "workspace_locator"),
        "runtime": _clone_mapping(runtime, "runtime"),
        "product_entry_status": _clone_mapping(product_entry_status, "product_entry_status"),
        "frontdoor_surface": _clone_mapping(frontdoor_surface, "frontdoor_surface"),
        "operator_loop_surface": _clone_mapping(operator_loop_surface, "operator_loop_surface"),
        "operator_loop_actions": _clone_mapping(operator_loop_actions, "operator_loop_actions"),
        "product_entry_start": _clone_mapping(product_entry_start, "product_entry_start"),
        "product_entry_overview": _clone_mapping(product_entry_overview, "product_entry_overview"),
        "product_entry_preflight": _clone_mapping(product_entry_preflight, "product_entry_preflight"),
        "product_entry_readiness": _clone_mapping(product_entry_readiness, "product_entry_readiness"),
        "product_entry_quickstart": _clone_mapping(product_entry_quickstart, "product_entry_quickstart"),
        "family_orchestration": _clone_mapping(family_orchestration, "family_orchestration"),
        "product_entry_manifest": _clone_mapping(product_entry_manifest, "product_entry_manifest"),
        "entry_surfaces": validate_family_frontdoor_entry_surfaces(entry_surfaces, "entry_surfaces"),
        "summary": _normalize_frontdoor_summary(summary, "summary"),
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
    return _merge_extra_payload(payload, extra_payload, surface_kind="product frontdoor")


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
        "entry_surfaces": validate_family_frontdesk_entry_surfaces(entry_surfaces, "entry_surfaces"),
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


def build_family_product_frontdoor(
    *,
    recommended_action: str,
    product_entry_manifest: Mapping[str, Any],
    entry_surfaces: Mapping[str, Any],
    notes: list[str],
    schema_ref: str | None = None,
    domain_entry_contract: Mapping[str, Any] | None = None,
    gateway_interaction_contract: Mapping[str, Any] | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    manifest = _clone_mapping(product_entry_manifest, "product_entry_manifest")
    frontdoor_surface = _clone_mapping(
        manifest.get("frontdoor_surface"),
        "product_entry_manifest.frontdoor_surface",
    )
    operator_loop_surface = _clone_mapping(
        manifest.get("operator_loop_surface"),
        "product_entry_manifest.operator_loop_surface",
    )
    return build_product_frontdoor(
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
        frontdoor_surface=frontdoor_surface,
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
        entry_surfaces=validate_family_frontdoor_entry_surfaces(entry_surfaces, "entry_surfaces"),
        summary={
            "frontdoor_command": _require_string(
                frontdoor_surface.get("command"),
                "product_entry_manifest.frontdoor_surface.command",
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
        schema_ref=_non_empty_text(schema_ref) or _non_empty_text(manifest.get("schema_ref")),
        domain_entry_contract=(
            _clone_mapping(domain_entry_contract, "domain_entry_contract")
            if isinstance(domain_entry_contract, Mapping)
            else _clone_mapping(manifest.get("domain_entry_contract"), "product_entry_manifest.domain_entry_contract")
            if isinstance(manifest.get("domain_entry_contract"), Mapping)
            else None
        ),
        gateway_interaction_contract=(
            _clone_mapping(gateway_interaction_contract, "gateway_interaction_contract")
            if isinstance(gateway_interaction_contract, Mapping)
            else _clone_mapping(
                manifest.get("gateway_interaction_contract"),
                "product_entry_manifest.gateway_interaction_contract",
            )
            if isinstance(manifest.get("gateway_interaction_contract"), Mapping)
            else None
        ),
        extra_payload=extra_payload,
    )


def build_family_product_frontdesk(
    *,
    recommended_action: str,
    product_entry_manifest: Mapping[str, Any],
    entry_surfaces: Mapping[str, Any],
    notes: list[str],
    schema_ref: str | None = None,
    domain_entry_contract: Mapping[str, Any] | None = None,
    gateway_interaction_contract: Mapping[str, Any] | None = None,
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
        entry_surfaces=validate_family_frontdesk_entry_surfaces(entry_surfaces, "entry_surfaces"),
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
        schema_ref=_non_empty_text(schema_ref) or _non_empty_text(manifest.get("schema_ref")),
        domain_entry_contract=(
            _clone_mapping(domain_entry_contract, "domain_entry_contract")
            if isinstance(domain_entry_contract, Mapping)
            else _clone_mapping(manifest.get("domain_entry_contract"), "product_entry_manifest.domain_entry_contract")
            if isinstance(manifest.get("domain_entry_contract"), Mapping)
            else None
        ),
        gateway_interaction_contract=(
            _clone_mapping(gateway_interaction_contract, "gateway_interaction_contract")
            if isinstance(gateway_interaction_contract, Mapping)
            else _clone_mapping(
                manifest.get("gateway_interaction_contract"),
                "product_entry_manifest.gateway_interaction_contract",
            )
            if isinstance(manifest.get("gateway_interaction_contract"), Mapping)
            else None
        ),
        extra_payload=extra_payload,
    )


def build_family_product_frontdoor_from_manifest(
    *,
    recommended_action: str,
    product_entry_manifest: Mapping[str, Any],
    shell_aliases: Mapping[str, str],
    notes: list[str],
    schema_ref: str | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    manifest = validate_family_product_entry_manifest(product_entry_manifest)
    return build_family_product_frontdoor(
        recommended_action=_require_string(recommended_action, "recommended_action"),
        product_entry_manifest=manifest,
        entry_surfaces=build_family_frontdoor_entry_surfaces(
            product_entry_shell=_clone_mapping(
                manifest.get("product_entry_shell"),
                "product_entry_manifest.product_entry_shell",
            ),
            shell_aliases=shell_aliases,
            shared_handoff=_clone_mapping(
                manifest.get("shared_handoff"),
                "product_entry_manifest.shared_handoff",
            ),
        ),
        notes=_require_string_list(notes, "notes"),
        schema_ref=_non_empty_text(schema_ref) or _non_empty_text(manifest.get("schema_ref")),
        extra_payload=extra_payload,
    )


def build_family_product_frontdesk_from_manifest(
    *,
    recommended_action: str,
    product_entry_manifest: Mapping[str, Any],
    shell_aliases: Mapping[str, str],
    notes: list[str],
    schema_ref: str | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    manifest = validate_family_product_entry_manifest(product_entry_manifest)
    return build_family_product_frontdesk(
        recommended_action=_require_string(recommended_action, "recommended_action"),
        product_entry_manifest=manifest,
        entry_surfaces=build_family_frontdesk_entry_surfaces(
            product_entry_shell=_clone_mapping(
                manifest.get("product_entry_shell"),
                "product_entry_manifest.product_entry_shell",
            ),
            shell_aliases=shell_aliases,
            shared_handoff=_clone_mapping(
                manifest.get("shared_handoff"),
                "product_entry_manifest.shared_handoff",
            ),
        ),
        notes=_require_string_list(notes, "notes"),
        schema_ref=_non_empty_text(schema_ref) or _non_empty_text(manifest.get("schema_ref")),
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
    frontdoor_surface: Mapping[str, Any] | None = None,
    operator_loop_surface: Mapping[str, Any] | None = None,
    operator_loop_actions: Mapping[str, Any] | None = None,
    recommended_shell: str | None = None,
    recommended_command: str | None = None,
    runtime_inventory: Mapping[str, Any] | None = None,
    task_lifecycle: Mapping[str, Any] | None = None,
    session_continuity: Mapping[str, Any] | None = None,
    progress_projection: Mapping[str, Any] | None = None,
    artifact_inventory: Mapping[str, Any] | None = None,
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
        "shared_handoff": _validate_shared_handoff(shared_handoff, "shared_handoff"),
        "product_entry_start": _clone_mapping(product_entry_start, "product_entry_start"),
        "family_orchestration": _clone_mapping(family_orchestration, "family_orchestration"),
    }

    for key, value in (
        ("runtime", runtime),
        ("managed_runtime_contract", managed_runtime_contract),
        ("repo_mainline", repo_mainline),
        ("product_entry_status", product_entry_status),
        ("frontdesk_surface", frontdesk_surface),
        ("frontdoor_surface", frontdoor_surface),
        ("operator_loop_surface", operator_loop_surface),
        ("operator_loop_actions", operator_loop_actions),
        ("runtime_inventory", runtime_inventory),
        ("task_lifecycle", task_lifecycle),
        ("session_continuity", session_continuity),
        ("progress_projection", progress_projection),
        ("artifact_inventory", artifact_inventory),
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
