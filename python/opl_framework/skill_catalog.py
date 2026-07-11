from __future__ import annotations

from typing import Any, Mapping


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"skill catalog 缺少字符串字段: {field}")
    return text


def _require_string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value)]


def build_skill_descriptor(
    *,
    skill_id: str,
    title: str,
    owner: str,
    distribution_mode: str,
    surface_kind: str,
    description: str,
    command: str | None = None,
    readiness: str,
    tags: list[str] | None = None,
    domain_projection: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "surface_kind": "skill_descriptor",
        "skill_id": _require_string(skill_id, "skill_id"),
        "title": _require_string(title, "title"),
        "owner": _require_string(owner, "owner"),
        "distribution_mode": _require_string(distribution_mode, "distribution_mode"),
        "target_surface_kind": _require_string(surface_kind, "surface_kind"),
        "description": _require_string(description, "description"),
        "readiness": _require_string(readiness, "readiness"),
        "tags": _require_string_list(tags, "tags"),
    }
    if _non_empty_text(command) is not None:
        payload["command"] = _non_empty_text(command)
    if isinstance(domain_projection, Mapping):
        payload["domain_projection"] = dict(domain_projection)
    return payload


def build_skill_catalog(
    *,
    summary: str,
    skills: list[Mapping[str, Any]],
    supported_commands: list[str],
    command_contracts: list[Mapping[str, Any]],
) -> dict[str, Any]:
    if not skills:
        raise ValueError("skill catalog 需要至少一个 skill descriptor。")
    if not isinstance(command_contracts, list):
        raise ValueError("skill catalog command_contracts 必须是数组。")
    return {
        "surface_kind": "skill_catalog",
        "summary": _require_string(summary, "summary"),
        "skills": [dict(skill) for skill in skills if isinstance(skill, Mapping)],
        "supported_commands": _require_string_list(supported_commands, "supported_commands"),
        "command_contracts": [dict(contract) for contract in command_contracts if isinstance(contract, Mapping)],
    }
