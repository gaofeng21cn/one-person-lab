import type { TargetOperatingArchitectureContract } from '../../kernel/types.ts';
import {
  FrameworkContractError,
  expectString,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  expectAllowedStringArray,
  expectNonEmptyStringArray,
  requireEveryValue,
} from './brand-module-contracts.ts';
import {
  TARGET_ARCHITECTURE_ACCEPTED_OWNER_ANSWER_SHAPES,
  TARGET_ARCHITECTURE_AGENT_LAB_MAY_PRODUCE,
  TARGET_ARCHITECTURE_AGENT_LAB_MUST_NOT_PRODUCE,
  TARGET_ARCHITECTURE_APP_DEFAULT_FIELDS,
  TARGET_ARCHITECTURE_APP_DRILLDOWN_FIELDS,
  TARGET_ARCHITECTURE_ATLAS_CATALOGS,
  TARGET_ARCHITECTURE_AUTHORITY_FUNCTIONS,
  TARGET_ARCHITECTURE_PASSIVE_STAGE_PROJECTIONS,
  TARGET_ARCHITECTURE_DESIGN_PRINCIPLES,
  TARGET_ARCHITECTURE_DOMAIN_PACK_DECLARATIONS,
  TARGET_ARCHITECTURE_FORBIDDEN_FRAMEWORK_ROUTE_DECISIONS,
  TARGET_ARCHITECTURE_GENERATED_SURFACES,
  TARGET_ARCHITECTURE_HARD_BLOCKER_CONDITIONS,
  TARGET_ARCHITECTURE_LANES,
  TARGET_ARCHITECTURE_NON_AUTHORITY_FORBIDDEN_OUTPUTS,
  TARGET_ARCHITECTURE_ORDINARY_SURFACE_PLANES,
  TARGET_ARCHITECTURE_PLANES,
  TARGET_ARCHITECTURE_RECONCILER_LOOPS,
  TARGET_ARCHITECTURE_RESOURCE_FIELDS,
  TARGET_ARCHITECTURE_RESOURCE_KINDS,
  TARGET_ARCHITECTURE_STAGE_ROUTE_CAPABILITIES,
  TARGET_ARCHITECTURE_SMALL_DETAIL_LANES,
  TARGET_ARCHITECTURE_VAULT_REF_STREAMS,
  expectFalseBoolean,
  expectTrueBoolean,
  validateFalseBoundaryRecord,
} from './target-operating-architecture-shared.ts';
import {
  validateFlagshipExperienceMapping,
  validateFoundryAgentOsStandard,
  validateOneShotPlanLandingModel,
  validateTargetOperatingArchitectureExperienceModel,
  validateTargetOperatingArchitectureMultiPlaneModel,
} from './target-operating-architecture-sections.ts';

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
  const codexRouteOwnerRaw = value.codex_stage_route_owner;
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
    || !isRecord(codexRouteOwnerRaw)
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

  const passiveFrameworkProjections = expectNonEmptyStringArray(
    codexRouteOwnerRaw.passive_framework_projections,
    'codex_stage_route_owner.passive_framework_projections',
    filePath,
  );
  requireEveryValue(passiveFrameworkProjections, TARGET_ARCHITECTURE_PASSIVE_STAGE_PROJECTIONS, 'codex_stage_route_owner.passive_framework_projections', filePath);
  const routeCapabilities = expectNonEmptyStringArray(
    codexRouteOwnerRaw.route_capabilities,
    'codex_stage_route_owner.route_capabilities',
    filePath,
  );
  requireEveryValue(routeCapabilities, TARGET_ARCHITECTURE_STAGE_ROUTE_CAPABILITIES, 'codex_stage_route_owner.route_capabilities', filePath);
  const forbiddenFrameworkRouteDecisions = expectNonEmptyStringArray(
    codexRouteOwnerRaw.forbidden_framework_route_decisions,
    'codex_stage_route_owner.forbidden_framework_route_decisions',
    filePath,
  );
  requireEveryValue(
    forbiddenFrameworkRouteDecisions,
    TARGET_ARCHITECTURE_FORBIDDEN_FRAMEWORK_ROUTE_DECISIONS,
    'codex_stage_route_owner.forbidden_framework_route_decisions',
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
  const ledgerRefStreams = expectNonEmptyStringArray(
    catalogRaw.ledger_ref_streams,
    'catalog_and_telemetry.ledger_ref_streams',
    filePath,
  );
  requireEveryValue(ledgerRefStreams, TARGET_ARCHITECTURE_VAULT_REF_STREAMS, 'catalog_and_telemetry.ledger_ref_streams', filePath);

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
    codex_stage_route_owner: {
      semantic_owner: (() => {
        const owner = expectString(codexRouteOwnerRaw.semantic_owner, 'codex_stage_route_owner.semantic_owner', filePath);
        if (owner !== 'codex_cli') {
          throw new FrameworkContractError('contract_shape_invalid', 'codex_stage_route_owner.semantic_owner must be codex_cli.', { file: filePath, actual: owner });
        }
        return 'codex_cli' as const;
      })(),
      single_semantic_control_plane: expectTrueBoolean(codexRouteOwnerRaw.single_semantic_control_plane, 'codex_stage_route_owner.single_semantic_control_plane', filePath),
      progression_policy: expectString(codexRouteOwnerRaw.progression_policy, 'codex_stage_route_owner.progression_policy', filePath),
      route_capabilities: routeCapabilities,
      passive_framework_projections: passiveFrameworkProjections,
      forbidden_framework_route_decisions: forbiddenFrameworkRouteDecisions,
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
      ledger_ref_streams: ledgerRefStreams,
      ledger_policy: expectString(catalogRaw.ledger_policy, 'catalog_and_telemetry.ledger_policy', filePath),
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
