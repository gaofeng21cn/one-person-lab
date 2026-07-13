from __future__ import annotations

from email.message import Message
from unittest.mock import patch
from urllib.error import URLError

import pytest

from opl_framework.source_transport import (
    SourceTransportError,
    SourceTransportPolicyError,
    fetch_text,
)


class _Response:
    def __init__(self, *, url: str, payload: bytes, charset: str = "utf-8") -> None:
        self._url = url
        self._payload = payload
        self.headers = Message()
        self.headers["Content-Type"] = f"text/plain; charset={charset}"
        self.read_called = False

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def geturl(self) -> str:
        return self._url

    def read(self) -> bytes:
        self.read_called = True
        return self._payload


class _Opener:
    def __init__(self, response: _Response | None = None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.request = None
        self.timeout = None

    def open(self, request: object, *, timeout: float) -> _Response:
        self.request = request
        self.timeout = timeout
        if self.error is not None:
            raise self.error
        assert self.response is not None
        return self.response


def test_fetch_text_requires_https_and_a_non_empty_allowlist() -> None:
    with pytest.raises(SourceTransportPolicyError, match="at least one allowed"):
        fetch_text("https://example.test/source")
    with pytest.raises(SourceTransportPolicyError, match="must use HTTPS"):
        fetch_text("http://example.test/source", allowed_origins=("https://example.test",))
    with pytest.raises(SourceTransportPolicyError, match="only an HTTPS origin"):
        fetch_text(
            "https://example.test/source",
            allowed_origins=("https://example.test/private",),
        )


def test_fetch_text_applies_origin_policy_headers_timeout_and_charset() -> None:
    response = _Response(
        url="https://example.test/source",
        payload="资助机会".encode("gb18030"),
        charset="gb18030",
    )
    opener = _Opener(response)

    with patch("opl_framework.source_transport.build_opener", return_value=opener):
        result = fetch_text(
            "https://EXAMPLE.test:443/source",
            allowed_origins=("https://example.test/",),
            headers={"User-Agent": "OPL source intake"},
            timeout=7.5,
        )

    assert result == "资助机会"
    assert opener.timeout == 7.5
    assert opener.request.full_url == "https://example.test/source"
    assert opener.request.get_header("User-agent") == "OPL source intake"
    assert response.read_called is True


def test_fetch_text_exact_url_policy_rejects_other_paths_and_redirects() -> None:
    allowed = "https://example.test/allowed?version=1"
    with pytest.raises(SourceTransportPolicyError, match="outside the declared allowlist"):
        fetch_text(
            "https://example.test/other?version=1",
            allowed_urls=(allowed,),
        )

    response = _Response(url="https://redirected.test/source", payload=b"not-read")
    opener = _Opener(response)
    with patch("opl_framework.source_transport.build_opener", return_value=opener):
        with pytest.raises(SourceTransportPolicyError, match="outside the declared allowlist"):
            fetch_text(allowed, allowed_urls=(allowed,))
    assert response.read_called is False


@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan"), True])
def test_fetch_text_rejects_invalid_timeouts(timeout: float) -> None:
    with pytest.raises(ValueError, match="finite number greater than zero"):
        fetch_text(
            "https://example.test/source",
            allowed_origins=("https://example.test",),
            timeout=timeout,
        )


def test_fetch_text_wraps_transport_failures() -> None:
    opener = _Opener(error=URLError("offline"))
    with patch("opl_framework.source_transport.build_opener", return_value=opener):
        with pytest.raises(SourceTransportError, match="offline"):
            fetch_text(
                "https://example.test/source",
                allowed_origins=("https://example.test",),
            )


def test_fetch_text_preserves_tolerant_decode_semantics() -> None:
    response = _Response(
        url="https://example.test/source",
        payload=b"valid\xfftext",
    )
    opener = _Opener(response)
    with patch("opl_framework.source_transport.build_opener", return_value=opener):
        assert fetch_text(
            "https://example.test/source",
            allowed_urls=("https://example.test/source",),
        ) == "validtext"
