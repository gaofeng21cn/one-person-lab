import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import {
  readFamilyRuntimeLifecycleRefs,
  reconcileFamilyRuntimeLifecycleRefs,
} from './family-runtime-lifecycle-index.ts';
import {
  buildStandardDomainAgentSkeletonInspection,
} from './family-domain-agent-skeleton.ts';
import type {
  ProviderContinuousProof,
} from './family-domain-agent-provider-closure.ts';
import {
  buildDomainEvidenceRequestRefs,
} from './runtime-tray-domain-evidence-requests.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { buildAppDrilldownProductionEvidenceTailLedger } from './production-evidence-tail-ledger.ts';
import { sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';
import {
  applyAppOperatorDrilldownDetail,
  type AppOperatorDrilldownDetailLevel,
} from './runtime-tray-app-operator-drilldown-parts/detail-view.ts';
import {
  buildDomainDispatchEvidence,
} from './runtime-tray-app-operator-drilldown-parts/domain-dispatch-evidence.ts';
import {
  buildStageProductionEvidence,
} from './runtime-tray-app-operator-drilldown-parts/stage-production-evidence.ts';
import {
  buildStageProductionAttemptRoutes,
} from './runtime-tray-app-operator-drilldown-parts/stage-production-action-routes.ts';
import {
  buildExternalEvidenceActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/external-evidence-action-routes.ts';
import {
  buildLegacyCleanupActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/legacy-cleanup-action-routes.ts';
import {
  buildProviderSchedulerActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/provider-scheduler-action-routes.ts';
import {
  periodicExecutionRefs,
  providerSloRefs,
} from './runtime-tray-app-operator-drilldown-parts/provider-periodic-refs.ts';
import {
  buildAppOperatorDrilldownSummary,
} from './runtime-tray-app-operator-drilldown-parts/summary.ts';

type DrilldownRef = {
  ref: string;
  role: string;
  label?: string | null;
  domain_id?: string | null;
  stage_id?: string | null;
  stage_attempt_id?: string | null;
};

type FunctionalPrivatizationSummaryRecord = {
  total_module_count?: unknown;
  opl_owned_replacement_count?: unknown;
  opl_hosted_surface_count?: unknown;
  opl_generated_surface_count?: unknown;
  declarative_pack_count?: unknown;
  minimal_authority_function_count?: unknown;
  refs_only_domain_adapter_count?: unknown;
  temporary_migration_bridge_count?: unknown;
  diagnostic_cleanup_path_count?: unknown;
  provenance_or_fixture_count?: unknown;
  domain_authority_count?: unknown;
  retire_tombstone_count?: unknown;
  default_watchlist_count?: unknown;
  default_watchlist_module_ids?: unknown;
  active_private_generic_residue_count?: unknown;
  semantic_equivalence_review_count?: unknown;
  semantic_equivalence_review_module_ids?: unknown;
  blocker_count?: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function cleanupCommandDomainId(project: DomainManifestCatalogEntry, fallbackDomainId: string) {
  return stringValue(project.project_id)
    ?? stringValue(project.project)
    ?? fallbackDomainId;
}

function nestedRef(value: unknown) {
  return isRecord(value) && typeof value.ref === 'string' && value.ref.trim().length > 0
    ? value.ref.trim()
    : null;
}

function typedBlockerId(value: JsonRecord) {
  return stringValue(value.blocker_id)
    ?? stringValue(value.blocker_kind)
    ?? stringValue(value.reason)
    ?? JSON.stringify(value);
}

function uniqueBlockers(values: JsonRecord[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = typedBlockerId(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    if (typeof entry === 'string') {
      return [entry];
    }
    return stringList(entry);
  }));
}

function routeGraphRefs(attempts: JsonRecord[]): DrilldownRef[] {
  return attempts
    .map((attempt) => {
      const graph = record(attempt.route_decision_graph);
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      if (!stageAttemptId || Object.keys(graph).length === 0) {
        return null;
      }
      return {
        ref: `/stage_attempt_workbench/attempts/${stageAttemptId}/route_decision_graph`,
        role: 'stage_attempt_route_decision_graph',
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stageAttemptId,
        graph_scope: stringValue(graph.graph_scope),
        decision_ref_observed: booleanValue(record(graph.summary).route_decision_ref_observed),
      };
    })
    .filter((entry): entry is {
      ref: string;
      role: string;
      domain_id: string | null;
      stage_id: string | null;
      stage_attempt_id: string;
      graph_scope: string | null;
      decision_ref_observed: boolean | null;
    } => Boolean(entry));
}

function decisionMapRefs(attempts: JsonRecord[]): DrilldownRef[] {
  return attempts
    .map((attempt) => {
      const controlLoop = record(attempt.control_loop_summary);
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      if (!stageAttemptId || Object.keys(controlLoop).length === 0) {
        return null;
      }
      return {
        ref: `/stage_attempt_workbench/attempts/${stageAttemptId}/control_loop_summary/decision`,
        role: 'stage_attempt_decision_map',
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stageAttemptId,
        next_owner: stringValue(record(controlLoop.action_route).next_owner),
      };
    })
    .filter((entry): entry is {
      ref: string;
      role: string;
      domain_id: string | null;
      stage_id: string | null;
      stage_attempt_id: string;
      next_owner: string | null;
    } => Boolean(entry));
}

function reviewRepairItems(workbench: JsonRecord) {
  return recordList(record(workbench.review_repair_queue).items)
    .map((item) => ({
      item_id: stringValue(item.item_id),
      item_kind: stringValue(item.item_kind),
      stage_attempt_id: stringValue(item.stage_attempt_id),
      domain_id: stringValue(item.domain_id),
      stage_id: stringValue(item.stage_id),
      next_owner: stringValue(item.next_owner),
      repair_target: stringValue(item.repair_target),
      human_gate_refs: stringList(item.human_gate_refs),
    }))
    .filter((item) => item.item_id || item.repair_target);
}

function artifactGalleryRefs(workbench: JsonRecord) {
  return uniqueRefs(recordList(record(workbench.artifact_gallery).items)
    .map((item) => ({
      ref: stringValue(item.ref),
      role: stringValue(item.item_kind) ?? 'artifact_or_receipt_ref',
      stage_attempt_id: stringValue(item.stage_attempt_id),
      domain_id: stringValue(item.domain_id),
      stage_id: stringValue(item.stage_id),
      content_policy: stringValue(item.content_policy),
      handoff_target: stringValue(item.handoff_target),
    }))
    .filter((item): item is {
      ref: string;
      role: string;
      stage_attempt_id: string | null;
      domain_id: string | null;
      stage_id: string | null;
      content_policy: string | null;
      handoff_target: string | null;
    } => Boolean(item.ref)));
}

function packageExportLifecycle(workbench: JsonRecord) {
  const lifecycle = record(workbench.package_export_lifecycle);
  return {
    surface_kind: 'opl_app_drilldown_package_export_lifecycle_refs',
    projection_policy: 'package_export_refs_only_no_readiness_or_export_authority',
    package_refs: uniqueStrings(stringList(lifecycle.package_refs)),
    export_refs: uniqueStrings(stringList(lifecycle.export_refs)),
    gap_report_refs: uniqueStrings(stringList(lifecycle.gap_report_refs)),
    handoff_refs: uniqueStrings(stringList(lifecycle.handoff_refs)),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function memoryWritebackRefs(workbench: JsonRecord) {
  const memory = record(workbench.memory_locator_index);
  return {
    surface_kind: 'opl_app_drilldown_memory_writeback_refs',
    projection_policy: 'memory_refs_and_writeback_receipts_only_no_memory_body',
    consumed_memory_refs: uniqueStrings(stringList(memory.consumed_memory_refs)),
    writeback_receipt_refs: uniqueStrings(stringList(memory.writeback_receipt_refs)),
    rejected_write_count: recordList(memory.rejected_writes).length,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function qualityReadinessRefs(workbench: JsonRecord) {
  const quality = record(workbench.quality_readiness);
  return {
    surface_kind: 'opl_app_drilldown_quality_readiness_refs',
    projection_policy: 'refs_only_no_quality_or_readiness_authority',
    quality_refs: uniqueStrings(stringList(quality.quality_refs)),
    readiness_refs: uniqueStrings(stringList(quality.readiness_refs)),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function operatorActionRoutingRefs(workbench: JsonRecord) {
  return uniqueRefs(recordList(record(workbench.action_routing).actions)
    .map((action) => ({
      ref: stringValue(action.command_or_surface_ref),
      role: 'operator_action_route',
      action_id: stringValue(action.action_id),
      action_kind: stringValue(action.action_kind),
      owner: stringValue(action.action_owner),
      route_target_kind: stringValue(action.route_target_kind),
      execution_policy: stringValue(action.execution_policy),
      execution_surface: stringValue(action.execution_surface),
      stage_attempt_id: stringValue(action.stage_attempt_id),
      domain_id: stringValue(action.domain_id),
      stage_id: stringValue(action.stage_id),
      can_execute: false,
    }))
    .filter((entry): entry is {
      ref: string;
      role: string;
      action_id: string | null;
      action_kind: string | null;
      owner: string | null;
      route_target_kind: string | null;
      execution_policy: string | null;
      execution_surface: string | null;
      stage_attempt_id: string | null;
      domain_id: string | null;
      stage_id: string | null;
      can_execute: false;
    } => Boolean(entry.ref)));
}

function domainProjectionRefs(domainProjectionIngestion: JsonRecord) {
  return uniqueRefs(recordList(domainProjectionIngestion.items).flatMap((item) =>
    stringList(item.source_refs).map((ref) => ({
      ref,
      role: 'domain_projection_ref',
      domain_id: stringValue(item.domain_id),
      source_surface: stringValue(item.source_surface),
      pointer: stringValue(item.pointer),
      projection_surface_kind: stringValue(item.projection_surface_kind),
      body_policy: stringValue(item.body_policy),
    }))
  ));
}

function transitionBridgeEvidence(attempt: JsonRecord) {
  return record(attempt.transition_bridge_evidence);
}

function controlledApplyContract(attempt: JsonRecord) {
  return record(attempt.controlled_apply_contract);
}

function lifecycleGuardedApply(attempt: JsonRecord) {
  return record(record(attempt.lifecycle_primitives).guarded_apply_proof);
}

function ownerReceiptRefs(attempts: JsonRecord[], domainProjectionIngestion: JsonRecord) {
  return uniqueRefs([
    ...attempts.flatMap((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      const controlled = controlledApplyContract(attempt);
      const transitionEvidence = record(transitionBridgeEvidence(attempt).evidence);
      const routeImpact = record(attempt.route_impact);
      return [
        ...stringList(controlled.owner_receipt_refs).map((ref) => ({
          ref,
          role: 'controlled_apply_owner_receipt',
          domain_id: stringValue(attempt.domain_id),
          stage_id: stringValue(attempt.stage_id),
          stage_attempt_id: stageAttemptId,
        })),
        ...stringList(transitionEvidence.owner_receipt_refs).map((ref) => ({
          ref,
          role: 'transition_owner_receipt',
          domain_id: stringValue(attempt.domain_id),
          stage_id: stringValue(attempt.stage_id),
          stage_attempt_id: stageAttemptId,
        })),
        ...refsFromRecord(routeImpact, [
          'owner_receipt_ref',
          'owner_receipt_refs',
          'domain_owner_receipt_ref',
          'domain_owner_receipt_refs',
        ]).map((ref) => ({
          ref,
          role: 'route_impact_owner_receipt',
          domain_id: stringValue(attempt.domain_id),
          stage_id: stringValue(attempt.stage_id),
          stage_attempt_id: stageAttemptId,
        })),
      ];
    }),
    ...recordList(domainProjectionIngestion.items).flatMap((item) =>
      stringList(item.owner_receipt_refs).map((ref) => ({
        ref,
        role: 'domain_projection_owner_receipt',
        domain_id: stringValue(item.domain_id),
        source_surface: stringValue(item.source_surface),
      }))
    ),
  ]);
}

function typedBlockerRefs(attempts: JsonRecord[], domainProjectionIngestion: JsonRecord) {
  const refs = uniqueRefs([
    ...attempts.flatMap((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      const transitionEvidence = record(transitionBridgeEvidence(attempt).evidence);
      const routeImpact = record(attempt.route_impact);
      return [
        ...stringList(transitionEvidence.typed_blocker_refs).map((ref) => ({
          ref,
          role: 'transition_typed_blocker',
          domain_id: stringValue(attempt.domain_id),
          stage_id: stringValue(attempt.stage_id),
          stage_attempt_id: stageAttemptId,
        })),
        ...refsFromRecord(routeImpact, ['typed_blocker_ref', 'typed_blocker_refs']).map((ref) => ({
          ref,
          role: 'route_impact_typed_blocker',
          domain_id: stringValue(attempt.domain_id),
          stage_id: stringValue(attempt.stage_id),
          stage_attempt_id: stageAttemptId,
        })),
      ];
    }),
    ...recordList(domainProjectionIngestion.items).flatMap((item) =>
      stringList(item.typed_blocker_refs).map((ref) => ({
        ref,
        role: 'domain_projection_typed_blocker',
        domain_id: stringValue(item.domain_id),
        source_surface: stringValue(item.source_surface),
      }))
    ),
  ]);
  const blockers = uniqueBlockers([
    ...attempts.flatMap((attempt) => [
      ...recordList(record(transitionBridgeEvidence(attempt).evidence).typed_blockers),
      ...recordList(record(attempt.route_impact).typed_blockers),
      ...recordList(controlledApplyContract(attempt).typed_blockers),
      ...recordList(lifecycleGuardedApply(attempt).actions)
        .map((action) => record(action.blocker))
        .filter((blocker) => Object.keys(blocker).length > 0),
    ]),
    ...recordList(domainProjectionIngestion.items).flatMap((item) => recordList(item.typed_blockers)),
  ]);
  return { refs, blockers };
}

function freshnessRefs(attempts: JsonRecord[], domainProjectionIngestion: JsonRecord) {
  return uniqueRefs([
    ...attempts
      .map((attempt) => ({
        ref: `/stage_attempt_workbench/attempts/${stringValue(attempt.stage_attempt_id)}/freshness`,
        role: 'stage_attempt_freshness',
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stringValue(attempt.stage_attempt_id),
        source_fingerprint: stringValue(attempt.source_fingerprint),
        updated_at: stringValue(attempt.updated_at),
      }))
      .filter((entry): entry is {
        ref: string;
        role: string;
        domain_id: string | null;
        stage_id: string | null;
        stage_attempt_id: string | null;
        source_fingerprint: string | null;
        updated_at: string | null;
      } => Boolean(entry.stage_attempt_id) && (Boolean(entry.source_fingerprint) || Boolean(entry.updated_at))),
    ...recordList(domainProjectionIngestion.items).flatMap((item) => {
      const freshness = record(item.freshness);
      const sourceRefValue = stringValue(freshness.source_ref) ?? stringValue(freshness.ref);
      const status = stringValue(freshness.status);
      if (!sourceRefValue && !status) {
        return [];
      }
      return [{
        ref: sourceRefValue ?? `${stringValue(item.pointer) ?? 'domain_projection'}#freshness`,
        role: 'domain_projection_freshness',
        domain_id: stringValue(item.domain_id),
        source_surface: stringValue(item.source_surface),
        status,
      }];
    }),
  ]);
}

function refFamilyRefs(workbench: JsonRecord) {
  const workspace = record(workbench.workspace_source_intake);
  const artifacts = record(workbench.artifact_gallery);
  const memory = record(workbench.memory_locator_index);
  const sourceRefs = uniqueRefs([
    ...stringList(workspace.source_refs).map((ref) => ({ ref, role: 'source_ref' })),
    ...stringList(workspace.material_refs).map((ref) => ({ ref, role: 'material_ref' })),
    ...stringList(workspace.missing_material_attention_refs).map((ref) => ({
      ref,
      role: 'missing_material_ref',
    })),
  ]);
  const artifactRefs = uniqueRefs(recordList(artifacts.items)
    .map((item) => ({
      ref: stringValue(item.ref),
      role: stringValue(item.item_kind) ?? 'artifact_or_receipt_ref',
      domain_id: stringValue(item.domain_id),
      stage_id: stringValue(item.stage_id),
      stage_attempt_id: stringValue(item.stage_attempt_id),
    }))
    .filter((entry): entry is {
      ref: string;
      role: string;
      domain_id: string | null;
      stage_id: string | null;
      stage_attempt_id: string | null;
    } => Boolean(entry.ref)));
  const memoryRefs = uniqueRefs([
    ...stringList(memory.consumed_memory_refs).map((ref) => ({ ref, role: 'consumed_memory_ref' })),
    ...stringList(memory.writeback_receipt_refs).map((ref) => ({
      ref,
      role: 'memory_writeback_receipt_ref',
    })),
  ]);
  return {
    surface_kind: 'opl_app_drilldown_ref_family_refs',
    source_refs: {
      refs: sourceRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    artifact_refs: {
      refs: artifactRefs,
      content_policy: 'locator_only_no_artifact_content',
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    memory_refs: {
      refs: memoryRefs,
      projection_policy: 'memory_refs_only_no_memory_body',
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    summary: {
      source_ref_count: sourceRefs.length,
      artifact_ref_count: artifactRefs.length,
      memory_ref_count: memoryRefs.length,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function lifecycleLedgerRefs() {
  const index = readFamilyRuntimeLifecycleRefs();
  const reconcile = reconcileFamilyRuntimeLifecycleRefs();
  const refs = recordList(index.refs);
  const restoreProofRefs = uniqueStrings(refs.flatMap((entry) =>
    stringList(record(entry.payload).restore_proof_refs)
  )).sort();
  const domainArtifactMutationReceiptRefs = uniqueStrings(refs.flatMap((entry) =>
    stringList(record(entry.payload).domain_artifact_mutation_receipt_refs)
  )).sort();
  return {
    surface_kind: 'opl_app_drilldown_lifecycle_ledger_refs',
    projection_policy: 'opl_owned_lifecycle_index_refs_only',
    lifecycle_index_db: stringValue(index.lifecycle_index_db),
    refs: refs.map((entry) => ({
      ref: stringValue(entry.ref_id),
      role: stringValue(entry.surface_role) ?? 'lifecycle_index_ref',
      domain_id: stringValue(entry.domain_id),
      surface_id: stringValue(entry.surface_id),
      source_ref: stringValue(entry.source_ref),
      receipt_ref: stringValue(entry.receipt_ref),
      checksum: stringValue(entry.checksum),
      updated_at: stringValue(entry.updated_at),
    })).filter((entry) => entry.ref),
    restore_proof_refs: restoreProofRefs,
    domain_artifact_mutation_receipt_refs: domainArtifactMutationReceiptRefs,
    summary: {
      lifecycle_index_ref_count: refs.length,
      restore_proof_ref_count: restoreProofRefs.length,
      domain_artifact_mutation_receipt_ref_count: domainArtifactMutationReceiptRefs.length,
      lifecycle_reconcile_status: stringValue(reconcile.status),
      lifecycle_reconcile_missing_ref_count: numberValue(record(reconcile.summary).missing_ref_count),
      lifecycle_reconcile_extra_ref_count: numberValue(record(reconcile.summary).extra_ref_count),
      lifecycle_reconcile_stale_ref_count: numberValue(record(reconcile.summary).stale_ref_count),
      lifecycle_delete_ready_proof_status: stringValue(record(reconcile.delete_ready_proof).proof_status),
      lifecycle_delete_can_execute: record(reconcile.summary).can_execute_domain_physical_delete === true,
      lifecycle_opl_cleanup_apply_can_execute: record(reconcile.summary).opl_cleanup_apply_can_execute === true,
    },
    reconcile_projection: reconcile,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function safeActionRefs(actionRefs: ReturnType<typeof operatorActionRoutingRefs>, lifecycleRefs: ReturnType<typeof lifecycleLedgerRefs>) {
  return uniqueRefs([
    ...actionRefs.map((ref) => ({
      ...ref,
      role: `route:${ref.role}`,
      can_execute: false,
    })),
    ...lifecycleRefs.refs
      .filter((ref) => ref.receipt_ref)
      .map((ref) => ({
        ref: ref.receipt_ref as string,
        role: 'lifecycle_cleanup_receipt_ref',
        domain_id: ref.domain_id,
        source_ref: ref.source_ref,
        can_execute: false,
    })),
  ]);
}

function appExecutionBridge(
  actionRefs: ReturnType<typeof operatorActionRoutingRefs>,
  periodicRefs: ReturnType<typeof periodicExecutionRefs>,
  lifecycleRefs: ReturnType<typeof lifecycleLedgerRefs>,
) {
  const safeActionRoutes = actionRefs.filter((ref) => ref.execution_policy === 'opl_safe_action_shell');
  const supervisedPeriodicCommands = periodicRefs.refs.filter((ref) => (
    ref.execution_policy === 'operator_or_infrastructure_supervised'
    || ref.execution_policy === 'provider_backed_no_domain_daemon'
  ));
  return {
    surface_kind: 'opl_app_operator_execution_bridge',
    bridge_owner: 'one-person-lab',
    consumer: 'one_person_lab_app_operator_workbench',
    action_execution_surface: 'opl runtime action execute',
    lifecycle_apply_surface: 'opl runtime lifecycle apply',
    lifecycle_reconcile_surface: 'opl runtime lifecycle reconcile',
    provider_scheduler_surface: 'opl family-runtime scheduler',
    route_submission_policy: {
      direct_domain_action_execution_allowed: false,
      domain_routes_are_queued_for_approval: true,
      provider_signal_routes_emit_provider_receipts: true,
      opl_cli_routes_can_execute_framework_queries: true,
      opl_cli_routes_can_create_stage_attempt_requests: true,
      app_surface_routes_are_projection_only: true,
    },
    safe_action_routes: safeActionRoutes.map((ref) => ({
      action_id: ref.action_id,
      action_kind: ref.action_kind,
      owner: ref.owner,
      route_target_kind: ref.route_target_kind,
      action_ref: ref.ref,
      opl_cli_args: 'opl_cli_args' in ref ? ref.opl_cli_args : null,
      stage_attempt_id: ref.stage_attempt_id,
      domain_id: ref.domain_id,
      target_domain_id: 'target_domain_id' in ref ? ref.target_domain_id : null,
      project_id: 'project_id' in ref ? ref.project_id : null,
      stage_id: ref.stage_id,
      missing_production_evidence:
        'missing_production_evidence' in ref ? ref.missing_production_evidence : [],
      expected_receipt_refs:
        'expected_receipt_refs' in ref ? ref.expected_receipt_refs : [],
      execution_surface: ref.execution_surface,
      submit_via: 'opl runtime action execute',
      dry_run_supported: true,
      approve_domain_action_supported: ref.owner === 'domain',
      can_submit_to_safe_action_shell: true,
      can_execute_domain_action_directly: false,
    })),
    supervised_command_refs: supervisedPeriodicCommands.map((ref) => ({
      ref: ref.ref,
      role: ref.role,
      provider_kind: ref.provider_kind,
      schedule_id: ref.schedule_id,
      execution_policy: ref.execution_policy,
      expected_surface_kind: 'expected_surface_kind' in ref ? ref.expected_surface_kind : null,
      supervision_required: true,
    })),
    lifecycle_bridge: {
      index_ref_count: lifecycleRefs.summary.lifecycle_index_ref_count,
      restore_proof_ref_count: lifecycleRefs.summary.restore_proof_ref_count,
      domain_artifact_mutation_receipt_ref_count:
        lifecycleRefs.summary.domain_artifact_mutation_receipt_ref_count,
      cleanup_apply_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      domain_delete_ready: lifecycleRefs.summary.lifecycle_delete_can_execute,
      domain_delete_executed_by_opl: false,
      reconcile_status: lifecycleRefs.summary.lifecycle_reconcile_status,
    },
    summary: {
      safe_action_route_count: safeActionRoutes.length,
      supervised_periodic_command_count: supervisedPeriodicCommands.length,
      lifecycle_index_ref_count: lifecycleRefs.summary.lifecycle_index_ref_count,
      cleanup_apply_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      domain_delete_ready: lifecycleRefs.summary.lifecycle_delete_can_execute,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function functionalPrivatizationSummary(projects: DomainManifestCatalogEntry[]) {
  const summaries: FunctionalPrivatizationSummaryRecord[] = projects.flatMap((project) => {
    if (project.status !== 'resolved' || !project.manifest) {
      return [];
    }
    return [record(project.manifest.functional_privatization_audit.summary)];
  });
  const sum = (field: keyof FunctionalPrivatizationSummaryRecord) =>
    summaries.reduce((count, summary) => count + numberValue(summary[field]), 0);
  return {
    surface_kind: 'opl_app_drilldown_functional_privatization_audit_summary',
    projection_policy: 'summary_only_no_domain_code_mutation',
    resolved_domain_count: summaries.length,
    total_module_count: sum('total_module_count'),
    by_migration_class: {
      opl_owned_replacement_count: sum('opl_owned_replacement_count'),
      opl_hosted_surface_count: sum('opl_hosted_surface_count'),
      opl_generated_surface_count: sum('opl_generated_surface_count'),
      declarative_pack_count: sum('declarative_pack_count'),
      minimal_authority_function_count: sum('minimal_authority_function_count'),
      refs_only_domain_adapter_count: sum('refs_only_domain_adapter_count'),
      temporary_migration_bridge_count: sum('temporary_migration_bridge_count'),
      diagnostic_cleanup_path_count: sum('diagnostic_cleanup_path_count'),
      provenance_or_fixture_count: sum('provenance_or_fixture_count'),
      domain_authority_count: sum('domain_authority_count'),
      retire_tombstone_count: sum('retire_tombstone_count'),
    },
    default_watchlist_count: sum('default_watchlist_count'),
    default_watchlist_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.default_watchlist_module_ids)
    )),
    active_private_generic_residue_count: sum('active_private_generic_residue_count'),
    semantic_equivalence_review_count: sum('semantic_equivalence_review_count'),
    semantic_equivalence_review_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.semantic_equivalence_review_module_ids)
    )),
    blocker_count: sum('blocker_count'),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function legacyCleanupPlanRefs(
  projects: DomainManifestCatalogEntry[],
  providerContinuousProof: JsonRecord,
) {
  const resolvedProjects = projects.filter((project) => (
    project.status === 'resolved' && project.manifest
  ));
  const plans = resolvedProjects.flatMap((project) => {
    const inspection = buildStandardDomainAgentSkeletonInspection(
      project,
      providerContinuousProof as unknown as ProviderContinuousProof,
    );
    const gate = record(inspection.physical_skeleton_follow_through_gate);
    const deleteGate = record(gate.delete_gate);
    const plan = record(gate.executable_cleanup_plan);
    const actions = recordList(plan.actions);
    if (Object.keys(gate).length === 0 && Object.keys(plan).length === 0) {
      return [];
    }
    const domainId =
      stringValue(inspection.target_domain_id)
      ?? stringValue(inspection.project_id)
      ?? project.project_id;
    const agentId = stringValue(inspection.agent_id) ?? domainId;
    const commandDomainId = cleanupCommandDomainId(project, domainId);
    const sourceRefValue = `opl://agents/${domainId}/legacy-cleanup-plan`;
    return [{
      ref: sourceRefValue,
      role: 'domain_legacy_cleanup_plan',
      domain_id: domainId,
      agent_id: agentId,
      command_domain_id: commandDomainId,
      skeleton_status: stringValue(inspection.skeleton_status),
      gate_status: stringValue(gate.status),
      plan_status: stringValue(plan.plan_status),
      delete_ready: deleteGate.delete_ready === true,
      opl_cleanup_apply_can_execute: deleteGate.opl_cleanup_apply_can_execute === true,
      domain_delete_can_execute: deleteGate.can_execute_domain_physical_delete === true,
      blocked_reasons: stringList(deleteGate.blocked_reasons).length > 0
        ? stringList(deleteGate.blocked_reasons)
        : stringList(plan.blocked_reasons),
      action_count: actions.length,
      action_refs: actions.map((action, index) => ({
        ref: stringValue(action.target_ref) ?? `${sourceRefValue}/actions/${index + 1}`,
        action_id: stringValue(action.action_id),
        action_kind: stringValue(action.action_kind),
        owner_scope: stringValue(action.owner_scope),
        state: stringValue(action.state),
        restore_proof_refs: refsFromRecord(action, ['restore_proof_refs']),
        no_active_caller_refs: refsFromRecord(action, ['no_active_caller_refs']),
        replacement_parity_refs: refsFromRecord(action, ['replacement_parity_refs']),
        domain_owner_handoff_receipt_refs: refsFromRecord(action, [
          'domain_owner_handoff_receipt_refs',
          'domain_owner_cleanup_receipt_refs',
        ]),
        domain_repo_delete_requires_owner_receipt:
          action.domain_repo_delete_requires_owner_receipt === true,
        opl_writes_domain_repo_active_files:
          action.opl_writes_domain_repo_active_files === true,
      })),
      apply_command:
        `opl agents legacy-cleanup apply --domain ${commandDomainId} --mode apply --source-ref ${sourceRefValue}`,
      verify_command:
        `opl agents legacy-cleanup apply --domain ${commandDomainId} --mode verify --source-ref ${sourceRefValue}`,
      required_apply_surface: stringValue(plan.required_apply_surface)
        ?? 'family_runtime_lifecycle_apply',
      can_execute_from_app: false,
      authority_boundary: {
        ...refsOnlyAuthorityBoundary(),
        can_mark_opl_owned_legacy_refs: true,
        can_write_cleanup_ledger_receipts: true,
        domain_repo_delete_requires_owner_receipt: true,
        can_move_or_delete_domain_repo_files: false,
      },
    }];
  });
  return {
    surface_kind: 'opl_app_drilldown_domain_legacy_cleanup_plan_refs',
    projection_policy: 'cleanup_plan_refs_only_no_domain_repo_file_delete',
    refs: uniqueRefs(plans),
    summary: {
      legacy_cleanup_plan_count: plans.length,
      legacy_cleanup_ready_plan_count: plans.filter((plan) => plan.plan_status === 'ready').length,
      legacy_cleanup_blocked_plan_count: plans.filter((plan) => plan.plan_status !== 'ready').length,
      legacy_cleanup_action_count: plans.reduce((count, plan) => count + plan.action_count, 0),
      legacy_cleanup_opl_apply_ready_count:
        plans.filter((plan) => plan.opl_cleanup_apply_can_execute).length,
      legacy_cleanup_domain_delete_ready_count:
        plans.filter((plan) => plan.domain_delete_can_execute).length,
    },
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_mark_opl_owned_legacy_refs: true,
      can_write_cleanup_ledger_receipts: true,
      domain_repo_delete_requires_owner_receipt: true,
      can_move_or_delete_domain_repo_files: false,
    },
  };
}

function replacementCoverage(primitiveId: string) {
  const coverage = OPL_REPLACEMENT_COVERAGE[primitiveId];
  if (!coverage) {
    return {
      coverage_status: 'coverage_unknown',
      replacement_owner: 'one-person-lab',
      replacement_surface_refs: [],
      focused_verification_refs: [],
      live_evidence_still_required: true,
    };
  }
  return coverage;
}

const OPL_REPLACEMENT_COVERAGE: Record<string, {
  coverage_status: 'opl_replacement_surface_available';
  replacement_owner: 'one-person-lab';
  replacement_surface_refs: string[];
  focused_verification_refs: string[];
  live_evidence_still_required: boolean;
}> = {
  workspace_source_intake_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl substrate projections',
      '/runtime_tray_snapshot/app_operator_drilldown/ref_family_refs/source_refs',
      'contracts/opl-framework/generic-substrate-projection-contract.json',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/cli/cases/workspace-domain.descriptor.test.ts',
    ],
    live_evidence_still_required: true,
  },
  memory_locator_writeback_transport: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl domain-memory list',
      'opl domain-memory inspect',
      '/runtime_tray_snapshot/app_operator_drilldown/memory_writeback_refs',
      'contracts/family-orchestration/family-domain-memory-ref.schema.json',
      'contracts/family-orchestration/family-domain-memory-writeback.schema.json',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/functional-agent-runtime-harness.test.ts',
    ],
    live_evidence_still_required: true,
  },
  artifact_package_lifecycle_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime lifecycle apply',
      'opl runtime lifecycle apply',
      '/family-runtime/lifecycle-index',
      '/runtime_tray_snapshot/app_operator_drilldown/package_export_lifecycle_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/artifact_gallery_refs',
    ],
    focused_verification_refs: [
      'tests/src/family-runtime-lifecycle-index.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  generic_transition_runner: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl framework transition run',
      'family_transition_matrix',
      '/runtime_tray_snapshot/app_operator_drilldown/route_graph_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/decision_map_refs',
    ],
    focused_verification_refs: [
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/cli/cases/workspace-domain.descriptor.test.ts',
    ],
    live_evidence_still_required: true,
  },
  functional_harness_queue_stage_attempt_typed_closeout: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime attempt create',
      'opl family-runtime attempt start',
      'opl family-runtime attempt query',
      'opl family-runtime queue list',
      '/runtime_tray_snapshot/stage_attempt_workbench',
    ],
    focused_verification_refs: [
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  functional_harness_restart_dead_letter_repair_human_gate: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl family-runtime attempt signal',
      'opl family-runtime approve',
      'opl family-runtime scheduler tick --provider temporal',
      '/runtime_tray_snapshot/app_operator_drilldown/review_repair_queue_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/typed_blocker_refs',
    ],
    focused_verification_refs: [
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  operator_workbench_drilldown_shell: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl runtime app-operator-drilldown',
      '/runtime_tray_snapshot/app_operator_drilldown',
      '/runtime_tray_snapshot/app_operator_drilldown/app_execution_bridge',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
    ],
    live_evidence_still_required: true,
  },
  observability_repair_projection: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl runtime snapshot',
      'opl family-runtime provider-slo tick --provider temporal',
      'opl family-runtime scheduler status --provider temporal',
      '/runtime_tray_snapshot/provider_continuous_proof',
      '/runtime_tray_snapshot/app_operator_drilldown/provider_slo_operator_action_refs',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/product-entry-runtime.test.ts',
    ],
    live_evidence_still_required: true,
  },
  agent_scaffold_checklist: {
    coverage_status: 'opl_replacement_surface_available',
    replacement_owner: 'one-person-lab',
    replacement_surface_refs: [
      'opl agents scaffold',
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      'src/standard-domain-agent-scaffold.ts',
      'src/standard-domain-agent-scaffold-policy.ts',
    ],
    focused_verification_refs: [
      'tests/src/cli/cases/domain-pack-compiler.test.ts',
      'tests/src/cli/cases/workspace-domain.descriptor.test.ts',
    ],
    live_evidence_still_required: false,
  },
};

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'app_operator_drilldown_refs_only',
    domain: 'truth_memory_artifact_quality_export_owner',
    provider: 'runtime_slo_receipt_owner',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_submission_readiness: false,
    can_authorize_export_verdict: false,
    can_execute_domain_action: false,
    can_execute_provider_signal: false,
    provider_completion_is_domain_ready: false,
  };
}

function providerCadenceWindowSummary(providerContinuousProof: JsonRecord) {
  const window = record(providerContinuousProof.cadence_window);
  return {
    window_status: stringValue(window.window_status),
    long_window_evidence_ready: window.long_window_evidence_ready === true,
    expected_slo_execution_receipt_count: typeof window.expected_slo_execution_receipt_count === 'number'
      ? window.expected_slo_execution_receipt_count
      : 0,
    observed_slo_execution_receipt_count: typeof window.observed_slo_execution_receipt_count === 'number'
      ? window.observed_slo_execution_receipt_count
      : 0,
    missing_slo_execution_receipt_count: typeof window.missing_slo_execution_receipt_count === 'number'
      ? window.missing_slo_execution_receipt_count
      : 0,
    blocked_repair_receipt_count: typeof window.blocked_repair_receipt_count === 'number'
      ? window.blocked_repair_receipt_count
      : 0,
  };
}

function providerCapabilitySloSummary(providerContinuousProof: JsonRecord) {
  const capability = record(providerContinuousProof.provider_capability_slo);
  return {
    status: stringValue(capability.status),
    restart_requery_ready: capability.restart_requery_ready === true,
    signal_history_ready: capability.signal_history_ready === true,
    typed_closeout_required_ready: capability.typed_closeout_required_ready === true,
    missing_closeout_block_ready: capability.missing_closeout_block_ready === true,
    retry_dead_letter_boundary_ready: capability.retry_dead_letter_boundary_ready === true,
    domain_truth_boundary_preserved: capability.domain_truth_boundary_preserved === true,
  };
}

export function buildAppOperatorDrilldown(input: {
  stageAttemptWorkbench: JsonRecord;
  providerContinuousProof: JsonRecord;
  domainProjectionIngestion: JsonRecord;
  domainManifestProjects: DomainManifestCatalogEntry[];
  detailLevel?: AppOperatorDrilldownDetailLevel;
}) {
  const attempts = recordList(input.stageAttemptWorkbench.attempts);
  const routeRefs = routeGraphRefs(attempts);
  const decisionRefs = decisionMapRefs(attempts);
  const reviewItems = reviewRepairItems(input.stageAttemptWorkbench);
  const artifactRefs = artifactGalleryRefs(input.stageAttemptWorkbench);
  const packageLifecycle = packageExportLifecycle(input.stageAttemptWorkbench);
  const memoryRefs = memoryWritebackRefs(input.stageAttemptWorkbench);
  const qualityRefs = qualityReadinessRefs(input.stageAttemptWorkbench);
  const providerActionRefs = providerSloRefs(input.providerContinuousProof);
  const providerCadenceWindow = providerCadenceWindowSummary(input.providerContinuousProof);
  const providerCapabilitySlo = providerCapabilitySloSummary(input.providerContinuousProof);
  const periodicRefs = periodicExecutionRefs(providerActionRefs);
  const domainRefs = domainProjectionRefs(input.domainProjectionIngestion);
  const ownerReceipts = ownerReceiptRefs(attempts, input.domainProjectionIngestion);
  const typedBlockers = typedBlockerRefs(attempts, input.domainProjectionIngestion);
  const domainDispatchEvidence = buildDomainDispatchEvidence(attempts);
  const stageProductionEvidence = buildStageProductionEvidence({
    domainManifestProjects: input.domainManifestProjects,
    attempts,
  });
  const freshness = freshnessRefs(attempts, input.domainProjectionIngestion);
  const refFamilies = refFamilyRefs(input.stageAttemptWorkbench);
  const functionalSummary = functionalPrivatizationSummary(input.domainManifestProjects);
  const evidenceRequests = buildDomainEvidenceRequestRefs(
    input.domainManifestProjects,
    replacementCoverage,
  );
  const legacyCleanupPlans = legacyCleanupPlanRefs(
    input.domainManifestProjects,
    input.providerContinuousProof,
  );
  const productionEvidenceTailLedger = buildAppDrilldownProductionEvidenceTailLedger({
    providerContinuousProof: input.providerContinuousProof,
    stageAttempts: attempts,
    appOperatorDrilldown: {
      stage_production_evidence: stageProductionEvidence,
      domain_dispatch_evidence: domainDispatchEvidence,
      domain_evidence_request_refs: evidenceRequests,
      domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    },
  });
  const actionRefs = uniqueRefs([
    ...operatorActionRoutingRefs(input.stageAttemptWorkbench),
    ...buildStageProductionAttemptRoutes(record(stageProductionEvidence)),
    ...buildExternalEvidenceActionRoutes(record(evidenceRequests)),
    ...buildProviderSchedulerActionRoutes(record(periodicRefs)),
    ...buildLegacyCleanupActionRoutes(record(legacyCleanupPlans)),
  ]);
  const lifecycleRefs = lifecycleLedgerRefs();
  const safeActions = safeActionRefs(actionRefs, lifecycleRefs);
  const executionBridge = appExecutionBridge(actionRefs, periodicRefs, lifecycleRefs);
  const sourceRefs: RuntimeTraySourceRef[] = uniqueByRef([
    sourceRef('/runtime_tray_snapshot/stage_attempt_workbench', 'stage_attempt_workbench'),
    sourceRef('/runtime_tray_snapshot/domain_projection_ingestion', 'domain_projection_ingestion'),
    sourceRef('/runtime_tray_snapshot/provider_continuous_proof', 'provider_continuous_proof'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown', 'app_operator_drilldown'),
    sourceRef('/family-runtime/lifecycle-index', 'family_runtime_lifecycle_index'),
    sourceRef('/external-evidence-ledger', 'external_evidence_ledger'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/production_evidence_tail_ledger', 'production_evidence_tail_ledger'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs', 'domain_evidence_request_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_legacy_cleanup_plan_refs', 'domain_legacy_cleanup_plan_refs'),
  ]);

  return applyAppOperatorDrilldownDetail({
    surface_kind: 'opl_app_operator_drilldown_read_model',
    projection_scope: 'runtime_snapshot',
    consumer: 'one_person_lab_app_operator_workbench',
    availability:
      attempts.length > 0 || domainRefs.length > 0 || providerActionRefs.length > 0
        ? 'available'
        : 'empty',
    projection_policy: 'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
    summary: buildAppOperatorDrilldownSummary({
      attempts,
      domainRefs,
      routeRefs,
      decisionRefs,
      reviewItems,
      artifactRefs,
      packageLifecycle,
      memoryRefs,
      qualityRefs,
      providerActionRefs,
      providerCadenceWindow,
      providerCapabilitySlo,
      periodicRefs,
      actionRefs,
      ownerReceipts,
      typedBlockers,
      domainDispatchEvidence,
      stageProductionEvidence,
      freshness,
      refFamilies,
      safeActions,
      executionBridge,
      lifecycleRefs,
      functionalSummary,
      evidenceRequests,
      productionEvidenceTailLedger,
      legacyCleanupPlans,
    }),
    route_graph_refs: {
      surface_kind: 'opl_app_drilldown_route_graph_refs',
      refs: routeRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    decision_map_refs: {
      surface_kind: 'opl_app_drilldown_decision_map_refs',
      refs: decisionRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    review_repair_queue_refs: {
      surface_kind: 'opl_app_drilldown_review_repair_queue_refs',
      items: reviewItems,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    artifact_gallery_refs: {
      surface_kind: 'opl_app_drilldown_artifact_gallery_refs',
      content_policy: 'locator_only_no_artifact_content',
      refs: artifactRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    package_export_lifecycle_refs: packageLifecycle,
    memory_writeback_refs: memoryRefs,
    quality_readiness_refs: qualityRefs,
    provider_slo_operator_action_refs: {
      surface_kind: 'opl_app_drilldown_provider_slo_operator_action_refs',
      refs: providerActionRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    periodic_execution_refs: periodicRefs,
    operator_action_routing_refs: {
      surface_kind: 'opl_app_drilldown_operator_action_routing_refs',
      refs: actionRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    owner_receipt_refs: {
      surface_kind: 'opl_app_drilldown_owner_receipt_refs',
      refs: ownerReceipts,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    typed_blocker_refs: {
      surface_kind: 'opl_app_drilldown_typed_blocker_refs',
      refs: typedBlockers.refs,
      blockers: typedBlockers.blockers,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    domain_dispatch_evidence: domainDispatchEvidence,
    stage_production_evidence: stageProductionEvidence,
    freshness_refs: {
      surface_kind: 'opl_app_drilldown_freshness_refs',
      refs: freshness,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    ref_family_refs: refFamilies,
    safe_action_refs: {
      surface_kind: 'opl_app_drilldown_safe_action_refs',
      refs: safeActions,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    app_execution_bridge: executionBridge,
    lifecycle_ledger_refs: lifecycleRefs,
    domain_projection_refs: {
      surface_kind: 'opl_app_drilldown_domain_projection_refs',
      refs: domainRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    domain_evidence_request_refs: evidenceRequests,
    production_evidence_tail_ledger: productionEvidenceTailLedger,
    domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    functional_privatization_audit_summary: functionalSummary,
    authority_boundary: refsOnlyAuthorityBoundary(),
    source_refs: sourceRefs,
    non_goals: [
      'does_not_write_domain_truth',
      'does_not_read_or_store_memory_body',
      'does_not_read_or_mutate_artifact_body',
      'does_not_authorize_quality_readiness_or_export_verdict',
      'does_not_directly_execute_domain_actions',
    ],
  }, input.detailLevel ?? 'summary');
}

export type { AppOperatorDrilldownDetailLevel };
