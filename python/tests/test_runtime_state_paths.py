from __future__ import annotations

from pathlib import Path
import pytest

from opl_framework.runtime_state_paths import (
    domain_runtime_state_display_path,
    resolve_domain_runtime_state_root,
    resolve_opl_state_dir,
)


def test_resolve_opl_state_dir_and_domain_root(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("OPL_STATE_DIR", raising=False)
    monkeypatch.delenv("OPL_DATA_DIR", raising=False)
    monkeypatch.delenv("MAG_STATE_OVERRIDE", raising=False)
    monkeypatch.setenv("CODEX_HOME", str(tmp_path / "codex-ignored"))

    default_dir = resolve_opl_state_dir()
    assert ".codex" not in str(default_dir)
    default_domain = resolve_domain_runtime_state_root("med-autogrant", explicit_env="MAG_STATE_OVERRIDE")
    assert default_domain == default_dir / "domains" / "med-autogrant" / "runtime-state"

    data_root = tmp_path / "data"
    monkeypatch.setenv("OPL_DATA_DIR", str(data_root))
    assert resolve_opl_state_dir() == (data_root / "opl" / "state").resolve()

    state_root = tmp_path / "opl-state"
    monkeypatch.setenv("OPL_STATE_DIR", str(state_root))
    assert resolve_opl_state_dir() == state_root.resolve()
    assert resolve_domain_runtime_state_root("med-autogrant", explicit_env="MAG_STATE_OVERRIDE") == (
        state_root.resolve() / "domains" / "med-autogrant" / "runtime-state"
    )

    override_root = tmp_path / "custom-mag"
    monkeypatch.setenv("MAG_STATE_OVERRIDE", str(override_root))
    assert resolve_domain_runtime_state_root("med-autogrant", explicit_env="MAG_STATE_OVERRIDE") == (
        override_root.resolve()
    )


def test_domain_runtime_state_display_path_and_validation() -> None:
    assert domain_runtime_state_display_path("med-autogrant") == "$OPL_STATE_DIR/domains/med-autogrant/runtime-state/"
    assert (
        domain_runtime_state_display_path("med-autogrant", "receipts")
        == "$OPL_STATE_DIR/domains/med-autogrant/runtime-state/receipts"
    )
    with pytest.raises(ValueError, match="Invalid domain_id"):
        domain_runtime_state_display_path("../bad")
    with pytest.raises(ValueError, match="Invalid display path segment"):
        domain_runtime_state_display_path("med-autogrant", "..")
