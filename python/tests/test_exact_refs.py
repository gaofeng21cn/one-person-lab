from __future__ import annotations

import base64
import hashlib

import pytest

from opl_framework.exact_refs import (
    ExactRefValidationError,
    PYTHON_EXACT_REF_CODEC_VERSION,
    canonical_json_bytes_v1,
    fingerprint_v1,
    normalize_exact_ref,
    normalize_exact_json_object,
    normalize_exact_ref_list,
    normalize_sha256,
    normalize_typed_ref,
)


DIGEST = "A" * 64


def test_python_json_v1_freezes_unicode_non_bmp_and_number_bytes() -> None:
    payload = {
        "z": "医学🧬",
        "a": [0, -0.0, 1.25, 9007199254740993],
        "escaped": "line\nnext",
    }

    assert PYTHON_EXACT_REF_CODEC_VERSION == "opl-python-exact-ref.v1"
    assert canonical_json_bytes_v1(payload) == (
        b'{"a":[0,-0.0,1.25,9007199254740993],'
        b'"escaped":"line\\nnext",'
        b'"z":"\\u533b\\u5b66\\ud83e\\uddec"}'
    )
    assert fingerprint_v1(payload) == (
        "sha256:92b975e14c0b028c38a189d0830e3007"
        "a45d1af5bc8f88780287082742692289"
    )


def test_exact_and_typed_refs_normalize_without_domain_semantics() -> None:
    assert normalize_sha256(DIGEST, "artifact.sha256") == f"sha256:{DIGEST.lower()}"
    assert normalize_typed_ref(
        {"kind": "artifact", "ref": "artifact://one", "sha256": DIGEST},
        "artifact",
        "artifact",
    ) == {
        "kind": "artifact",
        "ref": "artifact://one",
        "sha256": f"sha256:{DIGEST.lower()}",
    }
    assert normalize_exact_ref(
        {
            "kind": "artifact",
            "ref": "artifact://one",
            "size_bytes": 12,
            "sha256": DIGEST,
        },
        "artifact",
        "artifact",
    )["size_bytes"] == 12


def test_exact_ref_list_preserves_size_sensitive_deduplication() -> None:
    refs = [
        {
            "kind": "artifact",
            "ref": "artifact://one",
            "size_bytes": size,
            "sha256": DIGEST,
        }
        for size in (12, 13)
    ]
    assert len(normalize_exact_ref_list(refs, "artifacts", "artifact")) == 2
    with pytest.raises(ExactRefValidationError, match="contains duplicate refs"):
        normalize_exact_ref_list(
            refs,
            "artifacts",
            "artifact",
            dedupe_size=False,
        )


def test_ref_validation_can_preserve_a_domain_error_type() -> None:
    class DomainRequestShapeError(ValueError):
        pass

    with pytest.raises(DomainRequestShapeError, match="artifact.size_bytes"):
        normalize_exact_ref(
            {
                "kind": "artifact",
                "ref": "artifact://one",
                "size_bytes": True,
                "sha256": DIGEST,
            },
            "artifact",
            "artifact",
            error_type=DomainRequestShapeError,
        )


def exact_json_args(raw: bytes, record: object) -> dict:
    return {
        "encoded_value": base64.b64encode(raw).decode("ascii"),
        "byte_size_value": len(raw),
        "expected_sha256": hashlib.sha256(raw).hexdigest(),
        "supplied_record": record,
        "field": "receipt",
    }


def test_exact_json_preserves_original_whitespace_and_non_ascii_bytes() -> None:
    raw = b'{ "label": "\\u4e66", "value": [1, 1.0, true] }\n'
    record = {"label": "\u4e66", "value": [1, 1.0, True]}
    encoded, size, parsed = normalize_exact_json_object(**exact_json_args(raw, record))
    assert base64.b64decode(encoded) == raw
    assert size == len(raw)
    assert parsed == record


@pytest.mark.parametrize(
    ("raw", "record"),
    [
        (b'{"a":1,"a":1}', {"a": 1}),
        (b'{"a":NaN}', {"a": float("nan")}),
        (b'{"a":1e999}', {"a": float("inf")}),
        (b'{"a":true}', {"a": 1}),
        (b'{"a":1}', {"a": 1.0}),
        (b'[]', {}),
        (b'{"a":"\xff"}', {"a": "invalid"}),
    ],
)
def test_exact_json_rejects_ambiguous_or_mismatched_values(raw: bytes, record: object) -> None:
    with pytest.raises(ExactRefValidationError):
        normalize_exact_json_object(**exact_json_args(raw, record))


@pytest.mark.parametrize(
    ("field", "value"),
    [("byte_size_value", True), ("byte_size_value", 3), ("expected_sha256", "0" * 64),
     ("encoded_value", "e31="), ("encoded_value", "e30=\n")],
)
def test_exact_json_rejects_invalid_identity_envelopes(field: str, value: object) -> None:
    args = exact_json_args(b"{}", {})
    args[field] = value
    with pytest.raises(ExactRefValidationError):
        normalize_exact_json_object(**args)
