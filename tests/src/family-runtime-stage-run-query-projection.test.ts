import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { projectRecoveredStageRunQuery } from '../../src/adapters/execution/family-runtime-stage-run-query-projection.ts';

const workflowId = 'wf-recovered-stage-run';
const stageRunId = 'sr-recovered-stage-run';
const qualityCycleId = 'quality-cycle:sr-recovered-stage-run';
const artifactRef = 'file:///tmp/recovered-artifact.json';
const artifactHash = `sha256:${'a'.repeat(64)}`;
const receiptRef = 'file:///tmp/recovered-artifact.identity.json';

function withDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE stage_run_launches (
      stage_run_id TEXT PRIMARY KEY,
      stage_run_invocation_id TEXT NOT NULL,
      stage_run_spec_sha256 TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL UNIQUE,
      stage_run_input_json TEXT NOT NULL,
      launch_status TEXT NOT NULL,
      terminal_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE stage_quality_cycles (
      quality_cycle_id TEXT PRIMARY KEY,
      stage_run_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      state_json TEXT NOT NULL,
      current_attempt_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE stage_attempts (
      stage_attempt_id TEXT PRIMARY KEY,
      stage_run_id TEXT,
      quality_cycle_id TEXT,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_role TEXT,
      status TEXT NOT NULL,
      route_impact_json TEXT NOT NULL
    );
  `);
  try {
    fn(db);
  } finally {
    db.close();
  }
}

function seedRecoveredProjection(db: DatabaseSync, options: {
  stateOverride?: Record<string, unknown>;
  producerIdentity?: Record<string, unknown>;
} = {}) {
  db.prepare(`
    INSERT INTO stage_run_launches (
      stage_run_id, stage_run_invocation_id, stage_run_spec_sha256,
      domain_id, stage_id, workflow_id, stage_run_input_json,
      launch_status, terminal_status, created_at, updated_at
    ) VALUES (?, 'invocation:recovered', ?, 'medautoscience', 'direction', ?, '{}',
      'closed', 'blocked', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
  `).run(stageRunId, 'b'.repeat(64), workflowId);
  const producer = {
    stage_attempt_id: 'sat-recovered-producer',
    attempt_role: 'producer',
    status: 'completed',
    artifact_refs: [artifactRef],
    artifact_hashes: [artifactHash],
    artifact_identity_receipt_refs: [receiptRef],
  };
  const state = {
    status: 'awaiting_review',
    current_role: 'reviewer',
    selected_artifact_refs: [artifactRef],
    controller_readback: {
      workflow_id: workflowId,
      artifact_hashes: [artifactHash],
      artifact_identity_receipt_refs: [receiptRef],
      attempts: [producer],
    },
    ...options.stateOverride,
  };
  db.prepare(`
    INSERT INTO stage_quality_cycles (
      quality_cycle_id, stage_run_id, domain_id, stage_id,
      policy_json, state_json, current_attempt_ref, created_at, updated_at
    ) VALUES (?, ?, 'medautoscience', 'direction', '{}', ?, NULL,
      '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:01.000Z')
  `).run(qualityCycleId, stageRunId, JSON.stringify(state));
  const producerIdentity = options.producerIdentity ?? {
    artifact_refs: [artifactRef],
    artifact_hashes: [artifactHash.slice('sha256:'.length)],
    artifact_identity_receipt_refs: [receiptRef],
  };
  db.prepare(`
    INSERT INTO stage_attempts (
      stage_attempt_id, stage_run_id, quality_cycle_id, domain_id, stage_id,
      attempt_role, status, route_impact_json
    ) VALUES ('sat-recovered-producer', ?, ?, 'medautoscience', 'direction',
      'producer', 'completed', ?)
  `).run(stageRunId, qualityCycleId, JSON.stringify({ stage_quality_cycle: producerIdentity }));
}

function providerBlockedState() {
  return {
    surface_kind: 'temporal_stage_run_query',
    workflow_id: workflowId,
    stage_run_id: stageRunId,
    status: 'blocked',
    current_role: null,
    blocked_reason: 'stage_quality_attempt_without_consumable_artifact',
    hard_stop_class: 'zero_consumable_artifact',
    artifact_refs: [],
    artifact_hashes: [],
    artifact_identity_receipt_refs: [],
  };
}

test('StageRun query keeps a recovered projection blocked until a durable controller resumes', () => {
  withDb((db) => {
    seedRecoveredProjection(db);
    const provider = providerBlockedState();
    const projected = projectRecoveredStageRunQuery(db, provider);

    assert.equal(projected.status, 'blocked');
    assert.equal(projected.current_role, null);
    assert.equal(projected.blocked_reason, 'stage_run_execution_resume_required');
    assert.equal(projected.recovery_ready, true);
    assert.equal(projected.durable_controller_running, false);
    assert.deepEqual(projected.artifact_refs, [artifactRef]);
    assert.deepEqual(projected.artifact_hashes, [artifactHash]);
    assert.deepEqual(projected.artifact_identity_receipt_refs, [receiptRef]);
    assert.deepEqual(projected.provider_live_state, provider);
    assert.equal(
      (projected.local_quality_cycle_projection as Record<string, unknown>).status,
      'awaiting_review',
    );
  });
});

test('StageRun query fails closed when recovered artifact lineage does not match', () => {
  withDb((db) => {
    seedRecoveredProjection(db, {
      producerIdentity: {
        artifact_refs: [artifactRef],
        artifact_hashes: ['c'.repeat(64)],
        artifact_identity_receipt_refs: [receiptRef],
      },
    });
    const provider = providerBlockedState();
    assert.deepEqual(projectRecoveredStageRunQuery(db, provider), provider);
  });
});

test('StageRun query does not override unrelated provider states', () => {
  withDb((db) => {
    seedRecoveredProjection(db);
    const provider = { ...providerBlockedState(), status: 'completed', blocked_reason: null };
    assert.deepEqual(projectRecoveredStageRunQuery(db, provider), provider);
  });
});
