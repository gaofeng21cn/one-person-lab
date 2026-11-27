#!/usr/bin/env python3
"""Prepare first-party product releases and hand off to their native publishers."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import plistlib
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from package_release.common import ReleaseError, gh, git, read, run, safe_path, version_tuple, write
from package_release.owner import merge_release_changes, update_version_files, wait_for_checks
from package_release.product_status import observe_lanes

FRAMEWORK = Path(__file__).resolve().parents[1]


def settings(root):
    value = read(root / 'product-release.json')
    if value.get('schema_version') != 'opl.product-release.v1':
        raise ReleaseError('Unsupported product release contract')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', value.get('product_id', '')):
        raise ReleaseError('Invalid product identity')
    if not re.fullmatch(r'gaofeng21cn/[A-Za-z0-9_.-]+', value.get('repository', '')):
        raise ReleaseError('Invalid product repository')
    if value.get('strategy') not in ('daily_patch', 'owner_schedule'):
        raise ReleaseError('Unsupported product release strategy')
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.ya?ml', value.get('publisher_workflow', '')):
        raise ReleaseError('Invalid owner publisher workflow')
    if value.get('trigger') not in ('tag', 'owner_schedule'):
        raise ReleaseError('Unsupported product release trigger')
    workflows = value.get('source_check_workflows')
    if workflows is not None and (not isinstance(workflows, list) or not workflows
            or not all(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_-]+\.ya?ml', name) for name in workflows)
            or len(set(workflows)) != len(workflows)):
        raise ReleaseError('Source check workflows must be unique owner workflow filenames')
    observed = value.get('observed_publishers', [])
    if not isinstance(observed, list) or any(
            not isinstance(item, dict) or
            not re.fullmatch(r'[a-z0-9][a-z0-9-]*', item.get('lane', '')) or
            not re.fullmatch(r'[A-Za-z0-9_-]+\.ya?ml', item.get('workflow', ''))
            for item in observed):
        raise ReleaseError('Observed publisher lanes are invalid')
    lanes = [value.get('primary_lane', 'stable'), *(item['lane'] for item in observed)]
    if len(set(lanes)) != len(lanes):
        raise ReleaseError('Product publisher lane identities must be unique')
    if value['strategy'] == 'owner_schedule':
        return value
    paths = value.get('release_paths')
    if not isinstance(paths, list) or not paths or not all(isinstance(p, str) and p for p in paths):
        raise ReleaseError('Product must declare delivery paths')
    for name in paths:
        safe_path(root, name)
    for stage in ('prepare', 'verify'):
        for command in value.get(stage, []):
            if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
                raise ReleaseError('Release commands must be argument arrays')
    for key in ('tag_prefix', 'tag_suffix'):
        if not re.fullmatch(r'[A-Za-z0-9._-]*', value.get(key, '')):
            raise ReleaseError('Invalid product tag format')
    return value


def current_version(root, config):
    item = config['version_file']
    path = safe_path(root, item['path'])
    if item['kind'] == 'plist_bundle':
        result = plistlib.loads(path.read_bytes())['CFBundleShortVersionString']
    else:
        result = read(path)['version']
    version_tuple(result)
    return result


def tag_for(config, version):
    return config.get('tag_prefix', 'v') + version + config.get('tag_suffix', '')


def framework_channel():
    repository = 'gaofeng21cn/one-person-lab-framework'
    url = 'https://ghcr.io/token?' + urllib.parse.urlencode({'service': 'ghcr.io', 'scope': f'repository:{repository}:pull'})
    with urllib.request.urlopen(url, timeout=30) as response:
        token = json.load(response)['token']
    request = urllib.request.Request(f'https://ghcr.io/v2/{repository}/manifests/latest-stable', headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.oci.image.manifest.v1+json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()
        digest = response.headers['Docker-Content-Digest']
    if digest != 'sha256:' + hashlib.sha256(data).hexdigest():
        raise ReleaseError('Framework channel manifest digest differs')
    annotations = json.loads(data)['annotations']
    return {'version': annotations['org.opencontainers.image.version'],
            'source_commit': annotations['org.opencontainers.image.revision'], 'digest': digest}


def published(root, config):
    if config['channel']['kind'] == 'framework_oci':
        return framework_channel()
    response = run(['gh', 'api', f"repos/{config['repository']}/releases/latest"], check=False, timeout=60)
    if response.returncode:
        # Repository accessibility was established before this read. Do not mask denial.
        if 'HTTP 404' in response.stderr:
            return None
        raise ReleaseError('Cannot read the product stable release')
    release = json.loads(response.stdout)
    tag = release['tag_name']
    prefix, suffix = config.get('tag_prefix', 'v'), config.get('tag_suffix', '')
    if not tag.startswith(prefix) or (suffix and not tag.endswith(suffix)) or release['draft'] or release['prerelease']:
        raise ReleaseError('Latest product release has an unexpected channel or tag')
    version = tag[len(prefix):len(tag) - len(suffix) if suffix else None]
    version_tuple(version)
    return {'version': version, 'source_commit': git(root, 'rev-parse', f'{tag}^{{commit}}'),
            'tag': tag, 'url': release['html_url']}


def delivery_changed(root, base, config):
    result = run(['git', 'diff', '--quiet', base, 'HEAD', '--', *config['release_paths']], cwd=root, check=False)
    if result.returncode not in (0, 1):
        raise ReleaseError('Cannot compare product delivery bytes')
    return result.returncode == 1


def plan(root, config, channel):
    source = git(root, 'rev-parse', 'HEAD')
    current = current_version(root, config)
    if channel:
        version_tuple(channel['version'])
        if run(['git', 'merge-base', '--is-ancestor', channel['source_commit'], source], cwd=root, check=False).returncode:
            raise ReleaseError('Published product source is not an ancestor of main')
        if not delivery_changed(root, channel['source_commit'], config):
            return {'status': 'unchanged', 'version': channel['version'], 'source_commit': channel['source_commit']}
        if version_tuple(current) < version_tuple(channel['version']):
            raise ReleaseError('Product version regresses the stable channel')
        if current == channel['version']:
            a, b, c = version_tuple(current)
            current = f'{a}.{b}.{c + 1}'
    while True:
        tag = tag_for(config, current)
        existing = run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}^{{commit}}'], cwd=root, check=False)
        if existing.returncode:
            return {'status': 'needs_release', 'version': current, 'tag': tag, 'source_commit': source}
        frozen = existing.stdout.strip()
        if not run(['git', 'merge-base', '--is-ancestor', frozen, source], cwd=root, check=False).returncode and not delivery_changed(root, frozen, config):
            return {'status': 'resume', 'version': current, 'tag': tag, 'source_commit': frozen}
        a, b, c = version_tuple(current)
        current = f'{a}.{b}.{c + 1}'


def _publisher_run(config, workflow, source, tag):
    runs = gh(f"repos/{config['repository']}/actions/workflows/{workflow}/runs?head_sha={source}&per_page=100")['workflow_runs']
    matches = [r for r in runs if r['head_sha'] == source and r['head_branch'] == tag and r['event'] in ('push', 'workflow_dispatch')]
    if not matches:
        return None
    item = max(matches, key=lambda row: row['id'])
    status = 'publisher_' + (item['conclusion'] if item['status'] == 'completed' else item['status'])
    return {'status': status, 'run_id': item['id'], 'run_url': item['html_url']}


def publisher_status(config, tag, source):
    primary = _publisher_run(config, config['publisher_workflow'], source, tag)
    result = primary or {'status': 'tag_submitted'}
    if result['status'] == 'publisher_success' and config.get('publication_stage') == 'candidate_until_device_qualification':
        result['status'] = 'qualification_pending'
    return result


def prepare(root, config, *, apply):
    repo = config['repository']
    if os.getenv('EXPECTED_PRODUCT', config['product_id']) != config['product_id'] or os.getenv('EXPECTED_REPOSITORY', repo) != repo:
        raise ReleaseError('Product contract differs from the selected owner')
    origin = git(root, 'remote', 'get-url', 'origin')
    if origin.removesuffix('.git') not in ('https://github.com/' + repo, 'ssh://git@ssh.github.com:443/' + repo, 'git@github.com:' + repo):
        raise ReleaseError('Checkout origin differs from the product owner')
    if gh(f'repos/{repo}')['archived']:
        raise ReleaseError('Product owner is archived')
    if config['strategy'] == 'owner_schedule':
        return {'status': 'owner_schedule'}
    if git(root, 'status', '--porcelain'):
        raise ReleaseError('Product release checkout must be clean')
    git(root, 'fetch', 'origin', 'main', '--tags', '--quiet')
    base = git(root, 'rev-parse', 'HEAD')
    if base != git(root, 'rev-parse', 'origin/main'):
        raise ReleaseError('Product release requires fresh canonical main')
    channel = published(root, config)
    result = plan(root, config, channel)
    if result['status'] == 'unchanged':
        return {**result, 'published_channel': channel}
    if not apply:
        if result['status'] == 'resume':
            result.update(publisher_status(config, result['tag'], result['source_commit']))
        return {**result, 'published_channel': channel}
    if result['status'] != 'resume':
        # Framework publishes itself: its current controller check is not source
        # verification and must not wait for its own completion.
        suite = None
        if os.getenv('GITHUB_REPOSITORY') == repo and os.getenv('GITHUB_RUN_ID'):
            suite = gh(f"repos/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}")['check_suite_id']
        wait_for_checks(repo, base, ignored_check_suite_id=suite,
                        source_workflows=config.get('source_check_workflows'))
        git(root, 'config', 'user.name', 'OPL Package Publisher')
        git(root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        update_version_files(root, config.get('version_files', [config['version_file']]), result['version'])
        os.environ['OPL_RELEASE_VERSION'] = result['version']
        for stage in ('prepare', 'verify'):
            for command in config.get(stage, []):
                run(command, cwd=root)
        if git(root, 'status', '--porcelain'):
            git(root, 'add', '--all')
            git(root, 'commit', '-m', f"chore: prepare {config['product_id']} {result['version']}")
            result['source_commit'] = merge_release_changes(root, repo, base, config['product_id'], result['version'], delivery_kind='product')
        git(root, 'tag', '-a', result['tag'], '-m', f"{config['product_id']} {result['version']}", result['source_commit'])
        git(root, 'push', 'origin', f"refs/tags/{result['tag']}")
    else:
        # A failed or interrupted publisher resumes the original frozen tag.
        state = publisher_status(config, result['tag'], result['source_commit'])
        if state['status'] in ('publisher_failure', 'publisher_cancelled', 'publisher_timed_out'):
            gh(f"repos/{repo}/actions/runs/{state['run_id']}/rerun-failed-jobs", method='POST')
            state['status'] = 'publisher_retry_submitted'
        elif state['status'] == 'publisher_success' and config.get('recheck_after_success'):
            gh(f"repos/{repo}/actions/runs/{state['run_id']}/rerun", method='POST')
            state['status'] = 'qualification_recheck_submitted'
        result.update(state)
        result['published_channel'] = published(root, config) if state['status'] == 'publisher_success' else channel
        return result
    result.update(publisher_status(config, result['tag'], result['source_commit']))
    result['published_channel'] = published(root, config) if result['status'] == 'publisher_success' else channel
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner-root', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--cohort-id', default='')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = {'schema_version': 'opl.product-release-result.v1', 'applied': args.apply}
    if expected := os.getenv('EXPECTED_PRODUCT'):
        report.update(product_id=expected, repository=os.getenv('EXPECTED_REPOSITORY'))
    if args.cohort_id:
        if not re.fullmatch(r'opl-daily-[1-9][0-9]*', args.cohort_id):
            raise SystemExit('Invalid release cohort id')
        report['cohort_id'] = args.cohort_id
    try:
        config = settings(args.owner_root)
        report.update(product_id=config['product_id'], repository=config['repository'])
        report['main_commit'] = git(args.owner_root, 'rev-parse', 'HEAD')
        report.update(prepare(args.owner_root, config, apply=args.apply))
        report['lanes'] = observe_lanes(config, report)
    except Exception as exc:
        report.update(status='blocked', reason=str(exc)[-3000:])
    write(args.output, report)
    print(json.dumps(report, indent=2))
    summary = os.getenv('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as stream:
            stream.write(f"### {report.get('product_id', 'Product')}\n\nStatus: `{report['status']}`.\n")
            if report.get('run_url'):
                stream.write(f"\n[Owner publisher]({report['run_url']})\n")
            if report.get('reason'):
                stream.write('\n' + report['reason'] + '\n')
    return 1 if report['status'] == 'blocked' else 0


if __name__ == '__main__':
    raise SystemExit(main())
