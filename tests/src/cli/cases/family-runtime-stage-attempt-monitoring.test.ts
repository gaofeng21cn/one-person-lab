import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime attempt list filters attempts and emits compact Progress-First timeline', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-monitoring-'));
  try {
    const medTask = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'stage/scout',
      '--payload',
      '{"study_id":"DM002"}',
      '--dedupe-key',
      'mas:DM002:stage:scout',
    ], familyRuntimeEnv(stateRoot)).family_runtime_enqueue.task;
    const magTask = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage/scout',
      '--payload',
      '{"study_id":"GR001"}',
      '--dedupe-key',
      'mag:GR001:stage:scout',
    ], familyRuntimeEnv(stateRoot)).family_runtime_enqueue.task;
    const medAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'local_sqlite',
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
      'local_sqlite',
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
    assert.equal(output.summary.by_status.blocked, 1);
    assert.equal(output.filters.domain_id, 'medautoscience');
    assert.equal(output.filters.study_id, 'DM002');
    assert.equal(output.filters.status, 'blocked');
    assert.equal(output.filters.compact_timeline, true);
    assert.equal(output.attempts, undefined);
    assert.equal(output.compact_timeline.length, 1);
    assert.equal(output.compact_timeline[0].stage_attempt_id, medAttempt.stage_attempt_id);
    assert.equal(output.compact_timeline[0].study_id, 'DM002');
    assert.equal(output.compact_timeline[0].semantic_status, 'missing_domain_semantic_summary');
    assert.equal(output.compact_timeline[0].progress_delta_classification, 'typed_blocker');
    assert.equal(output.compact_timeline[0].timeline.last_heartbeat_at, null);
    assert.equal(output.compact_timeline[0].current_provider_readiness.provider_kind, 'local_sqlite');
    assert.equal(output.compact_timeline[0].current_provider_readiness.provider_ready, true);
    assert.equal(output.compact_timeline[0].provider_liveness_attention.attention_status, 'none');
    assert.equal(output.compact_timeline[0].provider_liveness_attention.severity, 'none');
    assert.equal(
      output.compact_timeline[0].provider_liveness_attention.progress_first_effect,
      'provider_live_continue_with_stage_progress_evidence',
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
    assert.equal(output.compact_timeline[0].operator_summary.started_at, null);
    assert.equal(output.compact_timeline[0].operator_summary.completed_at, null);
    assert.equal(output.compact_timeline[0].operator_summary.last_heartbeat_at, null);
    assert.equal(output.compact_timeline[0].operator_summary.current_provider_readiness.provider_ready, true);
    assert.equal(output.compact_timeline[0].operator_summary.provider_liveness_attention.attention_status, 'none');
    assert.equal(
      output.compact_timeline[0].operator_summary
        .provider_readiness_currentness.provider_receipt_is_current_readiness,
      false,
    );
    assert.equal(output.compact_timeline[0].operator_summary.progress_delta_classification, 'typed_blocker');
    assert.deepEqual(output.compact_timeline[0].operator_summary.closeout_refs, []);
    assert.equal(
      output.compact_timeline[0].operator_summary.semantic_gap.reason,
      'domain_closeout_did_not_provide_user_stage_log',
    );
    assert.equal(
      output.compact_timeline[0].operator_summary.next_inspection_hint.expected_next_delta,
      'domain_user_stage_log_or_typed_blocker_with_lineage_required',
    );
    assert.equal(
      output.compact_timeline[0].operator_summary.next_inspection_hint.authority_boundary.can_infer_domain_semantics,
      false,
    );
    assert.equal(typeof output.compact_timeline[0].timeline.activity_event_count, 'number');
    assert.equal(output.compact_timeline[0].authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
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

test('family-runtime attempt list matches study identity aliases from task payload and workspace locator', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-list-study-alias-'));
  try {
    const medTask = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'stage/review',
      '--payload',
      JSON.stringify({
        target_studies: ['study-canonical-002'],
        study_aliases: ['mortality-risk-review'],
        quest_id: 'quest-study-002',
      }),
      '--dedupe-key',
      'mas:study-canonical-002:stage:review',
    ], familyRuntimeEnv(stateRoot)).family_runtime_enqueue.task;
    const medAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
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
      'local_sqlite',
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
