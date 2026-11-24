from __future__ import annotations

from pathlib import Path
import subprocess

import pytest

from opl_framework.artifact_inspection import (
    extract_pdf_text,
    prepare_macos_fontconfig,
    render_pdf_pages,
)


def test_render_pdf_pages_and_extract_pdf_text(tmp_path: Path) -> None:
    pdf_path = tmp_path / "book.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n")
    out_dir = tmp_path / "pages"
    out_dir.mkdir()
    stale = out_dir / "page-99.png"
    stale.write_bytes(b"old")

    def fake_pdftoppm(cmd: list[str], **_kwargs) -> subprocess.CompletedProcess[str]:
        prefix = Path(cmd[-1])
        prefix.with_name(f"{prefix.name}-1.png").write_bytes(b"png1")
        prefix.with_name(f"{prefix.name}-2.png").write_bytes(b"png2")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    pages = render_pdf_pages(
        pdf_path,
        out_dir,
        prefix="page",
        dpi=180,
        pdftoppm_bin="/usr/bin/pdftoppm",
        runner=fake_pdftoppm,
    )
    assert [p.name for p in pages] == ["page-1.png", "page-2.png"]
    assert not stale.exists()

    with pytest.raises(RuntimeError, match="pdftoppm failed"):
        render_pdf_pages(
            pdf_path,
            out_dir,
            pdftoppm_bin="/usr/bin/pdftoppm",
            runner=lambda cmd, **_kw: subprocess.CompletedProcess(cmd, 2, stdout="", stderr="boom"),
        )

    text = extract_pdf_text(
        pdf_path,
        pdftotext_bin="/usr/bin/pdftotext",
        runner=lambda cmd, **_kw: subprocess.CompletedProcess(cmd, 0, stdout="hello pdf\n", stderr=""),
    )
    assert text == "hello pdf\n"


def test_prepare_macos_fontconfig(tmp_path: Path) -> None:
    explicit = tmp_path / "custom.conf"
    explicit.write_text("<fontconfig/>", encoding="utf-8")
    target = tmp_path / "build" / "fontconfig.conf"
    copied = prepare_macos_fontconfig(target, explicit_config=explicit, platform="linux")
    assert copied == target
    assert target.read_text(encoding="utf-8") == "<fontconfig/>"

    linux_none = prepare_macos_fontconfig(tmp_path / "ignored.conf", platform="linux")
    assert linux_none is None

    mac_target = tmp_path / "mac" / "fontconfig.conf"
    generated = prepare_macos_fontconfig(mac_target, cache_dir=tmp_path / "cache", platform="darwin")
    assert generated == mac_target
    xml_text = mac_target.read_text(encoding="utf-8")
    assert "fontconfig" in xml_text
    assert str(tmp_path / "cache") in xml_text
