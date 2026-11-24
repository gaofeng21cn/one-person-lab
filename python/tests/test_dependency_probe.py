from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess

from opl_framework.dependency_probe import (
    find_executable,
    probe_cli_command,
    probe_native_helper_descriptor,
    probe_node_playwright,
    probe_python_module,
    probe_workspace_venv_python,
    summarize_dependency_probes,
)


def test_find_executable_and_cli_probe(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    tool = bin_dir / "fake-tool"
    tool.write_text("#!/bin/sh\necho '1.2.3'\n", encoding="utf-8")
    tool.chmod(0o755)

    assert find_executable("fake-tool", extra_paths=(str(bin_dir),), which=lambda _: None) == str(tool)
    assert find_executable("../bad", extra_paths=(str(bin_dir),), which=lambda _: None) is None

    ok = probe_cli_command("fake-tool", extra_paths=(str(bin_dir),), which=lambda _: None)
    assert ok["ok"] is True
    assert ok["state"] == "ready"
    assert ok["version"] == "1.2.3"

    missing = probe_cli_command("absent-tool", extra_paths=(), which=lambda _: None)
    assert missing["ok"] is False
    assert missing["state"] == "missing"

    summary = summarize_dependency_probes([ok, missing])
    assert summary["status"] == "degraded"
    assert summary["total"] == 2
    assert summary["ok"] == 1
    assert summary["missing"] == 1
    assert summary["required_missing"] == 1


def test_python_module_venv_and_playwright_probes(tmp_path: Path) -> None:
    mod_ok = probe_python_module("json")
    mod_miss = probe_python_module("definitely_missing_pkg_xyz", required=False)
    assert mod_ok["ok"] is True
    assert mod_miss["ok"] is False

    venv_missing = probe_workspace_venv_python(tmp_path, required_modules=("json",))
    assert venv_missing["state"] == "missing"

    venv_py = tmp_path / ".venv" / "bin" / "python"
    venv_py.parent.mkdir(parents=True)
    venv_py.write_text("#!/bin/sh\necho '{\"json\": true}'\n", encoding="utf-8")
    venv_py.chmod(0o755)
    venv_ok = probe_workspace_venv_python(
        tmp_path,
        required_modules=("json",),
        runner=lambda cmd, **_kw: subprocess.CompletedProcess(cmd, 0, '{"json": true}', ""),
    )
    assert venv_ok["ok"] is True
    assert venv_ok["modules"] == {"json": True}

    no_node = probe_node_playwright(which=lambda _: None, repo_root=tmp_path)
    assert no_node["state"] == "blocked"
    assert no_node["ok"] is False

    pw_ok = probe_node_playwright(
        which=lambda _: "/usr/bin/node",
        repo_root=tmp_path,
        runner=lambda cmd, **_kw: subprocess.CompletedProcess(
            cmd,
            0,
            json.dumps({"state": "ready", "executable": "/bin/chromium", "launch_verified": True}),
            "",
        ),
    )
    assert pw_ok["ok"] is True
    assert pw_ok["executable_path"] == "/bin/chromium"
    assert pw_ok["canvas_ok"] is True


def test_probe_native_helper_descriptor(tmp_path: Path) -> None:
    source = tmp_path / "helper.py"
    source.write_text("print('hi')\n", encoding="utf-8")
    descriptor = tmp_path / "helper.native-helper-probe.json"
    descriptor.write_text(
        json.dumps(
            {
                "surface_kind": "opl_pack_native_helper_probe_descriptor",
                "schema_version": 1,
                "helper_id": "demo_helper",
                "entrypoint_ref": "helper.py",
                "authority_boundary": {
                    "can_write_domain_truth": False,
                    "can_claim_domain_ready": False,
                },
            }
        ),
        encoding="utf-8",
    )
    checked = probe_native_helper_descriptor(descriptor, source, "demo_helper")
    assert checked["exists"] is True
    assert checked["matches_source"] is True

    bad = probe_native_helper_descriptor(descriptor, source, "other_helper")
    assert bad["matches_source"] is False
