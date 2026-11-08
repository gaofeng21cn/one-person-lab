"""Deterministic, domain-neutral publication-package archive primitives.

This module owns byte-level archive mechanics only.  Domain agents retain the
authority to select source bytes, declare package membership, and authorize a
materialization.  Callers must supply one frozen, timezone-aware finalization
instant rather than relying on host filesystem mtimes.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import struct
from typing import Any
import zipfile

from .file_hash import sha256_file


ZIP_CONTAINER_EPOCH = (1980, 1, 1, 0, 0, 0)
ZIP_EXTENDED_TIMESTAMP_HEADER_ID = 0x5455
ZIP_FILE_MODE = 0o100644


class PublicationPackageError(ValueError):
    """A deterministic publication-package contract was violated."""


def canonical_json_bytes(payload: object) -> bytes:
    """Serialize a JSON-compatible payload as stable UTF-8 bytes."""

    return (
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    """Return an unprefixed SHA-256 digest for exact bytes."""

    return hashlib.sha256(value).hexdigest()


def safe_relative_path(value: str, *, field: str = "path") -> str:
    """Validate and normalize one portable archive member path."""

    if not isinstance(value, str) or not value.strip():
        raise PublicationPackageError(f"{field} must be a non-empty relative path")
    pure_path = PurePosixPath(value)
    if (
        pure_path.is_absolute()
        or "\\" in value
        or value != pure_path.as_posix()
        or any(part in {"", ".", ".."} for part in pure_path.parts)
    ):
        raise PublicationPackageError(f"{field} must be a contained normalized path: {value!r}")
    return pure_path.as_posix()


def canonical_utc_timestamp(value: object, *, field: str) -> datetime:
    """Parse a timezone-aware ISO-8601 instant as UTC."""

    if not isinstance(value, str) or not value.strip():
        raise PublicationPackageError(f"{field} must be a non-empty ISO-8601 timestamp")
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as error:
        raise PublicationPackageError(f"{field} is not valid ISO-8601: {value!r}") from error
    if parsed.tzinfo is None:
        raise PublicationPackageError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc)


def zip_dos_timestamp(value: object, *, field: str) -> tuple[int, int, int, int, int, int]:
    """Return deterministic UTC ZIP/DOS timestamp components at two-second precision."""

    parsed = canonical_utc_timestamp(value, field=field)
    if not 1980 <= parsed.year <= 2107:
        raise PublicationPackageError(f"{field} is outside the ZIP timestamp range")
    return (
        parsed.year,
        parsed.month,
        parsed.day,
        parsed.hour,
        parsed.minute,
        parsed.second - parsed.second % 2,
    )


def zip_extended_timestamp(value: object, *, field: str) -> bytes:
    """Build the standard UTC extended-mtime ZIP extra field."""

    parsed = canonical_utc_timestamp(value, field=field)
    epoch_seconds = int(parsed.timestamp())
    if not 0 <= epoch_seconds <= 0xFFFFFFFF:
        raise PublicationPackageError(f"{field} is outside the extended ZIP timestamp range")
    payload = struct.pack("<BI", 0x01, epoch_seconds)
    return struct.pack("<HH", ZIP_EXTENDED_TIMESTAMP_HEADER_ID, len(payload)) + payload


def _iter_regular_files(root: Path) -> Iterable[tuple[str, Path]]:
    if root.is_symlink():
        raise PublicationPackageError(f"source root must not be a symbolic link: {root}")
    resolved_root = root.resolve(strict=True)
    if not resolved_root.is_dir():
        raise PublicationPackageError(f"source root is not a directory: {resolved_root}")
    for path in sorted(resolved_root.rglob("*")):
        if path.is_symlink():
            raise PublicationPackageError(f"source tree must not contain symbolic links: {path}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise PublicationPackageError(f"source tree contains a non-regular file: {path}")
        relative = safe_relative_path(path.relative_to(resolved_root).as_posix())
        yield relative, path


def package_inventory(root: Path) -> list[dict[str, object]]:
    """Return a lexical, exact-byte inventory for a package tree."""

    return [
        {
            "path": relative,
            "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for relative, path in _iter_regular_files(root)
    ]


def package_inventory_sha256(inventory: list[dict[str, object]]) -> str:
    """Hash a canonical package inventory."""

    return sha256_bytes(canonical_json_bytes(inventory))


def _validated_expected_inventory(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise PublicationPackageError("expected_inventory must be a lexical list")
    normalized: list[dict[str, object]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict) or set(entry) != {"path", "size_bytes", "sha256"}:
            raise PublicationPackageError(
                f"expected_inventory[{index}] must contain path, size_bytes, and sha256"
            )
        path = safe_relative_path(entry["path"], field=f"expected_inventory[{index}].path")
        size = entry["size_bytes"]
        digest = entry["sha256"]
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise PublicationPackageError(
                f"expected_inventory[{index}].size_bytes must be a non-negative integer"
            )
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or digest != digest.lower()
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise PublicationPackageError(
                f"expected_inventory[{index}].sha256 must be a lowercase SHA-256 digest"
            )
        normalized.append({"path": path, "size_bytes": size, "sha256": digest})
    paths = [str(entry["path"]) for entry in normalized]
    if paths != sorted(paths) or len(paths) != len(set(paths)):
        raise PublicationPackageError("expected_inventory paths must be strictly lexical and unique")
    return normalized


def _verified_source_inventory(
    source_root: Path,
    expected_inventory: list[dict[str, object]] | None,
) -> list[dict[str, object]]:
    actual = package_inventory(source_root)
    if expected_inventory is not None:
        expected = _validated_expected_inventory(expected_inventory)
        if expected != actual:
            raise PublicationPackageError(
                "source tree does not match the authorized expected_inventory"
            )
    return actual


def _zip_info(
    relative: str,
    *,
    member_timestamp: tuple[int, int, int, int, int, int],
    member_extra: bytes,
) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(relative, date_time=member_timestamp)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.create_version = 20
    info.extract_version = 20
    info.external_attr = ZIP_FILE_MODE << 16
    info.internal_attr = 0
    info.extra = member_extra
    info.comment = b""
    return info


def _require_user_visible_timestamp(value: object, *, field: str) -> tuple[int, int, int, int, int, int]:
    timestamp = zip_dos_timestamp(value, field=field)
    if timestamp[0] == ZIP_CONTAINER_EPOCH[0]:
        raise PublicationPackageError(
            "user-visible archive timestamp must not use the ZIP container epoch year"
        )
    return timestamp


def _absolute_path_without_symlinks(path_value: Path, *, field: str) -> Path:
    """Return an absolute path only when no existing component is a symlink."""

    path = Path(os.path.abspath(path_value.expanduser()))
    cursor = Path(path.anchor)
    for part in path.parts[1:]:
        cursor /= part
        if cursor.is_symlink():
            raise PublicationPackageError(f"{field} must not traverse a symbolic link: {cursor}")
    return path


def _archive_destination(source_root: Path, archive_path: Path) -> Path:
    destination = _absolute_path_without_symlinks(archive_path, field="archive path")
    if destination.exists():
        raise PublicationPackageError(f"archive already exists: {destination}")
    try:
        destination.relative_to(source_root)
    except ValueError:
        return destination
    raise PublicationPackageError("archive path must not be inside the source root")


def _existing_archive_path(archive_path: Path) -> Path:
    path = _absolute_path_without_symlinks(archive_path, field="archive path")
    if path.is_symlink() or not path.is_file():
        raise PublicationPackageError(f"archive path must be a regular file: {path}")
    return path


def _expected_flag_bits(filename: str) -> int:
    try:
        filename.encode("ascii")
    except UnicodeEncodeError:
        return 0x800
    return 0


def write_deterministic_archive(
    source_root: Path,
    archive_path: Path,
    *,
    finalized_at_utc: object,
    expected_inventory: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    """Write a new deterministic outer archive for one frozen package tree.

    The destination must not yet exist.  Replacing a preferred publication root
    is a separate, authorization-bound OPL artifact-projection operation.
    """

    if source_root.is_symlink():
        raise PublicationPackageError(f"source root must not be a symbolic link: {source_root}")
    source_root = source_root.resolve(strict=True)
    archive_path = _archive_destination(source_root, archive_path)
    _verified_source_inventory(source_root, expected_inventory)
    member_timestamp = _require_user_visible_timestamp(
        finalized_at_utc, field="finalized_at_utc"
    )
    member_extra = zip_extended_timestamp(finalized_at_utc, field="finalized_at_utc")
    files = list(_iter_regular_files(source_root))
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        archive_path,
        "x",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        archive.comment = b""
        for relative, path in files:
            archive.writestr(
                _zip_info(
                    relative,
                    member_timestamp=member_timestamp,
                    member_extra=member_extra,
                ),
                path.read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )
    return verify_deterministic_archive(
        source_root,
        archive_path,
        finalized_at_utc=finalized_at_utc,
        expected_inventory=expected_inventory,
    )


def verify_deterministic_archive(
    source_root: Path,
    archive_path: Path,
    *,
    finalized_at_utc: object,
    expected_inventory: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    """Verify archive membership, bytes, portable time and canonical metadata."""

    if source_root.is_symlink():
        raise PublicationPackageError(f"source root must not be a symbolic link: {source_root}")
    source_root = source_root.resolve(strict=True)
    archive_path = _existing_archive_path(archive_path)
    source_inventory = _verified_source_inventory(source_root, expected_inventory)
    member_timestamp = _require_user_visible_timestamp(
        finalized_at_utc, field="finalized_at_utc"
    )
    member_extra = zip_extended_timestamp(finalized_at_utc, field="finalized_at_utc")
    expected = {relative: path for relative, path in _iter_regular_files(source_root)}
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if names != sorted(names) or len(names) != len(set(names)):
            raise PublicationPackageError("archive members must be strictly lexical and unique")
        if archive.comment or archive.testzip() is not None:
            raise PublicationPackageError("archive comment or CRC contract failed")
        if set(names) != set(expected):
            raise PublicationPackageError("archive membership does not match the package tree")
        for info in archive.infolist():
            if (
                info.is_dir()
                or info.date_time != member_timestamp
                or info.create_system != 3
                or info.create_version != 20
                or info.extract_version != 20
                or info.external_attr >> 16 != ZIP_FILE_MODE
                or info.compress_type != zipfile.ZIP_DEFLATED
                or info.flag_bits != _expected_flag_bits(info.filename)
                or info.extra != member_extra
                or info.comment
            ):
                raise PublicationPackageError(
                    f"archive member metadata is not canonical: {info.filename}"
                )
            path = expected[info.filename]
            if info.file_size != path.stat().st_size:
                raise PublicationPackageError(f"archive member size differs: {info.filename}")
            with archive.open(info.filename) as handle:
                digest = hashlib.sha256()
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != sha256_file(path):
                raise PublicationPackageError(f"archive member bytes differ: {info.filename}")
    return {
        "path": archive_path.name,
        "sha256": sha256_file(archive_path),
        "size_bytes": archive_path.stat().st_size,
        "member_count": len(expected),
        "source_inventory_sha256": package_inventory_sha256(source_inventory),
        "member_timestamp_utc": datetime(*member_timestamp, tzinfo=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "portable_utc_extended_timestamp": True,
        "strict_lexical_order": True,
        "exact_member_bytes_passed": True,
        "crc_passed": True,
    }


def write_sha256_sidecar(path: Path) -> Path:
    """Create a new conventional SHA-256 sidecar beside an exact artifact."""

    path = _existing_archive_path(path)
    sidecar = path.with_name(f"{path.name}.sha256")
    if sidecar.exists() or sidecar.is_symlink():
        raise PublicationPackageError(f"SHA-256 sidecar already exists: {sidecar}")
    with sidecar.open("x", encoding="utf-8") as handle:
        handle.write(f"{sha256_file(path)}  {path.name}\n")
    return sidecar


def verify_sha256_sidecar(path: Path, sidecar: Path | None = None) -> dict[str, str]:
    """Fail closed unless one conventional SHA-256 sidecar matches exact bytes."""

    path = _existing_archive_path(path)
    sidecar = sidecar or path.with_name(f"{path.name}.sha256")
    sidecar = _absolute_path_without_symlinks(sidecar, field="SHA-256 sidecar")
    if sidecar.is_symlink() or not sidecar.is_file():
        raise PublicationPackageError(f"SHA-256 sidecar must be a regular file: {sidecar}")
    expected = f"{sha256_file(path)}  {path.name}\n"
    actual = sidecar.read_text(encoding="utf-8")
    if actual != expected:
        raise PublicationPackageError(f"SHA-256 sidecar does not match archive bytes: {sidecar}")
    return {"path": sidecar.name, "sha256": sha256_file(path)}


__all__ = [
    "PublicationPackageError",
    "ZIP_CONTAINER_EPOCH",
    "canonical_json_bytes",
    "canonical_utc_timestamp",
    "package_inventory",
    "package_inventory_sha256",
    "safe_relative_path",
    "sha256_bytes",
    "sha256_file",
    "verify_deterministic_archive",
    "verify_sha256_sidecar",
    "write_deterministic_archive",
    "write_sha256_sidecar",
    "zip_dos_timestamp",
    "zip_extended_timestamp",
]
