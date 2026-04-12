import fs from 'node:fs';
import path from 'node:path';

import type {
  ContractValidationSummary,
  ContractsRootSource,
  DomainsRegistry,
  GatewayContracts,
  GatewayContractsLoadOptions,
  PublicSurfaceIndexContract,
  RoutingVocabularyContract,
  TaskTopologyContract,
  WorkstreamsRegistry,
} from './types.ts';

type ErrorCode =
  | 'contract_file_missing'
  | 'contract_json_invalid'
  | 'contract_shape_invalid'
  | 'workstream_not_found'
  | 'domain_not_found'
  | 'surface_not_found'
  | 'cli_usage_error'
  | 'unknown_command'
  | 'hermes_binary_not_found'
  | 'hermes_command_failed'
  | 'hermes_output_parse_failed';

const REQUIRED_CONTRACT_FILE_NAMES = [
  'workstreams.json',
  'domains.json',
  'routing-vocabulary.json',
  'task-topology.json',
  'public-surface-index.json',
] as const;

type NormalizedGatewayContractsLoadOptions = {
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

function defaultExitCode(code: ErrorCode): number {
  switch (code) {
    case 'cli_usage_error':
    case 'unknown_command':
      return 2;
    case 'contract_file_missing':
    case 'contract_json_invalid':
    case 'contract_shape_invalid':
      return 3;
    case 'workstream_not_found':
    case 'domain_not_found':
    case 'surface_not_found':
    case 'hermes_binary_not_found':
    case 'hermes_command_failed':
    case 'hermes_output_parse_failed':
      return 4;
  }
}

export class GatewayContractError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    exitCode = defaultExitCode(code),
  ) {
    super(message);
    this.name = 'GatewayContractError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }

  toJSON() {
    return {
      version: 'g2',
      error: {
        code: this.code,
        message: this.message,
        exit_code: this.exitCode,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, field: string, filePath: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Contract field "${field}" must be a non-empty string.`,
      { file: filePath, field },
    );
  }

  return value;
}

function expectStringArray(
  value: unknown,
  field: string,
  filePath: string,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Contract field "${field}" must be a string array.`,
      { file: filePath, field },
    );
  }

  return value;
}

function parseJsonFile(filePath: string): unknown {
  let raw: string;

  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GatewayContractError(
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
    throw new GatewayContractError(
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
    throw new GatewayContractError(
      'contract_shape_invalid',
      'workstreams.json must contain an object root.',
      { file: filePath },
    );
  }

  const version = expectString(value.version, 'version', filePath);
  const workstreams = value.workstreams;

  if (!Array.isArray(workstreams)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'workstreams.json must contain a workstreams array.',
      { file: filePath, field: 'workstreams' },
    );
  }

  return {
    version,
    workstreams: workstreams.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new GatewayContractError(
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

function validateDomainsRegistry(filePath: string, value: unknown): DomainsRegistry {
  if (!isRecord(value)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'domains.json must contain an object root.',
      { file: filePath },
    );
  }

  const version = expectString(value.version, 'version', filePath);
  const domains = value.domains;

  if (!Array.isArray(domains)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'domains.json must contain a domains array.',
      { file: filePath, field: 'domains' },
    );
  }

  return {
    version,
    domains: domains.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Each domain entry must be an object.',
          { file: filePath, index },
        );
      }

      return {
        domain_id: expectString(entry.domain_id, 'domain_id', filePath),
        label: expectString(entry.label, 'label', filePath),
        project: expectString(entry.project, 'project', filePath),
        role: expectString(entry.role, 'role', filePath),
        gateway_surface: expectString(
          entry.gateway_surface,
          'gateway_surface',
          filePath,
        ),
        harness_surface: expectString(
          entry.harness_surface,
          'harness_surface',
          filePath,
        ),
        standalone_allowed:
          typeof entry.standalone_allowed === 'boolean'
            ? entry.standalone_allowed
            : (() => {
                throw new GatewayContractError(
                  'contract_shape_invalid',
                  'Domain field "standalone_allowed" must be a boolean.',
                  { file: filePath, field: 'standalone_allowed' },
                );
              })(),
        owned_workstreams: expectStringArray(
          entry.owned_workstreams,
          'owned_workstreams',
          filePath,
        ),
        non_opl_families: expectStringArray(
          entry.non_opl_families,
          'non_opl_families',
          filePath,
        ),
        canonical_truth_owner: expectStringArray(
          entry.canonical_truth_owner,
          'canonical_truth_owner',
          filePath,
        ),
      };
    }),
  };
}

function validateRoutingVocabulary(
  filePath: string,
  value: unknown,
): RoutingVocabularyContract {
  if (!isRecord(value)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'routing-vocabulary.json must contain an object root.',
      { file: filePath },
    );
  }

  const specialCasesRaw = value.special_cases;
  if (!Array.isArray(specialCasesRaw)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'routing-vocabulary.json must contain a special_cases array.',
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
    routing_rules: expectStringArray(value.routing_rules, 'routing_rules', filePath),
    special_cases: specialCasesRaw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new GatewayContractError(
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
    throw new GatewayContractError(
      'contract_shape_invalid',
      'task-topology.json must contain an object root.',
      { file: filePath },
    );
  }

  const workstreamsRaw = value.workstreams;
  if (!Array.isArray(workstreamsRaw)) {
    throw new GatewayContractError(
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
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Each task topology workstream entry must be an object.',
          { file: filePath, index },
        );
      }

      const familyNotes = entry.family_boundary_notes;
      if (!Array.isArray(familyNotes)) {
        throw new GatewayContractError(
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
        routing_state: expectString(entry.routing_state, 'routing_state', filePath),
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
                throw new GatewayContractError(
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
            throw new GatewayContractError(
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

function validatePublicSurfaceIndex(
  filePath: string,
  value: unknown,
): PublicSurfaceIndexContract {
  if (!isRecord(value)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'public-surface-index.json must contain an object root.',
      { file: filePath },
    );
  }

  const categoriesRaw = value.surface_categories;
  if (!Array.isArray(categoriesRaw)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'public-surface-index.json must contain a surface_categories array.',
      { file: filePath, field: 'surface_categories' },
    );
  }

  const surfacesRaw = value.surfaces;
  if (!Array.isArray(surfacesRaw)) {
    throw new GatewayContractError(
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
        throw new GatewayContractError(
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
        throw new GatewayContractError(
          'contract_shape_invalid',
          'Each public surface entry must be an object.',
          { file: filePath, index },
        );
      }

      const refsRaw = entry.refs;
      if (!Array.isArray(refsRaw)) {
        throw new GatewayContractError(
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
            throw new GatewayContractError(
              'contract_shape_invalid',
              'Each public surface ref must be an object.',
              { file: filePath, index, refIndex },
            );
          }

          if (ref.language !== undefined && typeof ref.language !== 'string') {
            throw new GatewayContractError(
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
      };
    }),
  };
}

function hasRequiredContractFiles(rootPath: string): boolean {
  return REQUIRED_CONTRACT_FILE_NAMES.every((fileName) =>
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
  }
}

function requireNonEmptyPath(
  value: string | undefined,
  source: ContractsRootSource,
  detailKey: 'contracts_dir' | 'search_from',
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GatewayContractError(
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

  return path.join(searchRoot, 'contracts', 'opl-gateway');
}

function resolveExplicitContractsDir(
  contractsDir: string,
  source: ContractsRootSource,
): string {
  const resolvedDir = path.resolve(contractsDir);

  for (const fileName of REQUIRED_CONTRACT_FILE_NAMES) {
    const filePath = path.join(resolvedDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new GatewayContractError(
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
  input?: string | GatewayContractsLoadOptions,
): NormalizedGatewayContractsLoadOptions {
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
  input?: string | GatewayContractsLoadOptions,
): ResolvedContractsLocation {
  const options = normalizeLoadOptions(input);

  if (options.contractsDir !== null) {
    return {
      contractsDir: resolveExplicitContractsDir(options.contractsDir, options.source),
      source: options.source,
    };
  }

  if (options.searchFrom === null) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Contract root resolution requires either an explicit contracts directory or a search root.',
      { source: options.source },
    );
  }

  return {
    contractsDir: resolveContractsDirFromSearchRoot(options.searchFrom),
    source: options.source,
  };
}

function enrichContractLoadError(
  error: GatewayContractError,
  location: ResolvedContractsLocation,
): GatewayContractError {
  const rawDetails = error.details ?? {};
  const {
    source: legacySource,
    contracts_root_source: existingContractsRootSource,
    contracts_dir: existingContractsDir,
    ...details
  } = rawDetails;

  return new GatewayContractError(
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
    schema_version: (contracts: GatewayContracts) => contracts.workstreams.version,
  },
  {
    contract_id: 'domains',
    file_name: 'domains.json',
    schema_version: (contracts: GatewayContracts) => contracts.domains.version,
  },
  {
    contract_id: 'routing_vocabulary',
    file_name: 'routing-vocabulary.json',
    schema_version: (contracts: GatewayContracts) => contracts.routingVocabulary.version,
  },
  {
    contract_id: 'task_topology',
    file_name: 'task-topology.json',
    schema_version: (contracts: GatewayContracts) => contracts.taskTopology.version,
  },
  {
    contract_id: 'public_surface_index',
    file_name: 'public-surface-index.json',
    schema_version: (contracts: GatewayContracts) => contracts.publicSurfaceIndex.version,
  },
] as const;

export function validateGatewayContracts(
  input?: string | GatewayContractsLoadOptions,
): ContractValidationSummary {
  const contracts = loadGatewayContracts(input);

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

export function loadGatewayContracts(
  input?: string | GatewayContractsLoadOptions,
): GatewayContracts {
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
      routingVocabulary: validateRoutingVocabulary(
        path.join(contractsDir, 'routing-vocabulary.json'),
        parseJsonFile(path.join(contractsDir, 'routing-vocabulary.json')),
      ),
      taskTopology: validateTaskTopology(
        path.join(contractsDir, 'task-topology.json'),
        parseJsonFile(path.join(contractsDir, 'task-topology.json')),
      ),
      publicSurfaceIndex: validatePublicSurfaceIndex(
        path.join(contractsDir, 'public-surface-index.json'),
        parseJsonFile(path.join(contractsDir, 'public-surface-index.json')),
      ),
    };
  } catch (error) {
    if (
      error instanceof GatewayContractError
      && CONTRACT_LOAD_ERROR_CODES.has(error.code)
    ) {
      throw enrichContractLoadError(error, location);
    }

    throw error;
  }
}

export function findWorkstreamOrThrow(
  contracts: GatewayContracts,
  workstreamId: string,
) {
  const workstream = contracts.workstreams.workstreams.find(
    (entry) => entry.workstream_id === workstreamId,
  );

  if (!workstream) {
    throw new GatewayContractError(
      'workstream_not_found',
      `Unknown workstream: ${workstreamId}.`,
      { workstream_id: workstreamId },
    );
  }

  return workstream;
}

export function findDomainOrThrow(contracts: GatewayContracts, domainId: string) {
  const domain = contracts.domains.domains.find(
    (entry) => entry.domain_id === domainId,
  );

  if (!domain) {
    throw new GatewayContractError(
      'domain_not_found',
      `Unknown domain: ${domainId}.`,
      { domain_id: domainId },
    );
  }

  return domain;
}

export function findSurfaceOrThrow(
  contracts: GatewayContracts,
  surfaceId: string,
) {
  const surface = contracts.publicSurfaceIndex.surfaces.find(
    (entry) => entry.surface_id === surfaceId,
  );

  if (!surface) {
    throw new GatewayContractError(
      'surface_not_found',
      `Unknown surface: ${surfaceId}.`,
      { surface_id: surfaceId },
    );
  }

  return surface;
}
