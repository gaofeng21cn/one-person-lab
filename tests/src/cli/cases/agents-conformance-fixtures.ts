import { fs, os, parseJsonText, path, runCli } from '../helpers.ts';
import {
  buildStandardDomainAgentScaffold,
  compileStandardAgentStageManifest,
} from '../../../../src/modules/pack/index.ts';
import { FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES } from '../../../../src/modules/pack/standard-domain-agent-scaffold-constants.ts';

const OPL_DOMAIN_READONLY_AUTHORITY = {
  opl_can_write_domain_truth: false,
  opl_can_write_memory_body: false,
  opl_can_authorize_quality_or_export: false,
};

const OPL_ARTIFACT_READONLY_AUTHORITY = {
  ...OPL_DOMAIN_READONLY_AUTHORITY,
  opl_can_mutate_domain_artifact_body: false,
};

const DOMAIN_GENERATED_SURFACE_READONLY_AUTHORITY = {
  domain_can_claim_generic_runtime_owner: false,
  domain_repo_can_own_generated_surface: false,
};

const GENERATED_SURFACE_HANDOFFS = [
  {
    surface_id: 'cli',
    current_paths: ['agent/cli.ts'],
    current_role: 'domain_handler_target',
    target_role: 'opl_generated_command_surface',
  },
  {
    surface_id: 'mcp',
    current_paths: ['agent/mcp.ts'],
    current_role: 'domain_handler_target',
    target_role: 'opl_generated_mcp_descriptor_surface',
  },
  {
    surface_id: 'skill',
    current_paths: ['agent/skills/domain_execution.md'],
    current_role: 'domain_handler_target',
    target_role: 'opl_generated_skill_descriptor_surface',
  },
  {
    surface_id: 'product_entry_manifest',
    current_paths: ['agent/product-entry.ts'],
    current_role: 'domain_handler_target',
    target_role: 'opl_generated_product_entry_surface',
  },
  {
    surface_id: 'status_read_model',
    current_paths: ['agent/status.ts'],
    current_role: 'domain_projection_refs',
    target_role: 'opl_generated_status_read_model_surface',
  },
  {
    surface_id: 'domain_handler',
    current_paths: ['runtime/domain-handler.ts'],
    current_role: 'domain_handler_target',
    target_role: 'domain_handler_target',
  },
  {
    surface_id: 'workbench_drilldown',
    current_paths: ['runtime/workbench.ts'],
    current_role: 'projection_refs',
    target_role: 'opl_hosted_workbench_shell_consuming_domain_refs',
  },
  {
    surface_id: 'functional_harness_cases',
    current_paths: ['runtime/harness.ts'],
    current_role: 'oracle_fixture_refs',
    target_role: 'opl_generated_functional_harness_cases',
  },
] as const;

const SAMPLE_SOURCE_CLASSIFICATIONS = [
  {
    surface_id: 'agent_semantic_pack',
    classification: 'declarative_domain_pack',
    source_refs: ['agent/'],
  },
  {
    surface_id: 'domain_handler_targets',
    classification: 'domain_handler_target',
    source_refs: ['agent/cli.ts', 'agent/mcp.ts', 'agent/product-entry.ts'],
  },
  {
    surface_id: 'refs_only_adapters',
    classification: 'refs_only_adapter',
    source_refs: ['agent/status.ts', 'runtime/domain-handler.ts', 'runtime/workbench.ts'],
  },
  {
    surface_id: 'minimal_authority_functions',
    classification: 'minimal_authority_function',
    source_refs: ['runtime/authority_functions/owner-receipt.json'],
  },
  {
    surface_id: 'legacy_runtime_residue',
    classification: 'legacy_proof_tombstone',
    source_refs: ['docs/history/runtime-tombstone.md'],
  },
] as const;

function contractPath(repoDir: string, fileName: string) {
  return path.join(repoDir, 'contracts', fileName);
}

function readJson(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
}

export function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function refString(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as { ref?: unknown }).ref === 'string'
    ? (value as { ref: string }).ref
    : null;
}

function refStrings(value: unknown) {
  return Array.isArray(value)
    ? value.map(refString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function syncStageManifestFromPlane(repoDir: string, stageControlPlane: Record<string, any>) {
  const manifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const manifest = readJson(manifestPath);
  manifest.target_domain_id = stageControlPlane.target_domain_id;
  manifest.owner = stageControlPlane.owner;
  manifest.authority_boundary = {
    domain_truth_owner: stageControlPlane.owner,
    opl_can_write_domain_truth: false,
    opl_can_authorize_quality_or_export: false,
  };
  manifest.stages = stageControlPlane.stages.map((stage: Record<string, any>, index: number) => {
    const stageId = stage.stage_id;
    const stageContract = stage.stage_contract ?? {};
    const laneKind = stage.lane_kind ?? stage.selected_executor?.lane_kind;
    return {
      stage_id: stageId,
      stage_kind: stage.stage_kind,
      title: stage.title,
      summary: stage.summary,
      goal: stage.goal,
      policy_ref: refStrings(stage.source_refs)[0] ?? `agent/stages/${stageId}.md`,
      prompt_ref: refStrings(stage.prompt_refs)[0] ?? `agent/prompts/${stageId}.md`,
      knowledge_refs: refStrings(stage.knowledge_refs),
      quality_gate_refs: refStrings(stage.evaluation),
      allowed_action_refs: stage.allowed_action_refs ?? [],
      requires: stageContract.requires ?? [`${stageId}_input_refs`],
      ensures: stageContract.ensures ?? [`${stageId}_owner_receipt_or_typed_blocker_ref`],
      next_stage_refs: stage.handoff?.next_stage_refs ?? [],
      trust_lane: index === 0 ? 'codex_executor' : 'domain_agent',
      ...(stage.handoff?.review_boundary
        ? { handoff_review_boundary: stage.handoff.review_boundary }
        : {}),
      ...(laneKind ? { lane_kind: laneKind } : {}),
    };
  });
  writeJson(manifestPath, manifest);
}

function syncStandardAgentConformanceProfile(repoDir: string) {
  const manifest = readJson(path.join(repoDir, 'agent', 'stages', 'manifest.json'));
  const stages = Array.isArray(manifest.stages) ? manifest.stages : [];
  const stageIds = stages.map((stage: Record<string, any>) => stage.stage_id);
  const defaultStage = stages.find((stage: Record<string, any>) =>
    stage.selected_executor?.default_executor === true
  ) ?? stages[0];
  const morphology = readJson(contractPath(repoDir, 'functional_privatization_audit.json'))
    .physical_source_morphology_policy;
  writeJson(contractPath(repoDir, 'standard_agent_conformance_profile.json'), {
    surface_kind: 'opl_standard_agent_conformance_profile',
    version: 'opl.standard-agent-conformance-profile.v1',
    profile_id: `${manifest.target_domain_id}.standard-agent-conformance.v1`,
    target_domain_id: manifest.target_domain_id,
    golden_path: {
      required_stage_ids: stageIds,
      allowed_stage_ids: stageIds,
      default_stage_id: defaultStage.stage_id,
      forbidden_owner_tokens: [],
    },
    physical_morphology: {
      scan_roots: ['agent/', 'contracts/', 'runtime/'],
      allowed_residue_prefixes: ['docs/history/', 'tests/'],
      required_surface_ids: morphology.required_surface_ids,
      surface_classifications: morphology.surface_classifications,
      forbidden_name_tokens: [],
      required_parity_gates: ['generated_surface_consumption'],
    },
  });
}

export function buildReadyAgentRepo() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-conformance-'));
  buildStandardDomainAgentScaffold({
    targetDir,
    domainId: 'sample-brief-agent',
    domainLabel: 'Sample Brief Agent',
  });

  writeJson(path.join(targetDir, 'package.json'), {
    name: 'sample-brief-agent',
    version: '0.0.0',
    type: 'module',
    bin: {
      'sample-brief-agent': './src/cli.ts',
    },
  });
  fs.mkdirSync(path.join(targetDir, 'src', 'handlers'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'src', 'cli.ts'), [
    "import { draftBrief } from './handlers/draft-brief.ts';",
    '',
    'export function main() {',
    '  return draftBrief();',
    '}',
    '',
    'main();',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(targetDir, 'src', 'handlers', 'draft-brief.ts'), [
    'export function draftBrief() {',
    "  return { status: 'owner_receipt_candidate' };",
    '}',
    '',
  ].join('\n'), 'utf8');
  writeJson(contractPath(targetDir, 'domain_handler_registry.json'), {
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [
      {
        handler_id: 'draft_brief',
        binding: {
          kind: 'typescript_export',
          file: 'src/handlers/draft-brief.ts',
          export: 'draftBrief',
        },
      },
    ],
  });

  const stageManifestPath = path.join(targetDir, 'agent', 'stages', 'manifest.json');
  const stageManifest = readJson(stageManifestPath);
  const defaultStageId = stageManifest.stages[0].stage_id;

  writeJson(contractPath(targetDir, 'action_catalog.json'), {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'sample_brief_agent_action_catalog',
    target_domain_id: 'sample-brief-agent',
    owner: 'SampleBriefAgent',
    authority_boundary: {
      domain_truth_owner: 'SampleBriefAgent',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [
      {
        action_id: 'draft_brief',
        title: 'Draft brief',
        summary: 'Draft a source-grounded brief.',
        owner: 'SampleBriefAgent',
        effect: 'mutating',
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'contracts/draft-brief.input.schema.json',
        output_schema_ref: 'contracts/draft-brief.output.schema.json',
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['brief_owner_review'],
        stage_route: {
          entry_stage_ref: defaultStageId,
          required_stage_refs: [defaultStageId],
          optional_stage_refs: [],
          terminal_stage_refs: [defaultStageId],
          route_policy: 'ai_selected_progress_route',
        },
        supported_surfaces: {
          cli: {
            surface_kind: 'domain_cli',
          },
          mcp: {
            tool_name: 'sample_brief_agent_draft_brief',
            surface_kind: 'domain_mcp_descriptor',
            descriptor_only: true,
            public_runtime: false,
          },
          skill: {
            command_contract_id: 'sample_brief_agent.draft_brief',
            surface_kind: 'domain_skill_contract',
          },
          product_entry: {
            action_key: 'draft_brief',
            surface_kind: 'domain_product_entry',
          },
          openai: { tool_name: 'sample_brief_agent_draft_brief' },
          ai_sdk: { tool_name: 'sample_brief_agent_draft_brief' },
        },
        authority_boundary: {
          opl_can_write_domain_truth: false,
        },
      },
    ],
    notes: [],
  });
  stageManifest.stages[0].allowed_action_refs = ['draft_brief'];
  writeJson(stageManifestPath, stageManifest);
  writeJson(contractPath(targetDir, 'draft-brief.input.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['workspace_root'],
    properties: { workspace_root: { type: 'string' } },
  });

  writeJson(contractPath(targetDir, 'generated_surface_handoff.json'), {
    surface_kind: 'opl_generated_surface_handoff',
    schema_version: 1,
    domain_id: 'sample-brief-agent',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    generated_surfaces: GENERATED_SURFACE_HANDOFFS.map(({ surface_id }) => ({
      surface_id,
      owner: 'one-person-lab',
      status: 'descriptor_source_available',
    })),
    handoff_surfaces: GENERATED_SURFACE_HANDOFFS,
    required_domain_handoff: [
      'owner_receipt_schema',
      'typed_blocker_schema',
      'minimal_authority_function_refs',
      'no_forbidden_write_evidence',
    ],
  });

  const generatedFunctionalAudit = readJson(contractPath(targetDir, 'functional_privatization_audit.json'));
  writeJson(contractPath(targetDir, 'functional_privatization_audit.json'), {
    surface_kind: 'functional_privatization_audit',
    target_domain_id: 'sample-brief-agent',
    private_functional_surface_admission_policy_ref:
      generatedFunctionalAudit.private_functional_surface_admission_policy_ref,
    physical_source_morphology_policy: {
      ...generatedFunctionalAudit.physical_source_morphology_policy,
      required_surface_ids: SAMPLE_SOURCE_CLASSIFICATIONS.map(({ surface_id }) => surface_id),
      classification_buckets: [
        'declarative_domain_pack',
        'domain_handler_target',
        'refs_only_adapter',
        'minimal_authority_function',
        'legacy_proof_tombstone',
      ],
      surface_classifications: SAMPLE_SOURCE_CLASSIFICATIONS,
    },
    forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
    authority_boundary: {
      ...OPL_DOMAIN_READONLY_AUTHORITY,
      ...DOMAIN_GENERATED_SURFACE_READONLY_AUTHORITY,
    },
    modules: [
      {
        module_id: 'sample_brief_generated_wrappers',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['agent/cli.ts', 'agent/mcp.ts', 'agent/product-entry.ts', 'agent/status.ts'],
        active_callers: ['OPL generated CLI', 'OPL generated MCP', 'OPL generated product-entry'],
        active_caller_status: 'domain_handlers_active_opl_generated_wrapper_metadata_consumed',
        migration_action: 'derive_wrapper_metadata_from_declarative_pack_and_opl_generated_surfaces',
        retained_domain_authority: ['domain_action_handler', 'owner_receipt'],
      },
      {
        module_id: 'sample_brief_domain_handler',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/domain-handler.ts'],
        active_callers: ['OPL generated domain handler dispatch'],
        active_caller_status: 'domain_handler_target_returns_owner_receipt_or_typed_blocker',
        migration_action: 'route_generated_domain_handler_to_minimal_authority_function_targets',
        retained_domain_authority: ['owner_receipt'],
      },
      {
        module_id: 'sample_brief_workbench_projection',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/workbench.ts'],
        active_callers: ['OPL hosted workbench'],
        active_caller_status: 'opl_hosted_workbench_surface_consumes_domain_projection_refs',
        migration_action: 'declare_workbench_projection_inputs_for_opl_app_generated_shell',
        retained_domain_authority: ['status_projection_refs'],
      },
      {
        module_id: 'sample_brief_functional_harness',
        classification: 'declarative_pack_generated_surface',
        owner: 'SampleBriefAgent',
        code_paths: ['runtime/harness.ts'],
        active_callers: ['OPL functional harness'],
        active_caller_status: 'opl_generated_functional_harness_cases_target_domain_handler',
        migration_action: 'derive_harness_cases_from_declarative_pack_and_opl_functional_runtime_harness',
        retained_domain_authority: ['fixture_oracle_refs'],
      },
      {
        module_id: 'sample_brief_owner_receipt_signer',
        classification: 'minimal_authority_function',
        owner: 'SampleBriefAgent',
        cannot_absorb_reason: 'OPL cannot sign target domain owner receipts.',
      },
    ],
  });

  writeJson(contractPath(targetDir, 'workspace_lifecycle_policy.json'), {
    surface_kind: 'opl_domain_workspace_file_lifecycle_policy',
    version: 'opl-domain-workspace-file-lifecycle.v1',
    policy_owner: 'one-person-lab',
    structural_gate_only: true,
    repo_source_boundaries: {
      required_roots: [
        'agent/',
        'contracts/',
        'runtime/authority_functions/',
        'docs/',
        'src/ or packages/',
      ],
      source_truth_policy: 'repo_source_contains_pack_contracts_authority_functions_and_domain_code_only',
      runtime_artifacts_live_in_source_repo: false,
      developer_checkout_may_define_app_runtime_without_explicit_override: false,
      forbidden_runtime_artifact_roots: [
        'artifacts/',
        'workspaces/',
        'workspace/',
        'runtime/artifacts/',
        'runtime/workspaces/',
      ],
    },
    workspace_runtime_artifact_roots: {
      externalized: true,
      repo_source_policy: 'locator_index_schema_receipt_refs_only',
      allowed_authoritative_roots: [
        'workspace_root',
        'runtime_artifact_root',
        'user_runtime_state_root',
        'OPL_STATE_DIR',
      ],
      required_locator_refs: [
        'workspace_root_ref',
        'runtime_artifact_root_ref',
        'artifact_locator_ref',
        'restore_or_retention_receipt_ref',
      ],
    },
    byproduct_policy: {
      caches_and_install_artifacts_externalized: true,
      ignored_only_is_fallback_not_authority: true,
      forbidden_generated_paths: [
        '.venv/',
        '__pycache__/',
        '.pytest_cache/',
        '*.egg-info/',
        'dist/',
        'coverage/',
        'node_modules/',
      ],
    },
    lifecycle_authority_split: {
      opl_owned_primitives: [
        'workspace_lifecycle',
        'file_lifecycle',
        'artifact_locator_index',
        'retention_restore_ledger',
        'migration_ledger',
        'operator_projection',
      ],
      domain_owned_authority: [
        'domain_truth',
        'quality_export_visual_verdict',
        'artifact_body_authority',
        'memory_body_accept_reject',
        'owner_receipt',
      ],
    },
    authority_boundary: {
      policy_can_claim_domain_ready_or_artifact_authority: false,
      ...OPL_ARTIFACT_READONLY_AUTHORITY,
    },
  });

  writeJson(contractPath(targetDir, 'stage_artifact_kernel_adoption.json'), {
    surface_kind: 'opl_stage_artifact_kernel_adoption',
    version: 'opl-stage-artifact-kernel-adoption.v1',
    owner: 'SampleBriefAgent',
    kernel_contract_ref: 'contracts/opl-framework/stage-artifact-runtime-contract.json',
    stage_folder_unit: [
      'Stage Folder',
      'Manifest',
      'Receipt',
      'current pointer',
    ],
    terminal_states: [
      'success',
      'blocked',
      'skipped',
      'deferred',
    ],
    required_ref_fields: [
      'stage_folder_contract_ref',
      'stage_json_ref',
      'attempt_json_ref',
      'manifest_ref',
      'receipt_ref',
      'current_pointer_ref',
      'canonical_artifact_ref',
      'export_ref',
      'lineage_ref',
      'retention_ref',
    ],
    kernel_refs: {
      physical_stage_folder_source_of_truth: true,
      derived_index_rebuildable: true,
      manifest_receipt_hash_required: true,
    },
    domain_pack_binding: {
      accepted_source_refs: [
        'agent/stages/manifest.json',
        'contracts/foundry_agent_series.json',
      ],
      domain_output_roles_are_interface: true,
      file_name_is_not_interface: true,
    },
    projection_boundary: {
      derived_projection_refs: [
        'stage_artifact_index',
        'stage_operating_layer',
        'app_workbench_artifact_drilldown',
      ],
      file_presence_only_counts_as: 'orphan_or_historical',
      provider_completion_counts_as_progress: false,
    },
    authority_boundary: {
      opl_can_create_domain_owner_receipt: false,
      ...OPL_ARTIFACT_READONLY_AUTHORITY,
    },
  });

  writeJson(contractPath(targetDir, 'state_index_kernel_adoption.json'), {
    surface_kind: 'opl_state_index_kernel_adoption',
    version: 'opl-state-index-kernel-adoption.v1',
    owner: 'SampleBriefAgent',
    kernel_contract_ref: 'contracts/opl-framework/state-index-kernel-contract.json',
    sqlite_role: 'rebuildable_refs_only_sidecar_index',
    physical_truth_role: 'stage_folder_manifest_receipt_artifact_body_file_truth',
    required_index_databases: [
      'queue',
      'lifecycle_index',
      'artifact_index',
      'operator_read_model',
    ],
    required_ref_fields: [
      'domain_id',
      'program_id',
      'stage_id',
      'attempt_id',
      'surface_id',
      'source_ref',
      'receipt_ref',
      'content_hash',
      'observed_at',
      'indexed_at',
      'index_version',
      'rebuild_epoch',
    ],
    domain_ref_sources: [
      'contracts/stage_artifact_kernel_adoption.json',
      'contracts/workspace_lifecycle_policy.json',
      'contracts/generated_surface_handoff.json',
      'contracts/action_catalog.json',
    ],
    compaction_policy: {
      small_file_runtime_refs_may_be_indexed: true,
      large_payload_strategy: 'store_preview_hash_and_refs_never_body',
      index_rebuild_source: 'physical_stage_folder_manifest_receipt_refs',
      app_reads_projection_not_sqlite_directly: true,
    },
    maintenance_policy: {
      journal_mode: 'WAL',
      busy_timeout_ms: 5000,
      checkpoint_required: true,
      backup_required: true,
      integrity_check_required: true,
      optimize_required: true,
      network_filesystem_multi_writer_supported: false,
    },
    authority_boundary: {
      sqlite_sidecar_source_of_truth: false,
      sqlite_record_counts_as_stage_complete: false,
      ...OPL_DOMAIN_READONLY_AUTHORITY,
      opl_can_write_artifact_body: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_store_large_artifact_blob_in_sqlite: false,
      domain_repo_can_own_generic_sqlite_persistence_engine: false,
    },
  });

  syncStandardAgentConformanceProfile(targetDir);

  return targetDir;
}

export function retargetReadyRepoToMag(repoDir: string) {
  const domainDescriptorPath = contractPath(repoDir, 'domain_descriptor.json');
  const domainDescriptor = readJson(domainDescriptorPath);
  domainDescriptor.domain_id = 'med-autogrant';
  domainDescriptor.domain_label = 'Med Auto Grant';
  writeJson(domainDescriptorPath, domainDescriptor);

  const actionCatalogPath = contractPath(repoDir, 'action_catalog.json');
  const actionCatalog = readJson(actionCatalogPath);
  actionCatalog.target_domain_id = 'med-autogrant';
  writeJson(actionCatalogPath, actionCatalog);
  const packCompilerInputPath = contractPath(repoDir, 'pack_compiler_input.json');
  const packCompilerInput = readJson(packCompilerInputPath);
  packCompilerInput.domain_id = 'med-autogrant';
  packCompilerInput.canonical_agent_id = 'mag';
  writeJson(packCompilerInputPath, packCompilerInput);
  const manifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const manifest = readJson(manifestPath);
  manifest.target_domain_id = 'med-autogrant';
  manifest.owner = 'med-autogrant';
  manifest.authority_boundary.domain_truth_owner = 'med-autogrant';
  writeJson(manifestPath, manifest);
  syncStandardAgentConformanceProfile(repoDir);
}

export function retargetReadyRepo(repoDir: string, domainId: string, domainLabel: string) {
  const domainDescriptorPath = contractPath(repoDir, 'domain_descriptor.json');
  const domainDescriptor = readJson(domainDescriptorPath);
  domainDescriptor.domain_id = domainId;
  domainDescriptor.domain_label = domainLabel;
  writeJson(domainDescriptorPath, domainDescriptor);

  const actionCatalogPath = contractPath(repoDir, 'action_catalog.json');
  const actionCatalog = readJson(actionCatalogPath);
  actionCatalog.target_domain_id = domainId;
  writeJson(actionCatalogPath, actionCatalog);
  const canonicalAgentIds: Record<string, string> = {
    medautoscience: 'mas',
    'med-autoscience': 'mas',
    medautogrant: 'mag',
    redcube_ai: 'rca',
    'redcube-ai': 'rca',
    agent_engineering: 'oma',
    'opl-meta-agent': 'oma',
    'opl-bookforge': 'obf',
  };
  const packCompilerInputPath = contractPath(repoDir, 'pack_compiler_input.json');
  const packCompilerInput = readJson(packCompilerInputPath);
  packCompilerInput.domain_id = domainId;
  packCompilerInput.canonical_agent_id = canonicalAgentIds[domainId] ?? domainId;
  writeJson(packCompilerInputPath, packCompilerInput);
  const manifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const manifest = readJson(manifestPath);
  manifest.target_domain_id = domainId;
  manifest.owner = domainId;
  manifest.authority_boundary.domain_truth_owner = domainId;
  writeJson(manifestPath, manifest);
  syncStandardAgentConformanceProfile(repoDir);
}

export function configureReadyCapabilityPackage(repoDir: string) {
  const packCompilerInputPath = contractPath(repoDir, 'pack_compiler_input.json');
  const packCompilerInput = readJson(packCompilerInputPath);
  delete packCompilerInput.implementation_profile;
  writeJson(packCompilerInputPath, packCompilerInput);
  writeJson(contractPath(repoDir, 'scholar-skills-capability-modules.json'), {
    contract_id: 'opl_scholarskills_capability_modules',
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_runtime_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_schedule_runtime: false,
    },
  });
  const pluginManifestPath = path.join(repoDir, '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(pluginManifestPath), { recursive: true });
  writeJson(pluginManifestPath, {
    name: 'mas-scholar-skills',
    version: '0.1.0',
  });
  const skillPath = path.join(repoDir, 'skills', 'mas-scholar-skills', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, '# MAS Scholar Skills\n', 'utf8');
}

function setStagePlaneTarget(repoDir: string, domainId: string, owner: string) {
  const stageControlPlane = structuredClone(
    compileStandardAgentStageManifest(repoDir).stage_control_plane,
  ) as Record<string, any>;
  stageControlPlane.target_domain_id = domainId;
  stageControlPlane.owner = owner;
  stageControlPlane.domain_id = domainId;
  stageControlPlane.plane_id = `${domainId.replace(/[^a-z0-9]+/gi, '_')}.stage-control-plane.v1`;
  stageControlPlane.authority_boundary = {
    ...stageControlPlane.authority_boundary,
    domain_truth_owner: owner,
    opl_role: 'projection_consumer_only',
    opl_can_write_domain_truth: false,
    opl_can_authorize_quality_or_export: false,
  };
  return stageControlPlane;
}

function stageFromBase(baseStage: Record<string, any>, input: {
  stageId: string;
  stageKind: string;
  title: string;
  summary: string;
  goal: string;
  owner: string;
  defaultExecutor?: boolean;
  laneKind?: string;
  executorKind?: string;
  executorBindingRef?: string;
  handoffReviewBoundary?: Record<string, unknown>;
}) {
  const defaultExecutor = input.defaultExecutor === true;
  return {
    ...baseStage,
    stage_id: input.stageId,
    stage_kind: input.stageKind,
    ...(input.laneKind ? { lane_kind: input.laneKind } : {}),
    title: input.title,
    summary: input.summary,
    goal: input.goal,
    owner: input.owner,
    domain_stage_refs: [input.stageId],
    selected_executor: {
      executor_kind: input.executorKind ?? (defaultExecutor ? 'codex_cli' : 'domain_stage_handoff'),
      default_executor: defaultExecutor,
      executor_binding_ref: input.executorBindingRef ?? (defaultExecutor ? 'default_codex_cli' : `${input.stageId}_owner_handoff`),
      binding_policy: defaultExecutor
        ? 'default_first_class_executor_for_ai_first_stage_execution'
        : 'explicit_non_default_stage_or_affordance_lane',
    },
    independent_gate_policy: {
      ...baseStage.independent_gate_policy,
      gate_owner: input.owner,
    },
    stage_contract: {
      ...baseStage.stage_contract,
      requires: [
        `${input.stageId}_input_refs`,
        'authority_boundary_ref',
      ],
      ensures: [
        `${input.stageId}_artifact_or_owner_handoff_ref`,
        'owner_receipt_or_typed_blocker_ref',
      ],
    },
    handoff: {
      next_owner: input.owner,
      next_stage_refs: [],
      ...(input.handoffReviewBoundary
        ? { review_boundary: input.handoffReviewBoundary }
        : {}),
    },
  };
}

export function configureReadyMagMorphology(repoDir: string) {
  const functionalAuditPath = contractPath(repoDir, 'functional_privatization_audit.json');
  const functionalAudit = readJson(functionalAuditPath);
  functionalAudit.physical_source_morphology_policy.required_surface_ids = [
    'domain_runtime',
    'product_entry',
    'status',
    'user_loop',
    'domain_handler',
    'runtime_registration',
    'control_plane',
    'lifecycle',
    'memory',
    'package',
    'autonomy_controller',
    'legacy_runtime_residue',
  ];
  functionalAudit.physical_source_morphology_policy.surface_classifications = (
    functionalAudit.physical_source_morphology_policy.required_surface_ids.map((surface_id: string) => ({
      surface_id,
      classification: surface_id === 'legacy_runtime_residue' ? 'legacy_proof_tombstone' : 'refs_only_adapter',
      source_refs: surface_id === 'legacy_runtime_residue' ? ['docs/history/runtime-tombstone.md'] : ['agent/'],
    }))
  );
  functionalAudit.physical_source_morphology_policy.forbidden_residue_classes = [
    'legacy_local_persistence_surface',
    'legacy_attempt_record_surface',
    'legacy_repo_cadence_owner',
    'legacy_executor_runtime_probe',
    'legacy_compat_alias_surface',
  ];
  functionalAudit.physical_source_morphology_policy.authority_boundary = {
    ...DOMAIN_GENERATED_SURFACE_READONLY_AUTHORITY,
    mag_can_own_generic_runtime: false,
    mag_can_own_generated_wrapper: false,
    mag_can_restore_legacy_compat_alias: false,
  };
  writeJson(functionalAuditPath, functionalAudit);
  syncStandardAgentConformanceProfile(repoDir);
}

export function configureReadyRcaMorphology(repoDir: string) {
  const stageControlPlane = setStagePlaneTarget(repoDir, 'redcube-ai', 'redcube-ai');
  const baseStage = stageControlPlane.stages[0];
  stageControlPlane.stages = [
    {
      stageId: 'source_intake',
      stageKind: 'intake',
      title: 'Source Intake',
      summary: 'Ingest visual brief, source refs, and artifact authority boundaries.',
      goal: 'Produce RCA source-intake refs for the visual golden path without authorizing artifact success.',
      defaultExecutor: true,
    },
    {
      stageId: 'communication_strategy',
      stageKind: 'planning',
      title: 'Communication Strategy',
      summary: 'Turn the brief into a communication strategy for the visual artifact.',
      goal: 'Produce strategy refs and route the next visual stage to RCA owner review.',
    },
    {
      stageId: 'visual_direction',
      stageKind: 'planning',
      title: 'Visual Direction',
      summary: 'Select the visual direction and acceptance criteria.',
      goal: 'Produce visual direction refs and independent gate inputs.',
    },
    {
      stageId: 'artifact_creation',
      stageKind: 'creation',
      title: 'Artifact Creation',
      summary: 'Create the visual artifact stage unit.',
      goal: 'Produce artifact refs, manifest refs, and owner closeout refs.',
    },
    {
      stageId: 'review_and_revision',
      stageKind: 'review',
      title: 'Review And Revision',
      summary: 'Run RCA-owned visual review and revision.',
      goal: 'Produce review/export verdict refs or typed blocker refs.',
    },
    {
      stageId: 'package_and_handoff',
      stageKind: 'packaging',
      title: 'Package And Handoff',
      summary: 'Package the final visual artifact for handoff.',
      goal: 'Produce package refs, export refs, and owner receipt refs.',
      handoffReviewBoundary: {
        artifact_effect: 'reviewed_immutable_refs_only',
        freezes_canonical_artifact_bytes: false,
        issues_quality_export_publication_or_ready_claim: false,
        downstream_owner_retains_acceptance: true,
      },
    },
    {
      stageId: 'render_preview_lane',
      stageKind: 'domain_specific',
      laneKind: 'variant',
      title: 'Render Preview Lane',
      summary: 'Explicit non-default render preview helper lane.',
      goal: 'Produce render preview refs as affordance evidence only.',
      executorKind: 'rca_helper_affordance',
      executorBindingRef: 'rca_render_preview_affordance',
    },
    {
      stageId: 'screenshot_review_lane',
      stageKind: 'domain_specific',
      laneKind: 'variant',
      title: 'Screenshot Review Lane',
      summary: 'Explicit non-default screenshot inspection helper lane.',
      goal: 'Produce screenshot refs for review without becoming the default route.',
      executorKind: 'rca_helper_affordance',
      executorBindingRef: 'rca_screenshot_review_affordance',
    },
    {
      stageId: 'native_pptx_export_lane',
      stageKind: 'domain_specific',
      laneKind: 'variant',
      title: 'Native PPTX Export Lane',
      summary: 'Explicit non-default native PPTX export helper lane.',
      goal: 'Produce native PPTX/export refs as route variant evidence only.',
      executorKind: 'rca_helper_affordance',
      executorBindingRef: 'rca_native_pptx_export_affordance',
    },
  ].map((stage) => stageFromBase(baseStage, { owner: 'redcube-ai', ...stage }));
  const actionCatalogPath = contractPath(repoDir, 'action_catalog.json');
  const actionCatalog = readJson(actionCatalogPath);
  actionCatalog.actions[0].stage_route = {
    entry_stage_ref: 'source_intake',
    required_stage_refs: [
      'source_intake',
      'communication_strategy',
      'visual_direction',
      'artifact_creation',
      'review_and_revision',
      'package_and_handoff',
    ],
    optional_stage_refs: [
      'render_preview_lane',
      'screenshot_review_lane',
      'native_pptx_export_lane',
    ],
    terminal_stage_refs: ['package_and_handoff'],
    route_policy: 'ai_selected_progress_route',
  };
  writeJson(actionCatalogPath, actionCatalog);
  syncStageManifestFromPlane(repoDir, stageControlPlane);
  syncStandardAgentConformanceProfile(repoDir);

  writeJson(path.join(repoDir, 'contracts', 'physical_source_morphology_policy.json'), {
    canonical_pack_root: 'agent/',
    status: 'active_source_classification_policy_landed',
    active_surface_classifications: [
      'mcp_product_entry_domain_entry',
      'product_entry_continuity_refs_adapter',
      'runtime_watch_projection',
      'domain_action_adapter_guarded_actions',
      'operator_evidence_stability_projection',
      'visual_authority_functions',
    ].map((surface_id) => ({
      surface_id,
      classification: 'domain_handler_or_refs_only_adapter',
      forbidden_generic_owner_flags: {
        generic_runtime_owner: false,
        generated_surface_owner_in_domain_repo: false,
      },
    })),
    legacy_name_policy: {
      forbidden_active_surface_ids: [
        'legacy_managed_runtime_gateway_names',
      ],
      compatibility_alias_allowed: false,
      active_generic_runtime_owner_allowed: false,
      active_generic_gateway_owner_allowed: false,
      active_generic_session_runtime_owner_allowed: false,
    },
  });
}

export function writeProductionAcceptance(repoDir: string, fileName: string, payload: unknown) {
  const directory = path.join(repoDir, 'contracts', 'production_acceptance');
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, fileName), payload);
}
