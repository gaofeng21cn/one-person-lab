from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest

from opl_framework.executor_client import run_agent_execution_request, run_opl_json


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
