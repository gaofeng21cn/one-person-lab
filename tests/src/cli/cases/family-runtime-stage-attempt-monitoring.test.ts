import { DatabaseSync } from 'node:sqlite';

import { assert, fs, insertFamilyRuntimeTaskProjectionFixture, os, path, runCli, test } from '../helpers.ts';
import { createFamilyRuntimeQueueTables } from '../../../../src/modules/runway/family-runtime-store.ts';
import { listStageAttemptsWithMonitoringProjection } from '../../../../src/modules/runway/family-runtime-stage-attempt-monitoring.ts';
import { createStageAttempt } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime attempt list filters attempts and emits compact Progress-First timeline', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-monitoring-'));
  try {
    const medTask = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'stage/scout',
      payload: { study_id: 'DM002' },
      dedupeKey: 'mas:DM002:stage:scout',
    });
    const magTask = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautogrant',
      taskKind: 'stage/scout',
      payload: { study_id: 'GR001' },
      dedupeKey: 'mag:GR001:stage:scout',
    });
    const medAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--task',
      medTask.task_id,
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
      '--task',
      magTask.task_id,
    ], familyRuntimeEnv(stateRoot));

    const output = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--status',
      'blocked',
      '--since-hours',
      '24',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;

    assert.equal(output.summary.total, 2);
    assert.equal(output.summary.filtered_total, 1);
    assert.equal(output.summary.compact_timeline_returned_total, 1);
    assert.equal(output.summary.compact_timeline_omitted_total, 0);
    assert.equal(output.summary.compact_timeline_limit, 25);
    assert.equal(output.summary.by_status.blocked, 1);
    assert.equal(output.filters.domain_id, 'medautoscience');
    assert.equal(output.filters.study_id, 'DM002');
    assert.equal(output.filters.status, 'blocked');
    assert.equal(output.filters.compact_timeline, true);
    assert.deepEqual(output.items, output.compact_timeline);
    assert.deepEqual(output.attempts, output.compact_timeline);
    assert.equal(output.view_mode, 'compact_timeline');
    assert.equal(output.compact_timeline.length, 1);
    assert.equal(output.compact_timeline[0].stage_attempt_id, medAttempt.stage_attempt_id);
    assert.equal(output.compact_timeline[0].study_id, 'DM002');
    assert.equal(output.compact_timeline[0].semantic_status, 'missing_domain_semantic_summary');
    assert.equal(output.compact_timeline[0].progress_delta_classification, 'typed_blocker');
    assert.equal(output.compact_timeline[0].timeline.last_heartbeat_at, null);
    assert.equal(output.compact_timeline[0].current_provider_readiness.provider_kind, 'temporal');
    assert.equal(output.compact_timeline[0].current_provider_readiness.provider_ready, false);
    assert.equal(output.compact_timeline[0].provider_liveness_attention.attention_status, 'blocked_provider_not_ready');
    assert.equal(output.compact_timeline[0].provider_liveness_attention.severity, 'blocking');
    assert.equal(
      output.compact_timeline[0].provider_liveness_attention.progress_first_effect,
      'attempt_exists_but_provider_not_live_repair_provider_before_read_model_reconcile',
    );
    assert.equal(
      output.compact_timeline[0].provider_readiness_currentness.effective_provider_readiness_source,
      'current_provider_readiness',
    );
    assert.equal(
      output.compact_timeline[0].provider_readiness_currentness.creation_receipt_currentness,
      'creation_time_snapshot',
    );
    assert.equal(
      output.compact_timeline[0].provider_readiness_currentness.provider_receipt_is_current_readiness,
      false,
    );
    assert.equal(output.compact_timeline[0].semantic_gap.reason, 'domain_closeout_did_not_provide_user_stage_log');
    assert.equal(
      output.compact_timeline[0].next_inspection_hint.command,
      `opl family-runtime attempt query ${medAttempt.stage_attempt_id}`,
    );
    assert.equal(output.compact_timeline[0].operator_summary.attempt, medAttempt.stage_attempt_id);
    assert.equal(output.compact_timeline[0].operator_summary.status, 'blocked');
    assert.equal(output.compact_timeline[0].operator_summary.stage, 'scout');
    assert.equal(output.compact_timeline[0].operator_summary.study, 'DM002');
    assert.equal(output.compact_timeline[0].operator_summary.domain, 'medautoscience');
    assert.equal(output.compact_timeline[0].operator_summary.action, 'opl_family_runtime_attempt_query');
    assert.equal(output.compact_timeline[0].operator_summary.owner, 'domain_owner');
    assert.equal(output.compact_timeline[0].operator_summary.timing.started_at, null);
    assert.equal(output.compact_timeline[0].operator_summary.timing.completed_at, null);
    assert.equal(output.compact_timeline[0].operator_summary.timing.last_heartbeat_at, null);
    assert.equal(output.compact_timeline[0].operator_summary.provider_readiness.provider_ready, false);
    assert.equal(
      output.compact_timeline[0].operator_summary.provider_liveness_attention.attention_status,
      'blocked_provider_not_ready',
    );
    assert.equal(output.compact_timeline[0].operator_summary.progress_delta_classification, 'typed_blocker');
    assert.deepEqual(output.compact_timeline[0].operator_summary.closeout_refs, []);
    assert.equal(output.compact_timeline[0].operator_summary.closeout_ref_count, 0);
    assert.equal(output.compact_timeline[0].operator_summary.semantic_gap_reason,
      'domain_closeout_did_not_provide_user_stage_log');
    assert.equal(
      output.compact_timeline[0].operator_summary.next_inspection.expected_next_delta,
      'domain_user_stage_log_or_typed_blocker_with_lineage_required',
    );
    assert.equal(typeof output.compact_timeline[0].timeline.activity_event_count, 'number');
    assert.equal(output.compact_timeline[0].authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list keeps stable array shape for full and compact views', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-stable-shape-'));
  try {
    const task = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'stage/scout',
      payload: { study_id: 'DM002' },
      dedupeKey: 'mas:DM002:stage:stable-shape',
    });
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","study_id":"DM002"}',
      '--task',
      task.task_id,
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt;

    const full = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--full',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;
    const compact = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;

    assert.equal(full.view_mode, 'full');
    assert.equal(full.filters.full, true);
    assert.equal(compact.view_mode, 'compact_timeline');
    assert.equal(compact.filters.full, false);
    assert.equal(Array.isArray(full.items), true);
    assert.equal(Array.isArray(full.attempts), true);
    assert.equal(Array.isArray(compact.items), true);
    assert.equal(Array.isArray(compact.attempts), true);
    assert.equal(full.items[0].stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(full.attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(full.attempts[0].provider_kind, 'temporal');
    assert.equal(compact.items[0].stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(compact.attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    assert.equal('provider_run' in full.attempts[0], false);
    assert.equal('activity_events' in full.attempts[0], false);
    assert.equal('route_impact' in full.attempts[0], false);
    assert.deepEqual(compact.items, compact.compact_timeline);
    assert.deepEqual(compact.attempts, compact.compact_timeline);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list --full keeps study-filtered output bounded', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-full-bounded-'));
  const db = new DatabaseSync(path.join(stateRoot, 'queue.sqlite'));
  try {
    createFamilyRuntimeQueueTables(db);
    const heavyBody = 'x'.repeat(512_000);
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'submission_milestone_candidate::followthrough::followthrough-01',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: '/tmp/mas',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      },
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?,
        activity_events_json = ?,
        route_impact_json = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        provider_status: 'running',
        transcript_body: heavyBody,
      }),
      JSON.stringify([{
        event_id: 'event-heavy',
        payload_body: heavyBody,
      }]),
      JSON.stringify({
        raw_route_payload: heavyBody,
      }),
      attempt.stage_attempt_id,
    );

    const output = await listStageAttemptsWithMonitoringProjection(db, { root: stateRoot }, {}, {
      domainId: 'medautoscience',
      studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
      full: true,
    });
    const outputJson = JSON.stringify(output);

    assert.equal(output.filters.full, true);
    assert.equal(output.filters.compact_timeline, false);
    assert.equal(output.summary.filtered_total, 1);
    assert.equal(output.attempts.length, 1);
    assert.equal(output.attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(output.attempts[0].provider_kind, 'temporal');
    assert.equal('provider_run' in output.attempts[0], false);
    assert.equal('activity_events' in output.attempts[0], false);
    assert.equal('route_impact' in output.attempts[0], false);
    assert.equal(outputJson.includes(heavyBody), false);
    assert.equal(outputJson.length < 50_000, true);
  } finally {
    db.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list defaults filtered readout to bounded audit-safe timeline', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-filtered-bounded-'));
  const db = new DatabaseSync(path.join(stateRoot, 'queue.sqlite'));
  try {
    createFamilyRuntimeQueueTables(db);
    const heavyBody = 'x'.repeat(128_000);
    for (let index = 0; index < 55; index += 1) {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: `review-${String(index).padStart(2, '0')}`,
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: '/tmp/mas',
          study_id: 'DM003',
        },
      }).attempt;
      db.prepare(`
        UPDATE stage_attempts
        SET provider_run_json = ?,
          activity_events_json = ?,
          route_impact_json = ?
        WHERE stage_attempt_id = ?
      `).run(
        JSON.stringify({
          provider_run_id: `provider-run-${index}`,
          transcript_body: heavyBody,
        }),
        JSON.stringify([{
          event_id: `event-${index}`,
          payload_body: heavyBody,
        }]),
        JSON.stringify({
          raw_route_payload: heavyBody,
        }),
        attempt.stage_attempt_id,
      );
    }

    const output = await listStageAttemptsWithMonitoringProjection(db, { root: stateRoot }, {}, {
      domainId: 'medautoscience',
      studyId: 'DM003',
    });
    const outputJson = JSON.stringify(output);

    assert.equal(output.filters.compact_timeline, true);
    assert.equal(output.filters.full, false);
    assert.equal(output.summary.total, 55);
    assert.equal(output.summary.filtered_total, 55);
    assert.equal(output.summary.compact_timeline_returned_total, 25);
    assert.equal(output.summary.compact_timeline_omitted_total, 30);
    assert.equal(output.summary.compact_timeline_limit, 25);
    assert.equal(output.attempts.length, 25);
    assert.equal(output.compact_timeline?.length, 25);
    assert.deepEqual(output.attempts, output.compact_timeline);
    assert.equal('provider_run' in output.attempts[0], false);
    assert.equal('activity_events' in output.attempts[0], false);
    assert.equal('route_impact' in output.attempts[0], false);
    assert.equal(outputJson.includes(heavyBody), false);
    assert.equal(outputJson.length < heavyBody.length * 10, true);
  } finally {
    db.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list defaults unfiltered readout to bounded audit-safe timeline', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-default-bounded-'));
  const db = new DatabaseSync(path.join(stateRoot, 'queue.sqlite'));
  try {
    createFamilyRuntimeQueueTables(db);
    const heavyBody = 'x'.repeat(128_000);
    for (let index = 0; index < 55; index += 1) {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: `review-${String(index).padStart(2, '0')}`,
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: '/tmp/mas',
          study_id: 'DM003',
        },
      }).attempt;
      db.prepare(`
        UPDATE stage_attempts
        SET provider_run_json = ?,
          activity_events_json = ?,
          route_impact_json = ?
        WHERE stage_attempt_id = ?
      `).run(
        JSON.stringify({
          provider_run_id: `provider-run-${index}`,
          transcript_body: heavyBody,
        }),
        JSON.stringify([{
          event_id: `event-${index}`,
          payload_body: heavyBody,
        }]),
        JSON.stringify({
          raw_route_payload: heavyBody,
        }),
        attempt.stage_attempt_id,
      );
    }

    const output = await listStageAttemptsWithMonitoringProjection(db, { root: stateRoot });
    const outputJson = JSON.stringify(output);

    assert.equal(output.filters.compact_timeline, true);
    assert.equal(output.summary.total, 55);
    assert.equal(output.summary.filtered_total, 55);
    assert.equal(output.summary.compact_timeline_returned_total, 25);
    assert.equal(output.summary.compact_timeline_omitted_total, 30);
    assert.equal(output.summary.compact_timeline_limit, 25);
    assert.equal(output.attempts.length, 25);
    assert.equal(output.compact_timeline?.length, 25);
    assert.deepEqual(output.attempts, output.compact_timeline);
    assert.equal('provider_run' in output.attempts[0], false);
    assert.equal('activity_events' in output.attempts[0], false);
    assert.equal('route_impact' in output.attempts[0], false);
    assert.equal(outputJson.includes(heavyBody), false);
    assert.equal(outputJson.length < heavyBody.length * 10, true);
  } finally {
    db.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list exposes provider liveness attention before read-model reconcile', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-provider-attention-'));
  try {
    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","study_id":"DM003"}',
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));

    const output = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM003',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_stage_attempts;
    const item = output.compact_timeline[0];

    assert.equal(output.summary.filtered_total, 1);
    assert.equal(item.current_provider_readiness.provider_kind, 'temporal');
    assert.equal(item.current_provider_readiness.provider_ready, false);
    assert.equal(item.provider_liveness_attention.attention_status, 'blocked_provider_not_ready');
    assert.equal(item.provider_liveness_attention.severity, 'blocking');
    assert.equal(item.provider_liveness_attention.reason, 'temporal_runtime_not_configured');
    assert.equal(item.provider_liveness_attention.worker_lifecycle_status, 'not_configured');
    assert.equal(item.provider_liveness_attention.repair_action_id, 'configure_temporal_service');
    assert.equal(item.provider_liveness_attention.next_command, 'opl family-runtime service start --provider temporal');
    assert.equal(
      item.provider_liveness_attention.progress_first_effect,
      'attempt_exists_but_provider_not_live_repair_provider_before_read_model_reconcile',
    );
    assert.equal(
      item.operator_summary.provider_liveness_attention.attention_status,
      'blocked_provider_not_ready',
    );
    assert.equal(
      item.operator_summary.provider_liveness_attention.next_command,
      'opl family-runtime service start --provider temporal',
    );
    assert.equal(
      item.provider_readiness_currentness.effective_provider_readiness_source,
      'current_provider_readiness',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list compact timeline bounds provider readiness payload bodies', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-bounded-readiness-'));
  const dbPath = path.join(stateRoot, 'queue.sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    createFamilyRuntimeQueueTables(db);
    createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'review',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: '/tmp/mas',
        study_id: 'DM003',
      },
      blockedReason: 'typed_closeout_packet_required',
    });
    const heavyBody = 'x'.repeat(256_000);
    const projection = await listStageAttemptsWithMonitoringProjection(db, { root: stateRoot }, {
      managedProviderProjection: {
        managed_temporal_state_consistency_declared: true,
        family_stage_control_plane_declared: true,
        domain_memory_descriptor_declared: true,
        owner_receipt_contract_declared: true,
        legacy_retirement_tombstone_declared: true,
        managed_temporal_state_consistency: {
          surface_kind: 'managed_temporal_state_consistency',
          projection_status: 'ready',
          service_ready: true,
          worker_ready: true,
          provider_readiness_heavy_body: heavyBody,
          nested_payload: {
            transcript_body: heavyBody,
            domain_manifest: {
              payload_body: heavyBody,
            },
          },
        },
      },
    }, {
      domainId: 'medautoscience',
      studyId: 'DM003',
      compactTimeline: true,
    });
    const item = projection.compact_timeline?.[0] as Record<string, any>;
    const compactReadiness = item.current_provider_readiness;
    const operatorReadiness = item.operator_summary.provider_readiness;
    const compactJson = JSON.stringify(projection.compact_timeline);

    assert.equal(projection.summary.filtered_total, 1);
    assert.equal(compactReadiness.surface_kind, 'stage_attempt_current_provider_readiness_compact_ref');
    assert.equal(compactReadiness.provider_kind, 'temporal');
    assert.equal(compactReadiness.details, undefined);
    assert.equal(compactReadiness.managed_temporal_state_consistency, undefined);
    assert.equal(compactReadiness.mas_managed_provider_projection, undefined);
    assert.equal(operatorReadiness.provider_kind, 'temporal');
    assert.equal(operatorReadiness.provider_ready, false);
    assert.equal(operatorReadiness.details, undefined);
    assert.equal(compactJson.includes(heavyBody), false);
    assert.equal(compactJson.includes('provider_readiness_heavy_body'), false);
    assert.equal(compactJson.includes('transcript_body'), false);
    assert.equal(compactJson.length < 30_000, true);
  } finally {
    db.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list compact timeline caps progress evidence refs', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-bounded-refs-'));
  const db = new DatabaseSync(path.join(stateRoot, 'queue.sqlite'));
  try {
    createFamilyRuntimeQueueTables(db);
    createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'review',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: '/tmp/mas',
        study_id: 'DM003',
      },
      closeoutRefs: Array.from({ length: 12 }, (_, index) => `closeout:${index}`),
    });
    const output = await listStageAttemptsWithMonitoringProjection(db, { root: stateRoot }, {}, {
      domainId: 'medautoscience',
      studyId: 'DM003',
      compactTimeline: true,
    });
    const item = output.compact_timeline?.[0] as Record<string, any>;

    assert.equal(item.evidence_refs.closeout_refs.refs.length, 5);
    assert.equal(item.evidence_refs.closeout_refs.total_count, 12);
    assert.equal(item.evidence_refs.closeout_refs.omitted_count, 7);
    assert.deepEqual(item.operator_summary.closeout_refs, item.evidence_refs.closeout_refs.refs);
    assert.equal(item.operator_summary.closeout_ref_count, 12);
  } finally {
    db.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list compact timeline returns latest bounded page', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-bounded-page-'));
  const db = new DatabaseSync(path.join(stateRoot, 'queue.sqlite'));
  try {
    createFamilyRuntimeQueueTables(db);
    for (let index = 0; index < 55; index += 1) {
      createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: `review-${String(index).padStart(2, '0')}`,
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: '/tmp/mas',
          study_id: 'DM003',
        },
      });
    }
    const output = await listStageAttemptsWithMonitoringProjection(db, { root: stateRoot }, {}, {
      domainId: 'medautoscience',
      studyId: 'DM003',
      compactTimeline: true,
    });

    assert.equal(output.summary.filtered_total, 55);
    assert.equal(output.summary.compact_timeline_returned_total, 25);
    assert.equal(output.summary.compact_timeline_omitted_total, 30);
    assert.equal(output.summary.compact_timeline_limit, 25);
    assert.equal(output.compact_timeline?.length, 25);
  } finally {
    db.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt list matches study identity aliases from task payload and workspace locator', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-study-alias-'));
  try {
    const medTask = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'stage/review',
      payload: {
        target_studies: ['study-canonical-002'],
        study_aliases: ['mortality-risk-review'],
        quest_id: 'quest-study-002',
      },
      dedupeKey: 'mas:study-canonical-002:stage:review',
    });
    const medAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas-study-alias',
        study_short_id: 'short-study-002',
        study_aliases: ['workspace-alias-002'],
      }),
      '--task',
      medTask.task_id,
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag","target_studies":["grant-canonical-001"]}',
    ], familyRuntimeEnv(stateRoot));

    const canonicalOutput = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'study-canonical-002',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;
    const aliasOutput = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'workspace-alias-002',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;
    const questOutput = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'quest-study-002',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;
    const missingOutput = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'missing-study',
      '--compact-timeline',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempts;

    assert.equal(canonicalOutput.summary.filtered_total, 1);
    assert.equal(aliasOutput.summary.filtered_total, 1);
    assert.equal(questOutput.summary.filtered_total, 1);
    assert.equal(missingOutput.summary.filtered_total, 0);
    assert.equal(canonicalOutput.compact_timeline[0].stage_attempt_id, medAttempt.stage_attempt_id);
    assert.equal(aliasOutput.compact_timeline[0].stage_attempt_id, medAttempt.stage_attempt_id);
    assert.equal(questOutput.compact_timeline[0].stage_attempt_id, medAttempt.stage_attempt_id);
    assert.equal(canonicalOutput.compact_timeline[0].study_id, 'study-canonical-002');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
