from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path

from opl_harness_shared import editable_consumer_launcher as module


def test_launcher_prefers_sibling_owner_launcher_from_nested_worktree_layout(
    monkeypatch,
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "med-autoscience" / ".worktrees" / "codex" / "family-bootstrap"
    repo_root.mkdir(parents=True)
    helper_path = (
        tmp_path
        / "one-person-lab"
        / "python"
        / "opl-harness-shared"
        / "src"
        / "opl_harness_shared"
        / "editable_consumer_bootstrap.py"
    )
    helper_path.parent.mkdir(parents=True)
    helper_path.write_text(
        "from pathlib import Path\n"
        "def ensure_consumer_editable_dependency_paths(*, repo_root, shared_package_name='opl_harness_shared'):\n"
        "    marker = Path(repo_root) / 'shared-launcher-called.txt'\n"
        "    marker.write_text(shared_package_name, encoding='utf-8')\n"
        "    return (Path(repo_root) / 'delegated-src',)\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(module, "_candidate_repo_site_packages_roots", lambda repo_root: ())
    monkeypatch.setattr(module, "_module_spec", lambda module_name: None)

    added = module.ensure_repo_editable_dependency_paths(repo_root=repo_root)

    assert added == (repo_root / "delegated-src",)
    assert (repo_root / "shared-launcher-called.txt").read_text(encoding="utf-8") == "opl_harness_shared"


def test_launcher_can_import_shared_launcher_from_repo_site_packages(monkeypatch, tmp_path: Path) -> None:
    repo_root = tmp_path / "med-autogrant"
    repo_root.mkdir()
    fake_site_packages = tmp_path / ".venv" / "lib" / "python3.12" / "site-packages"
    fake_site_packages.mkdir(parents=True)
    fake_site_packages_str = str(fake_site_packages)
    original_sys_path = list(sys.path)
    sys.path[:] = [item for item in sys.path if item != fake_site_packages_str]
    imported_module_names: list[str] = []
    helper_module = type(
        "LauncherModule",
        (),
        {
            "ensure_consumer_editable_dependency_paths": staticmethod(
                lambda **_: (repo_root / "site-packages-src",)
            )
        },
    )

    def fake_module_spec(module_name: str):
        if module_name != "opl_harness_shared.editable_consumer_bootstrap":
            return importlib.util.find_spec(module_name)
        if fake_site_packages_str not in sys.path:
            return None
        return object()

    monkeypatch.setattr(module, "_candidate_repo_site_packages_roots", lambda repo_root: (fake_site_packages,))
    monkeypatch.setattr(module, "_candidate_shared_helper_module_paths", lambda repo_root, shared_package_name: ())
    monkeypatch.setattr(module, "_module_spec", fake_module_spec)
    monkeypatch.setattr(
        module.importlib,
        "import_module",
        lambda module_name: imported_module_names.append(module_name) or helper_module,
    )

    try:
        added = module.ensure_repo_editable_dependency_paths(repo_root=repo_root)
    finally:
        sys.path[:] = original_sys_path

    assert added == (repo_root / "site-packages-src",)
    assert imported_module_names == ["opl_harness_shared.editable_consumer_bootstrap"]
