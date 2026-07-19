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


OPL_EXECUTOR_ADAPTER_OWNER = "one-person-lab"
OPL_EXECUTOR_ADAPTER_CONTRACT_REF = (
    "contracts/opl-framework/family-executor-adapter-defaults.json"
)
OPL_AGENT_EXECUTION_REQUEST_CONTRACT = "AgentExecutionRequest"
OPL_AGENT_EXECUTION_RECEIPT_CONTRACT = "AgentExecutionReceipt"
DEFAULT_EXECUTOR_SELECTION = "inherit_local_executor_default"


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


def require_agent_execution_receipt(
    payload: Mapping[str, Any],
    *,
    expected_executor_kind: str,
) -> dict[str, Any]:
    """Validate the executor-owned receipt envelope without domain semantics."""

    if not isinstance(payload, Mapping):
        raise RuntimeError("OPL executor receipt must be an object.")
    receipt = dict(payload)
    if receipt.get("surface_kind") != "opl_agent_execution_receipt":
        raise RuntimeError(
            "OPL executor receipt surface_kind must be opl_agent_execution_receipt."
        )
    if receipt.get("executor_kind") != expected_executor_kind:
        raise RuntimeError(
            f"OPL executor receipt executor_kind must be {expected_executor_kind}."
        )
    exit_code = receipt.get("exit_code")
    if not isinstance(exit_code, int) or isinstance(exit_code, bool) or exit_code != 0:
        raise RuntimeError("OPL executor receipt exit_code must be 0.")
    expected_notice = (
        "codex_cli_first_class_default"
        if expected_executor_kind == "codex_cli"
        else "connectivity_lifecycle_receipt_audit_only"
    )
    if receipt.get("non_equivalence_notice") != expected_notice:
        raise RuntimeError(
            f"OPL executor receipt non_equivalence_notice must be {expected_notice}."
        )
    return receipt


def project_agent_execution_receipt_metadata(
    payload: Mapping[str, Any],
    *,
    expected_executor_kind: str,
) -> dict[str, Any]:
    """Project the shared executor metadata carried by a canonical receipt."""

    receipt = require_agent_execution_receipt(
        payload,
        expected_executor_kind=expected_executor_kind,
    )
    proof = receipt.get("proof") if isinstance(receipt.get("proof"), dict) else {}
    contract = (
        receipt.get("executor_contract")
        if isinstance(receipt.get("executor_contract"), dict)
        else {}
    )
    mode = receipt.get("mode")
    notice = receipt.get("non_equivalence_notice")
    if not isinstance(mode, str) or not mode.strip():
        raise RuntimeError("OPL executor receipt mode must be a non-empty string.")
    if not isinstance(notice, str) or not notice.strip():
        raise RuntimeError(
            "OPL executor receipt non_equivalence_notice must be a non-empty string."
        )
    projected: dict[str, Any] = {
        "kind": expected_executor_kind,
        "mode": mode.strip(),
        "adapter_owner": OPL_EXECUTOR_ADAPTER_OWNER,
        "adapter_contract_ref": OPL_EXECUTOR_ADAPTER_CONTRACT_REF,
        "request_contract": OPL_AGENT_EXECUTION_REQUEST_CONTRACT,
        "receipt_contract": OPL_AGENT_EXECUTION_RECEIPT_CONTRACT,
        "fallback_allowed": False,
        "non_equivalence_notice": notice.strip(),
        "session_id": receipt.get("session_id") or proof.get("session_id"),
        "model": proof.get("model")
        or contract.get("model")
        or DEFAULT_EXECUTOR_SELECTION,
        "provider": proof.get("provider") or contract.get("provider"),
        "reasoning_effort": proof.get("reasoning_effort")
        or contract.get("reasoning_effort")
        or DEFAULT_EXECUTOR_SELECTION,
        "agent_execution_receipt": receipt,
    }
    if expected_executor_kind == "hermes_agent":
        entrypoint = contract.get("entrypoint")
        provider_status = proof.get("provider_reasoning_status")
        if not isinstance(entrypoint, str) or not entrypoint.strip():
            raise RuntimeError(
                "Hermes executor contract entrypoint must be a non-empty string."
            )
        if not isinstance(provider_status, str) or not provider_status.strip():
            raise RuntimeError(
                "Hermes proof provider_reasoning_status must be a non-empty string."
            )
        for field in ("api_calls", "tool_call_count", "event_count"):
            value = proof.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise RuntimeError(f"Hermes proof {field} must be a non-negative integer.")
        event_stream = proof.get("event_stream")
        if not isinstance(event_stream, list) or any(
            not isinstance(item, dict) for item in event_stream
        ):
            raise RuntimeError("Hermes proof event_stream must be an object list.")
        projected.update(
            {
                "entrypoint": entrypoint.strip(),
                "api_mode": contract.get("api_mode"),
                "full_agent_loop_proved": proof.get("full_agent_loop_proved") is True,
                "api_calls": proof["api_calls"],
                "tool_call_count": proof["tool_call_count"],
                "event_count": proof["event_count"],
                "reasoning_semantics_status": provider_status.strip(),
                "event_stream": event_stream,
            }
        )
        if (
            not projected["full_agent_loop_proved"]
            or projected["tool_call_count"] <= 0
        ):
            raise RuntimeError(
                "Hermes proof must prove a full agent loop and at least one tool call."
            )
    return projected
