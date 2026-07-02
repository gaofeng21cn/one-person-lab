import type {
  BrandModuleId,
  BrandSystemProfileContract,
  BrandSystemVisualPatternGroup,
} from '../../kernel/types.ts';
import {
  FrameworkContractError,
  expectString,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  BRAND_MODULE_IDS,
  expectAllowedStringArray,
  expectBrandModuleId,
  expectNonEmptyStringArray,
  requireEveryValue,
  validateBrandModuleAuthorityBoundary,
} from './brand-module-contracts.ts';

function expectFalseBoolean(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, { file: filePath, field });
  }
  return false as const;
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

const BRAND_SYSTEM_ORDINARY_APP_EXPERIENCE_AXIS_IDS = [
  'running_fluency',
  'output_quality',
  'brand_feel',
] as const;

const BRAND_SYSTEM_PRODUCT_LAYER_IDS = [
  'opl_framework',
  'one_person_lab_app',
  'foundry_agents',
] as const;

const BRAND_SYSTEM_VISUAL_PATTERN_GROUP_IDS = [
  'design_tokens',
  'icons',
  'cards',
  'status_patterns',
] as const;

const BRAND_SYSTEM_DEFAULT_STATUS_TERMS = [
  'current owner',
  'next action',
  'artifact',
  'receipt',
  'typed blocker',
  'human gate',
] as const;

export function validateBrandSystemProfile(
  filePath: string,
  value: unknown,
): BrandSystemProfileContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-system-profile.json must contain an object root.',
      { file: filePath },
    );
  }

  const layersRaw = value.product_cognition_layers;
  const grammarRaw = value.brand_module_product_grammar;
  const agentNamingRaw = value.agent_naming;
  const appStatusLanguageRaw = value.app_status_language;
  const visualSystemRaw = value.visual_system;
  const ordinaryAppExperienceRaw = value.ordinary_app_experience;
  const receiptBlockerLanguageRaw = value.receipt_blocker_language;
  if (
    !Array.isArray(layersRaw)
    || !isRecord(grammarRaw)
    || !isRecord(agentNamingRaw)
    || !isRecord(appStatusLanguageRaw)
    || !isRecord(visualSystemRaw)
    || !isRecord(ordinaryAppExperienceRaw)
    || !isRecord(receiptBlockerLanguageRaw)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-system-profile.json must declare product layers, product grammar, agent naming, app language, visual system, and receipt/blocker language.',
      { file: filePath },
    );
  }

  const product_cognition_layers = layersRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each product_cognition_layers entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const layerId = expectString(entry.layer_id, 'product_cognition_layers.layer_id', filePath);
    if (!BRAND_SYSTEM_PRODUCT_LAYER_IDS.includes(layerId as typeof BRAND_SYSTEM_PRODUCT_LAYER_IDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'product_cognition_layers.layer_id must be a known One Person Lab product cognition layer.', {
        file: filePath,
        index,
        layer_id: layerId,
        expected_layer_ids: [...BRAND_SYSTEM_PRODUCT_LAYER_IDS],
      });
    }

    return {
      layer_id: layerId as BrandSystemProfileContract['product_cognition_layers'][number]['layer_id'],
      product_name: expectString(entry.product_name, 'product_cognition_layers.product_name', filePath),
      user_understanding: expectString(entry.user_understanding, 'product_cognition_layers.user_understanding', filePath),
      maintainer_understanding: expectString(entry.maintainer_understanding, 'product_cognition_layers.maintainer_understanding', filePath),
      owner: expectString(entry.owner, 'product_cognition_layers.owner', filePath),
      authority_boundary: expectNonEmptyStringArray(entry.authority_boundary, 'product_cognition_layers.authority_boundary', filePath),
    };
  });
  requireEveryValue(
    product_cognition_layers.map((entry) => entry.layer_id),
    BRAND_SYSTEM_PRODUCT_LAYER_IDS,
    'product_cognition_layers.layer_id',
    filePath,
  );

  const moduleIds = expectAllowedStringArray(
    grammarRaw.module_ids,
    'brand_module_product_grammar.module_ids',
    filePath,
    BRAND_MODULE_IDS,
  );
  requireEveryValue(moduleIds, BRAND_MODULE_IDS, 'brand_module_product_grammar.module_ids', filePath);
  if (!Array.isArray(grammarRaw.module_role_refs)) {
    throw new FrameworkContractError('contract_shape_invalid', 'brand_module_product_grammar.module_role_refs must be an array.', {
      file: filePath,
      field: 'brand_module_product_grammar.module_role_refs',
    });
  }

  const seenRoleRefs = new Set<string>();
  const module_role_refs = grammarRaw.module_role_refs.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each module role ref must be an object.', {
        file: filePath,
        index,
      });
    }

    const moduleId = expectBrandModuleId(entry.module_id, 'brand_module_product_grammar.module_role_refs.module_id', filePath);
    if (seenRoleRefs.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand system module role ref must be unique.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    seenRoleRefs.add(moduleId);

    const expectedRegistryRef = `contracts/opl-framework/brand-module-registry.json#modules.${moduleId}`;
    const expectedSurfaceRef = `contracts/opl-framework/brand-module-surfaces.json#modules.${moduleId}`;
    const registryRef = expectString(entry.registry_ref, 'brand_module_product_grammar.module_role_refs.registry_ref', filePath);
    const surfaceRef = expectString(entry.surface_contract_ref, 'brand_module_product_grammar.module_role_refs.surface_contract_ref', filePath);
    if (registryRef !== expectedRegistryRef || surfaceRef !== expectedSurfaceRef) {
      throw new FrameworkContractError('contract_shape_invalid', 'Brand system module role refs must point to the canonical module registry and surface entries.', {
        file: filePath,
        index,
        module_id: moduleId,
        expected_registry_ref: expectedRegistryRef,
        expected_surface_contract_ref: expectedSurfaceRef,
      });
    }

    return {
      module_id: moduleId,
      product_grammar_role: expectString(entry.product_grammar_role, 'brand_module_product_grammar.module_role_refs.product_grammar_role', filePath),
      registry_ref: registryRef,
      surface_contract_ref: surfaceRef,
    };
  });
  requireEveryValue(
    [...seenRoleRefs] as BrandModuleId[],
    BRAND_MODULE_IDS,
    'brand_module_product_grammar.module_role_refs.module_id',
    filePath,
  );

  const defaultTerms = expectNonEmptyStringArray(
    appStatusLanguageRaw.default_terms,
    'app_status_language.default_terms',
    filePath,
  );
  requireEveryValue(defaultTerms, BRAND_SYSTEM_DEFAULT_STATUS_TERMS, 'app_status_language.default_terms', filePath);

  const patternGroupsRaw = visualSystemRaw.pattern_groups;
  if (!Array.isArray(patternGroupsRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'visual_system.pattern_groups must be an array.', {
      file: filePath,
      field: 'visual_system.pattern_groups',
    });
  }
  const pattern_groups = patternGroupsRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each visual pattern group must be an object.', {
        file: filePath,
        index,
      });
    }
    const groupId = expectString(entry.group_id, 'visual_system.pattern_groups.group_id', filePath);
    if (!BRAND_SYSTEM_VISUAL_PATTERN_GROUP_IDS.includes(groupId as BrandSystemVisualPatternGroup['group_id'])) {
      throw new FrameworkContractError('contract_shape_invalid', 'visual_system.pattern_groups.group_id must be a known brand system pattern group.', {
        file: filePath,
        index,
        group_id: groupId,
        expected_group_ids: [...BRAND_SYSTEM_VISUAL_PATTERN_GROUP_IDS],
      });
    }
    return {
      group_id: groupId as BrandSystemVisualPatternGroup['group_id'],
      purpose: expectString(entry.purpose, 'visual_system.pattern_groups.purpose', filePath),
      required_patterns: expectNonEmptyStringArray(entry.required_patterns, 'visual_system.pattern_groups.required_patterns', filePath),
    };
  });
  requireEveryValue(
    pattern_groups.map((entry) => entry.group_id),
    BRAND_SYSTEM_VISUAL_PATTERN_GROUP_IDS,
    'visual_system.pattern_groups.group_id',
    filePath,
  );

  const ordinaryAxisRaw = ordinaryAppExperienceRaw.experience_axes;
  if (!Array.isArray(ordinaryAxisRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'ordinary_app_experience.experience_axes must be an array.', {
      file: filePath,
      field: 'ordinary_app_experience.experience_axes',
    });
  }
  const ordinaryAxisIds = new Set<string>();
  const ordinaryAppExperienceAxes = ordinaryAxisRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each ordinary_app_experience axis must be an object.', {
        file: filePath,
        index,
      });
    }
    const axisId = expectString(entry.axis_id, 'ordinary_app_experience.experience_axes.axis_id', filePath);
    if (!BRAND_SYSTEM_ORDINARY_APP_EXPERIENCE_AXIS_IDS.includes(axisId as typeof BRAND_SYSTEM_ORDINARY_APP_EXPERIENCE_AXIS_IDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'ordinary_app_experience.experience_axes.axis_id must be a known experience axis.', {
        file: filePath,
        index,
        axis_id: axisId,
        expected_axis_ids: [...BRAND_SYSTEM_ORDINARY_APP_EXPERIENCE_AXIS_IDS],
      });
    }
    if (ordinaryAxisIds.has(axisId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'ordinary_app_experience.experience_axes axis ids must be unique.', {
        file: filePath,
        index,
        axis_id: axisId,
      });
    }
    ordinaryAxisIds.add(axisId);
    return {
      axis_id: axisId as BrandSystemProfileContract['ordinary_app_experience']['experience_axes'][number]['axis_id'],
      user_visible_goal: expectString(entry.user_visible_goal, 'ordinary_app_experience.experience_axes.user_visible_goal', filePath),
      app_projection_ref: expectString(entry.app_projection_ref, 'ordinary_app_experience.experience_axes.app_projection_ref', filePath),
      l5_evidence_class_ref: expectString(entry.l5_evidence_class_ref, 'ordinary_app_experience.experience_axes.l5_evidence_class_ref', filePath),
      must_not_claim: expectNonEmptyStringArray(entry.must_not_claim, 'ordinary_app_experience.experience_axes.must_not_claim', filePath),
    };
  });
  requireEveryValue(
    [...ordinaryAxisIds] as typeof BRAND_SYSTEM_ORDINARY_APP_EXPERIENCE_AXIS_IDS[number][],
    BRAND_SYSTEM_ORDINARY_APP_EXPERIENCE_AXIS_IDS,
    'ordinary_app_experience.experience_axes.axis_id',
    filePath,
  );
  if (ordinaryAppExperienceRaw.surface_kind !== 'opl_brand_ordinary_app_experience_profile') {
    throw new FrameworkContractError('contract_shape_invalid', 'ordinary_app_experience.surface_kind must be canonical.', {
      file: filePath,
      field: 'ordinary_app_experience.surface_kind',
      actual: ordinaryAppExperienceRaw.surface_kind,
    });
  }
  if (ordinaryAppExperienceRaw.l5_evidence_refs_only !== true) {
    throw new FrameworkContractError('contract_shape_invalid', 'ordinary_app_experience.l5_evidence_refs_only must be true.', {
      file: filePath,
      field: 'ordinary_app_experience.l5_evidence_refs_only',
    });
  }
  const ordinaryAppExperienceAuthority = validateFalseBoundaryRecord(
    filePath,
    ordinaryAppExperienceRaw.authority_boundary,
    'ordinary_app_experience.authority_boundary',
  );
  for (const requiredFalseFlag of [
    'can_claim_l5',
    'can_claim_app_release_ready',
    'can_authorize_quality_verdict',
    'can_create_owner_receipt',
    'can_create_typed_blocker',
  ]) {
    if (!(requiredFalseFlag in ordinaryAppExperienceAuthority)) {
      throw new FrameworkContractError('contract_shape_invalid', 'ordinary_app_experience.authority_boundary must include all false-authority flags.', {
        file: filePath,
        field: 'ordinary_app_experience.authority_boundary',
        missing_flag: requiredFalseFlag,
      });
    }
  }

  const successShape = expectString(receiptBlockerLanguageRaw.success_shape, 'receipt_blocker_language.success_shape', filePath);
  const blockedShape = expectString(receiptBlockerLanguageRaw.blocked_shape, 'receipt_blocker_language.blocked_shape', filePath);
  if (successShape !== 'domain_owner_receipt_ref' || blockedShape !== 'domain_owned_typed_blocker_ref') {
    throw new FrameworkContractError('contract_shape_invalid', 'receipt_blocker_language must preserve domain-owned receipt and typed blocker shapes.', {
      file: filePath,
      success_shape: successShape,
      blocked_shape: blockedShape,
    });
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    source_refs: expectNonEmptyStringArray(value.source_refs, 'source_refs', filePath),
    product_cognition_layers,
    brand_module_product_grammar: {
      module_ids: moduleIds,
      module_role_refs,
    },
    agent_naming: {
      family_label: expectString(agentNamingRaw.family_label, 'agent_naming.family_label', filePath),
      public_name_policy: expectString(agentNamingRaw.public_name_policy, 'agent_naming.public_name_policy', filePath),
      machine_id_policy: expectString(agentNamingRaw.machine_id_policy, 'agent_naming.machine_id_policy', filePath),
      required_agent_ids: expectNonEmptyStringArray(agentNamingRaw.required_agent_ids, 'agent_naming.required_agent_ids', filePath),
      foundry_series_contract_ref: expectString(agentNamingRaw.foundry_series_contract_ref, 'agent_naming.foundry_series_contract_ref', filePath),
    },
    app_status_language: {
      default_terms: defaultTerms,
      diagnostic_only_terms: expectNonEmptyStringArray(appStatusLanguageRaw.diagnostic_only_terms, 'app_status_language.diagnostic_only_terms', filePath),
      forbidden_default_terms: expectNonEmptyStringArray(appStatusLanguageRaw.forbidden_default_terms, 'app_status_language.forbidden_default_terms', filePath),
      default_state_ref: expectString(appStatusLanguageRaw.default_state_ref, 'app_status_language.default_state_ref', filePath),
      full_detail_policy_ref: expectString(appStatusLanguageRaw.full_detail_policy_ref, 'app_status_language.full_detail_policy_ref', filePath),
    },
    visual_system: {
      pattern_groups,
    },
    ordinary_app_experience: {
      surface_kind: 'opl_brand_ordinary_app_experience_profile',
      default_read_surface_ref: expectString(
        ordinaryAppExperienceRaw.default_read_surface_ref,
        'ordinary_app_experience.default_read_surface_ref',
        filePath,
      ),
      experience_axes: ordinaryAppExperienceAxes,
      l5_evidence_refs_only: true,
      authority_boundary: ordinaryAppExperienceAuthority as BrandSystemProfileContract['ordinary_app_experience']['authority_boundary'],
    },
    receipt_blocker_language: {
      success_shape: successShape,
      blocked_shape: blockedShape,
      route_back_shape: expectString(receiptBlockerLanguageRaw.route_back_shape, 'receipt_blocker_language.route_back_shape', filePath),
      owner_answer_schema_ref: expectString(receiptBlockerLanguageRaw.owner_answer_schema_ref, 'receipt_blocker_language.owner_answer_schema_ref', filePath),
      owner_receipt_schema_ref: expectString(receiptBlockerLanguageRaw.owner_receipt_schema_ref, 'receipt_blocker_language.owner_receipt_schema_ref', filePath),
      typed_blocker_schema_ref: expectString(receiptBlockerLanguageRaw.typed_blocker_schema_ref, 'receipt_blocker_language.typed_blocker_schema_ref', filePath),
      wording_rules: expectNonEmptyStringArray(receiptBlockerLanguageRaw.wording_rules, 'receipt_blocker_language.wording_rules', filePath),
    },
    authority_boundary: validateBrandModuleAuthorityBoundary(filePath, value.authority_boundary),
    forbidden_claims: expectNonEmptyStringArray(value.forbidden_claims, 'forbidden_claims', filePath),
  };
}
