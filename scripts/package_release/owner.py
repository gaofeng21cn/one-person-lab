"""Prepare v2 owner bytes before generating the official Catalog projection."""
from __future__ import annotations
import hashlib
import json
import plistlib
import re
import subprocess
import time
import tomllib
from pathlib import Path
from .common import ReleaseError, gh, git, read, run, safe_path, version_tuple, write
from .projection import package_source_roots
from .v2_projection import build_v2_candidate


def owner_settings(root):
    path = root / 'release-automation.json'
    settings = read(path) if path.is_file() else {}
    if not path.is_file():
        raise ReleaseError('Owner must declare release-automation.json before automatic version changes')
    if set(settings) - {'strategy', 'prepare', 'verify', 'version_files', 'release_paths', 'release_workflows'}:
        raise ReleaseError('Unknown owner release setting')
    strategy = settings.get('strategy', 'daily_patch')
    if strategy not in ['daily_patch', 'manual']:
        raise ReleaseError('Unsupported owner release strategy')
    for field in ['prepare', 'verify']:
        for command in settings.get(field, []):
            if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
                raise ReleaseError('Owner release commands must be argument arrays')
    release_paths = settings.get('release_paths', [])
    if not isinstance(release_paths, list) or not all(isinstance(name, str) for name in release_paths) or len(set(release_paths)) != len(release_paths):
        raise ReleaseError('Release paths must be a unique array')
    for name in release_paths:
        if not isinstance(name, str) or not name:
            raise ReleaseError('Release paths must be nonempty owner-relative paths')
        safe_path(root, name)
    for name in settings.get('release_workflows', []):
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-]+\.ya?ml', name):
            raise ReleaseError('Release workflows must name owner workflow files')
    return settings


def update_version_files(root, refs, version):
    """Align declared language/native metadata for Package and product releases."""
    changed = set()
    for item in refs:
        p = safe_path(root, item['path'])
        if item['kind'] == 'json':
            d = read(p)
            field = item.get('field', 'version')
            if field == 'package.version' and isinstance(d.get('package'), dict) and 'version' in d['package']:
                d['package']['version'] = version
            elif field == 'version':
                d['version'] = version
                if isinstance(d.get('packages', {}).get(''), dict):
                    d['packages']['']['version'] = version
            else:
                raise ReleaseError(f'Cannot update the declared JSON version field: {item["path"]} {field}')
            write(p, d)
        elif item['kind'] == 'toml_project':
            text = p.read_text()
            project_name = tomllib.loads(text)['project']['name']
            text, count = re.subn(r'(?ms)(^\[project\]\s*\n(?:(?!^\[).)*?^version\s*=\s*)["\'][^"\']+["\']',
                                  lambda m: m[1] + json.dumps(version), text, count=1)
            if count != 1:
                raise ReleaseError('Cannot update the declared Python project version')
            p.write_text(text)
            lock_path = p.with_name('uv.lock')
            if lock_path.is_file():
                lock = lock_path.read_text()
                replacements = 0
                def align_local_package(match):
                    nonlocal replacements
                    block = match[0]
                    package = tomllib.loads(block)['package'][0]
                    source = package.get('source', {})
                    if package['name'] == project_name and (source.get('editable') == '.' or source.get('virtual') == '.'):
                        replacements += 1
                        return re.sub(r'(?m)^version\s*=.*$', 'version = ' + json.dumps(version), block, count=1)
                    return block
                lock = re.sub(r'(?ms)^\[\[package\]\]\n.*?(?=^\[\[package\]\]|\Z)', align_local_package, lock)
                if replacements != 1:
                    raise ReleaseError('Cannot align the local project version in uv.lock')
                lock_path.write_text(lock)
                changed.add(str(lock_path.relative_to(root)))
        elif item['kind'] == 'python_version':
            text, count = re.subn(r'(?m)^__version__\s*=.*$', '__version__ = ' + json.dumps(version), p.read_text())
            if count != 1:
                raise ReleaseError('Cannot update the declared Python runtime version')
            p.write_text(text)
        elif item['kind'] == 'plist_bundle':
            original = p.read_bytes()
            d = plistlib.loads(original)
            if d.get('CFBundleShortVersionString') != version:
                build = str(d.get('CFBundleVersion', '0'))
                d['CFBundleVersion'] = str(int(build) + 1) if build.isdigit() else version
            d['CFBundleShortVersionString'] = version
            p.write_bytes(plistlib.dumps(d, fmt=plistlib.FMT_BINARY if original.startswith(b'bplist') else plistlib.FMT_XML,
                                        sort_keys=False))
        elif item['kind'] == 'xml_project':
            text, count = re.subn(r'(<Version>)[^<]+(</Version>)', lambda m: m[1] + version + m[2], p.read_text())
            if count != 1:
                raise ReleaseError('Cannot update the declared XML project version')
            p.write_text(text)
        else:
            raise ReleaseError('Unknown version-file adapter')
        changed.add(item['path'])
    return changed


def _normalize_relative_posix_path(raw: str) -> str:
    if (
        not isinstance(raw, str)
        or not raw
        or '\0' in raw
        or '\\' in raw
        or re.match(r'^[A-Za-z]:', raw)
        or raw.startswith('/')
        or raw in {'.', '..'}
    ):
        raise ValueError(f'Unsafe relative package path: {raw!r}')
    normalized = raw[2:] if raw.startswith('./') else raw
    if not normalized or normalized.startswith('/'):
        raise ValueError(f'Unsafe relative package path: {raw!r}')
    if any(seg in {'', '.', '..'} for seg in normalized.split('/')):
        raise ValueError(f'Unsafe relative package path: {raw!r}')
    return normalized


def _ordered_content_digest(paths, read_bytes):
    seen = set()
    normalized = []
    for raw in paths:
        clean = _normalize_relative_posix_path(raw)
        if clean in seen:
            raise ValueError(f'Duplicate path {clean!r} in content digest input')
        seen.add(clean)
        normalized.append(clean)
    h = hashlib.sha256()
    for relative in sorted(normalized, key=lambda item: item.encode('utf-16-be')):
        rel_bytes = relative.encode('utf-8')
        data = read_bytes(relative)
        h.update(len(rel_bytes).to_bytes(8, 'big'))
        h.update(rel_bytes)
        h.update(len(data).to_bytes(8, 'big'))
        h.update(data)
    return f'sha256:{h.hexdigest()}'


def execute_commands(root, settings, field):
    for command in settings.get(field, []):
        run(command, cwd=root)


def source_workflow_checks(repo, commit, workflows, ignored_check_suite_id):
    checks = []
    for workflow in workflows:
        runs = gh(f'repos/{repo}/actions/workflows/{workflow}/runs?head_sha={commit}&per_page=100')['workflow_runs']
        matches = [row for row in runs if row.get('head_sha') == commit
                   and row.get('path') == f'.github/workflows/{workflow}'
                   and (ignored_check_suite_id is None or row.get('check_suite_id') != ignored_check_suite_id)]
        if matches:
            # A workflow result covers all its jobs, including checks outside the
            # first commit/check-runs page. A newer retry replaces the older run.
            latest = max(matches, key=lambda row: row['id'])
            checks.append({'name': workflow, 'status': latest['status'], 'conclusion': latest.get('conclusion')})
    return checks


def wait_for_checks(repo, commit, timeout=1200, *, ignored_check_suite_id=None, source_workflows=None):
    deadline = time.monotonic() + timeout
    first = True
    while True:
        if source_workflows is None:
            response = gh(f'repos/{repo}/commits/{commit}/check-runs?per_page=100')
            checks = [check for check in response['check_runs']
                      if ignored_check_suite_id is None or check.get('check_suite', {}).get('id') != ignored_check_suite_id]
        else:
            checks = source_workflow_checks(repo, commit, source_workflows, ignored_check_suite_id)
        statuses = gh(f'repos/{repo}/commits/{commit}/status')['statuses']
        rejected = [s['context'] for s in statuses if s['state'] in ['error', 'failure']]
        if rejected:
            raise ReleaseError('Source statuses failed: ' + ', '.join(rejected))
        failed = [c['name'] for c in checks if c['status'] == 'completed'
                  and c['conclusion'] not in ['success', 'neutral', 'skipped']]
        if failed:
            raise ReleaseError('Source checks failed: ' + ', '.join(failed))
        pending = any(c['status'] != 'completed' for c in checks) or any(s['state'] == 'pending' for s in statuses)
        if not pending and (checks or (source_workflows is None and not first)):
            return
        if time.monotonic() >= deadline:
            raise ReleaseError('Source checks have not completed')
        first = False
        time.sleep(10)


def wait_for_release_workflows(repo, commit, tag, settings, timeout=3600):
    """Keep the same product's native publication ahead of OCI stable promotion."""
    deadline = time.monotonic() + timeout
    for workflow in settings.get('release_workflows', []):
        while True:
            runs = gh(f'repos/{repo}/actions/workflows/{workflow}/runs?head_sha={commit}&event=push&per_page=100')['workflow_runs']
            selected = [r for r in runs if r['head_sha'] == commit and r['head_branch'] == tag]
            latest = max(selected, key=lambda r: r['id']) if selected else None
            if latest and latest['status'] == 'completed':
                if latest['conclusion'] != 'success':
                    raise ReleaseError(f'Product release workflow failed: {workflow} {latest.get("html_url", "")}')
                break
            if latest and latest['status'] == 'in_progress':
                jobs = gh(f'repos/{repo}/actions/runs/{latest["id"]}/jobs?filter=latest&per_page=100')['jobs']
                failed = [job['name'] for job in jobs if job['status'] == 'completed'
                          and job['conclusion'] in ['failure', 'cancelled', 'timed_out', 'action_required']]
                if failed:
                    raise ReleaseError(f'Product release job failed: {workflow} {", ".join(failed)} {latest.get("html_url", "")}')
            if time.monotonic() >= deadline:
                raise ReleaseError(f'Product release workflow is pending: {workflow} {tag}')
            time.sleep(10)


def reconcile_release_branch(root, branch, base):
    existing = git(root, 'ls-remote', 'origin', f'refs/heads/{branch}')
    if not existing:
        return
    git(root, 'fetch', 'origin', f'refs/heads/{branch}', '--quiet')
    selected = git(root, 'rev-parse', 'FETCH_HEAD')
    if (git(root, 'rev-parse', f'{selected}^{{tree}}') != git(root, 'rev-parse', 'HEAD^{tree}')
        or run(['git', 'merge-base', '--is-ancestor', base, selected], cwd=root, check=False).returncode):
        raise ReleaseError('Existing release branch has different source files; preserve it for review')
    # Preserve the original commit and its checks after an interrupted push or PR request.
    git(root, 'reset', '--hard', selected)


def merge_release_changes(root, repo, base, package_id, version, *, delivery_kind='Package'):
    """Use the existing PR/CI surface, then tag the actual merged commit."""
    branch = f'codex/daily-{delivery_kind.lower()}-{package_id}-{base[:12]}'
    reconcile_release_branch(root, branch, base)
    git(root, 'push', 'origin', f'HEAD:refs/heads/{branch}')
    pulls = gh(f'repos/{repo}/pulls?state=open&head={repo.split("/")[0]}:{branch}&base=main')
    if len(pulls) > 1:
        raise ReleaseError('More than one owner release PR selects the same source')
    pull = pulls[0] if pulls else gh(f'repos/{repo}/pulls', method='POST', payload={
        'title': f'chore: prepare {delivery_kind} {version}', 'head': branch, 'base': 'main',
        'body': f'Prepare the changed {package_id} delivery files and aligned version metadata for its daily release. Owner verification runs before publication.'})
    head = git(root, 'rev-parse', 'HEAD')
    wait_for_checks(repo, head)
    if gh(f'repos/{repo}/commits/main')['sha'] != base:
        raise ReleaseError('Owner main changed during release preparation; retry from the new source')
    merge_error = None
    try:
        result = gh(f'repos/{repo}/pulls/{pull["number"]}/merge', method='PUT',
                    payload={'sha': head, 'merge_method': 'merge'})
    except (ReleaseError, subprocess.TimeoutExpired) as exc:
        result = None
        merge_error = exc
    git(root, 'fetch', 'origin', 'main', '--quiet')
    if run(['git', 'merge-base', '--is-ancestor', head, 'origin/main'], cwd=root, check=False).returncode:
        if merge_error is not None:
            raise merge_error
        raise ReleaseError('Release PR was not merged')

    # The earliest main commit containing this head is the publication source.
    # A later, unrelated main commit must not become the tagged release.
    if result and result.get('merged') is True and re.fullmatch(r'[a-f0-9]{40}', str(result.get('sha'))):
        merged = result['sha']
    else:
        containing = git(root, 'rev-list', '--first-parent', '--reverse', f'{base}..origin/main')
        merged = next((commit for commit in containing.splitlines()
                       if not run(['git', 'merge-base', '--is-ancestor', head, commit], cwd=root, check=False).returncode),
                      None)
    if (not merged
            or run(['git', 'merge-base', '--is-ancestor', merged, 'origin/main'], cwd=root, check=False).returncode
            or git(root, 'rev-parse', f'{merged}^{{tree}}') != git(root, 'rev-parse', f'{head}^{{tree}}')):
        raise ReleaseError('Merged release source differs from the verified PR tree; retry from fresh main')
    git(root, 'reset', '--hard', merged)
    return merged


def release_version(root, base, current, previous):
    current_version = version_tuple(current)
    published_version = version_tuple(previous)
    if current_version < published_version:
        raise ReleaseError('Owner version regresses the Framework selection')
    tag = run(['git', 'rev-parse', '--verify', f'refs/tags/v{current}^{{}}'], cwd=root, check=False)
    tag_matches = tag.returncode == 0 and tag.stdout.strip() == base
    if current_version == published_version or (tag.returncode == 0 and (not tag_matches or git(root, 'status', '--porcelain'))):
        a, b, c = current_version
        return f'{a}.{b}.{c + 1}'
    return current


def root_v2_version(root, commit, package_id, source_root='.'):
    # Read the selected Git commit, before any legacy preparation hook can change source files.
    descriptor = (Path(source_root) / 'opl-package.json').as_posix()
    selected = git(root, 'ls-tree', commit, '--', f':(literal){descriptor}')
    if not selected:
        return None
    if not selected.startswith(('100644 blob ', '100755 blob ')):
        raise ReleaseError('Package descriptor must be a regular file in the owner commit')
    manifest = json.loads(git(root, 'show', f'{commit}:{descriptor}'))
    if not isinstance(manifest, dict) or manifest.get('schema_version') != 'opl.package.v2':
        return None
    identity = manifest.get('identity')
    if not isinstance(identity, dict) or identity.get('id') != package_id or not isinstance(identity.get('version'), str):
        raise ReleaseError('v2 Package identity does not match its Catalog selection')
    return identity['version']


def v2_candidate_version(root, base, current, previous):
    version = release_version(root, base, current, previous)
    # A matching current tag can be resumed. A new version needs an unused tag.
    while version != current:
        tag = run(['git', 'show-ref', '--verify', '--quiet', f'refs/tags/v{version}'], cwd=root, check=False)
        if tag.returncode == 1:
            break
        if tag.returncode != 0:
            raise ReleaseError(f'Cannot inspect candidate Package tag v{version}')
        major, minor, patch = version_tuple(version)
        version = f'{major}.{minor}.{patch + 1}'
    return version


def prepare_v2_owner(root, projection, repo, settings, current, controller, *, apply, source_root='.'):
    package_id = projection['package_id']
    previous = (projection.get('v2_release') or projection)['version']
    base = git(root, 'rev-parse', 'HEAD')
    version = v2_candidate_version(root, base, current, previous)
    result = {'version': version, 'owner_source_commit': base, 'package_format': 'v2'}
    if not apply:
        return {**result, 'status': 'needs_release'}

    wait_for_checks(repo, base)
    git(root, 'config', 'user.name', 'OPL Package Publisher')
    git(root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    if version != current:
        descriptor = safe_path(root, (Path(source_root) / 'opl-package.json').as_posix())
        refs = list(settings.get('version_files', []))
        if any(safe_path(root, item['path']).resolve() == descriptor.resolve() for item in refs):
            raise ReleaseError('The v2 descriptor version is managed through identity.version')
        manifest = read(descriptor)
        manifest['identity']['version'] = version
        write(descriptor, manifest)
        update_version_files(root, refs, version)
    execute_commands(root, settings, 'prepare')
    execute_commands(root, settings, 'verify')
    source = base
    if git(root, 'status', '--porcelain'):
        git(root, 'add', '--all')
        git(root, 'commit', '-m', f'chore: prepare Package {version}')
        candidate_head = git(root, 'rev-parse', 'HEAD')
        build_v2_candidate(controller, root, package_id, version, candidate_head, source_root)
        source = merge_release_changes(root, repo, base, package_id, version)
    candidate = build_v2_candidate(controller, root, package_id, version, source, source_root)
    publish_owner_tag(root, repo, source, version, settings)
    return {**result, 'status': 'prepared', 'owner_source_commit': source, 'candidate': candidate}


def publish_owner_tag(root, repo, source, version, settings):
    tag = f'v{version}'
    existing = run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}^{{}}'], cwd=root, check=False)
    if existing.returncode == 0:
        if existing.stdout.strip() != source or git(root, 'cat-file', '-t', f'refs/tags/{tag}') != 'tag':
            raise ReleaseError('Existing immutable version tag must be annotated and select the exact source')
    else:
        git(root, 'tag', '-a', tag, '-m', f'Package {version}', source)
    git(root, 'push', 'origin', f'refs/tags/{tag}')
    wait_for_release_workflows(repo, source, tag, settings)


def prepare_owner(root, projection, allowlist, framework, repo, *, apply, payload_path=None, v2_controller=None):
    if payload_path is None:
        raise ReleaseError('v2 Package publication requires a Catalog payload manifest')
    if v2_controller is None:
        raise ReleaseError('v2 Package publication requires the official Catalog and current Framework publisher')
    base = git(root, 'rev-parse', 'HEAD')
    payload = read(payload_path)
    settings = owner_settings(root)
    if settings.get('strategy') == 'manual':
        return {'status': 'owner_manual', 'owner_source_commit': base}
    if base == payload['source_commit']:
        return {'status': 'unchanged', 'owner_source_commit': base}
    for source_root in package_source_roots(projection, allowlist):
        v2_version = root_v2_version(root, base, projection['package_id'], source_root)
        if v2_version is not None:
            return prepare_v2_owner(root, projection, repo, settings, v2_version, v2_controller,
                                    apply=apply, source_root=source_root)
    raise ReleaseError('Owner commit does not declare a valid opl.package.v2 descriptor')
