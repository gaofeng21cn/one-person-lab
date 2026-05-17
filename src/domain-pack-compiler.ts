import { FrameworkContractError } from './contracts.ts';
import { buildFamilyAgentDescriptorList } from './family-domain-agent-descriptor.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

const GENERATED_SURFACES = [
  {
    surface_id: 'cli',
    required_descriptor_surfaces: ['family_action_catalog'],
  },
  {
    surface_id: 'mcp',
    required_descriptor_surfaces: ['family_action_catalog'],
  },
  {
    surface_id: 'product_entry_manifest',
    required_descriptor_surfaces: ['entry', 'family_action_catalog', 'family_stage_control_plane'],
  },
  {
    surface_id: 'sidecar_export_dispatch',
    required_descriptor_surfaces: ['family_action_catalog', 'functional_privatization_audit'],
  },
  {
    surface_id: 'status_read_model',
    required_descriptor_surfaces: ['entry', 'runtime_surfaces', 'domain_memory_descriptor'],
  },
  {
    surface_id: 'workbench_drilldown',
    required_descriptor_surfaces: ['family_stage_control_plane', 'domain_memory_descriptor', 'runtime_surfaces'],
  },
  {
    surface_id: 'functional_harness_cases',
    required_descriptor_surfaces: ['family_transition', 'functional_privatization_audit'],
  },
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeDomainSelection(value: string) {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-autogrant': 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
  };
  return aliases[key] ?? key;
}

function parseInspectArgs(args: string[]) {
  let domain = '';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domain' && args[index + 1]) {
      domain = args[index + 1];
      index += 1;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown pack compiler option: ${token}.`, {
      usage: 'opl agents pack-compiler inspect --domain <domain>',
    });
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'pack compiler inspect requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain };
}

function statusOf(value: unknown) {
  return isRecord(value) ? optionalString(value.status) : null;
}

function runtimeSurfaceResolvedCount(runtimeSurfaces: JsonRecord | null) {
  if (!runtimeSurfaces) {
    return 0;
  }
  return Object.values(runtimeSurfaces).filter((surface) => statusOf(surface) === 'resolved').length;
}

function descriptorSurfaceResolved(descriptor: JsonRecord, surface: string) {
  switch (surface) {
    case 'entry':
      return statusOf(descriptor.entry) === 'resolved';
    case 'family_action_catalog':
      return statusOf(descriptor.family_action_catalog) === 'resolved';
    case 'family_stage_control_plane':
      return statusOf(descriptor.family_stage_control_plane) === 'resolved';
    case 'domain_memory_descriptor':
      return statusOf(descriptor.domain_memory_descriptor) === 'resolved';
    case 'family_transition': {
      const transitionStatus = statusOf(descriptor.family_transition);
      return transitionStatus === 'matrix_evaluated' || transitionStatus === 'descriptor_only';
    }
    case 'functional_privatization_audit':
      return statusOf(descriptor.functional_privatization_audit) === 'resolved';
    case 'runtime_surfaces':
      return runtimeSurfaceResolvedCount(isRecord(descriptor.runtime_surfaces) ? descriptor.runtime_surfaces : null) > 0;
    default:
      return false;
  }
}

function functionalAuditSummary(descriptor: JsonRecord) {
  const audit = isRecord(descriptor.functional_privatization_audit)
    ? descriptor.functional_privatization_audit
    : null;
  return isRecord(audit?.summary) ? audit.summary : {};
}

function numberField(record: JsonRecord, field: string) {
  const value = record[field];
  return typeof value === 'number' ? value : 0;
}

function genericResidueBlocked(summary: JsonRecord) {
  return numberField(summary, 'opl_owned_replacement_count') > 0
    || numberField(summary, 'temporary_migration_bridge_count') > 0
    || numberField(summary, 'retire_tombstone_count') > 0
    || numberField(summary, 'active_private_generic_residue_count') > 0
    || numberField(summary, 'blocker_count') > 0;
}

function minimalAuthorityFunctionRefs(descriptor: JsonRecord) {
  const audit = isRecord(descriptor.functional_privatization_audit)
    ? descriptor.functional_privatization_audit
    : null;
  const modules = Array.isArray(audit?.modules) ? audit.modules : [];
  return modules
    .filter((module): module is JsonRecord =>
      isRecord(module) && optionalString(module.migration_class) === 'minimal_authority_function'
    )
    .map((module) => ({
      module_id: optionalString(module.module_id),
      code_paths: Array.isArray(module.code_paths) ? module.code_paths.filter((item) => typeof item === 'string') : [],
      active_callers: Array.isArray(module.active_callers)
        ? module.active_callers.filter((item) => typeof item === 'string')
        : [],
      cannot_absorb_reason: optionalString(module.cannot_absorb_reason),
    }));
}

function surfaceProjection(descriptor: JsonRecord, surface: typeof GENERATED_SURFACES[number]) {
  const missing = surface.required_descriptor_surfaces.filter((required) =>
    !descriptorSurfaceResolved(descriptor, required)
  );
  return {
    surface_id: surface.surface_id,
    owner: 'one-person-lab',
    status: missing.length === 0 ? 'ready_from_descriptor' : 'blocked_missing_descriptor_surface',
    source_descriptor_surfaces: surface.required_descriptor_surfaces,
    missing_descriptor_surfaces: missing,
    domain_repo_can_own_generated_surface: false,
  };
}

function buildPackCompilerProjection(descriptor: JsonRecord) {
  const summary = functionalAuditSummary(descriptor);
  const generatedSurfaces = GENERATED_SURFACES.map((surface) => surfaceProjection(descriptor, surface));
  const missingRequired = generatedSurfaces.flatMap((surface) => surface.missing_descriptor_surfaces);
  const blockerReasons = [
    optionalString(descriptor.manifest_status) === 'resolved' ? null : 'domain_manifest_not_resolved',
    genericResidueBlocked(summary) ? 'functional_privatization_audit_has_generic_residue_or_blocker' : null,
    ...missingRequired.map((surface) => `missing_descriptor_surface:${surface}`),
  ].filter((reason): reason is string => reason !== null);
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';

  return {
    surface_kind: 'opl_domain_pack_compiler_projection',
    compiler_version: 'opl-domain-pack-compiler.v1',
    project_id: optionalString(descriptor.project_id),
    project: optionalString(descriptor.project),
    target_domain_id: optionalString(descriptor.target_domain_id),
    agent_id: optionalString(descriptor.agent_id),
    compiler_status: status,
    blocker_reasons: [...new Set(blockerReasons)],
    pack_compiler_input_projection: {
      surface_kind: 'opl_domain_pack_compiler_input_projection',
      source_descriptor_ref: `opl agents descriptor --domain ${optionalString(descriptor.agent_id) ?? optionalString(descriptor.project_id) ?? 'unknown'}`,
      domain_pack_owner: optionalString(descriptor.target_domain_id) ?? optionalString(descriptor.project_id),
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      declarative_pack_refs: {
        stage_control_plane_status: statusOf(descriptor.family_stage_control_plane),
        action_catalog_status: statusOf(descriptor.family_action_catalog),
        domain_memory_descriptor_status: statusOf(descriptor.domain_memory_descriptor),
        transition_status: statusOf(descriptor.family_transition),
        skill_catalog_status: statusOf(descriptor.skill_catalog),
      },
      minimal_authority_function_refs: minimalAuthorityFunctionRefs(descriptor),
      functional_privatization_summary: summary,
    },
    generated_surface_handoff: {
      surface_kind: 'opl_generated_surface_handoff_projection',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      generated_surfaces: generatedSurfaces,
      generated_surface_ready_count: generatedSurfaces.filter((surface) => surface.status === 'ready_from_descriptor').length,
      generated_surface_blocked_count: generatedSurfaces.filter((surface) =>
        surface.status === 'blocked_missing_descriptor_surface'
      ).length,
    },
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      generated_surface_can_call_minimal_authority_function_with_receipt_contract: true,
      provider_completion_is_domain_ready: false,
    },
  };
}

function buildCompilerDomains(contracts: FrameworkContracts) {
  const descriptorList = buildFamilyAgentDescriptorList(contracts);
  const familyAgentDescriptors = descriptorList.family_agent_descriptors;
  return familyAgentDescriptors.descriptors.map((descriptor) =>
    buildPackCompilerProjection(descriptor as JsonRecord)
  );
}

export function buildDomainPackCompilerList(contracts: FrameworkContracts) {
  const domains = buildCompilerDomains(contracts);
  return {
    version: 'g2',
    domain_pack_compiler: {
      surface_kind: 'opl_domain_pack_compiler_index',
      owner: 'one-person-lab',
      summary: {
        total_domain_count: domains.length,
        ready_domain_count: domains.filter((domain) => domain.compiler_status === 'ready').length,
        blocked_domain_count: domains.filter((domain) => domain.compiler_status === 'blocked').length,
        generated_surface_count: domains.reduce(
          (total, domain) => total + domain.generated_surface_handoff.generated_surfaces.length,
          0,
        ),
        generated_surface_ready_count: domains.reduce(
          (total, domain) => total + domain.generated_surface_handoff.generated_surface_ready_count,
          0,
        ),
        generated_surface_blocked_count: domains.reduce(
          (total, domain) => total + domain.generated_surface_handoff.generated_surface_blocked_count,
          0,
        ),
        domain_generated_surface_owner_claim_count: domains.filter((domain) =>
          domain.generated_surface_handoff.domain_repo_can_own_generated_surface
        ).length,
      },
      domains,
      authority_boundary: {
        opl_owns_generated_surfaces: true,
        domain_repo_can_own_generated_surface: false,
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    },
  };
}

export function buildDomainPackCompilerInspect(contracts: FrameworkContracts, args: string[]) {
  const { domain } = parseInspectArgs(args);
  const normalized = normalizeDomainSelection(domain);
  const domains = buildCompilerDomains(contracts);
  const selected = domains.find((candidate) =>
    candidate.project_id === normalized
    || candidate.project === normalized
    || candidate.target_domain_id === domain
    || candidate.target_domain_id === normalized
    || candidate.agent_id === domain
    || candidate.agent_id === normalized
  );
  if (!selected) {
    throw new FrameworkContractError('cli_usage_error', `Unknown pack compiler domain: ${domain}.`, {
      domain,
      allowed_domains: domains.map((candidate) => candidate.project_id),
    });
  }
  return {
    version: 'g2',
    domain_pack_compiler: {
      ...selected,
      surface_kind: 'opl_domain_pack_compiler_inspection',
    },
  };
}
