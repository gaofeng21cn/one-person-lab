import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
  shellSingleQuote,
  test,
} from '../helpers.ts';
import {
  bindManifest,
  findDomainManifest,
  type JsonRecord,
} from './workspace-domain-test-helper.ts';

const masTransitionSpec = {
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
    publication_gate_ready: {
      description: 'MAS publication gate refs are ready.',
      owner: 'publication_gate',
      source_ref: 'artifacts/publication_eval/latest.json',
      authority_boundary: {
        runner_boundary: 'mas_domain_read_model_only',
        can_write_domain_truth: false,
      },
    },
  },
  transitions: [{
    transition_id: 'mas-transition-publication-gate',
    current_state: 'mas_domain_transition:publication_gate',
    event: 'domain_tick',
    required_guards: ['publication_gate_ready'],
    next_state: 'mas_route:review',
    next_work_unit: {
      work_unit_ref: 'mas-work-unit:publication-gate',
      action_refs: ['run_gate_clearing_batch'],
    },
    owner_route: { owner: 'publication_gate', route_ref: 'mas-route:review' },
    receipt: { receipt_refs: ['mas-domain-transition:publication-gate'] },
    projection: {
      route_node_refs: ['mas-route-node:review'],
      decision_type: 'publication_gate_blocker',
      domain_ready_verdict_owner: 'med-autoscience',
    },
    authority_boundary: {
      domain_transition_owner: 'MedAutoScience',
      can_write_domain_truth: false,
      can_execute_domain_action: false,
      opl_interprets_domain_quality: false,
    },
  }],
};

const masTransitionCases = [{
  case_id: 'publication-gate',
  domain_id: 'medautoscience',
  current_state: 'mas_domain_transition:publication_gate',
  event: 'domain_tick',
  guards: { publication_gate_ready: true },
  context: {
    source_ref: 'artifacts/publication_eval/latest.json',
    receipt_ref: 'mas-domain-transition:publication-gate',
  },
}];

const masTransitionDescriptor = {
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
  },
  source_refs: {
    study_state_matrix_domain_transition_table: '/study_state_matrix/domain_transition_table',
  },
};

function withMasTransitions(payload: JsonRecord, overrides: JsonRecord = {}) {
  return {
    ...payload,
    family_transition_spec_descriptor: masTransitionDescriptor,
    family_transition_spec: { ...masTransitionSpec, ...overrides },
    family_transition_matrix_cases: masTransitionCases,
  };
}

function withMasTransitionDescriptor(payload: JsonRecord) {
  return { ...payload, family_transition_spec_descriptor: masTransitionDescriptor };
}

function studyStateMatrixAction(command: string, effect: 'read_only' | 'mutating' = 'read_only') {
  return {
    action_id: 'study_state_matrix',
    title: 'Materialize study state matrix',
    summary: 'Return refs-only transition metadata.',
    owner: 'med-autoscience',
    effect,
    source_command: { command, surface_kind: 'study_state_matrix' },
    input_schema_ref: 'schemas/mas-action.input.json',
    output_schema_ref: 'schemas/mas-action.output.json',
    workspace_locator_fields: ['profile_ref'],
    human_gate_ids: [],
    supported_surfaces: {
      cli: { command, surface_kind: 'study_state_matrix' },
      mcp: null,
      skill: null,
      product_entry: null,
      openai: null,
      ai_sdk: null,
    },
    authority_boundary: {
      runner_owner: 'OPL Framework',
      domain_transition_owner: 'MedAutoScience',
      can_write_domain_truth: false,
      can_execute_domain_action: false,
    },
  };
}

function withStudyStateMatrixAction(payload: JsonRecord, action: JsonRecord) {
  const catalog = (payload.family_action_catalog as JsonRecord | undefined) ?? {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'medautoscience.action-catalog.v1',
    target_domain_id: 'medautoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    notes: [],
  };
  return {
    ...withMasTransitionDescriptor(payload),
    family_action_catalog: {
      ...catalog,
      actions: [...((catalog.actions as JsonRecord[] | undefined) ?? []), action],
    },
  };
}

test('domain manifests owns transition matrix evaluation and domain mismatch blocking', () => {
  const fixtures = loadFamilyManifestFixtures();
  for (const row of [
    { overrides: {}, expectedStatus: 'matrix_evaluated', expectedApplied: 1 },
    { overrides: { target_domain_id: 'wrong-domain' }, expectedStatus: 'blocked', expectedApplied: null },
  ]) {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-matrix-'));
    const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
    const env = { OPL_STATE_DIR: stateRoot, OPL_CONTRACTS_DIR: fixtureContractsRoot };
    try {
      bindManifest('medautoscience', withMasTransitions(fixtures.medautoscience, row.overrides), env);
      const transition = findDomainManifest(runCli(['domain', 'manifests'], env), 'medautoscience')
        .manifest.family_transition;
      const descriptorTransition = runCli(['agents', 'descriptor', '--domain', 'mas'], env)
        .family_agent_descriptor.family_transition;
      assert.equal(transition.status, row.expectedStatus);
      assert.equal(transition.matrix_result?.summary.transition_applied ?? null, row.expectedApplied);
      assert.equal(transition.non_authority_flags.opl_writes_domain_truth, false);
      assert.equal(descriptorTransition.status, row.expectedStatus);
      assert.equal(
        descriptorTransition.matrix_summary?.transition_applied ?? null,
        row.expectedApplied,
      );
      assert.equal(descriptorTransition.non_authority_flags.opl_writes_domain_truth, false);
      assert.equal(descriptorTransition.non_authority_flags.opl_executes_domain_action, false);
      assert.equal(descriptorTransition.non_authority_flags.opl_interprets_domain_quality, false);
      if (row.expectedStatus === 'blocked') {
        assert.equal(transition.blocked_reason, 'transition_spec_domain_mismatch');
        assert.equal(descriptorTransition.blocked_reason, 'transition_spec_domain_mismatch');
      }
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  }
});

test('transition projections preserve descriptor-only and missing-matrix refresh semantics', () => {
  const fixture = loadFamilyManifestFixtures().medautoscience;
  const rows = [
    {
      name: 'descriptor_only',
      manifest: withMasTransitionDescriptor(fixture),
      status: 'descriptor_only',
      refreshRequired: true,
      blockedReason: null,
    },
    {
      name: 'transition_matrix_cases_missing',
      manifest: {
        ...withMasTransitions(fixture),
        family_transition_matrix_cases: [],
      },
      status: 'blocked',
      refreshRequired: true,
      blockedReason: 'transition_matrix_cases_missing',
    },
  ];

  for (const row of rows) {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-transition-${row.name}-`));
    const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
    const env = { OPL_STATE_DIR: stateRoot, OPL_CONTRACTS_DIR: fixtureContractsRoot };
    try {
      bindManifest('medautoscience', row.manifest, env);
      const projections = [
        findDomainManifest(runCli(['domain', 'manifests'], env), 'medautoscience')
          .manifest.family_transition,
        runCli(['agents', 'descriptor', '--domain', 'mas'], env)
          .family_agent_descriptor.family_transition,
      ];

      for (const projection of projections) {
        assert.equal(projection.status, row.status, row.name);
        assert.equal(projection.refresh_required, row.refreshRequired, row.name);
        assert.equal(projection.blocked_reason, row.blockedReason, row.name);
      }
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('descriptor materialization accepts read-only transition metadata', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-materialize-'));
  const scriptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-script-'));
  const scriptPath = path.join(scriptRoot, 'study-state-matrix.js');
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  fs.writeFileSync(scriptPath, `process.stdout.write(JSON.stringify(${JSON.stringify({
    surface: 'study_state_matrix',
    domain_transition_table: {
      family_transition_spec: masTransitionSpec,
      family_transition_matrix_cases: masTransitionCases,
    },
  })}));\n`);
  const command = `${process.execPath} ${shellSingleQuote(scriptPath)}`;
  const env = { OPL_STATE_DIR: stateRoot, OPL_CONTRACTS_DIR: fixtureContractsRoot };
  try {
    const manifest = withStudyStateMatrixAction(
      loadFamilyManifestFixtures().medautoscience,
      studyStateMatrixAction(command),
    );
    bindManifest('medautoscience', manifest, env);
    const resolved = findDomainManifest(runCli(['domain', 'manifests'], env), 'medautoscience');
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.manifest.family_transition_materialization.status, 'materialized');
    assert.equal(resolved.manifest.family_transition.status, 'matrix_evaluated');
    assert.equal(resolved.manifest.family_transition.matrix_result.summary.transition_applied, 1);
  } finally {
    fs.rmSync(scriptRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('descriptor materialization timeout keeps the live manifest resolved', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-timeout-'));
  const scriptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-timeout-script-'));
  const scriptPath = path.join(scriptRoot, 'slow-study-state-matrix.js');
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  fs.writeFileSync(scriptPath, 'setTimeout(() => {}, 5000);\n');
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '5000',
  };
  try {
    bindManifest('medautoscience', withStudyStateMatrixAction(
      loadFamilyManifestFixtures().medautoscience,
      studyStateMatrixAction(`${process.execPath} ${shellSingleQuote(scriptPath)}`),
    ), env);
    const output = runCli(['domain', 'manifests'], env);
    const resolved = findDomainManifest(output, 'medautoscience');
    assert.equal(output.domain_manifests.summary.failed_count, 0);
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.manifest.family_transition_materialization.status, 'failed');
    assert.equal(
      resolved.manifest.family_transition_materialization.blocked_reason,
      'study_state_matrix_materialization_timeout',
    );
  } finally {
    fs.rmSync(scriptRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('descriptor materialization never executes a mutating action', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-mutating-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = { OPL_STATE_DIR: stateRoot, OPL_CONTRACTS_DIR: fixtureContractsRoot };
  try {
    bindManifest('medautoscience', withStudyStateMatrixAction(
      loadFamilyManifestFixtures().medautoscience,
      studyStateMatrixAction(`${process.execPath} -e "process.exit(1)"`, 'mutating'),
    ), env);
    const resolved = findDomainManifest(runCli(['domain', 'manifests'], env), 'medautoscience');
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.manifest.family_transition_materialization.status, 'skipped');
    assert.equal(
      resolved.manifest.family_transition_materialization.blocked_reason,
      'study_state_matrix_action_must_be_read_only',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('RCA visual transition specs adapt without granting OPL visual authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-transition-rca-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = { OPL_STATE_DIR: stateRoot, OPL_CONTRACTS_DIR: fixtureContractsRoot };
  const manifest = {
    ...loadFamilyManifestFixtures().redcube,
    visual_transition_adapter_profile_registry: {
      surface_kind: 'opl_domain_transition_adapter_profile_registry',
      version: 'visual-transition-adapter-profile-registry.v1',
      owner: 'redcube_ai',
      registry_role: 'domain_owned_transition_adapter_profile_registry',
      source_visual_transition_spec_ref: 'opl_generated:product_entry_manifest#/visual_transition_spec',
      profile_count: 1,
      compatibility_profile_count: 1,
      registry_entries: [{
        profile_id: 'redcube-ai.visual_transition.compatibility.v1',
        target_domain_ids: ['rca', 'redcube_ai', 'redcube-ai', 'redcube'],
        adapter_profile: {
          profile_id: 'redcube-ai.visual_transition.compatibility.v1',
          profile_surface_kind: 'opl_domain_transition_adapter_profile',
          profile_role: 'compatibility_projection',
          profile_registry_role: 'registry_entry',
          profile_extension_kind: 'visual_transition',
          compatibility_surface_kind: 'visual_transition_spec',
          target_domain_id: 'rca',
          guard_owner_label: 'RCA',
          work_unit_ref_prefix: 'rca-work-unit',
          owner_route_ref_prefix: 'rca-visual-transition',
          owner_receipt_ref_prefix: 'rca-domain-owner-receipt',
          oracle_fixture_ref_prefix: 'rca-oracle-fixture',
          stage_ref_prefix: 'rca-stage',
        },
      }],
      authority_boundary: {
        domain_transition_profile_extension_is_core_ontology: false,
        refs_only: true,
        can_execute_domain_action: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_visual_ready: false,
        can_claim_exportable: false,
        can_mutate_artifacts: false,
      },
    },
    visual_transition_spec: {
      surface_kind: 'visual_transition_spec',
      spec_id: 'rca.visual-transition.v1',
      owner: 'redcube_ai',
      status: 'contract_landed_runner_integration_pending',
      transition_model: 'rca_owned_transition_table_oracle_fixture_refs_only',
      covered_family_stage_kinds: [
        'source_intake',
        'communication_strategy',
        'visual_direction',
        'artifact_creation',
        'review_and_revision',
        'package_and_handoff',
      ],
      transition_table: [{
        transition_id: 'artifact_ready_to_review',
        from_stage: 'artifact_creation',
        to_stage: 'review_and_revision',
        required_guard_refs: ['artifact_refs', 'style_manifest_ref'],
        owner_action: 'run_review_and_repair_gate',
      }],
      guard_contract: {
        guard_model: 'refs_and_typed_blockers_only',
        required_guard_classes: ['artifact_locator', 'review_state'],
        allowed_blocker_kinds: ['artifact_refs_missing', 'domain_owner_receipt_required'],
      },
      oracle_fixture: {
        fixture_id: 'rca.visual-transition.fixture.v1',
        fixture_model: 'transition_guard_expected_owner_action_refs_only',
        covered_families: ['ppt_deck'],
        expected_return_shapes: ['next_stage', 'typed_blocker', 'domain_owner_receipt_ref'],
        forbidden_oracle_fields: ['visual_verdict', 'canonical_artifact_blob'],
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
  try {
    bindManifest('redcube', manifest, env);
    const entry = findDomainManifest(runCli(['domain', 'manifests'], env), 'redcube');
    assert.equal(entry.status, 'resolved', JSON.stringify({
      status: entry.status,
      error: entry.error,
      owner_action_reason: entry.currentness_owner_action_packet?.reason,
    }, null, 2));
    const transition = entry.manifest.family_transition;
    assert.equal(transition.status, 'matrix_evaluated');
    assert.equal(transition.matrix_result.summary.transition_applied, 1);
    assert.equal(transition.authority_boundary.visual_export_verdict_owner, 'redcube_ai');
    assert.equal(transition.non_authority_flags.opl_executes_domain_action, false);

    const descriptorTransition = runCli(['agents', 'descriptor', '--domain', 'rca'], env)
      .family_agent_descriptor.family_transition;
    assert.equal(descriptorTransition.status, 'matrix_evaluated');
    assert.equal(descriptorTransition.matrix_summary.transition_applied, 1);
    assert.equal(descriptorTransition.authority_boundary.visual_export_verdict_owner, 'redcube_ai');
    assert.equal(descriptorTransition.authority_boundary.opl_can_declare_visual_ready, false);
    assert.equal(descriptorTransition.authority_boundary.opl_can_declare_exportable, false);
    assert.equal(descriptorTransition.authority_boundary.opl_can_mutate_artifacts, false);
    assert.equal(descriptorTransition.non_authority_flags.opl_executes_domain_action, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
