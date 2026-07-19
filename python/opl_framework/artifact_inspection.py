"""Read-only artifact byte and rendered-document inspection primitives."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
from typing import Any


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
    root_input = Path(root_value)
    if not root_input.is_absolute():
        raise ContainedFileReadError("root_not_absolute", "root must be an absolute path")
    try:
        root = root_input.resolve(strict=True)
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
        directory_descriptors.append(os.open(root, directory_flags))
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
        if before.st_size > max_bytes:
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
        with os.fdopen(descriptor, "rb", closefd=True) as stream:
            descriptor = None
            data = stream.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ContainedFileReadError(
                "file_too_large",
                f"ref exceeds the {max_bytes}-byte read limit while reading",
            )
        after = os.stat(
            filename,
            dir_fd=directory_descriptors[-1],
            follow_symlinks=False,
        )
        if (
            opened.st_dev,
            opened.st_ino,
            opened.st_size,
            opened.st_mtime_ns,
        ) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
        ) or len(data) != opened.st_size:
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
    return root, root / ref, data


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


__all__ = [
    "ContainedFileReadError",
    "inspect_pdf_fonts",
    "inspect_png_visual_metrics",
    "read_contained_regular_file",
    "sha256_bytes",
]
