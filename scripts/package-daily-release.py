#!/usr/bin/env python3
"""Prepare changed owner Packages and refresh their existing Catalog projections."""
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
from package_release.projection import CATALOG_REPOSITORY, PackageProjection, catalog_root_from
from package_release.v2_projection import prepare_v2_projection


def package_specs(framework, packages=None):
    command = '''import {getPublicationAdmittedOplPackageSpecs} from './src/adapters/integration/package-distribution.ts';
console.log(JSON.stringify(getPublicationAdmittedOplPackageSpecs(process.argv[1])));'''
    arguments = ['node', '--experimental-strip-types', '--input-type=module', '-e', command,
                 packages if packages is not None else PackageProjection(framework).packages]
    return json.loads(run(arguments, cwd=framework).stdout)


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


def refresh_framework_base(checkout, current_commit):
    git(checkout, 'fetch', 'origin', 'main', '--quiet')
    remote_main = git(checkout, 'rev-parse', 'origin/main')
    if remote_main != current_commit and run(
        ['git', 'merge-base', '--is-ancestor', remote_main, current_commit],
        cwd=checkout,
        check=False,
    ).returncode != 0:
        git(checkout, 'reset', '--hard', remote_main)
        return remote_main
    return current_commit


def verify_publisher_checkout(framework, framework_commit, tooling_commit, catalog):
    if git(framework, 'status', '--porcelain'):
        raise ReleaseError('Framework checkout must be clean')
    git(framework, 'fetch', 'origin', 'main', '--quiet')
    if not tooling_commit:
        if git(framework, 'rev-parse', 'origin/main') != framework_commit:
            raise ReleaseError('Framework must select fresh canonical main')
        return

    if not catalog or not re.fullmatch(r'[a-f0-9]{40}', tooling_commit) or framework_commit != tooling_commit:
        raise ReleaseError('Legacy publisher tooling requires an exact Framework commit and the official Catalog')
    controller = Path(__file__).resolve().parents[1]
    controller_commit = git(controller, 'rev-parse', 'HEAD')
    if (os.getenv('GITHUB_REPOSITORY') != 'gaofeng21cn/one-person-lab'
            or os.getenv('GITHUB_REF') != 'refs/heads/main'
            or os.getenv('GITHUB_SHA') != controller_commit):
        raise ReleaseError('Legacy publisher tooling requires the current main workflow checkout')
    if any(run(['git', 'merge-base', '--is-ancestor', older, newer], cwd=framework, check=False).returncode
           for older, newer in ((tooling_commit, controller_commit), (controller_commit, 'origin/main'))):
        raise ReleaseError('Legacy publisher tooling and workflow must select canonical Framework history')


def prepare(args):
    framework = args.framework_root.resolve()
    catalog = catalog_root_from(args)
    paths = PackageProjection(framework, catalog)
    controller = Path(__file__).resolve().parents[1]
    projection_repo = CATALOG_REPOSITORY if catalog else 'gaofeng21cn/one-person-lab'
    framework_commit = git(framework, 'rev-parse', 'HEAD')
    projection_commit = git(catalog, 'rev-parse', 'HEAD') if catalog else framework_commit
    os.environ['OPL_FRAMEWORK_ROOT'] = str(framework)
    if args.apply:
        verify_publisher_checkout(framework, framework_commit, args.publisher_tooling_commit, catalog)
        if catalog:
            if git(catalog, 'status', '--porcelain'):
                raise ReleaseError('Catalog checkout must be clean')
            origin = git(catalog, 'remote', 'get-url', 'origin').removesuffix('.git')
            if origin.lower() not in (f'https://github.com/{CATALOG_REPOSITORY}', f'git@github.com:{CATALOG_REPOSITORY}'):
                raise ReleaseError('Catalog origin must select the official Catalog')
            git(catalog, 'fetch', 'origin', 'main', '--quiet')
            if git(catalog, 'rev-parse', 'origin/main') != projection_commit:
                raise ReleaseError('Catalog must select fresh canonical main')
    specs = package_specs(framework, paths.packages) if catalog else package_specs(framework)
    unknown = set(args.package_id or []) - {s['package_id'] for s in specs}
    if unknown:
        raise ReleaseError('Unregistered Package selection: ' + ', '.join(sorted(unknown)))
    if args.apply:
        configure_token_refresh_from_env()
        git(paths.root, 'config', 'user.name', 'OPL Package Publisher')
        git(paths.root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    results = []
    with tempfile.TemporaryDirectory(prefix='opl-daily-owner-') as temporary:
        for spec in specs:
            pid = spec['package_id']
            if args.package_id and pid not in args.package_id:
                continue
            if args.apply:
                projection_commit = refresh_framework_base(paths.root, projection_commit)
            projection_path = paths.manifest(pid)
            projection = read(projection_path)
            allowlist = read(paths.allowlist(pid))
            repo = slug(projection['source_repo'])
            result = {'package_id': pid, 'owner_repository': repo}
            snapshot_paths = paths.changed_files(pid)
            before = {p: p.read_bytes() for p in snapshot_paths}
            print(f'Checking {pid}', file=sys.stderr, flush=True)
            expected_projection_blobs = None
            try:
                repository = gh(f'repos/{repo}')
                if repository['private'] and projection.get('visibility', 'public') != 'authorized_only':
                    raise ReleaseError('Private source cannot enter a public source archive channel')
                main = gh(f'repos/{repo}/commits/main')['sha']
                v2_release = projection.get('v2_release')
                payload_path = (paths.v2_payload(projection) if v2_release else paths.payload(projection))
                payload = read(payload_path)
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
                    result.update(prepare_owner(root, projection, allowlist, framework, repo,
                                                apply=args.apply, payload_path=payload_path,
                                                v2_controller=controller if catalog else None))
                    candidate = result.pop('candidate', None)
                    if result['status'] == 'prepared':
                        if args.apply:
                            previously_read = ({p: p.read_bytes() for p in
                                                (projection_path, paths.allowlist(pid), payload_path)} if catalog else {})
                            projection_commit = refresh_framework_base(paths.root, projection_commit)
                            snapshot_paths = paths.changed_files(pid)
                            before = {p: p.read_bytes() for p in snapshot_paths}
                            if any(before.get(p) != body for p, body in previously_read.items()):
                                raise ReleaseError('Catalog changed the selected Package during owner preparation')
                        if result.get('package_format') == 'v2':
                            result['projection'] = prepare_v2_projection(
                                controller, paths, root, pid, result['version'], result['owner_source_commit'],
                                candidate=candidate,
                            )
                        else:
                            script = args.flow_root / 'skills/opl-flow/scripts/package_release.py'
                            catalog_args = ['--catalog-root', catalog] if catalog else []
                            prepared = run(['python3', script, 'prepare', '--package-id', pid,
                                            '--owner-root', root, '--framework-root', framework, *catalog_args])
                            result['projection'] = json.loads(prepared.stdout)
                            run(['node', '--experimental-strip-types', 'scripts/package-source-projection-gate.mjs',
                                 '--package-id', pid, '--owner-root', root, '--release-gate', 'tag', *catalog_args], cwd=framework)
                        if args.apply:
                            # Isolate each Package projection PR so one failure leaves healthy packages eligible.
                            stage_paths = [str(p.relative_to(paths.root)) for p in paths.changed_files(pid)]
                            git(paths.root, 'add', '--', *stage_paths)
                            if run(['git', 'diff', '--cached', '--quiet'], cwd=paths.root, check=False).returncode != 0:
                                git(paths.root, 'commit', '-m', f'chore: refresh daily Package {pid} {result["version"]} projection')
                                expected_projection_blobs = {
                                    rel: (paths.root / rel).read_bytes()
                                    for rel in stage_paths
                                    if (paths.root / rel).is_file()
                                }
                                projection_commit = merge_release_changes(
                                    paths.root,
                                    projection_repo,
                                    projection_commit,
                                    f'{"catalog" if catalog else "framework"}-projection-{pid}',
                                    result['version'],
                                )
            except Exception as exc:
                recovered = False
                if args.apply:
                    run(['git', 'reset', '--hard', projection_commit], cwd=paths.root, check=False)
                    for path in paths.changed_files(pid):
                        if path not in before and not git(paths.root, 'ls-files', '--', str(path.relative_to(paths.root))):
                            path.unlink(missing_ok=True)
                    try:
                        projection_commit = refresh_framework_base(paths.root, projection_commit)
                        comparable = (expected_projection_blobs or {}).items()
                        if catalog:
                            comparable = [(rel, body) for rel, body in comparable if rel != 'catalog-index.json']
                        if expected_projection_blobs and all(
                            (paths.root / rel).is_file() and (paths.root / rel).read_bytes() == body for rel, body in comparable
                        ):
                            result['merge_recovered'] = True
                            recovered = True
                    except Exception:
                        pass
                else:
                    for path in paths.changed_files(pid):
                        if path not in before:
                            path.unlink(missing_ok=True)
                    for path, body in before.items():
                        path.write_bytes(body)
                if not recovered:
                    result.update(status='blocked', reason=str(exc)[-3000:])
            results.append(result)
            print(f"{pid}: {result['status']}", file=sys.stderr, flush=True)
    if not catalog:
        framework_commit = projection_commit
    report = {'surface_kind': 'opl_daily_package_preparation.v1',
              'framework_source_commit': framework_commit, 'applied': args.apply, 'packages': results}
    if catalog:
        report['catalog_source_commit'] = projection_commit
    write(args.output, report)
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'framework_source_commit={framework_commit}\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--publisher-tooling-commit', help='Exact pre-v2 Framework commit for the main Package workflow')
    parser.add_argument('--catalog-root', type=Path)
    parser.add_argument('--flow-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--package-id', action='append')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prepare(args), indent=2))

if __name__ == '__main__':
    main()
