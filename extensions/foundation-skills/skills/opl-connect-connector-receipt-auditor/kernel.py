"""Deterministic helpers for OPL Connect receipt audits.

The helpers only normalize refs, build checklists, and classify audit gaps.
They do not read or write files, call networks, or invoke subprocesses.
"""

from __future__ import annotations

import re
from typing import Iterable, Mapping


_SPACE_RE = re.compile(r"\s+")
_REQUIRED_RECEIPT_FIELDS = (
    "connector_ref",
    "requested_resource",
    "invocation_parameters",
    "normalized_refs",
    "receipt_candidate_ref",
    "owner_route",
    "no_authority_flags",
)
_FORBIDDEN_PHRASES = (
    "owner receipt",
    "typed blocker",
    "domain truth",
    "readiness",
    "production ready",
    "domain ready",
    "provider ready",
)


def normalize_ref(value: object) -> str:
    text = _SPACE_RE.sub(" ", str(value).strip())
    return text.rstrip("/").lower()


def normalize_ref_list(values: Iterable[object]) -> tuple[str, ...]:
    normalized = {normalize_ref(value) for value in values if normalize_ref(value)}
    return tuple(sorted(normalized))


def receipt_checklist(receipt: Mapping[str, object]) -> dict[str, tuple[str, ...]]:
    present = tuple(field for field in _REQUIRED_RECEIPT_FIELDS if receipt.get(field))
    missing = tuple(field for field in _REQUIRED_RECEIPT_FIELDS if not receipt.get(field))
    return {"present": present, "missing": missing}


def classify_finding(receipt: Mapping[str, object]) -> str:
    missing = set(receipt_checklist(receipt)["missing"])
    if "connector_ref" in missing or "requested_resource" in missing:
        return "registry_gap"
    if "normalized_refs" in missing:
        return "normalization_gap"
    if "receipt_candidate_ref" in missing or "no_authority_flags" in missing:
        return "receipt_evidence_gap"
    if "owner_route" in missing:
        return "owner_route_gap"
    if lint_forbidden_claims(str(receipt.get("summary", ""))):
        return "authority_overclaim"
    return "no_issue_found"


def lint_forbidden_claims(text: str) -> tuple[str, ...]:
    haystack = normalize_ref(text)
    return tuple(phrase for phrase in _FORBIDDEN_PHRASES if phrase in haystack)


def _self_check() -> None:
    assert normalize_ref_list([" Connector/A ", "connector/a/", "B"]) == ("b", "connector/a")
    receipt = {
        "connector_ref": "github",
        "requested_resource": "repo",
        "invocation_parameters": {"q": "x"},
        "normalized_refs": ("repo/x",),
        "receipt_candidate_ref": "receipt/1",
        "owner_route": "connect",
        "no_authority_flags": ("no_owner_receipts",),
    }
    assert receipt_checklist(receipt)["missing"] == ()
    assert classify_finding(receipt) == "no_issue_found"
    assert classify_finding({"connector_ref": "github"}) == "registry_gap"
    assert "readiness" in lint_forbidden_claims("Do not claim readiness.")


if __name__ == "__main__":
    _self_check()
