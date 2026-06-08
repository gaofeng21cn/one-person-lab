import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  shellSingleQuote,
  test,
} from '../helpers.ts';
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';

type JsonRecord = Record<string, unknown>;

const masFamilyTransitionSpec = {
  surface_kind: 'family_transition_spec',
  version: 'family-transition-runner.v1',
  spec_id: 'mas-domain-transition-spec.v1',
  target_domain_id: 'medautoscience',
  owner: 'MedAutoScience',
  authority_boundary: {
    opl: 'transition_runner_transport_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    domain_transition_owner: 'MedAutoScience',
    opl_interprets_domain_quality: false,
    opl_executes_domain_action: false,
    opl_writes_domain_truth: false,
  },
  guards: {
    mas_guard_publication_gate_replay: {
      description: 'MAS owner surfaces matched transition `publication_gate_replay`.',
      owner: 'publication_gate',
      source_ref: 'artifacts/publication_eval/latest.json',
      authority_boundary: {
        runner_boundary: 'mas_domain_read_model_only',
        can_write_domain_truth: false,
      },
    },
    mas_guard_submission_authority_sync_closure: {
      description: 'MAS owner surfaces matched transition `submission_authority_sync_closure`.',
      owner: 'mas_controller',
      source_ref: 'artifacts/controller_decisions/latest.json',
      authority_boundary: {
        runner_boundary: 'mas_domain_read_model_only',
        can_write_domain_truth: false,
      },
    },
  },
  transitions: [
    {
      transition_id: 'mas-transition-publication_gate_replay',
      current_state: 'mas_domain_transition:publication_gate_replay',
      event: 'domain_tick',
      required_guards: ['mas_guard_publication_gate_replay'],
      next_state: 'mas_route:review',
      next_work_unit: {
        work_unit_ref: 'mas-work-unit:publication_gate_replay',
        action_refs: ['run_gate_clearing_batch'],
      },
      owner_route: {
        owner: 'publication_gate',
        route_ref: 'mas-route:review',
      },
      typed_blocker: {
        blocker_code: 'publication_gate_blocked',
        owner: 'publication_gate',
        refs: ['publication_gate_blocked'],
      },
      receipt: {
        receipt_refs: ['mas-domain-transition:003-gate:publication_gate_replay'],
      },
      projection: {
        route_node_refs: ['mas-route-node:review', 'mas-work-unit:publication_gate_replay'],
        decision_type: 'publication_gate_blocker',
        domain_ready_verdict_owner: 'med-autoscience',
      },
      authority_boundary: {
        domain_transition_owner: 'MedAutoScience',
        can_write_domain_truth: false,
        can_execute_domain_action: false,
        opl_interprets_domain_quality: false,
      },
    },
    {
      transition_id: 'mas-transition-submission_authority_sync_closure',
      current_state: 'mas_domain_transition:submission_authority_sync_closure',
      event: 'domain_tick',
      required_guards: ['mas_guard_submission_authority_sync_closure'],
      next_state: 'mas_route:finalize',
      next_work_unit: {
        work_unit_ref: 'mas-work-unit:submission_authority_sync_closure',
        action_refs: ['ensure_study_runtime'],
      },
      owner_route: {
        owner: 'mas_controller',
        route_ref: 'mas-route:finalize',
      },
      receipt: {
        receipt_refs: ['mas-domain-transition:002:submission_authority_sync_closure'],
      },
      projection: {
        route_node_refs: ['mas-route-node:finalize', 'mas-work-unit:submission_authority_sync_closure'],
        decision_type: 'bundle_stage_finalize',
        domain_ready_verdict_owner: 'med-autoscience',
      },
      authority_boundary: {
        domain_transition_owner: 'MedAutoScience',
        can_write_domain_truth: false,
        can_execute_domain_action: false,
        opl_interprets_domain_quality: false,
      },
    },
  ],
};

const masFamilyTransitionMatrixCases = [
  {
    case_id: '003-gate:publication_gate_replay',
    domain_id: 'medautoscience',
    current_state: 'mas_domain_transition:publication_gate_replay',
    event: 'domain_tick',
    guards: { mas_guard_publication_gate_replay: true },
    context: {
      source_ref: 'artifacts/publication_eval/latest.json',
      receipt_ref: 'mas-domain-transition:003-gate:publication_gate_replay',
    },
  },
  {
    case_id: '002:submission_authority_sync_closure',
    domain_id: 'medautoscience',
    current_state: 'mas_domain_transition:submission_authority_sync_closure',
    event: 'domain_tick',
    guards: { mas_guard_submission_authority_sync_closure: true },
    context: {
      source_ref: 'artifacts/controller_decisions/latest.json',
      receipt_ref: 'mas-domain-transition:002:submission_authority_sync_closure',
    },
  },
];

const masFamilyTransitionSpecDescriptor = {
  surface_kind: 'family_transition_spec_descriptor',
  target_domain_id: 'medautoscience',
  spec_surface_kind: 'family_transition_spec',
  contract_version: 'family-transition-runner.v1',
  refresh_policy: 'rebuild_study_state_matrix_before_opl_runner',
  materialized_surfaces: {
    study_state_matrix: [
      'domain_transition_table.family_transition_spec',
      'domain_transition_table.family_transition_matrix_cases',
    ],
    sidecar_export: ['family_transition_spec_descriptor'],
    product_entry_manifest: ['family_transition_spec_descriptor'],
  },
  authority_boundary: {
    runner_owner: 'OPL Framework',
    domain_transition_owner: 'MedAutoScience',
    can_write_domain_truth: false,
    opl_interprets_domain_quality: false,
    opl_executes_domain_action: false,
  },
  locator_refs: {
    study_state_matrix_spec: '/study_state_matrix/domain_transition_table/family_transition_spec',
    study_state_matrix_cases: '/study_state_matrix/domain_transition_table/family_transition_matrix_cases',
    sidecar_export_descriptor: '/mas_family_sidecar_export/family_transition_spec_descriptor',
    product_entry_manifest_descriptor: '/product_entry_manifest/family_transition_spec_descriptor',
  },
  source_refs: {
    study_state_matrix_domain_transition_table: '/study_state_matrix/domain_transition_table',
    sidecar_export_descriptor: '/mas_family_sidecar_export/family_transition_spec_descriptor',
    product_entry_manifest_descriptor: '/product_entry_manifest/family_transition_spec_descriptor',
  },
};

function withMasFamilyTransitionDescriptor(payload: JsonRecord) {
  return {
    ...payload,
    family_transition_spec_descriptor: masFamilyTransitionSpecDescriptor,
  };
}

function withMasFamilyTransitionSurfaces(payload: JsonRecord, overrides: JsonRecord = {}) {
  return {
    ...withMasFamilyTransitionDescriptor(payload),
    family_transition_spec: {
      ...masFamilyTransitionSpec,
      ...overrides,
    },
    family_transition_matrix_cases: masFamilyTransitionMatrixCases,
  };
}

function buildStudyStateMatrixAction(input: {
  title: string;
  summary: string;
  command: string;
  effect?: 'read_only' | 'mutating';
}) {
  return {
    action_id: 'study_state_matrix',
    title: input.title,
    summary: input.summary,
    owner: 'med-autoscience',
    effect: input.effect ?? 'read_only',
    source_command: {
      command: input.command,
      surface_kind: 'study_state_matrix',
    },
    input_schema_ref: 'contracts/schemas/v1/mas-action.input.schema.json',
    output_schema_ref: 'contracts/schemas/v1/mas-action.output.schema.json',
    workspace_locator_fields: ['profile_ref'],
    human_gate_ids: [],
    supported_surfaces: {
      cli: {
        command: input.command,
        surface_kind: 'study_state_matrix',
      },
      mcp: {
        command: input.command,
        surface_kind: 'study_state_matrix',
        public_runtime: false,
        descriptor_only: true,
      },
      skill: {
        command: input.command,
        command_contract_id: 'study_state_matrix',
        surface_kind: 'study_state_matrix',
      },
      product_entry: {
        action_key: 'study_state_matrix',
        command: input.command,
        surface_kind: 'study_state_matrix',
      },
      openai: { tool_name: 'study_state_matrix' },
      ai_sdk: { tool_name: 'study_state_matrix' },
    },
    authority_boundary: {
      runner_owner: 'OPL Framework',
      domain_transition_owner: 'MedAutoScience',
      can_write_domain_truth: false,
      can_execute_domain_action: false,
    },
  };
}

function withRcaVisualTransitionSpec(payload: JsonRecord) {
  return {
    ...payload,
    visual_transition_spec: {
      surface_kind: 'visual_transition_spec',
      spec_id: 'rca.visual_transition_spec.v1',
      owner: 'redcube_ai',
      status: 'contract_landed_runner_integration_pending',
      transition_model: 'rca_owned_transition_table_oracle_fixture_refs_only',
      source_contract: 'docs/active/rca-ideal-state-gap-plan.md#declare_visual_transition_spec',
      covered_family_stage_kinds: [
        'source_intake',
        'communication_strategy',
        'visual_direction',
        'artifact_creation',
        'review_and_revision',
        'package_and_handoff',
      ],
      transition_table: [
        {
          transition_id: 'source_ready_to_strategy',
          from_stage: 'source_intake',
          to_stage: 'communication_strategy',
          required_guard_refs: ['source_readiness_ref', 'source_gap_ref'],
          owner_action: 'continue_to_communication_strategy',
        },
        {
          transition_id: 'artifact_ready_to_review',
          from_stage: 'artifact_creation',
          to_stage: 'review_and_revision',
          required_guard_refs: ['artifact_refs', 'prompt_manifest_ref', 'style_manifest_ref'],
          owner_action: 'run_review_and_repair_gate',
        },
      ],
      guard_contract: {
        guard_model: 'refs_and_typed_blockers_only',
        required_guard_classes: [
          'source_readiness',
          'artifact_locator',
          'review_state',
          'export_proof',
        ],
        allowed_blocker_kinds: [
          'source_material_required',
          'artifact_refs_missing',
          'review_blocked_items_present',
          'export_proof_missing',
          'domain_owner_receipt_required',
        ],
      },
      oracle_fixture: {
        fixture_id: 'rca.visual_transition_oracle.fixture.v1',
        fixture_model: 'transition_guard_expected_owner_action_refs_only',
        covered_families: ['ppt_deck', 'xiaohongshu', 'poster_onepager'],
        expected_return_shapes: [
          'next_stage',
          'repair_action',
          'typed_blocker',
          'domain_owner_receipt_ref',
          'no_regression_evidence_ref',
        ],
        forbidden_oracle_fields: [
          'visual_verdict',
          'export_verdict',
          'review_verdict',
          'canonical_artifact_blob',
          'memory_content_body',
        ],
      },
      runner_boundary: {
        opl_can_execute_transition_spec: true,
        opl_can_retry_or_dead_letter: true,
        opl_can_store_transition_metadata: true,
        opl_can_declare_visual_ready: false,
        opl_can_declare_exportable: false,
        opl_can_mutate_artifacts: false,
        domain_receipt_required_for_visual_closeout: true,
      },
      repository_boundary: {
        repo_tracks_transition_spec: true,
        repo_tracks_oracle_fixture_contract: true,
        repo_tracks_runner_state: false,
        repo_tracks_visual_or_export_artifacts: false,
        repo_tracks_receipt_instances: false,
      },
    },
  };
}

test('domain manifests runs MAS-declared family transition matrix when actual spec and cases are present', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
      buildManifestCommand(withMasFamilyTransitionSurfaces(fixtures.medautoscience)),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.family_transition_spec.spec_id, 'mas-domain-transition-spec.v1');
    assert.equal(medautoscience.manifest.family_transition_matrix_cases.length, 2);
    assert.equal(medautoscience.manifest.family_transition.status, 'matrix_evaluated');
    assert.equal(medautoscience.manifest.family_transition.matrix_result.summary.total, 2);
    assert.equal(medautoscience.manifest.family_transition.matrix_result.summary.transition_applied, 2);
    assert.equal(medautoscience.manifest.family_transition.authority_boundary.opl_interprets_domain_quality, false);
    assert.equal(medautoscience.manifest.family_transition.non_authority_flags.opl_writes_domain_truth, false);
    assert.equal(
      medautoscience.manifest.family_transition.matrix_result.results[0].result.owner_route.owner,
      'publication_gate',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests reports descriptor-only MAS family transition specs as needing a matrix refresh', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-descriptor-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
      buildManifestCommand(withMasFamilyTransitionDescriptor(fixtures.medautoscience)),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.family_transition_spec_descriptor.surface_kind, 'family_transition_spec_descriptor');
    assert.equal(medautoscience.manifest.family_transition_spec, null);
    assert.equal(medautoscience.manifest.family_transition_matrix_cases.length, 0);
    assert.equal(medautoscience.manifest.family_transition.status, 'descriptor_only');
    assert.equal(medautoscience.manifest.family_transition.refresh_required, true);
    assert.equal(medautoscience.manifest.family_transition.matrix_result, null);
    assert.deepEqual(
      medautoscience.manifest.family_transition.descriptor.materialized_surfaces,
      {
        study_state_matrix: [
          'domain_transition_table.family_transition_spec',
          'domain_transition_table.family_transition_matrix_cases',
        ],
        sidecar_export: ['family_transition_spec_descriptor'],
        product_entry_manifest: ['family_transition_spec_descriptor'],
      },
    );
    assert.equal(
      medautoscience.manifest.family_transition.locator_refs.study_state_matrix_spec,
      '/study_state_matrix/domain_transition_table/family_transition_spec',
    );
    assert.equal(
      medautoscience.manifest.family_transition.locator_refs.study_state_matrix_cases,
      '/study_state_matrix/domain_transition_table/family_transition_matrix_cases',
    );
    assert.equal(
      medautoscience.manifest.family_transition.locator_refs.sidecar_export_descriptor,
      '/mas_family_sidecar_export/family_transition_spec_descriptor',
    );
    assert.equal(
      medautoscience.manifest.family_transition.descriptor.source_refs.study_state_matrix_domain_transition_table,
      '/study_state_matrix/domain_transition_table',
    );
    assert.equal('sidecar_export_spec' in medautoscience.manifest.family_transition.locator_refs, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests blocks MAS family transition execution on domain mismatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-mismatch-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
      buildManifestCommand(withMasFamilyTransitionSurfaces(fixtures.medautoscience, {
        target_domain_id: 'wrong-domain',
      })),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.family_transition.status, 'blocked');
    assert.equal(medautoscience.manifest.family_transition.blocked_reason, 'transition_spec_domain_mismatch');
    assert.equal(medautoscience.manifest.family_transition.matrix_result, null);
    assert.equal(medautoscience.manifest.family_transition.non_authority_flags.opl_interprets_domain_quality, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents descriptor projects MAS family transition matrix readiness without taking quality authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-descriptor-transition-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const omaRepoDir = createOmaContractFixture(fixtureRoot);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_META_AGENT_REPO_DIR: omaRepoDir,
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
      buildManifestCommand(withMasFamilyTransitionSurfaces(fixtures.medautoscience)),
    ], env);

    const list = runCli(['agents', 'descriptors'], env);
    assert.equal(list.family_agent_descriptors.summary.transition_matrix_evaluated_count, 1);
    assert.equal(list.family_agent_descriptors.summary.transition_descriptor_only_count, 1);
    assert.equal(list.family_agent_descriptors.summary.transition_blocked_count, 0);

    const inspect = runCli(['agents', 'descriptor', '--domain', 'mas'], env);
    const transition = inspect.family_agent_descriptor.family_transition;

    assert.equal(transition.status, 'matrix_evaluated');
    assert.equal(transition.spec_id, 'mas-domain-transition-spec.v1');
    assert.equal(transition.transition_count, 2);
    assert.equal(transition.case_count, 2);
    assert.equal(transition.matrix_summary.transition_applied, 2);
    assert.equal(transition.non_authority_flags.opl_interprets_domain_quality, false);
    assert.equal(transition.non_authority_flags.opl_authorizes_publication_or_fundability_verdict, false);
    assert.equal(inspect.family_agent_descriptor.descriptor_refs.family_transition.status, 'resolved');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents descriptor projects descriptor-only MAS transition specs as refresh-required', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-descriptor-transition-descriptor-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
      buildManifestCommand(withMasFamilyTransitionDescriptor(fixtures.medautoscience)),
    ], env);

    const inspect = runCli(['agents', 'descriptor', '--domain', 'mas'], env);
    const transition = inspect.family_agent_descriptor.family_transition;

    assert.equal(transition.status, 'descriptor_only');
    assert.equal(transition.refresh_required, true);
    assert.equal(transition.matrix_summary, null);
    assert.deepEqual(
      transition.descriptor.materialized_surfaces,
      {
        study_state_matrix: [
          'domain_transition_table.family_transition_spec',
          'domain_transition_table.family_transition_matrix_cases',
        ],
        sidecar_export: ['family_transition_spec_descriptor'],
        product_entry_manifest: ['family_transition_spec_descriptor'],
      },
    );
    assert.equal(
      transition.locator_refs.study_state_matrix_spec,
      '/study_state_matrix/domain_transition_table/family_transition_spec',
    );
    assert.equal(
      transition.locator_refs.study_state_matrix_cases,
      '/study_state_matrix/domain_transition_table/family_transition_matrix_cases',
    );
    assert.equal(
      transition.locator_refs.sidecar_export_descriptor,
      '/mas_family_sidecar_export/family_transition_spec_descriptor',
    );
    assert.equal('sidecar_export_spec' in transition.locator_refs, false);
    assert.equal(inspect.family_agent_descriptor.descriptor_refs.family_transition.status, 'descriptor_only');
    assert.equal(transition.non_authority_flags.opl_writes_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests materializes descriptor-only MAS transition specs through study-state-matrix', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-materialize-'));
  const materializerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-materializer-'));
  const materializerPath = path.join(materializerRoot, 'materialize-study-state-matrix.js');
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const command = `${process.execPath} ${shellSingleQuote(materializerPath)}`;
  const manifest = {
    ...withMasFamilyTransitionDescriptor(fixtures.medautoscience),
    family_action_catalog: {
      ...((fixtures.medautoscience.family_action_catalog as JsonRecord | undefined) ?? {
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: 'medautoscience.action-catalog.v1',
        target_domain_id: 'medautoscience',
        owner: 'med-autoscience',
        authority_boundary: {
          opl_role: 'generated_action_transport_only',
          domain_role: 'medical_research_action_authority',
        },
        notes: [],
      }),
      actions: [
        ...(((fixtures.medautoscience.family_action_catalog as JsonRecord | undefined)?.actions as JsonRecord[] | undefined) ?? []),
        buildStudyStateMatrixAction({
          title: 'Materialize MAS study state matrix',
          summary: 'Read-only study-state-matrix materialization for OPL transition runner.',
          command,
        }),
      ],
    },
  };
  fs.mkdirSync(materializerRoot, { recursive: true });
  fs.writeFileSync(
    materializerPath,
    [
      'const payload = {',
      '  surface: "study_state_matrix",',
      '  domain_transition_table: {',
      `    family_transition_spec: ${JSON.stringify(masFamilyTransitionSpec)},`,
      `    family_transition_matrix_cases: ${JSON.stringify(masFamilyTransitionMatrixCases)}`,
      '  }',
      '};',
      'process.stdout.write(JSON.stringify(payload));',
      '',
    ].join('\n'),
  );
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
      buildManifestCommand(manifest),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.family_transition_materialization.status, 'materialized');
    assert.equal(
      medautoscience.manifest.family_transition_materialization.command_source,
      'family_action_catalog.study_state_matrix',
    );
    assert.equal(medautoscience.manifest.family_transition_spec.spec_id, 'mas-domain-transition-spec.v1');
    assert.equal(medautoscience.manifest.family_transition_matrix_cases.length, 2);
    assert.equal(medautoscience.manifest.family_transition.status, 'matrix_evaluated');
    assert.equal(medautoscience.manifest.family_transition.matrix_result.summary.total, 2);
    assert.equal(medautoscience.manifest.family_transition.matrix_result.summary.transition_applied, 2);

    const inspect = runCli(['agents', 'descriptor', '--domain', 'mas'], env);
    const transition = inspect.family_agent_descriptor.family_transition;
    assert.equal(transition.status, 'matrix_evaluated');
    assert.equal(transition.materialization.status, 'materialized');
    assert.equal(transition.non_authority_flags.opl_writes_domain_truth, false);
  } finally {
    fs.rmSync(materializerRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests keeps live manifest resolved when transition materialization times out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-materialize-timeout-'));
  const materializerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-materializer-timeout-'));
  const materializerPath = path.join(materializerRoot, 'slow-study-state-matrix.js');
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const command = `${process.execPath} ${shellSingleQuote(materializerPath)}`;
  const manifest = {
    ...withMasFamilyTransitionDescriptor(fixtures.medautoscience),
    family_action_catalog: {
      ...((fixtures.medautoscience.family_action_catalog as JsonRecord | undefined) ?? {
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: 'medautoscience.action-catalog.v1',
        target_domain_id: 'medautoscience',
        owner: 'med-autoscience',
        authority_boundary: {
          opl_role: 'generated_action_transport_only',
          domain_role: 'medical_research_action_authority',
        },
        notes: [],
      }),
      actions: [
        buildStudyStateMatrixAction({
          title: 'Slow MAS study state matrix',
          summary: 'Read-only study-state-matrix materialization that exceeds the OPL projection budget.',
          command,
        }),
      ],
    },
  };
  fs.mkdirSync(materializerRoot, { recursive: true });
  fs.writeFileSync(
    materializerPath,
    'setTimeout(() => {}, 5000);\n',
    'utf8',
  );
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '5000',
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
      buildManifestCommand(manifest),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.deepEqual(manifestOutput.domain_manifests.summary.live_failed_project_ids, []);
    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.error, null);
    assert.equal(medautoscience.manifest_cache, undefined);
    assert.equal(medautoscience.manifest.family_transition_materialization.status, 'failed');
    assert.equal(
      medautoscience.manifest.family_transition_materialization.blocked_reason,
      'study_state_matrix_materialization_timeout',
    );
    assert.equal(medautoscience.manifest.family_transition_materialization.timeout_ms, 1000);
    assert.equal(medautoscience.manifest.family_transition.status, 'descriptor_only');
    assert.equal(medautoscience.manifest.family_transition.refresh_required, true);
  } finally {
    fs.rmSync(materializerRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests skips MAS transition materialization when study-state-matrix action is not read-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-transition-materialize-blocked-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const command = `${process.execPath} -e "process.exit(1)"`;
  const manifest = {
    ...withMasFamilyTransitionDescriptor(fixtures.medautoscience),
    family_action_catalog: {
      ...((fixtures.medautoscience.family_action_catalog as JsonRecord | undefined) ?? {
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: 'medautoscience.action-catalog.v1',
        target_domain_id: 'medautoscience',
        owner: 'med-autoscience',
        authority_boundary: {
          opl_role: 'generated_action_transport_only',
          domain_role: 'medical_research_action_authority',
        },
        notes: [],
      }),
      actions: [
        ...(((fixtures.medautoscience.family_action_catalog as JsonRecord | undefined)?.actions as JsonRecord[] | undefined) ?? []),
        buildStudyStateMatrixAction({
          title: 'Unsafe MAS study state matrix',
          summary: 'Non-read-only action must not be executed by OPL materialization.',
          effect: 'mutating',
          command,
        }),
      ],
    },
  };
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
      buildManifestCommand(manifest),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.family_transition_materialization.status, 'skipped');
    assert.equal(
      medautoscience.manifest.family_transition_materialization.blocked_reason,
      'study_state_matrix_action_must_be_read_only',
    );
    assert.equal(
      medautoscience.manifest.family_transition_materialization.command_source,
      'family_action_catalog.study_state_matrix',
    );
    assert.equal(medautoscience.manifest.family_transition.status, 'descriptor_only');
    assert.equal(medautoscience.manifest.family_transition.refresh_required, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests adapts RCA visual transition specs into the family transition matrix', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-rca-visual-transition-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(withRcaVisualTransitionSpec(fixtures.redcube)),
    ], env);

    const manifestOutput = runCli(['domain', 'manifests'], env);
    const redcube = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) =>
      entry.project_id === 'redcube'
    );

    assert.equal(redcube.status, 'resolved');
    assert.equal(redcube.manifest.visual_transition_spec.spec_id, 'rca.visual_transition_spec.v1');
    assert.equal(redcube.manifest.family_transition_spec.spec_id, 'rca.visual_transition_spec.v1');
    assert.equal(redcube.manifest.family_transition_matrix_cases.length, 2);
    assert.equal(redcube.manifest.family_transition.status, 'matrix_evaluated');
    assert.equal(redcube.manifest.family_transition.matrix_result.summary.total, 2);
    assert.equal(redcube.manifest.family_transition.matrix_result.summary.transition_applied, 2);
    assert.equal(redcube.manifest.family_transition.authority_boundary.visual_export_verdict_owner, 'redcube_ai');
    assert.equal(redcube.manifest.family_transition.non_authority_flags.opl_authorizes_publication_or_fundability_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents descriptor projects RCA visual transition spec ingestion without taking visual authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-descriptor-rca-visual-transition-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const omaRepoDir = createOmaContractFixture(fixtureRoot);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_META_AGENT_REPO_DIR: omaRepoDir,
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(withRcaVisualTransitionSpec(fixtures.redcube)),
    ], env);

    const list = runCli(['agents', 'descriptors'], env);
    assert.equal(list.family_agent_descriptors.summary.transition_matrix_evaluated_count, 1);
    assert.equal(list.family_agent_descriptors.summary.transition_descriptor_only_count, 1);
    assert.equal(list.family_agent_descriptors.summary.transition_blocked_count, 0);

    const inspect = runCli(['agents', 'descriptor', '--domain', 'rca'], env);
    const transition = inspect.family_agent_descriptor.family_transition;

    assert.equal(transition.status, 'matrix_evaluated');
    assert.equal(transition.spec_id, 'rca.visual_transition_spec.v1');
    assert.equal(transition.transition_count, 2);
    assert.equal(transition.case_count, 2);
    assert.equal(transition.matrix_summary.transition_applied, 2);
    assert.equal(transition.authority_boundary.visual_transition_surface_kind, 'visual_transition_spec');
    assert.equal(transition.authority_boundary.opl_can_declare_visual_ready, false);
    assert.equal(transition.authority_boundary.opl_can_declare_exportable, false);
    assert.equal(transition.authority_boundary.opl_can_mutate_artifacts, false);
    assert.equal(transition.non_authority_flags.opl_executes_domain_action, false);
    assert.equal(inspect.family_agent_descriptor.descriptor_refs.visual_transition_spec.status, 'resolved');
    assert.equal(inspect.family_agent_descriptor.descriptor_refs.family_transition.status, 'resolved');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
