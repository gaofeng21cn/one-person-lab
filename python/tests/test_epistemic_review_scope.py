from __future__ import annotations

import pytest

from opl_framework import (
    EPISTEMIC_REVIEW_SCOPE_SURFACE,
    EpistemicReviewScopeError,
    build_epistemic_review_scope,
    epistemic_review_dependency_refs,
    epistemic_review_scope_identity,
    epistemic_review_scope_sha256,
)


def test_epistemic_review_scope_builds_dag_closure_and_locator_independent_hash() -> None:
    members_v1 = [
        {"member_id": "src-1", "role": "input_data", "ref": "data/a.csv", "sha256": "sha256:" + "1" * 64, "size_bytes": 10},
        {"member_id": "draft-1", "role": "manuscript", "ref": "drafts/v1.md", "sha256": "sha256:" + "2" * 64, "size_bytes": 20},
        {"member_id": "extra-1", "role": "notes", "ref": "notes/n.md", "sha256": "sha256:" + "3" * 64, "size_bytes": 5},
    ]
    members_v2 = [
        {**members_v1[0], "sha256": "sha256:" + "9" * 64},
        members_v1[1],
        members_v1[2],
    ]
    kwargs = dict(
        scope_id="ex:manuscript",
        scope_kind="domain_review",
        role_map={
            "input_data": ("input", "evidence"),
            "manuscript": ("artifact", "reviewed_document"),
            "notes": ("auxiliary", "scratch"),
        },
        edge_rules=[(["input_data"], ["manuscript"], "grounds")],
        reviewed_roles=["manuscript"],
        evidence_profile="standard.v1",
        trust_model="independent_review",
        authority_boundary={"reads_only": True},
    )
    scope1 = build_epistemic_review_scope(members=members_v1, **kwargs)
    scope2 = build_epistemic_review_scope(members=members_v2, **kwargs)
    assert scope1["surface_kind"] == EPISTEMIC_REVIEW_SCOPE_SURFACE
    assert epistemic_review_dependency_refs(scope1) == ["draft-1", "src-1"]
    assert epistemic_review_scope_identity(scope1) == epistemic_review_scope_identity(scope2)
    assert epistemic_review_scope_sha256(scope1) == epistemic_review_scope_sha256(scope2)

    with pytest.raises(EpistemicReviewScopeError, match="no reviewed domain nodes"):
        build_epistemic_review_scope(members=[members_v1[0]], **kwargs)
