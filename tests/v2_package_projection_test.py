from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from package_release.common import ReleaseError, read, write
from package_release.projection import PackageProjection
from package_release import v2_projection


class V2PackageProjectionTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.catalog = Path(temporary.name)
        self.paths = PackageProjection(ROOT, self.catalog)
        self.manifest_path = self.catalog / 'packages/agents/example.json'
        self.old_payload = self.catalog / 'packages/payloads/example-1.2.3.json'
        self.new_payload = self.catalog / 'packages/payloads/example-1.2.4.json'
        self.index = self.catalog / 'catalog-index.json'
        self.repo = 'https://github.com/example/example.git'
        self.source_commit = 'a' * 40
        self.fixture_manifest = {
            'package_id': 'example',
            'version': '1.2.3',
            'source_repo': self.repo,
            'presentation': {'icon_ref': 'assets/legacy.png'},
            'codex_surface': {'plugin_payload_manifest_url': 'payloads/example-1.2.3.json'},
        }
        write(self.manifest_path, self.fixture_manifest)
        write(self.old_payload, {'package_id': 'example', 'package_version': '1.2.3'})
        write(self.paths.allowlist('example'), {'package_id': 'example'})
        write(self.catalog / 'public-listings.json', {})
        write(self.index, {})
        self.candidate = {
            'package_format': 'v2',
            'package_id': 'example',
            'package_version': '1.2.4',
            'source_commit': self.source_commit,
            'archive_sha256': 'sha256:' + 'b' * 64,
            'content_digest': 'sha256:' + 'c' * 64,
            'file_count': 2,
            'manifest': {'identity': {'icon': 'assets/brand.png'}},
            'lock': {
                'package_id': 'example',
                'version': '1.2.4',
                'git_commit': self.source_commit,
                'digest': 'sha256:' + 'c' * 64,
                'file_count': 2,
                'algorithm': 'sha256',
                'canonicalization': 'ordered_path_length_file_length_bytes',
            },
        }

    def prepare(self):
        def build_index(arguments, **options):
            stage = Path(arguments[-1])
            manifest = read(stage / self.manifest_path.relative_to(self.catalog))
            self.assertEqual(options['cwd'], self.catalog)
            self.assertTrue((stage / self.old_payload.relative_to(self.catalog)).exists())
            return SimpleNamespace(stdout=json.dumps({'manifest': manifest}))

        with patch.object(v2_projection, 'run', side_effect=build_index):
            return v2_projection.prepare_v2_projection(
                ROOT, self.paths, self.catalog, 'example', '1.2.4', self.source_commit,
                candidate=self.candidate,
            )

    def test_v2_release_keeps_v1_pointer_and_binds_exact_payload_bytes(self):
        old_payload_bytes = self.old_payload.read_bytes()
        result = self.prepare()
        projected = read(self.manifest_path)
        release = projected.pop('v2_release')
        self.assertEqual(projected, self.fixture_manifest)
        self.assertEqual(self.old_payload.read_bytes(), old_payload_bytes)
        self.assertEqual(read(self.index)['manifest']['v2_release'], release)
        self.assertEqual(release['icon_ref'], 'assets/brand.png')
        self.assertEqual(release['payload_sha256'], result['payload_sha256'])
        self.assertEqual(result['payload_sha256'],
                         'sha256:' + hashlib.sha256(self.new_payload.read_bytes()).hexdigest())
        self.assertEqual(read(self.new_payload)['archive_sha256'], self.candidate['archive_sha256'])
        self.assertEqual(self.prepare(), result)
        self.candidate['archive_sha256'] = 'sha256:' + 'd' * 64
        with self.assertRaisesRegex(ReleaseError, 'immutable v2 Package'):
            self.prepare()
        self.assertEqual(read(self.index)['manifest']['v2_release'], release)

    def test_private_payload_keeps_catalog_admission(self):
        self.fixture_manifest['visibility'] = 'authorized_only'
        write(self.manifest_path, self.fixture_manifest)
        self.candidate['manifest']['distribution'] = {'visibility': 'public'}
        with self.assertRaisesRegex(ReleaseError, 'visibility'):
            self.prepare()
        self.assertFalse(self.new_payload.exists())
        self.candidate['manifest']['distribution'] = {'visibility': 'authorized_only'}
        self.prepare()
        self.assertNotIn('icon_ref', read(self.manifest_path)['v2_release'])

    def test_failed_index_write_restores_previous_selection(self):
        original_index = self.index.read_bytes()
        replace_file = v2_projection._replace_file

        def fail_index(path, data, **options):
            if path == self.index:
                raise OSError('index write failed')
            return replace_file(path, data, **options)

        with patch.object(v2_projection, '_replace_file', side_effect=fail_index):
            with self.assertRaisesRegex(OSError, 'index write failed'):
                self.prepare()
        self.assertEqual(self.index.read_bytes(), original_index)
        self.assertEqual(read(self.manifest_path), self.fixture_manifest)
        self.assertFalse(self.new_payload.exists())


if __name__ == '__main__':
    unittest.main()
