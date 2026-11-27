#!/usr/bin/env python3
"""Build an independently executable plan for each registered Package channel."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from package_release.common import ReleaseError, gh, git, read, run, safe_path, slug, write
from package_release.channels import public_channel, publication_entry
from package_release.projection import PackageProjection, catalog_root_from


def read_selected_release(paths, package_id, legacy_fingerprint=None):
    manifest = read(paths.manifest(package_id))
    facet = manifest.get('v2_release')
    if facet is None:
        payload = read(paths.payload(manifest))
        if (payload.get('package_id') != package_id or payload.get('package_version') != manifest['version']
                or payload.get('source_commit') != manifest['codex_surface']['carrier_source_commit']
                or payload.get('source_repo') != manifest['source_repo']
                or payload.get('package_format', 'v1') != 'v1'):
            raise ReleaseError('Package payload does not match its selected legacy Catalog release')
        fingerprint = {'package_version': payload['package_version'], 'owner_source_commit': payload['source_commit']}
        if legacy_fingerprint is not None:
            fingerprint['package_content_digest'] = payload['content_lock']['digest']
            if fingerprint != legacy_fingerprint:
                raise ReleaseError('Package payload differs from the legacy candidate fingerprint')
        return manifest, fingerprint, 'v1'

    if not paths.catalog or not isinstance(facet, dict):
        raise ReleaseError('V2 Package publication requires a Catalog release facet')
    version = facet.get('version') or ''
    if (not isinstance(version, str) or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version)
            or facet.get('payload_manifest_ref') != f'payloads/{package_id}-{version}.json'):
        raise ReleaseError('V2 Package release has no canonical payload path')
    payload_bytes = safe_path(paths.packages, facet['payload_manifest_ref']).read_bytes()
    if facet.get('payload_sha256') != 'sha256:' + hashlib.sha256(payload_bytes).hexdigest():
        raise ReleaseError('V2 Package payload bytes differ from the Catalog digest')
    payload = json.loads(payload_bytes)
    source = facet.get('source_commit') or ''
    if (not isinstance(source, str) or not re.fullmatch(r'[a-f0-9]{40}', source)
            or payload.get('package_format') != 'v2'
            or payload.get('package_id') != package_id or payload.get('package_version') != version
            or payload.get('source_commit') != source or payload.get('source_repo') != manifest['source_repo']):
        raise ReleaseError('V2 Package payload does not match its selected Catalog release')
    archive_digest = payload.get('archive_sha256')
    content_digest = (payload.get('content_lock') or {}).get('digest')
    if not all(isinstance(value, str) and re.fullmatch(r'sha256:[a-f0-9]{64}', value)
               for value in (archive_digest, content_digest)):
        raise ReleaseError('V2 Package payload has no frozen archive or content digest')
    return manifest, {
        'package_version': version,
        'owner_source_commit': source,
        'package_content_digest': content_digest,
    }, 'v2'


def planned_entry(package_id, selected_release, predecessor, legacy_commit, controller_commit):
    manifest, fingerprint, package_format = selected_release
    if package_format == 'v2' and not controller_commit:
        raise ReleaseError('V2 Package publication requires an exact controller commit')
    entry = publication_entry(package_id, manifest, fingerprint, predecessor,
                              controller_commit if package_format == 'v2' else legacy_commit)
    if package_format == 'v2':
        entry['package_format'] = package_format
    return entry

def detect(args):
    root = args.framework_root.resolve()
    catalog = catalog_root_from(args)
    paths = PackageProjection(root, catalog)
    output = args.output_root.resolve()
    output.mkdir(parents=True, exist_ok=True)
    commit = git(root, 'rev-parse', 'HEAD')
    controller_commit = args.controller_source_commit
    workflow_commit = os.getenv('GITHUB_SHA')
    if controller_commit and (not re.fullmatch(r'[a-f0-9]{40}', controller_commit)
                              or (workflow_commit and workflow_commit != controller_commit)):
        raise ReleaseError('Publisher controller must match the exact workflow source commit')
    catalog_commit = git(catalog, 'rev-parse', 'HEAD') if catalog else None
    summary = json.loads(run(['node', '--experimental-strip-types', '--input-type=module', '-e',
        "import {buildDailyPackageCandidates} from './scripts/package-channel-candidates.mjs';"
        "import {getPublicationAdmittedOplPackageSpecs} from './src/adapters/integration/package-distribution.ts';"
        "const root = process.argv[1];"
        "console.log(JSON.stringify(buildDailyPackageCandidates(getPublicationAdmittedOplPackageSpecs(root), root)));",
        paths.packages], cwd=root).stdout)
    selected = set(summary['candidate_fingerprint']) | set(summary['owner_managed_packages'])
    unknown = set(args.package_id or []) - selected
    if unknown:
        raise RuntimeError('Unregistered Package selection: ' + ', '.join(sorted(unknown)))
    preparation = read(args.preparation) if args.preparation else {'packages': []}
    if args.preparation and preparation.get('framework_source_commit') != commit:
        raise ReleaseError('Framework checkout differs from the prepared daily tooling commit')
    if args.preparation and catalog and preparation.get('catalog_source_commit') != catalog_commit:
        raise RuntimeError('Catalog checkout differs from the prepared daily projection')
    blocked = [{'package_id': row['package_id'], 'reason': row['reason']}
               for row in preparation['packages'] if row['status'] == 'blocked']
    excluded = {row['package_id'] for row in blocked}
    current, candidates, releases = {}, {}, {}
    for pid, fingerprint in summary['candidate_fingerprint'].items():
        if pid in excluded or (args.package_id and pid not in args.package_id):
            continue
        try:
            selected_release = read_selected_release(paths, pid, fingerprint)
            manifest = selected_release[0]
            # Source visibility is checked before any registry classification.
            repo = gh('repos/' + slug(manifest['source_repo']))
            if repo['private']:
                raise RuntimeError('Private source is registered as a public Package')
            current[pid] = public_channel(pid, args.repository.split('/')[0])
            releases[pid] = selected_release
            candidates[pid] = selected_release[1]
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    write(output / 'daily-package-channel-summary.json', summary)
    write(output / 'current-owner-channels.json', {'packages': current})
    selected_summary = output / 'selected-candidates.json'
    write(selected_summary, {'candidate_fingerprint': candidates})
    plan_file = output / 'owner-channel-publication-plan.json'
    result = run(['node', 'scripts/package-owner-channel-plan.mjs', '--candidate-summary', selected_summary,
                  '--current-state', output / 'current-owner-channels.json', '--output', plan_file], cwd=root, check=False)
    if result.returncode not in [0, 2]:
        raise RuntimeError(result.stderr)
    plan = read(plan_file)
    entries = []
    for pid in plan['changed_packages']:
        try:
            predecessor = current[pid]['digest'] or 'none'
            entries.append(planned_entry(pid, releases[pid], predecessor, commit, controller_commit))
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    private_entries = []
    for pid in summary['owner_managed_packages']:
        if pid in excluded or (args.package_id and pid not in args.package_id):
            continue
        try:
            selected_release = read_selected_release(paths, pid)
            private_entries.append(planned_entry(pid, selected_release, 'resolve-authenticated', commit, controller_commit))
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    dispatch = {'surface_kind': 'opl_package_publication_dispatch_plan.v1',
                'source_run_id': os.getenv('GITHUB_RUN_ID', 'local'),
                'workflow_source_commit': workflow_commit or controller_commit or commit,
                'framework_source_commit': commit, 'status': 'publish_ready' if entries or private_entries else 'skipped',
                'packages': entries + private_entries, 'ready_packages': entries,
                'owner_managed_packages': private_entries, 'needs_owner_release': [],
                'blocked_packages': blocked + plan['violations']}
    if catalog_commit:
        dispatch['catalog_source_commit'] = catalog_commit
        for entry in dispatch['packages']:
            entry['expected_catalog_source_commit'] = catalog_commit
    write(output / 'package-publication-dispatch-plan.json', dispatch)
    with open(os.environ.get('GITHUB_STEP_SUMMARY', os.devnull), 'a') as stream:
        stream.write(f"### Daily Package channels\n\nPublic ready: {len(entries)}. Private owner plans: {len(private_entries)}. Blocked: {len(dispatch['blocked_packages'])}.\n")
        for item in dispatch['blocked_packages']:
            stream.write(f"- {item['package_id']}: {item['reason']}\n")
    return dispatch

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--catalog-root', type=Path)
    parser.add_argument('--controller-source-commit', help='Exact Framework main workflow commit supplying the v2 publisher')
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--package-id', action='append')
    parser.add_argument('--preparation', type=Path)
    parser.add_argument('--repository', default='gaofeng21cn/one-person-lab')
    print(json.dumps(detect(parser.parse_args()), indent=2))
