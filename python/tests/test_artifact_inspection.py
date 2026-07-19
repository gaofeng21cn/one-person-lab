from __future__ import annotations

from pathlib import Path

import pytest

from opl_framework.artifact_inspection import (
    ContainedFileReadError,
    inspect_pdf_fonts,
    inspect_png_visual_metrics,
    read_contained_regular_file,
    sha256_bytes,
)


def test_contained_regular_file_returns_exact_bounded_bytes(tmp_path: Path) -> None:
    artifact = tmp_path / "artifacts" / "sample.bin"
    artifact.parent.mkdir()
    artifact.write_bytes(b"artifact-bytes")

    root, resolved, data = read_contained_regular_file(
        tmp_path,
        "artifacts/sample.bin",
        max_bytes=1024,
    )

    assert root == tmp_path.resolve()
    assert resolved == artifact.resolve()
    assert data == b"artifact-bytes"
    assert sha256_bytes(data) == (
        "sha256:6521df166eb07efaf36eba5b6bedefd9d6a252e9c80bab1c99653700ec71473c"
    )


@pytest.mark.parametrize(
    ("ref", "code"),
    [
        ("../outside.bin", "ref_not_contained"),
        ("/tmp/outside.bin", "ref_not_contained"),
    ],
)
def test_contained_regular_file_rejects_uncontained_refs(
    tmp_path: Path,
    ref: str,
    code: str,
) -> None:
    with pytest.raises(ContainedFileReadError) as raised:
        read_contained_regular_file(tmp_path, ref, max_bytes=1024)
    assert raised.value.code == code


def test_contained_regular_file_rejects_symlink_and_oversize(
    tmp_path: Path,
) -> None:
    artifact = tmp_path / "artifact.bin"
    artifact.write_bytes(b"1234")
    symlink = tmp_path / "artifact-link.bin"
    symlink.symlink_to(artifact)

    with pytest.raises(ContainedFileReadError) as raised:
        read_contained_regular_file(tmp_path, symlink.name, max_bytes=1024)
    assert raised.value.code == "ref_symlink"

    with pytest.raises(ContainedFileReadError) as raised:
        read_contained_regular_file(tmp_path, artifact.name, max_bytes=3)
    assert raised.value.code == "file_too_large"


def test_rendered_document_inspection_reports_raw_unavailable_state(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("shutil.which", lambda _command: None)
    fonts = inspect_pdf_fonts(tmp_path / "missing.pdf", tmp_path)
    metrics = inspect_png_visual_metrics(tmp_path / "missing.png")

    assert fonts["inspection_status"] == "tool_missing"
    assert fonts["fonts"] == []
    assert metrics["visual_scan_error"] == "rendered page PNG missing"
    assert "density_status" not in metrics
    assert "trailing_whitespace_status" not in metrics
