import fs from 'node:fs';
import path from 'node:path';

import {
  AGENT_PACK_CONTRACT,
  DECLARATIVE_DOMAIN_PACK,
  DOCS_TAXONOMY,
  DOMAIN_RETAINED_THIN_SURFACES,
  FOUNDRY_AGENT_SERIES_POLICY_RELEASE,
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  GENERATED_SURFACE_CONTRACT,
  MINIMAL_AUTHORITY_FUNCTIONS,
  OPL_GENERATED_SURFACES,
  OPL_OWNED_GENERIC_PRIMITIVES,
  PACK_COMPILER_CONTRACT,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  REQUIRED_CONTRACT_SURFACES,
  REQUIRED_REPO_SOURCE_DIRS,
  REQUIRED_VERIFICATION,
  STANDARD_AGENT_DEFAULT_RUNTIME_POLICY,
  STANDARD_FOUNDRY_AGENT_SERIES_CONSUMER_CONTRACT,
  STANDARD_STAGE_COMPLETION_POLICY,
  STANDARD_PROGRESS_DELTA_POLICY,
  STAGE_RUN_KERNEL_PROFILE,
  STATE_INDEX_KERNEL_ADOPTION_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  STANDARD_USER_STAGE_LOG_CONTRACT,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
} from './standard-domain-agent-scaffold-constants.ts';
import { buildStageRunCanaryEvidence } from './standard-domain-agent-scaffold-stage-run-canary.ts';
import { STAGE_OPERATING_PRINCIPLES_POLICY } from './standard-domain-agent-stage-operating-principles.ts';
export {
  buildStandardDomainAgentScaffoldValidation,
  validateStandardDomainAgentScaffold,
} from './standard-domain-agent-scaffold-validation.ts';
import {
  buildScaffoldFiles,
  STANDARD_AGENT_CAPABILITY_MAP_CONTRACT,
  type ScaffoldFile,
} from './standard-domain-agent-scaffold-template.ts';

type ScaffoldMode = 'describe' | 'generate' | 'validate';

interface ScaffoldInput {
  targetDir?: string;
  domainId?: string;
  domainLabel?: string;
  force?: boolean;
}

export const DEFAULT_TEMPLATE_CONSUMPTION_SAMPLE_DOMAINS = [
  { domainId: 'award-foundry', domainLabel: 'Award Foundry' },
  { domainId: 'thesis-foundry', domainLabel: 'Thesis Foundry' },
  { domainId: 'review-foundry', domainLabel: 'Review Foundry' },
];

function normalizeDomainId(value: string | undefined) {
  return (value || 'new-domain-agent')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-domain-agent';
}

function domainLabelFromId(domainId: string, label: string | undefined) {
  return label?.trim() || domainId
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ');
}

function plannedWrites(targetDir: string, files: ScaffoldFile[]) {
  return files.map((file) => {
    const absolute_path = path.resolve(targetDir, file.path);
    return {
      path: file.path,
      absolute_path,
      exists: fs.existsSync(absolute_path),
    };
  });
}

function writeScaffoldFiles(targetDir: string, files: ScaffoldFile[], force: boolean) {
  const writes = [];
  for (const file of files) {
    const targetPath = path.resolve(targetDir, file.path);
    if (fs.existsSync(targetPath) && !force) {
      writes.push({
        path: file.path,
        absolute_path: targetPath,
        status: 'skipped_existing',
      });
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, 'utf8');
    writes.push({
      path: file.path,
      absolute_path: targetPath,
      status: 'written',
    });
  }
  return writes;
}

function buildWriteSummary(writes: Array<{ status: string }>, force: boolean) {
  return {
    written_count: writes.filter((write) => write.status === 'written').length,
    skipped_existing_count: writes.filter((write) => write.status === 'skipped_existing').length,
    force,
  };
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    )
    : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildGenericPrimitiveCompletion() {
  return {
    surface_kind: 'opl_framework_generic_primitive_completion',
    owner: 'one-person-lab',
    status: 'functional_surfaces_available_production_evidence_pending',
    completed_functional_surfaces: OPL_OWNED_GENERIC_PRIMITIVES.map((primitive) => ({
      ...primitive,
      completion_state: 'framework_surface_available',
    })),
    remaining_evidence_gates: [
      'long_running_provider_slo_window',
      'real_domain_owner_chain_scaleout',
      'accepted_rejected_memory_writeback_receipts_at_scale',
      'artifact_lifecycle_receipts_at_scale',
      'operator_app_drilldown_production_use',
    ],
    authority_boundary: {
      framework_surface_complete_does_not_authorize_domain_ready: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  };
}

function countStageChecks(stageRefValidation: unknown, field: string) {
  return readRecordArray(recordValue(stageRefValidation).stage_statuses)
    .filter((stage) => readRecordArray(stage.checks)
      .some((check) => check.field === field && check.status === 'ok'))
    .length;
}

function countStagePackBindings(stagePackV2Validation: unknown, predicate: (stage: Record<string, unknown>) => boolean) {
  return readRecordArray(recordValue(stagePackV2Validation).stage_statuses)
    .filter(predicate)
    .length;
}

function buildScaffoldConsumptionRefs(input: {
  mode: ScaffoldMode | 'consumption_evidence';
  domainId: string;
  targetDir?: string | null;
  templateFileCount?: number;
  writtenCount?: number;
  validation?: Record<string, unknown> | null;
  ephemeralTargetRemoved?: boolean;
}) {
  const validation = input.validation ?? null;
  const agentPackValidation = validation ? recordValue(validation.agent_pack_validation) : {};
  const stageRefValidation = validation ? recordValue(validation.stage_ref_validation) : {};
  const stagePackV2Validation = validation ? recordValue(validation.stage_pack_v2_validation) : {};
  const blockers = validation ? readStringArray(validation.blockers) : [];
  const validationStatus = validation ? readOptionalString(validation.status) : null;
  const status = validation
    ? (validationStatus === 'passed' ? 'validated_scaffold_consumed' : 'validation_blocked')
    : input.mode === 'generate'
      ? 'generated_scaffold_pending_validation'
      : 'describe_only_no_generated_repo_consumed';
  const selectedExecutorBindingObservedCount = countStagePackBindings(
    stagePackV2Validation,
    (stage) => Boolean(readOptionalString(stage.selected_executor_kind)),
  );
  const defaultCodexExecutorBindingCount = countStagePackBindings(
    stagePackV2Validation,
    (stage) =>
      readOptionalString(stage.selected_executor_kind) === 'codex_cli'
      && readOptionalString(stage.executor_binding_ref) === 'default_codex_cli',
  );

  return {
    surface_kind: 'opl_standard_agent_template_consumption_refs',
    owner: 'one-person-lab',
    evidence_role: 'refs_only_new_agent_template_consumption',
    status,
    mode: input.mode,
    domain_id: input.domainId,
    scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
    source_api_ref:
      input.mode === 'consumption_evidence'
        ? 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence'
        : input.mode === 'validate'
          ? 'opl.pack.validateStandardDomainAgentScaffold'
          : input.mode === 'generate'
            ? 'opl.pack.buildStandardDomainAgentScaffold'
            : 'opl.pack.buildStandardDomainAgentScaffold',
    next_verification_api_ref: input.ephemeralTargetRemoved === true
      ? 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence'
      : input.targetDir
        ? 'opl.pack.validateStandardDomainAgentScaffold'
        : 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence',
    target_dir_ref: input.targetDir ?? null,
    target_dir_policy: input.ephemeralTargetRemoved === true
      ? 'ephemeral_generated_repo_removed_after_validation'
      : input.targetDir
        ? 'explicit_user_target_dir'
        : 'no_target_dir_in_describe_mode',
    generated_template_file_count: input.templateFileCount ?? 0,
    generated_written_file_count: input.writtenCount ?? 0,
    validation_consumed_generated_repo: Boolean(validation),
    validation_status: validationStatus,
    blocker_count: blockers.length,
    blockers,
    consumed_pack_path_count: numberValue(agentPackValidation.semantic_listed_path_count),
    consumed_pack_discovered_path_count: numberValue(agentPackValidation.discovered_path_count),
    consumed_stage_count: numberValue(stageRefValidation.stage_count),
    prompt_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'prompt_refs'),
    skill_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'skills'),
    tool_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'tool_refs'),
    knowledge_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'knowledge_refs'),
    quality_gate_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'evaluation'),
    selected_executor_binding_observed_count: selectedExecutorBindingObservedCount,
    default_codex_executor_binding_count: defaultCodexExecutorBindingCount,
    generated_surface_owner_verified: validation
      ? !readStringArray(validation.authority_violations).some((violation) =>
        violation.includes('generated_surface')
      )
      : false,
    private_surface_policy_guarded: validation
      ? readStringArray(validation.missing_forbidden_role_guards).length === 0
      : false,
    stage_pack_v2_status: readOptionalString(stagePackV2Validation.status),
    app_operator_consumable: true,
    app_operator_projection_ref: '/app_operator_drilldown/standard_agent_template_consumption_refs',
    claim_policy:
      'scaffold_generation_and_validation_evidence_only_no_domain_ready_artifact_authority_or_production_ready_claim',
    authority_boundary: {
      refs_only: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      scaffold_validation_can_claim_domain_ready: false,
      scaffold_validation_can_claim_artifact_authority: false,
      scaffold_validation_can_claim_production_ready: false,
    },
  };
}

export function buildStandardDomainAgentScaffold(input: ScaffoldInput = {}) {
  const domainId = normalizeDomainId(input.domainId);
  const domainLabel = domainLabelFromId(domainId, input.domainLabel);
  const templateFiles = buildScaffoldFiles(domainId, domainLabel);
  const targetDir = input.targetDir ? path.resolve(input.targetDir) : null;
  const mode: ScaffoldMode = targetDir ? 'generate' : 'describe';
  const writePlan = targetDir ? plannedWrites(targetDir, templateFiles) : [];
  const writes = targetDir ? writeScaffoldFiles(targetDir, templateFiles, input.force === true) : [];
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      surface_kind: 'opl_standard_domain_agent_scaffold',
      version: 'standard-domain-agent-scaffold.v1',
      scaffold_id: 'opl.standard_domain_agent.scaffold.v1',
      owner: 'one-person-lab',
      api_ref: 'opl.pack.buildStandardDomainAgentScaffold',
      state: targetDir ? 'scaffold_generated' : 'scaffold_contract_available',
      contract_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      generation_policy: {
        scaffold_request_is_read_only: targetDir === null,
        creates_files: targetDir !== null,
        default_mode: 'describe_without_target_dir',
        write_requires_explicit_target_dir: true,
        scaffold_role: 'physical_skeleton_and_lower_bound_guardrail',
        scaffold_is_agent_design_template_source: false,
        scaffold_shape_source_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
        copy_existing_domain_repo_as_template: false,
      },
      design_source_boundary: {
        scaffold_is_agent_design_template_source: false,
        scaffold_can_cap_target_agent_design_ceiling: false,
        scaffold_can_claim_target_agent_ready: false,
        profile_catalog_is_lower_bound_guardrail: true,
        reference_design_sources_remain_design_source: true,
        source_derived_design_consumption_refs_required_for_reference_backed_agents: true,
      },
      mode,
      target_dir: targetDir,
      domain_id: domainId,
      domain_label: domainLabel,
      repo_source_boundary: {
        required_dirs: REQUIRED_REPO_SOURCE_DIRS,
        forbidden_dirs: ['artifacts'],
        runtime_artifacts_live_in_source_repo: false,
        real_artifact_roots_are_locators: true,
      },
      docs_taxonomy: DOCS_TAXONOMY,
      required_contract_surfaces: REQUIRED_CONTRACT_SURFACES,
      opl_owned_generic_primitives: OPL_OWNED_GENERIC_PRIMITIVES,
      declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
      minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
      pack_compiler_contract: PACK_COMPILER_CONTRACT,
      generated_surface_contract: GENERATED_SURFACE_CONTRACT,
      agent_pack_contract: AGENT_PACK_CONTRACT,
      capability_map_contract: STANDARD_AGENT_CAPABILITY_MAP_CONTRACT,
      default_runtime_policy: STANDARD_AGENT_DEFAULT_RUNTIME_POLICY,
      stage_completion_policy: STANDARD_STAGE_COMPLETION_POLICY,
      user_stage_log_contract: STANDARD_USER_STAGE_LOG_CONTRACT,
      progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
      typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
      stage_operating_principles_policy: STAGE_OPERATING_PRINCIPLES_POLICY,
      foundry_agent_series_contract: STANDARD_FOUNDRY_AGENT_SERIES_CONSUMER_CONTRACT,
      foundry_agent_series_policy_release: FOUNDRY_AGENT_SERIES_POLICY_RELEASE,
      opl_generated_surfaces: OPL_GENERATED_SURFACES,
      domain_retained_thin_surfaces: DOMAIN_RETAINED_THIN_SURFACES,
      forbidden_domain_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
      retirement_gate: {
        surface_kind: 'opl_legacy_retirement_gate_checklist',
        required_evidence: [
          'replacement_contract_available',
          'active_callers_migrated',
          'no_active_default_caller',
          'direct_and_opl_hosted_parity',
          'provenance_or_history_tombstone',
          'no_retained_legacy_compatibility_entry',
        ],
        delete_policy: 'delete_or_history_tombstone_only',
        executable_plan_surface: 'family_runtime_lifecycle_apply',
        executable_when: [
          'full_no_active_caller',
          'replacement_parity',
          'provenance_proof',
          'history_or_tombstone',
          'no_retained_legacy_entry',
        ],
        allowed_opl_apply_scopes: [
          'opl_owned_runtime_ref',
          'opl_owned_index_ref',
          'opl_owned_provenance_ref',
          'opl_owned_tombstone_ref',
        ],
        forbidden_apply_scopes: [
          'domain_truth',
          'memory_body',
          'artifact_body',
          'source_repo_active_file',
        ],
        opl_can_execute_domain_repo_delete: false,
      },
      functional_privatization_audit_contract: {
        surface_kind: 'opl_functional_privatization_audit_contract',
        version: 'opl-functional-privatization-audit.v1',
        owner: 'one-person-lab',
        accepted_source_fields: [
          'functional_privatization_audit',
        ],
        legacy_import_source_fields: [],
        source_shape_policy: {
          standard_agent_contract_source: 'contracts/functional_privatization_audit.json',
          legacy_repo_local_shapes_are_standard_contract: false,
          legacy_import_adapter_available: false,
          new_agents_must_emit_canonical_functional_privatization_audit: true,
        },
        module_inventory_fields: [
          'module_id',
          'classification',
          'code_paths',
          'active_callers',
          'active_caller_status',
          'migration_action',
          'retention_reason',
          'cannot_absorb_reason',
          'standardization_layer',
          'standardization_layer_reason',
        ],
        standardization_layers: [
          'standard_domain_pack_inventory',
          'authority_function_inventory',
          'private_platform_residue_inventory',
        ],
        migration_classes: [
          'opl_hosted_surface',
          'opl_generated_surface',
          'declarative_pack',
          'minimal_authority_function',
          'refs_only_domain_adapter',
          'opl_storage_substrate_mas_refs_projection',
          'temporary_migration_bridge',
          'diagnostic_cleanup_path',
          'provenance_or_fixture',
        ],
        audit_policy: 'OPL defaults to the attention_required watchlist from structured blockers, migration classes, and active-caller flags; cleared/stable boundary entries stay in the full module inventory for traceability.',
      },
      private_functional_surface_admission_policy: PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
      workspace_file_lifecycle_policy: WORKSPACE_FILE_LIFECYCLE_POLICY,
      stage_run_kernel_profile: STAGE_RUN_KERNEL_PROFILE,
      stage_run_canary_evidence: buildStageRunCanaryEvidence(domainId, 'domain_intake'),
      state_index_kernel_adoption_policy: {
        ...STATE_INDEX_KERNEL_ADOPTION_POLICY,
        consumer: domainId,
      },
      required_verification: REQUIRED_VERIFICATION,
      ...(targetDir ? { template_files: templateFiles.map((file) => file.path) } : {}),
      write_plan: writePlan,
      writes,
      write_summary: buildWriteSummary(writes, input.force === true),
      scaffold_consumption_refs: buildScaffoldConsumptionRefs({
        mode,
        domainId,
        targetDir,
        templateFileCount: templateFiles.length,
        writtenCount: writes.filter((write) => write.status === 'written').length,
      }),
      generic_primitive_completion: buildGenericPrimitiveCompletion(),
      authority_boundary: {
        opl: 'framework_runtime_development_primitives_contracts_read_models_projection_and_checklist_owner',
        domain_agent: 'domain_truth_quality_export_artifact_memory_body_and_owner_receipt_authority',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        domain_can_own_generic_scheduler_or_queue: false,
      },
    },
  };
}

export function buildStandardDomainAgentTemplateConsumptionReadModel() {
  const proofApiRef = 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence';
  return {
    surface_kind: 'opl_standard_agent_template_consumption_read_model',
    owner: 'one-person-lab',
    status: 'explicit_repeat_consumption_api_available',
    projection_policy: 'refs_only_operator_projection_no_implicit_temp_generation',
    proof_api_ref: proofApiRef,
    default_consumption_sample_domain_ids: DEFAULT_TEMPLATE_CONSUMPTION_SAMPLE_DOMAINS.map((sample) =>
      sample.domainId
    ),
    evidence_contract: {
      surface_kind: 'opl_standard_agent_template_consumption_evidence_contract',
      contract_role: 'replayable_expected_shape_for_template_consumption_proof',
      replay_api_ref: proofApiRef,
      expected_output_root: '/standard_domain_agent_template_consumption_evidence',
      expected_status_path: '/standard_domain_agent_template_consumption_evidence/status',
      expected_success_status: 'passed',
      expected_sample_domain_ids_path:
        '/standard_domain_agent_template_consumption_evidence/sample_domain_ids',
      expected_consumption_cohort_path:
        '/standard_domain_agent_template_consumption_evidence/consumption_cohort',
      expected_sample_success_path:
        '/standard_domain_agent_template_consumption_evidence/consumption_cohort/samples/*/status',
      expected_sample_success_status: 'passed',
      expected_evidence_ref_path: '/standard_domain_agent_template_consumption_evidence/evidence_ref',
      expected_evidence_fingerprint_path:
        '/standard_domain_agent_template_consumption_evidence/evidence_fingerprint',
      expected_cohort_evidence_ref_path:
        '/standard_domain_agent_template_consumption_evidence/cohort_evidence_ref',
      expected_cohort_evidence_fingerprint_path:
        '/standard_domain_agent_template_consumption_evidence/cohort_evidence_fingerprint',
      expected_evidence_receipt_candidate_policy_path:
        '/standard_domain_agent_template_consumption_evidence/evidence_receipt_candidate_policy',
      expected_sample_evidence_ref_path:
        '/standard_domain_agent_template_consumption_evidence/consumption_cohort/samples/*/evidence_ref',
      evidence_ref_semantics:
        'deterministic_body_free_shape_refs_for_replayable_consumption_evidence_not_recorded_ledger_receipts',
      expected_consumed_surfaces: [
        'scaffold_validation',
        'standard_agent_conformance',
        'agent_readiness',
        'app_operator_projection',
      ],
      expected_authority_boundary_path:
        '/standard_domain_agent_template_consumption_evidence/authority_boundary',
      forbidden_claim_fields: [
        'domain_ready',
        'artifact_authority',
        'production_ready',
        'quality_or_export_authorized',
      ],
      implicit_temp_generation_by_drilldown_allowed: false,
    },
    consumed_surface_refs: [
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      'contracts/capability_map.json',
      'contracts/pack_compiler_input.json',
      'contracts/generated_surface_handoff.json',
      'agent/stages/manifest.json',
      'agent/prompts/domain_intake.md',
      'agent/skills/domain_execution.md',
      'agent/tools/domain_affordances.md',
      'agent/knowledge/domain_boundary.md',
      'agent/quality_gates/domain_acceptance.md',
    ],
    expected_evidence_fields: [
      'generated_written_file_count',
      'validation_status',
      'consumed_pack_path_count',
      'consumed_stage_count',
      'selected_executor_binding_observed_count',
      'tool_ref_resolved_stage_count',
      'quality_gate_ref_resolved_stage_count',
      'generated_surface_owner_verified',
      'private_surface_policy_guarded',
      'stage_pack_v2_status',
      'evidence_ref',
      'evidence_fingerprint',
      'cohort_evidence_ref',
      'cohort_evidence_fingerprint',
      'evidence_receipt_candidate_policy',
    ],
    summary: {
      proof_api_ref_count: 1,
      app_operator_consumable_ref_count: 1,
      default_consumption_sample_count: DEFAULT_TEMPLATE_CONSUMPTION_SAMPLE_DOMAINS.length,
      repeat_consumption_supported: true,
      consumed_surface_count_per_sample: 4,
      consumed_surfaces: [
        'scaffold_validation',
        'standard_agent_conformance',
        'agent_readiness',
        'app_operator_projection',
      ],
      readiness_surface_consumed: true,
      app_operator_surface_consumed: true,
      domain_ready_claim_count: 0,
      production_ready_claim_count: 0,
      artifact_authority_claim_count: 0,
    },
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_mutate_domain_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
    },
  };
}
