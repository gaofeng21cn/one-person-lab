#!/usr/bin/env python3
"""Keep private owner wrappers pinned to the selected canonical Framework publisher."""
from __future__ import annotations
import argparse
import base64
import json
from pathlib import Path
from package_release.common import ReleaseError, gh, git, read, slug


def wrapper(package_id, commit):
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
    text += '''      automation_source_run_id:
        required: false
        default: ''
        type: string

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
    for key in fields + ['automation_source_run_id']:
        text += '      ' + key + ': ${{ inputs.' + key + ' }}\n'
    return text + '    secrets: inherit\n'


def sync(root, selected=None):
    commit = git(root, 'rev-parse', 'HEAD')
    results = []
    for path in sorted((root / 'contracts/opl-framework/packages').glob('*.json')):
        manifest = read(path)
        if manifest.get('visibility') != 'authorized_only' or (selected and manifest['package_id'] not in selected):
            continue
        repo = slug(manifest['source_repo'])
        endpoint = f'repos/{repo}/contents/.github/workflows/publish-package.yml'
        try:
            previous = gh(endpoint + '?ref=main')
        except ReleaseError as exc:
            gh(f'repos/{repo}')
            if 'HTTP 404' not in str(exc):
                raise
            previous = None
        text = wrapper(manifest['package_id'], commit)
        if previous and base64.b64decode(previous['content']).decode() == text:
            results.append({'package_id': manifest['package_id'], 'status': 'unchanged'})
            continue
        payload = {'message': 'ci: synchronize the private Package publisher', 'branch': 'main',
                   'content': base64.b64encode(text.encode()).decode()}
        if previous:
            payload['sha'] = previous['sha']
        gh(endpoint, method='PUT', payload=payload)
        results.append({'package_id': manifest['package_id'], 'status': 'synchronized'})
    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--package-id', action='append')
    args = parser.parse_args()
    print(json.dumps(sync(args.framework_root, args.package_id), indent=2))
