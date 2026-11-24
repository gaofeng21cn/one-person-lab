from __future__ import annotations

import base64
import pytest

from opl_framework import (
    CAS_MATERIALIZATION_SURFACE,
    build_cas_create_operation,
    build_cas_materialization_request,
    build_cas_replace_operation,
    collect_absent_precondition_paths,
    compute_cas_operation_digests,
    is_opl_workspace_index_envelope,
    strict_canonical_json_bytes,
    strict_json_fingerprint,
)


def test_cas_materialization_builds_deterministic_operations_and_digests() -> None:
    replace_op = build_cas_replace_operation(
        "workspace_index.json",
        current_sha256="sha256:" + "0" * 64,
        current_byte_size=2,
        after_json={"ok": True},
    )
    create_op = build_cas_create_operation(
        "items/i1/lifecycle.json",
        after_json={"state": "active"},
    )
    operations = [replace_op, create_op]
    assert base64.b64decode(replace_op["replacement_bytes_base64"]) == strict_canonical_json_bytes({"ok": True})
    absent = collect_absent_precondition_paths(operations)
    assert absent == ["items/i1/lifecycle.json"]

    ops_sha, scope_sha, paths = compute_cas_operation_digests(
        operations, absent_relative_path_preconditions=absent
    )
    assert ops_sha == strict_json_fingerprint(operations)
    req = build_cas_materialization_request(
        capability_id="cap.cas",
        domain_id="example-domain",
        request_id="req-1",
        authorization_ref="auth-1",
        operations=operations,
        operations_sha256=ops_sha,
        materialization_scope_sha256=scope_sha,
        absent_relative_path_preconditions=paths,
    )
    assert req["surface_kind"] == CAS_MATERIALIZATION_SURFACE
    assert req["absent_relative_path_preconditions"] == ["items/i1/lifecycle.json"]
    assert is_opl_workspace_index_envelope(
        {"surface_kind": "opl_workspace_index", "version": "workspace-index.v1"}
    )
    with pytest.raises(ValueError, match="escape"):
        build_cas_create_operation("../escape.json", after_json={})
