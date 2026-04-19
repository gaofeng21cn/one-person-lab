from __future__ import annotations

import importlib.util
from pathlib import Path

from opl_harness_shared import editable_consumer_bootstrap as module


def test_consumer_bootstrap_delegates_to_shared_editable_dependency_bootstrap(
    monkeypatch,
    tmp_path: Path,
) -> None:
    recorded: dict[str, Path | str] = {}

    def fake_ensure_paths(*, repo_root: Path, shared_package_name: str = "opl_harness_shared"):
        recorded["repo_root"] = repo_root
        recorded["shared_package_name"] = shared_package_name
        return (repo_root / "delegated-src",)

    monkeypatch.setattr(
        "opl_harness_shared.editable_dependency_bootstrap.ensure_editable_dependency_paths",
        fake_ensure_paths,
    )

    added = module.ensure_consumer_editable_dependency_paths(
        repo_root=tmp_path / "med-autoscience",
        shared_package_name="opl_harness_shared",
    )

    assert added == (tmp_path / "med-autoscience" / "delegated-src",)
    assert recorded == {
        "repo_root": tmp_path / "med-autoscience",
        "shared_package_name": "opl_harness_shared",
    }


def test_consumer_bootstrap_normalizes_delegated_strings_to_paths(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "opl_harness_shared.editable_dependency_bootstrap.ensure_editable_dependency_paths",
        lambda **_: (str(tmp_path / "delegated-src"),),
    )

    added = module.ensure_consumer_editable_dependency_paths(repo_root=tmp_path / "med-autoscience")

    assert added == (tmp_path / "delegated-src",)


def test_consumer_bootstrap_loaded_by_file_path_still_delegates_to_neighbor_helper(
    monkeypatch,
    tmp_path: Path,
) -> None:
    consumer_helper_path = tmp_path / "editable_consumer_bootstrap.py"
    dependency_helper_path = tmp_path / "editable_dependency_bootstrap.py"
    dependency_helper_path.write_text(
        "from pathlib import Path\n"
        "def ensure_editable_dependency_paths(*, repo_root, shared_package_name='opl_harness_shared'):\n"
        "    return (Path(repo_root) / 'delegated-src',)\n",
        encoding="utf-8",
    )
    source_path = Path(module.__file__).resolve()
    consumer_helper_path.write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")

    spec = importlib.util.spec_from_file_location("standalone_consumer_bootstrap", consumer_helper_path)
    assert spec is not None
    assert spec.loader is not None
    standalone_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(standalone_module)

    monkeypatch.setattr(standalone_module, "__file__", str(consumer_helper_path))

    added = standalone_module.ensure_consumer_editable_dependency_paths(repo_root=tmp_path / "med-autoscience")

    assert added == (tmp_path / "med-autoscience" / "delegated-src",)
