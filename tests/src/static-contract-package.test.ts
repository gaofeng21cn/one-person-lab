import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = path.join(repoRoot, 'packages', 'static-contracts');
const exportRefs = [
  'json-schema-registry',
  'reference-build-proof',
  'reference-design-pattern-packet',
  'standard-agent-action-stage-run',
  'standard-agent-pack-abi',
];

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout;
}

function dependencyNames(tree: Record<string, unknown>): string[] {
  const dependencies = tree.dependencies as Record<string, Record<string, unknown>> | undefined;
  return dependencies
    ? Object.entries(dependencies).flatMap(([name, dependency]) => [name, ...dependencyNames(dependency)])
    : [];
}

test('static contract package installs without Temporal or E2B and exposes all OMA imports', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-static-contract-package-'));
  const consumerDir = path.join(tempDir, 'consumer');
  fs.mkdirSync(consumerDir);
  try {
    const rootManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(rootManifest.bin.opl, './bin/opl');
    assert.ok(Object.keys(rootManifest.dependencies).some((name) => name.startsWith('@temporalio/')));
    assert.equal(rootManifest.optionalDependencies.e2b, '^2.31.0');

    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.dependencies), ['ajv']);
    assert.equal(manifest.bin, undefined);
    assert.deepEqual(Object.keys(manifest.exports).sort(), exportRefs.map((ref) => `./${ref}`).sort());

    const packOutput = JSON.parse(run(
      'npm',
      ['pack', packageRoot, '--json', '--pack-destination', tempDir],
      repoRoot,
    ));
    const tarball = path.join(tempDir, packOutput[0].filename);
    assert.equal(fs.existsSync(tarball), true);
    assert.equal(
      packOutput[0].files.some((file: { path: string }) => /temporal|e2b|bin\/opl/i.test(file.path)),
      false,
    );

    fs.writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({
      name: 'opl-static-contract-package-consumer',
      private: true,
      type: 'module',
    }));
    run('npm', ['install', '--ignore-scripts', '--package-lock=false', tarball], consumerDir);

    const dependencyTree = JSON.parse(run('npm', ['ls', '--all', '--json'], consumerDir));
    const installedDependencies = dependencyNames(dependencyTree);
    assert.ok(installedDependencies.includes('opl-framework-static-contracts'));
    assert.equal(installedDependencies.some((name) => name.startsWith('@temporalio/') || name === 'e2b'), false);

    const importScript = `
      const modules = await Promise.all(${JSON.stringify(exportRefs)}.map(
        (ref) => import('opl-framework-static-contracts/' + ref),
      ));
      const referenceDesign = modules[2];
      if (referenceDesign.referenceDesignPatternPacketSchemaEntry().schemaId !== 'opl.reference_design_pattern_packet.v1') {
        process.exit(1);
      }
    `;
    run(process.execPath, ['--input-type=module', '--eval', importScript], consumerDir);
  } finally {
    fs.rmSync(path.join(packageRoot, 'build'), { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
