import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../scripts/compile-opl-flow-capability-projections.mjs', import.meta.url));

test('Full builder compiles a Flow-selected tool and locks its exact source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-flow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contracts = path.join(root, 'contracts');
  fs.mkdirSync(contracts);
  const policy = {
    schema: 'opl_flow_workflow_policy.v4', package: { id: 'opl-flow', version: '1.0.0' },
    requires: [{ kind: 'cli', id: 'example', online_install_default: true, offline_bundle: 'full' }],
    experience_baseline: [], compatible_optional: [], capability_bundles: [],
  };
  const policyFile = path.join(contracts, 'workflow-policy.json');
  fs.writeFileSync(policyFile, JSON.stringify(policy));
  fs.writeFileSync(path.join(contracts, 'workflow-policy.schema.json'), JSON.stringify({
    type: 'object', additionalProperties: false, required: Object.keys(policy),
    properties: Object.fromEntries(Object.keys(policy).map(key => [key, {}])),
  }));
  const resolutionsFile = path.join(root, 'sources.json');
  const lockFile = path.join(root, 'lock.json');
  const source = { capability_ref: 'cli:example', source_ref: 'example@1', source_sha256: 'a'.repeat(64), version: '1' };
  const run = () => spawnSync(process.execPath, [cli, '--flow-root', root, '--resolutions', resolutionsFile,
    '--build-lock-output', lockFile, '--json'], { encoding: 'utf8' });
  fs.writeFileSync(resolutionsFile, JSON.stringify([source]));
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const { strategy, build_lock } = JSON.parse(result.stdout);
  assert.deepEqual(build_lock, JSON.parse(fs.readFileSync(lockFile, 'utf8')));
  assert.deepEqual(build_lock.items.map(item => item.capability_ref), ['cli:example']);
  assert.equal(build_lock.flow_package.strategy_digest, strategy.strategy_digest);
  assert.equal(build_lock.items[0].source_sha256, source.source_sha256);
  fs.writeFileSync(resolutionsFile, '[]');
  assert.match(run().stderr, /Missing exact source resolution/);
  fs.writeFileSync(policyFile, JSON.stringify({ ...policy, unknown: true }));
  assert.match(run().stderr, /Invalid Flow workflow policy/);
});
