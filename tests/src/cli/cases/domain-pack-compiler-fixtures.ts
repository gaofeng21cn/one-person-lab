import {
  buildManifestCommand,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
} from '../helpers.ts';
import { STANDARD_AGENT_PACK_ABI } from '../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';
import { buildReadyAgentRepo } from './agents-conformance-fixtures.ts';

export type JsonRecord = Record<string, unknown>;

type FamilyDefaultContractRepoSpec = {
  repoDirectory: string;
  agentId: string;
  targetDomainId: string;
  owner: string;
  actionId: string;
  stageId: string;
  memoryRefId: string;
};

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

function withActionCatalog(
  payload: JsonRecord,
  targetDomainId: string,
  owner: string,
  actionId: string,
  stageId: string,
) {
  return attachManifestSurface(payload, 'family_action_catalog', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      domain_truth_owner: owner,
      write_policy: 'no_domain_truth_writes',
    },
    actions: [
      {
        action_id: actionId,
        title: actionId,
        summary: `Run ${actionId}.`,
        owner,
        effect: 'mutating',
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'contracts/input.schema.json',
        output_schema_ref: 'contracts/output.schema.json',
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        stage_route: {
          entry_stage_ref: stageId,
          required_stage_refs: [stageId],
          optional_stage_refs: [],
          terminal_stage_refs: [stageId],
          route_policy: 'ai_selected_progress_route',
        },
        supported_surfaces: {
          cli: {
            surface_kind: 'domain_cli',
          },
          mcp: {
            tool_name: actionId,
            surface_kind: 'domain_mcp_descriptor',
            descriptor_only: true,
            public_runtime: false,
          },
          skill: { command_contract_id: actionId, surface_kind: 'domain_skill_contract' },
          product_entry: {
            action_key: actionId,
            surface_kind: 'domain_product_entry',
          },
          openai: { tool_name: actionId },
          ai_sdk: { tool_name: actionId },
        },
        authority_boundary: {
          opl_can_write_domain_truth: false,
        },
      },
    ],
    notes: [],
  });
}

function withStageControlPlane(payload: JsonRecord, targetDomainId: string, owner: string, stageId: string, actionId: string) {
  const ref = {
    ref_kind: 'generated_surface',
    ref: 'opl-generated:family_stage_control_plane',
    source_ref: 'agent/stages/manifest.json',
    label: `${owner} ${stageId} generated stage plane for ${actionId}`,
  };
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    const {
      family_stage_control_plane: _retiredInlinePlane,
      ...manifest
    } = payload.product_entry_manifest as JsonRecord;
    return {
      ...payload,
      product_entry_manifest: {
        ...manifest,
        family_stage_control_plane_ref: ref,
      },
    };
  }
  const { family_stage_control_plane: _retiredInlinePlane, ...manifest } = payload;
  return { ...manifest, family_stage_control_plane_ref: ref };
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

function writeJson(filePath: string, value: JsonRecord) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeManifestContractOverrides(repoDir: string, payload: JsonRecord) {
  const surface = payload.product_entry_manifest
    && typeof payload.product_entry_manifest === 'object'
    && !Array.isArray(payload.product_entry_manifest)
    ? payload.product_entry_manifest as JsonRecord
    : payload;
  for (const [field, file] of [
    ['functional_privatization_audit', 'functional_privatization_audit.json'],
    ['generated_surface_handoff', 'generated_surface_handoff.json'],
  ] as const) {
    const value = surface[field];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      writeJson(path.join(repoDir, 'contracts', file), value as JsonRecord);
    }
  }
}

function writeMagProductionAcceptanceFixture(contractsDir: string) {
  writeJson(path.join(contractsDir, 'production_acceptance', 'mag-production-acceptance.json'), {
    surface_kind: 'mag_production_acceptance_evidence.v1',
    domain_id: 'med-autogrant',
    refs: {
      grant_owner_receipt_refs: [
        'receipt:mag/production-live-acceptance/fixture',
      ],
      owner_receipt_refs: [
        'receipt:mag/production-live-acceptance/fixture',
      ],
      acceptance_receipt_refs: [
        'receipt-projection:mag/production-live-acceptance-owner-receipt/fixture',
      ],
      typed_blocker_refs: [
        'typed-blocker:mag/production-live-acceptance/followup-required',
      ],
    },
    closure_evidence: {
      owner_receipt_ref: 'receipt:mag/production-live-acceptance/fixture',
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'typed_blocker_ref',
        'no_regression_evidence_ref',
      ],
    },
    external_evidence_receipt_ledger: {
      ledger_ref: 'contracts/external_evidence/mag-evidence-receipt-ledger.json',
    },
    grant_receipt_chain: {
      production_like_grant_receipt_chain_present: true,
      chain_status: 'closed_by_mag_domain_owner_live_acceptance_receipt_scaleout',
    },
    authority_boundary: {
      opl_can_authorize_grant_domain_ready: false,
      provider_completion_equals_domain_ready: false,
    },
  });
}

function writeRcaOwnerChainEvidenceFixture(contractsDir: string) {
  writeJson(path.join(contractsDir, 'owner_chain_live_progress_evidence.json'), {
    surface_kind: 'rca_owner_chain_live_progress_evidence',
    domain_id: 'redcube-ai',
    live_visual_owner_chain_canary: {
      observed_owner_receipt_refs: [
        'rca-owner-receipt:review-export:ppt_deck:visual_director_review:fixture',
      ],
      observed_review_export_receipt_refs: [
        'rca-review-export:ppt_deck:visual_director_review:fixture',
      ],
      observed_typed_blocker_refs: [],
    },
    rca_owned_owner_action_canary: {
      observed_owner_receipt_ref:
        'rca-owner-receipt:visual-stage:owner-chain-canary-domain-owner-fixture',
      observed_no_regression_evidence_ref:
        'rca-no-regression:visual-stage:owner-chain-canary-no-regression-fixture',
      observed_typed_blocker_ref:
        'rca-typed-blocker:workspace_receipt_proof_missing_required_refs:fixture',
    },
    false_authority_flags: {
      declares_domain_ready: false,
      declares_production_ready: false,
      writes_visual_truth: false,
      writes_artifact_body: false,
      writes_memory_body: false,
    },
  });
}

function generatedSurfaceHandoff(targetDomainId: string) {
  return {
    surface_kind: 'opl_generated_surface_handoff',
    schema_version: 1,
    domain_id: targetDomainId,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    generated_surfaces: [
      'cli',
      'mcp',
      'skill',
      'product_entry_manifest',
      'domain_handler',
      'status_read_model',
      'workbench_drilldown',
    ].map((surfaceId) => ({
      surface_id: surfaceId,
      owner: 'one-person-lab',
      status: 'descriptor_source_available',
    })),
    handoff_surfaces: [
      {
        surface_id: 'cli',
        current_paths: ['runtime/authority_functions/command.ts'],
        current_role: 'domain_handler_target',
        target_role: 'domain_handler_target',
      },
      {
        surface_id: 'mcp',
        current_paths: ['runtime/authority_functions/tool.ts'],
        current_role: 'domain_handler_target',
        target_role: 'domain_handler_target',
      },
      {
        surface_id: 'skill',
        current_paths: ['agent/skills/domain.md'],
        current_role: 'declarative_pack',
        target_role: 'opl_generated_skill_surface',
      },
      {
        surface_id: 'product_entry_manifest',
        current_paths: ['agent/product-entry.json'],
        current_role: 'declarative_pack',
        target_role: 'opl_generated_product_entry_surface',
      },
      {
        surface_id: 'domain_handler',
        current_paths: ['runtime/authority_functions/domain-handler.ts'],
        current_role: 'domain_handler_target',
        target_role: 'domain_handler_target',
      },
      {
        surface_id: 'status_read_model',
        current_paths: ['agent/status.json'],
        current_role: 'refs_only_domain_adapter_target',
        target_role: 'opl_generated_status_read_model_surface',
      },
      {
        surface_id: 'workbench_drilldown',
        current_paths: ['agent/workbench.json'],
        current_role: 'refs_only_domain_adapter_target',
        target_role: 'opl_hosted_workbench_shell_consuming_domain_refs',
      },
    ],
  };
}

function writeFamilyDefaultContractRepo(workspaceRoot: string, spec: FamilyDefaultContractRepoSpec) {
  const repoDir = path.join(workspaceRoot, spec.repoDirectory);
  fs.renameSync(buildReadyAgentRepo(), repoDir);
  const contractsDir = path.join(repoDir, 'contracts');
  const manifest = withPackCompilerReadySurfaces({}, {
    agentId: spec.agentId,
    targetDomainId: spec.targetDomainId,
    owner: spec.owner,
    actionId: spec.actionId,
    stageId: spec.stageId,
    memoryRefId: spec.memoryRefId,
  }) as JsonRecord;

  writeJson(path.join(contractsDir, 'domain_descriptor.json'), {
    surface_kind: 'domain_agent_descriptor',
    schema_version: 1,
    domain_id: spec.targetDomainId,
    domain_label: spec.owner,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });
  writeJson(path.join(contractsDir, 'action_catalog.json'), manifest.family_action_catalog as JsonRecord);
  writeJson(path.join(contractsDir, 'input.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['workspace_root'],
    properties: { workspace_root: { type: 'string' } },
  });
  writeJson(path.join(contractsDir, 'memory_descriptor.json'), manifest.domain_memory_descriptor as JsonRecord);
  writeJson(path.join(contractsDir, 'functional_privatization_audit.json'), manifest.functional_privatization_audit as JsonRecord);
  writeJson(path.join(contractsDir, 'generated_surface_handoff.json'), generatedSurfaceHandoff(spec.targetDomainId));
  const packCompilerInput = JSON.parse(
    fs.readFileSync(path.join(contractsDir, 'pack_compiler_input.json'), 'utf8'),
  ) as JsonRecord;
  writeJson(path.join(contractsDir, 'pack_compiler_input.json'), {
    ...packCompilerInput,
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: spec.targetDomainId,
    canonical_agent_id: spec.agentId,
    domain_repo_runtime_role: 'domain_handler_target_and_authority_functions',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    standard_agent_pack_abi: STANDARD_AGENT_PACK_ABI,
  });
  const stageManifestRef = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestRef, 'utf8')) as JsonRecord;
  stageManifest.target_domain_id = spec.targetDomainId;
  stageManifest.owner = spec.targetDomainId;
  (stageManifest.authority_boundary as JsonRecord).domain_truth_owner = spec.targetDomainId;
  const stage = (stageManifest.stages as JsonRecord[])[0]!;
  stage.stage_id = spec.stageId;
  stage.title = spec.stageId;
  stage.summary = `${spec.stageId} stage descriptor.`;
  stage.goal = `Expose ${spec.stageId} as a family descriptor.`;
  stage.allowed_action_refs = [spec.actionId];
  stage.next_stage_refs = [];
  writeJson(stageManifestRef, stageManifest);
  if (spec.targetDomainId === 'med-autogrant') {
    writeMagProductionAcceptanceFixture(contractsDir);
  }
  if (spec.targetDomainId === 'redcube_ai') {
    writeRcaOwnerChainEvidenceFixture(contractsDir);
  }
  if (spec.targetDomainId === 'opl-meta-agent') {
    writeJson(path.join(contractsDir, 'target_agent_owner_chain_evidence.json'), {
      surface_kind: 'opl_meta_agent_target_agent_owner_chain_evidence',
      domain_id: 'opl-meta-agent',
      evidence_scope: 'opl_hosted_canary_not_target_repo_mutation',
      evidence_ref: 'repo-tracked-contract:contracts/target_agent_owner_chain_evidence.json',
      target_agent_ready_claimed: false,
      production_ready_claimed: false,
      stage_replay_human_gate_blocker_closure: {
        closure_status: 'blocked_by_domain_owned_typed_blocker_ref',
        typed_blocker_refs: [
          'oma-typed-blocker:stage-replay-human-gate:stage-decomposition:oma_baseline_owner_review/baseline-owner-review-receipt-pending',
        ],
        no_regression_refs: [
          'no-regression-ref:opl-meta-agent/stage-replay-human-gate/oma_baseline_owner_review/no-target-repo-mutation',
        ],
        success_claimed: false,
        human_gate_approval_claimed: false,
        target_agent_ready_claimed: false,
        production_ready_claimed: false,
      },
      authority_boundary: {
        refs_only: true,
        can_write_target_domain_truth: false,
        can_write_target_domain_memory_body: false,
        can_mutate_target_domain_artifact_body: false,
        can_authorize_target_domain_quality_or_export: false,
        can_claim_target_domain_ready: false,
        can_claim_production_ready: false,
        can_write_target_owner_receipt_body: false,
      },
    });
  }
  return repoDir;
}

export function createFamilyDefaultContractWorkspace() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-contracts-'));
  const specs: FamilyDefaultContractRepoSpec[] = [
    {
      repoDirectory: 'med-autoscience',
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'study_packet',
      stageId: 'study_stage',
      memoryRefId: 'mas_publication_route_memory',
    },
    {
      repoDirectory: 'med-autogrant',
      agentId: 'mag',
      targetDomainId: 'med-autogrant',
      owner: 'MedAutoGrant',
      actionId: 'grant_packet',
      stageId: 'grant_stage',
      memoryRefId: 'mag_grant_strategy_memory',
    },
    {
      repoDirectory: 'redcube-ai',
      agentId: 'rca',
      targetDomainId: 'redcube_ai',
      owner: 'RedCubeAI',
      actionId: 'visual_packet',
      stageId: 'visual_stage',
      memoryRefId: 'rca_visual_pattern_memory',
    },
    {
      repoDirectory: 'opl-meta-agent',
      agentId: 'oma',
      targetDomainId: 'opl-meta-agent',
      owner: 'OPLMetaAgent',
      actionId: 'agent_packet',
      stageId: 'agent_stage',
      memoryRefId: 'oma_agent_improvement_memory',
    },
  ];
  for (const spec of specs) {
    writeFamilyDefaultContractRepo(workspaceRoot, spec);
  }
  return workspaceRoot;
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
            options.stageId,
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

export function bindFamilyManifests(
  env: Record<string, string>,
  options: { includeOma?: boolean } = {},
) {
  const fixtures = loadFamilyManifestFixtures();
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  if (options.includeOma !== false) {
    env.OPL_META_AGENT_REPO_DIR ??= path.join(workspaceRoot, 'opl-meta-agent');
  }
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
  const repoDirectories: Record<string, string> = {
    medautoscience: 'med-autoscience',
    medautogrant: 'med-autogrant',
    redcube: 'redcube-ai',
  };

  for (const [project, manifest] of Object.entries(manifests)) {
    runCli([
      'workspace',
      'bind',
      '--project',
      project,
      '--path',
      path.join(workspaceRoot, repoDirectories[project]!),
      '--manifest-command',
      buildManifestCommand(manifest),
    ], env);
  }
  return workspaceRoot;
}
