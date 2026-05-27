import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { findPendingUnsupportedFunctionCalls } from '../../src/codex.ts';
import {
  buildCodexStageActivityInput,
  runCodexStageRunner,
} from '../../src/family-runtime-codex-stage-runner.ts';
import { FrameworkContractError } from '../../src/contracts.ts';

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

test('Codex stage runner reconstructs a terminal closeout split across adjacent final event chunks', async () => {
  const closeout = {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: ['receipt:codex-split-final-closeout'],
    consumed_refs: ['paper/draft.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'typed_blocker',
    route_impact: {
      next_owner: 'ai_reviewer',
    },
  };
  const closeoutText = JSON.stringify(closeout, null, 2);
  const splitIndex = closeoutText.indexOf('"consumed_refs"');
  const firstChunk = closeoutText.slice(0, splitIndex);
  const secondChunk = closeoutText.slice(splitIndex);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-22T08:03:50.000Z","type":"session_meta","payload":{"id":"thread-split-final-closeout"}}\\n'
  printf '%s\\n' '${JSON.stringify({
    timestamp: '2026-05-22T08:03:51.000Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: 'progress checkpoint',
      phase: 'commentary',
    },
  })}'
  printf '%s\\n' '${JSON.stringify({
    timestamp: '2026-05-22T08:03:52.000Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: firstChunk,
      phase: 'final_answer',
    },
  })}'
  printf '%s\\n' '${JSON.stringify({
    timestamp: '2026-05-22T08:03:52.100Z',
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: secondChunk,
      phase: 'final_answer',
    },
  })}'
  printf '{"timestamp":"2026-05-22T08:03:52.200Z","type":"event_msg","payload":{"type":"turn_completed"}}\\n'
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
        stage_attempt_id: 'sat_split_final_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:split-final-closeout'],
      },
      stagePacketRef: 'packet:split-final-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'domain_stage_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-split-final-closeout']);
    assert.equal(receipt.closeout_packet?.domain_ready_verdict, 'typed_blocker');
    assert.equal(receipt.process_output_summary?.final_message_chars, closeoutText.length + 19);
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

test('Codex stage runner waits briefly for delayed session JSONL closeout flush', async () => {
  const closeout = {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: ['receipt:codex-delayed-session-closeout'],
    consumed_refs: ['paper/draft.md', 'paper/build/review_manuscript.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'typed_blocker',
  };
  const threadId = 'thread-delayed-session-closeout';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-22T08:21:49.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousRecoveryInterval = process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '22');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-22T16-21-49-${threadId}.jsonl`);

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1000';
    process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = '25';
    const writeTimer = setTimeout(() => {
      fs.writeFileSync(sessionPath, [
        JSON.stringify({
          timestamp: '2026-05-22T08:21:49.000Z',
          type: 'session_meta',
          payload: { id: threadId },
        }),
        JSON.stringify({
          timestamp: '2026-05-22T08:21:49.391Z',
          type: 'event_msg',
          payload: {
            type: 'task_complete',
            last_agent_message: JSON.stringify(closeout),
          },
        }),
        '',
      ].join('\n'));
    }, 750);
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_delayed_session_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:delayed-session-closeout'],
      },
      stagePacketRef: 'packet:delayed-session-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });
    clearTimeout(writeTimer);

    assert.equal(receipt.closeout_packet?.surface_kind, 'domain_stage_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-delayed-session-closeout']);
    assert.equal(receipt.process_output_summary?.recovered_session_path, sessionPath);
    assert.equal(receipt.process_output_summary?.session_recovery_status, 'closeout_found');
    assert.equal((receipt.process_output_summary?.session_recovery_attempts ?? 0) > 1, true);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    previousRecoveryTimeout === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    previousRecoveryInterval === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = previousRecoveryInterval;
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

test('Codex stage runner fails closed when live process stops producing output', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-no-output"}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_no_output_budget_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:no-output-seed'],
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
      observedAt: '2026-05-11T00:00:00.000Z',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.runner_status.live_process_started, true);
    assert.equal(receipt.runner_status.exit_code, 124);
    assert.equal(receipt.runner_status.no_output_timeout_ms, 100);
    assert.equal(receipt.runner_status.timeout_ms, 10_000);
    assert.equal(receipt.heartbeat_summary.checkpoint_refs[0], 'checkpoint:no-output-seed');
    const processOutputSummary = receipt.process_output_summary;
    if (!processOutputSummary) {
      throw new Error('codex_cli no-output timeout receipt must include process_output_summary.');
    }
    assert.equal(processOutputSummary.exit_code, 124);
    assert.equal(processOutputSummary.timeout_reason, 'no_output_timeout');
    assert.equal(processOutputSummary.no_output_timeout_ms, 100);
    assert.ok(processOutputSummary.stderr_tail.includes('Codex command produced no output before the progress watchdog expired.'));
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousNoOutputTimeout === undefined) {
      delete process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = previousNoOutputTimeout;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner fails fast on unsupported native function calls', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"session_meta","payload":{"id":"thread-unsupported-function-call"}}\\n'
  printf '{"type":"event_msg","payload":{"type":"agent_message","message":"progress checkpoint","phase":"commentary"}}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"rtk sed -n 1,20p README.md"}',
      call_id: 'call_unsupported_tool_protocol',
    },
  })}'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const startedAt = Date.now();
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_unsupported_function_call_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:unsupported-function-call'],
      },
      stagePacketRef: 'packet:unsupported-function-call',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 10_000,
    });

    assert.equal(Date.now() - startedAt < 1_500, true);
    assert.equal(receipt.closeout_packet, null);
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_unsupported_function_call');
    assert.equal(receipt.process_output_summary?.timeout_reason, 'unsupported_tool_protocol');
    assert.equal(receipt.process_output_summary?.pending_function_call_count, 1);
    assert.deepEqual(receipt.process_output_summary?.function_call_names, ['exec_command']);
    assert.equal(
      receipt.progress_summary.runner_events.some((event) =>
        event.event_kind === 'unsupported_function_call'
          && event.value === 'exec_command'
      ),
      true,
    );
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner diagnoses unsupported function calls from recovered session on no-output timeout', async () => {
  const threadId = 'thread-session-unsupported-function-call';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '26');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-26T22-30-22-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: '{"cmd":"rtk cat README.md"}',
        call_id: 'call_from_session_only',
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_unsupported_function_call_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-unsupported-function-call'],
      },
      stagePacketRef: 'packet:session-unsupported-function-call',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 500,
    });

    assert.equal(receipt.process_output_summary?.timeout_reason, 'unsupported_tool_protocol');
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_unsupported_function_call');
    assert.equal(receipt.process_output_summary?.pending_function_call_count, 1);
    assert.deepEqual(receipt.process_output_summary?.function_call_names, ['exec_command']);
    assert.equal(
      receipt.process_output_summary?.unsupported_function_call_session_path,
      sessionPath,
    );
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    previousNoOutputTimeout === undefined
      ? delete process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS
      : process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = previousNoOutputTimeout;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex session recovery ignores function calls already resolved by Codex CLI outputs', () => {
  const output = [
    JSON.stringify({
      type: 'session_meta',
      payload: { id: 'thread-resolved-function-call' },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: '{"cmd":"rtk pwd"}',
        call_id: 'call_resolved_tool_protocol',
      },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call_resolved_tool_protocol',
        output: 'ok',
      },
    }),
    '',
  ].join('\n');

  assert.deepEqual(findPendingUnsupportedFunctionCalls(output), []);
});
