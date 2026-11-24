from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from opl_framework import (
    SNAPSHOT_MATERIALIZATION_SURFACE,
    StageAttemptSnapshotError,
    build_reviewer_input_snapshot_materialization_request,
    inject_snapshot_materialization_into_closeout,
    normalize_snapshot_authority_issuer,
    read_stage_attempt_environment,
    verify_workspace_member_source_refs,
)


def _sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def test_stage_attempt_snapshot_end_to_end_and_hard_stop_rejection(tmp_path: Path) -> None:
    artifact = tmp_path / "inputs" / "table.csv"
    artifact.parent.mkdir(parents=True)
    body = b"x,y\n1,2\n"
    artifact.write_bytes(body)
    digest = _sha256(body)

    env = {
        "OPL_STAGE_ID": "analysis_stage",
        "OPL_WORKSPACE_ROOT": str(tmp_path),
        "OPL_STAGE_ATTEMPT_REF": "opl://stage_attempts/attempt-1",
        "OPL_STAGE_ATTEMPT_ID": "attempt-1",
        "OPL_EXECUTION_CONTENT_BINDING_SHA256": _sha256(b"binding"),
        "OPL_PACKAGE_USE_BOUNDARY_ID": "boundary-1",
        "OPL_ROOT_PACKAGE_ID": "example-pkg",
        "OPL_ROOT_PACKAGE_CONTENT_DIGEST": _sha256(b"pkg"),
    }
    workspace_root, issuer = read_stage_attempt_environment(
        expected_stage_id="analysis_stage",
        agent_id="exa",
        domain_id="exampledomain",
        environ=env,
    )
    normalized_issuer = normalize_snapshot_authority_issuer(
        issuer,
        expected_agent_id="exa",
        expected_domain_id="exampledomain",
        expected_package_id="example-pkg",
    )
    members = [
        {"member_id": "m1", "role": "input_data", "sha256": digest, "size_bytes": len(body)}
    ]
    refs = verify_workspace_member_source_refs(
        expected_members=members,
        workspace_root=workspace_root,
        source_refs_by_member_id={"m1": "inputs/table.csv"},
    )
    owner_ref = {
        "kind": "example_authority",
        "ref": "example:1",
        "size_bytes": 12,
        "sha256": digest,
    }
    request = build_reviewer_input_snapshot_materialization_request(
        review_lane="statistical",
        owner_authority_ref=owner_ref,
        authority_issuer=normalized_issuer,
        workspace_root=str(workspace_root),
        reviewed_members=members,
        source_refs_by_member_id=refs,
    )
    assert request["surface_kind"] == SNAPSHOT_MATERIALIZATION_SURFACE
    closeout = {
        "surface_kind": "stage_attempt_closeout_packet",
        "stage_attempt_id": "attempt-1",
        "route_impact": {"stage_quality_cycle": {"outcome": "review_ready"}},
        "closeout_ref_metadata": [],
    }
    injected = inject_snapshot_materialization_into_closeout(
        closeout,
        request=request,
        owner_authority_ref=owner_ref,
        producer_attempt_ref=normalized_issuer["stage_attempt_ref"],
    )
    assert injected["route_impact"]["stage_quality_cycle"]["review_input_snapshot_materialization_request"] == request
    assert injected["closeout_ref_metadata"] == [owner_ref]

    blocked = {
        "surface_kind": "stage_attempt_closeout_packet",
        "stage_attempt_id": "attempt-1",
        "route_impact": {"stage_quality_cycle": {"outcome": "blocked"}},
    }
    with pytest.raises(StageAttemptSnapshotError, match="hard-stop closeout"):
        inject_snapshot_materialization_into_closeout(
            blocked,
            request=request,
            owner_authority_ref=owner_ref,
            producer_attempt_ref=normalized_issuer["stage_attempt_ref"],
        )
