import type { BrandModuleId } from '../../kernel/types.ts';
import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  BRAND_MODULE_IDS,
  expectNonEmptyStringArray,
} from './brand-module-contracts.ts';
import { listStandardDomainAgentIds } from '../../kernel/standard-agent-registry.ts';

export function expectFalseBoolean(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, { file: filePath, field });
  }
  return false as const;
}

export function expectTrueBoolean(value: unknown, field: string, filePath: string) {
  if (value !== true) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be true.`, { file: filePath, field });
  }
  return true as const;
}

export function expectFiniteNumber(value: unknown, field: string, filePath: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a finite number.`, {
      file: filePath,
      field,
      actual: value,
    });
  }
  return value;
}

export const TARGET_ARCHITECTURE_DESIGN_PRINCIPLES = [
  'grip_big_release_small',
  'current_owner_delta_first',
  'codex_cli_single_semantic_stage_route_owner',
  'declarative_domain_pack_generated_surfaces_authority_abi',
  'passive_evidence_ledger',
  'one_ordinary_golden_path_per_agent',
  'small_idempotent_reconcilers',
  'app_console_thin_default_surface',
  'agent_lab_refs_only_improvement_control_plane',
  'runway_control_loop_runtime_module',
] as const;

export const TARGET_ARCHITECTURE_RESOURCE_FIELDS = [
  'apiVersion',
  'kind',
  'metadata',
  'spec',
  'status',
  'conditions',
  'ownerRefs',
  'finalizers',
] as const;

export const TARGET_ARCHITECTURE_RESOURCE_KINDS = [
  'Agent',
  'DomainPack',
  'RunwayControlLoop',
  'ProgressReconciler',
  'WorkspaceGroup',
  'ProjectUnit',
  'StageRun',
  'StageArtifactUnit',
  'OwnerAnswer',
  'EvidenceRef',
  'ReleaseCohort',
  'ImprovementWorkOrder',
] as const;

export const TARGET_ARCHITECTURE_LANES = [
  'ordinary',
  'advisory',
  'audit',
  'diagnostic',
  'cleanup',
  'production_evidence',
] as const;

export const TARGET_ARCHITECTURE_PLANES = [
  'purpose_pack_plane',
  'ordinary_progress_plane',
  'stage_artifact_plane',
  'durable_runway_plane',
  'authority_decision_plane',
  'evidence_telemetry_plane',
  'reconciler_plane',
  'app_cockpit_plane',
  'improvement_plane',
] as const;

export const TARGET_ARCHITECTURE_ORDINARY_SURFACE_PLANES = [
  'ordinary_progress_plane',
  'durable_runway_plane',
  'authority_decision_plane',
  'reconciler_plane',
  'app_cockpit_plane',
] as const;

export const TARGET_ARCHITECTURE_NON_AUTHORITY_FORBIDDEN_OUTPUTS = [
  'domain_owner_answer',
  'domain_typed_blocker',
  'quality_or_export_verdict',
  'artifact_body_mutation',
  'memory_body_mutation',
  'domain_ready_declaration',
  'production_ready_declaration',
] as const;

export const TARGET_ARCHITECTURE_PLANE_FORBIDDEN_CLAIMS = [
  'domain_ready_declaration',
  'quality_or_export_verdict',
  'owner_receipt_signature',
  'typed_blocker_signature',
] as const;

export const TARGET_ARCHITECTURE_SMALL_DETAIL_LANES = [
  'advisory',
  'audit',
  'diagnostic',
  'cleanup',
  'production_evidence',
] as const;

export const TARGET_ARCHITECTURE_HARD_BLOCKER_CONDITIONS = [
  'wrong_launch',
  'authority_violation',
  'not_recoverable',
  'not_auditable',
  'cannot_closeout',
  'invalid_owner_answer_shape',
  'irreversible_mutation',
] as const;

export const TARGET_ARCHITECTURE_ACCEPTED_OWNER_ANSWER_SHAPES = [
  'owner_receipt_ref',
  'quality_gate_receipt_ref',
  'human_gate_ref',
  'typed_blocker_ref',
  'no_regression_ref',
  'long_soak_ref',
  'route_back_ref',
  'physical_delete_authorization_ref',
  'keep_as_authority_adapter_ref',
] as const;

export const TARGET_ARCHITECTURE_PASSIVE_STAGE_PROJECTIONS = [
  'stage_current_pointer',
  'stage_run_terminal_state',
  'current_owner_delta',
  'runway_control_loop_status',
  'progress_reconciler_projection',
] as const;

export const TARGET_ARCHITECTURE_STAGE_ROUTE_CAPABILITIES = [
  'advance_to_next_declared_stage',
  'skip_to_any_declared_stage',
  'repeat_current_or_prior_stage',
  'reverse_to_any_declared_stage',
  'route_back_with_partial_or_negative_results',
] as const;

export const TARGET_ARCHITECTURE_FORBIDDEN_FRAMEWORK_ROUTE_DECISIONS = [
  'accept_or_reject_codex_route',
  'require_typed_closeout_for_progress',
  'require_owner_receipt_for_progress',
  'rank_or_select_stage_candidates',
  'override_codex_selected_next_stage',
  'convert_quality_debt_to_execution_blocker',
] as const;

export const TARGET_ARCHITECTURE_DOMAIN_PACK_DECLARATIONS = [
  'stage_graph',
  'ordinary_golden_path',
  'prompt_refs',
  'skill_refs',
  'tool_affordance_boundary_refs',
  'knowledge_refs',
  'quality_gate_refs',
  'artifact_policy',
  'memory_policy',
  'owner_answer_schema',
  'authority_functions',
  'fixtures',
  'tests',
] as const;

export const TARGET_ARCHITECTURE_GENERATED_SURFACES = [
  'cli',
  'mcp',
  'skill_plugin',
  'product_entry',
  'openai_tool',
  'ai_sdk',
  'status_read_model',
  'workbench',
  'operator_projection',
] as const;

export const TARGET_ARCHITECTURE_AUTHORITY_FUNCTIONS = [
  'quality_or_export_verdict',
  'artifact_authority',
  'memory_accept_reject',
  'owner_receipt_signer',
  'typed_blocker_signer',
  'human_gate_signer',
] as const;

export const TARGET_ARCHITECTURE_RECONCILER_LOOPS = [
  'runtime_intent_transport',
  'progress_reconciliation',
  'human_authority_wait',
  'recovery_repair',
  'provider_attempt',
  'artifact_progress_projection',
  'currentness_reuse_filter',
  'owner_answer_intake',
  'evidence_verify',
  'cleanup_finalizer',
  'release_cohort_verify',
] as const;

export const TARGET_ARCHITECTURE_ATLAS_CATALOGS = [
  'agents',
  'domain_packs',
  'resources',
  'surfaces',
  'contracts',
  'skills',
  'mcp_tools',
  'app_pages',
  'release_channels',
] as const;

export const TARGET_ARCHITECTURE_VAULT_REF_STREAMS = [
  'evidence_refs',
  'receipt_refs',
  'typed_blocker_refs',
  'trace_refs',
  'metric_refs',
  'log_refs',
  'artifact_lineage_refs',
] as const;

export const TARGET_ARCHITECTURE_APP_DEFAULT_FIELDS = [
  'task',
  'stage',
  'current_owner',
  'next_action',
  'running_or_blocked_status',
  'artifact_or_blocker',
  'accepted_answer_shape',
] as const;

export const TARGET_ARCHITECTURE_APP_DRILLDOWN_FIELDS = [
  'provider_trace',
  'attempt_ledger',
  'release_diagnostics',
  'cleanup_inventory',
  'l5_evidence',
  'raw_evidence',
  'route_variant_menu',
] as const;

export const TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS = [
  'running_smoothness',
  'output_quality',
  'brand_feel',
] as const;

export const TARGET_ARCHITECTURE_AGENT_LAB_MAY_PRODUCE = [
  'eval_ref',
  'root_cause_ref',
  'candidate_fix_ref',
  'work_order_ref',
  'promotion_proposal_ref',
  'rollback_ref',
  'reevaluation_ref',
] as const;

export const TARGET_ARCHITECTURE_AGENT_LAB_MUST_NOT_PRODUCE = [
  'domain_quality_verdict',
  'artifact_authority',
  'memory_body',
  'owner_receipt',
  'typed_blocker',
  'production_acceptance',
] as const;

export const TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS = [
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
] as const;

export const TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES = [
  'opl_landed',
  'opl_landed_owner_gated',
  'external_owner_gated',
] as const;

export const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_AGENTS = listStandardDomainAgentIds();

export const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CAPABILITY_REGISTRY_MODULES = [
  'atlas',
  'pack',
  'stagecraft',
] as const satisfies readonly BrandModuleId[];

export const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CONFORMANCE_CLAIMS = [
  'default_read_root_is_current_owner_delta',
  'domain_authority_false_flags_on_opl_modules',
  'generated_surfaces_do_not_write_domain_truth',
  'conformance_pass_does_not_claim_domain_ready',
  'ledger_console_runway_do_not_sign_owner_answer',
  'capability_registry_fails_open_unless_current_delta_requires_ref',
  'default_cli_skill_app_product_entry_route_through_stage_run_owner_delta',
] as const;

export const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_FORBIDDEN_CLAIMS = [
  'agent_os_contract_is_domain_ready',
  'capability_registry_owns_domain_authority',
  'pack_compile_is_quality_verdict',
  'generated_surface_writes_domain_truth',
  'current_owner_delta_projection_signs_owner_answer',
  'ledger_ref_is_owner_receipt_authority',
  'runway_provider_completion_is_domain_completion',
  'console_view_is_app_release_ready',
] as const;

export const TARGET_ARCHITECTURE_MAS_FLAGSHIP_JOURNEY_ARTIFACTS = [
  'Evidence Map',
  'Analysis Pack',
  'Manuscript Draft',
  'Reviewer Letter',
  'Revision Packet',
  'Publication Handoff',
] as const;

export const TARGET_ARCHITECTURE_FLAGSHIP_PRIVATE_RESIDUE_INPUTS = [
  'private_scheduler',
  'private_runner',
  'private_workbench',
  'private_status_shell',
] as const;

export const TARGET_ARCHITECTURE_FLAGSHIP_CONTRACT_SURFACES = [
  'target_operating_architecture_contract',
  'standard_domain_agent_conformance',
  'foundry_agent_os_conformance',
  'pack_compiler_projection',
] as const;

export const TARGET_ARCHITECTURE_FLAGSHIP_FALSE_READY_CLAIMS = [
  'mas_ready',
  'paper_done',
  'brand_l5_done',
  'production_ready',
] as const;

export function expectBrandModuleIdArray(value: unknown, field: string, filePath: string) {
  const ids = expectNonEmptyStringArray(value, field, filePath);
  for (const id of ids) {
    if (!(BRAND_MODULE_IDS as readonly string[]).includes(id)) {
      throw new FrameworkContractError('contract_shape_invalid', `${field} contains unknown OPL brand module ids.`, {
        file: filePath,
        field,
        actual: id,
        allowed: [...BRAND_MODULE_IDS],
      });
    }
  }
  return ids as BrandModuleId[];
}

export function validateFalseBoundaryRecord(filePath: string, value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an object.`, {
      file: filePath,
      field,
    });
  }
  if (Object.keys(value).length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain at least one entry.`, {
      file: filePath,
      field,
    });
  }

  const boundary: Record<string, false> = {};
  for (const [key, flag] of Object.entries(value)) {
    boundary[key] = expectFalseBoolean(flag, `${field}.${key}`, filePath);
  }
  return boundary;
}
