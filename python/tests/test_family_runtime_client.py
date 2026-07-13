from __future__ import annotations

from typing import Any

import pytest

from opl_framework import query_family_runtime_readback, submit_stage_attempt_request


def test_submit_stage_attempt_request_builds_temporal_command_and_returns_canonical_surface() -> None:
    seen: dict[str, Any] = {}

    def runner(command: list[str], *, timeout_seconds: float):
        seen.update(command=command, timeout_seconds=timeout_seconds)
        return {
            "version": "g2",
            "family_runtime_stage_attempt": {
                "attempt": {
                    "stage_attempt_id": "attempt:test",
                    "domain_id": "mas",
                    "stage_id": "analysis",
                    "provider_kind": "temporal",
                }
            },
        }

    surface = submit_stage_attempt_request(
        {
            "domain_id": "mas",
            "stage_id": "analysis",
            "action_id": "paper-mission",
            "workspace_locator": {"workspace_root": "/tmp/mas"},
            "source_fingerprint": "sha256:test",
            "start": True,
        },
        opl_bin=["/opt/opl/bin/opl"],
        runner=runner,
    )

    assert surface["attempt"]["stage_attempt_id"] == "attempt:test"
    assert seen["timeout_seconds"] == 120
    assert seen["command"][:4] == ["/opt/opl/bin/opl", "family-runtime", "attempt", "create"]
    assert "--provider" in seen["command"]
    assert seen["command"][-2:] == ["--start", "--json"]


def test_query_family_runtime_readback_supports_query_and_filtered_list() -> None:
    commands: list[list[str]] = []

    def runner(command: list[str], *, timeout_seconds: float):
        commands.append(command)
        if "query" in command:
            return {
                "family_runtime_stage_attempt_query": {
                    "stage_attempt_query": {"attempt": {"stage_attempt_id": "attempt:test"}}
                }
            }
        return {"family_runtime_stage_attempts": {"attempts": [], "summary": {"total": 0}}}

    query_surface = query_family_runtime_readback(
        {"operation": "query", "stage_attempt_id": "attempt:test"},
        opl_bin="opl-custom --profile test",
        runner=runner,
    )
    list_surface = query_family_runtime_readback(
        {"operation": "list", "domain_id": "mas", "study_id": "DM002", "status": "running"},
        opl_bin="opl-custom",
        runner=runner,
    )

    assert query_surface is not None
    assert query_surface["stage_attempt_query"]["attempt"]["stage_attempt_id"] == "attempt:test"
    assert list_surface == {"attempts": [], "summary": {"total": 0}}
    assert commands[0][:3] == ["opl-custom", "--profile", "test"]
    assert commands[1][-7:] == ["--domain", "mas", "--status", "running", "--study", "DM002", "--json"]


def test_family_runtime_client_fails_closed_for_invalid_requests_and_envelopes() -> None:
    with pytest.raises(ValueError, match="request.start must be true"):
        submit_stage_attempt_request(
            {"domain_id": "mas", "stage_id": "analysis", "workspace_locator": {"workspace_root": "/tmp"}},
            opl_bin="opl",
            runner=lambda *_args, **_kwargs: {},
        )

    with pytest.raises(RuntimeError, match="missing canonical family_runtime_stage_attempts"):
        query_family_runtime_readback(
            {"operation": "list", "domain_id": "mas"},
            opl_bin="opl",
            runner=lambda *_args, **_kwargs: {"wrong": {}},
        )

    assert query_family_runtime_readback(
        {"operation": "list", "domain_id": "mas"},
        opl_bin="opl",
        runner=lambda *_args, **_kwargs: None,
    ) is None
