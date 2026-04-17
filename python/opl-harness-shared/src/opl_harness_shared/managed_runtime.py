from __future__ import annotations

from dataclasses import dataclass
from importlib import resources
import json
from pathlib import Path
from typing import Any, Mapping


MANAGED_RUNTIME_THREE_LAYER_CONTRACT_REF = "contracts/opl-gateway/managed-runtime-three-layer-contract.json"


@dataclass(frozen=True)
class ManagedRuntimeThreeLayerContract:
    contract_ref: str
    contract_id: str
    required_owner_fields: tuple[str, ...]
    required_surface_locator_fields: tuple[str, ...]
    canonical_fail_closed_rules: tuple[str, ...]


def _non_empty_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _non_empty_text(value)
    if text is None:
        raise ValueError(f"managed runtime contract 缺少字符串字段: {field}")
    return text


def _require_string_list(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise ValueError(f"managed runtime contract 缺少数组字段: {field}")
    normalized = tuple(_require_string(entry, f"{field}[{index}]") for index, entry in enumerate(value))
    return normalized


def _require_mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"managed runtime contract 缺少对象字段: {field}")
    return value


def _normalize_surface(value: object, field: str) -> dict[str, str]:
    payload = _require_mapping(value, field)
    return {
        "surface_kind": _require_string(payload.get("surface_kind"), f"{field}.surface_kind"),
        "owner": _require_string(payload.get("owner"), f"{field}.owner"),
    }


def read_managed_runtime_three_layer_contract(path: str | Path) -> ManagedRuntimeThreeLayerContract:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("managed runtime three-layer contract 必须是 object")
    return ManagedRuntimeThreeLayerContract(
        contract_ref=_require_string(payload.get("contract_ref"), "contract_ref"),
        contract_id=_require_string(payload.get("contract_id"), "contract_id"),
        required_owner_fields=_require_string_list(payload.get("required_owner_fields"), "required_owner_fields"),
        required_surface_locator_fields=_require_string_list(
            payload.get("required_surface_locator_fields"),
            "required_surface_locator_fields",
        ),
        canonical_fail_closed_rules=_require_string_list(
            payload.get("canonical_fail_closed_rules"),
            "canonical_fail_closed_rules",
        ),
    )


def read_bundled_managed_runtime_three_layer_contract() -> ManagedRuntimeThreeLayerContract:
    resource = resources.files("opl_harness_shared.contracts").joinpath("managed-runtime-three-layer-contract.json")
    return read_managed_runtime_three_layer_contract(resource)


def validate_managed_runtime_contract(
    payload: object,
    *,
    contract: ManagedRuntimeThreeLayerContract | None = None,
    expected_domain_owner: str | None = None,
    expected_executor_owner: str | None = None,
) -> dict[str, Any]:
    shared_contract = contract or read_bundled_managed_runtime_three_layer_contract()
    if not isinstance(payload, Mapping):
        raise ValueError("managed runtime contract 必须是 object")
    normalized = {
        "shared_contract_ref": _require_string(payload.get("shared_contract_ref"), "shared_contract_ref"),
        "runtime_owner": _require_string(payload.get("runtime_owner"), "runtime_owner"),
        "domain_owner": _require_string(payload.get("domain_owner"), "domain_owner"),
        "executor_owner": _require_string(payload.get("executor_owner"), "executor_owner"),
        "supervision_status_surface": _normalize_surface(
            payload.get("supervision_status_surface"),
            "supervision_status_surface",
        ),
        "attention_queue_surface": _normalize_surface(
            payload.get("attention_queue_surface"),
            "attention_queue_surface",
        ),
        "recovery_contract_surface": _normalize_surface(
            payload.get("recovery_contract_surface"),
            "recovery_contract_surface",
        ),
        "fail_closed_rules": list(_require_string_list(payload.get("fail_closed_rules"), "fail_closed_rules")),
    }
    if normalized["shared_contract_ref"] != shared_contract.contract_ref:
        raise ValueError("managed runtime contract shared_contract_ref 与共享 contract 不一致")
    if normalized["fail_closed_rules"] != list(shared_contract.canonical_fail_closed_rules):
        raise ValueError("managed runtime contract fail_closed_rules 与共享 contract 不一致")
    if expected_domain_owner is not None and normalized["domain_owner"] != expected_domain_owner:
        raise ValueError("managed runtime contract domain_owner 与预期不一致")
    if expected_executor_owner is not None and normalized["executor_owner"] != expected_executor_owner:
        raise ValueError("managed runtime contract executor_owner 与预期不一致")
    return normalized


def build_managed_runtime_contract(
    *,
    domain_owner: str,
    executor_owner: str,
    supervision_status_surface: str,
    attention_queue_surface: str,
    recovery_contract_surface: str,
    runtime_owner: str = "upstream_hermes_agent",
    contract: ManagedRuntimeThreeLayerContract | None = None,
) -> dict[str, Any]:
    resolved_domain_owner = _require_string(domain_owner, "domain_owner")
    shared_contract = contract or read_bundled_managed_runtime_three_layer_contract()
    return validate_managed_runtime_contract(
        {
            "shared_contract_ref": shared_contract.contract_ref,
            "runtime_owner": _require_string(runtime_owner, "runtime_owner"),
            "domain_owner": resolved_domain_owner,
            "executor_owner": _require_string(executor_owner, "executor_owner"),
            "supervision_status_surface": {
                "surface_kind": _require_string(supervision_status_surface, "supervision_status_surface"),
                "owner": resolved_domain_owner,
            },
            "attention_queue_surface": {
                "surface_kind": _require_string(attention_queue_surface, "attention_queue_surface"),
                "owner": resolved_domain_owner,
            },
            "recovery_contract_surface": {
                "surface_kind": _require_string(recovery_contract_surface, "recovery_contract_surface"),
                "owner": resolved_domain_owner,
            },
            "fail_closed_rules": list(shared_contract.canonical_fail_closed_rules),
        },
        contract=shared_contract,
        expected_domain_owner=resolved_domain_owner,
        expected_executor_owner=executor_owner,
    )
