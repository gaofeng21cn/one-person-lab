import type {
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  BrandModuleL5EvidenceState,
  BrandModuleL5OperatingEvidenceContract,
} from '../../kernel/types.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from '../../kernel/contract-validation.ts';

const BRAND_MODULE_IDS = [
  'charter',
  'atlas',
  'workspace',
  'pack',
  'stagecraft',
  'runway',
  'ledger',
  'console',
  'foundry',
  'connect',
] as const satisfies readonly BrandModuleId[];

const BRAND_MODULE_L5_EVIDENCE_CLASSES = [
  'live_user_path',
  'ordinary_app_experience',
  'cross_agent_scaleout',
  'long_soak_recovery',
  'release_install_evidence',
  'operator_repair_loop',
  'owner_acceptance',
  'no_second_truth_regression',
  'pack_compile_parity',
  'current_owner_delta_default_read',
  'capability_fail_open_boundary',
  'domain_authority_false_boundary',
  'cross_agent_foundry_agent_os_adoption',
] as const satisfies readonly BrandModuleL5EvidenceClassId[];

const BRAND_MODULE_L5_EVIDENCE_STATES = [
  'open',
  'satisfied',
  'blocked',
] as const satisfies readonly BrandModuleL5EvidenceState[];

function expectFalseBoolean(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, { file: filePath, field });
  }
  return false as const;
}

function expectNonEmptyStringArray(value: unknown, field: string, filePath: string) {
  const items = expectStringArray(value, field, filePath);
  if (items.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain at least one entry.`, {
      file: filePath,
      field,
    });
  }
  return items;
}

function expectBrandModuleId(value: unknown, field: string, filePath: string): BrandModuleId {
  const moduleId = expectString(value, field, filePath);
  if (!(BRAND_MODULE_IDS as readonly string[]).includes(moduleId)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a known OPL brand module id.`, {
      file: filePath,
      field,
      actual: moduleId,
      allowed: [...BRAND_MODULE_IDS],
    });
  }

  return moduleId as BrandModuleId;
}

function expectBrandModuleL5EvidenceClassId(
  value: unknown,
  field: string,
  filePath: string,
): BrandModuleL5EvidenceClassId {
  const classId = expectString(value, field, filePath);
  if (!(BRAND_MODULE_L5_EVIDENCE_CLASSES as readonly string[]).includes(classId)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a known L5 evidence class id.`, {
      file: filePath,
      field,
      actual: classId,
      allowed: [...BRAND_MODULE_L5_EVIDENCE_CLASSES],
    });
  }

  return classId as BrandModuleL5EvidenceClassId;
}

function expectBrandModuleL5EvidenceState(
  value: unknown,
  field: string,
  filePath: string,
): BrandModuleL5EvidenceState {
  const state = expectString(value, field, filePath);
  if (!(BRAND_MODULE_L5_EVIDENCE_STATES as readonly string[]).includes(state)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a known L5 evidence state.`, {
      file: filePath,
      field,
      actual: state,
      allowed: [...BRAND_MODULE_L5_EVIDENCE_STATES],
    });
  }

  return state as BrandModuleL5EvidenceState;
}

function optionalNonEmptyStringArrayField(
  value: Record<string, unknown>,
  field: string,
  filePath: string,
) {
  if (value[field] === undefined) {
    return undefined;
  }

  return expectNonEmptyStringArray(value[field], field, filePath);
}

export function validateBrandModuleL5OperatingEvidence(
  filePath: string,
  value: unknown,
): BrandModuleL5OperatingEvidenceContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-module-l5-operating-evidence.json must contain an object root.',
      { file: filePath },
    );
  }

  const evidenceClassesRaw = value.evidence_classes;
  const modulesRaw = value.modules;
  const claimPolicyRaw = value.l5_claim_policy;
  const ownerRouteWorkOrderPolicyRaw = value.owner_route_work_order_policy;
  const evidenceLedgerSurfacesRaw = value.evidence_ledger_surfaces;
  if (
    !Array.isArray(evidenceClassesRaw)
    || !Array.isArray(modulesRaw)
    || !isRecord(claimPolicyRaw)
    || !isRecord(ownerRouteWorkOrderPolicyRaw)
    || !isRecord(evidenceLedgerSurfacesRaw)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-module-l5-operating-evidence.json must contain l5_claim_policy, owner_route_work_order_policy, evidence_ledger_surfaces, evidence_classes, and modules.',
      { file: filePath },
    );
  }

  const baselineLevel = expectString(value.baseline_level, 'baseline_level', filePath);
  if (baselineLevel !== 'L4_structural_baseline') {
    throw new FrameworkContractError('contract_shape_invalid', 'baseline_level must be L4_structural_baseline.', {
      file: filePath,
      field: 'baseline_level',
      actual: baselineLevel,
    });
  }

  const targetLevel = expectString(value.target_level, 'target_level', filePath);
  if (targetLevel !== 'L5_production_operating_maturity') {
    throw new FrameworkContractError('contract_shape_invalid', 'target_level must be L5_production_operating_maturity.', {
      file: filePath,
      field: 'target_level',
      actual: targetLevel,
    });
  }

  const l5ClaimPolicy = {
    all_required_evidence_must_be_satisfied: (() => {
      const field = 'l5_claim_policy.all_required_evidence_must_be_satisfied';
      const actual = expectBoolean(claimPolicyRaw.all_required_evidence_must_be_satisfied, field, filePath);
      if (actual !== true) {
        throw new FrameworkContractError('contract_shape_invalid', `${field} must be true.`, {
          file: filePath,
          field,
        });
      }
      return true as const;
    })(),
    docs_foldback_counts_as_l5: expectFalseBoolean(
      claimPolicyRaw.docs_foldback_counts_as_l5,
      'l5_claim_policy.docs_foldback_counts_as_l5',
      filePath,
    ),
    contract_validation_counts_as_l5: expectFalseBoolean(
      claimPolicyRaw.contract_validation_counts_as_l5,
      'l5_claim_policy.contract_validation_counts_as_l5',
      filePath,
    ),
    provider_completion_counts_as_l5: expectFalseBoolean(
      claimPolicyRaw.provider_completion_counts_as_l5,
      'l5_claim_policy.provider_completion_counts_as_l5',
      filePath,
    ),
    app_projection_counts_as_l5: expectFalseBoolean(
      claimPolicyRaw.app_projection_counts_as_l5,
      'l5_claim_policy.app_projection_counts_as_l5',
      filePath,
    ),
    conformance_pass_counts_as_l5: expectFalseBoolean(
      claimPolicyRaw.conformance_pass_counts_as_l5,
      'l5_claim_policy.conformance_pass_counts_as_l5',
      filePath,
    ),
  };

  const ownerRouteWorkOrderPolicy = {
    surface_kind: expectString(
      ownerRouteWorkOrderPolicyRaw.surface_kind,
      'owner_route_work_order_policy.surface_kind',
      filePath,
    ),
    work_orders_are_refs_only: (() => {
      const field = 'owner_route_work_order_policy.work_orders_are_refs_only';
      const actual = expectBoolean(ownerRouteWorkOrderPolicyRaw.work_orders_are_refs_only, field, filePath);
      if (actual !== true) {
        throw new FrameworkContractError('contract_shape_invalid', `${field} must be true.`, {
          file: filePath,
          field,
        });
      }
      return true as const;
    })(),
    work_orders_close_l5: expectFalseBoolean(
      ownerRouteWorkOrderPolicyRaw.work_orders_close_l5,
      'owner_route_work_order_policy.work_orders_close_l5',
      filePath,
    ),
    work_orders_can_create_owner_receipt: expectFalseBoolean(
      ownerRouteWorkOrderPolicyRaw.work_orders_can_create_owner_receipt,
      'owner_route_work_order_policy.work_orders_can_create_owner_receipt',
      filePath,
    ),
    work_orders_can_create_typed_blocker: expectFalseBoolean(
      ownerRouteWorkOrderPolicyRaw.work_orders_can_create_typed_blocker,
      'owner_route_work_order_policy.work_orders_can_create_typed_blocker',
      filePath,
    ),
    work_orders_can_claim_production_ready: expectFalseBoolean(
      ownerRouteWorkOrderPolicyRaw.work_orders_can_claim_production_ready,
      'owner_route_work_order_policy.work_orders_can_claim_production_ready',
      filePath,
    ),
    accepted_route_ref_shapes: expectNonEmptyStringArray(
      ownerRouteWorkOrderPolicyRaw.accepted_route_ref_shapes,
      'owner_route_work_order_policy.accepted_route_ref_shapes',
      filePath,
    ),
    non_closing_inputs: expectNonEmptyStringArray(
      ownerRouteWorkOrderPolicyRaw.non_closing_inputs,
      'owner_route_work_order_policy.non_closing_inputs',
      filePath,
    ),
  };
  if (ownerRouteWorkOrderPolicy.surface_kind !== 'opl_brand_module_l5_owner_route_work_order_policy') {
    throw new FrameworkContractError('contract_shape_invalid', 'owner_route_work_order_policy.surface_kind must be canonical.', {
      file: filePath,
      field: 'owner_route_work_order_policy.surface_kind',
      actual: ownerRouteWorkOrderPolicy.surface_kind,
    });
  }
  for (const requiredRefShape of [
    'owner_acceptance_ref',
    'owner_receipt_ref',
    'typed_blocker_ref',
    'human_gate_ref',
  ]) {
    if (!ownerRouteWorkOrderPolicy.accepted_route_ref_shapes.includes(requiredRefShape)) {
      throw new FrameworkContractError('contract_shape_invalid', 'owner_route_work_order_policy.accepted_route_ref_shapes must include owner acceptance, owner receipt, typed blocker, and human gate refs.', {
        file: filePath,
        field: 'owner_route_work_order_policy.accepted_route_ref_shapes',
        missing_ref_shape: requiredRefShape,
      });
    }
  }
  for (const nonClosingInput of [
    'contract_validation',
    'docs_foldback',
    'conformance_pass',
    'provider_completion',
    'app_projection',
    'verified_refs_only_ledger',
  ]) {
    if (!ownerRouteWorkOrderPolicy.non_closing_inputs.includes(nonClosingInput)) {
      throw new FrameworkContractError('contract_shape_invalid', 'owner_route_work_order_policy.non_closing_inputs must include all false-closing inputs.', {
        file: filePath,
        field: 'owner_route_work_order_policy.non_closing_inputs',
        missing_input: nonClosingInput,
      });
    }
  }

  const evidenceLedgerSurfaces = {
    record_command: expectString(
      evidenceLedgerSurfacesRaw.record_command,
      'evidence_ledger_surfaces.record_command',
      filePath,
    ),
    verify_command: expectString(
      evidenceLedgerSurfacesRaw.verify_command,
      'evidence_ledger_surfaces.verify_command',
      filePath,
    ),
    list_command: expectString(
      evidenceLedgerSurfacesRaw.list_command,
      'evidence_ledger_surfaces.list_command',
      filePath,
    ),
    ledger_file_name: expectString(
      evidenceLedgerSurfacesRaw.ledger_file_name,
      'evidence_ledger_surfaces.ledger_file_name',
      filePath,
    ),
    refs_only: (() => {
      const field = 'evidence_ledger_surfaces.refs_only';
      const actual = expectBoolean(evidenceLedgerSurfacesRaw.refs_only, field, filePath);
      if (actual !== true) {
        throw new FrameworkContractError('contract_shape_invalid', `${field} must be true.`, {
          file: filePath,
          field,
        });
      }
      return true as const;
    })(),
    can_claim_l5_complete: expectFalseBoolean(
      evidenceLedgerSurfacesRaw.can_claim_l5_complete,
      'evidence_ledger_surfaces.can_claim_l5_complete',
      filePath,
    ),
    can_create_owner_receipt: expectFalseBoolean(
      evidenceLedgerSurfacesRaw.can_create_owner_receipt,
      'evidence_ledger_surfaces.can_create_owner_receipt',
      filePath,
    ),
    can_create_typed_blocker: expectFalseBoolean(
      evidenceLedgerSurfacesRaw.can_create_typed_blocker,
      'evidence_ledger_surfaces.can_create_typed_blocker',
      filePath,
    ),
  };
  const expectedLedgerCommands = {
    record_command: 'opl runtime brand-module-l5-evidence record',
    verify_command: 'opl runtime brand-module-l5-evidence verify',
    list_command: 'opl runtime brand-module-l5-evidence list',
    ledger_file_name: 'brand-module-l5-evidence-ledger.json',
  };
  for (const [field, expected] of Object.entries(expectedLedgerCommands)) {
    const actual = evidenceLedgerSurfaces[field as keyof typeof expectedLedgerCommands];
    if (actual !== expected) {
      throw new FrameworkContractError('contract_shape_invalid', `evidence_ledger_surfaces.${field} must use the canonical L5 evidence ledger surface.`, {
        file: filePath,
        field: `evidence_ledger_surfaces.${field}`,
        expected,
        actual,
      });
    }
  }

  const seenEvidenceClasses = new Set<string>();
  const evidenceClasses = evidenceClassesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each L5 evidence class entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const classId = expectBrandModuleL5EvidenceClassId(entry.class_id, 'evidence_classes.class_id', filePath);
    if (seenEvidenceClasses.has(classId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each L5 evidence class id must be unique.', {
        file: filePath,
        index,
        class_id: classId,
      });
    }
    seenEvidenceClasses.add(classId);

    return {
      class_id: classId,
      definition: expectString(entry.definition, 'evidence_classes.definition', filePath),
      accepted_ref_shapes: expectNonEmptyStringArray(
        entry.accepted_ref_shapes,
        'evidence_classes.accepted_ref_shapes',
        filePath,
      ),
    };
  });
  const missingEvidenceClassIds = BRAND_MODULE_L5_EVIDENCE_CLASSES.filter((classId) => !seenEvidenceClasses.has(classId));
  if (missingEvidenceClassIds.length > 0 || seenEvidenceClasses.size !== BRAND_MODULE_L5_EVIDENCE_CLASSES.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'brand-module-l5-operating-evidence.json must contain exactly the required L5 evidence classes.', {
      file: filePath,
      expected_class_ids: [...BRAND_MODULE_L5_EVIDENCE_CLASSES],
      missing_class_ids: missingEvidenceClassIds,
      actual_class_ids: [...seenEvidenceClasses],
    });
  }

  const seenModules = new Set<string>();
  const modules = modulesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each L5 module evidence entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const moduleId = expectBrandModuleId(entry.module_id, 'module_id', filePath);
    if (seenModules.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each L5 module evidence entry must have a unique module id.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    seenModules.add(moduleId);

    const currentLevel = expectString(entry.current_level, 'current_level', filePath);
    if (currentLevel !== 'L4_structural_baseline') {
      throw new FrameworkContractError('contract_shape_invalid', 'L5 evidence matrix current_level must remain L4_structural_baseline until live evidence closes.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'current_level',
        actual: currentLevel,
      });
    }

    const l5CompletionStatus = expectString(entry.l5_completion_status, 'l5_completion_status', filePath);
    if (!['evidence_required', 'complete', 'blocked'].includes(l5CompletionStatus)) {
      throw new FrameworkContractError('contract_shape_invalid', 'l5_completion_status must be evidence_required, complete, or blocked.', {
        file: filePath,
        index,
        module_id: moduleId,
        actual: l5CompletionStatus,
      });
    }

    const requirementsRaw = entry.evidence_requirements;
    if (!Array.isArray(requirementsRaw)) {
      throw new FrameworkContractError('contract_shape_invalid', 'evidence_requirements must be an array.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'evidence_requirements',
      });
    }

    const seenRequirementClasses = new Set<string>();
    const evidenceRequirements = requirementsRaw.map((requirement, requirementIndex) => {
      if (!isRecord(requirement)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each evidence requirement must be an object.', {
          file: filePath,
          index,
          module_id: moduleId,
          requirementIndex,
        });
      }

      const classId = expectBrandModuleL5EvidenceClassId(
        requirement.class_id,
        'evidence_requirements.class_id',
        filePath,
      );
      if (seenRequirementClasses.has(classId)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each module must declare each L5 evidence requirement at most once.', {
          file: filePath,
          index,
          module_id: moduleId,
          requirementIndex,
          class_id: classId,
        });
      }
      seenRequirementClasses.add(classId);

      const evidenceRefs = optionalNonEmptyStringArrayField(requirement, 'evidence_refs', filePath);
      const ownerAcceptanceRefs = optionalNonEmptyStringArrayField(requirement, 'owner_acceptance_refs', filePath);
      const blockerRefs = optionalNonEmptyStringArrayField(requirement, 'blocker_refs', filePath);
      const supportingDomainOwnerChainRefs = optionalNonEmptyStringArrayField(
        requirement,
        'supporting_domain_owner_chain_refs',
        filePath,
      );
      if (supportingDomainOwnerChainRefs && classId !== 'cross_agent_scaleout') {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'supporting_domain_owner_chain_refs may only appear on cross_agent_scaleout requirements.',
          {
            file: filePath,
            index,
            module_id: moduleId,
            requirementIndex,
            class_id: classId,
          },
        );
      }
      if ((evidenceRefs || ownerAcceptanceRefs) && blockerRefs) {
        throw new FrameworkContractError('contract_shape_invalid', 'success refs cannot be mixed with blocker_refs on the same L5 evidence requirement.', {
          file: filePath,
          index,
          module_id: moduleId,
          requirementIndex,
          class_id: classId,
        });
      }
      const ownerRouteRef = expectString(
        requirement.owner_route_ref,
        'evidence_requirements.owner_route_ref',
        filePath,
      );
      if (!ownerRouteRef.startsWith(`opl-owner-route:brand-module/${moduleId}/${classId}/`)) {
        throw new FrameworkContractError('contract_shape_invalid', 'owner_route_ref must bind the module and evidence class.', {
          file: filePath,
          index,
          module_id: moduleId,
          requirementIndex,
          class_id: classId,
          owner_route_ref: ownerRouteRef,
          expected_prefix: `opl-owner-route:brand-module/${moduleId}/${classId}/`,
        });
      }

      const ownerRepoRef = expectString(
        requirement.owner_repo_ref,
        'evidence_requirements.owner_repo_ref',
        filePath,
      );
      return {
        class_id: classId,
        owner: expectString(requirement.owner, 'evidence_requirements.owner', filePath),
        owner_route_ref: ownerRouteRef,
        owner_repo_ref: ownerRepoRef,
        current_state: expectBrandModuleL5EvidenceState(
          requirement.current_state,
          'evidence_requirements.current_state',
          filePath,
        ),
        ...(evidenceRefs ? { evidence_refs: evidenceRefs } : {}),
        ...(ownerAcceptanceRefs ? { owner_acceptance_refs: ownerAcceptanceRefs } : {}),
        ...(blockerRefs ? { blocker_refs: blockerRefs } : {}),
        ...(supportingDomainOwnerChainRefs
          ? { supporting_domain_owner_chain_refs: supportingDomainOwnerChainRefs }
          : {}),
      };
    });

    const missingRequirementClassIds = BRAND_MODULE_L5_EVIDENCE_CLASSES.filter((classId) => !seenRequirementClasses.has(classId));
    if (missingRequirementClassIds.length > 0 || seenRequirementClasses.size !== BRAND_MODULE_L5_EVIDENCE_CLASSES.length) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each module must cover every required L5 evidence class.', {
        file: filePath,
        index,
        module_id: moduleId,
        expected_class_ids: [...BRAND_MODULE_L5_EVIDENCE_CLASSES],
        missing_class_ids: missingRequirementClassIds,
        actual_class_ids: [...seenRequirementClasses],
      });
    }

    const l5CanBeClaimed = expectBoolean(entry.l5_can_be_claimed, 'l5_can_be_claimed', filePath);
    const satisfiedRequirements = evidenceRequirements.filter((requirement) => requirement.current_state === 'satisfied');
    const requirementsWithSuccessRefs = evidenceRequirements.filter((requirement) => (
      (Array.isArray(requirement.evidence_refs) && requirement.evidence_refs.length > 0)
      || (Array.isArray(requirement.owner_acceptance_refs) && requirement.owner_acceptance_refs.length > 0)
    ));
    if (l5CanBeClaimed) {
      if (l5CompletionStatus !== 'complete') {
        throw new FrameworkContractError('contract_shape_invalid', 'l5_can_be_claimed=true requires l5_completion_status=complete.', {
          file: filePath,
          index,
          module_id: moduleId,
        });
      }
      if (
        satisfiedRequirements.length !== BRAND_MODULE_L5_EVIDENCE_CLASSES.length
        || requirementsWithSuccessRefs.length !== BRAND_MODULE_L5_EVIDENCE_CLASSES.length
      ) {
        throw new FrameworkContractError('contract_shape_invalid', 'l5_can_be_claimed=true requires every evidence requirement to be satisfied with evidence_refs or owner_acceptance_refs.', {
          file: filePath,
          index,
          module_id: moduleId,
        });
      }
    } else if (l5CompletionStatus === 'complete') {
      throw new FrameworkContractError('contract_shape_invalid', 'l5_completion_status=complete requires l5_can_be_claimed=true.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }

    return {
      module_id: moduleId,
      brand_name: expectString(entry.brand_name, 'brand_name', filePath),
      current_level: 'L4_structural_baseline' as const,
      l5_completion_status: l5CompletionStatus as 'evidence_required' | 'complete' | 'blocked',
      l5_can_be_claimed: l5CanBeClaimed,
      immediate_enabling_surfaces: expectNonEmptyStringArray(
        entry.immediate_enabling_surfaces,
        'immediate_enabling_surfaces',
        filePath,
      ),
      evidence_requirements: evidenceRequirements,
      not_claims: expectNonEmptyStringArray(entry.not_claims, 'not_claims', filePath),
    };
  });

  const missingModuleIds = BRAND_MODULE_IDS.filter((moduleId) => !seenModules.has(moduleId));
  if (missingModuleIds.length > 0 || seenModules.size !== BRAND_MODULE_IDS.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'brand-module-l5-operating-evidence.json must contain exactly the configured OPL brand modules.', {
      file: filePath,
      expected_module_ids: [...BRAND_MODULE_IDS],
      missing_module_ids: missingModuleIds,
      actual_module_ids: [...seenModules],
    });
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    baseline_level: 'L4_structural_baseline',
    target_level: 'L5_production_operating_maturity',
    l5_claim_policy: l5ClaimPolicy,
    owner_route_work_order_policy: {
      ...ownerRouteWorkOrderPolicy,
      surface_kind: 'opl_brand_module_l5_owner_route_work_order_policy',
    },
    evidence_ledger_surfaces: evidenceLedgerSurfaces,
    evidence_classes: evidenceClasses,
    modules,
  };
}
