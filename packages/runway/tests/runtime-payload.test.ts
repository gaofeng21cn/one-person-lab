import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPackageSourceArchive } from '@opl/pack';
import { stageCodexPayload } from '../src/executors/codex/runtime-payload.ts';

test('Full Codex staging verifies frozen bytes and refuses an archive for another platform', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-seed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const version = '1.2.3';
  const platform = `${process.platform}-${process.arch}`;
  const seedDir = path.join(root, 'runtime-payloads', 'codex-cli', version);
  const packageDir = path.join(root, 'input', 'package');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.mkdirSync(packageDir, { recursive: true });
  const archives: Record<string, {path: string; sha256: string; size_bytes: number}> = {};
  for (const [kind, manifest] of Object.entries({
    package: { name: '@openai/codex', version, optionalDependencies: { [`@openai/codex-${platform}`]: `npm:@openai/codex@${version}-${platform}` } },
    platform: { name: '@openai/codex', version: `${version}-other-architecture` },
  })) {
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
    const archivePath = path.join(seedDir, `${kind}.tgz`);
    const digest = createPackageSourceArchive(path.dirname(packageDir), archivePath, ['package']);
    archives[kind] = { path: `runtime-payloads/codex-cli/${version}/${kind}.tgz`, sha256: digest.slice('sha256:'.length), size_bytes: fs.statSync(archivePath).size };
  }
  const outputManifest = path.join(root, 'manifest', 'full-package-manifest.json');
  const saveManifest = () => fs.writeFileSync(outputManifest, JSON.stringify({
    codex_offline_seed: { schema: 'opl_full_codex_offline_seed.v1', installation_owner: 'one-person-lab', version, archives },
  }));
  fs.mkdirSync(path.dirname(outputManifest));
  saveManifest();
  const stage = () => stageCodexPayload(fs.mkdtempSync(path.join(root, 'stage-')), { OPL_FULL_RUNTIME_HOME: root });
  await assert.rejects(stage(), /platform Package identity/);
  archives.platform.sha256 = '0'.repeat(64);
  saveManifest();
  await assert.rejects(stage(), /does not match the frozen manifest/);
});
