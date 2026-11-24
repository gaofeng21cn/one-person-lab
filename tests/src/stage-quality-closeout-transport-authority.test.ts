import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  deriveNormalizedStageQualityCloseout,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-derivation.ts';
import {
  normalizeTypedStageCloseoutPacket,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-normalization.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttemptCloseouts,
} from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import {
  latestStageAttemptCloseoutPacketsByAttempt,
} from '../../src/adapters/execution/family-runtime-stage-attempt-ledger.ts';
import {
  listStageAttemptsWithMonitoringProjection,
} from '../../src/adapters/execution/family-runtime-stage-attempt-monitoring.ts';

const findings = [
  {
    finding_id: 'F1',
    severity: 'critical',
    required: true,
    evidence_refs: ['evidence:f1'],
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

function repairerAttempt(db: DatabaseSync, suffix: string) {
  createStageAttemptTable(db);
  const created = createStageAttempt(db, {
    domainId: 'redcube',
    stageId: 'artifact_revision',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: `/tmp/opl54-${suffix}` },
    sourceFingerprint: `sha256:${suffix}`,
  }).attempt;
  db.prepare(`
    UPDATE stage_attempts
    SET attempt_role = 'repairer', quality_round_index = 1, stage_run_id = ?,
      quality_cycle_id = ?, execution_session_ref = ?
    WHERE stage_attempt_id = ?
  `).run(`sr-${suffix}`, `quality-cycle:${suffix}`, `codex://threads/${suffix}`, created.stage_attempt_id);
  return inspectStageAttempt(db, created.stage_attempt_id);
}

function originalPacket(attempt: Record<string, any>, originalId = 'closeout_zzzzzzzzzzzzzzzzzzzzzzzz') {
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: attempt.stage_attempt_id,
    stage_run_id: attempt.stage_run_id,
    closeout_id: originalId,
    closeout_refs: ['artifact:deck-v2'],
    closeout_ref_metadata: [{
      ref: 'artifact:deck-v2',
      sha256: `sha256:${'a'.repeat(64)}`,
      size_bytes: 42,
      artifact_identity_receipt_ref: 'receipt:deck-v2',
    }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'domain',
    domain_ready_verdict: 'repair_completed',
    route_impact: {
      next_stage_may_start: false,
      stage_quality_cycle: {
        artifact_refs: ['artifact:deck-v2'],
        artifact_hashes: [`sha256:${'a'.repeat(64)}`],
        findings,
        repair_map: findings.map((finding) => repairEntry(finding.finding_id)),
      },
    },
    authority_boundary: { opl: 'closeout_transport_only', domain: 'quality_owner' },
  });
}

function assertDerivedAuthority(db: DatabaseSync, stageAttemptId: string) {
  const attempt = inspectStageAttempt(db, stageAttemptId);
  const quality = attempt.route_impact.stage_quality_cycle as Record<string, any>;
  assert.deepEqual(quality.repair_map.map((entry: any) => entry.finding_id), ['F1']);
  assert.deepEqual(quality.repair_observations.map((entry: any) => entry.finding_id), ['F2', 'F3', 'F4']);
  const rows = listStageAttemptCloseouts(db, stageAttemptId);
  assert.equal(rows.length, 2);
  assert.ok(rows[1]?.packet.closeout_normalization);
  return { attempt, rows };
}

test('original replay and duplicate sync are audit-only after a canonical child', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db, 'child-parent');
    const original = originalPacket(attempt);
    const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })!;
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: normalized.derivedCloseout,
    });
    const canonical = assertDerivedAuthority(db, attempt.stage_attempt_id);

    const parentReplay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: original,
    });
    assert.equal(parentReplay.closeout.idempotent_noop, true);
    assert.deepEqual(inspectStageAttempt(db, attempt.stage_attempt_id), canonical.attempt);
    assertDerivedAuthority(db, attempt.stage_attempt_id);

    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: normalized.derivedCloseout,
    });
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: original,
    });
    assertDerivedAuthority(db, attempt.stage_attempt_id);
  } finally {
    db.close();
  }
});

test('original-before-derived and legacy conflicting shapes cannot demote the child', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db, 'parent-child');
    const original = originalPacket(attempt);
    const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })!;
    ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: original });
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: normalized.derivedCloseout,
    });
    const canonical = assertDerivedAuthority(db, attempt.stage_attempt_id);

    const legacyMixedVersion = normalizeTypedStageCloseoutPacket({
      ...original,
      route_impact: normalized.derivedCloseout.route_impact,
    });
    assert.throws(() => ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: legacyMixedVersion,
    }));
    assert.deepEqual(inspectStageAttempt(db, attempt.stage_attempt_id), canonical.attempt);
    assertDerivedAuthority(db, attempt.stage_attempt_id);
  } finally {
    db.close();
  }
});

test('whitespace-padded finding ids fail closed without throwing from derivation', () => {
  const attempt = {
    stage_attempt_id: 'sat-whitespace-54',
    stage_run_id: 'sr-whitespace-54',
    attempt_role: 'repairer',
  };
  const packet = originalPacket(attempt);
  (packet.route_impact!.stage_quality_cycle as any).repair_map = [
    repairEntry(' F1 '),
    repairEntry('F2'),
  ];
  assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: packet, attempt }), null);
});

for (const originalId of [
  'closeout_000000000000000000000000',
  'closeout_ffffffffffffffffffffffff',
]) {
  test(`all latest readers including monitoring use rowid order for ${originalId}`, async () => {
    const db = new DatabaseSync(':memory:');
    try {
      const attempt = repairerAttempt(db, `ordering-${originalId.slice(-4)}`);
      const original = originalPacket(attempt, originalId);
      const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })!;
      ingestStageAttemptCloseout(db, {
        stageAttemptId: attempt.stage_attempt_id,
        packet: normalized.derivedCloseout,
      });
      db.prepare('UPDATE stage_attempt_closeouts SET created_at = ? WHERE stage_attempt_id = ?')
        .run('2026-11-20T00:00:00.000Z', attempt.stage_attempt_id);
      assert.equal(
        latestStageAttemptCloseoutPacketsByAttempt(db, [attempt.stage_attempt_id])
          .get(attempt.stage_attempt_id)?.closeout_id,
        normalized.derivedCloseout.closeout_id,
      );

      db.prepare('DELETE FROM stage_attempt_closeouts WHERE stage_attempt_id = ?')
        .run(attempt.stage_attempt_id);
      db.prepare('UPDATE stage_attempts SET closeout_refs_json = ? WHERE stage_attempt_id = ?')
        .run('[]', attempt.stage_attempt_id);
      const insert = db.prepare(`
        INSERT INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const [closeoutId, artifactRef, classification] of [
        [originalId, 'artifact:parent', 'platform_repair'],
        [normalized.derivedCloseout.closeout_id!, 'artifact:child', 'deliverable_progress'],
      ]) {
        insert.run(closeoutId, attempt.stage_attempt_id, JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          stage_attempt_id: attempt.stage_attempt_id,
          closeout_id: closeoutId,
          closeout_refs: [artifactRef],
          consumed_refs: [],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: null,
          domain_ready_verdict: null,
          user_stage_log: {
            stage_name: artifactRef,
            problem_summary: 'ordering probe',
            stage_goal: 'select the durable latest closeout',
            progress_delta_classification: classification,
            stage_work_done: ['ordering probe'],
            changed_stage_surfaces: ['closeout'],
            remaining_blockers: [],
            evidence_refs: [artifactRef],
          },
          route_impact: {},
          authority_boundary: {},
        }), '2026-11-20T00:00:00.000Z');
      }
      db.exec('DROP INDEX IF EXISTS idx_stage_attempt_closeouts_attempt');
      const projected = await listStageAttemptsWithMonitoringProjection(
        db,
        { root: `/tmp/opl54-monitoring-${originalId.slice(-4)}` },
        {},
        { full: true },
      );
      const monitored = projected.attempts.find((entry: any) =>
        entry.stage_attempt_id === attempt.stage_attempt_id
      );
      assert.equal(monitored?.progress_delta_classification, 'deliverable_progress');

      const compactProjected = await listStageAttemptsWithMonitoringProjection(
        db,
        { root: `/tmp/opl54-monitoring-compact-${originalId.slice(-4)}` },
      );
      const compactMonitored = compactProjected.attempts.find((entry: any) =>
        entry.stage_attempt_id === attempt.stage_attempt_id
      );
      assert.equal(compactMonitored?.progress_delta_classification, 'deliverable_progress');
    } finally {
      db.close();
    }
  });
}
