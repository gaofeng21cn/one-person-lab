import fs from 'node:fs';
import path from 'node:path';

import type {
  ContractValidationSummary,
  ContractsRootSource,
  FrameworkContracts,
  FrameworkContractsLoadOptions,
  PackOsContract,
  PublicSurfaceIndexContract,
  StageSelectionVocabularyContract,
  StandardAgentPrinciplesContract,
  TaskTopologyContract,
  WorkstreamsRegistry,
} from '../../kernel/types.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
  type ErrorCode,
} from '../../kernel/contract-validation.ts';
import { validateAgentWorkspaceNorm } from '../workspace/index.ts';
import {
  validateBrandCliGovernance,
  validateBrandModuleRegistry,
  validateBrandModuleSurfaces,
  validateSourceModuleMap,
} from './brand-module-contracts.ts';
import { validateBrandModuleL5OperatingEvidence } from './brand-module-l5-operating-evidence-contract.ts';
import { validateBrandSystemProfile } from './brand-system-profile-contract.ts';
import { validateDomainsRegistry } from '../atlas/index.ts';
import { validatePackBundleContract } from '../pack/index.ts';
import { validatePackOsContract } from '../pack/index.ts';
import { validateScholarSkillsCapabilityModules } from '../pack/index.ts';
import { validateTargetOperatingArchitecture } from './target-operating-architecture-contract.ts';

export { FrameworkContractError } from '../../kernel/contract-validation.ts';

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
  'source-module-map.json',
  'target-operating-architecture-contract.json',
  'standard-agent-principles.json',
  'scholar-skills-capability-modules.json',
  'pack-bundle-contract.json',
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

function validateStandardAgentPrinciples(
  filePath: string,
  value: unknown,
): StandardAgentPrinciplesContract {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'standard-agent-principles.json must contain an object root.',
      { file: filePath },
    );
  }

  const principlesRaw = value.principles;
  if (!Array.isArray(principlesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'standard-agent-principles.json must contain a principles array.',
      { file: filePath, field: 'principles' },
    );
  }

  const moduleOrganization = value.module_organization;
  const adoptionContract = value.adoption_contract;
  const falseAuthorityBoundary = value.false_authority_boundary;
  if (!isRecord(moduleOrganization) || !isRecord(adoptionContract) || !isRecord(falseAuthorityBoundary)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'standard-agent-principles.json must declare module_organization, adoption_contract, and false_authority_boundary objects.',
      { file: filePath },
    );
  }

  return {
    surface_kind: expectString(value.surface_kind, 'surface_kind', filePath),
    version: expectString(value.version, 'version', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    state: expectString(value.state, 'state', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    principle_ids: expectStringArray(value.principle_ids, 'principle_ids', filePath),
    principles: principlesRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each standard-agent principle entry must be an object.',
          { file: filePath, index },
        );
      }

      return {
        principle_id: expectString(entry.principle_id, 'principle_id', filePath),
        owner: expectString(entry.owner, 'owner', filePath),
        summary: expectString(entry.summary, 'summary', filePath),
      };
    }),
    module_organization: moduleOrganization,
    adoption_contract: adoptionContract,
    false_authority_boundary: falseAuthorityBoundary,
  };
}

function expectFalseBoolean(value: unknown, field: string, filePath: string) {
  if (value !== false) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be false.`, { file: filePath, field });
  }
  return false as const;
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

  let cursor = path.dirname(fs.realpathSync.native(cliEntry));
  while (true) {
    const contractsRoot = path.join(cursor, 'contracts', 'opl-framework');
    if (hasRequiredContractFiles(contractsRoot)) {
      return contractsRoot;
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return null;
    }
    cursor = parent;
  }
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
    contract_id: 'source_module_map',
    file_name: 'source-module-map.json',
    schema_version: (contracts: FrameworkContracts) => contracts.sourceModuleMap.version,
  },
  {
    contract_id: 'target_operating_architecture',
    file_name: 'target-operating-architecture-contract.json',
    schema_version: (contracts: FrameworkContracts) => contracts.targetOperatingArchitecture.schema_version,
  },
  {
    contract_id: 'standard_agent_principles',
    file_name: 'standard-agent-principles.json',
    schema_version: (contracts: FrameworkContracts) => contracts.standardAgentPrinciples.version,
  },
  {
    contract_id: 'scholarskills_capability_modules',
    file_name: 'scholar-skills-capability-modules.json',
    schema_version: (contracts: FrameworkContracts) => String(contracts.scholarSkillsCapabilityModules.schema_version),
  },
  {
    contract_id: 'pack_os',
    file_name: 'pack-os-contract.json',
    schema_version: (contracts: FrameworkContracts) => String(contracts.packOs.schema_version),
  },
  {
    contract_id: 'pack_bundle',
    file_name: 'pack-bundle-contract.json',
    schema_version: (contracts: FrameworkContracts) => String(contracts.packBundle.schema_version),
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
      sourceModuleMap: validateSourceModuleMap(
        path.join(contractsDir, 'source-module-map.json'),
        parseJsonFile(path.join(contractsDir, 'source-module-map.json')),
      ),
      targetOperatingArchitecture: validateTargetOperatingArchitecture(
        path.join(contractsDir, 'target-operating-architecture-contract.json'),
        parseJsonFile(path.join(contractsDir, 'target-operating-architecture-contract.json')),
      ),
      standardAgentPrinciples: validateStandardAgentPrinciples(
        path.join(contractsDir, 'standard-agent-principles.json'),
        parseJsonFile(path.join(contractsDir, 'standard-agent-principles.json')),
      ),
      scholarSkillsCapabilityModules: validateScholarSkillsCapabilityModules(
        path.join(contractsDir, 'scholar-skills-capability-modules.json'),
        parseJsonFile(path.join(contractsDir, 'scholar-skills-capability-modules.json')),
      ),
      packBundle: validatePackBundleContract(
        path.join(contractsDir, 'pack-bundle-contract.json'),
        parseJsonFile(path.join(contractsDir, 'pack-bundle-contract.json')),
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
