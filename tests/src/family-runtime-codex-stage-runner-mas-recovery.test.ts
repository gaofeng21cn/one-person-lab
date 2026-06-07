import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeCodexFixture, shellSingleQuote } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';

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

test('Codex stage runner refuses MAS default-executor recovery without current OPL authorization binding', async () => {
  const threadId = 'thread-mas-default-executor-recovery-with-stale-auth';
  const studyId = '002-dm-china-us-mortality-attribution';
  const stagePacketRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/packet.json`;
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-06-06T07:30:00.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
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
    action_type: 'complete_medical_paper_readiness_surface',
    action_fingerprint: 'paper_progress_stall:current-readiness',
    idempotency_key: 'owner-route::current-readiness',
  })}\n`);
  const executionRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/latest.json`;
  const executionPath = path.join(fixtureRoot, executionRef);
  fs.mkdirSync(path.dirname(executionPath), { recursive: true });
  fs.writeFileSync(executionPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_execution_study_latest',
    schema_version: 1,
    study_id: studyId,
    generated_at: '2026-06-06T07:23:27Z',
    executions: [{
      surface: 'default_executor_dispatch_execution',
      schema_version: 1,
      study_id: studyId,
      quest_id: studyId,
      action_type: 'complete_medical_paper_readiness_surface',
      action_fingerprint: 'paper_progress_stall:current-readiness',
      idempotency_key: 'owner-route::current-readiness',
      execution_status: 'blocked',
      blocked_reason: 'opl_execution_authorization_required',
      execution_id: 'execution::002::complete_medical_paper_readiness_surface::stale',
      owner_callable_surface: null,
      required_output_surface: 'complete_medical_paper_readiness_surface',
    }],
  })}\n`);

  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_current_auth_recovery_test',
        workflow_id: 'wf_current_auth_recovery_test',
        task_id: 'frt_current_auth_recovery_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_id: 'medautoscience',
        source_fingerprint: 'mas_default_executor_source_current_auth',
        idempotency_key: 'owner-route::current-readiness',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        opl_execution_authorization: {
          owner: 'one-person-lab',
          executor_kind: 'codex_cli',
          provider_attempt_ref: 'temporal://attempt/sat_current_auth_recovery_test',
          stage_attempt_id: 'sat_current_auth_recovery_test',
          attempt_lease_ref: 'opl://stage-attempts/sat_current_auth_recovery_test/leases/frt_current_auth_recovery_test/active',
          attempt_lease_status: 'active',
          execution_authorization_decision_ref: 'opl://stage-attempts/sat_current_auth_recovery_test/execution-authorizations/frt_current_auth_recovery_test/wf_current_auth_recovery_test',
          source_fingerprint: 'mas_default_executor_source_current_auth',
          idempotency_key: 'owner-route::current-readiness',
        },
        checkpoint_refs: [stagePacketRef],
      },
      stagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet, null);
    assert.equal(receipt.process_output_summary?.domain_receipt_recovery_status, 'authorization_binding_mismatch');
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

test('Codex stage runner invokes MAS owner dispatch under current OPL authorization before receipt recovery', async () => {
  const threadId = 'thread-mas-owner-dispatch-bridge';
  const studyId = '002-dm-china-us-mortality-attribution';
  const actionType = 'complete_medical_paper_readiness_surface';
  const stagePacketRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/immutable/${actionType}/packet.json`;
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-06-06T08:30:00.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const stagePacketPath = path.join(fixtureRoot, stagePacketRef);
  const profileRef = path.join(fixtureRoot, 'ops', 'medautoscience', 'profiles', 'dm-cvd.local.toml');
  const runnerPath = path.join(fixtureRoot, 'scripts', 'run-python-clean.sh');
  const executionRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/latest.json`;
  const executionPath = path.join(fixtureRoot, executionRef);
  const invokedPath = path.join(fixtureRoot, 'mas-owner-dispatch.invoked.json');
  fs.mkdirSync(path.dirname(stagePacketPath), { recursive: true });
  fs.mkdirSync(path.dirname(profileRef), { recursive: true });
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  fs.writeFileSync(profileRef, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(stagePacketPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_request',
    dispatch_status: 'ready',
    domain_id: 'medautoscience',
    study_id: studyId,
    quest_id: studyId,
    action_type: actionType,
    action_fingerprint: 'paper_progress_stall:current-readiness',
    idempotency_key: 'idem_mas_owner_dispatch_bridge',
    profile_ref: profileRef,
  })}\n`);
  fs.writeFileSync(
    runnerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `${shellSingleQuote(process.execPath)} <<'NODE'`,
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      `const fixtureRoot = ${JSON.stringify(fixtureRoot)};`,
      `const executionPath = ${JSON.stringify(executionPath)};`,
      `const invokedPath = ${JSON.stringify(invokedPath)};`,
      'fs.mkdirSync(path.dirname(executionPath), { recursive: true });',
      'fs.writeFileSync(invokedPath, JSON.stringify({ argv: process.argv.slice(1), env: { OPL_STAGE_ATTEMPT_ID: process.env.OPL_STAGE_ATTEMPT_ID, OPL_PROVIDER_ATTEMPT_REF: process.env.OPL_PROVIDER_ATTEMPT_REF, OPL_CLOSEOUT_BINDING_JSON: process.env.OPL_CLOSEOUT_BINDING_JSON } }, null, 2));',
      'fs.writeFileSync(executionPath, JSON.stringify({',
      '  surface: "default_executor_dispatch_execution_study_latest",',
      '  schema_version: 1,',
      `  study_id: ${JSON.stringify(studyId)},`,
      '  generated_at: "2026-06-06T08:30:05Z",',
      '  executions: [{',
      '    surface: "default_executor_dispatch_execution",',
      '    schema_version: 1,',
      `    study_id: ${JSON.stringify(studyId)},`,
      `    quest_id: ${JSON.stringify(studyId)},`,
      `    action_type: ${JSON.stringify(actionType)},`,
      '    action_fingerprint: "paper_progress_stall:current-readiness",',
      '    idempotency_key: process.env.OPL_IDEMPOTENCY_KEY,',
      '    execution_status: "blocked",',
      '    blocked_reason: "medical_paper_readiness_not_ready",',
      '    execution_id: "execution::002::complete_medical_paper_readiness_surface::bridge",',
      '    owner_callable_surface: "medical_paper_readiness.complete_medical_paper_readiness_surface",',
      '    required_output_surface: "complete_medical_paper_readiness_surface",',
      '    opl_execution_authorization: {',
      '      stage_attempt_id: process.env.OPL_STAGE_ATTEMPT_ID,',
      '      provider_attempt_ref: process.env.OPL_PROVIDER_ATTEMPT_REF,',
      '      attempt_lease_ref: process.env.OPL_ATTEMPT_LEASE_REF,',
      '      attempt_lease_status: process.env.OPL_ATTEMPT_LEASE_STATUS,',
      '      execution_authorization_decision_ref: process.env.OPL_EXECUTION_AUTHORIZATION_DECISION_REF,',
      '      source_fingerprint: process.env.OPL_SOURCE_FINGERPRINT,',
      '      idempotency_key: process.env.OPL_IDEMPOTENCY_KEY,',
      '      stage_run_id: process.env.OPL_STAGE_RUN_ID,',
      '      stage_manifest_ref: process.env.OPL_STAGE_MANIFEST_REF,',
      '      current_pointer_ref: process.env.OPL_CURRENT_POINTER_REF',
      '    },',
      '    owner_result: {',
      '      status: "blocked",',
      '      ok: false,',
      '      blocked_reason: "medical_paper_readiness_not_ready",',
      '      quality_authorized: false,',
      '      submission_authorized: false,',
      '      current_package_write_authorized: false',
      '    }',
      '  }]',
      '}, null, 2));',
      'process.stdout.write(JSON.stringify({ surface_kind: "mas_owner_delta_result", result_kind: "quality_gate_receipt_with_stable_typed_blocker" }) + "\\n");',
      'NODE',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_mas_owner_dispatch_bridge_test',
        workflow_id: 'wf_mas_owner_dispatch_bridge_test',
        task_id: 'frt_mas_owner_dispatch_bridge_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_id: 'medautoscience',
        source_fingerprint: 'mas_default_executor_source_owner_dispatch_bridge',
        idempotency_key: 'idem_mas_owner_dispatch_bridge',
        workspace_locator: {
          workspace_root: fixtureRoot,
          command_cwd: fixtureRoot,
          study_id: studyId,
          action_type: actionType,
        },
        opl_execution_authorization: {
          owner: 'one-person-lab',
          executor_kind: 'codex_cli',
          provider_attempt_ref: 'temporal://attempt/sat_mas_owner_dispatch_bridge_test',
          stage_attempt_id: 'sat_mas_owner_dispatch_bridge_test',
          attempt_lease_ref: 'opl://stage-attempts/sat_mas_owner_dispatch_bridge_test/leases/frt_mas_owner_dispatch_bridge_test/active',
          attempt_lease_status: 'active',
          execution_authorization_decision_ref: 'opl://stage-attempts/sat_mas_owner_dispatch_bridge_test/execution-authorizations/frt_mas_owner_dispatch_bridge_test/wf_mas_owner_dispatch_bridge_test',
          source_fingerprint: 'mas_default_executor_source_owner_dispatch_bridge',
          idempotency_key: 'idem_mas_owner_dispatch_bridge',
          stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
          stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
          current_pointer_ref:
            'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
        },
        checkpoint_refs: [stagePacketRef],
      },
      stagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'domain_stage_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [executionRef]);
    assert.equal(receipt.process_output_summary?.domain_receipt_recovery_status, 'after_mas_owner_dispatch:closeout_found');
    assert.equal(receipt.process_output_summary?.mas_owner_dispatch_bridge?.status, 'command_completed');
    assert.equal(receipt.process_output_summary?.mas_owner_dispatch_bridge?.command_source, 'workspace_binding');
    assert.equal(receipt.closeout_packet?.route_impact?.owner_callable_surface, 'medical_paper_readiness.complete_medical_paper_readiness_surface');
    assert.equal(fs.existsSync(invokedPath), true);
    const invoked = JSON.parse(fs.readFileSync(invokedPath, 'utf8')) as {
      env: { OPL_STAGE_ATTEMPT_ID?: string; OPL_PROVIDER_ATTEMPT_REF?: string; OPL_CLOSEOUT_BINDING_JSON?: string };
    };
    assert.equal(invoked.env.OPL_STAGE_ATTEMPT_ID, 'sat_mas_owner_dispatch_bridge_test');
    assert.equal(invoked.env.OPL_PROVIDER_ATTEMPT_REF, 'temporal://attempt/sat_mas_owner_dispatch_bridge_test');
    assert.ok(invoked.env.OPL_CLOSEOUT_BINDING_JSON?.includes('opl_stage_run_closeout_binding'));
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

test('Codex stage runner does not invoke MAS owner dispatch without an explicit profile ref', async () => {
  const threadId = 'thread-mas-owner-dispatch-profile-missing';
  const studyId = '002-dm-china-us-mortality-attribution';
  const actionType = 'complete_medical_paper_readiness_surface';
  const stagePacketRef = `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/immutable/${actionType}/packet.json`;
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-06-06T08:45:00.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const stagePacketPath = path.join(fixtureRoot, stagePacketRef);
  const runnerPath = path.join(fixtureRoot, 'scripts', 'run-python-clean.sh');
  fs.mkdirSync(path.dirname(stagePacketPath), { recursive: true });
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  fs.writeFileSync(stagePacketPath, `${JSON.stringify({
    surface: 'default_executor_dispatch_request',
    dispatch_status: 'ready',
    domain_id: 'medautoscience',
    study_id: studyId,
    action_type: actionType,
    action_fingerprint: 'paper_progress_stall:current-readiness',
    idempotency_key: 'idem_mas_owner_dispatch_profile_missing',
  })}\n`);
  fs.writeFileSync(runnerPath, '#!/usr/bin/env bash\necho "must not run" >&2\nexit 64\n', { mode: 0o755 });

  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  const previousProfile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_mas_owner_dispatch_profile_missing_test',
        workflow_id: 'wf_mas_owner_dispatch_profile_missing_test',
        task_id: 'frt_mas_owner_dispatch_profile_missing_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_id: 'medautoscience',
        source_fingerprint: 'mas_default_executor_source_profile_missing',
        idempotency_key: 'idem_mas_owner_dispatch_profile_missing',
        workspace_locator: {
          workspace_root: fixtureRoot,
          command_cwd: fixtureRoot,
          study_id: studyId,
          action_type: actionType,
        },
        opl_execution_authorization: {
          provider_attempt_ref: 'temporal://attempt/sat_mas_owner_dispatch_profile_missing_test',
          stage_attempt_id: 'sat_mas_owner_dispatch_profile_missing_test',
          attempt_lease_ref: 'opl://stage-attempts/sat_mas_owner_dispatch_profile_missing_test/leases/frt_mas_owner_dispatch_profile_missing_test/active',
          attempt_lease_status: 'active',
          execution_authorization_decision_ref: 'opl://stage-attempts/sat_mas_owner_dispatch_profile_missing_test/execution-authorizations/frt_mas_owner_dispatch_profile_missing_test/wf_mas_owner_dispatch_profile_missing_test',
          source_fingerprint: 'mas_default_executor_source_profile_missing',
          idempotency_key: 'idem_mas_owner_dispatch_profile_missing',
          stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
          stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
          current_pointer_ref:
            'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
        },
        checkpoint_refs: [stagePacketRef],
      },
      stagePacketRef,
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet, null);
    assert.equal(receipt.process_output_summary?.domain_receipt_recovery_status, 'receipt_not_found');
    assert.equal(receipt.process_output_summary?.mas_owner_dispatch_bridge?.status, 'profile_missing');
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
    if (previousProfile === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE;
    } else {
      process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE = previousProfile;
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
