from __future__ import annotations

from copy import deepcopy

from opl_harness_shared.product_entry_companions import (
    build_operator_loop_action_catalog,
    build_family_frontdoor_entry_surfaces,
    build_family_product_frontdoor,
    build_family_product_frontdoor_from_manifest,
    build_family_product_entry_manifest,
    build_product_entry_shell_catalog,
    build_product_entry_shell_linked_surface,
    build_product_entry_start,
    build_product_entry_overview,
    build_product_entry_quickstart,
    build_product_entry_readiness,
    build_product_entry_resume_surface,
    build_product_frontdoor,
    collect_family_human_gate_ids,
    validate_family_product_frontdoor,
    validate_family_product_entry_manifest,
)



def test_product_entry_companion_validators_normalize_shared_family_payloads() -> None:
    manifest = {
        "surface_kind": "product_entry_manifest",
        "manifest_version": 2,
        "manifest_kind": "med_auto_grant_product_entry_manifest",
        "target_domain_id": "med-autogrant",
        "formal_entry": {
            "default": "CLI",
            "supported_protocols": ["MCP"],
            "internal_surface": "controller",
        },
        "workspace_locator": {
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        "product_entry_shell": {
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
            }
        },
        "shared_handoff": {
            "opl_handoff_builder": {
                "command": "uv run python -m med_autogrant build-product-entry --entry-mode opl-handoff --format json",
                "entry_mode": "opl-handoff",
            }
        },
        "product_entry_start": {
            "surface_kind": "product_entry_start",
            "summary": "Open the frontdoor first.",
            "recommended_mode_id": "open_frontdoor",
            "modes": [
                {
                    "mode_id": "open_frontdoor",
                    "title": "Open frontdoor",
                    "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdoor",
                    "summary": "Open the direct frontdoor.",
                    "requires": [],
                }
            ],
            "resume_surface": {
                "surface_kind": "grant_user_loop",
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>",
                "session_locator_field": "workspace_id",
            },
            "human_gate_ids": ["alpha_gate"],
        },
        "family_orchestration": {
            "human_gates": [{"gate_id": "alpha_gate"}],
            "resume_contract": {
                "surface_kind": "grant_user_loop",
                "session_locator_field": "workspace_id",
            },
        },
        "schema_ref": "contracts/schemas/v1/product-entry-manifest.schema.json",
        "domain_entry_contract": {
            "entry_adapter": "MedAutoGrantDomainEntry",
            "service_safe_surface_kind": "grant_direct_entry",
            "product_entry_builder_command": "build-product-entry",
            "supported_commands": ["product-frontdoor"],
            "command_contracts": [
                {
                    "command": "product-frontdoor",
                    "required_fields": [],
                    "optional_fields": [],
                }
            ],
        },
        "gateway_interaction_contract": {
            "surface_kind": "gateway_interaction_contract",
            "frontdoor_owner": "opl_gateway_or_domain_gui",
            "user_interaction_mode": "natural_language_frontdoor",
            "user_commands_required": False,
            "command_surfaces_for_agent_consumption_only": True,
            "shared_downstream_entry": "med_auto_grant_product_entry",
            "shared_handoff_envelope": ["workspace_id"],
        },
        "runtime_inventory": {
            "surface_kind": "runtime_inventory",
        },
        "task_lifecycle": {
            "surface_kind": "task_lifecycle",
        },
        "session_continuity": {
            "surface_kind": "session_continuity",
        },
        "progress_projection": {
            "surface_kind": "progress_projection",
        },
        "artifact_inventory": {
            "surface_kind": "artifact_inventory",
        },
        "skill_catalog": {
            "surface_kind": "skill_catalog",
        },
        "automation": {
            "surface_kind": "automation",
        },
        "product_entry_overview": {
            "surface_kind": "product_entry_overview",
            "summary": "Current grant frontdoor is usable.",
            "frontdoor_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "progress_surface": {
                "surface_kind": "grant_progress",
                "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
            },
            "resume_surface": {
                "surface_kind": "grant_user_loop",
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>",
                "session_locator_field": "workspace_id",
            },
            "recommended_step_id": "open_frontdoor",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
            "human_gate_ids": ["alpha_gate"],
        },
        "product_entry_preflight": {
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        "product_entry_readiness": {
            "surface_kind": "product_entry_readiness",
            "verdict": "agent_assisted_ready_not_product_grade",
            "usable_now": True,
            "good_to_use_now": False,
            "fully_automatic": False,
            "summary": "Usable now with operator guidance.",
            "recommended_start_surface": "product_frontdoor",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_loop_surface": "grant_user_loop",
            "recommended_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "blocking_gaps": ["Product-grade shell still pending."],
        },
        "product_entry_quickstart": {
            "surface_kind": "product_entry_quickstart",
            "recommended_step_id": "open_frontdoor",
            "summary": "Open the frontdoor first.",
            "steps": [
                {
                    "step_id": "open_frontdoor",
                    "title": "Open frontdoor",
                    "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdoor",
                    "summary": "Open the direct frontdoor.",
                    "requires": [],
                }
            ],
            "resume_contract": {
                "surface_kind": "grant_user_loop",
                "session_locator_field": "workspace_id",
            },
            "human_gate_ids": ["alpha_gate"],
        },
    }

    validated_manifest = validate_family_product_entry_manifest(
        manifest,
        require_contract_bundle=True,
        require_runtime_companions=True,
    )
    assert validated_manifest["surface_kind"] == "product_entry_manifest"
    assert validated_manifest["product_entry_start"]["resume_surface"]["surface_kind"] == "grant_user_loop"
    assert validated_manifest["domain_entry_contract"]["entry_adapter"] == "MedAutoGrantDomainEntry"
    assert validated_manifest["runtime_inventory"]["surface_kind"] == "runtime_inventory"
    assert validated_manifest["session_continuity"]["surface_kind"] == "session_continuity"
    assert validated_manifest["progress_projection"]["surface_kind"] == "progress_projection"
    assert validated_manifest["artifact_inventory"]["surface_kind"] == "artifact_inventory"

    frontdoor = {
        "surface_kind": "product_frontdoor",
        "recommended_action": "inspect_or_prepare_grant_loop",
        "target_domain_id": "med-autogrant",
        "workspace_locator": {
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        "runtime": {
            "runtime_owner": "upstream_hermes_agent",
        },
        "product_entry_status": {
            "summary": "Current grant frontdoor is usable.",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
        },
        "frontdoor_surface": {
            "surface_kind": "product_frontdoor",
            "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
        },
        "operator_loop_surface": {
            "surface_kind": "grant_user_loop",
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        "operator_loop_actions": {},
        "product_entry_start": manifest["product_entry_start"],
        "product_entry_overview": manifest["product_entry_overview"],
        "product_entry_preflight": manifest["product_entry_preflight"],
        "product_entry_readiness": manifest["product_entry_readiness"],
        "product_entry_quickstart": manifest["product_entry_quickstart"],
        "family_orchestration": manifest["family_orchestration"],
        "product_entry_manifest": manifest,
        "entry_surfaces": {},
        "summary": {
            "frontdoor_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        "notes": ["Thin frontdoor adapter is active."],
        "schema_ref": "contracts/schemas/v1/product-frontdoor.schema.json",
        "domain_entry_contract": manifest["domain_entry_contract"],
        "gateway_interaction_contract": manifest["gateway_interaction_contract"],
    }

    validated_frontdoor = validate_family_product_frontdoor(
        frontdoor,
        require_contract_bundle=True,
    )
    assert validated_frontdoor["surface_kind"] == "product_frontdoor"
    assert validated_frontdoor["product_entry_manifest"]["surface_kind"] == "product_entry_manifest"
    assert validated_frontdoor["gateway_interaction_contract"]["frontdoor_owner"] == "opl_gateway_or_domain_gui"


def test_product_entry_companion_validators_fail_closed_on_missing_required_shared_fields() -> None:
    manifest = {
        "surface_kind": "product_entry_manifest",
        "manifest_version": 2,
        "manifest_kind": "med_auto_grant_product_entry_manifest",
        "target_domain_id": "med-autogrant",
        "formal_entry": {
            "default": "CLI",
            "supported_protocols": ["MCP"],
            "internal_surface": "controller",
        },
        "workspace_locator": {
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        "product_entry_shell": {
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
            }
        },
        "shared_handoff": {
            "opl_handoff_builder": {
                "command": "uv run python -m med_autogrant build-product-entry --entry-mode opl-handoff --format json",
                "entry_mode": "opl-handoff",
            }
        },
        "product_entry_start": {
            "surface_kind": "product_entry_start",
            "summary": "Open the frontdoor first.",
            "recommended_mode_id": "open_frontdoor",
            "modes": [
                {
                    "mode_id": "open_frontdoor",
                    "title": "Open frontdoor",
                    "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdoor",
                    "summary": "Open the direct frontdoor.",
                    "requires": [],
                }
            ],
            "resume_surface": {
                "surface_kind": "grant_user_loop",
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>",
                "session_locator_field": "workspace_id",
            },
            "human_gate_ids": ["alpha_gate"],
        },
        "family_orchestration": {
            "human_gates": [{"gate_id": "alpha_gate"}],
            "resume_contract": {
                "surface_kind": "grant_user_loop",
                "session_locator_field": "workspace_id",
            },
        },
        "schema_ref": "contracts/schemas/v1/product-entry-manifest.schema.json",
        "domain_entry_contract": {
            "entry_adapter": "MedAutoGrantDomainEntry",
            "service_safe_surface_kind": "grant_direct_entry",
            "product_entry_builder_command": "build-product-entry",
            "supported_commands": ["product-frontdoor"],
            "command_contracts": [
                {
                    "command": "product-frontdoor",
                    "required_fields": [],
                    "optional_fields": [],
                }
            ],
        },
        "gateway_interaction_contract": {
            "surface_kind": "gateway_interaction_contract",
            "frontdoor_owner": "opl_gateway_or_domain_gui",
            "user_interaction_mode": "natural_language_frontdoor",
            "user_commands_required": False,
            "command_surfaces_for_agent_consumption_only": True,
            "shared_downstream_entry": "med_auto_grant_product_entry",
            "shared_handoff_envelope": ["workspace_id"],
        },
        "runtime_inventory": {
            "surface_kind": "runtime_inventory",
        },
        "task_lifecycle": {
            "surface_kind": "task_lifecycle",
        },
        "session_continuity": {
            "surface_kind": "session_continuity",
        },
        "progress_projection": {
            "surface_kind": "progress_projection",
        },
        "artifact_inventory": {
            "surface_kind": "artifact_inventory",
        },
        "skill_catalog": {
            "surface_kind": "skill_catalog",
        },
        "automation": {
            "surface_kind": "automation",
        },
    }

    missing_schema_ref = deepcopy(manifest)
    del missing_schema_ref["schema_ref"]
    try:
        validate_family_product_entry_manifest(
            missing_schema_ref,
            require_contract_bundle=True,
        )
    except ValueError as exc:
        assert "schema_ref" in str(exc)
    else:
        raise AssertionError("expected missing schema_ref to fail closed")

    wrong_runtime_inventory = deepcopy(manifest)
    wrong_runtime_inventory["runtime_inventory"]["surface_kind"] = "runtime_inventory_preview"
    try:
        validate_family_product_entry_manifest(
            wrong_runtime_inventory,
            require_runtime_companions=True,
        )
    except ValueError as exc:
        assert "runtime_inventory.surface_kind" in str(exc)
    else:
        raise AssertionError("expected wrong runtime_inventory surface kind to fail closed")

    wrong_session_continuity = deepcopy(manifest)
    wrong_session_continuity["session_continuity"]["surface_kind"] = "session_continuity_preview"
    try:
        validate_family_product_entry_manifest(
            wrong_session_continuity,
            require_runtime_companions=True,
        )
    except ValueError as exc:
        assert "session_continuity.surface_kind" in str(exc)
    else:
        raise AssertionError("expected wrong session_continuity surface kind to fail closed")

    frontdoor = {
        "surface_kind": "product_frontdoor",
        "recommended_action": "inspect_or_prepare_grant_loop",
        "target_domain_id": "med-autogrant",
        "workspace_locator": {
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        "runtime": {
            "runtime_owner": "upstream_hermes_agent",
        },
        "product_entry_status": {
            "summary": "Current grant frontdoor is usable.",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
        },
        "frontdoor_surface": {
            "surface_kind": "product_frontdoor",
            "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
        },
        "operator_loop_surface": {
            "surface_kind": "grant_user_loop",
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        "operator_loop_actions": {},
        "product_entry_start": manifest["product_entry_start"],
        "product_entry_overview": {
            "surface_kind": "product_entry_overview",
            "summary": "Current grant frontdoor is usable.",
            "frontdoor_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "progress_surface": {
                "surface_kind": "grant_progress",
                "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
            },
            "resume_surface": manifest["product_entry_start"]["resume_surface"],
            "recommended_step_id": "open_frontdoor",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
            "human_gate_ids": ["alpha_gate"],
        },
        "product_entry_preflight": {
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        "product_entry_readiness": {
            "surface_kind": "product_entry_readiness",
            "verdict": "agent_assisted_ready_not_product_grade",
            "usable_now": True,
            "good_to_use_now": False,
            "fully_automatic": False,
            "summary": "Usable now with operator guidance.",
            "recommended_start_surface": "product_frontdoor",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_loop_surface": "grant_user_loop",
            "recommended_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "blocking_gaps": ["Product-grade shell still pending."],
        },
        "product_entry_quickstart": {
            "surface_kind": "product_entry_quickstart",
            "recommended_step_id": "open_frontdoor",
            "summary": "Open the frontdoor first.",
            "steps": [
                {
                    "step_id": "open_frontdoor",
                    "title": "Open frontdoor",
                    "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdoor",
                    "summary": "Open the direct frontdoor.",
                    "requires": [],
                }
            ],
            "resume_contract": manifest["family_orchestration"]["resume_contract"],
            "human_gate_ids": ["alpha_gate"],
        },
        "family_orchestration": manifest["family_orchestration"],
        "product_entry_manifest": manifest,
        "entry_surfaces": {},
        "summary": {
            "frontdoor_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        "notes": ["Thin frontdoor adapter is active."],
        "schema_ref": "contracts/schemas/v1/product-frontdoor.schema.json",
        "domain_entry_contract": manifest["domain_entry_contract"],
    }

    try:
        validate_family_product_frontdoor(
            frontdoor,
            require_contract_bundle=True,
        )
    except ValueError as exc:
        assert "gateway_interaction_contract" in str(exc)
    else:
        raise AssertionError("expected missing gateway_interaction_contract to fail closed")
