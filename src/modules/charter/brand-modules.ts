import { FrameworkContractError } from './contracts.ts';
import type {
  AgentInternalBrandModuleCliOperation,
  BrandModuleAuthorityBoundary,
  BrandModuleCliOperation,
  BrandModuleId,
  BrandModuleRegistryContract,
  BrandModuleRegistryEntry,
  FrameworkContracts,
} from '../../kernel/types.ts';
import {
  listStandardDomainAgentIds,
  resolveStandardAgent,
} from '../../kernel/standard-agent-registry.ts';

type BrandModuleCommandArgs = string[];
type AgentInternalModuleCommandArgs = string[];

const FALSE_AUTHORITY_BOUNDARY: BrandModuleAuthorityBoundary = {
  can_claim_domain_ready: false,
  can_claim_quality_verdict: false,
  can_claim_artifact_authority: false,
  can_claim_production_ready: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_replace_domain_owner: false,
  can_replace_ai_executor_planning: false,
};

const BRAND_MODULE_DOC_PATHS: Record<BrandModuleId, string> = {
  charter: 'docs/references/brand-modules/charter.md',
  atlas: 'docs/references/brand-modules/atlas.md',
  workspace: 'docs/references/brand-modules/workspace.md',
  pack: 'docs/references/brand-modules/pack.md',
  stagecraft: 'docs/references/brand-modules/stagecraft.md',
  runway: 'docs/references/brand-modules/runway.md',
  ledger: 'docs/references/brand-modules/ledger.md',
  console: 'docs/references/brand-modules/console.md',
  'foundry': 'docs/references/brand-modules/foundry.md',
  connect: 'docs/references/brand-modules/connect.md',
};

const HUMAN_DOC_PATHS: Record<string, string> = {
  'human_doc:opl_brand_module_maturity_against_workspace': 'docs/references/brand-modules/current-maturity-against-workspace.md',
  'human_doc:opl_status': 'docs/status.md',
  'human_doc:opl_architecture': 'docs/architecture.md',
  'human_doc:opl_stage_native_kernel_rollout_plan': 'docs/active/opl-stage-native-kernel-rollout-plan.md',
  'human_doc:opl_runtime_index': 'docs/runtime/README.md',
  'human_doc:opl_delivery_index': 'docs/delivery/README.md',
  'human_doc:opl_public_surface_index': 'docs/product/opl-public-surface-index.md',
  'human_doc:opl_foundry_agent_target_operating_architecture': 'docs/active/opl-foundry-agent-target-operating-architecture.md',
};

function brandModuleRegistry(contracts: FrameworkContracts) {
  return contracts.brandModuleRegistry;
}

function brandCliGovernance(contracts: FrameworkContracts) {
  return contracts.brandCliGovernance;
}

function brandModuleSurface(contracts: FrameworkContracts, moduleId: BrandModuleId) {
  return contracts.brandModuleSurfaces.modules.find((entry) => entry.module_id === moduleId);
}

function statusDocPaths(entry: BrandModuleRegistryEntry) {
  return entry.status_doc_refs
    .map((ref) => HUMAN_DOC_PATHS[ref])
    .filter((ref): ref is string => typeof ref === 'string');
}

function compactModule(entry: BrandModuleRegistryEntry) {
  return {
    module_id: entry.module_id,
    brand_name: entry.brand_name,
    owner: entry.owner,
    purpose: entry.purpose,
    state: entry.state,
    module_doc_ref: entry.module_doc_ref,
    module_doc_path: BRAND_MODULE_DOC_PATHS[entry.module_id],
    maturity_level: entry.maturity_level,
    contract_refs: entry.contract_refs,
    cli_surfaces: entry.cli_surfaces,
    app_surfaces: entry.app_surfaces,
    descriptor_surfaces: entry.descriptor_surfaces,
    validation_surfaces: entry.validation_surfaces,
    status_doc_refs: entry.status_doc_refs,
    status_doc_paths: statusDocPaths(entry),
    authority_boundary: entry.authority_boundary,
    forbidden_claims: entry.forbidden_claims,
  };
}

function findModuleOrThrow(contracts: FrameworkContracts, moduleId: BrandModuleId) {
  const module = brandModuleRegistry(contracts).modules.find((entry) => entry.module_id === moduleId);
  if (!module) {
    throw new FrameworkContractError('contract_shape_invalid', `Unknown brand module: ${moduleId}.`, {
      module_id: moduleId,
      contract_ref: 'contracts/opl-framework/brand-module-registry.json',
    });
  }
  return module;
}

function findCommandSurfaceOrThrow(contracts: FrameworkContracts, moduleId: BrandModuleId) {
  const commandSurface = brandCliGovernance(contracts).platform_command_surfaces.find((entry) => entry.module_id === moduleId);
  if (!commandSurface) {
    throw new FrameworkContractError('contract_shape_invalid', `Missing brand CLI command surface: ${moduleId}.`, {
      module_id: moduleId,
      contract_ref: 'contracts/opl-framework/brand-cli-governance.json',
    });
  }
  return commandSurface;
}

function buildModuleCommandChecks(
  contracts: FrameworkContracts,
  module: BrandModuleRegistryEntry,
  operation: BrandModuleCliOperation,
) {
  const commandSurface = findCommandSurfaceOrThrow(contracts, module.module_id);
  const authorityViolations = Object.entries(module.authority_boundary)
    .filter(([, value]) => value !== false)
    .map(([field]) => field);
  const command = `${commandSurface.command} ${operation} --json`;

  return [
    {
      check_id: 'registry_entry_present',
      status: 'pass',
      ref: `contracts/opl-framework/brand-module-registry.json#modules.${module.module_id}`,
    },
    {
      check_id: 'command_surface_operation_declared',
      status: commandSurface.operations.includes(operation) ? 'pass' : 'fail',
      command,
    },
    {
      check_id: 'authority_boundary_false',
      status: authorityViolations.length === 0 ? 'pass' : 'fail',
      violations: authorityViolations,
    },
    {
      check_id: 'forbidden_claims_present',
      status: module.forbidden_claims.length > 0 ? 'pass' : 'fail',
      forbidden_claims: module.forbidden_claims,
    },
  ];
}

function commandSurfaceCollisionPolicy(moduleId: BrandModuleId) {
  return moduleId === 'workspace'
    ? 'preserve_workspace_operational_validate_doctor_interfaces'
    : 'none';
}

function buildBrandModuleSurface(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
  operation: BrandModuleCliOperation,
) {
  const module = findModuleOrThrow(contracts, moduleId);
  const commandSurface = findCommandSurfaceOrThrow(contracts, moduleId);
  const checks = buildModuleCommandChecks(contracts, module, operation);
  const status = checks.every((entry) => entry.status === 'pass') ? 'valid' : 'invalid';

  return {
    version: 'g2',
    brand_module_surface: {
      surface_kind: `opl_${moduleId.replace(/-/g, '_')}_brand_module_${operation}`,
      module_id: moduleId,
      brand_name: module.brand_name,
      operation,
      canonical_command_surface: commandSurface.command,
      command: `${commandSurface.command} ${operation} --json`,
      status: operation === 'doctor' ? (status === 'valid' ? 'pass' : 'fail') : status,
      registry_ref: `contracts/opl-framework/brand-module-registry.json#modules.${moduleId}`,
      governance_ref: `contracts/opl-framework/brand-cli-governance.json#platform_command_surfaces.${moduleId}`,
      module_doc_ref: module.module_doc_ref,
      contract_refs: module.contract_refs,
      cli_surfaces: module.cli_surfaces,
      app_surfaces: module.app_surfaces,
      descriptor_surfaces: module.descriptor_surfaces,
      validation_surfaces: module.validation_surfaces,
      status_doc_refs: module.status_doc_refs,
      checks,
      authority_boundary: module.authority_boundary,
      forbidden_claims: module.forbidden_claims,
      command_surface_collision_policy: commandSurfaceCollisionPolicy(moduleId),
      machine_boundary: 'Read-only brand module command surface; does not write domain truth, owner receipt, artifact body, quality verdict, typed blocker, or production readiness.',
    },
  };
}

function agentDomainIds(): string[] {
  return [...listStandardDomainAgentIds()];
}

function normalizeAgentDomainId(domainId: string) {
  return resolveStandardAgent(domainId)?.agent_id ?? domainId;
}

function findAgentInternalModuleOrThrow(contracts: FrameworkContracts, agentModuleId: string) {
  const module = brandCliGovernance(contracts).agent_internal_modules.module_spine
    .find((entry) => entry.agent_module_id === agentModuleId);
  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown agent internal module: ${agentModuleId}.`, {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent_module_id>',
      agent_module_id: agentModuleId,
      allowed_module_ids: brandCliGovernance(contracts).agent_internal_modules.module_spine.map((entry) => entry.agent_module_id),
    });
  }
  return module;
}

function parseAgentInternalModuleInspectArgs(args: AgentInternalModuleCommandArgs) {
  const domainIndex = args.indexOf('--domain');
  const moduleIndex = args.indexOf('--module');
  const domainId = domainIndex >= 0 ? args[domainIndex + 1] : undefined;
  const agentModuleId = moduleIndex >= 0 ? args[moduleIndex + 1] : undefined;
  const consumed = new Set([domainIndex, domainIndex + 1, moduleIndex, moduleIndex + 1]);
  const extraArgs = args.filter((_, index) => !consumed.has(index));

  if (
    domainIndex < 0
    || moduleIndex < 0
    || !domainId
    || !agentModuleId
    || domainId.startsWith('--')
    || agentModuleId.startsWith('--')
    || extraArgs.length > 0
  ) {
    throw new FrameworkContractError('cli_usage_error', 'agents modules inspect requires --domain <domain_id> --module <agent_module_id>.', {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent_module_id>',
      examples: ['opl agents modules inspect --domain mas --module agent-runway --json'],
      required: ['--domain', '--module'],
      unexpected_args: extraArgs,
    });
  }

  return { domainId, agentModuleId };
}

function buildBrandModulesEnvelope(registry: BrandModuleRegistryContract) {
  return {
    surface_kind: 'opl_brand_modules',
    version: registry.version,
    scope: registry.scope,
    owner: registry.owner,
    purpose: registry.purpose,
    state: registry.state,
    machine_boundary: registry.machine_boundary,
    baseline_module_id: registry.baseline_module_id,
    external_reference_principles: registry.external_reference_principles,
  };
}

function parseModuleArg(args: BrandModuleCommandArgs): BrandModuleId {
  const moduleIndex = args.indexOf('--module');
  if (moduleIndex < 0 || !args[moduleIndex + 1] || args[moduleIndex + 1].startsWith('--')) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules inspect requires --module <module_id>.', {
      usage: 'opl brand-modules inspect --module <module_id>',
      examples: ['opl brand-modules inspect --module workspace --json'],
      required: ['--module'],
    });
  }

  const extraArgs = args.filter((_, index) => index !== moduleIndex && index !== moduleIndex + 1);
  if (extraArgs.length > 0) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules inspect only accepts --module <module_id>.', {
      usage: 'opl brand-modules inspect --module <module_id>',
      examples: ['opl brand-modules inspect --module workspace --json'],
      unexpected_args: extraArgs,
    });
  }

  return args[moduleIndex + 1] as BrandModuleId;
}

export function buildBrandModulesList(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  return {
    version: 'g2',
    brand_modules: {
      ...buildBrandModulesEnvelope(registry),
      module_count: registry.modules.length,
      modules: registry.modules.map(compactModule),
    },
  };
}

export function buildBrandModuleInspect(contracts: FrameworkContracts, args: BrandModuleCommandArgs) {
  const registry = brandModuleRegistry(contracts);
  const moduleId = parseModuleArg(args);
  const module = registry.modules.find((entry) => entry.module_id === moduleId);

  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown brand module: ${moduleId}.`, {
      usage: 'opl brand-modules inspect --module <module_id>',
      module_id: moduleId,
      allowed_module_ids: registry.modules.map((entry) => entry.module_id),
    });
  }

  return {
    version: 'g2',
    brand_module: {
      ...compactModule(module),
      machine_boundary: module.machine_boundary,
      l4_gates: module.l4_gates,
    },
  };
}

export function buildBrandModuleMaturity(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  const l5Evidence = contracts.brandModuleL5OperatingEvidence;
  const belowBaselineModuleIds = registry.modules
    .filter((entry) => entry.maturity_level !== 'L4_structural_baseline')
    .map((entry) => entry.module_id);
  const l5ClaimedModuleIds = l5Evidence.modules
    .filter((entry) => entry.l5_can_be_claimed)
    .map((entry) => entry.module_id);
  const l5OpenGapModuleIds = l5Evidence.modules
    .filter((entry) => !entry.l5_can_be_claimed)
    .map((entry) => entry.module_id);

  return {
    version: 'g2',
    brand_module_maturity: {
      surface_kind: 'opl_brand_module_maturity',
      version: registry.version,
      baseline_module_id: registry.baseline_module_id,
      module_count: registry.modules.length,
      l4_structural_baseline_count: registry.modules.length - belowBaselineModuleIds.length,
      below_baseline_module_ids: belowBaselineModuleIds,
      l5_target_level: l5Evidence.target_level,
      l5_evidence_contract_ref: 'contracts/opl-framework/brand-module-l5-operating-evidence.json',
      l5_claimed_count: l5ClaimedModuleIds.length,
      l5_claimed_module_ids: l5ClaimedModuleIds,
      l5_open_gap_count: l5OpenGapModuleIds.length,
      l5_open_gap_module_ids: l5OpenGapModuleIds,
      maturity_model: registry.maturity_model,
      modules: registry.modules.map((entry) => ({
        module_id: entry.module_id,
        brand_name: entry.brand_name,
        maturity_level: entry.maturity_level,
        l5_completion_status: l5Evidence.modules.find((candidate) => candidate.module_id === entry.module_id)?.l5_completion_status ?? 'evidence_required',
        l5_can_be_claimed: l5Evidence.modules.find((candidate) => candidate.module_id === entry.module_id)?.l5_can_be_claimed ?? false,
        l4_gate_count: entry.l4_gates.length,
        missing_l4_gates: [],
      })),
    },
  };
}

export function buildBrandModuleValidation(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  const requiredGates = registry.maturity_model[0]?.required_gates ?? [];
  const missingL4GateModules = registry.modules
    .map((entry) => ({
      module_id: entry.module_id,
      missing_gates: requiredGates.filter((gate) => !entry.l4_gates.includes(gate)),
    }))
    .filter((entry) => entry.missing_gates.length > 0);
  const authorityBoundaryViolations = registry.modules
    .flatMap((entry) => Object.entries(entry.authority_boundary).filter(([, value]) => value !== false).map(([field]) => ({
      module_id: entry.module_id,
      field,
    })));

  return {
    version: 'g2',
    brand_module_validation: {
      surface_kind: 'opl_brand_module_validation',
      status: missingL4GateModules.length === 0 && authorityBoundaryViolations.length === 0 ? 'valid' : 'invalid',
      registry_ref: 'contracts/opl-framework/brand-module-registry.json',
      validated_module_count: registry.modules.length,
      required_gates: requiredGates,
      missing_l4_gate_modules: missingL4GateModules,
      authority_boundary_violations: authorityBoundaryViolations,
      forbidden_claim_gate: {
        status: registry.modules.every((entry) => entry.forbidden_claims.length > 0) ? 'valid' : 'invalid',
        module_ids: registry.modules.map((entry) => entry.module_id),
      },
    },
  };
}

export function buildBrandModuleInterfaces(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  return {
    version: 'g2',
    brand_module_interfaces: {
      surface_kind: 'opl_brand_module_interface_bundle',
      version: registry.version,
      module_count: registry.modules.length,
      registry_ref: 'contracts/opl-framework/brand-module-registry.json',
      cli: {
        commands: [
          'opl brand-modules list --json',
          'opl brand-modules inspect --module <module_id> --json',
          'opl brand-modules maturity --json',
          'opl brand-modules validate --json',
          'opl brand-modules interfaces --json',
          'opl brand-modules l5-status --json',
          'opl brand-modules l5-status --module <module_id> --json',
          'opl brand-modules l5-validate --json',
          'opl brand-modules l5-interfaces --json',
          ...brandCliGovernance(contracts).platform_command_surfaces.flatMap((entry) =>
            [
              ...entry.operations.map((operation) => `${entry.command} ${operation} --json`),
              `${entry.command} l5-status --json`,
            ]
          ),
          'opl agents modules list --json',
          'opl agents modules inspect --domain <domain_id> --module <agent_module_id> --json',
          'opl agents modules interfaces --json',
          'opl agents modules validate --json',
          'opl agents modules doctor --json',
        ],
      },
      app: {
        descriptors: [
          {
            action_id: 'brand_modules_list',
            command: 'opl brand-modules list --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_inspect',
            command: 'opl brand-modules inspect --module <module_id> --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_maturity',
            command: 'opl brand-modules maturity --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_l5_status',
            command: 'opl brand-modules l5-status --json',
            mutation: false,
            descriptor_only: true,
          },
        ],
      },
      descriptor: {
        delegates: [
          {
            delegate_id: 'brand_modules_registry',
            ref: 'contracts/opl-framework/brand-module-registry.json',
            execution: 'descriptor_only',
          },
          {
            delegate_id: 'brand_modules_cli_bundle',
            ref: 'opl brand-modules interfaces --json',
            execution: 'descriptor_only',
          },
          {
            delegate_id: 'brand_modules_l5_evidence',
            ref: 'contracts/opl-framework/brand-module-l5-operating-evidence.json',
            execution: 'descriptor_only',
          },
        ],
      },
      validation: {
        commands: [
          'opl brand-modules validate --json',
          'opl brand-modules l5-validate --json',
          'opl contract validate --json',
        ],
      },
      modules: registry.modules.map((entry) => ({
        module_id: entry.module_id,
        brand_name: entry.brand_name,
        native_cli_family: brandModuleSurface(contracts, entry.module_id)?.native_cli_family ?? null,
        module_surface_contract_ref: `contracts/opl-framework/brand-module-surfaces.json#modules.${entry.module_id}`,
        cli_surfaces: entry.cli_surfaces,
        app_surfaces: entry.app_surfaces,
        descriptor_surfaces: entry.descriptor_surfaces,
        validation_surfaces: entry.validation_surfaces,
      })),
      authority_boundary: FALSE_AUTHORITY_BOUNDARY,
      forbidden_claims: [
        'domain_ready',
        'quality_verdict',
        'artifact_authority',
        'production_ready',
        'domain_truth_write',
        'owner_receipt_signed_by_opl',
      ],
    },
  };
}

export function buildAgentInternalBrandModulesList(contracts: FrameworkContracts) {
  const governance = brandCliGovernance(contracts).agent_internal_modules;
  const domainIds = agentDomainIds();
  return {
    version: 'g2',
    agent_internal_modules: {
      surface_kind: 'opl_agent_internal_brand_module_list',
      canonical_command_surface: governance.canonical_command_surface,
      domain_ids: domainIds,
      domain_count: domainIds.length,
      platform_module_ids: brandModuleRegistry(contracts).modules.map((entry) => entry.module_id),
      agent_module_ids: governance.module_spine.map((entry) => entry.agent_module_id),
      module_count_per_domain: governance.module_spine.length,
      modules: governance.module_spine,
      authority_boundary: governance.authority_boundary,
      machine_boundary: 'Read-only domain-agent internal brand-module spine; does not make internal modules OPL platform modules or domain authority surfaces.',
    },
  };
}

export function buildAgentInternalBrandModuleInspect(
  contracts: FrameworkContracts,
  args: AgentInternalModuleCommandArgs,
) {
  const { domainId, agentModuleId } = parseAgentInternalModuleInspectArgs(args);
  const normalizedDomainId = normalizeAgentDomainId(domainId);
  const domainIds = agentDomainIds();
  if (!domainIds.includes(normalizedDomainId)) {
    throw new FrameworkContractError('cli_usage_error', `Unknown OPL top-level domain agent: ${domainId}.`, {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent_module_id>',
      domain_id: domainId,
      allowed_domain_ids: domainIds,
    });
  }

  const governance = brandCliGovernance(contracts).agent_internal_modules;
  const internalModule = findAgentInternalModuleOrThrow(contracts, agentModuleId);
  const platformModule = findModuleOrThrow(contracts, internalModule.platform_analogue_module_id);

  return {
    version: 'g2',
    agent_internal_module: {
      surface_kind: 'opl_agent_internal_brand_module_inspect',
      domain_id: normalizedDomainId,
      agent_module_id: internalModule.agent_module_id,
      platform_analogue_module_id: internalModule.platform_analogue_module_id,
      platform_module_brand_name: platformModule.brand_name,
      purpose: internalModule.purpose,
      canonical_command_surface: governance.canonical_command_surface,
      module_command_surface: `opl agents modules inspect --domain ${normalizedDomainId} --module ${internalModule.agent_module_id}`,
      command_pattern: internalModule.command_pattern,
      registry_ref: `contracts/opl-framework/brand-module-registry.json#modules.${platformModule.module_id}`,
      governance_ref: `contracts/opl-framework/brand-cli-governance.json#agent_internal_modules.module_spine.${internalModule.agent_module_id}`,
      authority_boundary: governance.authority_boundary,
      machine_boundary: 'Read-only internal module projection; domain truth and owner receipts remain in the domain agent repo.',
    },
  };
}

export function buildAgentInternalBrandModuleInterfaces(contracts: FrameworkContracts) {
  const governance = brandCliGovernance(contracts).agent_internal_modules;
  return {
    version: 'g2',
    agent_internal_module_interfaces: {
      surface_kind: 'opl_agent_internal_brand_module_interfaces',
      canonical_command_surface: governance.canonical_command_surface,
      cli: {
        commands: [
          'opl agents modules list --json',
          'opl agents modules inspect --domain <domain_id> --module <agent_module_id> --json',
          'opl agents modules interfaces --json',
          'opl agents modules validate --json',
          'opl agents modules doctor --json',
        ],
      },
      descriptor: {
        refs: [
          'contracts/opl-framework/brand-cli-governance.json#agent_internal_modules',
          'contracts/opl-framework/brand-module-registry.json',
        ],
      },
      module_spine: governance.module_spine,
      authority_boundary: governance.authority_boundary,
    },
  };
}

export function buildAgentInternalBrandModuleValidation(contracts: FrameworkContracts) {
  const governance = brandCliGovernance(contracts).agent_internal_modules;
  const domainIds = agentDomainIds();
  const platformModuleIds = new Set(brandModuleRegistry(contracts).modules.map((entry) => entry.module_id));
  const missingDomainModuleSets = domainIds
    .filter(() => governance.module_spine.some((entry) => !platformModuleIds.has(entry.platform_analogue_module_id)))
    .map((domainId) => ({ domain_id: domainId, missing_modules: [] }));
  const authorityViolations = Object.entries(governance.authority_boundary)
    .filter(([, value]) => value !== false)
    .map(([field]) => field);
  const status = missingDomainModuleSets.length === 0 && authorityViolations.length === 0 ? 'valid' : 'invalid';

  return {
    version: 'g2',
    agent_internal_module_validation: {
      surface_kind: 'opl_agent_internal_brand_module_validation',
      status,
      domain_ids: domainIds,
      module_count_per_domain: governance.module_spine.length,
      required_operations: governance.required_operations,
      missing_domain_module_sets: missingDomainModuleSets,
      authority_boundary_violations: authorityViolations,
      authority_boundary: governance.authority_boundary,
    },
  };
}

export function buildAgentInternalBrandModuleDoctor(contracts: FrameworkContracts) {
  const validation = buildAgentInternalBrandModuleValidation(contracts).agent_internal_module_validation;
  return {
    version: 'g2',
    agent_internal_module_doctor: {
      surface_kind: 'opl_agent_internal_brand_module_doctor',
      status: validation.status === 'valid' ? 'pass' : 'fail',
      validation,
      next_safe_action: validation.status === 'valid'
        ? null
        : 'Fix contracts/opl-framework/brand-cli-governance.json before treating agent internal brand modules as complete.',
    },
  };
}
