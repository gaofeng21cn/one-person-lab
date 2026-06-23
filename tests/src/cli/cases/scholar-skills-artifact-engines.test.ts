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
  'opl.scholarskills.data': ['data_manifest', 'lineage_readiness'],
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
      variables: ['age', 'hba1c', 'mortality'],
      cohort_ref: 'mas:source/cohort-v1',
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
        assert.equal(body.input_requirements.required_payload_fields.includes('source_refs'), true);
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
          assert.equal(candidate.receipt_metadata.unsigned, true);
          assert.deepEqual(candidate.missing_inputs, candidate.input_requirements.required_payload_fields.filter((field: string) => field !== 'source_refs'));
          assert.equal(candidate.body_carried_to_owner_request, false);
          assert.equal(candidate.authority_flags.can_sign_owner_receipt, false);
        } else {
          const text = fs.readFileSync(body.body_path, 'utf8');
          assert.equal(text.includes(expectedEngineIdsByModule[moduleId]), true);
          assert.equal(text.includes('owner gate') || text.includes('owner-gate'), true);
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
