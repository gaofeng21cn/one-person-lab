import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

function record(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function buildMemoryArtifactLifecycleEvidence(drilldown: JsonRecord) {
  const summary = record(drilldown.summary);
  const lifecycleSummary = record(record(drilldown.lifecycle_ledger_refs).summary);
  const memoryRefCount = numberValue(summary.memory_ref_count);
  const memoryWritebackRefCount = numberValue(summary.memory_writeback_ref_count);
  const dispatchMemoryWritebackRefCount =
    numberValue(summary.domain_dispatch_evidence_memory_writeback_ref_count);
  const packageRefCount = numberValue(summary.package_ref_count);
  const exportRefCount = numberValue(summary.export_ref_count);
  const artifactRefCount = numberValue(summary.artifact_ref_count);
  const lifecycleIndexRefCount = numberValue(summary.lifecycle_index_ref_count);
  const restoreProofRefCount = numberValue(summary.lifecycle_restore_proof_ref_count);
  const artifactMutationReceiptRefCount =
    numberValue(summary.lifecycle_domain_artifact_mutation_receipt_ref_count);
  const reconcileMissingRefCount = numberValue(summary.lifecycle_reconcile_missing_ref_count);
  const reconcileExtraRefCount = numberValue(summary.lifecycle_reconcile_extra_ref_count);
  const reconcileStaleRefCount = numberValue(summary.lifecycle_reconcile_stale_ref_count);
  const observedRefCount = memoryRefCount
    + memoryWritebackRefCount
    + dispatchMemoryWritebackRefCount
    + packageRefCount
    + exportRefCount
    + artifactRefCount
    + lifecycleIndexRefCount
    + restoreProofRefCount
    + artifactMutationReceiptRefCount;
  const reconcileIssueCount = reconcileMissingRefCount
    + reconcileExtraRefCount
    + reconcileStaleRefCount;
  return {
    surface_kind: 'opl_app_drilldown_memory_artifact_lifecycle_evidence',
    projection_policy:
      'refs_only_counts_from_memory_artifact_package_export_domain_dispatch_and_lifecycle_surfaces_no_body_or_mutation_authority',
    status: reconcileIssueCount > 0
      ? 'lifecycle_reconcile_attention_required'
      : observedRefCount > 0
        ? 'refs_observed'
        : 'no_refs_observed',
    observed_ref_count: observedRefCount,
    memory_ref_count: memoryRefCount,
    memory_writeback_ref_count: memoryWritebackRefCount,
    domain_dispatch_memory_writeback_ref_count: dispatchMemoryWritebackRefCount,
    package_ref_count: packageRefCount,
    export_ref_count: exportRefCount,
    artifact_ref_count: artifactRefCount,
    lifecycle_index_ref_count: lifecycleIndexRefCount,
    restore_proof_ref_count: restoreProofRefCount,
    domain_artifact_mutation_receipt_ref_count: artifactMutationReceiptRefCount,
    lifecycle_reconcile_status: stringValue(lifecycleSummary.lifecycle_reconcile_status),
    lifecycle_reconcile_missing_ref_count: reconcileMissingRefCount,
    lifecycle_reconcile_extra_ref_count: reconcileExtraRefCount,
    lifecycle_reconcile_stale_ref_count: reconcileStaleRefCount,
    domain_physical_delete_requires_owner_receipt:
      summary.lifecycle_domain_physical_delete_requires_owner_receipt === true,
    domain_physical_delete_can_execute:
      summary.lifecycle_domain_physical_delete_can_execute === true,
    opl_cleanup_apply_can_execute:
      summary.lifecycle_opl_cleanup_apply_can_execute === true,
    full_detail_sections: [
      'memory_writeback_refs',
      'artifact_gallery_refs',
      'package_export_lifecycle_refs',
      'domain_dispatch_evidence',
      'lifecycle_ledger_refs',
    ],
    authority_boundary: {
      ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
      refs_only: true,
      can_accept_or_reject_memory_writeback: false,
      can_mutate_artifact_body: false,
      can_authorize_package_readiness: false,
      can_authorize_export_readiness: false,
      can_execute_domain_physical_delete: false,
    },
  };
}
