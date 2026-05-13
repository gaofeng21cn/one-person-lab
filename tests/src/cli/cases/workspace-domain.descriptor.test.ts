import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
  return {
    ...payload,
    [field]: value,
  };
}

function withStandardSkeleton(payload: JsonRecord, agentId: string) {
  return attachManifestSurface(payload, 'standard_domain_agent_skeleton', {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: agentId,
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    contracts: {
      descriptor_refs: ['contracts/domain-agent.json'],
      sidecar_refs: ['runtime/sidecar.ts'],
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
  });
}

function withActionCatalog(payload: JsonRecord, targetDomainId: string, owner: string, actionId: string) {
  return attachManifestSurface(payload, 'family_action_catalog', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: {
      opl_role: 'descriptor_projection_only',
      domain_truth_owner: owner,
    },
    actions: [
      {
        action_id: actionId,
        title: actionId,
        summary: `Run ${actionId}.`,
        owner,
        effect: 'mutating',
        source_command: {
          command: `${owner} ${actionId}`,
          surface_kind: 'domain_cli',
        },
        input_schema_ref: 'contracts/input.schema.json',
        output_schema_ref: 'contracts/output.schema.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        supported_surfaces: {
          cli: {
            command: `${owner} ${actionId}`,
            surface_kind: 'domain_cli',
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
  });
}

function withStageControlPlane(payload: JsonRecord, targetDomainId: string, owner: string, stageId: string, actionId: string) {
  return attachManifestSurface(payload, 'family_stage_control_plane', {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: {
      domain_truth_owner: owner,
      opl_role: 'projection_consumer_only',
    },
    stages: [
      {
        stage_id: stageId,
        stage_kind: 'creation',
        title: stageId,
        summary: `${stageId} stage descriptor.`,
        goal: `Expose ${stageId} as a family descriptor.`,
        owner,
        domain_stage_refs: [stageId],
        inputs: [],
        knowledge_refs: [
          {
            ref_kind: 'domain_memory_ref',
            ref: `${targetDomainId}.domain_memory`,
            role: 'domain_owned_memory_locator',
          },
        ],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [actionId],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        authority_boundary: {
          domain_truth_owner: owner,
          opl_role: 'projection_consumer_only',
        },
      },
    ],
    notes: [],
  });
}

function withMemoryDescriptor(payload: JsonRecord, targetDomainId: string, owner: string, memoryRefId: string, family: string) {
  return attachManifestSurface(payload, 'domain_memory_descriptor', {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: memoryRefId,
    target_domain_id: targetDomainId,
    owner,
    memory_family: family,
    memory_pack_ref: {
      ref_kind: 'human_doc',
      ref: `docs/policies/${memoryRefId}.md`,
      role: 'markdown_first_memory_policy',
    },
    stage_applicability: ['idea', 'review'],
    retrieval_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_knowledge_packet',
    },
    writeback_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_memory_closeout_packet',
    },
    receipt_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'memory_write_router_receipt',
    },
    writeback_receipt_locator_ref: {
      ref_kind: 'workspace_locator',
      ref: `portfolio/research_memory/${memoryRefId}/writeback_receipts`,
    },
    status: 'active',
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: owner,
      forbidden_opl_authority: [
        'memory_store_owner',
        'domain_truth_owner',
        'quality_verdict_owner',
        'artifact_authority',
      ],
      can_accept_memory_write: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_write_artifacts: false,
    },
  });
}

function withDescriptorSurfaces(payload: JsonRecord, options: {
  agentId: string;
  targetDomainId: string;
  owner: string;
  actionId: string;
  stageId: string;
  memoryRefId: string;
  memoryFamily: string;
}) {
  return withMemoryDescriptor(
    withStageControlPlane(
      withActionCatalog(
        withStandardSkeleton(payload, options.agentId),
        options.targetDomainId,
        options.owner,
        options.actionId,
      ),
      options.targetDomainId,
      options.owner,
      options.stageId,
      options.actionId,
    ),
    options.targetDomainId,
    options.owner,
    options.memoryRefId,
    options.memoryFamily,
  );
}

test('unified domain-agent descriptors aggregate entry, stage, action, memory, skill, and runtime refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-descriptor-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifests = {
    medautoscience: withDescriptorSurfaces(fixtures.medautoscience, {
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'stage_knowledge_packet',
      stageId: 'idea',
      memoryRefId: 'mas_publication_route_memory',
      memoryFamily: 'publication_route_memory',
    }),
    medautogrant: withDescriptorSurfaces(fixtures.medautogrant, {
      agentId: 'mag',
      targetDomainId: 'med-autogrant',
      owner: 'MedAutoGrant',
      actionId: 'grant_strategy_packet',
      stageId: 'revision',
      memoryRefId: 'mag_grant_strategy_memory',
      memoryFamily: 'grant_strategy_memory',
    }),
    redcube: withDescriptorSurfaces(fixtures.redcube, {
      agentId: 'rca',
      targetDomainId: 'redcube_ai',
      owner: 'RedCubeAI',
      actionId: 'visual_pattern_packet',
      stageId: 'artifact_creation',
      memoryRefId: 'rca_visual_pattern_memory',
      memoryFamily: 'visual_pattern_memory',
    }),
  };

  try {
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    }

    const list = runCli(['agents', 'descriptors'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_agent_descriptors.summary.total_projects_count, 3);
    assert.equal(list.family_agent_descriptors.summary.descriptor_surfaces_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.memory_descriptor_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.stage_control_plane_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.action_catalog_resolved_count, 3);

    const mas = runCli(['agents', 'descriptor', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(mas.family_agent_descriptor.surface_kind, 'opl_domain_agent_descriptor_inspection');
    assert.equal(mas.family_agent_descriptor.descriptor_surface_kind, 'opl_domain_agent_descriptor');
    assert.equal(mas.family_agent_descriptor.descriptor_status, 'descriptor_surfaces_resolved');
    assert.equal(mas.family_agent_descriptor.entry.agent_id, 'mas');
    assert.equal(mas.family_agent_descriptor.standard_domain_agent_skeleton.status, 'aligned');
    assert.equal(mas.family_agent_descriptor.family_action_catalog.action_count, 1);
    assert.equal(mas.family_agent_descriptor.family_action_catalog.parity.status, 'aligned');
    assert.equal(mas.family_agent_descriptor.family_stage_control_plane.stage_count, 1);
    assert.equal(mas.family_agent_descriptor.family_stage_control_plane.parity.status, 'aligned');
    assert.equal(mas.family_agent_descriptor.domain_memory_descriptor.memory_ref_id, 'mas_publication_route_memory');
    assert.equal(mas.family_agent_descriptor.domain_memory_descriptor.memory_family, 'publication_route_memory');
    assert.equal(
      mas.family_agent_descriptor.domain_memory_descriptor.memory_pack_ref.ref,
      'docs/policies/mas_publication_route_memory.md',
    );
    assert.equal(mas.family_agent_descriptor.skill_catalog.skill_count, 2);
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.runtime_inventory.status, 'resolved');
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.session_continuity.status, 'resolved');
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.progress_projection.status, 'resolved');
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.artifact_inventory.status, 'resolved');
    assert.equal(
      mas.family_agent_descriptor.descriptor_refs.domain_memory_descriptor.ref,
      '/domain_memory_descriptor',
    );
    assert.equal(
      mas.family_agent_descriptor.authority_boundary.descriptor_body_policy,
      'refs_and_status_only_not_memory_or_instruction_body',
    );
    assert.equal(mas.family_agent_descriptor.non_authority_flags.opl_owns_domain_memory_body, false);
    assert.equal(
      mas.family_agent_descriptor.non_authority_flags.opl_authorizes_publication_or_fundability_verdict,
      false,
    );
    assert.equal(mas.family_agent_descriptor.non_authority_flags.descriptor_embeds_longform_agent_context, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('unified domain-agent descriptor reports missing optional descriptor surfaces without failing discovery', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-descriptor-partial-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['agents', 'descriptor', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_agent_descriptor.descriptor_status, 'descriptor_surfaces_partial');
    assert.equal(inspect.family_agent_descriptor.domain_memory_descriptor.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.family_stage_control_plane.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.family_action_catalog.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.runtime_surfaces.runtime_inventory.status, 'resolved');
    assert.equal(inspect.family_agent_descriptor.non_authority_flags.opl_owns_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
