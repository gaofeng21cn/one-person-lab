from __future__ import annotations
import importlib.util
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from package_release.owner import _ordered_content_digest, merge_release_changes, prepare_owner, wait_for_checks
from package_release.common import ReleaseError
spec = importlib.util.spec_from_file_location('package_daily_release', ROOT / 'scripts/package-daily-release.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackagePublisherCheckoutTests(unittest.TestCase):
    def test_verify_publisher_checkout_requires_canonical_main_and_catalog(self):
        controller = 'a' * 40
        with patch.object(package, 'git', side_effect=['', '', controller]):
            package.verify_publisher_checkout(Path('/fixture'), controller, Path('/catalog'))
        with patch.object(package, 'git', side_effect=['', '', 'b' * 40]):
            with self.assertRaisesRegex(ReleaseError, 'fresh canonical main'):
                package.verify_publisher_checkout(Path('/fixture'), controller, Path('/catalog'))
        with patch.object(package, 'git', side_effect=['']):
            with self.assertRaisesRegex(ReleaseError, 'official Catalog'):
                package.verify_publisher_checkout(Path('/fixture'), controller, None)

    def test_daily_workflow_and_scripts_retire_pre_v2_pins_and_flow_clone(self):
        daily_yml = (ROOT / '.github/workflows/daily-package-channel.yml').read_text()
        for forbidden in (
            'PACKAGE_PUBLISHER_TOOLING_COMMIT',
            'e73718a2a',
            '.package-publisher',
            'opl-flow',
            '--publisher-tooling-commit',
            '--flow-root',
        ):
            self.assertNotIn(forbidden, daily_yml, f'Retired pre-v2 reference remains in daily workflow: {forbidden}')
        self.assertFalse((ROOT / 'scripts/package-carrier-source-paths.mjs').exists())
        publish_yml = (ROOT / '.github/workflows/publish-package.yml').read_text()
        self.assertIn('opl.release-receipt.v1', publish_yml)
        self.assertIn('opl-release-receipt-${{ inputs.package_id }}-oci-${{ github.run_id }}', publish_yml)
        self.assertNotIn('contracts/opl-framework/packages', publish_yml)


class PackageDailyControlTests(unittest.TestCase):
    def test_daily_workflow_uses_shared_verify_dispatch_client_id_and_receipt(self):
        daily_yml = (ROOT / '.github/workflows/daily-package-channel.yml').read_text()
        self.assertIn('gaofeng21cn/opl-release/.github/actions/verify-dispatch@v1', daily_yml)
        self.assertIn('opl-release-receipt-opl-framework-package-${{ github.run_id }}', daily_yml)
        self.assertFalse((ROOT / 'scripts/package_release/daily_control.py').exists())
        for rel in (
            '.github/workflows/daily-package-channel.yml',
            '.github/workflows/daily-package-channel-publication.yml',
            '.github/workflows/link-source-access.yml',
        ):
            text = (ROOT / rel).read_text()
            self.assertNotIn('app-id:', text, f'Deprecated app-id remains in {rel}')
            self.assertIn('client-id:', text, f'Expected client-id in {rel}')


class ProductReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = {'product_id': 'fixture', 'repository': 'gaofeng21cn/fixture',
                       'version_file': {'path': 'product-version.json', 'kind': 'json'},
                       'release_paths': ['app', 'product-version.json'], 'tag_prefix': 'v'}
        (self.root / 'app').mkdir()
        (self.root / 'app/main').write_text('first shipped bytes')
        (self.root / 'product-version.json').write_text('{"version":"1.2.3"}\n')
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Synthetic Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.commit()
        self.first = self.git('rev-parse', 'HEAD')
        self.git('tag', '-a', 'v1.2.3', '-m', 'fixture')
        self.channel = {'version': '1.2.3', 'source_commit': self.first}

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True, stderr=subprocess.DEVNULL).strip()

    def commit(self):
        self.git('add', '.')
        self.git('commit', '--allow-empty', '-m', 'fixture')

    def package_selection(self):
        (self.root / 'release-automation.json').write_text(json.dumps({'strategy': 'daily_patch'}))
        payload = self.root / 'published-payload.json'
        payload.write_text(json.dumps({'source_commit': self.first}))
        projection = {
            'package_id': 'fixture', 'version': '1.2.3',
            'publication_source': {'owner_package_manifest_ref': 'plugins/fixture/opl-package.json'},
        }
        allowlist = {'source_root': 'plugins/fixture', 'plugin_id': 'fixture', 'paths': ['opl-package.json']}
        return projection, allowlist, payload

    def test_v2_owner_reports_candidate_without_tagging_in_dry_run(self):
        projection, allowlist, payload = self.package_selection()
        descriptor = self.root / 'opl-package.json'
        descriptor.write_text(json.dumps({
            'schema_version': 'opl.package.v2', 'identity': {'id': 'fixture', 'version': '1.2.3'},
        }))
        self.commit()
        source = self.git('rev-parse', 'HEAD')
        with patch('package_release.owner.execute_commands') as commands:
            result = prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                                   apply=False, payload_path=payload, v2_controller=ROOT)
            self.assertEqual(result['status'], 'needs_release')
            self.assertEqual(result['package_format'], 'v2')
            self.assertEqual(result['owner_source_commit'], source)
            self.assertEqual(result['version'], '1.2.4')
            commands.assert_not_called()
        self.assertEqual(self.git('tag', '--list'), 'v1.2.3')
        self.assertEqual(self.git('status', '--porcelain'), '')

        self.git('tag', '-a', 'v1.2.4', self.first, '-m', 'Other release source')
        result = prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                               apply=False, payload_path=payload, v2_controller=ROOT)
        self.assertEqual((result['status'], result['version']), ('needs_release', '1.2.5'))
        self.assertEqual(self.git('rev-parse', 'v1.2.4^{}'), self.first)

    def test_private_v2_owner_prepares_release_normally(self):
        projection, allowlist, payload = self.package_selection()
        projection['visibility'] = 'authorized_only'
        (self.root / 'opl-package.json').write_text(json.dumps({
            'schema_version': 'opl.package.v2',
            'identity': {'id': 'fixture', 'version': '1.2.3', 'intent': 'extension',
                         'name': {'en-US': 'Fixture', 'zh-CN': '样例'},
                         'summary': {'en-US': 'Fixture', 'zh-CN': '样例'}, 'publisher': 'fixture'},
        }))
        self.commit()
        dry = prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                          apply=False, payload_path=payload, v2_controller=ROOT)
        self.assertEqual((dry['status'], dry['package_format'], dry['version']), ('needs_release', 'v2', '1.2.4'))

        remote = self.root.parent / ('remote-priv-' + self.root.name + '.git')
        self.addCleanup(lambda: shutil.rmtree(remote, ignore_errors=True))
        subprocess.run(['git', 'clone', '--bare', str(self.root), str(remote)], check=True, capture_output=True)
        self.git('remote', 'add', 'origin', str(remote))

        def merge(root, *_args):
            self.git('push', 'origin', 'HEAD:refs/heads/main')
            return self.git('rev-parse', 'HEAD')

        with patch('package_release.owner.wait_for_checks'), patch('package_release.owner.merge_release_changes', side_effect=merge):
            result = prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                                   apply=True, payload_path=payload, v2_controller=ROOT)
        commit = self.git('rev-parse', 'v1.2.4^{}')
        self.assertEqual((result['status'], result['version']), ('prepared', '1.2.4'))
        self.assertEqual(result['owner_source_commit'], commit)
        self.assertEqual(result['candidate']['lock']['git_commit'], commit)
        self.assertEqual(result['candidate']['source_root'], '.')

    def test_nested_v2_owner_freezes_validated_subtree_and_aligns_declared_versions(self):
        projection, allowlist, payload = self.package_selection()
        # The fixture's external payload and owner release metadata are staged in this repo for the test.
        settings = self.root / 'release-automation.json'
        settings.write_text(json.dumps({'strategy': 'daily_patch', 'version_files': [
            {'path': 'policy.json', 'kind': 'json', 'field': 'package.version'},
        ]}))
        (self.root / 'policy.json').write_text(json.dumps({'package': {'version': '1.2.3'}}))
        carrier = self.root / allowlist['source_root']
        carrier.mkdir(parents=True)
        (carrier / 'opl-package.json').write_text(json.dumps({
            'schema_version': 'opl.package.v2',
            'identity': {'id': 'fixture', 'version': '1.2.3', 'intent': 'extension',
                         'name': {'en-US': 'Fixture', 'zh-CN': '样例'},
                         'summary': {'en-US': 'Fixture', 'zh-CN': '样例'}, 'publisher': 'fixture'},
        }))
        self.commit()
        remote = self.root.parent / ('remote-' + self.root.name + '.git')
        self.addCleanup(lambda: shutil.rmtree(remote, ignore_errors=True))
        subprocess.run(['git', 'clone', '--bare', str(self.root), str(remote)], check=True, capture_output=True)
        self.git('remote', 'add', 'origin', str(remote))

        def merge(root, *_args):
            self.git('push', 'origin', 'HEAD:refs/heads/main')
            return self.git('rev-parse', 'HEAD')

        with patch('package_release.owner.wait_for_checks'), patch('package_release.owner.merge_release_changes', side_effect=merge):
            result = prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                                   apply=True, payload_path=payload, v2_controller=ROOT)
        commit = self.git('rev-parse', 'v1.2.4^{}')
        self.assertEqual(result['owner_source_commit'], commit)
        self.assertEqual(result['candidate']['lock']['git_commit'], commit)
        self.assertEqual(result['candidate']['source_root'], allowlist['source_root'])
        self.assertEqual(result['candidate']['lock']['paths'], ['opl-package.json'])
        descriptor = json.loads(self.git('show', f"{commit}:{allowlist['source_root']}/opl-package.json"))
        self.assertEqual(descriptor['identity']['version'], '1.2.4')
        self.assertEqual(self.git('cat-file', '-t', 'v1.2.4'), 'tag')
        self.assertEqual(json.loads(self.git('show', f'{commit}:policy.json'))['package']['version'], '1.2.4')

    def test_recovers_exact_merge_after_timeout_and_subsequent_main_advance(self):
        remote = self.root.parent / ('remote-' + self.root.name + '.git')
        self.addCleanup(lambda: shutil.rmtree(remote, ignore_errors=True))
        subprocess.run(['git', 'clone', '--bare', str(self.root), str(remote)], check=True, capture_output=True)
        self.git('remote', 'add', 'origin', str(remote))
        (self.root / 'app/main').write_text('release bytes')
        self.commit()
        head = self.git('rev-parse', 'HEAD')

        def api(endpoint, *, method='GET', payload=None):
            if '/pulls?state=open' in endpoint:
                return [{'number': 7}]
            if endpoint.endswith('/commits/main'):
                return {'sha': self.first}
            if method == 'PUT' and endpoint.endswith('/pulls/7/merge'):
                self.git('push', 'origin', 'HEAD:refs/heads/main')
                (self.root / 'later').write_text('concurrent main update')
                self.commit()
                self.git('push', 'origin', 'HEAD:refs/heads/main')
                raise subprocess.TimeoutExpired('fixture GitHub merge', 60)
            raise AssertionError(endpoint)

        with patch('package_release.owner.gh', side_effect=api), patch('package_release.owner.wait_for_checks'):
            merged = merge_release_changes(self.root, 'fixture/example', self.first, 'fixture', '1.2.4')
        self.assertEqual(merged, head)
        self.assertEqual(self.git('rev-parse', 'HEAD'), head)
        self.assertNotEqual(self.git('rev-parse', 'origin/main'), head)

    def test_v2_owner_identity_must_match_catalog(self):
        projection, allowlist, payload = self.package_selection()
        (self.root / 'opl-package.json').write_text(json.dumps({
            'schema_version': 'opl.package.v2', 'identity': {'id': 'another-package', 'version': '1.2.3'},
        }))
        self.commit()
        with self.assertRaisesRegex(ReleaseError, 'v2 Package identity'):
            prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                          apply=False, payload_path=payload, v2_controller=ROOT)

    def test_prepare_owner_fails_closed_without_v2_descriptor(self):
        projection, allowlist, payload = self.package_selection()
        carrier = self.root / allowlist['source_root']
        carrier.mkdir(parents=True)
        descriptor = {'package_id': 'fixture', 'version': '1.2.3'}
        (carrier / 'opl-package.json').write_text(json.dumps(descriptor))
        (self.root / 'opl-package.json').write_text(json.dumps(descriptor))
        self.commit()
        with self.assertRaisesRegex(ReleaseError, 'opl.package.v2'):
            prepare_owner(self.root, projection, allowlist, ROOT, 'gaofeng21cn/fixture',
                          apply=False, payload_path=payload, v2_controller=ROOT)

    def test_self_publication_waits_for_source_checks_without_waiting_for_its_controller(self):
        source = {'name': 'source', 'check_suite': {'id': 10}, 'status': 'completed', 'conclusion': 'success'}
        controller = {'name': 'daily controller', 'check_suite': {'id': 20}, 'status': 'in_progress'}
        def api(path):
            return {'check_runs': [source, controller]} if 'check-runs' in path else {'statuses': []}
        with patch('package_release.owner.gh', api):
            wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, ignored_check_suite_id=20)
            source['status'] = 'in_progress'
            with self.assertRaises(ReleaseError):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, ignored_check_suite_id=20)
            source.update(status='completed', conclusion='failure')
            with self.assertRaises(ReleaseError):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, ignored_check_suite_id=20)

    def test_product_source_workflows_ignore_dispatch_but_retain_source_failures(self):
        source = {'id': 10, 'head_sha': self.first, 'path': '.github/workflows/ci.yml',
                  'status': 'completed', 'conclusion': 'success'}
        verify = {'id': 30, 'head_sha': self.first, 'path': '.github/workflows/verify.yml',
                  'status': 'completed', 'conclusion': 'failure'}
        dispatcher = {'name': 'Dispatch independent Package owner publishers',
                      'status': 'completed', 'conclusion': 'failure'}
        def api(path):
            if '/actions/workflows/ci.yml/runs?' in path:
                return {'workflow_runs': [source]}
            if '/actions/workflows/verify.yml/runs?' in path:
                return {'workflow_runs': [verify]}
            if '/check-runs?' in path:
                return {'check_runs': [dispatcher]}
            return {'statuses': []}
        workflows = ['ci.yml', 'verify.yml']
        with patch('package_release.owner.gh', side_effect=api):
            with self.assertRaisesRegex(ReleaseError, 'Source checks failed: verify.yml'):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, source_workflows=workflows)
            verify['conclusion'] = 'success'
            wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, source_workflows=workflows)
            verify.update(status='in_progress', conclusion=None)
            with self.assertRaisesRegex(ReleaseError, 'not completed'):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, source_workflows=workflows)
            # Merge acceptance still uses the original full check set.
            with self.assertRaisesRegex(ReleaseError, 'Dispatch independent Package owner publishers'):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0)

    def test_source_workflows_bind_exact_commit_and_latest_run_without_requiring_scheduled_runs(self):
        latest = {'id': 20, 'head_sha': self.first, 'path': '.github/workflows/ci.yml',
                  'status': 'completed', 'conclusion': 'success'}
        runs = [dict(latest, id=10, conclusion='failure'), latest,
                dict(latest, id=30, head_sha='a' * 40, conclusion='failure')]
        def api(path):
            if '/actions/workflows/ci.yml/runs?' in path:
                return {'workflow_runs': runs}
            if '/actions/workflows/verify.yml/runs?' in path:
                return {'workflow_runs': []}
            return {'statuses': []}
        with patch('package_release.owner.gh', side_effect=api):
            wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0,
                            source_workflows=['ci.yml', 'verify.yml'])
            runs[:] = [dict(latest, path='.github/workflows/other-workflow.yml')]
            with self.assertRaisesRegex(ReleaseError, 'not completed'):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0,
                                source_workflows=['ci.yml', 'verify.yml'])

    def test_scoped_source_workflows_still_reject_commit_status_failures(self):
        def api(path):
            if '/actions/workflows/' in path:
                return {'workflow_runs': [{'id': 10, 'head_sha': self.first,
                        'path': '.github/workflows/ci.yml', 'status': 'completed', 'conclusion': 'success'}]}
            return {'statuses': [{'context': 'external-required', 'state': 'failure'}]}
        with patch('package_release.owner.gh', side_effect=api):
            with self.assertRaisesRegex(ReleaseError, 'Source statuses failed: external-required'):
                wait_for_checks('gaofeng21cn/fixture', self.first, timeout=0, source_workflows=['ci.yml'])

    def test_ordered_content_digest_matches_opl_pack_and_detects_tamper(self):
        with tempfile.TemporaryDirectory() as pkg_tmp:
            pkg_root = Path(pkg_tmp)
            fixture_files = {
                'opl-package.json': b'{"schema_version":"opl.package.v2","identity":{"id":"fixture"}}\n',
                'skills/alpha/SKILL.md': b'# Alpha Skill\n\nValid utf-8 text.\n',
                'skills/beta/nested/helper.py': b'def run():\n    return 42\n',
                'assets/中文-file.bin': bytes(range(256)) + b'\x00\xff\xfe\x80',
                'assets/\U0001f680-icon.bin': b'\x89PNG\r\n\x1a\n',
                'assets/\ue000-pua.bin': b'\x01\x02\x03',
            }
            for rel, content in fixture_files.items():
                target = pkg_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)

            node_script = (
                "import fs from 'node:fs'; "
                "import path from 'node:path'; "
                "import { collectPackageReleasePaths, computePackageContentDigest } "
                "from './packages/pack/src/build/content-lock.ts'; "
                "const pkgRoot = process.argv[1]; "
                "const paths = collectPackageReleasePaths(pkgRoot); "
                "const digest = computePackageContentDigest(paths, (rel) => fs.readFileSync(path.join(pkgRoot, rel))); "
                "console.log(JSON.stringify({ paths, digest }));"
            )
            res = subprocess.run(
                ['node', '--conditions=opl-source', '--experimental-strip-types', '-e', node_script, str(pkg_root)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=True,
            )
            pack_result = json.loads(res.stdout)
            reverse_paths = list(reversed(pack_result['paths']))
            py_digest = _ordered_content_digest(reverse_paths, lambda rel: (pkg_root / rel).read_bytes())
            self.assertEqual(py_digest, pack_result['digest'])

            # 1-byte tamper sensitivity and parity after tamper
            tampered_path = pkg_root / 'skills/beta/nested/helper.py'
            tampered_bytes = bytearray(tampered_path.read_bytes())
            tampered_bytes[-2] ^= 0x01
            tampered_path.write_bytes(bytes(tampered_bytes))

            res_tampered = subprocess.run(
                ['node', '--conditions=opl-source', '--experimental-strip-types', '-e', node_script, str(pkg_root)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=True,
            )
            pack_tampered = json.loads(res_tampered.stdout)
            py_tampered = _ordered_content_digest(pack_tampered['paths'], lambda rel: (pkg_root / rel).read_bytes())
            self.assertNotEqual(py_tampered, py_digest)
            self.assertEqual(py_tampered, pack_tampered['digest'])

            with self.assertRaises(ValueError):
                _ordered_content_digest(['a/b.txt', 'a/b.txt'], lambda _: b'x')
            with self.assertRaises(ValueError):
                _ordered_content_digest(['a/b.txt', './a/b.txt'], lambda _: b'x')

    def test_framework_release_paths_exclude_cross_repo_orchestration_and_dead_v1(self):
        self.assertFalse((ROOT / 'product-release.json').exists())
        config = json.loads((ROOT / '.opl-release.json').read_text())
        self.assertEqual(config['schema_version'], 'opl.release.v1')
        release_paths = config['delivery_paths']
        for disallowed in ('src', 'python', 'scripts', 'contracts'):
            self.assertNotIn(disallowed, release_paths)
        for retired in (
            '.github/workflows/daily-product-channel.yml',
            '.github/workflows/reusable-macos-sparkle-release.yml',
            'contracts/opl-framework/product-release-owners.json',
            'scripts/package-carrier-source-paths.mjs',
            'scripts/product-daily-release.py',
            'scripts/package_release/product_status.py',
            'scripts/package_release/daily_control.py',
        ):
            self.assertFalse((ROOT / retired).exists(), f'Retired cross-repo release file still present: {retired}')
        for rel in release_paths:
            self.assertTrue((ROOT / rel).exists(), f'Missing Framework release path: {rel}')
        package_files = json.loads((ROOT / 'package.json').read_text())['files']
        for entry in package_files:
            entry_root = entry.split('*')[0].rstrip('/')
            covered = any(
                entry_root == rel or entry_root.startswith(rel.rstrip('/') + '/')
                for rel in release_paths
            )
            self.assertTrue(covered, f'Shipped Framework file pattern not covered by delivery_paths: {entry}')

        with tempfile.TemporaryDirectory() as repo_tmp:
            repo = Path(repo_tmp)
            subprocess.run(['git', 'init', '--quiet'], cwd=repo, check=True)
            subprocess.run(['git', 'config', 'user.name', 'Test'], cwd=repo, check=True)
            subprocess.run(['git', 'config', 'user.email', 'test@example.invalid'], cwd=repo, check=True)
            for rel in ('scripts/package_release/owner.py', 'contracts/opl-framework/keys/private-package-signing.pub', 'extensions/foundry/mod.js', 'sdks/python-client/src/cli.py'):
                target = repo / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('v1\n')
            subprocess.run(['git', 'add', '--all'], cwd=repo, check=True)
            subprocess.run(['git', 'commit', '--quiet', '-m', 'base'], cwd=repo, check=True)
            base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()

            (repo / 'scripts/package_release/owner.py').write_text('v2\n')
            (repo / 'contracts/opl-framework/keys/private-package-signing.pub').write_text('k2\n')
            subprocess.run(['git', 'add', '--all'], cwd=repo, check=True)
            subprocess.run(['git', 'commit', '--quiet', '-m', 'orchestration only'], cwd=repo, check=True)
            self.assertEqual(
                subprocess.run(['git', 'diff', '--quiet', base, 'HEAD', '--', *release_paths], cwd=repo).returncode,
                0,
            )

            (repo / 'extensions/foundry/mod.js').write_text('v2\n')
            subprocess.run(['git', 'add', '--all'], cwd=repo, check=True)
            subprocess.run(['git', 'commit', '--quiet', '-m', 'runtime extension change'], cwd=repo, check=True)
            self.assertEqual(
                subprocess.run(['git', 'diff', '--quiet', base, 'HEAD', '--', *release_paths], cwd=repo).returncode,
                1,
            )


if __name__ == '__main__':
    unittest.main()
