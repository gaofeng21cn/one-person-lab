import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { runAgentStageRunner } from '../../src/family-runtime-codex-stage-runner.ts';

async function runPublicCodexStageRunner(
  input: Parameters<typeof runAgentStageRunner>[0],
) {
  const receipt = await runAgentStageRunner(input);
  assert.equal(receipt.runner_status.runner_kind, 'codex_cli_stage_runner');
  assert.ok('closeout_packet' in receipt, 'Codex stage runner receipt must expose closeout_packet.');
  return receipt;
}

test('Codex stage runner recovers MAS default-executor receipt when final closeout message is missing', async () => {
  const threadId = 'thread-mas-default-executor-receipt-recovery';
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stagePacketRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json`;
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-27T06:25:00.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const stagePacketPath = path.join(fixtureRoot, stagePacketRef);
  fs.mkdirSync(path.dirname(stagePacketPath), { recursive: true });
  fs.writeFileSync(stagePacketPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_request',
    dispatch_status: 'ready',
    study_id: studyId,
    quest_id: studyId,
    action_type: 'return_to_ai_reviewer_workflow',
    action_fingerprint: 'truth-snapshot::reviewer-currentness',
    idempotency_key: 'owner-route::reviewer-currentness',
    owner_route: {
      next_owner: 'ai_reviewer',
      owner_reason: 'ai_reviewer_record_stale_after_current_manuscript',
      allowed_actions: ['return_to_ai_reviewer_workflow'],
      currentness_contract: {
        basis: {
          truth_epoch: 'truth-event-000010',
          runtime_health_epoch: 'runtime-health-event-006069',
          work_unit_fingerprint: 'truth-snapshot::reviewer-currentness',
          work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
          owner_reason: 'ai_reviewer_record_stale_after_current_manuscript',
        },
      },
    },
    prompt_contract: {
      owner_route: {
        next_owner: 'ai_reviewer',
        owner_reason: 'ai_reviewer_record_stale_after_current_manuscript',
        allowed_actions: ['return_to_ai_reviewer_workflow'],
      },
    },
  })}\n`);
  const executionRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/latest.json`;
  const executionPath = path.join(fixtureRoot, executionRef);
  fs.mkdirSync(path.dirname(executionPath), { recursive: true });
  fs.writeFileSync(executionPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_execution_study_latest',
    schema_version: 1,
    study_id: studyId,
    generated_at: '2026-05-27T06:24:24Z',
    executions: [{
      surface: 'default_executor_dispatch_execution',
      schema_version: 1,
      study_id: studyId,
      quest_id: studyId,
      action_type: 'run_quality_repair_batch',
      action_fingerprint: 'truth-snapshot::other-owner-route',
      idempotency_key: 'owner-route::other-owner-route',
      execution_status: 'executed',
      execution_id: 'execution::003::run_quality_repair_batch::20260527T062500Z',
    }],
    execution_ledger: [{
      surface: 'default_executor_dispatch_execution',
      schema_version: 1,
      study_id: studyId,
      quest_id: studyId,
      action_type: 'return_to_ai_reviewer_workflow',
      action_fingerprint: 'sha256:domain-dispatch-execution-fingerprint',
      idempotency_key: 'owner-route::reviewer-currentness',
      execution_status: 'blocked',
      blocked_reason: 'ai_reviewer_workflow_failed',
      error: 'ai_reviewer_record_current_manuscript_digest_mismatch',
      execution_id: 'execution::003::return_to_ai_reviewer_workflow::20260527T062424Z',
      owner_callable_surface: 'ai_reviewer_publication_eval_workflow.run_ai_reviewer_publication_eval_workflow',
      required_output_surface: 'artifacts/publication_eval/latest.json',
      owner_route_current: true,
      owner_route_basis: 'owner_request',
      current_owner_route: {
        next_owner: 'ai_reviewer',
        owner_reason: 'ai_reviewer_record_stale_after_current_manuscript',
        allowed_actions: ['return_to_ai_reviewer_workflow'],
        currentness_contract: {
          basis: {
            truth_epoch: 'truth-event-000010',
            runtime_health_epoch: 'runtime-health-event-006069',
            work_unit_fingerprint: 'truth-snapshot::reviewer-currentness',
            work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
            owner_reason: 'ai_reviewer_record_stale_after_current_manuscript',
          },
        },
      },
      owner_result: {
        status: 'blocked',
        ok: false,
        blocked_reason: 'ai_reviewer_record_current_manuscript_digest_mismatch',
        quality_authorized: false,
        submission_authorized: false,
        current_package_write_authorized: false,
      },
    }],
  })}\n`);

  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_mas_receipt_recovery_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_id: 'medautoscience',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: [stagePacketRef],
      },
      stagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'domain_stage_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [`${executionRef}#execution_ledger`]);
    assert.equal(receipt.closeout_packet?.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(receipt.closeout_packet?.route_impact?.blocked_reason, 'ai_reviewer_record_current_manuscript_digest_mismatch');
    assert.equal(receipt.process_output_summary?.domain_receipt_recovery_status, 'closeout_found');
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

test('Codex stage runner does not recover stale MAS default-executor receipts from another owner route', async () => {
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stagePacketRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json`;
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-27T06:25:00.000Z","type":"session_meta","payload":{"id":"thread-stale-mas-receipt"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const stagePacketPath = path.join(fixtureRoot, stagePacketRef);
  fs.mkdirSync(path.dirname(stagePacketPath), { recursive: true });
  fs.writeFileSync(stagePacketPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_request',
    dispatch_status: 'ready',
    study_id: studyId,
    action_type: 'return_to_ai_reviewer_workflow',
    action_fingerprint: 'truth-snapshot::current-owner-route',
    idempotency_key: 'owner-route::current-owner-route',
  })}\n`);
  const executionPath = path.join(
    fixtureRoot,
    `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/latest.json`,
  );
  fs.mkdirSync(path.dirname(executionPath), { recursive: true });
  fs.writeFileSync(executionPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_execution_study_latest',
    schema_version: 1,
    study_id: studyId,
    executions: [{
      surface: 'default_executor_dispatch_execution',
      schema_version: 1,
      study_id: studyId,
      action_type: 'return_to_ai_reviewer_workflow',
      action_fingerprint: 'truth-snapshot::stale-owner-route',
      idempotency_key: 'owner-route::stale-owner-route',
      execution_status: 'blocked',
      blocked_reason: 'owner_route_stale',
      execution_id: 'execution::003::return_to_ai_reviewer_workflow::stale',
    }],
  })}\n`);

  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_stale_mas_receipt_recovery_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_id: 'medautoscience',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: [stagePacketRef],
      },
      stagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet, null);
    assert.equal(receipt.process_output_summary?.domain_receipt_recovery_status, 'matching_execution_not_found');
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

test('Codex stage runner requires MAS default-executor dispatch identity before receipt recovery', async () => {
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stagePacketRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json`;
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-27T06:25:00.000Z","type":"session_meta","payload":{"id":"thread-missing-identity-mas-receipt"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const stagePacketPath = path.join(fixtureRoot, stagePacketRef);
  fs.mkdirSync(path.dirname(stagePacketPath), { recursive: true });
  fs.writeFileSync(stagePacketPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_request',
    dispatch_status: 'ready',
    study_id: studyId,
    action_type: 'return_to_ai_reviewer_workflow',
  })}\n`);
  const executionPath = path.join(
    fixtureRoot,
    `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/latest.json`,
  );
  fs.mkdirSync(path.dirname(executionPath), { recursive: true });
  fs.writeFileSync(executionPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_execution_study_latest',
    schema_version: 1,
    study_id: studyId,
    executions: [{
      surface: 'default_executor_dispatch_execution',
      schema_version: 1,
      study_id: studyId,
      action_type: 'return_to_ai_reviewer_workflow',
      action_fingerprint: 'truth-snapshot::some-owner-route',
      idempotency_key: 'owner-route::some-owner-route',
      execution_status: 'blocked',
      blocked_reason: 'owner_route_unknown',
      execution_id: 'execution::003::return_to_ai_reviewer_workflow::unknown',
    }],
  })}\n`);

  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_missing_identity_mas_receipt_recovery_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_id: 'medautoscience',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: [stagePacketRef],
      },
      stagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet, null);
    assert.equal(receipt.process_output_summary?.domain_receipt_recovery_status, 'matching_execution_not_found');
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
