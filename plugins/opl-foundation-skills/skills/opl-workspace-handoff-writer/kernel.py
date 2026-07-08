"""Deterministic local helpers for the OPL Workspace Handoff Writer skill."""

from __future__ import annotations

import re
from typing import Iterable

_AUTHORITY_PATTERNS = {
    "source_readiness": r"\b(source|workspace|runtime|domain)\s+ready\b|\bsource\s+readiness\s+(is\s+)?(confirmed|proven|passed)\b",
    "owner_receipt": r"\b(sign|signed|issue|issued|create|created)\s+.*?\b(owner\s+)?receipt\b",
    "typed_blocker": r"\b(create|created|emit|emitted|issue|issued)\s+.*?\btyped\s+blocker\b",
    "source_mutation": r"\b(write|wrote|mutate|mutated|relocate|relocated|normalize|normalized)\s+.*?\b(source|artifact|locator)\b",
    "runtime_queue": r"\b(write|wrote|enqueue|enqueued|mutate|mutated)\s+.*?\b(runtime\s+)?queue\b",
}


def normalize_workspace_ref(value: str, *, default_prefix: str = "workspace") -> str:
    """Return a stable workspace/program ref token without reading or writing it."""

    token = re.sub(r"[^a-z0-9._:/-]+", "-", value.strip().lower())
    token = re.sub(r"-{2,}", "-", token).strip("-")
    if not token:
        raise ValueError("workspace ref is required")
    return token if ":" in token else f"{default_prefix}:{token}"


def normalize_source_ref(value: str) -> str:
    """Trim and collapse source ref whitespace without path canonicalization."""

    ref = re.sub(r"\s+", " ", value.strip())
    if not ref:
        raise ValueError("source ref is required")
    return ref


def build_source_audit_skeleton(
    workspace_or_program_ref: str,
    consumer: str,
    source_refs: Iterable[str] = (),
    artifact_refs: Iterable[str] = (),
) -> dict:
    """Build a refs-only source readiness audit skeleton."""

    return {
        "workspace_or_program_ref": normalize_workspace_ref(workspace_or_program_ref),
        "consumer": consumer.strip(),
        "source_refs": tuple(normalize_source_ref(ref) for ref in source_refs if ref.strip()),
        "artifact_refs": tuple(normalize_source_ref(ref) for ref in artifact_refs if ref.strip()),
        "finding_class": "no_issue_found",
        "route_back": {
            "owner": "",
            "missing_ref": "",
            "requested_action": "",
            "expected_proof": "",
        },
        "authority_boundary": (
            "no owner receipts",
            "no typed blockers",
            "no source readiness claim",
            "no runtime/domain readiness claim",
        ),
    }


def checklist_for_source_audit(audit: dict) -> tuple[str, ...]:
    """Name missing source audit lower-bound fields."""

    required = ("workspace_or_program_ref", "consumer", "source_refs", "owner_route")
    missing = [field for field in required if not audit.get(field)]
    if not audit.get("artifact_refs"):
        missing.append("artifact_refs_or_explicit_none")
    if not audit.get("freshness_evidence"):
        missing.append("freshness_evidence")
    return tuple(missing)


def lint_authority_phrases(text: str) -> tuple[dict, ...]:
    """Find phrases that would overclaim source auditor authority."""

    findings = []
    for finding_class, pattern in _AUTHORITY_PATTERNS.items():
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            findings.append({"finding_class": finding_class, "phrase": match.group(0)})
    return tuple(findings)


def _self_check() -> None:
    assert normalize_workspace_ref(" Lab Workspace ") == "workspace:lab-workspace"
    assert normalize_source_ref(" ops/alpha   source.json ") == "ops/alpha source.json"
    skeleton = build_source_audit_skeleton("program:demo", "stage:one", [" ref:a "], [" artifact:b "])
    assert skeleton["source_refs"] == ("ref:a",)
    assert skeleton["artifact_refs"] == ("artifact:b",)
    assert checklist_for_source_audit({"workspace_or_program_ref": "workspace:a", "consumer": "stage:a"}) == (
        "source_refs",
        "owner_route",
        "artifact_refs_or_explicit_none",
        "freshness_evidence",
    )
    assert lint_authority_phrases("Source readiness is confirmed; emitted typed blocker.") == (
        {"finding_class": "source_readiness", "phrase": "Source readiness is confirmed"},
        {"finding_class": "typed_blocker", "phrase": "emitted typed blocker"},
    )


if __name__ == "__main__":
    _self_check()
