import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, repoRoot, runCli, test } from '../helpers.ts';

test('family-runtime required admission warns but does not block launch without advisory lens refs', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-family-runtime-cohort-loop-warning-`);
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = {
    ...fixtures.medautoscience,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'med_autoscience_stage_control_plane',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: [{
        stage_id: 'scout',
        stage_kind: 'planning',
        title: 'Scout',
        summary: 'Plan from explicit source refs.',
        goal: 'Prepare an admitted planning stage under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['scout'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['plan_ready'],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope/scout', role: 'launch_source_scope' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      }],
      notes: [],
    },
  };

  try {
    const env = {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    };
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], env);

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:scout-cohort-loop',
      '--require-stage-admission',
    ], env);
    const gate = created.family_runtime_stage_attempt.stage_launch_admission_gate;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, null);
    assert.equal(gate.status, 'allowed');
    assert.equal(gate.blocked_reason, null);
    assert.deepEqual(gate.blocker_findings, []);
    assert.equal(gate.inspected_cohort_loop_stage.closure_status, 'missing_query');
    const advisoryFindingCodes = gate.findings.map((finding: { code: string }) => finding.code);
    assert.deepEqual(advisoryFindingCodes, [
      'cohort_query_missing',
      'cohort_trigger_missing',
      'cohort_monitor_or_metric_missing',
      'runtime_budget_monitor_refs_missing',
      'runtime_budget_expected_success_ref_or_boundary_success_rate_ref_missing',
      'runtime_budget_boundary_monitor_coverage_missing',
    ]);
    assert.equal(gate.findings.every((finding: { severity: string }) => finding.severity === 'warning'), true);
    assert.deepEqual(
      gate.recommendation_findings.map((finding: { code: string }) => finding.code),
      advisoryFindingCodes,
    );
    assert.deepEqual(created.family_runtime_stage_attempt.conflict_or_blocker_envelopes, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
