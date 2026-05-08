from __future__ import annotations

from typing import Any, Mapping, Sequence


FamilyActionEffect = str
FamilyActionExportFormat = str


def _text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _text(value)
    if text is None:
        raise ValueError(f"family action catalog 缺少字符串字段: {field}")
    return text


def _string_list(values: object, field: str) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes, bytearray)):
        raise ValueError(f"family action catalog 缺少数组字段: {field}")
    return [_require_string(value, f"{field}[{index}]") for index, value in enumerate(values)]


def _surface_descriptor(
    *,
    command: str | None = None,
    surface_kind: str | None = None,
    tool_name: str | None = None,
    command_contract_id: str | None = None,
    action_key: str | None = None,
    public_runtime: bool | None = None,
    descriptor_only: bool | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if _text(command) is not None:
        payload["command"] = _require_string(command, "surface.command")
    if _text(surface_kind) is not None:
        payload["surface_kind"] = _require_string(surface_kind, "surface.surface_kind")
    if _text(tool_name) is not None:
        payload["tool_name"] = _require_string(tool_name, "surface.tool_name")
    if _text(command_contract_id) is not None:
        payload["command_contract_id"] = _require_string(command_contract_id, "surface.command_contract_id")
    if _text(action_key) is not None:
        payload["action_key"] = _require_string(action_key, "surface.action_key")
    if public_runtime is not None:
        payload["public_runtime"] = bool(public_runtime)
    if descriptor_only is not None:
        payload["descriptor_only"] = bool(descriptor_only)
    return payload


def build_family_action(
    *,
    action_id: str,
    title: str,
    summary: str,
    owner: str,
    effect: FamilyActionEffect,
    command: str,
    surface_kind: str,
    input_schema_ref: str,
    output_schema_ref: str,
    workspace_locator_fields: Sequence[str] | None = None,
    human_gate_ids: Sequence[str] | None = None,
    mcp_public_runtime: bool = True,
    authority_boundary: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_effect = _require_string(effect, "effect")
    if normalized_effect not in {"read_only", "mutating"}:
        raise ValueError("family action catalog effect 必须是 read_only 或 mutating")
    normalized_action_id = _require_string(action_id, "action_id")
    normalized_command = _require_string(command, "command")
    normalized_surface_kind = _require_string(surface_kind, "surface_kind")

    return {
        "action_id": normalized_action_id,
        "title": _require_string(title, "title"),
        "summary": _require_string(summary, "summary"),
        "owner": _require_string(owner, "owner"),
        "effect": normalized_effect,
        "source_command": {
            "command": normalized_command,
            "surface_kind": normalized_surface_kind,
        },
        "input_schema_ref": _require_string(input_schema_ref, "input_schema_ref"),
        "output_schema_ref": _require_string(output_schema_ref, "output_schema_ref"),
        "workspace_locator_fields": _string_list(workspace_locator_fields or [], "workspace_locator_fields"),
        "human_gate_ids": _string_list(human_gate_ids or [], "human_gate_ids"),
        "supported_surfaces": {
            "cli": _surface_descriptor(command=normalized_command, surface_kind=normalized_surface_kind),
            "mcp": _surface_descriptor(
                tool_name=normalized_action_id,
                command=normalized_command,
                surface_kind=normalized_surface_kind,
                public_runtime=mcp_public_runtime,
                descriptor_only=not mcp_public_runtime,
            ),
            "skill": _surface_descriptor(
                command_contract_id=normalized_action_id,
                command=normalized_command,
                surface_kind=normalized_surface_kind,
            ),
            "product_entry": _surface_descriptor(
                action_key=normalized_action_id,
                command=normalized_command,
                surface_kind=normalized_surface_kind,
            ),
            "openai": _surface_descriptor(tool_name=normalized_action_id),
            "ai_sdk": _surface_descriptor(tool_name=normalized_action_id),
        },
        **({"authority_boundary": dict(authority_boundary)} if isinstance(authority_boundary, Mapping) else {}),
    }


def build_family_action_catalog(
    *,
    catalog_id: str,
    target_domain_id: str,
    owner: str,
    actions: Sequence[Mapping[str, Any]],
    notes: Sequence[str] | None = None,
) -> dict[str, Any]:
    if not actions:
        raise ValueError("family action catalog 需要至少一个 action")
    normalized_owner = _require_string(owner, "owner")
    seen: set[str] = set()
    action_payloads: list[dict[str, Any]] = []
    for index, action in enumerate(actions):
        if not isinstance(action, Mapping):
            raise ValueError(f"family action catalog action 必须是 mapping: actions[{index}]")
        action_id = _require_string(action.get("action_id"), f"actions[{index}].action_id")
        if action_id in seen:
            raise ValueError(f"family action catalog action_id 重复: {action_id}")
        seen.add(action_id)
        action_payloads.append(dict(action))

    return {
        "surface_kind": "family_action_catalog",
        "version": "family-action-catalog.v1",
        "catalog_id": _require_string(catalog_id, "catalog_id"),
        "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
        "owner": normalized_owner,
        "authority_boundary": {
            "domain_truth_owner": normalized_owner,
            "opl_role": "projection_consumer_only",
            "write_policy": "no_domain_truth_writes",
        },
        "actions": action_payloads,
        "notes": _string_list(notes or [], "notes"),
    }


def _descriptor(action: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    surfaces = action.get("supported_surfaces")
    if isinstance(surfaces, Mapping) and isinstance(surfaces.get(key), Mapping):
        return surfaces[key]  # type: ignore[index,return-value]
    return {}


def _source_command(action: Mapping[str, Any]) -> Mapping[str, Any]:
    source = action.get("source_command")
    if not isinstance(source, Mapping):
        raise ValueError("family action catalog action 缺少 source_command")
    return source


def _projection_for_action(action: Mapping[str, Any]) -> dict[str, Any]:
    source = _source_command(action)
    action_id = _require_string(action.get("action_id"), "action.action_id")
    summary = _require_string(action.get("summary"), "action.summary")
    input_schema_ref = _require_string(action.get("input_schema_ref"), "action.input_schema_ref")
    output_schema_ref = _require_string(action.get("output_schema_ref"), "action.output_schema_ref")
    command = _require_string(_descriptor(action, "cli").get("command") or source.get("command"), "action.command")
    surface_kind = _require_string(
        _descriptor(action, "cli").get("surface_kind") or source.get("surface_kind"),
        "action.surface_kind",
    )
    mcp = _descriptor(action, "mcp")
    skill = _descriptor(action, "skill")
    product_entry = _descriptor(action, "product_entry")
    openai = _descriptor(action, "openai")
    ai_sdk = _descriptor(action, "ai_sdk")
    workspace_locator_fields = _string_list(action.get("workspace_locator_fields") or [], "workspace_locator_fields")

    return {
        "cli": {
            "action_id": action_id,
            "command": command,
            "surface_kind": surface_kind,
            "summary": summary,
            "effect": _require_string(action.get("effect"), "action.effect"),
            "input_schema_ref": input_schema_ref,
            "output_schema_ref": output_schema_ref,
        },
        "mcp": {
            "name": _text(mcp.get("tool_name")) or action_id,
            "description": summary,
            "command": _text(mcp.get("command")) or command,
            "surface_kind": _text(mcp.get("surface_kind")) or surface_kind,
            "input_schema_ref": input_schema_ref,
            "output_schema_ref": output_schema_ref,
            "public_runtime": bool(mcp.get("public_runtime", True)),
            "descriptor_only": bool(mcp.get("descriptor_only", False)),
        },
        "skill": {
            "command_contract_id": _text(skill.get("command_contract_id")) or action_id,
            "action_id": action_id,
            "command": command,
            "surface_kind": surface_kind,
            "summary": summary,
            "required_fields": workspace_locator_fields,
            "effect": _require_string(action.get("effect"), "action.effect"),
        },
        "product_entry": {
            "action_key": _text(product_entry.get("action_key")) or action_id,
            "command": _text(product_entry.get("command")) or command,
            "surface_kind": _text(product_entry.get("surface_kind")) or surface_kind,
            "summary": summary,
            "requires": workspace_locator_fields,
        },
        "openai": {
            "type": "function",
            "function": {
                "name": _text(openai.get("tool_name")) or action_id,
                "description": summary,
                "parameters": {
                    "type": "object",
                    "additionalProperties": True,
                    "schema_ref": input_schema_ref,
                },
            },
        },
        "ai-sdk": {
            "name": _text(ai_sdk.get("tool_name")) or action_id,
            "description": summary,
            "inputSchemaRef": input_schema_ref,
            "outputSchemaRef": output_schema_ref,
            "command": command,
        },
    }


def project_family_action_catalog(catalog: Mapping[str, Any], export_format: FamilyActionExportFormat) -> list[dict[str, Any]]:
    normalized_format = _require_string(export_format, "export_format")
    if normalized_format not in {"cli", "mcp", "skill", "openai", "ai-sdk"}:
        raise ValueError(f"family action catalog 不支持 export_format: {normalized_format}")
    actions = catalog.get("actions")
    if not isinstance(actions, Sequence) or isinstance(actions, (str, bytes, bytearray)):
        raise ValueError("family action catalog 缺少 actions")
    return [
        _projection_for_action(action)[normalized_format]
        for action in actions
        if isinstance(action, Mapping)
    ]


def validate_family_action_catalog_parity(catalog: Mapping[str, Any]) -> dict[str, Any]:
    issues: list[str] = []
    actions = catalog.get("actions")
    if not isinstance(actions, Sequence) or isinstance(actions, (str, bytes, bytearray)):
        issues.append("actions missing")
        actions = []
    for action in actions:
        if not isinstance(action, Mapping):
            issues.append("action is not a mapping")
            continue
        source = _source_command(action)
        projection = _projection_for_action(action)
        if projection["cli"]["command"] != _require_string(source.get("command"), "source_command.command"):
            issues.append(f"{projection['cli']['action_id']}: cli command diverges from source command")
        if projection["product_entry"]["command"] != projection["cli"]["command"]:
            issues.append(f"{projection['cli']['action_id']}: product-entry command diverges from cli command")
    return {
        "surface_kind": "family_action_catalog_parity",
        "status": "aligned" if not issues else "drift_detected",
        "issues": issues,
    }


buildFamilyAction = build_family_action
buildFamilyActionCatalog = build_family_action_catalog
projectFamilyActionCatalog = project_family_action_catalog
validateFamilyActionCatalogParity = validate_family_action_catalog_parity
