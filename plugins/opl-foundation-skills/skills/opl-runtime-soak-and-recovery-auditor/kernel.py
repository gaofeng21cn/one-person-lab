"""Deterministic helpers for OPL runtime soak and recovery audits.

The helpers only normalize refs, build checklists, and lint readiness wording.
They do not mutate runtime state, provider attempts, queues, or credentials.
"""

from __future__ import annotations

import re
from typing import Iterable, Mapping


_SPACE_RE = re.compile(r"\s+")
_REF_CLASSES = (
    "long_soak",
    "recovery_attempt",
    "provider_observation",
    "no_regression",
    "failure",
    "owner_acceptance",
)
_FORBIDDEN_PHRASES = (
    "runtime ready",
    "provider ready",
    "live ready",
    "production ready",
    "brand l5",
    "app release ready",
    "recovery complete",
    "readiness",
)


def normalize_ref(value: object) -> str:
    text = _SPACE_RE.sub(" ", str(value).strip())
    return text.rstrip("/").lower()


def normalize_ref_map(refs_by_class: Mapping[str, Iterable[object]]) -> dict[str, tuple[str, ...]]:
    normalized: dict[str, tuple[str, ...]] = {}
    for ref_class in _REF_CLASSES:
        refs = refs_by_class.get(ref_class, ())
        normalized[ref_class] = tuple(sorted({normalize_ref(ref) for ref in refs if normalize_ref(ref)}))
    return normalized


def soak_checklist(refs_by_class: Mapping[str, Iterable[object]]) -> dict[str, bool]:
    refs = normalize_ref_map(refs_by_class)
    return {
        "has_long_soak": bool(refs["long_soak"]),
        "has_recovery_attempt": bool(refs["recovery_attempt"]),
        "has_provider_observation": bool(refs["provider_observation"]),
        "has_no_regression_ref": bool(refs["no_regression"]),
        "has_owner_route": bool(refs["owner_acceptance"]),
    }


def classify_gap(refs_by_class: Mapping[str, Iterable[object]], claim_text: str = "") -> str:
    checklist = soak_checklist(refs_by_class)
    if lint_forbidden_claims(claim_text):
        return "runtime_ready_overclaim"
    if not checklist["has_long_soak"]:
        return "soak_evidence_gap"
    if not checklist["has_recovery_attempt"]:
        return "recovery_gap"
    if not checklist["has_provider_observation"]:
        return "provider_observation_gap"
    if not checklist["has_no_regression_ref"]:
        return "no_regression_gap"
    if not checklist["has_owner_route"]:
        return "owner_route_gap"
    return "no_issue_found"


def lint_forbidden_claims(text: str) -> tuple[str, ...]:
    haystack = normalize_ref(text)
    return tuple(phrase for phrase in _FORBIDDEN_PHRASES if phrase in haystack)


def _self_check() -> None:
    refs = {
        "long_soak": [" soak/1 ", "soak/1/"],
        "recovery_attempt": ["recovery/1"],
        "provider_observation": ["provider/1"],
        "no_regression": ["regression/1"],
        "owner_acceptance": ["release-owner"],
    }
    assert normalize_ref_map(refs)["long_soak"] == ("soak/1",)
    assert all(soak_checklist(refs).values())
    assert classify_gap(refs) == "no_issue_found"
    assert classify_gap({}, "runtime ready") == "runtime_ready_overclaim"


if __name__ == "__main__":
    _self_check()
