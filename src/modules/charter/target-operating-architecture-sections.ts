import type { TargetOperatingArchitectureContract } from '../../kernel/types.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  expectBrandModuleId,
  expectNonEmptyStringArray,
  requireEveryValue,
} from './brand-module-contracts.ts';
import {
  listStandardDomainAgentIds,
  STANDARD_AGENT_REGISTRY_REF,
} from '../../kernel/standard-agent-registry.ts';
import {
  TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CAPABILITY_REGISTRY_MODULES,
  TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_CONFORMANCE_CLAIMS,
  TARGET_ARCHITECTURE_FOUNDRY_AGENT_OS_FORBIDDEN_CLAIMS,
  TARGET_ARCHITECTURE_GENERATED_SURFACES,
  TARGET_ARCHITECTURE_LANES,
  TARGET_ARCHITECTURE_PLANE_FORBIDDEN_CLAIMS,
  TARGET_ARCHITECTURE_PLANES,
  expectBrandModuleIdArray,
  expectFalseBoolean,
  expectTrueBoolean,
  validateFalseBoundaryRecord,
} from './target-operating-architecture-shared.ts';

export function validateFoundryAgentOsStandard(filePath: string, value: unknown) {
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
  const standardAgentRegistryRef = expectString(
    value.standard_agent_registry_ref,
    'foundry_agent_os_standard.standard_agent_registry_ref',
    filePath,
  );
  if (standardAgentRegistryRef !== STANDARD_AGENT_REGISTRY_REF) {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.standard_agent_registry_ref must point at the canonical StandardAgentRegistry.', {
      file: filePath,
      field: 'foundry_agent_os_standard.standard_agent_registry_ref',
      actual: standardAgentRegistryRef,
      expected: STANDARD_AGENT_REGISTRY_REF,
    });
  }

const capabilityRegistryRaw = value.capability_registry_boundary;
  if (!isRecord(capabilityRegistryRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'foundry_agent_os_standard must declare the capability registry boundary.',
      { file: filePath, field: 'foundry_agent_os_standard' },
    );
  }

  const newAgentBaselineHandoffPolicyRaw = value.new_agent_baseline_handoff_policy;
  if (!isRecord(newAgentBaselineHandoffPolicyRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'foundry_agent_os_standard.new_agent_baseline_handoff_policy must be an object.',
      { file: filePath, field: 'foundry_agent_os_standard.new_agent_baseline_handoff_policy' },
    );
  }
  const newAgentBaselineHandoffSurfaceKind = expectString(
    newAgentBaselineHandoffPolicyRaw.surface_kind,
    'foundry_agent_os_standard.new_agent_baseline_handoff_policy.surface_kind',
    filePath,
  );
  if (newAgentBaselineHandoffSurfaceKind !== 'opl_foundry_new_agent_baseline_handoff_policy') {
    throw new FrameworkContractError('contract_shape_invalid', 'new agent baseline handoff policy must use the OPL Foundry policy surface.', {
      file: filePath,
      field: 'foundry_agent_os_standard.new_agent_baseline_handoff_policy.surface_kind',
      actual: newAgentBaselineHandoffSurfaceKind,
    });
  }
  const newAgentBaselineRequiredGates = expectNonEmptyStringArray(
    newAgentBaselineHandoffPolicyRaw.required_gates,
    'foundry_agent_os_standard.new_agent_baseline_handoff_policy.required_gates',
    filePath,
  );
  for (const requiredGate of [
    'scaffold_validation',
    'generated_interface_projection',
    'agent_lab_baseline_or_takeover_suite',
    'independent_reviewer_assessment',
    'oma_improvement_or_no_patch_loop',
    'delivery_receipt_or_work_order_or_typed_blocker',
  ]) {
    if (!newAgentBaselineRequiredGates.includes(requiredGate)) {
      throw new FrameworkContractError('contract_shape_invalid', 'new agent baseline handoff policy is missing a required gate.', {
        file: filePath,
        field: 'foundry_agent_os_standard.new_agent_baseline_handoff_policy.required_gates',
        missing: requiredGate,
      });
    }
  }
  const acceptedTerminalOutcomes = expectNonEmptyStringArray(
    newAgentBaselineHandoffPolicyRaw.accepted_terminal_outcomes,
    'foundry_agent_os_standard.new_agent_baseline_handoff_policy.accepted_terminal_outcomes',
    filePath,
  );
  for (const acceptedOutcome of [
    'delivery_receipt',
    'no_patch_coordination_receipt',
    'developer_patch_work_order',
    'typed_blocker',
  ]) {
    if (!acceptedTerminalOutcomes.includes(acceptedOutcome)) {
      throw new FrameworkContractError('contract_shape_invalid', 'new agent baseline handoff policy is missing an accepted terminal outcome.', {
        file: filePath,
        field: 'foundry_agent_os_standard.new_agent_baseline_handoff_policy.accepted_terminal_outcomes',
        missing: acceptedOutcome,
      });
    }
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

  const defaultOwnerRoutePolicyRaw = value.default_owner_route_policy;
  if (!isRecord(defaultOwnerRoutePolicyRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy must be an object.', {
      file: filePath,
      field: 'foundry_agent_os_standard.default_owner_route_policy',
    });
  }
  const defaultOwnerRoutePolicySurfaceKind = expectString(
    defaultOwnerRoutePolicyRaw.surface_kind,
    'foundry_agent_os_standard.default_owner_route_policy.surface_kind',
    filePath,
  );
  if (defaultOwnerRoutePolicySurfaceKind !== 'foundry_agent_default_owner_route_policy') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy must use the Foundry Agent default owner route policy surface.', {
      file: filePath,
      field: 'foundry_agent_os_standard.default_owner_route_policy.surface_kind',
      actual: defaultOwnerRoutePolicySurfaceKind,
    });
  }
  const defaultOwnerRoutePolicyAgentIds = expectNonEmptyStringArray(
    defaultOwnerRoutePolicyRaw.applies_to_agent_ids,
    'foundry_agent_os_standard.default_owner_route_policy.applies_to_agent_ids',
    filePath,
  );
  const standardDomainAgentIds = listStandardDomainAgentIds();
  for (const agentId of defaultOwnerRoutePolicyAgentIds) {
    if (!standardDomainAgentIds.includes(agentId as typeof standardDomainAgentIds[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy.applies_to_agent_ids must reference standard domain agents.', {
        file: filePath,
        field: 'foundry_agent_os_standard.default_owner_route_policy.applies_to_agent_ids',
        actual: agentId,
      });
    }
  }
  requireEveryValue(
    defaultOwnerRoutePolicyAgentIds,
    standardDomainAgentIds,
    'foundry_agent_os_standard.default_owner_route_policy.applies_to_agent_ids',
    filePath,
  );
  const defaultOwnerRouteRoot = expectString(
    defaultOwnerRoutePolicyRaw.default_route_root,
    'foundry_agent_os_standard.default_owner_route_policy.default_route_root',
    filePath,
  );
  if (defaultOwnerRouteRoot !== 'current_owner_delta') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy.default_route_root must be current_owner_delta.', {
      file: filePath,
      field: 'foundry_agent_os_standard.default_owner_route_policy.default_route_root',
      actual: defaultOwnerRouteRoot,
    });
  }
  const defaultExecutionResource = expectString(
    defaultOwnerRoutePolicyRaw.default_execution_resource,
    'foundry_agent_os_standard.default_owner_route_policy.default_execution_resource',
    filePath,
  );
  if (defaultExecutionResource !== 'StageRun') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy.default_execution_resource must be StageRun.', {
      file: filePath,
      field: 'foundry_agent_os_standard.default_owner_route_policy.default_execution_resource',
      actual: defaultExecutionResource,
    });
  }
  const generatedSurfaceEntrypoints = expectNonEmptyStringArray(
    defaultOwnerRoutePolicyRaw.generated_surface_entrypoints,
    'foundry_agent_os_standard.default_owner_route_policy.generated_surface_entrypoints',
    filePath,
  );
  for (const entrypoint of generatedSurfaceEntrypoints) {
    if (!TARGET_ARCHITECTURE_GENERATED_SURFACES.includes(entrypoint as typeof TARGET_ARCHITECTURE_GENERATED_SURFACES[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy.generated_surface_entrypoints must be generated or hosted surfaces.', {
        file: filePath,
        field: 'foundry_agent_os_standard.default_owner_route_policy.generated_surface_entrypoints',
        actual: entrypoint,
      });
    }
  }
  requireEveryValue(
    generatedSurfaceEntrypoints,
    ['cli', 'skill_plugin', 'product_entry', 'status_read_model', 'workbench'],
    'foundry_agent_os_standard.default_owner_route_policy.generated_surface_entrypoints',
    filePath,
  );
  const privateWrapperDisposition = expectString(
    defaultOwnerRoutePolicyRaw.private_wrapper_disposition,
    'foundry_agent_os_standard.default_owner_route_policy.private_wrapper_disposition',
    filePath,
  );
  if (privateWrapperDisposition !== 'repo_local_runner_private_wrapper_or_generic_owner_surface_is_migration_residue_or_deletion_gate_not_default_owner') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.default_owner_route_policy.private_wrapper_disposition must keep private wrappers out of the default owner route.', {
      file: filePath,
      field: 'foundry_agent_os_standard.default_owner_route_policy.private_wrapper_disposition',
      actual: privateWrapperDisposition,
    });
  }
  const defaultOwnerRouteFalseAuthority = validateFalseBoundaryRecord(
    filePath,
    defaultOwnerRoutePolicyRaw.false_authority_boundary,
    'foundry_agent_os_standard.default_owner_route_policy.false_authority_boundary',
  );

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
  const readbackContractRaw = value.os_readback_contract;
  if (!isRecord(readbackContractRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.os_readback_contract must be an object.', {
      file: filePath,
      field: 'foundry_agent_os_standard.os_readback_contract',
    });
  }
  const readbackSurfaceKind = expectString(
    readbackContractRaw.surface_kind,
    'foundry_agent_os_standard.os_readback_contract.surface_kind',
    filePath,
  );
  if (readbackSurfaceKind !== 'foundry_agent_os_readback_contract') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.os_readback_contract.surface_kind must be foundry_agent_os_readback_contract.', {
      file: filePath,
      field: 'foundry_agent_os_standard.os_readback_contract.surface_kind',
      actual: readbackSurfaceKind,
    });
  }
  const readbackCompletionAuditContractRef = expectString(
    readbackContractRaw.completion_audit_contract_ref,
    'foundry_agent_os_standard.os_readback_contract.completion_audit_contract_ref',
    filePath,
  );
  if (readbackCompletionAuditContractRef !== 'contracts/opl-framework/opl-flow-completion-audit-contract.json') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.os_readback_contract must bind to the OPL Flow completion audit contract.', {
      file: filePath,
      field: 'foundry_agent_os_standard.os_readback_contract.completion_audit_contract_ref',
      actual: readbackCompletionAuditContractRef,
    });
  }
  const readbackClaimScope = expectString(
    readbackContractRaw.claim_scope,
    'foundry_agent_os_standard.os_readback_contract.claim_scope',
    filePath,
  );
  if (readbackClaimScope !== 'thorough_landing') {
    throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.os_readback_contract.claim_scope must stay thorough_landing.', {
      file: filePath,
      field: 'foundry_agent_os_standard.os_readback_contract.claim_scope',
      actual: readbackClaimScope,
    });
  }
  const acceptedReadbackEvidenceKinds = expectNonEmptyStringArray(
    readbackContractRaw.accepted_100_percent_evidence_kinds,
    'foundry_agent_os_standard.os_readback_contract.accepted_100_percent_evidence_kinds',
    filePath,
  );
  const insufficientReadbackEvidenceKinds = expectNonEmptyStringArray(
    readbackContractRaw.insufficient_100_percent_evidence_kinds,
    'foundry_agent_os_standard.os_readback_contract.insufficient_100_percent_evidence_kinds',
    filePath,
  );
  for (const insufficientEvidenceKind of ['docs_updated', 'refs_only_surface_landed', 'tests_passed_only', 'commit_pushed_only', 'subagent_reported_complete']) {
    if (!insufficientReadbackEvidenceKinds.includes(insufficientEvidenceKind)) {
      throw new FrameworkContractError('contract_shape_invalid', 'foundry_agent_os_standard.os_readback_contract is missing a false-completion evidence kind.', {
        file: filePath,
        field: 'foundry_agent_os_standard.os_readback_contract.insufficient_100_percent_evidence_kinds',
        missing: insufficientEvidenceKind,
      });
    }
  }

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
    standard_agent_registry_ref: standardAgentRegistryRef,
    target_shape: targetShape,
    new_agent_baseline_handoff_policy: {
      surface_kind: newAgentBaselineHandoffSurfaceKind,
      policy_id: expectString(
        newAgentBaselineHandoffPolicyRaw.policy_id,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.policy_id',
        filePath,
      ),
      owner: expectString(
        newAgentBaselineHandoffPolicyRaw.owner,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.owner',
        filePath,
      ),
      oma_owner: expectString(
        newAgentBaselineHandoffPolicyRaw.oma_owner,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.oma_owner',
        filePath,
      ),
      required_gates: newAgentBaselineRequiredGates,
      scaffold_or_generated_interface_can_claim_complete: expectFalseBoolean(
        newAgentBaselineHandoffPolicyRaw.scaffold_or_generated_interface_can_claim_complete,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.scaffold_or_generated_interface_can_claim_complete',
        filePath,
      ),
      conformance_or_suite_pass_can_claim_complete: expectFalseBoolean(
        newAgentBaselineHandoffPolicyRaw.conformance_or_suite_pass_can_claim_complete,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.conformance_or_suite_pass_can_claim_complete',
        filePath,
      ),
      exactly_one_terminal_outcome_required: expectTrueBoolean(
        newAgentBaselineHandoffPolicyRaw.exactly_one_terminal_outcome_required,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.exactly_one_terminal_outcome_required',
        filePath,
      ),
      accepted_terminal_outcomes: acceptedTerminalOutcomes,
      authority_boundary: validateFalseBoundaryRecord(
        filePath,
        newAgentBaselineHandoffPolicyRaw.authority_boundary,
        'foundry_agent_os_standard.new_agent_baseline_handoff_policy.authority_boundary',
      ),
    },
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
    default_owner_route_policy: {
      surface_kind: defaultOwnerRoutePolicySurfaceKind,
      applies_to_agent_ids: defaultOwnerRoutePolicyAgentIds,
      default_route_root: defaultOwnerRouteRoot,
      default_execution_resource: defaultExecutionResource,
      generated_surface_entrypoints: generatedSurfaceEntrypoints,
      owner_boundary: expectString(
        defaultOwnerRoutePolicyRaw.owner_boundary,
        'foundry_agent_os_standard.default_owner_route_policy.owner_boundary',
        filePath,
      ),
      private_wrapper_disposition: privateWrapperDisposition,
      false_authority_boundary: defaultOwnerRouteFalseAuthority,
    },
    cross_agent_conformance_required_claims: conformanceClaims,
    os_readback_contract: {
      surface_kind: readbackSurfaceKind,
      completion_audit_contract_ref: readbackCompletionAuditContractRef,
      claim_scope: readbackClaimScope,
      requires_lane_to_plan_mapping: expectTrueBoolean(
        readbackContractRaw.requires_lane_to_plan_mapping,
        'foundry_agent_os_standard.os_readback_contract.requires_lane_to_plan_mapping',
        filePath,
      ),
      requires_main_session_fresh_verification: expectTrueBoolean(
        readbackContractRaw.requires_main_session_fresh_verification,
        'foundry_agent_os_standard.os_readback_contract.requires_main_session_fresh_verification',
        filePath,
      ),
      docs_refs_tests_commit_only_can_score_100: expectFalseBoolean(
        readbackContractRaw.docs_refs_tests_commit_only_can_score_100,
        'foundry_agent_os_standard.os_readback_contract.docs_refs_tests_commit_only_can_score_100',
        filePath,
      ),
      readback_contract_landed_can_claim_complete: expectFalseBoolean(
        readbackContractRaw.readback_contract_landed_can_claim_complete,
        'foundry_agent_os_standard.os_readback_contract.readback_contract_landed_can_claim_complete',
        filePath,
      ),
      accepted_100_percent_evidence_kinds: acceptedReadbackEvidenceKinds,
      insufficient_100_percent_evidence_kinds: insufficientReadbackEvidenceKinds,
    },
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

export function validateTargetOperatingArchitectureMultiPlaneModel(
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

export {
  validateOneShotPlanLandingModel,
  validateTargetOperatingArchitectureExperienceModel,
} from './target-operating-architecture-plan-experience.ts';
