#!/usr/bin/env python3
"""Summarize owner runs and channel readbacks from one daily observation."""
from __future__ import annotations

import argparse
from datetime import datetime, time, timedelta, timezone
import json
import os
from pathlib import Path
import re
import subprocess
from zoneinfo import ZoneInfo

from package_release.common import ReleaseError, gh, read, write
from package_release.daily_status import daily_package_status


def product_rows(root, cohort, expected):
    results = {}
    for path in sorted(root.rglob('product-release-result.json')):
        row = read(path)
        product = row.get('product_id')
        if (row.get('schema_version') != 'opl.product-release-result.v1'
                or row.get('cohort_id') != cohort
                or expected and expected.get(product) != row.get('repository')):
            continue
        if product in results:
            raise ReleaseError(f'Duplicate result for {product}')
        results[product] = row
    for product, repository in expected.items():
        results.setdefault(product, {'product_id': product, 'repository': repository,
                                     'status': 'result_missing'})
    return [results[key] for key in sorted(results)]


def package_status():
    repository = os.getenv('GITHUB_REPOSITORY')
    run_id = os.getenv('GITHUB_RUN_ID')
    if not repository or not run_id:
        return {'status': 'not_observed'}
    try:
        run = gh(f'repos/{repository}/actions/runs/{run_id}')
        date = datetime.fromisoformat(run['created_at']).astimezone(ZoneInfo('Asia/Shanghai')).date()
        start = datetime.combine(date, time.min, ZoneInfo('Asia/Shanghai')).astimezone(timezone.utc)
        end = start + timedelta(days=1, seconds=-1)
        return daily_package_status(repository, window_start=start.isoformat(), window_end=end.isoformat())
    except (ReleaseError, OSError, KeyError, ValueError, subprocess.TimeoutExpired):
        return {'status': 'observation_unavailable'}


def outcome(products, packages):
    statuses = {packages['status']}
    for row in products:
        if any(lane.get('observation') == 'unavailable' for lane in row.get('lanes', [])):
            statuses.add('observation_unavailable')
        if row['status'] in {'blocked', 'result_missing'}:
            statuses.add(row['status'])
        statuses.update(lane['status'] for lane in row.get('lanes', [row]))
    if statuses & {'blocked', 'result_missing', 'publisher_failure', 'publisher_cancelled',
                   'publisher_timed_out', 'detection_failed', 'qualification_failed'}:
        return 'blocked'
    if products and statuses <= {'unchanged', 'publication_verified'}:
        return 'verified'
    return 'pending'


def markdown(report):
    lines = ['### Daily release channels', '',
             f"Observation `{report['cohort_id']}` · `{report['terminal_status']}`",
             '', '| Product | Channel | Stage | Public version | Owner run |',
             '| --- | --- | --- | --- | --- |']
    for row in report['products']:
        for lane in row.get('lanes', [row]):
            published = lane.get('published_channel') or {}
            version = published.get('tag', published.get('version', '—'))
            if lane.get('asset_status') == 'asset_missing':
                version += ' (asset missing)'
            owner_run = lane.get('observed_publication_run', lane)
            run = f"[Actions]({owner_run['run_url']})" if owner_run.get('run_url') else '—'
            if 'observed_publication_run' in lane:
                run += f" · `{owner_run['tag']}` `{owner_run['status']}`"
            if public_run := lane.get('public_tag_publisher'):
                run += f" · [Public tag Actions]({public_run['run_url']}) `{public_run['status']}`"
            status = lane['status']
            if lane.get('observation') == 'unavailable':
                status += ' (observation incomplete)'
            lines.append(f"| {row['product_id']} | {lane.get('lane', '—')} | `{status}` | {version} | {run} |")
    packages = report['packages']
    lines.extend(['', f"Package publication · `{packages['status']}`"])
    for key in ('detection_run', 'dispatch_run'):
        if run := packages.get(key):
            lines.append(f"- [{key.replace('_', ' ')}]({run['html_url']})")
    for row in packages.get('packages', []) + packages.get('blocked_packages', []):
        lines.append(f"- {row['package_id']} · `{row['status']}`")
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cohort-id', required=True)
    parser.add_argument('--results-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'opl-daily-[1-9][0-9]*', args.cohort_id):
        raise SystemExit('Invalid release cohort id')
    products = product_rows(args.results_root, args.cohort_id, {
        row['product_id']: row['repository'] for row in json.loads(os.getenv('EXPECTED_PRODUCTS', '[]'))
    })
    packages = package_status()
    report = {'schema_version': 'opl.product-release-cohort.v1', 'cohort_id': args.cohort_id,
              'controller_commit': os.getenv('GITHUB_SHA'), 'products': products, 'packages': packages,
              'terminal_status': outcome(products, packages)}
    write(args.output, report)
    summary = markdown(report)
    print(summary)
    if path := os.getenv('GITHUB_STEP_SUMMARY'):
        with open(path, 'a') as stream:
            stream.write(summary)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
