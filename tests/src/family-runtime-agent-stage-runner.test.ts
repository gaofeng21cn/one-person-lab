import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import {
  runAgentStageRunner,
} from '../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import type { AgentExecutionReceipt } from '../../src/modules/runway/agent-executor.ts';
import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';

type AgentStageRunnerReceipt = {
  runner_status: {
    runner_kind: 'agent_executor_stage_runner';
    executor_kind: string;
    typed_closeout_required_for_progress: false;
    raw_artifact_sufficient_for_progress: true;
  };
  agent_execution_receipt: AgentExecutionReceipt;
};

function requireAgentStageRunnerReceipt(receipt: Awaited<ReturnType<typeof runAgentStageRunner>>) {
  assert.equal(receipt.runner_status.runner_kind, 'agent_executor_stage_runner');
  assert.ok('agent_execution_receipt' in receipt, 'agent stage runner receipt must include executor receipt.');
  return receipt as AgentStageRunnerReceipt;
}

function requireCloseoutRefs(receipt: AgentExecutionReceipt) {
  const closeoutRefs = receipt.closeout_packet?.closeout_refs;
  assert.ok(Array.isArray(closeoutRefs), 'agent execution receipt must include closeout refs.');
  return closeoutRefs;
}

test('agent stage runner records a selected non-default executor receipt without Codex fallback', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-claude-stage-runner-'));
  const claudePath = path.join(fixtureRoot, 'claude');
  fs.writeFileSync(
    claudePath,
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:stage-claude"]}\\n\'\n',
    { mode: 0o755 },
  );
  try {
    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_claude_runner_test',
        stage_id: 'analysis-campaign',
        executor_kind: 'claude_code',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'claude_code',
      env: {
        OPL_CLAUDE_CODE_BIN: claudePath,
        PATH: '',
      },
    });

    const agentReceipt = requireAgentStageRunnerReceipt(receipt);
    assert.equal(agentReceipt.runner_status.executor_kind, 'claude_code');
    assert.equal(agentReceipt.agent_execution_receipt.executor_kind, 'claude_code');
    assert.equal(requireCloseoutRefs(agentReceipt.agent_execution_receipt)[0], 'receipt:stage-claude');
    assert.equal(agentReceipt.runner_status.typed_closeout_required_for_progress, false);
    assert.equal(agentReceipt.runner_status.raw_artifact_sufficient_for_progress, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent stage runner treats selected Codex CLI executor as live Codex runner by default', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-default-codex-runner"}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_default_codex_runner_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:default-codex'],
      },
      stagePacketRef: 'packet:default-codex',
      observedAt: '2026-05-22T00:00:00.000Z',
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.equal(receipt.runner_status.runner_kind, 'codex_cli_stage_runner');
    assert.equal(receipt.runner_status.runner_mode, 'codex_cli');
    assert.equal(receipt.runner_status.live_process_started, true);
    assert.equal(receipt.runner_status.dry_run_transport, false);
    assert.equal(receipt.runner_status.exit_code, 0);
    assert.equal(receipt.progress_summary.thread_id, 'thread-default-codex-runner');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent stage runner applies stage-level executor policy for Antigravity HTML routes', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-antigravity-stage-runner-'));
  const antigravityPath = path.join(fixtureRoot, 'antigravity');
  fs.writeFileSync(
    antigravityPath,
    [
      '#!/bin/sh',
      'printf \'model=%s\\n\' "$2"',
      'printf \'reasoning=%s\\n\' "$3"',
      'printf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:stage-antigravity-html"]}\\n\'',
    ].join('\n'),
    { mode: 0o755 },
  );
  try {
    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_antigravity_runner_test',
        stage_id: 'rca-html-route',
        stage_attempt_executor_policy: {
          executor_kind: 'antigravity_cli',
          model: 'gemini-3.5-flash',
          reasoning_effort: 'high',
          provider: 'google',
          executor_binding_ref: 'executor-binding:antigravity/rca-html-route',
        },
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
      },
      stagePacketRef: 'packet:rca-html',
      env: {
        OPL_ANTIGRAVITY_CLI_BIN: antigravityPath,
        PATH: '',
      },
    });

    const agentReceipt = requireAgentStageRunnerReceipt(receipt);
    assert.equal(agentReceipt.runner_status.executor_kind, 'antigravity_cli');
    assert.equal(agentReceipt.agent_execution_receipt.executor_kind, 'antigravity_cli');
    assert.equal(agentReceipt.agent_execution_receipt.stdout_preview.includes('model=gemini-3.5-flash'), true);
    assert.equal(agentReceipt.agent_execution_receipt.stdout_preview.includes('reasoning=high'), true);
    assert.equal(requireCloseoutRefs(agentReceipt.agent_execution_receipt)[0], 'receipt:stage-antigravity-html');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent stage runner blocks non-default stage policy without executor binding ref', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-antigravity-stage-runner-blocked-'));
  const antigravityPath = path.join(fixtureRoot, 'antigravity');
  fs.writeFileSync(
    antigravityPath,
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:should-not-run"]}\\n\'\n',
    { mode: 0o755 },
  );
  try {
    await assert.rejects(
      () => runAgentStageRunner({
        attempt: {
          stage_attempt_id: 'sat_antigravity_missing_binding_test',
          stage_id: 'rca-html-route',
          stage_attempt_executor_policy: {
            executor_kind: 'antigravity_cli',
            model: 'gemini-3.5-flash',
            reasoning_effort: 'high',
            provider: 'google',
          },
          workspace_locator: {
            workspace_root: fixtureRoot,
          },
        },
        stagePacketRef: 'packet:rca-html',
        env: {
          OPL_ANTIGRAVITY_CLI_BIN: antigravityPath,
          PATH: '',
        },
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid'
        && error.details?.executor_kind === 'antigravity_cli'
        && error.details?.policy_kind === 'stage_attempt_executor_policy',
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
