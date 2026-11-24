"""Generic workspace storage metrics, APFS clone/dedup, atomic JSON, and lossless media compaction primitives."""

from __future__ import annotations

import collections
from concurrent.futures import ThreadPoolExecutor
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Iterable, Sequence

DEFAULT_SKIP_DIRS: frozenset[str] = frozenset(
    {".git", "node_modules", "__pycache__", ".venv", ".cache"}
)
F_LOG2PHYS = 49


def iso_timestamp() -> str:
    """Return local ISO-8601 timestamp with timezone offset."""
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def sha256_file(path: Path) -> str:
    """Return lowercase hexadecimal SHA-256 digest of a regular file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> Any:
    """Read UTF-8 JSON content from path."""
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(
    path: Path,
    value: Any,
    *,
    ensure_ascii: bool = False,
    indent: int = 2,
) -> None:
    """Atomically write JSON via a sibling temp file + os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            json.dumps(value, ensure_ascii=ensure_ascii, indent=indent) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, path)
    finally:
        if temporary.exists() or temporary.is_symlink():
            temporary.unlink(missing_ok=True)


def allocated_bytes(path: Path) -> int:
    """Return allocated filesystem block bytes (st_blocks * 512)."""
    return path.stat().st_blocks * 512


def clone_or_copy(src: Path, dst: Path) -> None:
    """Clone file via APFS clonefile on macOS when possible, falling back to shutil.copy2."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin" and src.is_file() and not src.is_symlink():
        try:
            libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
            clonefile_fn = libc.clonefile
            clonefile_fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
            clonefile_fn.restype = ctypes.c_int
            if dst.exists() or dst.is_symlink():
                dst.unlink()
            if clonefile_fn(os.fsencode(src), os.fsencode(dst), 0) == 0:
                return
        except OSError:
            pass
    shutil.copy2(src, dst)


def dir_stats(
    root: Path,
    *,
    skip_dirs: Iterable[str] = DEFAULT_SKIP_DIRS,
) -> dict[str, int]:
    """Sum file count, logical byte size, and allocated block bytes under root."""
    skip_set = set(skip_dirs)
    files = logical_bytes = alloc_bytes = 0
    if not root.exists():
        return {"files": 0, "logical_bytes": 0, "allocated_bytes": 0}
    if root.is_file() and not root.is_symlink():
        st = root.lstat()
        return {
            "files": 1,
            "logical_bytes": st.st_size,
            "allocated_bytes": st.st_blocks * 512,
        }
    for dp, dns, fns in os.walk(root, followlinks=False):
        dns[:] = [d for d in dns if d not in skip_set and not (Path(dp) / d).is_symlink()]
        for fn in fns:
            p = Path(dp) / fn
            if p.is_symlink():
                continue
            try:
                st = p.lstat()
            except OSError:
                continue
            files += 1
            logical_bytes += st.st_size
            alloc_bytes += st.st_blocks * 512
    return {
        "files": files,
        "logical_bytes": logical_bytes,
        "allocated_bytes": alloc_bytes,
    }


def physical_extent_offset(path: Path) -> int | None:
    """Return physical device offset via macOS F_LOG2PHYS ioctl, or None if unavailable."""
    if sys.platform != "darwin":
        return None
    import fcntl

    try:
        fd = os.open(path, os.O_RDONLY)
        try:
            res = fcntl.fcntl(fd, F_LOG2PHYS, struct.pack("<Iqq", 0, 0, 0))
            _flags, _contig, devoff = struct.unpack("<Iqq", res)
            return devoff if devoff > 0 else None
        finally:
            os.close(fd)
    except OSError:
        return None


def physical_extent_key(path: Path) -> tuple[int, int] | None:
    """Return `(st_dev, devoff)` physical extent key when available."""
    devoff = physical_extent_offset(path)
    if devoff is None:
        return None
    try:
        st = path.lstat()
    except OSError:
        return None
    return (st.st_dev, devoff)


def build_storage_report(
    workspace: Path,
    *,
    scan_dirs: Sequence[str] | None = None,
    skip_dirs: Iterable[str] = DEFAULT_SKIP_DIRS,
    schema: str = "opl_workspace_storage_report/v1",
    timestamp: str | None = None,
    min_top_dir_bytes: int = 1024 * 1024,
) -> dict[str, Any]:
    """Read-only dual-metric storage report: logical allocation vs extent-deduped physical blocks."""
    workspace = workspace.resolve()
    del skip_dirs, scan_dirs  # Full top-level scan preserves extent-dedup accounting.
    seen_global: set[tuple[int, int]] = set()
    per_top: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0, 0])
    total_files = total_logical = total_unique_phys = 0

    for entry in sorted(workspace.iterdir(), key=lambda p: p.name):
        top = entry.name
        seen_top: set[tuple[int, int]] = set()
        if entry.is_symlink():
            continue
        if entry.is_file():
            try:
                al = entry.lstat().st_blocks * 512
            except OSError:
                continue
            per_top[top][0] += 1
            per_top[top][1] += al
            per_top[top][2] += al
            total_files += 1
            total_logical += al
            total_unique_phys += al
            continue
        for dp, dns, fns in os.walk(entry, followlinks=False):
            dns[:] = [d for d in dns if not (Path(dp) / d).is_symlink()]
            for fn in fns:
                p = Path(dp) / fn
                if p.is_symlink():
                    continue
                try:
                    al = p.lstat().st_blocks * 512
                except OSError:
                    continue
                per_top[top][0] += 1
                per_top[top][1] += al
                total_files += 1
                total_logical += al
                devoff = physical_extent_offset(p) if al > 0 else None
                key = (devoff, al) if devoff is not None else None
                if key is None or key not in seen_top:
                    if key is not None:
                        seen_top.add(key)
                    per_top[top][2] += al
                if key is None or key not in seen_global:
                    if key is not None:
                        seen_global.add(key)
                    total_unique_phys += al

    vfs = os.statvfs(workspace)
    return {
        "schema": schema,
        "created_at": timestamp or iso_timestamp(),
        "workspace": str(workspace),
        "platform": sys.platform,
        "total_files": total_files,
        "total_logical_alloc_bytes": total_logical,
        "total_logical_alloc_gib": round(total_logical / 1024**3, 2),
        "total_unique_physical_bytes": total_unique_phys,
        "total_unique_physical_gib": round(total_unique_phys / 1024**3, 2),
        "shared_clone_savings_bytes": max(0, total_logical - total_unique_phys),
        "disk_free_bytes": vfs.f_bavail * vfs.f_frsize,
        "by_top_dir": {
            k: {
                "files": v[0],
                "logical_bytes": v[1],
                "logical_gib": round(v[1] / 1024**3, 2),
                "unique_phys_bytes": v[2],
                "unique_phys_gib": round(v[2] / 1024**3, 2),
            }
            for k, v in sorted(per_top.items(), key=lambda x: -x[1][1])
            if v[1] >= min_top_dir_bytes
        },
    }


def cow_dedup_directory(
    workspace: Path,
    *,
    scan_dirs: Sequence[str],
    skip_dirs: Iterable[str] = DEFAULT_SKIP_DIRS,
    min_bytes: int = 65536,
    apply: bool = False,
    schema: str = "opl_apfs_cow_dedup/v1",
    preferred_top_dir: str | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Atomic APFS Copy-on-Write (clonefile) physical block deduplication across duplicate files."""
    workspace = workspace.resolve()
    if sys.platform != "darwin":
        return {"status": "skipped_unsupported_platform", "platform": sys.platform}

    libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    clonefile_fn = libc.clonefile
    clonefile_fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
    clonefile_fn.restype = ctypes.c_int

    skip_set = set(skip_dirs)
    by_size: dict[int, list[tuple[Path, int]]] = collections.defaultdict(list)
    scanned = 0
    for rel_root in scan_dirs:
        root = workspace / rel_root
        if not root.exists():
            continue
        for dp, dns, fns in os.walk(root, followlinks=False):
            dns[:] = [d for d in dns if d not in skip_set and not (Path(dp) / d).is_symlink()]
            for fn in fns:
                p = Path(dp) / fn
                if p.is_symlink():
                    continue
                try:
                    st = p.lstat()
                except OSError:
                    continue
                scanned += 1
                if st.st_size >= min_bytes and st.st_nlink == 1:
                    by_size[st.st_size].append((p, st.st_blocks * 512))

    candidates = [p for items in by_size.values() if len(items) > 1 for p, _ in items]
    sha_map: dict[Path, str] = {}
    if candidates:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for p, digest in zip(candidates, pool.map(sha256_file, candidates)):
                sha_map[p] = digest

    groups: dict[tuple[int, str], list[Path]] = collections.defaultdict(list)
    for sz, items in by_size.items():
        if len(items) <= 1:
            continue
        for p, _ in items:
            digest = sha_map.get(p)
            if digest:
                groups[(sz, digest)].append(p)

    deduped = already_shared = reclaimed_bytes = 0
    errors: list[dict[str, str]] = []
    for (sz, expected_sha), paths in groups.items():
        if len(paths) <= 1:
            continue
        paths.sort(
            key=lambda p: (
                0 if preferred_top_dir and p.relative_to(workspace).parts[0] == preferred_top_dir else 1,
                str(p),
            )
        )
        canonical = paths[0]
        canon_devoff = physical_extent_offset(canonical)
        if canon_devoff is None:
            continue
        for target in paths[1:]:
            try:
                cur_devoff = physical_extent_offset(target)
                if cur_devoff == canon_devoff:
                    already_shared += 1
                    continue
                st_before = target.lstat()
                if st_before.st_size != sz or st_before.st_nlink != 1:
                    continue
                alloc = st_before.st_blocks * 512
                if not apply:
                    deduped += 1
                    reclaimed_bytes += alloc
                    continue
                tmp = target.with_name(f".{target.name}.{os.getpid()}.cowtmp")
                try:
                    rc = clonefile_fn(os.fsencode(canonical), os.fsencode(tmp), 0)
                    if rc != 0:
                        raise OSError(f"clonefile failed rc={rc}")
                    if sha256_file(tmp) != expected_sha:
                        raise RuntimeError("cloned SHA mismatch")
                    if os.path.samefile(canonical, tmp) or tmp.lstat().st_nlink != 1:
                        raise RuntimeError("clone unexpectedly shared inode or hardlinked")
                    os.chmod(tmp, st_before.st_mode & 0o7777)
                    os.utime(tmp, ns=(st_before.st_atime_ns, st_before.st_mtime_ns))
                    os.replace(tmp, target)
                finally:
                    if tmp.exists() or tmp.is_symlink():
                        tmp.unlink(missing_ok=True)
                if physical_extent_offset(target) != canon_devoff:
                    raise RuntimeError("devoff did not converge")
                deduped += 1
                reclaimed_bytes += alloc
            except Exception as exc:
                errors.append({"path": str(target), "error": str(exc)})

    return {
        "schema": schema,
        "status": "deduped" if apply else "planned",
        "created_at": timestamp or iso_timestamp(),
        "scanned_files": scanned,
        "hashed_candidates": len(candidates),
        "deduped_files": deduped,
        "already_shared_files": already_shared,
        "reclaimed_physical_bytes": reclaimed_bytes,
        "reclaimed_physical_gib": round(reclaimed_bytes / 1024**3, 2),
        "errors": errors,
    }


def pixel_sha256(path: Path) -> str:
    """Compute SHA-256 digest over decoded RGBA dimensions and raw pixel bytes."""
    from PIL import Image

    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        digest = hashlib.sha256()
        digest.update(json.dumps(rgba.size).encode("ascii"))
        digest.update(rgba.tobytes())
        return digest.hexdigest()


def _prior_compaction_record(target: Path, receipt_filename: str = "storage-compaction.json") -> dict[str, Any] | None:
    receipt = target.parent / receipt_filename
    if not receipt.is_file():
        return None
    for row in read_json(receipt).get("records", []):
        if Path(row.get("target", "")) == target:
            return row
    return None


def convert_png_to_lossless_webp(
    row: dict[str, Any],
    *,
    cwebp_bin: str = "cwebp",
    runner: Callable[..., Any] = subprocess.run,
    receipt_filename: str = "storage-compaction.json",
) -> dict[str, Any]:
    """Losslessly convert PNG to exact lossless WebP while verifying RGBA pixel SHA-256."""
    source, target = Path(row["source"]), Path(row["target"])
    if source.exists() and target.exists():
        if pixel_sha256(source) != pixel_sha256(target):
            raise RuntimeError(f"existing WebP pixel digest does not match PNG: {target}")
    elif source.exists():
        temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp.webp")
        try:
            runner(
                [cwebp_bin, "-quiet", "-lossless", "-exact", "-z", "4", "-mt", str(source), "-o", str(temporary)],
                check=True,
            )
            if pixel_sha256(source) != pixel_sha256(temporary):
                raise RuntimeError(f"WebP pixel verification failed: {source}")
            os.replace(temporary, target)
            os.utime(target, ns=(source.stat().st_atime_ns, source.stat().st_mtime_ns))
        finally:
            temporary.unlink(missing_ok=True)
    elif not target.exists():
        raise FileNotFoundError(f"neither source PNG nor target WebP exists: {source}")
    else:
        previous = _prior_compaction_record(target, receipt_filename)
        if previous is None or previous.get("pixel_sha256") != pixel_sha256(target):
            raise RuntimeError(f"target WebP exists without verifiable compaction receipt: {target}")
        row = {**row, **previous}
    return {
        **row,
        "source_sha256": sha256_file(source) if source.exists() else None,
        "target_sha256": sha256_file(target),
        "pixel_sha256": pixel_sha256(target),
        "target_size": target.stat().st_size,
        "target_allocated_bytes": allocated_bytes(target),
    }


def exact_wav_sha_from_flac(
    flac_path: Path,
    directory: Path,
    *,
    flac_bin: str = "flac",
    runner: Callable[..., Any] = subprocess.run,
) -> str:
    """Decode FLAC with foreign metadata preserved to a temp WAV and return exact byte SHA-256."""
    with tempfile.NamedTemporaryFile(suffix=".wav", dir=directory, delete=False) as handle:
        restored = Path(handle.name)
    try:
        runner(
            [flac_bin, "-s", "-d", "--keep-foreign-metadata", "-f", str(flac_path), "-o", str(restored)],
            check=True,
        )
        return sha256_file(restored)
    finally:
        restored.unlink(missing_ok=True)


def convert_wav_to_lossless_flac(
    row: dict[str, Any],
    *,
    flac_bin: str = "flac",
    runner: Callable[..., Any] = subprocess.run,
    receipt_filename: str = "storage-compaction.json",
) -> dict[str, Any]:
    """Losslessly convert RIFF WAV to FLAC with foreign metadata and exact WAV byte verification."""
    source, target = Path(row["source"]), Path(row["target"])
    source_sha = sha256_file(source) if source.exists() else None
    if source.exists() and target.exists():
        if exact_wav_sha_from_flac(target, target.parent, flac_bin=flac_bin, runner=runner) != source_sha:
            raise RuntimeError(f"existing FLAC does not decode to current WAV bytes: {target}")
    elif source.exists():
        temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp.flac")
        try:
            runner(
                [flac_bin, "-s", "--verify", "--keep-foreign-metadata", "-8", "-f", str(source), "-o", str(temporary)],
                check=True,
            )
            restored_sha = exact_wav_sha_from_flac(temporary, target.parent, flac_bin=flac_bin, runner=runner)
            if restored_sha != source_sha:
                raise RuntimeError(f"FLAC decoded WAV byte digest mismatch: {source}")
            os.replace(temporary, target)
            os.utime(target, ns=(source.stat().st_atime_ns, source.stat().st_mtime_ns))
        finally:
            temporary.unlink(missing_ok=True)
    elif not target.exists():
        raise FileNotFoundError(f"neither source WAV nor target FLAC exists: {source}")
    else:
        previous = _prior_compaction_record(target, receipt_filename)
        if previous is None or previous.get("restored_wav_sha256") != exact_wav_sha_from_flac(
            target, target.parent, flac_bin=flac_bin, runner=runner
        ):
            raise RuntimeError(f"target FLAC exists without verifiable compaction receipt: {target}")
        row = {**row, **previous}
    return {
        **row,
        "source_sha256": source_sha,
        "restored_wav_sha256": exact_wav_sha_from_flac(target, target.parent, flac_bin=flac_bin, runner=runner),
        "target_sha256": sha256_file(target),
        "target_size": target.stat().st_size,
        "target_allocated_bytes": allocated_bytes(target),
    }


__all__ = [
    "DEFAULT_SKIP_DIRS",
    "F_LOG2PHYS",
    "allocated_bytes",
    "build_storage_report",
    "clone_or_copy",
    "convert_png_to_lossless_webp",
    "convert_wav_to_lossless_flac",
    "cow_dedup_directory",
    "dir_stats",
    "exact_wav_sha_from_flac",
    "iso_timestamp",
    "physical_extent_key",
    "physical_extent_offset",
    "pixel_sha256",
    "read_json",
    "sha256_file",
    "write_json_atomic",
]
