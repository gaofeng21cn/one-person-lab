from __future__ import annotations

from typing import Any, Mapping


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"family entry contract 缺少字符串字段: {field}")
    return text


def _require_bool(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"family entry contract 缺少布尔字段: {field}")
    return value


def _require_mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"family entry contract 缺少对象字段: {field}")
    return value


def _require_string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"family entry contract 缺少数组字段: {field}")
    return [_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value)]


def _read_optional_string_list(value: object, field: str) -> list[str] | None:
    if value is None:
        return None
    return _require_string_list(value, field)


def _merge_extra_payload(base: dict[str, Any], extra_payload: object | None, *, field: str) -> dict[str, Any]:
    if extra_payload is None:
        return base
    payload = dict(_require_mapping(extra_payload, field))
    for key in payload:
        if key in base:
            raise ValueError(f"family entry contract extra_payload 不允许覆盖核心字段: {field}.{key}")
    return {
        **base,
        **payload,
    }


def _omit_keys(payload: Mapping[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    excluded = set(keys)
    return {key: value for key, value in payload.items() if key not in excluded}


def build_domain_entry_command_contract(
    *,
    command: str,
    required_fields: list[str],
    optional_fields: list[str] | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    return _merge_extra_payload(
        {
            "command": _require_string(command, "command"),
            "required_fields": _require_string_list(required_fields, "required_fields"),
            "optional_fields": _read_optional_string_list(optional_fields, "optional_fields") or [],
        },
        extra_payload,
        field="command_contract",
    )


def validate_family_domain_entry_contract(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    supported_commands = _require_string_list(
        payload.get("supported_commands"),
        f"{field}.supported_commands",
    )
    raw_command_contracts = payload.get("command_contracts")
    if not isinstance(raw_command_contracts, list) or not raw_command_contracts:
        raise ValueError(f"family entry contract 缺少数组字段: {field}.command_contracts")
    command_contracts = [
        build_domain_entry_command_contract(
            command=_require_mapping(contract, f"{field}.command_contracts[{index}]").get("command"),  # type: ignore[arg-type]
            required_fields=_require_mapping(contract, f"{field}.command_contracts[{index}]").get("required_fields"),  # type: ignore[arg-type]
            optional_fields=_require_mapping(contract, f"{field}.command_contracts[{index}]").get("optional_fields"),  # type: ignore[arg-type]
            extra_payload=_omit_keys(
                _require_mapping(contract, f"{field}.command_contracts[{index}]"),
                ("command", "required_fields", "optional_fields"),
            ),
        )
        for index, contract in enumerate(raw_command_contracts)
    ]
    normalized = {
        **dict(payload),
        "entry_adapter": _require_string(payload.get("entry_adapter"), f"{field}.entry_adapter"),
        "service_safe_surface_kind": _require_string(
            payload.get("service_safe_surface_kind"),
            f"{field}.service_safe_surface_kind",
        ),
        "product_entry_builder_command": _require_string(
            payload.get("product_entry_builder_command"),
            f"{field}.product_entry_builder_command",
        ),
        "supported_commands": supported_commands,
        "command_contracts": command_contracts,
    }
    supported_entry_modes = _read_optional_string_list(
        payload.get("supported_entry_modes"),
        f"{field}.supported_entry_modes",
    )
    if supported_entry_modes is not None:
        normalized["supported_entry_modes"] = supported_entry_modes
    product_entry_kind = _non_empty_text(payload.get("product_entry_kind"))
    if product_entry_kind is not None:
        normalized["product_entry_kind"] = product_entry_kind
    return normalized


def build_family_domain_entry_contract(
    *,
    entry_adapter: str,
    service_safe_surface_kind: str,
    product_entry_builder_command: str,
    supported_commands: list[str],
    command_contracts: list[Mapping[str, Any]],
    supported_entry_modes: list[str] | None = None,
    product_entry_kind: str | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "entry_adapter": _require_string(entry_adapter, "entry_adapter"),
        "service_safe_surface_kind": _require_string(
            service_safe_surface_kind,
            "service_safe_surface_kind",
        ),
        "product_entry_builder_command": _require_string(
            product_entry_builder_command,
            "product_entry_builder_command",
        ),
        "supported_commands": _require_string_list(supported_commands, "supported_commands"),
        "command_contracts": [
            build_domain_entry_command_contract(
                command=_require_mapping(contract, f"command_contracts[{index}]").get("command"),  # type: ignore[arg-type]
                required_fields=_require_mapping(contract, f"command_contracts[{index}]").get("required_fields"),  # type: ignore[arg-type]
                optional_fields=_require_mapping(contract, f"command_contracts[{index}]").get("optional_fields"),  # type: ignore[arg-type]
                extra_payload=_omit_keys(
                    _require_mapping(contract, f"command_contracts[{index}]"),
                    ("command", "required_fields", "optional_fields"),
                ),
            )
            for index, contract in enumerate(command_contracts)
        ],
    }
    if supported_entry_modes is not None:
        base["supported_entry_modes"] = _require_string_list(
            supported_entry_modes,
            "supported_entry_modes",
        )
    if _non_empty_text(product_entry_kind) is not None:
        base["product_entry_kind"] = _non_empty_text(product_entry_kind)
    return validate_family_domain_entry_contract(
        _merge_extra_payload(base, extra_payload, field="domain_entry_contract"),
        "domain_entry_contract",
    )


def validate_gateway_interaction_contract(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        **dict(payload),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "frontdoor_owner": _require_string(payload.get("frontdoor_owner"), f"{field}.frontdoor_owner"),
        "user_interaction_mode": _require_string(
            payload.get("user_interaction_mode"),
            f"{field}.user_interaction_mode",
        ),
        "user_commands_required": _require_bool(
            payload.get("user_commands_required"),
            f"{field}.user_commands_required",
        ),
        "command_surfaces_for_agent_consumption_only": _require_bool(
            payload.get("command_surfaces_for_agent_consumption_only"),
            f"{field}.command_surfaces_for_agent_consumption_only",
        ),
        "shared_downstream_entry": _require_string(
            payload.get("shared_downstream_entry"),
            f"{field}.shared_downstream_entry",
        ),
        "shared_handoff_envelope": _require_string_list(
            payload.get("shared_handoff_envelope"),
            f"{field}.shared_handoff_envelope",
        ),
    }


def build_gateway_interaction_contract(
    *,
    frontdoor_owner: str,
    user_interaction_mode: str,
    user_commands_required: bool,
    command_surfaces_for_agent_consumption_only: bool,
    shared_downstream_entry: str,
    shared_handoff_envelope: list[str],
    surface_kind: str = "gateway_interaction_contract",
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    return validate_gateway_interaction_contract(
        _merge_extra_payload(
            {
                "surface_kind": _require_string(surface_kind, "surface_kind"),
                "frontdoor_owner": _require_string(frontdoor_owner, "frontdoor_owner"),
                "user_interaction_mode": _require_string(
                    user_interaction_mode,
                    "user_interaction_mode",
                ),
                "user_commands_required": _require_bool(
                    user_commands_required,
                    "user_commands_required",
                ),
                "command_surfaces_for_agent_consumption_only": _require_bool(
                    command_surfaces_for_agent_consumption_only,
                    "command_surfaces_for_agent_consumption_only",
                ),
                "shared_downstream_entry": _require_string(
                    shared_downstream_entry,
                    "shared_downstream_entry",
                ),
                "shared_handoff_envelope": _require_string_list(
                    shared_handoff_envelope,
                    "shared_handoff_envelope",
                ),
            },
            extra_payload,
            field="gateway_interaction_contract",
        ),
        "gateway_interaction_contract",
    )


def validate_shared_handoff_builder(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    normalized = {
        **dict(payload),
        "command": _require_string(payload.get("command"), f"{field}.command"),
        "entry_mode": _require_string(payload.get("entry_mode"), f"{field}.entry_mode"),
    }
    surface_kind = _non_empty_text(payload.get("surface_kind"))
    if surface_kind is not None:
        normalized["surface_kind"] = surface_kind
    return normalized


def build_shared_handoff_builder(
    *,
    command: str,
    entry_mode: str,
    surface_kind: str | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "command": _require_string(command, "command"),
        "entry_mode": _require_string(entry_mode, "entry_mode"),
    }
    normalized_surface_kind = _non_empty_text(surface_kind)
    if normalized_surface_kind is not None:
        base["surface_kind"] = normalized_surface_kind
    return validate_shared_handoff_builder(
        _merge_extra_payload(base, extra_payload, field="shared_handoff_builder"),
        "shared_handoff_builder",
    )


def validate_shared_handoff_return_surface(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    return {
        **dict(payload),
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "target_domain_id": _require_string(payload.get("target_domain_id"), f"{field}.target_domain_id"),
    }


def build_shared_handoff_return_surface(
    *,
    surface_kind: str,
    target_domain_id: str,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    return validate_shared_handoff_return_surface(
        _merge_extra_payload(
            {
                "surface_kind": _require_string(surface_kind, "surface_kind"),
                "target_domain_id": _require_string(target_domain_id, "target_domain_id"),
            },
            extra_payload,
            field="shared_handoff_return_surface",
        ),
        "shared_handoff_return_surface",
    )
