from __future__ import annotations

import pytest

from opl_harness_shared.family_entry_contracts import (
    build_domain_entry_command_contract,
    build_family_domain_entry_contract,
    build_gateway_interaction_contract,
    build_shared_handoff_builder,
    build_shared_handoff_return_surface,
    validate_family_domain_entry_contract,
    validate_gateway_interaction_contract,
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
