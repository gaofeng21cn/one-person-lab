from __future__ import annotations

import json
from pathlib import Path
import subprocess

import pytest

from opl_framework import KnowledgeClient, KnowledgeCommandError


def test_knowledge_client_binds_scope_and_returns_g2_envelope(tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def fake_run(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(
            command,
            0,
            json.dumps({"version": "g2", "items": []}),
            "",
        )

    client = KnowledgeClient(
        tmp_path,
        domain_id="example-domain",
        project=tmp_path / "proj",
        opl_bin="/usr/bin/opl",
        runner=fake_run,
    )
    response = client.run("sources", ["--limit", "5"])
    assert response["version"] == "g2"
    assert calls == [
        [
            "/usr/bin/opl",
            "knowledge",
            "sources",
            "--workspace",
            str(tmp_path.resolve()),
            "--domain",
            "example-domain",
            "--project",
            str((tmp_path / "proj").resolve()),
            "--limit",
            "5",
            "--json",
        ]
    ]


def test_knowledge_client_rejects_scope_override_and_redacts_errors(tmp_path: Path) -> None:
    def failing_run(command, **kwargs):
        return subprocess.CompletedProcess(
            command,
            2,
            json.dumps({"version": "g2", "error": {"message": "secret-backend-detail"}}),
            "secret-stderr",
        )

    client = KnowledgeClient(
        tmp_path,
        domain_id="example-domain",
        opl_bin="/usr/bin/opl",
        runner=failing_run,
    )
    with pytest.raises(ValueError, match="unsupported knowledge operation"):
        client.run("delete-all")
    with pytest.raises(ValueError, match="override bound scope"):
        client.run("sources", ["--domain=other"])
    with pytest.raises(KnowledgeCommandError) as exc_info:
        client.run("sources")
    assert "secret-backend-detail" not in str(exc_info.value)
    assert "secret-stderr" not in str(exc_info.value)
