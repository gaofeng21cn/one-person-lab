import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createFakeCodexFixture } from './cli/helpers.ts';
import {
  buildCodexStageActivityInput,
  runCodexStageRunner,
} from '../../src/family-runtime-codex-stage-runner.ts';
import { FrameworkContractError } from '../../src/contracts.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttemptCloseouts,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/family-runtime-stage-attempts.ts';

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

test('Codex stage activity command preview carries strict terminal closeout contract', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_codex_prompt_contract_test',
      stage_id: 'domain_owner/default-executor-dispatch',
      executor_kind: 'codex_cli',
      workspace_locator: {
        workspace_root: '/tmp/mas',
      },
      checkpoint_refs: ['packet:from-checkpoint'],
    },
  });

  const commandPreview = activity.runner_status.command_preview.join('\n');
  assert.match(commandPreview, /last non-empty assistant message MUST be exactly one JSON object and nothing else/);
  assert.match(commandPreview, /Do not wrap the JSON in Markdown/);
  assert.match(commandPreview, /Do not add prose, code fences, prefixes, suffixes/);
  assert.equal(activity.expected_closeout.typed_packet_required_for_completion, true);
  assert.equal(activity.expected_closeout.free_text_closeout_accepted, false);
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

test('Codex stage runner rejects terminal prose-prefixed closeout JSON', async () => {
  const closeout = {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: ['receipt:codex-prose-prefixed-closeout'],
    consumed_refs: ['runtime:quality-repair'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_progress_delta_candidate',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-prose-prefixed-closeout"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'agent_message',
      id: 'msg-1',
      text: `closeout follows:\n${JSON.stringify(closeout)}`,
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
        stage_attempt_id: 'sat_prose_prefixed_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:prose-prefixed-closeout'],
      },
      stagePacketRef: 'packet:prose-prefixed-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet, null);
    assert.equal(receipt.runner_status.typed_closeout_required_for_completion, true);
    assert.equal(receipt.runner_status.free_text_closeout_accepted, false);
    const processOutputSummary = receipt.process_output_summary;
    assert.ok(processOutputSummary, 'codex_cli runner receipt must include process_output_summary.');
    assert.equal(processOutputSummary.final_message_chars > JSON.stringify(closeout).length, true);
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

test('Codex stage runner captures terminal typed closeout from event_msg payload agent messages', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-event-message-closeout'],
    consumed_refs: ['paper:draft.md', 'paper/build/review_manuscript.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-22T07:31:05.991Z","type":"session_meta","payload":{"id":"thread-event-message-closeout"}}\\n'
  printf '{"timestamp":"2026-05-22T07:31:30.363Z","type":"event_msg","payload":{"type":"agent_message","message":"progress checkpoint","phase":"commentary"}}\\n'
  printf '%s\\n' '${JSON.stringify({
    timestamp: '2026-05-22T07:41:18.326Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: JSON.stringify(closeout),
      phase: 'final_answer',
    },
  })}'
  printf '{"timestamp":"2026-05-22T07:41:18.380Z","type":"event_msg","payload":{"type":"task_complete","last_agent_message":%s}}\\n' '${JSON.stringify(JSON.stringify(closeout))}'
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
        stage_attempt_id: 'sat_event_message_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:event-message-closeout'],
      },
      stagePacketRef: 'packet:event-message-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-event-message-closeout']);
    assert.deepEqual(receipt.closeout_packet?.consumed_refs, [
      'paper:draft.md',
      'paper/build/review_manuscript.md',
    ]);
    assert.equal(receipt.progress_summary.thread_id, 'thread-event-message-closeout');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner recovers terminal typed closeout from matching Codex session JSONL', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-session-recovered-closeout'],
    consumed_refs: ['paper/draft.md', 'paper/build/review_manuscript.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const threadId = 'thread-session-recovered-closeout';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-22T08:11:49.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '22');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-22T16-11-49-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-05-22T08:11:49.000Z',
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      timestamp: '2026-05-22T08:11:49.381Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(closeout) }],
        phase: 'final_answer',
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-22T08:11:49.391Z',
      type: 'event_msg',
      payload: {
        type: 'task_complete',
        last_agent_message: JSON.stringify(closeout),
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_recovered_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-recovered-closeout'],
      },
      stagePacketRef: 'packet:session-recovered-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-session-recovered-closeout']);
    assert.deepEqual(receipt.closeout_packet?.consumed_refs, closeout.consumed_refs);
    assert.equal(receipt.process_output_summary?.final_message_chars, 0);
    assert.equal(receipt.process_output_summary?.recovered_session_path, sessionPath);
    assert.equal((receipt.process_output_summary?.recovered_final_message_chars ?? 0) > 0, true);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
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

test('Temporal blocked terminal observation blocks MAS default executor task without typed closeout', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    db.exec(`
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        task_kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        dedupe_key TEXT UNIQUE,
        priority INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        source TEXT NOT NULL,
        requires_approval INTEGER NOT NULL,
        approved_at TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error TEXT,
        dead_letter_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE events (
        event_id TEXT PRIMARY KEY,
        task_id TEXT,
        domain_id TEXT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE notifications (
        notification_id TEXT PRIMARY KEY,
        task_id TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO tasks(
        task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts,
        max_attempts, source, requires_approval, approved_at, lease_owner, lease_expires_at,
        last_error, dead_letter_reason, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'task-mas-default-closeout-required',
      'medautoscience',
      'domain_owner/default-executor-dispatch',
      '{}',
      null,
      0,
      'succeeded',
      1,
      3,
      'test',
      0,
      null,
      null,
      null,
      null,
      null,
      createdAt,
      createdAt,
    );
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:mas-default-dispatch',
      executorKind: 'codex_cli',
      taskId: 'task-mas-default-closeout-required',
      checkpointRefs: ['dispatch:mas-default-writer-start'],
    });
    const attempt = created.attempt;
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        status: 'blocked',
        started_at: createdAt,
        updated_at: createdAt,
        activity_events: [],
        checkpoint_refs: ['checkpoint:mas-default-writer-start'],
        closeout_refs: [],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: 'med-autoscience',
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: { blocked_reason: 'typed_closeout_packet_required' },
        completion_boundary: {
          provider_completion: 'not_completed',
          domain_ready_verdict: null,
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-closeout-required',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-closeout-required',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'blocked');
    assert.equal(synced?.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'blocked');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'typed_closeout_packet_required');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_not_completed');
    assert.equal(event.event_type, 'stage_attempt_terminal_blocked_task');
    assert.equal(JSON.parse(event.payload_json).authority_boundary.provider_completion_is_domain_ready, false);
  });
});

test('Temporal blocked terminal observation refreshes stale MAS default executor blocked reason', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    db.exec(`
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        task_kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        dedupe_key TEXT UNIQUE,
        priority INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        source TEXT NOT NULL,
        requires_approval INTEGER NOT NULL,
        approved_at TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error TEXT,
        dead_letter_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE events (
        event_id TEXT PRIMARY KEY,
        task_id TEXT,
        domain_id TEXT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE notifications (
        notification_id TEXT PRIMARY KEY,
        task_id TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO tasks(
        task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts,
        max_attempts, source, requires_approval, approved_at, lease_owner, lease_expires_at,
        last_error, dead_letter_reason, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'task-mas-default-stale-blocked-reason',
      'medautoscience',
      'domain_owner/default-executor-dispatch',
      '{}',
      null,
      0,
      'blocked',
      1,
      3,
      'test',
      0,
      null,
      null,
      null,
      'MAS default executor dispatch has no launchable Temporal Codex stage attempt.',
      'temporal_stage_attempt_start_failed',
      createdAt,
      createdAt,
    );
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:mas-default-dispatch',
      executorKind: 'codex_cli',
      taskId: 'task-mas-default-stale-blocked-reason',
      checkpointRefs: ['dispatch:mas-default-writer-start'],
    });
    const attempt = created.attempt;
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        status: 'blocked',
        started_at: createdAt,
        updated_at: createdAt,
        activity_events: [],
        checkpoint_refs: ['checkpoint:mas-default-writer-start'],
        closeout_refs: [],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: 'med-autoscience',
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: { blocked_reason: 'typed_closeout_packet_required' },
        completion_boundary: {
          provider_completion: 'not_completed',
          domain_ready_verdict: null,
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-stale-blocked-reason',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-stale-blocked-reason',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'blocked');
    assert.equal(synced?.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'typed_closeout_packet_required');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_not_completed');
    assert.equal(event.event_type, 'stage_attempt_terminal_blocked_task');
    assert.equal(JSON.parse(event.payload_json).task_dead_letter_reason, 'temporal_stage_attempt_not_completed');
  });
});

test('Temporal completed terminal observation ingests closeout refs into local attempt ledger', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:mas-default-completed-dispatch',
      executorKind: 'codex_cli',
      checkpointRefs: ['dispatch:mas-default-writer-start'],
    });
    const attempt = created.attempt;
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        status: 'completed',
        started_at: createdAt,
        updated_at: createdAt,
        activity_events: [
          {
            activity_kind: 'codex_stage_activity',
            activity_status: 'completed',
            closeout_packet: {
              surface_kind: 'domain_stage_closeout_packet',
              closeout_refs: [
                'raw-codex-closeout-should-not-be-authoritative.json',
              ],
              consumed_refs: ['dispatch:mas-default-writer-start'],
              writeback_receipt_refs: ['receipt:writer-handoff'],
              next_owner: 'medautoscience',
              domain_ready_verdict: 'domain_gate_pending',
            },
          },
        ],
        checkpoint_refs: ['dispatch:mas-default-writer-start'],
        closeout_refs: [
          'artifacts/supervision/reconcile/latest.json',
          'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
        ],
        consumed_refs: ['dispatch:mas-default-writer-start'],
        consumed_memory_refs: [],
        writeback_receipt_refs: ['receipt:writer-handoff'],
        rejected_writes: [],
        next_owner: 'medautoscience',
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: {
          surface_kind: 'temporal_domain_sidecar_dispatch_receipt',
          closeout_packet_surface_kind: 'domain_stage_closeout_packet',
          closeout_refs: [
            'artifacts/supervision/reconcile/latest.json',
            'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
          ],
        },
        completion_boundary: {
          provider_completion: 'completed',
          domain_ready_verdict: 'domain_gate_pending',
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);

    assert.equal(synced?.status, 'completed');
    assert.equal(inspected.closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(inspected.closeout_refs, [
      'artifacts/supervision/reconcile/latest.json',
      'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
    ]);
    assert.equal(inspected.provider_run.provider_status, 'completed');
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 1);
  });
});
