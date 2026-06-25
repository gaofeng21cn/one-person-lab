import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';
import {
  buildCodexStageActivityInput,
  createCodexCloseoutCaptureForTest,
  stageCloseoutOutputSchemaForTest,
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
    const receipt = await runPublicCodexStageRunner({
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
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_prose_prefixed_closeout_test/runtime-blockers/codex_cli_typed_closeout_not_materialized',
    ]);
    assert.equal(
      receipt.closeout_packet?.route_impact?.provider_blocker_reason,
      'codex_cli_typed_closeout_not_materialized',
    );
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
    const receipt = await runPublicCodexStageRunner({
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
if [ -z "$output_last_message" ] || [ -z "$output_schema" ]; then
  echo "missing structured output capture args" >&2
  exit 64
fi
if ! grep -q '"uri"' "$output_schema"; then
  echo "schema does not allow object uri closeout refs" >&2
  exit 64
fi
dirname "$output_schema" > "$capture_root_log"
printf '%s\\n' '${JSON.stringify(closeout)}' > "$output_last_message"
printf '{"type":"thread.started","thread_id":"thread-output-last-message-closeout"}\\n'
printf '{"type":"turn.completed"}\\n'
exit 0
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
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
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = await runPublicCodexStageRunner({
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
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_current_attempt/runtime-blockers/typed_closeout_stage_attempt_id_mismatch',
    ]);
    assert.equal(receipt.closeout_packet?.stage_attempt_id, 'sat_current_attempt');
    assert.equal(receipt.process_output_summary?.closeout_rejection_reason, 'stage_attempt_id_mismatch');
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
    const receipt = await runPublicCodexStageRunner({
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
    const receipt = await runPublicCodexStageRunner({
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
    const receipt = await runPublicCodexStageRunner({
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
    const receipt = await runPublicCodexStageRunner({
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
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_nonterminal_closeout_test/runtime-blockers/codex_cli_typed_closeout_not_materialized',
    ]);
    assert.equal(
      receipt.closeout_packet?.route_impact?.provider_blocker_reason,
      'codex_cli_typed_closeout_not_materialized',
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
