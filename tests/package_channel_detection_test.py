from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from package_release.common import ReleaseError, write
from package_release import channels

CONTROLLER = '2' * 40
CATALOG = '3' * 40
V2_OWNER = '5' * 40
TAG = '6' * 40
CONTENT_DIGEST = 'sha256:' + '7' * 64
PUBLISHED_DIGEST = 'sha256:' + '0' * 64
ARCHIVE_DIGEST = 'sha256:' + '8' * 64
PREDECESSOR = 'sha256:' + '9' * 64


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f'scripts/{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


detector = load_script('package-channel-detection')
dispatcher = load_script('package-publication-dispatch')


class V2PackageChannelTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='opl-package-channel-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.catalog = self.root / 'catalog'
        self.framework = self.root / 'framework'
        self.output = self.root / 'plan'
        self.preparation = self.root / 'preparation.json'
        self.posted = []
        write(self.preparation, {
            'framework_source_commit': CONTROLLER,
            'catalog_source_commit': CATALOG,
            'packages': [],
        })

    def write_package(self, package_id, *, private=False, v2=True, corrupt=False):
        source_repo = f'https://github.com/example/{package_id}.git'
        namespace = 'one-person-lab-private-packages' if private else 'one-person-lab-packages'
        manifest = {
            'package_id': package_id,
            'source_repo': source_repo,
            'version': '1.0.0',
            'publication_channel_admission': 'admitted',
            'codex_surface': {
                'configured_codex_plugin_carrier': {
                    'publication_ref': f'ghcr.io/gaofeng21cn/{namespace}/{package_id}:latest-stable',
                },
            },
        }
        if private:
            manifest['visibility'] = 'authorized_only'
        if v2:
            ref = f'payloads/{package_id}-1.0.1.json'
            payload_path = self.catalog / 'packages' / ref
            write(payload_path, {
                'package_format': 'v2',
                'package_id': package_id,
                'source_repo': source_repo,
                'package_version': '1.0.1',
                'source_commit': V2_OWNER,
                'content_lock': {'digest': CONTENT_DIGEST},
                'archive_sha256': ARCHIVE_DIGEST,
            })
            manifest['v2_release'] = {
                'version': '1.0.1',
                'source_commit': V2_OWNER,
                'payload_manifest_ref': ref,
                'payload_sha256': 'sha256:' + hashlib.sha256(payload_path.read_bytes()).hexdigest(),
            }
            if corrupt:
                payload_path.write_text(payload_path.read_text() + '\n')
        write(self.catalog / 'packages' / 'agents' / f'{package_id}.json', manifest)

    def make_plan(self, package_ids=None):
        def fake_gh(endpoint):
            if '/git/ref/tags/v' in endpoint:
                return {'object': {'type': 'tag', 'sha': TAG}}
            if f'/git/tags/{TAG}' in endpoint:
                return {'object': {'type': 'commit', 'sha': V2_OWNER}}
            return {'private': endpoint.endswith('/restricted') or endpoint.endswith('/restricted-v2')}

        args = SimpleNamespace(
            framework_root=self.framework, catalog_root=self.catalog, controller_source_commit=CONTROLLER,
            output_root=self.output, preparation=self.preparation, repository='gaofeng21cn/one-person-lab',
            package_id=package_ids,
        )
        previous_channel = {
            'status': 'present',
            'digest': PREDECESSOR,
            'fingerprint': {
                'package_version': '1.0.0',
                'package_content_digest': PUBLISHED_DIGEST,
                'owner_source_commit': V2_OWNER,
            },
        }
        with patch.dict(detector.os.environ, {'GITHUB_SHA': CONTROLLER, 'GITHUB_RUN_ID': '42'}), \
             patch.object(detector, 'git', side_effect=[CONTROLLER, CATALOG]), \
             patch.object(detector, 'gh', side_effect=fake_gh), \
             patch.object(channels, 'gh', side_effect=fake_gh), \
             patch.object(detector, 'public_channel', return_value=previous_channel):
            return detector.detect(args)

    def test_plans_and_dispatches_v2_packages_while_blocking_invalid_entries(self):
        self.write_package('legacy-only', v2=False)
        self.write_package('modern', v2=True)
        self.write_package('restricted-v2', private=True, v2=True)
        self.write_package('broken', v2=True, corrupt=True)
        plan = self.make_plan()
        self.assertEqual(plan['framework_source_commit'], CONTROLLER)
        self.assertEqual(plan['workflow_source_commit'], CONTROLLER)
        self.assertEqual(plan['catalog_source_commit'], CATALOG)
        self.assertEqual(plan['selection_scope'], 'all')
        self.assertNotIn('selected_package_ids', plan)
        entries = {row['package_id']: row for row in plan['packages']}
        self.assertEqual(set(entries), {'modern', 'restricted-v2'})
        modern = entries['modern']
        self.assertEqual(modern['expected_framework_source_commit'], CONTROLLER)
        self.assertEqual(modern['expected_catalog_source_commit'], CATALOG)
        self.assertEqual(modern['expected_package_version'], '1.0.1')
        self.assertEqual(modern['expected_owner_source_commit'], V2_OWNER)
        self.assertEqual(modern['package_format'], 'v2')
        self.assertEqual(modern['expected_latest_stable_predecessor'], PREDECESSOR)
        restricted_v2 = entries['restricted-v2']
        self.assertEqual(restricted_v2['expected_framework_source_commit'], CONTROLLER)
        self.assertEqual(restricted_v2['expected_catalog_source_commit'], CATALOG)
        self.assertEqual(restricted_v2['expected_package_version'], '1.0.1')
        self.assertEqual(restricted_v2['expected_owner_source_commit'], V2_OWNER)
        self.assertEqual(restricted_v2['package_format'], 'v2')
        self.assertEqual(restricted_v2['expected_latest_stable_predecessor'], 'resolve-authenticated')
        self.assertEqual(plan['blocked_packages'], [
            {'package_id': 'broken', 'reason': 'V2 Package payload bytes differ from the Catalog digest'},
            {'package_id': 'legacy-only', 'reason': 'V2 Package publication requires a Catalog release facet'},
        ])
        self.assertEqual(json.loads((self.output / 'selected-candidates.json').read_text())['candidate_fingerprint']
                         ['modern']['owner_source_commit'], V2_OWNER)

        def fake_dispatch(endpoint, *, method='GET', payload=None):
            if endpoint.endswith('/dispatches'):
                self.assertEqual(method, 'POST')
                self.posted.append((endpoint, payload['inputs']))
                return None
            if 'contents/.github/' in endpoint:
                pin = CONTROLLER if '/restricted-v2/' in endpoint else '1' * 40
                text = (
                    f'    uses: gaofeng21cn/one-person-lab/.github/workflows/publish-package.yml@{pin}\n'
                    f'      expected_framework_source_commit: {pin}\n'
                    '      expected_catalog_source_commit: ${{ inputs.expected_catalog_source_commit }}\n'
                )
                return {'content': base64.b64encode(text.encode()).decode()}
            return {'workflow_runs': []}

        tampered = dict(entries['modern'], package_id='misbound', expected_framework_source_commit='1' * 40)
        unpinned_private = dict(entries['restricted-v2'], package_id='restricted-unpinned', owner_repository='example/restricted-unpinned')
        v1_rejected = dict(entries['modern'], package_id='old-v1', package_format='v1')
        plan['packages'].extend([tampered, unpinned_private, v1_rejected])
        with patch.object(dispatcher, 'gh', side_effect=fake_dispatch):
            outcomes = {item['package_id']: item['status'] for item in dispatcher.dispatch(plan, '42')}
        self.assertEqual(outcomes, {
            'modern': 'dispatched',
            'restricted-v2': 'dispatched',
            'misbound': 'dispatch_unresolved',
            'restricted-unpinned': 'dispatch_unresolved',
            'old-v1': 'dispatch_unresolved',
        })
        public_calls = {payload['package_id']: payload for endpoint, payload in self.posted if '/example/' not in endpoint}
        self.assertEqual(public_calls['modern']['expected_framework_source_commit'], CONTROLLER)
        self.assertEqual(public_calls['modern']['expected_catalog_source_commit'], CATALOG)
        private_v2_calls = [payload for endpoint, payload in self.posted if '/example/restricted-v2/' in endpoint]
        self.assertEqual(len(private_v2_calls), 1)
        self.assertNotIn('expected_framework_source_commit', private_v2_calls[0])
        self.assertEqual(private_v2_calls[0]['expected_catalog_source_commit'], CATALOG)

    def test_selected_package_plan_records_its_exact_scope(self):
        self.write_package('other', v2=True)
        self.write_package('modern', v2=True)
        plan = self.make_plan(package_ids=['modern'])
        self.assertEqual(plan['selection_scope'], 'selected')
        self.assertEqual(plan['selected_package_ids'], ['modern'])
        self.assertEqual([row['package_id'] for row in plan['packages']], ['modern'])

    def test_plan_channel_updates_enforces_version_and_digest_discipline(self):
        candidate = {
            'package_version': '1.0.1',
            'package_content_digest': CONTENT_DIGEST,
            'owner_source_commit': V2_OWNER,
        }
        plan = detector.plan_channel_updates(
            {
                'fresh': candidate,
                'unchanged': candidate,
                'dirty': candidate,
                'regressed': {**candidate, 'package_version': '1.0.0'},
                'empty_bump': candidate,
            },
            {
                'fresh': {'status': 'absent', 'digest': None, 'fingerprint': None},
                'unchanged': {'status': 'present', 'digest': PREDECESSOR, 'fingerprint': candidate},
                'dirty': {'status': 'present', 'digest': PREDECESSOR, 'fingerprint': {
                    **candidate, 'package_content_digest': PUBLISHED_DIGEST,
                }},
                'regressed': {'status': 'present', 'digest': PREDECESSOR, 'fingerprint': {
                    **candidate, 'package_version': '1.0.2', 'package_content_digest': PUBLISHED_DIGEST,
                }},
                'empty_bump': {'status': 'present', 'digest': PREDECESSOR, 'fingerprint': {
                    **candidate, 'package_version': '1.0.0',
                }},
            },
        )
        self.assertEqual(plan['changed_packages'], ['fresh'])
        self.assertEqual(plan['unchanged_packages'], ['unchanged'])
        self.assertEqual({row['package_id']: row['reason'] for row in plan['violations']}, {
            'dirty': 'version_bump_required',
            'regressed': 'version_regression',
            'empty_bump': 'version_change_without_content_change',
        })
