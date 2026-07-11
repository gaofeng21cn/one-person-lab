from __future__ import annotations

from opl_framework.family_action_catalog import (
    build_family_action,
    build_family_action_catalog,
    project_family_action_catalog,
    validate_family_action_catalog_parity,
)


def test_family_action_catalog_projects_cli_mcp_skill_and_tool_surfaces() -> None:
    action = build_family_action(
        action_id="start_deliverable",
        title="Start RedCube deliverable",
        summary="Start the current RedCube product-entry loop.",
        owner="redcube_ai",
        effect="mutating",
        command="redcube product invoke",
        surface_kind="product_entry",
        input_schema_ref="schemas/actions/start_deliverable.input.schema.json",
        output_schema_ref="schemas/actions/start_deliverable.output.schema.json",
        workspace_locator_fields=["workspace_root"],
        human_gate_ids=["redcube_operator_review_gate"],
        mcp_public_runtime=True,
    )
    catalog = build_family_action_catalog(
        catalog_id="redcube_ai_action_catalog",
        target_domain_id="redcube_ai",
        owner="redcube_ai",
        actions=[action],
    )

    assert catalog["surface_kind"] == "family_action_catalog"
    assert catalog["version"] == "family-action-catalog.v1"
    assert catalog["actions"][0]["supported_surfaces"]["cli"]["command"] == "redcube product invoke"

    cli_export = project_family_action_catalog(catalog, "cli")
    mcp_export = project_family_action_catalog(catalog, "mcp")
    skill_export = project_family_action_catalog(catalog, "skill")
    openai_export = project_family_action_catalog(catalog, "openai")
    ai_sdk_export = project_family_action_catalog(catalog, "ai-sdk")

    assert cli_export[0]["command"] == "redcube product invoke"
    assert mcp_export[0]["name"] == "start_deliverable"
    assert mcp_export[0]["public_runtime"] is True
    assert skill_export[0]["command_contract_id"] == "start_deliverable"
    assert openai_export[0]["type"] == "function"
    assert openai_export[0]["function"]["name"] == "start_deliverable"
    assert ai_sdk_export[0]["name"] == "start_deliverable"
    assert validate_family_action_catalog_parity(catalog)["status"] == "aligned"


def test_family_action_catalog_keeps_mag_mcp_descriptor_only() -> None:
    action = build_family_action(
        action_id="open_grant_user_loop",
        title="Open MAG user loop",
        summary="Open the current MAG grant user loop.",
        owner="med-autogrant",
        effect="mutating",
        command="uv run python -m med_autogrant product user-loop --input <input_path> --format json",
        surface_kind="grant_user_loop",
        input_schema_ref="schemas/actions/open_grant_user_loop.input.schema.json",
        output_schema_ref="schemas/actions/open_grant_user_loop.output.schema.json",
        workspace_locator_fields=["input_path"],
        mcp_public_runtime=False,
    )
    catalog = build_family_action_catalog(
        catalog_id="med_autogrant_action_catalog",
        target_domain_id="med-autogrant",
        owner="med-autogrant",
        actions=[action],
    )

    mcp_export = project_family_action_catalog(catalog, "mcp")
    assert mcp_export[0]["name"] == "open_grant_user_loop"
    assert mcp_export[0]["public_runtime"] is False
    assert mcp_export[0]["descriptor_only"] is True
