import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, loadFamilyManifestFixtures, os, path, removeFixtureTree, runCli, test } from '../helpers.ts';
import {
  createMasScoutStage,
  createMedAutoScienceStageManifest,
  masScoutCohortLoopStageContractRefs,
} from './family-runtime-stage-fixtures.ts';
import { normalizeFamilyActionCatalog } from '../../../../src/kernel/family-action-catalog-contract.ts';
import {
  buildFamilyStageConformanceReview,
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
    CODEX_HOME: path.join(stateRoot, 'codex-home'),
    ...(contractsDir ? { OPL_FAMILY_WORKSPACE_ROOT: path.resolve(contractsDir, '../..') } : {}),
    ...extra,
  };
}

function workspaceLocatorArg(stateRoot: string, name = 'workspace') {
  const workspaceRoot = path.join(stateRoot, name);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  return JSON.stringify({ workspace_root: workspaceRoot });
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
  installRuntimePackageFixture(stateRoot, 'med-autoscience');
  return masPack.repoDir;
}

function routedAction(actionId: string, requiredStageRefs: string[], optionalStageRefs: string[] = []) {
  return {
    action_id: actionId,
    title: actionId,
    summary: actionId,
    owner: 'med-autoscience',
    effect: 'mutating',
    execution_binding: {
      kind: 'stage_binding',
      stage_manifest_ref: 'agent/stages/manifest.json',
    },
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
      route_policy: 'ai_selected_progress_route',
    },
  };
}

function multiActionRouteManifest(baseManifest: Record<string, unknown>) {
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
      stage('request-intake', ['compose-deliverable', 'assess-existing-deliverable', 'ingest-feedback'],
        ['context-research', 'delivery-planning', 'baseline-assessment', 'feedback-intake'],
        'target_agent_request', 'route_selected'),
      stage('context-research', ['compose-deliverable'], ['delivery-planning'], 'research_route_selected', 'research_ready'),
      stage('delivery-planning', ['compose-deliverable'], [], 'design_ready', 'plan_ready'),
      stage('baseline-assessment', ['assess-existing-deliverable'], [], 'takeover_ready', 'takeover_done'),
      stage('feedback-intake', ['ingest-feedback'], [], 'learning_refs_ready', 'learning_ready'),
      stage('optimization', ['optimize'], [], 'result_ready', 'optimization_ready'),
    ]),
    family_action_catalog: {
      surface_kind: 'family_action_catalog',
      version: 'family-action-catalog.v2',
      catalog_id: 'multi_action_route_fixture',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: {
        domain_truth_owner: 'med-autoscience',
        opl_role: 'projection_consumer_only',
        write_policy: 'no_domain_truth_writes',
      },
      actions: [
        routedAction('compose-deliverable', ['request-intake', 'delivery-planning'], ['context-research']),
        routedAction('assess-existing-deliverable', ['request-intake', 'baseline-assessment']),
        routedAction('ingest-feedback', ['request-intake', 'feedback-intake']),
        routedAction('optimize', ['optimization']),
        {
          ...routedAction('inspect', ['request-intake']),
          effect: 'read_only',
          execution_binding: { kind: 'handler_ref', handler_ref: 'handler:draft_brief' },
          stage_route: undefined,
        },
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
    workspaceLocatorArg(stateRoot, 'mas-workspace'),
    '--source-fingerprint',
    'sha256:scout-launch',
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
    assert.equal(codexInvocation.policy.stage_pack_launch_scope, 'codex_selected_declared_or_requested_stage');
    assert.equal(codexInvocation.policy.authoring_output, 'readable_artifact_preferred_bounded_edit_optional');
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
    assert.equal(authoringMissingRef.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(authoringMissingInvocation.invocation_mode, 'authoring');
    assert.equal(authoringMissingInvocation.blocker_reason, null);
    assert.equal(authoringMissingInvocation.bounded_edit_ref, null);
    assert.equal(authoringMissingRef.family_runtime_stage_attempt.conflict_or_blocker_envelopes.length, 0);

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
    removeFixtureTree(stateRoot);
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime observes one declared action route without treating future branches as entry blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-selected-action-route-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = multiActionRouteManifest(loadFamilyManifestFixtures().medautoscience);
  const env = familyRuntimeEnv(stateRoot, { OPL_CONTRACTS_DIR: fixtureContractsRoot });
  const createArgs = (actionId?: string, stageId = 'request-intake') => [
    'family-runtime', 'attempt', 'create', '--domain', 'medautoscience', '--stage', stageId,
    ...(actionId ? ['--action', actionId] : []),
    '--provider', 'temporal', '--workspace-locator', workspaceLocatorArg(stateRoot, 'route-workspace'),
    '--source-fingerprint', 'sha256:selected-route-fixture',
  ];
  const repoDirs: string[] = [];
  try {
    const staticPlane = normalizeFamilyStageControlPlane(manifest.family_stage_control_plane)!;
    const staticCatalog = normalizeFamilyActionCatalog(manifest.family_action_catalog)!;
    const staticReview = buildFamilyStageConformanceReview(staticPlane, { family_action_catalog: staticCatalog });
    assert.equal(staticReview.findings.filter((finding) =>
      finding.code === 'composition_obligation_not_satisfied'
      && finding.stage_id === 'request-intake'
    ).length, 4);
    repoDirs.push(bindMedAutoScienceManifest(stateRoot, fixtureContractsRoot, manifest));

    const missing = runCli(createArgs(), env).family_runtime_stage_attempt;
    assert.equal(missing.attempt.status, 'queued');
    assert.equal(missing.stage_context_observation.progression_effect, 'stage_may_start');
    assert.equal(missing.stage_context_observation.warning_findings.some(
      (finding: { code: string }) => finding.code === 'stage_route_action_missing_advisory',
    ), true);

    const unknown = runCli([...createArgs('missing-action'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(unknown.attempt.status, 'queued');
    assert.equal(unknown.stage_context_observation.progression_effect, 'stage_may_start');
    assert.equal(unknown.stage_context_observation.warning_findings.some(
      (finding: { code: string }) => finding.code === 'stage_route_action_unknown_advisory',
    ), true);

    const noRoute = runCli([...createArgs('inspect'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(noRoute.attempt.status, 'queued');
    assert.equal(noRoute.stage_context_observation.progression_effect, 'stage_may_start');
    assert.equal(noRoute.stage_context_observation.warning_findings.some(
      (finding: { code: string }) => finding.code === 'stage_route_action_has_no_route_advisory',
    ), true);

    const offRoute = runCli([...createArgs('optimize'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(offRoute.attempt.status, 'queued');
    assert.equal(offRoute.stage_context_observation.progression_effect, 'stage_may_start');
    assert.equal(offRoute.stage_context_observation.warning_findings.some(
      (finding: { code: string }) => finding.code === 'stage_route_stage_outside_action_advisory',
    ), true);

    const build = runCli([...createArgs('compose-deliverable'), '--new-attempt'], env).family_runtime_stage_attempt;
    const takeover = runCli([...createArgs('assess-existing-deliverable'), '--new-attempt'], env).family_runtime_stage_attempt;
    assert.equal(build.attempt.status, 'queued');
    assert.equal(build.stage_context_observation.status, 'declared');
    assert.equal(build.stage_context_observation.progression_effect, 'stage_may_start');
    assert.equal(build.stage_context_observation.selected_action_id, 'compose-deliverable');
    assert.equal(build.stage_context_observation.selected_stage_route.entry_stage_ref, 'request-intake');
    assert.equal(build.stage_context_observation.quality_debt_findings.length, 0);
    assert.equal(build.attempt.route_impact.selected_action_id, 'compose-deliverable');
    assert.deepEqual(build.attempt.route_impact.selected_stage_route, build.stage_context_observation.selected_stage_route);
    assert.notEqual(build.attempt.idempotency_key, takeover.attempt.idempotency_key);
    assert.notEqual(build.attempt.stage_attempt_id, takeover.attempt.stage_attempt_id);

    const downstream = runCli([
      ...createArgs('compose-deliverable', 'delivery-planning'), '--new-attempt',
    ], env).family_runtime_stage_attempt;
    assert.equal(downstream.attempt.status, 'queued');
    assert.equal(downstream.stage_context_observation.progression_effect, 'stage_may_start');
    assert.equal(downstream.stage_context_observation.warning_findings.some(
      (finding: { code: string }) => finding.code === 'composition_obligation_not_satisfied',
    ), true);

    const manifestWithIncomingEntry = structuredClone(manifest) as Record<string, any>;
    manifestWithIncomingEntry.family_stage_control_plane.stages.push(createMasScoutStage({
      stage_id: 'route-prerequisite',
      handoff: { next_stage_refs: ['request-intake'] },
      stage_contract: { requires: ['source_ready'], ensures: ['different_entry_requirement'] },
    }));
    const incomingEntryReview = buildFamilyStageConformanceReview(
      normalizeFamilyStageControlPlane(manifestWithIncomingEntry.family_stage_control_plane)!,
      { family_action_catalog: staticCatalog },
    );
    assert.equal(incomingEntryReview.findings.some(
      (finding) =>
        finding.code === 'composition_obligation_not_satisfied'
        && finding.stage_id === 'route-prerequisite'
        && finding.target_stage_id === 'request-intake'
    ), true);
  } finally {
    removeFixtureTree(stateRoot);
    for (const repoDir of repoDirs) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime attempt create keeps an undeclared requested stage launchable with declaration debt', () => {
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
      workspaceLocatorArg(stateRoot, 'mas-workspace'),
      '--source-fingerprint',
      'sha256:undeclared-stage',
    ], env);
    const observation = created.family_runtime_stage_attempt.stage_context_observation;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, null);
    assert.equal(observation.status, 'declaration_debt');
    assert.equal(observation.progression_effect, 'stage_may_start');
    assert.equal(observation.quality_debt_findings[0].severity, 'warning');
    assert.equal(observation.quality_debt_findings[0].code, 'stage_not_in_declared_control_plane');
  } finally {
    removeFixtureTree(stateRoot);
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('family-runtime blocks only an unavailable selected executor and keeps static pack gaps advisory', () => {
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
    workspaceLocatorArg(stateRoot, 'mas-workspace'),
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
      buildFamilyStageConformanceReview(malformedPlane).findings.some(
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
      buildFamilyStageConformanceReview(missingRuntimeEventsPlane).findings.some(
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
    assert.equal(missingScope.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(
      missingScope.family_runtime_stage_attempt.stage_context_observation.progression_effect,
      'stage_may_start',
    );
    assert.equal(
      missingScope.family_runtime_stage_attempt.stage_context_observation.warning_findings.some(
        (finding: { code: string }) => finding.code === 'missing_scope_refs',
      ),
      true,
    );
  } finally {
    removeFixtureTree(stateRoot);
    for (const repoDir of repoDirs) fs.rmSync(repoDir, { recursive: true, force: true });
  }
});
