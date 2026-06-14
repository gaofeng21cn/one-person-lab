import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
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
      maturity.app_release_user_path.release_owner_verdict_handoff.status,
      'release_owner_verdict_required',
    );
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.owner_repo,
      '/Users/gaofeng/workspace/one-person-lab-app',
    );
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.required_delta,
      'release_owner_receipt_install_evidence_owner_acceptance_or_typed_blocker_ref',
    );
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff.accepted_ref_shapes,
      [
        'release_owner_receipt_ref',
        'install_evidence_ref',
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ],
    );
    assert.equal(maturity.app_release_user_path.owner_acceptance_evidence_recorded, false);
    assert.equal(maturity.app_release_user_path.owner_acceptance_ref_count, 0);
    assert.deepEqual(maturity.app_release_user_path.owner_acceptance_refs, []);
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.release_ready_authorized,
      false,
    );
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.authority_boundary
        .can_claim_release_ready,
      false,
    );
    assert.equal(
      maturity.app_release_user_path.selected_cohort_id,
      'app-release-cohort:26.5.28-draft.20260527235839',
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.app_release_user_path.owner, 'one-person-lab-app release owner');
    assert.match(
      maturity.app_release_user_path.record_command,
      /opl runtime app-release-evidence record/,
    );
    assert.match(
      maturity.app_release_user_path.verify_command,
      /opl runtime app-release-evidence verify --receipt-ref <receipt_ref>/,
    );
    assert.deepEqual(maturity.app_release_user_path.execution_runbook.accepted_paths, [
      'same_cohort_release_user_path_refs_path',
      'release_owner_typed_blocker_path',
      'release_owner_verdict_path',
      'release_owner_acceptance_path',
    ]);
    assert.equal(
      maturity.app_release_user_path.execution_runbook.readback_commands.includes(
        'opl runtime app-release-evidence list --json',
      ),
      true,
    );
    assert.equal(
      maturity.app_release_user_path.execution_runbook.stop_loss.includes(
        'if open_gate_count is zero but release_ready_authorized is false, stop recording OPL evidence and request release owner verdict or typed blocker',
      ),
      true,
    );
    assert.equal(
      maturity.app_release_user_path.execution_runbook.false_authority_guard
        .open_count_zero_is_not_release_ready,
      true,
    );
    assert.equal(
      maturity.app_release_user_path.execution_runbook.false_authority_guard
        .can_claim_app_release_ready,
      false,
    );
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
      appReleaseWorkOrder.next_owner_action,
      'same_cohort_release_user_path_receipt_release_owner_receipt_install_evidence_owner_acceptance_or_release_owner_typed_blocker',
    );
    assert.equal(
      appReleaseWorkOrder.closing_ref_source,
      'one_person_lab_app_release_owner_receipt_install_evidence_owner_acceptance_or_same_cohort_release_evidence_ref',
    );
    assert.equal(
      appReleaseWorkOrder.accepted_ref_shapes.includes('release_owner_receipt_ref'),
      true,
    );
    assert.equal(
      appReleaseWorkOrder.accepted_ref_shapes.includes('owner_acceptance_ref'),
      true,
    );
    assert.equal(
      appReleaseWorkOrder.accepted_ref_shapes.includes('install_evidence_ref'),
      true,
    );
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

test('framework operating maturity surfaces App release owner verdict refs as owner evidence without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-owner-verdict-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const record = recordAppReleaseUserPathEvidence(env, {
      release_owner_receipt_refs: [
        'release-owner-receipt-ref://one-person-lab-app/26.5.28-draft.20260527235839/release-owner-verdict',
      ],
      install_evidence_refs: [
        'install-evidence-ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-install',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], env);
    for (const moduleId of ['console', 'connect']) {
      runCli([
        'runtime',
        'brand-module-l5-evidence',
        'record',
        '--payload',
        JSON.stringify({
          module_id: moduleId,
          evidence_class_id: 'release_install_evidence',
          evidence_refs: [
            'release-owner-receipt-ref://one-person-lab-app/26.5.28-draft.20260527235839/release-owner-verdict',
            'install-evidence-ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-install',
          ],
          receipt_ref:
            `opl://brand-module-l5-evidence/${moduleId}/release_install_evidence/release-owner-verdict`,
        }),
      ], env);
      runCli([
        'runtime',
        'brand-module-l5-evidence',
        'verify',
        '--receipt-ref',
        `opl://brand-module-l5-evidence/${moduleId}/release_install_evidence/release-owner-verdict`,
      ], env);
    }

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.app_release_user_path_open_count, 0);
    assert.equal(
      maturity.app_release_user_path.status,
      'release_owner_receipt_recorded_not_release_ready_claim',
    );
    assert.equal(maturity.app_release_user_path.production_user_path_ready, false);
    assert.equal(maturity.app_release_user_path.open_gate_count, 5);
    assert.equal(
      maturity.app_release_user_path.next_required_delta,
      'release_owner_verdict_recorded_no_release_ready_claim',
    );
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.status,
      'release_owner_receipt_recorded_not_release_ready_claim',
    );
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff
        .observed_release_owner_receipt_refs,
      [
        'release-owner-receipt-ref://one-person-lab-app/26.5.28-draft.20260527235839/release-owner-verdict',
      ],
    );
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff
        .observed_install_evidence_refs,
      [
        'install-evidence-ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-install',
      ],
    );
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.release_ready_authorized,
      false,
    );
    const appReleaseLane = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'app_release_user_path',
    );
    assert.deepEqual(appReleaseLane.observed_ref_shapes, [
      'release_owner_receipt_ref',
      'install_evidence_ref',
      'evidence_ref',
    ]);
    assert.equal(appReleaseLane.observed_ref_counts.release_owner_receipt_ref_count, 1);
    assert.equal(appReleaseLane.observed_ref_counts.install_evidence_ref_count, 1);
    assert.equal(appReleaseLane.observed_receipt_refs.includes(record.receipt_refs[0]), true);
    assert.equal(
      appReleaseLane.observed_receipt_refs.includes(
        'release-owner-receipt-ref://one-person-lab-app/26.5.28-draft.20260527235839/release-owner-verdict',
      ),
      true,
    );
    const appReleaseWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'app_release_user_path',
      );
    assert.equal(appReleaseWorkOrder.status, 'owner_evidence_recorded');
    assert.equal(appReleaseWorkOrder.open_count, 0);
    assert.equal(
      appReleaseWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.deepEqual(appReleaseWorkOrder.observed_ref_shapes, [
      'release_owner_receipt_ref',
      'install_evidence_ref',
      'evidence_ref',
    ]);
    assert.equal(appReleaseWorkOrder.ready_claim_authorized, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.brand_module_l5.evidence_ledger.verified_receipt_count, 2);
    assert.equal(maturity.brand_module_l5.l5_complete_module_count, 0);
    assert.equal(maturity.brand_module_l5.status, 'evidence_required');
    const consoleReleaseInstallWorkOrder =
      maturity.foundry_agent_os_production_evidence_gate
        .brand_module_l5_requirement_work_orders.find(
          (entry: { module_id: string; class_id: string }) =>
            entry.module_id === 'console'
            && entry.class_id === 'release_install_evidence',
        );
    assert.equal(consoleReleaseInstallWorkOrder.verified_receipt_count, 1);
    assert.equal(
      consoleReleaseInstallWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_l5_claim',
    );
    assert.equal(
      consoleReleaseInstallWorkOrder.observed_ref_shapes.includes('ledger_receipt_ref'),
      true,
    );
    assert.equal(
      consoleReleaseInstallWorkOrder.observed_ref_shapes.includes('release_evidence_ref'),
      true,
    );
    assert.equal(
      consoleReleaseInstallWorkOrder.observed_ref_shapes.includes('install_evidence_ref'),
      true,
    );
    assert.equal(consoleReleaseInstallWorkOrder.observed_ref_shapes.includes('evidence_ref'), false);
    assert.equal(consoleReleaseInstallWorkOrder.ready_claim_authorized, false);
    const connectReleaseInstallWorkOrder =
      maturity.foundry_agent_os_production_evidence_gate
        .brand_module_l5_requirement_work_orders.find(
          (entry: { module_id: string; class_id: string }) =>
            entry.module_id === 'connect'
            && entry.class_id === 'release_install_evidence',
        );
    assert.equal(connectReleaseInstallWorkOrder.verified_receipt_count, 1);
    assert.equal(
      connectReleaseInstallWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_l5_claim',
    );
    assert.equal(connectReleaseInstallWorkOrder.ready_claim_authorized, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity surfaces App release owner acceptance refs as owner evidence without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-owner-acceptance-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const ownerAcceptanceRef =
      'owner-acceptance:app-release/26.5.28-draft.20260527235839/operator-accepted';
    const record = recordAppReleaseUserPathEvidence(env, {
      owner_acceptance_refs: [ownerAcceptanceRef],
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
      'release_owner_acceptance_recorded_not_release_ready_claim',
    );
    assert.equal(
      maturity.app_release_user_path.next_required_delta,
      'release_owner_acceptance_recorded_no_release_ready_claim',
    );
    assert.equal(maturity.app_release_user_path.owner_acceptance_evidence_recorded, true);
    assert.equal(maturity.app_release_user_path.owner_acceptance_ref_count, 1);
    assert.deepEqual(maturity.app_release_user_path.owner_acceptance_refs, [
      ownerAcceptanceRef,
    ]);
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff
        .observed_owner_acceptance_refs,
      [ownerAcceptanceRef],
    );
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.status,
      'release_owner_acceptance_recorded_not_release_ready_claim',
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);

    const appReleaseLane = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'app_release_user_path',
    );
    assert.equal(appReleaseLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.equal(appReleaseLane.verified_receipt_count, 1);
    assert.equal(appReleaseLane.observed_ref_shapes.includes('owner_acceptance_ref'), true);
    assert.equal(appReleaseLane.observed_ref_counts.owner_acceptance_ref_count, 1);
    assert.deepEqual(appReleaseLane.owner_acceptance_refs, [ownerAcceptanceRef]);
    assert.equal(appReleaseLane.observed_receipt_refs.includes(record.receipt_refs[0]), true);
    assert.equal(appReleaseLane.observed_receipt_refs.includes(ownerAcceptanceRef), true);

    const appReleaseWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'app_release_user_path',
      );
    assert.equal(appReleaseWorkOrder.status, 'owner_evidence_recorded');
    assert.equal(appReleaseWorkOrder.open_count, 0);
    assert.equal(
      appReleaseWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.equal(appReleaseWorkOrder.observed_ref_shapes.includes('owner_acceptance_ref'), true);
    assert.equal(appReleaseWorkOrder.observed_ref_counts.owner_acceptance_ref_count, 1);
    assert.deepEqual(appReleaseWorkOrder.owner_acceptance_refs, [ownerAcceptanceRef]);
    assert.equal(appReleaseWorkOrder.accepted_ref_shapes.includes('owner_acceptance_ref'), true);
    assert.equal(appReleaseWorkOrder.ready_claim_authorized, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity keeps App release owner verdict handoff open for install evidence without owner receipt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-install-only-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const record = recordAppReleaseUserPathEvidence(env, {
      install_evidence_refs: [
        'install-evidence-ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-install',
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

    assert.equal(maturity.summary.app_release_user_path_open_count, 1);
    assert.equal(maturity.app_release_user_path.status, 'evidence_required');
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.status,
      'waiting_for_same_cohort_user_path_evidence_or_typed_blocker',
    );
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff
        .observed_release_owner_receipt_refs,
      [],
    );
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff
        .observed_install_evidence_refs,
      [
        'install-evidence-ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-install',
      ],
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity keeps App release owner verdict handoff open until owner receipt is verified', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-owner-recorded-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    recordAppReleaseUserPathEvidence(env, {
      release_owner_receipt_refs: [
        'release-owner-receipt-ref://one-person-lab-app/26.5.28-draft.20260527235839/release-owner-verdict',
      ],
    });

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.app_release_user_path_open_count, 1);
    assert.equal(maturity.app_release_user_path.status, 'evidence_required');
    assert.equal(maturity.app_release_user_path.pending_verify_receipt_ref_count, 1);
    assert.equal(maturity.app_release_user_path.verified_ledger_receipt_ref_count, 0);
    assert.equal(
      maturity.app_release_user_path.release_owner_verdict_handoff.status,
      'waiting_for_same_cohort_user_path_evidence_or_typed_blocker',
    );
    assert.deepEqual(
      maturity.app_release_user_path.release_owner_verdict_handoff
        .observed_release_owner_receipt_refs,
      [],
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
