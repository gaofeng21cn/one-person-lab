"""Descriptor-relative, fail-closed reads for one frozen OPL work-item root."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import time
from typing import Any


READ_CHUNK_BYTES = 64 * 1024
ROOT_IDENTITY_VERSION = "opl-work-item-root-identity.v1"


class BoundaryError(RuntimeError):
    def __init__(self, failure_code: str, message: str, **details: object) -> None:
        super().__init__(message)
        self.failure_code = failure_code
        self.details = details


def _fail(failure_code: str, message: str, **details: object) -> None:
    raise BoundaryError(failure_code, message, **details)


def _required_text(value: object, field: str, failure_code: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(failure_code, f"Work-item file boundary requires {field}.", field=field)
    return value.strip()


def _normalized_absolute(value: object, field: str, failure_code: str) -> str:
    text = _required_text(value, field, failure_code)
    if not os.path.isabs(text):
        _fail(failure_code, f"Work-item file boundary {field} must be absolute.", field=field, value=text)
    normalized = os.path.normpath(text)
    if normalized != text:
        _fail(
            failure_code,
            f"Work-item file boundary {field} must be normalized.",
            field=field,
            value=text,
            normalized_value=normalized,
        )
    return normalized


def _relative_components(anchor: str, target: str, *, failure_code: str, role: str) -> list[str]:
    try:
        relative = os.path.relpath(target, anchor)
        common = os.path.commonpath((anchor, target))
    except ValueError:
        _fail(failure_code, f"{role} is outside its trusted anchor.", trusted_anchor=anchor, target=target)
    if common != anchor or relative in ("", "."):
        _fail(failure_code, f"{role} must be a strict descendant of its trusted anchor.", trusted_anchor=anchor, target=target)
    components = relative.split(os.sep)
    if any(component in ("", ".", "..") for component in components):
        _fail(failure_code, f"{role} contains an unsafe path component.", target=target)
    return components


def _ensure_descriptor_support() -> None:
    required_constants = ("O_DIRECTORY", "O_NOFOLLOW", "O_CLOEXEC", "O_NONBLOCK")
    missing = [name for name in required_constants if not hasattr(os, name)]
    if os.open not in os.supports_dir_fd or missing:
        _fail(
            "work_item_file_boundary_helper_unavailable",
            "The host Python runtime does not support descriptor-relative no-follow reads.",
            missing_constants=missing,
            open_supports_dir_fd=os.open in os.supports_dir_fd,
            platform=sys.platform,
        )


def _directory_flags() -> int:
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _file_flags() -> int:
    return os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK


def _absolute_physical_components(path_value: str) -> list[str]:
    drive, tail = os.path.splitdrive(path_value)
    if drive:
        _fail(
            "work_item_file_boundary_helper_unavailable",
            "Descriptor-relative work-item reads require a POSIX filesystem path.",
            path=path_value,
        )
    return [component for component in tail.split(os.sep) if component]


def _open_absolute_directory(path_value: str, *, failure_code: str, role: str) -> tuple[int, str]:
    physical_path = os.path.realpath(path_value)
    descriptor = os.open(os.sep, _directory_flags())
    try:
        for component in _absolute_physical_components(physical_path):
            next_descriptor = os.open(component, _directory_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        observed = os.fstat(descriptor)
        if not stat.S_ISDIR(observed.st_mode):
            _fail(failure_code, f"{role} is not a physical directory.", path=path_value)
        return descriptor, physical_path
    except Exception:
        os.close(descriptor)
        raise


def _open_relative_directory(
    anchor_descriptor: int,
    components: list[str],
    *,
    failure_code: str,
    role: str,
) -> int:
    descriptor = os.dup(anchor_descriptor)
    try:
        for component in components:
            next_descriptor = os.open(component, _directory_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        observed = os.fstat(descriptor)
        if not stat.S_ISDIR(observed.st_mode):
            _fail(failure_code, f"{role} is not a physical directory.")
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def _same_identity(left: os.stat_result, right: os.stat_result) -> bool:
    return left.st_dev == right.st_dev and left.st_ino == right.st_ino


def _stable_file_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_nlink,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _root_identity(workspace_stat: os.stat_result, work_item_stat: os.stat_result) -> dict[str, str]:
    return {
        "surface_kind": "opl_work_item_root_identity",
        "version": ROOT_IDENTITY_VERSION,
        "workspace_device": str(workspace_stat.st_dev),
        "workspace_inode": str(workspace_stat.st_ino),
        "work_item_device": str(work_item_stat.st_dev),
        "work_item_inode": str(work_item_stat.st_ino),
    }


def _expected_root_identity(value: object) -> dict[str, str]:
    expected_fields = {
        "surface_kind",
        "version",
        "workspace_device",
        "workspace_inode",
        "work_item_device",
        "work_item_inode",
    }
    if not isinstance(value, dict) or set(value) != expected_fields:
        _fail(
            "work_item_file_boundary_root_invalid",
            "Expected root identity must use its exact canonical shape.",
        )
    if value.get("surface_kind") != "opl_work_item_root_identity" or value.get("version") != ROOT_IDENTITY_VERSION:
        _fail(
            "work_item_file_boundary_root_invalid",
            "Expected root identity has an unsupported envelope.",
        )
    result: dict[str, str] = {}
    for field in sorted(expected_fields):
        field_value = value[field]
        if not isinstance(field_value, str):
            _fail("work_item_file_boundary_root_invalid", "Expected root identity fields must be strings.", field=field)
        result[field] = field_value
    return result


def _open_roots(request: dict[str, object]) -> tuple[int, int, str, str, list[str]]:
    workspace_path = _normalized_absolute(
        request.get("workspace_root"),
        "workspace_root",
        "work_item_file_boundary_root_invalid",
    )
    work_item_path = _normalized_absolute(
        request.get("canonical_work_item_root"),
        "canonical_work_item_root",
        "work_item_file_boundary_root_invalid",
    )
    root_components = _relative_components(
        workspace_path,
        work_item_path,
        failure_code="work_item_file_boundary_root_invalid",
        role="Canonical work-item root",
    )
    workspace_descriptor = -1
    root_descriptor = -1
    try:
        workspace_descriptor, workspace_physical = _open_absolute_directory(
            workspace_path,
            failure_code="work_item_file_boundary_root_drift",
            role="Workspace root",
        )
        expected_root_physical = os.path.normpath(os.path.join(workspace_physical, *root_components))
        observed_root_physical = os.path.realpath(work_item_path)
        if expected_root_physical != observed_root_physical:
            _fail(
                "work_item_file_boundary_root_drift",
                "Canonical work-item root no longer has its workspace-relative physical mapping.",
                workspace_root=workspace_path,
                canonical_work_item_root=work_item_path,
                expected_physical_root=expected_root_physical,
                observed_physical_root=observed_root_physical,
            )
        root_descriptor = _open_relative_directory(
            workspace_descriptor,
            root_components,
            failure_code="work_item_file_boundary_root_drift",
            role="Canonical work-item root",
        )
        return workspace_descriptor, root_descriptor, workspace_physical, expected_root_physical, root_components
    except OSError as error:
        if root_descriptor >= 0:
            os.close(root_descriptor)
        if workspace_descriptor >= 0:
            os.close(workspace_descriptor)
        _fail(
            "work_item_file_boundary_root_drift",
            "Canonical work-item root is missing, unreadable, or no longer physical.",
            workspace_root=workspace_path,
            canonical_work_item_root=work_item_path,
            errno=error.errno,
            os_error=str(error),
        )
    except Exception:
        if root_descriptor >= 0:
            os.close(root_descriptor)
        if workspace_descriptor >= 0:
            os.close(workspace_descriptor)
        raise


def _assert_root_attestation(
    workspace_stat: os.stat_result,
    root_stat: os.stat_result,
    expected: dict[str, str],
) -> None:
    actual = _root_identity(workspace_stat, root_stat)
    if actual != expected:
        _fail(
            "work_item_file_boundary_root_attestation_mismatch",
            "Canonical work-item root no longer matches its frozen physical attestation.",
            expected_root_identity=expected,
            actual_root_identity=actual,
        )


def _fresh_root_descriptors(
    workspace_path: str,
    work_item_path: str,
    root_components: list[str],
) -> tuple[int, int]:
    try:
        workspace_descriptor, workspace_physical = _open_absolute_directory(
            workspace_path,
            failure_code="work_item_file_boundary_root_drift",
            role="Workspace root",
        )
    except OSError as error:
        _fail(
            "work_item_file_boundary_root_drift",
            "Workspace root mapping changed during descriptor-relative access.",
            workspace_root=workspace_path,
            errno=error.errno,
            os_error=str(error),
        )
    root_descriptor = -1
    try:
        observed_root_physical = os.path.realpath(work_item_path)
        expected_root_physical = os.path.normpath(os.path.join(workspace_physical, *root_components))
        if observed_root_physical != expected_root_physical:
            _fail(
                "work_item_file_boundary_root_drift",
                "Canonical work-item root mapping changed while bytes were read.",
                expected_physical_root=expected_root_physical,
                observed_physical_root=observed_root_physical,
            )
        root_descriptor = _open_relative_directory(
            workspace_descriptor,
            root_components,
            failure_code="work_item_file_boundary_root_drift",
            role="Canonical work-item root",
        )
        return workspace_descriptor, root_descriptor
    except OSError as error:
        if root_descriptor >= 0:
            os.close(root_descriptor)
        os.close(workspace_descriptor)
        _fail(
            "work_item_file_boundary_root_drift",
            "Canonical work-item root mapping changed during descriptor-relative access.",
            canonical_work_item_root=work_item_path,
            errno=error.errno,
            os_error=str(error),
        )
    except Exception:
        if root_descriptor >= 0:
            os.close(root_descriptor)
        os.close(workspace_descriptor)
        raise


def _assert_root_mapping_stable(
    request: dict[str, object],
    workspace_descriptor: int,
    root_descriptor: int,
    root_components: list[str],
) -> None:
    workspace_path = str(request["workspace_root"])
    root_path = str(request["canonical_work_item_root"])
    fresh_workspace, fresh_root = _fresh_root_descriptors(workspace_path, root_path, root_components)
    try:
        if (
            not _same_identity(os.fstat(workspace_descriptor), os.fstat(fresh_workspace))
            or not _same_identity(os.fstat(root_descriptor), os.fstat(fresh_root))
        ):
            _fail(
                "work_item_file_boundary_root_drift",
                "Work-item root changed physical identity during descriptor-relative access.",
                workspace_root=workspace_path,
                canonical_work_item_root=root_path,
            )
    finally:
        os.close(fresh_root)
        os.close(fresh_workspace)


def _test_interlock(point: str) -> None:
    raw = os.environ.get("OPL_WORK_ITEM_FILE_BOUNDARY_TEST_INTERLOCK", "")
    if not raw:
        return
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        _fail("work_item_file_boundary_helper_unavailable", "Test interlock is invalid JSON.", error=str(error))
    if not isinstance(value, dict) or value.get("point") != point:
        return
    ready_path = _normalized_absolute(
        value.get("ready_path"),
        "test_interlock.ready_path",
        "work_item_file_boundary_helper_unavailable",
    )
    continue_path = _normalized_absolute(
        value.get("continue_path"),
        "test_interlock.continue_path",
        "work_item_file_boundary_helper_unavailable",
    )
    timeout_ms = value.get("timeout_ms", 5_000)
    if not isinstance(timeout_ms, int) or timeout_ms < 1 or timeout_ms > 30_000:
        _fail("work_item_file_boundary_helper_unavailable", "Test interlock timeout is invalid.")
    descriptor = os.open(ready_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
    os.close(descriptor)
    deadline = time.monotonic() + timeout_ms / 1_000
    while not os.path.exists(continue_path):
        if time.monotonic() >= deadline:
            _fail("work_item_file_boundary_helper_unavailable", "Test interlock timed out.", point=point)
        time.sleep(0.005)


def _capture_root_identity(request: dict[str, object]) -> dict[str, object]:
    workspace_descriptor, root_descriptor, _, _, root_components = _open_roots(request)
    try:
        identity = _root_identity(os.fstat(workspace_descriptor), os.fstat(root_descriptor))
        _assert_root_mapping_stable(request, workspace_descriptor, root_descriptor, root_components)
        return {"root_identity": identity}
    finally:
        os.close(root_descriptor)
        os.close(workspace_descriptor)


def _open_file_from_root(root_descriptor: int, components: list[str]) -> int:
    parent_descriptor = _open_relative_directory(
        root_descriptor,
        components[:-1],
        failure_code="work_item_file_boundary_escape",
        role="Work-item file parent",
    )
    try:
        return os.open(components[-1], _file_flags(), dir_fd=parent_descriptor)
    finally:
        os.close(parent_descriptor)


def _require_regular_single_link(value: os.stat_result, *, file_path: str) -> None:
    if not stat.S_ISREG(value.st_mode):
        _fail(
            "work_item_file_boundary_ref_invalid",
            "Work-item file boundary requires a physical regular file.",
            file_path=file_path,
        )
    if value.st_nlink != 1:
        _fail(
            "work_item_file_boundary_ref_hard_link",
            "Work-item file boundary rejects files with multiple physical links.",
            file_path=file_path,
            link_count=value.st_nlink,
        )


def _read_file(request: dict[str, object]) -> dict[str, object]:
    workspace_path = _normalized_absolute(
        request.get("workspace_root"),
        "workspace_root",
        "work_item_file_boundary_root_invalid",
    )
    root_path = _normalized_absolute(
        request.get("canonical_work_item_root"),
        "canonical_work_item_root",
        "work_item_file_boundary_root_invalid",
    )
    file_path = _normalized_absolute(
        request.get("file_path"),
        "file_path",
        "work_item_file_boundary_ref_invalid",
    )
    file_components = _relative_components(
        root_path,
        file_path,
        failure_code="work_item_file_boundary_escape",
        role="Work-item file",
    )
    max_bytes = request.get("max_bytes")
    if max_bytes is not None and (not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 0):
        _fail("work_item_file_boundary_size_limit", "Work-item file size limit is invalid.", max_bytes=max_bytes)
    expected = _expected_root_identity(request.get("expected_root_identity"))
    workspace_descriptor, root_descriptor, _, root_physical, root_components = _open_roots(request)
    file_descriptor = -1
    try:
        workspace_stat = os.fstat(workspace_descriptor)
        root_stat = os.fstat(root_descriptor)
        _assert_root_attestation(workspace_stat, root_stat, expected)
        _test_interlock("after_root_open")
        _assert_root_mapping_stable(request, workspace_descriptor, root_descriptor, root_components)
        expected_file_physical = os.path.normpath(os.path.join(root_physical, *file_components))
        observed_file_physical = os.path.realpath(file_path)
        if observed_file_physical != expected_file_physical:
            _fail(
                "work_item_file_boundary_escape",
                "Work-item file no longer has its root-relative physical mapping.",
                file_path=file_path,
                expected_physical_path=expected_file_physical,
                observed_physical_path=observed_file_physical,
            )
        file_descriptor = _open_file_from_root(root_descriptor, file_components)
        before = os.fstat(file_descriptor)
        _require_regular_single_link(before, file_path=file_path)
        _test_interlock("after_file_open")
        if max_bytes is not None and before.st_size > max_bytes:
            _fail(
                "work_item_file_boundary_size_limit",
                "Work-item file exceeds the configured verification limit.",
                file_path=file_path,
                size_bytes=before.st_size,
                max_bytes=max_bytes,
            )
        digest = hashlib.sha256()
        byte_size = 0
        remaining = before.st_size
        while remaining > 0:
            chunk = os.read(file_descriptor, min(READ_CHUNK_BYTES, remaining))
            if not chunk:
                break
            byte_size += len(chunk)
            remaining -= len(chunk)
            if max_bytes is not None and byte_size > max_bytes:
                _fail(
                    "work_item_file_boundary_size_limit",
                    "Work-item file exceeds the configured verification limit.",
                    file_path=file_path,
                    observed_size_bytes=byte_size,
                    max_bytes=max_bytes,
                )
            digest.update(chunk)
        if os.read(file_descriptor, 1):
            _fail(
                "work_item_file_boundary_ref_drift",
                "Work-item file grew while bytes were read.",
                file_path=file_path,
            )
        after = os.fstat(file_descriptor)
        _require_regular_single_link(after, file_path=file_path)
        if byte_size != before.st_size or _stable_file_identity(before) != _stable_file_identity(after):
            _fail(
                "work_item_file_boundary_ref_drift",
                "Work-item file changed physical identity while bytes were read.",
                file_path=file_path,
            )
        fresh_workspace, fresh_root = _fresh_root_descriptors(workspace_path, root_path, root_components)
        fresh_file = -1
        try:
            if (
                not _same_identity(workspace_stat, os.fstat(fresh_workspace))
                or not _same_identity(root_stat, os.fstat(fresh_root))
            ):
                _fail(
                    "work_item_file_boundary_root_drift",
                    "Work-item root changed physical identity while bytes were read.",
                    workspace_root=workspace_path,
                    canonical_work_item_root=root_path,
                )
            fresh_file = _open_file_from_root(fresh_root, file_components)
            fresh_file_stat = os.fstat(fresh_file)
            _require_regular_single_link(fresh_file_stat, file_path=file_path)
            if _stable_file_identity(after) != _stable_file_identity(fresh_file_stat):
                _fail(
                    "work_item_file_boundary_ref_drift",
                    "Work-item file path changed physical identity while bytes were read.",
                    file_path=file_path,
                )
        finally:
            if fresh_file >= 0:
                os.close(fresh_file)
            os.close(fresh_root)
            os.close(fresh_workspace)
        return {
            "real_path": expected_file_physical,
            "sha256": f"sha256:{digest.hexdigest()}",
            "byte_size": byte_size,
        }
    finally:
        if file_descriptor >= 0:
            os.close(file_descriptor)
        os.close(root_descriptor)
        os.close(workspace_descriptor)


def _request() -> dict[str, object]:
    try:
        value: Any = json.load(sys.stdin)
    except (OSError, json.JSONDecodeError) as error:
        _fail("work_item_file_boundary_helper_unavailable", "Helper request is invalid JSON.", error=str(error))
    if not isinstance(value, dict):
        _fail("work_item_file_boundary_helper_unavailable", "Helper request must be a JSON object.")
    return value


def main() -> int:
    try:
        _ensure_descriptor_support()
        request = _request()
        operation = request.get("operation")
        if operation == "capture_root_identity":
            result = _capture_root_identity(request)
        elif operation == "read_file":
            result = _read_file(request)
        else:
            _fail(
                "work_item_file_boundary_helper_unavailable",
                "Helper operation is unsupported.",
                operation=operation,
            )
        print(json.dumps({"ok": True, "result": result}, sort_keys=True, separators=(",", ":")))
        return 0
    except BoundaryError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": {
                        "failure_code": error.failure_code,
                        "message": str(error),
                        "details": error.details,
                    },
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return 2
    except OSError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": {
                        "failure_code": "work_item_file_boundary_ref_unreadable",
                        "message": "Descriptor-relative work-item access failed.",
                        "details": {
                            "errno": error.errno,
                            "os_error": str(error),
                            "filename": error.filename,
                        },
                    },
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
