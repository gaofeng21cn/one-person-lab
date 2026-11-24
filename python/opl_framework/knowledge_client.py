"""Restricted thin client for Framework-owned `opl knowledge` CLI operations."""

from __future__ import annotations

from collections.abc import Callable, Sequence
import json
import os
from pathlib import Path
import shutil
import subprocess
from typing import Any


KNOWLEDGE_OPERATIONS = (
    "sources",
    "search",
    "discover",
    "resolve-target",
    "read-source",
    "inspect-source",
    "register",
    "propose",
    "review",
    "apply",
    "review-source",
    "verify-dependencies",
)
_SCOPE_OPTIONS = {"--workspace", "--project", "--domain", "--json"}


class KnowledgeCommandError(RuntimeError):
    """Raised when the Framework knowledge owner rejects or fails an operation."""


class KnowledgeClient:
    """Forward bounded `opl knowledge` operations without local storage or retries."""

    def __init__(
        self,
        workspace: Path | str,
        *,
        domain_id: str,
        project: Path | str | None = None,
        opl_bin: str | None = None,
        timeout: int = 60,
        runner: Callable[..., Any] | None = None,
    ) -> None:
        if not isinstance(domain_id, str) or not domain_id.strip():
            raise ValueError("domain_id must be a non-empty string")
        if isinstance(timeout, bool) or not isinstance(timeout, int) or timeout <= 0:
            raise ValueError("timeout must be a positive integer")
        self.domain_id = domain_id.strip()
        self.workspace = str(Path(workspace).expanduser().resolve())
        self.project = str(Path(project).expanduser().resolve()) if project else None
        resolved_bin = opl_bin or os.environ.get("OPL_BIN") or shutil.which("opl")
        if not resolved_bin:
            raise KnowledgeCommandError("OPL CLI is unavailable; configure OPL_BIN")
        self.opl_bin = resolved_bin
        self.timeout = timeout
        self._runner = runner

    def run(
        self,
        operation: str,
        arguments: Sequence[str] = (),
        *,
        runner: Callable[..., Any] | None = None,
    ) -> dict[str, Any]:
        """Execute one `opl knowledge <operation>` invocation and require a g2 JSON envelope."""

        if operation not in KNOWLEDGE_OPERATIONS:
            raise ValueError(f"unsupported knowledge operation: {operation}")
        if any(str(arg).split("=", 1)[0] in _SCOPE_OPTIONS for arg in arguments):
            raise ValueError("knowledge arguments cannot override bound scope or output format")
        command = [
            self.opl_bin,
            "knowledge",
            operation,
            "--workspace",
            self.workspace,
            "--domain",
            self.domain_id,
        ]
        if self.project:
            command += ["--project", self.project]
        command += [str(arg) for arg in arguments] + ["--json"]
        exec_run = runner or self._runner or subprocess.run
        try:
            result = exec_run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=self.timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise KnowledgeCommandError(f"knowledge {operation} did not complete") from error
        try:
            envelope = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise KnowledgeCommandError(f"knowledge {operation} returned invalid JSON") from error
        if result.returncode or not isinstance(envelope, dict) or envelope.get("error"):
            raise KnowledgeCommandError(f"knowledge {operation} was rejected by Framework")
        if envelope.get("version") != "g2":
            raise KnowledgeCommandError("unsupported Framework knowledge response")
        return envelope


__all__ = [
    "KNOWLEDGE_OPERATIONS",
    "KnowledgeClient",
    "KnowledgeCommandError",
]
