import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture, shellSingleQuote } from './cli/helpers.ts';
import {
  buildCodexStageActivityInput,
  runAgentStageRunner,
} from '../../src/family-runtime-codex-stage-runner.ts';
import { FrameworkContractError } from '../../src/contracts.ts';

async function runPublicCodexStageRunner(
  input: Parameters<typeof runAgentStageRunner>[0],
) {
  const receipt = await runAgentStageRunner(input);
  assert.equal(receipt.runner_status.runner_kind, 'codex_cli_stage_runner');
  assert.ok('closeout_packet' in receipt, 'Codex stage runner receipt must expose closeout_packet.');
  return receipt;
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
  assert.match(commandPreview, /do not grant domain truth, artifact, quality, or readiness authority/);
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

    assert.equal(receipt.closeout_packet, null);
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
    const receipt = await runPublicCodexStageRunner({
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

test('Codex stage runner ingests session usage as refs-only cumulative total deltas', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-session-usage-closeout'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const threadId = 'thread-session-usage-delta';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-29T01:00:00.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  printf '{"type":"event_msg","payload":{"last_token_usage":{"input_tokens":999,"output_tokens":999,"total_tokens":1998}}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '29');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-29T01-00-00-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-05-29T01:00:00.000Z',
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:00:05.000Z',
      type: 'event_msg',
      payload: {
        absolute_cumulative_token_usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:06:00.000Z',
      type: 'event_msg',
      payload: {
        absolute_cumulative_token_usage: {
          input_tokens: 260,
          output_tokens: 140,
          total_tokens: 400,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:06:00.500Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(closeout) }],
        phase: 'final_answer',
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:06:01.000Z',
      type: 'event_msg',
      payload: {
        last_token_usage: {
          input_tokens: 999,
          output_tokens: 999,
          total_tokens: 1998,
        },
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_usage_delta_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-usage-delta'],
      },
      stagePacketRef: 'packet:session-usage-delta',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.equal(receipt.cost_summary.token_usage.total_tokens, 250);
    assert.equal(receipt.cost_summary.token_usage.input_tokens, 160);
    assert.equal(receipt.cost_summary.token_usage.output_tokens, 90);
    assert.equal(receipt.cost_summary.session_usage_refs?.session_ref, `codex_session:${threadId}`);
    assert.equal(receipt.cost_summary.session_usage_refs?.source_path, sessionPath);
    assert.match(receipt.cost_summary.session_usage_refs?.source_hash ?? '', /^sha256:/);
    assert.deepEqual(receipt.cost_summary.session_usage_refs?.time_window, {
      started_at: '2026-05-29T01:00:05.000Z',
      completed_at: '2026-05-29T01:06:00.000Z',
    });
    assert.equal(receipt.cost_summary.session_usage_refs?.billing_boundary, 'refs_only_absolute_cumulative_total_delta');
    assert.equal(
      receipt.cost_summary.session_usage_refs?.ignored_usage_fields.includes('last_token_usage'),
      true,
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
    const receipt = await runPublicCodexStageRunner({
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

test('Codex stage runner stops the live Codex process when Temporal activity cancellation aborts the run', async () => {
  const childPidPath = path.join(os.tmpdir(), `opl-codex-cancelled-child-${Date.now()}.txt`);
  const waitForChildPidFile = async () => {
    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      if (fs.existsSync(childPidPath)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('fake Codex child pid was not recorded before cancellation.');
  };
  const waitForPidExit = async (pid: number) => {
    const deadline = Date.now() + 1_000;
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
      timeoutMs: 1_500,
      signal: controller.signal,
    });
    await cancelWhenChildStarts;

    assert.equal(receipt.closeout_packet, null);
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
