import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createFakeCodexFixture } from './cli/helpers.ts';
import {
  buildCodexStageActivityInput,
  runAgentStageRunner,
  runCodexStageRunner,
} from '../../src/family-runtime-codex-stage-runner.ts';
import type { AgentExecutionReceipt } from '../../src/agent-executor.ts';
import { FrameworkContractError } from '../../src/contracts.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttemptCloseouts,
} from '../../src/family-runtime-stage-attempts.ts';

type AgentStageRunnerReceipt = {
  runner_status: {
    runner_kind: 'agent_executor_stage_runner';
    executor_kind: string;
    typed_closeout_required_for_completion: boolean;
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

test('Codex stage activity binds stage packet from checkpoint refs before provider execution', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_stage_packet_binding_test',
      stage_id: 'domain_owner/default-executor-dispatch',
      workspace_locator: {
        workspace_root: '/tmp/mas',
      },
      checkpoint_refs: ['packet:from-checkpoint'],
    },
  });

  assert.equal(activity.stage_packet_ref, 'packet:from-checkpoint');
  assert.equal(activity.stage_packet_binding.binding_status, 'bound');
  assert.equal(activity.stage_packet_binding.workspace_root, '/tmp/mas');
  assert.equal(activity.stage_packet_binding.can_claim_domain_ready, false);
  assert.equal(activity.progress_summary.stage_packet_ref, 'packet:from-checkpoint');
});

test('Codex stage activity projection keeps Codex CLI attempts live by default', () => {
  const previousMode = process.env.OPL_CODEX_STAGE_RUNNER_MODE;
  try {
    delete process.env.OPL_CODEX_STAGE_RUNNER_MODE;
    const activity = buildCodexStageActivityInput({
      attempt: {
        stage_attempt_id: 'sat_codex_projection_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: '/tmp/mas',
        },
        checkpoint_refs: ['packet:from-checkpoint'],
      },
    });

    assert.equal(activity.runner_status.runner_mode, 'codex_cli');
    assert.equal(activity.runner_status.dry_run_transport, false);
  } finally {
    if (previousMode === undefined) {
      delete process.env.OPL_CODEX_STAGE_RUNNER_MODE;
    } else {
      process.env.OPL_CODEX_STAGE_RUNNER_MODE = previousMode;
    }
  }
});

test('Codex stage runner fails closed when live runner lacks packet or workspace binding', async () => {
  await assert.rejects(
    () => runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_missing_packet_binding_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: '/tmp/mas',
        },
      },
      runnerMode: 'codex_cli',
    }),
    (error) => error instanceof FrameworkContractError
      && error.code === 'contract_shape_invalid'
      && error.details?.blocked_reason === 'codex_cli_stage_packet_ref_missing',
  );

  await assert.rejects(
    () => runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_missing_workspace_binding_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {},
        checkpoint_refs: ['packet:from-checkpoint'],
      },
      runnerMode: 'codex_cli',
    }),
    (error) => error instanceof FrameworkContractError
      && error.code === 'contract_shape_invalid'
      && error.details?.blocked_reason === 'codex_cli_workspace_root_missing',
  );
});

test('Codex stage runner supervises a live Codex CLI process without accepting free-text completion', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-live-runner"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"analysis checkpoint only"}}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:seed'],
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
      observedAt: '2026-05-11T00:00:00.000Z',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.runner_status.runner_mode, 'codex_cli');
    assert.equal(receipt.runner_status.live_process_started, true);
    assert.equal(receipt.runner_status.dry_run_transport, false);
    assert.equal(receipt.runner_status.exit_code, 0);
    assert.equal(receipt.runner_status.typed_closeout_required_for_completion, true);
    assert.equal(receipt.runner_status.free_text_closeout_accepted, false);
    assert.equal(receipt.progress_summary.thread_id, 'thread-live-runner');
    assert.deepEqual(receipt.heartbeat_summary.checkpoint_refs, ['checkpoint:seed']);
    const processOutputSummary = receipt.process_output_summary;
    if (!processOutputSummary) {
      throw new Error('codex_cli runner receipt must include process_output_summary.');
    }
    assert.equal(processOutputSummary.exit_code, 0);
    assert.equal(processOutputSummary.final_message_chars > 0, true);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner captures a terminal typed closeout packet from agent output', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-terminal-closeout'],
    consumed_refs: ['paper:draft.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-live-closeout"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"progress checkpoint"}}\\n'
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-2', text: JSON.stringify(closeout) } })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:closeout'],
      },
      stagePacketRef: 'packet:closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-terminal-closeout']);
    assert.deepEqual(receipt.closeout_packet?.consumed_refs, ['paper:draft.md']);
    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner captures terminal typed closeout from assistant message events', async () => {
  const closeout = {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: ['receipt:codex-message-closeout'],
    consumed_refs: ['runtime:quality-repair'],
    writeback_receipt_refs: ['memory:quality-repair-closeout'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_progress_delta_candidate',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-message-closeout"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"progress checkpoint"}}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'message',
      id: 'msg-2',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(closeout) }],
    },
  })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_message_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:message-closeout'],
      },
      stagePacketRef: 'packet:message-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'domain_stage_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-message-closeout']);
    assert.deepEqual(receipt.closeout_packet?.writeback_receipt_refs, ['memory:quality-repair-closeout']);
    assert.equal(receipt.progress_summary.thread_id, 'thread-message-closeout');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner ignores non-terminal typed closeout-shaped progress text', async () => {
  const earlyCloseout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:not-terminal'],
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-nonterminal-closeout"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-1', text: JSON.stringify(earlyCloseout) } })}'
  printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-2","text":"final prose is not a closeout"}}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_nonterminal_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:nonterminal-closeout'],
      },
      stagePacketRef: 'packet:nonterminal-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet, null);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
    assert.equal(agentReceipt.runner_status.typed_closeout_required_for_completion, true);
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
    const receipt = await runCodexStageRunner({
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
    const receipt = await runCodexStageRunner({
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

function withStageAttemptDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    fn(db);
  } finally {
    db.close();
  }
}

test('stage attempt closeout ledger is idempotent and fails closed on conflicting closeout ids', () => {
  withStageAttemptDb((db) => {
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'review',
      providerKind: 'local_sqlite',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:review',
    });
    const attemptId = created.attempt.stage_attempt_id;
    const accepted = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_id: 'closeout:review-final',
        closeout_refs: ['receipt:review-final'],
        consumed_refs: ['evidence:review-ledger'],
        writeback_receipt_refs: ['memory-writeback:review'],
        rejected_writes: [{ reason: 'domain_router_rejected' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: { route: 'review' },
      },
    });
    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_id: 'closeout:review-final',
        closeout_refs: ['receipt:review-final'],
        consumed_refs: ['evidence:review-ledger'],
        writeback_receipt_refs: ['memory-writeback:review'],
        rejected_writes: [{ reason: 'domain_router_rejected' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: { route: 'review' },
      },
    });

    assert.equal(accepted.closeout.idempotent_noop, false);
    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
    assert.equal(inspectStageAttempt(db, attemptId).activity_events.length, 1);

    assert.throws(
      () => ingestStageAttemptCloseout(db, {
        stageAttemptId: attemptId,
        packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_id: 'closeout:review-final',
          closeout_refs: ['receipt:poisoned-review-final'],
          consumed_refs: ['evidence:poisoned'],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
        },
      }),
      (error) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_shape_invalid');
        assert.ok(error.details);
        assert.equal(error.details.closeout_id, 'closeout:review-final');
        assert.equal(
          (error.details.receipt_conflict as Record<string, unknown>).classification,
          'receipt_conflict',
        );
        assert.equal(
          (error.details.receipt_conflict as Record<string, unknown>).fail_closed,
          true,
        );
        return true;
      },
    );

    const attemptAfterConflict = inspectStageAttempt(db, attemptId);
    assert.deepEqual(attemptAfterConflict.closeout_refs, ['receipt:review-final']);
    assert.equal(attemptAfterConflict.activity_events.length, 1);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
  });
});
