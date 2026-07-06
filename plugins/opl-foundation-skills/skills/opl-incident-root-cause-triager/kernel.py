"""Deterministic local helpers for the OPL Incident Root Cause Triager skill."""

from __future__ import annotations

import re
from typing import Iterable

_AUTHORITY_PATTERNS = {
    "owner_receipt": r"\b(sign|signed|issue|issued|create|created)\s+.*?\b(owner\s+)?receipt\b",
    "typed_blocker": r"\b(create|created|emit|emitted|issue|issued)\s+.*?\btyped\s+blocker\b",
    "readiness": r"\b(runtime|release|production|domain)\s+ready\b|\breadiness\s+(is\s+)?(confirmed|proven|passed)\b",
    "runtime_queue": r"\b(write|wrote|enqueue|enqueued|mutate|mutated)\s+.*?\b(runtime\s+)?queue\b",
    "authority_closeout": r"\b(close|closed|resolve|resolved)\s+.*?\b(owner|domain|release|production)\s+authority\b",
}

_ROOT_CAUSE_CLASSES = (
    "target_artifact_gap",
    "gate_or_evaluator_defect",
    "read_model_currentness_drift",
    "owner_route_or_authority_gap",
    "runtime_or_control_plane_defect",
    "provider_or_environment_failure",
    "legitimate_human_gate",
)


def normalize_incident_ref(value: str, *, default_prefix: str = "incident") -> str:
    """Return a stable incident ref token without creating an incident record."""

    token = re.sub(r"[^a-z0-9._:/-]+", "-", value.strip().lower())
    token = re.sub(r"-{2,}", "-", token).strip("-")
    if not token:
        raise ValueError("incident ref is required")
    return token if ":" in token else f"{default_prefix}:{token}"


def build_triage_skeleton(incident_kind: str, symptom: str, evidence_refs: Iterable[str] = ()) -> dict:
    """Build an owner-routable L0-L4 triage skeleton."""

    return {
        "incident_kind": incident_kind.strip(),
        "root_cause_depth": {
            "L0_symptom": symptom.strip(),
            "L1_direct_boundary": "",
            "L2_cross_surface_evidence": "",
            "L3_owner_repair_path": "",
            "L4_prevention": "",
        },
        "evidence_refs": tuple(ref.strip() for ref in evidence_refs if ref.strip()),
        "root_cause_class": (),
        "blocker_to_owner_map": (),
        "legal_next_action": "",
        "verification_or_readback": "",
        "stop_condition": "",
        "prevention_delta": "",
        "no_authority_caveat": (
            "no owner receipts",
            "no typed blockers",
            "no domain truth",
            "no artifact authority",
            "no runtime queues",
            "no readiness/release/production claims",
        ),
    }


def checklist_for_triage(brief: dict) -> tuple[str, ...]:
    """Name missing fields required before an incident brief is owner-routable."""

    missing = []
    depth = brief.get("root_cause_depth", {})
    for level in ("L0_symptom", "L1_direct_boundary", "L2_cross_surface_evidence", "L3_owner_repair_path"):
        if not depth.get(level):
            missing.append(level)
    for field in (
        "evidence_refs",
        "root_cause_class",
        "blocker_to_owner_map",
        "legal_next_action",
        "verification_or_readback",
        "stop_condition",
    ):
        if not brief.get(field):
            missing.append(field)
    return tuple(missing)


def lint_authority_phrases(text: str) -> tuple[dict, ...]:
    """Find phrases that would overclaim triager authority."""

    findings = []
    for finding_class, pattern in _AUTHORITY_PATTERNS.items():
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            findings.append({"finding_class": finding_class, "phrase": match.group(0)})
    return tuple(findings)


def root_cause_classes() -> tuple[str, ...]:
    return _ROOT_CAUSE_CLASSES


def _self_check() -> None:
    assert normalize_incident_ref(" Heartbeat Alert ") == "incident:heartbeat-alert"
    skeleton = build_triage_skeleton("heartbeat_alert", "queue empty", [" runtime:watch "])
    assert skeleton["evidence_refs"] == ("runtime:watch",)
    assert checklist_for_triage(skeleton) == (
        "L1_direct_boundary",
        "L2_cross_surface_evidence",
        "L3_owner_repair_path",
        "root_cause_class",
        "blocker_to_owner_map",
        "legal_next_action",
        "verification_or_readback",
        "stop_condition",
    )
    assert "runtime_or_control_plane_defect" in root_cause_classes()
    assert lint_authority_phrases("Runtime ready and created typed blocker.") == (
        {"finding_class": "typed_blocker", "phrase": "created typed blocker"},
        {"finding_class": "readiness", "phrase": "Runtime ready"},
    )


if __name__ == "__main__":
    _self_check()
