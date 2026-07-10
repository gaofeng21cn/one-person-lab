import fs from 'node:fs';
import path from 'node:path';

import type {
  ContractValidationSummary,
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
} from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { validateAgentWorkspaceNorm } from './contract-validators/agent-workspace-norm-contract.ts';
import {
  validateBrandCliGovernance,
  validateBrandModuleRegistry,
  validateBrandModuleSurfaces,
  validateSourceModuleMap,
} from './brand-module-contracts.ts';
import { validateBrandModuleL5OperatingEvidence } from './brand-module-l5-operating-evidence-contract.ts';
import { validateBrandSystemProfile } from './brand-system-profile-contract.ts';
import { validateDomainsRegistry } from './contract-validators/domain-contracts.ts';
import { validatePackBundleContract } from './contract-validators/pack-bundle-contract.ts';
import { validatePackOsContract } from './contract-validators/pack-os-contract.ts';
import { validateTargetOperatingArchitecture } from './target-operating-architecture-contract.ts';
import { REQUIRED_CONTRACT_FILES } from './contracts-manifest.ts';
import {
  CONTRACT_LOAD_ERROR_CODES,
  enrichContractLoadError,
  resolveContractsLocation,
} from './contracts-location.ts';

export { FrameworkContractError } from '../../kernel/contract-validation.ts';

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
    return parseJsonText(raw);
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

function validateCliCommandRegistry(filePath: string, value: unknown) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'cli-command-registry.json must contain an object root.',
      { file: filePath },
    );
  }
  if (expectString(value.contract_kind, 'contract_kind', filePath) !== 'opl_cli_command_registry.v1') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'cli-command-registry.json must be opl_cli_command_registry.v1.',
      { file: filePath, field: 'contract_kind' },
    );
  }
  if (!isRecord(value.commands)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'cli-command-registry.json commands must be an object.',
      { file: filePath, field: 'commands' },
    );
  }
  return {
    contract_kind: expectString(value.contract_kind, 'contract_kind', filePath),
    surface_kind: expectString(value.surface_kind, 'surface_kind', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    protected_command_prefixes: expectStringArray(
      value.protected_command_prefixes,
      'protected_command_prefixes',
      filePath,
    ),
    commands: value.commands,
  };
}

function validateObservabilitySemanticConventions(filePath: string, value: unknown) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'observability-semantic-conventions-contract.json must contain an object root.',
      { file: filePath },
    );
  }
  if (
    expectString(value.schema_version, 'schema_version', filePath)
    !== 'opl_observability_semantic_conventions.v1'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'observability semantic conventions must be opl_observability_semantic_conventions.v1.',
      { file: filePath, field: 'schema_version' },
    );
  }
  if (!Array.isArray(value.fields)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'observability semantic conventions fields must be an array.',
      { file: filePath, field: 'fields' },
    );
  }
  if (!isRecord(value.signal_mappings) || !isRecord(value.authority_boundary)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'observability semantic conventions must define signal_mappings and authority_boundary objects.',
      { file: filePath },
    );
  }
  return {
    schema_version: expectString(value.schema_version, 'schema_version', filePath),
    surface_kind: expectString(value.surface_kind, 'surface_kind', filePath),
    owner: expectString(value.owner, 'owner', filePath),
    purpose: expectString(value.purpose, 'purpose', filePath),
    state: expectString(value.state, 'state', filePath),
    machine_boundary: expectString(value.machine_boundary, 'machine_boundary', filePath),
    fields: value.fields.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each observability semantic convention field must be an object.',
          { file: filePath, index },
        );
      }
      return {
        id: expectString(entry.id, 'fields.id', filePath),
        otel_attribute: expectString(entry.otel_attribute, 'fields.otel_attribute', filePath),
      };
    }),
    signal_mappings: value.signal_mappings,
    authority_boundary: value.authority_boundary,
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
      cliCommandRegistry: validateCliCommandRegistry(
        path.join(contractsDir, 'cli-command-registry.json'),
        parseJsonFile(path.join(contractsDir, 'cli-command-registry.json')),
      ),
      targetOperatingArchitecture: validateTargetOperatingArchitecture(
        path.join(contractsDir, 'target-operating-architecture-contract.json'),
        parseJsonFile(path.join(contractsDir, 'target-operating-architecture-contract.json')),
      ),
      observabilitySemanticConventions: validateObservabilitySemanticConventions(
        path.join(contractsDir, 'observability-semantic-conventions-contract.json'),
        parseJsonFile(path.join(contractsDir, 'observability-semantic-conventions-contract.json')),
      ),
      standardAgentPrinciples: validateStandardAgentPrinciples(
        path.join(contractsDir, 'standard-agent-principles.json'),
        parseJsonFile(path.join(contractsDir, 'standard-agent-principles.json')),
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
