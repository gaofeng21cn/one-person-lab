import {
  assert,
  fs,
  insertFamilyRuntimeTaskProjectionFixture,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('family-runtime compact timeline exposes filtered public currentness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-monitoring-'));
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
  };
  try {
    const task = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'stage/scout',
      payload: { study_id: 'DM002' },
      dedupeKey: 'mas:DM002:stage:scout',
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
      '{"workspace_root":"/tmp/mas"}',
      '--task',
      task.task_id,
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], env).family_runtime_stage_attempt.attempt;
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
      '--compact-timeline',
    ], env).family_runtime_stage_attempts;
    const item = output.compact_timeline[0];

    assert.equal(output.view_mode, 'compact_timeline');
    assert.equal(output.summary.filtered_total, 1);
    assert.equal(item.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(item.current_provider_readiness.provider_ready, false);
    assert.equal(item.provider_liveness_attention.attention_status, 'blocked_provider_not_ready');
    assert.equal(
      item.provider_readiness_currentness.effective_provider_readiness_source,
      'current_provider_readiness',
    );
    assert.equal(item.provider_readiness_currentness.provider_receipt_is_current_readiness, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
