"""Read-only artifact byte and rendered-document inspection primitives."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
from typing import Any, Callable
import xml.etree.ElementTree as ET
import zlib


PNG_DECOMPRESS_CHUNK_BYTES = 1024 * 1024


class BitmapInspectionError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


def _validate_png_idat_stream(payloads: list[bytes], max_png_decompressed_bytes: int) -> None:
    decompressor = zlib.decompressobj()
    decoded_bytes = 0
    try:
        for payload in payloads:
            pending = payload
            while pending:
                remaining = max_png_decompressed_bytes - decoded_bytes
                if remaining <= 0:
                    raise BitmapInspectionError(
                        "bitmap_decoded_size_exceeded",
                        f"PNG decompressed payload exceeds {max_png_decompressed_bytes} bytes",
                    )
                chunk = decompressor.decompress(
                    pending,
                    min(PNG_DECOMPRESS_CHUNK_BYTES, remaining + 1),
                )
                decoded_bytes += len(chunk)
                if decoded_bytes > max_png_decompressed_bytes:
                    raise BitmapInspectionError(
                        "bitmap_decoded_size_exceeded",
                        f"PNG decompressed payload exceeds {max_png_decompressed_bytes} bytes",
                    )
                pending = decompressor.unconsumed_tail
        if not decompressor.eof or decompressor.unused_data:
            raise BitmapInspectionError("bitmap_structure_invalid", "PNG IDAT stream is incomplete or has trailing data")
    except zlib.error as error:
        raise BitmapInspectionError("bitmap_structure_invalid", f"PNG IDAT payload is invalid: {error}") from error


def _png_info(data: bytes, max_png_decompressed_bytes: int) -> tuple[int, int] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    if len(data) < 33 or data[8:12] != b"\x00\x00\x00\x0d" or data[12:16] != b"IHDR":
        raise BitmapInspectionError("bitmap_structure_invalid", "PNG has no valid IHDR chunk")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    offset = 8
    idat_payloads: list[bytes] = []
    saw_idat = False
    saw_iend = False
    while offset + 12 <= len(data):
        chunk_size = int.from_bytes(data[offset:offset + 4], "big")
        chunk_end = offset + 12 + chunk_size
        if chunk_end > len(data):
            raise BitmapInspectionError("bitmap_structure_invalid", "PNG contains a truncated chunk")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + chunk_size]
        expected_crc = int.from_bytes(data[offset + 8 + chunk_size:chunk_end], "big")
        observed_crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        if expected_crc != observed_crc:
            raise BitmapInspectionError("bitmap_structure_invalid", f"PNG {kind!r} chunk CRC mismatch")
        saw_idat = saw_idat or kind == b"IDAT"
        if kind == b"IDAT":
            idat_payloads.append(payload)
        saw_iend = saw_iend or kind == b"IEND"
        offset = chunk_end
        if saw_iend:
            break
    if not saw_idat or not saw_iend:
        raise BitmapInspectionError("bitmap_structure_invalid", "PNG must contain IDAT and IEND chunks")
    _validate_png_idat_stream(idat_payloads, max_png_decompressed_bytes)
    return width, height


def _jpeg_info(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\xff\xd8"):
        return None
    offset = 2
    start_of_frame = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset < len(data):
        while offset < len(data) and data[offset] != 0xFF:
            offset += 1
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in {0x01, *range(0xD0, 0xD8)}:
            continue
        if marker in {0xD9, 0xDA}:
            break
        if offset + 2 > len(data):
            break
        segment_length = int.from_bytes(data[offset:offset + 2], "big")
        if segment_length < 2 or offset + segment_length > len(data):
            raise BitmapInspectionError("bitmap_structure_invalid", "JPEG contains a truncated segment")
        if marker in start_of_frame:
            if segment_length < 7:
                raise BitmapInspectionError("bitmap_structure_invalid", "JPEG SOF segment is too short")
            height = int.from_bytes(data[offset + 3:offset + 5], "big")
            width = int.from_bytes(data[offset + 5:offset + 7], "big")
            remainder = data[offset + segment_length:]
            if b"\xff\xda" not in remainder:
                raise BitmapInspectionError("bitmap_structure_invalid", "JPEG has no SOS marker")
            if b"\xff\xd9" not in remainder:
                raise BitmapInspectionError("bitmap_structure_invalid", "JPEG has no EOI marker")
            return width, height
        offset += segment_length
    raise BitmapInspectionError("bitmap_dimensions_missing", "JPEG has no supported SOF dimensions")


def _webp_info(data: bytes) -> tuple[int, int] | None:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    declared_size = int.from_bytes(data[4:8], "little") + 8
    if declared_size > len(data):
        raise BitmapInspectionError("bitmap_structure_invalid", "WebP RIFF payload is truncated")
    offset = 12
    while offset + 8 <= len(data):
        chunk_kind = data[offset:offset + 4]
        chunk_size = int.from_bytes(data[offset + 4:offset + 8], "little")
        payload_start = offset + 8
        payload_end = payload_start + chunk_size
        if payload_end > len(data):
            raise BitmapInspectionError("bitmap_structure_invalid", "WebP contains a truncated chunk")
        payload = data[payload_start:payload_end]
        if chunk_kind == b"VP8X" and len(payload) >= 10:
            width = 1 + int.from_bytes(payload[4:7], "little")
            height = 1 + int.from_bytes(payload[7:10], "little")
            return width, height
        if chunk_kind == b"VP8L" and len(payload) >= 5 and payload[0] == 0x2F:
            dimensions = int.from_bytes(payload[1:5], "little")
            return 1 + (dimensions & 0x3FFF), 1 + ((dimensions >> 14) & 0x3FFF)
        if chunk_kind == b"VP8 " and len(payload) >= 10 and payload[3:6] == b"\x9d\x01\x2a":
            width = int.from_bytes(payload[6:8], "little") & 0x3FFF
            height = int.from_bytes(payload[8:10], "little") & 0x3FFF
            return width, height
        offset = payload_end + (chunk_size % 2)
    raise BitmapInspectionError("bitmap_dimensions_missing", "WebP has no supported dimension chunk")


def inspect_bitmap(
    data: bytes,
    path: Path,
    *,
    max_png_decompressed_bytes: int = 256 * 1024 * 1024,
) -> dict[str, Any]:
    """Inspect encoded bitmap structure and dimensions without a quality verdict."""

    if (
        not isinstance(max_png_decompressed_bytes, int)
        or isinstance(max_png_decompressed_bytes, bool)
        or max_png_decompressed_bytes < 1
    ):
        raise ValueError("max_png_decompressed_bytes must be a positive integer")
    if not data:
        raise BitmapInspectionError("bitmap_empty", "bitmap is empty")
    detected: tuple[str, str, tuple[int, int] | None] = (
        "png",
        "image/png",
        _png_info(data, max_png_decompressed_bytes),
    )
    if detected[2] is None:
        detected = ("jpeg", "image/jpeg", _jpeg_info(data))
    if detected[2] is None:
        detected = ("webp", "image/webp", _webp_info(data))
    if detected[2] is None:
        raise BitmapInspectionError("bitmap_format_unsupported", "asset is not PNG, JPEG, or WebP")
    kind, media_type, dimensions = detected
    if dimensions is None or dimensions[0] <= 0 or dimensions[1] <= 0:
        raise BitmapInspectionError("bitmap_dimensions_invalid", "bitmap dimensions must be positive")
    suffix = path.suffix.lower().lstrip(".")
    if suffix == "jpg":
        suffix = "jpeg"
    if suffix != kind:
        raise BitmapInspectionError(
            "bitmap_extension_mismatch",
            f"bitmap bytes are {kind} but the file extension is {path.suffix or '<none>'}",
        )
    return {
        "format": kind,
        "media_type": media_type,
        "width": dimensions[0],
        "height": dimensions[1],
        "bytes": len(data),
        "sha256": f"sha256:{hashlib.sha256(data).hexdigest()}",
    }


class ContainedFileReadError(RuntimeError):
    """A file could not be read through the declared safe-root boundary."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


def sha256_bytes(data: bytes) -> str:
    """Return the canonical typed SHA-256 digest for exact bytes."""

    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def read_contained_regular_file(
    root_value: str | Path,
    ref_value: str | Path,
    *,
    max_bytes: int,
) -> tuple[Path, Path, bytes]:
    """Read one bounded regular file without accepting absolute or symlink refs."""

    if not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 0:
        raise ValueError("max_bytes must be a non-negative integer")
    root, path, data, _, _ = _inspect_contained_regular_file(
        root_value, ref_value, max_bytes=max_bytes, collect_bytes=True, resolve_root=True,
    )
    return root, path, data


def fingerprint_contained_regular_file(
    root_value: str | Path,
    ref_value: str | Path,
) -> tuple[int, str]:
    """Hash a stable regular file in bounded memory through a physical root."""

    _, _, _, size_bytes, digest = _inspect_contained_regular_file(
        root_value, ref_value, max_bytes=None, collect_bytes=False, resolve_root=False,
    )
    return size_bytes, digest


def _inspect_contained_regular_file(
    root_value: str | Path,
    ref_value: str | Path,
    *,
    max_bytes: int | None,
    collect_bytes: bool,
    resolve_root: bool,
) -> tuple[Path, Path, bytes, int, str]:
    root_input = Path(root_value)
    if not root_input.is_absolute():
        raise ContainedFileReadError("root_not_absolute", "root must be an absolute path")
    try:
        root = root_input.resolve(strict=True) if resolve_root else root_input
    except OSError as error:
        raise ContainedFileReadError("root_unavailable", str(error)) from error
    if not root.is_dir():
        raise ContainedFileReadError("root_not_directory", f"root is not a directory: {root}")

    ref_text = os.fspath(ref_value)
    ref = Path(ref_text)
    if (
        ref.is_absolute()
        or not ref.parts
        or ref.as_posix() != ref_text
        or any(part in {"", ".", ".."} for part in ref.parts)
    ):
        raise ContainedFileReadError(
            "ref_not_contained",
            "ref must be a normalized root-relative path",
        )

    if (
        not hasattr(os, "O_DIRECTORY")
        or not hasattr(os, "O_NOFOLLOW")
        or os.open not in os.supports_dir_fd
        or os.stat not in os.supports_dir_fd
        or os.stat not in os.supports_follow_symlinks
    ):
        raise ContainedFileReadError(
            "safe_open_unsupported",
            "host Python does not support directory-relative no-follow reads",
        )

    directory_descriptors: list[int] = []
    descriptor: int | None = None
    try:
        directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        root_before = root.lstat()
        if not stat.S_ISDIR(root_before.st_mode):
            raise ContainedFileReadError("root_not_directory", "root must be a physical directory")
        directory_descriptors.append(os.open(root, directory_flags))
        root_opened = os.fstat(directory_descriptors[-1])
        if (root_opened.st_dev, root_opened.st_ino) != (root_before.st_dev, root_before.st_ino):
            raise ContainedFileReadError("identity_changed", "root changed while opening")
        for part in ref.parts[:-1]:
            before_directory = os.stat(
                part,
                dir_fd=directory_descriptors[-1],
                follow_symlinks=False,
            )
            if stat.S_ISLNK(before_directory.st_mode):
                raise ContainedFileReadError(
                    "ref_symlink",
                    f"ref traverses a symlink: {ref_text}",
                )
            if not stat.S_ISDIR(before_directory.st_mode):
                raise ContainedFileReadError(
                    "ref_not_directory",
                    f"ref traverses a non-directory: {ref_text}",
                )
            next_directory = os.open(
                part,
                directory_flags,
                dir_fd=directory_descriptors[-1],
            )
            opened_directory = os.fstat(next_directory)
            if (opened_directory.st_dev, opened_directory.st_ino) != (
                before_directory.st_dev,
                before_directory.st_ino,
            ):
                os.close(next_directory)
                raise ContainedFileReadError(
                    "identity_changed",
                    f"ref changed while opening: {ref_text}",
                )
            directory_descriptors.append(next_directory)

        filename = ref.parts[-1]
        before = os.stat(
            filename,
            dir_fd=directory_descriptors[-1],
            follow_symlinks=False,
        )
        if stat.S_ISLNK(before.st_mode):
            raise ContainedFileReadError("ref_symlink", f"ref traverses a symlink: {ref_text}")
        if not stat.S_ISREG(before.st_mode):
            raise ContainedFileReadError("not_regular_file", f"ref is not a regular file: {ref_text}")
        if max_bytes is not None and before.st_size > max_bytes:
            raise ContainedFileReadError(
                "file_too_large",
                f"ref exceeds the {max_bytes}-byte read limit: {before.st_size}",
            )
        descriptor = os.open(
            filename,
            os.O_RDONLY | os.O_NOFOLLOW,
            dir_fd=directory_descriptors[-1],
        )
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise ContainedFileReadError("not_regular_file", f"ref is not a regular file: {ref_text}")
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise ContainedFileReadError("identity_changed", f"ref changed while opening: {ref_text}")
        digest = hashlib.sha256()
        size_bytes = 0
        chunks: list[bytes] = []
        while chunk := os.read(
            descriptor,
            1024 * 1024 if max_bytes is None else min(1024 * 1024, max_bytes - size_bytes + 1),
        ):
            size_bytes += len(chunk)
            if max_bytes is not None and size_bytes > max_bytes:
                raise ContainedFileReadError(
                    "file_too_large", f"ref exceeds the {max_bytes}-byte read limit while reading",
                )
            digest.update(chunk)
            if collect_bytes:
                chunks.append(chunk)
        after_descriptor = os.fstat(descriptor)
        after = os.stat(
            filename,
            dir_fd=directory_descriptors[-1],
            follow_symlinks=False,
        )
        def identity(value: os.stat_result) -> tuple[int, int, int, int, int]:
            return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns

        if (
            not stat.S_ISREG(after_descriptor.st_mode)
            or stat.S_ISLNK(after.st_mode)
            or identity(opened) != identity(after_descriptor)
            or identity(opened) != identity(after)
            or size_bytes != opened.st_size
        ):
            raise ContainedFileReadError("identity_changed", f"ref changed while reading: {ref_text}")
    except ContainedFileReadError:
        raise
    except OSError as error:
        raise ContainedFileReadError("file_unavailable", str(error)) from error
    finally:
        if descriptor is not None:
            os.close(descriptor)
        for directory_descriptor in reversed(directory_descriptors):
            os.close(directory_descriptor)
    return root, root / ref, b"".join(chunks), size_bytes, f"sha256:{digest.hexdigest()}"


def inspect_pdf_fonts(pdf_path: Path, root: Path) -> dict[str, Any]:
    """Return raw pdffonts inventory without assigning publication quality."""

    tool = shutil.which("pdffonts")
    if not tool:
        return {
            "inspection_status": "tool_missing",
            "tool": "pdffonts",
            "embedded_font_count": 0,
            "non_embedded_font_count": 0,
            "fonts": [],
            "error": "pdffonts not found",
        }
    result = subprocess.run(
        [tool, str(pdf_path)],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return {
            "inspection_status": "tool_error",
            "tool": tool,
            "embedded_font_count": 0,
            "non_embedded_font_count": 0,
            "fonts": [],
            "error": (result.stderr or result.stdout or "pdffonts failed").strip()[-1000:],
        }

    fonts: list[dict[str, Any]] = []
    for raw_line in result.stdout.splitlines()[2:]:
        if not raw_line.strip():
            continue
        parts = raw_line.split()
        embedded = parts[-5].lower() if len(parts) >= 6 else "unknown"
        fonts.append(
            {
                "name": parts[0],
                "embedded": embedded == "yes",
                "embedded_raw": embedded,
                "raw": raw_line.rstrip(),
            }
        )
    non_embedded = [font for font in fonts if font["embedded_raw"] not in ("yes", "unknown")]
    embedded_count = sum(1 for font in fonts if font["embedded"])
    return {
        "inspection_status": "available",
        "tool": tool,
        "embedded_font_count": embedded_count,
        "non_embedded_font_count": len(non_embedded),
        "fonts": fonts,
        "error": None,
    }


def inspect_png_visual_metrics(
    path: Path,
) -> dict[str, Any]:
    """Measure raw PNG density without assigning threshold-based quality."""

    size = path.stat().st_size if path.exists() else 0
    metrics: dict[str, Any] = {
        "bytes": size,
        "width": None,
        "height": None,
        "nonblank_baseline": False,
        "fill_ratio": None,
        "trailing_whitespace_ratio": None,
        "visual_scan_error": None,
    }
    if not path.exists():
        metrics["visual_scan_error"] = "rendered page PNG missing"
        return metrics
    try:
        from PIL import Image
    except ImportError:
        metrics["visual_scan_error"] = "Pillow not available"
        return metrics

    try:
        with Image.open(path) as image:
            rgb = image.convert("RGB")
            width, height = rgb.size
            background = rgb.getpixel((0, 0))
            sample_step = max(1, width // 160)
            row_step = max(1, height // 240)
            non_background = 0
            sampled = 0
            last_content_y = 0
            for y in range(0, height, row_step):
                row_has_content = False
                for x in range(0, width, sample_step):
                    pixel = rgb.getpixel((x, y))
                    sampled += 1
                    if max(abs(pixel[index] - background[index]) for index in range(3)) > 12:
                        non_background += 1
                        row_has_content = True
                if row_has_content:
                    last_content_y = y
            fill_ratio = non_background / sampled if sampled else 0
            trailing_ratio = (height - last_content_y) / height if height else 1
            metrics.update(
                {
                    "width": width,
                    "height": height,
                    "nonblank_baseline": non_background > 0,
                    "fill_ratio": round(fill_ratio, 4),
                    "trailing_whitespace_ratio": round(trailing_ratio, 4),
                }
            )
    except Exception as error:
        metrics["visual_scan_error"] = str(error)
    return metrics


def render_pdf_pages(
    pdf_path: Path,
    output_dir: Path,
    *,
    prefix: str = "page",
    dpi: int = 150,
    cwd: Path | None = None,
    pdftoppm_bin: str | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    clean_existing: bool = True,
) -> list[Path]:
    """Render PDF pages to PNG images via pdftoppm without assigning publication quality."""
    tool = pdftoppm_bin or shutil.which("pdftoppm")
    if not tool:
        raise FileNotFoundError("pdftoppm not found")
    output_dir.mkdir(parents=True, exist_ok=True)
    if clean_existing:
        for old_page in output_dir.glob(f"{prefix}-*.png"):
            old_page.unlink()
    result = runner(
        [tool, "-png", "-r", str(dpi), str(pdf_path), str(output_dir / prefix)],
        cwd=cwd or output_dir,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pdftoppm failed").strip()[-2000:]
        raise RuntimeError(f"pdftoppm failed with exit code {result.returncode}: {detail}")
    return sorted(output_dir.glob(f"{prefix}-*.png"))


def extract_pdf_text(
    pdf_path: Path,
    *,
    raw: bool = True,
    cwd: Path | None = None,
    pdftotext_bin: str | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> str:
    """Extract raw text stream from a PDF via pdftotext."""
    tool = pdftotext_bin or shutil.which("pdftotext")
    if not tool:
        raise FileNotFoundError("pdftotext not found")
    command = [tool, *(["-raw"] if raw else []), str(pdf_path), "-"]
    result = runner(
        command,
        cwd=cwd or pdf_path.parent,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pdftotext failed").strip()[-2000:]
        raise RuntimeError(f"pdftotext failed with exit code {result.returncode}: {detail}")
    return result.stdout


def prepare_macos_fontconfig(
    target_path: Path,
    *,
    explicit_config: Path | None = None,
    cache_dir: Path | None = None,
    platform: str = sys.platform,
) -> Path | None:
    """Copy an explicit fontconfig file or synthesize a macOS system/user fontconfig XML file."""
    if explicit_config is not None:
        if not explicit_config.is_file():
            raise FileNotFoundError(f"Fontconfig file not found: {explicit_config}")
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(explicit_config.read_bytes())
        return target_path
    if platform != "darwin":
        return None
    font_dirs = [
        Path("/System/Library/Fonts"),
        Path("/Library/Fonts"),
        Path.home() / "Library" / "Fonts",
    ]
    config = ET.Element("fontconfig")
    for directory in font_dirs:
        if directory.is_dir():
            ET.SubElement(config, "dir").text = str(directory)
    resolved_cache = cache_dir or (target_path.parent.parent / "font-cache")
    resolved_cache.mkdir(parents=True, exist_ok=True)
    ET.SubElement(config, "cachedir").text = str(resolved_cache)
    ET.SubElement(config, "config")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(
        '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n'
        + ET.tostring(config, encoding="unicode")
        + "\n",
        encoding="utf-8",
    )
    return target_path


__all__ = [
    "BitmapInspectionError",
    "ContainedFileReadError",
    "extract_pdf_text",
    "fingerprint_contained_regular_file",
    "inspect_bitmap",
    "inspect_pdf_fonts",
    "inspect_png_visual_metrics",
    "prepare_macos_fontconfig",
    "read_contained_regular_file",
    "render_pdf_pages",
    "sha256_bytes",
]
