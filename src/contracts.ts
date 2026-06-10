import fs from 'node:fs';
import path from 'node:path';

import type {
  ContractValidationSummary,
  ContractsRootSource,
  FrameworkContracts,
  FrameworkContractsLoadOptions,
  BrandCliGovernanceContract,
  BrandModuleAuthorityBoundary,
  BrandModuleCliOperation,
  BrandModuleId,
  BrandModuleRegistryContract,
  BrandModuleSurfacesContract,
  BrandSystemProfileContract,
  PackOsContract,
  BrandSystemVisualPatternGroup,
  PublicSurfaceIndexContract,
  StageSelectionVocabularyContract,
  TargetOperatingArchitectureContract,
  TaskTopologyContract,
  WorkstreamsRegistry,
} from './types.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
  type ErrorCode,
} from './contract-validation.ts';
import { validateAgentWorkspaceNorm } from './agent-workspace-norm-contract.ts';
import { validateBrandModuleL5OperatingEvidence } from './brand-module-l5-operating-evidence-contract.ts';
import { validateDomainsRegistry } from './domain-contracts.ts';
import { validatePackOsContract } from './pack-os-contract.ts';

export { FrameworkContractError } from './contract-validation.ts';

const REQUIRED_CONTRACT_FILE_NAMES = [
  'workstreams.json',
  'domains.json',
  'stage-selection-vocabulary.json',
  'task-topology.json',
  'public-surface-index.json',
  'agent-workspace-norm-contract.json',
  'brand-module-registry.json',
  'brand-cli-governance.json',
  'brand-module-surfaces.json',
  'brand-module-l5-operating-evidence.json',
  'brand-system-profile.json',
  'target-operating-architecture-contract.json',
  'pack-os-contract.json',
] as const;

type NormalizedFrameworkContractsLoadOptions = {
  searchFrom: string | null;
  contractsDir: string | null;
  source: ContractsRootSource;
};

type ResolvedContractsLocation = {
  contractsDir: string;
  source: ContractsRootSource;
};

const CONTRACT_LOAD_ERROR_CODES = new Set<ErrorCode>([
  'contract_file_missing',
  'contract_json_invalid',
  'contract_shape_invalid',
]);

function parseJsonFile(filePath: string): unknown {
  let raw: string;

  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError(
        'contract_file_missing',
        `Required contract file is missing: ${path.basename(filePath)}.`,
        { file: filePath },
      );
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_json_invalid',
      `Contract file contains invalid JSON: ${path.basename(filePath)}.`,
      {
        file: filePath,
        cause:
          error instanceof Error ? error.message : 'JSON parsing failed unexpectedly.',
      },
    );
  }
}

function validateWorkstreamsRegistry(
  filePath: string,
  value: unknown,
): WorkstreamsRegistry {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'workstreams.json must contain an object root.',
      { file: filePath },
    );
  }

  const version = expectString(value.version, 'version', filePath);
  const workstreams = value.workstreams;

  if (!Array.isArray(workstreams)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'workstreams.json must contain a workstreams array.',
      { file: filePath, field: 'workstreams' },
    );
  }

  return {
    version,
    workstreams: workstreams.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each workstream entry must be an object.',
          { file: filePath, index },
        );
      }

      return {
        workstream_id: expectString(entry.workstream_id, 'workstream_id', filePath),
        label: expectString(entry.label, 'label', filePath),
        status: expectString(entry.status, 'status', filePath),
        description: expectString(entry.description, 'description', filePath),
        domain_id: expectString(entry.domain_id, 'domain_id', filePath),
        entry_mode: expectString(entry.entry_mode, 'entry_mode', filePath),
        primary_families: expectStringArray(
          entry.primary_families,
          'primary_families',
          filePath,
        ),
        top_level_intents: expectStringArray(
          entry.top_level_intents,
          'top_level_intents',
          filePath,
        ),
        notes: expectString(entry.notes, 'notes', filePath),
      };
    }),
  };
}

function validateStageSelectionVocabulary(
  filePath: string,
  value: unknown,
): StageSelectionVocabularyContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'stage-selection-vocabulary.json must contain an object root.',
      { file: filePath },
    );
  }

  const specialCasesRaw = value.special_cases;
  if (!Array.isArray(specialCasesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'stage-selection-vocabulary.json must contain a special_cases array.',
      { file: filePath, field: 'special_cases' },
    );
  }

  return {
    version: expectString(value.version, 'version', filePath),
    intent_id: expectStringArray(value.intent_id, 'intent_id', filePath),
    workstream_id: expectStringArray(value.workstream_id, 'workstream_id', filePath),
    domain_id: expectStringArray(value.domain_id, 'domain_id', filePath),
    request_kind: expectStringArray(value.request_kind, 'request_kind', filePath),
    target_kind: expectStringArray(value.target_kind, 'target_kind', filePath),
    delivery_kind: expectStringArray(value.delivery_kind, 'delivery_kind', filePath),
    review_kind: expectStringArray(value.review_kind, 'review_kind', filePath),
    entry_mode: expectStringArray(value.entry_mode, 'entry_mode', filePath),
    selection_rules: expectStringArray(
      value.selection_rules,
      'selection_rules',
      filePath,
    ),
    special_cases: specialCasesRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each special case entry must be an object.',
          { file: filePath, index },
        );
      }

      return {
        family: expectString(entry.family, 'family', filePath),
        domain_id: expectString(entry.domain_id, 'domain_id', filePath),
        direct_workstream:
          entry.direct_workstream === undefined
            ? undefined
            : expectString(entry.direct_workstream, 'direct_workstream', filePath),
        auto_workstream:
          entry.auto_workstream === undefined || entry.auto_workstream === null
            ? null
            : expectString(entry.auto_workstream, 'auto_workstream', filePath),
        notes: expectString(entry.notes, 'notes', filePath),
      };
    }),
  };
}

function validateTaskTopology(
  filePath: string,
  value: unknown,
): TaskTopologyContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'task-topology.json must contain an object root.',
      { file: filePath },
    );
  }

  const workstreamsRaw = value.workstreams;
  if (!Array.isArray(workstreamsRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'task-topology.json must contain a workstreams array.',
      { file: filePath, field: 'workstreams' },
    );
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    description: expectString(value.description, 'description', filePath),
    non_goals: expectStringArray(value.non_goals, 'non_goals', filePath),
    topology_rules: expectStringArray(
      value.topology_rules,
      'topology_rules',
      filePath,
    ),
    shared_foundation_reuse: expectStringArray(
      value.shared_foundation_reuse,
      'shared_foundation_reuse',
      filePath,
    ),
    workstreams: workstreamsRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each task topology workstream entry must be an object.',
          { file: filePath, index },
        );
      }

      const familyNotes = entry.family_boundary_notes;
      if (!Array.isArray(familyNotes)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'family_boundary_notes must be an array.',
          { file: filePath, index, field: 'family_boundary_notes' },
        );
      }

      return {
        workstream_id: expectString(entry.workstream_id, 'workstream_id', filePath),
        label: expectString(entry.label, 'label', filePath),
        boundary_state: expectString(
          entry.boundary_state,
          'boundary_state',
          filePath,
        ),
        registry_state: expectString(entry.registry_state, 'registry_state', filePath),
        selection_state: expectString(
          entry.selection_state,
          'selection_state',
          filePath,
        ),
        current_domain_id:
          entry.current_domain_id === null
            ? null
            : expectString(entry.current_domain_id, 'current_domain_id', filePath),
        entry_surface:
          entry.entry_surface === null
            ? null
            : expectString(entry.entry_surface, 'entry_surface', filePath),
        formal_domain_required:
          typeof entry.formal_domain_required === 'boolean'
            ? entry.formal_domain_required
            : (() => {
                throw new FrameworkContractError(
                  'contract_shape_invalid',
                  'formal_domain_required must be a boolean.',
                  { file: filePath, index, field: 'formal_domain_required' },
                );
              })(),
        delivery_objects: expectStringArray(
          entry.delivery_objects,
          'delivery_objects',
          filePath,
        ),
        typical_tasks: expectStringArray(
          entry.typical_tasks,
          'typical_tasks',
          filePath,
        ),
        reuse_dependencies: expectStringArray(
          entry.reuse_dependencies,
          'reuse_dependencies',
          filePath,
        ),
        family_boundary_notes: familyNotes.map((note, noteIndex) => {
          if (!isRecord(note)) {
            throw new FrameworkContractError(
              'contract_shape_invalid',
              'Each family boundary note must be an object.',
              { file: filePath, index, noteIndex },
            );
          }

          return {
            family_id: expectString(note.family_id, 'family_id', filePath),
            relation: expectString(note.relation, 'relation', filePath),
          };
        }),
        notes: expectString(entry.notes, 'notes', filePath),
      };
    }),
  };
}

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

const BRAND_MODULE_IDS = [
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

function validateBrandModuleAuthorityBoundary(filePath: string, value: unknown) {
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

function validateBrandModuleRegistry(
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

function expectAllowedStringArray<T extends string>(
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

function requireEveryValue<T extends string>(
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

function validateBrandCliGovernance(
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

function validateBrandModuleSurfaces(
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

function validateBrandSystemProfile(
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
  const receiptBlockerLanguageRaw = value.receipt_blocker_language;
  if (
    !Array.isArray(layersRaw)
    || !isRecord(grammarRaw)
    || !isRecord(agentNamingRaw)
    || !isRecord(appStatusLanguageRaw)
    || !isRecord(visualSystemRaw)
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
      fail_open_policy: expectString(
        capabilityRegistryRaw.fail_open_policy,
        'foundry_agent_os_standard.capability_registry_boundary.fail_open_policy',
        filePath,
      ),
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

function validateTargetOperatingArchitecture(
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
  const agentLabRaw = value.agent_lab_improvement_plane;
  const foundryAgentOsStandardRaw = value.foundry_agent_os_standard;
  if (
    !isRecord(resourceModelRaw)
    || !isRecord(stageAuthorityRaw)
    || !isRecord(domainPackRaw)
    || !isRecord(surfaceBudgetRaw)
    || !isRecord(reconcilerRaw)
    || !isRecord(reconcilerSubstratePolicyRaw)
    || !isRecord(catalogRaw)
    || !isRecord(appConsoleRaw)
    || !isRecord(agentLabRaw)
    || !isRecord(foundryAgentOsStandardRaw)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare resource, authority, ABI, surface, reconciler, catalog, App, Agent Lab, and Foundry Agent OS sections.',
      { file: filePath },
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
    agent_lab_improvement_plane: {
      role: expectString(agentLabRaw.role, 'agent_lab_improvement_plane.role', filePath),
      may_produce: agentLabMayProduce,
      must_not_produce: agentLabMustNotProduce,
    },
    foundry_agent_os_standard: validateFoundryAgentOsStandard(
      filePath,
      foundryAgentOsStandardRaw,
    ),
    authority_boundary: validateFalseBoundaryRecord(filePath, value.authority_boundary, 'authority_boundary'),
    forbidden_claims: expectNonEmptyStringArray(value.forbidden_claims, 'forbidden_claims', filePath),
  };
}

function optionalStringField(value: Record<string, unknown>, field: string) {
  return typeof value[field] === 'string' ? { [field]: value[field] as string } : {};
}

function validateSurfaceBudget(filePath: string, value: unknown, index: number) {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Each public surface must declare a surface_budget object.', {
      file: filePath, index, field: 'surface_budget',
    });
  }
  const promotionEvidence = value.promotion_evidence_refs;
  const authority = value.authority_boundary;
  if (!isRecord(promotionEvidence) || !isRecord(authority)) {
    throw new FrameworkContractError('contract_shape_invalid', 'surface_budget must declare promotion_evidence_refs and authority_boundary objects.', {
      file: filePath, index, field: 'surface_budget',
    });
  }
  return {
    default_surface: expectBoolean(value.default_surface, 'surface_budget.default_surface', filePath),
    default_surface_allowed_reasons: expectStringArray(value.default_surface_allowed_reasons, 'surface_budget.default_surface_allowed_reasons', filePath),
    promotion_evidence_refs: {
      ...optionalStringField(promotionEvidence, 'replaced_or_folded_surface_ref'),
      ...optionalStringField(promotionEvidence, 'retired_surface_ref'),
      ...optionalStringField(promotionEvidence, 'folded_into_attention_entry_ref'),
    },
    consumer_refs: expectStringArray(value.consumer_refs, 'surface_budget.consumer_refs', filePath),
    authority_boundary: {
      can_claim_domain_ready: expectFalseBoolean(authority.can_claim_domain_ready, 'can_claim_domain_ready', filePath),
      can_claim_quality_verdict: expectFalseBoolean(authority.can_claim_quality_verdict, 'can_claim_quality_verdict', filePath),
      can_claim_artifact_authority: expectFalseBoolean(authority.can_claim_artifact_authority, 'can_claim_artifact_authority', filePath),
      can_claim_production_ready: expectFalseBoolean(authority.can_claim_production_ready, 'can_claim_production_ready', filePath),
      can_replace_ai_executor_planning: expectFalseBoolean(authority.can_replace_ai_executor_planning, 'can_replace_ai_executor_planning', filePath),
      can_replace_domain_owner: expectFalseBoolean(authority.can_replace_domain_owner, 'can_replace_domain_owner', filePath),
    },
  };
}

function validatePublicSurfaceIndex(
  filePath: string,
  value: unknown,
): PublicSurfaceIndexContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'public-surface-index.json must contain an object root.',
      { file: filePath },
    );
  }

  const categoriesRaw = value.surface_categories;
  if (!Array.isArray(categoriesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'public-surface-index.json must contain a surface_categories array.',
      { file: filePath, field: 'surface_categories' },
    );
  }

  const surfacesRaw = value.surfaces;
  if (!Array.isArray(surfacesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'public-surface-index.json must contain a surfaces array.',
      { file: filePath, field: 'surfaces' },
    );
  }

  return {
    version: expectString(value.version, 'version', filePath),
    scope: expectString(value.scope, 'scope', filePath),
    description: expectString(value.description, 'description', filePath),
    non_goals: expectStringArray(value.non_goals, 'non_goals', filePath),
    ownership_rules: expectStringArray(
      value.ownership_rules,
      'ownership_rules',
      filePath,
    ),
    surface_categories: categoriesRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each public surface category entry must be an object.',
          { file: filePath, index },
        );
      }

      return {
        category_id: expectString(entry.category_id, 'category_id', filePath),
        owner_scope: expectString(entry.owner_scope, 'owner_scope', filePath),
        description: expectString(entry.description, 'description', filePath),
      };
    }),
    surfaces: surfacesRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each public surface entry must be an object.',
          { file: filePath, index },
        );
      }

      const refsRaw = entry.refs;
      if (!Array.isArray(refsRaw)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'refs must be an array.',
          { file: filePath, index, field: 'refs' },
        );
      }

      return {
        surface_id: expectString(entry.surface_id, 'surface_id', filePath),
        category_id: expectString(entry.category_id, 'category_id', filePath),
        surface_kind: expectString(entry.surface_kind, 'surface_kind', filePath),
        boundary_role: expectString(
          entry.boundary_role,
          'boundary_role',
          filePath,
        ),
        owner_scope: expectString(entry.owner_scope, 'owner_scope', filePath),
        truth_mode: expectString(entry.truth_mode, 'truth_mode', filePath),
        workstream_ids: expectStringArray(
          entry.workstream_ids,
          'workstream_ids',
          filePath,
        ),
        domain_ids: expectStringArray(entry.domain_ids, 'domain_ids', filePath),
        refs: refsRaw.map((ref, refIndex) => {
          if (!isRecord(ref)) {
            throw new FrameworkContractError(
              'contract_shape_invalid',
              'Each public surface ref must be an object.',
              { file: filePath, index, refIndex },
            );
          }

          if (ref.language !== undefined && typeof ref.language !== 'string') {
            throw new FrameworkContractError(
              'contract_shape_invalid',
              'Ref field "language" must be a string when provided.',
              { file: filePath, index, refIndex, field: 'language' },
            );
          }

          return {
            ref_kind: expectString(ref.ref_kind, 'ref_kind', filePath),
            ref: expectString(ref.ref, 'ref', filePath),
            ...(typeof ref.language === 'string' ? { language: ref.language } : {}),
          };
        }),
        routes_to: expectStringArray(entry.routes_to, 'routes_to', filePath),
        notes: expectStringArray(entry.notes, 'notes', filePath),
        surface_budget: validateSurfaceBudget(filePath, entry.surface_budget, index),
      };
    }),
  };
}

function hasRequiredContractFiles(rootPath: string): boolean {
  return REQUIRED_CONTRACT_FILE_NAMES.every((fileName) =>
    fs.existsSync(path.join(rootPath, fileName)),
  );
}

function hasAnyRequiredContractFile(rootPath: string): boolean {
  return REQUIRED_CONTRACT_FILE_NAMES.some((fileName) =>
    fs.existsSync(path.join(rootPath, fileName)),
  );
}

function describeContractsRootSource(source: ContractsRootSource): string {
  switch (source) {
    case 'cli_flag':
      return 'CLI flag --contracts-dir';
    case 'env':
      return 'environment variable OPL_CONTRACTS_DIR';
    case 'api':
      return 'API contractsDir option';
    case 'cwd':
      return 'current working directory search root';
    case 'cli_entry':
      return 'active OPL CLI entrypoint';
  }
}

function requireNonEmptyPath(
  value: string | undefined,
  source: ContractsRootSource,
  detailKey: 'contracts_dir' | 'search_from',
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `${describeContractsRootSource(source)} must be a non-empty path.`,
      {
        source,
        [detailKey]: value ?? null,
      },
    );
  }

  return value;
}

function resolveContractsDirFromSearchRoot(rootPath: string): string {
  const searchRoot = path.resolve(rootPath);

  if (hasRequiredContractFiles(searchRoot)) {
    return searchRoot;
  }

  return path.join(searchRoot, 'contracts', 'opl-framework');
}

function resolveContractsDirFromCliEntrypoint(): string | null {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    return null;
  }

  const cliEntryRealPath = fs.realpathSync.native(cliEntry);
  const projectRoot = path.resolve(path.dirname(cliEntryRealPath), '..');
  const contractsRoot = path.join(projectRoot, 'contracts', 'opl-framework');
  return hasRequiredContractFiles(contractsRoot) ? contractsRoot : null;
}

function resolveExplicitContractsDir(
  contractsDir: string,
  source: ContractsRootSource,
): string {
  const resolvedDir = path.resolve(contractsDir);

  for (const fileName of REQUIRED_CONTRACT_FILE_NAMES) {
    const filePath = path.join(resolvedDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new FrameworkContractError(
        'contract_file_missing',
        `Explicit contracts directory is missing required contract file: ${fileName}.`,
        {
          contracts_dir: resolvedDir,
          file: filePath,
          contracts_root_source: source,
        },
      );
    }
  }

  return resolvedDir;
}

function normalizeLoadOptions(
  input?: string | FrameworkContractsLoadOptions,
): NormalizedFrameworkContractsLoadOptions {
  if (typeof input === 'string') {
    return {
      searchFrom: requireNonEmptyPath(input, 'api', 'search_from'),
      contractsDir: null,
      source: 'api',
    };
  }

  if (input && Object.hasOwn(input, 'contractsDir')) {
    return {
      searchFrom: null,
      contractsDir: requireNonEmptyPath(input.contractsDir, input.source ?? 'api', 'contracts_dir'),
      source: input.source ?? 'api',
    };
  }

  if (input && Object.hasOwn(input, 'searchFrom')) {
    return {
      searchFrom: requireNonEmptyPath(input.searchFrom, input.source ?? 'api', 'search_from'),
      contractsDir: null,
      source: input.source ?? 'api',
    };
  }

  if (Object.hasOwn(process.env, 'OPL_CONTRACTS_DIR')) {
    return {
      searchFrom: null,
      contractsDir: requireNonEmptyPath(
        process.env.OPL_CONTRACTS_DIR,
        'env',
        'contracts_dir',
      ),
      source: 'env',
    };
  }

  return {
    searchFrom: process.cwd(),
    contractsDir: null,
    source: 'cwd',
  };
}

function resolveContractsLocation(
  input?: string | FrameworkContractsLoadOptions,
): ResolvedContractsLocation {
  const options = normalizeLoadOptions(input);

  if (options.contractsDir !== null) {
    return {
      contractsDir: resolveExplicitContractsDir(options.contractsDir, options.source),
      source: options.source,
    };
  }

  if (options.searchFrom === null) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Contract root resolution requires either an explicit contracts directory or a search root.',
      { source: options.source },
    );
  }

  if (options.source === 'cwd') {
    const cwdSearchRoot = path.resolve(options.searchFrom);
    const cwdContractsDir = resolveContractsDirFromSearchRoot(cwdSearchRoot);
    if (
      hasRequiredContractFiles(cwdSearchRoot)
      || hasRequiredContractFiles(cwdContractsDir)
      || hasAnyRequiredContractFile(cwdContractsDir)
    ) {
      return {
        contractsDir: cwdContractsDir,
        source: options.source,
      };
    }

    const cliEntrypointContractsDir = resolveContractsDirFromCliEntrypoint();
    if (cliEntrypointContractsDir) {
      return {
        contractsDir: cliEntrypointContractsDir,
        source: 'cli_entry',
      };
    }
  }

  return {
    contractsDir: resolveContractsDirFromSearchRoot(options.searchFrom),
    source: options.source,
  };
}

function enrichContractLoadError(
  error: FrameworkContractError,
  location: ResolvedContractsLocation,
): FrameworkContractError {
  const rawDetails = error.details ?? {};
  const {
    source: legacySource,
    contracts_root_source: existingContractsRootSource,
    contracts_dir: existingContractsDir,
    ...details
  } = rawDetails;

  return new FrameworkContractError(
    error.code,
    error.message,
    {
      ...details,
      contracts_dir:
        typeof existingContractsDir === 'string'
          ? existingContractsDir
          : location.contractsDir,
      contracts_root_source:
        typeof existingContractsRootSource === 'string'
          ? existingContractsRootSource
          : typeof legacySource === 'string'
            ? legacySource
            : location.source,
    },
    error.exitCode,
  );
}

const REQUIRED_CONTRACT_FILES = [
  {
    contract_id: 'workstreams',
    file_name: 'workstreams.json',
    schema_version: (contracts: FrameworkContracts) => contracts.workstreams.version,
  },
  {
    contract_id: 'domains',
    file_name: 'domains.json',
    schema_version: (contracts: FrameworkContracts) => contracts.domains.version,
  },
  {
    contract_id: 'stage_selection_vocabulary',
    file_name: 'stage-selection-vocabulary.json',
    schema_version: (contracts: FrameworkContracts) =>
      contracts.stageSelectionVocabulary.version,
  },
  {
    contract_id: 'task_topology',
    file_name: 'task-topology.json',
    schema_version: (contracts: FrameworkContracts) => contracts.taskTopology.version,
  },
  {
    contract_id: 'public_surface_index',
    file_name: 'public-surface-index.json',
    schema_version: (contracts: FrameworkContracts) => contracts.publicSurfaceIndex.version,
  },
  {
    contract_id: 'agent_workspace_norm',
    file_name: 'agent-workspace-norm-contract.json',
    schema_version: (contracts: FrameworkContracts) => contracts.agentWorkspaceNorm.version,
  },
  {
    contract_id: 'brand_module_registry',
    file_name: 'brand-module-registry.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandModuleRegistry.version,
  },
  {
    contract_id: 'brand_cli_governance',
    file_name: 'brand-cli-governance.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandCliGovernance.version,
  },
  {
    contract_id: 'brand_module_surfaces',
    file_name: 'brand-module-surfaces.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandModuleSurfaces.version,
  },
  {
    contract_id: 'brand_module_l5_operating_evidence',
    file_name: 'brand-module-l5-operating-evidence.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandModuleL5OperatingEvidence.version,
  },
  {
    contract_id: 'brand_system_profile',
    file_name: 'brand-system-profile.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandSystemProfile.version,
  },
  {
    contract_id: 'target_operating_architecture',
    file_name: 'target-operating-architecture-contract.json',
    schema_version: (contracts: FrameworkContracts) => contracts.targetOperatingArchitecture.schema_version,
  },
  {
    contract_id: 'pack_os',
    file_name: 'pack-os-contract.json',
    schema_version: (contracts: FrameworkContracts) => String(contracts.packOs.schema_version),
  },
] as const;

export function validateFrameworkContracts(
  input?: string | FrameworkContractsLoadOptions,
): ContractValidationSummary {
  const contracts = loadFrameworkContracts(input);

  return {
    status: 'valid',
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
    validated_contracts: REQUIRED_CONTRACT_FILES.map((contract) => ({
      contract_id: contract.contract_id,
      file: path.join(contracts.contractsDir, contract.file_name),
      schema_version: contract.schema_version(contracts),
      status: 'valid',
    })),
  };
}

export function loadFrameworkContracts(
  input?: string | FrameworkContractsLoadOptions,
): FrameworkContracts {
  const location = resolveContractsLocation(input);
  const { contractsDir, source } = location;

  try {
    return {
      contractsDir,
      contractsRootSource: source,
      workstreams: validateWorkstreamsRegistry(
        path.join(contractsDir, 'workstreams.json'),
        parseJsonFile(path.join(contractsDir, 'workstreams.json')),
      ),
      domains: validateDomainsRegistry(
        path.join(contractsDir, 'domains.json'),
        parseJsonFile(path.join(contractsDir, 'domains.json')),
      ),
      stageSelectionVocabulary: validateStageSelectionVocabulary(
        path.join(contractsDir, 'stage-selection-vocabulary.json'),
        parseJsonFile(path.join(contractsDir, 'stage-selection-vocabulary.json')),
      ),
      taskTopology: validateTaskTopology(
        path.join(contractsDir, 'task-topology.json'),
        parseJsonFile(path.join(contractsDir, 'task-topology.json')),
      ),
      publicSurfaceIndex: validatePublicSurfaceIndex(
        path.join(contractsDir, 'public-surface-index.json'),
        parseJsonFile(path.join(contractsDir, 'public-surface-index.json')),
      ),
      agentWorkspaceNorm: validateAgentWorkspaceNorm(
        path.join(contractsDir, 'agent-workspace-norm-contract.json'),
        parseJsonFile(path.join(contractsDir, 'agent-workspace-norm-contract.json')),
      ),
      brandModuleRegistry: validateBrandModuleRegistry(
        path.join(contractsDir, 'brand-module-registry.json'),
        parseJsonFile(path.join(contractsDir, 'brand-module-registry.json')),
      ),
      brandCliGovernance: validateBrandCliGovernance(
        path.join(contractsDir, 'brand-cli-governance.json'),
        parseJsonFile(path.join(contractsDir, 'brand-cli-governance.json')),
      ),
      brandModuleSurfaces: validateBrandModuleSurfaces(
        path.join(contractsDir, 'brand-module-surfaces.json'),
        parseJsonFile(path.join(contractsDir, 'brand-module-surfaces.json')),
      ),
      brandModuleL5OperatingEvidence: validateBrandModuleL5OperatingEvidence(
        path.join(contractsDir, 'brand-module-l5-operating-evidence.json'),
        parseJsonFile(path.join(contractsDir, 'brand-module-l5-operating-evidence.json')),
      ),
      brandSystemProfile: validateBrandSystemProfile(
        path.join(contractsDir, 'brand-system-profile.json'),
        parseJsonFile(path.join(contractsDir, 'brand-system-profile.json')),
      ),
      targetOperatingArchitecture: validateTargetOperatingArchitecture(
        path.join(contractsDir, 'target-operating-architecture-contract.json'),
        parseJsonFile(path.join(contractsDir, 'target-operating-architecture-contract.json')),
      ),
      packOs: validatePackOsContract(
        path.join(contractsDir, 'pack-os-contract.json'),
        parseJsonFile(path.join(contractsDir, 'pack-os-contract.json')),
      ),
    };
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && CONTRACT_LOAD_ERROR_CODES.has(error.code)
    ) {
      throw enrichContractLoadError(error, location);
    }

    throw error;
  }
}

export function findWorkstreamOrThrow(
  contracts: FrameworkContracts,
  workstreamId: string,
) {
  const workstream = contracts.workstreams.workstreams.find(
    (entry) => entry.workstream_id === workstreamId,
  );

  if (!workstream) {
    throw new FrameworkContractError(
      'workstream_not_found',
      `Unknown workstream: ${workstreamId}.`,
      { workstream_id: workstreamId },
    );
  }

  return workstream;
}

export function findDomainOrThrow(contracts: FrameworkContracts, domainId: string) {
  const domain = contracts.domains.domains.find(
    (entry) => entry.domain_id === domainId,
  );

  if (!domain) {
    throw new FrameworkContractError(
      'domain_not_found',
      `Unknown domain: ${domainId}.`,
      { domain_id: domainId },
    );
  }

  return domain;
}

export function findSurfaceOrThrow(
  contracts: FrameworkContracts,
  surfaceId: string,
) {
  const surface = contracts.publicSurfaceIndex.surfaces.find(
    (entry) => entry.surface_id === surfaceId,
  );

  if (!surface) {
    throw new FrameworkContractError(
      'surface_not_found',
      `Unknown surface: ${surfaceId}.`,
      { surface_id: surfaceId },
    );
  }

  return surface;
}
