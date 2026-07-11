from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
from typing import Iterable


DEFAULT_WORKSPACE_DOCUMENT = "workspace.json"
DEFAULT_WORKSPACE_GITIGNORE_ENTRIES = (
    ".DS_Store",
    ".venv/",
    "__pycache__/",
    ".pytest_cache/",
    ".ruff_cache/",
    ".mypy_cache/",
    "node_modules/",
    "runtime/",
    "logs/",
    "tmp/",
    "*.log",
    "*.pid",
    "*.sock",
)


@dataclass(frozen=True)
class WorkspaceScaffoldFile:
    relative_path: str | Path
    content: str
    executable: bool = False


def _normalized_entries(entries: Iterable[str]) -> tuple[str, ...]:
    normalized: list[str] = []
    for entry in entries:
        text = str(entry).strip()
        if text and text not in normalized:
            normalized.append(text)
    return tuple(normalized)


def render_workspace_gitignore(
    *,
    entries: Iterable[str] = (),
    header: str = "# OPL family workspace-local Git boundary.",
) -> str:
    merged_entries = _normalized_entries((*DEFAULT_WORKSPACE_GITIGNORE_ENTRIES, *tuple(entries)))
    return f"{header}\n" + "\n".join(merged_entries) + "\n"


def merge_workspace_gitignore_content(existing_content: str, *, entries: Iterable[str] = ()) -> str:
    required_entries = _normalized_entries((*DEFAULT_WORKSPACE_GITIGNORE_ENTRIES, *tuple(entries)))
    existing_lines = [line.rstrip("\n") for line in existing_content.splitlines()]
    existing_set = set(existing_lines)
    missing_entries = [entry for entry in required_entries if entry not in existing_set]
    if not missing_entries:
        return existing_content
    base = existing_content.rstrip()
    separator = "\n\n" if base else ""
    return f"{base}{separator}{chr(10).join(missing_entries)}\n"


def _workspace_git_payload(
    *,
    workspace_root: Path,
    enabled: bool,
    initialized: bool,
    already_initialized: bool,
) -> dict[str, object]:
    return {
        "enabled": enabled,
        "initialized": initialized,
        "already_initialized": already_initialized,
        "git_dir": str(workspace_root / ".git"),
        "gitignore_path": str(workspace_root / ".gitignore"),
    }


def _run_git(git_bin: str, args: list[str], *, workspace_root: Path) -> None:
    try:
        result = subprocess.run(
            [git_bin, *args],
            cwd=workspace_root,
            check=False,
            text=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("git executable is required to initialize an OPL family workspace boundary.") from exc
    if result.returncode != 0:
        command = " ".join(["git", *args])
        message = result.stderr.strip() or result.stdout.strip() or f"{command} failed"
        raise RuntimeError(message)


def ensure_workspace_git_boundary(*, workspace_root: str | Path, initialize_git: bool = True) -> dict[str, object]:
    resolved_root = Path(workspace_root).expanduser().resolve()
    already_initialized = (resolved_root / ".git").exists()
    if not initialize_git:
        return _workspace_git_payload(
            workspace_root=resolved_root,
            enabled=False,
            initialized=False,
            already_initialized=already_initialized,
        )
    if already_initialized:
        return _workspace_git_payload(
            workspace_root=resolved_root,
            enabled=True,
            initialized=False,
            already_initialized=True,
        )
    git_bin = shutil.which("git") or "git"
    _run_git(git_bin, ["init"], workspace_root=resolved_root)
    _run_git(git_bin, ["branch", "-M", "main"], workspace_root=resolved_root)
    _run_git(git_bin, ["config", "worktree.useRelativePaths", "true"], workspace_root=resolved_root)
    return _workspace_git_payload(
        workspace_root=resolved_root,
        enabled=True,
        initialized=True,
        already_initialized=False,
    )


def _resolve_relative_path(workspace_root: Path, relative_path: str | Path) -> Path:
    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError(f"workspace scaffold path must be relative: {path}")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"workspace scaffold path is not safe: {path}")
    return workspace_root / path


def _write_scaffold_file(item: WorkspaceScaffoldFile, *, workspace_root: Path, force: bool) -> tuple[str, Path]:
    target_path = _resolve_relative_path(workspace_root, item.relative_path)
    if target_path.exists() and not force:
        return "skipped", target_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(item.content, encoding="utf-8")
    if item.executable:
        target_path.chmod(target_path.stat().st_mode | 0o111)
    return "written", target_path


def materialize_directory_workspace(
    *,
    workspace_root: str | Path,
    directories: Iterable[str | Path] = (),
    files: Iterable[WorkspaceScaffoldFile] = (),
    gitignore_entries: Iterable[str] = (),
    initialize_git: bool = True,
    force: bool = False,
) -> dict[str, object]:
    resolved_root = Path(workspace_root).expanduser().resolve()
    resolved_root.mkdir(parents=True, exist_ok=True)
    created_directories: list[str] = []
    for relative_dir in directories:
        directory = _resolve_relative_path(resolved_root, relative_dir)
        if not directory.exists():
            directory.mkdir(parents=True, exist_ok=True)
            created_directories.append(str(directory))

    gitignore_path = resolved_root / ".gitignore"
    if gitignore_path.exists():
        gitignore_content = merge_workspace_gitignore_content(
            gitignore_path.read_text(encoding="utf-8"),
            entries=gitignore_entries,
        )
    else:
        gitignore_content = render_workspace_gitignore(entries=gitignore_entries)
    gitignore_path.write_text(gitignore_content, encoding="utf-8")

    written_files = [str(gitignore_path)]
    skipped_files: list[str] = []
    for item in files:
        action, target_path = _write_scaffold_file(item, workspace_root=resolved_root, force=force)
        if action == "written":
            written_files.append(str(target_path))
        else:
            skipped_files.append(str(target_path))

    workspace_git = ensure_workspace_git_boundary(
        workspace_root=resolved_root,
        initialize_git=initialize_git,
    )
    return {
        "workspace_root": str(resolved_root),
        "created_directories": created_directories,
        "written_files": written_files,
        "skipped_files": skipped_files,
        "workspace_git": workspace_git,
    }


def resolve_workspace_document_path(
    input_path: str | Path,
    *,
    default_filename: str = DEFAULT_WORKSPACE_DOCUMENT,
) -> Path:
    resolved_path = Path(input_path).expanduser().resolve()
    if resolved_path.is_dir():
        return resolved_path / default_filename
    return resolved_path
