import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

test('workspace package contracts are materialized from the Framework authoring source', () => {
  const materialize = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/materialize-package-contracts.mjs')],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(materialize.status, 0, materialize.stderr || materialize.stdout);

  const check = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/materialize-package-contracts.mjs'), '--check'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(check.status, 0, check.stderr || check.stdout);
  assert.match(check.stdout, /match Framework sources/);
});

test('workspace package prepack materializes contracts into a clean package boundary', () => {
  const packageContracts = {
    'cordis-abi': [
      'cordis-plugin-descriptor.schema.json',
      'cordis-composition-snapshot.schema.json',
    ],
    'package-host': [
      'package-host-context.schema.json',
      'package-host-integration.schema.json',
      'standard-agent-host-contract.json',
      'capability-package-host-contract.json',
      'workflow-profile-host-contract.json',
    ],
  } as const;

  for (const [packageName, contractFiles] of Object.entries(packageContracts)) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-${packageName}-pack-`));
    try {
      const packageRoot = path.join(tempRoot, 'packages', packageName);
      const contractRoot = path.join(tempRoot, 'contracts', 'opl-framework');
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.mkdirSync(contractRoot, { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
      fs.copyFileSync(
        path.join(repoRoot, 'packages', packageName, 'package.json'),
        path.join(packageRoot, 'package.json'),
      );
      fs.copyFileSync(
        path.join(repoRoot, 'scripts', 'materialize-package-contracts.mjs'),
        path.join(tempRoot, 'scripts', 'materialize-package-contracts.mjs'),
      );
      for (const contractFile of contractFiles) {
        fs.copyFileSync(
          path.join(repoRoot, 'contracts', 'opl-framework', contractFile),
          path.join(contractRoot, contractFile),
        );
      }

      const packed = spawnSync(process.env.npm_execpath ?? 'npm', ['pack', '--dry-run', '--json'], {
        cwd: packageRoot,
        encoding: 'utf8',
        env: { ...process.env, npm_config_ignore_scripts: '' },
      });
      assert.equal(packed.status, 0, packed.stderr || packed.stdout);
      type PackedPackage = { files: Array<{ path: string }> };
      const metadata = JSON.parse(packed.stdout) as PackedPackage[] | Record<string, PackedPackage>;
      // npm 12 keys pack results by package name; earlier versions return an array.
      const entry = Array.isArray(metadata) ? metadata[0] : metadata[`@one-person-lab/${packageName}`];
      const paths = new Set(entry?.files.map((file) => file.path) ?? []);
      for (const contractFile of contractFiles) {
        assert.equal(paths.has(`contracts/${contractFile}`), true, `${packageName} pack omitted contracts/${contractFile}`);
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});
