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
  PublicSurfaceIndexContract,
  StageSelectionVocabularyContract,
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
import { validateDomainsRegistry } from './domain-contracts.ts';

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

const BRAND_MODULE_IDS = [
  'charter',
  'atlas',
  'workspace',
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
    throw new FrameworkContractError('contract_shape_invalid', 'brand-module-registry.json must contain exactly the nine OPL brand modules.', {
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

  const platformFrontdoorsRaw = value.platform_frontdoors;
  const agentInternalRaw = value.agent_internal_modules;
  const legacyOwnershipRaw = value.legacy_command_ownership;
  if (!Array.isArray(platformFrontdoorsRaw) || !isRecord(agentInternalRaw) || !Array.isArray(legacyOwnershipRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'brand-cli-governance.json must contain platform_frontdoors, agent_internal_modules, and legacy_command_ownership.',
      { file: filePath },
    );
  }

  const seenPlatformModuleIds = new Set<string>();
  const platformFrontdoors = platformFrontdoorsRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each platform_frontdoors entry must be an object.', {
        file: filePath,
        index,
      });
    }

    const moduleId = expectBrandModuleId(entry.module_id, 'platform_frontdoors.module_id', filePath);
    if (seenPlatformModuleIds.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each platform frontdoor module id must be unique.', {
        file: filePath,
        index,
        module_id: moduleId,
      });
    }
    seenPlatformModuleIds.add(moduleId);

    const command = expectString(entry.command, 'platform_frontdoors.command', filePath);
    const expectedCommand = `opl ${moduleId}`;
    if (command !== expectedCommand) {
      throw new FrameworkContractError('contract_shape_invalid', 'platform_frontdoors.command must match the module frontdoor.', {
        file: filePath,
        index,
        module_id: moduleId,
        expected_command: expectedCommand,
        actual_command: command,
      });
    }

    const operations = expectAllowedStringArray(
      entry.operations,
      'platform_frontdoors.operations',
      filePath,
      BRAND_MODULE_CLI_OPERATIONS,
    );
    const expectedOperations: readonly BrandModuleCliOperation[] = moduleId === 'workspace'
      ? WORKSPACE_BRAND_MODULE_CLI_OPERATIONS
      : BRAND_MODULE_CLI_OPERATIONS;
    requireEveryValue(operations, expectedOperations, 'platform_frontdoors.operations', filePath);
    const unexpectedOperations = operations.filter((operation) => !expectedOperations.includes(operation));
    if (unexpectedOperations.length > 0) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'platform_frontdoors.operations contains operations owned by another command surface.',
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
    throw new FrameworkContractError('contract_shape_invalid', 'brand-cli-governance.json must cover exactly the nine OPL brand modules.', {
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
    platform_frontdoors: platformFrontdoors,
    agent_internal_modules: {
      canonical_frontdoor: expectString(agentInternalRaw.canonical_frontdoor, 'agent_internal_modules.canonical_frontdoor', filePath),
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
    throw new FrameworkContractError('contract_shape_invalid', 'brand-module-surfaces.json must contain exactly the nine OPL brand modules.', {
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
