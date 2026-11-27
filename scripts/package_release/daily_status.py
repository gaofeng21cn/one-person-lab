"""Observe the independently scheduled Package publication workflow."""
from __future__ import annotations

from io import BytesIO
import json
import subprocess
from urllib.parse import urlencode
from zipfile import BadZipFile, ZipFile

from .channels import public_channel
from .common import ReleaseError, gh, request_id


def workflow_runs(repository, workflow, **filters):
    query = urlencode({'branch': 'main', **filters, 'per_page': 100})
    return gh(f'repos/{repository}/actions/workflows/{workflow}/runs?{query}')['workflow_runs']


def run_summary(run):
    if run is None:
        return None
    return {key: run[key] for key in ('id', 'status', 'conclusion', 'html_url', 'head_sha', 'event') if key in run}


def run_artifact(repository, run, name, member):
    artifacts = gh(f"repos/{repository}/actions/runs/{run['id']}/artifacts?{urlencode({'name': name})}")['artifacts']
    matches = [row for row in artifacts if row['name'] == name and not row['expired']
               and row['workflow_run']['id'] == run['id']]
    if not matches:
        return None
    if len(matches) != 1 or matches[0]['size_in_bytes'] > 2 * 1024 * 1024:
        raise ReleaseError('Invalid Package evidence artifact')
    command = ['gh', 'api', f"repos/{repository}/actions/artifacts/{matches[0]['id']}/zip"]
    for _ in range(2):
        download = subprocess.run(command, capture_output=True, timeout=30)
        if not download.returncode:
            break
    else:
        raise ReleaseError('Unable to download Package evidence artifact')
    try:
        with ZipFile(BytesIO(download.stdout)) as archive:
            if archive.namelist().count(member) != 1 or archive.getinfo(member).file_size > 2 * 1024 * 1024:
                raise ReleaseError('Invalid Package evidence file')
            return json.loads(archive.read(member))
    except (BadZipFile, KeyError, ValueError) as exc:
        raise ReleaseError('Invalid Package evidence archive') from exc


def dispatch_evidence(repository, detections):
    remaining = {str(run['id']) for run in detections}
    evidence = {}
    incomplete = False
    candidates = workflow_runs(repository, 'daily-package-channel-publication.yml',
                               created=f">={min(run['created_at'] for run in detections)}")
    for run in sorted(candidates, key=lambda row: row['id'], reverse=True):
        if run['event'] not in ('workflow_run', 'workflow_dispatch'):
            continue
        try:
            result = run_artifact(repository, run, f"opl-package-dispatch-result-{run['id']}", 'dispatch-result.json')
            source_id = result['source_run_id'] if result else None
            if source_id in remaining:
                evidence[source_id] = (run_summary(run), {row['package_id']: row['status'] for row in result['packages']})
                remaining.remove(source_id)
        except (ReleaseError, OSError, KeyError, ValueError, subprocess.TimeoutExpired):
            incomplete = True
        if not remaining:
            break
    return evidence, incomplete


def public_status(repository, publishers, entry, row):
    package_id = entry['package_id']
    version = entry['expected_package_version']
    source_commit = entry['expected_owner_source_commit']
    identity = request_id(package_id, version, source_commit)
    if identity != entry['publication_request_id']:
        raise ReleaseError('Package publication identity differs from the planned source')
    row.update(version=version, source_commit=source_commit, publication_request_id=identity)
    title = f'Package {package_id} {version} / {identity}'
    matches = [run for run in publishers if run['display_title'] == title]
    if matches:
        publisher = max(matches, key=lambda run: run['id'])
        row['publisher_run'] = run_summary(publisher)
        if publisher['status'] != 'completed':
            row['status'] = 'publisher_running'
        elif publisher['conclusion'] != 'success':
            row['status'] = 'publisher_failed'
        else:
            row['status'] = 'publication_unverified'
    try:
        channel = public_channel(package_id, repository.split('/')[0])
    except (OSError, ReleaseError, ValueError, KeyError):
        row['channel_observation'] = 'unavailable'
        return
    fingerprint = channel.get('fingerprint') or {}
    if fingerprint.get('package_version') == version and fingerprint.get('owner_source_commit') == source_commit:
        row.update(status='publication_verified', digest=channel['digest'])
    elif channel['status'] == 'present' and row['status'] == 'publication_unverified':
        row['status'] = 'channel_differs'


def daily_package_status(repository='gaofeng21cn/one-person-lab', *, window_start=None, window_end=None):
    """Combine Package outcomes from the exact successful daily runs in a window."""
    filters = {}
    if window_start and window_end:
        filters['created'] = f'{window_start}..{window_end}'
    elif window_start:
        filters['created'] = f'>={window_start}'
    elif window_end:
        filters['created'] = f'<={window_end}'
    runs = []
    for event in ('schedule', 'workflow_dispatch'):
        runs.extend(workflow_runs(repository, 'daily-package-channel.yml', event=event, **filters))
    runs = sorted({run['id']: run for run in runs}.values(), key=lambda run: run['id'])
    report = {'status': 'no_detection', 'detection_run': None, 'dispatch_run': None,
              'packages': [], 'blocked_packages': []}
    if not runs:
        return report
    detection = runs[-1]
    report['detection_run'] = run_summary(detection)
    if not filters:
        runs = [detection]

    plans = []
    unverified_runs = []
    for run in runs:
        if run['status'] != 'completed' or run['conclusion'] != 'success':
            continue
        try:
            plan = run_artifact(repository, run, f"opl-daily-package-channel-candidate-{run['id']}",
                                'package-publication-dispatch-plan.json')
            if (not plan or plan.get('surface_kind') != 'opl_package_publication_dispatch_plan.v1'
                    or plan.get('source_run_id') != str(run['id'])
                    or plan.get('workflow_source_commit', plan.get('framework_source_commit')) != run['head_sha']
                    or not isinstance(plan.get('packages'), list)
                    or not isinstance(plan.get('blocked_packages'), list)):
                raise ReleaseError('Package plan does not bind to its detection run')
        except (ReleaseError, OSError, KeyError, ValueError, subprocess.TimeoutExpired):
            unverified_runs.append(run_summary(run))
            continue
        plans.append((run, plan))
    if unverified_runs:
        report['unverified_runs'] = unverified_runs

    selected = {}
    for run, plan in plans:
        # A covered Package may be unchanged and therefore absent from both result lists.
        full_sweep = plan.get('selection_scope') == 'all'
        selected_ids = plan.get('selected_package_ids')
        if not isinstance(selected_ids, list):
            selected_ids = []
        for package_id, (_, _, blocked) in list(selected.items()):
            if blocked and (full_sweep or package_id in selected_ids):
                del selected[package_id]
        for row in plan['packages']:
            selected[row['package_id']] = (run, row, False)
        for row in plan['blocked_packages']:
            selected[row['package_id']] = (run, row, True)

    dispatch_by_run = {}
    if plans:
        latest_run, latest_plan = plans[-1]
        report.update(framework_source_commit=latest_plan['framework_source_commit'],
                      catalog_source_commit=latest_plan.get('catalog_source_commit'))
        relevant_runs = {run['id']: run for run, _, blocked in selected.values() if not blocked}
        relevant_runs[latest_run['id']] = latest_run
        try:
            dispatch_by_run, incomplete = dispatch_evidence(repository, relevant_runs.values())
            if incomplete:
                report['dispatch_evidence'] = 'unavailable'
        except (ReleaseError, OSError, KeyError, ValueError, subprocess.TimeoutExpired):
            report['dispatch_evidence'] = 'unavailable'
        report['dispatch_run'] = dispatch_by_run.get(str(latest_run['id']), (None, {}))[0]

    publishers = []
    if any(not blocked and entry['visibility'] == 'public' for _, entry, blocked in selected.values()):
        try:
            publishers = workflow_runs(repository, 'publish-package.yml', event='workflow_dispatch')
        except (ReleaseError, OSError, KeyError, ValueError, subprocess.TimeoutExpired):
            report['publisher_evidence'] = 'unavailable'
    for package_id, (run, entry, blocked) in sorted(selected.items()):
        row = {'package_id': package_id, 'detection_run': run_summary(run)}
        if blocked:
            # Owner diagnostics stay in the linked evidence.
            report['blocked_packages'].append(dict(row, status='blocked'))
            continue
        dispatch_run, dispatch = dispatch_by_run.get(str(run['id']), (None, {}))
        row.update(status=dispatch.get(package_id, 'dispatch_pending'), dispatch_run=dispatch_run)
        if entry['visibility'] == 'public':
            public_status(repository, publishers, entry, row)
        report['packages'].append(row)

    statuses = {row['status'] for row in report['packages']}
    if detection['status'] != 'completed':
        report['status'] = 'detection_running'
    elif detection['conclusion'] != 'success':
        report['status'] = 'detection_failed'
    elif report['blocked_packages'] or statuses & {'dispatch_unresolved', 'publisher_failed'}:
        report['status'] = 'blocked'
    elif unverified_runs:
        report['status'] = 'detection_unverified'
    elif statuses == {'publication_verified'}:
        report['status'] = 'publication_verified'
    elif statuses:
        report['status'] = 'publication_pending'
    else:
        report['status'] = 'unchanged'
    return report
