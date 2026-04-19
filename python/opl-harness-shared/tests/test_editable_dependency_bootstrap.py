from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

from opl_harness_shared import editable_dependency_bootstrap as module


def test_shared_bootstrap_adds_repo_venv_site_packages_when_present(monkeypatch, tmp_path: Path) -> None:
    fake_site_packages = tmp_path / ".venv" / "lib" / "python3.12" / "site-packages"
    fake_site_packages.mkdir(parents=True)
    fake_site_packages_str = str(fake_site_packages)
    original_sys_path = list(sys.path)
    sys.path[:] = [item for item in sys.path if item != fake_site_packages_str]

    def fake_module_spec(module_name: str):
        if module_name != "opl_harness_shared":
            return importlib.util.find_spec(module_name)
        if fake_site_packages_str not in sys.path:
            return None
        return object()

    monkeypatch.setattr(module, "_candidate_repo_site_packages_roots", lambda repo_root: (fake_site_packages,))
    monkeypatch.setattr(module, "_candidate_shared_src_roots", lambda repo_root, shared_package_name: ())
    monkeypatch.setattr(module, "_module_spec", fake_module_spec)

    try:
        added = module.ensure_editable_dependency_paths(repo_root=tmp_path)
    finally:
        sys.path[:] = original_sys_path

    assert added == (fake_site_packages,)


def test_shared_bootstrap_adds_sibling_opl_harness_shared_src_when_missing(monkeypatch, tmp_path: Path) -> None:
    fake_shared_src = tmp_path / "one-person-lab" / "python" / "opl-harness-shared" / "src"
    package_root = fake_shared_src / "opl_harness_shared"
    package_root.mkdir(parents=True)
    (package_root / "__init__.py").write_text("__all__ = []\n", encoding="utf-8")

    candidate_root_str = str(fake_shared_src)
    original_sys_path = list(sys.path)
    sys.path[:] = [item for item in sys.path if item != candidate_root_str]

    def fake_module_spec(module_name: str):
        if module_name != "opl_harness_shared":
            return importlib.util.find_spec(module_name)
        if candidate_root_str not in sys.path:
            return None
        return importlib.util.find_spec(module_name)

    monkeypatch.setattr(module, "_module_spec", fake_module_spec)
    monkeypatch.setattr(module, "_candidate_repo_site_packages_roots", lambda repo_root: ())
    monkeypatch.setattr(
        module,
        "_candidate_shared_src_roots",
        lambda repo_root, shared_package_name: (fake_shared_src,),
    )

    try:
        added = module.ensure_editable_dependency_paths(repo_root=tmp_path / "med-autoscience")
    finally:
        sys.path[:] = original_sys_path

    assert added == (fake_shared_src,)


def test_shared_bootstrap_prefers_sibling_src_even_when_shared_package_is_already_importable(
    monkeypatch,
    tmp_path: Path,
) -> None:
    fake_shared_src = tmp_path / "one-person-lab" / "python" / "opl-harness-shared" / "src"
    package_root = fake_shared_src / "opl_harness_shared"
    package_root.mkdir(parents=True)
    (package_root / "__init__.py").write_text("__all__ = []\n", encoding="utf-8")

    candidate_root_str = str(fake_shared_src)
    original_sys_path = list(sys.path)
    original_package = sys.modules.get("opl_harness_shared")
    fake_package = types.ModuleType("opl_harness_shared")
    fake_package.__path__ = ["/tmp/site-packages/opl_harness_shared"]  # type: ignore[attr-defined]
    sys.modules["opl_harness_shared"] = fake_package
    sys.path[:] = [item for item in sys.path if item != candidate_root_str]

    monkeypatch.setattr(module, "_module_spec", lambda module_name: object() if module_name == "opl_harness_shared" else None)
    monkeypatch.setattr(module, "_candidate_repo_site_packages_roots", lambda repo_root: ())
    monkeypatch.setattr(
        module,
        "_candidate_shared_src_roots",
        lambda repo_root, shared_package_name: (fake_shared_src,),
    )

    try:
        added = module.ensure_editable_dependency_paths(repo_root=tmp_path)
        first_path = sys.path[0]
    finally:
        sys.path[:] = original_sys_path
        if original_package is None:
            sys.modules.pop("opl_harness_shared", None)
        else:
            sys.modules["opl_harness_shared"] = original_package

    assert added == (fake_shared_src,)
    assert first_path == candidate_root_str
    assert fake_package.__path__[0] == str(package_root)  # type: ignore[index]
