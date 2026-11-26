"""Pure-stdlib Python 3.12+ client SDK for OPL Framework v2 (`opld`)."""

from __future__ import annotations

from .client import OplClient, connect
from .errors import OplClientError, OplRpcError
from .helpers import (
    read_stdin_json,
    ready_envelope,
    sha256_bytes,
    sha256_file,
    unavailable_envelope,
    write_json_stdout,
)
from .transport import resolve_session_path, resolve_state_dir

__all__ = [
    "OplClient",
    "OplClientError",
    "OplRpcError",
    "connect",
    "read_stdin_json",
    "ready_envelope",
    "resolve_session_path",
    "resolve_state_dir",
    "sha256_bytes",
    "sha256_file",
    "unavailable_envelope",
    "write_json_stdout",
]
