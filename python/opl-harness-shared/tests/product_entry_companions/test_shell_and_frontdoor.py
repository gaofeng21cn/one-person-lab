from __future__ import annotations

from copy import deepcopy

from opl_harness_shared.product_entry_companions import (
    build_operator_loop_action_catalog,
    build_family_frontdesk_entry_surfaces,
    build_family_frontdoor_entry_surfaces,
    build_family_product_frontdesk_from_manifest,
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
    validate_family_product_frontdesk,
    validate_family_product_frontdoor,
    validate_family_product_entry_manifest,
)



def test_product_entry_shell_scaffold_helpers_normalize_shell_surfaces_and_operator_loop_actions() -> None:
    product_entry_shell = build_product_entry_shell_catalog(
        {
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor",
                "surface_kind": "product_frontdoor",
                "purpose": "Open the direct frontdoor.",
                "command_template": "uv run python -m med_autogrant product-frontdoor --input <workspace>",
            },
            "session": {
                "command": "uv run python -m med_autogrant grant-user-loop",
                "surface_kind": "grant_user_loop",
                "command_template": (
                    "uv run python -m med_autogrant grant-user-loop "
                    "--input <workspace> --task-intent <intent>"
                ),
            },
        }
    )

    assert product_entry_shell["frontdoor"]["command"] == "uv run python -m med_autogrant product-frontdoor"
    assert product_entry_shell["frontdoor"]["purpose"] == "Open the direct frontdoor."
    assert (
        product_entry_shell["session"]["command_template"]
        == "uv run python -m med_autogrant grant-user-loop --input <workspace> --task-intent <intent>"
    )

    frontdoor_surface = build_product_entry_shell_linked_surface(
        shell_key="frontdoor",
        shell_surface=product_entry_shell["frontdoor"],
        summary="Open the direct frontdoor.",
        extra_payload={"lane": "frontdoor"},
    )
    assert frontdoor_surface == {
        "shell_key": "frontdoor",
        "command": "uv run python -m med_autogrant product-frontdoor",
        "surface_kind": "product_frontdoor",
        "summary": "Open the direct frontdoor.",
        "lane": "frontdoor",
    }

    operator_loop_actions = build_operator_loop_action_catalog(
        {
            "continue_loop": {
                "command": (
                    "uv run python -m med_autogrant grant-user-loop "
                    "--input <workspace> --task-intent <intent>"
                ),
                "surface_kind": "grant_user_loop",
                "summary": "Continue the current authoring loop.",
                "requires": ["task_intent"],
            }
        }
    )
    assert operator_loop_actions["continue_loop"] == {
        "command": "uv run python -m med_autogrant grant-user-loop --input <workspace> --task-intent <intent>",
        "surface_kind": "grant_user_loop",
        "summary": "Continue the current authoring loop.",
        "requires": ["task_intent"],
    }


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
        summary="Open the frontdoor first.",
        recommended_step_id="open_frontdoor",
        steps=[
            {
                "step_id": "open_frontdoor",
                "title": "Open frontdoor",
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_contract=family_orchestration["resume_contract"],
        human_gate_ids=human_gate_ids,
    )
    assert quickstart["recommended_step_id"] == "open_frontdoor"
    assert quickstart["human_gate_ids"] == human_gate_ids

    start_without_resume_command = build_product_entry_start(
        summary="Open the frontdoor first, then choose the durable continuation mode.",
        recommended_mode_id="open_frontdoor",
        modes=[
            {
                "mode_id": "open_frontdoor",
                "title": "Open frontdoor",
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
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
        summary="Open the frontdoor first, then resume the same loop.",
        recommended_mode_id="open_frontdoor",
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
        frontdoor_command="uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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
        recommended_start_surface="product_frontdoor",
        recommended_start_command="uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
        recommended_loop_surface="grant_user_loop",
        recommended_loop_command="uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        blocking_gaps=["Polished product UI is still pending."],
    )
    assert readiness["verdict"] == "agent_assisted_ready_not_product_grade"
    assert readiness["blocking_gaps"] == ["Polished product UI is still pending."]

    frontdoor = build_product_frontdoor(
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
        frontdoor_surface={
            "shell_key": "product_frontdoor",
            "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdoor",
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
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            }
        },
        summary={
            "frontdoor_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "recommended_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
            "operator_loop_command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
        },
        notes=["Shared frontdoor core is active."],
        extra_payload={
            "ok": True,
            "command": "product-frontdoor",
        },
    )
    assert frontdoor["surface_kind"] == "product_frontdoor"
    assert frontdoor["ok"] is True
    assert frontdoor["command"] == "product-frontdoor"
    assert frontdoor["product_entry_start"]["recommended_mode_id"] == "open_frontdoor"

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
        frontdoor_surface={
            "shell_key": "product_frontdoor",
            "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdoor",
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
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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
    assert manifest["product_entry_start"]["recommended_mode_id"] == "open_frontdoor"

    frontdoor_from_manifest = build_family_product_frontdoor_from_manifest(
        product_entry_manifest=manifest,
        shell_aliases={"frontdoor": "frontdoor"},
        recommended_action="inspect_or_prepare_grant_loop",
        notes=["Shared frontdoor core is active."],
        schema_ref="contracts/schemas/v1/product-frontdoor.schema.json",
        extra_payload={"ok": True},
    )
    assert frontdoor_from_manifest["surface_kind"] == "product_frontdoor"
    assert frontdoor_from_manifest["schema_ref"] == "contracts/schemas/v1/product-frontdoor.schema.json"
    assert frontdoor_from_manifest["entry_surfaces"]["frontdoor"]["command"] == (
        "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json"
    )
    assert frontdoor_from_manifest["ok"] is True

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
                "frontdoor": {
                    "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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


def test_build_family_product_frontdoor_projects_manifest_core() -> None:
    family_orchestration = {
        "human_gates": [{"gate_id": "alpha_gate", "title": "Alpha gate"}],
        "resume_contract": {
            "surface_kind": "grant_user_loop",
            "session_locator_field": "workspace_id",
            "checkpoint_locator_field": "checkpoint_status",
        },
    }
    start = build_product_entry_start(
        summary="Open the frontdoor first.",
        recommended_mode_id="open_frontdoor",
        modes=[
            {
                "mode_id": "open_frontdoor",
                "title": "Open frontdoor",
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_surface=family_orchestration["resume_contract"],
        human_gate_ids=["alpha_gate"],
    )
    quickstart = build_product_entry_quickstart(
        summary="Open the frontdoor first.",
        recommended_step_id="open_frontdoor",
        steps=[
            {
                "step_id": "open_frontdoor",
                "title": "Open frontdoor",
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
                "summary": "Open the direct frontdoor.",
                "requires": [],
            }
        ],
        resume_contract=family_orchestration["resume_contract"],
        human_gate_ids=["alpha_gate"],
    )
    overview = build_product_entry_overview(
        summary="Current grant frontdoor is usable.",
        frontdoor_command="uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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
        recommended_step_id="open_frontdoor",
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
        recommended_start_surface="product_frontdoor",
        recommended_start_command="uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
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
        frontdoor_surface={
            "shell_key": "product_frontdoor",
            "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "surface_kind": "product_frontdoor",
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
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
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
            "recommended_start_command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
            "blocking_check_ids": [],
            "checks": [],
        },
        product_entry_readiness=readiness,
        product_entry_quickstart=quickstart,
        family_orchestration=family_orchestration,
    )

    frontdoor = build_family_product_frontdoor(
        recommended_action="inspect_or_prepare_grant_loop",
        product_entry_manifest=manifest,
        entry_surfaces={
            "frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json"
            },
            "grant_user_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json"
            },
        },
        notes=["Thin frontdoor adapter is active."],
        schema_ref="contracts/schemas/v1/product-frontdoor.schema.json",
        extra_payload={"ok": True},
    )

    assert frontdoor["surface_kind"] == "product_frontdoor"
    assert frontdoor["ok"] is True
    assert frontdoor["target_domain_id"] == "med-autogrant"
    assert frontdoor["schema_ref"] == "contracts/schemas/v1/product-frontdoor.schema.json"
    assert (
        frontdoor["summary"]["frontdoor_command"]
        == "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json"
    )
    assert (
        frontdoor["summary"]["recommended_command"]
        == "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json"
    )


def test_build_family_frontdoor_entry_surfaces_projects_shell_aliases_and_shared_handoff() -> None:
    entry_surfaces = build_family_frontdoor_entry_surfaces(
        product_entry_shell={
            "product_frontdoor": {
                "command": "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json",
                "surface_kind": "product_frontdoor",
            },
            "grant_user_loop": {
                "command": "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json",
                "surface_kind": "grant_user_loop",
            },
        },
        shell_aliases={
            "frontdoor": "product_frontdoor",
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
        entry_surfaces["frontdoor"]["command"]
        == "uv run python -m med_autogrant product-frontdoor --input /tmp/workspace.json --format json"
    )
    assert entry_surfaces["grant_user_loop"]["surface_kind"] == "grant_user_loop"
    assert entry_surfaces["direct_entry_builder"]["entry_mode"] == "direct"
    assert "opl_return_surface" not in entry_surfaces


def test_family_product_frontdesk_compatibility_builds_domain_owned_payloads() -> None:
    family_orchestration = {
        "human_gates": [{"gate_id": "mag_route_gate_revision", "title": "Revision gate"}],
        "resume_contract": {
            "surface_kind": "grant_user_loop",
            "session_locator_field": "workspace_id",
        },
    }
    product_frontdesk_command = "uv run python -m med_autogrant product-frontdesk --input /tmp/workspace.json --format json"
    grant_user_loop_command = (
        "uv run python -m med_autogrant grant-user-loop --input /tmp/workspace.json --task-intent <intent> --format json"
    )
    product_entry_start = build_product_entry_start(
        summary="Open the grant frontdesk first.",
        recommended_mode_id="open_frontdesk",
        modes=[
            {
                "mode_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": product_frontdesk_command,
                "surface_kind": "product_frontdesk",
                "summary": "Open the domain-owned grant frontdesk.",
                "requires": [],
            }
        ],
        resume_surface=family_orchestration["resume_contract"],
        human_gate_ids=["mag_route_gate_revision"],
    )
    product_entry_quickstart = build_product_entry_quickstart(
        summary="Open the grant frontdesk first.",
        recommended_step_id="open_frontdesk",
        steps=[
            {
                "step_id": "open_frontdesk",
                "title": "Open frontdesk",
                "command": product_frontdesk_command,
                "surface_kind": "product_frontdesk",
                "summary": "Open the domain-owned grant frontdesk.",
                "requires": [],
            }
        ],
        resume_contract=family_orchestration["resume_contract"],
        human_gate_ids=["mag_route_gate_revision"],
    )
    product_entry_overview = build_product_entry_overview(
        summary="Grant frontdesk is the current domain entry.",
        frontdesk_command=product_frontdesk_command,
        recommended_command=grant_user_loop_command,
        operator_loop_command=grant_user_loop_command,
        progress_surface={
            "surface_kind": "grant_progress",
            "command": "uv run python -m med_autogrant grant-progress --input /tmp/workspace.json --format json",
        },
        resume_surface={
            **family_orchestration["resume_contract"],
            "command": grant_user_loop_command,
        },
        recommended_step_id="open_frontdesk",
        next_focus=["Keep grant review and submission readiness visible."],
        remaining_gaps_count=1,
        human_gate_ids=["mag_route_gate_revision"],
    )
    product_entry_readiness = build_product_entry_readiness(
        verdict="agent_assisted_ready_not_product_grade",
        usable_now=True,
        good_to_use_now=False,
        fully_automatic=False,
        summary="Usable for grant authoring with operator supervision.",
        recommended_start_surface="product_frontdesk",
        recommended_start_command=product_frontdesk_command,
        recommended_loop_surface="grant_user_loop",
        recommended_loop_command=grant_user_loop_command,
        blocking_gaps=["Hosted product UI is outside this helper contract."],
    )
    product_entry_manifest = build_family_product_entry_manifest(
        manifest_kind="med_auto_grant_product_entry_manifest",
        target_domain_id="med-autogrant",
        formal_entry={
            "default": "CLI",
            "supported_protocols": ["MCP"],
            "internal_surface": "MedAutoGrantDomainEntry",
        },
        workspace_locator={
            "workspace_surface_kind": "nsfc_workspace",
            "workspace_root": "/tmp/workspace.json",
        },
        runtime={
            "runtime_owner": "domain_repo",
        },
        product_entry_status={
            "summary": "Grant frontdesk is the current domain entry.",
            "next_focus": ["Keep grant review and submission readiness visible."],
            "remaining_gaps_count": 1,
        },
        frontdesk_surface={
            "shell_key": "product_frontdesk",
            "command": product_frontdesk_command,
            "surface_kind": "product_frontdesk",
            "summary": "Open the domain-owned grant frontdesk.",
        },
        operator_loop_surface={
            "shell_key": "grant_user_loop",
            "command": grant_user_loop_command,
            "surface_kind": "grant_user_loop",
            "summary": "Continue the grant authoring loop.",
        },
        operator_loop_actions={},
        recommended_shell="grant_user_loop",
        recommended_command=grant_user_loop_command,
        product_entry_shell={
            "product_frontdesk": {
                "command": product_frontdesk_command,
                "surface_kind": "product_frontdesk",
            },
            "grant_user_loop": {
                "command": grant_user_loop_command,
                "surface_kind": "grant_user_loop",
            },
        },
        shared_handoff={
            "opl_handoff_builder": {
                "command": "uv run python -m med_autogrant build-product-entry --entry-mode opl-handoff --format json",
                "entry_mode": "opl-handoff",
            }
        },
        product_entry_start=product_entry_start,
        product_entry_overview=product_entry_overview,
        product_entry_preflight={
            "surface_kind": "product_entry_preflight",
            "summary": "Workspace checks are green enough to open the frontdesk.",
            "ready_to_try_now": True,
            "recommended_check_command": "uv run python -m med_autogrant validate-workspace --input /tmp/workspace.json --format json",
            "recommended_start_command": product_frontdesk_command,
            "blocking_check_ids": [],
            "checks": [],
        },
        product_entry_readiness=product_entry_readiness,
        product_entry_quickstart=product_entry_quickstart,
        family_orchestration=family_orchestration,
    )

    entry_surfaces = build_family_frontdesk_entry_surfaces(
        product_entry_shell=product_entry_manifest["product_entry_shell"],
        shell_aliases={
            "frontdesk": "product_frontdesk",
            "grant_user_loop": "grant_user_loop",
        },
        shared_handoff=product_entry_manifest["shared_handoff"],
    )
    assert entry_surfaces["frontdesk"]["surface_kind"] == "product_frontdesk"

    product_frontdesk = build_family_product_frontdesk_from_manifest(
        recommended_action="inspect_or_prepare_grant_loop",
        product_entry_manifest=product_entry_manifest,
        shell_aliases={
            "frontdesk": "product_frontdesk",
            "grant_user_loop": "grant_user_loop",
        },
        notes=["Domain-owned product_frontdesk compatibility payload."],
        schema_ref="contracts/schemas/v1/product-frontdesk.schema.json",
        extra_payload={"grant_authoring_readiness": {"surface_kind": "grant_authoring_readiness"}},
    )

    assert product_frontdesk["surface_kind"] == "product_frontdesk"
    assert product_frontdesk["frontdesk_surface"]["shell_key"] == "product_frontdesk"
    assert product_frontdesk["summary"]["frontdesk_command"] == product_frontdesk_command
    assert product_frontdesk["entry_surfaces"]["frontdesk"]["command"] == product_frontdesk_command
    assert product_frontdesk["grant_authoring_readiness"]["surface_kind"] == "grant_authoring_readiness"
    assert "frontdoor_surface" not in product_frontdesk
    assert validate_family_product_frontdesk(product_frontdesk)["surface_kind"] == "product_frontdesk"
