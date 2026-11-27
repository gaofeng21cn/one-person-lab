import unittest
from unittest.mock import patch

from scripts.package_release.daily_status import daily_package_status
from scripts.package_release.common import request_id


class DailyPackageStatusTests(unittest.TestCase):
    def test_exact_dispatch_binding_and_public_registry_readback(self):
        source = 'a' * 40
        base = {'status': 'completed', 'conclusion': 'success', 'html_url': 'url',
                'head_sha': source, 'created_at': '2026-11-27T01:46:26Z'}
        detection = dict(base, id=10)
        dispatch = dict(base, id=20, event='workflow_run')
        unrelated = dict(base, id=21, event='workflow_run')
        request = request_id('demo', '1.2.3', source)
        publisher = dict(base, id=30, display_title=f'Package demo 1.2.3 / {request}')
        plan = {'surface_kind': 'opl_package_publication_dispatch_plan.v1', 'source_run_id': '10',
                'workflow_source_commit': source, 'framework_source_commit': source, 'blocked_packages': [],
                'packages': [{'package_id': 'demo', 'visibility': 'public', 'expected_package_version': '1.2.3',
                              'expected_owner_source_commit': source, 'publication_request_id': request}]}
        outcome = {'source_run_id': '10', 'packages': [{'package_id': 'demo', 'status': 'dispatched'}]}
        wrong_outcome = dict(outcome, source_run_id='9')
        matching_channel = {'status': 'present', 'digest': 'sha256:' + '1' * 64,
                            'fingerprint': {'package_version': '1.2.3', 'owner_source_commit': source}}
        different_channel = dict(matching_channel, fingerprint=dict(matching_channel['fingerprint'],
                                                                   package_version='1.2.4'))
        for channel, expected in [(matching_channel, 'publication_verified'), (different_channel, 'channel_differs')]:
            with self.subTest(expected=expected), patch.multiple(
                'scripts.package_release.daily_status', **{
                    'workflow_runs': lambda *args, **kwargs: {
                        'daily-package-channel.yml': [detection],
                        'daily-package-channel-publication.yml': [unrelated, dispatch],
                        'publish-package.yml': [publisher],
                    }[args[1]],
                    'run_artifact': lambda *args: {10: plan, 20: outcome, 21: wrong_outcome}[args[1]['id']],
                    'public_channel': lambda *args: channel,
                },
            ):
                report = daily_package_status()
            self.assertEqual(report['dispatch_run']['id'], 20)
            self.assertEqual(report['packages'][0]['status'], expected)

    def test_no_detection_is_read_only_and_conservative(self):
        with patch('scripts.package_release.daily_status.workflow_runs', return_value=[]):
            report = daily_package_status()
        self.assertEqual(report['status'], 'no_detection')
        self.assertEqual(report['packages'], [])

    def test_incomplete_detection_does_not_claim_dispatch(self):
        run = {'id': 10, 'status': 'in_progress', 'conclusion': None,
               'html_url': 'url', 'head_sha': 'a' * 40}
        with patch('scripts.package_release.daily_status.workflow_runs', return_value=[run]):
            report = daily_package_status()
        self.assertEqual(report['status'], 'detection_running')
        self.assertIsNone(report['dispatch_run'])


if __name__ == '__main__':
    unittest.main()
