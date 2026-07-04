import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

import './runtime-app-operator-drilldown-lifecycle-cases/current-control-liveness.ts';

test('runtime App projection reconciles MAS refs-only payload with OPL lifecycle ledger refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-mas-lifecycle-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);

  masManifest.runtime_inventory = {
    ...((masManifest.runtime_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_runtime_inventory_projection',
      source_refs: ['mas://runtime/inventory/latest.json'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/freshness/latest.json',
      },
    },
  };
  masManifest.progress_projection = {
    ...((masManifest.progress_projection as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_opl_runtime_workbench_projection',
      source_refs: ['mas://runtime/workbench/latest.json'],
      owner_receipt_refs: ['mas-owner-receipt:projection-current'],
      typed_blocker_refs: ['mas-blocker:projection-owner-chain-soak'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/workbench/freshness.json',
      },
    },
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'apply',
      '--domain',
      'medautoscience',
      '--source-ref',
      'mas://lifecycle/cleanup-plan',
      '--manifest-ref',
      'manifest:mas:lifecycle',
      '--action',
      JSON.stringify({
        action_id: 'record-opl-cleanup-index',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_index_ref',
        target_ref: 'opl://family-runtime/index/mas-run-42',
        restore_proof_refs: ['restore-proof:mas-index'],
      }),
      '--action',
      JSON.stringify({
        action_id: 'record-domain-artifact-receipt-ref',
        action_kind: 'artifact_receipt_index',
        owner_scope: 'domain_artifact_mutation_receipt_ref',
        target_ref: 'mas://artifact/current-package.zip',
        restore_proof_refs: ['restore-proof:mas-package'],
        domain_artifact_mutation_receipt_refs: ['mas-owner-receipt:artifact-cleanup'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        runtime_root: '/tmp/mas/runtime',
        artifact_root: '/tmp/mas/artifacts',
        source_refs: ['source:dataset', 'mas://source/evidence-ledger'],
        material_refs: ['material:table1'],
        restore_refs: ['restore:study-run'],
        controlled_apply_request: {
          action_kind: 'mas_guarded_apply',
          owner_receipt_refs: ['mas-owner-receipt:guarded-apply'],
          no_regression_evidence_refs: ['mas-no-regression:package'],
        },
        lifecycle_apply_requests: [
          {
            action_id: 'mas-opl-ledger-cleanup',
            action_kind: 'cleanup',
            target_ref: 'opl-ledger:mas-run',
            authority_owner: 'opl_framework',
            owner_scope: 'opl_owned_ledger',
          },
          {
            action_id: 'mas-domain-package-cleanup',
            action_kind: 'cleanup',
            target_ref: 'artifact:mas-package',
            authority_owner: 'med-autoscience',
            owner_scope: 'domain_owned_artifact',
            restore_ref: 'restore:study-run',
          },
        ],
        transition_bridge: {
          transition_id: 'mas-publication-currentness',
          transition_status: 'blocked',
          current_state: 'draft_ready',
          next_state: 'publication_quality_review',
          evidence: {
            owner_receipt_refs: ['mas-owner-receipt:transition'],
            typed_blocker_refs: ['mas-blocker:publication-currentness'],
            typed_blockers: [
              {
                blocker_id: 'publication_currentness_not_proven',
                blocker_kind: 'freshness',
                required_owner: 'med-autoscience',
              },
            ],
          },
        },
      }),
      '--source-fingerprint',
      'sha256:mas-drilldown-source',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:write-closeout'],
        consumed_refs: ['artifact:table', 'artifact:figure'],
        consumed_memory_refs: ['memory:route-policy'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        rejected_writes: [{ target: 'memory', reason: 'domain_memory_body_write_forbidden' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          owner_receipt_refs: ['mas-owner-receipt:route-impact'],
          typed_blocker_refs: ['mas-blocker:stale-review'],
          typed_blockers: [
            {
              blocker_id: 'ai_reviewer_currentness_stale',
              blocker_kind: 'freshness',
              required_owner: 'med-autoscience',
            },
          ],
          quality_refs: ['publication_eval/latest.json'],
          readiness_refs: ['controller_decisions/latest.json'],
          repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
          direct_skill_ref: 'skill:mas/review',
          package_refs: ['package:submission-minimal'],
          export_refs: ['export:current-package'],
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const projection = output.app_operator_drilldown;

    assert.equal(projection.authority_boundary.can_write_domain_truth, false);
    assert.equal(projection.authority_boundary.can_read_memory_body, false);
    assert.equal(projection.authority_boundary.can_read_artifact_body, false);
    assert.equal(projection.summary.owner_receipt_ref_count, 4);
    assert.equal(projection.summary.typed_blocker_count, 3);
    assert.equal(projection.summary.domain_dispatch_evidence_domain_count, 1);
    assert.equal(projection.summary.domain_dispatch_evidence_attempt_count, 1);
    assert.equal(projection.summary.domain_dispatch_evidence_owner_receipt_ref_count, 3);
    assert.equal(projection.summary.domain_dispatch_evidence_typed_blocker_ref_count, 2);
    assert.equal(projection.summary.domain_dispatch_evidence_no_regression_ref_count, 1);
    assert.equal(projection.summary.domain_dispatch_evidence_memory_writeback_ref_count, 1);
    assert.equal(projection.summary.domain_dispatch_evidence_domain_ready_claim_count, 0);
    assert.equal(projection.summary.current_control_state_count, 1);
    assert.equal(projection.summary.current_control_state_blocked_count, 1);
    assert.equal(projection.summary.lifecycle_index_ref_count, 2);
    assert.equal(projection.summary.lifecycle_restore_proof_ref_count, 2);
    assert.equal(projection.summary.lifecycle_reconcile_missing_ref_count, 0);
    assert.equal(projection.summary.lifecycle_reconcile_extra_ref_count, 0);
    assert.equal(projection.summary.lifecycle_reconcile_stale_ref_count, 0);
    assert.equal(projection.summary.lifecycle_domain_physical_delete_requires_owner_receipt, true);
    assert.equal(projection.summary.lifecycle_domain_physical_delete_can_execute, false);
    assert.equal(projection.summary.lifecycle_opl_cleanup_apply_can_execute, true);
    assert.equal(projection.summary.safe_action_ref_count >= 2, true);
    assert.equal(projection.summary.freshness_signal_count >= 1, true);

    assert.equal(
      projection.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:guarded-apply'
      ),
      true,
    );
    assert.equal(
      projection.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:transition'
      ),
      true,
    );
    assert.equal(
      projection.typed_blocker_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-blocker:publication-currentness'
      ),
      true,
    );
    assert.equal(
      projection.typed_blocker_refs.blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'domain_owned_lifecycle_receipt_required'
      ),
      true,
    );
    assert.equal(projection.domain_dispatch_evidence.surface_kind, 'opl_app_drilldown_domain_dispatch_evidence');
    assert.equal(projection.domain_dispatch_evidence.summary.domain_count, 1);
    assert.equal(projection.domain_dispatch_evidence.by_domain.medautoscience.attempt_count, 1);
    assert.equal(
      projection.domain_dispatch_evidence.by_domain.medautoscience.domain_ready_claim_count,
      0,
    );
    assert.equal(
      projection.domain_dispatch_evidence.attempts[0].authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(projection.current_control_state.surface_kind, 'opl_app_drilldown_current_control_state_projection');
    assert.equal(projection.current_control_state.summary.current_control_state_count, 1);
    assert.equal(projection.current_control_state.states[0].reconciliation_status, 'blocked_missing_identity');
    assert.equal(projection.current_control_state.authority_boundary.reads_domain_latest_or_dispatch_latest, false);
    assert.equal(projection.current_control_state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(projection.current_control_state.states[0], 'domain_ready'), false);
    assert.equal(Object.hasOwn(projection.current_control_state.states[0], 'publication_ready'), false);
    assert.equal(Object.hasOwn(projection.current_control_state.states[0], 'artifact_ready'), false);
    assert.deepEqual(
      projection.domain_dispatch_evidence.attempts[0].no_regression_evidence_refs,
      ['mas-no-regression:package'],
    );
    assert.deepEqual(
      projection.domain_dispatch_evidence.attempts[0].writeback_receipt_refs,
      ['memory-writeback:receipt-1'],
    );
    assert.equal(
      projection.freshness_refs.refs.some((ref: { source_fingerprint: string }) =>
        ref.source_fingerprint === 'sha256:mas-drilldown-source'
      ),
      true,
    );
    assert.equal(
      projection.ref_family_refs.source_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'source:dataset'
      ),
      true,
    );
    assert.equal(
      projection.ref_family_refs.artifact_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'artifact:table'
      ),
      true,
    );
    assert.equal(
      projection.ref_family_refs.memory_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'memory:route-policy'
      ),
      true,
    );
    assert.equal(
      projection.safe_action_refs.refs.some((ref: { role: string; ref: string }) =>
        ref.role === 'lifecycle_cleanup_receipt_ref'
          && ref.ref.startsWith('opl://family-runtime/lifecycle-apply/medautoscience')
      ),
      true,
    );
    assert.deepEqual(projection.lifecycle_ledger_refs.restore_proof_refs, [
      'restore-proof:mas-index',
      'restore-proof:mas-package',
    ]);
    assert.equal(projection.lifecycle_ledger_refs.reconcile_projection.status, 'reconciled');
    assert.equal(
      projection.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.can_execute_delete,
      false,
    );
    assert.equal(
      projection.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.opl_cleanup_apply_ready,
      true,
    );
    assert.equal(projection.lifecycle_ledger_refs.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime App projection projects OPL NonAdvancingApply current-control readback without progress authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-non-advancing-current-control-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-current-control-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );

  masManifest.workspace_locator = {
    ...((masManifest.workspace_locator as Record<string, unknown>) ?? {}),
    workspace_root: workspaceRoot,
  };
  masManifest.progress_projection = {
    ...((masManifest.progress_projection as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_opl_runtime_workbench_projection',
      source_refs: ['mas://runtime/workbench/latest.json'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/workbench/freshness.json',
      },
    },
  };
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, `${JSON.stringify({
    surface: 'opl_current_control_state',
    current_control_refresh_source: 'opl_transition_runtime_readback_non_advancing_apply',
    provider_admission_pending_count: 0,
    transition_request_pending_count: 0,
    current_executable_owner_action: null,
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_non_advancing_apply_recorded',
          reason: 'opl_transition_request_missing_for_authorized_stage_packet',
          provider_admission_requires_opl_runtime_result: false,
          provider_completion_is_domain_completion: false,
          provider_completion_is_domain_ready: false,
          paper_progress_delta: false,
          non_advancing_apply: true,
        },
        provider_admission_pending_count: 0,
        transition_request_pending_count: 0,
      },
    ],
    domain_progress_transition_non_advancing_apply_readback: {
      surface_kind: 'opl_current_control_transition_non_advancing_apply_readback',
      status: 'transition_non_advancing_apply_recorded',
      reason: 'opl_transition_request_missing_for_authorized_stage_packet',
      study_id: studyId,
      action_type: actionType,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      runtime_result: {
        exactly_one_outcome: {
          non_advancing_apply: true,
        },
      },
      runtime_live_readback: {
        runtime_readback_status: 'complete_transaction',
        transaction_complete: true,
        replay_audit: {
          replay_status: 'replay_ready',
          read_model_projection_consumable: true,
        },
      },
      authority_boundary: {
        opl_can_write_mas_truth: false,
        opl_can_create_domain_owner_receipt: false,
        opl_can_create_domain_typed_blocker: false,
        provider_completion_is_domain_completion: false,
        provider_completion_is_domain_ready: false,
        paper_progress_delta: false,
      },
    },
    domain_progress_transition_projection_metadata: {
      surface_kind: 'opl_current_control_domain_progress_transition_projection_metadata',
      projection_role: 'non_advancing_apply_current_transition_readback',
      runtime_readback_status: 'complete_transaction',
      transaction_complete: true,
      provider_admission_allowed: false,
      current_executable_owner_action_allowed: false,
      paper_progress_delta: false,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
      non_advancing_apply: true,
      replay_audit_status: 'replay_ready',
      replay_audit_consumable: true,
    },
  }, null, 2)}\n`, 'utf8');

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const appProjection = output.app_operator_drilldown;
    const currentControlProjection = appProjection.current_control_state;
    const readbackState = currentControlProjection.states[0];

    assert.equal(currentControlProjection.summary.current_control_state_count, 1);
    assert.equal(currentControlProjection.summary.non_advancing_apply_readback_count, 1);
    assert.equal(currentControlProjection.summary.non_advancing_apply_consumable_count, 1);
    assert.equal(currentControlProjection.summary.non_advancing_apply_provider_admission_allowed_count, 0);
    assert.equal(
      currentControlProjection.summary.non_advancing_apply_current_executable_owner_action_allowed_count,
      0,
    );
    assert.equal(currentControlProjection.summary.non_advancing_apply_paper_progress_delta_count, 0);
    assert.equal(readbackState.reconciliation_status, 'transition_non_advancing_apply_recorded');
    assert.equal(readbackState.non_advancing_apply, true);
    assert.equal(readbackState.provider_admission_allowed, false);
    assert.equal(readbackState.current_executable_owner_action_allowed, false);
    assert.equal(readbackState.paper_progress_delta, false);
    assert.equal(
      readbackState.domain_progress_transition_projection_metadata.projection_role,
      'non_advancing_apply_current_transition_readback',
    );
    assert.equal(
      readbackState.domain_progress_transition_non_advancing_apply_readback.runtime_live_readback
        .runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(currentControlProjection.authority_boundary.can_execute_domain_action, false);
    assert.equal(currentControlProjection.authority_boundary.can_claim_domain_ready, false);
    assert.equal(currentControlProjection.authority_boundary.can_claim_publication_ready, false);
    assert.equal(currentControlProjection.authority_boundary.can_claim_artifact_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime App projection projects lifecycle handoff apply attempts for default callers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-lifecycle-handoff-'));
  try {
    const result = runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'dry-run',
      '--domain',
      'medautoscience',
      '--handoff',
      JSON.stringify({
        surface_kind: 'artifact_lifecycle_physical_thinning_handoff',
        handoff_ref: 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:app',
        body_free: true,
        candidate_count: 493,
        candidate_refs: [
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:app-one',
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:app-two',
        ],
        selected_payload_path: 'typed_blocker_path',
        typed_blocker_refs: [
          'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:app',
        ],
        next_owner_action: {
          owner: 'one-person-lab',
          action: 'generic_lifecycle_apply',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).family_runtime_lifecycle_apply;

    assert.equal(result.status, 'blocked');
    assert.equal(result.summary.unsafe_action_count, 2);

    const projection = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const readback = runCli(['runtime', 'memory-artifact-lifecycle'], {
      OPL_STATE_DIR: stateRoot,
    }).memory_artifact_lifecycle_readback;
    assert.equal(
      projection.memory_artifact_lifecycle.surface_kind,
      'opl_app_drilldown_memory_artifact_lifecycle_evidence',
    );
    assert.equal(
      projection.memory_artifact_lifecycle.readiness_status,
      'typed_blocker_work_order_required_not_ready',
    );
    assert.equal(projection.memory_artifact_lifecycle.ready_claim_authorized, false);
    assert.equal(
      projection.memory_artifact_lifecycle.open_count_zero_is_not_memory_or_artifact_ready,
      true,
    );
    assert.equal(
      projection.memory_artifact_lifecycle.lifecycle_owner_work_order.status,
      'typed_blocker_work_order_required_not_ready',
    );
    assert.equal(
      projection.memory_artifact_lifecycle.lifecycle_owner_work_order.accepted_refs_only_result_shapes
        .includes('typed_blocker_ref'),
      true,
    );
    assert.equal(
      projection.memory_artifact_lifecycle.authority_boundary.can_write_memory_body,
      false,
    );
    assert.equal(
      projection.memory_artifact_lifecycle.authority_boundary.can_mutate_artifact_body,
      false,
    );
    assert.equal(
      projection.memory_artifact_lifecycle.authority_boundary.can_authorize_export_readiness,
      false,
    );
    assert.equal(
      projection.memory_artifact_lifecycle.authority_boundary.can_execute_domain_physical_delete,
      false,
    );
    assert.equal(readback.surface_kind, 'opl_memory_artifact_lifecycle_readback');
    assert.equal(readback.source_command, 'opl runtime app-operator-drilldown --json');
    assert.equal(readback.ready_claim_authorized, false);
    assert.equal(
      readback.status,
      projection.memory_artifact_lifecycle.readiness_status,
    );
    assert.equal(
      readback.next_required_owner_action,
      'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    );
    assert.equal(readback.owner_work_order.lane_id, 'memory_artifact_lifecycle_apply');
    assert.equal(
      readback.owner_work_order.typed_blocker_work_order.status,
      'typed_blocker_refs_observed_followthrough_required',
    );
    assert.equal(
      readback.owner_work_order.accepted_refs_only_result_shapes.includes('typed_blocker_ref'),
      true,
    );
    assert.equal(
      readback.summary.observed_ref_count,
      projection.memory_artifact_lifecycle.observed_ref_count,
    );
    assert.equal(readback.summary.lifecycle_apply_handoff_attempt_count, 1);
    assert.equal(readback.summary.lifecycle_apply_handoff_blocked_decision_count, 2);
    assert.equal(readback.summary.lifecycle_apply_handoff_safe_decision_count, 0);
    assert.equal(
      readback.latest_lifecycle_apply_handoff.handoff_ref,
      'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:app',
    );
    assert.equal(
      readback.latest_lifecycle_apply_handoff.selected_payload_path,
      'typed_blocker_path',
    );
    assert.deepEqual(
      readback.latest_lifecycle_apply_handoff.typed_blocker_refs,
      [
        'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:app',
      ],
    );
    assert.equal(readback.authority_boundary.can_read_memory_body, false);
    assert.equal(readback.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(readback.authority_boundary.can_execute_domain_physical_delete, false);
    assert.equal(readback.authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      readback.forbidden_opl_claims.includes('artifact_ready'),
      true,
    );
    assert.equal(
      readback.non_closing_inputs.includes('open_count_zero'),
      true,
    );
    const evidence =
      projection.attention_first_payload.evidence_after_contract.memory_artifact_lifecycle_evidence;

    assert.equal(evidence.lifecycle_apply_handoff_attempt_count, 1);
    assert.equal(evidence.lifecycle_apply_handoff_blocked_decision_count, 2);
    assert.equal(evidence.lifecycle_apply_handoff_safe_decision_count, 0);
    assert.equal(
      evidence.readiness_status,
      'typed_blocker_work_order_required_not_ready',
    );
    assert.equal(evidence.ready_claim_authorized, false);
    assert.equal(evidence.open_count_zero_is_not_memory_or_artifact_ready, true);
    assert.equal(
      evidence.forbidden_opl_claims.includes('artifact_ready'),
      true,
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.status,
      'typed_blocker_work_order_required_not_ready',
    );
    assert.equal(evidence.lifecycle_owner_work_order.open_count, 1);
    assert.equal(
      evidence.lifecycle_owner_work_order.open_count_semantics,
      'open_count_tracks_refs_or_reconcile_gaps_only_zero_does_not_authorize_memory_artifact_package_or_export_ready',
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.next_required_owner_action,
      'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.accepted_refs_only_result_shapes.includes('typed_blocker_ref'),
      true,
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.non_closing_inputs.includes('open_count_zero'),
      true,
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.typed_blocker_work_order.status,
      'typed_blocker_refs_observed_followthrough_required',
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.typed_blocker_work_order.selected_payload_path,
      'typed_blocker_path',
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.typed_blocker_work_order.blocked_decision_count,
      2,
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.typed_blocker_work_order.safe_decision_count,
      0,
    );
    assert.deepEqual(
      evidence.lifecycle_owner_work_order.typed_blocker_work_order.latest_typed_blocker_refs,
      [
        'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:app',
      ],
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.authority_boundary.work_order_can_execute_domain_physical_delete,
      false,
    );
    assert.equal(
      evidence.lifecycle_owner_work_order.authority_boundary.work_order_can_create_typed_blocker,
      false,
    );
    assert.equal(
      evidence.latest_lifecycle_apply_handoff.handoff_ref,
      'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:app',
    );
    assert.equal(evidence.latest_lifecycle_apply_handoff.candidate_ref_count, 493);
    assert.equal(evidence.latest_lifecycle_apply_handoff.selected_payload_path, 'typed_blocker_path');
    assert.equal(evidence.latest_lifecycle_apply_handoff.writes_performed, false);
    assert.equal(evidence.latest_lifecycle_apply_handoff.receipt_ref, null);
    assert.equal(
      evidence.latest_lifecycle_apply_handoff.authority_boundary.can_execute_domain_physical_cleanup,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime memory artifact lifecycle evidence ledger records refs-only owner follow-through without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-memory-artifact-lifecycle-evidence-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const recordResult = runCli([
      'runtime',
      'memory-artifact-lifecycle-evidence',
      'record',
      '--payload',
      JSON.stringify({
        receipt_ref: 'opl://memory-artifact-lifecycle-evidence/domain-owner-demo',
        memory_receipt_refs: ['memory-receipt:domain/accepted'],
        memory_writeback_receipt_refs: ['memory-writeback-receipt:domain/accepted'],
        artifact_mutation_receipt_refs: ['artifact-receipt:domain/package'],
        package_lifecycle_receipt_refs: ['package-lifecycle:domain/package'],
        export_lifecycle_receipt_refs: ['export-lifecycle:domain/export'],
        cleanup_restore_retention_receipt_refs: ['cleanup-restore:domain/retention'],
        typed_blocker_refs: ['typed-blocker:lifecycle/domain-followthrough'],
        owner_acceptance_refs: ['owner-acceptance:lifecycle/domain-followthrough'],
      }),
    ], env).memory_artifact_lifecycle_evidence_ledger_record;

    assert.equal(recordResult.status, 'recorded');
    assert.equal(recordResult.recorded_receipt_count, 1);
    assert.deepEqual(recordResult.receipt_refs, [
      'opl://memory-artifact-lifecycle-evidence/domain-owner-demo',
    ]);
    assert.equal(recordResult.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordResult.receipts[0].authority_boundary.can_write_memory_body, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_mutate_artifact_body, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_generate_typed_blocker, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_claim_memory_ready, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_claim_artifact_ready, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_claim_package_ready, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_claim_export_ready, false);
    assert.equal(recordResult.receipts[0].authority_boundary.can_claim_production_ready, false);

    const verifyResult = runCli([
      'runtime',
      'memory-artifact-lifecycle-evidence',
      'verify',
      '--receipt-ref',
      'opl://memory-artifact-lifecycle-evidence/domain-owner-demo',
    ], env).memory_artifact_lifecycle_evidence_ledger_verify;

    assert.equal(verifyResult.status, 'verified');
    assert.equal(verifyResult.verified_receipt_count, 1);
    assert.equal(verifyResult.authority_boundary.can_write_domain_truth, false);
    assert.equal(verifyResult.authority_boundary.can_create_owner_receipt, false);
    assert.equal(verifyResult.authority_boundary.can_generate_typed_blocker, false);

    const ledger = runCli([
      'runtime',
      'memory-artifact-lifecycle-evidence',
      'list',
    ], env).memory_artifact_lifecycle_evidence_ledger;
    const projection = ledger.projection;

    assert.equal(ledger.receipt_count, 1);
    assert.equal(projection.evidence_ledger_status, 'ledger_refs_verified');
    assert.equal(projection.verified_receipt_ref_count, 1);
    assert.equal(projection.pending_verify_receipt_ref_count, 0);
    assert.deepEqual(projection.memory_receipt_refs, ['memory-receipt:domain/accepted']);
    assert.deepEqual(projection.memory_writeback_receipt_refs, [
      'memory-writeback-receipt:domain/accepted',
    ]);
    assert.deepEqual(projection.artifact_mutation_receipt_refs, [
      'artifact-receipt:domain/package',
    ]);
    assert.deepEqual(projection.package_lifecycle_receipt_refs, [
      'package-lifecycle:domain/package',
    ]);
    assert.deepEqual(projection.export_lifecycle_receipt_refs, [
      'export-lifecycle:domain/export',
    ]);
    assert.deepEqual(projection.cleanup_restore_retention_receipt_refs, [
      'cleanup-restore:domain/retention',
    ]);
    assert.deepEqual(projection.typed_blocker_refs, [
      'typed-blocker:lifecycle/domain-followthrough',
    ]);
    assert.deepEqual(projection.owner_acceptance_refs, [
      'owner-acceptance:lifecycle/domain-followthrough',
    ]);
    assert.equal(projection.ready_claim_authorized, false);
    assert.equal(projection.verified_refs_only_ledger_counts_as_memory_ready, false);
    assert.equal(projection.verified_refs_only_ledger_counts_as_artifact_ready, false);
    assert.equal(projection.verified_refs_only_ledger_counts_as_package_ready, false);
    assert.equal(projection.verified_refs_only_ledger_counts_as_export_ready, false);

    const appProjection = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], env).app_operator_drilldown;
    const lifecycle = appProjection.memory_artifact_lifecycle;

    assert.equal(appProjection.summary.memory_artifact_lifecycle_evidence_ledger_receipt_ref_count, 1);
    assert.equal(appProjection.summary.memory_artifact_lifecycle_evidence_verified_ledger_receipt_ref_count, 1);
    assert.equal(appProjection.summary.memory_artifact_lifecycle_evidence_pending_verify_receipt_ref_count, 0);
    assert.equal(appProjection.summary.memory_artifact_lifecycle_evidence_typed_blocker_ref_count, 1);
    assert.equal(appProjection.summary.memory_artifact_lifecycle_evidence_owner_acceptance_ref_count, 1);
    assert.equal(
      appProjection.summary.memory_artifact_lifecycle_evidence_verified_refs_only_ledger_counts_as_memory_ready,
      false,
    );
    assert.equal(
      appProjection.summary.memory_artifact_lifecycle_evidence_verified_refs_only_ledger_counts_as_artifact_ready,
      false,
    );
    assert.equal(lifecycle.evidence_ledger_status, 'ledger_refs_verified');
    assert.equal(lifecycle.ledger_verified_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_pending_verify_receipt_ref_count, 0);
    assert.equal(lifecycle.ledger_memory_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_memory_writeback_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_artifact_mutation_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_package_lifecycle_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_export_lifecycle_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_cleanup_restore_retention_receipt_ref_count, 1);
    assert.equal(lifecycle.ledger_typed_blocker_ref_count, 1);
    assert.deepEqual(lifecycle.ledger_latest_typed_blocker_refs, [
      'typed-blocker:lifecycle/domain-followthrough',
    ]);
    assert.equal(lifecycle.ledger_owner_acceptance_ref_count, 1);
    assert.deepEqual(lifecycle.ledger_owner_acceptance_refs, [
      'owner-acceptance:lifecycle/domain-followthrough',
    ]);
    assert.equal(lifecycle.ready_claim_authorized, false);
    assert.equal(
      lifecycle.authority_boundary.verified_refs_only_ledger_counts_as_memory_ready,
      false,
    );
    assert.equal(
      lifecycle.authority_boundary.verified_refs_only_ledger_counts_as_artifact_ready,
      false,
    );

    const attentionLifecycle =
      appProjection.attention_first_payload.evidence_after_contract
        .memory_artifact_lifecycle_evidence;
    assert.equal(attentionLifecycle.ledger_verified_receipt_ref_count, 1);
    assert.equal(attentionLifecycle.ledger_owner_acceptance_ref_count, 1);
    assert.equal(attentionLifecycle.ready_claim_authorized, false);

    const readback = runCli([
      'runtime',
      'memory-artifact-lifecycle',
    ], env).memory_artifact_lifecycle_readback;
    assert.equal(readback.summary.ledger_receipt_ref_count, 1);
    assert.equal(readback.summary.ledger_verified_receipt_ref_count, 1);
    assert.equal(readback.summary.ledger_pending_verify_receipt_ref_count, 0);
    assert.equal(readback.summary.ledger_typed_blocker_ref_count, 1);
    assert.equal(readback.summary.ledger_owner_acceptance_ref_count, 1);
    assert.equal(readback.ledger_evidence_projection.evidence_ledger_status, 'ledger_refs_verified');
    assert.deepEqual(readback.ledger_evidence_projection.verified_receipt_refs, [
      'opl://memory-artifact-lifecycle-evidence/domain-owner-demo',
    ]);
    assert.equal(readback.ledger_evidence_projection.ready_claim_authorized, false);
    assert.equal(
      readback.ledger_evidence_projection.verified_refs_only_ledger_counts_as_memory_ready,
      false,
    );
    assert.equal(
      readback.ledger_evidence_projection.verified_refs_only_ledger_counts_as_artifact_ready,
      false,
    );
    assert.equal(readback.authority_boundary.can_read_memory_body, false);
    assert.equal(readback.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(readback.authority_boundary.can_create_owner_receipt, false);
    assert.equal(readback.authority_boundary.can_create_typed_blocker, false);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 0);
    assert.equal(
      maturity.memory_artifact_lifecycle.status,
      'evidence_recorded_not_artifact_or_memory_ready_claim',
    );
    assert.equal(maturity.memory_artifact_lifecycle.ledger_verified_receipt_ref_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.ledger_pending_verify_receipt_ref_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.ledger_owner_acceptance_ref_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.verified_owner_evidence_recorded, true);
    assert.deepEqual(maturity.memory_artifact_lifecycle.missing_owner_action_ids, []);
    assert.equal(maturity.memory_artifact_lifecycle.ready_claim_authorized, false);
    assert.equal(
      maturity.memory_artifact_lifecycle.verified_refs_only_ledger_counts_as_memory_ready,
      false,
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.verified_refs_only_ledger_counts_as_artifact_ready,
      false,
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.verified_refs_only_ledger_counts_as_package_ready,
      false,
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.verified_refs_only_ledger_counts_as_export_ready,
      false,
    );
    const lifecycleGate = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'memory_artifact_lifecycle_apply',
      );
    assert.equal(lifecycleGate.open_count, 0);
    assert.equal(lifecycleGate.ready_claim_authorized, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
