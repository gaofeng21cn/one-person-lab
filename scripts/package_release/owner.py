"""Prepare owner bytes; Framework continues to generate and publish its projection."""
from __future__ import annotations
import json
import plistlib
import re
import sys
import time
import tomllib
from pathlib import Path
from .common import ReleaseError, gh, git, read, run, safe_path, version_tuple, write


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


def metadata_files(root, projection, allowlist):
    carrier = allowlist['source_root']
    canonical = projection['publication_source']['owner_package_manifest_ref']
    candidates = {canonical, str(Path(carrier) / 'opl-package.json'),
                  str(Path(carrier) / '.codex-plugin/plugin.json'), str(Path(carrier) / 'plugin.json')}
    for name in ['opl-package.json', '.codex-plugin/plugin.json', 'plugin.json']:
        p = root / name
        if p.is_file():
            d = read(p)
            if d.get('package_id') == projection['package_id'] or d.get('name') == allowlist['plugin_id']:
                candidates.add(name)
    return sorted(name for name in candidates if safe_path(root, name).is_file())


def update_versions(root, projection, allowlist, settings, version):
    changed = set()
    workflow = projection['surface_kind'] == 'opl_workflow_profile_package_manifest.v1'
    canonical = projection['publication_source']['owner_package_manifest_ref']
    for name in metadata_files(root, projection, allowlist):
        p = safe_path(root, name)
        d = read(p)
        if workflow and name == canonical:
            d['package']['version'] = version
        else:
            d['version'] = version
        write(p, d)
        changed.add(name)
    language_ref = projection['publication_source'].get('owner_language_version_ref')
    refs = list(settings.get('version_files', []))
    if language_ref and not any(x['path'] == language_ref for x in refs):
        refs.append({'path': language_ref, 'kind': 'toml_project' if language_ref.endswith('.toml') else 'json'})
    for item in refs:
        p = safe_path(root, item['path'])
        if item['kind'] == 'json':
            d = read(p)
            d['version'] = version
            if isinstance(d.get('packages', {}).get(''), dict):
                d['packages']['']['version'] = version
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


def refresh_locks(root, projection, allowlist, framework):
    sys.path.insert(0, str(framework / 'python'))
    from opl_framework.package_content_lock import content_digest
    for name in metadata_files(root, projection, allowlist):
        d = read(root / name)
        lock = d.get('content_lock')
        if lock:
            carrier = safe_path(root, allowlist['source_root'])
            paths = lock['paths']
            if name in paths and carrier == root:
                raise ReleaseError('A content lock cannot contain its own descriptor')
            lock['digest'] = content_digest(paths, lambda relative: safe_path(carrier, relative).read_bytes())
            write(root / name, d)


def execute_commands(root, settings, field):
    for command in settings.get(field, []):
        run(command, cwd=root)


def content_changed(root, previous_commit, projection, allowlist, settings=None):
    carrier = safe_path(root, allowlist['source_root'])
    descriptor = read(carrier / 'opl-package.json')
    paths = descriptor.get('content_lock', {}).get('paths', allowlist['paths'])
    names = {str(Path(allowlist['source_root']) / p) for p in paths}
    names.update(metadata_files(root, projection, allowlist))
    if (root / 'release-automation.json').is_file():
        names.add('release-automation.json')
    settings = settings or {}
    names.update(item['path'] for item in settings.get('version_files', []))
    release_paths = settings.get('release_paths', [])
    if release_paths:
        for name in release_paths:
            safe_path(root, name)
        difference = run(['git', 'diff', '--quiet', previous_commit, '--', *release_paths], cwd=root, check=False)
        if difference.returncode == 1:
            return True
        if difference.returncode:
            raise ReleaseError('Cannot compare the declared product release paths')
    for name in sorted(names):
        current = safe_path(root, name)
        if not current.is_file():
            return True
        old_hash = run(['git', 'rev-parse', f'{previous_commit}:{name}'], cwd=root, check=False).stdout.strip()
        if old_hash != git(root, 'hash-object', name):
            return True
    return False


def wait_for_checks(repo, commit, timeout=1200):
    deadline = time.monotonic() + timeout
    first = True
    while True:
        response = gh(f'repos/{repo}/commits/{commit}/check-runs?per_page=100')
        checks = response['check_runs']
        statuses = gh(f'repos/{repo}/commits/{commit}/status')['statuses']
        rejected = [s['context'] for s in statuses if s['state'] in ['error', 'failure']]
        if rejected:
            raise ReleaseError('Source statuses failed: ' + ', '.join(rejected))
        failed = [c['name'] for c in checks if c['status'] == 'completed'
                  and c['conclusion'] not in ['success', 'neutral', 'skipped']]
        if failed:
            raise ReleaseError('Source checks failed: ' + ', '.join(failed))
        pending = any(c['status'] != 'completed' for c in checks) or any(s['state'] == 'pending' for s in statuses)
        if not pending and (checks or not first):
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


def merge_release_changes(root, repo, base, package_id, version):
    """Use the existing PR/CI surface, then tag the actual merged commit."""
    branch = f'codex/daily-package-{package_id}-{base[:12]}'
    reconcile_release_branch(root, branch, base)
    git(root, 'push', 'origin', f'HEAD:refs/heads/{branch}')
    pulls = gh(f'repos/{repo}/pulls?state=open&head={repo.split("/")[0]}:{branch}&base=main')
    if len(pulls) > 1:
        raise ReleaseError('More than one owner release PR selects the same source')
    pull = pulls[0] if pulls else gh(f'repos/{repo}/pulls', method='POST', payload={
        'title': f'chore: prepare Package {version}', 'head': branch, 'base': 'main',
        'body': f'Prepare the changed {package_id} delivery files, aligned version metadata and content lock for the daily OCI channel. Owner verification runs before publication.'})
    head = git(root, 'rev-parse', 'HEAD')
    wait_for_checks(repo, head)
    if gh(f'repos/{repo}/commits/main')['sha'] != base:
        raise ReleaseError('Owner main changed during release preparation; retry from the new source')
    result = gh(f'repos/{repo}/pulls/{pull["number"]}/merge', method='PUT',
                payload={'sha': head, 'merge_method': 'merge'})
    if result.get('merged') is not True:
        raise ReleaseError('Release PR was not merged')
    git(root, 'fetch', 'origin', 'main', '--quiet')
    git(root, 'reset', '--hard', 'origin/main')
    return git(root, 'rev-parse', 'HEAD')

def prepare_owner(root, projection, allowlist, framework, repo, *, apply):
    base = git(root, 'rev-parse', 'HEAD')
    payload = read(framework / 'contracts/opl-framework/packages' /
                   projection['codex_surface']['plugin_payload_manifest_url'])
    settings = owner_settings(root)
    if settings.get('strategy') == 'manual':
        return {'status': 'owner_manual', 'owner_source_commit': base}
    if base == payload['source_commit']:
        return {'status': 'unchanged', 'owner_source_commit': base}
    execute_commands(root, settings, 'prepare')
    if not content_changed(root, payload['source_commit'], projection, allowlist, settings):
        return {'status': 'unchanged_payload', 'owner_source_commit': base}
    carrier = safe_path(root, allowlist['source_root'])
    current = read(carrier / 'opl-package.json')['version']
    previous = projection['version']
    if version_tuple(current) < version_tuple(previous):
        raise ReleaseError('Owner version regresses the Framework selection')
    tag = run(['git', 'rev-parse', '--verify', f'refs/tags/v{current}^{{}}'], cwd=root, check=False)
    tag_matches = tag.returncode == 0 and tag.stdout.strip() == base
    version = current
    if version_tuple(current) == version_tuple(previous) or (tag.returncode == 0 and (not tag_matches or git(root, 'status', '--porcelain'))):
        a, b, c = version_tuple(current)
        version = f'{a}.{b}.{c + 1}'
    if not apply:
        return {'status': 'needs_release', 'version': version, 'owner_source_commit': base}
    git(root, 'config', 'user.name', 'OPL Package Publisher')
    git(root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    wait_for_checks(repo, base)
    update_versions(root, projection, allowlist, settings, version)
    execute_commands(root, settings, 'prepare')
    refresh_locks(root, projection, allowlist, framework)
    execute_commands(root, settings, 'verify')
    if git(root, 'status', '--porcelain'):
        git(root, 'add', '--all')
        git(root, 'commit', '-m', f'chore: prepare Package {version}')
        source = merge_release_changes(root, repo, base, projection['package_id'], version)
    else:
        source = git(root, 'rev-parse', 'HEAD')
    exact_tag = run(['git', 'rev-parse', '--verify', f'refs/tags/v{version}^{{}}'], cwd=root, check=False)
    if exact_tag.returncode == 0 and exact_tag.stdout.strip() != source:
        raise ReleaseError('Existing immutable version tag selects different bytes')
    if exact_tag.returncode:
        git(root, 'tag', '-a', f'v{version}', '-m', f'Package {version}', source)
    # Tags bind the actual merged source; no existing tag is moved.
    git(root, 'push', 'origin', f'refs/tags/v{version}')
    wait_for_checks(repo, source)
    wait_for_release_workflows(repo, source, f'v{version}', settings)
    return {'status': 'prepared', 'version': version, 'owner_source_commit': source}
