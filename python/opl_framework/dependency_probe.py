"""Read-only declarative CLI, Python, Playwright, and native-helper dependency probes."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
from typing import Any, Callable, Sequence

DEFAULT_EXTRA_BIN_PATHS: tuple[str, ...] = ("/opt/homebrew/bin", "/usr/local/bin")


def find_executable(
    name: str,
    *,
    extra_paths: Sequence[str] = DEFAULT_EXTRA_BIN_PATHS,
    which: Callable[[str], str | None] = shutil.which,
) -> str | None:
    """Locate an executable on PATH first, then well-known fallback bin directories."""
    if not name or "/" in name or "\\" in name or "\0" in name:
        return None
    direct = which(name)
    if direct:
        return direct
    for directory in extra_paths:
        candidate = Path(directory) / name
        try:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
        except OSError:
            continue
    return None


def probe_cli_command(
    name: str,
    *,
    version_args: Sequence[str] | None = ("--version",),
    extra_paths: Sequence[str] = DEFAULT_EXTRA_BIN_PATHS,
    timeout_s: float = 5.0,
    which: Callable[[str], str | None] = shutil.which,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    required: bool = True,
    purpose: str = "",
    install_hint: str | None = None,
) -> dict[str, Any]:
    """Read-only probe checking CLI binary availability and optional version output."""
    path = find_executable(name, extra_paths=extra_paths, which=which)
    if not path:
        return {
            "name": name,
            "kind": "cli",
            "required": required,
            "ok": False,
            "state": "missing",
            "path": None,
            "version": None,
            "detail": f"{name} not found in PATH or extra_paths",
            "purpose": purpose,
            "install_hint": install_hint,
        }
    if not version_args:
        return {
            "name": name,
            "kind": "cli",
            "required": required,
            "ok": True,
            "state": "ready",
            "path": path,
            "version": None,
            "detail": "executable_ready",
            "purpose": purpose,
            "install_hint": install_hint,
        }
    try:
        completed = runner(
            [path, *version_args],
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=True,
        )
        raw = ((completed.stdout or "") + "\n" + (completed.stderr or "")).strip()
        first_line = next((line.strip() for line in raw.splitlines() if line.strip()), "executable_ready")
        return {
            "name": name,
            "kind": "cli",
            "required": required,
            "ok": True,
            "state": "ready",
            "path": path,
            "version": first_line,
            "detail": first_line,
            "purpose": purpose,
            "install_hint": install_hint,
        }
    except (OSError, subprocess.SubprocessError) as exc:
        return {
            "name": name,
            "kind": "cli",
            "required": required,
            "ok": False,
            "state": "error",
            "path": path,
            "version": None,
            "detail": str(exc),
            "purpose": purpose,
            "install_hint": install_hint,
        }


def probe_python_module(
    module_name: str,
    *,
    package_name: str | None = None,
    find_spec: Callable[[str], Any] = importlib.util.find_spec,
    required: bool = True,
    purpose: str = "",
    install_hint: str | None = None,
) -> dict[str, Any]:
    """Read-only probe checking importability via importlib.util.find_spec."""
    present = False
    error_detail: str | None = None
    try:
        present = bool(find_spec(module_name))
    except Exception as exc:  # Defensive against broken namespace packages.
        error_detail = str(exc)
    return {
        "name": package_name or module_name,
        "module": module_name,
        "kind": "python_module",
        "required": required,
        "ok": present,
        "state": "ready" if present else ("error" if error_detail else "missing"),
        "detail": "module_spec_found" if present else (error_detail or f"module '{module_name}' not found"),
        "purpose": purpose,
        "install_hint": install_hint,
    }


def probe_workspace_venv_python(
    workspace_root: Path,
    *,
    required_modules: Sequence[str] = (),
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    timeout_s: float = 5.0,
) -> dict[str, Any]:
    """Read-only probe of `<workspace>/.venv/bin/python` and requested module importability."""
    venv_python = Path(workspace_root) / ".venv" / "bin" / "python"
    if not venv_python.is_file() or not os.access(venv_python, os.X_OK):
        return {
            "ok": False,
            "state": "missing",
            "python_path": None,
            "modules": {mod: False for mod in required_modules},
            "detail": f"workspace venv python not found: {venv_python}",
        }
    if not required_modules:
        return {
            "ok": True,
            "state": "ready",
            "python_path": str(venv_python),
            "modules": {},
            "detail": "workspace_venv_ready",
        }
    script = (
        "import importlib.util, json, sys; "
        "print(json.dumps({m: bool(importlib.util.find_spec(m)) for m in sys.argv[1:]}))"
    )
    try:
        completed = runner(
            [str(venv_python), "-c", script, *required_modules],
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
        if completed.returncode != 0:
            return {
                "ok": False,
                "state": "error",
                "python_path": str(venv_python),
                "modules": {mod: False for mod in required_modules},
                "detail": (completed.stderr or completed.stdout or "venv probe failed").strip(),
            }
        modules_found = json.loads(completed.stdout.strip() or "{}")
        normalized = {mod: bool(modules_found.get(mod)) for mod in required_modules}
        all_ok = all(normalized.values())
        return {
            "ok": all_ok,
            "state": "ready" if all_ok else "missing",
            "python_path": str(venv_python),
            "modules": normalized,
            "detail": "all_modules_found" if all_ok else "some_modules_missing",
        }
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        return {
            "ok": False,
            "state": "error",
            "python_path": str(venv_python),
            "modules": {mod: False for mod in required_modules},
            "detail": str(exc),
        }


def probe_node_playwright(
    *,
    node_bin: str | None = None,
    repo_root: Path | None = None,
    extra_env: dict[str, str] | None = None,
    which: Callable[[str], str | None] = shutil.which,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    timeout_s: float = 15.0,
) -> dict[str, Any]:
    """Read-only Node Playwright + headless Chromium Canvas 2D capability probe."""
    resolved_node = node_bin or which("node")
    if not resolved_node:
        return {
            "ok": False,
            "state": "blocked",
            "reason": "node_missing",
            "executable_path": None,
            "canvas_ok": False,
            "detail": "node_missing",
        }
    target_root = str((repo_root or Path.cwd()).resolve())
    probe_script = (
        "const {createRequire} = require('node:module');\n"
        "const fs = require('node:fs');\n"
        "const path = require('node:path');\n"
        "(async () => {\n"
        "  let browser;\n"
        "  try {\n"
        "    const req = createRequire(path.resolve(process.argv[1], 'package.json'));\n"
        "    const {chromium} = req('playwright');\n"
        "    const executable = process.env.CHROME_PATH || chromium.executablePath();\n"
        "    if (!fs.existsSync(executable)) throw new Error('Chromium executable not found: ' + executable);\n"
        "    browser = await chromium.launch({headless:true, executablePath:executable});\n"
        "    const page = await browser.newPage();\n"
        "    await page.setContent('<canvas id=\"c\" width=\"8\" height=\"8\"></canvas>');\n"
        "    const canvas = await page.evaluate(() => !!document.querySelector('canvas').getContext('2d'));\n"
        "    if (!canvas) throw new Error('Canvas 2D unavailable');\n"
        "    console.log(JSON.stringify({state:'ready', executable, launch_verified:true, canvas_ok:true}));\n"
        "  } catch (e) {\n"
        "    console.log(JSON.stringify({state:'missing', error:e.message, canvas_ok:false}));\n"
        "  } finally {\n"
        "    if (browser) await browser.close();\n"
        "  }\n"
        "})();\n"
    )
    run_env = dict(os.environ)
    if extra_env:
        run_env.update(extra_env)
    kwargs: dict[str, Any] = {
        "capture_output": True,
        "text": True,
        "timeout": timeout_s,
        "check": True,
    }
    if extra_env is not None:
        kwargs["env"] = run_env
    try:
        completed = runner([resolved_node, "-e", probe_script, target_root], **kwargs)
        payload = json.loads((completed.stdout or "").strip())
        if not isinstance(payload, dict):
            raise ValueError("Node playwright probe did not output a JSON object")
        state = str(payload.get("state") or "missing")
        executable = payload.get("executable") or payload.get("executable_path")
        canvas_ok = bool(payload.get("canvas_ok", state == "ready"))
        detail = str(payload.get("error") or ("ready" if state == "ready" else state))
        return {
            **payload,
            "ok": state == "ready",
            "state": state,
            "executable_path": executable,
            "canvas_ok": canvas_ok,
            "detail": detail,
        }
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        return {
            "ok": False,
            "state": "error",
            "executable_path": None,
            "canvas_ok": False,
            "error": str(exc),
            "detail": str(exc),
        }


def probe_native_helper_descriptor(
    descriptor_file: Path | None,
    source_file: Path | None,
    expected_helper_id: str | None,
) -> dict[str, Any]:
    """Validate an opl_pack_native_helper_probe_descriptor JSON file without reading helper execution."""
    descriptor: dict[str, Any] = {}
    exists = bool(descriptor_file and descriptor_file.is_file())
    if exists and descriptor_file is not None:
        try:
            loaded = json.loads(descriptor_file.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                descriptor = loaded
        except (OSError, json.JSONDecodeError):
            descriptor = {}
    entrypoint_ref = str(descriptor.get("entrypoint_ref") or "")
    descriptor_entrypoint = (
        (descriptor_file.parent / entrypoint_ref).resolve()
        if descriptor_file and entrypoint_ref
        else None
    )
    authority = descriptor.get("authority_boundary")
    authority_is_false = (
        isinstance(authority, dict)
        and bool(authority)
        and all(value is False for value in authority.values())
    )
    matches_source = bool(
        exists
        and source_file is not None
        and descriptor.get("surface_kind") == "opl_pack_native_helper_probe_descriptor"
        and descriptor.get("schema_version") == 1
        and descriptor.get("helper_id") == expected_helper_id
        and descriptor_entrypoint == source_file.resolve()
        and authority_is_false
    )
    return {
        "exists": exists,
        "matches_source": matches_source,
        "descriptor": descriptor,
    }


def summarize_dependency_probes(checks: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Summarize probe dictionaries into ready/missing counts without domain authority."""
    total = len(checks)
    ready = sum(1 for item in checks if item.get("ok") is True)
    missing = sum(1 for item in checks if item.get("state") in {"missing", "blocked"})
    error = sum(1 for item in checks if item.get("state") == "error")
    required_missing = sum(
        1 for item in checks if item.get("required", True) and item.get("ok") is not True
    )
    return {
        "status": "degraded" if required_missing > 0 else "ok",
        "total": total,
        "ok": ready,
        "missing": missing,
        "error": error,
        "required_missing": required_missing,
    }


__all__ = [
    "DEFAULT_EXTRA_BIN_PATHS",
    "find_executable",
    "probe_cli_command",
    "probe_native_helper_descriptor",
    "probe_node_playwright",
    "probe_python_module",
    "probe_workspace_venv_python",
    "summarize_dependency_probes",
]
