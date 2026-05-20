import { FrameworkContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import {
  runFamilyRuntimeLifecycleApply,
  type LifecycleApplyMode,
} from './family-runtime-lifecycle-index.ts';
import {
  applyProviderClosureEvidence,
  providerClosureEvidence,
  providerResidencyGapStatus,
  readProviderContinuousProof,
  type ProviderContinuousProof,
} from './family-domain-agent-provider-closure.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function truthyFalse(value: unknown) {
  return value === false;
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

function readRecordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readRefsFromFields(value: unknown, fields: string[]) {
  if (!isRecord(value)) {
    return [];
  }
  return fields.flatMap((field) => [
    optionalString(value[field]),
    ...readStringList(value[field]),
  ]).filter((entry): entry is string => Boolean(entry));
}

function readSurfaceRef(value: unknown) {
  if (typeof value === 'string') {
    return optionalString(value) ? [value] : [];
  }
  if (!isRecord(value)) {
    return [];
  }
  return [
    optionalString(value.ref),
    optionalString(value.path),
    optionalString(value.source_ref),
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

function physicalSkeletonLegacyEvidenceObserved(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  if (optionalString(value.legacy_active_path_policy) !== 'physically_removed_or_history_tombstone_only') {
    return false;
  }
  const residue = readRecordList(value.legacy_active_path_residue);
  if (residue.length === 0) {
    return false;
  }
  const allowedStates = new Set([
    'physically_removed_from_active_source',
    'tombstone_only',
    'history_tombstone_only',
  ]);
  return residue.every((entry) => {
    const state = optionalString(entry.state);
    return Boolean(state && allowedStates.has(state));
  });
}

function activePathPolicyRetired(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => entry === false || typeof entry !== 'boolean');
}

function legacyNoActiveCallerEvidence(manifest: DomainManifestCatalogEntry['manifest']) {
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const residue = isRecord(manifest?.runtime_residue_retirement)
    ? manifest.runtime_residue_retirement
    : null;
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const activeDefaultCallers = tombstone ? tombstone.active_default_callers : null;
  const observed =
    (Array.isArray(activeDefaultCallers) && activeDefaultCallers.length === 0)
    || optionalString(tombstone?.status) === 'no_active_default_caller_proven'
    || optionalString(residue?.status) === 'active_path_retired'
    || activePathPolicyRetired(residue?.active_path_policy)
    || physicalSkeletonLegacyEvidenceObserved(followThrough);
  const sourceRefs = uniqueStrings([
    ...readRefsFromFields(tombstone, ['source_refs', 'evidence_refs', 'no_active_caller_refs']),
    ...readRefsFromFields(residue, ['source_refs', 'evidence_refs', 'no_active_caller_refs']),
    ...readRecordList(residue?.source_refs).flatMap(readPhysicalRootEvidenceRefs),
    ...readRefsFromFields(followThrough, ['source_refs', 'evidence_refs', 'no_active_caller_refs']),
    ...readRecordList(followThrough?.legacy_active_path_residue).flatMap(readPhysicalRootEvidenceRefs),
  ]);
  return {
    status: observed ? 'observed' : 'missing',
    source_surface:
      tombstone
        ? 'legacy_retirement_tombstone_proof'
        : residue
          ? 'runtime_residue_retirement'
          : physicalSkeletonLegacyEvidenceObserved(followThrough)
            ? 'physical_skeleton_follow_through'
            : null,
    evidence_refs: sourceRefs,
  };
}

function replacementParityEvidence(
  manifest: DomainManifestCatalogEntry['manifest'],
  physicalSkeletonLayoutAudit: ReturnType<typeof buildPhysicalSkeletonLayoutAudit>,
) {
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const evidenceRefs = uniqueStrings([
    ...readRefsFromFields(followThrough, [
      'replacement_parity_refs',
      'direct_skill_parity_refs',
      'opl_hosted_parity_refs',
      'no_regression_evidence_refs',
      'parity_refs',
    ]),
    ...readRefsFromFields(tombstone, [
      'replacement_parity_refs',
      'direct_skill_parity_refs',
      'opl_hosted_parity_refs',
      'no_regression_evidence_refs',
      'parity_refs',
    ]),
  ]);
  const layoutAnchorsObserved = physicalSkeletonLayoutAudit.status === 'repo_source_anchor_evidence_observed';
  return {
    status: evidenceRefs.length > 0 ? 'observed' : 'missing',
    evidence_refs: evidenceRefs,
    layout_anchor_status: physicalSkeletonLayoutAudit.status,
    layout_anchors_observed: layoutAnchorsObserved,
    required_refs: [
      'direct_skill_path_parity',
      'opl_hosted_path_parity',
      'replacement_or_no_regression_evidence',
    ],
  };
}

function provenanceRetentionEvidence(manifest: DomainManifestCatalogEntry['manifest']) {
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const residue = isRecord(manifest?.runtime_residue_retirement)
    ? manifest.runtime_residue_retirement
    : null;
  const sourceProvenance = isRecord(manifest?.source_provenance)
    ? manifest.source_provenance
    : null;
  const evidenceRefs = uniqueStrings([
    ...readRefsFromFields(followThrough, ['provenance_refs', 'history_refs', 'tombstone_refs']),
    ...readRefsFromFields(tombstone, ['provenance_refs', 'history_refs', 'tombstone_refs', 'source_refs']),
    ...readRefsFromFields(residue, ['provenance_refs', 'history_refs', 'tombstone_refs', 'source_refs']),
    ...readRecordList(followThrough?.legacy_active_path_residue).flatMap(readPhysicalRootEvidenceRefs),
    ...readSurfaceRef(sourceProvenance?.source_provenance_ref),
    ...readSurfaceRef(sourceProvenance?.historical_fixture_ref),
    ...readSurfaceRef(sourceProvenance?.explicit_archive_import_ref),
    ...readSurfaceRef(sourceProvenance?.parity_oracle_ref),
  ]);
  return {
    status: evidenceRefs.length > 0 ? 'observed' : 'missing',
    evidence_refs: evidenceRefs,
    required_refs: [
      'history_or_tombstone_ref',
      'source_provenance_or_restore_ref',
      'parity_oracle_ref_when_needed',
    ],
  };
}

function historyTombstoneEvidence(manifest: DomainManifestCatalogEntry['manifest']) {
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const evidenceRefs = uniqueStrings([
    ...readRefsFromFields(tombstone, ['tombstone_refs', 'history_refs', 'source_refs']),
    ...readRefsFromFields(followThrough, ['tombstone_refs', 'history_refs']),
    ...readRecordList(followThrough?.legacy_active_path_residue)
      .filter((entry) => optionalString(entry.state)?.includes('tombstone'))
      .flatMap(readPhysicalRootEvidenceRefs),
  ]);
  const policyObserved = physicalSkeletonLegacyEvidenceObserved(followThrough)
    || optionalString(tombstone?.status) === 'no_active_default_caller_proven';
  return {
    status: policyObserved || evidenceRefs.length > 0 ? 'observed' : 'missing',
    policy: optionalString(followThrough?.legacy_active_path_policy) ?? null,
    evidence_refs: evidenceRefs,
  };
}

function retiredEntryResidueEvidence(manifest: DomainManifestCatalogEntry['manifest']) {
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const retainedEntryRefs = uniqueStrings([
    ...readRefsFromFields(followThrough, [
      'retained_entry_refs',
      'retired_entry_refs',
      'legacy_entry_refs',
    ]),
    ...readRefsFromFields(tombstone, [
      'retained_entry_refs',
      'retired_entry_refs',
      'legacy_entry_refs',
    ]),
  ]);
  return {
    status: retainedEntryRefs.length === 0 ? 'no_retained_legacy_entries' : 'blocked_retained_legacy_entries',
    retained_entry_refs: retainedEntryRefs,
    retained_entry_policy: 'delete_or_history_tombstone_only',
  };
}

function buildLegacyCleanupPlan(
  manifest: DomainManifestCatalogEntry['manifest'],
  deleteReady: boolean,
  blockedReasons: string[],
  evidence: {
    noActiveCallerRefs: string[];
    replacementParityRefs: string[];
  },
) {
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const residueEntries = readRecordList(followThrough?.legacy_active_path_residue);
  const fallbackTombstoneRefs = uniqueStrings([
    ...readRefsFromFields(tombstone, ['tombstone_refs', 'history_refs', 'source_refs']),
    ...readRefsFromFields(followThrough, ['tombstone_refs', 'history_refs', 'provenance_refs']),
  ]);
  const actions = residueEntries.map((entry, index) => {
    const evidenceRefs = readPhysicalRootEvidenceRefs(entry);
    const pathFamily = optionalString(entry.path_family)
      ?? optionalString(entry.path)
      ?? optionalString(entry.ref)
      ?? `legacy_entry_${index + 1}`;
    const state = optionalString(entry.state) ?? 'legacy_entry_declared';
    return {
      action_id: `legacy-cleanup-${index + 1}`,
      action_kind: state === 'physically_removed_from_active_source'
        ? 'record_domain_owner_handoff_receipt'
        : 'mark_opl_legacy_entry_tombstoned',
      owner_scope: state === 'physically_removed_from_active_source'
        ? 'domain_owner_handoff_receipt_ref'
        : 'opl_owned_tombstone_ref',
      target_ref: pathFamily,
      state,
      restore_proof_refs: uniqueStrings([
        ...evidenceRefs,
        ...fallbackTombstoneRefs,
      ]),
      domain_owner_handoff_receipt_refs:
        state === 'physically_removed_from_active_source'
          ? uniqueStrings([
              ...readRefsFromFields(entry, [
                'domain_owner_handoff_receipt_ref',
                'domain_owner_handoff_receipt_refs',
                'domain_owner_cleanup_receipt_ref',
                'domain_owner_cleanup_receipt_refs',
              ]),
              ...readRefsFromFields(tombstone, [
                'domain_owner_handoff_receipt_ref',
                'domain_owner_handoff_receipt_refs',
                'domain_owner_cleanup_receipt_ref',
                'domain_owner_cleanup_receipt_refs',
              ]),
            ])
          : [],
      no_active_caller_refs: uniqueStrings(evidence.noActiveCallerRefs),
      replacement_parity_refs: uniqueStrings(evidence.replacementParityRefs),
      domain_repo_delete_requires_owner_receipt: true,
      opl_writes_domain_repo_active_files: false,
      opl_writes_domain_truth: false,
      opl_writes_memory_body: false,
      opl_writes_artifact_body: false,
    };
  });

  return {
    surface_kind: 'opl_legacy_cleanup_executable_plan',
    mode: 'controlled_opl_lifecycle_apply_plan',
    plan_status: deleteReady ? 'ready' : 'blocked',
    source_surface: 'physical_skeleton_follow_through_gate',
    required_apply_surface: 'family_runtime_lifecycle_apply',
    blocked_reasons: blockedReasons,
    actions,
    owner_handoff_required_for_domain_repo_delete: true,
    authority_boundary: {
      opl_can_move_or_delete_domain_repo_files: false,
      opl_can_mark_opl_owned_legacy_refs: true,
      opl_can_write_cleanup_ledger_receipts: true,
      domain_repo_delete_requires_owner_receipt: true,
    },
  };
}

function buildPhysicalSkeletonFollowThroughGate(
  manifest: DomainManifestCatalogEntry['manifest'],
  physicalSkeletonLayoutAudit: ReturnType<typeof buildPhysicalSkeletonLayoutAudit>,
) {
  const noActiveCaller = legacyNoActiveCallerEvidence(manifest);
  const replacementParity = replacementParityEvidence(manifest, physicalSkeletonLayoutAudit);
  const provenanceRetention = provenanceRetentionEvidence(manifest);
  const historyTombstone = historyTombstoneEvidence(manifest);
  const retainedLegacyEntries = retiredEntryResidueEvidence(manifest);
  const checklist = {
    no_active_caller: noActiveCaller,
    replacement_parity: replacementParity,
    provenance_retention: provenanceRetention,
    history_or_tombstone: historyTombstone,
    retained_legacy_entries: retainedLegacyEntries,
  };
  const blockedReasons = [
    noActiveCaller.status !== 'observed' ? 'missing_no_active_caller_evidence' : null,
    replacementParity.status !== 'observed' ? 'missing_replacement_parity_evidence' : null,
    provenanceRetention.status !== 'observed' ? 'missing_provenance_retention_evidence' : null,
    historyTombstone.status !== 'observed' ? 'missing_history_or_tombstone_evidence' : null,
    retainedLegacyEntries.status !== 'no_retained_legacy_entries'
      ? 'retained_legacy_entries_declared'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  const deleteReady = blockedReasons.length === 0;
  const executableCleanupPlan = buildLegacyCleanupPlan(manifest, deleteReady, blockedReasons, {
    noActiveCallerRefs: noActiveCaller.evidence_refs,
    replacementParityRefs: replacementParity.evidence_refs,
  });
  return {
    surface_kind: 'opl_physical_skeleton_follow_through_gate',
    gate_scope: 'repo_source_physical_skeleton_and_legacy_retirement',
    status: deleteReady
      ? 'ready_for_supervised_physical_delete_or_history_tombstone'
      : 'blocked_until_follow_through_evidence_complete',
    checklist,
    evidence_refs: uniqueStrings([
      ...noActiveCaller.evidence_refs,
      ...replacementParity.evidence_refs,
      ...provenanceRetention.evidence_refs,
      ...historyTombstone.evidence_refs,
    ]),
    delete_gate: {
      delete_ready: deleteReady,
      delete_policy: 'delete_or_history_tombstone_only',
      blocked_reasons: blockedReasons,
      can_execute_delete: false,
      can_execute_domain_physical_delete: false,
      opl_cleanup_apply_can_execute: deleteReady,
      opl_cleanup_apply_surface: 'opl family-runtime lifecycle apply --mode apply',
      can_create_retained_legacy_entry: false,
    },
    executable_cleanup_plan: executableCleanupPlan,
    authority_boundary: {
      opl_role: 'controlled_lifecycle_apply_plan_owner',
      domain_role: 'repo_layout_and_legacy_surface_owner',
      can_write_cleanup_ledger_receipts: true,
      can_move_files: false,
      can_delete_files: false,
      can_keep_retained_legacy_entries: false,
    },
  };
}

export function normalizeStandardDomainAgentSkeleton(value: unknown) {
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
      ?? null,
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

export function buildFamilyAgentInspect(contracts: FrameworkContracts, args: string[]) {
  const { domain } = parseInspectArgs(args);
  const entry = findAgentEntry(contracts, domain);
  const providerContinuousProof = readProviderContinuousProof();
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
