from __future__ import annotations

import pytest

from opl_harness_shared.family_entry_contracts import (
    build_domain_agent_entry_spec,
    build_domain_entry_command_contract,
    build_domain_entry_command_catalog,
    build_family_direct_opl_shared_handoff,
    build_family_domain_entry_contract,
    build_family_gateway_interaction_contract,
    build_gateway_interaction_contract,
    build_shared_handoff,
    build_shared_handoff_builder,
    build_shared_handoff_return_surface,
    validate_family_domain_entry_contract,
    validate_domain_agent_entry_spec,
    validate_gateway_interaction_contract,
    validate_shared_handoff,
    validate_shared_handoff_builder,
    validate_shared_handoff_return_surface,
)


def test_family_entry_contract_helpers_build_and_validate_domain_entry_payloads() -> None:
    workspace_cockpit = build_domain_entry_command_contract(
        command="workspace-cockpit",
        required_fields=["profile_ref"],
        optional_fields=["entry_mode"],
        extra_payload={"target_surface_kind": "workspace_cockpit"},
    )

    contract = build_family_domain_entry_contract(
        entry_adapter="MedAutoScienceDomainEntry",
        service_safe_surface_kind="med_autoscience_service_safe_domain_entry",
        product_entry_builder_command="build-product-entry",
        product_entry_kind="med_autoscience_product_entry",
        supported_entry_modes=["direct", "opl-handoff"],
        supported_commands=["workspace-cockpit"],
        command_contracts=[workspace_cockpit],
        extra_payload={"schema_ref": "contracts/schemas/v1/product-entry-manifest.schema.json"},
    )

    validated = validate_family_domain_entry_contract(
        contract,
        "product_entry_manifest.domain_entry_contract",
    )
    assert validated["entry_adapter"] == "MedAutoScienceDomainEntry"
    assert validated["product_entry_kind"] == "med_autoscience_product_entry"
    assert validated["supported_entry_modes"] == ["direct", "opl-handoff"]
    assert validated["schema_ref"] == "contracts/schemas/v1/product-entry-manifest.schema.json"
    assert validated["command_contracts"][0] == workspace_cockpit


def test_family_entry_contract_helpers_build_reusable_command_catalogs_for_cross_repo_adapters() -> None:
    catalog = build_domain_entry_command_catalog(
        [
            {
                "command": "workspace-cockpit",
                "required_fields": ["profile_ref"],
            },
            {
                "command": "study-progress",
                "required_fields": ["profile_ref", "study_id"],
                "optional_fields": ["entry_mode"],
                "extra_payload": {"target_surface_kind": "study_progress"},
            },
        ]
    )

    assert catalog["supported_commands"] == ["workspace-cockpit", "study-progress"]
    assert catalog["command_contracts"] == [
        build_domain_entry_command_contract(
            command="workspace-cockpit",
            required_fields=["profile_ref"],
        ),
        build_domain_entry_command_contract(
            command="study-progress",
            required_fields=["profile_ref", "study_id"],
            optional_fields=["entry_mode"],
            extra_payload={"target_surface_kind": "study_progress"},
        ),
    ]

    contract = build_family_domain_entry_contract(
        entry_adapter="MedAutoScienceDomainEntry",
        service_safe_surface_kind="med_autoscience_service_safe_domain_entry",
        product_entry_builder_command="build-product-entry",
        **catalog,
    )

    assert contract["supported_commands"] == catalog["supported_commands"]
    assert contract["command_contracts"] == catalog["command_contracts"]


def test_family_entry_contract_helpers_build_and_validate_domain_agent_entry_specs() -> None:
    spec = build_domain_agent_entry_spec(
        agent_id="mas",
        title="Med Auto Science",
        description="Medical research domain agent.",
        default_engine="codex",
        workspace_requirement="required",
        locator_schema={
            "required_fields": ["profile_ref"],
            "optional_fields": ["study_id"],
        },
        codex_entry_strategy="domain_agent_entry",
        artifact_conventions="paper_and_submission_package",
        progress_conventions="study_runtime_narration",
        entry_command="product-frontdesk",
        manifest_command="product-entry-manifest",
    )

    validated = validate_domain_agent_entry_spec(
        spec,
        "domain_entry_contract.domain_agent_entry_spec",
    )
    assert validated["surface_kind"] == "domain_agent_entry_spec"
    assert validated["agent_id"] == "mas"
    assert validated["locator_schema"]["required_fields"] == ["profile_ref"]
    assert validated["locator_schema"]["optional_fields"] == ["study_id"]


def test_family_entry_contract_helpers_build_and_validate_gateway_payloads() -> None:
    contract = build_gateway_interaction_contract(
        frontdoor_owner="opl_gateway_or_domain_gui",
        user_interaction_mode="natural_language_frontdoor",
        user_commands_required=False,
        command_surfaces_for_agent_consumption_only=True,
        shared_downstream_entry="MedAutoScienceDomainEntry",
        shared_handoff_envelope=["target_domain_id", "task_intent", "entry_mode"],
        extra_payload={"recommended_route_surface": "product_frontdesk"},
    )

    validated = validate_gateway_interaction_contract(
        contract,
        "product_entry_manifest.gateway_interaction_contract",
    )
    assert validated["surface_kind"] == "gateway_interaction_contract"
    assert validated["recommended_route_surface"] == "product_frontdesk"


def test_family_entry_contract_helpers_expose_default_family_gateway_payloads() -> None:
    contract = build_family_gateway_interaction_contract(
        shared_downstream_entry="MedAutoScienceDomainEntry",
        extra_shared_handoff_envelope=["entry_session_contract"],
        extra_payload={"recommended_route_surface": "product_frontdesk"},
    )

    validated = validate_gateway_interaction_contract(
        contract,
        "product_entry_manifest.gateway_interaction_contract",
    )
    assert validated["frontdoor_owner"] == "opl_gateway_or_domain_gui"
    assert validated["user_interaction_mode"] == "natural_language_frontdoor"
    assert validated["user_commands_required"] is False
    assert validated["command_surfaces_for_agent_consumption_only"] is True
    assert validated["shared_handoff_envelope"] == [
        "target_domain_id",
        "task_intent",
        "entry_mode",
        "workspace_locator",
        "runtime_session_contract",
        "return_surface_contract",
        "entry_session_contract",
    ]
    assert validated["recommended_route_surface"] == "product_frontdesk"


def test_family_entry_contract_helpers_build_and_validate_shared_handoff_payloads() -> None:
    builder = build_shared_handoff_builder(
        command="medautoscience build-product-entry --entry-mode direct",
        entry_mode="direct",
        extra_payload={"summary": "Build direct product entry handoff"},
    )
    return_surface = build_shared_handoff_return_surface(
        surface_kind="product_entry",
        target_domain_id="redcube_ai",
        extra_payload={"summary": "Return into RedCube product entry"},
    )

    validated_builder = validate_shared_handoff_builder(
        builder,
        "product_entry_manifest.shared_handoff.direct_entry_builder",
    )
    validated_return_surface = validate_shared_handoff_return_surface(
        return_surface,
        "product_entry_manifest.shared_handoff.opl_return_surface",
    )
    assert validated_builder["entry_mode"] == "direct"
    assert validated_builder["summary"] == "Build direct product entry handoff"
    assert validated_return_surface["surface_kind"] == "product_entry"
    assert validated_return_surface["target_domain_id"] == "redcube_ai"
    assert validated_return_surface["summary"] == "Return into RedCube product entry"


def test_family_entry_contract_helpers_build_and_validate_aggregate_shared_handoff_payloads() -> None:
    shared_handoff = build_shared_handoff(
        direct_entry_builder={
            "command": "medautoscience build-product-entry --entry-mode direct",
            "entry_mode": "direct",
            "summary": "Build direct product entry handoff",
        },
        opl_return_surface={
            "surface_kind": "product_entry",
            "target_domain_id": "redcube_ai",
            "summary": "Return into RedCube product entry",
        },
        extra_payload={"contract_owner": "family_shared_contract"},
    )

    validated = validate_shared_handoff(
        shared_handoff,
        "product_entry_manifest.shared_handoff",
    )
    assert validated["direct_entry_builder"]["entry_mode"] == "direct"
    assert validated["direct_entry_builder"]["summary"] == "Build direct product entry handoff"
    assert validated["opl_return_surface"]["target_domain_id"] == "redcube_ai"
    assert validated["contract_owner"] == "family_shared_contract"

    with pytest.raises(ValueError, match="shared_handoff"):
        validate_shared_handoff({}, "product_entry_manifest.shared_handoff")


def test_family_entry_contract_helpers_build_default_direct_and_opl_handoff_payloads() -> None:
    validated = validate_shared_handoff(
        build_family_direct_opl_shared_handoff(
            direct_entry_builder_command="medautoscience build-product-entry --entry-mode direct",
            opl_handoff_builder_command="medautoscience build-product-entry --entry-mode opl-handoff",
            extra_payload={"contract_owner": "family_shared_contract"},
        ),
        "product_entry_manifest.shared_handoff",
    )

    assert validated["direct_entry_builder"]["command"] == (
        "medautoscience build-product-entry --entry-mode direct"
    )
    assert validated["direct_entry_builder"]["entry_mode"] == "direct"
    assert validated["opl_handoff_builder"]["command"] == (
        "medautoscience build-product-entry --entry-mode opl-handoff"
    )
    assert validated["opl_handoff_builder"]["entry_mode"] == "opl-handoff"
    assert validated["contract_owner"] == "family_shared_contract"


def test_family_entry_contract_helpers_validate_nested_domain_agent_specs_inside_domain_entry_contract() -> None:
    contract = build_family_domain_entry_contract(
        entry_adapter="MedAutoScienceDomainEntry",
        service_safe_surface_kind="med_autoscience_service_safe_domain_entry",
        product_entry_builder_command="build-product-entry",
        supported_commands=["workspace-cockpit"],
        command_contracts=[
            build_domain_entry_command_contract(
                command="workspace-cockpit",
                required_fields=["profile_ref"],
            )
        ],
        domain_agent_entry_spec={
            "surface_kind": "domain_agent_entry_spec",
            "agent_id": "mas",
            "title": "Med Auto Science",
            "description": "Medical research domain agent.",
            "default_engine": "codex",
            "workspace_requirement": "required",
            "locator_schema": {
                "required_fields": ["profile_ref"],
                "optional_fields": [],
            },
            "codex_entry_strategy": "domain_agent_entry",
            "artifact_conventions": "paper_and_submission_package",
            "progress_conventions": "study_runtime_narration",
            "entry_command": "product-frontdesk",
            "manifest_command": "product-entry-manifest",
        },
    )
    assert contract["domain_agent_entry_spec"]["agent_id"] == "mas"

    with pytest.raises(ValueError, match="domain_agent_entry_spec\\.title"):
        validate_family_domain_entry_contract(
            {
                **contract,
                "domain_agent_entry_spec": {
                    "surface_kind": "domain_agent_entry_spec",
                    "agent_id": "mas",
                },
            },
            "product_entry_manifest.domain_entry_contract",
        )


def test_family_entry_contract_validation_fails_closed_when_command_contracts_missing() -> None:
    with pytest.raises(ValueError, match="command_contracts"):
        validate_family_domain_entry_contract(
            {
                "entry_adapter": "MedAutoScienceDomainEntry",
                "service_safe_surface_kind": "med_autoscience_service_safe_domain_entry",
                "product_entry_builder_command": "build-product-entry",
                "supported_commands": ["workspace-cockpit"],
            },
            "product_entry_manifest.domain_entry_contract",
        )
