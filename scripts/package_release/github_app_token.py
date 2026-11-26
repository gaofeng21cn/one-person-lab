"""Best-effort GitHub App installation token refresh for long-running release jobs."""
from __future__ import annotations
import atexit
import base64
import json
import os
import subprocess
import time
import urllib.error
import urllib.request

_DEFAULT_PERMISSIONS = {
    'contents': 'write',
    'actions': 'write',
    'pull_requests': 'write',
    'workflows': 'write',
    'checks': 'read',
    'statuses': 'read',
}

_STATE: dict[str, object] = {
    'app_id': None,
    'private_key': None,
    'owner': None,
    'permissions': dict(_DEFAULT_PERMISSIONS),
    'minted_at': None,
    'refresh_after_seconds': 2700,
    'self_minted_tokens': [],
    'atexit_registered': False,
}


def reset_token_refresher() -> None:
    _STATE.update(
        app_id=None,
        private_key=None,
        owner=None,
        permissions=dict(_DEFAULT_PERMISSIONS),
        minted_at=None,
        refresh_after_seconds=2700,
        self_minted_tokens=[],
    )


def is_token_refresh_configured() -> bool:
    return bool(_STATE['app_id'] and _STATE['private_key'] and _STATE['owner'])


def _revoke_self_minted_tokens() -> None:
    tokens = list(_STATE.get('self_minted_tokens') or [])
    _STATE['self_minted_tokens'] = []
    for token in tokens:
        try:
            req = urllib.request.Request(
                'https://api.github.com/installation/token',
                method='DELETE',
                headers={
                    'Authorization': f'Bearer {token}',
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            )
            with urllib.request.urlopen(req, timeout=10):
                pass
        except Exception:
            pass


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _sign_app_jwt(app_id: str, private_key_pem: str, *, now: int | None = None) -> str:
    ts = int(time.time()) if now is None else int(now)
    header = _b64url(json.dumps({'alg': 'RS256', 'typ': 'JWT'}, separators=(',', ':')).encode('utf-8'))
    payload = _b64url(json.dumps({'iat': ts - 60, 'exp': ts + 540, 'iss': str(app_id)}, separators=(',', ':')).encode('utf-8'))
    signing_input = f'{header}.{payload}'
    # Keep the private key in stdin rather than argv or temporary files.
    script = (
        "const fs = require('node:fs');"
        "const crypto = require('node:crypto');"
        "const key = fs.readFileSync(0, 'utf8');"
        "const signer = crypto.createSign('RSA-SHA256');"
        "signer.update(process.argv[1]);"
        "process.stdout.write(signer.sign(key).toString('base64url'));"
    )
    res = subprocess.run(
        ['node', '-e', script, signing_input],
        input=private_key_pem,
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    signature = res.stdout.strip()
    return f'{signing_input}.{signature}'


def _github_json_request(url: str, *, bearer: str, method: str = 'GET', payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode('utf-8')
    headers = {
        'Authorization': f'Bearer {bearer}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read().decode('utf-8')
        return json.loads(raw) if raw.strip() else {}


def mint_installation_token(
    app_id: str,
    private_key_pem: str,
    owner: str,
    permissions: dict[str, str] | None = None,
) -> str:
    jwt_token = _sign_app_jwt(app_id, private_key_pem)
    installation = None
    for endpoint in (
        f'https://api.github.com/users/{owner}/installation',
        f'https://api.github.com/orgs/{owner}/installation',
    ):
        try:
            installation = _github_json_request(endpoint, bearer=jwt_token)
            break
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
    if not installation or 'id' not in installation:
        raise RuntimeError(f'Could not resolve GitHub App installation for {owner}')
    created = _github_json_request(
        f'https://api.github.com/app/installations/{installation["id"]}/access_tokens',
        bearer=jwt_token,
        method='POST',
        payload={'permissions': permissions or dict(_DEFAULT_PERMISSIONS)},
    )
    token = created.get('token')
    if not isinstance(token, str) or not token:
        raise RuntimeError('GitHub App access_tokens response omitted token')
    return token


def configure_token_refresh_from_env(*, refresh_after_seconds: int = 2700) -> bool:
    app_id = os.environ.get('PACKAGE_RELEASE_APP_ID', '').strip()
    private_key = os.environ.pop('PACKAGE_RELEASE_APP_PRIVATE_KEY', '').strip()
    owner = (
        os.environ.get('PACKAGE_RELEASE_APP_OWNER', '').strip()
        or os.environ.get('GITHUB_REPOSITORY_OWNER', '').strip()
    )
    if not app_id or not private_key or not owner:
        return False
    _STATE['app_id'] = app_id
    _STATE['private_key'] = private_key
    _STATE['owner'] = owner
    _STATE['refresh_after_seconds'] = refresh_after_seconds
    _STATE['minted_at'] = time.monotonic() if os.environ.get('GH_TOKEN') else None
    if not _STATE['atexit_registered']:
        atexit.register(_revoke_self_minted_tokens)
        _STATE['atexit_registered'] = True
    return True


def ensure_fresh_token(*, force: bool = False) -> str | None:
    if not is_token_refresh_configured():
        return None
    minted_at = _STATE['minted_at']
    threshold = int(_STATE['refresh_after_seconds'])
    if not force and minted_at is not None and (time.monotonic() - float(minted_at)) < threshold:
        return None
    token = mint_installation_token(
        str(_STATE['app_id']),
        str(_STATE['private_key']),
        str(_STATE['owner']),
        dict(_STATE['permissions']),  # type: ignore[arg-type]
    )
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        print(f'::add-mask::{token}', flush=True)
    os.environ['GH_TOKEN'] = token
    _STATE['minted_at'] = time.monotonic()
    tokens = _STATE['self_minted_tokens']
    if isinstance(tokens, list):
        tokens.append(token)
    return token
