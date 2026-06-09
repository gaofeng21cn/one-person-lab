import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

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

test('framework operating maturity aggregates scaleout and L5 gaps without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.surface_kind, 'opl_family_operating_maturity_readout');
    assert.equal(maturity.owner, 'one-person-lab');
    assert.equal(maturity.status, 'evidence_required');
    assert.equal(maturity.baseline_level, 'L4_executable_baseline');
    assert.equal(maturity.target_level, 'L5_production_operating_maturity');

    assert.equal(
      maturity.current_owner_delta_bridge.surface_kind,
      'opl_operating_maturity_current_owner_delta_bridge',
    );
    assert.equal(maturity.current_owner_delta_bridge.default_planning_root, 'current_owner_delta');
    assert.equal(
      maturity.summary.current_owner,
      maturity.current_owner_delta_bridge.current_owner,
    );
    assert.equal(
      maturity.summary.current_owner_stage_id,
      maturity.current_owner_delta_bridge.stage_id,
    );
    assert.equal(typeof maturity.current_owner_delta_bridge.current_owner, 'string');
    assert.equal(maturity.current_owner_delta_bridge.current_owner.length > 0, true);
    assert.equal(typeof maturity.current_owner_delta_bridge.desired_delta_description, 'string');
    assert.equal(maturity.current_owner_delta_bridge.desired_delta_description.length > 0, true);
    assert.equal(maturity.current_owner_delta_bridge.accepted_answer_shape.length > 0, true);
    assert.equal(
      maturity.current_owner_delta_bridge.accepted_answer_shape
        .includes('typed_blocker_ref'),
      true,
    );
    assert.equal(typeof maturity.current_owner_delta_bridge.hard_gate.state, 'string');
    assert.equal(
      maturity.current_owner_delta_bridge.hard_gate.domain_ready_authorized,
      false,
    );
    assert.equal(
      maturity.summary.current_owner_delta_owner_answer_missing,
      maturity.current_owner_delta_bridge.owner_answer_missing,
    );
    assert.equal(
      maturity.summary.current_owner_delta_owner_answer_still_required,
      maturity.current_owner_delta_bridge.owner_answer_still_required,
    );
    assert.equal(maturity.current_owner_delta_bridge.evidence_lanes_are_audit_sidecar, true);
    assert.equal(
      maturity.current_owner_delta_bridge.evidence_lanes_can_generate_default_next_action,
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.authority_boundary.bridge_is_projection_only,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.authority_boundary.can_sign_owner_receipt,
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.authority_boundary.can_create_typed_blocker,
      false,
    );

    assert.equal(maturity.summary.domain_owner_chain_open_domain_count, 4);
    assert.deepEqual(maturity.domain_owner_chain_scaleout.accepted_refs_only_result_shapes, [
      'domain_owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'no_regression_ref',
      'long_soak_ref',
    ]);
    assert.equal(
      maturity.domain_owner_chain_scaleout.domains.every(
        (entry: { status: string; conformance_can_claim_domain_ready: boolean }) =>
          entry.status === 'required_from_domain_owner'
          && entry.conformance_can_claim_domain_ready === false,
      ),
      true,
    );

    assert.equal(maturity.summary.brand_module_l5_evidence_required_module_count, 10);
    assert.equal(maturity.brand_module_l5.status, 'evidence_required');
    assert.equal(maturity.brand_module_l5.l5_complete_module_count, 0);
    assert.equal(maturity.brand_module_l5.evidence_ledger.verified_receipt_count, 0);

    assert.equal(maturity.summary.cleanup_retirement_open_decision_count, 0);
    assert.equal(
      maturity.cleanup_retirement.status,
      'waiting_for_structural_prerequisites',
    );
    assert.equal(maturity.cleanup_retirement.deletion_evidence_worklist_count, 32);
    assert.equal(maturity.cleanup_retirement.owner_decision_missing_count, 0);
    assert.equal(maturity.cleanup_retirement.structural_prerequisites_observed, false);
    assert.equal(maturity.cleanup_retirement.all_deletion_evidence_requirements_observed, false);
    assert.equal(maturity.cleanup_retirement.physical_delete_authorized, false);
    assert.equal(maturity.cleanup_retirement.default_caller_delete_ready, false);
    assert.equal(maturity.cleanup_retirement.next_required_owner_action, 'domain_owner_choose_delete_authorize_keep_or_typed_blocker');

    assert.equal(maturity.summary.app_release_user_path_open_count, 1);
    assert.equal(maturity.app_release_user_path.status, 'evidence_required');
    assert.equal(maturity.app_release_user_path.production_user_path_ready, false);
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.provider_long_soak.status, 'evidence_required');
    assert.equal(maturity.summary.provider_long_soak_open_count, 1);
    assert.equal(maturity.provider_long_soak.open_evidence_count, 1);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, false);
    assert.equal(maturity.provider_long_soak.missing_receipt_count, 7);
    assert.equal(maturity.provider_long_soak.blocked_repair_receipt_count, 0);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    assert.equal(maturity.memory_artifact_lifecycle.status, 'evidence_required');
    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.observed_ref_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.reconcile_issue_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_apply_handoff_blocked_decision_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.opl_stores_body_or_verdict, false);

    assert.deepEqual(maturity.next_owner_actions.map((entry: { lane: string }) => entry.lane), [
      'domain_owner_chain_scaleout',
      'brand_module_l5_operating_maturity',
      'app_release_user_path',
      'provider_long_soak',
      'private_platform_retirement',
      'memory_artifact_lifecycle_apply',
    ]);

    assert.equal(maturity.authority_boundary.can_claim_domain_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_l5, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(maturity.authority_boundary.can_create_typed_blocker, false);
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
