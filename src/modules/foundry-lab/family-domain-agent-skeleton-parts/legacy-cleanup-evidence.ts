import type { DomainManifestCatalogEntry } from '../../atlas/index.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import {
  recordList as readRecordList,
  stringList as readStringList,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

type PhysicalSkeletonLayoutAudit = {
  status: string;
};

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringListIsEmpty(value: unknown) {
  return Array.isArray(value) && value.length === 0;
}

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

function functionalConsumerBoundary(manifest: DomainManifestCatalogEntry['manifest']) {
  const manifestRecord = isRecord(manifest) ? manifest : null;
  return isRecord(manifestRecord?.functional_consumer_boundary)
    ? manifestRecord.functional_consumer_boundary
    : null;
}

function standardAgentPurity(boundary: JsonRecord | null) {
  return isRecord(boundary?.standard_agent_purity)
    ? boundary.standard_agent_purity
    : null;
}

function standardAgentPurityGuard(boundary: JsonRecord | null) {
  return isRecord(boundary?.standard_agent_purity_guard)
    ? boundary.standard_agent_purity_guard
    : null;
}

function generatedDefaultCallerBoundary(boundary: JsonRecord | null) {
  return isRecord(boundary?.generated_default_caller_boundary)
    ? boundary.generated_default_caller_boundary
    : null;
}

function sourceProvenance(manifest: DomainManifestCatalogEntry['manifest']) {
  return isRecord(manifest?.source_provenance) ? manifest.source_provenance : null;
}

function masStandardAgentNoActiveCallerObserved(boundary: JsonRecord | null) {
  const purity = standardAgentPurity(boundary);
  const guard = standardAgentPurityGuard(boundary);
  const generated = generatedDefaultCallerBoundary(boundary);
  if (!purity || !guard || !generated) {
    return false;
  }
  const retiredAliasResidueRefs = Array.isArray(purity.retired_alias_residue_refs)
    ? purity.retired_alias_residue_refs
    : null;
  const noDefaultCallerObserved = optionalNumber(purity.default_caller_count) === 0
    && optionalNumber(purity.active_private_generic_residue_count) === 0
    && retiredAliasResidueRefs?.length === 0
    && optionalNumber(guard.default_caller_count) === 0
    && optionalString(generated.status) === 'opl_generated_hosted_shell_is_default_caller'
    && generated.mas_handwritten_shell_default_caller_allowed === false;
  const pureStandardAgentActive = optionalString(purity.status) === 'pure_standard_agent_active'
    && optionalString(guard.status) === 'standard_agent_purity_guard';
  const cutoverPendingNoActiveCaller = optionalString(purity.status) === 'standard_agent_purity_cutover_pending'
    && optionalString(guard.status) === 'standard_agent_purity_cutover_guard'
    && optionalString(purity.default_caller_readiness_status) === 'opl_generated_default_caller_ready'
    && optionalString(purity.source_purity_cutover_status) === 'physical_wrapper_retirement_pending';
  const landedStandardAgentSourceShape = optionalString(purity.status) === 'standard_agent_source_shape_landed'
    && optionalString(guard.status) === 'standard_agent_purity_cutover_guard'
    && optionalString(purity.default_caller_readiness_status) === 'opl_generated_default_caller_ready'
    && optionalString(purity.source_purity_cutover_status) === 'standard_agent_source_shape_landed'
    && optionalNumber(purity.repo_local_wrapper_tail_count) === 0
    && stringListIsEmpty(purity.repo_local_wrapper_tail_module_ids)
    && optionalNumber(purity.runtime_package_residue_count) === 0
    && optionalString(purity.domain_projection_policy) === 'refs_receipts_blockers_only_no_body_verdict_or_blob'
    && purity.history_detail_in_default_read_model === false
    && optionalString(guard.default_caller_readiness_status) === 'opl_generated_default_caller_ready'
    && optionalString(guard.source_purity_cutover_status) === 'standard_agent_source_shape_landed'
    && optionalNumber(guard.repo_local_wrapper_tail_count) === 0
    && stringListIsEmpty(guard.repo_local_wrapper_tail_module_ids)
    && optionalNumber(guard.runtime_package_residue_count) === 0
    && stringListIsEmpty(guard.retired_alias_residue_refs);
  return noDefaultCallerObserved && (
    pureStandardAgentActive
    || cutoverPendingNoActiveCaller
    || landedStandardAgentSourceShape
  );
}

function masStandardAgentNoActiveCallerRefs(boundary: JsonRecord | null) {
  if (!masStandardAgentNoActiveCallerObserved(boundary)) {
    return [];
  }
  const guard = standardAgentPurityGuard(boundary);
  return uniqueStrings([
    '/product_entry_manifest/functional_consumer_boundary/standard_agent_purity',
    '/product_entry_manifest/functional_consumer_boundary/standard_agent_purity_guard',
    '/product_entry_manifest/functional_consumer_boundary/generated_default_caller_boundary',
    ...readStringList(boundary?.proof_surfaces),
    ...readStringList(guard?.proof_items).map((item) =>
      `/product_entry_manifest/functional_consumer_boundary/${item}`
    ),
  ]);
}

function masGeneratedDefaultReplacementParityObserved(boundary: JsonRecord | null) {
  const generated = generatedDefaultCallerBoundary(boundary);
  const readiness = isRecord(generated?.opl_default_caller_readiness_evidence)
    ? generated.opl_default_caller_readiness_evidence
    : null;
  if (!generated || !readiness) {
    return false;
  }
  return optionalString(generated.status) === 'opl_generated_hosted_shell_is_default_caller'
    && generated.all_default_surfaces_generated === true
    && generated.mas_handwritten_shell_default_caller_allowed === false
    && readiness.structural_replacement_evidence_ready === true
    && optionalString(readiness.replacement_parity) === 'ready'
    && optionalString(readiness.default_surface_cutover) === 'ready'
    && readiness.physical_delete_authorized === false;
}

function masGeneratedDefaultReplacementParityRefs(boundary: JsonRecord | null) {
  if (!masGeneratedDefaultReplacementParityObserved(boundary)) {
    return [];
  }
  const generated = generatedDefaultCallerBoundary(boundary);
  const readiness = isRecord(generated?.opl_default_caller_readiness_evidence)
    ? generated.opl_default_caller_readiness_evidence
    : null;
  return uniqueStrings([
    '/product_entry_manifest/functional_consumer_boundary/generated_default_caller_boundary',
    '/product_entry_manifest/functional_consumer_boundary/generated_surface_handoff',
    ...readStringList(generated?.proof_refs),
    ...readStringList(generated?.default_caller_surfaces).map((surface) =>
      `/product_entry_manifest/functional_consumer_boundary/generated_default_caller_boundary/default_caller_surfaces/${surface}`
    ),
    optionalString(readiness?.source_command),
    optionalString(readiness?.source_surface_kind),
  ].filter((entry): entry is string => Boolean(entry)));
}

function masHistoryTombstoneRefs(
  manifest: DomainManifestCatalogEntry['manifest'],
  boundary: JsonRecord | null,
) {
  const provenance = sourceProvenance(manifest);
  const purity = standardAgentPurity(boundary);
  const historySuppressedFromDefault =
    purity?.history_detail_in_default_read_model === false
    || isRecord(purity?.history_policy)
      && (purity.history_policy as JsonRecord).default_read_model_exposes_history_details === false;
  const refs = uniqueStrings([
    ...readSurfaceRef(provenance?.source_provenance_ref),
    ...readSurfaceRef(provenance?.historical_fixture_ref),
    ...readSurfaceRef(provenance?.explicit_archive_import_ref),
    ...readSurfaceRef(provenance?.parity_oracle_ref),
  ]);
  if (!historySuppressedFromDefault || refs.length === 0) {
    return [];
  }
  return uniqueStrings([
    '/product_entry_manifest/source_provenance',
    '/product_entry_manifest/functional_consumer_boundary/standard_agent_purity',
    ...refs,
  ]);
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
  const boundary = functionalConsumerBoundary(manifest);
  const activeDefaultCallers = tombstone ? tombstone.active_default_callers : null;
  const masNoActiveCallerObserved = masStandardAgentNoActiveCallerObserved(boundary);
  const observed =
    (Array.isArray(activeDefaultCallers) && activeDefaultCallers.length === 0)
    || optionalString(tombstone?.status) === 'no_active_default_caller_proven'
    || optionalString(residue?.status) === 'active_path_retired'
    || activePathPolicyRetired(residue?.active_path_policy)
    || physicalSkeletonLegacyEvidenceObserved(followThrough)
    || masNoActiveCallerObserved;
  const sourceRefs = uniqueStrings([
    ...readRefsFromFields(tombstone, ['source_refs', 'evidence_refs', 'no_active_caller_refs']),
    ...readRefsFromFields(residue, ['source_refs', 'evidence_refs', 'no_active_caller_refs']),
    ...readRecordList(residue?.source_refs).flatMap(readPhysicalRootEvidenceRefs),
    ...readRefsFromFields(followThrough, ['source_refs', 'evidence_refs', 'no_active_caller_refs']),
    ...readRecordList(followThrough?.legacy_active_path_residue).flatMap(readPhysicalRootEvidenceRefs),
    ...masStandardAgentNoActiveCallerRefs(boundary),
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
            : masNoActiveCallerObserved
              ? 'functional_consumer_boundary.standard_agent_purity'
              : null,
    evidence_refs: sourceRefs,
  };
}

function replacementParityEvidence(
  manifest: DomainManifestCatalogEntry['manifest'],
  physicalSkeletonLayoutAudit: PhysicalSkeletonLayoutAudit,
) {
  const followThrough = isRecord(manifest?.physical_skeleton_follow_through)
    ? manifest.physical_skeleton_follow_through
    : null;
  const tombstone = isRecord(manifest?.legacy_retirement_tombstone_proof)
    ? manifest.legacy_retirement_tombstone_proof
    : null;
  const boundary = functionalConsumerBoundary(manifest);
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
    ...masGeneratedDefaultReplacementParityRefs(boundary),
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
  const provenance = sourceProvenance(manifest);
  const evidenceRefs = uniqueStrings([
    ...readRefsFromFields(followThrough, ['provenance_refs', 'history_refs', 'tombstone_refs']),
    ...readRefsFromFields(tombstone, ['provenance_refs', 'history_refs', 'tombstone_refs', 'source_refs']),
    ...readRefsFromFields(residue, ['provenance_refs', 'history_refs', 'tombstone_refs', 'source_refs']),
    ...readRecordList(followThrough?.legacy_active_path_residue).flatMap(readPhysicalRootEvidenceRefs),
    ...readSurfaceRef(provenance?.source_provenance_ref),
    ...readSurfaceRef(provenance?.historical_fixture_ref),
    ...readSurfaceRef(provenance?.explicit_archive_import_ref),
    ...readSurfaceRef(provenance?.parity_oracle_ref),
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
  const boundary = functionalConsumerBoundary(manifest);
  const masHistoryRefs = masHistoryTombstoneRefs(manifest, boundary);
  const evidenceRefs = uniqueStrings([
    ...readRefsFromFields(tombstone, ['tombstone_refs', 'history_refs', 'source_refs']),
    ...readRefsFromFields(followThrough, ['tombstone_refs', 'history_refs']),
    ...readRecordList(followThrough?.legacy_active_path_residue)
      .filter((entry) => optionalString(entry.state)?.includes('tombstone'))
      .flatMap(readPhysicalRootEvidenceRefs),
    ...masHistoryRefs,
  ]);
  const policyObserved = physicalSkeletonLegacyEvidenceObserved(followThrough)
    || optionalString(tombstone?.status) === 'no_active_default_caller_proven'
    || masHistoryRefs.length > 0;
  return {
    status: policyObserved || evidenceRefs.length > 0 ? 'observed' : 'missing',
    policy: optionalString(followThrough?.legacy_active_path_policy)
      ?? (masHistoryRefs.length > 0 ? 'current_standard_agent_surface_keeps_history_refs_out_of_default_read_model' : null),
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

export function buildPhysicalSkeletonFollowThroughGate(
  manifest: DomainManifestCatalogEntry['manifest'],
  physicalSkeletonLayoutAudit: PhysicalSkeletonLayoutAudit,
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
