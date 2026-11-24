from __future__ import annotations

import json
from pathlib import Path
import shutil
from unittest.mock import patch
import wave

import pytest

from opl_framework.delivery_layout import (
    compact_archived_wav_files,
    prune_archived_versions,
    restore_compacted_wav_file,
    transactional_swap_directories,
)


def _write_wav(path: Path) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(8000)
        stream.writeframes(bytes(1600))
    return path.read_bytes()


def _staged(root: Path, version: str) -> tuple[Path, Path]:
    user = root / f"stage-user-{version}"
    record = root / f"stage-record-{version}"
    user.mkdir()
    record.mkdir()
    (user / "out.txt").write_text(version, encoding="utf-8")
    (record / "manifest.json").write_text(json.dumps({"version": version}), encoding="utf-8")
    return user, record


def test_transactional_swap_and_rollback_on_failure(tmp_path: Path) -> None:
    active_user = tmp_path / "publish" / "item"
    active_record = tmp_path / "deliveries" / "item"
    pointer = tmp_path / "deliveries" / "item.json"
    archive_root = tmp_path / "archive" / "item"

    u1, r1 = _staged(tmp_path, "v1")
    transactional_swap_directories(
        [(u1, active_user, "publish"), (r1, active_record, "record")],
        backup_dir=archive_root / "20260101T000000Z",
        pointer_path=pointer,
        pointer_payload={"version": "v1"},
    )
    assert (active_user / "out.txt").read_text(encoding="utf-8") == "v1"
    before_pointer = pointer.read_bytes()

    u2, r2 = _staged(tmp_path, "v2")
    original_rename = Path.rename

    def fail_on_record(self: Path, target: Path) -> Path:
        if self == r2:
            raise OSError("injected disk error")
        return original_rename(self, target)

    with patch.object(Path, "rename", fail_on_record):
        with pytest.raises(OSError, match="injected disk error"):
            transactional_swap_directories(
                [(u2, active_user, "publish"), (r2, active_record, "record")],
                backup_dir=archive_root / "20260102T000000Z",
                pointer_path=pointer,
                pointer_payload={"version": "v2"},
            )

    assert (active_user / "out.txt").read_text(encoding="utf-8") == "v1"
    assert json.loads((active_record / "manifest.json").read_text(encoding="utf-8"))["version"] == "v1"
    assert pointer.read_bytes() == before_pointer


def test_prune_archived_versions(tmp_path: Path) -> None:
    archive_parent = tmp_path / "archive"
    for ts in ("20260101Z", "20260102Z", "20260103Z", "keep-me"):
        (archive_parent / ts).mkdir(parents=True)
    removed = prune_archived_versions(archive_parent, keep_latest=1, protected_names=("keep-me",))
    assert len(removed) == 2
    remaining = sorted(p.name for p in archive_parent.iterdir())
    assert remaining == ["20260103Z", "keep-me"]


@pytest.mark.skipif(not shutil.which("flac"), reason="requires flac")
def test_compact_and_restore_archived_wav_files(tmp_path: Path) -> None:
    wav = tmp_path / "record" / "audio.wav"
    original = _write_wav(wav)
    receipt = compact_archived_wav_files(wav.parent)
    assert receipt is not None
    assert not wav.exists()
    flac = wav.with_suffix(".flac")
    assert flac.is_file()
    restored = restore_compacted_wav_file(flac)
    assert Path(restored["restored_wav"]).read_bytes() == original
