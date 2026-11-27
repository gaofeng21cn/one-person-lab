from __future__ import annotations

import base64
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from package_release.common import ReleaseError, write

spec = importlib.util.spec_from_file_location(
    'sync_private_package_publishers', ROOT / 'scripts/sync-private-package-publishers.py'
)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PrivatePackagePublisherTests(unittest.TestCase):
    def test_v2_and_legacy_private_publishers_have_distinct_pins(self):
        with tempfile.TemporaryDirectory() as temporary:
            catalog = Path(temporary)
            repo = 'https://github.com/example/owner.git'
            for package_id in ('legacy', 'modern'):
                manifest = {'package_id': package_id, 'source_repo': repo, 'visibility': 'authorized_only'}
                if package_id == 'modern':
                    manifest['v2_release'] = {'version': '1.0.0'}
                write(catalog / 'packages' / 'agents' / f'{package_id}.json', manifest)

            legacy_commit = 'b' * 40
            controller_commit = 'c' * 40
            with patch.object(publisher, 'git', return_value=legacy_commit), \
                    patch.object(publisher, 'sync_publisher', return_value='unchanged') as sync_publisher:
                results = publisher.sync(catalog, catalog=catalog, controller_source_commit=controller_commit)
                self.assertEqual([row['status'] for row in results], ['unchanged', 'unchanged'])
                self.assertEqual(
                    {args[0]['package_id']: args[1] for args, _ in sync_publisher.call_args_list},
                    {'legacy': legacy_commit, 'modern': controller_commit},
                )
                sync_publisher.reset_mock()
                results = publisher.sync(catalog, catalog=catalog)
                self.assertEqual([row['status'] for row in results], ['unchanged', 'blocked'])
                self.assertEqual(sync_publisher.call_count, 1)

    def test_failed_pin_keeps_healthy_packages_eligible_for_detection(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            tooling = work / 'tooling'
            tooling.mkdir()
            subprocess.run(['git', 'init', '-q', str(tooling)], check=True)
            subprocess.run(
                ['git', '-C', str(tooling), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                 'commit', '-qm', 'Select publisher tooling', '--allow-empty'],
                check=True,
            )
            commit = subprocess.check_output(['git', '-C', str(tooling), 'rev-parse', 'HEAD'], text=True).strip()
            catalog = work / 'catalog'
            for package_id, visibility in [('alpha', 'authorized_only'), ('beta', 'authorized_only'), ('public', 'public')]:
                write(catalog / 'packages' / 'agents' / f'{package_id}.json', {
                    'package_id': package_id,
                    'source_repo': f'https://github.com/example/{package_id}.git',
                    'visibility': visibility,
                })

            writes = []
            expected_beta = publisher.wrapper('beta', commit, catalog=True)
            beta_content = base64.b64encode(expected_beta.encode()).decode()

            def gh(endpoint, *, method='GET', payload=None):
                if endpoint.startswith('repos/example/alpha/'):
                    raise ReleaseError('HTTP 403')
                self.assertTrue(endpoint.startswith('repos/example/beta/'))
                if method == 'PUT':
                    writes.append(payload)
                    raise TimeoutError('Lost PUT response after writing')
                return {'content': beta_content if writes else '', 'sha': 'previous-sha'}

            with patch.object(publisher, 'gh', side_effect=gh):
                results = publisher.sync(tooling, catalog=catalog)
            self.assertEqual([(row['package_id'], row['status']) for row in results], [
                ('alpha', 'blocked'), ('beta', 'synchronized'),
            ])
            self.assertEqual(len(writes), 1)
            self.assertEqual(writes[0]['sha'], 'previous-sha')
            self.assertEqual(writes[0]['content'], beta_content)

            preparation = work / 'prepared.json'
            write(preparation, {'catalog_source_commit': 'a' * 40, 'packages': [
                {'package_id': 'alpha', 'status': 'prepared'},
                {'package_id': 'beta', 'status': 'prepared'},
                {'package_id': 'public', 'status': 'prepared'},
            ]})
            publisher.record_blocked_pins(preparation, results)
            report = json.loads(preparation.read_text())
            self.assertEqual(report['catalog_source_commit'], 'a' * 40)
            self.assertEqual({row['package_id']: row['status'] for row in report['packages']}, {
                'alpha': 'blocked', 'beta': 'prepared', 'public': 'prepared',
            })
            self.assertIn('Private publisher pin synchronization failed', report['packages'][0]['reason'])
