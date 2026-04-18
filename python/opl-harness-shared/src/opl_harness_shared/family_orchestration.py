from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _stable_id(prefix: str, *parts: object) -> str:
    source = "|".join(str(part or "").strip() for part in parts)
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def _require_string(value: object, field: str) -> str:
    text = _text(value)
    if text is None:
        raise ValueError(f"family orchestration 缺少字符串字段: {field}")
    return text


def _normalize_ref(value: object, field: str) -> dict[str, str] | None:
    if not isinstance(value, Mapping):
        return None
    ref_kind = _text(value.get("ref_kind"))
    ref = _text(value.get("ref"))
    if ref_kind is None or ref is None:
        raise ValueError(f"family orchestration reference 缺少字段: {field}")
    payload = {
        "ref_kind": ref_kind,
        "ref": ref,
    }
    role = _text(value.get("role"))
    if role is not None:
        payload["role"] = role
    label = _text(value.get("label"))
    if label is not None:
        payload["label"] = label
    return payload


def _normalize_refs(values: object, field: str) -> list[dict[str, str]]:
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes, bytearray)):
        return []
    normalized: list[dict[str, str]] = []
    for index, value in enumerate(values):
        payload = _normalize_ref(value, f"{field}[{index}]")
        if payload is not None:
            normalized.append(payload)
    return normalized


def resolve_program_id(execution: Mapping[str, Any] | None = None, fallback: str = "opl_family_program") -> str:
    if isinstance(execution, Mapping):
        for key in ("program_id", "runtime_program_id", "program"):
            value = _text(execution.get(key))
            if value is not None:
                return value
    return fallback


def resolve_active_run_id(*values: object) -> str | None:
    for value in values:
        text = _text(value)
        if text is not None:
            return text
    return None


def build_family_human_gate(
    *,
    gate_id: str,
    gate_kind: str,
    requested_at: str,
    request_surface_kind: str,
    request_surface_id: str,
    evidence_refs: Sequence[Mapping[str, Any]],
    decision_options: Sequence[str],
    status: str = "requested",
    decision: Mapping[str, Any] | None = None,
    target_domain_id: str = "unknown_domain",
    command: str | None = None,
) -> dict[str, Any]:
    normalized_evidence_refs = _normalize_refs(evidence_refs, "evidence_refs")
    if not normalized_evidence_refs:
        normalized_evidence_refs = [
            {
                "ref_kind": "repo_path",
                "ref": _require_string(request_surface_id, "request_surface_id"),
                "label": "request_surface",
            }
        ]
    normalized_decision_options = [
        _require_string(option, f"decision_options[{index}]")
        for index, option in enumerate(decision_options)
    ] or ["acknowledge"]
    payload: dict[str, Any] = {
        "version": "family-human-gate.v1",
        "gate_id": _require_string(gate_id, "gate_id"),
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "gate_kind": _require_string(gate_kind, "gate_kind"),
        "requested_at": _require_string(requested_at, "requested_at"),
        "status": _text(status) or "requested",
        "request_surface": {
            "surface_kind": _require_string(request_surface_kind, "request_surface_kind"),
            "surface_id": _require_string(request_surface_id, "request_surface_id"),
        },
        "evidence_refs": normalized_evidence_refs,
        "decision_options": normalized_decision_options,
    }
    if command is not None and _text(command) is not None:
        payload["request_surface"]["command"] = _text(command)
    if decision is not None:
        payload["decision"] = dict(decision)
    return payload


def build_family_orchestration_companion(
    *,
    surface_kind: str,
    surface_id: str,
    event_name: str,
    source_surface: str,
    session_id: str | None = None,
    program_id: str | None = None,
    study_id: str | None = None,
    quest_id: str | None = None,
    active_run_id: str | None = None,
    runtime_decision: str | None = None,
    runtime_reason: str | None = None,
    payload: Mapping[str, Any] | None = None,
    event_time: str | None = None,
    checkpoint_id: str | None = None,
    checkpoint_label: str | None = None,
    audit_refs: Sequence[Mapping[str, Any]] | None = None,
    state_refs: Sequence[Mapping[str, Any]] | None = None,
    restoration_evidence: Sequence[Mapping[str, Any]] | None = None,
    action_graph_id: str | None = None,
    action_graph_ref: Mapping[str, Any] | None = None,
    action_graph: Mapping[str, Any] | None = None,
    node_id: str | None = None,
    gate_id: str | None = None,
    resume_mode: str | None = None,
    resume_handle: str | None = None,
    resume_surface_kind: str | None = None,
    session_locator_field: str | None = None,
    checkpoint_locator_field: str | None = None,
    human_gate_required: bool = False,
    parent_envelope_id: str | None = None,
    parent_session_id: str | None = None,
    parent_lineage_id: str | None = None,
    parent_checkpoint_id: str | None = None,
    resume_from_lineage_id: str | None = None,
    human_gates: Sequence[Mapping[str, Any]] | None = None,
    target_domain_id: str = "unknown_domain",
    event_envelope_surface: Mapping[str, Any] | None = None,
    checkpoint_lineage_surface: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_event_time = _text(event_time) or _utc_now()
    resolved_surface_kind = _require_string(surface_kind, "surface_kind")
    resolved_surface_id = _require_string(surface_id, "surface_id")
    resolved_event_name = _require_string(event_name, "event_name")
    resolved_source_surface = _require_string(source_surface, "source_surface")
    resolved_session_id = _text(session_id) or _stable_id("session", study_id, quest_id, resolved_event_name)
    resolved_checkpoint_id = _text(checkpoint_id) or _stable_id(
        "checkpoint",
        study_id,
        quest_id,
        runtime_decision,
        runtime_reason,
        resolved_event_name,
    )
    resolved_lineage_id = _stable_id("lineage", resolved_session_id, resolved_checkpoint_id)
    resolved_envelope_id = _stable_id(
        "evt",
        resolved_surface_id,
        resolved_event_name,
        resolved_event_time,
        resolved_session_id,
        resolved_checkpoint_id,
    )
    resolved_correlation_id = _stable_id("corr", resolved_session_id, resolved_event_name, resolved_checkpoint_id)
    resolved_active_run_id = resolve_active_run_id(active_run_id)
    resolved_program_id = _text(program_id) or resolve_program_id(None)

    event_payload: dict[str, Any] = dict(payload or {})
    if _text(runtime_decision) is not None:
        event_payload.setdefault("runtime_decision", _text(runtime_decision))
    if _text(runtime_reason) is not None:
        event_payload.setdefault("runtime_reason", _text(runtime_reason))

    event_envelope: dict[str, Any] = {
        "version": "family-event-envelope.v1",
        "envelope_id": resolved_envelope_id,
        "event_name": resolved_event_name,
        "event_time": resolved_event_time,
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "producer": {
            "surface_kind": resolved_surface_kind,
            "surface_id": resolved_surface_id,
        },
        "session": {
            "session_id": resolved_session_id,
            "source_surface": resolved_source_surface,
        },
        "correlation": {
            "correlation_id": resolved_correlation_id,
            "checkpoint_id": resolved_checkpoint_id,
            "checkpoint_lineage_id": resolved_lineage_id,
        },
        "payload": event_payload,
    }
    if resolved_active_run_id is not None:
        event_envelope["session"]["active_run_id"] = resolved_active_run_id
    if resolved_program_id is not None:
        event_envelope["session"]["program_id"] = resolved_program_id
    if _text(study_id) is not None:
        event_envelope["session"]["study_id"] = _text(study_id)
    if _text(quest_id) is not None:
        event_envelope["session"]["quest_id"] = _text(quest_id)
    for key, value in (
        ("action_graph_id", action_graph_id),
        ("node_id", node_id),
        ("gate_id", gate_id),
        ("parent_envelope_id", parent_envelope_id),
        ("parent_session_id", parent_session_id),
    ):
        resolved = _text(value)
        if resolved is not None:
            event_envelope["correlation"][key] = resolved

    normalized_audit_refs = _normalize_refs(audit_refs, "audit_refs")
    if normalized_audit_refs:
        event_envelope["audit_refs"] = normalized_audit_refs

    normalized_human_gates = [dict(gate) for gate in human_gates or () if isinstance(gate, Mapping)]
    if normalized_human_gates:
        first_gate = normalized_human_gates[0]
        gate_hint: dict[str, Any] = {
            "gate_id": _text(first_gate.get("gate_id")),
            "status": _text(first_gate.get("status")) or "requested",
        }
        request_surface = first_gate.get("request_surface")
        if isinstance(request_surface, Mapping):
            gate_hint["review_surface"] = dict(request_surface)
        event_envelope["human_gate_hint"] = gate_hint

    checkpoint_state_refs = _normalize_refs(state_refs, "state_refs")
    if not checkpoint_state_refs:
        checkpoint_state_refs.append(
            {
                "role": "status",
                "ref_kind": "repo_path",
                "ref": resolved_surface_id,
                "label": "surface_status",
            }
        )
    normalized_restoration_refs = _normalize_refs(restoration_evidence, "restoration_evidence")
    checkpoint_lineage_payload: dict[str, Any] = {
        "version": "family-checkpoint-lineage.v1",
        "lineage_id": resolved_lineage_id,
        "checkpoint_id": resolved_checkpoint_id,
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "session": {
            "session_id": resolved_session_id,
        },
        "producer": {
            "event_envelope_id": resolved_envelope_id,
        },
        "state_refs": checkpoint_state_refs,
        "resume_contract": {
            "resume_mode": _text(resume_mode) or "resume_from_checkpoint",
            "resume_handle": _text(resume_handle) or f"{resolved_surface_kind}:{resolved_checkpoint_id}",
            "human_gate_required": bool(human_gate_required),
        },
        "integrity": {
            "status": "complete",
            "recorded_at": resolved_event_time,
            "summary": _text(checkpoint_label) or _text(runtime_reason) or "runtime checkpoint captured",
        },
    }
    if resolved_active_run_id is not None:
        checkpoint_lineage_payload["session"]["active_run_id"] = resolved_active_run_id
    if resolved_program_id is not None:
        checkpoint_lineage_payload["session"]["program_id"] = resolved_program_id
    for key, value in (
        ("action_graph_id", action_graph_id),
        ("node_id", node_id),
        ("gate_id", gate_id),
    ):
        resolved = _text(value)
        if resolved is not None:
            checkpoint_lineage_payload["producer"][key] = resolved
    parent: dict[str, Any] = {}
    for key, value in (
        ("parent_lineage_id", parent_lineage_id),
        ("parent_checkpoint_id", parent_checkpoint_id),
        ("resume_from_lineage_id", resume_from_lineage_id),
    ):
        resolved = _text(value)
        if resolved is not None:
            parent[key] = resolved
    if parent:
        checkpoint_lineage_payload["parent"] = parent
    if normalized_restoration_refs:
        checkpoint_lineage_payload["restoration_evidence"] = normalized_restoration_refs

    normalized_action_graph_ref = _normalize_ref(action_graph_ref, "action_graph_ref")
    if normalized_action_graph_ref is None and isinstance(action_graph, Mapping):
        normalized_action_graph_ref = {
            "ref_kind": "json_pointer",
            "ref": "/family_orchestration/action_graph",
            "label": "family action graph",
        }
    normalized_event_envelope_surface = _normalize_ref(event_envelope_surface, "event_envelope_surface")
    normalized_checkpoint_lineage_surface = _normalize_ref(
        checkpoint_lineage_surface,
        "checkpoint_lineage_surface",
    )

    return {
        **({"action_graph_ref": normalized_action_graph_ref} if normalized_action_graph_ref is not None else {}),
        **({"action_graph": dict(action_graph)} if isinstance(action_graph, Mapping) else {}),
        "human_gates": normalized_human_gates,
        "family_human_gates": normalized_human_gates,
        "resume_contract": {
            "surface_kind": _text(resume_surface_kind) or resolved_surface_kind,
            "session_locator_field": _text(session_locator_field) or "event_envelope.session.session_id",
            "checkpoint_locator_field": _text(checkpoint_locator_field) or "checkpoint_lineage.checkpoint_id",
        },
        **(
            {"event_envelope_surface": normalized_event_envelope_surface}
            if normalized_event_envelope_surface is not None
            else {}
        ),
        **(
            {"checkpoint_lineage_surface": normalized_checkpoint_lineage_surface}
            if normalized_checkpoint_lineage_surface is not None
            else {}
        ),
        "event_envelope": event_envelope,
        "family_event_envelope": event_envelope,
        "checkpoint_lineage": checkpoint_lineage_payload,
        "family_checkpoint_lineage": checkpoint_lineage_payload,
    }
