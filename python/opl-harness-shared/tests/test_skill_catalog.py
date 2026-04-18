from __future__ import annotations

from opl_harness_shared.skill_catalog import (
    build_skill_catalog,
    build_skill_descriptor,
)


def test_skill_catalog_helpers_normalize_shared_descriptors() -> None:
    mas_skill = build_skill_descriptor(
        skill_id="medautoscience_workspace_cockpit",
        title="MAS workspace cockpit",
        owner="medautoscience",
        distribution_mode="repo_tracked",
        surface_kind="workspace_cockpit",
        description="Continue study runtime through the canonical cockpit shell.",
        command="uv run python -m med_autoscience.cli workspace-cockpit --profile <profile>",
        readiness="landed",
        tags=["study", "runtime", "workspace"],
    )
    assert mas_skill["skill_id"] == "medautoscience_workspace_cockpit"

    mag_skill = build_skill_descriptor(
        skill_id="medautogrant_grant_user_loop",
        title="MAG grant user loop",
        owner="medautogrant",
        distribution_mode="repo_tracked",
        surface_kind="grant_user_loop",
        description="Continue the current grant authoring loop.",
        command="uv run python -m med_autogrant grant-user-loop --input <workspace>",
        readiness="landed",
        tags=["grant", "authoring", "checkpoint"],
    )

    catalog = build_skill_catalog(
        summary="Family-shared skill catalog for current domain entry surfaces.",
        skills=[mas_skill, mag_skill],
        supported_commands=["workspace-cockpit", "grant-user-loop"],
        command_contracts=[
            {"command": "workspace-cockpit", "owner": "medautoscience"},
            {"command": "grant-user-loop", "owner": "medautogrant"},
        ],
    )
    assert catalog["surface_kind"] == "skill_catalog"
    assert len(catalog["skills"]) == 2
    assert catalog["supported_commands"] == ["workspace-cockpit", "grant-user-loop"]
