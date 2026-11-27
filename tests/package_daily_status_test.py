import unittest
from unittest.mock import patch

from scripts.package_release.daily_status import daily_package_status
from scripts.package_release.common import ReleaseError, request_id


class DailyPackageStatusTests(unittest.TestCase):
    def test_exact_dispatch_binding_and_public_registry_readback(self):
        source = 'a' * 40
        base = {'status': 'completed', 'conclusion': 'success', 'html_url': 'url',
                'head_sha': source, 'created_at': '2026-11-27T01:46:26Z'}
        detection = dict(base, id=10)
        detection['event'] = 'schedule'
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

    def test_daily_observation_keeps_package_results_across_targeted_runs(self):
        source = 'a' * 40
        base = {'status': 'completed', 'conclusion': 'success', 'html_url': 'url',
                'head_sha': source, 'created_at': '2026-11-27T01:46:26Z'}
        scheduled = dict(base, id=10, event='schedule')
        resumed = dict(base, id=20, event='workflow_dispatch')
        targeted = dict(base, id=30, event='workflow_dispatch')
        dispatches = [dict(base, id=31, event='workflow_run'), dict(base, id=21, event='workflow_dispatch')]

        def package(package_id, version, owner_source):
            return {'package_id': package_id, 'visibility': 'public', 'expected_package_version': version,
                    'expected_owner_source_commit': owner_source,
                    'publication_request_id': request_id(package_id, version, owner_source)}

        def plan(run_id, packages, blocked=()):
            return {'surface_kind': 'opl_package_publication_dispatch_plan.v1', 'source_run_id': str(run_id),
                    'workflow_source_commit': source, 'framework_source_commit': source,
                    'blocked_packages': [{'package_id': item} for item in blocked], 'packages': packages}

        plans = {
            10: plan(10, [package('demo', '1.2.2', 'b' * 40)], ('other', 'blocked')),
            20: plan(20, [package('other', '2.0.0', 'c' * 40)]),
            30: plan(30, [package('demo', '1.2.3', 'd' * 40)]),
            21: {'source_run_id': '20', 'packages': [{'package_id': 'other', 'status': 'already_dispatched'}]},
            31: {'source_run_id': '30', 'packages': [{'package_id': 'demo', 'status': 'dispatched'}]},
        }

        def workflow(repository, name, **filters):
            if name == 'daily-package-channel.yml':
                self.assertEqual(filters['created'], '2026-11-27T00:00:00+00:00..2026-11-27T23:59:59+00:00')
                return [scheduled] if filters['event'] == 'schedule' else [targeted, resumed]
            if name == 'daily-package-channel-publication.yml':
                return dispatches
            raise ReleaseError('Actions access unavailable for the publisher workflow')

        def artifact(repository, run, name, member):
            self.assertTrue(name.endswith(f"-{run['id']}"))
            return plans[run['id']]

        def channel(package_id, owner):
            if package_id == 'other':
                return {'status': 'absent', 'fingerprint': None}
            return {'status': 'present', 'digest': 'sha256:' + '1' * 64,
                    'fingerprint': {'package_version': '1.2.3', 'owner_source_commit': 'd' * 40}}

        with patch('scripts.package_release.daily_status.workflow_runs', side_effect=workflow), \
                patch('scripts.package_release.daily_status.run_artifact', side_effect=artifact), \
                patch('scripts.package_release.daily_status.public_channel', side_effect=channel):
            report = daily_package_status(window_start='2026-11-27T00:00:00+00:00',
                                          window_end='2026-11-27T23:59:59+00:00')
        self.assertEqual(report['detection_run']['id'], 30)
        self.assertEqual(report['detection_run']['event'], 'workflow_dispatch')
        self.assertEqual(report['dispatch_run']['id'], 31)
        self.assertEqual(report['publisher_evidence'], 'unavailable')
        self.assertEqual(report['status'], 'blocked')
        demo, other = report['packages']
        self.assertEqual((demo['package_id'], demo['version'], demo['status']), ('demo', '1.2.3', 'publication_verified'))
        self.assertEqual(demo['detection_run']['id'], 30)
        self.assertEqual(demo['dispatch_run']['id'], 31)
        self.assertEqual((other['package_id'], other['status']), ('other', 'already_dispatched'))
        self.assertEqual(other['detection_run']['id'], 20)
        self.assertEqual(other['dispatch_run']['id'], 21)
        self.assertEqual([row['package_id'] for row in report['blocked_packages']], ['blocked'])
        self.assertEqual(report['blocked_packages'][0]['detection_run']['id'], 10)

    def observe_recovery_plan(self, recovery_plan, *, event):
        source = 'a' * 40
        base = {'status': 'completed', 'conclusion': 'success', 'html_url': 'url',
                'head_sha': source, 'created_at': '2026-11-27T01:46:26Z'}
        runs = [dict(base, id=10, event='schedule'), dict(base, id=20, event=event)]
        plans = {
            10: {'selection_scope': 'all', 'blocked_packages': [{'package_id': 'demo'}, {'package_id': 'other'}]},
            20: recovery_plan,
        }

        def workflow(repository, name, **filters):
            if name == 'daily-package-channel.yml':
                return [run for run in runs if run['event'] == filters['event']]
            self.assertEqual(name, 'daily-package-channel-publication.yml')
            return []

        def artifact(repository, run, name, member):
            return {'surface_kind': 'opl_package_publication_dispatch_plan.v1', 'source_run_id': str(run['id']),
                    'workflow_source_commit': source, 'framework_source_commit': source,
                    'packages': [], 'blocked_packages': [], **plans[run['id']]}

        with patch('scripts.package_release.daily_status.workflow_runs', side_effect=workflow), \
                patch('scripts.package_release.daily_status.run_artifact', side_effect=artifact):
            return daily_package_status(window_start='2026-11-27T00:00:00Z')

    def test_full_sweep_clears_blocked_packages_that_are_now_unchanged(self):
        report = self.observe_recovery_plan({'selection_scope': 'all'}, event='schedule')
        self.assertEqual(report['detection_run']['id'], 20)
        self.assertEqual(report['status'], 'unchanged')
        self.assertEqual(report['packages'], [])
        self.assertEqual(report['blocked_packages'], [])

    def test_selected_recovery_clears_only_the_requested_package(self):
        for packages, expected in [([], []),
                                   ([{'package_id': 'demo', 'visibility': 'authorized_only'}], [('demo', 20)])]:
            with self.subTest(packages=packages):
                report = self.observe_recovery_plan({
                    'selection_scope': 'selected', 'selected_package_ids': ['demo'], 'packages': packages,
                }, event='workflow_dispatch')
                self.assertEqual(report['detection_run']['id'], 20)
                self.assertEqual(report['status'], 'blocked')
                self.assertEqual([(row['package_id'], row['detection_run']['id']) for row in report['packages']],
                                 expected)
                self.assertEqual([(row['package_id'], row['detection_run']['id']) for row in report['blocked_packages']],
                                 [('other', 10)])

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
