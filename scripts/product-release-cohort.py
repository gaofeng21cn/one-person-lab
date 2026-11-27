#!/usr/bin/env python3
"""Reconcile independent owner results into one daily release cohort matrix."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cohort-id', required=True)
    parser.add_argument('--results-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'opl-daily-[1-9][0-9]*', args.cohort_id):
        raise SystemExit('Invalid release cohort id')
    results = []
    for path in sorted(args.results_root.rglob('*.json')):
        try:
            value = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if value.get('schema_version') != 'opl.product-release-result.v1':
            continue
        if value.get('cohort_id') != args.cohort_id:
            continue
        result = {key: value[key] for key in (
            'product_id', 'repository', 'status', 'version', 'tag', 'source_commit',
            'run_id', 'run_url', 'reason') if key in value}
        results.append(result)
    results.sort(key=lambda value: value.get('product_id', ''))
    statuses = [value.get('status', 'blocked') for value in results]
    terminal = 'published' if results and all(status in ('publisher_success', 'publication_verified') for status in statuses) else (
        'blocked' if any(status == 'blocked' for status in statuses) else 'in_progress')
    report = {
        'schema_version': 'opl.product-release-cohort.v1',
        'cohort_id': args.cohort_id,
        'products': results,
        'terminal_status': terminal,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
