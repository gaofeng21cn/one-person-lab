from __future__ import annotations

from typing import Any, Mapping

from .internal import (
    _FRONTDESK_SHARED_HANDOFF_KEYS,
    _clone_mapping,
    _merge_extra_payload,
    _non_empty_text,
    _normalize_operator_loop_action,
    _normalize_product_entry_shell_surface,
    _require_bool,
    _require_mapping,
    _require_string,
    _require_string_list,
    _validate_shared_handoff,
    _validate_shared_handoff_builder,
)

def validate_family_frontdoor_entry_surfaces(value: object, field: str) -> dict[str, Any]:
    payload = _require_mapping(value, field)
    normalized: dict[str, Any] = {
        key: _clone_mapping(entry, f"{field}.{key}")
        for key, entry in payload.items()
    }
    for key in _FRONTDESK_SHARED_HANDOFF_KEYS:
        if payload.get(key) is not None:
            normalized[key] = _validate_shared_handoff_builder(
                payload.get(key),
                f"{field}.{key}",
            )
    return normalized


def build_family_frontdoor_entry_surfaces(
    *,
    product_entry_shell: Mapping[str, Any],
    shell_aliases: Mapping[str, str],
    shared_handoff: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    product_entry_shell_payload = _clone_mapping(product_entry_shell, "product_entry_shell")
    shell_alias_payload = _clone_mapping(shell_aliases, "shell_aliases")
    payload: dict[str, Any] = {}

    for entry_key, raw_shell_key in shell_alias_payload.items():
        shell_key = _require_string(raw_shell_key, f"shell_aliases.{entry_key}")
        payload[entry_key] = _clone_mapping(
            product_entry_shell_payload.get(shell_key),
            f"product_entry_shell.{shell_key}",
        )

    if shared_handoff is not None:
        shared_handoff_payload = _validate_shared_handoff(shared_handoff, "shared_handoff")
        for key in _FRONTDESK_SHARED_HANDOFF_KEYS:
            if shared_handoff_payload.get(key) is not None:
                payload[key] = _validate_shared_handoff_builder(
                    shared_handoff_payload.get(key),
                    f"shared_handoff.{key}",
                )

    return validate_family_frontdoor_entry_surfaces(payload, "entry_surfaces")


def validate_family_frontdesk_entry_surfaces(value: object, field: str) -> dict[str, Any]:
    return validate_family_frontdoor_entry_surfaces(value, field)


def build_family_frontdesk_entry_surfaces(
    *,
    product_entry_shell: Mapping[str, Any],
    shell_aliases: Mapping[str, str],
    shared_handoff: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    return build_family_frontdoor_entry_surfaces(
        product_entry_shell=product_entry_shell,
        shell_aliases=shell_aliases,
        shared_handoff=shared_handoff,
    )


def build_product_entry_shell_surface(
    *,
    command: str,
    surface_kind: str,
    summary: str | None = None,
    purpose: str | None = None,
    command_template: str | None = None,
    requires: list[str] | None = None,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "command": _require_string(command, "command"),
        "surface_kind": _require_string(surface_kind, "surface_kind"),
    }
    if _non_empty_text(summary) is not None:
        payload["summary"] = _require_string(summary, "summary")
    if _non_empty_text(purpose) is not None:
        payload["purpose"] = _require_string(purpose, "purpose")
    if _non_empty_text(command_template) is not None:
        payload["command_template"] = _require_string(command_template, "command_template")
    if requires is not None:
        payload["requires"] = _require_string_list(requires, "requires")
    return _normalize_product_entry_shell_surface(
        _merge_extra_payload(payload, extra_payload, surface_kind="product entry shell surface"),
        "product_entry_shell_surface",
    )


def build_product_entry_shell_catalog(
    shell_surfaces: Mapping[str, Any],
) -> dict[str, Any]:
    payload = _clone_mapping(shell_surfaces, "product_entry_shell")
    catalog: dict[str, Any] = {}
    for key, value in payload.items():
        normalized = _normalize_product_entry_shell_surface(value, f"product_entry_shell.{key}")
        catalog[key] = build_product_entry_shell_surface(
            command=normalized["command"],
            surface_kind=normalized["surface_kind"],
            summary=normalized.get("summary"),
            purpose=normalized.get("purpose"),
            command_template=normalized.get("command_template"),
            requires=normalized.get("requires"),
            extra_payload={
                extra_key: extra_value
                for extra_key, extra_value in normalized.items()
                if extra_key not in {"command", "surface_kind", "summary", "purpose", "command_template", "requires"}
            }
            or None,
        )
    return catalog


def build_product_entry_shell_linked_surface(
    *,
    shell_key: str,
    shell_surface: Mapping[str, Any],
    summary: str,
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_shell_surface = _normalize_product_entry_shell_surface(shell_surface, "shell_surface")
    return _merge_extra_payload(
        {
            "shell_key": _require_string(shell_key, "shell_key"),
            "command": normalized_shell_surface["command"],
            "surface_kind": normalized_shell_surface["surface_kind"],
            "summary": _require_string(summary, "summary"),
        },
        extra_payload,
        surface_kind="product entry shell linked surface",
    )


def build_operator_loop_action(
    *,
    command: str,
    surface_kind: str,
    summary: str,
    requires: list[str],
    extra_payload: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    return _normalize_operator_loop_action(
        _merge_extra_payload(
            {
                "command": _require_string(command, "command"),
                "surface_kind": _require_string(surface_kind, "surface_kind"),
                "summary": _require_string(summary, "summary"),
                "requires": _require_string_list(requires, "requires"),
            },
            extra_payload,
            surface_kind="operator loop action",
        ),
        "operator_loop_action",
    )


def build_operator_loop_action_catalog(
    actions: Mapping[str, Any],
) -> dict[str, Any]:
    payload = _clone_mapping(actions, "operator_loop_actions")
    catalog: dict[str, Any] = {}
    for key, value in payload.items():
        normalized = _normalize_operator_loop_action(value, f"operator_loop_actions.{key}")
        catalog[key] = build_operator_loop_action(
            command=normalized["command"],
            surface_kind=normalized["surface_kind"],
            summary=normalized["summary"],
            requires=normalized["requires"],
            extra_payload={
                extra_key: extra_value
                for extra_key, extra_value in normalized.items()
                if extra_key not in {"command", "surface_kind", "summary", "requires"}
            }
            or None,
        )
    return catalog

