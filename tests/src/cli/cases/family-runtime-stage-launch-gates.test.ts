import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';
import {
  createMasScoutStage,
  createMedAutoScienceStageManifest,
  masScoutCohortLoopStageContractRefs,
} from './family-runtime-stage-fixtures.ts';
import { normalizeFamilyActionCatalog } from '../../../../src/kernel/family-action-catalog-contract.ts';
import {
  buildFamilyStageAdmissionReview,
  normalizeFamilyStageControlPlane,
} from '../../../../src/modules/stagecraft/index.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

const isolatedFamilyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-launch-family-'));
const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
process.env.OPL_FAMILY_WORKSPACE_ROOT = isolatedFamilyWorkspaceRoot;
test.after(() => {
  if (previousFamilyWorkspaceRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
  else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousFamilyWorkspaceRoot;
  fs.rmSync(isolatedFamilyWorkspaceRoot, { recursive: true, force: true });
});

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  const contractsDir = extra.OPL_CONTRACTS_DIR;
  return {
    OPL_STATE_DIR: stateRoot,
    ...(contractsDir ? { OPL_FAMILY_WORKSPACE_ROOT: path.resolve(contractsDir, '../..') } : {}),
    ...extra,
  };
}

function bindMedAutoScienceManifest(
  stateRoot: string,
  fixtureContractsRoot: string,
  masManifest: Record<string, unknown>,
) {
  const masPack = createAdmittedStagePackFixture(masManifest, 'med-autoscience', 'MedAutoScience');
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    masPack.repoDir,
    '--manifest-command',
    buildManifestCommand(masPack.manifest),
  ], {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
  });
  return masPack.repoDir;
}

function routedAction(actionId: string, requiredStageRefs: string[], optionalStageRefs: string[] = []) {
  return {
    action_id: actionId,
    title: actionId,
    summary: actionId,
    owner: 'med-autoscience',
    effect: 'mutating',
    source_command: { command: `mas ${actionId}`, surface_kind: 'domain_cli' },
    input_schema_ref: 'contracts/action.input.schema.json',
    output_schema_ref: 'contracts/action.output.schema.json',
    required_fields: [], optional_fields: [], workspace_locator_fields: [], human_gate_ids: [],
    supported_surfaces: { cli: {}, mcp: {}, skill: {}, product_entry: {}, openai: {}, ai_sdk: {} },
    authority_boundary: {},
    stage_route: {
      entry_stage_ref: requiredStageRefs[0],
      required_stage_refs: requiredStageRefs,
      optional_stage_refs: optionalStageRefs,
      terminal_stage_refs: [requiredStageRefs.at(-1)],
      route_policy: 'ordered_stage_attempts_no_skip',
    },
  };
}

function omaShapedRouteManifest(baseManifest: Record<string, unknown>) {
  const stage = (
    stageId: string,
    allowedActionRefs: string[],
    nextStageRefs: string[],
    requires: string,
    ensures: string,
  ) => createMasScoutStage({
    stage_id: stageId,
    allowed_action_refs: allowedActionRefs,
    handoff: { next_stage_refs: nextStageRefs },
    stage_contract: { requires: [requires], ensures: [ensures] },
    trust_boundary: { owner_receipt_required: true },
  });
  return {
    ...createMedAutoScienceStageManifest(baseManifest, [
      stage('intent-intake', ['build-agent-baseline', 'takeover-target-agent-test', 'materialize-learning'],
        ['web-research', 'stage-decomposition', 'target-agent-takeover', 'learning-intake'],
        'target_agent_request', 'route_selected'),
      stage('web-research', ['build-agent-baseline'], ['stage-decomposition'], 'research_route_selected', 'research_ready'),
      stage('stage-decomposition', ['build-agent-baseline'], [], 'design_ready', 'plan_ready'),
      stage('target-agent-takeover', ['takeover-target-agent-test'], [], 'takeover_ready', 'takeover_done'),
      stage('learning-intake', ['materialize-learning'], [], 'learning_refs_ready', 'learning_ready'),
      stage('optimizer', ['optimize'], [], 'result_ready', 'optimization_ready'),
    ]),
    family_action_catalog: {
      surface_kind: 'family_action_catalog',
      version: 'family-action-catalog.v1',
      catalog_id: 'oma_shaped_actions',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: {},
      actions: [
        routedAction('build-agent-baseline', ['intent-intake', 'stage-decomposition'], ['web-research']),
        routedAction('takeover-target-agent-test', ['intent-intake', 'target-agent-takeover']),
        routedAction('materialize-learning', ['intent-intake', 'learning-intake']),
        routedAction('optimize', ['optimizer']),
        { ...routedAction('inspect', ['intent-intake']), effect: 'read_only', stage_route: undefined },
      ],
      notes: [],
    },
  };
}

test('family-runtime attempt create projects launch invocation and gates non-default executor binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-launch-invocation-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = createMedAutoScienceStageManifest(fixtures.medautoscience, [
    createMasScoutStage({
      stage_contract: masScoutCohortLoopStageContractRefs(),
    }),
  ]);
  const baseArgs = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'scout',
    '--provider',
    'temporal',
    '--workspace-locator',
    '{"workspace_root":"/tmp/mas"}',
    '--source-fingerprint',
    'sha256:scout-launch',
    '--require-stage-admission',
  ];
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
  let repoDir: string | null = null;
  try {
    repoDir = bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, masManifest);

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
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime launch gate selects one declared action route without treating future branches as entry blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-selected-action-route-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = omaShapedRouteManifest(loadFamilyManifestFixtures().medautoscience);
  const env = familyRuntimeEnv(stateRoot, { OPL_CONTRACTS_DIR: fixtureContractsRoot });
  const createArgs = (actionId?: string, stageId = 'intent-intake') => [
    'family-runtime', 'attempt', 'create', '--domain', 'medautoscience', '--stage', stageId,
    ...(actionId ? ['--action', actionId] : []),
    '--provider', 'temporal', '--workspace-locator', '{"workspace_root":"/tmp/oma"}',
    '--source-fingerprint', 'sha256:oma-selected-route',
  ];
  const repoDirs: string[] = [];
  try {
    const staticPlane = normalizeFamilyStageControlPlane(manifest.family_stage_control_plane)!;
    const staticCatalog = normalizeFamilyActionCatalog(manifest.family_action_catalog)!;
    const staticReview = buildFamilyStageAdmissionReview(staticPlane, { family_action_catalog: staticCatalog });
    assert.equal(staticReview.findings.filter((finding) =>
      finding.code === 'composition_obligation_not_satisfied'
      && finding.stage_id === 'intent-intake'
    ).length, 4);
    repoDirs.push(bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, manifest));

    const missing = runCli(createArgs(), env).family_runtime_stage_attempt;
    assert.equal(missing.attempt.status, 'blocked');
    assert.equal(missing.stage_launch_admission_gate.block_reason, 'stage_route_action_required');

    const unknown = runCli([...createArgs('missing-action'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(unknown.attempt.status, 'blocked');
    assert.equal(unknown.stage_launch_admission_gate.block_reason, 'stage_route_action_unknown');

    const noRoute = runCli([...createArgs('inspect'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(noRoute.attempt.status, 'blocked');
    assert.equal(noRoute.stage_launch_admission_gate.block_reason, 'stage_route_action_has_no_route');

    const offRoute = runCli([...createArgs('optimize'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(offRoute.attempt.status, 'blocked');
    assert.equal(offRoute.stage_launch_admission_gate.block_reason, 'stage_route_stage_not_selected');

    const build = runCli([...createArgs('build-agent-baseline'), '--new-attempt'], env).family_runtime_stage_attempt;
    const takeover = runCli([...createArgs('takeover-target-agent-test'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(build.attempt.status, 'queued');
    assert.equal(build.stage_launch_admission_gate.status, 'admitted');
    assert.equal(build.stage_launch_admission_gate.gate_action, 'allow_stage_launch');
    assert.equal(build.stage_launch_admission_gate.selected_action_id, 'build-agent-baseline');
    assert.equal(build.stage_launch_admission_gate.selected_stage_route.entry_stage_ref, 'intent-intake');
    assert.equal(build.stage_launch_admission_gate.blocker_findings.length, 0);
    assert.equal(build.attempt.route_impact.selected_action_id, 'build-agent-baseline');
    assert.deepEqual(build.attempt.route_impact.selected_stage_route, build.stage_launch_admission_gate.selected_stage_route);
    assert.notEqual(build.attempt.idempotency_key, takeover.attempt.idempotency_key);
    assert.notEqual(build.attempt.stage_attempt_id, takeover.attempt.stage_attempt_id);

    const downstream = runCli([
      ...createArgs('build-agent-baseline', 'stage-decomposition'), '--new-attempt',
    ], env).family_runtime_stage_attempt;
    assert.equal(downstream.attempt.status, 'blocked');
    assert.match(downstream.stage_launch_admission_gate.block_reason, /composition_obligation_not_satisfied/);

    const manifestWithIncomingEntry = structuredClone(manifest) as Record<string, any>;
    manifestWithIncomingEntry.family_stage_control_plane.stages.push(createMasScoutStage({
      stage_id: 'route-prerequisite',
      handoff: { next_stage_refs: ['intent-intake'] },
      stage_contract: { requires: ['source_ready'], ensures: ['different_entry_requirement'] },
    }));
    const incomingEntryReview = buildFamilyStageAdmissionReview(
      normalizeFamilyStageControlPlane(manifestWithIncomingEntry.family_stage_control_plane)!,
      { family_action_catalog: staticCatalog },
    );
    assert.equal(incomingEntryReview.findings.some(
      (finding) =>
        finding.code === 'composition_obligation_not_satisfied'
        && finding.stage_id === 'route-prerequisite'
        && finding.target_stage_id === 'intent-intake'
    ), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    for (const repoDir of repoDirs) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime attempt create blocks undeclared stage launches without legacy attempt fallback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-undeclared-stage-gate-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = createMedAutoScienceStageManifest(fixtures.medautoscience, [
    createMasScoutStage({
      summary: 'Declared planning stage.',
      goal: 'Keep one valid declared stage in the control plane.',
    }),
  ]);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
  let repoDir: string | null = null;
  try {
    repoDir = bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, masManifest);

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'old_unregistered_stage',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:undeclared-stage',
    ], env);
    const gate = created.family_runtime_stage_attempt.stage_launch_admission_gate;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, 'stage_not_in_declared_control_plane');
    assert.equal(gate.status, 'not_in_declared_control_plane');
    assert.equal(gate.gate_action, 'block_stage_launch');
    assert.equal(gate.block_reason, 'stage_not_in_declared_control_plane');
    assert.equal(gate.blocker_findings[0].severity, 'blocker');
    assert.equal(gate.warning_findings.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime required admission warns without blocking when cohort loop refs are open', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cohort-loop-gate-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = createMedAutoScienceStageManifest(fixtures.medautoscience, [createMasScoutStage()]);
  let repoDir: string | null = null;
  try {
    repoDir = bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, masManifest);

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:scout-cohort-loop',
      '--require-stage-admission',
    ], familyRuntimeEnv(stateRoot, { OPL_CONTRACTS_DIR: fixtureContractsRoot }));
    const gate = created.family_runtime_stage_attempt.stage_launch_admission_gate;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, null);
    assert.equal(gate.status, 'allowed');
    assert.equal(gate.blocked_reason, null);
    assert.equal(gate.inspected_cohort_loop_stage.closure_status, 'missing_query');
    const findingCodes = gate.findings.map((finding: { code: string }) => finding.code);
    assert.equal(findingCodes.includes('cohort_query_missing'), true);
    assert.equal(findingCodes.includes('cohort_trigger_missing'), true);
    assert.equal(findingCodes.includes('cohort_monitor_or_metric_missing'), true);
    assert.equal(gate.findings.every((finding: { severity: string }) => finding.severity === 'warning'), true);
    assert.deepEqual(created.family_runtime_stage_attempt.conflict_or_blocker_envelopes, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime required admission only blocks Stage Kernel launch evidence gaps', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-stage-kernel-gate-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const baseStage = createMasScoutStage({
    stage_contract: masScoutCohortLoopStageContractRefs(),
  });
  const manifestForStage = (stage: unknown) => createMedAutoScienceStageManifest(fixtures.medautoscience, [stage]);
  const baseArgs = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'scout',
    '--provider',
    'temporal',
    '--workspace-locator',
    '{"workspace_root":"/tmp/mas"}',
    '--require-stage-admission',
  ];
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
  const repoDirs: string[] = [];
  try {
    const malformedPlane = normalizeFamilyStageControlPlane(
      manifestForStage({ ...baseStage, authority_boundary: {} }).family_stage_control_plane,
    )!;
    assert.equal(
      buildFamilyStageAdmissionReview(malformedPlane).findings.some(
        (finding) => finding.code === 'missing_authority_boundary_role',
      ),
      true,
    );

    const missingRuntimeEventsPlane = normalizeFamilyStageControlPlane(manifestForStage({
      ...baseStage,
      stage_contract: {
        ...baseStage.stage_contract,
        runtime_event_refs: [],
      },
      trust_boundary: {
        lane: 'human_gate',
        static_check_eligible: false,
        effect_boundary: true,
        records_runtime_events: true,
        runtime_event_refs: [],
      },
    }).family_stage_control_plane)!;
    assert.equal(
      buildFamilyStageAdmissionReview(missingRuntimeEventsPlane).findings.some(
        (finding) => finding.code === 'effect_boundary_missing_runtime_event_refs',
      ),
      true,
    );

    repoDirs.push(bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, manifestForStage(baseStage)));
    const missingBinding = runCli([
      ...baseArgs,
      '--new-attempt',
      '--source-fingerprint',
      'sha256:stage-kernel-missing-executor-binding',
      '--executor-kind',
      'hermes_agent',
    ], env);
    assert.equal(missingBinding.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(
      missingBinding.family_runtime_stage_attempt.launch_invocation.blocker_reason,
      'non_default_executor_binding_ref_missing',
    );

    repoDirs.push(bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, manifestForStage({
      ...baseStage,
      stage_contract: {
        ...baseStage.stage_contract,
        source_scope_refs: [],
        artifact_scope_refs: [],
        workspace_scope_refs: [],
      },
    })));
    const missingScope = runCli([
      ...baseArgs,
      '--new-attempt',
      '--source-fingerprint',
      'sha256:stage-kernel-missing-scope',
    ], env);
    assert.equal(missingScope.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(
      missingScope.family_runtime_stage_attempt.stage_launch_admission_gate.blocked_reason,
      'stage_admission_stage_kernel_blocked',
    );
    assert.equal(
      missingScope.family_runtime_stage_attempt.stage_launch_admission_gate.blocker_findings.some(
        (finding: { code: string }) => finding.code === 'missing_scope_refs',
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    for (const repoDir of repoDirs) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime required admission keeps assumption cohort and runtime-budget gaps advisory', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-advisory-gate-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = createMedAutoScienceStageManifest(fixtures.medautoscience, [
    createMasScoutStage({
      stage_contract: {
        runtime_event_refs: ['runtime_event:scout.launch_recorded'],
        runtime_assumptions: [
          {
            assumption_id: 'fresh_source_locator',
            invalidated_by: ['source:freshness/window-expired'],
            monitor_refs: [],
          },
        ],
      },
      trust_boundary: {
        lane: 'domain_agent',
        static_check_eligible: false,
        effect_boundary: true,
        records_runtime_events: true,
        runtime_event_refs: ['runtime_event:scout.launch_recorded'],
      },
    }),
  ]);
  let repoDir: string | null = null;
  try {
    repoDir = bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, masManifest);

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:scout-advisory',
      '--require-stage-admission',
    ], familyRuntimeEnv(stateRoot, { OPL_CONTRACTS_DIR: fixtureContractsRoot }));
    const gate = created.family_runtime_stage_attempt.stage_launch_admission_gate;
    const findingCodes = gate.findings.map((finding: { code: string }) => finding.code);

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(gate.status, 'allowed');
    assert.equal(gate.blocked_reason, null);
    assert.equal(gate.blocker_findings.length, 0);
    assert.equal(findingCodes.includes('runtime_assumption_stale'), true);
    assert.equal(findingCodes.includes('cohort_query_missing'), true);
    assert.equal(findingCodes.includes('cohort_monitor_or_metric_missing'), true);
    assert.equal(findingCodes.includes('runtime_budget_monitor_refs_missing'), true);
    assert.equal(gate.findings.every((finding: { severity: string }) => finding.severity === 'warning'), true);
    assert.deepEqual(created.family_runtime_stage_attempt.conflict_or_blocker_envelopes, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});
