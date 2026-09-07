from __future__ import annotations

from pathlib import Path
import zlib

import pytest

from opl_framework.artifact_inspection import BitmapInspectionError, inspect_bitmap


def png_bytes() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return len(data).to_bytes(4, "big") + kind + data + (zlib.crc32(kind + data) & 0xFFFFFFFF).to_bytes(4, "big")

    header = (16).to_bytes(4, "big") + (12).to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    rows = (b"\x00" + b"\xff\x00\x00" * 16) * 12
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def test_bitmap_inspection_reports_format_without_quality_thresholds() -> None:
    info = inspect_bitmap(png_bytes(), Path("figure.png"))
    assert (info["format"], info["width"], info["height"]) == ("png", 16, 12)
    assert set(info) == {"format", "media_type", "width", "height", "bytes", "sha256"}


def test_bitmap_inspection_enforces_caller_resource_limit() -> None:
    with pytest.raises(BitmapInspectionError) as raised:
        inspect_bitmap(png_bytes(), Path("figure.png"), max_png_decompressed_bytes=128)
    assert raised.value.code == "bitmap_decoded_size_exceeded"


@pytest.mark.parametrize("change", ["crc", "truncate", "extension"])
def test_bitmap_inspection_rejects_corrupt_or_mislabeled_bytes(change: str) -> None:
    data = png_bytes()
    path = Path("figure.png")
    if change == "crc":
        data = data[:29] + bytes([data[29] ^ 1]) + data[30:]
    elif change == "truncate":
        data = data[:-4]
    else:
        path = Path("figure.jpg")
    with pytest.raises(BitmapInspectionError) as raised:
        inspect_bitmap(data, path)
    assert raised.value.code == (
        "bitmap_extension_mismatch" if change == "extension" else "bitmap_structure_invalid"
    )
