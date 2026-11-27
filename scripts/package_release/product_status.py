"""Read owner-owned publication surfaces without granting release authority."""
from __future__ import annotations

import re
import subprocess
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .common import ReleaseError, gh
from .daily_status import run_artifact, workflow_runs


def channel_snapshot(repository, channel):
    kind = channel['kind']
    endpoint = f'repos/{repository}/releases'
    try:
        if kind == 'github_prerelease':
            releases = gh(endpoint + '?per_page=100')
            release = next((item for item in releases if item['prerelease'] and not item['draft']
                            and re.fullmatch(channel['tag_pattern'], item['tag_name'])), None)
        elif kind == 'sparkle':
            tag = urllib.parse.quote(channel['release_tag'], safe='')
            release = gh(endpoint + '/tags/' + tag)
        else:
            release = gh(endpoint + '/latest')
    except ReleaseError as exc:
        if 'HTTP 404' in str(exc):
            return None
        raise
    if release is None or release['draft']:
        return None
    if kind == 'sparkle':
        asset = next((entry for entry in release['assets'] if entry['name'] == channel['asset']), None)
        if not asset:
            return None
        url = 'https://github.com/' + repository + '/releases/download/' + tag + '/' + urllib.parse.quote(asset['name'], safe='')
        with urllib.request.urlopen(url, timeout=30) as response:
            feed = ET.fromstring(response.read(262144))
        item = feed.find('./channel/item')
        enclosure = item.find('enclosure') if item is not None else None
        if enclosure is None:
            raise ReleaseError('Sparkle feed has no current enclosure')
        namespace = '{http://www.andymatuschak.org/xml-namespaces/sparkle}'
        version = item.findtext(namespace + 'shortVersionString') or enclosure.attrib[namespace + 'shortVersionString']
        build = item.findtext(namespace + 'version') or enclosure.attrib[namespace + 'version']
        return {'version': version, 'build': build, 'url': url}
    tag = release['tag_name']
    commit = gh(f'repos/{repository}/commits/{urllib.parse.quote(tag, safe="")}')
    result = {'tag': tag, 'source_commit': commit['sha'], 'url': release['html_url'],
              'parent_commits': [parent['sha'] for parent in commit.get('parents', [])]}
    if pattern := channel.get('asset_pattern'):
        asset = next((asset for asset in release['assets'] if re.fullmatch(pattern, asset['name'])), None)
        result['asset_present'] = asset is not None
        if asset:
            result['asset'] = asset['name']
    return result


def run_observation(run):
    status = run['status']
    conclusion = run['conclusion'] if status == 'completed' else None
    return {'status': 'publisher_' + (conclusion or status), 'run_id': run['id'],
            'run_url': run['html_url'], 'workflow_source_commit': run['head_sha']}


def observe_lanes(config, prepared):
    repository = config['repository']
    tag, source = prepared.get('tag'), prepared.get('source_commit')
    public = prepared.get('published_channel') or {}
    public_tag, public_source = public.get('tag'), public.get('source_commit')
    if prepared.get('status') == 'needs_release' and public_tag:
        tag, source = public_tag, public_source
    scheduled = config['strategy'] == 'owner_schedule'
    primary = {'lane': config.get('primary_lane', 'stable'), 'workflow': config['publisher_workflow'],
               'channel': config.get('channel'), 'schedule': scheduled}
    rows = []
    for lane in [primary, *config.get('observed_publishers', [])]:
        tag_bound = lane.get('match') == 'tag'
        row = {'lane': lane['lane'], 'workflow': lane['workflow'], 'status': 'not_observed'}
        try:
            if lane is primary and not scheduled:
                row.update({key: prepared[key] for key in ('status', 'run_id', 'run_url') if key in prepared})
                if row['status'] in ('unchanged', 'needs_release') and tag and source:
                    runs = gh(f"repos/{repository}/actions/workflows/{lane['workflow']}/runs?" +
                              urllib.parse.urlencode({'head_sha': source, 'per_page': 100}))['workflow_runs']
                    runs = [run for run in runs if run['head_sha'] == source and run['head_branch'] == tag]
                    if runs:
                        row['observed_publication_run'] = run_observation(max(runs, key=lambda run: run['id']))
                if row['status'] == 'publisher_success':
                    row['status'] = 'publication_pending'
                elif row['status'] in ('publisher_failure', 'publisher_cancelled', 'publisher_timed_out') and row.get('run_id'):
                    jobs = gh(f"repos/{repository}/actions/runs/{row['run_id']}/jobs?per_page=100")['jobs']
                    failures = [job['name'] for job in jobs if job['conclusion'] in ('failure', 'timed_out')]
                    if failures:
                        row['failed_jobs'] = failures
            else:
                event = 'schedule' if lane.get('schedule') else lane.get('event')
                filters = {'event': event} if event else {}
                if tag_bound:
                    runs = gh(f"repos/{repository}/actions/workflows/{lane['workflow']}/runs?per_page=100")['workflow_runs']
                else:
                    runs = workflow_runs(repository, lane['workflow'], **filters)
                title = lane.get('title_pattern')
                if title:
                    runs = [run for run in runs if re.search(title, run['display_title'])]
                if tag_bound:
                    runs = [run for run in runs if tag and (
                        (run['head_branch'] == tag and run['head_sha'] == source) or
                        (run['event'] == 'workflow_dispatch' and run['display_title'] == f'macOS candidate {tag} · {source}'))]
                elif lane.get('title_from_tag'):
                    runs = [run for run in runs if tag and run['display_title'] == lane['title_from_tag'].replace('{tag}', tag)]
                if runs:
                    selected = max(runs, key=lambda run: run['id'])
                    row.update(run_observation(selected))
                    if tag_bound and row['status'] == 'publisher_success':
                        row['status'] = 'candidate_ready'
                    if lane.get('receipt') == 'cloud' and selected['status'] == 'completed':
                        receipt = run_artifact(repository, selected, f"cloud-daily-product-{selected['id']}", 'cloud-daily-release-result.json')
                        if receipt and receipt.get('schema_version') == 'opl.cloud-daily-release.v1':
                            if source and tag and receipt.get('product_sha') == source and receipt.get('tag') == tag:
                                row['owner_stage'] = receipt['status']
                                if receipt.get('status') in ('qualification_pending', 'published'):
                                    row['status'] = receipt['status']
                                if receipt['status'] == 'blocked':
                                    row['failure_reason'] = receipt.get('reason')
                            elif receipt.get('status') == 'blocked':
                                row['request_stage'] = 'blocked'
                                row['failure_reason'] = receipt.get('reason')
        except (ReleaseError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as exc:
            row['observation'] = 'unavailable'
            row['observation_error'] = type(exc).__name__
        try:
            channel = lane.get('channel')
            if channel:
                readback = prepared.get('published_channel') if lane is primary and not scheduled else channel_snapshot(repository, channel)
                if readback:
                    row['published_channel'] = readback
                    exact = source and readback.get('source_commit') == source and (not tag or readback.get('tag') == tag)
                    if lane is primary and not scheduled and exact and row['status'] == 'publication_pending':
                        row['status'] = 'publication_verified'
                    if (lane is primary and scheduled and row['status'] == 'publisher_success'
                            and (readback.get('source_commit') == row['workflow_source_commit']
                                 or row['workflow_source_commit'] in readback['parent_commits'])):
                        row['status'] = 'publication_verified'
                    if lane.get('receipt') == 'cloud' and row.get('owner_stage') == 'published' and exact:
                        row['status'] = 'publication_verified'
                    if readback.get('asset_present') is False:
                        row['asset_status'] = 'asset_missing'
                    elif readback.get('asset_present') and row['status'] == 'publisher_success':
                        if readback.get('source_commit') == row['workflow_source_commit']:
                            row['status'] = 'publication_verified'
        except (ReleaseError, OSError, ValueError, KeyError, ET.ParseError, subprocess.TimeoutExpired) as exc:
            row['observation'] = 'unavailable'
            row['channel_error'] = type(exc).__name__
        rows.append(row)
    return rows
