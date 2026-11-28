#!/usr/bin/env python3
"""Keep private owner wrappers pinned to the selected canonical Framework publisher."""
from __future__ import annotations
import argparse
import base64
import json
import re
from pathlib import Path
from urllib.parse import quote
from package_release.common import ReleaseError, gh, git, read, run, slug, write
from package_release.projection import PackageProjection, catalog_root_from, package_source_roots


def declares_v2(manifest, allowlist, controller):
    repo = slug(manifest['source_repo'])
    for source_root in package_source_roots(manifest, allowlist):
        descriptor = (Path(source_root) / 'opl-package.json').as_posix()
        try:
            result = gh(f'repos/{repo}/contents/{quote(descriptor)}?ref=main')
        except ReleaseError as exc:
            if 'HTTP 404' in str(exc):
                continue
            raise
        if result.get('type') != 'file' or result.get('encoding') != 'base64':
            continue
        content = base64.b64decode(result['content']).decode()
        value = json.loads(content)
        if not isinstance(value, dict) or value.get('schema_version') != 'opl.package.v2':
            continue
        validated = run([
            'node', '--conditions=opl-source', '--input-type=module', '-e',
            "import { parsePackageManifestV2 } from '@opl/pack';"
            "const { identity } = parsePackageManifestV2(JSON.parse(process.argv[1]));"
            "if (identity.id !== process.argv[2] || !/^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$/.test(identity.version)) process.exit(1);",
            content, manifest['package_id'],
        ], cwd=controller, check=False)
        return validated.returncode == 0
    return False


def wrapper(package_id, commit, *, catalog=True):
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
    if not catalog:
        raise ReleaseError('Private publisher synchronization requires the official Catalog')
    if controller_source_commit is not None and not re.fullmatch(r'[a-f0-9]{40}', controller_source_commit):
        raise ReleaseError('Private publisher synchronization requires an exact controller source commit')
    commit = controller_source_commit or git(root, 'rev-parse', 'HEAD')
    controller = Path(__file__).resolve().parents[1]
    results = []
    paths = PackageProjection(root, catalog)
    for path in paths.manifest_paths():
        manifest = read(path)
        package_id = manifest['package_id']
        if manifest.get('visibility') != 'authorized_only' or (selected and package_id not in selected):
            continue
        result = {'package_id': package_id}
        try:
            allowlist_path = paths.allowlist(package_id)
            allowlist = read(allowlist_path) if allowlist_path.is_file() else {}
            if manifest.get('v2_release') is None and not declares_v2(manifest, allowlist, controller):
                raise ReleaseError('Private Package publication requires an opl.package.v2 descriptor or Catalog v2_release')
            result['status'] = sync_publisher(manifest, commit, catalog=True)
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
    parser.add_argument('--catalog-root', type=Path, required=True)
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
