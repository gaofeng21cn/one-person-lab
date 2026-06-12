import type {
  BrandModuleId,
  TargetOperatingArchitectureContract,
} from './types.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  isRecord,
} from './contract-validation.ts';
import {
  BRAND_MODULE_IDS,
  expectAllowedStringArray,
  expectBrandModuleId,
  expectNonEmptyStringArray,
  requireEveryValue,
} from './brand-module-contracts.ts';

function expectFalseBoolean(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, { file: filePath, field });
  }
  return false as const;
}

function expectTrueBoolean(value: unknown, field: string, filePath: string) {
  if (value !== true) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be true.`, { file: filePath, field });
  }
  return true as const;
}

function expectFiniteNumber(value: unknown, field: string, filePath: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a finite number.`, {
      file: filePath,
      field,
      actual: value,
    });
  }
  return value;
}

const TARGET_ARCHITECTURE_DESIGN_PRINCIPLES = [
  'grip_big_release_small',
  'current_owner_delta_first',
  'single_writer_stage_transition_authority',
  'declarative_domain_pack_generated_surfaces_authority_abi',
  'passive_evidence_vault',
  'one_ordinary_golden_path_per_agent',
  'small_idempotent_reconcilers',
  'app_console_thin_default_surface',
  'agent_lab_refs_only_improvement_control_plane',
  'runway_control_loop_runtime_module',
] as const;

const TARGET_ARCHITECTURE_RESOURCE_FIELDS = [
  'apiVersion',
  'kind',
  'metadata',
  'spec',
  'status',
  'conditions',
  'ownerRefs',
  'finalizers',
] as const;

const TARGET_ARCHITECTURE_RESOURCE_KINDS = [
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

const TARGET_ARCHITECTURE_LANES = [
  'ordinary',
  'advisory',
  'audit',
  'diagnostic',
  'cleanup',
  'production_evidence',
] as const;

const TARGET_ARCHITECTURE_PLANES = [
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

const TARGET_ARCHITECTURE_ORDINARY_SURFACE_PLANES = [
  'ordinary_progress_plane',
  'durable_runway_plane',
  'authority_decision_plane',
  'reconciler_plane',
  'app_cockpit_plane',
] as const;

const TARGET_ARCHITECTURE_NON_AUTHORITY_FORBIDDEN_OUTPUTS = [
  'domain_owner_answer',
  'domain_typed_blocker',
  'quality_or_export_verdict',
  'artifact_body_mutation',
  'memory_body_mutation',
  'domain_ready_declaration',
  'production_ready_declaration',
] as const;

const TARGET_ARCHITECTURE_PLANE_FORBIDDEN_CLAIMS = [
  'domain_ready_declaration',
  'quality_or_export_verdict',
  'owner_receipt_signature',
  'typed_blocker_signature',
] as const;

const TARGET_ARCHITECTURE_SMALL_DETAIL_LANES = [
  'advisory',
  'audit',
  'diagnostic',
  'cleanup',
  'production_evidence',
] as const;

const TARGET_ARCHITECTURE_HARD_BLOCKER_CONDITIONS = [
  'wrong_launch',
  'authority_violation',
  'not_recoverable',
  'not_auditable',
  'cannot_closeout',
  'invalid_owner_answer_shape',
  'irreversible_mutation',
] as const;

const TARGET_ARCHITECTURE_ACCEPTED_OWNER_ANSWER_SHAPES = [
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

const TARGET_ARCHITECTURE_DERIVED_STAGE_STATE = [
  'stage_current_pointer',
  'stage_run_terminal_state',
  'current_owner_delta',
  'runway_control_loop_status',
  'progress_reconciler_projection',
] as const;

const TARGET_ARCHITECTURE_ACCEPTED_AUTHORITY_INPUTS = [
  'transition_intent',
  'provider_observation',
  'owner_answer',
  'typed_blocker',
  'human_gate_decision',
  'agent_lab_observation',
  'evidence_observation',
  'runtime_intent',
  'progress_reconciler_observation',
  'handoff_gate_decision',
  'recovery_repair_observation',
] as const;

const TARGET_ARCHITECTURE_FORBIDDEN_DIRECT_WRITERS = [
  'domain_agent',
  'runtime_provider',
  'one_person_lab_app',
  'agent_lab',
  'read_model',
  'evidence_vault',
  'worklist',
  'runway_control_loop',
  'progress_reconciler',
  'worker_supervisor',
  'temporal_workflow_history',
] as const;

const TARGET_ARCHITECTURE_DOMAIN_PACK_DECLARATIONS = [
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

const TARGET_ARCHITECTURE_GENERATED_SURFACES = [
  'cli',
  'mcp',
  'skill_plugin',
  'product_entry',
  'openai_tool',
  'ai_sdk',
  'status_read_model',
  'workbench',
  'functional_harness',
  'operator_projection',
] as const;

const TARGET_ARCHITECTURE_AUTHORITY_FUNCTIONS = [
  'quality_or_export_verdict',
  'artifact_authority',
  'memory_accept_reject',
  'owner_receipt_signer',
  'typed_blocker_signer',
  'human_gate_signer',
] as const;

const TARGET_ARCHITECTURE_RECONCILER_LOOPS = [
  'runtime_intent_admission',
  'progress_reconciliation',
  'handoff_gate',
  'recovery_repair',
  'admission',
  'execution_authorization',
  'provider_attempt',
  'closeout_binding',
  'owner_answer_intake',
  'evidence_verify',
  'cleanup_finalizer',
  'release_cohort_verify',
] as const;

const TARGET_ARCHITECTURE_ATLAS_CATALOGS = [
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

const TARGET_ARCHITECTURE_VAULT_REF_STREAMS = [
  'evidence_refs',
  'receipt_refs',
  'typed_blocker_refs',
  'trace_refs',
  'metric_refs',
  'log_refs',
  'artifact_lineage_refs',
] as const;

const TARGET_ARCHITECTURE_APP_DEFAULT_FIELDS = [
  'task',
  'stage',
  'current_owner',
  'next_action',
  'running_or_blocked_status',
  'artifact_or_blocker',
  'accepted_answer_shape',
] as const;

const TARGET_ARCHITECTURE_APP_DRILLDOWN_FIELDS = [
  'provider_trace',
  'attempt_ledger',
  'release_diagnostics',
  'cleanup_inventory',
  'l5_evidence',
  'raw_evidence',
  'route_variant_menu',
] as const;

const TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS = [
  'running_smoothness',
  'output_quality',
  'brand_feel',
] as const;

const TARGET_ARCHITECTURE_AGENT_LAB_MAY_PRODUCE = [
  'eval_ref',
  'root_cause_ref',
  'candidate_fix_ref',
  'work_order_ref',
  'promotion_proposal_ref',
  'rollback_ref',
  'reevaluation_ref',
] as const;

const TARGET_ARCHITECTURE_AGENT_LAB_MUST_NOT_PRODUCE = [
  'domain_quality_verdict',
  'artifact_authority',
  'memory_body',
  'owner_receipt',
  'typed_blocker',
  'production_acceptance',
] as const;

const TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS = [
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

const TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES = [
  'opl_landed',
  'opl_landed_owner_gated',
  'external_owner_gated',
] as const;

const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_AGENTS = [
  'mas',
  'mag',
  'rca',
  'oma',
] as const;

const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CAPABILITY_REGISTRY_MODULES = [
  'atlas',
  'pack',
  'stagecraft',
] as const satisfies readonly BrandModuleId[];

const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CONFORMANCE_CLAIMS = [
  'default_read_root_is_current_owner_delta',
  'domain_authority_false_flags_on_opl_modules',
  'generated_surfaces_do_not_write_domain_truth',
  'conformance_pass_does_not_claim_domain_ready',
  'vault_console_runway_do_not_sign_owner_answer',
  'capability_registry_fails_open_unless_current_delta_requires_ref',
] as const;

const TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_FORBIDDEN_CLAIMS = [
  'agent_os_contract_is_domain_ready',
  'capability_registry_owns_domain_authority',
  'pack_compile_is_quality_verdict',
  'generated_surface_writes_domain_truth',
  'current_owner_delta_projection_signs_owner_answer',
  'vault_ref_is_owner_receipt_authority',
  'runway_provider_completion_is_domain_completion',
  'console_view_is_app_release_ready',
] as const;

const TARGET_ARCHITECTURE_MAS_FLAGSHIP_JOURNEY_ARTIFACTS = [
  'Evidence Map',
  'Analysis Pack',
  'Manuscript Draft',
  'Reviewer Letter',
  'Revision Packet',
  'Publication Handoff',
] as const;

const TARGET_ARCHITECTURE_FLAGSHIP_PRIVATE_RESIDUE_INPUTS = [
  'private_scheduler',
  'private_runner',
  'private_workbench',
  'private_status_shell',
] as const;

const TARGET_ARCHITECTURE_FLAGSHIP_CONTRACT_SURFACES = [
  'target_operating_architecture_contract',
  'standard_domain_agent_conformance',
  'foundry_agent_os_conformance',
  'pack_compiler_projection',
] as const;

const TARGET_ARCHITECTURE_FLAGSHIP_FALSE_READY_CLAIMS = [
  'mas_ready',
  'paper_done',
  'brand_l5_done',
  'production_ready',
] as const;

function expectBrandModuleIdArray(value: unknown, field: string, filePath: string) {
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

function validateFalseBoundaryRecord(filePath: string, value: unknown, field: string) {
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

function validateFoundryAgentOsStandard(filePath: string, value: unknown) {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard must be an object.', {
      file: filePath,
      field: 'foundry_agent_os_standard',
    });
  }

  const patternId = expectString(value.pattern_id, 'foundry_agent_os_standard.pattern_id', filePath);
  if (patternId !== 'foundry_agent_os_standard.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.pattern_id must be foundry_agent_os_standard.v1.', {
      file: filePath,
      field: 'foundry_agent_os_standard.pattern_id',
      actual: patternId,
    });
  }

  const targetShape = expectString(value.target_shape, 'foundry_agent_os_standard.target_shape', filePath);
  if (targetShape !== 'OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.target_shape must preserve the family target shape.', {
      file: filePath,
      field: 'foundry_agent_os_standard.target_shape',
      actual: targetShape,
    });
  }

  const appliesToDomainAgents = expectNonEmptyStringArray(
    value.applies_to_domain_agents,
    'foundry_agent_os_standard.applies_to_domain_agents',
    filePath,
  );
  requireEveryValue(
    appliesToDomainAgents,
    TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_AGENTS,
    'foundry_agent_os_standard.applies_to_domain_agents',
    filePath,
  );

  const domainPackExamplesRaw = value.domain_pack_examples;
  const domainAuthorityKernelExamplesRaw = value.domain_authority_kernel_examples;
  const capabilityRegistryRaw = value.capability_registry_boundary;
  if (!isRecord(domainPackExamplesRaw) || !isRecord(domainAuthorityKernelExamplesRaw) || !isRecord(capabilityRegistryRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'foundry_agent_os_standard must declare domain pack examples, authority kernel examples, and capability registry boundary.',
      { file: filePath, field: 'foundry_agent_os_standard' },
    );
  }

  const domainPackExamples: Record<string, string> = {};
  const domainAuthorityKernelExamples: Record<string, string[]> = {};
  for (const agentId of TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_AGENTS) {
    domainPackExamples[agentId] = expectString(
      domainPackExamplesRaw[agentId],
      `foundry_agent_os_standard.domain_pack_examples.${agentId}`,
      filePath,
    );
    domainAuthorityKernelExamples[agentId] = expectNonEmptyStringArray(
      domainAuthorityKernelExamplesRaw[agentId],
      `foundry_agent_os_standard.domain_authority_kernel_examples.${agentId}`,
      filePath,
    );
  }

  const mappingRaw = value.opl_module_mapping;
  if (!Array.isArray(mappingRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.opl_module_mapping must be an array.', {
      file: filePath,
      field: 'foundry_agent_os_standard.opl_module_mapping',
    });
  }
  const mapping = mappingRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each foundry agent OS module mapping entry must be an object.', {
        file: filePath,
        index,
      });
    }
    return {
      target_capability: expectString(entry.target_capability, 'foundry_agent_os_standard.opl_module_mapping.target_capability', filePath),
      primary_module: expectBrandModuleId(entry.primary_module, 'foundry_agent_os_standard.opl_module_mapping.primary_module', filePath),
      supporting_modules: expectBrandModuleIdArray(entry.supporting_modules, 'foundry_agent_os_standard.opl_module_mapping.supporting_modules', filePath),
      ordinary_lane: expectString(entry.ordinary_lane, 'foundry_agent_os_standard.opl_module_mapping.ordinary_lane', filePath),
      authority_boundary: expectString(entry.authority_boundary, 'foundry_agent_os_standard.opl_module_mapping.authority_boundary', filePath),
    };
  });
  for (const requiredCapability of [
    'pack_compiler_generated_surfaces',
    'domain_capability_registry',
    'current_owner_delta_default_read_root',
    'stage_run_durable_execution',
    'refs_only_evidence_and_lineage',
  ]) {
    if (!mapping.some((entry) => entry.target_capability === requiredCapability)) {
      throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.opl_module_mapping is missing a required target capability.', {
        file: filePath,
        field: 'foundry_agent_os_standard.opl_module_mapping',
        missing_capability: requiredCapability,
      });
    }
  }

  const ownerModules = expectBrandModuleIdArray(
    capabilityRegistryRaw.owner_modules,
    'foundry_agent_os_standard.capability_registry_boundary.owner_modules',
    filePath,
  );
  requireEveryValue(
    ownerModules,
    TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CAPABILITY_REGISTRY_MODULES,
    'foundry_agent_os_standard.capability_registry_boundary.owner_modules',
    filePath,
  );
  const defaultBehavior = expectString(
    capabilityRegistryRaw.default_behavior,
    'foundry_agent_os_standard.capability_registry_boundary.default_behavior',
    filePath,
  );
  if (defaultBehavior !== 'current_owner_delta_bound_jit_or_fail_open') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard capability registry default behavior must stay current-owner-delta-bound and fail-open.', {
      file: filePath,
      field: 'foundry_agent_os_standard.capability_registry_boundary.default_behavior',
      actual: defaultBehavior,
    });
  }
  const resolverAbiRef = expectString(
    capabilityRegistryRaw.resolver_abi_ref,
    'foundry_agent_os_standard.capability_registry_boundary.resolver_abi_ref',
    filePath,
  );
  if (resolverAbiRef !== 'contracts/opl-framework/capability-registry-resolver.schema.json') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard capability registry resolver ABI ref must point to the W3 machine contract.', {
      file: filePath,
      field: 'foundry_agent_os_standard.capability_registry_boundary.resolver_abi_ref',
      actual: resolverAbiRef,
    });
  }
  const selectorHelperRef = expectString(
    capabilityRegistryRaw.selector_helper_ref,
    'foundry_agent_os_standard.capability_registry_boundary.selector_helper_ref',
    filePath,
  );
  if (selectorHelperRef !== 'src/capability-registry-resolver.ts') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard capability registry selector helper ref must point to the W3 resolver helper.', {
      file: filePath,
      field: 'foundry_agent_os_standard.capability_registry_boundary.selector_helper_ref',
      actual: selectorHelperRef,
    });
  }
  const optionalRefMissingDefault = expectString(
    capabilityRegistryRaw.optional_ref_missing_default,
    'foundry_agent_os_standard.capability_registry_boundary.optional_ref_missing_default',
    filePath,
  );
  if (optionalRefMissingDefault !== 'advisory_or_audit') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard optional capability refs must fail open into advisory/audit.', {
      file: filePath,
      field: 'foundry_agent_os_standard.capability_registry_boundary.optional_ref_missing_default',
      actual: optionalRefMissingDefault,
    });
  }
  const routeRequiredRefMissing = expectString(
    capabilityRegistryRaw.route_required_ref_missing,
    'foundry_agent_os_standard.capability_registry_boundary.route_required_ref_missing',
    filePath,
  );
  if (routeRequiredRefMissing !== 'typed_blocker_candidate_only_from_current_owner_delta_hard_boundary') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard route-required missing refs must only produce blocker candidates from current_owner_delta hard boundaries.', {
      file: filePath,
      field: 'foundry_agent_os_standard.capability_registry_boundary.route_required_ref_missing',
      actual: routeRequiredRefMissing,
    });
  }
  const mustNotCreate = expectNonEmptyStringArray(
    capabilityRegistryRaw.must_not_create,
    'foundry_agent_os_standard.capability_registry_boundary.must_not_create',
    filePath,
  );
  for (const forbiddenRegistryCreation of ['domain authority verdict', 'owner receipt', 'typed blocker']) {
    if (!mustNotCreate.includes(forbiddenRegistryCreation)) {
      throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard capability registry boundary is missing a forbidden creation rule.', {
        file: filePath,
        field: 'foundry_agent_os_standard.capability_registry_boundary.must_not_create',
        missing: forbiddenRegistryCreation,
      });
    }
  }

  const conformanceClaims = expectNonEmptyStringArray(
    value.cross_agent_conformance_required_claims,
    'foundry_agent_os_standard.cross_agent_conformance_required_claims',
    filePath,
  );
  requireEveryValue(
    conformanceClaims,
    TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CONFORMANCE_CLAIMS,
    'foundry_agent_os_standard.cross_agent_conformance_required_claims',
    filePath,
  );

  const forbiddenClaims = expectNonEmptyStringArray(
    value.forbidden_claims,
    'foundry_agent_os_standard.forbidden_claims',
    filePath,
  );
  requireEveryValue(
    forbiddenClaims,
    TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_FORBIDDEN_CLAIMS,
    'foundry_agent_os_standard.forbidden_claims',
    filePath,
  );

  return {
    pattern_id: patternId,
    source_pattern_ref: expectString(value.source_pattern_ref, 'foundry_agent_os_standard.source_pattern_ref', filePath),
    target_shape: targetShape,
    applies_to_domain_agents: appliesToDomainAgents,
    domain_pack_examples: domainPackExamples,
    domain_authority_kernel_examples: domainAuthorityKernelExamples,
    opl_module_mapping: mapping,
    capability_registry_boundary: {
      owner_modules: ownerModules,
      default_behavior: defaultBehavior,
      resolver_abi_ref: resolverAbiRef,
      selector_helper_ref: selectorHelperRef,
      fail_open_policy: expectString(
        capabilityRegistryRaw.fail_open_policy,
        'foundry_agent_os_standard.capability_registry_boundary.fail_open_policy',
        filePath,
      ),
      optional_ref_missing_default: optionalRefMissingDefault,
      route_required_ref_missing: routeRequiredRefMissing,
      must_not_create: mustNotCreate,
    },
    cross_agent_conformance_required_claims: conformanceClaims,
    implementation_lane_refs: expectNonEmptyStringArray(
      value.implementation_lane_refs,
      'foundry_agent_os_standard.implementation_lane_refs',
      filePath,
    ),
    authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.authority_boundary,
      'foundry_agent_os_standard.authority_boundary',
    ),
    forbidden_claims: forbiddenClaims,
  };
}

function validateTargetOperatingArchitectureMultiPlaneModel(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract['multi_plane_operating_system'] {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare multi_plane_operating_system.',
      { file: filePath, field: 'multi_plane_operating_system' },
    );
  }

  const planeModelId = expectString(value.plane_model_id, 'multi_plane_operating_system.plane_model_id', filePath);
  if (planeModelId !== 'opl_family_multi_plane_operating_system.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'multi_plane_operating_system.plane_model_id must stay on the OPL family multi-plane model.', {
      file: filePath,
      field: 'multi_plane_operating_system.plane_model_id',
      actual: planeModelId,
    });
  }

  const defaultOrdinaryRoute = expectString(
    value.default_ordinary_route,
    'multi_plane_operating_system.default_ordinary_route',
    filePath,
  );
  if (defaultOrdinaryRoute !== 'current_owner_delta') {
    throw new FrameworkContractError('contract_shape_invalid', 'multi_plane_operating_system.default_ordinary_route must remain current_owner_delta.', {
      file: filePath,
      field: 'multi_plane_operating_system.default_ordinary_route',
      actual: defaultOrdinaryRoute,
    });
  }

  const planesRaw = value.planes;
  if (!Array.isArray(planesRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'multi_plane_operating_system.planes must be an array.', {
      file: filePath,
      field: 'multi_plane_operating_system.planes',
    });
  }

  const seenPlanes = new Set<string>();
  const planes = planesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each multi-plane operating model plane must be an object.', {
        file: filePath,
        field: 'multi_plane_operating_system.planes',
        index,
      });
    }
    const planeId = expectString(entry.plane_id, 'multi_plane_operating_system.planes.plane_id', filePath);
    if (!(TARGET_ARCHITECTURE_PLANES as readonly string[]).includes(planeId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'multi_plane_operating_system.planes.plane_id must be a known OPL operating plane.', {
        file: filePath,
        field: 'multi_plane_operating_system.planes.plane_id',
        index,
        actual: planeId,
        allowed: [...TARGET_ARCHITECTURE_PLANES],
      });
    }
    if (seenPlanes.has(planeId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each OPL operating plane must be unique.', {
        file: filePath,
        field: 'multi_plane_operating_system.planes',
        index,
        plane_id: planeId,
      });
    }
    seenPlanes.add(planeId);

    const defaultLane = expectString(entry.default_lane, 'multi_plane_operating_system.planes.default_lane', filePath);
    if (!(TARGET_ARCHITECTURE_LANES as readonly string[]).includes(defaultLane)) {
      throw new FrameworkContractError('contract_shape_invalid', 'multi_plane_operating_system.planes.default_lane must be a known target architecture lane.', {
        file: filePath,
        field: 'multi_plane_operating_system.planes.default_lane',
        index,
        actual: defaultLane,
        allowed: [...TARGET_ARCHITECTURE_LANES],
      });
    }

    const forbiddenClaims = expectNonEmptyStringArray(
      entry.forbidden_claims,
      'multi_plane_operating_system.planes.forbidden_claims',
      filePath,
    );
    for (const requiredForbiddenClaim of TARGET_ARCHITECTURE_PLANE_FORBIDDEN_CLAIMS) {
      if (!forbiddenClaims.includes(requiredForbiddenClaim)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each OPL operating plane must preserve the false-authority forbidden claims.', {
          file: filePath,
          field: 'multi_plane_operating_system.planes.forbidden_claims',
          index,
          plane_id: planeId,
          missing: requiredForbiddenClaim,
        });
      }
    }

    return {
      plane_id: planeId,
      owner_modules: expectBrandModuleIdArray(
        entry.owner_modules,
        'multi_plane_operating_system.planes.owner_modules',
        filePath,
      ),
      default_lane: defaultLane,
      inputs: expectNonEmptyStringArray(entry.inputs, 'multi_plane_operating_system.planes.inputs', filePath),
      outputs: expectNonEmptyStringArray(entry.outputs, 'multi_plane_operating_system.planes.outputs', filePath),
      forbidden_claims: forbiddenClaims,
      ordinary_path_eligible: expectBoolean(
        entry.ordinary_path_eligible,
        'multi_plane_operating_system.planes.ordinary_path_eligible',
        filePath,
      ),
    };
  });

  requireEveryValue(
    [...seenPlanes],
    TARGET_ARCHITECTURE_PLANES,
    'multi_plane_operating_system.planes.plane_id',
    filePath,
  );

  return {
    plane_model_id: planeModelId,
    default_ordinary_route: defaultOrdinaryRoute,
    planes,
    cross_plane_authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.cross_plane_authority_boundary,
      'multi_plane_operating_system.cross_plane_authority_boundary',
    ),
  };
}

function validateFlagshipExperienceMapping(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract['flagship_experience_mapping'] {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare flagship_experience_mapping.',
      { file: filePath, field: 'flagship_experience_mapping' },
    );
  }

  const mappingId = expectString(value.mapping_id, 'flagship_experience_mapping.mapping_id', filePath);
  if (mappingId !== 'mas_research_foundry_flagship_experience.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'flagship_experience_mapping.mapping_id must freeze the MAS Research Foundry flagship mapping.', {
      file: filePath,
      field: 'flagship_experience_mapping.mapping_id',
      actual: mappingId,
    });
  }
  const flagshipAgentId = expectString(
    value.flagship_agent_id,
    'flagship_experience_mapping.flagship_agent_id',
    filePath,
  );
  if (flagshipAgentId !== 'mas') {
    throw new FrameworkContractError('contract_shape_invalid', 'flagship_experience_mapping.flagship_agent_id must stay scoped to MAS.', {
      file: filePath,
      field: 'flagship_experience_mapping.flagship_agent_id',
      actual: flagshipAgentId,
    });
  }
  const standardAgentShape = expectString(
    value.standard_agent_shape,
    'flagship_experience_mapping.standard_agent_shape',
    filePath,
  );
  if (standardAgentShape !== 'Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions') {
    throw new FrameworkContractError('contract_shape_invalid', 'flagship_experience_mapping.standard_agent_shape must keep the standard agent target shape explicit.', {
      file: filePath,
      field: 'flagship_experience_mapping.standard_agent_shape',
      actual: standardAgentShape,
    });
  }

  const journeyArtifacts = expectNonEmptyStringArray(
    value.journey_artifacts,
    'flagship_experience_mapping.journey_artifacts',
    filePath,
  );
  requireEveryValue(
    journeyArtifacts,
    TARGET_ARCHITECTURE_MAS_FLAGSHIP_JOURNEY_ARTIFACTS,
    'flagship_experience_mapping.journey_artifacts',
    filePath,
  );
  const privatePlatformResidueInputs = expectNonEmptyStringArray(
    value.private_platform_residue_inputs,
    'flagship_experience_mapping.private_platform_residue_inputs',
    filePath,
  );
  requireEveryValue(
    privatePlatformResidueInputs,
    TARGET_ARCHITECTURE_FLAGSHIP_PRIVATE_RESIDUE_INPUTS,
    'flagship_experience_mapping.private_platform_residue_inputs',
    filePath,
  );
  const oplContractSurfaces = expectNonEmptyStringArray(
    value.opl_contract_surfaces,
    'flagship_experience_mapping.opl_contract_surfaces',
    filePath,
  );
  requireEveryValue(
    oplContractSurfaces,
    TARGET_ARCHITECTURE_FLAGSHIP_CONTRACT_SURFACES,
    'flagship_experience_mapping.opl_contract_surfaces',
    filePath,
  );
  const falseReadyClaims = expectNonEmptyStringArray(
    value.false_ready_claims,
    'flagship_experience_mapping.false_ready_claims',
    filePath,
  );
  requireEveryValue(
    falseReadyClaims,
    TARGET_ARCHITECTURE_FLAGSHIP_FALSE_READY_CLAIMS,
    'flagship_experience_mapping.false_ready_claims',
    filePath,
  );

  return {
    mapping_id: mappingId,
    flagship_agent_id: flagshipAgentId,
    standard_agent_shape: standardAgentShape,
    journey_artifacts: journeyArtifacts,
    private_platform_residue_inputs: privatePlatformResidueInputs,
    opl_contract_surfaces: oplContractSurfaces,
    false_ready_claims: falseReadyClaims,
    authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.authority_boundary,
      'flagship_experience_mapping.authority_boundary',
    ),
  };
}

function validateOneShotPlanLandingModel(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract['one_shot_plan_landing_model'] {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare one_shot_plan_landing_model.',
      { file: filePath, field: 'one_shot_plan_landing_model' },
    );
  }

  const modelId = expectString(value.model_id, 'one_shot_plan_landing_model.model_id', filePath);
  if (modelId !== 'opl_family_one_shot_plan_landing.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.model_id must be canonical.', {
      file: filePath,
      field: 'one_shot_plan_landing_model.model_id',
      actual: modelId,
    });
  }

  const slicesRaw = value.implementation_slices;
  if (!Array.isArray(slicesRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices must be an array.', {
      file: filePath,
      field: 'one_shot_plan_landing_model.implementation_slices',
    });
  }

  const seenPlanIds = new Set<string>();
  const statusCounts = {
    opl_landed: 0,
    opl_landed_owner_gated: 0,
    external_owner_gated: 0,
  };
  const implementationSlices = slicesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each one-shot plan landing slice must be an object.', {
        file: filePath,
        index,
      });
    }
    const planId = expectString(entry.plan_id, 'one_shot_plan_landing_model.implementation_slices.plan_id', filePath);
    if (!TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS.includes(planId as typeof TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices.plan_id must be P0-P8.', {
        file: filePath,
        index,
        plan_id: planId,
        expected_plan_ids: [...TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS],
      });
    }
    if (seenPlanIds.has(planId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices plan ids must be unique.', {
        file: filePath,
        index,
        plan_id: planId,
      });
    }
    seenPlanIds.add(planId);
    const status = expectString(entry.status, 'one_shot_plan_landing_model.implementation_slices.status', filePath);
    if (!TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES.includes(status as typeof TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices.status must be a known landing status.', {
        file: filePath,
        index,
        status,
        expected_statuses: [...TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES],
      });
    }
    statusCounts[status as keyof typeof statusCounts] += 1;
    return {
      plan_id: planId,
      title: expectString(entry.title, 'one_shot_plan_landing_model.implementation_slices.title', filePath),
      status: status as TargetOperatingArchitectureContract['one_shot_plan_landing_model']['implementation_slices'][number]['status'],
      opl_landed_surfaces: expectNonEmptyStringArray(
        entry.opl_landed_surfaces,
        'one_shot_plan_landing_model.implementation_slices.opl_landed_surfaces',
        filePath,
      ),
      validation_commands: expectNonEmptyStringArray(
        entry.validation_commands,
        'one_shot_plan_landing_model.implementation_slices.validation_commands',
        filePath,
      ),
      remaining_owner_gate: expectString(
        entry.remaining_owner_gate,
        'one_shot_plan_landing_model.implementation_slices.remaining_owner_gate',
        filePath,
      ),
      false_completion_claims: expectNonEmptyStringArray(
        entry.false_completion_claims,
        'one_shot_plan_landing_model.implementation_slices.false_completion_claims',
        filePath,
      ),
    };
  });
  requireEveryValue(
    [...seenPlanIds],
    TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS,
    'one_shot_plan_landing_model.implementation_slices.plan_id',
    filePath,
  );

  const summaryRaw = value.summary;
  if (!isRecord(summaryRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.summary must be an object.', {
      file: filePath,
      field: 'one_shot_plan_landing_model.summary',
    });
  }
  const summary = {
    total_plan_count: expectFiniteNumber(summaryRaw.total_plan_count, 'one_shot_plan_landing_model.summary.total_plan_count', filePath),
    opl_landed_count: expectFiniteNumber(summaryRaw.opl_landed_count, 'one_shot_plan_landing_model.summary.opl_landed_count', filePath),
    opl_landed_owner_gated_count: expectFiniteNumber(summaryRaw.opl_landed_owner_gated_count, 'one_shot_plan_landing_model.summary.opl_landed_owner_gated_count', filePath),
    external_owner_gated_count: expectFiniteNumber(summaryRaw.external_owner_gated_count, 'one_shot_plan_landing_model.summary.external_owner_gated_count', filePath),
    all_opl_controlled_surfaces_landed: expectTrueBoolean(
      summaryRaw.all_opl_controlled_surfaces_landed,
      'one_shot_plan_landing_model.summary.all_opl_controlled_surfaces_landed',
      filePath,
    ),
    external_owner_evidence_still_required: expectTrueBoolean(
      summaryRaw.external_owner_evidence_still_required,
      'one_shot_plan_landing_model.summary.external_owner_evidence_still_required',
      filePath,
    ),
    ready_claim_authorized: expectFalseBoolean(
      summaryRaw.ready_claim_authorized,
      'one_shot_plan_landing_model.summary.ready_claim_authorized',
      filePath,
    ),
  };
  const expectedSummary = {
    total_plan_count: TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS.length,
    opl_landed_count: statusCounts.opl_landed,
    opl_landed_owner_gated_count: statusCounts.opl_landed_owner_gated,
    external_owner_gated_count: statusCounts.external_owner_gated,
  };
  for (const [field, expected] of Object.entries(expectedSummary)) {
    if (summary[field as keyof typeof expectedSummary] !== expected) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.summary counts must match implementation_slices.', {
        file: filePath,
        field: `one_shot_plan_landing_model.summary.${field}`,
        expected,
        actual: summary[field as keyof typeof expectedSummary],
      });
    }
  }

  return {
    model_id: modelId,
    purpose: expectString(value.purpose, 'one_shot_plan_landing_model.purpose', filePath),
    source_plan_ref: expectString(value.source_plan_ref, 'one_shot_plan_landing_model.source_plan_ref', filePath),
    default_completion_semantics: expectString(
      value.default_completion_semantics,
      'one_shot_plan_landing_model.default_completion_semantics',
      filePath,
    ),
    implementation_slices: implementationSlices,
    summary,
    authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.authority_boundary,
      'one_shot_plan_landing_model.authority_boundary',
    ),
  };
}

function validateTargetOperatingArchitectureExperienceModel(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract['experience_operating_model'] {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare experience_operating_model.',
      { file: filePath, field: 'experience_operating_model' },
    );
  }
  const modelId = expectString(value.model_id, 'experience_operating_model.model_id', filePath);
  if (modelId !== 'opl_family_ideal_experience_operating_model.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'experience_operating_model.model_id must be canonical.', {
      file: filePath,
      field: 'experience_operating_model.model_id',
      actual: modelId,
    });
  }
  const defaultUserPathRaw = value.default_user_path;
  const targetAxesRaw = value.target_axes;
  const flagshipAgentRaw = value.flagship_agent_default;
  if (!isRecord(defaultUserPathRaw) || !Array.isArray(targetAxesRaw) || !isRecord(flagshipAgentRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'experience_operating_model must declare default_user_path, target_axes, and flagship_agent_default.',
      { file: filePath, field: 'experience_operating_model' },
    );
  }
  const seenAxisIds = new Set<string>();
  const targetAxes = targetAxesRaw.map((axis, index) => {
    if (!isRecord(axis)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each experience target axis must be an object.', {
        file: filePath,
        index,
      });
    }
    const axisId = expectString(axis.axis_id, 'experience_operating_model.target_axes.axis_id', filePath);
    if (!TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS.includes(axisId as typeof TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'experience_operating_model.target_axes.axis_id must be known.', {
        file: filePath,
        index,
        axis_id: axisId,
        allowed: [...TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS],
      });
    }
    if (seenAxisIds.has(axisId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'experience_operating_model target axes must be unique.', {
        file: filePath,
        index,
        axis_id: axisId,
      });
    }
    seenAxisIds.add(axisId);
    return {
      axis_id: axisId as TargetOperatingArchitectureContract['experience_operating_model']['target_axes'][number]['axis_id'],
      owner_modules: expectBrandModuleIdArray(
        axis.owner_modules,
        'experience_operating_model.target_axes.owner_modules',
        filePath,
      ),
      success_policy: expectString(
        axis.success_policy,
        'experience_operating_model.target_axes.success_policy',
        filePath,
      ),
      machine_checks: expectNonEmptyStringArray(
        axis.machine_checks,
        'experience_operating_model.target_axes.machine_checks',
        filePath,
      ),
      forbidden_regressions: expectNonEmptyStringArray(
        axis.forbidden_regressions,
        'experience_operating_model.target_axes.forbidden_regressions',
        filePath,
      ),
    };
  });
  requireEveryValue(
    [...seenAxisIds],
    TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS,
    'experience_operating_model.target_axes.axis_id',
    filePath,
  );

  return {
    model_id: modelId,
    purpose: expectString(value.purpose, 'experience_operating_model.purpose', filePath),
    default_user_path: {
      planning_root: expectString(
        defaultUserPathRaw.planning_root,
        'experience_operating_model.default_user_path.planning_root',
        filePath,
      ),
      first_screen_policy: expectString(
        defaultUserPathRaw.first_screen_policy,
        'experience_operating_model.default_user_path.first_screen_policy',
        filePath,
      ),
      primary_read_surface: expectString(
        defaultUserPathRaw.primary_read_surface,
        'experience_operating_model.default_user_path.primary_read_surface',
        filePath,
      ),
      drilldown_policy: expectString(
        defaultUserPathRaw.drilldown_policy,
        'experience_operating_model.default_user_path.drilldown_policy',
        filePath,
      ),
    },
    target_axes: targetAxes,
    flagship_agent_default: {
      agent_id: expectString(
        flagshipAgentRaw.agent_id,
        'experience_operating_model.flagship_agent_default.agent_id',
        filePath,
      ),
      expected_path: expectString(
        flagshipAgentRaw.expected_path,
        'experience_operating_model.flagship_agent_default.expected_path',
        filePath,
      ),
      domain_pack_role: expectString(
        flagshipAgentRaw.domain_pack_role,
        'experience_operating_model.flagship_agent_default.domain_pack_role',
        filePath,
      ),
      opl_role: expectString(
        flagshipAgentRaw.opl_role,
        'experience_operating_model.flagship_agent_default.opl_role',
        filePath,
      ),
      private_runtime_disposition: expectString(
        flagshipAgentRaw.private_runtime_disposition,
        'experience_operating_model.flagship_agent_default.private_runtime_disposition',
        filePath,
      ),
    },
    authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.authority_boundary,
      'experience_operating_model.authority_boundary',
    ),
    forbidden_claims: expectNonEmptyStringArray(
      value.forbidden_claims,
      'experience_operating_model.forbidden_claims',
      filePath,
    ),
  };
}

export function validateTargetOperatingArchitecture(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must contain an object root.',
      { file: filePath },
    );
  }

  const resourceModelRaw = value.resource_model;
  const stageAuthorityRaw = value.stage_transition_authority;
  const domainPackRaw = value.domain_pack_authority_abi;
  const surfaceBudgetRaw = value.surface_budget_compiler_policy;
  const reconcilerRaw = value.reconciler_model;
  const reconcilerSubstratePolicyRaw = isRecord(reconcilerRaw)
    ? reconcilerRaw.substrate_policy
    : undefined;
  const catalogRaw = value.catalog_and_telemetry;
  const appConsoleRaw = value.app_console_policy;
  const experienceOperatingModelRaw = value.experience_operating_model;
  const agentLabRaw = value.agent_lab_improvement_plane;
  const oneShotPlanLandingModelRaw = value.one_shot_plan_landing_model;
  const foundryAgentOsStandardRaw = value.foundry_agent_os_standard;
  const flagshipExperienceMappingRaw = value.flagship_experience_mapping;
  const multiPlaneRaw = value.multi_plane_operating_system;
  if (
    !isRecord(resourceModelRaw)
    || !isRecord(stageAuthorityRaw)
    || !isRecord(domainPackRaw)
    || !isRecord(surfaceBudgetRaw)
    || !isRecord(reconcilerRaw)
    || !isRecord(reconcilerSubstratePolicyRaw)
    || !isRecord(catalogRaw)
    || !isRecord(appConsoleRaw)
    || !isRecord(experienceOperatingModelRaw)
    || !isRecord(agentLabRaw)
    || !isRecord(oneShotPlanLandingModelRaw)
    || !isRecord(foundryAgentOsStandardRaw)
    || !isRecord(flagshipExperienceMappingRaw)
    || !isRecord(multiPlaneRaw)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare resource, authority, ABI, surface, multi-plane, reconciler, catalog, App, Agent Lab, and Foundry Agent OS sections.',
      {
        file: filePath,
        field: !isRecord(multiPlaneRaw)
          ? 'multi_plane_operating_system'
          : !isRecord(flagshipExperienceMappingRaw)
            ? 'flagship_experience_mapping'
            : !isRecord(experienceOperatingModelRaw)
              ? 'experience_operating_model'
            : !isRecord(oneShotPlanLandingModelRaw)
              ? 'one_shot_plan_landing_model'
            : undefined,
      },
    );
  }

  const designPrinciples = expectNonEmptyStringArray(value.design_principles, 'design_principles', filePath);
  requireEveryValue(designPrinciples, TARGET_ARCHITECTURE_DESIGN_PRINCIPLES, 'design_principles', filePath);

  const resourceShapeRaw = resourceModelRaw.resource_shape;
  const resourceKindsRaw = resourceModelRaw.resource_kinds;
  if (!isRecord(resourceShapeRaw) || !Array.isArray(resourceKindsRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'resource_model must declare resource_shape and resource_kinds.',
      { file: filePath, field: 'resource_model' },
    );
  }
  const requiredFields = expectNonEmptyStringArray(
    resourceShapeRaw.required_fields,
    'resource_model.resource_shape.required_fields',
    filePath,
  );
  requireEveryValue(
    requiredFields,
    TARGET_ARCHITECTURE_RESOURCE_FIELDS,
    'resource_model.resource_shape.required_fields',
    filePath,
  );
  const seenResourceKinds = new Set<string>();
  const resourceKinds = resourceKindsRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each resource kind must be an object.', {
        file: filePath,
        index,
      });
    }
    const kind = expectString(entry.kind, 'resource_model.resource_kinds.kind', filePath);
    if (!TARGET_ARCHITECTURE_RESOURCE_KINDS.includes(kind as typeof TARGET_ARCHITECTURE_RESOURCE_KINDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'resource_model.resource_kinds.kind must be a target architecture resource kind.', {
        file: filePath,
        index,
        kind,
        allowed: [...TARGET_ARCHITECTURE_RESOURCE_KINDS],
      });
    }
    if (seenResourceKinds.has(kind)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each target architecture resource kind must be unique.', {
        file: filePath,
        index,
        kind,
      });
    }
    seenResourceKinds.add(kind);
    return {
      kind,
      owner: expectString(entry.owner, 'resource_model.resource_kinds.owner', filePath),
      default_lane: expectString(entry.default_lane, 'resource_model.resource_kinds.default_lane', filePath),
      truth_boundary: expectString(entry.truth_boundary, 'resource_model.resource_kinds.truth_boundary', filePath),
    };
  });
  requireEveryValue(
    [...seenResourceKinds],
    TARGET_ARCHITECTURE_RESOURCE_KINDS,
    'resource_model.resource_kinds.kind',
    filePath,
  );

  const derivedState = expectNonEmptyStringArray(
    stageAuthorityRaw.derived_state,
    'stage_transition_authority.derived_state',
    filePath,
  );
  requireEveryValue(derivedState, TARGET_ARCHITECTURE_DERIVED_STAGE_STATE, 'stage_transition_authority.derived_state', filePath);
  const acceptedInputs = expectNonEmptyStringArray(
    stageAuthorityRaw.accepted_inputs,
    'stage_transition_authority.accepted_inputs',
    filePath,
  );
  requireEveryValue(acceptedInputs, TARGET_ARCHITECTURE_ACCEPTED_AUTHORITY_INPUTS, 'stage_transition_authority.accepted_inputs', filePath);
  const forbiddenDirectWriters = expectNonEmptyStringArray(
    stageAuthorityRaw.forbidden_direct_writers,
    'stage_transition_authority.forbidden_direct_writers',
    filePath,
  );
  requireEveryValue(
    forbiddenDirectWriters,
    TARGET_ARCHITECTURE_FORBIDDEN_DIRECT_WRITERS,
    'stage_transition_authority.forbidden_direct_writers',
    filePath,
  );

  const domainPackMustDeclare = expectNonEmptyStringArray(
    domainPackRaw.domain_pack_must_declare,
    'domain_pack_authority_abi.domain_pack_must_declare',
    filePath,
  );
  requireEveryValue(
    domainPackMustDeclare,
    TARGET_ARCHITECTURE_DOMAIN_PACK_DECLARATIONS,
    'domain_pack_authority_abi.domain_pack_must_declare',
    filePath,
  );
  const generatedSurfaces = expectNonEmptyStringArray(
    domainPackRaw.opl_generated_or_hosted_surfaces,
    'domain_pack_authority_abi.opl_generated_or_hosted_surfaces',
    filePath,
  );
  requireEveryValue(
    generatedSurfaces,
    TARGET_ARCHITECTURE_GENERATED_SURFACES,
    'domain_pack_authority_abi.opl_generated_or_hosted_surfaces',
    filePath,
  );
  const authorityFunctions = expectNonEmptyStringArray(
    domainPackRaw.authority_functions,
    'domain_pack_authority_abi.authority_functions',
    filePath,
  );
  requireEveryValue(
    authorityFunctions,
    TARGET_ARCHITECTURE_AUTHORITY_FUNCTIONS,
    'domain_pack_authority_abi.authority_functions',
    filePath,
  );

  const allowedLanes = expectNonEmptyStringArray(
    surfaceBudgetRaw.allowed_lanes,
    'surface_budget_compiler_policy.allowed_lanes',
    filePath,
  );
  requireEveryValue(allowedLanes, TARGET_ARCHITECTURE_LANES, 'surface_budget_compiler_policy.allowed_lanes', filePath);
  const smallDetailLanes = expectNonEmptyStringArray(
    surfaceBudgetRaw.small_detail_default_lanes,
    'surface_budget_compiler_policy.small_detail_default_lanes',
    filePath,
  );
  requireEveryValue(
    smallDetailLanes,
    TARGET_ARCHITECTURE_SMALL_DETAIL_LANES,
    'surface_budget_compiler_policy.small_detail_default_lanes',
    filePath,
  );
  const hardBlockerConditions = expectNonEmptyStringArray(
    surfaceBudgetRaw.hard_blocker_upgrade_conditions,
    'surface_budget_compiler_policy.hard_blocker_upgrade_conditions',
    filePath,
  );
  requireEveryValue(
    hardBlockerConditions,
    TARGET_ARCHITECTURE_HARD_BLOCKER_CONDITIONS,
    'surface_budget_compiler_policy.hard_blocker_upgrade_conditions',
    filePath,
  );
  const acceptedOwnerAnswerShapes = expectNonEmptyStringArray(
    surfaceBudgetRaw.accepted_owner_answer_shapes,
    'surface_budget_compiler_policy.accepted_owner_answer_shapes',
    filePath,
  );
  requireEveryValue(
    acceptedOwnerAnswerShapes,
    TARGET_ARCHITECTURE_ACCEPTED_OWNER_ANSWER_SHAPES,
    'surface_budget_compiler_policy.accepted_owner_answer_shapes',
    filePath,
  );
  const ordinarySurfaceAllowedPlanes = expectAllowedStringArray(
    surfaceBudgetRaw.ordinary_surface_allowed_planes,
    'surface_budget_compiler_policy.ordinary_surface_allowed_planes',
    filePath,
    TARGET_ARCHITECTURE_PLANES,
  );
  requireEveryValue(
    ordinarySurfaceAllowedPlanes,
    TARGET_ARCHITECTURE_ORDINARY_SURFACE_PLANES,
    'surface_budget_compiler_policy.ordinary_surface_allowed_planes',
    filePath,
  );
  const nonAuthoritySurfaceForbiddenOutputs = expectAllowedStringArray(
    surfaceBudgetRaw.non_authority_surface_forbidden_outputs,
    'surface_budget_compiler_policy.non_authority_surface_forbidden_outputs',
    filePath,
    TARGET_ARCHITECTURE_NON_AUTHORITY_FORBIDDEN_OUTPUTS,
  );
  requireEveryValue(
    nonAuthoritySurfaceForbiddenOutputs,
    TARGET_ARCHITECTURE_NON_AUTHORITY_FORBIDDEN_OUTPUTS,
    'surface_budget_compiler_policy.non_authority_surface_forbidden_outputs',
    filePath,
  );
  const multiPlaneOperatingSystem = validateTargetOperatingArchitectureMultiPlaneModel(filePath, multiPlaneRaw);

  const reconcilerLoops = expectNonEmptyStringArray(
    reconcilerRaw.required_loops,
    'reconciler_model.required_loops',
    filePath,
  );
  requireEveryValue(reconcilerLoops, TARGET_ARCHITECTURE_RECONCILER_LOOPS, 'reconciler_model.required_loops', filePath);

  const atlasCatalogs = expectNonEmptyStringArray(
    catalogRaw.atlas_catalogs,
    'catalog_and_telemetry.atlas_catalogs',
    filePath,
  );
  requireEveryValue(atlasCatalogs, TARGET_ARCHITECTURE_ATLAS_CATALOGS, 'catalog_and_telemetry.atlas_catalogs', filePath);
  const vaultRefStreams = expectNonEmptyStringArray(
    catalogRaw.vault_ref_streams,
    'catalog_and_telemetry.vault_ref_streams',
    filePath,
  );
  requireEveryValue(vaultRefStreams, TARGET_ARCHITECTURE_VAULT_REF_STREAMS, 'catalog_and_telemetry.vault_ref_streams', filePath);

  const defaultScreenFields = expectNonEmptyStringArray(
    appConsoleRaw.default_screen_fields,
    'app_console_policy.default_screen_fields',
    filePath,
  );
  requireEveryValue(defaultScreenFields, TARGET_ARCHITECTURE_APP_DEFAULT_FIELDS, 'app_console_policy.default_screen_fields', filePath);
  const drilldownOnlyFields = expectNonEmptyStringArray(
    appConsoleRaw.drilldown_only_fields,
    'app_console_policy.drilldown_only_fields',
    filePath,
  );
  requireEveryValue(drilldownOnlyFields, TARGET_ARCHITECTURE_APP_DRILLDOWN_FIELDS, 'app_console_policy.drilldown_only_fields', filePath);

  const agentLabMayProduce = expectNonEmptyStringArray(
    agentLabRaw.may_produce,
    'agent_lab_improvement_plane.may_produce',
    filePath,
  );
  requireEveryValue(agentLabMayProduce, TARGET_ARCHITECTURE_AGENT_LAB_MAY_PRODUCE, 'agent_lab_improvement_plane.may_produce', filePath);
  const agentLabMustNotProduce = expectNonEmptyStringArray(
    agentLabRaw.must_not_produce,
    'agent_lab_improvement_plane.must_not_produce',
    filePath,
  );
  requireEveryValue(agentLabMustNotProduce, TARGET_ARCHITECTURE_AGENT_LAB_MUST_NOT_PRODUCE, 'agent_lab_improvement_plane.must_not_produce', filePath);

  return {
    contract_kind: (() => {
      const contractKind = expectString(value.contract_kind, 'contract_kind', filePath);
      if (contractKind !== 'opl_target_operating_architecture_contract.v1') {
        throw new FrameworkContractError('contract_shape_invalid', 'target-operating-architecture-contract.json must declare the target operating architecture contract kind.', {
          file: filePath,
          field: 'contract_kind',
          actual: contractKind,
        });
      }
      return contractKind;
    })(),
    schema_version: (() => {
      const schemaVersion = expectString(value.schema_version, 'schema_version', filePath);
      if (schemaVersion !== 'target-operating-architecture.v1') {
        throw new FrameworkContractError('contract_shape_invalid', 'target-operating-architecture-contract.json must declare schema_version target-operating-architecture.v1.', {
          file: filePath,
          field: 'schema_version',
          actual: schemaVersion,
        });
      }
      return schemaVersion;
    })(),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    source_refs: expectNonEmptyStringArray(value.source_refs, 'source_refs', filePath),
    design_principles: designPrinciples,
    resource_model: {
      resource_shape: {
        required_fields: requiredFields,
        spec_status_split_required: expectTrueBoolean(
          resourceShapeRaw.spec_status_split_required,
          'resource_model.resource_shape.spec_status_split_required',
          filePath,
        ),
        status_can_define_desired_state: expectFalseBoolean(
          resourceShapeRaw.status_can_define_desired_state,
          'resource_model.resource_shape.status_can_define_desired_state',
          filePath,
        ),
        conditions_are_status_not_truth: expectTrueBoolean(
          resourceShapeRaw.conditions_are_status_not_truth,
          'resource_model.resource_shape.conditions_are_status_not_truth',
          filePath,
        ),
      },
      resource_kinds: resourceKinds,
    },
    stage_transition_authority: {
      authority_owner: expectString(stageAuthorityRaw.authority_owner, 'stage_transition_authority.authority_owner', filePath),
      single_writer: expectTrueBoolean(stageAuthorityRaw.single_writer, 'stage_transition_authority.single_writer', filePath),
      event_log_policy: expectString(stageAuthorityRaw.event_log_policy, 'stage_transition_authority.event_log_policy', filePath),
      derived_state: derivedState,
      accepted_inputs: acceptedInputs,
      forbidden_direct_writers: forbiddenDirectWriters,
    },
    domain_pack_authority_abi: {
      default_agent_shape: expectString(domainPackRaw.default_agent_shape, 'domain_pack_authority_abi.default_agent_shape', filePath),
      domain_pack_must_declare: domainPackMustDeclare,
      opl_generated_or_hosted_surfaces: generatedSurfaces,
      authority_functions: authorityFunctions,
      private_platform_residue_default_disposition: expectString(
        domainPackRaw.private_platform_residue_default_disposition,
        'domain_pack_authority_abi.private_platform_residue_default_disposition',
        filePath,
      ),
    },
    surface_budget_compiler_policy: {
      ordinary_path_root: expectString(surfaceBudgetRaw.ordinary_path_root, 'surface_budget_compiler_policy.ordinary_path_root', filePath),
      ordinary_progress_spine: isRecord(surfaceBudgetRaw.ordinary_progress_spine)
        ? {
            default_planning_root: expectString(
              surfaceBudgetRaw.ordinary_progress_spine.default_planning_root,
              'surface_budget_compiler_policy.ordinary_progress_spine.default_planning_root',
              filePath,
            ),
            default_next_action_derives_from: expectString(
              surfaceBudgetRaw.ordinary_progress_spine.default_next_action_derives_from,
              'surface_budget_compiler_policy.ordinary_progress_spine.default_next_action_derives_from',
              filePath,
            ),
            lightweight_receipt: expectString(
              surfaceBudgetRaw.ordinary_progress_spine.lightweight_receipt,
              'surface_budget_compiler_policy.ordinary_progress_spine.lightweight_receipt',
              filePath,
            ),
            lightweight_receipt_tier: expectString(
              surfaceBudgetRaw.ordinary_progress_spine.lightweight_receipt_tier,
              'surface_budget_compiler_policy.ordinary_progress_spine.lightweight_receipt_tier',
              filePath,
            ),
            audit_sidecar_role: expectString(
              surfaceBudgetRaw.ordinary_progress_spine.audit_sidecar_role,
              'surface_budget_compiler_policy.ordinary_progress_spine.audit_sidecar_role',
              filePath,
            ),
          }
        : undefined,
      artifact_tiers: expectNonEmptyStringArray(
        surfaceBudgetRaw.artifact_tiers,
        'surface_budget_compiler_policy.artifact_tiers',
        filePath,
      ),
      progress_delta_receipt_cannot_authorize: expectNonEmptyStringArray(
        surfaceBudgetRaw.progress_delta_receipt_cannot_authorize,
        'surface_budget_compiler_policy.progress_delta_receipt_cannot_authorize',
        filePath,
      ),
      audit_sidecar_must_not_generate_default_next_action: expectTrueBoolean(
        surfaceBudgetRaw.audit_sidecar_must_not_generate_default_next_action,
        'surface_budget_compiler_policy.audit_sidecar_must_not_generate_default_next_action',
        filePath,
      ),
      surface_plane_binding_required: expectTrueBoolean(
        surfaceBudgetRaw.surface_plane_binding_required,
        'surface_budget_compiler_policy.surface_plane_binding_required',
        filePath,
      ),
      default_surface_requires_plane_ref: expectTrueBoolean(
        surfaceBudgetRaw.default_surface_requires_plane_ref,
        'surface_budget_compiler_policy.default_surface_requires_plane_ref',
        filePath,
      ),
      ordinary_surface_allowed_planes: ordinarySurfaceAllowedPlanes,
      non_authority_surface_forbidden_outputs: nonAuthoritySurfaceForbiddenOutputs,
      allowed_lanes: allowedLanes,
      small_detail_default_lanes: smallDetailLanes,
      hard_blocker_upgrade_conditions: hardBlockerConditions,
      ordinary_path_must_not_be_overridden_by: expectNonEmptyStringArray(
        surfaceBudgetRaw.ordinary_path_must_not_be_overridden_by,
        'surface_budget_compiler_policy.ordinary_path_must_not_be_overridden_by',
        filePath,
      ),
      accepted_owner_answer_shapes: acceptedOwnerAnswerShapes,
    },
    multi_plane_operating_system: multiPlaneOperatingSystem,
    reconciler_model: {
      loop_granularity: expectString(reconcilerRaw.loop_granularity, 'reconciler_model.loop_granularity', filePath),
      required_loops: reconcilerLoops,
      loop_authority_boundary: validateFalseBoundaryRecord(
        filePath,
        reconcilerRaw.loop_authority_boundary,
        'reconciler_model.loop_authority_boundary',
      ),
      substrate_policy: {
        temporal_role: expectString(
          reconcilerSubstratePolicyRaw.temporal_role,
          'reconciler_model.substrate_policy.temporal_role',
          filePath,
        ),
        worker_supervisor_role: expectString(
          reconcilerSubstratePolicyRaw.worker_supervisor_role,
          'reconciler_model.substrate_policy.worker_supervisor_role',
          filePath,
        ),
        progress_reconciler_role: expectString(
          reconcilerSubstratePolicyRaw.progress_reconciler_role,
          'reconciler_model.substrate_policy.progress_reconciler_role',
          filePath,
        ),
        false_authority_boundary: expectString(
          reconcilerSubstratePolicyRaw.false_authority_boundary,
          'reconciler_model.substrate_policy.false_authority_boundary',
          filePath,
        ),
      },
    },
    catalog_and_telemetry: {
      atlas_catalogs: atlasCatalogs,
      vault_ref_streams: vaultRefStreams,
      vault_policy: expectString(catalogRaw.vault_policy, 'catalog_and_telemetry.vault_policy', filePath),
      telemetry_body_policy: expectString(catalogRaw.telemetry_body_policy, 'catalog_and_telemetry.telemetry_body_policy', filePath),
    },
    app_console_policy: {
      default_screen_fields: defaultScreenFields,
      drilldown_only_fields: drilldownOnlyFields,
      gui_truth_owner: expectString(appConsoleRaw.gui_truth_owner, 'app_console_policy.gui_truth_owner', filePath),
      framework_role: expectString(appConsoleRaw.framework_role, 'app_console_policy.framework_role', filePath),
    },
    experience_operating_model: validateTargetOperatingArchitectureExperienceModel(
      filePath,
      experienceOperatingModelRaw,
    ),
    agent_lab_improvement_plane: {
      role: expectString(agentLabRaw.role, 'agent_lab_improvement_plane.role', filePath),
      may_produce: agentLabMayProduce,
      must_not_produce: agentLabMustNotProduce,
    },
    one_shot_plan_landing_model: validateOneShotPlanLandingModel(
      filePath,
      oneShotPlanLandingModelRaw,
    ),
    foundry_agent_os_standard: validateFoundryAgentOsStandard(
      filePath,
      foundryAgentOsStandardRaw,
    ),
    flagship_experience_mapping: validateFlagshipExperienceMapping(
      filePath,
      flagshipExperienceMappingRaw,
    ),
    authority_boundary: validateFalseBoundaryRecord(filePath, value.authority_boundary, 'authority_boundary'),
    forbidden_claims: expectNonEmptyStringArray(value.forbidden_claims, 'forbidden_claims', filePath),
  };
}
