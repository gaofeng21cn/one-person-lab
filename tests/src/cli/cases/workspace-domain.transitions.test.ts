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
  test,
} from '../helpers.ts';

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
  refresh_policy: 'rebuild_study_state_matrix_or_sidecar_export_before_opl_runner',
  authority_boundary: {
    runner_owner: 'OPL Framework',
    domain_transition_owner: 'MedAutoScience',
    can_write_domain_truth: false,
    opl_interprets_domain_quality: false,
    opl_executes_domain_action: false,
  },
  locator_refs: {
    study_state_matrix_spec: '/study_state_matrix/domain_transition_table/family_transition_spec',
    sidecar_export_spec: '/mas_family_sidecar_export/family_transition_spec',
    product_entry_manifest_descriptor: '/product_entry_manifest/family_transition_spec_descriptor',
  },
  source_refs: {
    domain_transition_table: '/study_state_matrix/domain_transition_table',
    sidecar_export: '/mas_family_sidecar_export/domain_transition_table',
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
    assert.equal(medautoscience.manifest.family_transition.status, 'descriptor_only');
    assert.equal(medautoscience.manifest.family_transition.refresh_required, true);
    assert.equal(medautoscience.manifest.family_transition.matrix_result, null);
    assert.equal(
      medautoscience.manifest.family_transition.locator_refs.study_state_matrix_spec,
      '/study_state_matrix/domain_transition_table/family_transition_spec',
    );
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

    const list = runCli(['agents', 'descriptors'], env);
    assert.equal(list.family_agent_descriptors.summary.transition_matrix_evaluated_count, 1);
    assert.equal(list.family_agent_descriptors.summary.transition_descriptor_only_count, 0);
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
    assert.equal(
      transition.locator_refs.study_state_matrix_spec,
      '/study_state_matrix/domain_transition_table/family_transition_spec',
    );
    assert.equal(inspect.family_agent_descriptor.descriptor_refs.family_transition.status, 'descriptor_only');
    assert.equal(transition.non_authority_flags.opl_writes_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
