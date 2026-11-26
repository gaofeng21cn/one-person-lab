"""Deterministic helpers for OPL Runway compute handoff notes.

The helpers only normalize provider/env refs, classify failure text, and lint
authority wording. They do not manage credentials, endpoints, jobs, or queues.
"""

from __future__ import annotations

import re
from typing import Iterable, Mapping


_SPACE_RE = re.compile(r"\s+")
_FAILURE_KEYWORDS = {
    "credential": ("permission denied", "unauthorized", "forbidden", "token", "key"),
    "network": ("dns", "timeout", "connection refused", "proxy", "firewall"),
    "provider_capacity": ("quota", "capacity", "rate limit", "partition unavailable"),
    "submission_contract": ("malformed", "invalid endpoint", "missing artifact", "payload"),
    "execution": ("nonzero", "crashed", "oom", "dependency failure", "exit code"),
    "harvest": ("output path missing", "not retrievable", "receipt incomplete"),
    "environment": ("missing binary", "module not found", "bad working directory"),
}
_FORBIDDEN_PHRASES = (
    "provider ready",
    "live ready",
    "runtime ready",
    "endpoint registered",
    "execution accepted",
    "readiness",
)


def normalize_token(value: object) -> str:
    return _SPACE_RE.sub(" ", str(value).strip()).rstrip("/").lower()


def normalize_env_keys(env: Mapping[str, object]) -> tuple[str, ...]:
    return tuple(sorted(key.strip().upper() for key in env if key and key.strip()))


def normalize_provider_route(provider: str, endpoint: str = "") -> dict[str, str]:
    return {
        "provider": normalize_token(provider),
        "endpoint": normalize_token(endpoint),
    }


def classify_failure(text: str) -> str:
    haystack = normalize_token(text)
    for failure_class, keywords in _FAILURE_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return failure_class
    return "authority_gap"


def handoff_skeleton(goal: str, route: Mapping[str, str], evidence_refs: Iterable[object]) -> dict[str, object]:
    refs = tuple(sorted({normalize_token(ref) for ref in evidence_refs if normalize_token(ref)}))
    return {
        "goal": _SPACE_RE.sub(" ", goal.strip()),
        "requested_compute_route": dict(route),
        "observed_evidence_refs": refs,
        "failure_class": "",
        "next_runway_or_connect_command": "",
        "forbidden_claims": _FORBIDDEN_PHRASES,
    }


def lint_forbidden_claims(text: str) -> tuple[str, ...]:
    haystack = normalize_token(text)
    return tuple(phrase for phrase in _FORBIDDEN_PHRASES if phrase in haystack)


def _self_check() -> None:
    assert normalize_env_keys({"path": "x", " OPL_HOME ": "y"}) == ("OPL_HOME", "PATH")
    assert normalize_provider_route(" Modal ", "HTTPS://EXAMPLE.test/") == {
        "provider": "modal",
        "endpoint": "https://example.test",
    }
    assert classify_failure("SSH permission denied for key") == "credential"
    assert classify_failure("GPU quota exhausted") == "provider_capacity"
    skeleton = handoff_skeleton(" run job ", {"provider": "local"}, [" ref/2 ", "ref/2/"])
    assert skeleton["observed_evidence_refs"] == ("ref/2",)
    assert "provider ready" in lint_forbidden_claims("Provider ready is not proven.")


if __name__ == "__main__":
    _self_check()
