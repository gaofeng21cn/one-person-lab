#!/usr/bin/env python3
"""Build an independently executable v2 plan for each admitted Catalog Package channel."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

from package_release.channels import public_channel, publication_entry
from package_release.common import ReleaseError, gh, git, read, safe_path, slug, version_tuple, write
from package_release.projection import PackageProjection, catalog_root_from

SEMVER_PATTERN = re.compile(r'^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$')
DIGEST_PATTERN = re.compile(r'^sha256:[0-9a-f]{64}$')
COMMIT_PATTERN = re.compile(r'^[0-9a-f]{40}$')


def read_selected_release(paths, package_id):
    manifest = read(paths.manifest(package_id))
    facet = manifest.get('v2_release')
    if not paths.catalog or not isinstance(facet, dict):
        raise ReleaseError('V2 Package publication requires a Catalog release facet')
    version = facet.get('version') or ''
    if (not isinstance(version, str) or not SEMVER_PATTERN.fullmatch(version)
            or facet.get('payload_manifest_ref') != f'payloads/{package_id}-{version}.json'):
        raise ReleaseError('V2 Package release has no canonical payload path')
    payload_bytes = safe_path(paths.packages, facet['payload_manifest_ref']).read_bytes()
    if facet.get('payload_sha256') != 'sha256:' + hashlib.sha256(payload_bytes).hexdigest():
        raise ReleaseError('V2 Package payload bytes differ from the Catalog digest')
    payload = json.loads(payload_bytes)
    source = facet.get('source_commit') or ''
    if (not isinstance(source, str) or not COMMIT_PATTERN.fullmatch(source)
            or payload.get('package_format') != 'v2'
            or payload.get('package_id') != package_id or payload.get('package_version') != version
            or payload.get('source_commit') != source or payload.get('source_repo') != manifest['source_repo']):
        raise ReleaseError('V2 Package payload does not match its selected Catalog release')
    archive_digest = payload.get('archive_sha256')
    content_digest = (payload.get('content_lock') or {}).get('digest')
    if not all(isinstance(value, str) and DIGEST_PATTERN.fullmatch(value)
               for value in (archive_digest, content_digest)):
        raise ReleaseError('V2 Package payload has no frozen archive or content digest')
    return manifest, {
        'package_version': version,
        'owner_source_commit': source,
        'package_content_digest': content_digest,
    }, 'v2'


def _validate_fingerprint(package_id, fingerprint, label):
    if (not isinstance(fingerprint, dict)
            or not SEMVER_PATTERN.fullmatch(fingerprint.get('package_version') or '')
            or not DIGEST_PATTERN.fullmatch(fingerprint.get('package_content_digest') or '')
            or not COMMIT_PATTERN.fullmatch(fingerprint.get('owner_source_commit') or '')):
        raise ReleaseError(f'{package_id}: invalid {label} Package fingerprint')
    return fingerprint


def _validate_current_state(package_id, state):
    if not isinstance(state, dict) or state.get('status') not in ('present', 'absent'):
        raise ReleaseError(f'{package_id}: current owner-channel state must be present or absent')
    if state['status'] == 'absent':
        if state.get('digest') is not None or state.get('fingerprint') is not None:
            raise ReleaseError(f'{package_id}: absent owner channel cannot declare a digest or fingerprint')
        return state
    if not DIGEST_PATTERN.fullmatch(state.get('digest') or ''):
        raise ReleaseError(f'{package_id}: current owner-channel digest is invalid')
    _validate_fingerprint(package_id, state.get('fingerprint'), 'current owner-channel')
    return state


def plan_channel_updates(candidates, current_states):
    publish_packages = []
    unchanged_packages = []
    violations = []
    for package_id in sorted(candidates):
        candidate = _validate_fingerprint(package_id, candidates[package_id], 'candidate')
        current = _validate_current_state(package_id, current_states.get(package_id))
        if current['status'] == 'absent':
            publish_packages.append(package_id)
            continue
        published = current['fingerprint']
        same_version = candidate['package_version'] == published['package_version']
        same_content = candidate['package_content_digest'] == published['package_content_digest']
        if same_version and same_content:
            unchanged_packages.append(package_id)
            continue
        detail = {
            'package_id': package_id,
            'current_version': published['package_version'],
            'candidate_version': candidate['package_version'],
            'current_content_digest': published['package_content_digest'],
            'candidate_content_digest': candidate['package_content_digest'],
        }
        if same_version:
            violations.append({**detail, 'reason': 'version_bump_required'})
            continue
        if version_tuple(candidate['package_version']) < version_tuple(published['package_version']):
            violations.append({**detail, 'reason': 'version_regression'})
            continue
        if same_content:
            violations.append({**detail, 'reason': 'version_change_without_content_change'})
            continue
        publish_packages.append(package_id)
    extra_state = sorted(set(current_states) - set(candidates))
    if extra_state:
        raise ReleaseError(f"Current owner-channel state contains unknown Packages: {', '.join(extra_state)}")
    return {
        'surface_kind': 'opl_package_owner_channel_plan.v1',
        'status': (
            'partially_blocked' if violations and publish_packages else
            'blocked' if violations else
            'publish_required' if publish_packages else
            'skipped'
        ),
        'reason': (
            'package_version_discipline_violation' if violations else
            'independent_owner_channel_changed' if publish_packages else
            'independent_owner_channels_unchanged'
        ),
        'publish_required': bool(publish_packages),
        'changed_packages': publish_packages,
        'unchanged_packages': unchanged_packages,
        'violations': violations,
        'candidate_fingerprint': candidates,
        'current_owner_channels': current_states,
    }


def planned_entry(package_id, selected_release, predecessor, controller_commit):
    manifest, fingerprint, package_format = selected_release
    if package_format != 'v2' or not controller_commit:
        raise ReleaseError('V2 Package publication requires an exact controller commit')
    entry = publication_entry(package_id, manifest, fingerprint, predecessor, controller_commit)
    entry['package_format'] = 'v2'
    return entry


def detect(args):
    root = args.framework_root.resolve()
    catalog = catalog_root_from(args)
    if not catalog:
        raise ReleaseError('V2 Package detection requires the official Catalog')
    paths = PackageProjection(root, catalog)
    output = args.output_root.resolve()
    output.mkdir(parents=True, exist_ok=True)
    commit = git(root, 'rev-parse', 'HEAD')
    controller_commit = args.controller_source_commit or commit
    workflow_commit = os.getenv('GITHUB_SHA')
    if (not COMMIT_PATTERN.fullmatch(controller_commit)
            or controller_commit != commit
            or (workflow_commit and workflow_commit != controller_commit)):
        raise ReleaseError('Publisher controller must match the exact workflow source commit')
    catalog_commit = git(catalog, 'rev-parse', 'HEAD')
    specs = paths.admitted_package_specs()
    public_specs = {spec['package_id']: spec for spec in specs if spec['visibility'] != 'authorized_only'}
    private_specs = {spec['package_id']: spec for spec in specs if spec['visibility'] == 'authorized_only'}
    unknown = set(args.package_id or []) - (set(public_specs) | set(private_specs))
    if unknown:
        raise RuntimeError('Unregistered Package selection: ' + ', '.join(sorted(unknown)))
    preparation = read(args.preparation) if args.preparation else {'packages': []}
    if args.preparation and preparation.get('framework_source_commit') != commit:
        raise ReleaseError('Framework checkout differs from the prepared daily tooling commit')
    if args.preparation and preparation.get('catalog_source_commit') != catalog_commit:
        raise RuntimeError('Catalog checkout differs from the prepared daily projection')
    blocked = [{'package_id': row['package_id'], 'reason': row['reason']}
               for row in preparation['packages'] if row['status'] == 'blocked']
    excluded = {row['package_id'] for row in blocked}
    current, candidates, releases = {}, {}, {}
    for pid in sorted(public_specs):
        if pid in excluded or (args.package_id and pid not in args.package_id):
            continue
        try:
            selected_release = read_selected_release(paths, pid)
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
    summary = {
        'surface_kind': 'opl_daily_package_candidates.v2',
        'candidate_fingerprint': candidates,
        'owner_managed_packages': {
            pid: {'visibility': 'authorized_only', 'publication_ref': private_specs[pid]['publication_ref']}
            for pid in sorted(private_specs)
            if not args.package_id or pid in args.package_id
        },
    }
    write(output / 'daily-package-channel-summary.json', summary)
    write(output / 'current-owner-channels.json', {'packages': current})
    write(output / 'selected-candidates.json', {'candidate_fingerprint': candidates})
    plan = plan_channel_updates(candidates, current)
    write(output / 'owner-channel-publication-plan.json', plan)
    entries = []
    for pid in plan['changed_packages']:
        try:
            predecessor = current[pid]['digest'] or 'none'
            entries.append(planned_entry(pid, releases[pid], predecessor, controller_commit))
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    private_entries = []
    for pid in sorted(private_specs):
        if pid in excluded or (args.package_id and pid not in args.package_id):
            continue
        try:
            selected_release = read_selected_release(paths, pid)
            private_entries.append(planned_entry(pid, selected_release, 'resolve-authenticated', controller_commit))
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    dispatch = {
        'surface_kind': 'opl_package_publication_dispatch_plan.v1',
        'source_run_id': os.getenv('GITHUB_RUN_ID', 'local'),
        'selection_scope': 'selected' if args.package_id else 'all',
        'workflow_source_commit': workflow_commit or controller_commit,
        'framework_source_commit': commit,
        'catalog_source_commit': catalog_commit,
        'status': 'publish_ready' if entries or private_entries else 'skipped',
        'packages': entries + private_entries,
        'ready_packages': entries,
        'owner_managed_packages': private_entries,
        'needs_owner_release': [],
        'blocked_packages': blocked + plan['violations'],
    }
    if args.package_id:
        dispatch['selected_package_ids'] = list(args.package_id)
    for entry in dispatch['packages']:
        entry['expected_catalog_source_commit'] = catalog_commit
    write(output / 'package-publication-dispatch-plan.json', dispatch)
    with open(os.environ.get('GITHUB_STEP_SUMMARY', os.devnull), 'a') as stream:
        stream.write(
            f"### Daily Package channels\n\n"
            f"Public ready: {len(entries)}. Private owner plans: {len(private_entries)}. "
            f"Blocked: {len(dispatch['blocked_packages'])}.\n"
        )
        for item in dispatch['blocked_packages']:
            stream.write(f"- {item['package_id']}: {item['reason']}\n")
    return dispatch


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--catalog-root', type=Path, required=True)
    parser.add_argument('--controller-source-commit', help='Exact Framework main workflow commit supplying the v2 publisher')
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--package-id', action='append')
    parser.add_argument('--preparation', type=Path)
    parser.add_argument('--repository', default='gaofeng21cn/one-person-lab')
    print(json.dumps(detect(parser.parse_args()), indent=2))
