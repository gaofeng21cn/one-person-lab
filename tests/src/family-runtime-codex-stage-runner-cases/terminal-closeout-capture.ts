import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture } from '../cli/helpers.ts';
import { runPublicCodexStageRunner } from '../family-runtime-codex-stage-runner-helpers.ts';

async function runWithFakeCodex(
  { fixtureRoot, codexPath }: ReturnType<typeof createFakeCodexFixture>,
  input: Parameters<typeof runPublicCodexStageRunner>[0],
) {
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_STATE_DIR = path.join(fixtureRoot, 'opl-state');
    return await runPublicCodexStageRunner(input);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('Codex stage runner advances prose-prefixed closeout as raw progress', async () => {
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
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
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

  assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
  assert.match(receipt.closeout_packet?.closeout_refs[0] ?? '', /^file:\/\//);
  assert.equal(receipt.closeout_packet?.domain_ready_verdict, 'completed_with_quality_debt');
  assert.equal(receipt.closeout_packet?.route_impact?.next_stage_may_start, true);
  const progress = receipt.process_output_summary?.progress_closeout_projection;
  assert.equal(progress?.projection_status, 'derived_progress_envelope');
  assert.equal(progress?.capture_pipeline.free_text_or_partial_output_is_progress, true);
  assert.equal(progress?.capture_pipeline.terminal_json_exact_object_required, false);
  assert.equal(progress?.capture_pipeline.output_schema_control_plane_enabled, false);
  assert.equal(progress?.capture_pipeline.same_session_closeout_enforcement_enabled, false);
  assert.equal(receipt.runner_status.typed_closeout_required_for_progress, false);
  assert.equal(receipt.runner_status.raw_artifact_sufficient_for_progress, true);
  const processOutputSummary = receipt.process_output_summary;
  assert.ok(processOutputSummary, 'codex_cli runner receipt must include process_output_summary.');
  assert.equal(processOutputSummary.final_message_chars > JSON.stringify(closeout).length, true);
});

test('Codex stage runner advances malformed typed closeout as raw progress', async () => {
  const cases = [
    {
      name: 'missing surface_kind',
      attemptId: 'sat_missing_surface_kind_closeout_test',
      closeout: {
        closeout_refs: ['receipt:missing-surface-kind-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    },
    {
      name: 'missing closeout_refs',
      attemptId: 'sat_missing_closeout_refs_closeout_test',
      closeout: {
        surface_kind: 'stage_attempt_closeout_packet',
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    },
  ];

  for (const entry of cases) {
    const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-${entry.attemptId}"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'agent_message',
      id: 'msg-1',
      text: JSON.stringify(entry.closeout),
    },
  })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
    const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
      attempt: {
        stage_attempt_id: entry.attemptId,
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: [`checkpoint:${entry.attemptId}`],
      },
      stagePacketRef: `packet:${entry.attemptId}`,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet', entry.name);
    assert.match(receipt.closeout_packet?.closeout_refs[0] ?? '', /^file:\/\//, entry.name);
    assert.equal(receipt.closeout_packet?.route_impact?.next_stage_may_start, true, entry.name);
    assert.equal(
      receipt.process_output_summary?.progress_closeout_projection?.projection_status,
      'derived_progress_envelope',
      entry.name,
    );
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
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
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
  assert.equal(
    receipt.process_output_summary?.progress_closeout_projection?.projection_status,
    'typed_closeout_observed',
  );
  assert.equal(
    receipt.process_output_summary?.progress_closeout_projection?.accepted_progress?.closeout_ref_count,
    1,
  );
});

test('Codex stage runner records missing domain-route stage log as nonblocking quality debt', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:paper-route-record-only'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-paper-route-record-only-closeout"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-1', text: JSON.stringify(closeout) } })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
    attempt: {
      stage_attempt_id: 'sat_paper_route_record_only_closeout_test',
      stage_id: 'submission_milestone_candidate::followthrough::followthrough-02',
      domain_id: 'medautoscience',
      workspace_locator: {
        surface_kind: 'opl_domain_route_runtime_request',
        task_kind: 'domain_route/stage-route',
        runtime_request_kind: 'domain_route_stage_route',
        workspace_root: fixtureRoot,
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        route_target: 'submission_milestone_candidate::followthrough::followthrough-02',
      },
      checkpoint_refs: ['paper-mission-stage-packet:dm003-record-only'],
    },
    stagePacketRef: 'paper-mission-stage-packet:dm003-record-only',
    runnerMode: 'codex_cli',
    timeoutMs: 10_000,
  });

  assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
  assert.match(receipt.closeout_packet?.closeout_refs[0] ?? '', /^file:\/\//);
  assert.equal(receipt.closeout_packet?.route_impact?.next_stage_may_start, true);
  assert.equal(
    receipt.process_output_summary?.closeout_rejection_reason,
    'domain_route_user_stage_log_missing',
  );
  assert.equal(receipt.process_output_summary?.blocked_reason, undefined);
});

test('Codex stage runner accepts domain-route closeout when attempt route impact carries user stage log', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:paper-route-attempt-route-impact-stage-log'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const userStageLog = {
    surface_kind: 'opl_user_stage_log',
    schema_version: 1,
    semantic_status: 'provided_by_domain',
    semantic_source: 'med_autoscience.paper_mission_stage_route',
    stage_name: 'PaperMission stage route for 002-dm-china-us-mortality-attribution',
    problem_summary: 'MAS PaperMission routed non-authority paper-facing candidate refs.',
    stage_goal: 'Carry the PaperMission route command without claiming submission readiness.',
    progress_delta_classification: 'deliverable_progress',
    deliverable_progress_delta: {
      delta_count: 1,
      delta_refs: [
        '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/paper_mission_drive/002/package_manifest.json',
      ],
      delta_summary: 'non-authority paper-facing candidate refs routed',
    },
    platform_repair_delta: {
      delta_count: 0,
      delta_refs: [],
      delta_summary: null,
    },
    owner_gate_verdict: {
      verdict: 'route_back',
      owner: 'med-autoscience',
      blocked_reason: 'paper_mission_stage_route_domain_gate_pending',
    },
    remaining_blockers: ['paper_mission_stage_route_domain_gate_pending'],
    next_forced_delta: 'domain_owner_answer_or_human_gate_or_non_synonymous_paper_delta',
    evidence_refs: ['paper-mission-transaction:dm002:followthrough-02'],
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-paper-route-attempt-route-impact-stage-log"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-1', text: JSON.stringify(closeout) } })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
    attempt: {
      stage_attempt_id: 'sat_paper_route_attempt_route_impact_stage_log_test',
      stage_id: 'submission_milestone_candidate::followthrough::followthrough-02',
      domain_id: 'medautoscience',
      workspace_locator: {
        surface_kind: 'opl_domain_route_runtime_request',
        task_kind: 'domain_route/stage-route',
        runtime_request_kind: 'domain_route_stage_route',
        workspace_root: fixtureRoot,
        study_id: '002-dm-china-us-mortality-attribution',
        route_target: 'submission_milestone_candidate::followthrough::followthrough-02',
      },
      route_impact: {
        decision: 'route_back',
        domain_ready_verdict: 'domain_gate_pending',
        user_stage_log: userStageLog,
      },
      checkpoint_refs: ['paper-mission-stage-packet:dm002-route-impact-stage-log'],
    },
    stagePacketRef: 'paper-mission-stage-packet:dm002-route-impact-stage-log',
    runnerMode: 'codex_cli',
    timeoutMs: 10_000,
  });

  assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
    'receipt:paper-route-attempt-route-impact-stage-log',
  ]);
  assert.equal(receipt.closeout_packet?.route_impact, undefined);
  assert.equal(receipt.process_output_summary?.blocked_reason, undefined);
  assert.equal(receipt.process_output_summary?.closeout_rejection_reason, undefined);
});

test('Codex stage runner captures terminal typed closeout from Codex output-last-message file', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_output_last_message_closeout_test',
    closeout_refs: [
      {
        ref_kind: 'stage_attempt_closeout_packet_ref',
        uri: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_output_last_message.closeout.json',
        sha256: 'sha256:output-last-message-closeout',
        size_bytes: 4096,
      },
    ],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const captureLogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-capture-log-'));
  const captureRootLog = path.join(captureLogRoot, 'capture-root.txt');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
output_last_message=""
output_schema=""
capture_root_log="${captureRootLog}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-last-message)
      output_last_message="$2"
      shift 2
      ;;
    --output-schema)
      output_schema="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [ -z "$output_last_message" ]; then
  echo "missing structured output capture args" >&2
  exit 64
fi
if [ -n "$output_schema" ] && ! grep -q '"uri"' "$output_schema"; then
  echo "schema does not allow object uri closeout refs" >&2
  exit 64
fi
dirname "\${output_schema:-$output_last_message}" > "$capture_root_log"
printf '%s\\n' '${JSON.stringify(closeout)}' > "$output_last_message"
printf '{"type":"thread.started","thread_id":"thread-output-last-message-closeout"}\\n'
printf '{"type":"turn.completed"}\\n'
exit 0
`);
  try {
    const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
      attempt: {
        stage_attempt_id: 'sat_output_last_message_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:output-last-message-closeout'],
      },
      stagePacketRef: 'packet:output-last-message-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_output_last_message.closeout.json',
    ]);
    assert.deepEqual(receipt.closeout_packet?.closeout_ref_metadata, [
      {
        ref_kind: 'stage_attempt_closeout_packet_ref',
        uri: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_output_last_message.closeout.json',
        ref: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_output_last_message.closeout.json',
        sha256: 'sha256:output-last-message-closeout',
        size_bytes: 4096,
      },
    ]);
    assert.equal(
      (receipt.process_output_summary?.captured_last_message_chars ?? 0) > JSON.stringify(closeout).length,
      true,
    );
    const captureRoot = fs.readFileSync(captureRootLog, 'utf8').trim();
    assert.equal(fs.existsSync(captureRoot), false);
  } finally {
    fs.rmSync(captureLogRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner rejects typed closeout packets for a different stage attempt', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_previous_attempt',
    closeout_refs: [
      'studies/003/artifacts/supervision/consumer/stage_attempt_closeouts/sat_previous_attempt.json',
    ],
    consumed_refs: ['paper:draft.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-stale-closeout"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-1', text: JSON.stringify(closeout) } })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
    attempt: {
      stage_attempt_id: 'sat_current_attempt',
      stage_id: 'domain_owner/default-executor-dispatch',
      workspace_locator: {
        workspace_root: fixtureRoot,
      },
      checkpoint_refs: ['checkpoint:stale-closeout'],
    },
    stagePacketRef: 'packet:stale-closeout',
    runnerMode: 'codex_cli',
    timeoutMs: 10_000,
  });

  assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
  assert.match(receipt.closeout_packet?.closeout_refs[0] ?? '', /^file:\/\//);
  assert.equal(receipt.closeout_packet?.stage_attempt_id, 'sat_current_attempt');
  assert.equal(receipt.process_output_summary?.closeout_rejection_reason, 'stage_attempt_id_mismatch');
  assert.equal(receipt.closeout_packet?.route_impact?.next_stage_may_start, true);
  assert.equal(
    receipt.process_output_summary?.progress_closeout_projection?.quality_debt?.blocks_next_stage,
    false,
  );
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
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
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
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
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
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
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
});

test('Codex stage runner advances final prose after an earlier closeout-shaped message', async () => {
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
  const receipt = await runWithFakeCodex({ fixtureRoot, codexPath }, {
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

  assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
  assert.match(receipt.closeout_packet?.closeout_refs[0] ?? '', /^file:\/\//);
  assert.equal(receipt.closeout_packet?.route_impact?.next_stage_may_start, true);
  assert.equal(
    receipt.process_output_summary?.progress_closeout_projection?.projection_status,
    'derived_progress_envelope',
  );
});
