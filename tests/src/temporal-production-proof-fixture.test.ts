import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  temporalProductionProbeInput,
  temporalProductionTypedCloseoutPacket,
} from '../../src/modules/runway/family-runtime-temporal-provider-parts/production-proof.ts';

test('Temporal production proof uses a generic example-domain fixture', () => {
  const closeout = temporalProductionTypedCloseoutPacket();
  const input = temporalProductionProbeInput('test', closeout);
  const serialized = JSON.stringify(input);

  assert.equal(input.domain_id, 'example-domain');
  assert.equal(closeout.next_owner, 'example-domain');
  assert.deepEqual(closeout.consumed_memory_refs, ['memory:example-domain-production-residency']);
  assert.doesNotMatch(serialized, /medauto|publication/i);
});

test('Temporal production proof materializes its worker workspace before dispatch', (t) => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-production-proof-test-'));
  t.after(() => fs.rmSync(testRoot, { recursive: true, force: true }));
  const workspaceRoot = path.join(testRoot, 'missing-workspace');

  assert.equal(fs.existsSync(workspaceRoot), false);

  const input = temporalProductionProbeInput('workspace', null, { workspaceRoot });
  const artifactRoot = path.join(workspaceRoot, 'artifacts');

  assert.deepEqual(input.workspace_locator, {
    workspace_root: workspaceRoot,
    artifact_root: artifactRoot,
  });
  assert.equal(fs.statSync(workspaceRoot).isDirectory(), true);
  assert.equal(fs.statSync(artifactRoot).isDirectory(), true);
});
