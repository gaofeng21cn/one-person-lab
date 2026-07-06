"""Deterministic helpers for OPL Connect source and skill routing.

The helpers only normalize refs, shape checklists, and lint authority wording.
They do not read or write files, call networks, or invoke subprocesses.
"""

from __future__ import annotations

import re
from typing import Iterable


_SPACE_RE = re.compile(r"\s+")
_FORBIDDEN_PHRASES = (
    "domain truth",
    "quality verdict",
    "owner acceptance",
    "owner receipt",
    "typed blocker",
    "release ready",
    "production ready",
    "domain ready",
    "readiness",
)
_REQUEST_KEYWORDS = {
    "single_skill_sync": ("single skill", "sync skill", "sync-skills", "skill sync"),
    "skill_search": ("skill", "codex skill", "skills"),
    "source_search": ("source", "repo", "repository", "url", "search"),
    "candidate_inspect": ("inspect", "candidate", "descriptor", "package"),
    "connector_receipt_debug": ("receipt", "connector", "invocation", "provider"),
    "refs_only_review": ("refs-only", "refs only", "no-authority", "handoff"),
}


def normalize_ref(value: object) -> str:
    """Return a stable refs-only token for comparison and handoff notes."""
    text = _SPACE_RE.sub(" ", str(value).strip())
    return text.rstrip("/").lower()


def normalize_refs(values: Iterable[object]) -> tuple[str, ...]:
    normalized = {normalize_ref(value) for value in values if normalize_ref(value)}
    return tuple(sorted(normalized))


def classify_request(text: str) -> str:
    haystack = normalize_ref(text)
    for request_class, keywords in _REQUEST_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return request_class
    return "refs_only_review"


def handoff_skeleton(owner_route: str, refs: Iterable[object]) -> dict[str, object]:
    return {
        "owner_route": normalize_ref(owner_route),
        "candidate_refs": normalize_refs(refs),
        "no_authority_flags": (
            "no_domain_truth",
            "no_quality_verdict",
            "no_owner_acceptance",
            "no_readiness_claim",
        ),
        "next_legal_owner_action": "",
    }


def lint_forbidden_claims(text: str) -> tuple[str, ...]:
    haystack = normalize_ref(text)
    return tuple(phrase for phrase in _FORBIDDEN_PHRASES if phrase in haystack)


def _self_check() -> None:
    assert normalize_ref(" HTTPS://Example.test/path/  ") == "https://example.test/path"
    assert normalize_refs(["B", " a ", "b", ""]) == ("a", "b")
    assert classify_request("debug connector invocation receipt") == "connector_receipt_debug"
    skeleton = handoff_skeleton("MAS Owner", [" repo/a ", "repo/a/"])
    assert skeleton["owner_route"] == "mas owner"
    assert skeleton["candidate_refs"] == ("repo/a",)
    assert "owner receipt" in lint_forbidden_claims("This is an owner receipt.")


if __name__ == "__main__":
    _self_check()
