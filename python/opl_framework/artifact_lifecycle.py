from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


_FORBIDDEN_BODY_KEY_PARTS = (
    ("artifact", "body"),
    ("artifact", "content"),
    ("artifact", "payload"),
    ("evidence", "body"),
    ("package", "body"),
    ("package", "content"),
    ("package", "payload"),
    ("private", "evidence"),
)


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise ValueError(f"{field} must be a string list")
    result: list[str] = []
    for index, item in enumerate(value):
        normalized = _text(item, f"{field}[{index}]")
        if normalized not in result:
            result.append(normalized)
    return result


def _normalize_key(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def _walk(value: Any, root: str) -> list[tuple[str, str, Any]]:
    entries: list[tuple[str, str, Any]] = []
    if isinstance(value, Mapping):
        for raw_key, child in value.items():
            key = _text(raw_key, f"{root}.key")
            path = f"{root}.{key}"
            entries.append((path, key, child))
            entries.extend(_walk(child, path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            entries.extend(_walk(child, f"{root}[{index}]"))
    return entries


def _reject_forbidden_payload(
    value: Mapping[str, Any],
    *,
    field: str,
    forbidden_claim_keys: set[str],
    forbidden_write_keys: set[str],
) -> None:
    for path, key, child in _walk(value, field):
        normalized = _normalize_key(key)
        if normalized in forbidden_claim_keys and bool(child):
            raise ValueError(f"{path} cannot claim domain export or readiness authority")
        if normalized in forbidden_write_keys and bool(child):
            raise ValueError(f"{path} cannot authorize artifact or package writes")
        if any(all(part in normalized for part in parts) for parts in _FORBIDDEN_BODY_KEY_PARTS):
            raise ValueError(f"{path} contains an artifact body or private evidence field")
        if isinstance(child, str):
            token = _normalize_key(child)
            if "private_evidence" in token or "package_body" in token or "artifact_body" in token:
                raise ValueError(f"{path} contains an artifact body or private evidence token")


def _ref_mapping(value: object, field: str) -> dict[str, str | list[str]]:
    payload = _mapping(value, field)
    if not payload:
        raise ValueError(f"{field} must contain at least one ref")
    refs: dict[str, str | list[str]] = {}
    for raw_key, raw_value in payload.items():
        key = _text(raw_key, f"{field}.key")
        if isinstance(raw_value, str):
            refs[key] = _text(raw_value, f"{field}.{key}")
        elif isinstance(raw_value, Sequence) and not isinstance(raw_value, (str, bytes)):
            refs[key] = _string_list(raw_value, f"{field}.{key}")
        else:
            raise ValueError(f"{field}.{key} must be a ref string or string list")
    return refs


def _required_ref(refs: Mapping[str, str | list[str]], key: str, field: str = "package_refs") -> str:
    value = refs.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field}.{key} is required")
    return value


def _optional_ref(value: object, field: str) -> str | None:
    if value is None:
        return None
    return _text(value, field)


def _owner_closeout_ref(receipt_refs: Mapping[str, str | list[str]], keys: Sequence[str]) -> str:
    for key in keys:
        value = receipt_refs.get(key)
        if isinstance(value, str) and value:
            return value
    raise ValueError("receipt_refs requires an owner receipt, typed blocker, or lifecycle receipt ref")


def build_refs_only_artifact_lifecycle_handoff(
    *,
    profile: Mapping[str, Any],
    package_refs: Mapping[str, Any],
    gap_report: Mapping[str, Any],
    verdict_refs: Mapping[str, Any],
    manual_boundary: Mapping[str, Any],
    receipt_refs: Mapping[str, Any],
    verdict_source: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    profile = _mapping(profile, "profile")
    required_fields = (
        "surface_kind",
        "state",
        "domain_id",
        "stage_id",
        "required_package_ref_keys",
        "locator_ref_keys",
        "artifact_roles",
        "stage_artifact_contract_ref",
        "authority_boundary",
        "projection_policy",
        "forbidden_claim_keys",
        "forbidden_write_keys",
    )
    for field in required_fields:
        if field not in profile:
            raise ValueError(f"profile.{field} is required")
    claims = {_normalize_key(key) for key in _string_list(profile["forbidden_claim_keys"], "profile.forbidden_claim_keys")}
    writes = {_normalize_key(key) for key in _string_list(profile["forbidden_write_keys"], "profile.forbidden_write_keys")}
    payloads = {
        "package_refs": _mapping(package_refs, "package_refs"),
        "gap_report": _mapping(gap_report, "gap_report"),
        "verdict_refs": _mapping(verdict_source if verdict_source is not None else verdict_refs, "verdict_source"),
        "manual_boundary": _mapping(manual_boundary, "manual_boundary"),
        "receipt_refs": _mapping(receipt_refs, "receipt_refs"),
    }
    for field, payload in payloads.items():
        _reject_forbidden_payload(payload, field=field, forbidden_claim_keys=claims, forbidden_write_keys=writes)

    normalized_package_refs = _ref_mapping(package_refs, "package_refs")
    normalized_receipt_refs = _ref_mapping(receipt_refs, "receipt_refs")
    required_keys = _string_list(profile["required_package_ref_keys"], "profile.required_package_ref_keys")
    for key in required_keys:
        _required_ref(normalized_package_refs, key)
    locator_keys = _string_list(profile["locator_ref_keys"], "profile.locator_ref_keys")
    locators = {key: _required_ref(normalized_package_refs, key) for key in locator_keys}
    roles = _mapping(profile["artifact_roles"], "profile.artifact_roles")
    artifact_bundle_key = _text(roles.get("artifact_bundle_ref_key"), "profile.artifact_roles.artifact_bundle_ref_key")
    final_package_key = _text(roles.get("final_package_ref_key"), "profile.artifact_roles.final_package_ref_key")
    export_package_key = _text(roles.get("export_package_ref_key"), "profile.artifact_roles.export_package_ref_key")
    canonical_pointer_key = _text(roles.get("canonical_pointer_ref_key"), "profile.artifact_roles.canonical_pointer_ref_key")
    export_artifact_key = _text(roles.get("export_artifact_ref_key"), "profile.artifact_roles.export_artifact_ref_key")
    closeout_keys = _string_list(
        profile.get("owner_closeout_ref_keys", ["owner_receipt_ref", "typed_blocker_ref", "lifecycle_receipt_ref"]),
        "profile.owner_closeout_ref_keys",
    )
    stage_contract_ref = _text(profile["stage_artifact_contract_ref"], "profile.stage_artifact_contract_ref")
    stage_export_package_field = _text(
        profile.get("stage_export_package_field", "export_package"),
        "profile.stage_export_package_field",
    )
    verdict_output_field = _text(
        profile.get("verdict_output_field", "verdict_refs"),
        "profile.verdict_output_field",
    )
    manual_boundary_output_field = _text(
        profile.get("manual_boundary_output_field", "manual_boundary"),
        "profile.manual_boundary_output_field",
    )
    conformance_surface_kind = _text(
        profile.get("conformance_surface_kind", "domain_stage_physical_kernel_conformance_refs"),
        "profile.conformance_surface_kind",
    )
    physical_locator_roles = _string_list(
        profile.get("artifact_bundle_physical_locator_roles", []),
        "profile.artifact_bundle_physical_locator_roles",
    )
    gap = _mapping(gap_report, "gap_report")
    manual = _mapping(manual_boundary, "manual_boundary")
    verdict = _ref_mapping(verdict_refs, "verdict_refs")
    domain_id = _text(profile["domain_id"], "profile.domain_id")
    stage_id = _text(profile["stage_id"], "profile.stage_id")
    authority = dict(_mapping(profile["authority_boundary"], "profile.authority_boundary"))
    if not authority:
        raise ValueError("profile.authority_boundary must not be empty")
    conformance_summary_key = _text(
        profile.get("conformance_summary_ref_key", "conformance_summary_ref"),
        "profile.conformance_summary_ref_key",
    )
    stage_projection = {
        "surface_kind": _text(
            profile.get("stage_projection_surface_kind", "domain_stage_folder_lifecycle_projection"),
            "profile.stage_projection_surface_kind",
        ),
        "stage_id": stage_id,
        "artifact_bundle": {
            "ref": _required_ref(normalized_package_refs, artifact_bundle_key),
            "lifecycle_contract_role": _text(roles.get("artifact_bundle_lifecycle_role"), "profile.artifact_roles.artifact_bundle_lifecycle_role"),
            "stage_output_role": _text(roles.get("artifact_bundle_stage_output_role"), "profile.artifact_roles.artifact_bundle_stage_output_role"),
            **({"physical_locator_roles": physical_locator_roles} if physical_locator_roles else {}),
        },
        "final_package": {
            "ref": _required_ref(normalized_package_refs, final_package_key),
            "lifecycle_contract_role": _text(roles.get("final_package_lifecycle_role"), "profile.artifact_roles.final_package_lifecycle_role"),
            "canonical_pointer_ref": _required_ref(normalized_package_refs, canonical_pointer_key),
        },
        stage_export_package_field: {
            "ref": _required_ref(normalized_package_refs, export_package_key),
            "lifecycle_contract_role": _text(roles.get("export_package_lifecycle_role"), "profile.artifact_roles.export_package_lifecycle_role"),
            "export_artifact_ref": _required_ref(normalized_package_refs, export_artifact_key),
        },
        "physical_kernel_locators": locators,
        "physical_kernel_conformance_refs": {
            "surface_kind": conformance_surface_kind,
            "opl_contract_ref": stage_contract_ref,
            "opl_conformance_contract_ref": f"{stage_contract_ref}#/conformance_gate",
            "conformance_summary_ref": _required_ref(normalized_package_refs, conformance_summary_key),
            "domain_readiness_claim": False,
        },
        "owner_receipt_or_typed_blocker_ref": _owner_closeout_ref(normalized_receipt_refs, closeout_keys),
        "missing_output_policy": "typed_blocker_required_no_opl_inference",
        "handoff_policy": _text(
            profile.get("handoff_policy", "refs_manifest_missing_output_receipt_blocker_handoff_only"),
            "profile.handoff_policy",
        ),
        "authority_boundary": authority,
    }
    manual_projection = {
        key: _text(value, f"manual_boundary.{key}")
        for key, value in manual.items()
    }
    return {
        "surface_kind": _text(profile["surface_kind"], "profile.surface_kind"),
        "version": _text(profile.get("version", "v1"), "profile.version"),
        "state": _text(profile["state"], "profile.state"),
        "owner": domain_id,
        "target_domain_id": domain_id,
        "package_refs": normalized_package_refs,
        "physical_kernel_locator_refs": locators,
        "physical_kernel_conformance_refs": stage_projection["physical_kernel_conformance_refs"],
        "stage_folder_lifecycle_projection": stage_projection,
        "gap_summary": {
            "gap_report_ref": _text(gap.get("gap_report_ref"), "gap_report.gap_report_ref"),
            "state": _optional_ref(gap.get("state"), "gap_report.state"),
            "summary": _text(gap.get("summary"), "gap_report.summary"),
            "gap_refs": _string_list(gap.get("gap_refs", []), "gap_report.gap_refs"),
        },
        verdict_output_field: verdict,
        manual_boundary_output_field: manual_projection,
        "receipt_refs": normalized_receipt_refs,
        "authority_boundary": authority,
        "projection_policy": _text(profile["projection_policy"], "profile.projection_policy"),
    }


build_refs_only_lifecycle_handoff = build_refs_only_artifact_lifecycle_handoff


__all__ = [
    "build_refs_only_artifact_lifecycle_handoff",
    "build_refs_only_lifecycle_handoff",
]
