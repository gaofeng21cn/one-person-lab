from __future__ import annotations

import importlib
import importlib.util
from pathlib import Path


def _load_editable_dependency_bootstrap_from_neighbor():
    helper_path = Path(__file__).resolve().with_name("editable_dependency_bootstrap.py")
    spec = importlib.util.spec_from_file_location(
        f"opl_harness_shared_editable_dependency_bootstrap_{abs(hash(helper_path))}",
        helper_path,
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"unable to load editable dependency bootstrap helper from {helper_path}") from None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_editable_dependency_bootstrap():
    if not (__package__ and __package__.startswith("opl_harness_shared")):
        return _load_editable_dependency_bootstrap_from_neighbor()
    try:
        return importlib.import_module("opl_harness_shared.editable_dependency_bootstrap")
    except ModuleNotFoundError:
        return _load_editable_dependency_bootstrap_from_neighbor()


def ensure_consumer_editable_dependency_paths(
    *,
    repo_root: Path,
    shared_package_name: str = "opl_harness_shared",
) -> tuple[Path, ...]:
    editable_dependency_bootstrap = _load_editable_dependency_bootstrap()
    return tuple(
        Path(entry)
        for entry in editable_dependency_bootstrap.ensure_editable_dependency_paths(
            repo_root=Path(repo_root),
            shared_package_name=shared_package_name,
        )
    )
