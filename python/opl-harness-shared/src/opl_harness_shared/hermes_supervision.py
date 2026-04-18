from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class HermesSupervisionSpec:
    hermes_home_root: Path
    job_name: str
    script_relpath: str
    silent_prompt: str
    watch_command: tuple[str, ...]
    interval_seconds: int = 5 * 60


def require_interval_minutes(interval_seconds: int) -> int:
    if interval_seconds < 60 or interval_seconds % 60 != 0:
        raise ValueError("interval_seconds must be a positive multiple of 60")
    return interval_seconds // 60


def script_path(*, hermes_home_root: Path, script_relpath: str) -> Path:
    return Path(hermes_home_root).resolve() / "scripts" / str(script_relpath).strip()


def jobs_path(*, hermes_home_root: Path) -> Path:
    return Path(hermes_home_root).resolve() / "cron" / "jobs.json"


def render_supervision_script(command: Iterable[str]) -> str:
    command_json = json.dumps(list(command))
    return (
        "#!/usr/bin/env python3\n"
        "from __future__ import annotations\n\n"
        "import json\n"
        "import subprocess\n\n"
        f"COMMAND = json.loads({json.dumps(command_json)})\n\n"
        "completed = subprocess.run(COMMAND, capture_output=True, text=True, check=False)\n"
        "payload = {\n"
        '    "command": COMMAND,\n'
        '    "returncode": completed.returncode,\n'
        "}\n"
        "stdout = (completed.stdout or '').strip()\n"
        "stderr = (completed.stderr or '').strip()\n"
        "if stdout:\n"
        "    try:\n"
        '        payload["result"] = json.loads(stdout)\n'
        "    except json.JSONDecodeError:\n"
        '        payload["stdout"] = stdout\n'
        "if stderr:\n"
        '    payload["stderr"] = stderr\n'
        "print(json.dumps(payload, ensure_ascii=False))\n"
        "raise SystemExit(completed.returncode)\n"
    )


def ensure_script_file(*, hermes_home_root: Path, script_relpath: str, command: Iterable[str]) -> Path:
    target = script_path(hermes_home_root=hermes_home_root, script_relpath=script_relpath)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_supervision_script(command), encoding="utf-8")
    target.chmod(0o755)
    return target


def load_jobs(*, hermes_home_root: Path) -> list[dict[str, Any]]:
    target = jobs_path(hermes_home_root=hermes_home_root)
    if not target.is_file():
        return []
    try:
        payload = json.loads(target.read_text(encoding="utf-8")) or []
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(payload, dict):
        payload = payload.get("jobs") or []
    if not isinstance(payload, list):
        return []
    return [dict(item) for item in payload if isinstance(item, dict)]


def resolve_job_script_path(*, hermes_home_root: Path, script_value: object) -> Path | None:
    text = str(script_value or "").strip()
    if not text:
        return None
    candidate = Path(text).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (Path(hermes_home_root).resolve() / "scripts" / candidate).resolve()


def matching_jobs(*, hermes_home_root: Path, job_name: str, script_relpath: str) -> list[dict[str, Any]]:
    target_script = script_path(hermes_home_root=hermes_home_root, script_relpath=script_relpath)
    matches: list[dict[str, Any]] = []
    for job in load_jobs(hermes_home_root=hermes_home_root):
        job_label = str(job.get("name") or "").strip()
        job_script = resolve_job_script_path(hermes_home_root=hermes_home_root, script_value=job.get("script"))
        if job_label == str(job_name).strip() or job_script == target_script:
            matches.append(job)
    return matches


def _job_sort_key(job: dict[str, Any]) -> tuple[int, int, str]:
    enabled = 1 if bool(job.get("enabled", True)) else 0
    scheduled = 1 if str(job.get("state") or "").strip() == "scheduled" else 0
    created_at = str(job.get("created_at") or "")
    return (enabled, scheduled, created_at)


def select_primary_job(jobs: Iterable[dict[str, Any]]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    ordered = sorted((dict(job) for job in jobs), key=_job_sort_key, reverse=True)
    if not ordered:
        return None, []
    return ordered[0], ordered[1:]


def schedule_matches(job: dict[str, Any], *, interval_seconds: int) -> bool:
    schedule = job.get("schedule")
    if not isinstance(schedule, dict):
        return False
    return schedule.get("kind") == "interval" and int(schedule.get("minutes") or -1) == require_interval_minutes(
        interval_seconds
    )


def job_drift(
    *,
    hermes_home_root: Path,
    job: dict[str, Any] | None,
    job_name: str,
    silent_prompt: str,
    script_relpath: str,
    interval_seconds: int,
) -> list[str]:
    if job is None:
        return ["job_missing"]
    drift: list[str] = []
    if str(job.get("name") or "").strip() != str(job_name).strip():
        drift.append("name_mismatch")
    if str(job.get("prompt") or "").strip() != str(silent_prompt).strip():
        drift.append("prompt_mismatch")
    if str(job.get("deliver") or "").strip() != "local":
        drift.append("deliver_mismatch")
    if not schedule_matches(job, interval_seconds=interval_seconds):
        drift.append("schedule_mismatch")
    if resolve_job_script_path(hermes_home_root=hermes_home_root, script_value=job.get("script")) != script_path(
        hermes_home_root=hermes_home_root,
        script_relpath=script_relpath,
    ):
        drift.append("script_mismatch")
    return drift


def status_summary(*, status: str, gateway_service_loaded: bool, job_present: bool, drift_reasons: list[str]) -> str:
    if status == "loaded":
        if drift_reasons:
            return "Hermes-hosted runtime supervision 已在线，但当前注册项与期望 contract 存在漂移。"
        return "Hermes-hosted runtime supervision 已在线，workspace 级监管会持续刷新。"
    if status == "not_loaded":
        if not gateway_service_loaded and job_present:
            return "Hermes-hosted runtime supervision 已注册，但 Hermes gateway 当前未在线。"
        if job_present:
            return "Hermes-hosted runtime supervision 已注册，但当前未处于调度中。"
        return "Hermes-hosted runtime supervision 还没有进入可调度状态。"
    return "Hermes-hosted runtime supervision 尚未注册。"


def remove_empty_parent_dirs(path: Path, *, stop_at: Path) -> None:
    current = path.parent
    stop = Path(stop_at).resolve()
    while current.exists() and current.resolve() != stop:
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent
