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

test('runtime app-operator-drilldown reconciles MAS refs-only payload with OPL lifecycle ledger refs', () => {
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
    const drilldown = output.app_operator_drilldown;

    assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(drilldown.authority_boundary.can_read_artifact_body, false);
    assert.equal(drilldown.summary.owner_receipt_ref_count, 4);
    assert.equal(drilldown.summary.typed_blocker_count, 3);
    assert.equal(drilldown.summary.domain_dispatch_evidence_domain_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_attempt_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_owner_receipt_ref_count, 3);
    assert.equal(drilldown.summary.domain_dispatch_evidence_typed_blocker_ref_count, 2);
    assert.equal(drilldown.summary.domain_dispatch_evidence_no_regression_ref_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_memory_writeback_ref_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_domain_ready_claim_count, 0);
    assert.equal(drilldown.summary.current_control_state_count, 1);
    assert.equal(drilldown.summary.current_control_state_blocked_count, 1);
    assert.equal(drilldown.summary.lifecycle_index_ref_count, 2);
    assert.equal(drilldown.summary.lifecycle_restore_proof_ref_count, 2);
    assert.equal(drilldown.summary.lifecycle_reconcile_missing_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_reconcile_extra_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_reconcile_stale_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_domain_physical_delete_requires_owner_receipt, true);
    assert.equal(drilldown.summary.lifecycle_domain_physical_delete_can_execute, false);
    assert.equal(drilldown.summary.lifecycle_opl_cleanup_apply_can_execute, true);
    assert.equal(drilldown.summary.safe_action_ref_count >= 2, true);
    assert.equal(drilldown.summary.freshness_signal_count >= 1, true);

    assert.equal(
      drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:guarded-apply'
      ),
      true,
    );
    assert.equal(
      drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:transition'
      ),
      true,
    );
    assert.equal(
      drilldown.typed_blocker_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-blocker:publication-currentness'
      ),
      true,
    );
    assert.equal(
      drilldown.typed_blocker_refs.blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'domain_owned_lifecycle_receipt_required'
      ),
      true,
    );
    assert.equal(drilldown.domain_dispatch_evidence.surface_kind, 'opl_app_drilldown_domain_dispatch_evidence');
    assert.equal(drilldown.domain_dispatch_evidence.summary.domain_count, 1);
    assert.equal(drilldown.domain_dispatch_evidence.by_domain.medautoscience.attempt_count, 1);
    assert.equal(
      drilldown.domain_dispatch_evidence.by_domain.medautoscience.domain_ready_claim_count,
      0,
    );
    assert.equal(
      drilldown.domain_dispatch_evidence.attempts[0].authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(drilldown.current_control_state.surface_kind, 'opl_app_drilldown_current_control_state_projection');
    assert.equal(drilldown.current_control_state.summary.current_control_state_count, 1);
    assert.equal(drilldown.current_control_state.states[0].reconciliation_status, 'blocked_missing_identity');
    assert.equal(drilldown.current_control_state.authority_boundary.reads_domain_latest_or_dispatch_latest, false);
    assert.equal(drilldown.current_control_state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(drilldown.current_control_state.states[0], 'domain_ready'), false);
    assert.equal(Object.hasOwn(drilldown.current_control_state.states[0], 'publication_ready'), false);
    assert.equal(Object.hasOwn(drilldown.current_control_state.states[0], 'artifact_ready'), false);
    assert.deepEqual(
      drilldown.domain_dispatch_evidence.attempts[0].no_regression_evidence_refs,
      ['mas-no-regression:package'],
    );
    assert.deepEqual(
      drilldown.domain_dispatch_evidence.attempts[0].writeback_receipt_refs,
      ['memory-writeback:receipt-1'],
    );
    assert.equal(
      drilldown.freshness_refs.refs.some((ref: { source_fingerprint: string }) =>
        ref.source_fingerprint === 'sha256:mas-drilldown-source'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.source_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'source:dataset'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.artifact_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'artifact:table'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.memory_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'memory:route-policy'
      ),
      true,
    );
    assert.equal(
      drilldown.safe_action_refs.refs.some((ref: { role: string; ref: string }) =>
        ref.role === 'lifecycle_cleanup_receipt_ref'
          && ref.ref.startsWith('opl://family-runtime/lifecycle-apply/medautoscience')
      ),
      true,
    );
    assert.deepEqual(drilldown.lifecycle_ledger_refs.restore_proof_refs, [
      'restore-proof:mas-index',
      'restore-proof:mas-package',
    ]);
    assert.equal(drilldown.lifecycle_ledger_refs.reconcile_projection.status, 'reconciled');
    assert.equal(
      drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.can_execute_delete,
      false,
    );
    assert.equal(
      drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.opl_cleanup_apply_ready,
      true,
    );
    assert.equal(drilldown.lifecycle_ledger_refs.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
