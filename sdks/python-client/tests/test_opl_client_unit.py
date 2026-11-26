"""Pure-stdlib unit tests for `opl_client`."""

from __future__ import annotations

import json
import os
import socket
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from opl_client import (
    OplClient,
    OplRpcError,
    ready_envelope,
    resolve_session_path,
    resolve_state_dir,
    sha256_bytes,
    sha256_file,
    unavailable_envelope,
)


class StatePathTests(unittest.TestCase):
    def test_state_dir_precedence(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OPL_STATE_DIR": "/tmp/custom-opl-state", "OPL_DATA_DIR": "/tmp/data"},
            clear=False,
        ):
            self.assertEqual(resolve_state_dir(), Path("/tmp/custom-opl-state").resolve())
            self.assertEqual(
                resolve_session_path(),
                Path("/tmp/custom-opl-state").resolve() / "run" / "opld.session.json",
            )

        with mock.patch.dict(os.environ, {"OPL_STATE_DIR": "", "OPL_DATA_DIR": "/tmp/opl-data"}, clear=False):
            self.assertEqual(resolve_state_dir(), Path("/tmp/opl-data").resolve() / "opl" / "state")

        with (
            mock.patch.dict(os.environ, {"OPL_STATE_DIR": "", "OPL_DATA_DIR": "", "XDG_STATE_HOME": "/tmp/xdg"}, clear=False),
            mock.patch("opl_client.transport.sys.platform", "linux"),
        ):
            self.assertEqual(resolve_state_dir(), Path("/tmp/xdg/opl"))

        with (
            mock.patch.dict(os.environ, {"OPL_STATE_DIR": "", "OPL_DATA_DIR": "", "LOCALAPPDATA": "C:\\AppData"}, clear=False),
            mock.patch("opl_client.transport.sys.platform", "win32"),
        ):
            self.assertEqual(str(resolve_state_dir()), "C:\\AppData/OPL/state")

    def test_win32_named_pipe_ctypes_types(self) -> None:
        import ctypes
        from ctypes import wintypes
        from opl_client.transport import WindowsNamedPipeTransport

        fake_kernel32 = mock.MagicMock()
        invalid_handle = ctypes.c_void_p(-1).value
        fake_kernel32.CreateFileW.return_value = invalid_handle

        with (
            mock.patch("opl_client.transport.sys.platform", "win32"),
            mock.patch.object(ctypes, "WinDLL", create=True, return_value=fake_kernel32),
            mock.patch.object(ctypes, "WinError", create=True, side_effect=OSError("bad pipe")),
            mock.patch.object(ctypes, "get_last_error", create=True, return_value=2),
        ):
            with self.assertRaises(OSError):
                WindowsNamedPipeTransport("\\\\.\\pipe\\opld-test")

        self.assertIs(fake_kernel32.CreateFileW.restype, wintypes.HANDLE)
        self.assertIs(fake_kernel32.WriteFile.restype, wintypes.BOOL)
        self.assertIs(fake_kernel32.ReadFile.restype, wintypes.BOOL)
        self.assertIs(fake_kernel32.PeekNamedPipe.restype, wintypes.BOOL)
        self.assertIs(fake_kernel32.CloseHandle.restype, wintypes.BOOL)
        self.assertEqual(fake_kernel32.CreateFileW.argtypes[0], wintypes.LPCWSTR)


class MockDaemonServer:
    def __init__(self, tmpdir: Path) -> None:
        self.tmpdir = tmpdir
        self.sock_path = tmpdir / "opld.sock"
        self.session_path = tmpdir / "opld.session.json"
        self.token = "a" * 64
        self.server_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            self.server_sock.bind(str(self.sock_path))
            self.server_sock.listen(4)
        except Exception:
            self.server_sock.close()
            raise
        self.session_path.write_text(
            json.dumps({"socket_path": str(self.sock_path), "token": self.token}),
            encoding="utf-8",
        )
        self.clients: list[socket.socket] = []
        self.received: list[dict] = []
        self._stop = False
        self._thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._thread.start()

    def _accept_loop(self) -> None:
        self.server_sock.settimeout(0.1)
        while not self._stop:
            try:
                conn, _ = self.server_sock.accept()
            except TimeoutError:
                continue
            except OSError:
                break
            self.clients.append(conn)
            threading.Thread(target=self._serve_client, args=(conn,), daemon=True).start()

    def _serve_client(self, conn: socket.socket) -> None:
        buf = b""
        while not self._stop:
            try:
                chunk = conn.recv(4096)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                raw_line, buf = buf.split(b"\n", 1)
                if not raw_line.strip():
                    continue
                req = json.loads(raw_line.decode("utf-8"))
                self.received.append(req)
                method = req.get("method")
                req_id = req.get("id")
                params = req.get("params") or {}

                if method == "daemon.handshake":
                    if params.get("token") != self.token:
                        conn.sendall(
                            (json.dumps({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32001, "message": "UNAUTHORIZED"}}) + "\n").encode("utf-8")
                        )
                        conn.close()
                        return
                    conn.sendall(
                        (
                            json.dumps(
                                {
                                    "jsonrpc": "2.0",
                                    "id": req_id,
                                    "result": {
                                        "ok": True,
                                        "session_id": "sess-unit-1",
                                        "api_version": params.get("api_version", "2.0"),
                                        "client_kind": params.get("client_kind"),
                                    },
                                }
                            )
                            + "\n"
                        ).encode("utf-8")
                    )
                elif method == "ledger.append":
                    conn.sendall(
                        (
                            json.dumps(
                                {
                                    "jsonrpc": "2.0",
                                    "method": "event.ledger.appended",
                                    "params": {"task_id": params.get("task_id"), "entry_id": "le-1"},
                                }
                            )
                            + "\n"
                        ).encode("utf-8")
                    )
                    conn.sendall(
                        (json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"entry_id": "le-1"}}) + "\n").encode("utf-8")
                    )
                elif method == "trigger.parse_error":
                    conn.sendall(
                        (json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}) + "\n").encode("utf-8")
                    )
                elif method == "connect.approveRequest":
                    conn.sendall(
                        (json.dumps({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32003, "message": "TRUSTED_HOST_REQUIRED"}}) + "\n").encode("utf-8")
                    )
                else:
                    conn.sendall((json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"echo_method": method, "params": params}}) + "\n").encode("utf-8"))

    def push_idle_event(self, method: str, params: dict) -> None:
        frame = (json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n").encode("utf-8")
        for c in self.clients:
            c.sendall(frame)

    def close(self) -> None:
        self._stop = True
        for c in self.clients:
            try:
                c.close()
            except OSError:
                pass
        self.server_sock.close()


class ClientLifecycleAndIpcTests(unittest.TestCase):
    def setUp(self) -> None:
        probe = str(Path(tempfile.gettempdir()) / "opl-py-unit-xxxxxxxx/run/opld.sock")
        tmp_base = "/tmp" if os.name != "nt" and len(probe.encode("utf-8")) >= 96 and Path("/tmp").is_dir() else None
        self.tmp = tempfile.TemporaryDirectory(prefix="opl-py-unit-", dir=tmp_base)
        self.tmpdir = Path(self.tmp.name)
        try:
            self.srv = MockDaemonServer(self.tmpdir)
        except Exception:
            self.tmp.cleanup()
            raise

    def tearDown(self) -> None:
        self.srv.close()
        self.tmp.cleanup()

    def test_unconnected_missing_and_closed_errors(self) -> None:
        c = OplClient(session_file=self.srv.session_path)
        with self.assertRaises(RuntimeError):
            c.call("daemon.health", {})

        missing = OplClient(session_file=self.tmpdir / "nope.json")
        with self.assertRaises(FileNotFoundError):
            missing.connect()

        c.connect()
        c.close()
        c.close()  # idempotent
        with self.assertRaises(RuntimeError):
            c.call("daemon.health", {})

    def test_handshake_invalid_token_and_rpc_errors(self) -> None:
        bad_session = self.tmpdir / "bad.session.json"
        bad_session.write_text(json.dumps({"socket_path": str(self.srv.sock_path), "token": "0" * 64}), encoding="utf-8")
        c = OplClient(session_file=bad_session)
        with self.assertRaises(OplRpcError) as ctx:
            c.connect()
        self.assertEqual(ctx.exception.code, -32001)
        self.assertEqual(ctx.exception.rpc_message, "UNAUTHORIZED")

        with OplClient(session_file=self.srv.session_path, client_kind="sdk_python") as cli:
            self.assertEqual(cli.server_info["api_version"], "2.0")
            with self.assertRaises(OplRpcError) as err_ctx:
                cli.call("connect.approveRequest", {"request_id": "req-1"})
            self.assertEqual(err_ctx.exception.code, -32003)

            with self.assertRaises(OplRpcError) as parse_ctx:
                cli.call("trigger.parse_error", {})
            self.assertEqual(parse_ctx.exception.code, -32700)

    def test_interleaved_and_idle_server_push_events_and_helpers(self) -> None:
        with OplClient(session_file=self.srv.session_path, client_kind="sdk_python") as cli:
            res = cli.append_ledger("task-1", "artifact_ref", "mas", {"path": "a.md", "sha256": "f" * 64})
            self.assertEqual(res["entry_id"], "le-1")

            # Push an idle-time notification after RPC returns (T3-18 pattern)
            self.srv.push_idle_event("event.runway.changed", {"task_id": "task-1", "status": "cancelled"})
            import time

            time.sleep(0.05)
            runway_evs = cli.drain_events(method_prefix="event.runway.")
            self.assertEqual(len(runway_evs), 1)
            self.assertEqual(runway_evs[0]["params"]["status"], "cancelled")

            ledger_evs = cli.drain_events()
            self.assertEqual(len(ledger_evs), 1)
            self.assertEqual(ledger_evs[0]["method"], "event.ledger.appended")
            self.assertEqual(cli.drain_events(), [])

            snap = cli.knowledge_snapshot("ws-1", "sr-1")
            self.assertEqual(snap["echo_method"], "workspace.knowledge.snapshot")
            inv = cli.invoke_connection("oplcbt1.abc", "conn-1", "mailbox.read", {"q": "hi"})
            self.assertEqual(inv["echo_method"], "connect.invoke")
            self.assertEqual(cli.daemon_health()["echo_method"], "daemon.health")

    def test_helpers_module(self) -> None:
        self.assertEqual(sha256_bytes(b"abc"), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        f = self.tmpdir / "sample.txt"
        f.write_bytes(b"abc")
        self.assertEqual(sha256_file(f), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        self.assertEqual(ready_envelope(package_id="mas", data={"x": 1})["status"], "ready")
        self.assertEqual(unavailable_envelope(package_id="mas", reason="off")["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
