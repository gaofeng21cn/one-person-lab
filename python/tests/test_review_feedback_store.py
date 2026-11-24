from __future__ import annotations

from pathlib import Path
import tempfile

import pytest

from opl_framework.review_feedback_store import (
    ReviewFeedbackError,
    list_feedback_notes,
    record_feedback_note,
    resolve_contained_path,
    resolve_feedback_note,
)


def test_record_feedback_note_is_atomic_and_idempotent(tmp_path: Path) -> None:
    feedback_dir = tmp_path / "qa" / "notes"
    payload = {"revision": "sha256:abc", "request_id": "req-1", "note": "Looks good"}

    target, saved, created = record_feedback_note(
        feedback_dir,
        request_id="req-1",
        payload=payload,
        identity_keys=("revision", "request_id", "note"),
        root=tmp_path,
    )
    assert created is True
    assert target.is_file()
    assert saved["note"] == "Looks good"

    # Re-submitting identical identity succeeds idempotently.
    _, saved_again, created_again = record_feedback_note(
        feedback_dir,
        request_id="req-1",
        payload=payload,
        identity_keys=("revision", "request_id", "note"),
        root=tmp_path,
    )
    assert created_again is False
    assert saved_again["note"] == "Looks good"

    # Re-submitting same request_id with changed content fails closed.
    with pytest.raises(ReviewFeedbackError) as exc_info:
        record_feedback_note(
            feedback_dir,
            request_id="req-1",
            payload={**payload, "note": "Changed text"},
            identity_keys=("revision", "request_id", "note"),
            root=tmp_path,
        )
    assert exc_info.value.reason_code == "idempotency_conflict"

    notes = list_feedback_notes(feedback_dir, revision="sha256:abc", root=tmp_path)
    assert len(notes) == 1
    assert notes[0]["matches_current_revision"] is True

    resolved = resolve_feedback_note(feedback_dir, "req-1", resolution={"by": "reviewer"}, root=tmp_path)
    assert resolved["resolved"] is True
    assert resolved["resolution"] == {"by": "reviewer"}


def test_review_feedback_store_rejects_traversal_and_symlink_escapes(tmp_path: Path) -> None:
    outside = Path(tempfile.mkdtemp(dir=tmp_path.parent))
    try:
        secret = outside / "secret.json"
        secret.write_text('{"secret": true}\n', encoding="utf-8")
        notes = tmp_path / "notes"
        notes.mkdir()
        (notes / "leak.json").symlink_to(secret)

        with pytest.raises(ReviewFeedbackError):
            resolve_contained_path(tmp_path, "../escape.json")

        with pytest.raises(ReviewFeedbackError):
            list_feedback_notes(notes, root=tmp_path)

        with pytest.raises(ReviewFeedbackError):
            record_feedback_note(
                notes,
                request_id="../bad",
                payload={"note": "x"},
                root=tmp_path,
            )

        (notes / "link-note.json").symlink_to(secret)
        with pytest.raises(ReviewFeedbackError) as symlink_target_exc:
            record_feedback_note(
                notes,
                request_id="link-note",
                payload={"note": "x"},
                root=tmp_path,
            )
        assert symlink_target_exc.value.reason_code == "symlink_not_allowed"

        (notes / ".write.lock").unlink(missing_ok=True)
        (notes / ".write.lock").symlink_to(secret)
        with pytest.raises(ReviewFeedbackError) as symlink_lock_exc:
            record_feedback_note(
                notes,
                request_id="req-lock-bad",
                payload={"note": "x"},
                root=tmp_path,
            )
        assert symlink_lock_exc.value.reason_code == "symlink_not_allowed"
    finally:
        for child in outside.iterdir():
            child.unlink()
        outside.rmdir()


def test_record_feedback_note_before_create_runs_only_on_create(tmp_path: Path) -> None:
    feedback_dir = tmp_path / "notes"
    calls = 0

    def before_create() -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"revision": "rev-1", "request_id": "req-1", "note": "hi", "extra": "fresh"}

    _, saved1, created1 = record_feedback_note(
        feedback_dir,
        request_id="req-1",
        payload={"revision": "rev-1", "request_id": "req-1", "note": "hi"},
        identity_keys=("revision", "request_id", "note"),
        root=tmp_path,
        before_create=before_create,
    )
    assert created1 is True
    assert calls == 1
    assert saved1["extra"] == "fresh"

    _, saved2, created2 = record_feedback_note(
        feedback_dir,
        request_id="req-1",
        payload={"revision": "rev-1", "request_id": "req-1", "note": "hi"},
        identity_keys=("revision", "request_id", "note"),
        root=tmp_path,
        before_create=before_create,
    )
    assert created2 is False
    assert calls == 1
    assert saved2["extra"] == "fresh"

    def abort_create() -> dict[str, object]:
        raise RuntimeError("stale revision")

    with pytest.raises(RuntimeError, match="stale revision"):
        record_feedback_note(
            feedback_dir,
            request_id="req-2",
            payload={"revision": "rev-1", "request_id": "req-2", "note": "hi"},
            root=tmp_path,
            before_create=abort_create,
        )
    assert not (feedback_dir / "req-2.json").exists()
