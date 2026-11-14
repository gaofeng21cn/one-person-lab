from __future__ import annotations
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
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


if __name__ == '__main__':
    unittest.main()
