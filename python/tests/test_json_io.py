from __future__ import annotations

import json
from pathlib import Path

import pytest

from opl_framework.json_io import (
    ExistingJsonIdentityMismatch,
    JsonObjectReadError,
    guard_existing_json_identity,
    read_json_object,
    write_json_object_atomic,
)


def test_atomic_json_write_and_identity_guard(tmp_path: Path) -> None:
    output = tmp_path / "nested" / "output.json"
    write_json_object_atomic(output, {"run_id": "run-1", "payload": {"value": 2}})

    assert read_json_object(output) == {
        "run_id": "run-1",
        "payload": {"value": 2},
    }
    assert list(output.parent.glob(f".{output.name}.*.tmp")) == []
    guard_existing_json_identity(output, {"run_id": "run-1"})
    with pytest.raises(ExistingJsonIdentityMismatch) as raised:
        guard_existing_json_identity(output, {"run_id": "run-2"})
    assert raised.value.observed == {"run_id": "run-1"}
    assert raised.value.expected == {"run_id": "run-2"}


def test_identity_guard_accepts_domain_projector_without_owning_domain_keys(
    tmp_path: Path,
) -> None:
    output = tmp_path / "output.json"
    output.write_text(
        json.dumps({"identity": {"grant_run_id": "grant-1"}}),
        encoding="utf-8",
    )
    guard_existing_json_identity(
        output,
        {"grant_run_id": "grant-1"},
        project_identity=lambda payload: payload["identity"],
    )


@pytest.mark.parametrize(
    ("body", "reason"),
    [
        ("not-json", "invalid_json"),
        ("[]", "top_level_not_object"),
    ],
)
def test_json_object_read_fails_closed(
    tmp_path: Path,
    body: str,
    reason: str,
) -> None:
    output = tmp_path / "output.json"
    output.write_text(body, encoding="utf-8")
    with pytest.raises(JsonObjectReadError) as raised:
        read_json_object(output)
    assert raised.value.reason == reason
