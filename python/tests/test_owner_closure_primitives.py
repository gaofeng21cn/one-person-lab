from __future__ import annotations

import pytest

from opl_framework.artifact_lifecycle import build_refs_only_artifact_lifecycle_handoff
from opl_framework.owner_evidence import (
    build_owner_evidence_observability_summary,
    build_owner_evidence_reconciliation_inventory,
    build_owner_evidence_reconciliation_proof,
)
from opl_framework.runtime_registration import build_stage_runtime_registration
from opl_framework.schema_validation import SchemaSubsetValidator


class MemorySchemaStore:
    def __init__(self) -> None:
        self.schemas = {
            "root.json": {
                "type": "object",
                "required": ["count", "child"],
                "additionalProperties": False,
                "properties": {
                    "count": {"type": "number", "minimum": 1},
                    "child": {"$ref": "defs.json#/$defs/child"},
                },
            },
            "defs.json": {
                "$defs": {
                    "child": {
                        "type": "object",
                        "required": ["name"],
                        "properties": {"name": {"type": "string", "minLength": 2}},
                    }
                }
            },
        }

    def load_json(self, file_name: str):
        return self.schemas[file_name]


def test_schema_subset_validator_supports_cross_file_refs_and_number_integers() -> None:
    validator = SchemaSubsetValidator(MemorySchemaStore())
    assert validator.validate({"count": 1, "child": {"name": "ok"}}, "root.json") == []
    issues = validator.validate({"count": 0, "child": {"name": "x"}, "extra": True}, "root.json")
    assert {issue.path for issue in issues} == {"count", "child.name", "extra"}
    with pytest.raises(ValueError, match="pointer"):
        validator._resolve_ref("defs.json#missing", "root.json")


def owner_profile():
    return {
        "inventory_surface_kind": "sample_receipt_inventory",
        "summary_surface_kind": "sample_receipt_observability",
        "domain_id": "sample-domain",
        "receipt_shapes": ["domain_owner_receipt", "typed_blocker", "no_regression_evidence"],
        "reconciliation_statuses": [
            "domain_owner_receipt_reconciled",
            "typed_blocker_reconciled",
            "no_regression_evidence_reconciled",
        ],
        "authority_boundary": {"can_write_domain_truth": False},
    }


def test_owner_evidence_builders_keep_domain_authority_out_of_shared_transport() -> None:
    receipt = {
        "receipt_ref": "receipt:1",
        "receipt_id": "receipt-1",
        "receipt_shape": "no_regression_evidence",
        "stage_id": "stage-1",
        "source_ref": "ledger:1",
    }
    proof = build_owner_evidence_reconciliation_proof(
        profile={
            "surface_kind": "sample_receipt_proof",
            "state": "projection_only",
            "domain_id": "sample-domain",
            "probe_scope": "controlled_probe",
            "source_refs": ["source:1"],
            "owner_receipt_field": "sample_owner_receipt",
        },
        owner_receipt_projection=receipt,
        ledger_ref="ledger:1",
        typed_blocker=None,
        no_regression_evidence_refs=["evidence:1", "evidence:1"],
        closeout_payload_consumed=True,
        receipt_ref_matches_closeout=True,
        authority_boundary={"domain_owner_receipt_authority": True, "shared_can_sign": False},
        forbidden_write_proof={"domain_truth_written": False},
    )
    inventory = build_owner_evidence_reconciliation_inventory(
        profile={
            "surface_kind": "sample_receipt_inventory",
            "state": "projection_only",
            "domain_id": "sample-domain",
            "owner_receipt_field": "sample_owner_receipt",
        },
        proofs=[proof],
        ledger_ref="ledger:1",
        closeout_result_count=1,
        authority_boundary={"domain_owner_receipt_authority": True, "shared_can_sign": False},
        forbidden_write_proof={"domain_truth_written": False},
    )
    summary = build_owner_evidence_observability_summary(inventory, profile=owner_profile())
    assert inventory["summary"]["no_regression_evidence_ref_count"] == 1
    assert summary["operator_observability"]["status"] == "no_regression_evidence_observed"
    assert summary["receipt_shape_summary"]["no_regression_evidence_count"] == 1
    assert summary["authority_boundary"]["can_write_domain_truth"] is False
    with pytest.raises(ValueError, match="forbidden write"):
        build_owner_evidence_reconciliation_inventory(
            profile={
                "surface_kind": "sample_receipt_inventory",
                "state": "projection_only",
                "domain_id": "sample-domain",
                "owner_receipt_field": "sample_owner_receipt",
            },
            proofs=[proof],
            ledger_ref="ledger:1",
            closeout_result_count=1,
            authority_boundary={"shared_can_sign": False},
            forbidden_write_proof={"domain_truth_written": True},
        )


def runtime_profile():
    index_refs = {
        "workspace_registry_index": "/workspace_locator",
        "managed_session_ledger_index": "/session_continuity",
    }
    indexes = {
        key: {
            "input_ref": ref,
            "source_surface_kind": key.removesuffix("_index"),
            "write_policy": "opl_index_only",
        }
        for key, ref in index_refs.items()
    }
    return {
        "surface_kind": "opl_stage_runtime_domain_registration",
        "version": "v1",
        "registration_id": "sample.registration.v1",
        "manager_surface_id": "opl_stage_runtime",
        "domain_id": "sample",
        "domain_owner": "sample-domain",
        "product_status_kind": "sample_product_status",
        "executor_owner": "codex_cli",
        "executor_adapter_owner": "one-person-lab",
        "executor_adapter_contract": {"contract_ref": "contract:executor", "fallback_allowed": False},
        "consumable_projection_refs": ["/runtime", "/artifacts"],
        "state_index_inputs": index_refs,
        "native_helper": {
            "protocol_ref": "contract:native-helper",
            "managed_by": "one-person-lab",
            "source_of_truth_rule": "indexes refs without changing domain truth",
            "index_consumption_policy": "opl_index_only_no_domain_truth_writes",
            "indexes": indexes,
            "proof": {
                "surface_kind": "opl_native_helper_ref_consumption_proof",
                "version": 1,
                "proof_id": "sample.native-helper.v1",
                "status": "refs_only_contract_landed",
                "covered_index_keys": list(index_refs),
                "readonly_boundaries": ["no_domain_truth_writes"],
                "authoritative_surfaces": ["domain-contract:sample"],
            },
        },
        "family_lifecycle": {
            "adapter_id": "sample.lifecycle.v1",
            "contract_refs": {"runtime_attempt": "contract:runtime-attempt"},
            "persistence_maps_to": "opl_native_state_projection",
            "persistence_source_refs": ["/session_continuity", "/artifact_inventory"],
            "lifecycle_source_refs": ["/runtime_control", "/progress_projection"],
            "identity_fields": ["workspace_id"],
            "runtime_attempt_contract": "opl_family_runtime_attempt_contract.v1",
            "required_projection_fields": ["attempt_state"],
            "state_mapping": {"running": "task_lifecycle.status"},
            "discovery_surface_ref": "/registration",
            "route_surfaces": {
                "product_entry": {
                    "surface_kind": "sample_product_status",
                    "command_key": "product_status",
                    "ref": "/product_entry",
                },
                "resume": {
                    "surface_kind": "opl_generated_session_resume",
                    "command_key": "recommended_resume_command",
                    "ref": "/restore",
                },
            },
            "adoption_projection": {"maps_to_opl_contract": "operator.v1"},
            "adoption_surface": {"contract_kind": "sample_adoption.v1"},
            "non_goals": ["no_domain_truth_ownership"],
        },
        "wakeup_policy": {"surface_ref": "/automation", "policy": "explicit_continuation"},
        "non_goals": ["not_a_domain_truth_owner"],
    }


def test_stage_runtime_registration_uses_separate_persistence_and_lifecycle_refs() -> None:
    registration = build_stage_runtime_registration(
        profile=runtime_profile(),
        runtime_summary={"runtime_owner": "temporal_provider"},
        runtime_continuity={
            "session_locator_field": "session_id",
            "recommended_resume_command": "sample resume",
            "recommended_progress_command": "sample progress",
        },
        shell_commands={"product_status": "sample status"},
        skill_catalog_command="sample skill-catalog",
    )
    adapter = registration["family_lifecycle_adapter"]
    assert adapter["persistence_projection"]["source_surface_refs"] == [
        "/session_continuity",
        "/artifact_inventory",
    ]
    assert adapter["lifecycle_projection"]["source_surface_refs"] == [
        "/runtime_control",
        "/progress_projection",
    ]
    assert registration["native_helper_consumption"]["authority_boundary"]["domain_can_write_domain_truth_from_helper"] is False


def artifact_profile():
    locator_keys = [
        "stage_json_ref",
        "attempt_json_ref",
        "manifest_json_ref",
        "receipt_json_ref",
        "current_json_ref",
        "latest_json_ref",
        "canonical_pointer_ref",
        "export_artifact_ref",
        "conformance_summary_ref",
    ]
    required = ["artifact_bundle_ref", "final_package_ref", "submission_ready_package_ref", *locator_keys]
    return {
        "surface_kind": "sample_package_lifecycle_handoff",
        "state": "refs_ready",
        "domain_id": "sample-domain",
        "stage_id": "package",
        "required_package_ref_keys": required,
        "locator_ref_keys": locator_keys,
        "artifact_roles": {
            "artifact_bundle_ref_key": "artifact_bundle_ref",
            "final_package_ref_key": "final_package_ref",
            "export_package_ref_key": "submission_ready_package_ref",
            "canonical_pointer_ref_key": "canonical_pointer_ref",
            "export_artifact_ref_key": "export_artifact_ref",
            "artifact_bundle_lifecycle_role": "stage_output_artifact_ref",
            "artifact_bundle_stage_output_role": "package_manifest_ref",
            "final_package_lifecycle_role": "canonical_promotion_ref",
            "export_package_lifecycle_role": "export_artifact_ref",
        },
        "stage_artifact_contract_ref": "contract:stage-artifact",
        "authority_boundary": {"domain_owns_package": True, "opl_can_write_body": False},
        "projection_policy": "refs_only",
        "forbidden_claim_keys": ["opl_can_declare_export_ready"],
        "forbidden_write_keys": ["opl_can_write_artifact_body"],
        "stage_export_package_field": "submission_ready_package",
        "verdict_output_field": "export_verdict_refs",
        "manual_boundary_output_field": "manual_portal_boundary",
        "conformance_surface_kind": "sample_physical_kernel_conformance_refs",
        "artifact_bundle_physical_locator_roles": ["stage_json_ref", "attempt_json_ref"],
    }


def test_artifact_lifecycle_builder_projects_refs_and_rejects_bodies() -> None:
    profile = artifact_profile()
    package_refs = {key: f"ref:{key}" for key in profile["required_package_ref_keys"]}
    handoff = build_refs_only_artifact_lifecycle_handoff(
        profile=profile,
        package_refs=package_refs,
        gap_report={"gap_report_ref": "gap:1", "summary": "no open structural gaps", "gap_refs": []},
        verdict_refs={"verdict_ref": "verdict:1"},
        manual_boundary={"manual_portal_boundary_ref": "manual:1"},
        receipt_refs={"owner_receipt_ref": "receipt:1"},
    )
    stage = handoff["stage_folder_lifecycle_projection"]
    assert "submission_ready_package" in stage
    assert stage["physical_kernel_conformance_refs"]["surface_kind"] == "sample_physical_kernel_conformance_refs"
    assert handoff["export_verdict_refs"] == {"verdict_ref": "verdict:1"}
    with pytest.raises(ValueError, match="artifact body"):
        build_refs_only_artifact_lifecycle_handoff(
            profile=profile,
            package_refs={**package_refs, "package_body": "secret"},
            gap_report={"gap_report_ref": "gap:1", "summary": "gap", "gap_refs": []},
            verdict_refs={"verdict_ref": "verdict:1"},
            manual_boundary={"manual_portal_boundary_ref": "manual:1"},
            receipt_refs={"owner_receipt_ref": "receipt:1"},
        )
