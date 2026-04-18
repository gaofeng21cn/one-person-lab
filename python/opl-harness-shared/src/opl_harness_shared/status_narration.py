from __future__ import annotations

from typing import Any, Iterable, Mapping


STATUS_NARRATION_SCHEMA_VERSION = 1
STATUS_NARRATION_CONTRACT_KIND = "ai_status_narration"

PAPER_MILESTONE_ANSWER_CHECKLIST = (
    "milestone_status",
    "review_readiness",
    "submission_readiness",
    "remaining_scope",
)
PROGRESS_ANSWER_CHECKLIST = (
    "current_stage",
    "current_blockers",
    "next_step",
)
RUNTIME_ALERT_ANSWER_CHECKLIST = (
    "health_status",
    "intervention_need",
    "next_step",
)


def _nonempty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalized_text_list(values: Iterable[object] | None) -> list[str]:
    items: list[str] = []
    for value in values or ():
        text = _nonempty_text(value)
        if text:
            items.append(text)
    return items


def _normalize_json_like(value: object) -> Any:
    if value is None:
        return None
    if isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _nonempty_text(value)
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            key_text = _nonempty_text(key)
            if key_text is None:
                continue
            normalized_item = _normalize_json_like(item)
            if normalized_item is None:
                continue
            normalized[key_text] = normalized_item
        return normalized or None
    if isinstance(value, (list, tuple, set)):
        normalized_items = [_normalize_json_like(item) for item in value]
        filtered = [item for item in normalized_items if item is not None]
        return filtered or None
    return _nonempty_text(value)


def _normalize_mapping(mapping: Mapping[str, Any] | None) -> dict[str, Any]:
    normalized = _normalize_json_like(dict(mapping or {}))
    return dict(normalized) if isinstance(normalized, dict) else {}


def build_status_narration_contract(
    *,
    contract_id: str,
    surface_kind: str,
    audience: str = "human_user",
    milestone: Mapping[str, Any] | None = None,
    stage: Mapping[str, Any] | None = None,
    readiness: Mapping[str, Any] | None = None,
    remaining_scope: Mapping[str, Any] | None = None,
    current_blockers: Iterable[object] | None = None,
    latest_update: str | None = None,
    next_step: str | None = None,
    human_gate: Mapping[str, Any] | None = None,
    facts: Mapping[str, Any] | None = None,
    answer_checklist: Iterable[object] | None = None,
) -> dict[str, Any]:
    resolved_contract_id = _nonempty_text(contract_id)
    if resolved_contract_id is None:
        raise ValueError("status narration contract_id must be a non-empty string")
    resolved_surface_kind = _nonempty_text(surface_kind)
    if resolved_surface_kind is None:
        raise ValueError("status narration surface_kind must be a non-empty string")
    resolved_audience = _nonempty_text(audience) or "human_user"
    normalized_answer_checklist = _normalized_text_list(answer_checklist)
    if not normalized_answer_checklist:
        normalized_answer_checklist = list(PROGRESS_ANSWER_CHECKLIST)
    return {
        "schema_version": STATUS_NARRATION_SCHEMA_VERSION,
        "contract_kind": STATUS_NARRATION_CONTRACT_KIND,
        "contract_id": resolved_contract_id,
        "surface_kind": resolved_surface_kind,
        "audience": resolved_audience,
        "milestone": _normalize_mapping(milestone),
        "stage": _normalize_mapping(stage),
        "readiness": _normalize_mapping(readiness),
        "remaining_scope": _normalize_mapping(remaining_scope),
        "current_blockers": _normalized_text_list(current_blockers),
        "latest_update": _nonempty_text(latest_update),
        "next_step": _nonempty_text(next_step),
        "human_gate": _normalize_mapping(human_gate),
        "facts": _normalize_mapping(facts),
        "narration_policy": {
            "mode": "ai_first",
            "legacy_summary_role": "fallback_only",
            "style": "plain_language",
            "answer_checklist": normalized_answer_checklist,
        },
    }
