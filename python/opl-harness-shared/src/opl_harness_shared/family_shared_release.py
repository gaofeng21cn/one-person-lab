from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any


SHARED_OWNER_RELEASE_CONTRACT_PATH = Path("contracts/family-release/shared-owner-release.json")

_PYTHON_DEPENDENCY_PATTERN = re.compile(
    r"opl-harness-shared @ git\+https://github\.com/gaofeng21cn/one-person-lab\.git@([0-9a-f]{40})#subdirectory=python/opl-harness-shared"
)
_PYTHON_LOCK_PATTERN = re.compile(
    r"https://github\.com/gaofeng21cn/one-person-lab\.git\?subdirectory=python%2Fopl-harness-shared&rev=([0-9a-f]{40})(#[0-9a-f]{40})?"
)
_JS_GIT_PATTERN = re.compile(
    r"git\+https://github\.com/gaofeng21cn/one-person-lab\.git#([0-9a-f]{40})"
)


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def resolve_canonical_repo_root(*, repo_root: Path | str) -> Path:
    resolved_repo_root = Path(repo_root).expanduser().resolve()
    try:
        git_common_dir = subprocess.check_output(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=resolved_repo_root,
            text=True,
        ).strip()
    except Exception:
        return resolved_repo_root
    return Path(git_common_dir).resolve().parent


def resolve_default_family_root(*, repo_root: Path | str) -> Path:
    return resolve_canonical_repo_root(repo_root=repo_root).parent


def resolve_owner_repo_root(
    *,
    repo_root: Path | str,
    owner_repo_root: Path | str | None = None,
    owner_repo: str = "one-person-lab",
) -> Path:
    if owner_repo_root is not None:
        return Path(owner_repo_root).expanduser().resolve()
    return resolve_default_family_root(repo_root=repo_root) / owner_repo


def load_shared_owner_release_contract(
    *,
    repo_root: Path | str | None = None,
    owner_repo_root: Path | str | None = None,
    owner_repo: str = "one-person-lab",
) -> dict[str, Any]:
    if repo_root is None and owner_repo_root is None:
      raise ValueError("repo_root or owner_repo_root is required")

    resolved_owner_repo_root = resolve_owner_repo_root(
        repo_root=repo_root or owner_repo_root or Path.cwd(),
        owner_repo_root=owner_repo_root,
        owner_repo=owner_repo,
    )
    contract_path = resolved_owner_repo_root / SHARED_OWNER_RELEASE_CONTRACT_PATH
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    owner_commit = str(contract.get("owner_commit", ""))
    if not re.fullmatch(r"[0-9a-f]{40}", owner_commit):
        raise ValueError(f"shared owner release contract has invalid owner_commit: {owner_commit}")
    consumers = contract.get("consumers")
    if not isinstance(consumers, list) or not consumers:
        raise ValueError("shared owner release contract must declare at least one consumer")
    for consumer in consumers:
        if not isinstance(consumer, dict):
            raise ValueError("shared owner release contract consumer must be an object")
        verify_command = str(consumer.get("verify_command", "")).strip()
        if not verify_command:
            raise ValueError(
                f"shared owner release contract consumer is missing verify_command: {consumer.get('repo_id')}"
            )
    return contract


def extract_tracked_pins(text: str, kind: str) -> list[str]:
    if kind == "python_dependency":
        return _unique(_PYTHON_DEPENDENCY_PATTERN.findall(text))
    if kind == "python_lock":
        matches = _PYTHON_LOCK_PATTERN.findall(text)
        pins: list[str] = []
        for match in matches:
            pins.append(match[0])
            if match[1]:
                pins.append(match[1][1:])
        return _unique(pins)
    if kind in {"js_dependency", "js_lock"}:
        return _unique(_JS_GIT_PATTERN.findall(text))
    raise ValueError(f"unsupported shared pin kind: {kind}")


def inspect_family_shared_consumer_alignment(
    *,
    contract: dict[str, Any],
    consumer_repo_id: str,
    repo_root: Path | str,
) -> dict[str, Any]:
    consumer = next(
        (entry for entry in contract.get("consumers", []) if entry.get("repo_id") == consumer_repo_id),
        None,
    )
    resolved_repo_root = Path(repo_root).expanduser().resolve()
    if consumer is None:
        return {
            "repo_id": consumer_repo_id,
            "repo_root": str(resolved_repo_root),
            "owner_commit": contract["owner_commit"],
            "verify_command": None,
            "status": "missing_consumer",
            "findings": [],
        }
    if not resolved_repo_root.exists():
        return {
            "repo_id": consumer_repo_id,
            "repo_root": str(resolved_repo_root),
            "owner_commit": contract["owner_commit"],
            "verify_command": consumer["verify_command"],
            "status": "missing_repo",
            "findings": [
                {
                    "file": None,
                    "kind": "repo",
                    "status": "missing_repo",
                    "pins": [],
                }
            ],
        }

    findings: list[dict[str, Any]] = []
    for target in consumer.get("targets", []):
        file_path = resolved_repo_root / target["file"]
        if not file_path.exists():
            findings.append(
                {
                    "file": target["file"],
                    "kind": target["kind"],
                    "status": "missing_file",
                    "pins": [],
                }
            )
            continue
        pins = extract_tracked_pins(file_path.read_text(encoding="utf-8"), target["kind"])
        status = "aligned"
        if not pins:
            status = "pin_not_found"
        elif any(pin != contract["owner_commit"] for pin in pins):
            status = "stale_pin"
        findings.append(
            {
                "file": target["file"],
                "kind": target["kind"],
                "status": status,
                "pins": pins,
            }
        )

    return {
        "repo_id": consumer_repo_id,
        "repo_root": str(resolved_repo_root),
        "owner_commit": contract["owner_commit"],
        "verify_command": consumer["verify_command"],
        "status": "aligned" if all(item["status"] == "aligned" for item in findings) else "stale",
        "findings": findings,
    }


def inspect_current_repo_family_shared_alignment(
    *,
    repo_root: Path | str,
    consumer_repo_id: str,
    owner_repo_root: Path | str | None = None,
    owner_repo: str = "one-person-lab",
) -> dict[str, Any]:
    contract = load_shared_owner_release_contract(
        repo_root=repo_root,
        owner_repo_root=owner_repo_root,
        owner_repo=owner_repo,
    )
    return inspect_family_shared_consumer_alignment(
        contract=contract,
        consumer_repo_id=consumer_repo_id,
        repo_root=repo_root,
    )
