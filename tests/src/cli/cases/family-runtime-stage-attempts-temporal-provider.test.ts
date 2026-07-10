import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { buildTemporalStageAttemptWorkflowInput } from '../../../../src/modules/runway/family-runtime-temporal.ts';
import type {
  TemporalStageAttemptCreateOutput,
} from './family-runtime-stage-attempts-temporal-provider-fixtures.ts';

import './family-runtime-stage-attempts-temporal-provider-cases/current-provider-readiness.ts';
import './family-runtime-stage-attempts-temporal-provider-cases/local-ledger-fail-closed.ts';

function familyRuntimeEnv(stateRoot: string) {
  return { OPL_STATE_DIR: stateRoot };
}

test('family-runtime maps a Temporal attempt to provider launch input without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-attempt-input-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--executor-kind',
      'codex_cli',
      '--source-fingerprint',
      'truth-snapshot::dm002-dispatch',
      '--checkpoint-ref',
      'studies/002-dm/prompt.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;

    const input = buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt);

    assert.equal(input.stage_packet_ref, 'studies/002-dm/prompt.json');
    assert.equal(input.codex_stage_runner?.runner_mode, 'codex_cli');
    assert.equal(input.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.equal(input.opl_execution_authorization?.authority_boundary.opl_can_create_owner_receipt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not authorize Temporal launch without source fingerprint', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-attempt-no-auth-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--executor-kind',
      'codex_cli',
      '--checkpoint-ref',
      'studies/002-dm/prompt.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;

    assert.equal(
      buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt)
        .opl_execution_authorization,
      undefined,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
