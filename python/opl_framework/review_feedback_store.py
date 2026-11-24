"""Atomic workspace-contained review feedback storage for OPL Package contributions."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None  # type: ignore[assignment]

from .json_io import read_json_object, write_json_object_atomic

DEFAULT_FEEDBACK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,100}$")


class ReviewFeedbackError(ValueError):
    """Raised when a review feedback identifier, path, or idempotency check fails."""

    def __init__(self, message: str, *, reason_code: str = "review_feedback_invalid") -> None:
        super().__init__(message)
        self.reason_code = reason_code


def validate_feedback_id(
    value: object,
    *,
    pattern: re.Pattern[str] = DEFAULT_FEEDBACK_ID_PATTERN,
    label: str = "feedback request_id",
) -> str:
    """Validate that a feedback identifier is a safe single-token filename stem."""

    if not isinstance(value, str) or not value or value in (".", "..") or Path(value).name != value or "\\" in value:
        raise ReviewFeedbackError(f"Invalid {label}.", reason_code="invalid_feedback_id")
    if not pattern.fullmatch(value):
        raise ReviewFeedbackError(
            f"{label} may only contain ASCII letters, digits, underscore, and hyphen.",
            reason_code="invalid_feedback_id",
        )
    return value


def resolve_contained_path(
    root: str | Path,
    target: str | Path,
    *,
    container: str | Path | None = None,
    must_exist: bool = False,
) -> Path:
    """Resolve `target` strictly inside `root` (and optional `container`) without symlink escape."""

    resolved_root = Path(root).resolve(strict=True)
    resolved_container = Path(container).resolve(strict=True) if container is not None else resolved_root
    if not resolved_container.is_relative_to(resolved_root):
        raise ReviewFeedbackError("Container escapes workspace root.", reason_code="path_escape")

    candidate_input = Path(target)
    candidate_raw = candidate_input if candidate_input.is_absolute() else (resolved_root / candidate_input)
    try:
        resolved = candidate_raw.resolve(strict=must_exist)
    except FileNotFoundError as exc:
        raise ReviewFeedbackError(f"Missing target path: {target}", reason_code="path_missing") from exc

    if not resolved.is_relative_to(resolved_container):
        raise ReviewFeedbackError(
            f"Path escapes containment boundary: {target}",
            reason_code="path_escape",
        )
    if must_exist and not resolved.exists():
        raise ReviewFeedbackError(f"Missing target path: {target}", reason_code="path_missing")
    return resolved


def _write_note_once(
    target: Path,
    dir_path: Path,
    payload: Mapping[str, Any],
    expected_identity: tuple[str, ...],
    before_create: Callable[[], Mapping[str, Any] | None] | None,
) -> tuple[Path, dict[str, Any], bool]:
    if target.is_symlink():
        raise ReviewFeedbackError("Feedback note path must not be a symlink.", reason_code="symlink_not_allowed")
    if target.is_file():
        saved = read_json_object(target)
        if any(saved.get(key) != payload.get(key) for key in expected_identity):
            raise ReviewFeedbackError(
                "Review feedback id is already bound to a different request.",
                reason_code="idempotency_conflict",
            )
        return target, saved, False

    record_source = before_create() if before_create is not None else None
    record = dict(record_source if record_source is not None else payload)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=dir_path,
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary_path, target)
    except FileExistsError:
        saved = read_json_object(target)
        if any(saved.get(key) != payload.get(key) for key in expected_identity):
            raise ReviewFeedbackError(
                "Review feedback id is already bound to a different request.",
                reason_code="idempotency_conflict",
            )
        return target, saved, False
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return target, read_json_object(target), True


def record_feedback_note(
    feedback_dir: str | Path,
    *,
    request_id: object,
    payload: Mapping[str, Any],
    identity_keys: Iterable[str] = (),
    root: str | Path | None = None,
    lock: bool = True,
    before_create: Callable[[], Mapping[str, Any] | None] | None = None,
) -> tuple[Path, dict[str, Any], bool]:
    """Atomically store one create-only review feedback note keyed by `request_id`.

    If `<feedback_dir>/<request_id>.json` already exists:
    - Returns `(target, saved_payload, False)` when all `identity_keys` match.
    - Raises `ReviewFeedbackError` (`idempotency_conflict`) when any key differs.
    When creating a new note inside the directory lock, optional `before_create()` can
    re-validate state and return the full record payload to persist.
    """

    normalized_id = validate_feedback_id(request_id)
    raw_dir = Path(feedback_dir)
    if raw_dir.is_symlink():
        raise ReviewFeedbackError("Feedback directory must not be a symlink.", reason_code="symlink_not_allowed")
    if root is not None:
        dir_path = resolve_contained_path(root, raw_dir, must_exist=False)
    else:
        dir_path = raw_dir.resolve(strict=False)
    dir_path.mkdir(parents=True, exist_ok=True)
    raw_target = dir_path / f"{normalized_id}.json"
    if raw_target.is_symlink():
        raise ReviewFeedbackError("Feedback note path must not be a symlink.", reason_code="symlink_not_allowed")
    target = raw_target.resolve(strict=False)
    if not target.is_relative_to(dir_path.resolve(strict=True)):
        raise ReviewFeedbackError("Feedback note path escapes directory.", reason_code="path_escape")

    expected_identity = tuple(identity_keys)
    lock_path = dir_path / ".write.lock"
    if lock_path.is_symlink():
        raise ReviewFeedbackError("Feedback lock path must not be a symlink.", reason_code="symlink_not_allowed")

    if lock and fcntl is not None:
        with lock_path.open("a", encoding="utf-8") as lock_handle:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
            try:
                return _write_note_once(target, dir_path, payload, expected_identity, before_create)
            finally:
                fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)

    return _write_note_once(target, dir_path, payload, expected_identity, before_create)


def list_feedback_notes(
    feedback_dir: str | Path,
    *,
    revision: str | None = None,
    revision_field: str = "revision",
    root: str | Path | None = None,
) -> list[dict[str, Any]]:
    """Read stored JSON review feedback notes inside `feedback_dir` sorted by filename."""

    dir_path = Path(feedback_dir)
    if root is not None:
        dir_path = resolve_contained_path(root, dir_path, must_exist=False)
    else:
        dir_path = dir_path.resolve(strict=False)
    if not dir_path.is_dir():
        return []

    notes: list[dict[str, Any]] = []
    for note_path in sorted(dir_path.glob("*.json")):
        if note_path.is_symlink() or not note_path.resolve().is_relative_to(dir_path.resolve(strict=True)):
            raise ReviewFeedbackError(f"Feedback note escapes directory: {note_path}", reason_code="path_escape")
        note = read_json_object(note_path)
        entry = {**note, "artifact_ref": str(note_path)}
        if revision is not None:
            entry["matches_current_revision"] = note.get(revision_field) == revision
        notes.append(entry)
    return notes


def resolve_feedback_note(
    feedback_dir: str | Path,
    request_id: object,
    *,
    resolution: Mapping[str, Any] | None = None,
    root: str | Path | None = None,
) -> dict[str, Any]:
    """Mark an existing review feedback note as resolved and persist atomically."""

    normalized_id = validate_feedback_id(request_id)
    dir_path = Path(feedback_dir)
    if root is not None:
        dir_path = resolve_contained_path(root, dir_path, must_exist=True)
    else:
        dir_path = dir_path.resolve(strict=True)
    target = (dir_path / f"{normalized_id}.json").resolve(strict=True)
    if not target.is_relative_to(dir_path.resolve(strict=True)) or not target.is_file():
        raise ReviewFeedbackError(f"Missing feedback note: {normalized_id}", reason_code="path_missing")
    existing = read_json_object(target)
    updated = {
        **existing,
        "resolved": True,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        **({"resolution": dict(resolution)} if resolution is not None else {}),
    }
    write_json_object_atomic(target, updated)
    return updated
