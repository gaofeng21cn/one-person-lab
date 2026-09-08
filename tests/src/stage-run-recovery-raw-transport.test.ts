import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { findStageRunLaunch } from '../../src/adapters/execution/family-runtime-stage-run-launch-registry.ts';
import { parseRawOutputForCloseoutRecovery, recoverStageRunCloseoutProjection } from '../../src/adapters/execution/family-runtime-stage-run-closeout-recovery.ts';
import { createStageAttempt, ingestStageAttemptCloseout, inspectStageAttempt } from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { createStageQualityCycle } from '../../src/adapters/execution/family-runtime-stage-quality-cycle.ts';
import { persistRawStageOutput } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';
import { createFamilyRuntimeQueueTables, registerStageRunLaunch, recordStageRunTemporalStart, recordStageRunClosed, scopedStageRunInput, temporalStartReceipt } from './family-runtime-stage-run-launch-cases/shared.ts';

for (const missingTerminalProjection of [false, true]) {
test(`accepted protocol closeout supersedes stale raw (missing terminal projection: ${missingTerminalProjection})`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-accepted-closeout-recovery-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const { input } = scopedStageRunInput('sri_accepted_protocol_closeout');
    registerStageRunLaunch(db, input);
    const qualityCycleId = 'sqc_accepted_protocol_closeout';
    createStageQualityCycle(db, {
      qualityCycleId, stageRunId: input.stage_run_id, domainId: input.domain_id,
      stageId: input.stage_id, policy: input.quality_policy!,
    });
    const created = createStageAttempt(db, {
      domainId: input.domain_id, stageId: input.stage_id, providerKind: 'temporal',
      workspaceLocator: input.workspace_locator, sourceFingerprint: 'accepted-protocol-fixture',
      stageRunId: input.stage_run_id, scopeKind: input.scope_kind, executionScope: input.execution_scope,
    }).attempt;
    db.prepare("UPDATE stage_attempts SET attempt_role = 'producer', quality_cycle_id = ?, quality_round_index = 0 WHERE stage_attempt_id = ?")
      .run(qualityCycleId, created.stage_attempt_id);
    const attempt = inspectStageAttempt(db, created.stage_attempt_id);
    const raw = persistRawStageOutput({
      attempt,
      content: JSON.stringify({ closeout_packet_sha256: 'a'.repeat(64) }),
    })!;
    const originalBytes = fs.readFileSync(new URL(raw.output_ref));
    const packet = {
      surface_kind: 'stage_attempt_closeout_packet', closeout_id: 'closeout:accepted-protocol',
      stage_attempt_id: attempt.stage_attempt_id, stage_run_id: input.stage_run_id,
      scope_digest: input.execution_scope!.scope_digest,
      closeout_refs: input.artifact_refs,
      closeout_ref_metadata: [], consumed_refs: [], consumed_memory_refs: [],
      writeback_receipt_refs: [], rejected_writes: [], next_owner: null, domain_ready_verdict: null,
      route_impact: { stage_quality_cycle: { artifact_refs: [], artifact_hashes: [] } },
      authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' },
    };
    ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet });
    recordStageRunTemporalStart(db, { stageRunId: input.stage_run_id, temporalStartReceipt: temporalStartReceipt(input, 'COMPLETED') });
    if (!missingTerminalProjection) {
      recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'completed_with_quality_debt' });
    }
    const accepted = inspectStageAttempt(db, attempt.stage_attempt_id);
    assert.equal(accepted.status, 'completed');
    assert.equal(accepted.closeout_receipt_status, 'accepted_typed_closeout');
    await assert.rejects(() => recoverStageRunCloseoutProjection(db, {
      stageRunId: input.stage_run_id, stageAttemptId: attempt.stage_attempt_id,
    }, { startWorkflow: async () => assert.fail('missing artifact identity must not launch'),
      describeWorkflow: async () => ({ ...temporalStartReceipt(input, 'COMPLETED'), workflow_found: true }),
    }), (error: any) => {
      assert.equal(error.details.failure_code, 'stage_quality_attempt_without_consumable_artifact');
      return true;
    });
    if (missingTerminalProjection) {
      const launch = findStageRunLaunch(db, input.stage_run_id)!;
      assert.equal(launch.launch_status, 'closed');
      assert.equal(launch.terminal_status, 'completed');
    }
    assert.deepEqual(fs.readFileSync(new URL(raw.output_ref)), originalBytes);
  } finally {
    db.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

}

test('recovery does not promote persisted raw transport into domain evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-raw-recovery-'));
  try {
    const rawPath = path.join(root, 'raw-executor-output.txt');
    const rawRef = pathToFileURL(rawPath).href;
    fs.writeFileSync(rawPath, 'Package repair progress only.');
    const packet = {
      surface_kind: 'stage_attempt_closeout_packet',
      stage_attempt_id: 'sat_raw_repairer',
      closeout_refs: [rawRef],
      closeout_ref_metadata: [{ ref: rawRef, ref_kind: 'raw_executor_output', sha256: '1'.repeat(64) }],
      authority_boundary: { opl: 'temporal_closeout_transport_projection_only', domain: 'truth_quality_artifact_gate_owner' },
    };
    const input = {
      attempt: { stage_attempt_id: 'sat_raw_repairer', domain_id: 'example', execution_scope: { workspace_root: root } },
      latestCloseoutPacket: packet,
    };
    for (const raw of ['Package repair progress only.', JSON.stringify(packet)]) {
      fs.writeFileSync(rawPath, raw);
      assert.throws(() => parseRawOutputForCloseoutRecovery(rawRef, input), (error: any) => {
        assert.equal(error.details.failure_code, 'stage_run_recovery_domain_closeout_required');
        assert.equal(error.details.next_owner, 'example');
        assert.equal(error.details.raw_artifact_is_domain_evidence, false);
        return true;
      });
    }
    const domainPacket = { ...packet, closeout_refs: ['artifact:domain-result'], closeout_ref_metadata: [] };
    fs.writeFileSync(rawPath, JSON.stringify(domainPacket));
    assert.deepEqual(parseRawOutputForCloseoutRecovery(rawRef, input).closeout_refs, ['artifact:domain-result']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
