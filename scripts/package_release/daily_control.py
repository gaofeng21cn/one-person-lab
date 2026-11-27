"""Verify the Package receiver's scheduled opl-release dispatch before preparing releases."""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urlencode

from .common import ReleaseError, read, run


CONTROLLER_REPOSITORY = 'gaofeng21cn/opl-release'
CONTROLLER_WORKFLOW = '.github/workflows/control-daily-releases.yml'
RECEIVER_REPOSITORY = 'gaofeng21cn/one-person-lab'
RECEIVER_WORKFLOW = 'daily-package-channel.yml'
RELEASE_BOT_ID = 173561466


def verify_dispatch(environ):
    control_run_id = environ['OPL_RELEASE_CONTROL_RUN_ID']
    if not re.fullmatch(r'[1-9][0-9]*', control_run_id):
        raise ReleaseError('Expected a positive numeric opl-release control run ID')
    if (environ['GITHUB_EVENT_NAME'] != 'workflow_dispatch'
            or environ['GITHUB_REPOSITORY'] != RECEIVER_REPOSITORY
            or environ['GITHUB_REF'] != 'refs/heads/main'
            or environ['GITHUB_RUN_ATTEMPT'] != '1'
            or environ['GITHUB_ACTOR_ID'] != str(RELEASE_BOT_ID)
            or read(environ['GITHUB_EVENT_PATH']).get('sender', {}).get('id') != RELEASE_BOT_ID
            or environ.get('SELECTED_PACKAGE')):
        raise ReleaseError('Central Package dispatch requires the first full-scan invocation from the Package Release GitHub App on main')

    source_url = f'https://api.github.com/repos/{CONTROLLER_REPOSITORY}/actions/runs/{control_run_id}'
    source = json.loads(run(['curl', '--fail', '--silent', '--show-error', source_url], timeout=30).stdout)
    if (str(source.get('id')) != control_run_id
            or source.get('repository', {}).get('full_name') != CONTROLLER_REPOSITORY
            or source.get('head_repository', {}).get('full_name') != CONTROLLER_REPOSITORY
            or source.get('path') != CONTROLLER_WORKFLOW
            or source.get('head_branch') != 'main'
            or source.get('event') != 'schedule'
            or source.get('run_attempt') != 1):
        raise ReleaseError('Expected the first attempt of the opl-release main schedule')

    filters = urlencode({'branch': 'main', 'event': 'workflow_dispatch',
                         'created': f">={source['created_at']}", 'per_page': 100})
    endpoint = f'repos/{RECEIVER_REPOSITORY}/actions/workflows/{RECEIVER_WORKFLOW}/runs?{filters}'
    pages = json.loads(run(['gh', 'api', '--paginate', '--slurp', endpoint], timeout=60).stdout)
    title = f'Daily OPL Package Channel [opl-release:{control_run_id}]'
    current_run_number = int(environ['GITHUB_RUN_NUMBER'])
    if any(candidate['run_number'] < current_run_number
           and candidate.get('display_title') == title
           and candidate.get('actor', {}).get('id') == RELEASE_BOT_ID
           for page in pages for candidate in page['workflow_runs']):
        raise ReleaseError('This opl-release control run already dispatched the Package scan')


if __name__ == '__main__':
    try:
        verify_dispatch(os.environ)
    except ReleaseError as error:
        raise SystemExit(str(error)) from error
