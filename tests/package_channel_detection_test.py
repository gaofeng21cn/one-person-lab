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
from package_release.common import write
from package_release import channels

LEGACY = '1' * 40
CONTROLLER = '2' * 40
CATALOG = '3' * 40
LEGACY_OWNER = '4' * 40
V2_OWNER = '5' * 40
TAG = '6' * 40
CONTENT_DIGEST = 'sha256:' + '7' * 64
ARCHIVE_DIGEST = 'sha256:' + '8' * 64
PREDECESSOR = 'sha256:' + '9' * 64


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f'scripts/{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


detector = load_script('package-channel-detection')
dispatcher = load_script('package-publication-dispatch')


class MixedPackageChannelTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='opl-package-channel-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.catalog = self.root / 'catalog'
        self.framework = self.root / 'framework'
        self.output = self.root / 'plan'
        self.preparation = self.root / 'preparation.json'
        self.summary = {'candidate_fingerprint': {}, 'owner_managed_packages': {}}
        self.posted = []
        write(self.preparation, {
            'framework_source_commit': LEGACY,
            'catalog_source_commit': CATALOG,
            'packages': [],
        })

    def write_package(self, package_id, *, private=False, v2=False, corrupt=False):
        source_repo = f'https://github.com/example/{package_id}.git'
        manifest = {
            'package_id': package_id,
            'source_repo': source_repo,
            'version': '1.0.0',
            'codex_surface': {
                'carrier_source_commit': LEGACY_OWNER,
                'plugin_payload_manifest_url': f'payloads/{package_id}-1.0.0.json',
            },
        }
        fingerprint = {
            'package_version': '1.0.0',
            'owner_source_commit': LEGACY_OWNER,
            'package_content_digest': CONTENT_DIGEST,
        }
        legacy_payload = self.catalog / 'packages' / manifest['codex_surface']['plugin_payload_manifest_url']
        write(legacy_payload, {
            'package_id': package_id,
            'source_repo': source_repo,
            'package_version': '1.0.0',
            'source_commit': LEGACY_OWNER,
            'content_lock': {'digest': CONTENT_DIGEST},
        })
        if private:
            manifest['visibility'] = 'authorized_only'
            self.summary['owner_managed_packages'][package_id] = {}
        else:
            self.summary['candidate_fingerprint'][package_id] = fingerprint
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

    def make_plan(self):
        def fake_run(command, **kwargs):
            if '-e' in command:
                return SimpleNamespace(stdout=json.dumps(self.summary), returncode=0)
            self.assertIn('scripts/package-owner-channel-plan.mjs', command)
            fingerprint = json.loads(Path(command[command.index('--candidate-summary') + 1]).read_text())
            write(Path(command[-1]), {
                'changed_packages': list(fingerprint['candidate_fingerprint']), 'violations': [],
            })
            return SimpleNamespace(stdout='', returncode=0)

        def fake_gh(endpoint):
            if '/git/ref/tags/v' in endpoint:
                return {'object': {'type': 'tag', 'sha': TAG}}
            if f'/git/tags/{TAG}' in endpoint:
                is_v2 = '/modern/' in endpoint or '/restricted-v2/' in endpoint
                return {'object': {'type': 'commit', 'sha': V2_OWNER if is_v2 else LEGACY_OWNER}}
            return {'private': endpoint.endswith('/restricted') or endpoint.endswith('/restricted-v2')}

        args = SimpleNamespace(
            framework_root=self.framework, catalog_root=self.catalog, controller_source_commit=CONTROLLER,
            output_root=self.output, preparation=self.preparation, repository='gaofeng21cn/one-person-lab',
            package_id=None,
        )
        with patch.dict(detector.os.environ, {'GITHUB_SHA': CONTROLLER, 'GITHUB_RUN_ID': '42'}), \
             patch.object(detector, 'git', side_effect=[LEGACY, CATALOG]), \
             patch.object(detector, 'run', side_effect=fake_run), \
             patch.object(detector, 'gh', side_effect=fake_gh), \
             patch.object(channels, 'gh', side_effect=fake_gh), \
             patch.object(detector, 'public_channel', return_value={'digest': PREDECESSOR}):
            return detector.detect(args)

    def test_picks_v2_facet_and_tooling_per_package_without_retargeting_legacy(self):
        self.write_package('classic')
        self.write_package('modern', v2=True)
        self.write_package('restricted', private=True)
        self.write_package('restricted-v2', private=True, v2=True)
        self.write_package('broken', v2=True, corrupt=True)
        plan = self.make_plan()
        self.assertEqual(plan['framework_source_commit'], LEGACY)
        self.assertEqual(plan['workflow_source_commit'], CONTROLLER)
        self.assertEqual(plan['catalog_source_commit'], CATALOG)
        entries = {row['package_id']: row for row in plan['packages']}
        self.assertEqual(set(entries), {'classic', 'modern', 'restricted', 'restricted-v2'})
        self.assertEqual(entries['classic']['expected_framework_source_commit'], LEGACY)
        modern = entries['modern']
        self.assertEqual(modern['expected_framework_source_commit'], CONTROLLER)
        self.assertEqual(modern['expected_catalog_source_commit'], CATALOG)
        self.assertEqual(modern['expected_package_version'], '1.0.1')
        self.assertEqual(modern['expected_owner_source_commit'], V2_OWNER)
        self.assertEqual(modern['package_format'], 'v2')
        self.assertEqual(entries['restricted']['expected_framework_source_commit'], LEGACY)
        restricted_v2 = entries['restricted-v2']
        self.assertEqual(restricted_v2['expected_framework_source_commit'], CONTROLLER)
        self.assertEqual(restricted_v2['expected_catalog_source_commit'], CATALOG)
        self.assertEqual(restricted_v2['expected_package_version'], '1.0.1')
        self.assertEqual(restricted_v2['expected_owner_source_commit'], V2_OWNER)
        self.assertEqual(restricted_v2['package_format'], 'v2')
        self.assertEqual(restricted_v2['expected_latest_stable_predecessor'], 'resolve-authenticated')
        self.assertEqual(entries['modern']['expected_latest_stable_predecessor'], PREDECESSOR)
        self.assertEqual(entries['restricted']['expected_latest_stable_predecessor'], 'resolve-authenticated')
        self.assertEqual(plan['blocked_packages'], [{
            'package_id': 'broken', 'reason': 'V2 Package payload bytes differ from the Catalog digest',
        }])
        self.assertEqual(json.loads((self.output / 'selected-candidates.json').read_text())['candidate_fingerprint']
                         ['modern']['owner_source_commit'], V2_OWNER)

        def fake_dispatch(endpoint, *, method='GET', payload=None):
            if endpoint.endswith('/dispatches'):
                self.assertEqual(method, 'POST')
                self.posted.append((endpoint, payload['inputs']))
                return None
            if 'contents/.github/' in endpoint:
                pin = CONTROLLER if '/restricted-v2/' in endpoint else LEGACY
                text = (
                    f'    uses: gaofeng21cn/one-person-lab/.github/workflows/publish-package.yml@{pin}\n'
                    f'      expected_framework_source_commit: {pin}\n'
                    '      expected_catalog_source_commit: ${{ inputs.expected_catalog_source_commit }}\n'
                )
                return {'content': base64.b64encode(text.encode()).decode()}
            return {'workflow_runs': []}

        tampered = dict(entries['modern'], package_id='misbound', expected_framework_source_commit=LEGACY)
        unpinned_private = dict(entries['restricted-v2'], package_id='restricted-unpinned', owner_repository='example/restricted-unpinned')
        plan['packages'].extend([tampered, unpinned_private])
        with patch.object(dispatcher, 'gh', side_effect=fake_dispatch):
            outcomes = {item['package_id']: item['status'] for item in dispatcher.dispatch(plan, '42')}
        self.assertEqual(outcomes, {
            'classic': 'dispatched', 'modern': 'dispatched', 'restricted': 'dispatched',
            'restricted-v2': 'dispatched', 'misbound': 'dispatch_unresolved', 'restricted-unpinned': 'dispatch_unresolved',
        })
        public_calls = {payload['package_id']: payload for endpoint, payload in self.posted if '/example/' not in endpoint}
        self.assertEqual(public_calls['classic']['expected_framework_source_commit'], LEGACY)
        self.assertEqual(public_calls['modern']['expected_framework_source_commit'], CONTROLLER)
        private_calls = [payload for endpoint, payload in self.posted if '/example/restricted/' in endpoint]
        self.assertEqual(len(private_calls), 1)
        self.assertNotIn('expected_framework_source_commit', private_calls[0])
        self.assertEqual(private_calls[0]['expected_catalog_source_commit'], CATALOG)
        private_v2_calls = [payload for endpoint, payload in self.posted if '/example/restricted-v2/' in endpoint]
        self.assertEqual(len(private_v2_calls), 1)
        self.assertNotIn('expected_framework_source_commit', private_v2_calls[0])
        self.assertEqual(private_v2_calls[0]['expected_catalog_source_commit'], CATALOG)
