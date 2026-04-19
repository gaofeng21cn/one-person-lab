from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path


def _module_spec(module_name: str):
    try:
        return importlib.util.find_spec(module_name)
    except ModuleNotFoundError:
        return None


def _candidate_shared_src_roots(
    repo_root: Path,
    shared_package_name: str,
) -> tuple[Path, ...]:
    _ = shared_package_name
    candidates = [
        repo_root.parent / "one-person-lab" / "python" / "opl-harness-shared" / "src",
    ]
    if repo_root.parent.name in {".worktrees", "worktrees"}:
        candidates.append(
            repo_root.parent.parent.parent / "one-person-lab" / "python" / "opl-harness-shared" / "src"
        )

    unique_candidates: list[Path] = []
    for candidate in candidates:
        if candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return tuple(unique_candidates)


def _candidate_repo_site_packages_roots(repo_root: Path) -> tuple[Path, ...]:
    venv_root = repo_root / ".venv"
    versioned_site_packages = (
        venv_root / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
    )
    windows_site_packages = venv_root / "Lib" / "site-packages"
    return (
        versioned_site_packages,
        windows_site_packages,
    )


def _prepend_path(candidate_root: Path) -> bool:
    if not candidate_root.exists():
        return False
    candidate_root_str = str(candidate_root)
    if candidate_root_str in sys.path:
        return False
    sys.path.insert(0, candidate_root_str)
    importlib.invalidate_caches()
    return True


def _prefer_existing_package_path(candidate_root: Path, shared_package_name: str) -> None:
    package = sys.modules.get(shared_package_name)
    if package is None or not hasattr(package, "__path__"):
        return
    package_root = str(candidate_root / shared_package_name)
    existing = [entry for entry in package.__path__ if entry != package_root]
    package.__path__[:] = [package_root, *existing]


def ensure_editable_dependency_paths(
    *,
    repo_root: Path,
    shared_package_name: str = "opl_harness_shared",
) -> tuple[Path, ...]:
    resolved_repo_root = Path(repo_root).expanduser().resolve()
    added_paths: list[Path] = []
    for candidate_root in _candidate_shared_src_roots(resolved_repo_root, shared_package_name):
        if not (candidate_root / shared_package_name).exists():
            continue
        inserted = _prepend_path(candidate_root)
        _prefer_existing_package_path(candidate_root, shared_package_name)
        if inserted:
            added_paths.append(candidate_root)
        return tuple(added_paths)

    if _module_spec(shared_package_name) is not None:
        return ()

    for candidate_root in _candidate_repo_site_packages_roots(resolved_repo_root):
        if _prepend_path(candidate_root):
            added_paths.append(candidate_root)

    if _module_spec(shared_package_name) is not None:
        return tuple(added_paths)
    return tuple(added_paths)
