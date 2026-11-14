#!/usr/bin/env python3
"""Prepare changed owner Packages and refresh their existing Framework projections."""
from __future__ import annotations
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from package_release.common import ReleaseError, gh, git, read, run, slug, write
from package_release.owner import prepare_owner, merge_release_changes


def package_specs(framework):
    command = '''import {getPublicationAdmittedOplPackageSpecs} from './src/adapters/integration/package-distribution.ts';
console.log(JSON.stringify(getPublicationAdmittedOplPackageSpecs()));'''
    return json.loads(run(['node', '--experimental-strip-types', '--input-type=module', '-e', command], cwd=framework).stdout)


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
    results = []
    with tempfile.TemporaryDirectory(prefix='opl-daily-owner-') as temporary:
        for spec in specs:
            pid = spec['package_id']
            if args.package_id and pid not in args.package_id:
                continue
            projection_path = framework / 'contracts/opl-framework/packages' / f'{pid}.json'
            projection = read(projection_path)
            allowlist = read(framework / 'contracts/opl-framework/package-payload-allowlists' / f'{pid}.json')
            repo = slug(projection['source_repo'])
            result = {'package_id': pid, 'owner_repository': repo}
            snapshot_paths = [projection_path, framework / 'contracts/opl-framework/package-payload-allowlists' / f'{pid}.json',
                              *projection_path.parent.glob(f'payloads/{pid}-*.json')]
            before = {p: p.read_bytes() for p in snapshot_paths}
            print(f'Checking {pid}', file=sys.stderr, flush=True)
            try:
                repository = gh(f'repos/{repo}')
                if repository['private'] and projection.get('visibility', 'public') != 'authorized_only':
                    raise ReleaseError('Private source cannot enter a public source archive channel')
                main = gh(f'repos/{repo}/commits/main')['sha']
                payload = read(projection_path.parent / projection['codex_surface']['plugin_payload_manifest_url'])
                if main == payload['source_commit']:
                    result.update(status='unchanged', owner_source_commit=main)
                else:
                    root = Path(temporary) / pid
                    run(['git', 'clone', '--filter=blob:none', '--branch', 'main', '--single-branch',
                         '--quiet', projection['source_repo'], root])
                    git(root, 'fetch', 'origin', '--tags', '--quiet')
                    result.update(prepare_owner(root, projection, allowlist, framework, repo, apply=args.apply))
                    if result['status'] == 'prepared':
                        script = args.flow_root / 'skills/opl-flow/scripts/package_release.py'
                        prepared = run(['python3', script, 'prepare', '--package-id', pid,
                                        '--owner-root', root, '--framework-root', framework])
                        result['projection'] = json.loads(prepared.stdout)
                        run(['node', '--experimental-strip-types', 'scripts/package-source-projection-gate.mjs',
                             '--package-id', pid, '--owner-root', root, '--release-gate', 'tag'], cwd=framework)
            except Exception as exc:
                for path in projection_path.parent.glob(f'payloads/{pid}-*.json'):
                    if path not in before:
                        path.unlink()
                for path, body in before.items():
                    path.write_bytes(body)
                result.update(status='blocked', reason=str(exc)[-3000:])
            results.append(result)
            print(f"{pid}: {result['status']}", file=sys.stderr, flush=True)
    updated = [r for r in results if r['status'] == 'prepared']
    if args.apply and updated:
        # Projection files share a short fast-forward boundary; owner preparation stays independent.
        git(framework, 'config', 'user.name', 'OPL Package Publisher')
        git(framework, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        git(framework, 'add', 'contracts/opl-framework/packages', 'contracts/opl-framework/package-payload-allowlists')
        git(framework, 'commit', '-m', 'chore: refresh daily Package release projections')
        framework_commit = merge_release_changes(framework, 'gaofeng21cn/one-person-lab',
            framework_commit, 'framework-projections', 'daily')
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
