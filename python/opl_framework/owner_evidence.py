from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _bool(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{field} must be a boolean")
    return value


def _int(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field} must be a non-negative integer")
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


def _false_write_proof(value: object, field: str = "forbidden_write_proof") -> dict[str, bool]:
    proof = _mapping(value, field)
    if not proof:
        raise ValueError(f"{field} must not be empty")
    normalized: dict[str, bool] = {}
    for key, raw in proof.items():
        normalized[_text(key, f"{field}.key")] = _bool(raw, f"{field}.{key}")
    if any(normalized.values()):
        raise ValueError(f"{field} must prove every forbidden write is false")
    return normalized


def _profile(value: Mapping[str, Any], required: Sequence[str]) -> Mapping[str, Any]:
    profile = _mapping(value, "profile")
    for field in required:
        if field not in profile:
            raise ValueError(f"profile.{field} is required")
    return profile


def _count_by(items: Sequence[Mapping[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for index, item in enumerate(items):
        value = _text(item.get(key), f"items[{index}].{key}")
        counts[value] = counts.get(value, 0) + 1
    return counts


def _inventory_payload(value: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = _mapping(value, "inventory")
    nested = payload.get("receipt_reconciliation_inventory")
    return _mapping(nested, "receipt_reconciliation_inventory") if nested is not None else payload


def _authority(value: object, field: str) -> dict[str, Any]:
    authority = dict(_mapping(value, field))
    if not authority:
        raise ValueError(f"{field} must not be empty")
    return authority


def _ledger(value: object, field: str = "opl_ledger") -> dict[str, Any]:
    raw = _mapping(value, field)
    writes = _bool(raw.get("domain_writes_opl_ledger"), f"{field}.domain_writes_opl_ledger")
    holds_truth = _bool(raw.get("opl_holds_domain_truth"), f"{field}.opl_holds_domain_truth")
    if writes or holds_truth:
        raise ValueError(f"{field} must remain refs-only and cannot hold domain truth")
    return {
        "ledger_ref": _text(raw.get("ledger_ref"), f"{field}.ledger_ref"),
        "role": _text(raw.get("role"), f"{field}.role"),
        "domain_writes_opl_ledger": False,
        "opl_holds_domain_truth": False,
    }


def _normalize_item(item: Mapping[str, Any], index: int, shapes: set[str], statuses: set[str]) -> dict[str, Any]:
    shape = _text(item.get("receipt_shape"), f"items[{index}].receipt_shape")
    status = _text(item.get("reconciliation_status"), f"items[{index}].reconciliation_status")
    if shape not in shapes:
        raise ValueError(f"items[{index}].receipt_shape is not allowed: {shape}")
    if status not in statuses:
        raise ValueError(f"items[{index}].reconciliation_status is not allowed: {status}")
    return {
        "receipt_ref": _text(item.get("receipt_ref"), f"items[{index}].receipt_ref"),
        "receipt_shape": shape,
        "stage_id": _text(item.get("stage_id"), f"items[{index}].stage_id"),
        "source_ref": _text(item.get("source_ref"), f"items[{index}].source_ref"),
        "reconciliation_status": status,
        "receipt_ref_matches_domain_handler": item.get("receipt_ref_matches_domain_handler"),
        "opl_ledger_ref_matches_receipt_source": _bool(
            item.get("opl_ledger_ref_matches_receipt_source"),
            f"items[{index}].opl_ledger_ref_matches_receipt_source",
        ),
        "typed_blocker_present": _bool(item.get("typed_blocker_present"), f"items[{index}].typed_blocker_present"),
        "no_regression_evidence_refs": _string_list(
            item.get("no_regression_evidence_refs", []),
            f"items[{index}].no_regression_evidence_refs",
        ),
        "authority_boundary": _authority(item.get("authority_boundary"), f"items[{index}].authority_boundary"),
    }


def build_owner_evidence_observability_summary(
    inventory: Mapping[str, Any],
    *,
    profile: Mapping[str, Any],
) -> dict[str, Any]:
    profile = _profile(
        profile,
        (
            "inventory_surface_kind",
            "summary_surface_kind",
            "domain_id",
            "receipt_shapes",
            "reconciliation_statuses",
            "authority_boundary",
        ),
    )
    payload = _inventory_payload(inventory)
    domain_id = _text(profile["domain_id"], "profile.domain_id")
    if payload.get("surface_kind") != _text(profile["inventory_surface_kind"], "profile.inventory_surface_kind"):
        raise ValueError("inventory.surface_kind does not match profile")
    if payload.get("owner") != domain_id or payload.get("target_domain_id") != domain_id:
        raise ValueError("inventory owner and target_domain_id must match profile.domain_id")
    if _bool(payload.get("claims_production_long_run_soak_complete"), "inventory.claims_production_long_run_soak_complete"):
        raise ValueError("inventory cannot claim production long-run soak complete")

    shapes = set(_string_list(profile["receipt_shapes"], "profile.receipt_shapes"))
    statuses = set(_string_list(profile["reconciliation_statuses"], "profile.reconciliation_statuses"))
    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("inventory.items must contain at least one item")
    items = [_normalize_item(_mapping(item, f"items[{index}]"), index, shapes, statuses) for index, item in enumerate(raw_items)]
    summary = _mapping(payload.get("summary"), "inventory.summary")
    shape_counts = _count_by(items, "receipt_shape")
    status_counts = _count_by(items, "reconciliation_status")
    blocker_refs = [item["receipt_ref"] for item in items if item["typed_blocker_present"]]
    no_regression_refs: list[str] = []
    for item in items:
        for ref in item["no_regression_evidence_refs"]:
            if ref not in no_regression_refs:
                no_regression_refs.append(ref)
    expected_summary = {
        "item_count": len(items),
        "by_receipt_shape": shape_counts,
        "by_reconciliation_status": status_counts,
        "typed_blocker_count": len(blocker_refs),
        "no_regression_evidence_ref_count": len(no_regression_refs),
    }
    for key, expected in expected_summary.items():
        actual = summary.get(key)
        if actual != expected:
            raise ValueError(f"inventory.summary.{key} does not match items")
    closeout_count = _int(summary.get("domain_handler_closeout_result_count", 0), "inventory.summary.domain_handler_closeout_result_count")
    ledger = _ledger(payload.get("opl_ledger"))
    proof = _false_write_proof(payload.get("forbidden_write_proof"))
    receipt_refs = [item["receipt_ref"] for item in items]

    return {
        "surface_kind": _text(profile["summary_surface_kind"], "profile.summary_surface_kind"),
        "version": "v1",
        "owner": domain_id,
        "target_domain_id": domain_id,
        "state": "read_only_observability_summary_not_live_soak_complete",
        "source_inventory_ref": {
            "surface_kind": payload["surface_kind"],
            "state": _text(payload.get("state"), "inventory.state"),
            "opl_ledger_ref": ledger["ledger_ref"],
            "claims_production_long_run_soak_complete": False,
            "domain_writes_opl_ledger": False,
            "opl_holds_domain_truth": False,
        },
        "source_inventory_summary": {
            "item_count": len(items),
            "domain_handler_closeout_result_count": closeout_count,
            "by_receipt_shape": shape_counts,
            "by_reconciliation_status": status_counts,
            "typed_blocker_count": len(blocker_refs),
            "no_regression_evidence_ref_count": len(no_regression_refs),
        },
        "operator_observability": {
            "observability_export_kind": "opl_runtime_observability_export",
            "consumption_policy": "read_only_refs_and_counts_no_repair_execution",
            "status": (
                "attention_required_typed_blocker_present"
                if blocker_refs
                else "no_regression_evidence_observed"
            ),
            "receipt_ref_count": len(receipt_refs),
            "typed_blocker_ref_count": len(blocker_refs),
            "no_regression_evidence_ref_count": len(no_regression_refs),
            "receipt_refs": receipt_refs,
            "typed_blocker_refs": blocker_refs,
            "no_regression_evidence_refs": no_regression_refs,
            "consumed_inventory_fields": [
                "summary",
                "items.receipt_ref",
                "items.receipt_shape",
                "items.stage_id",
                "items.source_ref",
                "items.reconciliation_status",
                "items.typed_blocker_present",
                "items.no_regression_evidence_refs",
            ],
        },
        "stage_summary": {
            "stage_count": len(_count_by(items, "stage_id")),
            "by_stage_id": _count_by(items, "stage_id"),
            "stage_ids": sorted(_count_by(items, "stage_id")),
        },
        "receipt_shape_summary": {
            "by_receipt_shape": shape_counts,
            "domain_owner_receipt_count": shape_counts.get("domain_owner_receipt", 0),
            "typed_blocker_count": shape_counts.get("typed_blocker", 0),
            "no_regression_evidence_count": shape_counts.get("no_regression_evidence", 0),
        },
        "blocker_summary": {
            "typed_blocker_count": len(blocker_refs),
            "typed_blocker_refs": blocker_refs,
            "has_blockers": bool(blocker_refs),
            "blocker_status": "typed_blocker_present" if blocker_refs else "no_typed_blocker_present",
        },
        "no_regression_summary": {
            "no_regression_evidence_ref_count": len(no_regression_refs),
            "no_regression_evidence_refs": no_regression_refs,
            "has_no_regression_evidence": bool(no_regression_refs),
            "claims_no_regression_only": bool(no_regression_refs) and not blocker_refs,
        },
        "authority_boundary": _authority(profile["authority_boundary"], "profile.authority_boundary"),
        "forbidden_write_proof": proof,
    }


def build_owner_evidence_reconciliation_proof(
    *,
    profile: Mapping[str, Any],
    owner_receipt_projection: Mapping[str, Any],
    ledger_ref: str,
    typed_blocker: Mapping[str, Any] | None,
    no_regression_evidence_refs: Sequence[str],
    closeout_payload_consumed: bool,
    receipt_ref_matches_closeout: bool | None,
    authority_boundary: Mapping[str, Any],
    forbidden_write_proof: Mapping[str, bool],
) -> dict[str, Any]:
    profile = _profile(
        profile,
        ("surface_kind", "state", "domain_id", "probe_scope", "source_refs", "owner_receipt_field"),
    )
    receipt = dict(_mapping(owner_receipt_projection, "owner_receipt_projection"))
    receipt_ref = _text(receipt.get("receipt_ref"), "owner_receipt_projection.receipt_ref")
    receipt_shape = _text(receipt.get("receipt_shape"), "owner_receipt_projection.receipt_shape")
    source_ref = _text(receipt.get("source_ref"), "owner_receipt_projection.source_ref")
    domain_id = _text(profile["domain_id"], "profile.domain_id")
    evidence_refs = _string_list(no_regression_evidence_refs, "no_regression_evidence_refs")
    proof = _false_write_proof(forbidden_write_proof)
    normalized_blocker = dict(_mapping(typed_blocker, "typed_blocker")) if typed_blocker is not None else None
    status = (
        "typed_blocker_reconciled"
        if normalized_blocker is not None
        else "no_regression_evidence_reconciled"
        if evidence_refs
        else "domain_owner_receipt_reconciled"
    )
    return {
        "surface_kind": _text(profile["surface_kind"], "profile.surface_kind"),
        "version": "v1",
        "state": _text(profile["state"], "profile.state"),
        "target_domain_id": domain_id,
        "owner": domain_id,
        "probe_scope": _text(profile["probe_scope"], "profile.probe_scope"),
        "claims_production_long_run_soak_complete": False,
        "rebuilds_opl_runtime": False,
        "source_refs": _string_list(profile["source_refs"], "profile.source_refs"),
        "opl_ledger": {
            "ledger_ref": _text(ledger_ref, "ledger_ref"),
            "role": "external_ref_for_reconciliation_only",
            "domain_writes_opl_ledger": False,
            "opl_holds_domain_truth": False,
        },
        _text(profile["owner_receipt_field"], "profile.owner_receipt_field"): receipt,
        "typed_blocker": normalized_blocker,
        "no_regression_evidence": {
            "evidence_refs": evidence_refs,
            "present": bool(evidence_refs),
            "repo_tracked_projection_only": True,
        },
        "reconciliation": {
            "status": status,
            "receipt_ref_matches_domain_handler": receipt_ref_matches_closeout,
            "opl_ledger_ref_matches_receipt_source": _text(ledger_ref, "ledger_ref") == source_ref,
            "closeout_payload_consumed": _bool(closeout_payload_consumed, "closeout_payload_consumed"),
        },
        "authority_boundary": _authority(authority_boundary, "authority_boundary"),
        "forbidden_write_proof": proof,
        "receipt_ref": receipt_ref,
        "receipt_shape": receipt_shape,
    }


def build_owner_evidence_reconciliation_inventory(
    *,
    profile: Mapping[str, Any],
    proofs: Sequence[Mapping[str, Any]],
    ledger_ref: str,
    closeout_result_count: int,
    authority_boundary: Mapping[str, Any],
    forbidden_write_proof: Mapping[str, bool],
) -> dict[str, Any]:
    profile = _profile(profile, ("surface_kind", "state", "domain_id", "owner_receipt_field"))
    if not isinstance(proofs, Sequence) or isinstance(proofs, (str, bytes)) or not proofs:
        raise ValueError("proofs must contain at least one reconciliation proof")
    owner_field = _text(profile["owner_receipt_field"], "profile.owner_receipt_field")
    items: list[dict[str, Any]] = []
    seen_refs: set[str] = set()
    for index, raw_proof in enumerate(proofs):
        proof = _mapping(raw_proof, f"proofs[{index}]")
        receipt = _mapping(proof.get(owner_field), f"proofs[{index}].{owner_field}")
        receipt_ref = _text(receipt.get("receipt_ref"), f"proofs[{index}].{owner_field}.receipt_ref")
        if receipt_ref in seen_refs:
            raise ValueError(f"duplicate receipt_ref: {receipt_ref}")
        seen_refs.add(receipt_ref)
        reconciliation = _mapping(proof.get("reconciliation"), f"proofs[{index}].reconciliation")
        no_regression = _mapping(proof.get("no_regression_evidence"), f"proofs[{index}].no_regression_evidence")
        items.append({
            "receipt_ref": receipt_ref,
            "receipt_shape": _text(receipt.get("receipt_shape"), f"proofs[{index}].receipt_shape"),
            "stage_id": _text(receipt.get("stage_id"), f"proofs[{index}].stage_id"),
            "source_ref": _text(receipt.get("source_ref"), f"proofs[{index}].source_ref"),
            "reconciliation_status": _text(reconciliation.get("status"), f"proofs[{index}].reconciliation.status"),
            "receipt_ref_matches_domain_handler": reconciliation.get("receipt_ref_matches_domain_handler"),
            "opl_ledger_ref_matches_receipt_source": _bool(
                reconciliation.get("opl_ledger_ref_matches_receipt_source"),
                f"proofs[{index}].reconciliation.opl_ledger_ref_matches_receipt_source",
            ),
            "typed_blocker_present": proof.get("typed_blocker") is not None,
            "no_regression_evidence_refs": _string_list(
                no_regression.get("evidence_refs", []),
                f"proofs[{index}].no_regression_evidence.evidence_refs",
            ),
            "authority_boundary": _authority(proof.get("authority_boundary"), f"proofs[{index}].authority_boundary"),
        })
    domain_id = _text(profile["domain_id"], "profile.domain_id")
    shape_counts = _count_by(items, "receipt_shape")
    status_counts = _count_by(items, "reconciliation_status")
    no_regression_refs = {ref for item in items for ref in item["no_regression_evidence_refs"]}
    return {
        "surface_kind": _text(profile["surface_kind"], "profile.surface_kind"),
        "version": "v1",
        "state": _text(profile["state"], "profile.state"),
        "target_domain_id": domain_id,
        "owner": domain_id,
        "opl_ledger": {
            "ledger_ref": _text(ledger_ref, "ledger_ref"),
            "role": "external_ref_for_inventory_reconciliation_only",
            "domain_writes_opl_ledger": False,
            "opl_holds_domain_truth": False,
        },
        "summary": {
            "item_count": len(items),
            "domain_handler_closeout_result_count": _int(closeout_result_count, "closeout_result_count"),
            "by_receipt_shape": shape_counts,
            "by_reconciliation_status": status_counts,
            "typed_blocker_count": sum(1 for item in items if item["typed_blocker_present"]),
            "no_regression_evidence_ref_count": len(no_regression_refs),
        },
        "items": items,
        "claims_production_long_run_soak_complete": False,
        "authority_boundary": _authority(authority_boundary, "authority_boundary"),
        "forbidden_write_proof": _false_write_proof(forbidden_write_proof),
    }


__all__ = [
    "build_owner_evidence_observability_summary",
    "build_owner_evidence_reconciliation_inventory",
    "build_owner_evidence_reconciliation_proof",
]
