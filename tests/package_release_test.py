from __future__ import annotations
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
import urllib.error
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from package_release.common import ReleaseError, read, write
from package_release.owner import content_changed, update_versions, prepare_owner
from package_release.channels import public_channel

spec = importlib.util.spec_from_file_location('dispatcher', ROOT / 'scripts/package-publication-dispatch.py')
dispatcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dispatcher)
spec = importlib.util.spec_from_file_location('detection', ROOT / 'scripts/package-channel-detection.py')
detection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(detection)

class PackageReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.projection = {'package_id': 'fixture', 'surface_kind': 'opl_capability_package_manifest.v2',
                           'publication_source': {'owner_package_manifest_ref': 'opl-package.json'}}
        self.allowlist = {'source_root': '.', 'plugin_id': 'fixture', 'paths': ['photo.png']}
        write(self.root / 'opl-package.json', {'package_id': 'fixture', 'version': '1.2.3', 'content_lock': {'paths': ['photo.png']}})
        write(self.root / '.codex-plugin/plugin.json', {'name': 'fixture', 'version': '1.2.3'})
        write(self.root / 'plugin.json', {'name': 'fixture', 'version': '1.2.3'})
        (self.root / 'photo.png').write_bytes(bytes([0, 255, 129, 3]))
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Synthetic Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('add', '.')
        self.git('commit', '-m', 'fixture')
        self.base = self.git('rev-parse', 'HEAD')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True, stderr=subprocess.DEVNULL).strip()

    def test_binary_payload_changes_and_unshipped_ci_changes(self):
        self.assertFalse(content_changed(self.root, self.base, self.projection, self.allowlist))
        (self.root / 'ci.yml').write_text('synthetic CI change')
        self.assertFalse(content_changed(self.root, self.base, self.projection, self.allowlist))
        (self.root / 'photo.png').write_bytes(bytes([255, 0, 5]))
        self.assertTrue(content_changed(self.root, self.base, self.projection, self.allowlist))

    def test_explicit_version_adapters_preserve_unrelated_versions(self):
        write(self.root / 'package.json', {'name': 'fixture', 'version': '1.2.3', 'dependencies': {'unrelated': '9.8.7'}})
        write(self.root / 'package-lock.json', {'version': '1.2.3', 'packages': {'': {'version': '1.2.3'}, 'dependency': {'version': '9.8.7'}}})
        (self.root / 'pyproject.toml').write_text('[project]\nname = "fixture"\nversion = "1.2.3"\n\n[other]\nversion = "9.8.7"\n')
        (self.root / 'uv.lock').write_text('version = 1\n\n[[package]]\nname = "fixture"\nversion = "1.2.3"\nsource = { editable = "." }\n\n[[package]]\nname = "unrelated"\nversion = "9.8.7"\nsource = { registry = "https://example.invalid" }\n')
        settings = {'version_files': [{'path': p, 'kind': 'json'} for p in ['package.json', 'package-lock.json']] +
                    [{'path': 'pyproject.toml', 'kind': 'toml_project'}]}
        update_versions(self.root, self.projection, self.allowlist, settings, '1.2.4')
        self.assertEqual(read(self.root / 'opl-package.json')['version'], '1.2.4')
        self.assertEqual(read(self.root / 'package-lock.json')['packages']['']['version'], '1.2.4')
        self.assertEqual(read(self.root / 'package-lock.json')['packages']['dependency']['version'], '9.8.7')
        self.assertIn('[other]\nversion = "9.8.7"', (self.root / 'pyproject.toml').read_text())
        self.assertIn('name = "fixture"\nversion = "1.2.4"', (self.root / 'uv.lock').read_text())
        self.assertIn('name = "unrelated"\nversion = "9.8.7"', (self.root / 'uv.lock').read_text())
        settings['version_files'] = [{'path': '../outside.json', 'kind': 'json'}]
        with self.assertRaises(ReleaseError):
            update_versions(self.root, self.projection, self.allowlist, settings, '1.2.4')

    def test_registry_denial_stays_unknown(self):
        denial = urllib.error.HTTPError('https://ghcr.io/token', 403, 'Forbidden', {}, io.BytesIO(b'{"errors":[{"code":"DENIED"}]}'))
        with patch('urllib.request.urlopen', side_effect=denial):
            with self.assertRaisesRegex(ReleaseError, 'absence is unverified'):
                public_channel('fixture', 'example')

    def test_existing_clean_version_can_create_an_annotated_tag_without_prior_git_identity(self):
        write(self.root / 'release-automation.json', {'strategy': 'daily_patch'})
        self.git('add', '.')
        self.git('commit', '-m', 'declare release settings')
        base = self.git('rev-parse', 'HEAD')
        self.git('config', '--unset', 'user.name')
        self.git('config', '--unset', 'user.email')
        with tempfile.TemporaryDirectory() as temporary:
            framework = Path(temporary)
            write(framework / 'contracts/opl-framework/packages/fixture.json', {'source_commit': self.base})
            projection = {**self.projection, 'version': '1.2.2',
                          'codex_surface': {'plugin_payload_manifest_url': 'fixture.json'}}
            from package_release.common import git as actual_git
            def local_git(root, *args):
                return '' if args[0] == 'push' else actual_git(root, *args)
            with patch.dict(os.environ, {'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}), \
                 patch('package_release.owner.git', side_effect=local_git), \
                 patch('package_release.owner.wait_for_checks'), \
                 patch('package_release.owner.content_changed', return_value=True):
                result = prepare_owner(self.root, projection, self.allowlist, framework, 'example/fixture', apply=True)
            self.assertEqual(result['owner_source_commit'], base)
            self.assertEqual(self.git('cat-file', '-t', 'v1.2.3'), 'tag')
            self.assertEqual(self.git('rev-parse', 'v1.2.3^{}'), base)

    def test_cross_day_dispatch_reconciles_the_same_publication_identity(self):
        entry = {'package_id': 'fixture', 'expected_package_version': '1.2.3', 'publication_request_id': 'daily-new-stable-id'}
        previous = {'display_title': 'Package fixture 1.2.3 / daily-old-run-id', 'status': 'waiting'}
        self.assertEqual(dispatcher.matching_publications([previous], entry), [previous])
        previous.update(status='completed', conclusion='success')
        self.assertEqual(len(dispatcher.matching_publications([previous], entry)), 1)
        previous['conclusion'] = 'failure'
        self.assertEqual(dispatcher.matching_publications([previous], entry), [])

    def test_failed_preparation_is_excluded_from_publication(self):
        preparation = self.root / 'preparation.json'
        write(preparation, {'packages': [{'package_id': 'fixture', 'status': 'blocked', 'reason': 'Owner checks failed'}]})
        summary = {'candidate_fingerprint': {'fixture': {}}, 'owner_managed_packages': {}}
        def command(argv, **kwargs):
            if '--output' in argv:
                write(argv[argv.index('--output') + 1], {'changed_packages': [], 'violations': []})
            return SimpleNamespace(stdout=json.dumps(summary), returncode=0)
        args = SimpleNamespace(framework_root=self.root, output_root=self.root / 'output',
                               package_id=None, preparation=preparation, repository='example/framework')
        with patch.object(detection, 'run', side_effect=command), patch.object(detection, 'git', return_value='a' * 40):
            report = detection.detect(args)
        self.assertEqual(report['packages'], [])
        self.assertEqual(report['blocked_packages'][0]['reason'], 'Owner checks failed')
        args.package_id = ['unknown']
        with patch.object(detection, 'run', side_effect=command), patch.object(detection, 'git', return_value='a' * 40):
            with self.assertRaisesRegex(RuntimeError, 'Unregistered Package'):
                detection.detect(args)

if __name__ == '__main__':
    unittest.main()
