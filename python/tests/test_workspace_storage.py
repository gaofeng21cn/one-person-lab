from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import wave

import pytest

from opl_framework.workspace_storage import (
    build_storage_report,
    clone_or_copy,
    convert_png_to_lossless_webp,
    convert_wav_to_lossless_flac,
    cow_dedup_directory,
    dir_stats,
    read_json,
    sha256_file,
    write_json_atomic,
)


def _write_wav(path: Path) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(8000)
        stream.writeframes(bytes(1600))
    return path.read_bytes()


def test_json_clone_dir_stats_and_storage_report(tmp_path: Path) -> None:
    payload = {"schema": "test/v1", "items": [1, 2, 3]}
    json_path = tmp_path / "nested" / "config.json"
    write_json_atomic(json_path, payload)
    assert read_json(json_path) == payload

    src_dir = tmp_path / "assets"
    src_dir.mkdir()
    src_file = src_dir / "sample.bin"
    raw = bytes((i % 251) for i in range(90_000))
    src_file.write_bytes(raw)
    copy_dir = tmp_path / "work"
    dst_file = copy_dir / "copy.bin"
    clone_or_copy(src_file, dst_file)
    assert sha256_file(dst_file) == sha256_file(src_file)

    stats = dir_stats(src_dir)
    assert stats["files"] == 1
    assert stats["logical_bytes"] == len(raw)

    report = build_storage_report(tmp_path, scan_dirs=("assets", "work"), min_top_dir_bytes=1)
    assert report["schema"] == "opl_workspace_storage_report/v1"
    assert report["total_files"] == 3
    assert report["shared_clone_savings_bytes"] >= 0


def test_cow_dedup_dry_run_and_apply(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    work = tmp_path / "work"
    assets.mkdir()
    work.mkdir()
    data = bytes(((i * 7) % 253) for i in range(80_000))
    (assets / "orig.bin").write_bytes(data)
    (work / "dup.bin").write_bytes(data)

    plan = cow_dedup_directory(
        tmp_path,
        scan_dirs=("assets", "work"),
        preferred_top_dir="assets",
        apply=False,
    )
    if sys.platform != "darwin":
        assert plan["status"] == "skipped_unsupported_platform"
        return
    assert plan["status"] == "planned"
    assert plan["errors"] == []

    applied = cow_dedup_directory(
        tmp_path,
        scan_dirs=("assets", "work"),
        preferred_top_dir="assets",
        apply=True,
    )
    assert applied["status"] == "deduped"
    assert applied["errors"] == []
    assert sha256_file(work / "dup.bin") == sha256_file(assets / "orig.bin")


def test_lossless_webp_and_flac_compaction(tmp_path: Path) -> None:
    if shutil.which("cwebp"):
        from PIL import Image

        png = tmp_path / "frame.png"
        webp = tmp_path / "frame.webp"
        Image.new("RGBA", (12, 12), (10, 20, 30, 255)).save(png)
        row = convert_png_to_lossless_webp({"source": str(png), "target": str(webp)})
        assert webp.is_file()
        assert len(row["pixel_sha256"]) == 64

    if shutil.which("flac"):
        wav = tmp_path / "audio.wav"
        flac = tmp_path / "audio.flac"
        orig = _write_wav(wav)
        row = convert_wav_to_lossless_flac({"source": str(wav), "target": str(flac)})
        assert flac.is_file()
        assert row["restored_wav_sha256"] == row["source_sha256"]
        assert row["source_sha256"] is not None
        assert len(orig) > 0
