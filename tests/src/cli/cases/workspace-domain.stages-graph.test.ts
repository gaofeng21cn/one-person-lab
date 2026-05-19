import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, shellSingleQuote, test } from '../helpers.ts';
import { buildFamilyStagesList } from '../../../../src/family-stage-control-plane.ts';
import { loadFrameworkContracts } from '../../../../src/contracts.ts';

type JsonRecord = Record<string, unknown>;

function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return { ...payload, [field]: value };
}

function buildDelayedManifestCommand(payload: Record<string, unknown>, delayMs: number) {
  return `${process.execPath} -e ${
    shellSingleQuote(`setTimeout(() => process.stdout.write(process.argv[1]), ${delayMs});`)
  } ${shellSingleQuote(JSON.stringify(payload))}`;
}

function buildActionCatalog() {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'med_autoscience_action_catalog',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: [
      {
        action_id: 'author_draft',
        title: 'Author draft',
        summary: 'Author from explicit refs.',
        owner: 'MedAutoScience',
        effect: 'read_only',
        source_command: { command: 'medautosci write', surface_kind: 'domain_cli' },
        input_schema_ref: 'schemas/author.input.json',
        output_schema_ref: 'schemas/author.output.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
      {
        action_id: 'review_draft',
        title: 'Review draft',
        summary: 'Review from explicit refs.',
        owner: 'MedAutoScience',
        effect: 'read_only',
        source_command: { command: 'medautosci review', surface_kind: 'domain_cli' },
        input_schema_ref: 'schemas/review.input.json',
        output_schema_ref: 'schemas/review.output.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['publication_quality_gate'],
        supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
    ],
    notes: [],
  };
}

function buildStagePlane() {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      stage_pack_signer_ref: 'kms:mas-stage-pack',
      stage_pack_signature_ref: 'artifact:mas-stage-pack.sig',
    },
    stages: [
      {
        stage_id: 'manuscript_authoring',
        stage_kind: 'creation',
        title: 'Manuscript authoring',
        summary: 'Author from explicit source refs.',
        goal: 'Produce a manuscript draft under MAS authority.',
        owner: 'MedAutoScience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: ['author_draft'],
        outputs: [{ ref_kind: 'proof', ref: 'artifacts/manuscript-draft-proof.json', role: 'proof_ref' }],
        evaluation: [],
        handoff: { next_stage_refs: ['publication_review'], provides: ['draft_ready'] },
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          boundary_assumptions: ['source_refs_are_domain_owned'],
          properties: ['deterministic_handoff_refs'],
          runtime_assumptions: ['source_freshness_within_domain_policy'],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: '/runtime_inventory', role: 'runtime_assumption_monitor' }],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: { lane: 'domain_agent', static_check_eligible: true, effect_boundary: false, records_runtime_events: false },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      },
      {
        stage_id: 'publication_review',
        stage_kind: 'review',
        title: 'Publication review',
        summary: 'Review draft refs.',
        goal: 'Gate draft under MAS reviewer authority.',
        owner: 'MedAutoScience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: ['review_draft'],
        outputs: [],
        evaluation: [{ ref_kind: 'test', ref: 'tests/publication-review.test.ts', role: 'proof_ref' }],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_receipt_ready'],
          boundary_assumptions: ['reviewer_judgment_recorded_as_receipt'],
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:publication_review_receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
}

function buildAdmittedActionCatalog(targetDomainId: string, owner: string) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: Array.from({ length: 6 }, (_entry, index) => ({
      action_id: `stage_${index + 1}_action`,
      title: `Stage ${index + 1} action`,
      summary: `Project stage ${index + 1} action metadata.`,
      owner,
      effect: 'read_only',
      source_command: { command: `${owner} stage-${index + 1}`, surface_kind: 'domain_cli' },
      input_schema_ref: `schemas/stage-${index + 1}.input.json`,
      output_schema_ref: `schemas/stage-${index + 1}.output.json`,
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
      authority_boundary: { opl_role: 'projection_consumer_only' },
    })),
    notes: [],
  };
}

function buildAdmittedStagePlane(targetDomainId: string, owner: string) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: Array.from({ length: 6 }, (_entry, index) => {
      const stageNumber = index + 1;
      return {
        stage_id: `stage_${stageNumber}`,
        stage_kind: 'creation',
        title: `Stage ${stageNumber}`,
        summary: `Runtime-enforced stage ${stageNumber} descriptor.`,
        goal: `Expose stage ${stageNumber} as admitted runtime projection metadata.`,
        owner,
        domain_stage_refs: [`domain_stage_${stageNumber}`],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [`stage_${stageNumber}_action`],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: [`stage_${stageNumber}_input_ready`],
          ensures: [`stage_${stageNumber}_receipt_ready`],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: `/runtime_inventory/stage_${stageNumber}`, role: 'runtime_assumption_monitor' }],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: `/source_scope/stage_${stageNumber}`, role: 'launch_source_scope' }],
          cohort_query_refs: [{ ref_kind: 'json_pointer', ref: `/cohort_query/stage_${stageNumber}`, role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: `queue:${targetDomainId}/stage_${stageNumber}`, role: 'launch_trigger' }],
          dashboard_metric_refs: [{ ref_kind: 'metric_ref', ref: `metric:${targetDomainId}.stage_${stageNumber}`, role: 'operator_metric' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: false,
          runtime_guard_required: true,
          records_runtime_events: true,
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      };
    }),
    notes: [],
  };
}

function withAdmittedStagePack(payload: JsonRecord, targetDomainId: string, owner: string) {
  return attachManifestSurface(
    attachManifestSurface(payload, 'family_action_catalog', buildAdmittedActionCatalog(targetDomainId, owner)),
    'family_stage_control_plane',
    buildAdmittedStagePlane(targetDomainId, owner),
  );
}

function buildContractLightStagePlane(options: {
  trustBoundary?: JsonRecord;
  runtimeAssumptions?: unknown[];
  monitorRefs?: JsonRecord[];
  sourceScopeRefs?: JsonRecord[];
  cohortQueryRefs?: JsonRecord[];
  triggerRefs?: JsonRecord[];
  metricRefs?: JsonRecord[];
  properties?: string[];
} = {}) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_contract_light_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'scout',
        stage_kind: 'planning',
        title: 'Scout',
        summary: 'Plan from explicit refs while leaving AI strategy to the executor.',
        goal: 'Prepare a bounded MAS planning stage under domain authority.',
        owner: 'MedAutoScience',
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
          requires: ['source_scope_declared'],
          ensures: ['plan_receipt_declared'],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: options.properties ?? [],
          runtime_assumptions: options.runtimeAssumptions ?? [],
          monitor_refs: options.monitorRefs ?? [],
          source_scope_refs: options.sourceScopeRefs ?? [],
          cohort_query_refs: options.cohortQueryRefs ?? [],
          trigger_refs: options.triggerRefs ?? [],
          metric_refs: options.metricRefs ?? [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
          ...(options.trustBoundary ?? {}),
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      },
    ],
    notes: [],
  };
}

test('family stage graph projects edges, guarantee modes, and integrity digest without authority transfer', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-graph-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = attachManifestSurface(
    attachManifestSurface(fixtures.medautoscience as JsonRecord, 'family_action_catalog', buildActionCatalog()),
    'family_stage_control_plane',
    buildStagePlane(),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const proofBundle = runCli(['stages', 'proof-bundle', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const graph = runCli(['stages', 'graph', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(graph.family_stage_graph.surface_kind, 'opl_family_stage_graph_projection');
    assert.deepEqual(graph.family_stage_graph.graph_summary, {
      node_count: 2,
      edge_count: 1,
      blocked_node_count: 0,
      needs_contracts_node_count: 0,
      missing_edge_count: 0,
      runtime_enforced_node_count: 1,
      verified_core_eligible_node_count: 1,
      durable_runtime_only_node_count: 1,
      runtime_boundary_required_node_count: 1,
      monitor_ref_count: 1,
    });
    assert.deepEqual(graph.family_stage_graph.edges[0], {
      edge_id: 'manuscript_authoring->publication_review',
      upstream_stage_id: 'manuscript_authoring',
      downstream_stage_id: 'publication_review',
      upstream_ensures: ['draft_ready'],
      downstream_requires: ['draft_ready'],
      satisfied_by: ['draft_ready'],
      missing: [],
      status: 'satisfied',
      edge_kind: 'handoff_requires_ensures',
    });
    assert.deepEqual(graph.family_stage_graph.nodes.map((node: { stage_id: string; guarantee_modes: string[] }) => [node.stage_id, node.guarantee_modes]), [
      ['manuscript_authoring', ['static_admission_only', 'domain_owned_judgment', 'observability_only']],
      ['publication_review', ['runtime_enforced', 'domain_owned_judgment', 'observability_only']],
    ]);
    assert.deepEqual(graph.family_stage_graph.nodes.map((node: { stage_id: string; mode_tags: JsonRecord }) => [node.stage_id, node.mode_tags]), [
      ['manuscript_authoring', {
        verified_core_eligible: true,
        durable_runtime_only: false,
        runtime_boundary_required: false,
      }],
      ['publication_review', {
        verified_core_eligible: false,
        durable_runtime_only: true,
        runtime_boundary_required: true,
      }],
    ]);
    assert.deepEqual(graph.family_stage_graph.failure_localization, []);
    assert.equal(graph.family_stage_graph.integrity.stage_pack_hash, proofBundle.family_stage_proof_bundle.proof_bundle.integrity.stage_pack_hash);
    assert.equal(graph.family_stage_graph.integrity.signature_status, 'signature_ref_declared');
    assert.equal(graph.family_stage_graph.integrity.authority_boundary.can_verify_external_signature, false);
    assert.equal(graph.family_stage_graph.authority_boundary.can_execute_stage, false);
    assert.equal(graph.family_stage_graph.authority_boundary.can_write_domain_truth, false);
    assert.equal(graph.family_stage_graph.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage readiness aggregates existing drilldown surfaces without domain verdict authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-readiness-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withAdmittedStagePack(fixtures.medautoscience as JsonRecord, 'med-autoscience', 'MedAutoScience');

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness;

    assert.equal(Object.hasOwn(readiness, 'surface_kind'), false);
    assert.equal(Object.hasOwn(readiness, 'version'), false);
    assert.equal(readiness.launch_readiness_status, 'launch_warning');
    assert.equal(readiness.summary.stage_count, 6);
    assert.equal(readiness.summary.admitted_stage_count, 6);
    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(readiness.summary.cohort_loop_warning_count, 0);
    assert.equal(readiness.summary.replay_evidence_warning_count > 0, true);
    assert.deepEqual(readiness.recommendations, readiness.warnings);
    assert.equal(readiness.checks.some((entry: { check_id: string }) => entry.check_id === 'stage_admission'), true);
    assert.equal(readiness.checks.some((entry: { check_id: string }) => entry.check_id === 'proof_bundle'), true);
    assert.equal(readiness.drilldown_refs.includes('opl stages proof-bundle --domain mas'), true);
    assert.equal(readiness.drilldown_refs.includes('opl stages replay-certification --domain mas'), true);
    assert.equal(Object.hasOwn(readiness, 'domain_ready_status'), false);
    assert.equal(Object.hasOwn(readiness, 'quality_verdict'), false);
    assert.equal(
      readiness.ai_first_contract_light_policy.expert_judgment_priority,
      'ai_native_expert_judgment_first',
    );
    assert.equal(
      readiness.ai_first_contract_light_policy.contract_floor_policy,
      'contracts_preserve_minimum_safety_audit_recovery_floor_only',
    );
    assert.equal(
      readiness.ai_first_contract_light_policy.mechanical_signals_policy,
      'mechanical_scores_checklists_and_contract_completeness_are_advisory_not_quality_verdicts',
    );
    assert.equal(
      readiness.ai_first_contract_light_policy.does_not_contract.includes('mechanical_quality_substitute'),
      true,
    );
    assert.equal(readiness.authority_boundary.opl_role, 'stage_readiness_cli_summary_only');
    assert.equal(readiness.authority_boundary.ai_internal_strategy_contract, false);
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(readiness.authority_boundary.can_replace_ai_expert_judgment, false);
    assert.equal(readiness.authority_boundary.contract_completeness_is_quality_verdict, false);
    assert.equal(readiness.authority_boundary.graphflow_runtime_dependency, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage readiness fails closed when launch-safety evidence is missing', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-readiness-blocked-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = attachManifestSurface(
    fixtures.medautoscience as JsonRecord,
    'family_stage_control_plane',
    buildContractLightStagePlane({
      trustBoundary: {
        lane: 'ai_decision',
        static_check_eligible: false,
        effect_boundary: true,
        records_runtime_events: false,
      },
    }),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness;

    assert.equal(readiness.launch_readiness_status, 'launch_blocked');
    assert.equal(readiness.summary.hard_blocker_count >= 2, true);
    assert.deepEqual(readiness.hard_blockers.map((entry: { code: string }) => entry.code), [
      'effect_boundary_without_event_recording',
      'effect_boundary_missing_runtime_event_refs',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage readiness treats lightweight authoring fields as warnings instead of launch blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-readiness-warning-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = attachManifestSurface(
    fixtures.medautoscience as JsonRecord,
    'family_stage_control_plane',
    buildContractLightStagePlane({
      runtimeAssumptions: ['artifact_locator_fresh'],
    }),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness;

    assert.equal(readiness.launch_readiness_status, 'launch_warning');
    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(readiness.summary.assumption_warning_count, 1);
    assert.equal(readiness.summary.cohort_loop_warning_count, 4);
    assert.equal(
      readiness.warnings.some((entry: { code: string }) => entry.code === 'runtime_assumption_missing_monitor_ref'),
      true,
    );
    assert.equal(
      readiness.warnings.some((entry: { code: string }) => entry.code === 'cohort_query_missing'),
      true,
    );
    assert.deepEqual(readiness.recommendations, readiness.warnings);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help recommends stage readiness before detailed stage projections', () => {
  const root = runCli(['help', '--json']);

  assert.equal(root.help.examples.includes('opl stages readiness --domain mas'), true);
  assert.equal(root.help.examples.includes('opl stages assumptions --domain mas'), false);
  assert.equal(root.help.examples.includes('opl stages runtime-budget --domain mas'), false);
  assert.equal(root.help.examples.includes('opl stages registry --domain mas'), false);
  assert.equal(root.help.examples.includes('opl stages source-spec --domain mas'), false);
  assert.equal(root.help.examples.includes('opl stages replay-certification --domain mas'), false);
});

test('family stage list and proof bundles preserve 18 admitted runtime-enforced projection stages', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-admitted-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifests: Array<[string, JsonRecord, string, string]> = [
    ['medautoscience', fixtures.medautoscience as JsonRecord, 'med-autoscience', 'MedAutoScience'],
    ['medautogrant', fixtures.medautogrant as JsonRecord, 'med-autogrant', 'MedAutoGrant'],
    ['redcube', fixtures.redcube as JsonRecord, 'redcube_ai', 'RedCubeAI'],
  ];

  try {
    for (const [project, fixture, targetDomainId, owner] of manifests) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(withAdmittedStagePack(fixture, targetDomainId, owner)),
      ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    }

    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_stages.summary.resolved_planes_count, 3);
    assert.equal(list.family_stages.summary.stages_count, 18);
    assert.equal(list.family_stages.summary.admitted_stages_count, 18);
    assert.equal(list.family_stages.summary.blocked_stages_count, 0);
    assert.equal(list.family_stages.summary.needs_contracts_stages_count, 0);
    assert.equal(
      list.family_stages.stages.every((stage: { admission_status: string; guarantee_mode: string; mode_tags: { durable_runtime_only: boolean; runtime_boundary_required: boolean } }) =>
        stage.admission_status === 'admitted'
        && stage.guarantee_mode === 'runtime_enforced'
        && stage.mode_tags.durable_runtime_only === true
        && stage.mode_tags.runtime_boundary_required === true,
      ),
      true,
    );

    const proofBundle = runCli(['stages', 'proof-bundle', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_proof_bundle.proof_bundle;
    const cohortLoop = runCli(['stages', 'cohort-loop', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_cohort_loop.projection;
    const runtimeBudget = runCli(['stages', 'runtime-budget', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_runtime_budget.projection;
    const sourceSpec = runCli([
      'stages',
      'source-spec',
      '--domain',
      'mas',
      '--library-status',
      'reused',
      '--reused-by-ref',
      'opl://stage-packs/redcube_ai:stage_control_plane',
      '--recorded-runtime-event-ref',
      'runtime_event:med-autoscience.stage_1',
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_pack_source_spec.source_spec;
    assert.equal(proofBundle.admission_status, 'admitted');
    assert.equal(proofBundle.admission_summary.admitted_stages_count, 6);
    assert.equal(proofBundle.authority_boundary.proof_passed, true);
    assert.equal(proofBundle.authority_boundary.can_write_domain_truth, false);
    assert.equal(cohortLoop.surface_kind, 'opl_family_stage_cohort_loop');
    assert.equal(cohortLoop.summary.closed_loop_ready_count, 6);
    assert.equal(cohortLoop.summary.blocker_count, 0);
    assert.equal(cohortLoop.authority_boundary.graphflow_runtime_dependency, false);
    assert.equal(cohortLoop.authority_boundary.can_write_source_truth, false);
    assert.equal(runtimeBudget.surface_kind, 'opl_family_stage_runtime_budget_projection');
    assert.equal(runtimeBudget.summary.stage_count, 6);
    assert.equal(runtimeBudget.authority_boundary.graphflow_runtime_dependency, false);
    assert.equal(runtimeBudget.authority_boundary.probability_truth_claim, false);
    assert.equal(runtimeBudget.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(runtimeBudget.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(sourceSpec.surface_kind, 'opl_family_stage_pack_source_spec');
    assert.equal(sourceSpec.review_mode, 'diffable_refs_only_visual_equivalent_spec');
    assert.equal(sourceSpec.stage_pack_hash, proofBundle.integrity.stage_pack_hash);
    assert.deepEqual(sourceSpec.diff_keys.registry_lifecycle_statuses, ['reused']);
    assert.equal(sourceSpec.body_policy.includes_control_plane_body, false);
    assert.equal(sourceSpec.body_policy.includes_artifact_body, false);
    assert.equal(sourceSpec.body_policy.executes_stage, false);
    assert.equal(sourceSpec.authority_boundary.visual_equivalent_spec, true);
    assert.equal(sourceSpec.authority_boundary.can_execute_stage, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage proof bundle uses the extended stage manifest discovery budget', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-timeout-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const slowMas = withAdmittedStagePack(
    fixtures.medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
  );
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
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
      buildDelayedManifestCommand(slowMas, 500),
    ], env);

    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    const previousStateDir = process.env.OPL_STATE_DIR;
    let shortTimeoutList;
    try {
      process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
      process.env.OPL_STATE_DIR = stateRoot;
      shortTimeoutList = buildFamilyStagesList(loadFrameworkContracts(), {
        manifestCommandTimeoutMs: 100,
      });
    } finally {
      if (previousContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = previousContractsDir;
      }
      if (previousStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousStateDir;
      }
    }
    const shortTimeoutMas = shortTimeoutList.family_stages.domains.find(
      (domain: { project_id: string }) => domain.project_id === 'medautoscience',
    );
    assert.ok(shortTimeoutMas);
    assert.equal(shortTimeoutMas.manifest_status, 'command_timeout');

    const proofBundle = runCli(['stages', 'proof-bundle', '--domain', 'mas'], env);
    assert.equal(proofBundle.family_stage_proof_bundle.proof_bundle.admission_status, 'admitted');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
