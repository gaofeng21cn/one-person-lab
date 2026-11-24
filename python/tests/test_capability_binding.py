from __future__ import annotations

import pytest

from opl_framework import (
    CapabilityBindingError,
    select_direct_route_exports,
    validate_refs_only_skill_invocation_envelope,
    validate_required_capability_binding_contract,
)


def _contract() -> dict:
    return {
        "surface_kind": "example_binding_contract",
        "version": "example-binding.v1",
        "consumer_agent_id": "exa",
        "provider_package_id": "shared-skills",
        "consumer_profile_id": "exa-profile.v1",
        "enhancement_kind": "required_dependency",
        "handoff_mode": "refs_only",
        "provider_required": True,
        "eligible_export_ids": ["skill-a", "skill-b"],
        "direct_route_bindings": {"route-1": ["skill-a"]},
        "invocation_policy": {
            "provider_completion_is_exa_completion": False,
            "provider_gap_is_hard_stop": True,
            "provider_gap_can_create_typed_blocker": False,
            "provider_gap_can_select_stage_route": False,
        },
        "availability_policy": {
            "usable_observation": "available_compatible",
            "known_non_usable_observations": [
                "missing",
                "incompatible",
                "disabled",
                "unmaterialized",
                "unobserved",
            ],
            "available_compatible_action": "select_required_declared_skills",
            "other_observation_action": "fail_closed_exa_dependency",
            "accepted_gap_outputs": ["diagnostic", "typed_blocker_ref"],
            "quality_hint_is_advisory": False,
            "creates_typed_blocker": False,
            "blocks_install": True,
        },
        "authority_boundary": {"provider_writes_domain_truth": False},
    }


def test_capability_binding_contract_routes_and_envelopes() -> None:
    contract = validate_required_capability_binding_contract(
        _contract(),
        expected_surface_kind="example_binding_contract",
        expected_version="example-binding.v1",
        expected_consumer_agent_id="exa",
        expected_provider_package_id="shared-skills",
        expected_consumer_profile_id="exa-profile.v1",
        provider_completion_field="provider_completion_is_exa_completion",
        required_block_fields=("blocks_install",),
        non_usable_action="fail_closed_exa_dependency",
    )
    assert select_direct_route_exports(contract, "route-1") == ["skill-a"]

    bad_contract = _contract()
    bad_contract["direct_route_bindings"]["route-2"] = ["undeclared"]
    with pytest.raises(CapabilityBindingError, match="undeclared"):
        select_direct_route_exports(bad_contract, "route-2")

    skill_id, rules = validate_refs_only_skill_invocation_envelope(
        {
            "surface_kind": "example_skill_candidate",
            "skill_id": "skill-a",
            "package_id": "shared-skills",
            "status": "completed",
            "refs_only": True,
            "authority": False,
            "publication_ready": False,
            "consumed_rule_refs": ["rule://1"],
        },
        field="candidate",
        expected_surface_kind="example_skill_candidate",
        expected_provider_package_id="shared-skills",
        allowed_skill_ids={"skill-a"},
        forbidden_false_flags=("authority", "publication_ready"),
    )
    assert skill_id == "skill-a"
    assert rules == ["rule://1"]
