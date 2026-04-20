from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path


_SHARED_HELPER_MODULE_NAME = "opl_harness_shared.editable_consumer_bootstrap"
_SHARED_HELPER_MODULE_FILE = "editable_consumer_bootstrap.py"


def _module_spec(module_name: str):
    try:
        return importlib.util.find_spec(module_name)
    except ModuleNotFoundError:
        return None


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


def _candidate_shared_src_roots(
    repo_root: Path,
    shared_package_name: str,
) -> tuple[Path, ...]:
    _ = shared_package_name
    candidate_base_roots = [repo_root.parent]
    for ancestor in repo_root.parents:
        if ancestor.name in {".worktrees", "worktrees"} and ancestor.parent.parent not in candidate_base_roots:
            candidate_base_roots.append(ancestor.parent.parent)

    unique_base_roots: list[Path] = []
    for candidate in candidate_base_roots:
        if candidate not in unique_base_roots:
            unique_base_roots.append(candidate)

    return tuple(
        base_root / "one-person-lab" / "python" / "opl-harness-shared" / "src"
        for base_root in unique_base_roots
    )


def _candidate_shared_helper_module_paths(
    repo_root: Path,
    shared_package_name: str,
) -> tuple[Path, ...]:
    return tuple(
        candidate_root / shared_package_name / _SHARED_HELPER_MODULE_FILE
        for candidate_root in _candidate_shared_src_roots(repo_root, shared_package_name)
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


def _load_shared_helper_module_from_path(helper_path: Path):
    spec = importlib.util.spec_from_file_location(
        f"opl_harness_shared_editable_consumer_bootstrap_{abs(hash(helper_path))}",
        helper_path,
    )
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _import_shared_helper_module(
    repo_root: Path,
    shared_package_name: str,
    added_paths: list[Path],
):
    for helper_path in _candidate_shared_helper_module_paths(repo_root, shared_package_name):
        if helper_path.exists():
            shared_src_root = helper_path.parent.parent
            inserted = _prepend_path(shared_src_root)
            _prefer_existing_package_path(shared_src_root, shared_package_name)
            if inserted:
                added_paths.append(shared_src_root)
            return _load_shared_helper_module_from_path(helper_path)
    if _module_spec(_SHARED_HELPER_MODULE_NAME) is not None:
        return importlib.import_module(_SHARED_HELPER_MODULE_NAME)
    return None


def ensure_repo_editable_dependency_paths(
    *,
    repo_root: Path,
    shared_package_name: str = "opl_harness_shared",
) -> tuple[Path, ...]:
    resolved_repo_root = Path(repo_root).expanduser().resolve()
    added_paths: list[Path] = []
    helper_module = _import_shared_helper_module(
        resolved_repo_root,
        shared_package_name,
        added_paths,
    )
    if helper_module is None:
        for candidate_root in _candidate_repo_site_packages_roots(resolved_repo_root):
            if _prepend_path(candidate_root):
                added_paths.append(candidate_root)
        helper_module = _import_shared_helper_module(
            resolved_repo_root,
            shared_package_name,
            added_paths,
        )
    if helper_module is None:
        return tuple(added_paths)

    ensure_paths = getattr(helper_module, "ensure_consumer_editable_dependency_paths", None)
    if not callable(ensure_paths):
        return tuple(added_paths)

    delegated_added_paths = tuple(
        Path(entry)
        for entry in ensure_paths(
            repo_root=resolved_repo_root,
            shared_package_name=shared_package_name,
        )
    )
    if delegated_added_paths:
        return delegated_added_paths
    return tuple(added_paths)
