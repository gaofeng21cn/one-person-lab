import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('v2 import guard passes for packages/pack and compiled dist/index.js loads cleanly', async () => {
  const guardModule = (await import(
    pathToFileURL(path.join(repoRoot, 'scripts', 'check-v2-import-guard.mjs')).href
  )) as {
    runV2ImportGuard: (opts: { rootDir: string }) => {
      ok: boolean;
      packagesChecked: string[];
      dagEdges: string[];
      violations: unknown[];
    };
  };

  const report = guardModule.runV2ImportGuard({ rootDir: repoRoot });
  assert.equal(report.ok, true, `Expected 0 guard violations, got: ${JSON.stringify(report.violations)}`);
  assert.equal(report.packagesChecked.includes('pack'), true);
  assert.equal(report.dagEdges.includes('pack -> core'), true);
  assert.equal(report.dagEdges.includes('pack -> connect'), true);
  assert.equal(report.dagEdges.includes('pack -> ledger'), true);

  const distEntry = path.join(repoRoot, 'packages', 'pack', 'dist', 'index.js');
  const compiled = (await import(pathToFileURL(distEntry).href)) as Record<string, unknown>;
  assert.equal(typeof compiled.parsePackageManifestV2, 'function');
  assert.equal(typeof compiled.buildPackage, 'function');
  assert.equal(typeof compiled.createPackService, 'function');
  assert.equal(typeof compiled.migrateV1Package, 'function');
  assert.equal(typeof compiled.syncPackageToCodex, 'function');
});
