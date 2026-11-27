#!/usr/bin/env python3
"""Keep private owner wrappers pinned to the selected canonical Framework publisher."""
from __future__ import annotations
import argparse
import base64
import json
import re
from pathlib import Path
from package_release.common import ReleaseError, gh, git, read, slug, write
from package_release.projection import PackageProjection, catalog_root_from


def wrapper(package_id, commit, *, catalog=False):
    fields = ['expected_package_version', 'expected_owner_source_commit',
              'expected_latest_stable_predecessor', 'publication_request_id']
    text = f'''name: Publish private {package_id} Package
run-name: Package {package_id} ${{{{ inputs.expected_package_version }}}} / ${{{{ inputs.publication_request_id }}}}

on:
  workflow_dispatch:
    inputs:
'''
    for key in fields:
        text += f'      {key}:\n        required: true\n        type: string\n'
    optional_fields = ['automation_source_run_id']
    if catalog:
        optional_fields.append('expected_catalog_source_commit')
    for key in optional_fields:
        text += f"      {key}:\n        required: false\n        default: ''\n        type: string\n"
    text += '''
permissions:
  contents: read
  actions: read
  packages: write
  id-token: write

jobs:
  publish-package:
    if: github.ref == 'refs/heads/main'
'''
    text += f'    uses: gaofeng21cn/one-person-lab/.github/workflows/publish-package.yml@{commit}\n'
    text += f'    with:\n      package_id: {package_id}\n      expected_framework_source_commit: {commit}\n'
    for key in fields + optional_fields:
        text += '      ' + key + ': ${{ inputs.' + key + ' }}\n'
    return text + '    secrets: inherit\n'


def sync_publisher(manifest, commit, *, catalog):
    repo = slug(manifest['source_repo'])
    endpoint = f'repos/{repo}/contents/.github/workflows/publish-package.yml'
    try:
        previous = gh(endpoint + '?ref=main')
    except ReleaseError as exc:
        if 'HTTP 404' not in str(exc):
            raise
        gh(f'repos/{repo}')
        previous = None
    text = wrapper(manifest['package_id'], commit, catalog=catalog)
    if previous and base64.b64decode(previous['content']).decode() == text:
        return 'unchanged'
    payload = {'message': 'ci: synchronize the private Package publisher', 'branch': 'main',
               'content': base64.b64encode(text.encode()).decode()}
    if previous:
        payload['sha'] = previous['sha']
    try:
        gh(endpoint, method='PUT', payload=payload)
    except Exception as exc:
        # A lost PUT response does not establish that GitHub rejected the write.
        try:
            observed = gh(endpoint + '?ref=main')
            if base64.b64decode(observed['content']).decode() == text:
                return 'synchronized'
        except Exception:
            pass
        raise exc
    return 'synchronized'


def sync(root, selected=None, *, catalog=None, controller_source_commit=None):
    if controller_source_commit is not None and not re.fullmatch(r'[a-f0-9]{40}', controller_source_commit):
        raise ReleaseError('Private publisher synchronization requires an exact controller source commit')
    legacy_commit = git(root, 'rev-parse', 'HEAD')
    results = []
    for path in PackageProjection(root, catalog).manifest_paths():
        manifest = read(path)
        package_id = manifest['package_id']
        if manifest.get('visibility') != 'authorized_only' or (selected and package_id not in selected):
            continue
        result = {'package_id': package_id}
        try:
            commit = controller_source_commit if manifest.get('v2_release') is not None else legacy_commit
            if not commit:
                raise ReleaseError('The v2 private publisher requires the controller source commit')
            result['status'] = sync_publisher(manifest, commit, catalog=catalog is not None)
        except Exception as exc:
            result.update(status='blocked', reason=f'Private publisher pin synchronization failed: {str(exc)[-1000:]}')
        results.append(result)
    return results


def record_blocked_pins(preparation_path, results):
    preparation = read(preparation_path)
    packages = preparation['packages']
    by_id = {row['package_id']: row for row in packages}
    for result in results:
        if result['status'] != 'blocked':
            continue
        row = by_id.get(result['package_id'])
        if row is None:
            packages.append(result)
        elif row['status'] != 'blocked':
            row.update(result)
    write(preparation_path, preparation)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--controller-source-commit')
    parser.add_argument('--catalog-root', type=Path)
    parser.add_argument('--package-id', action='append')
    parser.add_argument('--preparation', type=Path, help='Preparation report receiving Package-local failures')
    args = parser.parse_args()
    results = sync(args.framework_root, args.package_id, catalog=catalog_root_from(args),
                   controller_source_commit=args.controller_source_commit)
    if args.preparation:
        record_blocked_pins(args.preparation, results)
    print(json.dumps(results, indent=2))
    if not args.preparation and any(row['status'] == 'blocked' for row in results):
        raise SystemExit(1)
