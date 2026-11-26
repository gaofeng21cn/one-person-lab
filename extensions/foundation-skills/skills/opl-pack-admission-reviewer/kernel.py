"""Deterministic local helpers for the OPL Pack Admission Reviewer skill."""

from __future__ import annotations

import re
from typing import Iterable

_AUTHORITY_PATTERNS = {
    "registry_mutation": r"\b(admit|admitted|promote|promoted|register|registered|mutate|mutated)\s+.*?\b(pack|registry)\b",
    "owner_receipt": r"\b(sign|signed|issue|issued|create|created)\s+.*?\b(owner\s+)?receipt\b",
    "typed_blocker": r"\b(create|created|emit|emitted|issue|issued)\s+.*?\btyped\s+blocker\b",
    "readiness": r"\b(pack|runtime|domain|production)\s+ready\b|\breadiness\s+(is\s+)?(confirmed|proven|passed)\b",
    "domain_truth": r"\b(domain\s+truth|quality\s+verdict|professional\s+method)\b",
}

_FINDING_CLASSES = (
    "registry_fit_gap",
    "contract_gap",
    "capability_abi_gap",
    "authority_abi_gap",
    "evidence_gap",
    "owner_route_gap",
    "overclaim_gap",
)


def normalize_pack_ref(value: str, *, default_prefix: str = "pack") -> str:
    """Return a stable pack ref token without mutating registry state."""

    token = re.sub(r"[^a-z0-9._:/-]+", "-", value.strip().lower())
    token = re.sub(r"-{2,}", "-", token).strip("-")
    if not token:
        raise ValueError("pack ref is required")
    return token if ":" in token else f"{default_prefix}:{token}"


def build_admission_skeleton(pack_ref: str, target_registry: str, evidence_refs: Iterable[str] = ()) -> dict:
    """Build a source-only admission review skeleton."""

    return {
        "pack_candidate_ref": normalize_pack_ref(pack_ref),
        "target_registry": target_registry.strip(),
        "finding_class": "no_issue_found",
        "evidence_refs": tuple(ref.strip() for ref in evidence_refs if ref.strip()),
        "admission_recommendation": "recommendation_only",
        "recommended_delta": (),
        "authority_boundary": (
            "no owner receipts",
            "no typed blockers",
            "no registry mutation",
            "no readiness claim",
        ),
    }


def checklist_for_pack(candidate: dict) -> tuple[str, ...]:
    """Name missing pack admission lower-bound fields."""

    required = (
        "stable_identity",
        "lifecycle",
        "capability_abi",
        "authority_abi",
        "allowed_writes",
        "forbidden_writes",
        "evidence_refs",
        "owner_route",
    )
    return tuple(field for field in required if not candidate.get(field))


def lint_authority_phrases(text: str) -> tuple[dict, ...]:
    """Find phrases that would overclaim pack reviewer authority."""

    findings = []
    for finding_class, pattern in _AUTHORITY_PATTERNS.items():
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            findings.append({"finding_class": finding_class, "phrase": match.group(0)})
    return tuple(findings)


def valid_finding_classes() -> tuple[str, ...]:
    return _FINDING_CLASSES + ("no_issue_found",)


def _self_check() -> None:
    assert normalize_pack_ref(" OPL Pack / Admission ") == "pack:opl-pack-/-admission"
    skeleton = build_admission_skeleton("pack:demo", "registry:foundation", [" ref:one ", ""])
    assert skeleton["evidence_refs"] == ("ref:one",)
    assert checklist_for_pack({"stable_identity": "pack:demo"}) == (
        "lifecycle",
        "capability_abi",
        "authority_abi",
        "allowed_writes",
        "forbidden_writes",
        "evidence_refs",
        "owner_route",
    )
    assert "overclaim_gap" in valid_finding_classes()
    assert lint_authority_phrases("Admitted pack and pack ready.") == (
        {"finding_class": "registry_mutation", "phrase": "Admitted pack"},
        {"finding_class": "readiness", "phrase": "pack ready"},
    )


if __name__ == "__main__":
    _self_check()
