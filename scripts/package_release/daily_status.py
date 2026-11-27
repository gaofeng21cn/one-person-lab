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
    return {key: run[key] for key in ('id', 'status', 'conclusion', 'html_url', 'head_sha')}


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


def dispatch_evidence(repository, detection):
    candidates = workflow_runs(repository, 'daily-package-channel-publication.yml',
                               created=f">={detection['created_at']}")
    for run in sorted(candidates, key=lambda row: row['id'], reverse=True):
        if run['event'] not in ('workflow_run', 'workflow_dispatch'):
            continue
        result = run_artifact(repository, run, f"opl-package-dispatch-result-{run['id']}", 'dispatch-result.json')
        if result and result['source_run_id'] == str(detection['id']):
            return run_summary(run), {row['package_id']: row['status'] for row in result['packages']}
    return None, {}


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
    if not matches:
        return
    publisher = max(matches, key=lambda run: run['id'])
    row['publisher_run'] = run_summary(publisher)
    if publisher['status'] != 'completed':
        row.update(status='publisher_running')
    elif publisher['conclusion'] != 'success':
        row.update(status='publisher_failed')
    else:
        row.update(status='publication_unverified')
        try:
            channel = public_channel(package_id, repository.split('/')[0])
        except (OSError, ReleaseError, ValueError):
            return
        fingerprint = channel.get('fingerprint') or {}
        if fingerprint.get('package_version') == version and fingerprint.get('owner_source_commit') == source_commit:
            row.update(status='publication_verified', digest=channel['digest'])
        elif channel['status'] == 'present':
            row.update(status='channel_differs')


def daily_package_status(repository='gaofeng21cn/one-person-lab', *, window_start=None, window_end=None):
    """Read a scheduled Package run and its exact dispatch and publication evidence."""
    filters = {'event': 'schedule'}
    if window_start and window_end:
        filters['created'] = f'{window_start}..{window_end}'
    elif window_start:
        filters['created'] = f'>={window_start}'
    elif window_end:
        filters['created'] = f'<={window_end}'
    runs = workflow_runs(repository, 'daily-package-channel.yml', **filters)
    report = {'status': 'no_detection', 'detection_run': None, 'dispatch_run': None,
              'packages': [], 'blocked_packages': []}
    if not runs:
        return report
    detection = max(runs, key=lambda row: row['id'])
    report['detection_run'] = run_summary(detection)
    if detection['status'] != 'completed' or detection['conclusion'] != 'success':
        report['status'] = 'detection_running' if detection['status'] != 'completed' else 'detection_failed'
        return report
    try:
        plan = run_artifact(repository, detection, f"opl-daily-package-channel-candidate-{detection['id']}",
                            'package-publication-dispatch-plan.json')
    except (ReleaseError, subprocess.TimeoutExpired):
        plan = None
    if plan is None:
        report['status'] = 'detection_unverified'
        return report
    if (plan['surface_kind'] != 'opl_package_publication_dispatch_plan.v1'
            or plan['source_run_id'] != str(detection['id'])
            or plan['workflow_source_commit'] != detection['head_sha']):
        raise ReleaseError('Package plan does not bind to the selected detection run')
    report.update(framework_source_commit=plan['framework_source_commit'],
                  catalog_source_commit=plan.get('catalog_source_commit'))

    try:
        report['dispatch_run'], dispatch = dispatch_evidence(repository, detection)
    except (ReleaseError, subprocess.TimeoutExpired):
        report['dispatch_evidence'] = 'unavailable'
        dispatch = {}
    publishers = []
    if any(entry['visibility'] == 'public' for entry in plan['packages']):
        publishers = workflow_runs(repository, 'publish-package.yml', event='workflow_dispatch')
    for entry in plan['packages']:
        package_id = entry['package_id']
        row = {'package_id': package_id, 'status': dispatch.get(package_id, 'dispatch_pending')}
        if entry['visibility'] == 'public':
            public_status(repository, publishers, entry, row)
        report['packages'].append(row)

    # Report identity and stage only. Owner diagnostics remain in the linked evidence.
    report['blocked_packages'] = [{'package_id': row['package_id'], 'status': 'blocked'}
                                  for row in plan['blocked_packages']]
    statuses = {row['status'] for row in report['packages']}
    if report['blocked_packages'] or statuses & {'dispatch_unresolved', 'publisher_failed'}:
        report['status'] = 'blocked'
    elif statuses == {'publication_verified'}:
        report['status'] = 'publication_verified'
    elif statuses:
        report['status'] = 'publication_pending'
    else:
        report['status'] = 'unchanged'
    return report
