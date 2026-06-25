import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture, shellSingleQuote } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';

test('Codex stage runner ignores invalid timeout env values', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-timeout-default"}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousTimeout = process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS = 'not-a-number';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_timeout_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
    });

    assert.equal(receipt.runner_status.timeout_ms, 3_600_000);
    assert.equal(receipt.runner_status.exit_code, 0);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousTimeout === undefined) {
      delete process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS = previousTimeout;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner records timeout and process output summary when live process exceeds budget', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-timeout"}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_timeout_budget_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:timeout-seed'],
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
      observedAt: '2026-05-11T00:00:00.000Z',
      timeoutMs: 100,
    });

    assert.equal(receipt.runner_status.live_process_started, true);
    assert.equal(receipt.runner_status.exit_code, 124);
    assert.equal(receipt.runner_status.timeout_ms, 100);
    assert.equal(receipt.heartbeat_summary.checkpoint_refs[0], 'checkpoint:timeout-seed');
    const processOutputSummary = receipt.process_output_summary;
    if (!processOutputSummary) {
      throw new Error('codex_cli timeout receipt must include process_output_summary.');
    }
    assert.equal(processOutputSummary.exit_code, 124);
    assert.ok(processOutputSummary.stderr_tail.includes('Codex command timed out.'));
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner classifies upstream provider errors before closeout materialization as provider unavailable', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-provider-502"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '{"type":"error","message":"Reconnecting... 1/5 (unexpected status 502 Bad Gateway: Upstream request failed, url: https://gflabtoken.cn/v1/responses, request id: req-provider-502)"}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousCloseoutEnforcementTimeout = process.env.OPL_CODEX_CLOSEOUT_ENFORCEMENT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    process.env.OPL_CODEX_CLOSEOUT_ENFORCEMENT_TIMEOUT_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_provider_502_test',
        stage_id: 'analysis-campaign',
        domain_id: 'medautoscience',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:provider-502'],
      },
      stagePacketRef: 'packet:provider-502',
      runnerMode: 'codex_cli',
      observedAt: '2026-06-25T00:00:00.000Z',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 500,
    });

    assert.equal(receipt.process_output_summary?.timeout_reason, 'provider_unavailable');
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_provider_unavailable');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_provider_502_test/runtime-blockers/codex_cli_provider_unavailable',
    ]);
    assert.equal(receipt.closeout_packet?.route_impact?.provider_error_count, 1);
    assert.deepEqual(receipt.closeout_packet?.route_impact?.provider_error_status_codes, [502]);
    assert.equal(receipt.process_output_summary?.provider_error_status_codes?.[0], 502);
    assert.equal(receipt.closeout_packet?.authority_boundary?.provider_completion_is_domain_ready, false);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousRecoveryTimeout === undefined) {
      delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    }
    if (previousCloseoutEnforcementTimeout === undefined) {
      delete process.env.OPL_CODEX_CLOSEOUT_ENFORCEMENT_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_CLOSEOUT_ENFORCEMENT_TIMEOUT_MS = previousCloseoutEnforcementTimeout;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner stops the live Codex process when Temporal activity cancellation aborts the run', async () => {
  const childPidPath = path.join(os.tmpdir(), `opl-codex-cancelled-child-${Date.now()}.txt`);
  const waitForChildPidFile = async () => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (fs.existsSync(childPidPath)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('fake Codex child pid was not recorded before cancellation.');
  };
  const waitForPidExit = async (pid: number) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`cancelled Codex child process ${pid} was still alive after cancellation.`);
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  sleep 30 &
  child_pid=$!
  printf '%s' "$child_pid" > ${shellSingleQuote(childPidPath)}
  printf '{"type":"thread.started","thread_id":"thread-activity-cancelled"}\\n'
  wait "$child_pid"
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const controller = new AbortController();
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    const cancelWhenChildStarts = waitForChildPidFile().then(() => controller.abort());
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_activity_cancelled_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:activity-cancelled'],
      },
      stagePacketRef: 'packet:activity-cancelled',
      runnerMode: 'codex_cli',
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    await cancelWhenChildStarts;

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_activity_cancelled_test/runtime-blockers/codex_cli_activity_cancelled',
    ]);
    assert.equal(receipt.closeout_packet?.authority_boundary?.provider_completion_is_domain_ready, false);
    assert.equal(receipt.runner_status.exit_code, 130);
    assert.equal(receipt.process_output_summary?.timeout_reason, 'activity_cancelled');
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_activity_cancelled');
    const childPid = Number.parseInt(fs.readFileSync(childPidPath, 'utf8'), 10);
    assert.equal(Number.isFinite(childPid), true);
    await waitForPidExit(childPid);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousRecoveryTimeout === undefined) {
      delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    }
    fs.rmSync(childPidPath, { force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
