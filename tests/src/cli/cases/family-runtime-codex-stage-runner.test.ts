import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  path,
  test,
} from '../helpers.ts';
import {
  runAgentStageRunner,
} from '../../../../src/family-runtime-codex-stage-runner.ts';

test('Codex stage runner resumes the same session to enforce missing typed closeout', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-runner-workspace-'));
  const expectedWorkspaceRoot = fs.realpathSync(workspaceRoot);
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_closeout_enforcement',
    closeout_refs: [
      'opl://stage-attempts/sat_closeout_enforcement/runtime-blockers/closeout-not-materialized',
    ],
    consumed_refs: ['packet:dm003-submission'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [{
      blocker_id: 'provider_executor_missing_initial_typed_closeout',
      reason: 'first_codex_turn_finished_without_typed_closeout_packet',
      provider_completion_is_domain_ready: false,
    }],
    next_owner: 'medautoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'runtime_closeout_enforcement',
      can_claim_paper_progress: false,
    },
    authority_boundary: {
      opl: 'same_session_closeout_enforcement_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  };
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ] && [ "$2" = "--skip-git-repo-check" ]; then
  printf '{"type":"thread.started","thread_id":"thread-closeout-enforcement"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","id":"msg-progress","text":"checkpoint only"}}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
if [ "$1" = "exec" ] && [ "$2" = "resume" ]; then
  if [ "$(pwd)" != "${expectedWorkspaceRoot}" ]; then
    echo "unexpected resume cwd: $(pwd)" >&2
    exit 66
  fi
  if [ "$5" != "thread-closeout-enforcement" ]; then
    echo "unexpected resume session: $5" >&2
    exit 65
  fi
  printf '{"type":"thread.started","thread_id":"thread-closeout-enforcement"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', id: 'msg-closeout', text: JSON.stringify(closeout) },
  })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousMode = process.env.OPL_CODEX_STAGE_RUNNER_MODE;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_MODE = 'codex_cli';
    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_closeout_enforcement',
        idempotency_key: 'idem-closeout-enforcement',
        domain_id: 'medautoscience',
        stage_id: 'continue paper-facing submission milestone work',
        workspace_locator: {
          workspace_root: workspaceRoot,
        },
        executor_kind: 'codex_cli',
        checkpoint_refs: ['packet:dm003-submission'],
      },
      stagePacketRef: 'packet:dm003-submission',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 5_000,
    });
    const codexReceipt = receipt as {
      closeout_packet?: typeof closeout | null;
      process_output_summary?: {
        session_recovery_status?: string;
        closeout_enforcement?: {
          status?: string;
          thread_id?: string | null;
          authority_boundary?: {
            can_write_domain_truth?: boolean;
          };
        };
      };
      progress_summary: {
        runner_events: Array<{ event_kind: string }>;
      };
    };

    assert.equal(codexReceipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(codexReceipt.closeout_packet?.closeout_refs, closeout.closeout_refs);
    assert.match(
      codexReceipt.process_output_summary?.session_recovery_status ?? '',
      /^session_/,
    );
    assert.equal(codexReceipt.process_output_summary?.closeout_enforcement?.status, 'closeout_found');
    assert.equal(codexReceipt.process_output_summary?.closeout_enforcement?.thread_id, 'thread-closeout-enforcement');
    assert.equal(
      codexReceipt.process_output_summary?.closeout_enforcement?.authority_boundary?.can_write_domain_truth,
      false,
    );
    assert.equal(
      codexReceipt.progress_summary.runner_events.some((event) =>
        event.event_kind === 'closeout_enforcement.agent_message'
      ),
      true,
    );
  } finally {
    if (typeof previousCodexBin === 'string') {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    } else {
      delete process.env.OPL_CODEX_BIN;
    }
    if (typeof previousMode === 'string') {
      process.env.OPL_CODEX_STAGE_RUNNER_MODE = previousMode;
    } else {
      delete process.env.OPL_CODEX_STAGE_RUNNER_MODE;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
