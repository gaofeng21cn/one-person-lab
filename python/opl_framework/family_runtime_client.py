"""Python client for canonical OPL family-runtime transport surfaces."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
from collections.abc import Callable, Mapping, Sequence
from typing import Any, TypedDict


class StageAttemptRequest(TypedDict, total=False):
    domain_id: str
    stage_id: str
    workspace_locator: dict[str, Any]
    action_id: str
    source_fingerprint: str
    start: bool


class FamilyRuntimeQuery(TypedDict, total=False):
    operation: str
    domain_id: str
    stage_attempt_id: str
    status: str
    study_id: str


Runner = Callable[..., Mapping[str, Any] | None]


def _non_empty_string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string.")
    return value


def _resolve_opl_bin(opl_bin: str | Sequence[str] | None) -> list[str]:
    value: str | Sequence[str] | None = opl_bin
    if value is None:
        value = os.environ.get("OPL_BIN") or os.environ.get("OPL_COMMAND")
    if isinstance(value, str):
        command = shlex.split(value)
    elif value is not None:
        command = list(value)
    else:
        resolved = shutil.which("opl")
        repo_bin = Path(__file__).resolve().parents[2] / "bin" / "opl"
        command = [resolved] if resolved else ([str(repo_bin)] if repo_bin.is_file() else [])
    if not command or any(not isinstance(part, str) or not part for part in command):
        raise RuntimeError("OPL binary could not be resolved to a non-empty command.")
    return command


def _run_subprocess(command: list[str], timeout_seconds: float) -> dict[str, Any] | None:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as error:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        finally:
            process.communicate()
        raise TimeoutError(
            f"OPL family-runtime command timed out after {timeout_seconds} seconds: {' '.join(command)}"
        ) from error
    if process.returncode != 0:
        raise RuntimeError(
            f"OPL family-runtime command failed with exit code {process.returncode}: "
            f"{stderr.strip() or stdout.strip()}"
        )
    if not stdout.strip():
        return None
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("OPL family-runtime command returned invalid JSON.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("OPL family-runtime command JSON response must be an object.")
    return payload


def _invoke(
    args: list[str],
    *,
    opl_bin: str | Sequence[str] | None,
    timeout_seconds: float,
    runner: Runner | None,
) -> dict[str, Any] | None:
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than zero.")
    command = [*_resolve_opl_bin(opl_bin), *args, "--json"]
    result = runner(command, timeout_seconds=timeout_seconds) if runner else _run_subprocess(command, timeout_seconds)
    if result is None:
        return None
    if not isinstance(result, Mapping):
        raise RuntimeError("OPL family-runtime runner response must be a mapping or None.")
    return dict(result)


def _surface(payload: dict[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    if not isinstance(value, dict):
        raise RuntimeError(f"OPL family-runtime response is missing canonical {key} surface.")
    return value


def submit_stage_attempt_request(
    request: StageAttemptRequest,
    opl_bin: str | Sequence[str] | None = None,
    timeout_seconds: float = 120,
    runner: Runner | None = None,
) -> dict[str, Any]:
    """Submit and start one Temporal-backed stage attempt, returning its canonical surface."""

    if not isinstance(request, Mapping):
        raise TypeError("request must be a mapping.")
    domain_id = _non_empty_string(request.get("domain_id"), "request.domain_id")
    stage_id = _non_empty_string(request.get("stage_id"), "request.stage_id")
    workspace_locator = request.get("workspace_locator")
    if not isinstance(workspace_locator, Mapping) or not workspace_locator:
        raise ValueError("request.workspace_locator must be a non-empty mapping.")
    if request.get("start") is not True:
        raise ValueError("request.start must be true.")
    allowed = {
        "domain_id", "stage_id", "workspace_locator", "action_id", "source_fingerprint",
        "start",
    }
    unsupported = sorted(set(request) - allowed)
    if unsupported:
        raise ValueError(f"request contains unsupported fields: {', '.join(unsupported)}")
    args = [
        "family-runtime", "attempt", "create",
        "--domain", domain_id,
        "--stage", stage_id,
        "--provider", "temporal",
        "--workspace-locator", json.dumps(dict(workspace_locator), ensure_ascii=False, separators=(",", ":")),
    ]
    if request.get("action_id") is not None:
        args.extend(["--action", _non_empty_string(request["action_id"], "request.action_id")])
    if request.get("source_fingerprint") is not None:
        args.extend([
            "--source-fingerprint",
            _non_empty_string(request["source_fingerprint"], "request.source_fingerprint"),
        ])
    args.append("--start")
    payload = _invoke(args, opl_bin=opl_bin, timeout_seconds=timeout_seconds, runner=runner)
    if payload is None:
        raise RuntimeError("OPL family-runtime submit returned no JSON receipt.")
    surface = _surface(payload, "family_runtime_stage_attempt")
    attempt = surface.get("attempt")
    if not isinstance(attempt, dict):
        raise RuntimeError("Canonical family_runtime_stage_attempt surface is missing attempt.")
    for field in ("stage_attempt_id", "domain_id", "stage_id"):
        _non_empty_string(attempt.get(field), f"family_runtime_stage_attempt.attempt.{field}")
    return surface


def query_family_runtime_readback(
    query: FamilyRuntimeQuery,
    opl_bin: str | Sequence[str] | None = None,
    timeout_seconds: float = 8,
    runner: Runner | None = None,
) -> dict[str, Any] | None:
    """Query one attempt or list attempts and return the canonical readback surface."""

    if not isinstance(query, Mapping):
        raise TypeError("query must be a mapping.")
    operation = _non_empty_string(query.get("operation"), "query.operation")
    allowed = {"operation", "domain_id", "stage_attempt_id", "status", "study_id"}
    unsupported = sorted(set(query) - allowed)
    if unsupported:
        raise ValueError(f"query contains unsupported fields: {', '.join(unsupported)}")
    if operation == "query":
        stage_attempt_id = _non_empty_string(query.get("stage_attempt_id"), "query.stage_attempt_id")
        if any(query.get(field) is not None for field in ("domain_id", "status", "study_id")):
            raise ValueError("query operation does not accept domain_id, status, or study_id.")
        args = ["family-runtime", "attempt", "query", stage_attempt_id]
        response_key = "family_runtime_stage_attempt_query"
    elif operation == "list":
        if query.get("stage_attempt_id") is not None:
            raise ValueError("list operation does not accept stage_attempt_id.")
        args = ["family-runtime", "attempt", "list"]
        for field, option in (("domain_id", "--domain"), ("status", "--status"), ("study_id", "--study")):
            if query.get(field) is not None:
                args.extend([option, _non_empty_string(query[field], f"query.{field}")])
        response_key = "family_runtime_stage_attempts"
    else:
        raise ValueError("query.operation must be 'list' or 'query'.")
    payload = _invoke(args, opl_bin=opl_bin, timeout_seconds=timeout_seconds, runner=runner)
    if payload is None:
        return None
    surface = _surface(payload, response_key)
    if operation == "query":
        readback = surface.get("stage_attempt_query")
        if not isinstance(readback, dict) or not isinstance(readback.get("attempt"), dict):
            raise RuntimeError("Canonical family_runtime_stage_attempt_query surface is malformed.")
    else:
        if not isinstance(surface.get("attempts"), list):
            raise RuntimeError("Canonical family_runtime_stage_attempts surface is missing attempts list.")
    return surface
