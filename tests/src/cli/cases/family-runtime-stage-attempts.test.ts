import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return { OPL_STATE_DIR: stateRoot };
}

test('family-runtime attempt query exposes a blocked public envelope', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-blocked-envelope-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'closeout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:blocked-closeout',
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt_query.stage_attempt_query;

    assert.equal(query.canonical_outcome, 'blocked');
    assert.ok(
      query.conflict_or_blocker_envelopes.some(
        (envelope: { classification: string; reason: string }) =>
          envelope.classification === 'evidence_blocker'
          && envelope.reason === 'typed_closeout_packet_required',
      ),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt readback preserves provider lifecycle without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-no-authority-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:analysis',
    ], familyRuntimeEnv(stateRoot));
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt_query;

    assert.equal(query.stage_attempt_query.workflow_contract.provider_kind, 'temporal');
    assert.equal(query.temporal_query.status, 'unavailable');
    assert.equal(
      query.stage_attempt_query.completion_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(created.family_runtime_stage_attempt.launch_invocation.authority_boundary.can_execute_stage, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
