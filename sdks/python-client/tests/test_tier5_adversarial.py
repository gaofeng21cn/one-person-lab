"""Tier-5 white-box adversarial tests for `opl_client` (G-PY-01, G-PY-02, BUG-P1-07)."""

from __future__ import annotations

import io
import json
import os
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from opl_client import OplClient, OplRpcError, read_stdin_json


class AdversarialUnixServer:
    def __init__(self, tmpdir: Path) -> None:
        self.sock_path = tmpdir / "opld.sock"
        self.session_path = tmpdir / "opld.session.json"
        self.token = "b" * 64
        self.srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            self.srv.bind(str(self.sock_path))
            self.srv.listen(4)
        except Exception:
            self.srv.close()
            raise
        self.session_path.write_text(
            json.dumps({"socket_path": str(self.sock_path), "token": self.token}),
            encoding="utf-8",
        )
        self._stop = False
        self.clients: list[socket.socket] = []
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self) -> None:
        self.srv.settimeout(0.05)
        while not self._stop:
            try:
                conn, _ = self.srv.accept()
            except TimeoutError:
                continue
            except OSError:
                break
            self.clients.append(conn)
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn: socket.socket) -> None:
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
                line, buf = buf.split(b"\n", 1)
                if not line.strip():
                    continue
                req = json.loads(line.decode("utf-8"))
                method = req.get("method")
                req_id = req.get("id")
                if method == "daemon.handshake":
                    conn.sendall(
                        (json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"session_id": "s-t5", "api_version": "2.0"}}) + "\n").encode("utf-8")
                    )
                elif method == "test.chunked_utf8":
                    # >128KB multi-byte UTF-8 response split across 64KB boundaries in 7-byte chunks
                    payload = {"jsonrpc": "2.0", "id": req_id, "result": {"text": "中文测试🚀" * 16000}}
                    raw = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
                    assert len(raw) > 128 * 1024
                    for idx in range(0, len(raw), 4093):
                        conn.sendall(raw[idx : idx + 4093])
                        time.sleep(0.001)
                elif method == "test.id_null_notif":
                    notif = json.dumps({"jsonrpc": "2.0", "method": "event.runway.changed", "params": {"k": 1}, "id": None}) + "\n"
                    reply = json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"ok": True}}) + "\n"
                    conn.sendall((notif + reply).encode("utf-8"))
                elif method == "test.slow_error":
                    time.sleep(0.15)
                    try:
                        conn.sendall(
                            (json.dumps({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": "late boom"}}) + "\n").encode("utf-8")
                        )
                    except OSError:
                        pass
                else:
                    conn.sendall((json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"ok": True}}) + "\n").encode("utf-8"))

    def close(self) -> None:
        self._stop = True
        for c in self.clients:
            try:
                c.close()
            except OSError:
                pass
        self.srv.close()


class Tier5AdversarialTests(unittest.TestCase):
    def setUp(self) -> None:
        probe = str(Path(tempfile.gettempdir()) / "opl-py-t5-xxxxxxxx/run/opld.sock")
        tmp_base = "/tmp" if os.name != "nt" and len(probe.encode("utf-8")) >= 96 and Path("/tmp").is_dir() else None
        self.tmp = tempfile.TemporaryDirectory(prefix="opl-py-t5-", dir=tmp_base)
        try:
            self.srv = AdversarialUnixServer(Path(self.tmp.name))
        except Exception:
            self.tmp.cleanup()
            raise

    def tearDown(self) -> None:
        self.srv.close()
        self.tmp.cleanup()

    def test_chunked_utf8_id_null_notif_late_error_and_reconnect_fd(self) -> None:
        cli = OplClient(session_file=self.srv.session_path, timeout=0.05)
        cli.connect()
        try:
            # Calling connect() twice closes prior socket FD (zero FD leak)
            first_sock = cli._transport._sock  # type: ignore[union-attr]
            cli.connect()
            self.assertEqual(first_sock.fileno(), -1)
            self.assertIsNot(cli._transport._sock, first_sock)  # type: ignore[union-attr]

            # "id": null notification interleaved inside call()
            cli._timeout = 2.0
            cli._transport._sock.settimeout(2.0)  # type: ignore[union-attr]
            res = cli.call("test.id_null_notif", {})
            self.assertEqual(res["ok"], True)
            evs = cli.drain_events()
            self.assertEqual(len(evs), 1)
            self.assertEqual(evs[0]["method"], "event.runway.changed")

            # >128KB multi-byte UTF-8 split across 64KB recv boundaries
            big = cli.call("test.chunked_utf8", {})
            self.assertEqual(len(big["text"]), len("中文测试🚀") * 16000)

            # Timed-out call followed by late error reply does NOT raise inside drain_events()
            cli._transport._sock.settimeout(0.05)  # type: ignore[union-attr]
            with self.assertRaises(TimeoutError):
                cli.call("test.slow_error", {})
            time.sleep(0.2)
            drained = cli.drain_events()
            self.assertIsInstance(drained, list)
        finally:
            cli.close()

    def test_helpers_read_stdin_json_and_propose_writeback(self) -> None:
        with mock.patch("sys.stdin", io.StringIO("")):
            self.assertEqual(read_stdin_json(), {})
        with mock.patch("sys.stdin", io.StringIO('{"a": 1}')):
            self.assertEqual(read_stdin_json(), {"a": 1})
        with mock.patch("sys.stdin", io.StringIO("[1, 2]")):
            with self.assertRaises(ValueError):
                read_stdin_json()

        with OplClient(session_file=self.srv.session_path) as cli:
            res = cli.propose_writeback("src-1", "a.md", "hi", accepted_revision="1")  # type: ignore[arg-type]
            self.assertEqual(res["ok"], True)


if __name__ == "__main__":
    unittest.main()
