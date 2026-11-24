import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  deriveNormalizedStageQualityCloseout,
  stageCloseoutDigest,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-derivation.ts';
import { normalizeTypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-normalization.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttemptCloseouts,
} from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { latestStageAttemptCloseoutPacketsByAttempt } from '../../src/adapters/execution/family-runtime-stage-attempt-ledger.ts';
import { canonicalJsonText } from '../../src/kernel/canonical-json.ts';

const findings = [
  {
    finding_id: 'F1', severity: 'critical', required: true,
    evidence_refs: ['evidence:f1'], repair_expectation: 'Repair F1.',
  },
  ...['F2', 'F3', 'F4'].map((findingId) => ({
    finding_id: findingId, severity: 'minor', required: false,
    evidence_refs: [`evidence:${findingId}`], repair_expectation: `Observe ${findingId}.`,
  })),
];

function repairEntry(findingId: string, exactRef = false) {
  return {
    finding_id: findingId,
    repair_status: 'repaired',
    changed_artifact_refs: [exactRef
      ? { kind: 'opl_reviewer_input_snapshot_member', ref: `artifact:${findingId}`, sha256: `sha256:${'a'.repeat(64)}`, size_bytes: 42 }
      : `artifact:${findingId}`],
    repair_evidence_refs: [`repair-evidence:${findingId}`],
    note: `original-${findingId}`,
  };
}

function originalPacket(stageAttemptId = 'sat-repairer-normalization', stageRunId: string | null = 'sr-normalization') {
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(stageRunId ? { stage_run_id: stageRunId } : {}),
    closeout_refs: ['artifact:deck-v2'],
    closeout_ref_metadata: [{
      ref: 'artifact:deck-v2', sha256: `sha256:${'a'.repeat(64)}`, size_bytes: 42,
      artifact_identity_receipt_ref: 'receipt:deck-v2',
    }],
    consumed_refs: ['packet:stage'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'domain',
    domain_ready_verdict: 'repair_completed',
    token_usage: { total_tokens: 16 },
    route_impact: {
      next_stage_may_start: false,
      stage_quality_cycle: {
        artifact_refs: ['artifact:deck-v2'],
        artifact_hashes: [`sha256:${'a'.repeat(64)}`],
        artifact_identity_receipt_refs: ['receipt:deck-v2'],
        findings,
        repair_map: findings.map((finding) => repairEntry(finding.finding_id)),
        review_input_snapshot_materialization_request: { request_id: 'snapshot-original' },
      },
      stage_route_recommendation: { decision_kind: 'advance', target_stage_id: 'next' },
      permissions: { inherited: true },
    },
    authority_boundary: { opl: 'closeout_transport_only', domain: 'quality_owner' },
  });
}

function repairerAttempt(db: DatabaseSync) {
  createStageAttemptTable(db);
  const created = createStageAttempt(db, {
    domainId: 'redcube', stageId: 'artifact_revision', providerKind: 'temporal',
    workspaceLocator: { workspace_root: '/tmp/opl-closeout-normalization-ledger' },
    sourceFingerprint: 'sha256:normalization',
  }).attempt;
  db.prepare(`UPDATE stage_attempts
    SET attempt_role = 'repairer', quality_round_index = 1, stage_run_id = 'sr-normalization',
      quality_cycle_id = 'quality-cycle:sr-normalization', execution_session_ref = 'codex://threads/repairer'
    WHERE stage_attempt_id = ?`).run(created.stage_attempt_id);
  return inspectStageAttempt(db, created.stage_attempt_id);
}

function quality(packet: ReturnType<typeof originalPacket>) {
  return packet.route_impact!.stage_quality_cycle as Record<string, any>;
}

test('ingest preserves a misplaced Stage quality cycle and validates its artifact receipt binding', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db);
    const original = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    const { stage_quality_cycle: _nestedCycle, ...routeImpact } = original.route_impact!;
    const cycle = { ...quality(original), repair_map: [repairEntry('F1')] };
    const misplaced = { ...original, route_impact: routeImpact, stage_quality_cycle: cycle };
    assert.throws(() => ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: {
        ...misplaced,
        stage_quality_cycle: { ...cycle, artifact_identity_receipt_refs: ['receipt:mismatched'] },
      },
    }), (error: any) => error?.details?.failure_code === 'stage_quality_cycle_attempt_artifact_identity_mismatch');
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 0);

    const input = { stageAttemptId: attempt.stage_attempt_id, packet: misplaced };
    const { attempt: persisted, closeout } = ingestStageAttemptCloseout(db, input);
    assert.deepEqual(quality(closeout.packet), cycle);
    assert.deepEqual(persisted.route_impact.normalization_findings, [
      'stage_quality_cycle_folded_from_closeout_top_level',
    ]);
    assert.equal(ingestStageAttemptCloseout(db, input).closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 1);
  } finally {
    db.close();
  }
});

test('identical Stage quality cycle declarations keep the canonical packet and conflicts reject', () => {
  const original = originalPacket();
  const topLevelCycle = Object.fromEntries(Object.entries(quality(original)).reverse());
  assert.deepEqual(
    normalizeTypedStageCloseoutPacket({ ...original, stage_quality_cycle: topLevelCycle }),
    original,
  );
  assert.throws(
    () => normalizeTypedStageCloseoutPacket({ ...original, stage_quality_cycle: { ...topLevelCycle, findings: [] } }),
    (error: any) => error?.details?.failure_code === 'typed_closeout_stage_quality_cycle_placement_conflict',
  );
});

test('a complete quality artifact identity one level up uses the existing artifact receipt guard', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db);
    const original = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    const { artifact_refs, artifact_hashes, ...remainingCycle } = quality(original);
    const misplaced = {
      ...original,
      route_impact: { ...original.route_impact, artifact_refs, artifact_hashes, stage_quality_cycle: remainingCycle },
    };
    const input = { stageAttemptId: attempt.stage_attempt_id, packet: misplaced };
    const mismatched = {
      ...misplaced,
      route_impact: {
        ...misplaced.route_impact,
        stage_quality_cycle: { ...remainingCycle, artifact_identity_receipt_refs: ['receipt:wrong'] },
      },
    };
    assert.throws(
      () => ingestStageAttemptCloseout(db, { ...input, packet: mismatched }),
      (error: any) => error?.details?.failure_code === 'stage_quality_cycle_attempt_artifact_identity_mismatch',
    );

    const { attempt: persisted, closeout } = ingestStageAttemptCloseout(db, input);
    assert.deepEqual(quality(closeout.packet), quality(original));
    assert.deepEqual(persisted.route_impact.normalization_findings, [
      'stage_quality_artifact_identity_folded_from_route_impact_level',
    ]);
    assert.equal(Object.hasOwn(closeout.packet.route_impact!, 'artifact_refs'), false);
    assert.equal(ingestStageAttemptCloseout(db, input).closeout.idempotent_noop, true);

    const duplicated = { ...original, route_impact: { ...original.route_impact, artifact_refs, artifact_hashes } };
    assert.deepEqual(normalizeTypedStageCloseoutPacket(duplicated), original);
    assert.throws(
      () => normalizeTypedStageCloseoutPacket({
        ...duplicated, route_impact: { ...duplicated.route_impact, artifact_refs: ['artifact:other'] },
      }),
      (error: any) => error?.details?.failure_code === 'typed_closeout_quality_artifact_identity_placement_conflict',
    );
    const noCycle = { artifact_refs, artifact_hashes };
    assert.deepEqual(normalizeTypedStageCloseoutPacket({ ...original, route_impact: noCycle }).route_impact, noCycle);
  } finally {
    db.close();
  }
});

test('deterministic partition preserves exact required and moved entries with canonical two-way lineage', () => {
  const attempt = {
    stage_attempt_id: 'sat-repairer-normalization', stage_run_id: 'sr-normalization', attempt_role: 'repairer',
  };
  const original = originalPacket();
  quality(original).repair_map = [
    repairEntry('F2', true), repairEntry('F1', true), repairEntry('F4', true), repairEntry('F3', true),
  ];
  const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt });
  assert.ok(normalized);
  const derived = normalized.derivedCloseout;
  const lineage = derived.closeout_normalization!;
  assert.deepEqual(quality(derived).repair_map, [repairEntry('F1', true)]);
  assert.deepEqual(quality(derived).repair_observations, [
    repairEntry('F2', true), repairEntry('F4', true), repairEntry('F3', true),
  ]);
  assert.deepEqual(lineage.moved_finding_ids, ['F2', 'F4', 'F3']);
  assert.deepEqual(lineage.original_closeout_packet, normalized.originalCloseout);
  assert.equal(lineage.original_closeout_id, normalized.originalCloseout.closeout_id);
  assert.equal(lineage.derived_closeout_id, derived.closeout_id);
  assert.equal(lineage.original_closeout_sha256, stageCloseoutDigest(normalized.originalCloseout));
  assert.equal(lineage.original_repair_map_sha256, stageCloseoutDigest(quality(original).repair_map));
  assert.equal(lineage.derived_repair_map_sha256, stageCloseoutDigest(quality(derived).repair_map));
  assert.equal(lineage.derived_repair_observations_sha256, stageCloseoutDigest(quality(derived).repair_observations));
  assert.equal(lineage.authority_status, 'pending_unreviewed');
  assert.equal(lineage.review_requirement, 'fresh_re_review_required');
  assert.deepEqual(deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })?.derivedCloseout, derived);
  assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: derived, attempt }), null);
  for (const field of [
    'artifact_refs', 'artifact_hashes', 'artifact_identity_receipt_refs', 'findings',
    'review_input_snapshot_materialization_request',
  ]) assert.deepEqual(quality(derived)[field], quality(original)[field]);
  assert.equal(derived.token_usage?.total_tokens, 16);
});

test('valid maps, other roles and every other invalid class derive nothing', () => {
  const attempt = {
    stage_attempt_id: 'sat-repairer-normalization', stage_run_id: 'sr-normalization', attempt_role: 'repairer',
  };
  for (const role of ['producer', 'reviewer', 're_reviewer']) {
    assert.equal(deriveNormalizedStageQualityCloseout({
      closeoutPacket: originalPacket(), attempt: { ...attempt, attempt_role: role },
    }), null);
  }
  const invalidMaps: unknown[] = [
    [repairEntry('F1')],
    [repairEntry('F2')],
    [repairEntry('F1'), repairEntry('F1'), repairEntry('F2')],
    [repairEntry('F1'), repairEntry('UNKNOWN'), repairEntry('F2')],
    [{ ...repairEntry('F1'), repair_status: 'unknown' }, repairEntry('F2')],
    [repairEntry('F1'), null, repairEntry('F2')],
    'not-an-array',
  ];
  for (const repairMap of invalidMaps) {
    const packet = originalPacket();
    quality(packet).repair_map = repairMap;
    assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: packet, attempt }), null);
  }
  for (const forbiddenField of ['outcome', 'verdict']) {
    const packet = originalPacket();
    quality(packet)[forbiddenField] = 'pass';
    assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: packet, attempt }), null);
  }
  const existingObservations = originalPacket();
  quality(existingObservations).repair_observations = [repairEntry('F3')];
  assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: existingObservations, attempt }), null);
  assert.equal(deriveNormalizedStageQualityCloseout({
    closeoutPacket: originalPacket('sat-other'), attempt,
  }), null);
});

test('derived ingest is atomic, idempotent and latest by rowid rather than lexical closeout id', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db);
    const original = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    original.closeout_id = 'closeout_zzzzzzzzzzzzzzzzzzzzzzzz';
    const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })!;
    const derived = normalized.derivedCloseout;
    const accepted = ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id, packet: derived,
    });
    assert.equal(accepted.closeout.closeout_id, derived.closeout_id);
    const closeouts = listStageAttemptCloseouts(db, attempt.stage_attempt_id);
    assert.equal(closeouts.length, 2);
    assert.deepEqual(closeouts[0]?.packet, normalized.originalCloseout);
    assert.deepEqual(closeouts[1]?.packet, derived);
    assert.equal(quality(closeouts[0]!.packet as typeof original).repair_map.length, 4);
    assert.equal(quality(closeouts[1]!.packet as typeof original).repair_map.length, 1);
    const persistedAttempt = inspectStageAttempt(db, attempt.stage_attempt_id);
    const persistedQuality = persistedAttempt.route_impact.stage_quality_cycle as any;
    assert.equal(persistedQuality.repair_map.length, 1);
    assert.equal(persistedQuality.repair_observations.length, 3);
    assert.equal(persistedQuality.closeout_normalization, undefined);
    assert.deepEqual(persistedAttempt.provider_run.cost_summary, undefined);

    db.prepare('UPDATE stage_attempt_closeouts SET created_at = ? WHERE stage_attempt_id = ?')
      .run('2026-11-20T00:00:00.000Z', attempt.stage_attempt_id);
    assert.equal(
      latestStageAttemptCloseoutPacketsByAttempt(db, [attempt.stage_attempt_id]).get(attempt.stage_attempt_id)
        ?.closeout_id,
      derived.closeout_id,
    );
    assert.ok(String(derived.closeout_id) < String(normalized.originalCloseout.closeout_id));

    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id, packet: derived,
    });
    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 2);
  } finally {
    db.close();
  }
});

test('every derived-ingest rejection leaves no partial parent, child or Attempt mutation', () => {
  const cases = [
    'domain',
    'forbidden-outcome',
    'forbidden-verdict',
    'derived-digest',
    'original-snapshot',
    'original-conflict',
    'derived-conflict',
    'child-insert-failure',
    'attempt-sync-failure',
  ] as const;
  for (const failure of cases) {
    const db = new DatabaseSync(':memory:');
    try {
      const attempt = repairerAttempt(db);
      let original = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
      if (failure === 'domain') {
        original = normalizeTypedStageCloseoutPacket({
          ...original,
          closeout_refs: [...original.closeout_refs, 'domain:output'],
          domain_output: {
            surface_kind: 'domain_owned_stage_output_ref',
            version: 'domain-owned-stage-output-ref.v1',
            domain_id: 'other-domain', output_ref: 'domain:output',
          },
        });
      }
      if (failure === 'forbidden-outcome' || failure === 'forbidden-verdict') {
        quality(original)[failure === 'forbidden-outcome' ? 'outcome' : 'verdict'] = 'pass';
        assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt }), null);
        assert.throws(() => ingestStageAttemptCloseout(db, {
          stageAttemptId: attempt.stage_attempt_id, packet: original,
        }));
        assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 0);
        continue;
      }
      const derived = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })!.derivedCloseout;
      let packet = derived;
      if (failure === 'derived-digest') {
        packet = structuredClone(derived);
        quality(packet).repair_map[0].note = 'tampered';
      } else if (failure === 'original-snapshot') {
        packet = structuredClone(derived);
        quality(packet.closeout_normalization!.original_closeout_packet as typeof original).findings = [];
      } else if (failure === 'original-conflict' || failure === 'derived-conflict') {
        const conflictId = failure === 'original-conflict'
          ? derived.closeout_normalization!.original_closeout_id
          : derived.closeout_id!;
        db.prepare(`INSERT INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
          VALUES (?, ?, ?, ?)`).run(conflictId, attempt.stage_attempt_id, '{"conflict":true}', 'before');
      } else if (failure === 'child-insert-failure') {
        db.exec(`CREATE TRIGGER reject_derived_insert BEFORE INSERT ON stage_attempt_closeouts
          WHEN NEW.closeout_id = '${derived.closeout_id}' BEGIN SELECT RAISE(ABORT, 'injected child failure'); END`);
      } else if (failure === 'attempt-sync-failure') {
        db.exec(`CREATE TRIGGER reject_attempt_sync BEFORE UPDATE ON stage_attempts
          WHEN NEW.stage_attempt_id = '${attempt.stage_attempt_id}'
          BEGIN SELECT RAISE(ABORT, 'injected sync failure'); END`);
      }
      const before = inspectStageAttempt(db, attempt.stage_attempt_id);
      const beforeRows = db.prepare('SELECT * FROM stage_attempt_closeouts WHERE stage_attempt_id = ?')
        .all(attempt.stage_attempt_id);
      assert.throws(() => ingestStageAttemptCloseout(db, {
        stageAttemptId: attempt.stage_attempt_id, packet,
      }), failure);
      const afterRows = db.prepare('SELECT * FROM stage_attempt_closeouts WHERE stage_attempt_id = ?')
        .all(attempt.stage_attempt_id);
      assert.equal(canonicalJsonText(afterRows), canonicalJsonText(beforeRows), failure);
      assert.deepEqual(inspectStageAttempt(db, attempt.stage_attempt_id), before, failure);
      if (!failure.endsWith('conflict')) assert.equal(afterRows.length, 0, failure);
    } finally {
      db.close();
    }
  }
});

test('an explicitly empty declared receipt-ref list is treated as missing and filled from verified metadata', () => {
  const attempt = {
    stage_attempt_id: 'sat-repairer-normalization', stage_run_id: 'sr-normalization', attempt_role: 'repairer',
  };
  const emptyDeclared = originalPacket();
  quality(emptyDeclared).artifact_identity_receipt_refs = [];
  const normalized = deriveNormalizedStageQualityCloseout({ closeoutPacket: emptyDeclared, attempt });
  assert.ok(normalized);
  assert.deepEqual(quality(normalized.derivedCloseout).artifact_identity_receipt_refs, ['receipt:deck-v2']);
  assert.deepEqual(
    quality(normalized.originalCloseout).artifact_identity_receipt_refs,
    [],
    'the embedded original audit parent preserves the exact declared empty list',
  );
  const consistent = originalPacket();
  quality(consistent).artifact_identity_receipt_refs = ['receipt:deck-v2'];
  assert.deepEqual(
    quality(deriveNormalizedStageQualityCloseout({ closeoutPacket: consistent, attempt })!.derivedCloseout)
      .artifact_identity_receipt_refs,
    ['receipt:deck-v2'],
    'a declared list equal to the verified metadata list is accepted',
  );
  const divergent = originalPacket();
  quality(divergent).artifact_identity_receipt_refs = ['receipt:declared-but-divergent'];
  assert.equal(
    deriveNormalizedStageQualityCloseout({ closeoutPacket: divergent, attempt }),
    null,
    'a divergent declared list fails closed by declining normalization',
  );
  const divergentOrder = originalPacket();
  quality(divergentOrder).artifact_identity_receipt_refs = ['receipt:declared-but-divergent', 'receipt:deck-v2'];
  assert.equal(
    deriveNormalizedStageQualityCloseout({ closeoutPacket: divergentOrder, attempt }),
    null,
    'a divergent-length declared list fails closed',
  );
  for (const garbage of ['receipt:garbage', { nested: 'receipt:garbage' }, [123], ['receipt:deck-v2', 7], ['']]) {
    const packet = originalPacket();
    quality(packet).artifact_identity_receipt_refs = garbage;
    assert.equal(
      deriveNormalizedStageQualityCloseout({ closeoutPacket: packet, attempt }),
      null,
      `malformed declared shape fails closed: ${JSON.stringify(garbage)}`,
    );
  }
  // Fail closed means derivation declines AND ingest rejects the unverified
  // declaration before any durable write: no derived child can carry it, and
  // the original cannot persist it either.
  {
    const db = new DatabaseSync(':memory:');
    try {
      const dbAttempt = repairerAttempt(db);
      const original = originalPacket(dbAttempt.stage_attempt_id, dbAttempt.stage_run_id);
      quality(original).artifact_identity_receipt_refs = ['receipt:declared-but-divergent'];
      assert.equal(deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt: dbAttempt }), null);
      assert.throws(
        () => ingestStageAttemptCloseout(db, { stageAttemptId: dbAttempt.stage_attempt_id, packet: original }),
        (error: any) => error?.details?.failure_code === 'stage_quality_cycle_attempt_artifact_identity_mismatch',
      );
      assert.equal(listStageAttemptCloseouts(db, dbAttempt.stage_attempt_id).length, 0);
    } finally {
      db.close();
    }
  }
  // The same boundary rejects malformed declared shapes without crashing.
  for (const garbage of ['receipt:garbage', { nested: 'receipt:garbage' }, [123], ['receipt:deck-v2', 7], ['']]) {
    const db = new DatabaseSync(':memory:');
    try {
      const dbAttempt = repairerAttempt(db);
      const original = originalPacket(dbAttempt.stage_attempt_id, dbAttempt.stage_run_id);
      quality(original).artifact_identity_receipt_refs = garbage;
      assert.throws(
        () => ingestStageAttemptCloseout(db, { stageAttemptId: dbAttempt.stage_attempt_id, packet: original }),
        (error: any) => error?.details?.failure_code === 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        `garbage shape rejected: ${JSON.stringify(garbage)}`,
      );
      assert.equal(listStageAttemptCloseouts(db, dbAttempt.stage_attempt_id).length, 0);
    } finally {
      db.close();
    }
  }
});

test('a derived exact replay still enforces the original audit parent invariant', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db);
    const original = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    const derived = deriveNormalizedStageQualityCloseout({ closeoutPacket: original, attempt })!.derivedCloseout;
    ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: derived });
    db.prepare('DELETE FROM stage_attempt_closeouts WHERE closeout_id = ?')
      .run(derived.closeout_normalization!.original_closeout_id);
    assert.throws(
      () => ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: derived }),
      (error: any) => error?.details?.failure_code === 'stage_closeout_normalization_parent_missing',
    );
    const rows = listStageAttemptCloseouts(db, attempt.stage_attempt_id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.closeout_id, derived.closeout_id);
  } finally {
    db.close();
  }
});

test('a second different canonical derived child is typed-rejected and the first child stays authoritative', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db);
    const original1 = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    const derived1 = deriveNormalizedStageQualityCloseout({ closeoutPacket: original1, attempt })!.derivedCloseout;
    ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: derived1 });

    const original2 = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    original2.closeout_refs = ['artifact:deck-v3'];
    original2.closeout_ref_metadata = [{
      ref: 'artifact:deck-v3', sha256: `sha256:${'b'.repeat(64)}`, size_bytes: 42,
      artifact_identity_receipt_ref: 'receipt:deck-v3',
    }];
    quality(original2).artifact_refs = ['artifact:deck-v3'];
    quality(original2).artifact_hashes = [`sha256:${'b'.repeat(64)}`];
    quality(original2).artifact_identity_receipt_refs = ['receipt:deck-v3'];
    quality(original2).repair_map = findings.map((finding) => ({
      ...repairEntry(finding.finding_id), note: `second-${finding.finding_id}`,
    }));
    const derived2 = deriveNormalizedStageQualityCloseout({ closeoutPacket: original2, attempt })!.derivedCloseout;
    assert.notEqual(derived2.closeout_id, derived1.closeout_id);

    const before = inspectStageAttempt(db, attempt.stage_attempt_id);
    assert.throws(
      () => ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: derived2 }),
      (error: any) => error?.details?.failure_code === 'stage_closeout_normalization_canonical_child_exists',
    );
    const rows = listStageAttemptCloseouts(db, attempt.stage_attempt_id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1]?.packet, derived1);
    assert.deepEqual(inspectStageAttempt(db, attempt.stage_attempt_id), before);
    assert.equal(
      (before.route_impact.stage_quality_cycle as any).repair_map[0].note,
      'original-F1',
    );

    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id, packet: derived1,
    });
    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 2);
  } finally {
    db.close();
  }
});

test('normal valid closeout keeps the original one-row ingest behavior inside a nested transaction', () => {  const db = new DatabaseSync(':memory:');
  try {
    const attempt = repairerAttempt(db);
    const original = originalPacket(attempt.stage_attempt_id, attempt.stage_run_id);
    quality(original).repair_map = [repairEntry('F1')];
    db.exec('BEGIN IMMEDIATE');
    ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: original });
    assert.equal(db.isTransaction, true);
    db.exec('ROLLBACK');
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 0);
    ingestStageAttemptCloseout(db, { stageAttemptId: attempt.stage_attempt_id, packet: original });
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 1);
  } finally {
    db.close();
  }
});
