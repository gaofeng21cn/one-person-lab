"""Small process and Git boundaries for the existing Package release owners."""
from __future__ import annotations
import json
import os
import re
import subprocess
from pathlib import Path
from .github_app_token import ensure_fresh_token, is_token_refresh_configured

class ReleaseError(RuntimeError):
    pass

def _child_env():
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', PYTHONDONTWRITEBYTECODE='1')
    env.pop('PACKAGE_RELEASE_APP_PRIVATE_KEY', None)
    return env

def run(argv, *, cwd=None, check=True, timeout=900):
    ensure_fresh_token()
    env = _child_env()
    if env.get('GH_TOKEN'):
        env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='credential.helper',
                   GIT_CONFIG_VALUE_0='!gh auth git-credential')
    result = subprocess.run(list(map(str, argv)), cwd=cwd, env=env, text=True,
                            capture_output=True, timeout=timeout)
    if check and result.returncode:
        # Commands never carry credentials in arguments. Bound the diagnostic output.
        raise ReleaseError(f"{argv[0]} failed: {(result.stderr or result.stdout)[-3000:]}")
    return result

def gh(endpoint, *, method='GET', payload=None):
    for attempt in range(2):
        ensure_fresh_token()
        argv = ['gh', 'api', '--method', method, endpoint]
        if payload is not None:
            result = subprocess.run(argv + ['--input', '-'], input=json.dumps(payload),
                                    env=_child_env(), text=True, capture_output=True, timeout=60)
            if result.returncode:
                detail = result.stderr[-1000:]
                if attempt == 0 and ('HTTP 401' in detail or 'Bad credentials' in detail) and is_token_refresh_configured():
                    ensure_fresh_token(force=True)
                    continue
                raise ReleaseError(f'GitHub {method} {endpoint}: {detail}')
        else:
            try:
                result = run(argv, timeout=60)
            except ReleaseError as exc:
                detail = str(exc)
                if attempt == 0 and ('HTTP 401' in detail or 'Bad credentials' in detail) and is_token_refresh_configured():
                    ensure_fresh_token(force=True)
                    continue
                raise
        return json.loads(result.stdout) if result.stdout.strip() else None

def read(path):
    return json.loads(Path(path).read_text())

def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def git(root, *args):
    return run(['git', *args], cwd=root).stdout.strip()

def slug(url):
    match = re.fullmatch(r'https://github\.com/([\w.-]+/[\w.-]+)\.git', url)
    if not match:
        raise ReleaseError('Expected a canonical GitHub source repository')
    return match[1]

def safe_path(root, relative):
    candidate = Path(relative)
    if candidate.is_absolute() or '..' in candidate.parts or '\\' in str(candidate):
        raise ReleaseError('Package paths must stay inside their owner checkout')
    path = Path(root) / candidate
    if not path.resolve().is_relative_to(Path(root).resolve()) or path.is_symlink():
        raise ReleaseError('Package path escapes its owner checkout')
    return path

def version_tuple(value):
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value):
        raise ReleaseError('Expected stable SemVer')
    return tuple(map(int, value.split('.')))

def request_id(package_id, version, commit):
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', package_id) or not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ReleaseError('Invalid publication identity')
    version_tuple(version)
    return f'daily-{package_id}-{version}-{commit}'
