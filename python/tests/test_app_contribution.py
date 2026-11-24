from __future__ import annotations

import json
from pathlib import Path

from opl_framework.app_contribution import (
    build_json_artifact_review_read,
    build_markdown_review_read,
    dispatch_contribution,
    record_review_feedback_action,
    select_workspace_project,
    sha256_bytes,
    verify_work_item_identity,
)


def test_markdown_and_json_review_reads_with_feedback(tmp_path: Path) -> None:
    doc = tmp_path / "draft.md"
    doc.write_text("# Chapter One\n\n```python\n# not a heading\n```\n\n## Section\nBody\n", encoding="utf-8")
    artifact = tmp_path / "packet.json"
    artifact.write_text(json.dumps({"id": "pkt-1", "title": "Decision Packet", "status": "pending"}), encoding="utf-8")
    feedback_dir = tmp_path / "feedback"

    md_read = build_markdown_review_read(tmp_path, "draft.md", feedback_dir=feedback_dir)
    assert md_read["state"] == "ready"
    item = md_read["data"]["items"][0]
    assert [h["title"] for h in item["headings"]] == ["Chapter One", "Section"]

    action = record_review_feedback_action(
        tmp_path,
        {"request_id": "note-1", "note": "Clarify section 1", "revision": item["revision"]},
        feedback_dir=feedback_dir,
        identity_keys=("revision", "request_id", "note"),
    )
    assert action["state"] == "ready"
    assert action["result"]["status"] == "recorded"

    json_read = build_json_artifact_review_read(tmp_path, "packet.json", feedback_dir=feedback_dir)
    assert json_read["state"] == "ready"
    assert json_read["data"]["items"][0]["title"] == "Decision Packet"
    assert json_read["data"]["items"][0]["artifact_revision"] == sha256_bytes(artifact.read_bytes())
    assert len(json_read["data"]["feedback"]) == 1


def test_select_workspace_project_and_dispatch(tmp_path: Path) -> None:
    proj = tmp_path / "proj-a"
    proj.mkdir()
    (tmp_path / "workspace_index.json").write_text(
        json.dumps({"projects": [{"project_id": "proj-a", "title": "Project A", "project_root": "proj-a"}]}),
        encoding="utf-8",
    )
    identity, work_item_id = verify_work_item_identity(
        {
            "work_item_identity": {
                "identity_state": "resolved",
                "agent_id": "demo",
                "domain_id": "demo-domain",
                "domain_work_item_id": "proj-a",
                "workspace_path": str(tmp_path),
                "work_item_root": str(proj),
            }
        },
        expected_agent_ids=("demo",),
    )
    assert work_item_id == "proj-a"
    entry, proj_root, choice = select_workspace_project(tmp_path, identity=identity)
    assert choice is None
    assert entry is not None and entry["project_id"] == "proj-a"
    assert proj_root == proj.resolve()

    dispatched = dispatch_contribution(
        {"operation": "read", "ref": "demo#ping", "input": {"k": "v"}},
        reads={"demo#ping": lambda inp: {"state": "ready", "data": inp}},
    )
    assert dispatched == {"state": "ready", "data": {"k": "v"}}
