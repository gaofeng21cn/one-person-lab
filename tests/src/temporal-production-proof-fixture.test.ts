import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import temporalProto from '@temporalio/proto';

import { readTemporalStableCohort } from '../../src/modules/connect/temporal-stable-cohort.ts';
import { buildTemporalStageAttemptReplayGateForTest } from '../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  temporalProductionProbeInput,
  temporalProductionTypedCloseoutPacket,
} from '../../src/modules/runway/family-runtime-temporal-provider-parts/production-proof.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function readHistory(fixturePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, fixturePath), 'utf8')) as {
    events?: Array<Record<string, any>>;
  };
}

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

test('current workflow bundle replays every immutable stable-cohort history fixture', async () => {
  const cohort = readTemporalStableCohort();
  for (const [index, fixture] of cohort.replay.fixtures.entries()) {
    const history = readHistory(fixture.path);
    const workflowId = `stable-cohort-replay-${index}`;
    const replayHistory = fixture.path.includes('quality-resume')
      ? temporalProto.temporal.api.history.v1.History.fromObject(history)
      : history;
    const gate = await buildTemporalStageAttemptReplayGateForTest(replayHistory, workflowId);
    assert.equal(gate.replay_status, 'passed', fixture.path);
    assert.equal(gate.workflow_id, workflowId, fixture.path);
    assert.ok(gate.worker_options.workflowBundle && 'codePath' in gate.worker_options.workflowBundle);
  }
});

test('history replay fails closed when a recorded workflow type is not exported by the current bundle', async () => {
  const fixture = readTemporalStableCohort().replay.fixtures[0];
  const history = readHistory(fixture.path);
  const started = history.events?.find((event) => event.workflowExecutionStartedEventAttributes)
    ?.workflowExecutionStartedEventAttributes;
  assert.ok(started?.workflowType);
  started.workflowType.name = 'RemovedStableCohortWorkflow';

  await assert.rejects(
    buildTemporalStageAttemptReplayGateForTest(history, 'stable-cohort-corrupt-workflow-type'),
  );
});
