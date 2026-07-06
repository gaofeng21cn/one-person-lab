"""Deterministic local helpers for the OPL Stagecraft Stage Designer skill."""

from __future__ import annotations

import re
from typing import Iterable

_AUTHORITY_PATTERNS = {
    "owner_receipt": r"\b(sign|signed|issue|issued|create|created)\s+.*?\b(owner\s+)?receipt\b",
    "typed_blocker": r"\b(create|created|emit|emitted|issue|issued)\s+.*?\btyped\s+blocker\b",
    "readiness": r"\b(runtime|domain|release|production)\s+ready\b|\breadiness\s+(is\s+)?(confirmed|proven|passed)\b",
    "runtime_queue": r"\b(write|wrote|enqueue|enqueued|mutate|mutated)\s+.*?\b(runtime\s+)?queue\b",
    "quality_verdict": r"\b(quality\s+verdict|domain\s+verdict|artifact\s+authority)\b",
}


def normalize_stage_ref(value: str, *, default_prefix: str = "stage") -> str:
    """Return a stable ref token without claiming the ref exists."""

    token = re.sub(r"[^a-z0-9._:/-]+", "-", value.strip().lower())
    token = re.sub(r"-{2,}", "-", token).strip("-")
    if not token:
        raise ValueError("stage ref is required")
    return token if ":" in token else f"{default_prefix}:{token}"


def build_stage_skeleton(stage_ref: str, owner_route: str, source_refs: Iterable[str] = ()) -> dict:
    """Build a refs-only stage design skeleton."""

    return {
        "stage_descriptor_delta": {
            "stage_ref": normalize_stage_ref(stage_ref),
            "owner_route": owner_route.strip(),
            "source_refs": tuple(ref.strip() for ref in source_refs if ref.strip()),
        },
        "prompt_strategy": (),
        "rubric": (),
        "capability_use_policy": (),
        "handoff_lower_bound": ("candidate_refs", "evidence_refs", "owner_route", "no_authority_notes"),
        "authority_boundary": (
            "no owner receipts",
            "no typed blockers",
            "no runtime queues",
            "no readiness claims",
        ),
    }


def checklist_for_stage(descriptor: dict) -> tuple[str, ...]:
    """Name missing lower-bound fields for a Stagecraft descriptor."""

    required = ("stage_ref", "goal", "inputs", "outputs", "owner_route", "allowed_surfaces", "forbidden_surfaces")
    missing = [field for field in required if not descriptor.get(field)]
    if not descriptor.get("receipt_blocker_lower_bound"):
        missing.append("receipt_blocker_lower_bound")
    return tuple(missing)


def lint_authority_phrases(text: str) -> tuple[dict, ...]:
    """Find phrases that would overclaim Stagecraft authority."""

    findings = []
    for finding_class, pattern in _AUTHORITY_PATTERNS.items():
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            findings.append({"finding_class": finding_class, "phrase": match.group(0)})
    return tuple(findings)


def _self_check() -> None:
    assert normalize_stage_ref(" DM-CVD Stage 1 ") == "stage:dm-cvd-stage-1"
    skeleton = build_stage_skeleton("program:stage-a", "owner:mas", [" ref:a ", ""])
    assert skeleton["stage_descriptor_delta"]["source_refs"] == ("ref:a",)
    assert checklist_for_stage({"stage_ref": "stage:a", "goal": "draft"}) == (
        "inputs",
        "outputs",
        "owner_route",
        "allowed_surfaces",
        "forbidden_surfaces",
        "receipt_blocker_lower_bound",
    )
    assert lint_authority_phrases("Signed owner receipt and runtime ready.") == (
        {"finding_class": "owner_receipt", "phrase": "Signed owner receipt"},
        {"finding_class": "readiness", "phrase": "runtime ready"},
    )


if __name__ == "__main__":
    _self_check()
