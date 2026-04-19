from __future__ import annotations

from copy import deepcopy

from opl_harness_shared.product_entry_companions import (
    build_family_frontdesk_entry_surfaces,
    build_family_product_frontdesk,
    build_family_product_entry_manifest,
    build_product_entry_start,
    build_product_entry_overview,
    build_product_entry_quickstart,
    build_product_entry_readiness,
    build_product_entry_resume_surface,
    build_product_frontdesk,
    collect_family_human_gate_ids,
    validate_family_product_frontdesk,
    validate_family_product_entry_manifest,
)


def test_collect_family_human_gate_ids_and_build_helpers() -> None:
    family_orchestration = {
        "human_gates": [
            {"gate_id": "alpha_gate", "title": "Alpha gate"},
            {"gate_id": "beta_gate", "title": "Beta gate"},
        ],
        "resume_contract": {
            "surface_kind": "grant_user_loop",
            "session_locator_field": "workspace_id",
            "checkpoint_locator_field": "checkpoint_status",
        },
    }

    human_gate_ids = collect_family_human_gate_ids(family_orchestration)
    assert human_gate_ids == ["alpha_gate", "beta_gate"]

    resume_surface = build_product_entry_resume_surface(
        command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>",
        resume_contract=family_orchestration["resume_contract"],
    )
    assert resume_surface["surface_kind"] == "grant_user_loop"
    assert resume_surface["session_locator_field"] == "workspace_id"

    quickstart = build_product_entry_quickstart(
        summary="Open the frontdesk first.",
        recommended_step_id="open_frontdesk",
        steps=[
            {
                "step_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_contract=family_orchestration["resume_contract"],
        human_gate_ids=human_gate_ids,
    )
    assert quickstart["recommended_step_id"] == "open_frontdesk"
    assert quickstart["human_gate_ids"] == human_gate_ids

    start_without_resume_command = build_product_entry_start(
        summary="Open the frontdesk first, then choose the durable continuation mode.",
        recommended_mode_id="open_frontdesk",
        modes=[
            {
                "mode_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            },
            {
                "mode_id": "continue_loop",
                "title": "Continue loop",
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current loop.",
                "requires": ["task_intent"],
            },
        ],
        resume_surface=family_orchestration["resume_contract"],
        human_gate_ids=human_gate_ids,
    )
    assert start_without_resume_command["surface_kind"] == "product_entry_start"
    assert start_without_resume_command["resume_surface"]["surface_kind"] == "grant_user_loop"
    assert start_without_resume_command["resume_surface"]["session_locator_field"] == "workspace_id"
    assert "command" not in start_without_resume_command["resume_surface"]

    start_with_resume_command = build_product_entry_start(
        summary="Open the frontdesk first, then resume the same loop.",
        recommended_mode_id="open_frontdesk",
        modes=start_without_resume_command["modes"],
        resume_surface=resume_surface,
        human_gate_ids=human_gate_ids,
    )
    assert (
        start_with_resume_command["resume_surface"]["command"]
        == "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>"
    )

    overview = build_product_entry_overview(
        summary="Current grant frontdoor is usable.",
        frontdesk_command="uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
        recommended_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        operator_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        progress_surface={
            "surface_kind": "grant_progress",
            "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
            "step_id": "inspect_progress",
        },
        resume_surface=resume_surface,
        recommended_step_id=quickstart["recommended_step_id"],
        next_focus=["Keep the frontdoor stable."],
        remaining_gaps_count=1,
        human_gate_ids=human_gate_ids,
    )
    assert overview["resume_surface"]["checkpoint_locator_field"] == "checkpoint_status"
    assert overview["human_gate_ids"] == human_gate_ids

    readiness = build_product_entry_readiness(
        verdict="agent_assisted_ready_not_product_grade",
        usable_now=True,
        good_to_use_now=False,
        fully_automatic=False,
        summary="Usable for agent-assisted authoring.",
        recommended_start_surface="product_frontdesk",
        recommended_start_command="uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
        recommended_loop_surface="grant_user_loop",
        recommended_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        blocking_gaps=["Polished product UI is still pending."],
    )
    assert readiness["verdict"] == "agent_assisted_ready_not_product_grade"
    assert readiness["blocking_gaps"] == ["Polished product UI is still pending."]

    frontdesk = build_product_frontdesk(
        recommended_action="inspect_or_prepare_grant_loop",
        target_domain_id="med-autogrant",
        workspace_locator={
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        runtime={
            "runtime_owner": "upstream_hermes_agent",
            "runtime_state_root": "/tmp/runtime-state",
        },
        product_entry_status={
            "summary": "Current grant frontdoor is usable.",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
        },
        frontdesk_surface={
            "shell_key": "product_frontdesk",
            "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdesk",
            "summary": "Open the direct frontdoor.",
        },
        operator_loop_surface={
            "shell_key": "grant_user_loop",
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "surface_kind": "grant_user_loop",
            "summary": "Continue the current authoring loop.",
        },
        operator_loop_actions={
            "open_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current authoring loop.",
                "requires": ["task_intent"],
            }
        },
        product_entry_start=start_with_resume_command,
        product_entry_overview=overview,
        product_entry_preflight={
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        product_entry_readiness=readiness,
        product_entry_quickstart=quickstart,
        family_orchestration=family_orchestration,
        product_entry_manifest={
            "surface_kind": "product_entry_manifest",
            "target_domain_id": "med-autogrant",
        },
        entry_surfaces={
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            }
        },
        summary={
            "frontdesk_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        notes=["Shared frontdesk core is active."],
        extra_payload={
            "ok": True,
            "command": "product-frontdesk",
        },
    )
    assert frontdesk["surface_kind"] == "product_frontdesk"
    assert frontdesk["ok"] is True
    assert frontdesk["command"] == "product-frontdesk"
    assert frontdesk["product_entry_start"]["recommended_mode_id"] == "open_frontdesk"

    manifest = build_family_product_entry_manifest(
        manifest_kind="med_auto_grant_product_entry_manifest",
        target_domain_id="med-autogrant",
        formal_entry={
            "default": "CLI",
            "supported_protocols": ["MCP"],
            "internal_surface": "controller",
        },
        workspace_locator={
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        runtime={
            "runtime_owner": "upstream_hermes_agent",
        },
        product_entry_status={
            "summary": "Current grant frontdoor is usable.",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
        },
        frontdesk_surface={
            "shell_key": "product_frontdesk",
            "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdesk",
            "summary": "Open the direct frontdoor.",
        },
        operator_loop_surface={
            "shell_key": "grant_user_loop",
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "surface_kind": "grant_user_loop",
            "summary": "Continue the current authoring loop.",
        },
        operator_loop_actions={
            "open_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current authoring loop.",
                "requires": ["task_intent"],
            }
        },
        recommended_shell="grant_user_loop",
        recommended_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        product_entry_shell={
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            }
        },
        shared_handoff={
            "opl_handoff_builder": {
                "command": "uv run python -m med_autogrant build-product-entry --entry-mode opl-handoff --format json",
                "entry_mode": "opl-handoff",
            }
        },
        product_entry_start=start_with_resume_command,
        product_entry_overview=overview,
        product_entry_preflight={
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        product_entry_readiness=readiness,
        product_entry_quickstart=quickstart,
        family_orchestration=family_orchestration,
        runtime_inventory={
            "surface_kind": "runtime_inventory",
            "summary": "Runtime inventory is shared.",
        },
        task_lifecycle={
            "surface_kind": "task_lifecycle",
            "summary": "Task lifecycle is shared.",
        },
        skill_catalog={
            "surface_kind": "skill_catalog",
            "summary": "Skill catalog is shared.",
        },
        automation={
            "surface_kind": "automation",
            "summary": "Automation is shared.",
            "automations": [
                {
                    "surface_kind": "automation_descriptor",
                    "automation_id": "mag_runtime_supervision",
                }
            ],
        },
        remaining_gaps=["Polished product UI is still pending."],
        notes=["Shared manifest shell is active."],
        extra_payload={
            "current_truth": {
                "product_entry_contract": "contracts/runtime-program/current-program.json",
            }
        },
    )
    assert manifest["surface_kind"] == "product_entry_manifest"
    assert manifest["manifest_version"] == 2
    assert manifest["current_truth"]["product_entry_contract"] == "contracts/runtime-program/current-program.json"
    assert manifest["product_entry_start"]["recommended_mode_id"] == "open_frontdesk"

    try:
        build_family_product_entry_manifest(
            manifest_kind="med_auto_grant_product_entry_manifest",
            target_domain_id="med-autogrant",
            formal_entry={
                "default": "CLI",
                "supported_protocols": ["MCP"],
            },
            workspace_locator={
                "workspace_surface_kind": "med_autogrant_workspace",
                "workspace_root": "/tmp/workspace.json",
            },
            product_entry_shell={
                "frontdesk": {
                    "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                }
            },
            shared_handoff={
                "opl_handoff_builder": {
                    "command": "uv run python -m med_autogrant build-product-entry --entry-mode opl-handoff --format json",
                    "entry_mode": "opl-handoff",
                }
            },
            product_entry_start=start_with_resume_command,
            family_orchestration=family_orchestration,
            extra_payload={"target_domain_id": "override"},
        )
    except ValueError as exc:
        assert "extra_payload 不允许覆盖核心字段" in str(exc)
    else:
        raise AssertionError("expected build_family_product_entry_manifest to reject overriding core fields")


def test_build_family_product_frontdesk_projects_manifest_core() -> None:
    family_orchestration = {
        "human_gates": [{"gate_id": "alpha_gate", "title": "Alpha gate"}],
        "resume_contract": {
            "surface_kind": "grant_user_loop",
            "session_locator_field": "workspace_id",
            "checkpoint_locator_field": "checkpoint_status",
        },
    }
    start = build_product_entry_start(
        summary="Open the frontdesk first.",
        recommended_mode_id="open_frontdesk",
        modes=[
            {
                "mode_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_surface=family_orchestration["resume_contract"],
        human_gate_ids=["alpha_gate"],
    )
    quickstart = build_product_entry_quickstart(
        summary="Open the frontdesk first.",
        recommended_step_id="open_frontdesk",
        steps=[
            {
                "step_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_contract=family_orchestration["resume_contract"],
        human_gate_ids=["alpha_gate"],
    )
    overview = build_product_entry_overview(
        summary="Current grant frontdoor is usable.",
        frontdesk_command="uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
        recommended_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        operator_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        progress_surface={
            "surface_kind": "grant_progress",
            "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
            "step_id": "inspect_progress",
        },
        resume_surface={
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent>",
            **family_orchestration["resume_contract"],
        },
        recommended_step_id="open_frontdesk",
        next_focus=["Keep the frontdoor stable."],
        remaining_gaps_count=1,
        human_gate_ids=["alpha_gate"],
    )
    readiness = build_product_entry_readiness(
        verdict="agent_assisted_ready_not_product_grade",
        usable_now=True,
        good_to_use_now=False,
        fully_automatic=False,
        summary="Usable now with operator guidance.",
        recommended_start_surface="product_frontdesk",
        recommended_start_command="uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
        recommended_loop_surface="grant_user_loop",
        recommended_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        blocking_gaps=["Product-grade shell still pending."],
    )
    manifest = build_family_product_entry_manifest(
        manifest_kind="med_auto_grant_product_entry_manifest",
        target_domain_id="med-autogrant",
        formal_entry={
            "default": "CLI",
            "supported_protocols": ["MCP"],
            "internal_surface": "controller",
        },
        workspace_locator={
            "workspace_surface_kind": "med_autogrant_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        runtime={
            "runtime_owner": "upstream_hermes_agent",
            "runtime_state_root": "/tmp/runtime-state",
        },
        product_entry_status={
            "summary": "Current grant frontdoor is usable.",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
        },
        frontdesk_surface={
            "shell_key": "product_frontdesk",
            "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdesk",
            "summary": "Open the direct frontdoor.",
        },
        operator_loop_surface={
            "shell_key": "grant_user_loop",
            "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "surface_kind": "grant_user_loop",
            "summary": "Continue the current authoring loop.",
        },
        operator_loop_actions={
            "open_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current authoring loop.",
                "requires": ["task_intent"],
            }
        },
        recommended_shell="grant_user_loop",
        recommended_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        product_entry_shell={
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
            },
            "grant_user_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
            },
        },
        shared_handoff={
            "opl_handoff_builder": {
                "command": "uv run python -m med_autogrant build-product-entry --entry-mode opl-handoff --format json",
                "entry_mode": "opl-handoff",
            }
        },
        product_entry_start=start,
        product_entry_overview=overview,
        product_entry_preflight={
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        product_entry_readiness=readiness,
        product_entry_quickstart=quickstart,
        family_orchestration=family_orchestration,
    )

    frontdesk = build_family_product_frontdesk(
        recommended_action="inspect_or_prepare_grant_loop",
        product_entry_manifest=manifest,
        entry_surfaces={
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json"
            },
            "grant_user_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json"
            },
        },
        notes=["Thin frontdesk adapter is active."],
        schema_ref="contracts/schemas/v1/product-frontdesk.schema.json",
        extra_payload={"ok": True},
    )

    assert frontdesk["surface_kind"] == "product_frontdesk"
    assert frontdesk["ok"] is True
    assert frontdesk["target_domain_id"] == "med-autogrant"
    assert frontdesk["schema_ref"] == "contracts/schemas/v1/product-frontdesk.schema.json"
    assert (
        frontdesk["summary"]["frontdesk_command"]
        == "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json"
    )
    assert (
        frontdesk["summary"]["recommended_command"]
        == "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json"
    )


def test_build_family_frontdesk_entry_surfaces_projects_shell_aliases_and_shared_handoff() -> None:
    entry_surfaces = build_family_frontdesk_entry_surfaces(
        product_entry_shell={
            "product_frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
            },
            "grant_user_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
            },
        },
        shell_aliases={
            "frontdesk": "product_frontdesk",
            "grant_user_loop": "grant_user_loop",
        },
        shared_handoff={
            "direct_entry_builder": {
                "command": "uv run python -m med_autogrant build-product-entry --entry-mode direct --format json",
                "entry_mode": "direct",
            },
            "opl_return_surface": {
                "surface_kind": "product_entry",
                "target_domain_id": "med-autogrant",
            },
        },
    )

    assert (
        entry_surfaces["frontdesk"]["command"]
        == "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json"
    )
    assert entry_surfaces["grant_user_loop"]["surface_kind"] == "grant_user_loop"
    assert entry_surfaces["direct_entry_builder"]["entry_mode"] == "direct"
    assert "opl_return_surface" not in entry_surfaces


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
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
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
            "summary": "Open the frontdesk first.",
            "recommended_mode_id": "open_frontdesk",
            "modes": [
                {
                    "mode_id": "open_frontdesk",
                    "title": "Open frontdesk",
                    "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdesk",
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
            "supported_commands": ["product-frontdesk"],
            "command_contracts": [
                {
                    "command": "product-frontdesk",
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
        "skill_catalog": {
            "surface_kind": "skill_catalog",
        },
        "automation": {
            "surface_kind": "automation",
        },
        "product_entry_overview": {
            "surface_kind": "product_entry_overview",
            "summary": "Current grant frontdoor is usable.",
            "frontdesk_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
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
            "recommended_step_id": "open_frontdesk",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
            "human_gate_ids": ["alpha_gate"],
        },
        "product_entry_preflight": {
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
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
            "recommended_start_surface": "product_frontdesk",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_loop_surface": "grant_user_loop",
            "recommended_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "blocking_gaps": ["Product-grade shell still pending."],
        },
        "product_entry_quickstart": {
            "surface_kind": "product_entry_quickstart",
            "recommended_step_id": "open_frontdesk",
            "summary": "Open the frontdesk first.",
            "steps": [
                {
                    "step_id": "open_frontdesk",
                    "title": "Open frontdesk",
                    "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdesk",
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

    frontdesk = {
        "surface_kind": "product_frontdesk",
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
        "frontdesk_surface": {
            "surface_kind": "product_frontdesk",
            "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
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
            "frontdesk_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        "notes": ["Thin frontdesk adapter is active."],
        "schema_ref": "contracts/schemas/v1/product-frontdesk.schema.json",
        "domain_entry_contract": manifest["domain_entry_contract"],
        "gateway_interaction_contract": manifest["gateway_interaction_contract"],
    }

    validated_frontdesk = validate_family_product_frontdesk(
        frontdesk,
        require_contract_bundle=True,
    )
    assert validated_frontdesk["surface_kind"] == "product_frontdesk"
    assert validated_frontdesk["product_entry_manifest"]["surface_kind"] == "product_entry_manifest"
    assert validated_frontdesk["gateway_interaction_contract"]["frontdoor_owner"] == "opl_gateway_or_domain_gui"


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
            "frontdesk": {
                "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdesk",
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
            "summary": "Open the frontdesk first.",
            "recommended_mode_id": "open_frontdesk",
            "modes": [
                {
                    "mode_id": "open_frontdesk",
                    "title": "Open frontdesk",
                    "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdesk",
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
            "supported_commands": ["product-frontdesk"],
            "command_contracts": [
                {
                    "command": "product-frontdesk",
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

    frontdesk = {
        "surface_kind": "product_frontdesk",
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
        "frontdesk_surface": {
            "surface_kind": "product_frontdesk",
            "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
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
            "frontdesk_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "progress_surface": {
                "surface_kind": "grant_progress",
                "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
            },
            "resume_surface": manifest["product_entry_start"]["resume_surface"],
            "recommended_step_id": "open_frontdesk",
            "next_focus": ["Keep the frontdoor stable."],
            "remaining_gaps_count": 1,
            "human_gate_ids": ["alpha_gate"],
        },
        "product_entry_preflight": {
            "surface_kind": "product_entry_preflight",
            "summary": "Current preflight is green.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
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
            "recommended_start_surface": "product_frontdesk",
            "recommended_start_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_loop_surface": "grant_user_loop",
            "recommended_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "blocking_gaps": ["Product-grade shell still pending."],
        },
        "product_entry_quickstart": {
            "surface_kind": "product_entry_quickstart",
            "recommended_step_id": "open_frontdesk",
            "summary": "Open the frontdesk first.",
            "steps": [
                {
                    "step_id": "open_frontdesk",
                    "title": "Open frontdesk",
                    "command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
                    "surface_kind": "product_frontdesk",
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
            "frontdesk_command": "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        "notes": ["Thin frontdesk adapter is active."],
        "schema_ref": "contracts/schemas/v1/product-frontdesk.schema.json",
        "domain_entry_contract": manifest["domain_entry_contract"],
    }

    try:
        validate_family_product_frontdesk(
            frontdesk,
            require_contract_bundle=True,
        )
    except ValueError as exc:
        assert "gateway_interaction_contract" in str(exc)
    else:
        raise AssertionError("expected missing gateway_interaction_contract to fail closed")
