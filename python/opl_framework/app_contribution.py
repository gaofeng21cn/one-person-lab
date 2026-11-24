"""Shared host-neutral App Contribution helpers for OPL Standard Agents."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from datetime import datetime, timezone
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from typing import Any

from .review_feedback_store import (
    ReviewFeedbackError,
    list_feedback_notes,
    record_feedback_note,
    resolve_contained_path,
)

DEFAULT_MAX_MARKDOWN_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_PREVIEW_CHARS = 24000


class AppContributionError(ValueError):
    """Domain-neutral App contribution validation or boundary error."""

    def __init__(self, message: str, *, reason_code: str = "app_contribution_invalid") -> None:
        super().__init__(message)
        self.reason_code = reason_code


def sha256_bytes(data: bytes) -> str:
    """Return canonical sha256:<hex> digest for raw artifact bytes."""

    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def read_stdin_json(stream: Any = None) -> dict[str, Any]:
    """Read one JSON object from stdin or an injected stream."""

    source = sys.stdin if stream is None else stream
    payload = json.load(source)
    if not isinstance(payload, dict):
        raise AppContributionError("App contribution input must be a JSON object.")
    return payload


def write_json_stdout(payload: Mapping[str, Any], stream: Any = None) -> None:
    """Write one UTF-8 JSON object line to stdout or an injected stream."""

    target = sys.stdout if stream is None else stream
    target.write(json.dumps(payload, ensure_ascii=False) + "\n")


def ready_envelope(data: Any = None, **extra: Any) -> dict[str, Any]:
    """Build a standard ready contribution envelope."""

    envelope: dict[str, Any] = {"state": "ready"}
    if data is not None:
        envelope["data"] = data
    envelope.update(extra)
    return envelope


def unavailable_envelope(reason: str, message: str | None = None, **extra: Any) -> dict[str, Any]:
    """Build a standard unavailable contribution envelope."""

    envelope: dict[str, Any] = {"state": "unavailable", "reason": reason}
    if message is not None:
        envelope["message"] = message
    envelope.update(extra)
    return envelope


def input_required_choice(
    items: list[dict[str, Any]],
    field: str,
    title: str,
    *,
    defaults: Mapping[str, Any] | None = None,
    reason: str | None = None,
    extra_data: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a standard `input_required` selector payload for enum choices."""

    return {
        "state": "input_required",
        "reason": reason or f"{field}_selection_required",
        "input_schema": {
            "type": "object",
            "required": [field],
            "properties": {
                field: {
                    "type": "string",
                    "title": title,
                    "enum": [item["read_input"][field] for item in items],
                    "enumNames": [item["title"] for item in items],
                },
            },
        },
        "input_defaults": dict(defaults or {}),
        "data": {**dict(extra_data or {}), "items": items},
    }


def resolve_workspace_root(workspace: str | None = None, *, env_var: str = "OPL_PROFILE_WORKSPACE") -> Path | None:
    """Resolve explicit workspace or env workspace cleanly; return None if unset or non-absolute."""

    selected = workspace if workspace is not None else os.environ.get(env_var, "")
    if not selected or not Path(selected).is_absolute():
        return None
    return Path(selected).resolve(strict=True)


def read_contained_file(root: Path, container_dir: Path, ref: str, *, error_message: str | None = None) -> Path:
    """Resolve `root / ref` strictly inside `container_dir` as a regular file."""

    if not isinstance(ref, str) or not ref:
        raise AppContributionError(error_message or "A file reference is required.")
    try:
        resolved = resolve_contained_path(root, ref, container=container_dir, must_exist=True)
    except ReviewFeedbackError as exc:
        raise AppContributionError(error_message or str(exc), reason_code=exc.reason_code) from exc
    if not resolved.is_file():
        raise AppContributionError(error_message or f"Reference is not a regular file: {ref}")
    return resolved


def read_contained_json(root: Path, container_dir: Path, ref: str, *, error_message: str | None = None) -> dict[str, Any]:
    """Read and validate one JSON object inside `container_dir`."""

    path = read_contained_file(root, container_dir, ref, error_message=error_message)
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AppContributionError("Referenced JSON artifact must be a JSON object.")
    return value


def verify_work_item_identity(
    input_value: Mapping[str, Any],
    *,
    expected_agent_ids: Iterable[str] = (),
    expected_domain_ids: Iterable[str] = (),
    require_resolved: bool = True,
) -> tuple[dict[str, Any], str | None]:
    """Validate optional `work_item_identity` envelope and extract domain work-item id."""

    identity = input_value.get("work_item_identity") or {}
    if not isinstance(identity, dict):
        raise AppContributionError("work_item_identity must be an object.")
    if not identity:
        return {}, None
    allowed_agents = set(expected_agent_ids)
    allowed_domains = set(expected_domain_ids)
    if require_resolved and identity.get("identity_state") != "resolved":
        raise AppContributionError("work_item_identity must have identity_state 'resolved'.")
    if allowed_agents and identity.get("agent_id") not in allowed_agents:
        raise AppContributionError("work_item_identity agent_id does not match the selected package.")
    if allowed_domains and identity.get("domain_id") not in allowed_domains:
        raise AppContributionError("work_item_identity domain_id does not match the selected package.")
    work_item_id = identity.get("domain_work_item_id") or identity.get("work_item_id")
    return identity, str(work_item_id) if isinstance(work_item_id, str) and work_item_id else None


def select_workspace_project(
    root: Path,
    *,
    requested_project_id: str | None = None,
    identity: Mapping[str, Any] | None = None,
    field_name: str = "project_id",
    field_title: str = "Select project",
    empty_ready: bool = False,
) -> tuple[dict[str, Any] | None, Path | None, dict[str, Any] | None]:
    """Resolve one project entry from `workspace_index.json` or return an `input_required` choice."""

    inventory = read_contained_json(root, root, "workspace_index.json")
    projects = [entry for entry in inventory.get("projects", []) if isinstance(entry, dict)]
    identity_map = dict(identity or {})
    identity_project_id = identity_map.get("domain_work_item_id") or identity_map.get("work_item_id")
    if identity_project_id and requested_project_id and requested_project_id != identity_project_id:
        raise AppContributionError("The selected project conflicts with the current work item.")
    selected_id = (
        str(identity_project_id)
        if isinstance(identity_project_id, str) and identity_project_id
        else requested_project_id
    )
    if selected_id:
        projects = [entry for entry in projects if entry.get("project_id") == selected_id]
        if len(projects) != 1:
            raise AppContributionError("The selected project is not unique in the workspace inventory.")
    elif len(projects) != 1:
        if not projects and empty_ready:
            return None, None, ready_envelope({"items": [], "source_refs": ["workspace_index.json"]})
        choices = [
            {
                "id": entry["project_id"],
                "title": entry.get("title", entry["project_id"]),
                "read_input": {field_name: entry["project_id"]},
            }
            for entry in projects
            if entry.get("project_id")
        ]
        return None, None, input_required_choice(choices, field_name, field_title)

    project_entry = projects[0]
    project_rel = project_entry.get("project_root")
    if not isinstance(project_rel, str) or not project_rel:
        raise AppContributionError("Workspace project entry is missing project_root.")
    project_root = (root / project_rel).resolve(strict=True)
    if project_root == root or not project_root.is_relative_to(root) or not project_root.is_dir():
        raise AppContributionError("Project root must stay strictly inside the workspace.")
    for field, actual in (("workspace_path", root), ("work_item_root", project_root)):
        declared = identity_map.get(field)
        if declared and Path(str(declared)).resolve(strict=True) != actual:
            raise AppContributionError("The selected work-item paths conflict with the workspace inventory.")
    return project_entry, project_root, None


def extract_markdown_headings(body: str) -> list[dict[str, Any]]:
    """Extract ATX headings while skipping fenced code blocks."""

    headings: list[dict[str, Any]] = []
    fenced = False
    for line_number, line in enumerate(body.splitlines(), 1):
        if re.match(r"^\s*(`{3,}|~{3,})", line):
            fenced = not fenced
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line) if not fenced else None
        if heading:
            headings.append({"level": len(heading[1]), "title": heading[2], "line": line_number})
    return headings


def inspect_markdown_file(
    root: Path,
    container_dir: Path,
    ref: str,
    *,
    max_bytes: int = DEFAULT_MAX_MARKDOWN_BYTES,
    max_preview_chars: int = DEFAULT_MAX_PREVIEW_CHARS,
) -> tuple[dict[str, Any], str]:
    """Read and summarize one Markdown file inside `container_dir`."""

    path = read_contained_file(root, container_dir, ref)
    if path.suffix.lower() not in {".md", ".markdown"}:
        raise AppContributionError("Referenced artifact is not a Markdown document.")
    with path.open("rb") as handle:
        content = handle.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise AppContributionError("Markdown artifact exceeds the maximum review byte budget.")
    body = content.decode("utf-8")
    normalized = path.relative_to(root).as_posix()
    return (
        {
            "artifact_ref": normalized,
            "path": str(path),
            "sha256": sha256_bytes(content),
            "bytes": len(content),
            "headings": extract_markdown_headings(body),
            "preview": body[:max_preview_chars],
            "preview_truncated": len(body) > max_preview_chars,
        },
        body,
    )


def build_markdown_review_read(
    workspace_root: Path,
    rel_path: str,
    *,
    feedback_dir: str | Path | None = None,
    baseline_rel_path: str | None = None,
    container_dir: Path | None = None,
    max_bytes: int = DEFAULT_MAX_MARKDOWN_BYTES,
    max_preview_chars: int = DEFAULT_MAX_PREVIEW_CHARS,
) -> dict[str, Any]:
    """Build a host-neutral `ready` read envelope for a Markdown review target."""

    scope_dir = container_dir or workspace_root
    current, body = inspect_markdown_file(
        workspace_root,
        scope_dir,
        rel_path,
        max_bytes=max_bytes,
        max_preview_chars=max_preview_chars,
    )
    baseline, baseline_body = (
        inspect_markdown_file(
            workspace_root,
            scope_dir,
            baseline_rel_path,
            max_bytes=max_bytes,
            max_preview_chars=max_preview_chars,
        )
        if baseline_rel_path
        else (None, None)
    )
    sources = [current, *([baseline] if baseline else [])]
    revision = sha256_bytes(
        json.dumps([(item["artifact_ref"], item["sha256"]) for item in sources], separators=(",", ":")).encode("utf-8")
    )
    feedback = (
        list_feedback_notes(feedback_dir, revision=revision, root=workspace_root)
        if feedback_dir is not None
        else []
    )
    diff = (
        "".join(
            difflib.unified_diff(
                baseline_body.splitlines(keepends=True),
                body.splitlines(keepends=True),
                fromfile=baseline["artifact_ref"],
                tofile=current["artifact_ref"],
            )
        )
        if baseline and baseline_body is not None
        else None
    )
    item: dict[str, Any] = {
        "id": current["artifact_ref"],
        "title": Path(current["artifact_ref"]).name,
        "summary": f"{len(current['headings'])} headings",
        "status": "review_required",
        "revision": revision,
        "headings": current["headings"],
        "current": current,
        "baseline": baseline,
        "preview": {
            "target": current["artifact_ref"],
            "after": current["preview"],
            **({"before": baseline["preview"]} if baseline else {}),
        },
        "artifacts": [
            {
                "id": src["artifact_ref"],
                "title": Path(src["artifact_ref"]).name,
                "artifact_ref": src["path"],
                "sha256": src["sha256"],
                "status": "available",
            }
            for src in sources
        ],
        "source_refs": [src["artifact_ref"] for src in sources],
        "feedback": feedback,
    }
    if diff is not None:
        item["comparison"] = {
            "format": "unified_diff",
            "text": diff[:max_preview_chars],
            "truncated": len(diff) > max_preview_chars,
        }
    return ready_envelope({"items": [item], "revision": revision, "feedback": feedback})


def build_json_artifact_review_read(
    workspace_root: Path,
    rel_path: str,
    *,
    feedback_dir: str | Path | None = None,
    container_dir: Path | None = None,
) -> dict[str, Any]:
    """Build a host-neutral `ready` read envelope for a structured JSON artifact."""

    scope_dir = container_dir or workspace_root
    path = read_contained_file(workspace_root, scope_dir, rel_path)
    raw = path.read_bytes()
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict):
        raise AppContributionError("Referenced JSON artifact must be a JSON object.")
    revision = sha256_bytes(raw)
    feedback = (
        list_feedback_notes(feedback_dir, revision=revision, root=workspace_root)
        if feedback_dir is not None
        else []
    )
    normalized = path.relative_to(workspace_root).as_posix()
    item = {
        **payload,
        "id": str(payload.get("id") or normalized),
        "title": str(payload.get("title") or payload.get("name") or Path(normalized).name),
        "artifact_ref": normalized,
        "path": str(path),
        "artifact_revision": revision,
        "feedback": feedback,
    }
    return ready_envelope({"items": [item], "payload": payload, "revision": revision, "feedback": feedback})


def record_review_feedback_action(
    workspace_root: Path,
    request_input: Mapping[str, Any],
    *,
    feedback_dir: str | Path,
    schema_id: str = "opl_review_feedback.v1",
    identity_keys: Iterable[str] = (),
    extra_fields: Mapping[str, Any] | None = None,
    readback_ref: str | None = None,
    readback_input: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist one validated review note idempotently and return a standard execution receipt."""

    note_text = request_input.get("note")
    if not isinstance(note_text, str) or not note_text.strip() or len(note_text) > 20000:
        raise AppContributionError("Review note must be between 1 and 20000 characters.")
    request_id = request_input.get("request_id")
    record_payload = {
        "schema": schema_id,
        **{key: request_input.get(key, "") for key in identity_keys},
        "request_id": request_id,
        "note": note_text,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        **dict(extra_fields or {}),
    }
    target, saved, _created = record_feedback_note(
        feedback_dir,
        request_id=request_id,
        payload=record_payload,
        identity_keys=tuple(identity_keys),
        root=workspace_root,
    )
    result_body: dict[str, Any] = {
        "status": "recorded",
        "artifact_ref": str(target),
        "note": saved,
    }
    if readback_ref:
        result_body["readback"] = {
            "data_ref": readback_ref,
            "input": dict(readback_input or {}),
        }
    return ready_envelope(result=result_body)


def dispatch_contribution(
    request: Mapping[str, Any],
    *,
    reads: Mapping[str, Callable[[Mapping[str, Any]], dict[str, Any]]],
    actions: Mapping[str, Callable[[Mapping[str, Any]], dict[str, Any]]] = (),
) -> dict[str, Any]:
    """Dispatch either a full `opl-package-app-contribution-request.v1` envelope or subcommand input."""

    operation = request.get("operation")
    ref = request.get("ref")
    payload = request.get("input") if isinstance(request.get("input"), Mapping) else request
    if operation == "read" and isinstance(ref, str) and ref in reads:
        return reads[ref](payload)
    if operation == "execute" and isinstance(ref, str) and ref in actions:
        return actions[ref](payload)
    raise AppContributionError(f"Unsupported contribution target: operation={operation!r}, ref={ref!r}")
