#!/usr/bin/env python3
"""Build an independently executable plan for each registered Package channel."""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path
from package_release.common import git, read, run, write
from package_release.channels import public_channel, publication_entry


def detect(args):
    root = args.framework_root.resolve()
    output = args.output_root.resolve()
    output.mkdir(parents=True, exist_ok=True)
    commit = git(root, 'rev-parse', 'HEAD')
    summary = json.loads(run(['node', '--experimental-strip-types', '--input-type=module', '-e',
        "import {buildDailyPackageCandidates} from './scripts/package-channel-candidates.mjs';"
        "import {getPublicationAdmittedOplPackageSpecs} from './src/adapters/integration/package-distribution.ts';"
        "console.log(JSON.stringify(buildDailyPackageCandidates(getPublicationAdmittedOplPackageSpecs())));"], cwd=root).stdout)
    selected = set(summary['candidate_fingerprint']) | set(summary['owner_managed_packages'])
    unknown = set(args.package_id or []) - selected
    if unknown:
        raise RuntimeError('Unregistered Package selection: ' + ', '.join(sorted(unknown)))
    preparation = read(args.preparation) if args.preparation else {'packages': []}
    blocked = [{'package_id': row['package_id'], 'reason': row['reason']}
               for row in preparation['packages'] if row['status'] == 'blocked']
    excluded = {row['package_id'] for row in blocked}
    current, candidates = {}, {}
    for pid, fingerprint in summary['candidate_fingerprint'].items():
        if pid in excluded or (args.package_id and pid not in args.package_id):
            continue
        try:
            manifest = read(root / 'contracts/opl-framework/packages' / f'{pid}.json')
            # Source visibility is checked before any registry classification.
            from package_release.common import gh, slug
            repo = gh('repos/' + slug(manifest['source_repo']))
            if repo['private']:
                raise RuntimeError('Private source is registered as a public Package')
            current[pid] = public_channel(pid, args.repository.split('/')[0])
            candidates[pid] = fingerprint
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
            manifest = read(root / 'contracts/opl-framework/packages' / f'{pid}.json')
            predecessor = current[pid]['digest'] or 'none'
            entries.append(publication_entry(pid, manifest, candidates[pid], predecessor, commit))
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    private_entries = []
    for pid in summary['owner_managed_packages']:
        if pid in excluded or (args.package_id and pid not in args.package_id):
            continue
        try:
            manifest_path = root / 'contracts/opl-framework/packages' / f'{pid}.json'
            manifest = read(manifest_path)
            payload = read(manifest_path.parent / manifest['codex_surface']['plugin_payload_manifest_url'])
            fingerprint = {'package_version': payload['package_version'], 'owner_source_commit': payload['source_commit']}
            private_entries.append(publication_entry(pid, manifest, fingerprint, 'resolve-authenticated', commit))
        except Exception as exc:
            blocked.append({'package_id': pid, 'reason': str(exc)})
    dispatch = {'surface_kind': 'opl_package_publication_dispatch_plan.v1',
                'source_run_id': os.getenv('GITHUB_RUN_ID', 'local'),
                'workflow_source_commit': os.getenv('GITHUB_SHA', commit),
                'framework_source_commit': commit, 'status': 'publish_ready' if entries or private_entries else 'skipped',
                'packages': entries + private_entries, 'ready_packages': entries,
                'owner_managed_packages': private_entries, 'needs_owner_release': [],
                'blocked_packages': blocked + plan['violations']}
    write(output / 'package-publication-dispatch-plan.json', dispatch)
    with open(os.environ.get('GITHUB_STEP_SUMMARY', os.devnull), 'a') as stream:
        stream.write(f"### Daily Package channels\n\nPublic ready: {len(entries)}. Private owner plans: {len(private_entries)}. Blocked: {len(dispatch['blocked_packages'])}.\n")
        for item in dispatch['blocked_packages']:
            stream.write(f"- {item['package_id']}: {item['reason']}\n")
    return dispatch

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--package-id', action='append')
    parser.add_argument('--preparation', type=Path)
    parser.add_argument('--repository', default='gaofeng21cn/one-person-lab')
    print(json.dumps(detect(parser.parse_args()), indent=2))
