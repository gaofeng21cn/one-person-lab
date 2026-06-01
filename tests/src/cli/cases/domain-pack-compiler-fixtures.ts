import {
  buildManifestCommand,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
} from '../helpers.ts';
import { createOmaContractFixture } from './runtime-app-operator-drilldown-helpers.ts';

export type JsonRecord = Record<string, unknown>;

export function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
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

function withGrantTransitionOracle(payload: JsonRecord) {
  return attachManifestSurface(payload, 'grant_transition_oracle', {
    surface_kind: 'mag_grant_transition_oracle',
    version: 'mag-grant-transition-oracle.v1',
    oracle_id: 'mag.grant_transition.oracle.v1',
    target_domain_id: 'med-autogrant',
    owner: 'MedAutoGrant',
    state: 'domain_spec_landed_external_runner_gate',
    runner_owner: 'one-person-lab',
    runner_contract_ref: 'contracts/opl-framework/family-transition-runner-contract.json',
    transition_table_status: 'landed',
    oracle_fixture_status: 'landed',
    stage_control_plane_ref: '/product_entry_manifest/family_stage_control_plane',
    action_catalog_ref: '/product_entry_manifest/family_action_catalog',
    authority_boundary: {
      domain_truth_owner: 'MedAutoGrant',
      fundability_verdict_owner: 'MedAutoGrant',
      authoring_quality_verdict_owner: 'MedAutoGrant',
      submission_ready_export_verdict_owner: 'MedAutoGrant',
      opl_role: 'generic_transition_runner_only',
      opl_can_infer_fundability_ready: false,
      opl_can_infer_authoring_quality_ready: false,
      opl_can_infer_submission_ready_export_ready: false,
      opl_can_write_grant_truth: false,
    },
    transition_table: [
      {
        transition_id: 'grant_stage_to_owner_receipt',
        from_stage_id: 'grant_stage',
        to_stage_id: 'grant_owner_receipt',
        guard_id: 'grant_evidence_ready',
        owner_action: 'open_grant_user_loop',
        return_shape: 'domain_owner_receipt',
        receipt_requirement: 'grant_owner_receipt',
        blocked_shape: 'typed_blocker',
      },
    ],
    oracle_fixtures: [
      {
        fixture_id: 'grant_stage_ready_to_owner_receipt',
        source_stage_id: 'grant_stage',
        input_state: {
          grant_evidence_status: 'ready',
        },
        expected_transition_id: 'grant_stage_to_owner_receipt',
      },
    ],
    validation: {
      status: 'ready_for_opl_runner_ingestion',
      transition_count: 1,
      oracle_fixture_count: 1,
      missing_stage_refs: [],
      missing_action_refs: [],
      missing_fixture_transition_refs: [],
    },
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

function withGrantOraclePackCompilerReadySurfaces(payload: JsonRecord, options: {
  agentId: string;
  targetDomainId: string;
  owner: string;
  actionId: string;
  stageId: string;
  memoryRefId: string;
}) {
  return withFunctionalAudit(
    withGrantTransitionOracle(
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
    ),
    options.targetDomainId,
    options.owner,
  );
}

export function withPackCompilerReadySurfaces(payload: JsonRecord, options: {
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

export function bindFamilyManifests(env: Record<string, string>) {
  const fixtures = loadFamilyManifestFixtures();
  env.OPL_META_AGENT_REPO_DIR ??= createOmaContractFixture(
    env.OPL_STATE_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-oma-state-')),
  );
  const manifests = {
    medautoscience: withPackCompilerReadySurfaces(fixtures.medautoscience, {
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'study_packet',
      stageId: 'study_stage',
      memoryRefId: 'mas_publication_route_memory',
    }),
    medautogrant: withGrantOraclePackCompilerReadySurfaces(fixtures.medautogrant, {
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
