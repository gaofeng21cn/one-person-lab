from __future__ import annotations

import pytest

from opl_framework.exact_refs import (
    ExactRefValidationError,
    PYTHON_EXACT_REF_CODEC_VERSION,
    canonical_json_bytes_v1,
    fingerprint_v1,
    normalize_exact_ref,
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
