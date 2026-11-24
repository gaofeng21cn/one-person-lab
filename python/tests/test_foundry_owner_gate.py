from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from opl_framework import (
    OwnerGateError,
    canonical_json_bytes,
    verify_owner_gate_request,
)
from opl_framework.foundry_owner_gate import (
    CONTEXT_SURFACE,
    CONTEXT_VERSION,
    PROCESS_SURFACE,
    PROCESS_VERSION,
    RECEIPT_SURFACE,
    RECEIPT_VERSION,
)


def _policy() -> dict:
    return {
        "surface_kind": "example_gate_policy",
        "version": "example-gate-policy.v1",
        "policy_ref": "policy:example/v1",
        "owner": "example-agent",
        "target": {"target_agent_id": "exa", "target_domain_id": "exampledomain"},
        "allowed_authority_refs": ["authority://example/owner"],
        "allowed_actions": {
            "authorize_improve": "approve",
            "approve_canary": "approve",
            "approve_active": "approve",
        },
        "receipt_store": {
            "kind": "owner_issued_content_addressed_files",
            "root_source": "explicit_process_argument",
            "filename_scheme": "sha256_hex_json",
            "physical_non_symlink_required": True,
            "canonical_json_bytes_required": True,
        },
        "authority_boundary": {
            "verifier_can_issue_receipt": False,
            "verifier_can_auto_approve": False,
            "verifier_can_write_foundry_state": False,
            "verifier_can_write_domain_truth": False,
            "unknown_or_mismatched_receipt": "fail_closed",
        },
    }


def _signed_receipt() -> dict:
    statement = {
        "surface_kind": RECEIPT_SURFACE,
        "version": RECEIPT_VERSION,
        "receipt_id": "rcpt-1",
        "authority_ref": "authority://example/owner",
        "action": "approve_canary",
        "decision": "approve",
        "target_agent_id": "exa",
        "target_domain_id": "exampledomain",
        "run_id": "run-1",
        "version_digest": "sha256:" + "a" * 64,
        "expected_revision": 3,
        "issued_at": "2026-11-23T00:00:00+00:00",
    }
    digest = "sha256:" + hashlib.sha256(canonical_json_bytes(statement)).hexdigest()
    return {
        **statement,
        "receipt_digest": digest,
        "receipt_ref": f"opl://foundry/owner-authority-receipts/{digest}",
    }


def test_owner_gate_verifies_physical_receipt_and_rejects_symlinks(tmp_path: Path) -> None:
    receipt = _signed_receipt()
    hex_digest = receipt["receipt_digest"].removeprefix("sha256:")
    receipt_file = tmp_path / f"{hex_digest}.json"
    receipt_file.write_bytes(canonical_json_bytes(receipt))

    request = {
        "surface_kind": PROCESS_SURFACE,
        "version": PROCESS_VERSION,
        "context": {
            "surface_kind": CONTEXT_SURFACE,
            "version": CONTEXT_VERSION,
            "authority_receipt_ref": receipt["receipt_ref"],
            "action": "approve_canary",
            "decision": "approve",
            "target_agent_id": "exa",
            "target_domain_id": "exampledomain",
            "run_id": "run-1",
            "version_digest": "sha256:" + "a" * 64,
            "expected_revision": 3,
        },
    }
    verified = verify_owner_gate_request(
        request,
        policy=_policy(),
        receipt_dir=tmp_path,
        now="2026-11-23T00:05:00+00:00",
        expected_policy_surface="example_gate_policy",
        expected_policy_version="example-gate-policy.v1",
        expected_owner="example-agent",
        expected_target={"target_agent_id": "exa", "target_domain_id": "exampledomain"},
        verifier_id="exa-owner-gate:v1",
    )
    assert verified["receipt"] == receipt
    assert verified["covered_authority_ref"] == "authority://example/owner"

    symlink_dir = tmp_path / "linked"
    symlink_dir.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(OwnerGateError, match="physical directory"):
        verify_owner_gate_request(
            request,
            policy=_policy(),
            receipt_dir=symlink_dir,
            now="2026-11-23T00:05:00+00:00",
            expected_policy_surface="example_gate_policy",
            expected_policy_version="example-gate-policy.v1",
            expected_owner="example-agent",
            expected_target={"target_agent_id": "exa", "target_domain_id": "exampledomain"},
            verifier_id="exa-owner-gate:v1",
        )
