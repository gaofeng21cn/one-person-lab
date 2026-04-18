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
_PROGRESS_CODE_LABELS = {
    "study_completed": "研究已进入交付收尾",
    "manual_finishing": "人工收尾与兼容保护",
    "managed_runtime_recovering": "托管运行恢复中",
    "managed_runtime_degraded": "托管运行健康降级",
    "managed_runtime_escalated": "托管运行升级告警",
    "managed_runtime_supervision_gap": "托管运行监管缺口",
    "waiting_physician_decision": "等待医生或 PI 判断",
    "publication_supervision": "论文可发表性监管",
    "managed_runtime_active": "托管运行持续推进中",
    "runtime_blocked": "自动推进被阻断",
    "runtime_preflight": "研究预检与准备阶段",
    "scientific_anchor_missing": "科学锚点仍待补齐",
    "write_stage_ready": "论文写作就绪",
    "publishability_gate_blocked": "论文可发表性门控阻塞",
    "bundle_stage_blocked": "投稿打包存在硬阻塞",
    "bundle_stage_ready": "投稿打包就绪",
    "direction_screening": "方向筛选",
    "question_refinement": "科学问题收紧",
    "argument_building": "论证链搭建",
    "fit_alignment": "项目匹配校准",
    "outline": "提纲成型",
    "drafting": "正文起草",
    "critique": "批注审阅",
    "revision": "修订落实",
    "freeze": "冻结收口",
    "frozen": "冻结完成",
    "final_package": "最终材料打包",
    "submission_ready": "投稿就绪",
    "forward_progress": "继续向前推进",
    "freeze_ready": "已具备冻结条件",
    "rollback_required": "需要先回退修复",
    "submission_frozen": "投稿包冻结完成",
    "missing_submission_minimal": "缺少最小投稿包导出。",
    "medical_publication_surface_blocked": "论文叙事或方法/结果书写面仍有硬阻塞。",
    "forbidden_manuscript_terminology": "当前稿件仍含不允许的术语表达，需要清理。",
    "forbidden_manuscript_terms_present": "当前稿件仍含不允许的术语表达，需要清理。",
    "submission_checklist_contains_unclassified_blocking_items": "投稿检查清单里仍有未归类的硬阻塞。",
    "claim_evidence_map_missing_or_incomplete": "关键 claim-to-evidence 对照仍不完整。",
    "figure_catalog_missing_or_incomplete": "关键图表目录仍不完整。",
    "ama_pdf_defaults_missing": "AMA 稿件导出默认配置仍未补齐。",
}


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


def _read_status_narration_contract(value: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(value, Mapping):
        return None
    contract_kind = _nonempty_text(value.get("contract_kind"))
    if contract_kind == STATUS_NARRATION_CONTRACT_KIND:
        return dict(value)
    nested = value.get("status_narration_contract")
    if isinstance(nested, Mapping):
        nested_contract_kind = _nonempty_text(nested.get("contract_kind"))
        if nested_contract_kind == STATUS_NARRATION_CONTRACT_KIND:
            return dict(nested)
    return None


def _read_mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _read_first_text(mapping: Mapping[str, Any] | None, *keys: str) -> str | None:
    for key in keys:
        text = _nonempty_text((mapping or {}).get(key))
        if text:
            return text
    return None


def _normalized_progress_label_key(value: object) -> str | None:
    text = _nonempty_text(value)
    if text is None:
        return None
    return text.lower().replace("-", "_").replace(" ", "_")


def _lookup_progress_label(value: object) -> str | None:
    text = _nonempty_text(value)
    if text is None:
        return None
    return _PROGRESS_CODE_LABELS.get(text) or _PROGRESS_CODE_LABELS.get(_normalized_progress_label_key(text) or "")


def _humanize_progress_code(code: object) -> str | None:
    text = _nonempty_text(code)
    if text is None:
        return None
    label = _lookup_progress_label(text)
    if label:
        return label
    words = [item for item in text.replace("-", "_").split("_") if item]
    if not words:
        return text
    return " ".join(word.upper() if word.isupper() else word.capitalize() for word in words)


def build_status_narration_human_view(
    value: Mapping[str, Any] | None,
    *,
    fallback_current_stage: str | None = None,
    fallback_latest_update: str | None = None,
    fallback_next_step: str | None = None,
    fallback_blockers: Iterable[object] | None = None,
) -> dict[str, Any]:
    source = dict(value or {}) if isinstance(value, Mapping) else {}
    contract = _read_status_narration_contract(source)
    stage = _read_mapping((contract or {}).get("stage"))
    current_stage = (
        _read_first_text(stage, "current_stage", "current_stage_id")
        or _nonempty_text(fallback_current_stage)
        or _read_first_text(source, "current_stage", "current_stage_id")
    )
    recommended_next_stage = (
        _read_first_text(stage, "recommended_next_stage", "recommended_stage", "recommended_next_stage_id")
        or _read_first_text(source, "recommended_next_stage", "recommended_stage")
    )
    current_stage_label = _humanize_progress_code(current_stage)
    next_stage_label = _humanize_progress_code(recommended_next_stage)
    latest_update = (
        _nonempty_text((contract or {}).get("latest_update"))
        or _nonempty_text(fallback_latest_update)
        or _read_first_text(source, "current_stage_summary", "latest_update", "summary")
    )
    next_step = (
        _nonempty_text((contract or {}).get("next_step"))
        or _nonempty_text(fallback_next_step)
        or _read_first_text(source, "next_system_action", "next_step")
    )
    current_blockers = _normalized_text_list((contract or {}).get("current_blockers"))
    if not current_blockers:
        current_blockers = _normalized_text_list(fallback_blockers)
    if not current_blockers:
        current_blockers = _normalized_text_list(source.get("current_blockers"))
    current_blockers = [_lookup_progress_label(item) or item for item in current_blockers]

    stage_parts: list[str] = []
    if current_stage_label:
        stage_parts.append(f"当前状态：{current_stage_label}")
    if next_stage_label:
        stage_parts.append(f"下一阶段：{next_stage_label}")
    stage_summary = "；".join(stage_parts) or latest_update

    status_parts: list[str] = []
    if stage_summary:
        status_parts.append(stage_summary)
    if current_blockers:
        status_parts.append(f"当前卡点：{'；'.join(current_blockers)}")

    return {
        "current_stage": current_stage,
        "current_stage_label": current_stage_label,
        "recommended_next_stage": recommended_next_stage,
        "recommended_next_stage_label": next_stage_label,
        "latest_update": latest_update,
        "stage_summary": stage_summary,
        "status_summary": "；".join(status_parts) or next_step,
        "next_step": next_step,
        "current_blockers": current_blockers,
    }


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
