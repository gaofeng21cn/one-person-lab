"""Persistent JSON-RPC 2.0 client and domain helpers for `opld`."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from .errors import OplRpcError
from .transport import NdjsonTransport, open_transport, resolve_session_path


def _strip_none(mapping: Mapping[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in mapping.items() if v is not None}


class OplClient:
    """Thin persistent JSON-RPC 2.0 client over `opld` Unix socket / Named Pipe."""

    def __init__(
        self,
        session_file: str | Path | None = None,
        client_kind: str = "sdk_python",
        timeout: float = 10.0,
        *,
        api_version: str = "2.0",
        state_dir: str | Path | None = None,
        consumer_package_id: str | None = None,
    ) -> None:
        self._session_path = resolve_session_path(session_file=session_file, state_dir=state_dir)
        self._client_kind = client_kind
        self._timeout = timeout
        self._api_version = api_version
        self._consumer_package_id = consumer_package_id
        self._transport: NdjsonTransport | None = None
        self._seq = 0
        self._buffered_events: list[dict[str, Any]] = []
        self.server_info: dict[str, Any] = {}

    def connect(self) -> "OplClient":
        session = json.loads(self._session_path.read_text(encoding="utf-8"))
        socket_path = session["socket_path"]
        token = session["token"]

        self._transport = open_transport(socket_path, timeout=self._timeout)
        try:
            handshake_params = _strip_none(
                {
                    "token": token,
                    "client_kind": self._client_kind,
                    "api_version": self._api_version,
                    "consumer_package_id": self._consumer_package_id,
                }
            )
            info = self.call("daemon.handshake", handshake_params)
            self.server_info = info if isinstance(info, dict) else {"result": info}
        except Exception:
            self.close()
            raise
        return self

    def close(self) -> None:
        if self._transport is not None:
            try:
                self._transport.close()
            finally:
                self._transport = None

    def __enter__(self) -> "OplClient":
        return self.connect()

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _handle_frame(self, msg: dict[str, Any], expected_id: int | None = None) -> tuple[bool, Any]:
        if "id" in msg:
            msg_id = msg["id"]
            if msg_id is None and msg.get("error") is not None:
                err = msg["error"]
                raise OplRpcError(err.get("code", -1), err.get("message", "Unknown"), err.get("data"))
            if expected_id is not None and msg_id != expected_id:
                raise RuntimeError(f"Mismatched RPC id: expected {expected_id}, got {msg_id}")
            if msg.get("error") is not None:
                err = msg["error"]
                raise OplRpcError(err.get("code", -1), err.get("message", "Unknown"), err.get("data"))
            return True, msg.get("result")
        self._buffered_events.append(msg)
        return False, None

    def call(self, method: str, params: Mapping[str, Any] | None = None) -> Any:
        if self._transport is None:
            raise RuntimeError("OplClient is not connected")
        self._seq += 1
        req_id = self._seq
        payload = (
            json.dumps(
                {"jsonrpc": "2.0", "id": req_id, "method": method, "params": dict(params or {})},
                separators=(",", ":"),
            )
            + "\n"
        )
        self._transport.send_line(payload)

        while True:
            line = self._transport.read_line().strip()
            if not line:
                continue
            msg = json.loads(line)
            is_reply, result = self._handle_frame(msg, expected_id=req_id)
            if is_reply:
                return result

    def drain_events(self, method_prefix: str | None = None) -> list[dict[str, Any]]:
        if self._transport is not None:
            for line in self._transport.poll_lines():
                stripped = line.strip()
                if not stripped:
                    continue
                msg = json.loads(stripped)
                self._handle_frame(msg, expected_id=None)

        if method_prefix is None:
            events = list(self._buffered_events)
            self._buffered_events.clear()
            return events

        matched: list[dict[str, Any]] = []
        remaining: list[dict[str, Any]] = []
        for ev in self._buffered_events:
            if str(ev.get("method", "")).startswith(method_prefix):
                matched.append(ev)
            else:
                remaining.append(ev)
        self._buffered_events = remaining
        return matched

    def subscribe_events(self, topics: list[str] | None = None) -> dict[str, Any]:
        params = {"topics": topics} if topics is not None else {}
        return self.call("daemon.events.subscribe", params)

    # --- Daemon helpers ---

    def daemon_health(self) -> dict[str, Any]:
        return self.call("daemon.health", {})

    def daemon_info(self) -> dict[str, Any]:
        return self.call("daemon.info", {})

    def daemon_doctor(self, include_first_run: bool = False) -> dict[str, Any]:
        return self.call("daemon.doctor", {"include_first_run": include_first_run})

    # --- Workspace helpers ---

    def workspace_list(self) -> dict[str, Any]:
        return self.call("workspace.list", {})

    def workspace_inspect(self, workspace_id: str) -> dict[str, Any]:
        return self.call("workspace.inspect", {"workspace_id": workspace_id})

    def knowledge_snapshot(
        self,
        workspace_id: str,
        stage_run_id: str,
        source_id: str | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "workspace.knowledge.snapshot",
            _strip_none({"workspace_id": workspace_id, "stage_run_id": stage_run_id, "source_id": source_id}),
        )

    def propose_writeback(
        self,
        source_id: str,
        target_path: str,
        content: str,
        workspace_id: str | None = None,
        accepted_revision: int | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "workspace.writeback.propose",
            _strip_none(
                {
                    "source_id": source_id,
                    "target_path": target_path,
                    "content": content,
                    "workspace_id": workspace_id,
                    "accepted_revision": accepted_revision,
                }
            ),
        )

    # --- Connect helpers ---

    def connect_list(self, provider_type: str | None = None, status: str | None = None) -> dict[str, Any]:
        return self.call("connect.list", _strip_none({"provider_type": provider_type, "status": status}))

    def request_access(
        self,
        consumer_package_id: str,
        connection_id: str,
        capability_ids: list[str],
        reason: str | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "connect.requestAccess",
            _strip_none(
                {
                    "consumer_package_id": consumer_package_id,
                    "connection_id": connection_id,
                    "capability_ids": capability_ids,
                    "reason": reason,
                }
            ),
        )

    def invoke_connection(
        self,
        consumer_bind_token: str,
        connection_id: str,
        capability_id: str,
        input_payload: Mapping[str, Any],
        consumer_package_id: str | None = None,
        audit_context: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "connect.invoke",
            _strip_none(
                {
                    "consumer_bind_token": consumer_bind_token,
                    "connection_id": connection_id,
                    "capability_id": capability_id,
                    "input": dict(input_payload),
                    "consumer_package_id": consumer_package_id,
                    "audit_context": dict(audit_context) if audit_context is not None else None,
                }
            ),
        )

    # --- Runway helpers ---

    def runway_task_create(
        self,
        workspace_id: str,
        agent_id: str,
        title: str,
        goal_prompt: str,
        *,
        auto_start: bool = False,
        stages: list[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "runway.task.create",
            _strip_none(
                {
                    "workspace_id": workspace_id,
                    "agent_id": agent_id,
                    "title": title,
                    "goal_prompt": goal_prompt,
                    "auto_start": auto_start,
                    "stages": [dict(s) for s in stages] if stages is not None else None,
                }
            ),
        )

    def runway_task_get(self, task_id: str) -> dict[str, Any]:
        return self.call("runway.task.get", {"task_id": task_id})

    def runway_task_list(
        self,
        workspace_id: str | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        return self.call("runway.task.list", _strip_none({"workspace_id": workspace_id, "status": status}))

    # --- Ledger helpers ---

    def append_ledger(
        self,
        task_id: str,
        entry_kind: str,
        owner_id: str,
        payload: Mapping[str, Any],
        stage_run_id: str | None = None,
        attempt_id: str | None = None,
        entry_id: str | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "ledger.append",
            _strip_none(
                {
                    "task_id": task_id,
                    "stage_run_id": stage_run_id,
                    "attempt_id": attempt_id,
                    "entry_id": entry_id,
                    "entry_kind": entry_kind,
                    "owner_id": owner_id,
                    "payload": dict(payload),
                }
            ),
        )

    def ledger_timeline(self, task_id: str, **filters: Any) -> Any:
        return self.call("ledger.timeline", _strip_none({"task_id": task_id, **filters}))

    def ledger_artifacts(self, task_id: str, stage_run_id: str | None = None) -> dict[str, Any]:
        return self.call("ledger.artifacts", _strip_none({"task_id": task_id, "stage_run_id": stage_run_id}))

    def ledger_receipts(self, task_id: str, stage_run_id: str | None = None) -> dict[str, Any]:
        return self.call("ledger.receipts", _strip_none({"task_id": task_id, "stage_run_id": stage_run_id}))

    def ledger_debts(self, task_id: str, unresolved_only: bool | None = None) -> dict[str, Any]:
        return self.call("ledger.debts", _strip_none({"task_id": task_id, "unresolved_only": unresolved_only}))

    def record_review(
        self,
        task_id: str,
        verdict: str,
        owner_id: str,
        summary: str | None = None,
        stage_run_id: str | None = None,
    ) -> dict[str, Any]:
        return self.call(
            "ledger.review.record",
            _strip_none(
                {
                    "task_id": task_id,
                    "verdict": verdict,
                    "owner_id": owner_id,
                    "summary": summary,
                    "stage_run_id": stage_run_id,
                }
            ),
        )

    def verify_ledger(self, task_id: str, check_file_hashes: bool = True) -> dict[str, Any]:
        return self.call("ledger.verify", {"task_id": task_id, "check_file_hashes": check_file_hashes})


def connect(
    session_file: str | Path | None = None,
    client_kind: str = "sdk_python",
    timeout: float = 10.0,
    *,
    api_version: str = "2.0",
    state_dir: str | Path | None = None,
    consumer_package_id: str | None = None,
) -> OplClient:
    """Create and connect an `OplClient` instance."""
    return OplClient(
        session_file=session_file,
        client_kind=client_kind,
        timeout=timeout,
        api_version=api_version,
        state_dir=state_dir,
        consumer_package_id=consumer_package_id,
    ).connect()
