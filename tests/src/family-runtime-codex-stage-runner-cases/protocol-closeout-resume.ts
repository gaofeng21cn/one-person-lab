import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { createFakeCodexFixture } from '../cli/helpers.ts';
import { runPublicCodexStageRunner } from '../family-runtime-codex-stage-runner-helpers.ts';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function materializeCheckoutCurrentnessProfile(repoRoot: string) {
  const contractsRoot = path.join(repoRoot, 'contracts');
  fs.mkdirSync(contractsRoot, { recursive: true });
  fs.writeFileSync(path.join(contractsRoot, 'domain_descriptor.json'), `${JSON.stringify({
    standard_contract_refs: {
      domain_owner_answer_projection_profile: 'contracts/domain_owner_answer_projection_profile.json',
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(contractsRoot, 'domain_owner_answer_projection_profile.json'), `${JSON.stringify({
    surface_kind: 'opl_domain_owner_answer_projection_profile',
    version: 'domain-owner-answer-projection-profile.v1',
    profile_id: 'medautoscience.checkout-currentness.v1',
    profile_role: 'registry',
    domain_id: 'medautoscience',
    binding_project_id: 'medautoscience',
    source_owner: 'med-autoscience',
    checkout_currentness_required: true,
    studies_dir_name: 'studies',
    projection_relative_path: ['artifacts', 'publication_handoff', 'owner_receipt.json'],
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  }, null, 2)}\n`);
}

test('formal quality Attempt uses one same-thread closeout-only resume without consuming Review budget', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-protocol-closeout-resume',
    closeout_refs: ['review:protocol-closeout'],
    consumed_refs: ['artifact:reviewed'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    domain_ready_verdict: null,
    route_impact: {
      stage_quality_cycle: { outcome: 'pass', findings: [] },
    },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
  const resumeEvent = JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', id: 'resume-closeout', text: JSON.stringify(closeout) },
  });
  const invocationLog = path.join(os.tmpdir(), 'opl-protocol-closeout-resume-' + process.pid + '.log');
  fs.rmSync(invocationLog, { force: true });
  const script = [
    'if [ "$1" = "exec" ] && [ "${2:-}" = "resume" ]; then',
    '  printf "%s\\n" "$*" >> ' + JSON.stringify(invocationLog),
    '  printf \'{"type":"thread.started","thread_id":"thread-protocol-closeout"}\\n\'',
    '  printf "%s\\n" ' + JSON.stringify(resumeEvent),
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'if [ "$1" = "exec" ]; then',
    '  printf \'{"type":"thread.started","thread_id":"thread-protocol-closeout"}\\n\'',
    '  printf \'{"type":"item.completed","item":{"type":"agent_message","id":"initial","text":"review completed but closeout omitted"}}\\n\'',
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'exit 64',
  ].join('\n');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(script);
  const previousBin = process.env.OPL_CODEX_BIN;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousRecoveryInterval = process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat-protocol-closeout-resume',
        stage_run_id: 'sr-protocol-closeout-resume',
        quality_cycle_id: 'quality-cycle:sr-protocol-closeout-resume',
        attempt_role: 'reviewer',
        quality_round_index: 0,
        stage_id: 'review',
        domain_id: 'example-domain',
        workspace_locator: { workspace_root: fixtureRoot },
        checkpoint_refs: ['packet:review'],
      },
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
    });
    assert.equal(receipt.closeout_packet?.stage_attempt_id, 'sat-protocol-closeout-resume');
    const protocol = receipt.process_output_summary?.protocol_closeout_resume as Record<string, unknown>;
    assert.equal(protocol.status, 'completed');
    assert.equal(protocol.same_thread, true);
    assert.equal(protocol.creates_stage_attempt, false);
    assert.equal(protocol.counts_as_review, false);
    assert.equal(protocol.consumes_quality_budget, false);
    assert.equal(protocol.may_change_artifact_bytes, false);
    const invocation = fs.readFileSync(invocationLog, 'utf8');
    assert.equal(invocation.match(/exec resume --skip-git-repo-check/g)?.length, 1);
    assert.match(invocation, /--config sandbox_mode="read-only"/);
    assert.match(invocation, /protocol_closeout_resume, not Review/);
    assert.match(invocation, /Do not call tools, edit files, change artifact bytes/);
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS', previousRecoveryTimeout);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS', previousRecoveryInterval);
    fs.rmSync(invocationLog, { force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('protocol closeout resume is failed when the returned packet does not bind the current Attempt', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-wrong-attempt',
    closeout_refs: ['review:wrong-attempt'],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    domain_ready_verdict: null,
    route_impact: { stage_quality_cycle: { outcome: 'pass', findings: [] } },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
  const resumeEvent = JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', id: 'resume-closeout', text: JSON.stringify(closeout) },
  });
  const script = [
    'if [ "$1" = "exec" ] && [ "${2:-}" = "resume" ]; then',
    '  printf \'{"type":"thread.started","thread_id":"thread-protocol-rejected"}\\n\'',
    '  printf "%s\\n" ' + JSON.stringify(resumeEvent),
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'if [ "$1" = "exec" ]; then',
    '  printf \'{"type":"thread.started","thread_id":"thread-protocol-rejected"}\\n\'',
    '  printf \'{"type":"item.completed","item":{"type":"agent_message","id":"initial","text":"closeout omitted"}}\\n\'',
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'exit 64',
  ].join('\n');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(script);
  const previousBin = process.env.OPL_CODEX_BIN;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousRecoveryInterval = process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat-protocol-rejected',
        stage_run_id: 'sr-protocol-rejected',
        quality_cycle_id: 'quality-cycle:sr-protocol-rejected',
        attempt_role: 'reviewer',
        quality_round_index: 0,
        stage_id: 'review',
        domain_id: 'example-domain',
        workspace_locator: { workspace_root: fixtureRoot },
        checkpoint_refs: ['packet:review'],
      },
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
    });
    assert.equal(receipt.closeout_packet?.stage_attempt_id, 'sat-protocol-rejected');
    assert.equal(receipt.closeout_packet?.domain_ready_verdict, 'completed_with_quality_debt');
    assert.equal(receipt.process_output_summary?.protocol_closeout_resume?.status, 'failed');
    assert.equal(receipt.process_output_summary?.closeout_rejection_reason, 'stage_attempt_id_mismatch');
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS', previousRecoveryTimeout);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS', previousRecoveryInterval);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('protocol closeout resume rejects tool execution and preserves only the original raw progress artifact', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-protocol-tool-violation',
    closeout_refs: ['artifact:must-not-be-accepted'],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    domain_ready_verdict: null,
    route_impact: {
      stage_quality_cycle: {
        artifact_refs: ['artifact:must-not-be-accepted'],
        artifact_hashes: ['0'.repeat(64)],
      },
    },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
  const resumeCommand = JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'command_execution',
      id: 'resume-command',
      command: 'touch forbidden.txt',
      status: 'completed',
      aggregated_output: '',
    },
  });
  const resumeUnsupportedFunction = JSON.stringify({
    type: 'response_item',
    payload: {
      type: 'function_call',
      call_id: 'resume-unsupported-function',
      name: 'write_file',
      arguments: '{}',
    },
  });
  const resumeCloseout = JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', id: 'resume-closeout', text: JSON.stringify(closeout) },
  });
  const script = [
    'if [ "$1" = "exec" ] && [ "${2:-}" = "resume" ]; then',
    '  printf \'{"type":"thread.started","thread_id":"thread-protocol-tool-violation"}\\n\'',
    '  printf "%s\\n" ' + JSON.stringify(resumeCommand),
    '  printf "%s\\n" ' + JSON.stringify(resumeUnsupportedFunction),
    '  printf "%s\\n" ' + JSON.stringify(resumeCloseout),
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'if [ "$1" = "exec" ]; then',
    '  printf \'{"type":"thread.started","thread_id":"thread-protocol-tool-violation"}\\n\'',
    '  printf \'{"type":"item.completed","item":{"type":"agent_message","id":"initial","text":"producer draft completed without typed closeout"}}\\n\'',
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'exit 64',
  ].join('\n');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(script);
  const previousBin = process.env.OPL_CODEX_BIN;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousRecoveryInterval = process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_STATE_DIR = path.join(fixtureRoot, 'opl-state');
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat-protocol-tool-violation',
        stage_run_id: 'sr-protocol-tool-violation',
        quality_cycle_id: 'quality-cycle:sr-protocol-tool-violation',
        attempt_role: 'producer',
        quality_round_index: 0,
        stage_id: 'authoring',
        domain_id: 'example-domain',
        workspace_locator: { workspace_root: fixtureRoot },
        checkpoint_refs: ['packet:authoring'],
      },
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
    });
    assert.equal(receipt.process_output_summary?.protocol_closeout_resume?.status, 'failed');
    assert.equal(receipt.process_output_summary?.protocol_closeout_resume?.protocol_violation, 'tool_or_command_event_observed');
    assert.deepEqual(receipt.process_output_summary?.protocol_closeout_resume?.tool_event_kinds, [
      'command_execution',
      'unsupported_function_call',
    ]);
    assert.equal(receipt.process_output_summary?.protocol_closeout_resume?.may_change_artifact_bytes, true);
    assert.equal(
      receipt.closeout_packet?.authority_boundary.opl,
      'raw_executor_output_progress_envelope_only',
    );
    assert.notEqual(receipt.closeout_packet?.closeout_refs[0], 'artifact:must-not-be-accepted');
    assert.equal(
      typeof receipt.closeout_packet?.closeout_ref_metadata?.[0]?.artifact_identity_receipt_ref,
      'string',
    );
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS', previousRecoveryTimeout);
    restoreEnv('OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS', previousRecoveryInterval);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('child Review inherits StageRun currentness admission after producer artifact writes dirty the checkout', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-currentness-reviewer',
    closeout_refs: ['review:currentness'],
    consumed_refs: ['artifact:producer-output'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    domain_ready_verdict: null,
    route_impact: { stage_quality_cycle: { outcome: 'pass', findings: [] } },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
  const event = JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', id: 'review-closeout', text: JSON.stringify(closeout) },
  });
  const script = [
    'if [ "$1" = "exec" ]; then',
    '  printf \'{"type":"thread.started","thread_id":"thread-currentness-reviewer"}\\n\'',
    '  printf "%s\\n" ' + JSON.stringify(event),
    '  printf \'{"type":"turn.completed"}\\n\'',
    '  exit 0',
    'fi',
    'exit 64',
  ].join('\n');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(script);
  const domainRoot = path.join(fixtureRoot, 'med-autoscience');
  materializeCheckoutCurrentnessProfile(domainRoot);
  execFileSync('git', ['init', '-q'], { cwd: domainRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: domainRoot });
  execFileSync('git', ['config', 'user.name', 'OPL Test'], { cwd: domainRoot });
  fs.writeFileSync(path.join(domainRoot, 'tracked.txt'), 'baseline\n');
  execFileSync('git', ['add', '.'], { cwd: domainRoot });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: domainRoot });
  const admittedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: domainRoot, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(domainRoot, 'producer-output.txt'), 'new stage artifact\n');

  const previousBin = process.env.OPL_CODEX_BIN;
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = fixtureRoot;
    const baseAttempt = {
      stage_attempt_id: 'sat-currentness-reviewer',
      stage_run_id: 'sr-currentness-admission',
      quality_cycle_id: 'quality-cycle:sr-currentness-admission',
      attempt_role: 'reviewer',
      quality_round_index: 0,
      stage_id: 'review',
      domain_id: 'medautoscience',
      checkpoint_refs: ['packet:review'],
    };
    await assert.rejects(
      () => runPublicCodexStageRunner({
        attempt: {
          ...baseAttempt,
          workspace_locator: { workspace_root: domainRoot },
        },
        runnerMode: 'codex_cli',
        env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'dirty_checkout',
    );

    const receipt = await runPublicCodexStageRunner({
      attempt: {
        ...baseAttempt,
        workspace_locator: {
          workspace_root: domainRoot,
          stage_run_currentness_admission: {
            surface_kind: 'opl_stage_run_currentness_admission',
            stage_run_id: baseAttempt.stage_run_id,
            status: 'current',
            head_sha: admittedHead,
            child_attempts_inherit_admission: true,
          },
        },
      },
      runnerMode: 'codex_cli',
      env: { OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' },
    });
    assert.equal(receipt.closeout_packet?.stage_attempt_id, baseAttempt.stage_attempt_id);
    assert.equal(receipt.progress_summary.thread_id, 'thread-currentness-reviewer');
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_FAMILY_WORKSPACE_ROOT', previousFamilyWorkspaceRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
