"""Fail-closed HTTPS transport for OPL-managed source intake."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
import math
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


DEFAULT_SOURCE_FETCH_TIMEOUT_SECONDS = 20.0


class SourceTransportPolicyError(ValueError):
    """Raised when a source request violates the declared transport policy."""


class SourceTransportError(RuntimeError):
    """Raised when an authorized source cannot be fetched or decoded."""


def _validated_timeout(value: float) -> float:
    if isinstance(value, bool):
        raise ValueError("timeout must be a finite number greater than zero.")
    timeout = float(value)
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("timeout must be a finite number greater than zero.")
    return timeout


def _normalized_host(hostname: str) -> str:
    try:
        normalized = hostname.encode("idna").decode("ascii").lower()
    except UnicodeError as error:
        raise SourceTransportPolicyError("source URL hostname is not valid IDNA.") from error
    return f"[{normalized}]" if ":" in normalized else normalized


def _canonical_https_url(value: str, *, field: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise SourceTransportPolicyError(f"{field} must be a non-empty URL without outer whitespace.")
    parsed = urlsplit(value)
    if parsed.scheme.lower() != "https":
        raise SourceTransportPolicyError(f"{field} must use HTTPS.")
    if not parsed.hostname:
        raise SourceTransportPolicyError(f"{field} must include a hostname.")
    if parsed.username is not None or parsed.password is not None:
        raise SourceTransportPolicyError(f"{field} must not contain user information.")
    if parsed.fragment:
        raise SourceTransportPolicyError(f"{field} must not contain a fragment.")
    try:
        port = parsed.port
    except ValueError as error:
        raise SourceTransportPolicyError(f"{field} contains an invalid port.") from error
    host = _normalized_host(parsed.hostname)
    netloc = host if port in (None, 443) else f"{host}:{port}"
    return urlunsplit(("https", netloc, parsed.path or "/", parsed.query, ""))


def _canonical_origin(value: str) -> str:
    canonical_url = _canonical_https_url(value, field="allowed_origins entry")
    parsed = urlsplit(canonical_url)
    if parsed.path != "/" or parsed.query:
        raise SourceTransportPolicyError("allowed_origins entries must contain only an HTTPS origin.")
    return f"https://{parsed.netloc}"


def _normalized_values(values: Iterable[str] | None, *, field: str) -> tuple[str, ...]:
    if values is None:
        return ()
    if isinstance(values, str):
        raise TypeError(f"{field} must be an iterable of URLs, not a string.")
    return tuple(values)


class _SourceRedirectHandler(HTTPRedirectHandler):
    def __init__(self, authorize: Any) -> None:
        super().__init__()
        self._authorize = authorize

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> Request | None:
        self._authorize(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _request_headers(headers: Mapping[str, str] | None) -> dict[str, str]:
    if headers is None:
        return {}
    if not isinstance(headers, Mapping):
        raise TypeError("headers must be a mapping of strings.")
    normalized: dict[str, str] = {}
    for name, value in headers.items():
        if not isinstance(name, str) or not name or ":" in name or "\r" in name or "\n" in name:
            raise ValueError("header names must be non-empty strings without separators or newlines.")
        if not isinstance(value, str) or "\r" in value or "\n" in value:
            raise ValueError("header values must be strings without newlines.")
        normalized[name] = value
    return normalized


def fetch_text(
    url: str,
    *,
    allowed_origins: Iterable[str] | None = None,
    allowed_urls: Iterable[str] | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = DEFAULT_SOURCE_FETCH_TIMEOUT_SECONDS,
) -> str:
    """Fetch text from an explicitly authorized HTTPS source."""

    allowed_origin_set = {
        _canonical_origin(value)
        for value in _normalized_values(allowed_origins, field="allowed_origins")
    }
    allowed_url_set = {
        _canonical_https_url(value, field="allowed_urls entry")
        for value in _normalized_values(allowed_urls, field="allowed_urls")
    }
    if not allowed_origin_set and not allowed_url_set:
        raise SourceTransportPolicyError("at least one allowed HTTPS origin or URL is required.")

    def authorize(candidate: str) -> str:
        canonical = _canonical_https_url(candidate, field="source URL")
        origin = f"https://{urlsplit(canonical).netloc}"
        if canonical not in allowed_url_set and origin not in allowed_origin_set:
            raise SourceTransportPolicyError(f"source URL is outside the declared allowlist: {canonical}")
        return canonical

    canonical_url = authorize(url)
    timeout_seconds = _validated_timeout(timeout)
    request = Request(canonical_url, headers=_request_headers(headers), method="GET")
    opener = build_opener(_SourceRedirectHandler(authorize))
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            authorize(response.geturl())
            payload = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="ignore")
    except SourceTransportPolicyError:
        raise
    except HTTPError as error:
        raise SourceTransportError(f"source request failed with HTTP status {error.code}.") from error
    except (LookupError, OSError, UnicodeError, URLError) as error:
        raise SourceTransportError(f"source request failed: {error}") from error
