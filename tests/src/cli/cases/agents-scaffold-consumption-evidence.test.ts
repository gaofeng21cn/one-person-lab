import { assert, fs, runCli, test } from '../helpers.ts';

test('agents scaffold consumption evidence generates and validates an ephemeral new agent skeleton', () => {
  const evidence = runCli([
    'agents',
    'scaffold',
    '--consumption-evidence',
    '--domain-id',
    'award-foundry',
  ]).standard_domain_agent_template_consumption_evidence;

  assert.equal(evidence.surface_kind, 'opl_standard_agent_template_consumption_evidence');
  assert.equal(evidence.owner, 'one-person-lab');
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.proof_kind, 'ephemeral_generate_then_validate_new_agent_skeleton');
  assert.match(
    evidence.evidence_ref,
    /^opl:\/\/standard-agent-template-consumption\/award-foundry\/[a-f0-9]{16}$/,
  );
  assert.match(evidence.evidence_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    evidence.evidence_ref_policy,
    'deterministic_shape_ref_for_replayable_template_consumption_evidence_not_a_ledger_receipt',
  );
  assert.equal(evidence.generated_repo_dir_policy, 'ephemeral_removed_after_validation');
  assert.equal(fs.existsSync(evidence.generated_repo_dir_ref), false);
  assert.equal(evidence.generation_summary.generated_written_file_count > 0, true);
  assert.equal(
    evidence.generation_summary.generated_written_file_count,
    evidence.generation_summary.generated_template_file_count,
  );
  assert.equal(evidence.validation_summary.validation_status, 'passed');
  assert.equal(evidence.validation_summary.blocker_count, 0);
  assert.equal(evidence.validation_summary.consumed_pack_path_count, 8);
  assert.equal(evidence.validation_summary.consumed_stage_count, 1);
  assert.equal(evidence.validation_summary.selected_executor_binding_observed_count, 1);
  assert.equal(evidence.validation_summary.default_codex_executor_binding_count, 1);
  assert.equal(evidence.validation_summary.quality_gate_ref_resolved_stage_count, 1);
  assert.equal(evidence.validation_summary.generated_surface_owner_verified, true);
  assert.equal(evidence.validation_summary.private_surface_policy_guarded, true);
  assert.equal(evidence.validation_summary.stage_pack_v2_status, 'passed');
  assert.equal(
    evidence.surface_consumption_proof.consumed_surface_status,
    'scaffold_conformance_readiness_and_app_operator_surfaces_consumed',
  );
  assert.equal(evidence.surface_consumption_proof.conformance_status, 'passed');
  assert.equal(evidence.surface_consumption_proof.conformance_passed_count, 1);
  assert.equal(evidence.surface_consumption_proof.conformance_blocked_count, 0);
  assert.equal(evidence.surface_consumption_proof.readiness_structural_conformance_status, 'passed');
  assert.equal(evidence.surface_consumption_proof.readiness_scaffold_gate_status, 'passed');
  assert.equal(
    evidence.surface_consumption_proof.app_operator_refs.status,
    'app_operator_projection_consumable',
  );
  assert.equal(evidence.scaffold_consumption_refs.status, 'validated_template_consumed');
  assert.equal(evidence.scaffold_consumption_refs.validation_consumed_generated_repo, true);
  assert.equal(evidence.scaffold_consumption_refs.default_codex_executor_binding_count, 1);
  assert.equal(evidence.scaffold_consumption_refs.app_operator_consumable, true);
  assert.equal(
    evidence.scaffold_consumption_refs.authority_boundary.scaffold_validation_can_claim_production_ready,
    false,
  );
  assert.deepEqual(evidence.non_goals, [
    'does_not_claim_domain_ready',
    'does_not_claim_artifact_authority',
    'does_not_claim_production_ready',
    'does_not_authorize_quality_or_export',
  ]);
  assert.equal(evidence.consumption_cohort.sample_count, 1);
  assert.equal(evidence.consumption_cohort.explicit_sample_requested, true);
  assert.deepEqual(evidence.sample_domain_ids, ['award-foundry']);
});

test('agents scaffold consumption evidence repeats generate and validate across default new-agent samples', () => {
  const evidence = runCli([
    'agents',
    'scaffold',
    '--consumption-evidence',
  ]).standard_domain_agent_template_consumption_evidence;

  assert.equal(evidence.surface_kind, 'opl_standard_agent_template_consumption_evidence');
  assert.equal(evidence.owner, 'one-person-lab');
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.proof_kind, 'repeat_ephemeral_generate_then_validate_new_agent_skeletons');
  assert.match(
    evidence.cohort_evidence_ref,
    /^opl:\/\/standard-agent-template-consumption\/cohort\/[a-f0-9]{16}$/,
  );
  assert.match(evidence.cohort_evidence_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    evidence.evidence_receipt_candidate_policy,
    'candidate_refs_are_body_free_replayable_shape_ids_not_recorded_ledger_receipts_and_do_not_claim_domain_ready_or_production_ready',
  );
  assert.deepEqual(evidence.sample_domain_ids, [
    'award-foundry',
    'thesis-foundry',
    'review-foundry',
  ]);
  assert.equal(
    evidence.read_model_contract_ref,
    '/runtime_tray_snapshot/app_operator_drilldown/standard_agent_template_consumption_refs/evidence_contract',
  );
  assert.equal(evidence.consumption_cohort.sample_count, 3);
  assert.equal(evidence.consumption_cohort.passed_sample_count, 3);
  assert.equal(evidence.consumption_cohort.blocked_sample_count, 0);
  assert.equal(evidence.consumption_cohort.all_samples_passed, true);
  assert.equal(evidence.consumption_cohort.explicit_sample_requested, false);
  const sampleEvidenceRefs = evidence.consumption_cohort.samples.map((
    sample: { evidence_ref: string },
  ) => sample.evidence_ref);
  assert.deepEqual(
    sampleEvidenceRefs.map((ref: string) =>
      /^opl:\/\/standard-agent-template-consumption\/[a-z-]+\/[a-f0-9]{16}$/.test(ref)
    ),
    [true, true, true],
  );
  assert.equal(new Set(sampleEvidenceRefs).size, 3);
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { evidence_fingerprint: string }) =>
      /^sha256:[a-f0-9]{64}$/.test(sample.evidence_fingerprint)
    ),
    [true, true, true],
  );
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { generated_repo_dir_policy: string }) =>
      sample.generated_repo_dir_policy
    ),
    [
      'ephemeral_removed_after_validation',
      'ephemeral_removed_after_validation',
      'ephemeral_removed_after_validation',
    ],
  );
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { validation_summary: { validation_status: string } }) =>
      sample.validation_summary.validation_status
    ),
    ['passed', 'passed', 'passed'],
  );
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((sample: { validation_summary: { default_codex_executor_binding_count: number } }) =>
      sample.validation_summary.default_codex_executor_binding_count
    ),
    [1, 1, 1],
  );
  assert.equal(evidence.consumption_cohort.consumed_surface_count_per_sample, 4);
  assert.deepEqual(evidence.consumption_cohort.consumed_surfaces, [
    'scaffold_validation',
    'standard_agent_conformance',
    'agent_readiness',
    'app_operator_projection',
  ]);
  assert.deepEqual(
    evidence.consumption_cohort.samples.map((
      sample: {
        surface_consumption_proof: {
          conformance_status: string;
          readiness_structural_conformance_status: string;
          app_operator_refs: { status: string };
        };
      },
    ) => [
      sample.surface_consumption_proof.conformance_status,
      sample.surface_consumption_proof.readiness_structural_conformance_status,
      sample.surface_consumption_proof.app_operator_refs.status,
    ]),
    [
      ['passed', 'passed', 'app_operator_projection_consumable'],
      ['passed', 'passed', 'app_operator_projection_consumable'],
      ['passed', 'passed', 'app_operator_projection_consumable'],
    ],
  );
  assert.equal(
    evidence.repeat_consumption_policy,
    'default_command_runs_a_small_multi_domain_ephemeral_cohort_through_scaffold_conformance_readiness_and_app_operator_projection_without_claiming_domain_ready_or_production_ready',
  );
});
