"""Error types for the OPL v2 Python client SDK."""

from __future__ import annotations

from typing import Any


class OplClientError(RuntimeError):
    """Base error raised by the OPL Python client."""


class OplRpcError(OplClientError):
    """JSON-RPC 2.0 error returned by `opld`."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(f"OPL RPC Error [{code}]: {message}")
        self.code = code
        self.rpc_message = message
        self.data = data
