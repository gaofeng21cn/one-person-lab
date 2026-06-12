import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}
test('family-runtime lifecycle guarded apply separates OPL ledger apply from domain-owned cleanup blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-lifecycle-guarded-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'deliverable-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/redcube',
        runtime_root: '/tmp/redcube/runtime',
        artifact_root: '/tmp/redcube/artifacts',
        restore_refs: ['restore:redcube-run-1'],
        lifecycle_apply_requests: [
          {
            action_id: 'opl-ledger-retention-index',
            action_kind: 'retention',
            target_ref: 'opl-ledger:redcube-run-1',
            authority_owner: 'opl_framework',
            owner_scope: 'opl_owned_ledger',
          },
          {
            action_id: 'redcube-artifact-cleanup',
            action_kind: 'cleanup',
            target_ref: 'artifact:redcube-final-deck',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
            restore_ref: 'restore:redcube-run-1',
          },
          {
            action_id: 'redcube-retention-restore-missing',
            action_kind: 'retention',
            target_ref: 'artifact:redcube-draft-cache',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
          },
          {
            action_id: 'redcube-domain-receipt-observed',
            action_kind: 'restore',
            target_ref: 'artifact:redcube-review-pdf',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
            domain_receipt_ref: 'redcube-receipt:restore-accepted',
            restore_ref: 'restore:redcube-run-1',
          },
        ],
      }),
      '--source-fingerprint',
      'sha256:lifecycle',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const proof = query.family_runtime_stage_attempt_query.stage_attempt_query
      .lifecycle_primitives.guarded_apply_proof;

    assert.equal(proof.surface_kind, 'family_runtime_lifecycle_guarded_apply_proof');
    assert.equal(proof.apply_status, 'blocked_domain_receipt_required');
    assert.deepEqual(proof.summary, {
      requested_actions_count: 4,
      opl_apply_permitted_count: 1,
      domain_receipt_observed_count: 1,
      typed_blocker_count: 2,
      domain_writes_performed: false,
    });
    assert.equal(proof.actions[0].apply_decision, 'opl_apply_permitted');
    assert.equal(proof.actions[0].receipt_kind, 'opl_lifecycle_ledger_apply_receipt');
    assert.equal(proof.actions[1].apply_decision, 'typed_blocker');
    assert.equal(proof.actions[1].blocker.blocker_id, 'domain_owned_lifecycle_receipt_required');
    assert.equal(proof.actions[2].blocker.blocker_id, 'restore_ref_required_before_lifecycle_apply');
    assert.equal(proof.actions[3].apply_decision, 'domain_receipt_observed');
    assert.equal(proof.actions[3].opl_writes_domain_truth, false);
    assert.deepEqual(proof.authority_boundary.forbidden_opl_actions, [
      'delete_domain_artifact',
      'restore_domain_workspace_content',
      'apply_domain_retention_policy',
      'write_domain_truth',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime controlled apply contract returns MAS/MAG/RCA domain receipt requirements without domain writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-controlled-apply-'));
  try {
    const mas = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'finalize-and-publication-handoff',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        controlled_apply_request: {
          action_kind: 'paper_autonomy/guarded-apply',
        },
      }),
      '--source-fingerprint',
      'sha256:mas-controlled-apply',
    ], familyRuntimeEnv(stateRoot));
    const mag = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'specific-aims',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mag',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
        },
      }),
      '--source-fingerprint',
      'sha256:mag-controlled-apply',
    ], familyRuntimeEnv(stateRoot));
    const rca = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'visual-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/rca',
        controlled_soak_no_regression_attempt: {
          surface_kind: 'controlled_soak_no_regression_attempt',
          no_regression_evidence_refs: ['rca:no-regression:visual-stage-1'],
        },
      }),
      '--source-fingerprint',
      'sha256:rca-controlled-apply',
    ], familyRuntimeEnv(stateRoot));

    const masQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      mas.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const magQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      mag.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const rcaQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      rca.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const masContract = masQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;
    const magContract = magQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;
    const rcaContract = rcaQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;

    assert.equal(masContract.surface_kind, 'family_runtime_controlled_apply_contract');
    assert.equal(masContract.contract_id, 'opl_temporal_controlled_mas_owner_answer_apply_contract');
    assert.equal(masContract.apply_status, 'blocked_domain_receipt_required');
    assert.deepEqual(masContract.authority_boundary.allowed_return_shapes, [
      'domain_owner_receipt_ref',
      'quality_gate_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_evidence_ref',
      'no_regression_evidence_ref',
    ]);
    assert.deepEqual(masContract.typed_blockers[0].required_return_shapes, [
      'domain_owner_receipt_ref',
      'quality_gate_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_evidence_ref',
      'no_regression_evidence_ref',
    ]);
    assert.equal(masContract.no_forbidden_write_proof.opl_writes_domain_truth, false);
    assert.equal(masContract.no_forbidden_write_proof.opl_writes_domain_artifact, false);
    assert.equal(masContract.no_forbidden_write_proof.opl_writes_domain_memory_body, false);
    assert.equal(magContract.surface_kind, 'family_runtime_controlled_apply_contract');
    assert.equal(magContract.contract_id, 'opl_temporal_controlled_stage_attempt_apply_contract');
    assert.equal(magContract.contract_open, true);
    assert.equal(magContract.apply_status, 'blocked_domain_receipt_required');
    assert.equal(
      magContract.typed_blockers[0].blocker_id,
      'opl_temporal_controlled_stage_attempt_apply_contract:domain_receipt_or_no_regression_evidence_required',
    );
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_truth, false);
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_artifact, false);
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_memory_body, false);
    assert.equal(rcaContract.contract_id, 'opl_temporal_controlled_visual_stage_attempt_apply_contract');
    assert.equal(rcaContract.apply_status, 'no_regression_evidence_observed');
    assert.deepEqual(rcaContract.no_regression_evidence_refs, ['rca:no-regression:visual-stage-1']);
    assert.deepEqual(rcaContract.typed_blockers, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
