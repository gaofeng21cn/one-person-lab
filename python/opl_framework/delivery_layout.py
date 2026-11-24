"""Transactional latest-only delivery layout primitives with rollback, archive pruning, and lossless WAV archival."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any, Callable, Sequence

from .workspace_storage import sha256_file


def write_latest_pointer(pointer_path: Path, payload: dict[str, Any]) -> None:
    """Atomically write a delivery pointer JSON file inside the same directory."""
    pointer_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=pointer_path.parent,
        delete=False,
    ) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    try:
        os.replace(temporary, pointer_path)
    finally:
        temporary.unlink(missing_ok=True)


def transactional_swap_directories(
    replacements: Sequence[tuple[Path, Path, str]],
    *,
    backup_dir: Path,
    pointer_path: Path | None = None,
    pointer_payload: dict[str, Any] | None = None,
    archive_pointer_name: str = "pointer.json",
) -> dict[str, Any]:
    """Atomically swap multiple `(stage_source, active_destination, backup_slot_name)` directories with full rollback."""
    before_pointer = pointer_path.read_bytes() if pointer_path is not None and pointer_path.exists() else None
    replaced: list[tuple[Path, Path]] = []
    installed: list[Path] = []
    try:
        for _source, destination, slot_name in replacements:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                backup_dir.mkdir(parents=True, exist_ok=True)
                archived_slot = backup_dir / slot_name
                destination.rename(archived_slot)
                replaced.append((destination, archived_slot))
        if before_pointer is not None:
            backup_dir.mkdir(parents=True, exist_ok=True)
            (backup_dir / archive_pointer_name).write_bytes(before_pointer)
        for source, destination, _slot_name in replacements:
            source.rename(destination)
            installed.append(destination)
        if pointer_path is not None and pointer_payload is not None:
            write_latest_pointer(pointer_path, pointer_payload)
        return {
            "backup_created": backup_dir.exists(),
            "backup_dir": str(backup_dir) if backup_dir.exists() else None,
            "installed_paths": [str(path) for path in installed],
            "replaced_paths": [str(dest) for dest, _archived in replaced],
        }
    except Exception:
        for destination in reversed(installed):
            shutil.rmtree(destination, ignore_errors=False)
        for destination, previous in reversed(replaced):
            previous.rename(destination)
        if pointer_path is not None:
            if before_pointer is not None:
                pointer_path.write_bytes(before_pointer)
            else:
                pointer_path.unlink(missing_ok=True)
        raise


def prune_archived_versions(
    archive_parent: Path,
    *,
    keep_latest: int = 1,
    version_key: Callable[[Path], Any] | None = None,
    protected_names: Sequence[str] = (),
) -> list[str]:
    """Retain only the newest `keep_latest` snapshot directories under archive_parent."""
    if keep_latest < 0 or not archive_parent.is_dir():
        return []
    protected = set(protected_names)
    key_fn = version_key or (lambda p: p.name)
    snapshots = sorted(
        [d for d in archive_parent.iterdir() if d.is_dir() and d.name not in protected],
        key=key_fn,
    )
    if len(snapshots) <= keep_latest:
        return []
    stale = snapshots[: len(snapshots) - keep_latest] if keep_latest > 0 else snapshots
    removed: list[str] = []
    for old_dir in stale:
        try:
            shutil.rmtree(old_dir)
            removed.append(str(old_dir))
        except OSError:
            continue
    return removed


def compact_archived_wav_files(
    version_dir: Path,
    *,
    compaction_filename: str = "storage-compaction.json",
    compaction_schema: str = "opl_storage_compaction_group/v1",
    flac_bin: str = "flac",
    runner: Callable[..., Any] = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> dict[str, Any] | None:
    """Losslessly archive RIFF WAV files in `version_dir` as exact-restore FLAC + JSON receipt."""
    if not version_dir.is_dir() or not which(flac_bin):
        return None
    records: list[dict[str, Any]] = []
    for wav_path in sorted(version_dir.glob("*.wav")):
        if wav_path.is_symlink() or not wav_path.is_file():
            continue
        try:
            with wav_path.open("rb") as handle:
                if handle.read(4) != b"RIFF":
                    continue
            source_sha = sha256_file(wav_path)
            flac_path = wav_path.with_suffix(".flac")
            tmp_flac = wav_path.with_name(f".{wav_path.name}.{os.getpid()}.tmp.flac")
            tmp_wav = wav_path.with_name(f".{wav_path.name}.{os.getpid()}.verify.wav")
            try:
                runner(
                    [flac_bin, "-s", "--verify", "--keep-foreign-metadata", "-8", "-f", str(wav_path), "-o", str(tmp_flac)],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                runner(
                    [flac_bin, "-s", "-d", "--keep-foreign-metadata", "-f", str(tmp_flac), "-o", str(tmp_wav)],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                if sha256_file(tmp_wav) != source_sha:
                    continue
                st_src = wav_path.stat()
                os.replace(tmp_flac, flac_path)
                os.utime(flac_path, ns=(st_src.st_atime_ns, st_src.st_mtime_ns))
                st_dst = flac_path.stat()
                records.append(
                    {
                        "source": str(wav_path),
                        "target": str(flac_path),
                        "kind": "audio_retained",
                        "source_sha256": source_sha,
                        "restored_wav_sha256": source_sha,
                        "target_sha256": sha256_file(flac_path),
                        "size": st_src.st_size,
                        "allocated_bytes": st_src.st_blocks * 512,
                        "target_size": st_dst.st_size,
                        "target_allocated_bytes": st_dst.st_blocks * 512,
                    }
                )
                wav_path.unlink()
            finally:
                tmp_flac.unlink(missing_ok=True)
                tmp_wav.unlink(missing_ok=True)
        except (OSError, subprocess.CalledProcessError):
            continue
    if not records:
        return None
    receipt = {
        "schema": compaction_schema,
        "directory": str(version_dir),
        "kind": "audio_retained",
        "policy": "lossless_flac_exact_wav_bytes_recoverable",
        "records": records,
    }
    receipt_path = version_dir / compaction_filename
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt


def restore_compacted_wav_file(
    flac_path: Path,
    target_wav: Path | None = None,
    *,
    expected_sha256: str | None = None,
    flac_bin: str = "flac",
    runner: Callable[..., Any] = subprocess.run,
) -> dict[str, Any]:
    """Decode an archived lossless FLAC file back to exact WAV bytes atomically."""
    resolved_target = target_wav or flac_path.with_suffix(".wav")
    if expected_sha256 is None:
        receipt_path = flac_path.parent / "storage-compaction.json"
        if receipt_path.is_file():
            try:
                data = json.loads(receipt_path.read_text(encoding="utf-8"))
                for row in data.get("records", []):
                    if Path(row.get("target", "")) == flac_path:
                        expected_sha256 = row.get("restored_wav_sha256") or row.get("source_sha256")
                        break
            except (OSError, ValueError):
                pass
    tmp = resolved_target.with_name(f".{resolved_target.name}.{os.getpid()}.restore.wav")
    try:
        runner(
            [flac_bin, "-s", "-d", "--keep-foreign-metadata", "-f", str(flac_path), "-o", str(tmp)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        restored_sha = sha256_file(tmp)
        if expected_sha256 and restored_sha != expected_sha256:
            raise RuntimeError(f"restored WAV SHA mismatch for {flac_path}: {restored_sha} != {expected_sha256}")
        os.replace(tmp, resolved_target)
        return {
            "source_flac": str(flac_path),
            "restored_wav": str(resolved_target),
            "sha256": restored_sha,
        }
    finally:
        tmp.unlink(missing_ok=True)


__all__ = [
    "compact_archived_wav_files",
    "prune_archived_versions",
    "restore_compacted_wav_file",
    "transactional_swap_directories",
    "write_latest_pointer",
]
