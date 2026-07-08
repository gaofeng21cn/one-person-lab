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
} from '../../../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import {
  runnerPromptFor,
} from '../../../../src/modules/runway/family-runtime-codex-stage-runner-parts/input-prompt.ts';

test('Codex stage runner prompt exposes MAS PaperMission stage-route affordance', () => {
  const prompt = runnerPromptFor({
    attempt: {
      stage_attempt_id: 'sat_paper_mission_stage_route',
      domain_id: 'medautoscience',
      stage_id: 'continue paper-facing submission milestone work',
      workspace_locator: {
        surface_kind: 'opl_mas_paper_mission_stage_route_workspace_locator',
        task_kind: 'paper_mission/stage-route',
        runtime_request_kind: 'mas_paper_mission_stage_route',
        workspace_root: '/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        command_kind: 'resume_stage',
        route_target:
          'continue paper-facing submission milestone work and request OPL route readback',
        candidate_ref:
          '/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk/ops/medautoscience/paper_mission_consumption_ledger/run/package_manifest.json',
        paper_mission_transaction_ref:
          'paper-mission-transaction::003-dpcc-primary-care-phenotype-treatment-gap',
        opl_route_command_ref:
          '/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk/ops/medautoscience/paper_mission_consumption_ledger/run/receipt.json#opl_route_command',
      },
      checkpoint_refs: ['paper-mission-stage-packet:dm003'],
    },
    stagePacketRef: 'paper-mission-stage-packet:dm003',
  });

  assert.match(prompt, /paper_mission\/stage-route/);
  assert.match(prompt, /DM-CVD-Mortality-Risk\/ops\/medautoscience\/bin\/paper-mission/);
  assert.match(prompt, /dm-cvd-mortality-risk\.local\.toml/);
  assert.match(prompt, /paper-mission inspect/);
  assert.match(prompt, /workspace-local MAS ops shims only/);
  assert.match(prompt, /Do not invent domain-health-diagnostic when the command is absent/);
  assert.match(prompt, /do not invoke bare medautosci/i);
  assert.match(prompt, /executable owner-work attempt/);
  assert.match(prompt, /Do not block only because an owner receipt/);
  assert.match(prompt, /next_work_unit/);
  assert.match(prompt, /ops\/medautoscience\/paper_mission_stage_attempts\/<stage_attempt_id>/);
  assert.match(prompt, /owner_answer_kind "route_back_evidence_ref"/);
  assert.match(prompt, /owner_answer_kind "typed_blocker_ref"/);
  assert.match(prompt, /Professional manuscript\/reviewer checklist source/);
  assert.match(prompt, /MAS profile ref, task-intake refs, and MAS ScholarSkills or professional Skill refs/);
  assert.match(prompt, /only route, readback, authority, and forbidden-write rules/);
  assert.doesNotMatch(prompt, /registry enrollment period/);
  assert.doesNotMatch(prompt, /adult-only sensitivity/);
  assert.doesNotMatch(prompt, /diagnostic variable ascertainment table/);
  assert.doesNotMatch(prompt, /burden\/prevalence wording/);
  assert.doesNotMatch(prompt, /missingness atlas/);
  assert.doesNotMatch(prompt, /phenotype-treatment gap discovery contract/);
  assert.doesNotMatch(prompt, /high-risk low-intensity definitions/);
  assert.doesNotMatch(prompt, /medication-source sensitivity/);
  assert.doesNotMatch(prompt, /transition trajectory categories/);
  assert.doesNotMatch(prompt, /site-level gap variability/);
  assert.doesNotMatch(prompt, /cardiometabolic-renal protection gaps/);
  assert.doesNotMatch(prompt, /rate\/count separation/);
  assert.match(prompt, /publication_eval\/latest\.json/);
  assert.match(prompt, /controller_decisions\/latest\.json/);
  assert.match(prompt, /owner receipts/);
  assert.match(prompt, /typed blockers/);
  assert.match(prompt, /human gates/);
  assert.match(prompt, /current_package/);
  assert.match(prompt, /runtime queues/);
  assert.match(prompt, /provider attempts/);
  assert.match(prompt, /provider liveness/);
  assert.match(prompt, /already running inside OPL provider-backed runtime/);
  assert.match(prompt, /Do not recursively enqueue, redrive, tick, start, or submit another OPL runtime task/);
  assert.match(prompt, /paper-mission drive --submit-opl-runtime/);
  assert.match(prompt, /create a fresh OPL route handoff as a substitute for a MAS-acceptable owner answer/);
});

test('Codex stage runner derives MAS PaperMission profile from the target workspace root', () => {
  const prompt = runnerPromptFor({
    attempt: {
      stage_attempt_id: 'sat_obesity_paper_mission_stage_route',
      domain_id: 'medautoscience',
      stage_id: 'medical_methods_and_registry_reporting_repair',
      workspace_locator: {
        surface_kind: 'opl_mas_paper_mission_stage_route_workspace_locator',
        task_kind: 'paper_mission/stage-route',
        runtime_request_kind: 'mas_paper_mission_stage_route',
        workspace_root: '/Users/gaofeng/workspace/Yang/Obesity',
        study_id: 'obesity_multicenter_phenotype_atlas',
        command_kind: 'resume_stage',
        route_target: 'medical_methods_and_registry_reporting_repair',
      },
      checkpoint_refs: ['paper-mission-stage-packet:obesity'],
    },
    stagePacketRef: 'paper-mission-stage-packet:obesity',
  });

  assert.match(prompt, /Profile ref: \/Users\/gaofeng\/workspace\/Yang\/Obesity\/ops\/medautoscience\/profiles\/obesity\.local\.toml/);
  assert.doesNotMatch(prompt, /dm-cvd-mortality-risk\.local\.toml/);
  assert.match(prompt, /"\/Users\/gaofeng\/workspace\/Yang\/Obesity\/ops\/medautoscience\/bin\/paper-mission" inspect --profile "\/Users\/gaofeng\/workspace\/Yang\/Obesity\/ops\/medautoscience\/profiles\/obesity\.local\.toml"/);
});

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
  session_id=""
  shift 2
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --skip-git-repo-check|--json)
        shift
        ;;
      --output-last-message|--output-schema)
        shift 2
        ;;
      *)
        session_id="$1"
        break
        ;;
    esac
  done
  if [ "$session_id" != "thread-closeout-enforcement" ]; then
    echo "unexpected resume session: $session_id" >&2
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
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
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

test('Codex stage runner recovers enforced closeout from output-last-message capture', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-stage-runner-workspace-'));
  const expectedWorkspaceRoot = fs.realpathSync(workspaceRoot);
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_closeout_capture',
    closeout_refs: [
      'opl://stage-attempts/sat_closeout_capture/runtime-blockers/closeout-not-materialized',
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
  printf '{"type":"session_meta","payload":{"id":"thread-closeout-capture"}}\\n'
  printf '{"type":"event_msg","payload":{"type":"agent_message","message":"checkpoint only","phase":"commentary"}}\\n'
  exit 0
fi
if [ "$1" = "exec" ] && [ "$2" = "resume" ]; then
  if [ "$(pwd)" != "${expectedWorkspaceRoot}" ]; then
    echo "unexpected resume cwd: $(pwd)" >&2
    exit 66
  fi
  output_last_message=""
  output_schema=""
  session_id=""
  shift 2
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --skip-git-repo-check|--json)
        shift
        ;;
      --output-last-message)
        output_last_message="$2"
        shift 2
        ;;
      --output-schema)
        output_schema="$2"
        shift 2
        ;;
      *)
        session_id="$1"
        break
        ;;
    esac
  done
  if [ "$session_id" != "thread-closeout-capture" ]; then
    echo "unexpected resume session: $session_id" >&2
    exit 65
  fi
  if [ -n "$output_schema" ] && [ ! -f "$output_schema" ]; then
    echo "missing output schema: $output_schema" >&2
    exit 67
  fi
  printf '%s' '${JSON.stringify(closeout)}' > "$output_last_message"
  printf '{"type":"thread.started","thread_id":"thread-closeout-capture"}\\n'
  printf '{"type":"turn.started"}\\n'
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
        stage_attempt_id: 'sat_closeout_capture',
        idempotency_key: 'idem-closeout-capture',
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
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
      timeoutMs: 10_000,
      noOutputTimeoutMs: 5_000,
    });
    const codexReceipt = receipt as {
      closeout_packet?: typeof closeout | null;
      process_output_summary?: {
        closeout_enforcement?: {
          status?: string;
          captured_last_message_chars?: number;
        };
      };
    };

    assert.equal(codexReceipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(codexReceipt.closeout_packet?.closeout_refs, closeout.closeout_refs);
    assert.equal(codexReceipt.process_output_summary?.closeout_enforcement?.status, 'closeout_found');
    assert.equal(
      (codexReceipt.process_output_summary?.closeout_enforcement?.captured_last_message_chars ?? 0) > 0,
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
