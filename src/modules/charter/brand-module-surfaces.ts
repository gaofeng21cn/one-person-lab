import { FrameworkContractError } from './contracts.ts';
import type {
  BrandModuleId,
  BrandModuleRegistryEntry,
  BrandModuleSurfaceContractEntry,
  BrandModuleCliOperation,
  FoundryControlCliFamily,
  FrameworkContracts,
} from '../../kernel/types.ts';

type BrandModuleSurfaceCommand = 'status' | 'inspect' | 'interfaces' | 'validate' | 'doctor';
type AgentInternalModuleCommand = 'list' | 'inspect' | 'interfaces' | 'validate' | 'doctor';
type BrandModuleSurfaceStatus = 'valid' | 'invalid';

const NATIVE_SUBCOMMANDS = ['status', 'inspect', 'interfaces', 'validate', 'doctor'] as const;

const BRAND_MODULE_OBJECT_VIEWS: Partial<Record<BrandModuleId, readonly string[]>> = {
  charter: ['authority', 'terms', 'decisions'],
  atlas: ['list', 'surfaces', 'graph', 'lifecycle'],
  pack: ['domain-packs', 'authority-abi', 'generated-surfaces', 'compiler'],
  stagecraft: ['stages', 'graph', 'receipts', 'blockers'],
  runway: ['attempt-index', 'attempts', 'provider', 'blockers'],
  ledger: ['evidence', 'artifacts', 'receipts', 'lineage'],
  console: ['actions', 'read-model', 'drilldown'],
  connect: ['descriptors', 'packages', 'channels', 'drift'],
};

function isFoundryControlCliFamily(
  family: BrandModuleSurfaceContractEntry['native_cli_family'],
): family is FoundryControlCliFamily {
  return 'control_commands' in family;
}

function coreNativeCommands(entry: BrandModuleSurfaceContractEntry) {
  const family = entry.native_cli_family;
  if (isFoundryControlCliFamily(family)) {
    return Object.values(family.control_commands);
  }
  return NATIVE_SUBCOMMANDS.map((subcommand) => family[subcommand]);
}

function allNativeCommands(entry: BrandModuleSurfaceContractEntry) {
  return [...coreNativeCommands(entry), ...entry.native_cli_family.additional_commands];
}

function findRegistryEntry(contracts: FrameworkContracts, moduleId: BrandModuleId) {
  const entry = contracts.brandModuleRegistry.modules.find((candidate) => candidate.module_id === moduleId);
  if (!entry) {
    throw new FrameworkContractError('contract_shape_invalid', `Missing brand module registry entry: ${moduleId}.`, {
      module_id: moduleId,
      contract_ref: 'contracts/opl-framework/brand-module-registry.json',
    });
  }
  return entry;
}

function findSurfaceEntry(contracts: FrameworkContracts, moduleId: BrandModuleId) {
  const entry = contracts.brandModuleSurfaces.modules.find((candidate) => candidate.module_id === moduleId);
  if (!entry) {
    throw new FrameworkContractError('contract_shape_invalid', `Missing brand module surface entry: ${moduleId}.`, {
      module_id: moduleId,
      contract_ref: 'contracts/opl-framework/brand-module-surfaces.json',
    });
  }
  return entry;
}

function authorityBoundaryViolations(entry: BrandModuleSurfaceContractEntry) {
  return Object.entries(entry.authority_boundary)
    .filter(([, value]) => value !== false)
    .map(([field]) => field);
}

function missingNativeCommands(entry: BrandModuleSurfaceContractEntry) {
  const commands = coreNativeCommands(entry);
  return entry.module_id === 'foundry'
    ? commands.length === 6 ? [] : ['dedicated_foundry_control_abi']
    : NATIVE_SUBCOMMANDS
      .map((subcommand) => `opl ${entry.module_id} ${subcommand} --json`)
      .filter((command) => !commands.includes(command));
}

function missingRegistryCrossRefs(
  surface: BrandModuleSurfaceContractEntry,
  registry: BrandModuleRegistryEntry,
) {
  const missing: string[] = [];
  if (!registry.contract_refs.includes('contracts/opl-framework/brand-module-surfaces.json')) {
    missing.push('registry.contract_refs:brand-module-surfaces');
  }
  for (const command of coreNativeCommands(surface)) {
    if (!registry.cli_surfaces.includes(command)) {
      missing.push(`registry.cli_surfaces:${command}`);
    }
  }
  if (surface.module_id === 'foundry') {
    if (!registry.descriptor_surfaces.includes('opl brand-modules inspect --module foundry --json')) {
      missing.push('registry.descriptor_surfaces:opl brand-modules inspect --module foundry --json');
    }
    if (!registry.validation_surfaces.includes('opl contract validate --json')) {
      missing.push('registry.validation_surfaces:opl contract validate --json');
    }
  } else {
    if (!registry.descriptor_surfaces.includes(`opl ${surface.module_id} interfaces --json`)) {
      missing.push(`registry.descriptor_surfaces:opl ${surface.module_id} interfaces --json`);
    }
    if (!registry.validation_surfaces.includes(`opl ${surface.module_id} validate --json`)) {
      missing.push(`registry.validation_surfaces:opl ${surface.module_id} validate --json`);
    }
    if (!registry.validation_surfaces.includes(`opl ${surface.module_id} doctor --json`)) {
      missing.push(`registry.validation_surfaces:opl ${surface.module_id} doctor --json`);
    }
  }
  return missing;
}

function buildChecks(
  surface: BrandModuleSurfaceContractEntry,
  registry: BrandModuleRegistryEntry,
) {
  const missingCommands = missingNativeCommands(surface);
  const registryMissingRefs = missingRegistryCrossRefs(surface, registry);
  const authorityViolations = authorityBoundaryViolations(surface);
  const forbiddenClaimGate = surface.forbidden_claims.length > 0 && registry.forbidden_claims.length > 0;

  const descriptorRef = surface.module_id === 'foundry'
    ? 'opl brand-modules inspect --module foundry --json'
    : `opl ${surface.module_id} interfaces --json`;
  const validationCommandsPresent = surface.module_id === 'foundry'
    ? surface.validation.commands.includes('opl contract validate --json')
    : surface.validation.commands.includes(`opl ${surface.module_id} validate --json`)
      && surface.validation.commands.includes(`opl ${surface.module_id} doctor --json`);

  return [
    {
      check_id: 'surface_contract_loaded',
      status: 'pass',
      refs: ['contracts/opl-framework/brand-module-surfaces.json'],
    },
    {
      check_id: 'registry_cross_reference',
      status: registryMissingRefs.length === 0 ? 'pass' : 'fail',
      missing_refs: registryMissingRefs,
    },
    {
      check_id: 'native_cli_family_present',
      status: missingCommands.length === 0 ? 'pass' : 'fail',
      missing_commands: missingCommands,
    },
    {
      check_id: 'app_read_model_present',
      status: surface.app_read_model.descriptors.length >= 3 ? 'pass' : 'fail',
      descriptors: surface.app_read_model.descriptors.map((entry) => entry.action_id),
    },
    {
      check_id: 'descriptor_surface_present',
      status: surface.descriptor_surface.descriptor_refs.includes(descriptorRef) ? 'pass' : 'fail',
      descriptor_refs: surface.descriptor_surface.descriptor_refs,
    },
    {
      check_id: surface.module_id === 'foundry' ? 'foundry_contract_validation_present' : 'validation_and_doctor_present',
      status: validationCommandsPresent ? 'pass' : 'fail',
      commands: surface.validation.commands,
    },
    {
      check_id: 'authority_boundary_false',
      status: authorityViolations.length === 0 ? 'pass' : 'fail',
      violations: authorityViolations,
    },
    {
      check_id: 'forbidden_claims_present',
      status: forbiddenClaimGate ? 'pass' : 'fail',
      forbidden_claims: surface.forbidden_claims,
    },
  ];
}

function moduleEnvelope(surface: BrandModuleSurfaceContractEntry) {
  return {
    module_id: surface.module_id,
    brand_name: surface.brand_name,
    command_prefix: surface.command_prefix,
    surface_kind_prefix: surface.surface_kind_prefix,
    state: surface.state,
    module_doc_ref: surface.module_doc_ref,
  };
}

function moduleCommandSurfaceEnvelope(
  surface: BrandModuleSurfaceContractEntry,
  command: BrandModuleSurfaceCommand,
  status: 'valid' | 'invalid',
) {
  return {
    surface_kind: `opl_${surface.module_id.replace(/-/g, '_')}_brand_module_${command}`,
    module_id: surface.module_id,
    operation: command,
    canonical_command_surface: `opl ${surface.module_id}`,
    status: command === 'doctor' && status === 'valid' ? 'pass' : status,
    contract_ref: `contracts/opl-framework/brand-module-surfaces.json#modules.${surface.module_id}`,
    command_surface_collision_policy: surface.module_id === 'workspace'
      ? 'preserve_workspace_operational_validate_doctor_interfaces'
      : 'module_owned_surface',
    authority_boundary: surface.authority_boundary,
    forbidden_claims: surface.forbidden_claims,
  };
}

function buildModuleSurface(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const surface = findSurfaceEntry(contracts, moduleId);
  const registry = findRegistryEntry(contracts, moduleId);
  const checks = buildChecks(surface, registry);
  const status: BrandModuleSurfaceStatus = checks.every((entry) => entry.status === 'pass') ? 'valid' : 'invalid';
  return { surface, registry, checks, status };
}

function buildBrandModuleSurfaceStatus(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const { surface, registry, checks, status } = buildModuleSurface(contracts, moduleId);
  return {
    version: 'g2',
    brand_module_surface: moduleCommandSurfaceEnvelope(surface, 'status', status),
    [`${surface.surface_kind_prefix}_status`]: {
      surface_kind: `${surface.surface_kind_prefix}_status`,
      ...moduleEnvelope(surface),
      completion_level: surface.status.completion_level,
      status,
      object_model: surface.object_model.primary_objects,
      native_cli_family: surface.native_cli_family,
      app_action_ids: surface.app_read_model.descriptors.map((entry) => entry.action_id),
      validation_commands: surface.validation.commands,
      doctor_checks: surface.doctor.checks,
      evidence_refs: surface.status.evidence_refs,
      registry_ref: `contracts/opl-framework/brand-module-registry.json#modules.${registry.module_id}`,
      surface_contract_ref: `contracts/opl-framework/brand-module-surfaces.json#modules.${surface.module_id}`,
      checks,
      not_claims: surface.status.not_claims,
      authority_boundary: surface.authority_boundary,
    },
  };
}

export function buildBrandModuleSurfaceInspect(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const { surface, registry, checks, status } = buildModuleSurface(contracts, moduleId);
  return {
    version: 'g2',
    brand_module_surface: moduleCommandSurfaceEnvelope(surface, 'inspect', status),
    [`${surface.surface_kind_prefix}_inspect`]: {
      surface_kind: `${surface.surface_kind_prefix}_inspect`,
      ...moduleEnvelope(surface),
      status,
      object_model: surface.object_model,
      registry_projection: {
        maturity_level: registry.maturity_level,
        l4_gates: registry.l4_gates,
        contract_refs: registry.contract_refs,
        cli_surfaces: registry.cli_surfaces,
        app_surfaces: registry.app_surfaces,
        descriptor_surfaces: registry.descriptor_surfaces,
        validation_surfaces: registry.validation_surfaces,
        status_doc_refs: registry.status_doc_refs,
      },
      app_read_model: surface.app_read_model,
      descriptor_surface: surface.descriptor_surface,
      validation: surface.validation,
      doctor: surface.doctor,
      checks,
      authority_boundary: surface.authority_boundary,
      forbidden_claims: surface.forbidden_claims,
      notes: surface.notes,
    },
  };
}

function buildBrandModuleSurfaceInterfaces(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const { surface, checks, status } = buildModuleSurface(contracts, moduleId);
  return {
    version: 'g2',
    brand_module_surface: moduleCommandSurfaceEnvelope(surface, 'interfaces', status),
    [`${surface.surface_kind_prefix}_interfaces`]: {
      surface_kind: `${surface.surface_kind_prefix}_interfaces`,
      ...moduleEnvelope(surface),
      status,
      cli: {
        commands: allNativeCommands(surface),
      },
      app: surface.app_read_model,
      descriptor: surface.descriptor_surface,
      validation: surface.validation,
      checks,
      authority_boundary: surface.authority_boundary,
    },
  };
}

function buildBrandModuleSurfaceValidation(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const { surface, checks, status } = buildModuleSurface(contracts, moduleId);
  return {
    version: 'g2',
    brand_module_surface: moduleCommandSurfaceEnvelope(surface, 'validate', status),
    [`${surface.surface_kind_prefix}_validation`]: {
      surface_kind: `${surface.surface_kind_prefix}_validation`,
      ...moduleEnvelope(surface),
      status,
      contract_ref: `contracts/opl-framework/brand-module-surfaces.json#modules.${surface.module_id}`,
      required_gates: contracts.brandModuleSurfaces.required_gates,
      checks,
      forbidden_claims: surface.forbidden_claims,
      authority_boundary: surface.authority_boundary,
    },
  };
}

function buildBrandModuleSurfaceDoctor(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const { surface, checks, status } = buildModuleSurface(contracts, moduleId);
  return {
    version: 'g2',
    brand_module_surface: moduleCommandSurfaceEnvelope(surface, 'doctor', status),
    [`${surface.surface_kind_prefix}_doctor`]: {
      surface_kind: `${surface.surface_kind_prefix}_doctor`,
      ...moduleEnvelope(surface),
      status: status === 'valid' ? 'pass' : 'fail',
      checks,
      fail_closed_on: surface.doctor.fail_closed_on,
      next_safe_action: status === 'valid'
        ? null
        : `Fix contracts/opl-framework/brand-module-surfaces.json#modules.${surface.module_id} or its registry cross-reference before claiming module L4.`,
      not_claims: surface.status.not_claims,
    },
  };
}

function platformModuleIds(contracts: FrameworkContracts) {
  return contracts.brandModuleSurfaces.modules.map((entry) => entry.module_id);
}

function agentModuleIds(contracts: FrameworkContracts) {
  return platformModuleIds(contracts).map((moduleId) => `agent-${moduleId}`);
}

function agentInternalAuthorityBoundary(contracts: FrameworkContracts) {
  return contracts.brandModuleSurfaces.modules[0]?.authority_boundary ?? {
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
}

function parseAgentInternalModuleInspectArgs(contracts: FrameworkContracts, args: string[]) {
  const domainIndex = args.indexOf('--domain');
  const moduleIndex = args.indexOf('--module');
  const domainId = domainIndex >= 0 ? args[domainIndex + 1] : null;
  const agentModuleId = moduleIndex >= 0 ? args[moduleIndex + 1] : null;
  const consumedIndexes = new Set([domainIndex, domainIndex + 1, moduleIndex, moduleIndex + 1]);
  const unexpectedArgs = args.filter((_, index) => !consumedIndexes.has(index));

  if (!domainId || domainId.startsWith('--') || !agentModuleId || agentModuleId.startsWith('--') || unexpectedArgs.length > 0) {
    throw new FrameworkContractError('cli_usage_error', 'agents modules inspect requires --domain <domain_id> --module <agent-module-id>.', {
      usage: 'opl agents modules inspect --domain <domain_id> --module <agent-module-id>',
      examples: ['opl agents modules inspect --domain medautoscience --module agent-runway'],
      unexpected_args: unexpectedArgs,
    });
  }

  const domain = contracts.domains.domains.find((entry) => entry.domain_id === domainId);
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', `Unknown domain: ${domainId}.`, {
      domain_id: domainId,
      allowed_domain_ids: contracts.domains.domains.map((entry) => entry.domain_id),
    });
  }

  const prefix = 'agent-';
  if (!agentModuleId.startsWith(prefix)) {
    throw new FrameworkContractError('cli_usage_error', `Unknown agent internal module: ${agentModuleId}.`, {
      agent_module_id: agentModuleId,
      allowed_agent_module_ids: agentModuleIds(contracts),
    });
  }

  const platformModuleId = agentModuleId.slice(prefix.length) as BrandModuleId;
  if (!platformModuleIds(contracts).includes(platformModuleId)) {
    throw new FrameworkContractError('cli_usage_error', `Unknown agent internal module: ${agentModuleId}.`, {
      agent_module_id: agentModuleId,
      allowed_agent_module_ids: agentModuleIds(contracts),
    });
  }

  return { domainId, agentModuleId, platformModuleId };
}

function buildAgentInternalBrandModuleList(contracts: FrameworkContracts) {
  const moduleIds = platformModuleIds(contracts);
  return {
    version: 'g2',
    agent_internal_modules: {
      surface_kind: 'opl_agent_internal_brand_module_list',
      canonical_command_surface: 'opl agents modules',
      platform_module_ids: moduleIds,
      agent_module_ids: moduleIds.map((moduleId) => `agent-${moduleId}`),
      domain_count: contracts.domains.domains.length,
      module_count_per_domain: moduleIds.length,
      required_operations: ['list', 'inspect', 'interfaces', 'validate', 'doctor'] satisfies AgentInternalModuleCommand[],
      authority_boundary: agentInternalAuthorityBoundary(contracts),
    },
  };
}

function buildAgentInternalBrandModuleInspect(contracts: FrameworkContracts, args: string[]) {
  const { domainId, agentModuleId, platformModuleId } = parseAgentInternalModuleInspectArgs(contracts, args);
  return {
    version: 'g2',
    agent_internal_module: {
      surface_kind: 'opl_agent_internal_brand_module_inspect',
      domain_id: domainId,
      agent_module_id: agentModuleId,
      platform_analogue_module_id: platformModuleId,
      canonical_command_surface: 'opl agents modules',
      module_command_surface: `opl agents modules inspect --domain ${domainId} --module ${agentModuleId}`,
      source_contract_ref: `contracts/opl-framework/brand-module-surfaces.json#modules.${platformModuleId}`,
      authority_boundary: agentInternalAuthorityBoundary(contracts),
    },
  };
}

function buildAgentInternalBrandModuleInterfaces(contracts: FrameworkContracts) {
  return {
    version: 'g2',
    agent_internal_module_interfaces: {
      surface_kind: 'opl_agent_internal_brand_module_interfaces',
      canonical_command_surface: 'opl agents modules',
      commands: [
        'opl agents modules list --json',
        'opl agents modules inspect --domain <domain_id> --module <agent-module-id> --json',
        'opl agents modules interfaces --json',
        'opl agents modules validate --json',
        'opl agents modules doctor --json',
      ],
      platform_module_ids: platformModuleIds(contracts),
      agent_module_ids: agentModuleIds(contracts),
      authority_boundary: agentInternalAuthorityBoundary(contracts),
    },
  };
}

function buildAgentInternalBrandModuleValidation(contracts: FrameworkContracts) {
  const expectedAgentModuleIds = agentModuleIds(contracts);
  return {
    version: 'g2',
    agent_internal_module_validation: {
      surface_kind: 'opl_agent_internal_brand_module_validation',
      status: 'valid',
      canonical_command_surface: 'opl agents modules',
      domain_count: contracts.domains.domains.length,
      expected_agent_module_ids: expectedAgentModuleIds,
      missing_domain_module_sets: [],
      authority_boundary: agentInternalAuthorityBoundary(contracts),
    },
  };
}

function buildAgentInternalBrandModuleDoctor(contracts: FrameworkContracts) {
  return {
    version: 'g2',
    agent_internal_module_doctor: {
      surface_kind: 'opl_agent_internal_brand_module_doctor',
      status: 'pass',
      canonical_command_surface: 'opl agents modules',
      checked_domain_count: contracts.domains.domains.length,
      checked_module_count_per_domain: platformModuleIds(contracts).length,
      missing_domain_module_sets: [],
      authority_boundary: agentInternalAuthorityBoundary(contracts),
    },
  };
}

export function listBrandModuleObjectViewCommands(moduleId: BrandModuleId) {
  return [...(BRAND_MODULE_OBJECT_VIEWS[moduleId] ?? [])];
}

export function buildBrandModuleObjectView(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
  viewId: string,
) {
  const allowedViews = listBrandModuleObjectViewCommands(moduleId);
  if (!allowedViews.includes(viewId)) {
    throw new FrameworkContractError('cli_usage_error', `Unknown ${moduleId} object view: ${viewId}.`, {
      module_id: moduleId,
      view_id: viewId,
      allowed_views: allowedViews,
    });
  }

  const { surface, registry, checks, status } = buildModuleSurface(contracts, moduleId);
  return {
    version: 'g2',
    [`${surface.surface_kind_prefix}_${viewId.replace(/-/g, '_')}`]: {
      surface_kind: `${surface.surface_kind_prefix}_${viewId.replace(/-/g, '_')}`,
      ...moduleEnvelope(surface),
      view_id: viewId,
      status,
      object_model: surface.object_model.primary_objects,
      canonical_contract_refs: surface.object_model.canonical_contract_refs,
      read_model_refs: surface.object_model.read_model_refs,
      descriptor_refs: surface.descriptor_surface.descriptor_refs,
      validation_refs: surface.validation.commands,
      registry_ref: `contracts/opl-framework/brand-module-registry.json#modules.${registry.module_id}`,
      surface_contract_ref: `contracts/opl-framework/brand-module-surfaces.json#modules.${surface.module_id}`,
      checks,
      authority_boundary: surface.authority_boundary,
      not_claims: surface.status.not_claims,
    },
  };
}

export function buildBrandModuleSurfaceCommand(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
  command: BrandModuleSurfaceCommand,
) {
  if (moduleId === 'foundry') {
    throw new FrameworkContractError('cli_usage_error', 'Foundry uses its dedicated operator control ABI.', {
      module_id: moduleId,
      requested_operation: command,
      allowed_operations: ['status', 'approve', 'reject', 'cancel', 'versions', 'rollback'],
      inspection_surface: 'opl brand-modules inspect --module foundry --json',
    });
  }
  switch (command) {
    case 'status':
      return buildBrandModuleSurfaceStatus(contracts, moduleId);
    case 'inspect':
      return buildBrandModuleSurfaceInspect(contracts, moduleId);
    case 'interfaces':
      return buildBrandModuleSurfaceInterfaces(contracts, moduleId);
    case 'validate':
      return buildBrandModuleSurfaceValidation(contracts, moduleId);
    case 'doctor':
      return buildBrandModuleSurfaceDoctor(contracts, moduleId);
  }
}
