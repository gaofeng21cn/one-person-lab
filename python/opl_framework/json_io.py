"""Generic fail-closed JSON object I/O for domain carriers."""

from __future__ import annotations

from collections.abc import Callable, Mapping
import json
import os
from pathlib import Path
import tempfile
from typing import Any


class JsonObjectReadError(RuntimeError):
    """A JSON object could not be read without ambiguity."""

    def __init__(self, path: Path, reason: str) -> None:
        super().__init__(f"{path}: {reason}")
        self.path = path
        self.reason = reason


class ExistingJsonIdentityMismatch(RuntimeError):
    """An existing output belongs to a different logical identity."""

    def __init__(
        self,
        path: Path,
        *,
        observed: Mapping[str, Any],
        expected: Mapping[str, Any],
    ) -> None:
        super().__init__(
            f"{path}: existing JSON identity does not match the requested identity"
        )
        self.path = path
        self.observed = dict(observed)
        self.expected = dict(expected)


IdentityProjector = Callable[[Mapping[str, Any]], Mapping[str, Any]]


def read_json_object(path: str | Path) -> dict[str, Any]:
    """Read one JSON object and distinguish I/O, syntax, and shape failures."""

    resolved = Path(path).expanduser()
    try:
        text = resolved.read_text(encoding="utf-8")
    except OSError as error:
        raise JsonObjectReadError(resolved, "read_error") from error
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise JsonObjectReadError(resolved, "invalid_json") from error
    if not isinstance(payload, dict):
        raise JsonObjectReadError(resolved, "top_level_not_object")
    return payload


def guard_existing_json_identity(
    path: str | Path,
    expected_identity: Mapping[str, Any],
    *,
    project_identity: IdentityProjector | None = None,
) -> None:
    """Allow absent output or an exact existing identity; reject every other shape."""

    resolved = Path(path).expanduser()
    if not resolved.exists():
        return
    payload = read_json_object(resolved)
    observed = (
        dict(project_identity(payload))
        if project_identity is not None
        else {key: payload.get(key) for key in expected_identity}
    )
    expected = dict(expected_identity)
    if observed != expected:
        raise ExistingJsonIdentityMismatch(
            resolved,
            observed=observed,
            expected=expected,
        )


def write_json_object_atomic(
    path: str | Path,
    payload: Mapping[str, Any],
    *,
    ensure_ascii: bool = False,
    indent: int | None = 2,
) -> None:
    """Publish complete JSON bytes through a same-directory atomic replace."""

    if not isinstance(payload, Mapping):
        raise TypeError("payload must be a mapping")
    resolved = Path(path).expanduser()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            prefix=f".{resolved.name}.",
            suffix=".tmp",
            dir=resolved.parent,
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(dict(payload), handle, ensure_ascii=ensure_ascii, indent=indent)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, resolved)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
