#!/usr/bin/env python3
"""Dispatch the selected owner exactly once for each immutable release identity."""
from __future__ import annotations
import argparse
import os
import re
from pathlib import Path
from package_release.common import gh, read, write


def matching_publications(runs, entry):
    prefixes = (f"Package {entry['package_id']} {entry['expected_package_version']} / ".casefold(),
                f"{entry['package_id']} {entry['expected_package_version']} / ".casefold())
    request_id = entry['publication_request_id']
    return [r for r in runs if (request_id in r.get('display_title', '') or
                               r.get('display_title', '').casefold().startswith(prefixes))
            and (r['status'] != 'completed' or r.get('conclusion') == 'success')]


def dispatch(plan, source_run):
    if plan['source_run_id'] != str(source_run):
        raise RuntimeError('Dispatch plan belongs to a different source run')
    outcomes = []
    for entry in plan['packages']:
        private = entry.get('visibility') == 'authorized_only'
        repo = entry['owner_repository'] if private else 'gaofeng21cn/one-person-lab'
        try:
            runs = gh(f'repos/{repo}/actions/workflows/publish-package.yml/runs?event=workflow_dispatch&per_page=100')['workflow_runs']
            if matching_publications(runs, entry):
                outcomes.append({'package_id': entry['package_id'], 'status': 'already_dispatched'})
                continue
            inputs = {key: entry[key] for key in ['expected_package_version', 'expected_owner_source_commit',
                       'expected_latest_stable_predecessor', 'publication_request_id']}
            inputs['automation_source_run_id'] = str(source_run)
            if private:
                # Wrapper code and projection pins remain owned by the private repository.
                import base64
                metadata = gh(f'repos/{repo}/contents/.github/workflows/publish-package.yml?ref=main')
                text = base64.b64decode(metadata['content']).decode()
                pins = re.findall(r'expected_framework_source_commit: ([a-f0-9]{40})', text)
                uses = re.findall(r'uses: gaofeng21cn/one-person-lab/\.github/workflows/publish-package.yml@([a-f0-9]{40})', text)
                if pins != [plan['framework_source_commit']] or uses != pins:
                    raise RuntimeError('Private publisher pin needs synchronization to the selected projection')
            else:
                inputs.update(package_id=entry['package_id'], expected_framework_source_commit=plan['framework_source_commit'])
            gh(f'repos/{repo}/actions/workflows/publish-package.yml/dispatches', method='POST',
               payload={'ref': 'main', 'inputs': inputs})
            outcomes.append({'package_id': entry['package_id'], 'status': 'dispatched'})
        except Exception as exc:
            # Unknown POST outcomes are recorded; the next pass reconciles the same stable request id.
            outcomes.append({'package_id': entry['package_id'], 'status': 'dispatch_unresolved', 'reason': str(exc)})
    return outcomes

if __name__ == '__main__':
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--source-run-id', required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    plan = read(args.plan)
    outcomes = dispatch(plan, args.source_run_id)
    report = {'source_run_id': args.source_run_id, 'packages': outcomes,
              'blocked_packages': plan.get('blocked_packages', [])}
    if args.output:
        write(args.output, report)
    print(json.dumps(report, indent=2))
    unresolved = [row for row in outcomes if row['status'] == 'dispatch_unresolved']
    failures = report['blocked_packages'] + unresolved
    with open(os.getenv('GITHUB_STEP_SUMMARY', os.devnull), 'a') as stream:
        stream.write(f"### Package dispatch\n\nProcessed: {len(outcomes)}. Blocked or unresolved: {len(failures)}.\n")
        for row in failures:
            stream.write(f"- {row['package_id']}: {row['reason']}\n")
    if failures:
        raise SystemExit(1)
