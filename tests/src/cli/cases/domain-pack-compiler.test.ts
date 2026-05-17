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
      sidecar_refs: ['contracts/generated_surface_handoff.json'],
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
    physical_skeleton_follow_through: {
      surface_kind: 'physical_skeleton_follow_through',
      status: 'low_risk_repo_source_follow_through_landed',
      physical_roots: [
        { boundary_id: 'agent', anchor_ref: 'agent/README.md', status: 'present_with_repo_source_entrypoint' },
        { boundary_id: 'contracts', anchor_ref: 'contracts/README.md', status: 'present_with_runtime_program_contracts' },
        { boundary_id: 'runtime', anchor_ref: 'runtime/README.md', status: 'present_with_repo_source_entrypoint' },
        { boundary_id: 'docs', anchor_ref: 'docs/status.md', status: 'present_with_owner_docs' },
      ],
      forbidden_moves: ['workspace_runtime_artifacts', 'receipt_instances', 'memory_content_body'],
      direct_skill_parity_refs: [`proof:${agentId}:direct-skill-parity`],
      opl_hosted_parity_refs: [`proof:${agentId}:opl-hosted-parity`],
      replacement_parity_refs: [`proof:${agentId}:replacement-parity`],
      provenance_refs: [`docs/history/runtime-substrate/${agentId}-legacy-tombstone.md`],
      legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
      legacy_active_path_residue: [],
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
          mcp: { tool_name: actionId, surface_kind: 'domain_mcp' },
          skill: { command_contract_id: actionId, surface_kind: 'domain_skill' },
          product_entry: {
            action_key: actionId,
            command: `${owner} product ${actionId}`,
            surface_kind: 'domain_product_entry',
          },
          openai: { tool_name: actionId },
          ai_sdk: { tool_name: actionId },
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
        knowledge_refs: [{ ref_kind: 'domain_memory_ref', ref: `${targetDomainId}.domain_memory` }],
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

function withMemoryDescriptor(payload: JsonRecord, targetDomainId: string, owner: string, memoryRefId: string) {
  return attachManifestSurface(payload, 'domain_memory_descriptor', {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: memoryRefId,
    target_domain_id: targetDomainId,
    owner,
    memory_family: `${targetDomainId}.memory`,
    memory_pack_ref: {
      ref_kind: 'human_doc',
      ref: `docs/policies/${memoryRefId}.md`,
      role: 'markdown_first_memory_policy',
    },
    stage_applicability: ['intake', 'review'],
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
      ref: `portfolio/domain_memory/${memoryRefId}/writeback_receipts`,
    },
    migration_readiness: { status: 'ready_for_refs_only_projection' },
    freshness: { status: 'fresh' },
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

function withTransitionDescriptor(payload: JsonRecord, targetDomainId: string, owner: string) {
  return attachManifestSurface(payload, 'family_transition_spec_descriptor', {
    surface_kind: 'family_transition_spec_descriptor',
    descriptor_id: `${targetDomainId}.transition.descriptor`,
    target_domain_id: targetDomainId,
    owner,
    spec_ref: `contracts/${targetDomainId}.transition.json`,
    matrix_cases_ref: `contracts/${targetDomainId}.transition-cases.json`,
  });
}

function withFunctionalAudit(payload: JsonRecord, targetDomainId: string, owner: string) {
  return attachManifestSurface(payload, 'functional_privatization_audit', {
    surface_kind: 'functional_privatization_audit',
    target_domain_id: targetDomainId,
    modules: [
      {
        module_id: `${targetDomainId}_stage_policy_pack`,
        classification: 'declarative_pack',
        owner,
        code_paths: ['agent/stages', 'agent/policies'],
        active_callers: ['OPL pack compiler input'],
        active_caller_status: 'declarative_pack_active',
        migration_action: 'declare domain pack inputs for OPL generated surfaces',
      },
      {
        module_id: `${targetDomainId}_authority_verdict`,
        classification: 'minimal_authority_function',
        owner,
        code_paths: ['runtime/authority_functions/verdict.ts'],
        active_callers: ['domain owner route'],
        active_caller_status: 'domain_authority_active',
        migration_action: 'retain_as_minimal_authority_function',
        cannot_absorb_reason: 'OPL cannot authorize domain quality, export, or truth verdicts.',
      },
    ],
  });
}

function withPackCompilerReadySurfaces(payload: JsonRecord, options: {
  agentId: string;
  targetDomainId: string;
  owner: string;
  actionId: string;
  stageId: string;
  memoryRefId: string;
}) {
  return withFunctionalAudit(
    withTransitionDescriptor(
      withMemoryDescriptor(
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
      ),
      options.targetDomainId,
      options.owner,
    ),
    options.targetDomainId,
    options.owner,
  );
}

function bindFamilyManifests(env: Record<string, string>) {
  const fixtures = loadFamilyManifestFixtures();
  const manifests = {
    medautoscience: withPackCompilerReadySurfaces(fixtures.medautoscience, {
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'study_packet',
      stageId: 'study_stage',
      memoryRefId: 'mas_publication_route_memory',
    }),
    medautogrant: withPackCompilerReadySurfaces(fixtures.medautogrant, {
      agentId: 'mag',
      targetDomainId: 'med-autogrant',
      owner: 'MedAutoGrant',
      actionId: 'grant_packet',
      stageId: 'grant_stage',
      memoryRefId: 'mag_grant_strategy_memory',
    }),
    redcube: withPackCompilerReadySurfaces(fixtures.redcube, {
      agentId: 'rca',
      targetDomainId: 'redcube_ai',
      owner: 'RedCubeAI',
      actionId: 'visual_packet',
      stageId: 'visual_stage',
      memoryRefId: 'rca_visual_pattern_memory',
    }),
  };

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
    ], env);
  }
}

test('domain pack compiler projects OPL-owned generated surfaces for admitted domain packs', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  bindFamilyManifests(env);

  const list = runCli(['agents', 'pack-compiler'], env);
  assert.equal(list.domain_pack_compiler.surface_kind, 'opl_domain_pack_compiler_index');
  assert.equal(list.domain_pack_compiler.owner, 'one-person-lab');
  assert.equal(list.domain_pack_compiler.summary.total_domain_count, 3);
  assert.equal(list.domain_pack_compiler.summary.ready_domain_count, 3);
  assert.equal(list.domain_pack_compiler.summary.blocked_domain_count, 0);
  assert.equal(list.domain_pack_compiler.summary.generated_surface_count, 21);
  assert.equal(list.domain_pack_compiler.summary.generated_surface_ready_count, 21);
  assert.equal(list.domain_pack_compiler.summary.domain_generated_surface_owner_claim_count, 0);
  assert.equal(list.domain_pack_compiler.authority_boundary.opl_owns_generated_surfaces, true);
  assert.equal(list.domain_pack_compiler.authority_boundary.domain_repo_can_own_generated_surface, false);
  assert.equal(list.domain_pack_compiler.authority_boundary.opl_can_write_domain_truth, false);

  const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
  assert.equal(mas.domain_pack_compiler.surface_kind, 'opl_domain_pack_compiler_inspection');
  assert.equal(mas.domain_pack_compiler.compiler_status, 'ready');
  assert.deepEqual(mas.domain_pack_compiler.blocker_reasons, []);
  assert.equal(mas.domain_pack_compiler.pack_compiler_input_projection.generated_surface_owner, 'one-person-lab');
  assert.equal(mas.domain_pack_compiler.pack_compiler_input_projection.domain_repo_can_own_generated_surface, false);
  assert.equal(
    mas.domain_pack_compiler.generated_surface_handoff.generated_surfaces.some(
      (surface: { surface_id: string; status: string }) =>
        surface.surface_id === 'sidecar_export_dispatch' && surface.status === 'ready_from_descriptor',
    ),
    true,
  );
  assert.equal(
    mas.domain_pack_compiler.pack_compiler_input_projection.minimal_authority_function_refs[0].cannot_absorb_reason,
    'OPL cannot authorize domain quality, export, or truth verdicts.',
  );
  assert.equal(mas.domain_pack_compiler.authority_boundary.opl_can_authorize_quality_or_export, false);
  assert.equal(mas.domain_pack_compiler.authority_boundary.provider_completion_is_domain_ready, false);
});

test('domain pack compiler blocks generated handoff when a domain still declares generic residue', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-blocked-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const blockedMas = attachManifestSurface(
    withPackCompilerReadySurfaces(fixtures.medautoscience, {
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'study_packet',
      stageId: 'study_stage',
      memoryRefId: 'mas_publication_route_memory',
    }),
    'functional_privatization_audit',
    {
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'med-autoscience',
      modules: [
        {
          module_id: 'repo_owned_generic_scheduler',
          classification: 'generic_scheduler_or_daemon',
          owner: 'med-autoscience',
          code_paths: ['src/med_autoscience/controllers/supervision_scheduler.py'],
          active_callers: ['default runtime'],
          active_caller_status: 'active_default_caller',
          migration_action: 'must move scheduler owner to OPL',
        },
      ],
    },
  );

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(blockedMas),
  ], env);

  const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
  assert.equal(mas.domain_pack_compiler.compiler_status, 'blocked');
  assert.equal(
    mas.domain_pack_compiler.blocker_reasons.includes(
      'functional_privatization_audit_has_generic_residue_or_blocker',
    ),
    true,
  );
  assert.equal(
    mas.domain_pack_compiler.pack_compiler_input_projection.functional_privatization_summary
      .active_private_generic_residue_count,
    1,
  );
});
