#!/usr/bin/env python3
"""Prepare changed owner Packages and refresh their existing Framework projections."""
from __future__ import annotations
import argparse
import base64
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from package_release.common import ReleaseError, gh, git, read, run, slug, write
from package_release.github_app_token import configure_token_refresh_from_env
from package_release.owner import prepare_owner, merge_release_changes


def package_specs(framework):
    command = '''import {getPublicationAdmittedOplPackageSpecs} from './src/adapters/integration/package-distribution.ts';
console.log(JSON.stringify(getPublicationAdmittedOplPackageSpecs()));'''
    return json.loads(run(['node', '--experimental-strip-types', '--input-type=module', '-e', command], cwd=framework).stdout)


def changed_owner_files(repo, previous, current):
    if not all(isinstance(commit, str) and re.fullmatch(r'[a-f0-9]{40}', commit)
               for commit in (previous, current)):
        raise ReleaseError('Owner comparison requires exact source commits')
    try:
        difference = gh(f'repos/{repo}/compare/{previous}...{current}')
    except ReleaseError as exc:
        message = str(exc)
        if f'No common ancestor between {previous} and {current}.' not in message or '(HTTP 404)' not in message:
            raise
        # A retained payload may predate the owner's current Git lineage. Verify
        # both immutable sources before bypassing only the compare optimization.
        for commit in (previous, current):
            observed = gh(f'repos/{repo}/commits/{commit}')
            if not isinstance(observed, dict) or observed.get('sha') != commit:
                raise ReleaseError('Owner comparison source does not match the exact commit')
        return None
    return [row['filename'] for row in difference.get('files', [])]


def refresh_framework_base(framework, current_commit):
    git(framework, 'fetch', 'origin', 'main', '--quiet')
    remote_main = git(framework, 'rev-parse', 'origin/main')
    if remote_main != current_commit and run(
        ['git', 'merge-base', '--is-ancestor', remote_main, current_commit],
        cwd=framework,
        check=False,
    ).returncode != 0:
        git(framework, 'reset', '--hard', remote_main)
        return remote_main
    return current_commit


def prepare(args):
    framework = args.framework_root.resolve()
    framework_commit = git(framework, 'rev-parse', 'HEAD')
    os.environ['OPL_FRAMEWORK_ROOT'] = str(framework)
    if args.apply:
        if git(framework, 'status', '--porcelain'):
            raise ReleaseError('Framework checkout must be clean')
        git(framework, 'fetch', 'origin', 'main', '--quiet')
        if git(framework, 'rev-parse', 'origin/main') != framework_commit:
            raise ReleaseError('Framework must select fresh canonical main')
    specs = package_specs(framework)
    unknown = set(args.package_id or []) - {s['package_id'] for s in specs}
    if unknown:
        raise ReleaseError('Unregistered Package selection: ' + ', '.join(sorted(unknown)))
    if args.apply:
        configure_token_refresh_from_env()
        git(framework, 'config', 'user.name', 'OPL Package Publisher')
        git(framework, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    results = []
    with tempfile.TemporaryDirectory(prefix='opl-daily-owner-') as temporary:
        for spec in specs:
            pid = spec['package_id']
            if args.package_id and pid not in args.package_id:
                continue
            if args.apply:
                framework_commit = refresh_framework_base(framework, framework_commit)
            projection_path = framework / 'contracts/opl-framework/packages' / f'{pid}.json'
            projection = read(projection_path)
            allowlist = read(framework / 'contracts/opl-framework/package-payload-allowlists' / f'{pid}.json')
            repo = slug(projection['source_repo'])
            result = {'package_id': pid, 'owner_repository': repo}
            snapshot_paths = [projection_path, framework / 'contracts/opl-framework/package-payload-allowlists' / f'{pid}.json',
                              *projection_path.parent.glob(f'payloads/{pid}-*.json')]
            before = {p: p.read_bytes() for p in snapshot_paths}
            print(f'Checking {pid}', file=sys.stderr, flush=True)
            expected_projection_blobs = None
            try:
                repository = gh(f'repos/{repo}')
                if repository['private'] and projection.get('visibility', 'public') != 'authorized_only':
                    raise ReleaseError('Private source cannot enter a public source archive channel')
                main = gh(f'repos/{repo}/commits/main')['sha']
                payload = read(projection_path.parent / projection['codex_surface']['plugin_payload_manifest_url'])
                if main == payload['source_commit']:
                    result.update(status='unchanged', owner_source_commit=main)
                else:
                    files = changed_owner_files(repo, payload['source_commit'], main)
                    if files and len(files) < 300 and all(name == 'release-automation.json' or name.startswith('.github/') for name in files):
                        remote_settings = gh(f'repos/{repo}/contents/release-automation.json?ref={main}')
                        settings = json.loads(base64.b64decode(remote_settings['content']))
                        product_paths = settings.get('release_paths', [])
                        product_paths += [f'.github/workflows/{name}' for name in settings.get('release_workflows', [])]
                        if not any(name == p or name.startswith(p.rstrip('/') + '/') for name in files for p in product_paths):
                            result.update(status='unchanged_payload', owner_source_commit=main)
                            results.append(result)
                            continue
                    root = Path(temporary) / pid
                    run(['git', 'clone', '--filter=blob:none', '--branch', 'main', '--single-branch',
                         '--quiet', projection['source_repo'], root])
                    git(root, 'fetch', 'origin', '--tags', '--quiet')
                    if files is None:
                        # Single-branch clones omit unrelated retained history;
                        # fetch the exact predecessor for the owner's byte check.
                        git(root, 'fetch', 'origin', payload['source_commit'], '--quiet')
                    result.update(prepare_owner(root, projection, allowlist, framework, repo, apply=args.apply))
                    if result['status'] == 'prepared':
                        if args.apply:
                            framework_commit = refresh_framework_base(framework, framework_commit)
                            snapshot_paths = [
                                projection_path,
                                framework / 'contracts/opl-framework/package-payload-allowlists' / f'{pid}.json',
                                *projection_path.parent.glob(f'payloads/{pid}-*.json'),
                            ]
                            before = {p: p.read_bytes() for p in snapshot_paths}
                        script = args.flow_root / 'skills/opl-flow/scripts/package_release.py'
                        prepared = run(['python3', script, 'prepare', '--package-id', pid,
                                        '--owner-root', root, '--framework-root', framework])
                        result['projection'] = json.loads(prepared.stdout)
                        run(['node', '--experimental-strip-types', 'scripts/package-source-projection-gate.mjs',
                             '--package-id', pid, '--owner-root', root, '--release-gate', 'tag'], cwd=framework)
                        if args.apply:
                            # Isolate each package's Framework projection PR so one failure never blocks healthy packages.
                            stage_paths = [
                                f'contracts/opl-framework/packages/{pid}.json',
                                f'contracts/opl-framework/package-payload-allowlists/{pid}.json',
                                *[str(p.relative_to(framework)) for p in projection_path.parent.glob(f'payloads/{pid}-*.json')],
                            ]
                            git(framework, 'add', '--', *stage_paths)
                            if run(['git', 'diff', '--cached', '--quiet'], cwd=framework, check=False).returncode != 0:
                                git(framework, 'commit', '-m', f'chore: refresh daily Package {pid} {result["version"]} projection')
                                expected_projection_blobs = {
                                    rel: (framework / rel).read_bytes()
                                    for rel in stage_paths
                                    if (framework / rel).is_file()
                                }
                                framework_commit = merge_release_changes(
                                    framework,
                                    'gaofeng21cn/one-person-lab',
                                    framework_commit,
                                    f'framework-projection-{pid}',
                                    result['version'],
                                )
            except Exception as exc:
                recovered = False
                if args.apply:
                    run(['git', 'reset', '--hard', framework_commit], cwd=framework, check=False)
                    for path in projection_path.parent.glob(f'payloads/{pid}-*.json'):
                        if path not in before:
                            path.unlink()
                    try:
                        framework_commit = refresh_framework_base(framework, framework_commit)
                        if expected_projection_blobs and all(
                            (framework / rel).is_file() and (framework / rel).read_bytes() == body
                            for rel, body in expected_projection_blobs.items()
                        ):
                            result['merge_recovered'] = True
                            recovered = True
                    except Exception:
                        pass
                else:
                    for path in projection_path.parent.glob(f'payloads/{pid}-*.json'):
                        if path not in before:
                            path.unlink()
                    for path, body in before.items():
                        path.write_bytes(body)
                if not recovered:
                    result.update(status='blocked', reason=str(exc)[-3000:])
            results.append(result)
            print(f"{pid}: {result['status']}", file=sys.stderr, flush=True)
    report = {'surface_kind': 'opl_daily_package_preparation.v1',
              'framework_source_commit': framework_commit, 'applied': args.apply, 'packages': results}
    write(args.output, report)
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'framework_source_commit={framework_commit}\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--flow-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--package-id', action='append')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prepare(args), indent=2))

if __name__ == '__main__':
    main()
