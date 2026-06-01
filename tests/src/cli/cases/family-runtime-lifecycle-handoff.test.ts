import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return {
    OPL_STATE_DIR: stateRoot,
  };
}

test('family-runtime lifecycle apply consumes MAS physical thinning handoff as blocked refs-only actions', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-lifecycle-handoff-'));
  try {
    const handoffPath = path.join(stateRoot, 'mas-physical-thinning-handoff.json');
    fs.writeFileSync(
      handoffPath,
      JSON.stringify({
        surface_kind: 'artifact_lifecycle_physical_thinning_handoff',
        handoff_ref: 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:test',
        body_free: true,
        candidate_count: 493,
        candidate_ref_count: 493,
        candidate_refs: [
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:one',
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:two',
        ],
        candidate_sample: [
          {
            candidate_ref: 'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:one',
            retention_action: 'regenerate_projection_then_remove_stale',
          },
          {
            candidate_ref: 'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:two',
            retention_action: 'regenerate_projection_then_remove_stale',
          },
        ],
        selected_payload_path: 'typed_blocker_path',
        typed_blocker_refs: [
          'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:one',
        ],
        next_owner_action: {
          owner: 'one-person-lab',
          action: 'generic_lifecycle_apply',
          requires_restore_or_regeneration_receipt_before_cleanup: true,
        },
        authority_boundary: {
          mas_executes_physical_cleanup: false,
          can_authorize_artifact_mutation: false,
        },
      }),
      'utf8',
    );

    const dryRun = runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'dry-run',
      '--domain',
      'medautoscience',
      '--handoff-file',
      handoffPath,
    ], familyRuntimeEnv(stateRoot));

    const result = dryRun.family_runtime_lifecycle_apply;
    assert.equal(result.status, 'blocked');
    assert.equal(result.source_ref, 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:test');
    assert.equal(result.summary.safe_action_count, 0);
    assert.equal(result.summary.unsafe_action_count, 2);
    assert.equal(result.summary.writes_performed, false);
    assert.equal(result.handoff_summary.handoff_ref, 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:test');
    assert.equal(result.handoff_summary.candidate_ref_count, 493);
    assert.equal(result.handoff_summary.typed_blocker_ref_count, 1);
    assert.equal(result.handoff_summary.selected_payload_path, 'typed_blocker_path');
    assert.equal(result.actions[0].action_kind, 'generic_lifecycle_apply');
    assert.equal(result.actions[0].owner_scope, 'domain_artifact_mutation_receipt_ref');
    assert.equal(result.actions[0].blocker.blocker_id, 'domain_owned_lifecycle_typed_blocker_ref_observed');
    assert.deepEqual(result.actions[0].handoff_refs, [
      'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:test',
    ]);
    assert.deepEqual(result.actions[0].domain_owner_handoff_receipt_refs, []);
    assert.equal(result.actions[0].writes_artifact_body, false);
    assert.equal(result.receipt_ref, null);

    const verified = runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'verify',
      '--domain',
      'medautoscience',
    ], familyRuntimeEnv(stateRoot));
    assert.equal(verified.family_runtime_lifecycle_apply.summary.verified_receipt_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime lifecycle apply forwards physical thinning handoff to the shared ledger surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-lifecycle-handoff-'));
  try {
    const result = runCli([
      'runtime',
      'lifecycle',
      'apply',
      '--mode',
      'dry-run',
      '--domain',
      'medautoscience',
      '--handoff',
      JSON.stringify({
        surface_kind: 'artifact_lifecycle_physical_thinning_handoff',
        handoff_ref: 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:runtime',
        body_free: true,
        candidate_count: 1,
        candidate_refs: [
          'mas-artifact-lifecycle-candidate:medautoscience:regenerate-projection:runtime',
        ],
        selected_payload_path: 'typed_blocker_path',
        typed_blocker_refs: [
          'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:runtime',
        ],
      }),
    ], familyRuntimeEnv(stateRoot));

    assert.equal(result.family_runtime_lifecycle_apply, undefined);
    assert.equal(result.runtime_lifecycle_apply.status, 'blocked');
    assert.equal(result.runtime_lifecycle_apply.handoff_summary.handoff_ref, 'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:runtime');
    assert.equal(result.runtime_lifecycle_apply.summary.unsafe_action_count, 1);
    assert.equal(result.runtime_lifecycle_apply.authority_boundary.opl_can_write_artifact_body, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
