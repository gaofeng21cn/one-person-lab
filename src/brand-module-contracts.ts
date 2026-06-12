import type {
  BrandCliGovernanceContract,
  BrandModuleAuthorityBoundary,
  BrandModuleCliOperation,
  BrandModuleId,
  BrandModuleRegistryContract,
  BrandModuleSurfacesContract,
} from './types.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from './contract-validation.ts';

function expectFalseBoolean(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, { file: filePath, field });
  }
  return false as const;
}

export const BRAND_MODULE_IDS = [
  'charter',
  'atlas',
  'workspace',
  'pack',
  'stagecraft',
  'runway',
  'vault',
  'console',
  'foundry-lab',
  'connect',
] as const satisfies readonly BrandModuleId[];

const BRAND_MODULE_CLI_OPERATIONS = [
  'status',
  'inspect',
  'interfaces',
  'validate',
  'doctor',
] as const satisfies readonly BrandModuleCliOperation[];

const WORKSPACE_BRAND_MODULE_CLI_OPERATIONS = [
  'status',
  'inspect',
] as const satisfies readonly BrandModuleCliOperation[];

const AGENT_INTERNAL_BRAND_MODULE_CLI_OPERATIONS = [
  'list',
  'inspect',
  'interfaces',
  'validate',
  'doctor',
] as const;

const BRAND_MODULE_L4_GATES = [
  'brand_doc_ref',
  'registry_entry',
  'contract_or_policy_ref',
  'cli_surface_ref',
  'app_or_operator_surface_ref',
  'descriptor_surface_ref',
  'validation_surface_ref',
  'status_or_maturity_doc_ref',
  'authority_boundary',
  'forbidden_claims',
] as const;

const BRAND_MODULE_AUTHORITY_FIELDS = [
  'can_claim_domain_ready',
  'can_claim_quality_verdict',
  'can_claim_artifact_authority',
  'can_claim_production_ready',
  'can_write_domain_truth',
  'can_write_memory_body',
  'can_mutate_artifact_body',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_replace_domain_owner',
  'can_replace_ai_executor_planning',
] as const satisfies readonly (keyof BrandModuleAuthorityBoundary)[];

export function expectBrandModuleId(value: unknown, field: string, filePath: string): BrandModuleId {
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

export function expectNonEmptyStringArray(value: unknown, field: string, filePath: string) {
  const items = expectStringArray(value, field, filePath);
  if (items.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain at least one entry.`, {
      file: filePath,
      field,
    });
  }
  return items;
}

export function validateBrandModuleAuthorityBoundary(filePath: string, value: unknown) {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'authority_boundary must be an object.', {
      file: filePath,
      field: 'authority_boundary',
    });
  }

  const boundary = {} as BrandModuleAuthorityBoundary;
  for (const field of BRAND_MODULE_AUTHORITY_FIELDS) {
    boundary[field] = expectFalseBoolean(value[field], `authority_boundary.${field}`, filePath);
  }
  return boundary;
}

export function validateBrandModuleRegistry(
  filePath: string,
  value: unknown,
): BrandModuleRegistryContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-module-registry.json must contain an object root.',
      { file: filePath },
    );
  }

  const maturityModelRaw = value.maturity_model;
  const modulesRaw = value.modules;
  if (!Array.isArray(maturityModelRaw) || !Array.isArray(modulesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-module-registry.json must contain maturity_model and modules arrays.',
      { file: filePath },
    );
  }

  const maturityModel = maturityModelRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each maturity_model entry must be an object.', {
        file: filePath,
        index,
      });
    }
    const level = expectString(entry.level, 'maturity_model.level', filePath);
    if (level !== 'L4_structural_baseline') {
      throw new FrameworkContractError('contract_shape_invalid', 'brand module maturity model only admits L4_structural_baseline.', {
        file: filePath,
        index,
        field: 'maturity_model.level',
        actual: level,
      });
    }
    const requiredGates = expectNonEmptyStringArray(entry.required_gates, 'maturity_model.required_gates', filePath);
    if (!BRAND_MODULE_L4_GATES.every((gate) => requiredGates.includes(gate))) {
      throw new FrameworkContractError('contract_shape_invalid', 'maturity_model.required_gates must include every L4 brand module gate.', {
        file: filePath,
        index,
        field: 'maturity_model.required_gates',
        required_gates: [...BRAND_MODULE_L4_GATES],
      });
    }

    return {
      level: 'L4_structural_baseline' as const,
      definition: expectString(entry.definition, 'maturity_model.definition', filePath),
      required_gates: requiredGates,
    };
  });

  const seen = new Set<string>();
  const modules = modulesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const moduleId = expectBrandModuleId(entry.module_id, 'module_id', filePath);
    if (seen.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module id must be unique.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    seen.add(moduleId);

    const maturityLevel = expectString(entry.maturity_level, 'maturity_level', filePath);
    if (maturityLevel !== 'L4_structural_baseline') {
      throw new FrameworkContractError('contract_shape_invalid', 'Every brand module must be at the L4 structural baseline.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'maturity_level',
        actual: maturityLevel,
      });
    }

    const l4Gates = expectNonEmptyStringArray(entry.l4_gates, 'l4_gates', filePath);
    for (const gate of BRAND_MODULE_L4_GATES) {
      if (!l4Gates.includes(gate)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each brand module must declare every L4 gate.', {
          file: filePath,
          index,
          module_id: moduleId,
          field: 'l4_gates',
          missing_gate: gate,
        });
      }
    }

    const expectedCommandPrefix = moduleId;
    const expectedSurfaceContractRef = 'contracts/opl-framework/brand-module-surfaces.json';
    const cliSurfaces = expectNonEmptyStringArray(entry.cli_surfaces, 'cli_surfaces', filePath);
    const contractRefs = expectNonEmptyStringArray(entry.contract_refs, 'contract_refs', filePath);
    const appSurfaces = expectNonEmptyStringArray(entry.app_surfaces, 'app_surfaces', filePath);
    const descriptorSurfaces = expectNonEmptyStringArray(entry.descriptor_surfaces, 'descriptor_surfaces', filePath);
    const validationSurfaces = expectNonEmptyStringArray(entry.validation_surfaces, 'validation_surfaces', filePath);
    for (const subcommand of ['status', 'inspect', 'interfaces', 'validate', 'doctor']) {
      const expectedCommand = `opl ${expectedCommandPrefix} ${subcommand} --json`;
      if (!cliSurfaces.includes(expectedCommand)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each brand module registry entry must reference its native module CLI family.', {
          file: filePath,
          index,
          module_id: moduleId,
          field: 'cli_surfaces',
          missing_command: expectedCommand,
        });
      }
    }
    if (!contractRefs.includes(expectedSurfaceContractRef)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module registry entry must reference brand-module-surfaces.json.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'contract_refs',
        missing_ref: expectedSurfaceContractRef,
      });
    }
    if (!appSurfaces.includes(`app_action:${moduleId.replace(/-/g, '_')}_status`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module registry entry must expose a module status App action descriptor ref.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'app_surfaces',
      });
    }
    if (!descriptorSurfaces.includes(`opl ${expectedCommandPrefix} interfaces --json`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module registry entry must expose its native interfaces descriptor surface.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'descriptor_surfaces',
      });
    }
    if (!validationSurfaces.includes(`opl ${expectedCommandPrefix} validate --json`) || !validationSurfaces.includes(`opl ${expectedCommandPrefix} doctor --json`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module registry entry must expose native validate and doctor surfaces.', {
        file: filePath,
        index,
        module_id: moduleId,
        field: 'validation_surfaces',
      });
    }

    return {
      module_id: moduleId,
      brand_name: expectString(entry.brand_name, 'brand_name', filePath),
      owner: expectString(entry.owner, 'owner', filePath),
      purpose: expectString(entry.purpose, 'purpose', filePath),
      state: expectString(entry.state, 'state', filePath),
      machine_boundary: expectString(entry.machine_boundary, 'machine_boundary', filePath),
      module_doc_ref: expectString(entry.module_doc_ref, 'module_doc_ref', filePath),
      contract_refs: contractRefs,
      cli_surfaces: cliSurfaces,
      app_surfaces: appSurfaces,
      descriptor_surfaces: descriptorSurfaces,
      validation_surfaces: validationSurfaces,
      status_doc_refs: expectNonEmptyStringArray(entry.status_doc_refs, 'status_doc_refs', filePath),
      l4_gates: l4Gates,
      maturity_level: 'L4_structural_baseline' as const,
      authority_boundary: validateBrandModuleAuthorityBoundary(filePath, entry.authority_boundary),
      forbidden_claims: expectNonEmptyStringArray(entry.forbidden_claims, 'forbidden_claims', filePath),
    };
  });

  const missingModuleIds = BRAND_MODULE_IDS.filter((moduleId) => !seen.has(moduleId));
  if (missingModuleIds.length > 0 || seen.size !== BRAND_MODULE_IDS.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'brand-module-registry.json must contain exactly the configured OPL brand modules.', {
      file: filePath,
      expected_module_ids: [...BRAND_MODULE_IDS],
      missing_module_ids: missingModuleIds,
      actual_module_ids: [...seen],
    });
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    baseline_module_id: expectBrandModuleId(value.baseline_module_id, 'baseline_module_id', filePath),
    maturity_model: maturityModel,
    external_reference_principles: expectNonEmptyStringArray(value.external_reference_principles, 'external_reference_principles', filePath),
    modules,
  };
}

export function expectAllowedStringArray<T extends string>(
  value: unknown,
  field: string,
  filePath: string,
  allowed: readonly T[],
) {
  const items = expectNonEmptyStringArray(value, field, filePath);
  const invalid = items.filter((item) => !allowed.includes(item as T));
  if (invalid.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} contains unknown values.`, {
      file: filePath,
      field,
      invalid,
      allowed: [...allowed],
    });
  }
  return items as T[];
}

function expectAllowedPossiblyEmptyStringArray<T extends string>(
  value: unknown,
  field: string,
  filePath: string,
  allowed: readonly T[],
) {
  const items = expectStringArray(value, field, filePath);
  const invalid = items.filter((item) => !allowed.includes(item as T));
  if (invalid.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} contains unknown values.`, {
      file: filePath,
      field,
      invalid,
      allowed: [...allowed],
    });
  }
  return items as T[];
}

export function requireEveryValue<T extends string>(
  actual: readonly T[],
  expected: readonly T[],
  field: string,
  filePath: string,
) {
  const missing = expected.filter((entry) => !actual.includes(entry));
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} is missing required values.`, {
      file: filePath,
      field,
      missing,
      expected: [...expected],
    });
  }
}

export function validateBrandCliGovernance(
  filePath: string,
  value: unknown,
): BrandCliGovernanceContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-cli-governance.json must contain an object root.',
      { file: filePath },
    );
  }

  const platformCommandSurfacesRaw = value.platform_command_surfaces;
  const agentInternalRaw = value.agent_internal_modules;
  const legacyOwnershipRaw = value.legacy_command_ownership;
  if (!Array.isArray(platformCommandSurfacesRaw) || !isRecord(agentInternalRaw) || !Array.isArray(legacyOwnershipRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-cli-governance.json must contain platform_command_surfaces, agent_internal_modules, and legacy_command_ownership.',
      { file: filePath },
    );
  }

  const seenPlatformModuleIds = new Set<string>();
  const platformCommandSurfaces = platformCommandSurfacesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each platform_command_surfaces entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const moduleId = expectBrandModuleId(entry.module_id, 'platform_command_surfaces.module_id', filePath);
    if (seenPlatformModuleIds.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each platform command surface module id must be unique.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    seenPlatformModuleIds.add(moduleId);

    const command = expectString(entry.command, 'platform_command_surfaces.command', filePath);
    const expectedCommand = `opl ${moduleId}`;
    if (command !== expectedCommand) {
      throw new FrameworkContractError('contract_shape_invalid', 'platform_command_surfaces.command must match the module command surface.', {
        file: filePath,
        index,
        module_id: moduleId,
        expected_command: expectedCommand,
        actual_command: command,
      });
    }

    const operations = expectAllowedStringArray(
      entry.operations,
      'platform_command_surfaces.operations',
      filePath,
      BRAND_MODULE_CLI_OPERATIONS,
    );
    const expectedOperations: readonly BrandModuleCliOperation[] = moduleId === 'workspace'
      ? WORKSPACE_BRAND_MODULE_CLI_OPERATIONS
      : BRAND_MODULE_CLI_OPERATIONS;
    requireEveryValue(operations, expectedOperations, 'platform_command_surfaces.operations', filePath);
    const unexpectedOperations = operations.filter((operation) => !expectedOperations.includes(operation));
    if (unexpectedOperations.length > 0) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'platform_command_surfaces.operations contains operations owned by another command surface.',
        {
          file: filePath,
          index,
          module_id: moduleId,
          unexpected_operations: unexpectedOperations,
          expected_operations: [...expectedOperations],
        },
      );
    }

    return {
      module_id: moduleId,
      command,
      operations,
    };
  });

  const missingPlatformModuleIds = BRAND_MODULE_IDS.filter((moduleId) => !seenPlatformModuleIds.has(moduleId));
  if (missingPlatformModuleIds.length > 0 || seenPlatformModuleIds.size !== BRAND_MODULE_IDS.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'brand-cli-governance.json must cover exactly the configured OPL brand modules.', {
      file: filePath,
      expected_module_ids: [...BRAND_MODULE_IDS],
      missing_module_ids: missingPlatformModuleIds,
      actual_module_ids: [...seenPlatformModuleIds],
    });
  }

  const requiredOperations = expectAllowedStringArray(
    agentInternalRaw.required_operations,
    'agent_internal_modules.required_operations',
    filePath,
    AGENT_INTERNAL_BRAND_MODULE_CLI_OPERATIONS,
  );
  requireEveryValue(
    requiredOperations,
    AGENT_INTERNAL_BRAND_MODULE_CLI_OPERATIONS,
    'agent_internal_modules.required_operations',
    filePath,
  );

  const moduleSpineRaw = agentInternalRaw.module_spine;
  if (!Array.isArray(moduleSpineRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'agent_internal_modules.module_spine must be an array.', {
      file: filePath,
      field: 'agent_internal_modules.module_spine',
    });
  }
  const seenAgentModuleIds = new Set<string>();
  const moduleSpine = moduleSpineRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each agent internal module spine entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const platformAnalogueModuleId = expectBrandModuleId(
      entry.platform_analogue_module_id,
      'agent_internal_modules.module_spine.platform_analogue_module_id',
      filePath,
    );
    const agentModuleId = expectString(entry.agent_module_id, 'agent_internal_modules.module_spine.agent_module_id', filePath);
    const expectedAgentModuleId = `agent-${platformAnalogueModuleId}`;
    if (agentModuleId !== expectedAgentModuleId) {
      throw new FrameworkContractError('contract_shape_invalid', 'agent_module_id must match its platform analogue module.', {
        file: filePath,
        index,
        expected_agent_module_id: expectedAgentModuleId,
        actual_agent_module_id: agentModuleId,
      });
    }
    if (seenAgentModuleIds.has(agentModuleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each agent internal module id must be unique.', {
        file: filePath,
        index,
        agent_module_id: agentModuleId,
      });
    }
    seenAgentModuleIds.add(agentModuleId);

    return {
      agent_module_id: agentModuleId,
      platform_analogue_module_id: platformAnalogueModuleId,
      purpose: expectString(entry.purpose, 'agent_internal_modules.module_spine.purpose', filePath),
      command_pattern: expectString(entry.command_pattern, 'agent_internal_modules.module_spine.command_pattern', filePath),
    };
  });

  const missingAgentModuleIds = BRAND_MODULE_IDS
    .map((moduleId) => `agent-${moduleId}`)
    .filter((moduleId) => !seenAgentModuleIds.has(moduleId));
  if (missingAgentModuleIds.length > 0 || seenAgentModuleIds.size !== BRAND_MODULE_IDS.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'agent_internal_modules.module_spine must cover exactly one internal module per platform module.', {
      file: filePath,
      missing_agent_module_ids: missingAgentModuleIds,
      actual_agent_module_ids: [...seenAgentModuleIds],
    });
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    platform_command_surfaces: platformCommandSurfaces,
    agent_internal_modules: {
      canonical_command_surface: expectString(agentInternalRaw.canonical_command_surface, 'agent_internal_modules.canonical_command_surface', filePath),
      required_operations: requiredOperations,
      module_spine: moduleSpine,
      authority_boundary: validateBrandModuleAuthorityBoundary(filePath, agentInternalRaw.authority_boundary),
    },
    legacy_command_ownership: legacyOwnershipRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each legacy command ownership entry must be an object.', {
          file: filePath,
          index,
        });
      }

      return {
        command_prefix: expectString(entry.command_prefix, 'legacy_command_ownership.command_prefix', filePath),
        primary_module_id: expectBrandModuleId(entry.primary_module_id, 'legacy_command_ownership.primary_module_id', filePath),
        secondary_module_ids: expectAllowedPossiblyEmptyStringArray(
          entry.secondary_module_ids,
          'legacy_command_ownership.secondary_module_ids',
          filePath,
          BRAND_MODULE_IDS,
        ),
        status: expectString(entry.status, 'legacy_command_ownership.status', filePath),
        migration_target: expectString(entry.migration_target, 'legacy_command_ownership.migration_target', filePath),
        command_refs: expectNonEmptyStringArray(entry.command_refs, 'legacy_command_ownership.command_refs', filePath),
        rationale: expectString(entry.rationale, 'legacy_command_ownership.rationale', filePath),
      };
    }),
    drift_guards: expectNonEmptyStringArray(value.drift_guards, 'drift_guards', filePath),
  };
}

export function validateBrandModuleSurfaces(
  filePath: string,
  value: unknown,
): BrandModuleSurfacesContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-module-surfaces.json must contain an object root.',
      { file: filePath },
    );
  }

  const modulesRaw = value.modules;
  const requiredSubcommands = expectNonEmptyStringArray(
    value.required_native_subcommands,
    'required_native_subcommands',
    filePath,
  );
  const requiredGates = expectNonEmptyStringArray(value.required_gates, 'required_gates', filePath);
  for (const subcommand of ['status', 'inspect', 'interfaces', 'validate', 'doctor']) {
    if (!requiredSubcommands.includes(subcommand)) {
      throw new FrameworkContractError('contract_shape_invalid', 'brand-module-surfaces.json must require every native module subcommand.', {
        file: filePath,
        field: 'required_native_subcommands',
        missing_subcommand: subcommand,
      });
    }
  }
  for (const gate of ['object_model', 'native_cli_family', 'app_read_model', 'descriptor_surface', 'validation', 'doctor', 'status', 'authority_boundary', 'forbidden_claims']) {
    if (!requiredGates.includes(gate)) {
      throw new FrameworkContractError('contract_shape_invalid', 'brand-module-surfaces.json must require every module surface gate.', {
        file: filePath,
        field: 'required_gates',
        missing_gate: gate,
      });
    }
  }

  if (!Array.isArray(modulesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-module-surfaces.json must contain a modules array.',
      { file: filePath, field: 'modules' },
    );
  }

  const seen = new Set<string>();
  const modules = modulesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module surface entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const moduleId = expectBrandModuleId(entry.module_id, 'module_id', filePath);
    if (seen.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module surface id must be unique.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    seen.add(moduleId);

    const prefix = expectString(entry.command_prefix, 'command_prefix', filePath);
    if (prefix !== moduleId) {
      throw new FrameworkContractError('contract_shape_invalid', 'command_prefix must match the module id.', {
        file: filePath,
        index,
        module_id: moduleId,
        command_prefix: prefix,
      });
    }

    const objectModel = entry.object_model;
    const nativeCliFamily = entry.native_cli_family;
    const appReadModel = entry.app_read_model;
    const descriptorSurface = entry.descriptor_surface;
    const validation = entry.validation;
    const doctor = entry.doctor;
    const status = entry.status;
    if (
      !isRecord(objectModel)
      || !isRecord(nativeCliFamily)
      || !isRecord(appReadModel)
      || !isRecord(descriptorSurface)
      || !isRecord(validation)
      || !isRecord(doctor)
      || !isRecord(status)
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each brand module surface entry must declare object_model, native_cli_family, app_read_model, descriptor_surface, validation, doctor, and status objects.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }

    const nativeCommands = {
      status: expectString(nativeCliFamily.status, 'native_cli_family.status', filePath),
      inspect: expectString(nativeCliFamily.inspect, 'native_cli_family.inspect', filePath),
      interfaces: expectString(nativeCliFamily.interfaces, 'native_cli_family.interfaces', filePath),
      validate: expectString(nativeCliFamily.validate, 'native_cli_family.validate', filePath),
      doctor: expectString(nativeCliFamily.doctor, 'native_cli_family.doctor', filePath),
      additional_commands: expectStringArray(nativeCliFamily.additional_commands, 'native_cli_family.additional_commands', filePath),
    };
    for (const subcommand of ['status', 'inspect', 'interfaces', 'validate', 'doctor'] as const) {
      const expectedCommand = `opl ${moduleId} ${subcommand} --json`;
      if (nativeCommands[subcommand] !== expectedCommand) {
        throw new FrameworkContractError('contract_shape_invalid', 'Native brand module command must match its module prefix and subcommand.', {
          file: filePath,
          index,
          module_id: moduleId,
          field: `native_cli_family.${subcommand}`,
          expected_command: expectedCommand,
        });
      }
    }

    const descriptorsRaw = appReadModel.descriptors;
    if (!Array.isArray(descriptorsRaw)) {
      throw new FrameworkContractError('contract_shape_invalid', 'app_read_model.descriptors must be an array.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    const descriptors = descriptorsRaw.map((descriptor, descriptorIndex) => {
      if (!isRecord(descriptor)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Each app descriptor must be an object.', {
          file: filePath,
          index,
          module_id: moduleId,
          descriptorIndex,
        });
      }
      return {
        action_id: expectString(descriptor.action_id, 'app_read_model.descriptors.action_id', filePath),
        command: expectString(descriptor.command, 'app_read_model.descriptors.command', filePath),
        mutation: expectBoolean(descriptor.mutation, 'app_read_model.descriptors.mutation', filePath),
        descriptor_only: expectBoolean(descriptor.descriptor_only, 'app_read_model.descriptors.descriptor_only', filePath),
      };
    });

    return {
      module_id: moduleId,
      brand_name: expectString(entry.brand_name, 'brand_name', filePath),
      command_prefix: prefix,
      surface_kind_prefix: expectString(entry.surface_kind_prefix, 'surface_kind_prefix', filePath),
      state: expectString(entry.state, 'state', filePath),
      module_doc_ref: expectString(entry.module_doc_ref, 'module_doc_ref', filePath),
      object_model: {
        primary_objects: expectNonEmptyStringArray(objectModel.primary_objects, 'object_model.primary_objects', filePath),
        canonical_contract_refs: expectNonEmptyStringArray(objectModel.canonical_contract_refs, 'object_model.canonical_contract_refs', filePath),
        read_model_refs: expectNonEmptyStringArray(objectModel.read_model_refs, 'object_model.read_model_refs', filePath),
      },
      native_cli_family: nativeCommands,
      app_read_model: {
        descriptors,
        projection_refs: expectNonEmptyStringArray(appReadModel.projection_refs, 'app_read_model.projection_refs', filePath),
      },
      descriptor_surface: {
        delegate_ids: expectNonEmptyStringArray(descriptorSurface.delegate_ids, 'descriptor_surface.delegate_ids', filePath),
        descriptor_refs: expectNonEmptyStringArray(descriptorSurface.descriptor_refs, 'descriptor_surface.descriptor_refs', filePath),
      },
      validation: {
        commands: expectNonEmptyStringArray(validation.commands, 'validation.commands', filePath),
        checks: expectNonEmptyStringArray(validation.checks, 'validation.checks', filePath),
        required_refs: expectNonEmptyStringArray(validation.required_refs, 'validation.required_refs', filePath),
      },
      doctor: {
        checks: expectNonEmptyStringArray(doctor.checks, 'doctor.checks', filePath),
        fail_closed_on: expectNonEmptyStringArray(doctor.fail_closed_on, 'doctor.fail_closed_on', filePath),
      },
      status: {
        completion_level: (() => {
          const completionLevel = expectString(status.completion_level, 'status.completion_level', filePath);
          if (completionLevel !== 'L4_structural_baseline') {
            throw new FrameworkContractError('contract_shape_invalid', 'status.completion_level must be L4_structural_baseline.', {
              file: filePath,
              index,
              module_id: moduleId,
              actual: completionLevel,
            });
          }
          return 'L4_structural_baseline' as const;
        })(),
        evidence_refs: expectNonEmptyStringArray(status.evidence_refs, 'status.evidence_refs', filePath),
        not_claims: expectNonEmptyStringArray(status.not_claims, 'status.not_claims', filePath),
      },
      authority_boundary: validateBrandModuleAuthorityBoundary(filePath, entry.authority_boundary),
      forbidden_claims: expectNonEmptyStringArray(entry.forbidden_claims, 'forbidden_claims', filePath),
      notes: expectString(entry.notes, 'notes', filePath),
    };
  });

  const missingModuleIds = BRAND_MODULE_IDS.filter((moduleId) => !seen.has(moduleId));
  if (missingModuleIds.length > 0 || seen.size !== BRAND_MODULE_IDS.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'brand-module-surfaces.json must contain exactly the configured OPL brand modules.', {
      file: filePath,
      expected_module_ids: [...BRAND_MODULE_IDS],
      missing_module_ids: missingModuleIds,
      actual_module_ids: [...seen],
    });
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    baseline_module_id: expectBrandModuleId(value.baseline_module_id, 'baseline_module_id', filePath),
    required_native_subcommands: requiredSubcommands,
    required_gates: requiredGates,
    modules,
  };
}
