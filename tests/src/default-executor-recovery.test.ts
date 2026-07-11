import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { recoverDefaultExecutorDomainReceiptCloseout } from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/default-executor-recovery.ts';

function writeRecoveryFixture(options: { domainId?: string; stageOwner?: string }) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-default-executor-recovery-'));
  const dispatchDir = path.join(
    workspaceRoot,
    'studies/example/artifacts/supervision/consumer/default_executor_dispatches',
  );
  const executionDir = path.join(
    workspaceRoot,
    'studies/example/artifacts/supervision/consumer/default_executor_execution',
  );
  const stagePacketRef = 'studies/example/artifacts/supervision/consumer/default_executor_dispatches/current.json';
  fs.mkdirSync(dispatchDir, { recursive: true });
  fs.mkdirSync(executionDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, stagePacketRef), `${JSON.stringify({
    study_id: 'example',
    action_type: 'advance',
    action_fingerprint: 'sha256:example',
    ...(options.stageOwner ? { owner: options.stageOwner } : {}),
  })}\n`);
  fs.writeFileSync(path.join(executionDir, 'latest.json'), `${JSON.stringify({
    executions: [{
      study_id: 'example',
      action_type: 'advance',
      action_fingerprint: 'sha256:example',
      execution_status: 'completed',
      execution_id: 'execution-example',
      source_refs: ['source:example'],
    }],
  })}\n`);
  return {
    workspaceRoot,
    stagePacketRef,
    attempt: {
      stage_attempt_id: 'sat-example',
      ...(options.domainId ? { domain_id: options.domainId } : {}),
    },
  };
}

test('default executor recovery derives the owner from the standard agent registry', () => {
  const fixture = writeRecoveryFixture({ domainId: 'medautogrant' });
  try {
    const recovered = recoverDefaultExecutorDomainReceiptCloseout(fixture);
    assert.equal(recovered.status, 'closeout_found');
    assert.equal(recovered.closeoutPacket?.next_owner, 'med-autogrant');
  } finally {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('default executor recovery normalizes an explicit stage-pack owner', () => {
  const fixture = writeRecoveryFixture({ stageOwner: 'redcube' });
  try {
    const recovered = recoverDefaultExecutorDomainReceiptCloseout(fixture);
    assert.equal(recovered.status, 'closeout_found');
    assert.equal(recovered.closeoutPacket?.next_owner, 'redcube-ai');
  } finally {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('default executor recovery fails closed when no owner can be resolved', () => {
  const fixture = writeRecoveryFixture({});
  try {
    const recovered = recoverDefaultExecutorDomainReceiptCloseout(fixture);
    assert.equal(recovered.status, 'owner_unresolved');
    assert.equal(recovered.closeoutPacket, null);
  } finally {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  }
});
