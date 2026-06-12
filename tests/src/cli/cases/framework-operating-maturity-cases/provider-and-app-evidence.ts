import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, runCliFailure, test } from '../../helpers.ts';
import { createFamilyDefaultContractWorkspace } from '../domain-pack-compiler-fixtures.ts';

function recordAppReleaseUserPathEvidence(
  env: Record<string, string>,
  payload: Record<string, unknown>,
) {
  return runCli([
    'runtime',
    'app-release-evidence',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], env).app_release_user_path_evidence_ledger_record;
}

function seedProviderCadenceWindow(env: Record<string, string>, stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], env);
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const eventRows = Array.from({ length: 7 }, (_, index) => {
    const createdAt = new Date(now - (6 - index) * dayMs).toISOString();
    return {
      proofEventId: `evt_provider_proof_maturity_${index}`,
      receiptEventId: `evt_provider_slo_maturity_${index}`,
      createdAt,
    };
  });
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const rows = ${JSON.stringify(eventRows)};
for (const row of rows) {
  db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
    .run(
      row.proofEventId,
      'temporal_residency_proof',
      'test',
      JSON.stringify({
        provider_kind: 'temporal',
        proof_mode: 'external_temporal_service_worker',
        closeout_status: 'production_residency_proven',
        proof_receipt: {
          receipt_kind: 'temporal_production_residency_proof',
          receipt_status: 'proven',
          provider_kind: 'temporal'
        }
      }),
      row.createdAt
    );
  db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
    .run(
      row.receiptEventId,
      'temporal_provider_slo_execution_receipt',
      'test',
      JSON.stringify({
        surface_kind: 'opl_temporal_provider_slo_execution_receipt',
        provider_kind: 'temporal',
        execution_status: 'executed',
        receipt_status: 'proven',
        receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
        repair_receipt: {
          repair_status: 'executed',
          can_execute_domain_repair: false
        },
        authority_boundary: {
          can_authorize_domain_ready: false
        }
      }),
      row.createdAt
    );
}
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

test('framework operating maturity consumes provider long-soak evidence refs without production ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-long-soak-evidence-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const providerRecord = runCli([
      'runtime',
      'provider-long-soak-evidence',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: [
          'provider-long-soak:temporal/week-1/cadence-window',
        ],
        recovery_refs: [
          'provider-recovery:temporal/worker-restart/requery',
        ],
        dead_letter_refs: [
          'provider-dead-letter:temporal/retry-boundary',
        ],
        provider_blocker_refs: [
          'provider-blocker:temporal/capability-slo/current',
        ],
        typed_blocker_refs: [
          'typed-blocker:provider/temporal/capability-slo-blocked',
        ],
      }),
    ], env).provider_long_soak_evidence_ledger_record;
    runCli([
      'runtime',
      'provider-long-soak-evidence',
      'verify',
      '--receipt-ref',
      providerRecord.receipt_refs[0],
    ], env);

    const drilldown = runCli([
      'runtime',
      'app-operator-drilldown',
    ], env).app_operator_drilldown;
    assert.equal(
      drilldown.provider_long_soak_evidence.surface_kind,
      'opl_provider_long_soak_evidence_projection',
    );
    assert.equal(drilldown.provider_long_soak_evidence.status, 'provider_evidence_observed_not_ready_claim');
    assert.deepEqual(drilldown.provider_long_soak_evidence.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(drilldown.summary.provider_long_soak_evidence_verified_receipt_ref_count, 1);
    assert.equal(drilldown.summary.provider_long_soak_evidence_typed_blocker_ref_count, 1);
    assert.equal(
      drilldown.provider_long_soak_evidence.authority_boundary.can_claim_production_ready,
      false,
    );

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    assert.equal(maturity.provider_long_soak.status, 'evidence_required');
    assert.equal(maturity.provider_long_soak.open_evidence_count, 1);
    assert.equal(maturity.provider_long_soak.capability_status, 'capability_slo_blocked');
    assert.equal(maturity.provider_long_soak.long_evidence_ready, false);
    assert.deepEqual(maturity.provider_long_soak.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      maturity.provider_long_soak.observed_receipt_refs.includes(providerRecord.receipt_refs[0]),
      true,
    );
    assert.equal(maturity.provider_long_soak.verified_receipt_ref_count, 1);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    assert.equal(
      maturity.provider_long_soak.authority_boundary.can_claim_production_ready,
      false,
    );

    const providerLane = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'provider_long_soak',
    );
    assert.equal(providerLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.equal(providerLane.verified_receipt_count, 1);
    assert.deepEqual(providerLane.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      providerLane.observed_receipt_refs.includes(providerRecord.receipt_refs[0]),
      true,
    );
    const providerWorkOrder =
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      );
    assert.equal(
      providerWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(providerWorkOrder.ready_claim_authorized, false);
    assert.equal(providerWorkOrder.owner_acceptance_required, true);
    assert.equal(
      providerWorkOrder.observed_ref_shapes.includes('provider_blocker_ref'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity consumes verified App release user-path evidence without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const record = recordAppReleaseUserPathEvidence(env, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/26.5.28-draft.20260527235839/remote-release-verification',
      ],
      screenshot_refs: [
        'screenshot_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/settings-runtime.png',
      ],
      reload_prompt_user_path_refs: [
        'first_run_log_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/smoke-events',
      ],
      provider_state_linkage_refs: [
        'provider_slo_receipt_ref://one-person-lab/temporal/26.5.28-draft.20260527235839/window-cadence-satisfied',
      ],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/github-actions-clean-vm',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.app_release_user_path_open_count, 0);
    assert.equal(
      maturity.app_release_user_path.status,
      'evidence_recorded_not_release_ready_claim',
    );
    assert.equal(maturity.app_release_user_path.next_required_delta, 'release_owner_verdict_still_not_claimed_by_opl');
    assert.equal(maturity.app_release_user_path.production_user_path_ready, true);
    assert.equal(maturity.app_release_user_path.open_gate_count, 0);
    assert.equal(maturity.app_release_user_path.pending_verify_receipt_ref_count, 0);
    assert.equal(maturity.app_release_user_path.typed_blocker_ref_count, 0);
    assert.equal(maturity.app_release_user_path.verified_ledger_receipt_ref_count, 1);
    assert.equal(
      maturity.app_release_user_path.selected_cohort_id,
      'app-release-cohort:26.5.28-draft.20260527235839',
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    const appReleaseGateLane = maturity.foundry_agent_os_production_evidence_gate.lane_statuses.find(
      (entry: { lane: string }) => entry.lane === 'app_release_user_path',
    );
    assert.equal(appReleaseGateLane.open_count, 0);
    assert.equal(appReleaseGateLane.status, 'refs_observed_not_production_ready_claim');
    const appReleaseWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'app_release_user_path',
      );
    assert.equal(
      appReleaseWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.equal(appReleaseWorkOrder.owner_acceptance_required, true);
    assert.equal(appReleaseWorkOrder.ready_claim_authorized, false);
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .owner_evidence_recorded_not_ready_claim_work_order_count,
      1,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.production_ready_claim_authorized,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.authority_boundary.can_claim_app_release_ready,
      false,
    );
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.not_claims.includes('app_release_ready'), true);
    assert.equal(maturity.not_claims.includes('production_ready'), true);
    assert.equal(maturity.status, 'evidence_required');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity surfaces refs-only provider and lifecycle counts without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-runtime-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    seedProviderCadenceWindow(env, stateRoot);
    const providerRecord = runCli([
      'runtime',
      'provider-long-soak-evidence',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: ['provider-long-soak:temporal/runtime-4h'],
        recovery_refs: ['provider-recovery:temporal/cadence-current'],
      }),
    ], env).provider_long_soak_evidence_ledger_record;
    runCli([
      'runtime',
      'provider-long-soak-evidence',
      'verify',
      '--receipt-ref',
      providerRecord.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.provider_long_soak_open_count, 0);
    assert.equal(maturity.provider_long_soak.open_evidence_count, 0);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, true);
    assert.equal(maturity.provider_long_soak.observed_receipt_count, 7);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    const providerGateLane = maturity.foundry_agent_os_production_evidence_gate.lane_statuses.find(
      (entry: { lane: string }) => entry.lane === 'provider_long_soak',
    );
    assert.equal(providerGateLane.open_count, 0);
    assert.equal(providerGateLane.status, 'refs_observed_not_production_ready_claim');
    assert.equal(
      providerGateLane.observed_owner_evidence_status,
      'owner_evidence_observed_not_ready_claim',
    );
    const providerWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      );
    assert.equal(
      providerWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(
      providerWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.equal(providerWorkOrder.owner_acceptance_required, true);
    assert.equal(providerWorkOrder.ready_claim_authorized, false);
    assert.equal(providerWorkOrder.observed_receipt_refs[0], providerRecord.receipt_refs[0]);
    assert.deepEqual(providerWorkOrder.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
    ]);
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.non_closing_inputs.includes('verified_refs_only_ledger'),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.closed_by_opl,
      false,
    );
    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.observed_ref_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.reconcile_issue_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_apply_handoff_blocked_decision_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_blockers_count_as_missing_evidence, false);
    assert.equal(maturity.memory_artifact_lifecycle.opl_stores_body_or_verdict, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.authority_boundary.can_write_memory_body, false);
    assert.equal(maturity.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(maturity.status, 'evidence_required');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity requires family defaults', () => {
  const failure = runCliFailure([
    'framework',
    'operating-maturity',
  ]);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
});
