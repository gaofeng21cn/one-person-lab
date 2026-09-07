"""Bounded bitmap structure inspection; quality thresholds belong to callers."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any
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
