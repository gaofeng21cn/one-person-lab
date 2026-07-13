import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import './family-runtime-codex-stage-runner-cases/terminal-closeout-capture.ts';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';
import {
  buildCodexStageActivityInput,
} from '../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';

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

test('Codex stage activity accepts readable output without a typed closeout contract', () => {
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
  assert.match(commandPreview, /Partial drafts, negative findings, failed attempts/);
  assert.match(commandPreview, /final message may be structured JSON or ordinary readable text/);
  assert.match(commandPreview, /route to any declared stage/);
  assert.equal(activity.expected_closeout.typed_packet_required_for_progress, false);
  assert.equal(activity.expected_closeout.raw_or_free_text_artifact_accepted_for_progress, true);
  assert.equal(activity.expected_closeout.framework_derives_progress_envelope, true);
});

test('Codex stage activity hydrates the declared domain stage prompt body into the final command preview', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-effective-stage-prompt-'));
  const promptBody = [
    '# Evidence Synthesis',
    '',
    'Bind every accepted claim to current source evidence before a quality-ready handoff.',
    'Planning may iterate, but independent review must inspect the final artifact bytes.',
    '',
  ].join('\n');
  try {
    fs.mkdirSync(path.join(workspaceRoot, 'agent', 'stages'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'agent', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'agent', 'prompts', 'evidence-synthesis.md'), promptBody);
    fs.writeFileSync(path.join(workspaceRoot, 'agent', 'stages', 'manifest.json'), `${JSON.stringify({
      surface_kind: 'opl_standard_agent_declarative_stage_manifest',
      version: 'opl-standard-agent-declarative-stage-manifest.v1',
      stages: [{
        stage_id: 'evidence-synthesis',
        prompt_ref: 'agent/prompts/evidence-synthesis.md',
      }],
    }, null, 2)}\n`);

    const activity = buildCodexStageActivityInput({
      attempt: {
        stage_attempt_id: 'sat_effective_stage_prompt_test',
        stage_id: 'evidence-synthesis',
        executor_kind: 'codex_cli',
        workspace_locator: { workspace_root: workspaceRoot },
        checkpoint_refs: ['packet:effective-stage-prompt'],
      },
    });

    const commandPreview = activity.runner_status.command_preview.join('\n');
    assert.match(commandPreview, /OPL effective domain stage main prompt follows/);
    assert.match(commandPreview, /Prompt source ref: agent\/prompts\/evidence-synthesis\.md/);
    assert.match(commandPreview, /Prompt source layer: domain_stage_main_prompt/);
    assert.match(commandPreview, /Bind every accepted claim to current source evidence/);
    assert.match(commandPreview, /independent review must inspect the final artifact bytes/);
    assert.equal(activity.runner_status.effective_prompt.status, 'hydrated');
    assert.equal(activity.runner_status.effective_prompt.body_hydrated_into_executor_prompt, true);
    assert.match(activity.runner_status.effective_prompt.sha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(activity.runner_status.effective_prompt.size_bytes, Buffer.byteLength(promptBody, 'utf8'));
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
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

test('Codex stage activity prompt carries refs-only transport identity without an authorization control plane', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_codex_auth_prompt_test',
      workflow_id: 'wf_codex_auth_prompt_test',
      task_id: 'frt_codex_auth_prompt_test',
      domain_id: 'example-domain',
      stage_id: 'domain_owner/default-executor-dispatch',
      executor_kind: 'codex_cli',
      workspace_locator: {
        workspace_root: '/tmp/mas',
        domain_id: 'example-domain',
        domain_truth_owner: 'example-domain-owner',
        profile_ref: 'contracts/domain_route_profile.json',
        action_type: 'complete_domain_work_unit',
        candidate_ref: 'domain://example/candidates/current',
        domain_route_handoff_ref: 'domain-route-handoff://example/gate-clearing',
        domain_route_transaction_ref: 'domain-route-transaction://example/gate-clearing',
        domain_route_command_ref: 'domain-route-command://example/gate-clearing',
        command_kind: 'route_back',
        route_target: 'gate_clearing_claim_evidence_repair',
        command_cwd: '/tmp/one-person-lab',
        command_source: 'env_override',
        source_ref: 'domain://example/route-handoffs/current',
      },
      checkpoint_refs: ['studies/002/artifacts/supervision/consumer/default_executor_dispatches/immutable/packet.json'],
    },
  });

  const commandPreview = activity.runner_status.command_preview.join('\n');
  assert.match(commandPreview, /explicitly pass these OPL_\* bindings to the child command environment/);
  assert.match(commandPreview, /"OPL_PROVIDER_ATTEMPT_REF":"temporal:\/\/attempt\/sat_codex_auth_prompt_test"/);
  assert.doesNotMatch(commandPreview, /OPL_ATTEMPT_LEASE_STATUS/);
  assert.doesNotMatch(commandPreview, /OPL_EXECUTION_AUTHORIZATION_DECISION_REF/);
  assert.doesNotMatch(commandPreview, /OPL_CLOSEOUT_BINDING_JSON/);
  assert.match(commandPreview, /"OPL_STAGE_PACKET_REF":"studies\/002\/artifacts\/supervision\/consumer\/default_executor_dispatches\/immutable\/packet.json"/);
  assert.match(commandPreview, /"OPL_DOMAIN_ID":"example-domain"/);
  assert.match(commandPreview, /"OPL_DOMAIN_TRUTH_OWNER":"example-domain-owner"/);
  assert.match(commandPreview, /"OPL_CANDIDATE_REF":"domain:\/\/example\/candidates\/current"/);
  assert.match(commandPreview, /"OPL_DOMAIN_ROUTE_PROFILE_REF":"contracts\/domain_route_profile.json"/);
  assert.match(commandPreview, /"OPL_DOMAIN_ROUTE_HANDOFF_REF":"domain-route-handoff:\/\/example\/gate-clearing"/);
  assert.match(commandPreview, /"OPL_DOMAIN_ROUTE_TRANSACTION_REF":"domain-route-transaction:\/\/example\/gate-clearing"/);
  assert.match(commandPreview, /"OPL_DOMAIN_ROUTE_COMMAND_REF":"domain-route-command:\/\/example\/gate-clearing"/);
  assert.match(commandPreview, /"OPL_ROUTE_COMMAND_KIND":"route_back"/);
  assert.match(commandPreview, /"OPL_ROUTE_TARGET":"gate_clearing_claim_evidence_repair"/);
  assert.match(commandPreview, /"OPL_DOMAIN_COMMAND_CWD":"\/tmp\/one-person-lab"/);
  assert.match(commandPreview, /"OPL_DOMAIN_COMMAND_SOURCE":"env_override"/);
  assert.match(commandPreview, /"OPL_ROUTE_HANDOFF_SOURCE_REF":"domain-route-handoff:\/\/example\/gate-clearing"/);
  assert.match(commandPreview, /do not authorize semantic routing, domain truth, artifact, quality, or readiness claims/);
});

test('Codex stage activity prompt enforces generic domain-route boundaries', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_codex_paper_route_prompt_test',
      domain_id: 'medautoscience',
      stage_id: 'continue paper-facing submission milestone work',
      executor_kind: 'codex_cli',
      workspace_locator: {
        surface_kind: 'opl_domain_route_runtime_request',
        task_kind: 'domain_route/stage-route',
        runtime_request_kind: 'domain_route_stage_route',
        profile_ref: 'contracts/domain_route_profile.json',
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
  assert.match(commandPreview, /OPL domain-route execution context/);
  assert.match(commandPreview, /Domain profile ref: contracts\/domain_route_profile.json/);
  assert.match(commandPreview, /Use the selected domain agent entry and the domain-owned profile or source refs/);
  assert.match(commandPreview, /already running inside OPL provider-backed runtime/);
  assert.match(commandPreview, /Do not recursively enqueue, redrive, tick, start, or submit another OPL runtime task/);
  assert.match(commandPreview, /Do not write domain truth, quality verdicts, owner receipts, typed blockers, human gates, current packages, or artifact bodies/);
  assert.match(commandPreview, /must include domain-provided user-readable stage semantics/);
  assert.match(commandPreview, /do not report provider liveness or platform repair as domain progress/);
});

test('Codex stage runner treats a missing packet as advisory but still requires an execution workspace', async () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_missing_packet_binding_test',
      stage_id: 'domain_owner/default-executor-dispatch',
      workspace_locator: {
        workspace_root: '/tmp/mas',
      },
    },
  });
  assert.equal(activity.stage_packet_binding.binding_status, 'advisory_missing_stage_packet_ref');
  assert.equal(activity.stage_packet_binding.stage_may_start_from_declared_context, true);

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

test('Codex stage runner turns free-text output into consumable progress', async () => {
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
    assert.equal(receipt.runner_status.typed_closeout_required_for_progress, false);
    assert.equal(receipt.runner_status.raw_artifact_sufficient_for_progress, true);
    assert.equal(receipt.closeout_packet?.domain_ready_verdict, 'completed_with_quality_debt');
    assert.equal(receipt.closeout_packet?.route_impact?.next_stage_may_start, true);
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
    assert.equal(capturedArgs.indexOf('--output-schema'), -1);
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
