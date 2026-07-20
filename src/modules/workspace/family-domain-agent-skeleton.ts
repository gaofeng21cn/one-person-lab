import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import {
  recordList as readRecordList,
  stringList as readStringList,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { buildDomainManifestCatalog } from '../atlas/index.ts';
import type { DomainManifestCatalog } from '../atlas/index.ts';
import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import {
  runFamilyRuntimeLifecycleApply,
  type LifecycleApplyMode,
} from '../runway/index.ts';
import {
  applyProviderClosureEvidence,
  providerClosureEvidence,
  providerResidencyGapStatus,
  readProviderContinuousProof,
  type ProviderContinuousProof,
} from '../runway/index.ts';
import { buildPhysicalSkeletonFollowThroughGate } from './family-domain-agent-skeleton-parts/legacy-cleanup-evidence.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  matchesStandardDomainAgentCatalogEntry,
  normalizeStandardDomainAgentId,
} from '../../kernel/standard-agent-registry.ts';

const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;
const ACCEPTED_SKELETON_SURFACE_KINDS = new Set(['standard_domain_agent_skeleton']);
const PRODUCTION_CLOSURE_GAPS = [
  {
    gap_id: 'external_temporal_production_residency_proof',
    closure_status: 'requires_platform_maturity',
    owner: 'opl_provider_runtime',
    waits_for: 'configured_external_temporal_service_and_managed_worker',
  },
  {
    gap_id: 'provider_hosted_domain_soak',
    closure_status: 'requires_platform_maturity',
    owner: 'opl_provider_runtime_and_domain_agents',
    waits_for: 'long_running_mas_mag_rca_provider_hosted_activity',
  },
  {
    gap_id: 'workspace_runtime_memory_apply_receipt',
    closure_status: 'requires_platform_maturity',
    owner: 'domain_agents',
    waits_for: 'domain_owned_memory_body_apply_and_writeback_receipts',
  },
  {
    gap_id: 'physical_repo_skeleton_reorganization',
    closure_status: 'requires_platform_maturity',
    owner: 'domain_repos',
    waits_for: 'direct_skill_and_opl_hosted_path_parity_plus_restore_provenance_proof',
  },
  {
    gap_id: 'legacy_surface_physical_retirement',
    closure_status: 'requires_platform_maturity',
    owner: 'opl_and_domain_repos',
    waits_for: 'no_active_default_path_depends_on_legacy_surface',
  },
] as const;

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function readPhysicalRootEvidenceRefs(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return [
    optionalString(value.anchor_ref),
    optionalString(value.evidence_ref),
    ...readStringList(value.entrypoint_refs),
    ...readStringList(value.source_refs),
    ...readStringList(value.repo_refs),
  ].filter((entry): entry is string => Boolean(entry));
}

function normalizePhysicalSkeletonEvidence(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const sourceRefs = [
    ...readStringList(value.source_refs),
    ...readStringList(value.evidence_refs),
    ...readStringList(value.layout_refs),
  ];

  if (Array.isArray(value.physical_roots)) {
    sourceRefs.push(...value.physical_roots.flatMap(readPhysicalRootEvidenceRefs));
  }

  if (Array.isArray(value.root_status)) {
    sourceRefs.push(...value.root_status.flatMap(readPhysicalRootEvidenceRefs));
  }

  if (isRecord(value.roots)) {
    sourceRefs.push(...Object.values(value.roots).flatMap(readPhysicalRootEvidenceRefs));
  }

  if (Array.isArray(value.slots)) {
    sourceRefs.push(...value.slots.flatMap((slot) => {
      if (!isRecord(slot)) {
        return [];
      }
      return [
        optionalString(slot.anchor_ref),
        ...readStringList(slot.repo_paths),
        ...readStringList(slot.source_refs),
      ].filter((entry): entry is string => Boolean(entry));
    }));
  }

  const evidenceRefs = uniqueStrings(sourceRefs);
  if (evidenceRefs.length === 0) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'physical_skeleton_evidence',
    status:
      optionalString(value.status)
      ?? optionalString(value.state)
      ?? optionalString(value.layout_state)
      ?? 'evidence_refs_observed',
    evidence_refs: evidenceRefs,
    moves_workspace_artifacts: value.moves_workspace_artifacts === true,
    moves_runtime_receipt_instances: value.moves_runtime_receipt_instances === true,
    moves_memory_body: value.moves_memory_body === true,
    forbidden_moves: [
      ...readStringList(value.forbidden_moves),
      ...(value.moves_workspace_artifacts === false ? ['workspace_runtime_artifacts'] : []),
      ...(value.moves_runtime_receipt_instances === false ? ['receipt_instances'] : []),
      ...(value.moves_memory_body === false ? ['memory_content_body'] : []),
    ],
  };
}

function findPhysicalSkeletonEvidence(skeleton: JsonRecord | null) {
  if (!skeleton) {
    return null;
  }
  return normalizePhysicalSkeletonEvidence(skeleton.physical_skeleton_follow_through)
    ?? normalizePhysicalSkeletonEvidence(skeleton.physical_skeleton_layout_audit);
}

function readRepoSourceDirs(boundary: JsonRecord, skeleton: JsonRecord) {
  const requiredDirs = readStringList(boundary.required_dirs);
  if (requiredDirs.length > 0) {
    return requiredDirs;
  }

  const magStyleDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => isRecord(boundary[dir]));
  if (magStyleDirs.length > 0) {
    return magStyleDirs;
  }

  const allowedRoots = readStringList(boundary.allowed_roots);
  if (allowedRoots.length > 0) {
    return allowedRoots;
  }

  if (Array.isArray(boundary.allowed_roots)) {
    return boundary.allowed_roots
      .map((root) => isRecord(root) ? optionalString(root.boundary_id) : optionalString(root))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (isRecord(skeleton.skeleton)) {
    const dirs = new Set<string>();
    for (const key of Object.keys(skeleton.skeleton)) {
      const [dir] = key.split('/');
      if (dir === 'agent') {
        dirs.add(dir);
      } else if (key.startsWith('contracts/')) {
        dirs.add('contracts');
        if (key.startsWith('contracts/runtime/')) {
          dirs.add('runtime');
        }
      } else if (key.startsWith('runtime/')) {
        dirs.add('runtime');
      }
    }
    if (dirs.size > 0) {
      dirs.add('docs');
      return REQUIRED_REPO_SOURCE_DIRS.filter((dir) => dirs.has(dir));
    }
  }

  return [];
}

function normalizeContractRefs(value: JsonRecord) {
  const contracts = isRecord(value.contracts) ? value.contracts : {};
  const runtimeDeclarations = isRecord(value.runtime_declarations)
    ? value.runtime_declarations
    : isRecord(value.runtime_declaration)
      ? value.runtime_declaration
      : {};
  return {
    descriptor_refs: [
      ...readStringList(contracts.descriptor_refs),
      ...readStringList(value.source_refs).map((ref) => ref),
      ...readStringList(value.artifact_locator_ref),
      ...readStringList(value.controlled_stage_attempt_ref),
    ],
    sidecar_refs: [
      ...readStringList(contracts.sidecar_refs),
      ...readStringList(runtimeDeclarations.sidecar_ref),
      ...readStringList(runtimeDeclarations.sidecar_adapter_ref),
    ],
    quality_gate_refs: readStringList(contracts.quality_gate_refs),
  };
}

function inferArtifactBoundary(value: JsonRecord, artifactBoundary: JsonRecord, repoSourceBoundary: JsonRecord) {
  const artifactLocator = isRecord(value.artifact_locator_contract)
    ? value.artifact_locator_contract
    : isRecord(value.workspace_runtime_artifact_root_locator)
      ? value.workspace_runtime_artifact_root_locator
      : {};
  const locatorRepoBoundary = isRecord(artifactLocator.repo_source_boundary)
    ? artifactLocator.repo_source_boundary
    : {};
  const artifactRootsAreLocators =
    artifactBoundary.artifact_roots_are_locators !== false
    && optionalString(artifactLocator.locator_model) !== 'repo_artifact_blobs'
    && artifactLocator.repo_tracks_real_artifacts !== true;
  const hasLocatorSurface =
    isRecord(value.artifact_locator_contract)
    || isRecord(value.workspace_runtime_artifact_root_locator)
    || readStringList(value.artifact_locator_ref).length > 0
    || readStringList(value.workspace_artifact_locator_ref).length > 0
    || readStringList(value.workspace_runtime_artifact_root_locator_ref).length > 0
    || readStringList(artifactBoundary.workspace_artifact_locator_refs).length > 0
    || readStringList(artifactBoundary.runtime_artifact_locator_refs).length > 0;
  const repoContainsRealArtifacts =
    artifactBoundary.repo_contains_real_artifacts === true
    || value.repo_tracks_real_workspace_artifacts === true
    || repoSourceBoundary.repo_tracks_runtime_artifact_blobs === true
    || repoSourceBoundary.repo_tracks_receipt_instances === true
    || artifactLocator.repo_tracks_artifact_blobs === true
    || artifactLocator.repo_tracks_real_artifacts === true
    || locatorRepoBoundary.repo_tracks_visual_or_export_artifact_blobs === true;

  return {
    repo_contains_real_artifacts: repoContainsRealArtifacts,
    artifact_roots_are_locators: artifactRootsAreLocators,
    workspace_artifact_locator_refs: [
      ...readStringList(artifactBoundary.workspace_artifact_locator_refs),
      ...readStringList(value.artifact_locator_ref),
      ...readStringList(value.workspace_artifact_locator_ref),
      ...readStringList(value.workspace_runtime_artifact_root_locator_ref),
    ],
    runtime_artifact_locator_refs: [
      ...readStringList(artifactBoundary.runtime_artifact_locator_refs),
      ...readStringList(value.runtime_artifact_locator_ref),
      ...readStringList(value.controlled_stage_attempt_ref),
    ],
    has_locator_surface: hasLocatorSurface,
  };
}

function normalizeDomainSelection(value: string) {
  return normalizeStandardDomainAgentId(value);
}

function buildDescriptorReadiness(skeletonStatus: string, skeleton: ReturnType<typeof normalizeStandardDomainAgentSkeleton>) {
  const status =
    skeletonStatus === 'aligned'
      ? 'descriptor_aligned'
      : skeletonStatus === 'blocked'
        ? 'blocked_by_manifest_status'
        : skeletonStatus === 'missing'
          ? 'descriptor_missing'
          : 'descriptor_drift_detected';
  return {
    surface_kind: 'opl_domain_agent_descriptor_readiness',
    status,
    descriptor_scope: 'manifest_declared_standard_domain_agent_skeleton',
    artifact_locator_surface_declared: skeleton?.has_artifact_locator_surface ?? false,
    repo_source_dirs_declared: skeleton?.repo_source_boundary.required_dirs ?? [],
    authority_boundary: {
      opl_role: 'descriptor_discovery_and_projection_only',
      domain_role: 'truth_quality_artifact_owner',
    },
  };
}

function buildPhysicalSkeletonLayoutAudit(args: {
  manifestBlocked: boolean;
  skeletonStatus: string;
  skeleton: ReturnType<typeof normalizeStandardDomainAgentSkeleton>;
  repoSourceDirs: string[];
  issues: string[];
}) {
  const missingDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !args.repoSourceDirs.includes(dir));
  const forbiddenDirs = args.repoSourceDirs.filter((dir) => dir === 'artifacts');
  const artifactBoundary = args.skeleton?.artifact_boundary ?? null;
  const physicalEvidence = findPhysicalSkeletonEvidence(args.skeleton);
  const status =
    args.manifestBlocked
      ? 'blocked_by_manifest_status'
      : !args.skeleton
        ? 'descriptor_missing'
        : args.skeletonStatus === 'aligned' && physicalEvidence
          ? 'repo_source_anchor_evidence_observed'
        : args.skeletonStatus === 'aligned'
          ? 'descriptor_aligned_physical_layout_pending'
          : 'descriptor_drift_blocks_physical_layout_audit';

  return {
    surface_kind: 'opl_physical_skeleton_layout_audit',
    status,
    audit_mode: 'descriptor_declared_layout_only',
    scope: 'repo_source_boundary_required_dirs_and_artifact_locator_contracts',
    required_dirs: [...REQUIRED_REPO_SOURCE_DIRS],
    declared_dirs: args.repoSourceDirs,
    missing_declared_dirs: missingDirs,
    forbidden_declared_dirs: forbiddenDirs,
    evidence_refs: physicalEvidence?.evidence_refs ?? [],
    evidence_status: physicalEvidence?.status ?? null,
    evidence_surface_kind: physicalEvidence?.surface_kind ?? null,
    evidence_forbidden_moves: physicalEvidence?.forbidden_moves ?? [],
    repository_boundary: physicalEvidence
      ? {
          moves_workspace_artifacts: physicalEvidence.moves_workspace_artifacts,
          moves_runtime_receipt_instances: physicalEvidence.moves_runtime_receipt_instances,
          moves_memory_body: physicalEvidence.moves_memory_body,
        }
      : null,
    artifact_layout_status:
      artifactBoundary === null
        ? 'not_declared'
        : artifactBoundary.repo_contains_real_artifacts || !artifactBoundary.artifact_roots_are_locators
          ? 'drift_detected'
          : 'locator_surface_declared',
    issues: args.issues,
    next_evidence_required: [
      'direct_skill_path_parity',
      'opl_hosted_path_parity',
      'restore_provenance_proof',
      'no_active_caller_proof',
      'no_forbidden_artifact_blob_proof',
    ],
    authority_boundary: {
      opl_role: 'read_only_layout_audit',
      domain_role: 'repo_layout_owner',
      artifact_authority: 'domain_owned_workspace_runtime_artifact_locator',
    },
  };
}

function buildProductionClosureGaps(args: { physicalEvidenceObserved: boolean }) {
  return PRODUCTION_CLOSURE_GAPS.map((gap) => ({
    ...gap,
    projection_status:
      gap.gap_id === 'physical_repo_skeleton_reorganization' && args.physicalEvidenceObserved
        ? 'evidence_refs_observed'
        : 'tracked_now',
    descriptor_alignment_closes_gap: false,
    evidence_ref_based_status:
      gap.gap_id === 'physical_repo_skeleton_reorganization' && args.physicalEvidenceObserved,
  }));
}

function buildPhysicalSkeletonEvidence(physicalSkeletonLayoutAudit: ReturnType<typeof buildPhysicalSkeletonLayoutAudit>) {
  if (physicalSkeletonLayoutAudit.status !== 'repo_source_anchor_evidence_observed') {
    return null;
  }
  return {
    surface_kind: 'opl_physical_skeleton_evidence_refs_projection',
    status: physicalSkeletonLayoutAudit.status,
    evidence_refs: physicalSkeletonLayoutAudit.evidence_refs,
    evidence_surface_kind: physicalSkeletonLayoutAudit.evidence_surface_kind,
    evidence_status: physicalSkeletonLayoutAudit.evidence_status,
    repository_boundary: physicalSkeletonLayoutAudit.repository_boundary,
  };
}

function normalizeStandardDomainAgentSkeleton(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const surfaceKind = optionalString(value.surface_kind);
  if (!surfaceKind || !ACCEPTED_SKELETON_SURFACE_KINDS.has(surfaceKind)) {
    throw new Error('standard_domain_agent_skeleton.surface_kind must be standard_domain_agent_skeleton.');
  }
  const repoSourceBoundary = isRecord(value.repo_source_boundary) ? value.repo_source_boundary : {};
  const artifactBoundary = isRecord(value.artifact_boundary) ? value.artifact_boundary : {};
  const normalizedArtifactBoundary = inferArtifactBoundary(value, artifactBoundary, repoSourceBoundary);
  return {
    surface_kind: 'standard_domain_agent_skeleton',
    version: optionalString(value.version) ?? 'standard-domain-agent-skeleton.v1',
    source_surface_kind: surfaceKind,
    agent_id:
      optionalString(value.agent_id)
      ?? optionalString(value.skeleton_id)
      ?? optionalString(value.adapter_id),
    repo_source_boundary: {
      required_dirs: readRepoSourceDirs(repoSourceBoundary, value),
      optional_dirs: readStringList(repoSourceBoundary.optional_dirs),
      forbidden_dirs: readStringList(repoSourceBoundary.forbidden_dirs),
    },
    contracts: normalizeContractRefs(value),
    artifact_boundary: normalizedArtifactBoundary,
    has_artifact_locator_surface: normalizedArtifactBoundary.has_locator_surface,
    authority_boundary: isRecord(value.authority_boundary)
      ? value.authority_boundary
      : {
          opl: 'framework_transport_and_projection_only',
          domain: 'truth_quality_artifact_owner',
        },
    physical_skeleton_follow_through: isRecord(value.physical_skeleton_follow_through)
      ? value.physical_skeleton_follow_through
      : null,
    physical_skeleton_layout_audit: isRecord(value.physical_skeleton_layout_audit)
      ? value.physical_skeleton_layout_audit
      : null,
  };
}

export function buildStandardDomainAgentSkeletonInspection(
  entry: DomainManifestCatalogEntry,
  providerContinuousProof: ProviderContinuousProof = readProviderContinuousProof(),
) {
  let skeleton = null;
  const issues: string[] = [];
  try {
    skeleton = normalizeStandardDomainAgentSkeleton(entry.manifest?.standard_domain_agent_skeleton ?? null);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'invalid_standard_domain_agent_skeleton');
  }
  const repoSourceDirs = skeleton?.repo_source_boundary.required_dirs ?? [];
  if (!skeleton) {
    issues.push('manifest_missing_standard_domain_agent_skeleton');
  }
  for (const dir of REQUIRED_REPO_SOURCE_DIRS) {
    if (!repoSourceDirs.includes(dir)) {
      issues.push(`missing_repo_source_dir:${dir}`);
    }
  }
  if (repoSourceDirs.includes('artifacts')) {
    issues.push('repo_source_skeleton_must_not_include_real_artifacts_dir');
  }
  if (skeleton?.artifact_boundary.repo_contains_real_artifacts) {
    issues.push('domain_repo_must_not_contain_real_artifacts');
  }
  if (skeleton && !skeleton.artifact_boundary.artifact_roots_are_locators) {
    issues.push('artifact_roots_must_be_locators');
  }
  if (skeleton && !skeleton.has_artifact_locator_surface) {
    issues.push('artifact_locator_surface_required');
  }

  const manifestBlocked = entry.status !== 'resolved';
  const skeletonStatus =
    manifestBlocked
      ? 'blocked'
      : issues.length === 0
        ? 'aligned'
        : skeleton
          ? 'drift_detected'
          : 'missing';
  const descriptorReadiness = buildDescriptorReadiness(skeletonStatus, skeleton);
  const physicalSkeletonLayoutAudit = buildPhysicalSkeletonLayoutAudit({
    manifestBlocked,
    skeletonStatus,
    skeleton,
    repoSourceDirs,
    issues,
  });
  const physicalSkeletonFollowThroughGate = buildPhysicalSkeletonFollowThroughGate(
    entry.manifest,
    physicalSkeletonLayoutAudit,
  );
  const productionClosureGaps = buildProductionClosureGaps({
    physicalEvidenceObserved: physicalSkeletonLayoutAudit.status === 'repo_source_anchor_evidence_observed',
  });
  const providerEvidence = providerClosureEvidence(providerContinuousProof);
  const evidencedProductionClosureGaps = applyProviderClosureEvidence(productionClosureGaps, providerContinuousProof);

  return {
    project_id: entry.project_id,
    project: entry.project,
    target_domain_id: entry.manifest?.target_domain_id ?? null,
    manifest_status: entry.status,
    skeleton_status: skeletonStatus,
    skeleton_source_field: skeleton ? entry.manifest?.standard_domain_agent_skeleton_source_field ?? null : null,
    skeleton_source_surface_kind: skeleton?.source_surface_kind ?? null,
    agent_id:
      skeleton?.agent_id
      ?? entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id
      ?? optionalString(entry.standard_agent_identity?.agent_id)
      ?? null,
    standard_agent_identity: entry.standard_agent_identity ?? null,
    standard_agent_contract_resolution: entry.standard_agent_contract_resolution ?? null,
    legacy_workspace_manifest_diagnostic: entry.legacy_workspace_manifest_diagnostic ?? null,
    manifest_error: entry.error,
    required_repo_source_dirs: [...REQUIRED_REPO_SOURCE_DIRS],
    declared_repo_source_dirs: repoSourceDirs,
    missing_repo_source_dirs: REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !repoSourceDirs.includes(dir)),
    descriptor_readiness: descriptorReadiness,
    physical_skeleton_layout_audit: physicalSkeletonLayoutAudit,
    physical_skeleton_evidence: buildPhysicalSkeletonEvidence(physicalSkeletonLayoutAudit),
    physical_skeleton_follow_through_gate: physicalSkeletonFollowThroughGate,
    production_closure_gaps: evidencedProductionClosureGaps,
    provider_closure_evidence: providerEvidence,
    artifact_boundary: skeleton?.artifact_boundary ?? null,
    contract_refs: skeleton?.contracts ?? null,
    issues,
    authority_boundary: skeleton?.authority_boundary ?? {
      opl: 'skeleton_discovery_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
}

export function withStandardDomainAgentSkeletonInspection<T extends DomainManifestCatalog>(catalog: T): T {
  const providerContinuousProof = readProviderContinuousProof();
  return {
    ...catalog,
    projects: catalog.projects.map((entry) => {
      if (!entry.manifest?.standard_domain_agent_skeleton) {
        return entry;
      }
      const inspection = buildStandardDomainAgentSkeletonInspection(entry, providerContinuousProof);
      const skeleton = isRecord(entry.manifest.standard_domain_agent_skeleton)
        ? entry.manifest.standard_domain_agent_skeleton
        : {};
      return {
        ...entry,
        manifest: {
          ...entry.manifest,
          standard_domain_agent_skeleton: {
            ...skeleton,
            physical_skeleton_layout_audit: inspection.physical_skeleton_layout_audit,
            physical_skeleton_evidence: inspection.physical_skeleton_evidence,
            physical_skeleton_follow_through:
              inspection.physical_skeleton_follow_through_gate
              ?? skeleton.physical_skeleton_follow_through,
            production_closure_gaps: inspection.production_closure_gaps,
            provider_closure_evidence: inspection.provider_closure_evidence,
            artifact_boundary: inspection.artifact_boundary ?? skeleton.artifact_boundary,
            contracts: inspection.contract_refs ?? skeleton.contracts,
          },
        },
      };
    }),
  };
}

type ManifestCatalogOptions = {
  manifestCommandTimeoutMs?: number;
  domainManifests?: DomainManifestCatalog;
  providerContinuousProof?: ProviderContinuousProof;
};

function findAgentEntry(contracts: FrameworkContracts, domain: string, options: ManifestCatalogOptions = {}) {
  const catalog = options.domainManifests ?? buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: options.manifestCommandTimeoutMs,
  }).domain_manifests;
  const normalized = normalizeDomainSelection(domain);
  const entry = catalog.projects.find((candidate) =>
    candidate.project_id === normalized
    || candidate.project === normalized
    || matchesStandardDomainAgentCatalogEntry(domain, candidate)
    || candidate.manifest?.target_domain_id === normalized
    || candidate.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === normalized
  );
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family domain agent: ${domain}.`, {
      domain,
      allowed_domains: catalog.projects.map((project) => project.project_id),
    });
  }
  return entry;
}

function parseInspectArgs(args: string[]) {
  let domain = '';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--domain' && value) {
      domain = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown agents inspect option: ${token}.`, {
        usage: 'opl agents inspect --domain <domain>',
      });
    }
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'agents inspect requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain };
}

function parseLegacyCleanupApplyArgs(args: string[]) {
  let domain = '';
  let mode: LifecycleApplyMode = 'dry-run';
  let sourceRef: string | undefined;
  let receiptRef: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--domain' && value) {
      domain = value;
      index += 1;
    } else if (token === '--mode' && (value === 'dry-run' || value === 'apply' || value === 'verify')) {
      mode = value;
      index += 1;
    } else if (token === '--source-ref' && value) {
      sourceRef = value;
      index += 1;
    } else if (token === '--receipt-ref' && value) {
      receiptRef = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown agents legacy-cleanup apply option: ${token}.`, {
        usage: 'opl agents legacy-cleanup apply --domain <domain> [--mode dry-run|apply|verify] [--source-ref <ref>] [--receipt-ref <ref>]',
      });
    }
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'agents legacy-cleanup apply requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain, mode, sourceRef, receiptRef };
}

export function buildFamilyAgentsList(contracts: FrameworkContracts, options: ManifestCatalogOptions = {}) {
  const catalog = options.domainManifests ?? buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: options.manifestCommandTimeoutMs,
  }).domain_manifests;
  const providerContinuousProof = options.providerContinuousProof ?? readProviderContinuousProof();
  const agents = catalog.projects.map((entry) =>
    buildStandardDomainAgentSkeletonInspection(entry, providerContinuousProof)
  );
  return {
    version: 'g2',
    family_agents: {
      surface_kind: 'opl_standard_domain_agent_skeleton_index',
      summary: {
        total_projects_count: agents.length,
        aligned_count: agents.filter((agent) => agent.skeleton_status === 'aligned').length,
        missing_count: agents.filter((agent) => agent.skeleton_status === 'missing').length,
        drift_detected_count: agents.filter((agent) => agent.skeleton_status === 'drift_detected').length,
        blocked_count: agents.filter((agent) => agent.skeleton_status === 'blocked').length,
        descriptor_aligned_count: agents.filter((agent) =>
          agent.descriptor_readiness.status === 'descriptor_aligned'
        ).length,
        physical_skeleton_audit_pending_count: agents.filter((agent) =>
          agent.physical_skeleton_layout_audit.status === 'descriptor_aligned_physical_layout_pending'
        ).length,
        physical_skeleton_evidence_observed_count: agents.filter((agent) =>
          agent.physical_skeleton_layout_audit.status === 'repo_source_anchor_evidence_observed'
        ).length,
        production_closure_gap_count: agents.reduce(
          (total, agent) => total + agent.production_closure_gaps.length,
          0,
        ),
        provider_temporal_residency_gap_status: providerResidencyGapStatus(providerContinuousProof),
      },
      agents,
    },
  };
}

export function buildFamilyAgentInspect(
  contracts: FrameworkContracts,
  args: string[],
  options: ManifestCatalogOptions = {},
) {
  const { domain } = parseInspectArgs(args);
  const entry = findAgentEntry(contracts, domain, options);
  const providerContinuousProof = options.providerContinuousProof ?? readProviderContinuousProof();
  return {
    version: 'g2',
    family_agent: {
      surface_kind: 'opl_standard_domain_agent_skeleton_inspection',
      ...buildStandardDomainAgentSkeletonInspection(entry, providerContinuousProof),
    },
  };
}

export function runFamilyAgentLegacyCleanupApply(
  contracts: FrameworkContracts,
  args: string[],
  options: ManifestCatalogOptions = {},
) {
  const parsed = parseLegacyCleanupApplyArgs(args);
  const entry = findAgentEntry(contracts, parsed.domain, options);
  const inspection = buildStandardDomainAgentSkeletonInspection(
    entry,
    options.providerContinuousProof ?? readProviderContinuousProof(),
  );
  const plan = inspection.physical_skeleton_follow_through_gate.executable_cleanup_plan;
  const domainId = inspection.project_id ?? inspection.target_domain_id ?? parsed.domain;
  const sourceRef = parsed.sourceRef
    ?? `opl://agents/${domainId}/legacy-cleanup-plan`;

  if (parsed.mode === 'verify') {
    return {
      version: 'g2',
      family_agent_legacy_cleanup_apply: {
        surface_kind: 'opl_family_agent_legacy_cleanup_apply',
        target_domain_id: domainId,
        plan_status: plan.plan_status,
        source_surface: 'physical_skeleton_follow_through_gate',
        plan,
        lifecycle_apply: runFamilyRuntimeLifecycleApply({
          mode: 'verify',
          target_domain_id: domainId,
          source_ref: sourceRef,
          receipt_ref: parsed.receiptRef,
        }),
        authority_boundary: {
          opl_can_move_or_delete_domain_repo_files: false,
          opl_can_write_cleanup_ledger_receipts: true,
          domain_repo_delete_requires_owner_receipt: true,
        },
      },
    };
  }

  const planActions = Array.isArray(plan.actions) ? plan.actions : [];
  if (plan.plan_status !== 'ready') {
    return {
      version: 'g2',
      family_agent_legacy_cleanup_apply: {
        surface_kind: 'opl_family_agent_legacy_cleanup_apply',
        target_domain_id: domainId,
        plan_status: plan.plan_status,
        source_surface: 'physical_skeleton_follow_through_gate',
        plan,
        lifecycle_apply: {
          surface_kind: 'opl_family_runtime_lifecycle_apply',
          mode: parsed.mode,
          target_domain_id: domainId,
          source_ref: sourceRef,
          status: 'blocked',
          writes_performed: false,
          actions: [],
          summary: {
            requested_action_count: planActions.length,
            safe_action_count: 0,
            blocked_action_count: planActions.length,
            blocked_reasons: Array.isArray(plan.blocked_reasons) ? plan.blocked_reasons : [],
          },
          blocker: {
            blocker_kind: 'legacy_cleanup_safety_gate',
            blocker_id: 'legacy_cleanup_plan_not_ready_for_apply',
            required_owner: 'domain_agent_or_operator',
          },
        },
        authority_boundary: {
          opl_can_move_or_delete_domain_repo_files: false,
          opl_can_write_cleanup_ledger_receipts: true,
          domain_repo_delete_requires_owner_receipt: true,
        },
      },
    };
  }
  const lifecycleApply = runFamilyRuntimeLifecycleApply({
    mode: parsed.mode,
    target_domain_id: domainId,
    source_ref: sourceRef,
    actions: planActions,
  });
  return {
    version: 'g2',
    family_agent_legacy_cleanup_apply: {
      surface_kind: 'opl_family_agent_legacy_cleanup_apply',
      target_domain_id: domainId,
      plan_status: plan.plan_status,
      source_surface: 'physical_skeleton_follow_through_gate',
      plan,
      lifecycle_apply: lifecycleApply,
      authority_boundary: {
        opl_can_move_or_delete_domain_repo_files: false,
        opl_can_write_cleanup_ledger_receipts: true,
        domain_repo_delete_requires_owner_receipt: true,
      },
    },
  };
}
