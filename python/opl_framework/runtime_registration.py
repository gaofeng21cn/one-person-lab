from __future__ import annotations

from copy import deepcopy
from collections.abc import Mapping, Sequence
from typing import Any


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise ValueError(f"{field} must be a string list")
    return [_text(item, f"{field}[{index}]") for index, item in enumerate(value)]


def _required_profile(profile: Mapping[str, Any]) -> Mapping[str, Any]:
    profile = _mapping(profile, "profile")
    required = (
        "surface_kind",
        "version",
        "registration_id",
        "manager_surface_id",
        "domain_id",
        "domain_owner",
        "product_status_kind",
        "executor_owner",
        "executor_adapter_owner",
        "executor_adapter_contract",
        "consumable_projection_refs",
        "state_index_inputs",
        "native_helper",
        "family_lifecycle",
        "wakeup_policy",
        "non_goals",
    )
    for field in required:
        if field not in profile:
            raise ValueError(f"profile.{field} is required")
    return profile


def _index_inputs(value: object) -> dict[str, str]:
    inputs = _mapping(value, "profile.state_index_inputs")
    if not inputs:
        raise ValueError("profile.state_index_inputs must not be empty")
    return {
        _text(key, "profile.state_index_inputs.key"): _text(ref, f"profile.state_index_inputs.{key}")
        for key, ref in inputs.items()
    }


def _native_helper(profile: Mapping[str, Any], state_inputs: Mapping[str, str], domain_owner: str) -> dict[str, Any]:
    helper = _mapping(profile, "profile.native_helper")
    indexes = _mapping(helper.get("indexes"), "profile.native_helper.indexes")
    if set(indexes) != set(state_inputs):
        raise ValueError("profile.native_helper.indexes must cover every state_index_inputs key exactly")
    normalized_indexes: dict[str, Any] = {}
    for key, raw in indexes.items():
        entry = _mapping(raw, f"profile.native_helper.indexes.{key}")
        if _text(entry.get("input_ref"), f"profile.native_helper.indexes.{key}.input_ref") != state_inputs[key]:
            raise ValueError(f"profile.native_helper.indexes.{key}.input_ref must match state_index_inputs")
        normalized_indexes[key] = {
            "input_ref": state_inputs[key],
            "source_surface_kind": _text(
                entry.get("source_surface_kind"),
                f"profile.native_helper.indexes.{key}.source_surface_kind",
            ),
            "write_policy": _text(entry.get("write_policy"), f"profile.native_helper.indexes.{key}.write_policy"),
        }
    proof = _mapping(helper.get("proof"), "profile.native_helper.proof")
    covered = _string_list(proof.get("covered_index_keys"), "profile.native_helper.proof.covered_index_keys")
    if set(covered) != set(state_inputs):
        raise ValueError("profile.native_helper.proof.covered_index_keys must cover state_index_inputs")
    return {
        "protocol_ref": _text(helper.get("protocol_ref"), "profile.native_helper.protocol_ref"),
        "managed_by": _text(helper.get("managed_by"), "profile.native_helper.managed_by"),
        "source_of_truth_rule": _text(helper.get("source_of_truth_rule"), "profile.native_helper.source_of_truth_rule"),
        "index_consumption_policy": _text(
            helper.get("index_consumption_policy"),
            "profile.native_helper.index_consumption_policy",
        ),
        "proof_surface": {
            "surface_kind": _text(proof.get("surface_kind"), "profile.native_helper.proof.surface_kind"),
            "version": proof.get("version", 1),
            "proof_id": _text(proof.get("proof_id"), "profile.native_helper.proof.proof_id"),
            "status": _text(proof.get("status"), "profile.native_helper.proof.status"),
            "covered_index_keys": covered,
            "coverage": deepcopy(normalized_indexes),
            "readonly_boundaries": _string_list(
                proof.get("readonly_boundaries"),
                "profile.native_helper.proof.readonly_boundaries",
            ),
            "authoritative_surfaces": _string_list(
                proof.get("authoritative_surfaces"),
                "profile.native_helper.proof.authoritative_surfaces",
            ),
        },
        "authority_boundary": {
            "helper_implementation_owner": _text(helper.get("managed_by"), "profile.native_helper.managed_by"),
            "domain_declares_helper_language_or_binary": False,
            "domain_declares_backing_helper_ids": False,
            "domain_can_write_domain_truth_from_helper": False,
            "domain_quality_or_export_verdict_owner": domain_owner,
        },
        "indexes": normalized_indexes,
    }


def _family_lifecycle(
    profile: Mapping[str, Any],
    runtime_continuity: Mapping[str, Any],
    shell_commands: Mapping[str, str],
    domain_owner: str,
    runtime_owner: str,
    executor_owner: str,
    executor_adapter_owner: str,
) -> dict[str, Any]:
    lifecycle = _mapping(profile, "profile.family_lifecycle")
    contracts = _mapping(lifecycle.get("contract_refs"), "profile.family_lifecycle.contract_refs")
    routes = _mapping(lifecycle.get("route_surfaces"), "profile.family_lifecycle.route_surfaces")
    normalized_routes: dict[str, Any] = {}
    for route_id, raw in routes.items():
        route = _mapping(raw, f"profile.family_lifecycle.route_surfaces.{route_id}")
        command_key = _text(route.get("command_key"), f"profile.family_lifecycle.route_surfaces.{route_id}.command_key")
        if command_key == "recommended_resume_command":
            command = _text(runtime_continuity.get("recommended_resume_command"), "runtime_continuity.recommended_resume_command")
        elif command_key == "recommended_progress_command":
            command = _text(runtime_continuity.get("recommended_progress_command"), "runtime_continuity.recommended_progress_command")
        else:
            command = _text(shell_commands.get(command_key), f"shell_commands.{command_key}")
        normalized_routes[_text(route_id, "profile.family_lifecycle.route_surfaces.key")] = {
            "surface_kind": _text(route.get("surface_kind"), f"profile.family_lifecycle.route_surfaces.{route_id}.surface_kind"),
            "command": command,
            "ref": _text(route.get("ref"), f"profile.family_lifecycle.route_surfaces.{route_id}.ref"),
        }
    persistence_source_refs = _string_list(
        lifecycle.get("persistence_source_refs"),
        "profile.family_lifecycle.persistence_source_refs",
    )
    lifecycle_source_refs = _string_list(
        lifecycle.get("lifecycle_source_refs"),
        "profile.family_lifecycle.lifecycle_source_refs",
    )
    identity_fields = _string_list(lifecycle.get("identity_fields"), "profile.family_lifecycle.identity_fields")
    return {
        "surface_kind": _text(lifecycle.get("surface_kind", "opl_family_lifecycle_adapter"), "profile.family_lifecycle.surface_kind"),
        "version": _text(lifecycle.get("version", "v1"), "profile.family_lifecycle.version"),
        "adapter_id": _text(lifecycle.get("adapter_id"), "profile.family_lifecycle.adapter_id"),
        "contract_refs": deepcopy(dict(contracts)),
        "persistence_projection": {
            "maps_to": _text(lifecycle.get("persistence_maps_to"), "profile.family_lifecycle.persistence_maps_to"),
            "source_surface_refs": persistence_source_refs,
            "identity_fields": identity_fields,
            "write_policy": "opl_index_only_no_domain_truth_writes",
            "sqlite_migration_required": False,
        },
        "lifecycle_projection": {
            "maps_to_opl_contract": _text(lifecycle.get("runtime_attempt_contract"), "profile.family_lifecycle.runtime_attempt_contract"),
            "source_surface_refs": lifecycle_source_refs,
            "required_projection_fields": _string_list(
                lifecycle.get("required_projection_fields"),
                "profile.family_lifecycle.required_projection_fields",
            ),
            "state_mapping": deepcopy(dict(_mapping(lifecycle.get("state_mapping"), "profile.family_lifecycle.state_mapping"))),
        },
        "owner_route_discovery": {
            "discovery_surface_ref": _text(lifecycle.get("discovery_surface_ref"), "profile.family_lifecycle.discovery_surface_ref"),
            "owner_split": {
                "stage_runtime_owner": "one-person-lab",
                "runtime_kernel_owner": runtime_owner,
                "domain_truth_owner": domain_owner,
                "executor_owner": executor_owner,
                "executor_adapter_owner": executor_adapter_owner,
            },
            "route_surface_refs": normalized_routes,
        },
        "adoption_projection": deepcopy(dict(_mapping(lifecycle.get("adoption_projection"), "profile.family_lifecycle.adoption_projection"))),
        "adoption_surface": deepcopy(dict(_mapping(lifecycle.get("adoption_surface"), "profile.family_lifecycle.adoption_surface"))),
        "non_goals": _string_list(lifecycle.get("non_goals"), "profile.family_lifecycle.non_goals"),
    }


def build_stage_runtime_registration(
    *,
    profile: Mapping[str, Any],
    runtime_summary: Mapping[str, Any],
    runtime_continuity: Mapping[str, Any],
    shell_commands: Mapping[str, str],
    skill_catalog_command: str,
) -> dict[str, Any]:
    profile = _required_profile(profile)
    runtime_summary = _mapping(runtime_summary, "runtime_summary")
    runtime_continuity = _mapping(runtime_continuity, "runtime_continuity")
    shell_commands = _mapping(shell_commands, "shell_commands")
    domain_owner = _text(profile["domain_owner"], "profile.domain_owner")
    runtime_owner = _text(runtime_summary.get("runtime_owner"), "runtime_summary.runtime_owner")
    executor_owner = _text(profile["executor_owner"], "profile.executor_owner")
    executor_adapter_owner = _text(profile["executor_adapter_owner"], "profile.executor_adapter_owner")
    state_inputs = _index_inputs(profile["state_index_inputs"])
    executor_contract = deepcopy(dict(_mapping(profile["executor_adapter_contract"], "profile.executor_adapter_contract")))
    if executor_contract.get("fallback_allowed") is not False:
        raise ValueError("profile.executor_adapter_contract.fallback_allowed must be false")
    registration_ref = _text(
        profile.get("registration_ref", "/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration"),
        "profile.registration_ref",
    )
    return {
        "surface_kind": _text(profile["surface_kind"], "profile.surface_kind"),
        "version": _text(profile["version"], "profile.version"),
        "registration_id": _text(profile["registration_id"], "profile.registration_id"),
        "manager_surface_id": _text(profile["manager_surface_id"], "profile.manager_surface_id"),
        "domain_id": _text(profile["domain_id"], "profile.domain_id"),
        "domain_owner": domain_owner,
        "runtime_owner": runtime_owner,
        "executor_owner": executor_owner,
        "executor_adapter_owner": executor_adapter_owner,
        "executor_adapter_contract": executor_contract,
        "domain_entry_surface": {
            "surface_kind": _text(profile["product_status_kind"], "profile.product_status_kind"),
            "command": _text(shell_commands.get("product_status"), "shell_commands.product_status"),
            "manifest_command": _text(skill_catalog_command, "skill_catalog_command"),
        },
        "registration_surface": {
            "surface_kind": "skill_catalog",
            "ref": registration_ref,
            "command": _text(skill_catalog_command, "skill_catalog_command"),
        },
        "consumable_projection_refs": _string_list(
            profile["consumable_projection_refs"],
            "profile.consumable_projection_refs",
        ),
        "state_index_inputs": state_inputs,
        "native_helper_consumption": _native_helper(profile["native_helper"], state_inputs, domain_owner),
        "family_lifecycle_adapter": _family_lifecycle(
            profile["family_lifecycle"],
            runtime_continuity,
            shell_commands,
            domain_owner,
            runtime_owner,
            executor_owner,
            executor_adapter_owner,
        ),
        "resume_contract": {
            "session_locator_field": _text(runtime_continuity.get("session_locator_field"), "runtime_continuity.session_locator_field"),
            "recommended_resume_command": _text(runtime_continuity.get("recommended_resume_command"), "runtime_continuity.recommended_resume_command"),
            "recommended_progress_command": _text(runtime_continuity.get("recommended_progress_command"), "runtime_continuity.recommended_progress_command"),
        },
        "wakeup_boundary": {
            "owner": domain_owner,
            "surface_ref": _text(_mapping(profile["wakeup_policy"], "profile.wakeup_policy").get("surface_ref"), "profile.wakeup_policy.surface_ref"),
            "policy": _text(_mapping(profile["wakeup_policy"], "profile.wakeup_policy").get("policy"), "profile.wakeup_policy.policy"),
        },
        "non_goals": _string_list(profile["non_goals"], "profile.non_goals"),
    }


__all__ = ["build_stage_runtime_registration"]
