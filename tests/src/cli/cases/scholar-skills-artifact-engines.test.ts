import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

const moduleIds = [
  'opl.scholarskills.display',
  'opl.scholarskills.tables',
  'opl.scholarskills.stats',
  'opl.scholarskills.omics',
  'opl.scholarskills.lit',
  'opl.scholarskills.write',
  'opl.scholarskills.review',
  'opl.scholarskills.submit',
  'opl.scholarskills.data',
  'opl.scholarskills.intake',
] as const;

const expectedArtifactRefFamiliesByModule = {
  'opl.scholarskills.display': ['display_pack_agent_orchestration'],
  'opl.scholarskills.tables': ['table_manifest', 'table_qc'],
  'opl.scholarskills.stats': ['analysis_manifest', 'reproducibility_check'],
  'opl.scholarskills.omics': ['omics_pipeline_manifest', 'feature_matrix_qc'],
  'opl.scholarskills.lit': ['evidence_map', 'citation_manifest'],
  'opl.scholarskills.write': ['draft_section_manifest', 'source_trace'],
  'opl.scholarskills.review': ['reviewer_report', 'route_back'],
  'opl.scholarskills.submit': ['package_manifest', 'submission_checklist'],
  'opl.scholarskills.data': [
    'data_manifest',
    'dataset_manifest',
    'registry_lineage',
    'semantic_readiness',
    'study_binding',
    'privacy_access_tier',
    'retention_guardrail',
    'storage_tier',
    'authoritative_body_boundary',
    'derived_copy_inventory',
    'analytical_format_strategy',
    'cold_restore_proof',
    'read_model_boundary',
    'lineage_readiness',
  ],
  'opl.scholarskills.intake': ['source_snapshot', 'adoption_contract'],
} satisfies Record<typeof moduleIds[number], string[]>;

const expectedEngineIdsByModule = {
  'opl.scholarskills.display': 'scholar_display_candidate_visual_plan_engine',
  'opl.scholarskills.tables': 'scholar_tables_candidate_table_manifest_engine',
  'opl.scholarskills.stats': 'scholar_stats_candidate_analysis_engine',
  'opl.scholarskills.omics': 'scholar_omics_candidate_pipeline_engine',
  'opl.scholarskills.lit': 'scholar_lit_candidate_evidence_map_engine',
  'opl.scholarskills.write': 'scholar_write_candidate_section_engine',
  'opl.scholarskills.review': 'scholar_review_candidate_report_engine',
  'opl.scholarskills.submit': 'scholar_submit_candidate_package_engine',
  'opl.scholarskills.data': 'scholar_data_candidate_lineage_engine',
  'opl.scholarskills.intake': 'scholar_intake_candidate_source_engine',
} satisfies Record<typeof moduleIds[number], string>;

const expectedEngineSpecByModule = {
  'opl.scholarskills.display': {
    required: ['title', 'source_refs'],
    optional: ['variables', 'panel_plan', 'figure_type', 'cohort_ref', 'color_vision', 'grayscale', 'panel_to_code_review', 'source_preservation'],
    checks: ['visual_qa_preview', 'programmatic_figure_audit', 'final_size_inspection', 'color_vision/grayscale', 'panel_to_code_review', 'source_preservation', 'owner_gate_required'],
    sections: ['visual_qa_preview', 'programmatic_figure_audit', 'final_size_inspection', 'color_vision/grayscale', 'panel_to_code_review', 'source_preservation'],
  },
  'opl.scholarskills.tables': {
    required: ['title', 'source_refs'],
    optional: ['title', 'columns', 'row_groups', 'footnotes', 'stat_refs', 'booktabs_or_minimal_ink', 'table_qc', 'claim_table_alignment', 'result_metric_registry', 'ai_table_verdict_candidate'],
    checks: ['table_shell', 'metric_extraction', 'booktabs_or_minimal_ink', 'table_qc', 'claim_table_alignment', 'result_metric_registry', 'ai_table_verdict_candidate', 'owner_gate_required'],
    sections: ['table_shell', 'metric_extraction', 'booktabs_or_minimal_ink', 'table_qc', 'claim_table_alignment', 'result_metric_registry', 'ai_table_verdict_candidate'],
  },
  'opl.scholarskills.stats': {
    required: ['analysis_question', 'source_refs'],
    optional: ['analysis_question', 'model', 'variables', 'cohort_ref', 'sensitivity_checks', 'effect_size_or_metric_extraction', 'reproducibility_check', 'statistical_review', 'dataset_metric_benchmark', 'result_metric_registry', 'ai_statistical_verdict_candidate', 'no_statistical_conclusion_claim'],
    checks: ['analysis_plan', 'effect_size_or_metric_extraction', 'reproducibility_check', 'statistical_review', 'dataset_metric_benchmark', 'result_metric_registry', 'ai_statistical_verdict_candidate', 'no_statistical_conclusion_claim', 'owner_gate_required'],
    sections: ['analysis_plan', 'effect_size_or_metric_extraction', 'reproducibility_check', 'statistical_review', 'dataset_metric_benchmark', 'result_metric_registry', 'ai_statistical_verdict_candidate', 'no_statistical_conclusion_claim'],
  },
  'opl.scholarskills.omics': {
    required: ['pipeline_goal', 'source_refs'],
    optional: ['pipeline_goal', 'feature_set', 'normalization', 'batch_correction', 'matrix_ref', 'omics_visualization_plan', 'pathway_context', 'domain_review', 'no_omics_truth_claim'],
    checks: ['feature_matrix_qc', 'omics_visualization_plan', 'pathway_context', 'domain_review', 'no_omics_truth_claim', 'owner_gate_required'],
    sections: ['feature_matrix_qc', 'omics_visualization_plan', 'pathway_context', 'domain_review', 'no_omics_truth_claim'],
  },
  'opl.scholarskills.lit': {
    required: ['question', 'source_refs'],
    optional: ['question', 'databases', 'query_terms', 'inclusion_criteria', 'citation_refs', 'source_verification', 'citation_coverage', 'evidence_map', 'metadata_scrape', 'claim_support', 'systematic_review_protocol', 'inclusion_exclusion_criteria', 'data_extraction_schema', 'quality_appraisal', 'citation_graph_snowball', 'multi_source_paper_search', 'confirm_or_drop_source_verification', 'ai_literature_verdict_candidate'],
    checks: ['citation_manifest', 'source_verification', 'citation_coverage', 'evidence_map', 'metadata_scrape', 'claim_support', 'systematic_review_protocol', 'inclusion_exclusion_criteria', 'data_extraction_schema', 'quality_appraisal', 'citation_graph_snowball', 'multi_source_paper_search', 'confirm_or_drop_source_verification', 'ai_literature_verdict_candidate', 'owner_gate_required'],
    sections: ['citation_manifest', 'source_verification', 'citation_coverage', 'evidence_map', 'metadata_scrape', 'claim_support', 'systematic_review_protocol', 'inclusion_exclusion_criteria', 'data_extraction_schema', 'quality_appraisal', 'citation_graph_snowball', 'multi_source_paper_search', 'confirm_or_drop_source_verification', 'ai_literature_verdict_candidate'],
  },
  'opl.scholarskills.write': {
    required: ['section_goal', 'source_refs'],
    optional: ['section_goal', 'outline', 'claims', 'target_journal', 'tone', 'reverse_outline', 'claim_evidence_map', 'source_trace', 'unsupported_claim_route_back', 'confirm_or_drop_source_verification', 'ai_claim_support_verdict_candidate', 'continue_or_route_back_recommendation'],
    checks: ['section_outline', 'reverse_outline', 'claim_evidence_map', 'source_trace', 'unsupported_claim_route_back', 'confirm_or_drop_source_verification', 'ai_claim_support_verdict_candidate', 'continue_or_route_back_recommendation', 'owner_gate_required'],
    sections: ['section_outline', 'reverse_outline', 'claim_evidence_map', 'source_trace', 'unsupported_claim_route_back', 'confirm_or_drop_source_verification', 'ai_claim_support_verdict_candidate', 'continue_or_route_back_recommendation'],
  },
  'opl.scholarskills.review': {
    required: ['review_scope', 'source_refs'],
    optional: ['review_scope', 'rubric', 'concerns', 'acceptance_criteria', 'route_back_refs', 'revision_action', 'halt_or_revert_rule', 'route_back', 'residual_risk', 'systematic_review_protocol', 'quality_appraisal', 'confirm_or_drop_source_verification', 'ai_review_verdict_candidate', 'continue_or_route_back_recommendation'],
    checks: ['adversarial_review', 'revision_action', 'halt_or_revert_rule', 'route_back', 'residual_risk', 'systematic_review_protocol', 'quality_appraisal', 'confirm_or_drop_source_verification', 'ai_review_verdict_candidate', 'continue_or_route_back_recommendation', 'owner_gate_required'],
    sections: ['adversarial_review', 'revision_action', 'halt_or_revert_rule', 'route_back', 'residual_risk', 'systematic_review_protocol', 'quality_appraisal', 'confirm_or_drop_source_verification', 'ai_review_verdict_candidate', 'continue_or_route_back_recommendation'],
  },
  'opl.scholarskills.submit': {
    required: ['submission_goal', 'source_refs'],
    optional: ['submission_goal', 'journal', 'required_files', 'cover_letter_points', 'compliance_checks', 'journal_rule', 'format_sanity', 'ai_disclosure', 'rebuttal_audit', 'no_publication_ready_authorization', 'ai_submission_sanity_verdict_candidate', 'continue_or_route_back_recommendation'],
    checks: ['submission_checklist', 'journal_rule', 'format_sanity', 'ai_disclosure', 'rebuttal_audit', 'no_publication_ready_authorization', 'ai_submission_sanity_verdict_candidate', 'continue_or_route_back_recommendation', 'owner_gate_required'],
    sections: ['submission_checklist', 'journal_rule', 'format_sanity', 'ai_disclosure', 'rebuttal_audit', 'no_publication_ready_authorization', 'ai_submission_sanity_verdict_candidate', 'continue_or_route_back_recommendation'],
  },
  'opl.scholarskills.data': {
    required: ['dataset_goal', 'source_refs'],
    optional: [
      'dataset_goal',
      'dataset_refs',
      'variables',
      'provenance',
      'privacy_constraints',
      'metadata_scrape',
      'source_lineage',
      'artifact_bundle_manifest',
      'data_dictionary',
      'privacy_access_tier',
      'study_refs',
      'semantic_dictionary_refs',
      'retention_policy_refs',
      'storage_tier_refs',
      'authoritative_body_refs',
      'derived_copy_refs',
      'analytical_format_refs',
      'cold_restore_refs',
      'read_model_refs',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_data_readiness_verdict_candidate',
    ],
    checks: [
      'metadata_scrape',
      'source_lineage',
      'artifact_bundle_manifest',
      'data_dictionary',
      'privacy_access_tier',
      'dataset_goal_present',
      'source_refs_present',
      'dataset_manifest_required',
      'registry_lineage_required',
      'semantic_readiness_required',
      'study_binding_required',
      'privacy_access_tier_required',
      'retention_guardrail_required',
      'storage_tier_required',
      'authoritative_body_boundary_required',
      'derived_copy_inventory_required',
      'analytical_format_strategy_required',
      'cold_restore_proof_required_before_body_retirement',
      'read_model_boundary_required',
      'lineage_readiness_required',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_data_readiness_verdict_candidate',
      'owner_gate_required',
    ],
    sections: [
      'metadata_scrape',
      'source_lineage',
      'artifact_bundle_manifest',
      'data_dictionary',
      'privacy_access_tier',
      'retention_guardrail',
      'storage_tier',
      'authoritative_body_boundary',
      'derived_copy_inventory',
      'analytical_format_strategy',
      'cold_restore_proof',
      'read_model_boundary',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_data_readiness_verdict_candidate',
    ],
  },
  'opl.scholarskills.intake': {
    required: ['intake_goal', 'source_refs'],
    optional: ['intake_goal', 'source_snapshot', 'owner', 'blocked_inputs', 'input_contract', 'adoption_contract', 'scope_boundary', 'multi_source_paper_search', 'research_blueprint_ref', 'ai_intake_adoption_verdict_candidate'],
    checks: ['upstream_commit', 'included_excluded_paths', 'dry_run_readback', 'input_contract', 'adoption_contract', 'scope_boundary', 'multi_source_paper_search', 'research_blueprint_ref', 'ai_intake_adoption_verdict_candidate', 'owner_gate_required'],
    sections: ['upstream_commit', 'included_excluded_paths', 'dry_run_readback', 'input_contract', 'adoption_contract', 'scope_boundary', 'multi_source_paper_search', 'research_blueprint_ref', 'ai_intake_adoption_verdict_candidate'],
  },
} satisfies Record<typeof moduleIds[number], {
  required: string[];
  optional: string[];
  checks: string[];
  sections: string[];
}>;

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('scholar-skills materialize emits non-authoritative candidate artifact bodies only with explicit payload opt-in', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-artifact-engines-'));
  try {
    const outputRoot = path.join(fixtureRoot, 'display-candidate');
    const payload = {
      title: 'Risk-adjusted outcome trend',
      source_refs: ['mas:source/cohort-v1'],
      visual_qa_preview: 'review exported preview before owner consumption',
      programmatic_figure_audit: 'audit geometry, labels, and source-bound panels',
      final_size_inspection: 'inspect at final journal target size',
      variables: ['age', 'hba1c', 'mortality'],
      cohort_ref: 'mas:source/cohort-v1',
      color_vision: 'color-vision safe palette',
      grayscale: 'grayscale distinguishability check',
      panel_to_code_review: 'panel code review ref',
      source_preservation: 'source refs preserved through rendering',
    };
    const first = runCli([
      'scholar-skills',
      'materialize',
      '--module',
      'opl.scholarskills.display',
      '--input-ref',
      'mas:current_owner_delta/display-intent',
      '--artifact-root',
      'artifact-root:display-pack-candidates',
      '--output-root',
      outputRoot,
      '--emit-candidate-artifacts',
      '--payload-json',
      JSON.stringify(payload),
      '--json',
    ]).scholar_skills_materialize;
    const second = runCli([
      'scholar-skills',
      'materialize',
      '--module',
      'opl.scholarskills.display',
      '--input-ref',
      'mas:current_owner_delta/display-intent',
      '--artifact-root',
      'artifact-root:display-pack-candidates',
      '--output-root',
      outputRoot,
      '--emit-candidate-artifacts',
      '--payload-json',
      JSON.stringify(payload),
      '--json',
    ]).scholar_skills_materialize;

    assert.equal(first.sha256, second.sha256);
    assert.equal(first.candidate_artifact_bodies.length, 1);
    assert.equal(first.candidate_artifact_bodies[0].body_format, 'svg');
    assert.equal(first.candidate_artifact_bodies[0].body_written, true);
    assert.equal(first.candidate_artifact_bodies[0].engine_id, expectedEngineIdsByModule['opl.scholarskills.display']);
    assert.equal(first.candidate_artifact_bodies[0].validation_status, 'pass');
    assert.equal(first.candidate_artifact_bodies[0].input_requirements.required_artifact_root_ref, true);
    assert.deepEqual(
      first.candidate_artifact_bodies[0].input_requirements.required_payload_fields,
      expectedEngineSpecByModule['opl.scholarskills.display'].required,
    );
    assert.deepEqual(
      first.candidate_artifact_bodies[0].input_requirements.optional_payload_fields,
      expectedEngineSpecByModule['opl.scholarskills.display'].optional,
    );
    assert.equal(first.candidate_artifact_bodies[0].kind, 'display_pack_agent_orchestration');
    assert.equal(first.candidate_artifact_bodies[0].ref, 'artifact-root:display-pack-candidates/display_pack_agent_orchestration');
    assert.equal(first.candidate_artifact_bodies[0].sha256.startsWith('sha256:'), true);
    assert.deepEqual(first.candidate_artifact_bodies[0].missing_inputs, []);
    assert.equal(first.candidate_artifact_bodies[0].body_included, true);
    assert.equal(first.candidate_artifact_bodies[0].body_carried_to_owner_request, false);
    assert.equal(first.candidate_artifact_bodies[0].engine_receipt_ref.startsWith('opl://scholarskills/artifact-engine-receipts/'), true);
    assert.equal(first.candidate_artifact_bodies[0].authority_flags.counts_as_paper_truth, false);
    assert.equal(first.candidate_artifact_bodies[0].authority_flags.can_sign_owner_receipt, false);
    assert.equal(first.written_files.includes(first.candidate_artifact_bodies[0].body_path), true);
    assert.equal(first.file_sha256[first.candidate_artifact_bodies[0].body_path], first.candidate_artifact_bodies[0].body_sha256);
    assert.equal(fs.existsSync(first.candidate_artifact_bodies[0].body_path), true);
    const svg = fs.readFileSync(first.candidate_artifact_bodies[0].body_path, 'utf8');
    assert.equal(svg.includes('section: visual_qa_preview'), true);
    assert.equal(svg.includes('section: programmatic_figure_audit'), true);
    assert.equal(svg.includes('section: final_size_inspection'), true);
    assert.equal(svg.includes('section: color_vision/grayscale'), true);

    const manifest = readJson(first.artifact_manifest_path);
    const moduleCandidate = readJson(first.module_candidate_path);
    const receipt = readJson(first.execution_receipt_candidate_path);
    const refs = readJson(first.refs_manifest_path);
    assert.equal(manifest.package_policy, 'deterministic_non_authoritative_candidate_artifact_package');
    assert.equal(manifest.module_candidate.status, 'module_candidate_with_non_authoritative_artifact_bodies');
    assert.equal(manifest.written_body_authority.artifact_body_written, true);
    assert.equal(manifest.authority_flags.can_mutate_artifact_body, false);
    assert.equal(moduleCandidate.status, 'module_candidate_with_non_authoritative_artifact_bodies');
    assert.equal(moduleCandidate.candidate_artifact_bodies[0].body_path, first.candidate_artifact_bodies[0].body_path);
    assert.equal(moduleCandidate.artifact_candidate_refs[0].body_written, true);
    assert.equal(moduleCandidate.writes.artifact_body_written, true);
    assert.equal(moduleCandidate.authority_flags.counts_as_owner_receipt, false);
    assert.equal(receipt.candidate_artifact_bodies[0].body_sha256, first.candidate_artifact_bodies[0].body_sha256);
    assert.equal(receipt.artifact_candidate_refs[0].candidate_artifact_body.body_path, first.candidate_artifact_bodies[0].body_path);
    assert.equal(receipt.can_sign_owner_receipt, false);
    assert.equal(refs.artifact_body_written, true);
    assert.equal(refs.candidate_artifact_bodies[0].body_ref, `file://${first.candidate_artifact_bodies[0].body_path}`);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('scholar-skills materialize keeps refs-only behavior without candidate artifact opt-in', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-artifact-refs-only-'));
  try {
    const outputRoot = path.join(fixtureRoot, 'refs-only');
    const output = runCli([
      'scholar-skills',
      'materialize',
      '--module',
      'opl.scholarskills.display',
      '--input-ref',
      'mas:current_owner_delta/display-intent',
      '--artifact-root',
      'artifact-root:display-pack-candidates',
      '--output-root',
      outputRoot,
      '--json',
    ]).scholar_skills_materialize;

    assert.deepEqual(output.candidate_artifact_bodies, []);
    assert.deepEqual(output.written_files.sort(), [
      path.join(outputRoot, 'execution_receipt_candidate.json'),
      path.join(outputRoot, 'manifest.json'),
      path.join(outputRoot, 'module_candidate.json'),
      path.join(outputRoot, 'refs_manifest.json'),
    ].sort());
    assert.equal(fs.existsSync(path.join(outputRoot, 'candidate_artifacts')), false);

    const moduleCandidate = readJson(output.module_candidate_path);
    const refs = readJson(output.refs_manifest_path);
    assert.equal(moduleCandidate.status, 'module_candidate_refs_only');
    assert.equal(moduleCandidate.writes.artifact_body_written, false);
    assert.equal(refs.artifact_body_written, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('scholar-skills materialize writes deterministic module-specific bodies for all ten modules', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-artifact-all-'));
  try {
    for (const moduleId of moduleIds) {
      const outputRoot = path.join(fixtureRoot, moduleId.replaceAll('.', '-'));
      const payloadPath = path.join(fixtureRoot, `${moduleId.replaceAll('.', '-')}.json`);
      fs.writeFileSync(
        payloadPath,
        JSON.stringify({
          module_id: moduleId,
          source_refs: [`mas:source/${moduleId}`],
          objective: `candidate artifact engine smoke for ${moduleId}`,
        }),
      );
      const output = runCli([
        'scholar-skills',
        'materialize',
        '--module',
        moduleId,
        '--input-ref',
        `mas:current_owner_delta/${moduleId}`,
        '--artifact-root',
        `artifact-root:${moduleId}`,
        '--output-root',
        outputRoot,
        '--emit-candidate-artifacts',
        '--payload-file',
        payloadPath,
        '--json',
      ]).scholar_skills_materialize;

      assert.deepEqual(
        output.candidate_artifact_bodies.map((entry: { ref_family: string }) => entry.ref_family),
        expectedArtifactRefFamiliesByModule[moduleId],
      );
      assert.equal(output.authority_flags.can_claim_artifact_authority, false);
      assert.equal(output.writes.domain_truth_written, false);
      assert.equal(output.writes.owner_receipt_signed, false);
      assert.equal(output.writes.typed_blocker_created, false);
      for (const body of output.candidate_artifact_bodies) {
        assert.equal(fs.existsSync(body.body_path), true);
        assert.equal(body.engine_id, expectedEngineIdsByModule[moduleId]);
        assert.equal(body.engine_version, '2026-06-24');
        assert.equal(body.validation_status, 'pass');
        assert.equal(body.validation_checks.some((check: { check_id: string }) => check.check_id === 'authority_boundary_false'), true);
        assert.deepEqual(body.input_requirements.required_payload_fields, expectedEngineSpecByModule[moduleId].required);
        assert.deepEqual(body.input_requirements.optional_payload_fields, expectedEngineSpecByModule[moduleId].optional);
        assert.deepEqual(
          body.validation_checks
            .map((check: { check_id: string }) => check.check_id)
            .filter((checkId: string) => expectedEngineSpecByModule[moduleId].checks.includes(checkId)),
          expectedEngineSpecByModule[moduleId].checks,
        );
        assert.equal(body.body_included, true);
        assert.equal(body.body_carried_to_owner_request, false);
        assert.equal(body.readiness_notes.some((note: string) => note.includes('domain owner gate')), true);
        assert.equal(body.engine_receipt_ref.startsWith('opl://scholarskills/artifact-engine-receipts/'), true);
        assert.equal(body.body_policy, 'opl_generated_non_authoritative_candidate_body_requires_domain_owner_consumption');
        assert.equal(body.authority_flags.can_write_domain_truth, false);
        assert.equal(body.authority_flags.can_mutate_artifact_body, false);
        if (body.body_format === 'json') {
          const candidate = readJson(body.body_path);
          assert.equal(candidate.surface_kind, 'opl_scholarskills_executable_candidate_artifact');
          assert.equal(candidate.status, 'candidate_artifact_engine_output');
          assert.equal(candidate.engine.engine_id, expectedEngineIdsByModule[moduleId]);
          assert.equal(candidate.validation.owner_gate_required, true);
          assert.deepEqual(
            candidate.candidate.sections.map((section: { section_id: string }) => section.section_id),
            expectedEngineSpecByModule[moduleId].sections,
          );
          assert.equal(candidate.receipt_metadata.unsigned, true);
          assert.deepEqual(candidate.missing_inputs, candidate.input_requirements.required_payload_fields.filter((field: string) => field !== 'source_refs'));
          assert.equal(candidate.body_carried_to_owner_request, false);
          assert.equal(candidate.authority_flags.can_sign_owner_receipt, false);
          if (moduleId === 'opl.scholarskills.data') {
            const sectionIds = candidate.candidate.sections.map((section: { section_id: string }) => section.section_id);
            assert.equal(sectionIds.includes('storage_tier'), true);
            assert.equal(sectionIds.includes('authoritative_body_boundary'), true);
            assert.equal(sectionIds.includes('derived_copy_inventory'), true);
            assert.equal(sectionIds.includes('analytical_format_strategy'), true);
            assert.equal(sectionIds.includes('cold_restore_proof'), true);
            assert.equal(
              candidate.candidate.quality_checks_required.includes('cold_restore_proof_required_before_body_retirement'),
              true,
            );
            assert.equal(candidate.input_requirements.optional_payload_fields.includes('storage_tier_refs'), true);
            assert.equal(candidate.input_requirements.optional_payload_fields.includes('cold_restore_refs'), true);
          }
        } else {
          const text = fs.readFileSync(body.body_path, 'utf8');
          assert.equal(text.includes(expectedEngineIdsByModule[moduleId]), true);
          assert.equal(text.includes('owner gate') || text.includes('owner-gate'), true);
          for (const section of expectedEngineSpecByModule[moduleId].sections.slice(0, body.body_format === 'svg' ? 4 : undefined)) {
            assert.equal(text.includes(section), true);
          }
        }
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('scholar-skills materialize rejects payload without explicit candidate artifact opt-in', () => {
  const failure = runCliFailure([
    'scholar-skills',
    'materialize',
    '--module',
    'opl.scholarskills.display',
    '--input-ref',
    'mas:current_owner_delta/display-intent',
    '--artifact-root',
    'artifact-root:display-pack-candidates',
    '--output-root',
    path.join(os.tmpdir(), 'opl-scholar-skills-invalid-payload'),
    '--payload-json',
    '{"title":"missing opt-in"}',
    '--json',
  ]);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.equal(
    String(failure.payload.error.message).includes('requires --emit-candidate-artifacts'),
    true,
  );
});
