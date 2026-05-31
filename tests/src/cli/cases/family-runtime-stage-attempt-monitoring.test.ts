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
    assert.equal(typeof output.compact_timeline[0].timeline.activity_event_count, 'number');
    assert.equal(output.compact_timeline[0].authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
