import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function buildStageControlPlane(targetDomainId: string, stageId: string, options: {
  owner: string;
  title: string;
  stageKind: string;
  domainStageRefs: string[];
  allowedActionRefs?: string[];
}) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner: options.owner,
    authority_boundary: {
      domain_truth_owner: options.owner,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    stages: [
      {
        stage_id: stageId,
        stage_kind: options.stageKind,
        title: options.title,
        summary: `${options.title} is projected as a descriptor-only family stage.`,
        goal: `Expose ${options.title} as a family-level stage descriptor without changing domain route truth.`,
        owner: options.owner,
        domain_stage_refs: options.domainStageRefs,
        inputs: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/progress_projection',
            role: 'read_model',
          },
        ],
        knowledge_refs: [
          {
            ref_kind: 'domain_memory_ref',
            ref: `${targetDomainId}.domain_memory`,
            role: 'domain_owned_memory_locator',
          },
        ],
        skills: [
          {
            ref_kind: 'skill_id',
            ref: options.owner,
          },
        ],
        prompt_refs: [
          {
            ref_kind: 'repo_path',
            ref: 'prompts/stage.md',
          },
        ],
        allowed_action_refs: options.allowedActionRefs ?? [],
        outputs: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/session_continuity',
            role: 'handoff',
          },
        ],
        evaluation: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/product_entry_readiness',
            role: 'descriptor_parity',
          },
        ],
        handoff: {
          next_owner: options.owner,
          resume_surface_ref: '/product_entry_manifest/session_continuity',
        },
        authority_boundary: {
          domain_truth_owner: options.owner,
          opl_role: 'projection_consumer_only',
          no_quality_verdict: true,
        },
      },
    ],
    notes: [
      'Stage descriptors are read-only family projections.',
    ],
  };
}

function withFamilyStageControlPlane(payload: JsonRecord, plane: JsonRecord) {
  const attachPlane = (manifest: JsonRecord) => ({
    ...manifest,
    family_stage_control_plane: plane,
  });

  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: attachPlane(payload.product_entry_manifest as JsonRecord),
    };
  }

  return attachPlane(payload);
}

function withStandardSkeleton(payload: JsonRecord, overrides: JsonRecord = {}) {
  const physicalSkeletonFollowThrough = {
    surface_kind: 'physical_skeleton_follow_through',
    status: 'low_risk_repo_source_follow_through_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    physical_roots: [
      { boundary_id: 'agent', anchor_ref: 'agent/README.md', status: 'present_with_repo_source_entrypoint' },
      { boundary_id: 'contracts', anchor_ref: 'contracts/README.md', status: 'present_with_runtime_program_contracts' },
      { boundary_id: 'runtime', anchor_ref: 'runtime/README.md', status: 'present_with_repo_source_entrypoint' },
      { boundary_id: 'docs', anchor_ref: 'docs/status.md', status: 'present_with_owner_docs' },
    ],
    forbidden_moves: [
      'workspace_runtime_artifacts',
      'receipt_instances',
      'memory_content_body',
    ],
  };
  const skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    contracts: {
      descriptor_refs: ['contracts/domain-agent.json'],
      sidecar_refs: ['runtime/sidecar.py'],
      quality_gate_refs: ['contracts/quality-gates.json'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
    ...overrides,
  };
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        standard_domain_agent_skeleton: skeleton,
        physical_skeleton_follow_through: physicalSkeletonFollowThrough,
      },
    };
  }
  return {
    ...payload,
    standard_domain_agent_skeleton: skeleton,
    physical_skeleton_follow_through: physicalSkeletonFollowThrough,
  };
}

test('family stage control plane is resolved from domain manifests as read-only stage descriptors', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stages-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const redcubeManifest = withFamilyStageControlPlane(
    fixtures.redcube,
    buildStageControlPlane(
      'redcube_ai',
      'artifact_creation',
      {
        owner: 'redcube_ai',
        title: 'Artifact creation',
        stageKind: 'creation',
        domainStageRefs: ['author_image_pages', 'render_html', 'author_pptx_native'],
      },
    ),
  );
  const masManifest = withFamilyStageControlPlane(
    fixtures.medautoscience,
    buildStageControlPlane(
      'med-autoscience',
      'manuscript_authoring',
      {
        owner: 'med-autoscience',
        title: 'Manuscript authoring',
        stageKind: 'creation',
        domainStageRefs: ['write'],
      },
    ),
  );
  const magManifest = withFamilyStageControlPlane(
    fixtures.medautogrant,
    buildStageControlPlane(
      'med-autogrant',
      'proposal_authoring',
      {
        owner: 'med-autogrant',
        title: 'Proposal authoring',
        stageKind: 'creation',
        domainStageRefs: ['outline', 'drafting'],
      },
    ),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(redcubeManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(magManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_stages.summary.resolved_planes_count, 3);
    assert.equal(list.family_stages.summary.stages_count, 3);
    assert.deepEqual(
      list.family_stages.stages.map((entry: { stage_id: string }) => entry.stage_id).sort(),
      ['artifact_creation', 'manuscript_authoring', 'proposal_authoring'],
    );

    const inspect = runCli(['stages', 'inspect', '--domain', 'mas', '--stage', 'manuscript_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_stage.stage.stage_id, 'manuscript_authoring');
    assert.deepEqual(inspect.family_stage.stage.domain_stage_refs, ['write']);
    assert.deepEqual(inspect.family_stage.workbench_projection.knowledge_refs, [
      {
        ref_kind: 'domain_memory_ref',
        ref: 'med-autoscience.domain_memory',
        role: 'domain_owned_memory_locator',
      },
    ]);
    assert.equal(inspect.family_stage.stage.authority_boundary.opl_role, 'projection_consumer_only');
    assert.equal(inspect.family_stage.parity.status, 'aligned');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage parity detects allowed action refs missing from the action catalog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stages-drift-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withFamilyStageControlPlane(
    {
      ...(fixtures.redcube as JsonRecord),
      family_action_catalog: {
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: 'redcube_action_catalog',
        target_domain_id: 'redcube_ai',
        owner: 'redcube_ai',
        authority_boundary: {
          opl_role: 'projection_consumer_only',
        },
        actions: [
          {
            action_id: 'start_deliverable',
            title: 'Start deliverable',
            summary: 'Start the RedCube product-entry deliverable loop.',
            owner: 'redcube_ai',
            effect: 'mutating',
            source_command: {
              command: 'redcube product invoke',
              surface_kind: 'product_entry',
            },
            input_schema_ref: 'schemas/start.input.schema.json',
            output_schema_ref: 'schemas/start.output.schema.json',
            workspace_locator_fields: ['workspace_root'],
            human_gate_ids: [],
            supported_surfaces: {
              cli: {
                command: 'redcube product invoke',
                surface_kind: 'product_entry',
              },
              mcp: null,
              skill: null,
              product_entry: null,
              openai: null,
              ai_sdk: null,
            },
          },
        ],
        notes: [],
      },
    },
    buildStageControlPlane(
      'redcube_ai',
      'artifact_creation',
      {
        owner: 'redcube_ai',
        title: 'Artifact creation',
        stageKind: 'creation',
        domainStageRefs: ['author_image_pages'],
        allowedActionRefs: ['missing_action'],
      },
    ),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['stages', 'inspect', '--domain', 'redcube', '--stage', 'artifact_creation'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_stage.parity.status, 'drift_detected');
    assert.match(inspect.family_stage.parity.issues[0], /missing_action/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('standard domain-agent skeleton inspection requires repo-source dirs and artifact locator boundaries', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agents-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const alignedManifest = withStandardSkeleton(fixtures.medautoscience);
  const driftManifest = withStandardSkeleton(fixtures.redcube, {
    agent_id: 'rca',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs', 'artifacts'],
      forbidden_dirs: [],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: true,
      artifact_roots_are_locators: false,
      workspace_artifact_locator_refs: [],
      runtime_artifact_locator_refs: [],
    },
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
      buildManifestCommand(alignedManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(driftManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['agents', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const inspect = runCli(['agents', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const drift = runCli(['agents', 'inspect', '--domain', 'redcube'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(list.family_agents.summary.aligned_count, 1);
    assert.equal(list.family_agents.summary.drift_detected_count, 1);
    assert.equal(inspect.family_agent.skeleton_status, 'aligned');
    assert.deepEqual(inspect.family_agent.required_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
    assert.equal(inspect.family_agent.artifact_boundary.repo_contains_real_artifacts, false);
    assert.equal(drift.family_agent.skeleton_status, 'drift_detected');
    assert.ok(drift.family_agent.issues.includes('repo_source_skeleton_must_not_include_real_artifacts_dir'));
    assert.ok(drift.family_agent.issues.includes('domain_repo_must_not_contain_real_artifacts'));
    assert.ok(drift.family_agent.issues.includes('artifact_roots_must_be_locators'));
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain-agent skeleton inspection accepts only the canonical MAS MAG RCA surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-canonical-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = {
    ...(fixtures.medautoscience as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      skeleton_id: 'mas.standard_domain_agent_skeleton.v1',
      target_domain_id: 'med-autoscience',
      mapping_mode: 'contract_only_no_physical_artifact_move',
      repo_tracks_real_workspace_artifacts: false,
      physical_skeleton_layout_audit: {
        surface_kind: 'standard_domain_agent_physical_skeleton_layout_audit',
        status: 'slot_audit_landed',
        source_refs: [
          'agent/stages',
          'contracts/runtime/sidecar',
          'runtime/sidecar.py',
          'docs/program/stage_surface_standardization_program.md',
        ],
      },
      skeleton: {
        'agent/stages': ['agent/stages/stage_route_contract.yaml'],
        'agent/prompts': ['MAS app skill command contracts'],
        'agent/skills': ['medautosci sidecar export --format json'],
        'agent/knowledge': ['stage_knowledge_packet'],
        'agent/quality_gates': ['publication_eval/latest.json'],
        'contracts/runtime/sidecar': ['mas_family_sidecar_export'],
        'contracts/runtime/projection_builders': ['product-entry manifest provider-ready contract'],
        'contracts/runtime/lifecycle_adapters': ['workspace_runtime_artifact_root_locator'],
      },
    },
    workspace_runtime_artifact_root_locator: {
      surface_kind: 'workspace_runtime_artifact_root_locator',
      repo_root_tracks_real_artifacts: false,
      locators: {
        study_artifact_root: 'studies/<study_id>/artifacts',
        dispatch_receipts: 'artifacts/runtime/opl_family_sidecar/dispatch_receipts',
      },
    },
  };
  const magManifest = {
    ...(fixtures.medautogrant.product_entry_manifest as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      skeleton_id: 'mag.standard_domain_agent_skeleton.v1',
      repo_source_boundary: {
        agent: { source_refs: ['src/med_autogrant/domain_entry.py'] },
        contracts: { source_refs: ['contracts/runtime-program/current-program.json'] },
        runtime: { source_refs: ['src/med_autogrant/product_entry_parts/sidecar.py'] },
        docs: { source_refs: ['docs/status.md'] },
      },
      artifact_locator_ref: '/product_entry_manifest/artifact_locator_contract',
      controlled_stage_attempt_ref: '/product_entry_manifest/controlled_stage_attempt_projection',
      artifact_locator_contract: {
        surface_kind: 'domain_artifact_locator_contract',
        locator_model: 'workspace_runtime_artifact_root_refs_only',
        repo_tracks_artifact_blobs: false,
      },
    },
    physical_skeleton_follow_through: {
      surface_kind: 'mag_physical_skeleton_follow_through',
      state: 'minimum_repo_source_anchors_landed',
      roots: {
        agent: { anchor_ref: 'agent/README.md', state: 'physical_root_present' },
        contracts: { anchor_ref: 'contracts/README.md', state: 'physical_root_present' },
        runtime: { anchor_ref: 'runtime/README.md', state: 'physical_root_present' },
        docs: { anchor_ref: 'docs/status.md', state: 'physical_root_present' },
      },
      root_status: [
        { root: 'agent', anchor_ref: 'agent/README.md', exists: true },
        { root: 'contracts', anchor_ref: 'contracts/README.md', exists: true },
        { root: 'runtime', anchor_ref: 'runtime/README.md', exists: true },
        { root: 'docs', anchor_ref: 'docs/status.md', exists: true },
      ],
      moves_workspace_artifacts: false,
      moves_runtime_receipt_instances: false,
      moves_memory_body: false,
    },
  };
  const rcaManifest = {
    ...(fixtures.redcube as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      adapter_id: 'rca.domain-agent.skeleton.adapter.v1',
      repo_source_boundary: {
        allowed_roots: [
          { boundary_id: 'agent', repo_refs: ['packages/redcube-gateway/src/actions/family-action-catalog.ts'] },
          { boundary_id: 'contracts', repo_refs: ['contracts/runtime-program/current-program.json'] },
          { boundary_id: 'runtime', repo_refs: ['packages/redcube-gateway/src/actions/product-sidecar.ts'] },
          { boundary_id: 'docs', repo_refs: ['docs/status.md'] },
        ],
        repo_tracks_runtime_artifact_blobs: false,
        repo_tracks_receipt_instances: false,
      },
      artifact_locator_contract: {
        surface_kind: 'artifact_locator_contract',
        locator_model: 'workspace_runtime_artifact_root_refs_only',
        repo_source_boundary: {
          repo_tracks_visual_or_export_artifact_blobs: false,
        },
      },
    },
    physical_skeleton_follow_through: {
      surface_kind: 'physical_skeleton_follow_through',
      status: 'low_risk_repo_source_follow_through_landed',
      physical_roots: [
        { boundary_id: 'agent', anchor_ref: 'agent/README.md', status: 'present_with_repo_source_entrypoint' },
        { boundary_id: 'contracts', anchor_ref: 'contracts/runtime-program/current-program.json', status: 'present_with_runtime_program_contracts' },
        { boundary_id: 'runtime', anchor_ref: 'packages/redcube-gateway/src/actions/product-sidecar.ts', status: 'present_with_repo_source_entrypoint' },
        { boundary_id: 'docs', anchor_ref: 'docs/status.md', status: 'present_with_owner_docs' },
      ],
      forbidden_moves: [
        'workspace_runtime_artifacts',
        'receipt_instances',
        'memory_content_body',
        'png_pptx_pdf_exports',
      ],
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
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand({ product_entry_manifest: magManifest }),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(rcaManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['agents', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const mas = runCli(['agents', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const mag = runCli(['agents', 'inspect', '--domain', 'mag'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const rca = runCli(['agents', 'inspect', '--domain', 'rca'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(list.family_agents.summary.aligned_count, 3);
    assert.equal(list.family_agents.summary.missing_count, 0);
    assert.equal(list.family_agents.summary.descriptor_aligned_count, 3);
    assert.equal(list.family_agents.summary.physical_skeleton_audit_pending_count, 0);
    assert.equal(list.family_agents.summary.physical_skeleton_evidence_observed_count, 3);
    assert.equal(list.family_agents.summary.production_closure_gap_count, 15);
    assert.equal(mas.family_agent.skeleton_status, 'aligned');
    assert.equal(mas.family_agent.skeleton_source_field, 'standard_domain_agent_skeleton');
    assert.equal(mas.family_agent.descriptor_readiness.status, 'descriptor_aligned');
    assert.equal(mas.family_agent.physical_skeleton_layout_audit.status, 'repo_source_anchor_evidence_observed');
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.required_dirs, ['agent', 'contracts', 'runtime', 'docs']);
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.missing_declared_dirs, []);
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.forbidden_declared_dirs, []);
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.evidence_refs, [
      'agent/stages',
      'contracts/runtime/sidecar',
      'runtime/sidecar.py',
      'docs/program/stage_surface_standardization_program.md',
    ]);
    assert.equal(
      mas.family_agent.production_closure_gaps.find((gap: { gap_id: string }) =>
        gap.gap_id === 'physical_repo_skeleton_reorganization'
      ).projection_status,
      'evidence_refs_observed',
    );
    assert.equal(mas.family_agent.physical_skeleton_layout_audit.authority_boundary.opl_role, 'read_only_layout_audit');
    assert.deepEqual(
      mas.family_agent.production_closure_gaps.map((gap: { gap_id: string }) => gap.gap_id),
      [
        'external_temporal_production_residency_proof',
        'provider_hosted_domain_soak',
        'workspace_runtime_memory_apply_receipt',
        'physical_repo_skeleton_reorganization',
        'legacy_surface_physical_retirement',
      ],
    );
    assert.equal(mag.family_agent.skeleton_source_field, 'standard_domain_agent_skeleton');
    assert.equal(rca.family_agent.skeleton_source_field, 'standard_domain_agent_skeleton');
    assert.deepEqual(rca.family_agent.declared_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
    assert.deepEqual(rca.family_agent.physical_skeleton_layout_audit.evidence_refs, [
      'agent/README.md',
      'contracts/runtime-program/current-program.json',
      'packages/redcube-gateway/src/actions/product-sidecar.ts',
      'docs/status.md',
    ]);
    assert.equal(rca.family_agent.artifact_boundary.artifact_roots_are_locators, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain-agent skeleton remains drifted without an artifact locator surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-missing-locator-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = {
    ...(fixtures.redcube as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      adapter_id: 'rca.domain-agent.skeleton.adapter.v1',
      repo_source_boundary: {
        allowed_roots: [
          { boundary_id: 'agent' },
          { boundary_id: 'contracts' },
          { boundary_id: 'runtime' },
          { boundary_id: 'docs' },
        ],
        repo_tracks_runtime_artifact_blobs: false,
        repo_tracks_receipt_instances: false,
      },
    },
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
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['agents', 'inspect', '--domain', 'rca'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_agent.skeleton_status, 'drift_detected');
    assert.ok(inspect.family_agent.issues.includes('artifact_locator_surface_required'));
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
