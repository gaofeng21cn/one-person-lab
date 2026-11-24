from __future__ import annotations

from pathlib import Path

import pytest

from opl_framework.profile_workspace import (
    MARKER_NAME,
    PROFILE_WORKSPACE_DIRS,
    initialize_profile_workspace,
)


def test_profile_workspace_has_no_domain_specific_subdirs_and_validates_extra_dirs(tmp_path: Path) -> None:
    assert "data/relay" not in PROFILE_WORKSPACE_DIRS
    assert "data/persona" not in PROFILE_WORKSPACE_DIRS

    created = initialize_profile_workspace(
        tmp_path,
        {"profile/identity.md": "# Identity\n"},
        extra_dirs=("data/example",),
    )
    assert created == ["profile/identity.md"]
    assert (tmp_path / MARKER_NAME).is_file()
    assert (tmp_path / "data/example").is_dir()
    assert not (tmp_path / "data/relay").exists()
    assert not (tmp_path / "data/persona").exists()

    with pytest.raises(ValueError, match="stay inside workspace root"):
        initialize_profile_workspace(tmp_path, {}, extra_dirs=("../escape",))
