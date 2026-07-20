import crypto from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  STANDARD_AGENT_PACK_ABI,
} from './standard-agent-pack-abi.ts';
import {
  buildGeneratedInterfaceBundle,
  GENERATED_INTERFACE_SOURCE_REFS,
  GENERATED_SURFACES,
  selectGeneratedInterfaceBundleFormat,
} from './domain-pack-compiler/generated-interface-read-model.ts';
import type { GeneratedInterfaceFormat } from './domain-pack-compiler/generated-interface-read-model.ts';
import {
  buildRepoContractDescriptor,
  descriptorWithRepoContractInputs,
  repoContractDescriptorForPackCompiler,
  repoContractFailureProjection,
} from './domain-pack-compiler/repo-contract-descriptor.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import type { StandardDomainAgentRepoInput } from '../../kernel/standard-domain-agent-family-repos.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  recordList,
  stringList,
} from '../../kernel/json-record.ts';
import { optionalString } from '../../kernel/json-file.ts';
import {
  validateStandardAgentImplementationProfileRefs,
} from './standard-agent-implementation-profile.ts';

type JsonRecord = Record<string, unknown>;

const PACK_COMPILER_MANIFEST_COMMAND_TIMEOUT_MS = 120_000;

type StandardAgentContractResolutionReadback = {
  surface_kind: 'opl_standard_agent_contract_checkout_resolution';
  status: 'resolved' | 'blocked' | 'not_applicable';
  launch_allowed: boolean;
  reason: string | null;
  source_status: string | null;
};

type ResolvedStandardAgentRepoInput = StandardDomainAgentRepoInput & {
  contract_resolution: StandardAgentContractResolutionReadback;
};

type DomainPackCompilerOptions = {
  familyDefaults?: boolean;
  agentDescriptors?: JsonRecord[];
  loadAgentDescriptors?: () => JsonRecord[];
  familyRepoInputs?: StandardDomainAgentRepoInput[];
  defaultRepoDirectories?: string[];
  resolveDomainSelection?: (value: string) => string;
  resolveStandardAgentRepo?: (value: string) => {
    requested_agent_id: string;
    repo_dir: string | null;
    contract_resolution: StandardAgentContractResolutionReadback;
  } | null;
};

function recordPathList(value: unknown) {
  return recordList(value)
    .map((entry) => optionalString(entry.path))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeDomainSelection(value: string, options: DomainPackCompilerOptions) {
  return (options.resolveDomainSelection?.(value) ?? value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function domainSelectionMatches(
  candidate: JsonRecord,
  domain: string,
  options: DomainPackCompilerOptions,
) {
  const normalizedDomain = normalizeDomainSelection(domain, options);
  const candidateValues = [
    optionalString(candidate.project_id),
    optionalString(candidate.project),
    optionalString(candidate.target_domain_id),
    optionalString(candidate.agent_id),
    optionalString(candidate.requested_agent_id),
  ].filter((value): value is string => Boolean(value));
  return candidateValues.some((value) =>
    normalizeDomainSelection(value, options) === normalizedDomain
  );
}

export function parsePackCompilerArgs(args: string[]) {
  let familyDefaults = false;
  for (const token of args) {
    if (token === '--family-defaults') {
      familyDefaults = true;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown pack compiler option: ${token}.`, {
      usage: 'opl agents pack-compiler [--family-defaults]',
    });
  }
  return { familyDefaults };
}

function parseInspectArgs(args: string[]) {
  let domain = '';
  let familyDefaults = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domain' && args[index + 1]) {
      domain = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--family-defaults') {
      familyDefaults = true;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown pack compiler option: ${token}.`, {
      usage: 'opl agents pack-compiler inspect [--family-defaults] --domain <domain>',
    });
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'pack compiler inspect requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain, familyDefaults };
}

function parseInterfaceArgs(args: string[]) {
  let domain = '';
  let repoDir = '';
  let familyDefaults = false;
  let format: GeneratedInterfaceFormat | 'all' = 'all';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domain' && args[index + 1]) {
      domain = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--repo-dir' && args[index + 1]) {
      repoDir = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--family-defaults') {
      familyDefaults = true;
      continue;
    }
    if (token === '--format' && args[index + 1]) {
      format = normalizeInterfaceFormat(args[index + 1]);
      index += 1;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown generated interface option: ${token}.`, {
      usage:
        'opl agents interfaces (--family-defaults | --domain <domain> | --repo-dir <path>) [--format <cli|mcp|skill|product-entry|openai|ai-sdk>]',
    });
  }
  const selectorCount = [domain, repoDir, familyDefaults ? 'family-defaults' : ''].filter(Boolean).length;
  if (selectorCount === 0) {
    throw new FrameworkContractError('cli_usage_error', 'generated interfaces require --family-defaults, --domain, or --repo-dir.', {
      required_one_of: ['--family-defaults', '--domain', '--repo-dir'],
    });
  }
  if (selectorCount > 1) {
    throw new FrameworkContractError('cli_usage_error', 'generated interfaces accept exactly one selector.', {
      mutually_exclusive: ['--family-defaults', '--domain', '--repo-dir'],
    });
  }
  return { domain, repoDir, familyDefaults, format };
}

function normalizeInterfaceFormat(value: string): GeneratedInterfaceFormat | 'all' {
  if (value === 'all') {
    return 'all';
  }
  if (value === 'cli' || value === 'mcp' || value === 'skill' || value === 'openai' || value === 'ai-sdk') {
    return value;
  }
  if (value === 'product-entry' || value === 'product_entry') {
    return 'product-entry';
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported generated interface format: ${value}.`, {
    format: value,
    allowed_formats: ['all', 'cli', 'mcp', 'skill', 'product-entry', 'openai', 'ai-sdk'],
  });
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

function buildStandardAgentPackAbiProjection(packCompilerInput: JsonRecord | null) {
  const declaration = isRecord(packCompilerInput?.standard_agent_pack_abi)
    ? packCompilerInput.standard_agent_pack_abi
    : null;
  const requiredRepoLayoutPaths = recordPathList(STANDARD_AGENT_PACK_ABI.required_repo_layout);
  const declaredRepoLayoutPaths = recordPathList(declaration?.required_repo_layout);
  const missingRepoLayoutPaths = requiredRepoLayoutPaths.filter((pathRef) =>
    !declaredRepoLayoutPaths.includes(pathRef)
  );
  const findings = [
    declaration ? null : 'standard_agent_pack_abi_missing',
    optionalString(declaration?.version) === STANDARD_AGENT_PACK_ABI.version
      ? null
      : 'standard_agent_pack_abi_version_invalid',
    ...missingRepoLayoutPaths.map((pathRef) => `standard_agent_pack_abi_missing_repo_layout:${pathRef}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: STANDARD_AGENT_PACK_ABI.surface_kind,
    version: STANDARD_AGENT_PACK_ABI.version,
    owner: STANDARD_AGENT_PACK_ABI.owner,
    status: findings.length === 0 ? 'passed' : 'advisory_missing',
    required_repo_layout_paths: requiredRepoLayoutPaths,
    declared_repo_layout_paths: declaredRepoLayoutPaths,
    missing_repo_layout_paths: missingRepoLayoutPaths,
    required_stage_pack_shape: STANDARD_AGENT_PACK_ABI.required_stage_pack_shape,
    l4_entry_gate: STANDARD_AGENT_PACK_ABI.l4_entry_gate,
    l5_entry_gate: STANDARD_AGENT_PACK_ABI.l5_entry_gate,
    authority_boundary: STANDARD_AGENT_PACK_ABI.authority_boundary,
    advisory_findings: findings,
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256Fingerprint(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function observedDriftManifest(descriptor: JsonRecord) {
  const direct = isRecord(descriptor.generated_artifact_drift_manifest)
    ? descriptor.generated_artifact_drift_manifest
    : null;
  const packCompilerInput = isRecord(descriptor.pack_compiler_input_contract)
    ? descriptor.pack_compiler_input_contract
    : null;
  const handoff = isRecord(descriptor.generated_surface_handoff_contract)
    ? descriptor.generated_surface_handoff_contract
    : null;
  return {
    manifest:
      direct
      ?? (isRecord(packCompilerInput?.generated_artifact_drift_manifest)
        ? packCompilerInput.generated_artifact_drift_manifest
        : null)
      ?? (isRecord(handoff?.generated_artifact_drift_manifest)
        ? handoff.generated_artifact_drift_manifest
        : null),
    refs: [
      direct ? 'family_agent_descriptor.generated_artifact_drift_manifest' : null,
      isRecord(packCompilerInput?.generated_artifact_drift_manifest)
        ? 'pack_compiler_input_contract.generated_artifact_drift_manifest'
        : null,
      isRecord(handoff?.generated_artifact_drift_manifest)
        ? 'generated_surface_handoff_contract.generated_artifact_drift_manifest'
        : null,
    ].filter((ref): ref is string => Boolean(ref)),
  };
}

function buildGeneratedArtifactSourceInputs(descriptor: JsonRecord) {
  return {
    project_id: optionalString(descriptor.project_id),
    target_domain_id: optionalString(descriptor.target_domain_id),
    agent_id: optionalString(descriptor.agent_id),
    generated_from: GENERATED_INTERFACE_SOURCE_REFS,
    source_descriptor_surfaces: {
      family_action_catalog: descriptor.family_action_catalog,
      family_stage_control_plane: descriptor.family_stage_control_plane,
      domain_memory_descriptor: descriptor.domain_memory_descriptor,
      runtime_surfaces: descriptor.runtime_surfaces,
      functional_privatization_audit: descriptor.functional_privatization_audit,
      generated_surface_handoff: descriptor.generated_surface_handoff_contract,
      pack_compiler_input: descriptor.pack_compiler_input_contract,
      product_entry_manifest_descriptor: descriptor.product_entry_manifest_descriptor,
      domain_handler_descriptor: descriptor.domain_handler_descriptor,
      session_continuity: descriptor.session_continuity_contract,
      source_contract_consumption: descriptor.source_contract_consumption,
    },
  };
}

function buildGeneratedArtifactDriftManifest(
  descriptor: JsonRecord,
  generatedInterfaceBundle: JsonRecord,
  compilerStatus: string,
  blockerReasons: string[],
) {
  const sourceInputs = buildGeneratedArtifactSourceInputs(descriptor);
  const domainPackSourceInputsFingerprint = sha256Fingerprint(sourceInputs);
  const generatedBundleFingerprint = sha256Fingerprint(generatedInterfaceBundle);
  const observed = observedDriftManifest(descriptor);
  const observedSourceFingerprint =
    optionalString(observed.manifest?.domain_pack_source_inputs_fingerprint)
    ?? optionalString(observed.manifest?.source_inputs_fingerprint);
  const observedBundleFingerprint =
    optionalString(observed.manifest?.generated_bundle_fingerprint)
    ?? optionalString(observed.manifest?.generated_artifact_bundle_fingerprint);
  const driftFindings = [
    ...blockerReasons.map((reason) => `compiler_blocker:${reason}`),
    observedSourceFingerprint && observedSourceFingerprint !== domainPackSourceInputsFingerprint
      ? 'domain_pack_source_inputs_fingerprint_changed'
      : null,
    observedBundleFingerprint && observedBundleFingerprint !== generatedBundleFingerprint
      ? 'generated_bundle_fingerprint_changed'
      : null,
  ].filter((finding): finding is string => Boolean(finding));

  return {
    surface_kind: 'opl_generated_artifact_drift_manifest',
    version: 'opl-generated-artifact-drift-manifest.v1',
    owner: 'one-person-lab',
    status: compilerStatus === 'ready' && driftFindings.length === 0 ? 'aligned' : 'drift_detected',
    target_domain_id: optionalString(descriptor.target_domain_id) ?? optionalString(descriptor.project_id),
    agent_id: optionalString(descriptor.agent_id),
    generated_surface_owner: 'one-person-lab',
    domain_pack_source_inputs_fingerprint: domainPackSourceInputsFingerprint,
    generated_bundle_fingerprint: generatedBundleFingerprint,
    fingerprint_algorithm: 'sha256:stable-json',
    generated_from: GENERATED_INTERFACE_SOURCE_REFS,
    source_input_refs: [
      'family_agent_descriptor.family_action_catalog',
      'family_agent_descriptor.family_stage_control_plane',
      'family_agent_descriptor.domain_memory_descriptor',
      'family_agent_descriptor.runtime_surfaces',
      'family_agent_descriptor.functional_privatization_audit',
      'family_agent_descriptor.generated_surface_handoff_contract',
      'family_agent_descriptor.product_entry_manifest_descriptor',
      'family_agent_descriptor.domain_handler_descriptor',
    ],
    observed_manifest_refs: observed.refs,
    observed_domain_pack_source_inputs_fingerprint: observedSourceFingerprint,
    observed_generated_bundle_fingerprint: observedBundleFingerprint,
    drift_findings: driftFindings,
    authority_boundary: {
      opl_owns_generated_surfaces: true,
      opl_owns_domain_truth: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_mutate_domain_artifacts: false,
      domain_truth_owner: optionalString(descriptor.target_domain_id) ?? optionalString(descriptor.project_id),
    },
  };
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
  const packCompilerInput = isRecord(descriptor.pack_compiler_input_contract)
    ? descriptor.pack_compiler_input_contract
    : null;
  const implementationProfileValidation = validateStandardAgentImplementationProfileRefs(
    packCompilerInput?.implementation_profile,
    optionalString(descriptor.repo_dir) ?? '',
  );
  const generatedSurfaces = GENERATED_SURFACES.map((surface) => surfaceProjection(descriptor, surface));
  const missingRequired = generatedSurfaces.flatMap((surface) => surface.missing_descriptor_surfaces);
  const blockerReasons = [
    ...stringList(descriptor.repo_contract_blockers),
    optionalString(descriptor.manifest_status) === 'resolved' ? null : 'domain_manifest_not_resolved',
    genericResidueBlocked(summary) ? 'functional_privatization_audit_has_generic_residue_or_blocker' : null,
    implementationProfileValidation.status === 'blocked'
      ? implementationProfileValidation.blockers.map((reason) => `implementation_profile:${reason}`)
      : null,
    ...missingRequired.map((surface) => `missing_descriptor_surface:${surface}`),
  ].flatMap((reason) => Array.isArray(reason) ? reason : reason === null ? [] : [reason]);
  const status = blockerReasons.length === 0 ? 'ready' : 'blocked';
  const generatedInterfaceBundle = buildGeneratedInterfaceBundle(descriptor, status);

  return {
    surface_kind: 'opl_domain_pack_compiler_projection',
    compiler_version: 'opl-domain-pack-compiler.v1',
    source_kind: optionalString(descriptor.source_kind) ?? 'admitted_domain_manifest',
    requested_agent_id: optionalString(descriptor.requested_agent_id),
    repo_dir: optionalString(descriptor.repo_dir),
    project_id: optionalString(descriptor.project_id),
    project: optionalString(descriptor.project),
    target_domain_id: optionalString(descriptor.target_domain_id),
    agent_id: optionalString(descriptor.agent_id),
    compiler_status: status,
    blocker_reasons: [...new Set(blockerReasons)],
    repo_contract_error: isRecord(descriptor.repo_contract_error)
      ? descriptor.repo_contract_error
      : null,
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
        skill_catalog_status: statusOf(descriptor.skill_catalog),
      },
      minimal_authority_function_refs: minimalAuthorityFunctionRefs(descriptor),
      implementation_profile: packCompilerInput?.implementation_profile ?? null,
      implementation_profile_status: implementationProfileValidation.status,
      implementation_profile_blockers: implementationProfileValidation.blockers,
      standard_agent_pack_abi: buildStandardAgentPackAbiProjection(packCompilerInput),
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
    generated_interface_bundle: generatedInterfaceBundle,
    generated_artifact_drift_manifest: buildGeneratedArtifactDriftManifest(
      descriptor,
      generatedInterfaceBundle as JsonRecord,
      status,
      [...new Set(blockerReasons)],
    ),
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      generated_surface_can_call_minimal_authority_function_with_receipt_contract: true,
      provider_completion_is_domain_ready: false,
    },
  };
}

function blockedRepoContractDescriptor(
  repo: StandardDomainAgentRepoInput,
  error: FrameworkContractError,
) {
  const failure = repoContractFailureProjection(repo, error);
  return {
    ...failure,
    project_id: repo.requested_agent_id,
    source_kind: 'standard_agent_repo_contracts',
    manifest_status: 'repo_contracts_blocked',
    repo_contract_blockers: failure.blocker_reasons,
  };
}

function buildCompilerDomainFromRepo(repo: StandardDomainAgentRepoInput) {
  try {
    return buildPackCompilerProjection(
      descriptorWithRepoContractInputs(
        repoContractDescriptorForPackCompiler(
          buildRepoContractDescriptor(repo.repo_dir),
          repo.requested_agent_id,
        ),
      ),
    );
  } catch (error) {
    if (!(error instanceof FrameworkContractError)) {
      throw error;
    }
    return buildPackCompilerProjection(blockedRepoContractDescriptor(repo, error));
  }
}

function resolveStandardAgentRepo(
  domain: string,
  options: DomainPackCompilerOptions,
): ResolvedStandardAgentRepoInput | null {
  const resolution = options.resolveStandardAgentRepo?.(domain) ?? null;
  if (!resolution) return null;
  if (!resolution.repo_dir) {
    throw new FrameworkContractError(
      'contract_file_missing',
      `Standard Agent managed contract checkout is unavailable: ${domain}.`,
      {
        domain,
        requested_agent_id: resolution.requested_agent_id,
        reason: resolution.contract_resolution.reason,
        source_status: resolution.contract_resolution.source_status,
        failure_code: 'standard_agent_managed_contract_checkout_unavailable',
      },
    );
  }
  return {
    requested_agent_id: resolution.requested_agent_id,
    repo_dir: resolution.repo_dir,
    contract_resolution: resolution.contract_resolution,
  };
}

function buildCompilerDomains(contracts: FrameworkContracts, options: DomainPackCompilerOptions = {}) {
  if (options.familyDefaults) {
    const repos = options.familyRepoInputs;
    if (!repos) {
      throw new FrameworkContractError('cli_usage_error', 'Pack compiler family-defaults requires Atlas-supplied repo inputs.', {
        required_input: 'familyRepoInputs',
        owner_boundary: 'Atlas discovers standard agent repos; Pack compiles generated surfaces from descriptor input.',
      });
    }
    if (repos.length === 0) {
      throw new FrameworkContractError('cli_usage_error', 'pack compiler family-defaults could not discover family agent repos.', {
        usage: 'opl agents pack-compiler --family-defaults',
        default_repo_directories: options.defaultRepoDirectories ?? [],
        env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
      });
    }
    return repos.map(buildCompilerDomainFromRepo);
  }
  const descriptors = options.agentDescriptors ?? options.loadAgentDescriptors?.();
  if (!descriptors) {
    throw new FrameworkContractError('cli_usage_error', 'Pack compiler requires Atlas descriptor input when --family-defaults is not used.', {
      required_input: 'agentDescriptors',
      owner_boundary: 'Atlas discovers domain manifests; Pack compiles generated surfaces from descriptor input.',
    });
  }
  return descriptors.map((descriptor) =>
    buildPackCompilerProjection(descriptorWithRepoContractInputs(descriptor as JsonRecord))
  );
}

export function buildDomainPackCompilerList(
  contracts: FrameworkContracts,
  options: DomainPackCompilerOptions = {},
) {
  const domains = buildCompilerDomains(contracts, options);
  return {
    version: 'g2',
    domain_pack_compiler: {
      surface_kind: 'opl_domain_pack_compiler_index',
      owner: 'one-person-lab',
      source_kind: options.familyDefaults ? 'standard_agent_repo_contracts' : 'admitted_domain_manifests',
      source_command: options.familyDefaults
        ? 'opl agents pack-compiler --family-defaults'
        : 'opl agents pack-compiler',
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
        generated_artifact_drift_aligned_count: domains.filter((domain) =>
          domain.generated_artifact_drift_manifest.status === 'aligned'
        ).length,
        generated_artifact_drift_detected_count: domains.filter((domain) =>
          domain.generated_artifact_drift_manifest.status === 'drift_detected'
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

export function buildDomainPackCompilerInspect(
  contracts: FrameworkContracts,
  args: string[],
  options: DomainPackCompilerOptions = {},
) {
  const parsed = parseInspectArgs(args);
  const domain = parsed.domain;
  const standardAgentRepo = parsed.familyDefaults
    ? null
    : resolveStandardAgentRepo(domain, options);
  const domains = standardAgentRepo
    ? [buildCompilerDomainFromRepo(standardAgentRepo)]
    : buildCompilerDomains(contracts, {
        ...options,
        familyDefaults: options.familyDefaults ?? parsed.familyDefaults,
      });
  const selected = domains.find((candidate) =>
    domainSelectionMatches(candidate as JsonRecord, domain, options)
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

export function buildRepoGeneratedInterfaceBundle(
  repoDir: string,
  format: GeneratedInterfaceFormat | 'all' = 'all',
  requestedAgentId: string | null = null,
  standardAgentContractResolution?: StandardAgentContractResolutionReadback,
) {
  const repoProjection = buildRepoContractDescriptor(repoDir);
  const descriptor = repoContractDescriptorForPackCompiler(repoProjection, requestedAgentId);
  const bundle = {
    ...buildGeneratedInterfaceBundle(descriptor, repoProjection.status, format, {
      standardAgentContractResolution,
    }),
    source_kind: 'standard_agent_repo_contracts',
    repo_dir: repoProjection.repoDir,
    blocker_reasons: repoProjection.blockerReasons,
  };
  return {
    bundle: selectGeneratedInterfaceBundleFormat(bundle as JsonRecord, format),
    status: repoProjection.status,
    blocker_reasons: repoProjection.blockerReasons,
    repo_dir: repoProjection.repoDir,
  };
}

export function buildGeneratedAgentInterfaces(
  contracts: FrameworkContracts,
  args: string[],
  options: DomainPackCompilerOptions = {},
) {
  const { domain, repoDir, familyDefaults, format } = parseInterfaceArgs(args);
  if (repoDir) {
    const generated = buildRepoGeneratedInterfaceBundle(repoDir, format);
    return {
      version: 'g2',
      generated_agent_interfaces: generated.bundle,
    };
  }

  if (familyDefaults) {
    const repos = options.familyRepoInputs;
    if (!repos) {
      throw new FrameworkContractError('cli_usage_error', 'Generated interfaces family-defaults requires Atlas-supplied repo inputs.', {
        required_input: 'familyRepoInputs',
        owner_boundary: 'Atlas discovers standard agent repos; Pack compiles generated interfaces from repo descriptors.',
      });
    }
    if (repos.length === 0) {
      throw new FrameworkContractError('cli_usage_error', 'generated interfaces could not discover family agent repos.', {
        usage: 'opl agents interfaces --family-defaults [--format <cli|mcp|skill|product-entry|openai|ai-sdk>]',
        default_repo_directories: options.defaultRepoDirectories ?? [],
        env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
      });
    }
    const reports = repos.map((repo) => {
      try {
        const generated = buildRepoGeneratedInterfaceBundle(
          repo.repo_dir,
          format,
          repo.requested_agent_id,
        );
        const selected = generated.bundle;
        return {
          requested_agent_id: repo.requested_agent_id,
          repo_dir: generated.repo_dir,
          project_id: selected.project_id,
          target_domain_id: selected.target_domain_id,
          agent_id: selected.agent_id,
          compiler_status: generated.status,
          blocker_reasons: generated.blocker_reasons,
          repo_contract_error: null,
          generated_agent_interfaces: selected,
        };
      } catch (error) {
        if (!(error instanceof FrameworkContractError)) {
          throw error;
        }
        const failure = repoContractFailureProjection(repo, error);
        return {
          ...failure,
          project_id: repo.requested_agent_id,
          target_domain_id: null,
          agent_id: null,
          compiler_status: 'blocked',
          generated_agent_interfaces: {
            surface_kind: 'opl_generated_agent_interface_bundle',
            status: 'blocked',
            selected_format: format,
            requested_agent_id: repo.requested_agent_id,
            repo_dir: repo.repo_dir,
            blocker_reasons: failure.blocker_reasons,
            repo_contract_error: failure.repo_contract_error,
            authority_boundary: {
              opl_can_write_domain_truth: false,
              opl_can_write_memory_body: false,
              opl_can_authorize_quality_or_export: false,
            },
          },
        };
      }
    });
    const blockedCount = reports.filter((report) => report.generated_agent_interfaces.status !== 'ready').length;
    return {
      version: 'g2',
      generated_agent_interfaces: {
        surface_kind: 'opl_generated_agent_interfaces_family_report',
        owner: 'one-person-lab',
        status: blockedCount === 0 ? 'ready' : 'blocked',
        selected_format: format,
        summary: {
          total_domain_count: reports.length,
          ready_domain_count: reports.length - blockedCount,
          blocked_domain_count: blockedCount,
        },
        reports,
        authority_boundary: {
          report_can_claim_domain_ready: false,
          report_can_claim_quality_verdict: false,
          report_can_claim_artifact_authority: false,
          report_can_claim_production_ready: false,
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
        },
      },
    };
  }

  const standardAgentRepo = resolveStandardAgentRepo(domain, options);
  if (standardAgentRepo) {
    const generated = buildRepoGeneratedInterfaceBundle(
      standardAgentRepo.repo_dir,
      format,
      standardAgentRepo.requested_agent_id,
      standardAgentRepo.contract_resolution,
    );
    return {
      version: 'g2',
      generated_agent_interfaces: generated.bundle,
    };
  }

  const domains = buildCompilerDomains(contracts, options);
  const selected = domains.find((candidate) =>
    domainSelectionMatches(candidate as JsonRecord, domain, options)
  );
  if (!selected) {
    throw new FrameworkContractError('cli_usage_error', `Unknown generated interface domain: ${domain}.`, {
      domain,
      allowed_domains: domains.map((candidate) => candidate.project_id),
    });
  }

  return {
    version: 'g2',
    generated_agent_interfaces: selectGeneratedInterfaceBundleFormat(
      selected.generated_interface_bundle as unknown as JsonRecord,
      format,
    ),
  };
}
