import { assert, fs, installRuntimePackageFixture, os, path, runCli, test } from '../helpers.ts';
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
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
      '--executor-kind',
      'codex_cli',
      '--source-fingerprint',
      'source:artifact-owner-current',
      '--checkpoint-ref',
      'packets/artifact-owner.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;

    const input = buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt);

    assert.equal(input.stage_packet_ref, 'packets/artifact-owner.json');
    assert.equal(input.codex_stage_runner?.runner_mode, 'codex_cli');
    assert.equal(input.workspace_locator.workspace_root, '/tmp/redcube-runtime');
    assert.equal(Object.hasOwn(input, 'opl_execution_authorization'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime may transport a declared stage without source fingerprint format metadata', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-attempt-no-auth-'));
  try {
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
      '--executor-kind',
      'codex_cli',
      '--checkpoint-ref',
      'packets/artifact-owner.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;

    const input = buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt);
    assert.equal(input.source_fingerprint, null);
    assert.equal(input.stage_packet_ref, 'packets/artifact-owner.json');
    assert.equal(Object.hasOwn(input, 'opl_execution_authorization'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
