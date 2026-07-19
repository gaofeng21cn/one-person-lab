from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest

from opl_framework.executor_client import (
    project_agent_execution_receipt_metadata,
    require_agent_execution_receipt,
    run_agent_execution_request,
    run_opl_json,
)


def _script(tmp_path: Path, body: str) -> list[str]:
    script = tmp_path / "fake_opl.py"
    script.write_text(body, encoding="utf-8")
    return [sys.executable, str(script)]


def test_run_agent_execution_request_unwraps_receipt_and_removes_request(tmp_path: Path) -> None:
    seen = tmp_path / "seen.json"
    command = _script(
        tmp_path,
        """import json, pathlib, sys
request_path = pathlib.Path(sys.argv[sys.argv.index('--request') + 1])
payload = json.loads(request_path.read_text())
pathlib.Path(sys.argv[1]).write_text(json.dumps({'request': payload, 'path': str(request_path)}))
print(json.dumps({'version': 'g2', 'agent_execution_receipt': {
  'surface_kind': 'opl_agent_execution_receipt', 'executor_kind': 'fixture'
}}))
""",
    )
    command.append(str(seen))

    receipt = run_agent_execution_request(
        {"prompt": "hello", "cwd": "/tmp/project"},
        opl_command=command,
        timeout_seconds=5,
    )

    captured = json.loads(seen.read_text(encoding="utf-8"))
    assert receipt["executor_kind"] == "fixture"
    assert captured["request"]["cwd"] == "/tmp/project"
    assert not Path(captured["path"]).exists()


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ("print('not-json')", "invalid JSON"),
        ("print('[]')", "must be an object"),
        ("import sys; sys.exit(7)", "exit code 7"),
    ],
)
def test_run_opl_json_fails_closed(tmp_path: Path, body: str, message: str) -> None:
    with pytest.raises(RuntimeError, match=message):
        run_opl_json([], opl_command=_script(tmp_path, body), timeout_seconds=5)


def test_run_agent_execution_request_rejects_invalid_receipt(tmp_path: Path) -> None:
    command = _script(tmp_path, "print('{\"agent_execution_receipt\": {\"surface_kind\": \"wrong\"}}')")
    with pytest.raises(RuntimeError, match="invalid agent execution receipt"):
        run_agent_execution_request({}, opl_command=command, timeout_seconds=5)


def test_run_opl_json_kills_timed_out_process_group(tmp_path: Path) -> None:
    command = _script(tmp_path, "import time; time.sleep(30)")
    with pytest.raises(TimeoutError, match="timed out"):
        run_opl_json([], opl_command=command, timeout_seconds=0.05)


def test_receipt_validation_and_metadata_projection_are_framework_owned() -> None:
    receipt = {
        "surface_kind": "opl_agent_execution_receipt",
        "executor_kind": "codex_cli",
        "mode": "structured_call",
        "session_id": "session-1",
        "exit_code": 0,
        "non_equivalence_notice": "codex_cli_first_class_default",
        "proof": {"provider": "openai", "model": "gpt-test"},
    }

    assert require_agent_execution_receipt(
        receipt,
        expected_executor_kind="codex_cli",
    ) == receipt
    projection = project_agent_execution_receipt_metadata(
        receipt,
        expected_executor_kind="codex_cli",
    )
    assert projection["adapter_owner"] == "one-person-lab"
    assert projection["request_contract"] == "AgentExecutionRequest"
    assert projection["receipt_contract"] == "AgentExecutionReceipt"
    assert projection["session_id"] == "session-1"
    assert projection["provider"] == "openai"
    assert projection["model"] == "gpt-test"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("surface_kind", "wrong", "surface_kind"),
        ("executor_kind", "hermes_agent", "executor_kind"),
        ("exit_code", 1, "exit_code"),
        ("non_equivalence_notice", "fallback", "non_equivalence_notice"),
    ],
)
def test_receipt_validation_fails_closed(
    field: str,
    value: object,
    message: str,
) -> None:
    receipt = {
        "surface_kind": "opl_agent_execution_receipt",
        "executor_kind": "codex_cli",
        "mode": "structured_call",
        "exit_code": 0,
        "non_equivalence_notice": "codex_cli_first_class_default",
        field: value,
    }
    with pytest.raises(RuntimeError, match=message):
        require_agent_execution_receipt(
            receipt,
            expected_executor_kind="codex_cli",
        )
