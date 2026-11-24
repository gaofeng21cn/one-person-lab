"""Canonical OPL state and per-domain runtime-state path resolution."""

from __future__ import annotations

import os
from pathlib import Path
import re
import sys

DOMAIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _validate_domain_id(domain_id: str) -> str:
    if not isinstance(domain_id, str) or not DOMAIN_ID_PATTERN.fullmatch(domain_id):
        raise ValueError(f"Invalid domain_id for runtime state path: {domain_id!r}")
    return domain_id


def resolve_opl_state_dir(*, data_dir: str | Path | None = None) -> Path:
    """Resolve the canonical OPL state directory matching src/kernel/runtime-state-paths.ts."""
    explicit_state = os.environ.get("OPL_STATE_DIR", "").strip()
    if explicit_state:
        return Path(explicit_state).expanduser().resolve()
    configured_data = str(data_dir).strip() if data_dir is not None else os.environ.get("OPL_DATA_DIR", "").strip()
    if configured_data:
        return (Path(configured_data).expanduser().resolve() / "opl" / "state")
    if sys.platform == "darwin":
        return (Path.home() / "Library" / "Application Support" / "OPL" / "state").resolve()
    xdg_state = os.environ.get("XDG_STATE_HOME", "").strip()
    base = Path(xdg_state).expanduser().resolve() if xdg_state else (Path.home() / ".local" / "state").resolve()
    return base / "one-person-lab"


def resolve_domain_runtime_state_root(
    domain_id: str,
    *,
    explicit_env: str | None = None,
    data_dir: str | Path | None = None,
) -> Path:
    """Resolve one domain's non-repo runtime-state directory under OPL state."""
    validated_domain = _validate_domain_id(domain_id)
    if explicit_env:
        override = os.environ.get(explicit_env, "").strip()
        if override:
            return Path(override).expanduser().resolve()
    return resolve_opl_state_dir(data_dir=data_dir) / "domains" / validated_domain / "runtime-state"


def domain_runtime_state_display_path(domain_id: str, *segments: str) -> str:
    """Return canonical symbolic display path `$OPL_STATE_DIR/domains/<domain_id>/runtime-state/...`."""
    validated_domain = _validate_domain_id(domain_id)
    base = Path("$OPL_STATE_DIR") / "domains" / validated_domain / "runtime-state"
    if not segments:
        return base.as_posix() + "/"
    for segment in segments:
        if not isinstance(segment, str) or not segment or "\\" in segment or segment in (".", ".."):
            raise ValueError(f"Invalid display path segment: {segment!r}")
    return base.joinpath(*segments).as_posix()


__all__ = [
    "DOMAIN_ID_PATTERN",
    "domain_runtime_state_display_path",
    "resolve_domain_runtime_state_root",
    "resolve_opl_state_dir",
]
