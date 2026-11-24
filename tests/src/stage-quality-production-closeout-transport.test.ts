import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MockActivityEnvironment } from '@temporalio/testing';

import {
  deriveNormalizedStageQualityCloseout,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-derivation.ts';
import {
  normalizeTypedStageCloseoutPacket,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-normalization.ts';
import {
  inspectStageAttempt,
  listStageAttemptCloseouts,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { openQueueDb } from '../../src/adapters/execution/family-runtime-store.ts';
import {
  compactCloseoutPacketForTemporalResult,
} from '../../src/adapters/execution/family-runtime-temporal-activity-result-compaction.ts';
import {
  domainHandlerDispatchActivity,
} from '../../src/adapters/execution/family-runtime-temporal-activity-runtime.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
} from '../../src/adapters/execution/family-runtime-temporal.ts';
import {
  createPersistedTemporalStageAttemptInput,
} from './family-runtime-temporal-provider-cases/persisted-attempt.ts';

const findings = [
  {
    finding_id: 'F1',
    severity: 'critical',
    required: true,
    evidence_refs: ['evidence:F1'],
    repair_expectation: 'Repair F1.',
  },
  ...['F2', 'F3', 'F4'].map((findingId) => ({
    finding_id: findingId,
    severity: 'minor',
    required: false,
    evidence_refs: [`evidence:${findingId}`],
    repair_expectation: `Observe ${findingId}.`,
  })),
];

function repairEntry(findingId: string) {
  return {
    finding_id: findingId,
    repair_status: 'repaired',
    changed_artifact_refs: [`artifact:${findingId}`],
    repair_evidence_refs: [`repair-evidence:${findingId}`],
    note: `original-${findingId}`,
  };
}

test('real compaction, dispatch receipt and terminal sync preserve canonical original and derived closeouts', async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl54-production-closeout-transport-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  t.after(() => {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });

  const seed = createPersistedTemporalStageAttemptInput({ fixtureId: 'closeout-transport-54' });
  const seededDb = openQueueDb();
  let attempt;
  try {
    seededDb.db.prepare(`
      UPDATE stage_attempts
      SET attempt_role = 'repairer', quality_round_index = 1,
        stage_run_id = 'sr-closeout-transport-54',
        quality_cycle_id = 'quality-cycle:closeout-transport-54',
        execution_session_ref = 'codex://threads/closeout-transport-54'
      WHERE stage_attempt_id = ?
    `).run(seed.stage_attempt_id);
    attempt = inspectStageAttempt(seededDb.db, seed.stage_attempt_id);
  } finally {
    seededDb.db.close();
  }
  const input = {
    ...buildTemporalStageAttemptWorkflowInput(attempt),
    stage_packet_ref: seed.stage_packet_ref,
    checkpoint_refs: seed.checkpoint_refs,
    codex_stage_runner: seed.codex_stage_runner,
  };
  const artifactRefs = ['artifact:deck-v2'];
  const artifactHashes = [`sha256:${'a'.repeat(64)}`];
  const original = normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id,
    closeout_refs: artifactRefs,
    closeout_ref_metadata: [{
      ref: artifactRefs[0],
      sha256: artifactHashes[0],
      size_bytes: 42,
      artifact_identity_receipt_ref: 'artifact-identity:deck-v2',
    }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'redcube',
    domain_ready_verdict: 'repair_completed',
    route_impact: {
      next_stage_may_start: false,
      stage_quality_cycle: {
        artifact_refs: artifactRefs,
        artifact_hashes: artifactHashes,
        findings,
        repair_map: findings.map((finding) => repairEntry(finding.finding_id)),
      },
    },
    user_stage_log: {
      surface_kind: 'domain_stage_log',
      semantic_status: 'repair_completed',
      stage_work_done: ['Original executor body must survive derived transport.'],
    },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  });
  const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt });
  assert.ok(normalized);
  const derived = normalized.derivedCloseout;

  const compacted = compactCloseoutPacketForTemporalResult(derived);
  assert.ok(compacted);
  const dispatchInput = { ...input, closeout_packet: compacted };
  const environment = new MockActivityEnvironment({
    activityType: 'domainHandlerDispatchActivity',
    activityId: 'closeout-transport-54',
    workflowExecution: { workflowId: input.workflow_id, runId: 'closeout-transport-54-run' },
  });
  const dispatch = await environment.run(
    domainHandlerDispatchActivity,
    dispatchInput,
  ) as Awaited<ReturnType<typeof domainHandlerDispatchActivity>>;
  const query = {
    surface_kind: 'temporal_stage_attempt_query',
    provider_kind: 'temporal',
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id,
    workflow_id: input.workflow_id,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    status: 'completed',
    scope_kind: input.scope_kind,
    execution_scope: input.execution_scope ?? null,
    closeout_refs: dispatch.closeout_refs,
    consumed_refs: dispatch.consumed_refs,
    consumed_memory_refs: dispatch.consumed_memory_refs,
    writeback_receipt_refs: dispatch.writeback_receipt_refs,
    rejected_writes: dispatch.rejected_writes,
    next_owner: dispatch.next_owner,
    route_impact: dispatch.route_impact,
    closeout_packet: dispatch,
    activity_events: [{
      activity_kind: 'codex_stage_activity',
      progress_summary: { execution_session_ref: 'codex://threads/closeout-transport-54' },
    }],
    completion_boundary: {
      provider_completion: 'completed',
      domain_ready_verdict: dispatch.domain_ready_verdict,
      provider_completion_is_domain_ready: false,
    },
  } as any;
  const observation = {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stage_attempt_id,
    workflow_id: input.workflow_id,
    workflow_status: 'COMPLETED',
    query,
  } as const;

  const db = openQueueDb();
  try {
    syncStageAttemptFromTemporalTerminalObservation(db.db, observation);
    const rows = listStageAttemptCloseouts(db.db, input.stage_attempt_id);
    assert.equal(rows.length, 2, 'the real production chain must persist parent and child');
    assert.equal(rows[0]?.closeout_id, normalized.originalCloseout.closeout_id);
    assert.equal(rows[1]?.closeout_id, derived.closeout_id);
    assert.deepEqual(rows[0]?.packet, normalized.originalCloseout);
    assert.deepEqual(rows[1]?.packet, derived);
    assert.deepEqual(
      (rows[0]?.packet.route_impact?.stage_quality_cycle as any).repair_map,
      findings.map((finding) => repairEntry(finding.finding_id)),
    );
    assert.deepEqual(
      (rows[1]?.packet.route_impact?.stage_quality_cycle as any).repair_map,
      [repairEntry('F1')],
    );
    assert.deepEqual(
      rows[1]?.packet.closeout_normalization?.original_closeout_packet,
      normalized.originalCloseout,
      'fresh re-review can read the complete original typed snapshot from durable lineage',
    );
    assert.equal(
      rows[1]?.packet.closeout_normalization?.derived_closeout_sha256,
      normalized.derivedCloseoutDigest,
    );
    const beforeRepeat = inspectStageAttempt(db.db, input.stage_attempt_id).route_impact;
    syncStageAttemptFromTemporalTerminalObservation(db.db, observation);
    assert.deepEqual(inspectStageAttempt(db.db, input.stage_attempt_id).route_impact, beforeRepeat);
    assert.equal(listStageAttemptCloseouts(db.db, input.stage_attempt_id).length, 2);
  } finally {
    db.db.close();
  }
});

async function runDerivedThroughRealChain(input: any, packet: any, executionSessionRef: string) {
  const compacted = compactCloseoutPacketForTemporalResult(packet);
  assert.ok(compacted);
  const environment = new MockActivityEnvironment({
    activityType: 'domainHandlerDispatchActivity',
    activityId: `closeout-transport-54-${input.stage_attempt_id}`,
    workflowExecution: { workflowId: input.workflow_id, runId: `closeout-transport-54-${input.stage_attempt_id}-run` },
  });
  const dispatch = await environment.run(
    domainHandlerDispatchActivity,
    { ...input, closeout_packet: compacted },
  ) as Awaited<ReturnType<typeof domainHandlerDispatchActivity>>;
  const query = {
    surface_kind: 'temporal_stage_attempt_query',
    provider_kind: 'temporal',
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id,
    workflow_id: input.workflow_id,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    status: 'completed',
    scope_kind: input.scope_kind,
    execution_scope: input.execution_scope ?? null,
    closeout_refs: dispatch.closeout_refs,
    consumed_refs: dispatch.consumed_refs,
    consumed_memory_refs: dispatch.consumed_memory_refs,
    writeback_receipt_refs: dispatch.writeback_receipt_refs,
    rejected_writes: dispatch.rejected_writes,
    next_owner: dispatch.next_owner,
    route_impact: dispatch.route_impact,
    closeout_packet: dispatch,
    activity_events: [{
      activity_kind: 'codex_stage_activity',
      progress_summary: { execution_session_ref: executionSessionRef },
    }],
    completion_boundary: {
      provider_completion: 'completed',
      domain_ready_verdict: dispatch.domain_ready_verdict,
      provider_completion_is_domain_ready: false,
    },
  } as any;
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stage_attempt_id,
    workflow_id: input.workflow_id,
    workflow_status: 'COMPLETED',
    query,
  } as const;
}

test('a second different derived child through the real transport is typed-rejected and cannot replace the first child', async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl54-second-derived-transport-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  t.after(() => {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });

  const seed = createPersistedTemporalStageAttemptInput({ fixtureId: 'closeout-transport-54-second' });
  const seededDb = openQueueDb();
  let attempt;
  try {
    seededDb.db.prepare(`
      UPDATE stage_attempts
      SET attempt_role = 'repairer', quality_round_index = 1,
        stage_run_id = 'sr-closeout-transport-54-second',
        quality_cycle_id = 'quality-cycle:closeout-transport-54-second',
        execution_session_ref = 'codex://threads/closeout-transport-54-second'
      WHERE stage_attempt_id = ?
    `).run(seed.stage_attempt_id);
    attempt = inspectStageAttempt(seededDb.db, seed.stage_attempt_id);
  } finally {
    seededDb.db.close();
  }
  const input = {
    ...buildTemporalStageAttemptWorkflowInput(attempt),
    stage_packet_ref: seed.stage_packet_ref,
    checkpoint_refs: seed.checkpoint_refs,
    codex_stage_runner: seed.codex_stage_runner,
  };
  const buildOriginal = (salt: string, artifactRef: string, receiptRef: string) => {
    const hash = `sha256:${(salt === 'first' ? 'a' : 'b').repeat(64)}`;
    return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id,
    closeout_refs: [artifactRef],
    closeout_ref_metadata: [{
      ref: artifactRef,
      sha256: hash,
      size_bytes: 42,
      artifact_identity_receipt_ref: receiptRef,
    }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'redcube',
    domain_ready_verdict: 'repair_completed',
    route_impact: {
      next_stage_may_start: false,
      stage_quality_cycle: {
        artifact_refs: [artifactRef],
        artifact_hashes: [hash],
        findings,
        repair_map: findings.map((finding) => ({
          ...repairEntry(finding.finding_id),
          changed_artifact_refs: [artifactRef],
          note: `${salt}-${finding.finding_id}`,
        })),
      },
    },
    user_stage_log: {
      surface_kind: 'domain_stage_log',
      semantic_status: 'repair_completed',
      stage_work_done: [`original-body:${salt}`],
    },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  });
  };

  const db = openQueueDb();
  try {
    const derived1 = deriveNormalizedStageQualityCloseout({
      closeoutPacket: buildOriginal('first', 'artifact:deck-v9', 'receipt:deck-v9'),
      attempt,
    })!.derivedCloseout;
    const observation1 = await runDerivedThroughRealChain(input, derived1, attempt.execution_session_ref!);
    syncStageAttemptFromTemporalTerminalObservation(db.db, observation1);
    assert.equal(listStageAttemptCloseouts(db.db, input.stage_attempt_id).length, 2);
    assert.equal(
      (inspectStageAttempt(db.db, input.stage_attempt_id).route_impact.stage_quality_cycle as any)
        .repair_map[0].note,
      'first-F1',
    );

    // A different canonical derived child for the same Attempt, arriving through
    // the real compaction -> dispatch receipt -> terminal sync chain, must be a
    // typed reject; the first child stays authoritative.
    const derived2 = deriveNormalizedStageQualityCloseout({
      closeoutPacket: buildOriginal('second', 'artifact:deck-v10', 'receipt:deck-v10'),
      attempt,
    })!.derivedCloseout;
    assert.notEqual(derived2.closeout_id, derived1.closeout_id);
    const observation2 = await runDerivedThroughRealChain(input, derived2, attempt.execution_session_ref!);
    let rejection: any = null;
    try {
      syncStageAttemptFromTemporalTerminalObservation(db.db, observation2);
    } catch (error) {
      rejection = error;
    }
    assert.equal(
      rejection?.details?.failure_code,
      'stage_closeout_normalization_canonical_child_exists',
      'the second derived child must fail closed with a typed rejection',
    );
    const rows = listStageAttemptCloseouts(db.db, input.stage_attempt_id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1]?.packet, derived1);
    const after = inspectStageAttempt(db.db, input.stage_attempt_id).route_impact.stage_quality_cycle as any;
    assert.equal(after.repair_map[0].note, 'first-F1');
    assert.deepEqual(after.artifact_refs, ['artifact:deck-v9']);
  } finally {
    db.db.close();
  }
});
