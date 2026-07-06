import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import './family-runtime-codex-stage-runner-cases/terminal-closeout-capture.ts';

import { createFakeCodexFixture, createGitModuleRemoteFixture } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';
import {
  buildCodexStageActivityInput,
  createCodexCloseoutCaptureForTest,
  stageCloseoutOutputSchemaForTest,
  runAgentStageRunner,
} from '../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import {
  runCodexInE2bSandbox,
  setE2bSandboxFactoryForTest,
} from '../../src/modules/runway/e2b-codex-stage-execution.ts';
import {
  runCodexInLocalSandbox,
  setLocalSandboxCommandRunnerForTest,
} from '../../src/modules/runway/local-codex-stage-sandbox.ts';

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

test('Codex stage activity command preview binds explicit Codex executor policy', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_codex_policy_preview_test',
      stage_id: 'domain_owner/default-executor-dispatch',
      executor_kind: 'codex_cli',
      stage_attempt_executor_policy: {
        executor_kind: 'codex_cli',
        model: 'gpt-5.5',
        provider: 'openai',
        reasoning_effort: 'high',
      },
      workspace_locator: {
        workspace_root: '/tmp/mas',
      },
      checkpoint_refs: ['packet:from-checkpoint'],
    },
  });

  assert.deepEqual(activity.runner_status.command_preview.slice(0, 13), [
    'codex',
    'exec',
    '--skip-git-repo-check',
    '--full-auto',
    '--json',
    '--cd',
    '/tmp/mas',
    '--model',
    'gpt-5.5',
    '--config',
    'model_provider="openai"',
    '--config',
    'model_reasoning_effort="high"',
  ]);
});

test('Codex stage activity prompt carries refs-only OPL execution authorization context', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_codex_auth_prompt_test',
      workflow_id: 'wf_codex_auth_prompt_test',
      task_id: 'frt_codex_auth_prompt_test',
      stage_id: 'domain_owner/default-executor-dispatch',
      executor_kind: 'codex_cli',
      workspace_locator: {
        workspace_root: '/tmp/mas',
        study_id: '002-dm-china-us-mortality-attribution',
        action_type: 'complete_medical_paper_readiness_surface',
        candidate_ref: '/tmp/mas/ops/medautoscience/paper_mission_candidate_package/run/002/package_manifest.json',
        paper_mission_transaction_ref: 'paper-mission-transaction::002::gate-clearing',
        opl_route_command_ref: 'paper-mission-transaction::002::gate-clearing#opl_route_command',
        command_kind: 'route_back',
        route_target: 'gate_clearing_claim_evidence_repair',
        command_cwd: '/tmp/one-person-lab',
        command_source: 'env_override',
        source_ref: '/tmp/mas/ops/medautoscience/paper_mission_consumption_ledger/run/002/opl_route_handoff.json',
      },
      opl_execution_authorization: {
        provider_attempt_ref: 'temporal://attempt/sat_codex_auth_prompt_test',
        attempt_lease_ref: 'opl://stage-attempts/sat_codex_auth_prompt_test/leases/frt_codex_auth_prompt_test/active',
        attempt_lease_status: 'active',
        execution_authorization_decision_ref:
          'opl://stage-attempts/sat_codex_auth_prompt_test/execution-authorizations/frt_codex_auth_prompt_test/wf_codex_auth_prompt_test',
        source_fingerprint: 'mas_default_executor_source_codex_auth_prompt_test',
        idempotency_key: 'idem_codex_auth_prompt_test',
        stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
        stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
        current_pointer_ref:
          'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
      },
      checkpoint_refs: ['studies/002/artifacts/supervision/consumer/default_executor_dispatches/immutable/packet.json'],
    },
  });

  const commandPreview = activity.runner_status.command_preview.join('\n');
  assert.match(commandPreview, /explicitly pass these OPL_\* bindings to the child command environment/);
  assert.match(commandPreview, /"OPL_PROVIDER_ATTEMPT_REF":"temporal:\/\/attempt\/sat_codex_auth_prompt_test"/);
  assert.match(commandPreview, /"OPL_ATTEMPT_LEASE_STATUS":"active"/);
  assert.match(commandPreview, /"OPL_EXECUTION_AUTHORIZATION_DECISION_REF":"opl:\/\/stage-attempts\/sat_codex_auth_prompt_test\/execution-authorizations\/frt_codex_auth_prompt_test\/wf_codex_auth_prompt_test"/);
  assert.match(commandPreview, /"OPL_STAGE_RUN_ID":"app-stage-run:medautoscience:domain-owner-default-executor-dispatch"/);
  assert.match(commandPreview, /"OPL_STAGE_MANIFEST_REF":"opl:\/\/stage-manifests\/domain_owner%2Fdefault-executor-dispatch"/);
  assert.match(commandPreview, /"OPL_CURRENT_POINTER_REF":"opl:\/\/stage-runs\/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch\/current"/);
  assert.match(commandPreview, /"OPL_CLOSEOUT_BINDING_JSON":/);
  assert.match(commandPreview, /"OPL_STAGE_PACKET_REF":"studies\/002\/artifacts\/supervision\/consumer\/default_executor_dispatches\/immutable\/packet.json"/);
  assert.match(commandPreview, /"OPL_CANDIDATE_REF":"\/tmp\/mas\/ops\/medautoscience\/paper_mission_candidate_package\/run\/002\/package_manifest.json"/);
  assert.match(commandPreview, /"OPL_PAPER_MISSION_TRANSACTION_REF":"paper-mission-transaction::002::gate-clearing"/);
  assert.match(commandPreview, /"OPL_ROUTE_COMMAND_REF":"paper-mission-transaction::002::gate-clearing#opl_route_command"/);
  assert.match(commandPreview, /"OPL_ROUTE_COMMAND_KIND":"route_back"/);
  assert.match(commandPreview, /"OPL_ROUTE_TARGET":"gate_clearing_claim_evidence_repair"/);
  assert.match(commandPreview, /"OPL_DOMAIN_COMMAND_CWD":"\/tmp\/one-person-lab"/);
  assert.match(commandPreview, /"OPL_DOMAIN_COMMAND_SOURCE":"env_override"/);
  assert.match(commandPreview, /"OPL_ROUTE_HANDOFF_SOURCE_REF":"\/tmp\/mas\/ops\/medautoscience\/paper_mission_consumption_ledger\/run\/002\/opl_route_handoff.json"/);
  assert.match(commandPreview, /do not grant domain truth, artifact, quality, or readiness authority/);
});

test('Codex stage activity prompt forbids recursive MAS PaperMission stage-route runtime submission', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_codex_paper_route_prompt_test',
      domain_id: 'medautoscience',
      stage_id: 'continue paper-facing submission milestone work',
      executor_kind: 'codex_cli',
      workspace_locator: {
        surface_kind: 'opl_mas_paper_mission_stage_route_workspace_locator',
        task_kind: 'paper_mission/stage-route',
        runtime_request_kind: 'mas_paper_mission_stage_route',
        workspace_root: '/tmp/mas',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
        task_intake_kind: 'reviewer_revision',
        task_intake_ref: {
          task_id: 'study-task::dm003::20260705T064542Z',
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          artifact_path: '/tmp/mas/studies/003/artifacts/controller/task_intake/latest.json',
        },
        task_intake_summary: {
          task_intake_kind: 'reviewer_revision',
          task_intent: 'Repair Figure 4, promote medication sensitivity Table 3, expand discussion, and preserve supplementary outputs.',
          first_cycle_outputs: ['new canonical manuscript', 'coverage audit'],
          revision_checklist: ['text_revisions', 'tables_figures', 'follow_up_evidence'],
        },
      },
      checkpoint_refs: ['paper-mission-stage-packet:dm003'],
    },
  });

  const commandPreview = activity.runner_status.command_preview.join('\n');
  assert.match(commandPreview, /"\/tmp\/mas\/\.venv\/bin\/python3" -m med_autoscience\.cli paper-mission inspect/);
  assert.doesNotMatch(commandPreview, /ops\/medautoscience\/\.venv\/bin\/python3/);
  assert.match(commandPreview, /Latest MAS task-intake scope for this attempt/);
  assert.match(commandPreview, /Task intake kind: reviewer_revision/);
  assert.match(commandPreview, /Figure 4, promote medication sensitivity Table 3/);
  assert.match(commandPreview, /transport-only audit packet is not sufficient/);
  assert.match(commandPreview, /already running inside OPL provider-backed runtime/);
  assert.match(commandPreview, /Do not recursively enqueue, redrive, tick, start, or submit another OPL runtime task/);
  assert.match(commandPreview, /paper-mission drive --submit-opl-runtime/);
  assert.match(commandPreview, /must include domain-provided user-readable stage semantics/);
  assert.match(commandPreview, /domain_user_stage_log_or_typed_blocker_with_lineage_required/);
});

test('Codex stage closeout output schema accepts refs-only object metadata', () => {
  const schema = stageCloseoutOutputSchemaForTest() as Record<string, any>;
  const closeoutRefs = schema.properties.closeout_refs;
  const objectRefSchema = closeoutRefs.items.anyOf.find((entry: Record<string, unknown>) =>
    entry.type === 'object'
  );

  assert.ok(objectRefSchema, 'closeout_refs must allow object refs.');
  assert.deepEqual(objectRefSchema.anyOf, [
    { required: ['ref'] },
    { required: ['uri'] },
  ]);
  assert.deepEqual(Object.keys(objectRefSchema.properties).sort(), [
    'kind',
    'ref',
    'ref_kind',
    'sha256',
    'size_bytes',
    'uri',
  ]);
});

test('Codex stage closeout capture cleans temp directory after construction failure', () => {
  let leakedRoot: string | null = null;

  assert.throws(() => {
    createCodexCloseoutCaptureForTest({
      writeFileSync(filePath) {
        leakedRoot = path.dirname(String(filePath));
        throw new Error('schema write failed');
      },
    });
  }, /schema write failed/);

  assert.ok(leakedRoot, 'test must observe the allocated capture root.');
  assert.equal(fs.existsSync(leakedRoot), false);
});

test('Codex stage runner fails closed when live runner lacks packet or workspace binding', async () => {
  await assert.rejects(
    () => runPublicCodexStageRunner({
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
    () => runPublicCodexStageRunner({
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

test('Codex stage runner defaults to local sandbox and fails closed without an image', async () => {
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    image: process.env.OPL_CODEX_STAGE_SANDBOX_IMAGE,
    devcontainerImage: process.env.OPL_DEVCONTAINER_IMAGE,
    localImage: process.env.OPL_LOCAL_SANDBOX_IMAGE,
  };
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-local-docker-missing-image-'));
  try {
    delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    delete process.env.OPL_CODEX_STAGE_SANDBOX_IMAGE;
    delete process.env.OPL_DEVCONTAINER_IMAGE;
    delete process.env.OPL_LOCAL_SANDBOX_IMAGE;

    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_local_docker_missing_image_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['packet:local-docker-missing-image'],
      },
      stagePacketRef: 'packet:local-docker-missing-image',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.process_output_summary?.blocked_reason, 'local_sandbox_image_missing');
    assert.equal(receipt.closeout_packet?.rejected_writes?.[0]?.blocker_id, 'local_sandbox_image_missing');
    const summary = receipt.process_output_summary?.sandbox_execution;
    assert.ok(summary, 'receipt must include local sandbox execution summary');
    assert.equal(summary.execution_substrate, 'local_sandbox');
    assert.equal(summary.provider_kind, 'local_devcontainer');
    assert.equal(summary.external_api_called, false);
    assert.equal(summary.credential_material_logged, false);
    assert.equal(summary.host_workspace_mutated, false);
    assert.equal(receipt.process_output_summary?.external_sandbox_execution, undefined);
  } finally {
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.image === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_IMAGE;
    else process.env.OPL_CODEX_STAGE_SANDBOX_IMAGE = previous.image;
    if (previous.devcontainerImage === undefined) delete process.env.OPL_DEVCONTAINER_IMAGE;
    else process.env.OPL_DEVCONTAINER_IMAGE = previous.devcontainerImage;
    if (previous.localImage === undefined) delete process.env.OPL_LOCAL_SANDBOX_IMAGE;
    else process.env.OPL_LOCAL_SANDBOX_IMAGE = previous.localImage;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner runs Codex through explicit local Docker sandbox using git clone transport', async () => {
  const remote = createGitModuleRemoteFixture('local-docker-agent-workspace');
  const dockerCalls: string[][] = [];
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_local_docker_codex_stage_test',
    closeout_refs: ['receipt:local-docker-codex-stage'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  setLocalSandboxCommandRunnerForTest(async (args) => {
    dockerCalls.push(args);
    if (args.includes('diff') && args.includes('--name-only')) {
      return { exitCode: 0, stdout: 'artifacts/stage-output.json\n', stderr: '' };
    }
    if (args.includes('diff') && args.includes('--stat')) {
      return { exitCode: 0, stdout: ' artifacts/stage-output.json | 1 +\n', stderr: '' };
    }
    if (args.includes('sh') && args.includes('-lc') && args.some((arg) => arg.includes("'codex' 'exec'"))) {
      return {
        exitCode: 0,
        stdout: [
          '{"type":"thread.started","thread_id":"thread-local-docker-stage"}',
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              id: 'msg-local-docker-stage',
              text: JSON.stringify(closeout),
            },
          }),
          '',
        ].join('\n'),
        stderr: '',
      };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    image: process.env.OPL_LOCAL_SANDBOX_IMAGE,
    workspaceRoot: process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
  };
  try {
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'local_docker';
    process.env.OPL_LOCAL_SANDBOX_IMAGE = 'opl-codex-stage:test';
    process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT = '/workspace';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:SHOULD_NOT_FORWARD';

    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_local_docker_codex_stage_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: remote.sourceRoot,
          git_remote_url: remote.remoteRoot,
          git_ref: remote.getHeadSha(),
        },
        checkpoint_refs: ['packet:local-docker-stage'],
      },
      stagePacketRef: 'packet:local-docker-stage',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.progress_summary.thread_id, 'thread-local-docker-stage');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:local-docker-codex-stage']);
    const summary = receipt.process_output_summary?.sandbox_execution;
    assert.ok(summary, 'receipt must include local Docker sandbox execution summary');
    assert.equal(summary.execution_substrate, 'local_sandbox');
    assert.equal(summary.provider_kind, 'local_docker');
    assert.equal(summary.workspace_transport.transport_kind, 'git_clone');
    assert.equal(summary.workspace_transport.repo_url, remote.remoteRoot);
    assert.equal(summary.workspace_transport.checkout_ref, remote.getHeadSha());
    assert.deepEqual(summary.diff_refs.changed_file_refs, ['artifacts/stage-output.json']);
    assert.equal(summary.external_api_called, false);
    assert.equal(summary.credential_material_logged, false);
    assert.equal(summary.host_workspace_mutated, false);
    assert.ok(summary.forwarded_env_keys.includes('OPL_STAGE_PACKET_REF'));
    assert.equal(summary.forwarded_env_keys.includes('OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF'), false);
    assert.equal(receipt.process_output_summary?.external_sandbox_execution, undefined);
    assert.equal(dockerCalls.some((args) => args[0] === 'create'), true);
    assert.equal(dockerCalls.some((args) => args.includes('git') && args.includes('clone')), true);
    assert.equal(dockerCalls.some((args) => args[0] === 'rm' && args[1] === '-f'), true);
  } finally {
    setLocalSandboxCommandRunnerForTest(null);
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.image === undefined) delete process.env.OPL_LOCAL_SANDBOX_IMAGE;
    else process.env.OPL_LOCAL_SANDBOX_IMAGE = previous.image;
    if (previous.workspaceRoot === undefined) delete process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT;
    else process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT = previous.workspaceRoot;
    if (previous.credentialRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = previous.credentialRef;
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
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
    const receipt = await runPublicCodexStageRunner({
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
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
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

test('Codex stage runner passes stage executor policy to live Codex CLI', async () => {
  const capturePath = path.join(os.tmpdir(), `opl-codex-stage-runner-policy-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-stage-runner-policy"}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'agent_message',
      id: 'msg-policy',
      text: JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:stage-runner-policy'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      }),
    },
  })}'
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
        stage_attempt_id: 'sat_stage_runner_policy_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        stage_attempt_executor_policy: {
          executor_kind: 'codex_cli',
          model: 'gpt-5.5',
          provider: 'openai',
          reasoning_effort: 'high',
        },
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:policy'],
      },
      stagePacketRef: 'packet:policy',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:stage-runner-policy']);
    const capturedArgs = fs.readFileSync(capturePath, 'utf8').trim().split('\n');
    assert.deepEqual(capturedArgs.slice(0, 12), [
      'exec',
      '--skip-git-repo-check',
      '--full-auto',
      '--json',
      '--cd',
      fixtureRoot,
      '--model',
      'gpt-5.5',
      '--config',
      'model_provider="openai"',
      '--config',
      'model_reasoning_effort="high"',
    ]);
    assert.notEqual(capturedArgs.indexOf('--output-schema'), -1);
    assert.notEqual(capturedArgs.indexOf('--output-last-message'), -1);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('Codex stage runner can execute Codex inside an E2B sandbox and collect diff refs', async () => {
  const remote = createGitModuleRemoteFixture('sandboxed-agent-workspace');
  const commands: Array<{ cmd: string; cwd: string | null; envs: Record<string, string> }> = [];
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_e2b_codex_stage_test',
    closeout_refs: ['receipt:e2b-codex-stage'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  setE2bSandboxFactoryForTest({
    async create() {
      return {
        sandboxId: 'sandbox_e2b_created_test',
        sandboxDomain: 'sandbox.e2b.test',
        commands: {
          async run(cmd, opts) {
            commands.push({ cmd, cwd: opts?.cwd ?? null, envs: opts?.envs ?? {} });
            if (cmd.includes(' diff --name-only')) {
              return { exitCode: 0, stdout: 'artifacts/stage-output.json\n', stderr: '' };
            }
            if (cmd.includes(' diff --stat')) {
              return { exitCode: 0, stdout: ' artifacts/stage-output.json | 1 +\n', stderr: '' };
            }
            if (cmd.startsWith("'codex' 'exec'")) {
              return {
                exitCode: 0,
                stdout: [
                  '{"type":"thread.started","thread_id":"thread-e2b-stage"}',
                  JSON.stringify({
                    type: 'item.completed',
                    item: {
                      type: 'agent_message',
                      id: 'msg-e2b-stage',
                      text: JSON.stringify(closeout),
                    },
                  }),
                  '',
                ].join('\n'),
                stderr: '',
              };
            }
            return { exitCode: 0, stdout: '', stderr: '' };
          },
        },
      };
    },
    async connect() {
      throw new Error('test should create a fresh sandbox');
    },
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
    endpoint: process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
    receiptRef: process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF,
    apiKey: process.env.E2B_API_KEY,
    workspaceRoot: process.env.OPL_E2B_WORKSPACE_ROOT,
  };
  try {
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = 'https://api.e2b.test';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:E2B_API_KEY';
    process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = 'receipt:e2b-provider';
    delete process.env.E2B_API_KEY;
    process.env.OPL_E2B_WORKSPACE_ROOT = '/home/user/workspace';

    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_e2b_codex_stage_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: remote.sourceRoot,
          git_remote_url: remote.remoteRoot,
          git_ref: remote.getHeadSha(),
        },
        checkpoint_refs: ['packet:e2b-stage'],
      },
      stagePacketRef: 'packet:e2b-stage',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.progress_summary.thread_id, 'thread-e2b-stage');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:e2b-codex-stage']);
    const summary = receipt.process_output_summary?.external_sandbox_execution;
    assert.ok(summary, 'receipt must include external sandbox execution summary');
    assert.equal(summary.provider_kind, 'e2b');
    assert.equal(summary.sandbox_id, 'sandbox_e2b_created_test');
    assert.equal(summary.workspace_transport.repo_url, remote.remoteRoot);
    assert.equal(summary.workspace_transport.checkout_ref, remote.getHeadSha());
    assert.deepEqual(summary.diff_refs.changed_file_refs, ['artifacts/stage-output.json']);
    assert.equal(summary.external_api_called, true);
    assert.equal(summary.credential_material_logged, false);
    assert.equal(commands.some((entry) => entry.cmd.includes('git clone')), true);
    const codexCommand = commands.find((entry) => entry.cmd.startsWith("'codex' 'exec'"));
    assert.ok(codexCommand, 'E2B command log must include sandboxed Codex execution');
    assert.equal(codexCommand.cwd, '/home/user/workspace');
    assert.match(codexCommand.cmd, /--cd' '\/home\/user\/workspace/);
  } finally {
    setE2bSandboxFactoryForTest(null);
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        provider: 'OPL_CODEX_STAGE_SANDBOX_PROVIDER',
        substrate: 'OPL_EXTERNAL_SANDBOX_SUBSTRATE',
        endpoint: 'OPL_EXTERNAL_SANDBOX_ENDPOINT',
        credentialRef: 'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
        receiptRef: 'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
        apiKey: 'E2B_API_KEY',
        workspaceRoot: 'OPL_E2B_WORKSPACE_ROOT',
      }[key]!;
      if (value === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = value;
      }
    }
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner defaults to local devcontainer sandbox and collects diff refs', async () => {
  const remote = createGitModuleRemoteFixture('local-agent-workspace');
  const dockerCalls: string[][] = [];
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_local_sandbox_codex_stage_test',
    closeout_refs: ['receipt:local-sandbox-codex-stage'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  setLocalSandboxCommandRunnerForTest(async (args) => {
    dockerCalls.push(args);
    if (args.includes('diff') && args.includes('--name-only')) {
      return { exitCode: 0, stdout: 'artifacts/local-stage-output.json\n', stderr: '' };
    }
    if (args.includes('diff') && args.includes('--stat')) {
      return { exitCode: 0, stdout: ' artifacts/local-stage-output.json | 1 +\n', stderr: '' };
    }
    if (args.includes('sh') && args.includes('-lc') && args.some((arg) => arg.includes("'codex' 'exec'"))) {
      return {
        exitCode: 0,
        stdout: [
          '{"type":"thread.started","thread_id":"thread-local-stage"}',
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              id: 'msg-local-stage',
              text: JSON.stringify(closeout),
            },
          }),
          '',
        ].join('\n'),
        stderr: '',
      };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    image: process.env.OPL_LOCAL_SANDBOX_IMAGE,
    workspaceRoot: process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT,
  };
  try {
    delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    process.env.OPL_LOCAL_SANDBOX_IMAGE = 'opl/devcontainer-codex:test';
    process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT = '/workspace/stage';

    const receipt = await runAgentStageRunner({
      attempt: {
        stage_attempt_id: 'sat_local_sandbox_codex_stage_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        workspace_locator: {
          workspace_root: remote.sourceRoot,
          git_remote_url: remote.remoteRoot,
          git_ref: remote.getHeadSha(),
        },
        checkpoint_refs: ['packet:local-stage'],
      },
      stagePacketRef: 'packet:local-stage',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    }) as Awaited<ReturnType<typeof runPublicCodexStageRunner>>;

    assert.equal(receipt.progress_summary.thread_id, 'thread-local-stage');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:local-sandbox-codex-stage']);
    const summary = receipt.process_output_summary?.sandbox_execution;
    assert.ok(summary, 'receipt must include generic sandbox execution summary');
    assert.equal(summary.execution_substrate, 'local_sandbox');
    assert.equal(summary.provider_kind, 'local_devcontainer');
    assert.equal(summary.sandbox_workspace_root, '/workspace/stage');
    assert.equal(summary.workspace_transport.repo_url, remote.remoteRoot);
    assert.equal(summary.workspace_transport.checkout_ref, remote.getHeadSha());
    assert.deepEqual(summary.diff_refs.changed_file_refs, ['artifacts/local-stage-output.json']);
    assert.equal(summary.external_api_called, false);
    assert.equal(summary.credential_material_logged, false);
    assert.equal(summary.host_workspace_mutated, false);
    assert.equal(dockerCalls.some((args) => args[0] === 'create'), true);
    assert.equal(dockerCalls.some((args) => args.includes('git') && args.includes('clone')), true);
    assert.equal(dockerCalls.some((args) => args[0] === 'rm' && args[1] === '-f'), true);
  } finally {
    setLocalSandboxCommandRunnerForTest(null);
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.image === undefined) delete process.env.OPL_LOCAL_SANDBOX_IMAGE;
    else process.env.OPL_LOCAL_SANDBOX_IMAGE = previous.image;
    if (previous.workspaceRoot === undefined) delete process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT;
    else process.env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT = previous.workspaceRoot;
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('local Docker sandbox fails closed without image while preserving selected provider', async () => {
  const result = await runCodexInLocalSandbox({
    attempt: {
      workspace_locator: {
        git_remote_url: 'https://github.com/example/domain.git',
        git_ref: 'abc123',
      },
    },
    args: ['exec', '--json', 'echo test'],
    env: {
      OPL_LOCAL_SANDBOX_WORKSPACE_ROOT: '/workspace/docker-stage',
    },
    providerKind: 'local_docker',
    timeoutMs: 10_000,
  });

  assert.equal(result.result.exitCode, 1);
  assert.equal(result.result.timeoutReason, 'provider_unavailable');
  assert.equal(result.summary.provider_kind, 'local_docker');
  assert.equal(result.summary.sandbox_workspace_root, '/workspace/docker-stage');
  assert.equal(result.summary.external_api_called, false);
  assert.equal(result.summary.host_workspace_mutated, false);
});

test('Codex stage runner fails closed when E2B is selected without workspace git transport', async () => {
  setE2bSandboxFactoryForTest({
    async create() {
      throw new Error('sandbox must not be created without workspace transport');
    },
    async connect() {
      throw new Error('sandbox must not be connected without workspace transport');
    },
  });
  const previous = {
    provider: process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
    endpoint: process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
    receiptRef: process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF,
  };
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-e2b-missing-transport-'));
  try {
    process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = 'e2b';
    process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = 'https://api.e2b.test';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:E2B_API_KEY';
    process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = 'receipt:e2b-provider';

    await assert.rejects(
      () => runPublicCodexStageRunner({
        attempt: {
          stage_attempt_id: 'sat_e2b_missing_transport_test',
          stage_id: 'domain_owner/default-executor-dispatch',
          executor_kind: 'codex_cli',
          workspace_locator: {
            workspace_root: fixtureRoot,
          },
          checkpoint_refs: ['packet:e2b-missing-transport'],
        },
        stagePacketRef: 'packet:e2b-missing-transport',
        runnerMode: 'codex_cli',
        timeoutMs: 10_000,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'external_sandbox_workspace_transport_missing',
    );
  } finally {
    setE2bSandboxFactoryForTest(null);
    if (previous.provider === undefined) delete process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER;
    else process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = previous.provider;
    if (previous.substrate === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE;
    else process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = previous.substrate;
    if (previous.endpoint === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT;
    else process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = previous.endpoint;
    if (previous.credentialRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = previous.credentialRef;
    if (previous.receiptRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = previous.receiptRef;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('E2B Codex stage execution requires live credential material before provider API use', async () => {
  const remote = createGitModuleRemoteFixture('sandboxed-agent-workspace-no-key');
  const previous = {
    endpoint: process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT,
    credentialRef: process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF,
    receiptRef: process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF,
    substrate: process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE,
    apiKey: process.env.E2B_API_KEY,
  };
  try {
    process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = 'https://api.e2b.test';
    process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = 'env:E2B_API_KEY';
    process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = 'receipt:e2b-provider';
    process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = 'e2b';
    delete process.env.E2B_API_KEY;

    await assert.rejects(
      () => runCodexInE2bSandbox({
        attempt: {
          stage_attempt_id: 'sat_e2b_missing_key_test',
          workspace_locator: {
            git_remote_url: remote.remoteRoot,
          },
        },
        args: ['exec', '--json', 'noop'],
        timeoutMs: 10_000,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'external_sandbox_e2b_configuration_missing'
        && Array.isArray(error.details.missing_required_env)
        && error.details.missing_required_env.includes('E2B_API_KEY')
        && error.details.external_api_called === false,
    );
  } finally {
    if (previous.endpoint === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT;
    else process.env.OPL_EXTERNAL_SANDBOX_ENDPOINT = previous.endpoint;
    if (previous.credentialRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF = previous.credentialRef;
    if (previous.receiptRef === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF;
    else process.env.OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF = previous.receiptRef;
    if (previous.substrate === undefined) delete process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE;
    else process.env.OPL_EXTERNAL_SANDBOX_SUBSTRATE = previous.substrate;
    if (previous.apiKey === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = previous.apiKey;
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner omits structured output schema for gflab while preserving closeout capture', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:gflab-closeout-without-output-schema'],
    consumed_refs: ['paper:draft.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const capturePath = path.join(os.tmpdir(), `opl-codex-stage-runner-gflab-schema-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
output_last_message=""
output_schema_seen="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-last-message)
      output_last_message="$2"
      shift 2
      ;;
    --output-schema)
      output_schema_seen="true"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\\n%s\\n' "$output_last_message" "$output_schema_seen" > ${JSON.stringify(capturePath)}
if [ -z "$output_last_message" ]; then
  echo "missing output-last-message capture" >&2
  exit 64
fi
if [ "$output_schema_seen" = "true" ]; then
  echo "gflab fixture rejects unsupported output-schema" >&2
  exit 64
fi
printf '%s\\n' '${JSON.stringify(closeout)}' > "$output_last_message"
printf '{"type":"thread.started","thread_id":"thread-gflab-no-output-schema"}\\n'
printf '{"type":"turn.completed"}\\n'
exit 0
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_gflab_no_output_schema_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        stage_attempt_executor_policy: {
          executor_kind: 'codex_cli',
          model: 'gpt-5.5',
          provider: 'gflab',
          reasoning_effort: 'xhigh',
        },
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:gflab-no-output-schema'],
      },
      stagePacketRef: 'packet:gflab-no-output-schema',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'receipt:gflab-closeout-without-output-schema',
    ]);
    assert.equal(receipt.process_output_summary?.captured_last_message_chars, JSON.stringify(closeout).length + 1);
    assert.deepEqual(receipt.process_output_summary?.structured_output_schema, {
      enabled: false,
      policy: 'provider_disabled_gflab_structured_output_request',
      provider: 'gflab',
      output_last_message_capture_enabled: true,
    });
    const captured = fs.readFileSync(capturePath, 'utf8').trim().split('\n');
    assert.notEqual(captured[0], '');
    assert.equal(captured[1], 'false');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('Codex closeout enforcement also omits structured output schema for gflab', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:gflab-enforcement-without-output-schema'],
    consumed_refs: ['paper:enforcement.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const capturePath = path.join(os.tmpdir(), `opl-codex-stage-runner-gflab-enforcement-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ] && [ "$2" = "resume" ]; then
  output_last_message=""
  output_schema_seen="false"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --output-last-message)
        output_last_message="$2"
        shift 2
        ;;
      --output-schema)
        output_schema_seen="true"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done
  printf '%s\\n%s\\n' "$output_last_message" "$output_schema_seen" > ${JSON.stringify(capturePath)}
  if [ -z "$output_last_message" ]; then
    echo "missing enforcement output-last-message capture" >&2
    exit 64
  fi
  if [ "$output_schema_seen" = "true" ]; then
    echo "gflab enforcement fixture rejects unsupported output-schema" >&2
    exit 64
  fi
  printf '%s\\n' '${JSON.stringify(closeout)}' > "$output_last_message"
  printf '{"type":"thread.started","thread_id":"thread-gflab-enforcement-closeout"}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-gflab-needs-enforcement"}\\n'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_gflab_enforcement_no_output_schema_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        stage_attempt_executor_policy: {
          executor_kind: 'codex_cli',
          model: 'gpt-5.5',
          provider: 'gflab',
          reasoning_effort: 'xhigh',
        },
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:gflab-enforcement-no-output-schema'],
      },
      stagePacketRef: 'packet:gflab-enforcement-no-output-schema',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'receipt:gflab-enforcement-without-output-schema',
    ]);
    assert.equal(receipt.process_output_summary?.closeout_enforcement?.status, 'closeout_found');
    assert.equal(
      receipt.process_output_summary?.closeout_enforcement?.captured_last_message_chars,
      JSON.stringify(closeout).length + 1,
    );
    const captured = fs.readFileSync(capturePath, 'utf8').trim().split('\n');
    assert.notEqual(captured[0], '');
    assert.equal(captured[1], 'false');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousRecoveryTimeout === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('Codex stage runner injects provider-hosted stage attempt identity into live Codex env', async () => {
  const expectedStagePacketRef = 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/dispatch.json';
  const expectedWorkspaceRoot = '/tmp/should-be-overwritten-by-attempt';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  closeout=$(node -e 'const keys = ["OPL_STAGE_ATTEMPT_ID","OPL_STAGE_ID","OPL_STAGE_PACKET_REF","OPL_WORKSPACE_ROOT","OPL_TASK_ID","OPL_WORKFLOW_ID","OPL_STUDY_ID","OPL_QUEST_ID","OPL_ACTION_TYPE","OPL_WORK_UNIT_ID","OPL_PROVIDER_ATTEMPT_REF","OPL_ATTEMPT_LEASE_REF","OPL_ATTEMPT_LEASE_STATUS","OPL_EXECUTION_AUTHORIZATION_DECISION_REF"]; const refs = keys.map((key) => key + "=" + (process.env[key] || "")); process.stdout.write(JSON.stringify({surface_kind:"stage_attempt_closeout_packet", closeout_refs: refs, next_owner:"med-autoscience", domain_ready_verdict:"domain_gate_pending"}));')
  printf '{"type":"thread.started","thread_id":"thread-stage-env"}\\n'
  printf '%s\\n' "$(node -e 'const text = process.argv[1]; process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"agent_message",id:"msg-env",text}}));' "$closeout")"
  printf '{"type":"turn.completed"}\\n'
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
        stage_attempt_id: 'sat_provider_identity_test',
        workflow_id: 'wf_provider_identity_test',
        task_id: 'frt_provider_identity_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          action_type: 'return_to_ai_reviewer_workflow',
          source_refs: [
            {
              role: 'owner_route_work_unit_fingerprint',
              ref: 'truth-snapshot::12538a8351d7513191c2e514',
            },
          ],
        },
        checkpoint_refs: [expectedStagePacketRef],
      },
      stagePacketRef: expectedStagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
        OPL_WORKSPACE_ROOT: expectedWorkspaceRoot,
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'OPL_STAGE_ATTEMPT_ID=sat_provider_identity_test',
      'OPL_STAGE_ID=domain_owner/default-executor-dispatch',
      `OPL_STAGE_PACKET_REF=${expectedStagePacketRef}`,
      `OPL_WORKSPACE_ROOT=${fixtureRoot}`,
      'OPL_TASK_ID=frt_provider_identity_test',
      'OPL_WORKFLOW_ID=wf_provider_identity_test',
      'OPL_STUDY_ID=003-dpcc-primary-care-phenotype-treatment-gap',
      'OPL_QUEST_ID=003-dpcc-primary-care-phenotype-treatment-gap',
      'OPL_ACTION_TYPE=return_to_ai_reviewer_workflow',
      'OPL_WORK_UNIT_ID=truth-snapshot::12538a8351d7513191c2e514',
      'OPL_PROVIDER_ATTEMPT_REF=',
      'OPL_ATTEMPT_LEASE_REF=',
      'OPL_ATTEMPT_LEASE_STATUS=',
      'OPL_EXECUTION_AUTHORIZATION_DECISION_REF=',
    ]);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner blocks dirty MAS checkout before launching Codex', async () => {
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  const checkoutRoot = path.join(masFixture.fixtureRoot, 'dirty-runner-checkout');
  const clone = spawnSync('git', ['clone', masFixture.remoteRoot, checkoutRoot], {
    cwd: path.dirname(checkoutRoot),
    encoding: 'utf8',
  });
  assert.equal(clone.status, 0, clone.stderr);
  fs.writeFileSync(path.join(checkoutRoot, 'dirty-uncommitted.txt'), 'dirty\n', 'utf8');
  try {
    await assert.rejects(
      () => runAgentStageRunner({
        attempt: {
          stage_attempt_id: 'sat_dirty_runner_checkout',
          workflow_id: 'wf_dirty_runner_checkout',
          task_id: 'frt_dirty_runner_checkout',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          executor_kind: 'codex_cli',
          workspace_locator: {
            workspace_root: checkoutRoot,
          },
          checkpoint_refs: ['packet:dirty-runner-checkout'],
        },
        stagePacketRef: 'packet:dirty-runner-checkout',
        runnerMode: 'codex_cli',
        timeoutMs: 10_000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.details?.blocked_reason, 'dirty_checkout');
        assert.equal(
          (error.details?.checkout_currentness_preflight as Record<string, unknown>)?.currentness_status,
          'dirty_fail_closed',
        );
        return true;
      },
    );
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner forwards explicit provider authorization and closeout binding refs without deriving active lease from identity', async () => {
  const expectedStagePacketRef = 'studies/003/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/dispatch.json';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  closeout=$(node -e 'const keys = ["OPL_STAGE_ATTEMPT_ID","OPL_PROVIDER_ATTEMPT_REF","OPL_ATTEMPT_LEASE_REF","OPL_ATTEMPT_LEASE_STATUS","OPL_EXECUTION_AUTHORIZATION_DECISION_REF","OPL_SOURCE_FINGERPRINT","OPL_IDEMPOTENCY_KEY","OPL_STAGE_RUN_ID","OPL_STAGE_MANIFEST_REF","OPL_CURRENT_POINTER_REF","OPL_CLOSEOUT_BINDING_JSON"]; const refs = keys.map((key) => key + "=" + (process.env[key] || "")); process.stdout.write(JSON.stringify({surface_kind:"stage_attempt_closeout_packet", closeout_refs: refs, next_owner:"med-autoscience", domain_ready_verdict:"domain_gate_pending"}));')
  printf '{"type":"thread.started","thread_id":"thread-stage-auth-env"}\\n'
  printf '%s\\n' "$(node -e 'const text = process.argv[1]; process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"agent_message",id:"msg-auth-env",text}}));' "$closeout")"
  printf '{"type":"turn.completed"}\\n'
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
        stage_attempt_id: 'sat_provider_authorized_test',
        workflow_id: 'wf_provider_authorized_test',
        task_id: 'frt_provider_authorized_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        opl_execution_authorization: {
          provider_attempt_ref: 'opl://stage-attempts/sat_provider_authorized_test',
          attempt_lease_ref: 'opl://stage-attempts/sat_provider_authorized_test/leases/frt_provider_authorized_test/active',
          attempt_lease_status: 'active',
          execution_authorization_decision_ref: 'opl://stage-attempts/sat_provider_authorized_test/execution-authorizations/frt_provider_authorized_test/wf_provider_authorized_test',
          source_fingerprint: 'mas_default_executor_source_provider_authorized_test',
          idempotency_key: 'idem_provider_authorized_test',
          stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
          stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
          current_pointer_ref:
            'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
        },
        checkpoint_refs: [expectedStagePacketRef],
      },
      stagePacketRef: expectedStagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
      },
    });

    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'OPL_STAGE_ATTEMPT_ID=sat_provider_authorized_test',
      'OPL_PROVIDER_ATTEMPT_REF=opl://stage-attempts/sat_provider_authorized_test',
      'OPL_ATTEMPT_LEASE_REF=opl://stage-attempts/sat_provider_authorized_test/leases/frt_provider_authorized_test/active',
      'OPL_ATTEMPT_LEASE_STATUS=active',
      'OPL_EXECUTION_AUTHORIZATION_DECISION_REF=opl://stage-attempts/sat_provider_authorized_test/execution-authorizations/frt_provider_authorized_test/wf_provider_authorized_test',
      'OPL_SOURCE_FINGERPRINT=mas_default_executor_source_provider_authorized_test',
      'OPL_IDEMPOTENCY_KEY=idem_provider_authorized_test',
      'OPL_STAGE_RUN_ID=app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
      'OPL_STAGE_MANIFEST_REF=opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
      'OPL_CURRENT_POINTER_REF=opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
      [
        'OPL_CLOSEOUT_BINDING_JSON=',
        JSON.stringify({
          surface_kind: 'opl_stage_run_closeout_binding',
          trusted_opl_execution_authorization: true,
          bound_to_stage_run: true,
          bound_to_stage_manifest: true,
          bound_to_current_pointer: true,
          bound_to_source_fingerprint: true,
          stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
          stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
          current_pointer_ref:
            'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
          provider_attempt_ref: 'opl://stage-attempts/sat_provider_authorized_test',
          attempt_lease_ref:
            'opl://stage-attempts/sat_provider_authorized_test/leases/frt_provider_authorized_test/active',
          attempt_lease_status: 'active',
          execution_authorization_decision_ref:
            'opl://stage-attempts/sat_provider_authorized_test/execution-authorizations/frt_provider_authorized_test/wf_provider_authorized_test',
          source_fingerprint: 'mas_default_executor_source_provider_authorized_test',
          idempotency_key: 'idem_provider_authorized_test',
        }),
      ].join(''),
    ]);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
