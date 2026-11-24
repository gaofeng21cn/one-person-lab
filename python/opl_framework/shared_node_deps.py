"""Generic lockfile-fingerprinted shared Node.js dependency pool with file locking."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

DEP_SECTIONS: tuple[str, ...] = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)
DEFAULT_RESOLVER_SCRIPT = Path(__file__).resolve().with_name("shared_node_resolve.mjs")


@dataclass(frozen=True)
class SharedNodeDepsConfig:
    """Configuration parameterizing cache location, schema tag, and env var bindings."""

    schema: str = "opl_shared_node_deps/v1"
    env_shared_node_modules: str = "OPL_SHARED_NODE_MODULES"
    env_cache_dir: str = "OPL_NODE_DEPS_CACHE"
    env_workspace_root: str = "OPL_WORKSPACE_ROOT"
    default_cache_subpath: str = ".cache/opl/node-deps"


def declared_packages(project_dir: Path) -> list[str]:
    """Return sorted top-level dependency package names from package.json."""
    pkg_path = project_dir / "package.json"
    if not pkg_path.is_file():
        return []
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for section in ("dependencies", "devDependencies"):
        mapping = pkg.get(section)
        if isinstance(mapping, dict):
            names.update(str(k) for k in mapping)
    return sorted(names)


def lockfile_fingerprint(project_dir: Path) -> tuple[str, Path]:
    """Stable hash of resolved Node dependencies independent of root version metadata."""
    project = project_dir.resolve()
    lock_path = project / "package-lock.json"
    pkg_path = project / "package.json"
    platform_tag = {
        "platform": sys.platform,
        "machine": platform.machine(),
    }
    if lock_path.is_file():
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        packages = lock.get("packages")
        if isinstance(packages, dict):
            normalized_packages: dict[str, Any] = {}
            for key, entry in packages.items():
                if key == "" and isinstance(entry, dict):
                    normalized_packages[""] = {
                        section: entry.get(section)
                        for section in (*DEP_SECTIONS, "engines")
                        if entry.get(section)
                    }
                else:
                    normalized_packages[key] = entry
            payload = {
                "lockfileVersion": lock.get("lockfileVersion"),
                "packages": normalized_packages,
                **platform_tag,
            }
        else:
            payload = {
                "lockfileVersion": lock.get("lockfileVersion"),
                "dependencies": lock.get("dependencies", {}),
                **platform_tag,
            }
        source = lock_path
    elif pkg_path.is_file():
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        payload = {
            section: pkg.get(section)
            for section in DEP_SECTIONS
            if pkg.get(section)
        }
        payload.update(platform_tag)
        source = pkg_path
    else:
        raise ValueError(f"package.json or package-lock.json is required: {project}")
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16], source


def resolve_shared_cache_root(
    workspace_root: Path | None = None,
    *,
    config: SharedNodeDepsConfig | None = None,
) -> Path:
    """Determine shared Node dependency pool directory from env override or workspace."""
    cfg = config or SharedNodeDepsConfig()
    override = os.environ.get(cfg.env_cache_dir, "").strip()
    if override:
        return Path(override).expanduser().resolve()
    if workspace_root is not None:
        return workspace_root.resolve() / ".cache" / "node-deps"
    env_ws = os.environ.get(cfg.env_workspace_root, "").strip()
    if env_ws:
        return Path(env_ws).expanduser().resolve() / ".cache" / "node-deps"
    return (Path.home() / cfg.default_cache_subpath).resolve()


def _is_pool_ready(cache_dir: Path, required: list[str]) -> bool:
    ready_file = cache_dir / ".ready.json"
    nm_dir = cache_dir / "node_modules"
    if not ready_file.is_file() or not nm_dir.is_dir():
        return False
    for name in required:
        if not (nm_dir / Path(*name.split("/"))).exists():
            return False
    return True


def ensure_shared_node_modules(
    project_dir: Path,
    *,
    workspace_root: Path | None = None,
    config: SharedNodeDepsConfig | None = None,
    runner: Callable[..., Any] = subprocess.run,
) -> dict[str, Any]:
    """Install (once per lockfile fingerprint under flock) and return the shared node_modules path."""
    cfg = config or SharedNodeDepsConfig()
    project = project_dir.resolve()
    fingerprint, source = lockfile_fingerprint(project)
    required = declared_packages(project)
    cache_root = resolve_shared_cache_root(workspace_root, config=cfg)
    cache_root.mkdir(parents=True, exist_ok=True)
    cache_dir = cache_root / fingerprint
    nm_dir = cache_dir / "node_modules"

    if _is_pool_ready(cache_dir, required):
        return {
            "fingerprint": fingerprint,
            "cache_dir": cache_dir,
            "node_modules": nm_dir,
            "reused": True,
            "source": str(source),
        }

    lock_handle_path = cache_root / f".{fingerprint}.lock"
    with lock_handle_path.open("a+", encoding="utf-8") as lock_file:
        if fcntl is not None:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            if _is_pool_ready(cache_dir, required):
                return {
                    "fingerprint": fingerprint,
                    "cache_dir": cache_dir,
                    "node_modules": nm_dir,
                    "reused": True,
                    "source": str(source),
                }
            stage = Path(tempfile.mkdtemp(prefix=f".staging-{fingerprint}-", dir=cache_root))
            try:
                for filename in ("package.json", "package-lock.json"):
                    src = project / filename
                    if src.is_file():
                        shutil.copy2(src, stage / filename)
                cmd = (
                    ["npm", "ci", "--no-audit", "--no-fund"]
                    if (stage / "package-lock.json").is_file()
                    else ["npm", "install", "--no-audit", "--no-fund"]
                )
                runner(cmd, cwd=stage, check=True)
                ready = {
                    "schema": cfg.schema,
                    "fingerprint": fingerprint,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "platform": sys.platform,
                    "machine": platform.machine(),
                    "packages": required,
                    "source_lock_sha256": (
                        hashlib.sha256((stage / "package-lock.json").read_bytes()).hexdigest()
                        if (stage / "package-lock.json").is_file()
                        else None
                    ),
                }
                (stage / ".ready.json").write_text(
                    json.dumps(ready, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                if cache_dir.exists():
                    shutil.rmtree(cache_dir)
                os.replace(stage, cache_dir)
            except BaseException:
                shutil.rmtree(stage, ignore_errors=True)
                raise
        finally:
            if fcntl is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    return {
        "fingerprint": fingerprint,
        "cache_dir": cache_dir,
        "node_modules": nm_dir,
        "reused": False,
        "source": str(source),
    }


def build_shared_node_env(
    project_dir: Path,
    *,
    workspace_root: Path | None = None,
    config: SharedNodeDepsConfig | None = None,
    resolve_hook_path: Path | None = None,
    base_env: dict[str, str] | None = None,
    runner: Callable[..., Any] = subprocess.run,
) -> tuple[dict[str, str], dict[str, Any]]:
    """Prepare PATH, NODE_PATH, NODE_OPTIONS, and pool vars to run `project_dir` against the shared pool."""
    cfg = config or SharedNodeDepsConfig()
    project = project_dir.resolve()
    env = dict(os.environ if base_env is None else base_env)
    if workspace_root is not None:
        resolved_ws = str(workspace_root.resolve())
        env["OPL_WORKSPACE_ROOT"] = resolved_ws
        if cfg.env_workspace_root:
            env[cfg.env_workspace_root] = resolved_ws
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    pool = ensure_shared_node_modules(
        project,
        workspace_root=workspace_root,
        config=cfg,
        runner=runner,
    )
    shared_nm = pool["node_modules"]
    bin_dir = shared_nm / ".bin"
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}".rstrip(os.pathsep)
    existing_node_path = env.get("NODE_PATH", "")
    env["NODE_PATH"] = (
        f"{shared_nm}{os.pathsep}{existing_node_path}" if existing_node_path else str(shared_nm)
    )
    env["OPL_SHARED_NODE_MODULES"] = str(shared_nm)
    if cfg.env_shared_node_modules:
        env[cfg.env_shared_node_modules] = str(shared_nm)

    hook = resolve_hook_path or DEFAULT_RESOLVER_SCRIPT
    import_flag = f"--import={hook.resolve().as_uri()}"
    existing_opts = env.get("NODE_OPTIONS", "").strip()
    if import_flag not in existing_opts:
        env["NODE_OPTIONS"] = f"{import_flag} {existing_opts}".strip()
    return env, pool


__all__ = [
    "DEFAULT_RESOLVER_SCRIPT",
    "DEP_SECTIONS",
    "SharedNodeDepsConfig",
    "build_shared_node_env",
    "declared_packages",
    "ensure_shared_node_modules",
    "lockfile_fingerprint",
    "resolve_shared_cache_root",
]
