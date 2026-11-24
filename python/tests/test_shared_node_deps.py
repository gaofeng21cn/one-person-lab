from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess

import pytest

from opl_framework.shared_node_deps import (
    SharedNodeDepsConfig,
    build_shared_node_env,
    declared_packages,
    ensure_shared_node_modules,
    lockfile_fingerprint,
)


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def test_lockfile_fingerprint_ignores_root_version_metadata(tmp_path: Path) -> None:
    p1 = tmp_path / "p1"
    p2 = tmp_path / "p2"
    _write_json(
        p1 / "package.json",
        {"name": "kit", "version": "1.0.0", "devDependencies": {"esbuild": "0.25.0"}},
    )
    _write_json(
        p2 / "package.json",
        {"name": "kit", "version": "2.0.0", "devDependencies": {"esbuild": "0.25.0"}},
    )
    _write_json(
        p1 / "package-lock.json",
        {
            "lockfileVersion": 3,
            "packages": {
                "": {"name": "kit", "version": "1.0.0", "devDependencies": {"esbuild": "0.25.0"}},
                "node_modules/esbuild": {"version": "0.25.0"},
            },
        },
    )
    _write_json(
        p2 / "package-lock.json",
        {
            "lockfileVersion": 3,
            "packages": {
                "": {"name": "kit", "version": "2.0.0", "devDependencies": {"esbuild": "0.25.0"}},
                "node_modules/esbuild": {"version": "0.25.0"},
            },
        },
    )
    fp1, _ = lockfile_fingerprint(p1)
    fp2, _ = lockfile_fingerprint(p2)
    assert fp1 == fp2
    assert declared_packages(p1) == ["esbuild"]


def test_ensure_shared_pool_and_build_env_with_mock_npm(tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    project = workspace / "ep1"
    _write_json(project / "package.json", {"name": "ep1", "dependencies": {"demo-pkg": "1.0.0"}})
    _write_json(
        project / "package-lock.json",
        {"lockfileVersion": 3, "packages": {"": {"dependencies": {"demo-pkg": "1.0.0"}}}},
    )

    calls: list[list[str]] = []

    def fake_runner(cmd: list[str], *, cwd: Path, check: bool) -> subprocess.CompletedProcess[str]:
        assert check is True
        calls.append(cmd)
        pkg_dir = cwd / "node_modules" / "demo-pkg"
        pkg_dir.mkdir(parents=True, exist_ok=True)
        (pkg_dir / "index.mjs").write_text("export const ok = true;\n", encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0)

    cfg = SharedNodeDepsConfig(
        schema="custom_shared_node_deps/v1",
        env_shared_node_modules="CUSTOM_SHARED_NODE_MODULES",
        env_cache_dir="CUSTOM_NODE_DEPS_CACHE",
        env_workspace_root="CUSTOM_WORKSPACE_ROOT",
    )
    env, pool1 = build_shared_node_env(project, workspace_root=workspace, config=cfg, runner=fake_runner)
    assert len(calls) == 1
    assert pool1["reused"] is False
    assert (pool1["cache_dir"] / ".ready.json").is_file()
    assert env["OPL_SHARED_NODE_MODULES"] == str(pool1["node_modules"])
    assert env["CUSTOM_SHARED_NODE_MODULES"] == str(pool1["node_modules"])
    assert "shared_node_resolve.mjs" in env["NODE_OPTIONS"]

    pool2 = ensure_shared_node_modules(project, workspace_root=workspace, config=cfg, runner=fake_runner)
    assert len(calls) == 1
    assert pool2["reused"] is True
