"""Versioned Python JSON identity bytes and exact-reference validation."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any


PYTHON_EXACT_REF_CODEC_VERSION = "opl-python-exact-ref.v1"


class ExactRefValidationError(ValueError):
    """An exact reference or digest has an invalid shape."""


def _fail(error_type: type[ValueError], message: str) -> None:
    raise error_type(message)


def _mapping(
    value: Any,
    field: str,
    error_type: type[ValueError],
) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        _fail(error_type, f"{field} must be an object")
    return dict(value)


def _sequence(value: Any, field: str, error_type: type[ValueError]) -> list[Any]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        _fail(error_type, f"{field} must be an array")
    return list(value)


def _text(value: Any, field: str, error_type: type[ValueError]) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(error_type, f"{field} must be a non-empty string")
    return value.strip()


def _exact_keys(
    payload: Mapping[str, Any],
    allowed: set[str],
    field: str,
    error_type: type[ValueError],
) -> None:
    missing = sorted(allowed - set(payload))
    unknown = sorted(set(payload) - allowed)
    if missing:
        _fail(error_type, f"{field} missing fields: {', '.join(missing)}")
    if unknown:
        _fail(
            error_type,
            f"{field} contains unsupported fields: {', '.join(unknown)}",
        )


def _integer(value: Any, field: str, error_type: type[ValueError]) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        _fail(error_type, f"{field} must be a non-negative integer")
    return value


def normalize_sha256(
    value: Any,
    field: str,
    *,
    error_type: type[ValueError] = ExactRefValidationError,
) -> str:
    normalized = _text(value, field, error_type).lower()
    digest = normalized.removeprefix("sha256:")
    if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
        _fail(error_type, f"{field} must be a SHA-256 digest")
    return f"sha256:{digest}"


def normalize_typed_ref(
    value: Any,
    field: str,
    expected_kind: str,
    *,
    error_type: type[ValueError] = ExactRefValidationError,
) -> dict[str, str]:
    payload = _mapping(value, field, error_type)
    _exact_keys(payload, {"kind", "ref", "sha256"}, field, error_type)
    kind = _text(payload.get("kind"), f"{field}.kind", error_type)
    if kind != expected_kind:
        _fail(error_type, f"{field}.kind must be {expected_kind}")
    return {
        "kind": kind,
        "ref": _text(payload.get("ref"), f"{field}.ref", error_type),
        "sha256": normalize_sha256(
            payload.get("sha256"),
            f"{field}.sha256",
            error_type=error_type,
        ),
    }


def normalize_exact_ref(
    value: Any,
    field: str,
    expected_kind: str,
    *,
    error_type: type[ValueError] = ExactRefValidationError,
) -> dict[str, Any]:
    payload = _mapping(value, field, error_type)
    _exact_keys(payload, {"kind", "ref", "size_bytes", "sha256"}, field, error_type)
    kind = _text(payload.get("kind"), f"{field}.kind", error_type)
    if kind != expected_kind:
        _fail(error_type, f"{field}.kind must be {expected_kind}")
    return {
        "kind": kind,
        "ref": _text(payload.get("ref"), f"{field}.ref", error_type),
        "size_bytes": _integer(
            payload.get("size_bytes"),
            f"{field}.size_bytes",
            error_type,
        ),
        "sha256": normalize_sha256(
            payload.get("sha256"),
            f"{field}.sha256",
            error_type=error_type,
        ),
    }


def normalize_typed_ref_list(
    value: Any,
    field: str,
    expected_kind: str,
    *,
    error_type: type[ValueError] = ExactRefValidationError,
) -> list[dict[str, str]]:
    refs = [
        normalize_typed_ref(
            item,
            f"{field}[{index}]",
            expected_kind,
            error_type=error_type,
        )
        for index, item in enumerate(_sequence(value, field, error_type))
    ]
    if len(refs) != len({(item["ref"], item["sha256"]) for item in refs}):
        _fail(error_type, f"{field} contains duplicate refs")
    return refs


def normalize_exact_ref_list(
    value: Any,
    field: str,
    expected_kind: str,
    *,
    dedupe_size: bool = True,
    error_type: type[ValueError] = ExactRefValidationError,
) -> list[dict[str, Any]]:
    refs = [
        normalize_exact_ref(
            item,
            f"{field}[{index}]",
            expected_kind,
            error_type=error_type,
        )
        for index, item in enumerate(_sequence(value, field, error_type))
    ]
    identities = {
        (
            item["ref"],
            *((item["size_bytes"],) if dedupe_size else ()),
            item["sha256"],
        )
        for item in refs
    }
    if len(refs) != len(identities):
        _fail(error_type, f"{field} contains duplicate refs")
    return refs


def canonical_json_bytes_v1(payload: Mapping[str, Any]) -> bytes:
    """Freeze Python json identity bytes; this is not RFC 8785/JCS."""

    return json.dumps(
        payload,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def fingerprint_v1(payload: Mapping[str, Any]) -> str:
    return f"sha256:{hashlib.sha256(canonical_json_bytes_v1(payload)).hexdigest()}"


__all__ = [
    "ExactRefValidationError",
    "PYTHON_EXACT_REF_CODEC_VERSION",
    "canonical_json_bytes_v1",
    "fingerprint_v1",
    "normalize_exact_ref",
    "normalize_exact_ref_list",
    "normalize_sha256",
    "normalize_typed_ref",
    "normalize_typed_ref_list",
]
