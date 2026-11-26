"""Cross-platform NDJSON transport and state path discovery for `opld`."""

from __future__ import annotations

import os
import socket
import sys
from pathlib import Path
from typing import Protocol


def resolve_state_dir(
    state_dir: str | Path | None = None,
    data_dir: str | Path | None = None,
) -> Path:
    """Resolve the OPL state directory matching `packages/core/src/paths.ts`."""
    explicit = str(state_dir).strip() if state_dir is not None else ""
    if not explicit:
        explicit = os.environ.get("OPL_STATE_DIR", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()

    resolved_data = str(data_dir).strip() if data_dir is not None else ""
    if not resolved_data:
        resolved_data = os.environ.get("OPL_DATA_DIR", "").strip()
    if resolved_data:
        return Path(resolved_data).expanduser().resolve() / "opl" / "state"

    home = Path(os.environ.get("HOME", "").strip() or Path.home())
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "OPL" / "state"
    if sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        base = Path(local_app_data) if local_app_data else (home / "AppData" / "Local")
        return base / "OPL" / "state"
    xdg_state = os.environ.get("XDG_STATE_HOME", "").strip()
    base = Path(xdg_state) if xdg_state else (home / ".local" / "state")
    return base / "opl"


def resolve_session_path(
    session_file: str | Path | None = None,
    state_dir: str | Path | None = None,
    data_dir: str | Path | None = None,
) -> Path:
    """Resolve the path to `opld.session.json`."""
    if session_file is not None:
        return Path(session_file).expanduser()
    return resolve_state_dir(state_dir=state_dir, data_dir=data_dir) / "run" / "opld.session.json"


class NdjsonTransport(Protocol):
    """Minimal transport interface for NDJSON communication."""

    def send_line(self, text: str) -> None: ...
    def read_line(self) -> str: ...
    def poll_lines(self) -> list[str]: ...
    def close(self) -> None: ...


class UnixSocketTransport:
    """AF_UNIX stream socket transport with buffered non-blocking drain support."""

    def __init__(self, socket_path: str, timeout: float = 10.0) -> None:
        af_unix = getattr(socket, "AF_UNIX", None)
        if af_unix is None:
            raise OSError("AF_UNIX is not supported on this platform")
        sock = socket.socket(af_unix, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect(socket_path)
        except Exception:
            sock.close()
            raise
        self._sock: socket.socket | None = sock
        self._timeout = timeout
        self._rx_buf = bytearray()

    def send_line(self, text: str) -> None:
        if self._sock is None:
            raise RuntimeError("Transport is closed")
        self._sock.sendall(text.encode("utf-8"))

    def _pop_line(self) -> str | None:
        idx = self._rx_buf.find(b"\n")
        if idx == -1:
            return None
        raw = bytes(self._rx_buf[: idx + 1])
        del self._rx_buf[: idx + 1]
        return raw.decode("utf-8")

    def read_line(self) -> str:
        if self._sock is None:
            raise RuntimeError("Transport is closed")
        while True:
            line = self._pop_line()
            if line is not None:
                return line
            chunk = self._sock.recv(65536)
            if not chunk:
                if self._rx_buf:
                    tail = bytes(self._rx_buf).decode("utf-8")
                    self._rx_buf.clear()
                    return tail
                raise ConnectionError("opld closed connection unexpectedly")
            self._rx_buf.extend(chunk)

    def poll_lines(self) -> list[str]:
        if self._sock is None:
            return []
        self._sock.settimeout(0.0)
        try:
            while True:
                try:
                    chunk = self._sock.recv(65536)
                except (BlockingIOError, TimeoutError):
                    break
                if not chunk:
                    break
                self._rx_buf.extend(chunk)
        finally:
            if self._sock is not None:
                self._sock.settimeout(self._timeout)

        lines: list[str] = []
        while True:
            line = self._pop_line()
            if line is None:
                break
            lines.append(line)
        return lines

    def close(self) -> None:
        if self._sock is not None:
            try:
                self._sock.close()
            finally:
                self._sock = None


class WindowsNamedPipeTransport:
    """Pure-stdlib Windows Named Pipe transport using kernel32 via ctypes."""

    def __init__(self, pipe_path: str, timeout: float = 10.0) -> None:
        if sys.platform != "win32":
            raise OSError("WindowsNamedPipeTransport is only supported on win32")
        import ctypes
        from ctypes import wintypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateFileW.argtypes = [
            wintypes.LPCWSTR,
            wintypes.DWORD,
            wintypes.DWORD,
            ctypes.c_void_p,
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.HANDLE,
        ]
        kernel32.CreateFileW.restype = wintypes.HANDLE
        kernel32.WriteFile.argtypes = [
            wintypes.HANDLE,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
            ctypes.c_void_p,
        ]
        kernel32.WriteFile.restype = wintypes.BOOL
        kernel32.ReadFile.argtypes = [
            wintypes.HANDLE,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
            ctypes.c_void_p,
        ]
        kernel32.ReadFile.restype = wintypes.BOOL
        kernel32.PeekNamedPipe.argtypes = [
            wintypes.HANDLE,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
            ctypes.POINTER(wintypes.DWORD),
            ctypes.POINTER(wintypes.DWORD),
        ]
        kernel32.PeekNamedPipe.restype = wintypes.BOOL
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel32.CloseHandle.restype = wintypes.BOOL

        generic_rw = 0x80000000 | 0x40000000
        open_existing = 3
        invalid_handle = ctypes.c_void_p(-1).value
        handle = kernel32.CreateFileW(pipe_path, generic_rw, 0, None, open_existing, 0, None)
        if handle == invalid_handle or not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        self._ctypes = ctypes
        self._wintypes = wintypes
        self._kernel32 = kernel32
        self._handle: int | None = int(handle)
        self._timeout = timeout
        self._rx_buf = bytearray()

    def send_line(self, text: str) -> None:
        if self._handle is None:
            raise RuntimeError("Transport is closed")
        data = text.encode("utf-8")
        written = self._wintypes.DWORD(0)
        ok = self._kernel32.WriteFile(
            self._wintypes.HANDLE(self._handle),
            data,
            len(data),
            self._ctypes.byref(written),
            None,
        )
        if not ok:
            raise self._ctypes.WinError(self._ctypes.get_last_error())

    def _pop_line(self) -> str | None:
        idx = self._rx_buf.find(b"\n")
        if idx == -1:
            return None
        raw = bytes(self._rx_buf[: idx + 1])
        del self._rx_buf[: idx + 1]
        return raw.decode("utf-8")

    def _read_chunk(self, max_bytes: int = 65536) -> bytes:
        buf = self._ctypes.create_string_buffer(max_bytes)
        read_count = self._wintypes.DWORD(0)
        ok = self._kernel32.ReadFile(
            self._wintypes.HANDLE(self._handle),
            buf,
            max_bytes,
            self._ctypes.byref(read_count),
            None,
        )
        if not ok:
            raise self._ctypes.WinError(self._ctypes.get_last_error())
        return buf.raw[: read_count.value]

    def read_line(self) -> str:
        if self._handle is None:
            raise RuntimeError("Transport is closed")
        while True:
            line = self._pop_line()
            if line is not None:
                return line
            chunk = self._read_chunk()
            if not chunk:
                raise ConnectionError("opld closed named pipe unexpectedly")
            self._rx_buf.extend(chunk)

    def poll_lines(self) -> list[str]:
        if self._handle is None:
            return []
        avail = self._wintypes.DWORD(0)
        while True:
            ok = self._kernel32.PeekNamedPipe(
                self._wintypes.HANDLE(self._handle),
                None,
                0,
                None,
                self._ctypes.byref(avail),
                None,
            )
            if not ok or avail.value == 0:
                break
            chunk = self._read_chunk(min(avail.value, 65536))
            if not chunk:
                break
            self._rx_buf.extend(chunk)
        lines: list[str] = []
        while True:
            line = self._pop_line()
            if line is None:
                break
            lines.append(line)
        return lines

    def close(self) -> None:
        if self._handle is not None:
            try:
                self._kernel32.CloseHandle(self._wintypes.HANDLE(self._handle))
            finally:
                self._handle = None


def open_transport(socket_path: str, timeout: float = 10.0) -> NdjsonTransport:
    """Open the appropriate platform transport for `socket_path`."""
    if sys.platform == "win32" or socket_path.startswith("\\\\.\\pipe\\"):
        return WindowsNamedPipeTransport(socket_path, timeout=timeout)
    return UnixSocketTransport(socket_path, timeout=timeout)
