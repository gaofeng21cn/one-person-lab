"""Fail-closed Python carrier for the OPL agent executor CLI."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
import tempfile
from collections.abc import Mapping, Sequence
from typing import Any


def _resolve_opl_command(opl_command: str | Sequence[str] | None) -> list[str]:
    value: str | Sequence[str] | None = opl_command
    if value is None:
        value = os.environ.get("OPL_COMMAND") or os.environ.get("OPL_BIN")
    if isinstance(value, str):
        command = shlex.split(value)
    elif value is not None:
        command = list(value)
    else:
        resolved = shutil.which("opl")
        if resolved:
            command = [resolved]
        else:
            repo_bin = Path(__file__).resolve().parents[2] / "bin" / "opl"
            command = [str(repo_bin)] if repo_bin.is_file() else []
    if not command or any(not isinstance(part, str) or not part for part in command):
        raise RuntimeError("OPL command could not be resolved to a non-empty string sequence.")
    return command


def run_opl_json(
    args: Sequence[str],
    *,
    opl_command: str | Sequence[str] | None = None,
    timeout_seconds: float,
    env: Mapping[str, str] | None = None,
) -> dict[str, Any] | None:
    """Run one OPL JSON command and reject timeout, exit, or JSON ambiguity."""

    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than zero.")
    command = [*_resolve_opl_command(opl_command), *args]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, **dict(env or {})},
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as error:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        finally:
            stdout, stderr = process.communicate()
        raise TimeoutError(
            f"OPL command timed out after {timeout_seconds} seconds: {' '.join(command)}"
        ) from error
    if process.returncode != 0:
        raise RuntimeError(
            f"OPL command failed with exit code {process.returncode}: {stderr.strip() or stdout.strip()}"
        )
    if not stdout.strip():
        return None
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("OPL command returned invalid JSON.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("OPL command JSON response must be an object.")
    return payload


def run_agent_execution_request(
    request: Mapping[str, Any],
    *,
    opl_command: str | Sequence[str] | None = None,
    timeout_seconds: float,
    env: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Execute an agent request and return the canonical receipt body."""

    if not isinstance(request, Mapping):
        raise TypeError("request must be a mapping.")
    request_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".json",
            prefix="opl-agent-execution-",
            delete=False,
        ) as handle:
            json.dump(dict(request), handle, ensure_ascii=False)
            handle.write("\n")
            request_path = handle.name
        response = run_opl_json(
            ["executor", "run", "--request", request_path, "--json"],
            opl_command=opl_command,
            timeout_seconds=timeout_seconds,
            env=env,
        )
    finally:
        if request_path:
            Path(request_path).unlink(missing_ok=True)
    if not isinstance(response, dict):
        raise RuntimeError("OPL executor response must be a JSON object.")
    receipt = response.get("agent_execution_receipt")
    if not isinstance(receipt, dict):
        raise RuntimeError("OPL executor response is missing agent_execution_receipt.")
    if receipt.get("surface_kind") != "opl_agent_execution_receipt":
        raise RuntimeError("OPL executor response contains an invalid agent execution receipt.")
    return receipt
