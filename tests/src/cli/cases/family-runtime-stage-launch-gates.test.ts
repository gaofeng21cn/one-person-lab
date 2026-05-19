import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime attempt create projects launch invocation and gates non-default executor binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-launch-invocation-'));
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
      stages: [
        {
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
            cohort_query_refs: [{ ref_kind: 'json_pointer', ref: '/cohort_query/scout', role: 'cohort_query' }],
            trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:mas/scout', role: 'launch_trigger' }],
            metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:mas/scout/freshness', role: 'cohort_metric' }],
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
        },
      ],
      notes: [],
    },
  };
  const baseArgs = [
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
    'sha256:scout-launch',
    '--require-stage-admission',
  ];
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
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
    ], env);

    const codex = runCli(baseArgs, env);
    const codexAttempt = codex.family_runtime_stage_attempt.attempt;
    const codexInvocation = codex.family_runtime_stage_attempt.launch_invocation;

    assert.equal(codexAttempt.status, 'queued');
    assert.equal(codexInvocation.surface_kind, 'opl_stage_launch_invocation');
    assert.equal(codexInvocation.invocation_mode, 'invocation');
    assert.deepEqual(codexInvocation.allowed_agent_actions, ['retrieve', 'select', 'bind', 'launch', 'deploy']);
    assert.equal(codexInvocation.bounded_edit_ref, null);
    assert.equal(codexInvocation.policy.stage_pack_launch_scope, 'approved_or_admitted_only');
    assert.equal(codexInvocation.policy.authoring_output, 'bounded_edit_ref_only');
    assert.equal(codexInvocation.selected_executor_kind, 'codex_cli');
    assert.equal(codexInvocation.executor_binding_status, 'default_codex_cli');
    assert.equal(codexInvocation.authority_boundary.executor_behavior_equivalence_claim, false);
    assert.equal(codexInvocation.authority_boundary.can_execute_stage, false);
    assert.equal(
      codexAttempt.activity_events.some((event: { event_kind: string }) =>
        event.event_kind === 'stage_launch_invocation'
      ),
      true,
    );

    const missingBinding = runCli([
      ...baseArgs,
      '--new-attempt',
      '--executor-kind',
      'hermes_agent',
    ], env);
    const missingInvocation = missingBinding.family_runtime_stage_attempt.launch_invocation;
    assert.equal(missingBinding.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(missingInvocation.executor_binding_status, 'missing_non_default_executor_binding');
    assert.equal(missingInvocation.blocker_reason, 'non_default_executor_binding_ref_missing');
    assert.equal(
      missingBinding.family_runtime_stage_attempt.conflict_or_blocker_envelopes.some((envelope: { reason: string }) =>
        envelope.reason === 'non_default_executor_binding_ref_missing'
      ),
      true,
    );

    const declaredBinding = runCli([
      ...baseArgs,
      '--new-attempt',
      '--executor-kind',
      'hermes_agent',
      '--executor-binding-ref',
      'executor-binding:hermes-agent/audit-demo',
    ], env);
    const declaredInvocation = declaredBinding.family_runtime_stage_attempt.launch_invocation;
    assert.equal(declaredBinding.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(declaredInvocation.executor_binding_status, 'explicit_executor_binding_declared');
    assert.equal(declaredInvocation.launch_refs.executor_binding_ref, 'executor-binding:hermes-agent/audit-demo');
    assert.equal(declaredInvocation.authority_boundary.graphflow_runtime_dependency, false);

    const authoringMissingRef = runCli([
      ...baseArgs,
      '--new-attempt',
      '--invocation-mode',
      'authoring',
    ], env);
    const authoringMissingInvocation = authoringMissingRef.family_runtime_stage_attempt.launch_invocation;
    assert.equal(authoringMissingRef.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(authoringMissingInvocation.invocation_mode, 'authoring');
    assert.equal(authoringMissingInvocation.blocker_reason, 'agent_authoring_requires_bounded_edit_ref');
    assert.equal(authoringMissingInvocation.bounded_edit_ref, null);
    assert.equal(
      authoringMissingRef.family_runtime_stage_attempt.conflict_or_blocker_envelopes.some((envelope: { reason: string }) =>
        envelope.reason === 'agent_authoring_requires_bounded_edit_ref'
      ),
      true,
    );

    const authoringBoundedEdit = runCli([
      ...baseArgs,
      '--new-attempt',
      '--invocation-mode',
      'authoring',
      '--bounded-edit-ref',
      'bounded-edit:gfl/proposed-stage-pack-1',
    ], env);
    const boundedEditInvocation = authoringBoundedEdit.family_runtime_stage_attempt.launch_invocation;
    assert.equal(authoringBoundedEdit.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(boundedEditInvocation.invocation_mode, 'authoring');
    assert.equal(boundedEditInvocation.bounded_edit_ref, 'bounded-edit:gfl/proposed-stage-pack-1');
    assert.equal(boundedEditInvocation.launch_refs.bounded_edit_ref, 'bounded-edit:gfl/proposed-stage-pack-1');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime required admission warns without blocking when cohort loop refs are open', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cohort-loop-gate-'));
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
      stages: [
        {
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
        },
      ],
      notes: [],
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
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

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
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const gate = created.family_runtime_stage_attempt.stage_launch_admission_gate;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, null);
    assert.equal(gate.status, 'allowed');
    assert.equal(gate.blocked_reason, null);
    assert.equal(gate.inspected_cohort_loop_stage.closure_status, 'missing_query');
    assert.deepEqual(gate.findings.map((finding: { code: string }) => finding.code), [
      'cohort_query_missing',
      'cohort_trigger_missing',
      'cohort_monitor_or_metric_missing',
    ]);
    assert.equal(gate.findings.every((finding: { severity: string }) => finding.severity === 'warning'), true);
    assert.deepEqual(created.family_runtime_stage_attempt.conflict_or_blocker_envelopes, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
