from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from package_release.owner import _ordered_content_digest, wait_for_checks
from package_release.common import ReleaseError
spec = importlib.util.spec_from_file_location('product_release', ROOT / 'scripts/product-daily-release.py')
product = importlib.util.module_from_spec(spec)
spec.loader.exec_module(product)


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
            runs[:] = [dict(latest, path='.github/workflows/daily-product-channel.yml')]
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

    def test_product_contract_validates_source_workflow_filenames(self):
        config = {**self.config, 'schema_version': 'opl.product-release.v1', 'strategy': 'daily_patch',
                  'trigger': 'tag', 'publisher_workflow': 'publish.yml', 'source_check_workflows': ['ci.yml', 'verify.yml']}
        path = self.root / 'product-release.json'
        path.write_text(json.dumps(config))
        self.assertEqual(product.settings(self.root)['source_check_workflows'], ['ci.yml', 'verify.yml'])
        for invalid in [[], 'ci.yml', ['ci.yml', 'ci.yml'], ['../ci.yml'], [1]]:
            path.write_text(json.dumps({**config, 'source_check_workflows': invalid}))
            with self.assertRaisesRegex(ReleaseError, 'Source check workflows'):
                product.settings(self.root)

    def test_docs_only_main_does_not_allocate_a_version(self):
        (self.root / 'README.md').write_text('documentation change')
        self.commit()
        self.assertEqual(product.plan(self.root, self.config, self.channel)['status'], 'unchanged')

    def test_native_change_bumps_one_product_version(self):
        (self.root / 'app/main').write_text('new shipped bytes')
        self.commit()
        plan = product.plan(self.root, self.config, self.channel)
        self.assertEqual((plan['version'], plan['tag'], plan['status']), ('1.2.4', 'v1.2.4', 'needs_release'))

    def test_interrupted_release_resumes_frozen_source_despite_later_docs(self):
        (self.root / 'app/main').write_text('new shipped bytes')
        (self.root / 'product-version.json').write_text('{"version":"1.2.4"}')
        self.commit()
        frozen = self.git('rev-parse', 'HEAD')
        self.git('tag', '-a', 'v1.2.4', '-m', 'fixture')
        (self.root / 'README.md').write_text('later documentation')
        self.commit()
        plan = product.plan(self.root, self.config, self.channel)
        self.assertEqual((plan['status'], plan['source_commit']), ('resume', frozen))
        (self.root / 'app/main').write_text('different new product bytes')
        self.commit()
        self.assertEqual(product.plan(self.root, self.config, self.channel)['tag'], 'v1.2.5')
        self.assertEqual(self.git('rev-parse', 'v1.2.4^{commit}'), frozen)

    def test_deleted_delivery_file_is_a_change(self):
        (self.root / 'app/main').unlink()
        self.git('add', '-A')
        self.git('commit', '-m', 'delete shipped file')
        self.assertEqual(product.plan(self.root, self.config, self.channel)['version'], '1.2.4')

    def test_divergent_published_source_is_refused(self):
        with self.assertRaises(ReleaseError):
            product.plan(self.root, self.config, {**self.channel, 'source_commit': '1' * 40})

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


if __name__ == '__main__':
    unittest.main()
