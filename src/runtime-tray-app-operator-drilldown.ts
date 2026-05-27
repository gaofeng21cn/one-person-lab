import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import {
  readFamilyRuntimeLifecycleRefs,
  reconcileFamilyRuntimeLifecycleRefs,
} from './family-runtime-lifecycle-index.ts';
import {
  buildStandardDomainAgentSkeletonInspection,
} from './family-domain-agent-skeleton.ts';
import {
  buildStandardDomainAgentTemplateConsumptionReadModel,
} from './standard-domain-agent-scaffold.ts';
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
  buildDomainDispatchEvidenceReceiptRoutes,
} from './runtime-tray-app-operator-drilldown-parts/domain-dispatch-action-routes.ts';
import {
  buildStageProductionEvidence,
} from './runtime-tray-app-operator-drilldown-parts/stage-production-evidence.ts';
import {
  buildStageProductionAttemptStartRoutes,
  buildStageProductionAttemptRoutes,
  buildStageProductionEvidenceReceiptRoutes,
} from './runtime-tray-app-operator-drilldown-parts/stage-production-action-routes.ts';
import {
  buildExternalEvidenceActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/external-evidence-action-routes.ts';
import {
  buildDomainOwnerPayloadSummaryRefs,
} from './runtime-tray-app-operator-drilldown-parts/domain-owner-payload-summary-refs.ts';
import {
  buildDomainOwnerPayloadSummaryActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/domain-owner-payload-summary-action-routes.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './runtime-tray-app-operator-drilldown-parts/authority-boundary.ts';
import {
  buildCodexAppRuntimeEvidenceActionRoutes,
  buildCodexAppRuntimeRole,
} from './runtime-tray-app-operator-drilldown-parts/codex-app-runtime-role.ts';
import {
  buildOmaProductionConsumptionActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/oma-production-consumption.ts';
import { appReleaseUserPathEvidenceSourceRef, buildAppReleaseUserPathEvidenceActionRoutes, buildAppReleaseUserPathEvidenceFromRuntime } from './runtime-tray-app-operator-drilldown-parts/app-release-user-path.ts';
import {
  buildLegacyCleanupActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/legacy-cleanup-action-routes.ts';
import {
  buildProviderSchedulerActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/provider-scheduler-action-routes.ts';
import {
  buildProviderWorkerActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/provider-worker-action-routes.ts';
import {
  periodicExecutionRefs,
  providerCapabilitySloSummary,
  providerCadenceWindowSummary,
  providerSloRefs,
} from './runtime-tray-app-operator-drilldown-parts/provider-periodic-refs.ts';
import { replacementCoverage } from './runtime-tray-app-operator-drilldown-parts/replacement-coverage.ts';
import {
  buildAppOperatorDrilldownSummary,
} from './runtime-tray-app-operator-drilldown-parts/summary.ts';
import {
  buildOplMetaAgentRegistryExtension,
} from './opl-meta-agent-consumption.ts';
import {
  buildEvidenceEnvelopeProjection,
} from './evidence-envelope.ts';
import {
  buildMasDomainRouteSupportProjection,
} from './family-runtime-mas-domain-route.ts';
import {
  functionalPrivatizationAuditRefs,
  functionalPrivatizationSummary,
} from './runtime-tray-app-operator-drilldown-parts/functional-privatization-audit-refs.ts';
import {
  buildFunctionalPrivatizationSemanticEquivalenceActionRoutes,
} from './runtime-tray-app-operator-drilldown-parts/functional-privatization-action-routes.ts';
import {
  buildDefaultCallerDeletionEvidenceRefs,
} from './runtime-tray-app-operator-drilldown-parts/default-caller-deletion-evidence-refs.ts';
import {
  buildAppExecutionBridge,
} from './runtime-tray-app-operator-drilldown-parts/execution-bridge.ts';
import {
  buildRuntimeVisualizationProjection,
} from './runtime-tray-app-operator-drilldown-parts/runtime-visualization-projection.ts';
import {
  booleanValue,
  cleanupCommandDomainId,
  nestedRef,
  numberValue,
  record,
  recordList,
  refsFromRecord,
  stringList,
  stringValue,
  uniqueBlockers,
  uniqueRefs,
  uniqueRefsByValue,
  uniqueStrings,
} from './runtime-tray-app-operator-drilldown-parts/value-utils.ts';

type DrilldownRef = {
  ref: string;
  role: string;
  label?: string | null;
  domain_id?: string | null;
  stage_id?: string | null;
  stage_attempt_id?: string | null;
};

const RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT = 5;

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

function attemptTruePathProofs(attempts: JsonRecord[]) {
  return attempts
    .map((attempt) => record(attempt.attempt_true_path_proof))
    .filter((proof) => Object.keys(proof).length > 0);
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

function externalVerifiedMemoryWritebackReceiptRefs(evidenceRequests: JsonRecord) {
  return uniqueStrings(recordList(evidenceRequests.external_receipts)
    .filter((receipt) => stringValue(receipt.receipt_status) === 'verified')
    .flatMap((receipt) => stringList(receipt.memory_writeback_receipt_refs)));
}

function memoryWritebackRefs(workbench: JsonRecord, evidenceRequests: JsonRecord) {
  const memory = record(workbench.memory_locator_index);
  return {
    surface_kind: 'opl_app_drilldown_memory_writeback_refs',
    projection_policy: 'memory_refs_and_writeback_receipts_only_no_memory_body',
    consumed_memory_refs: uniqueStrings(stringList(memory.consumed_memory_refs)),
    writeback_receipt_refs: uniqueStrings([
      ...stringList(memory.writeback_receipt_refs),
      ...externalVerifiedMemoryWritebackReceiptRefs(evidenceRequests),
    ]),
    rejected_write_count: recordList(memory.rejected_writes).length,
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_accept_or_reject_memory_writeback: false,
    },
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

function refFamilyRefs(workbench: JsonRecord, memoryRefsProjection: JsonRecord) {
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
    ...stringList(memoryRefsProjection.writeback_receipt_refs).map((ref) => ({
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

function currentControlStateProjection(attempts: JsonRecord[]) {
  const states = attempts
    .map((attempt) => record(attempt.current_control_state))
    .filter((state) => Object.keys(state).length > 0);
  const blockedStates = states.filter((state) => {
    const status = stringValue(state.reconciliation_status);
    return status?.startsWith('blocked_') || stringValue(state.current_attempt_state) === 'blocked';
  });
  const runningStates = states.filter((state) => state.running_provider_attempt === true);
  const allRunningDomainIds = uniqueStrings(runningStates
    .map((state) => stringValue(state.domain_id))
    .filter((domainId): domainId is string => Boolean(domainId)));
  const allRunningTaskKinds = uniqueStrings(runningStates
    .map((state) => stringValue(state.task_kind))
    .filter((taskKind): taskKind is string => Boolean(taskKind)));
  const allRunningStageAttemptIds = uniqueStrings(runningStates
    .map((state) => stringValue(state.active_stage_attempt_id))
    .filter((stageAttemptId): stageAttemptId is string => Boolean(stageAttemptId)));
  const runningHeartbeatTimes = uniqueStrings(runningStates
    .map((state) => stringValue(record(state.provider_run).last_heartbeat_at))
    .filter((heartbeat): heartbeat is string => Boolean(heartbeat)));
  const latestRunningHeartbeatAt = runningHeartbeatTimes.sort().at(-1) ?? null;
  const runningDomainIds = allRunningDomainIds.slice(0, RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT);
  const runningTaskKinds = allRunningTaskKinds.slice(0, RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT);
  const runningStageAttemptIds = allRunningStageAttemptIds.slice(
    0,
    RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT,
  );
  return {
    surface_kind: 'opl_app_drilldown_current_control_state_projection',
    projection_policy: 'opl_reconciled_projection_only_no_domain_ready_publication_ready_or_artifact_ready',
    states,
    summary: {
      current_control_state_count: states.length,
      blocked_control_state_count: blockedStates.length,
      accepted_typed_closeout_count: states.filter((state) =>
        stringValue(state.reconciliation_status) === 'accepted_typed_closeout'
      ).length,
      running_control_state_count: runningStates.length,
      running_provider_attempt_count: runningStates.length,
      running_provider_attempt_domain_ids: runningDomainIds,
      running_provider_attempt_domain_id_omitted_count:
        Math.max(0, allRunningDomainIds.length - runningDomainIds.length),
      running_provider_attempt_task_kinds: runningTaskKinds,
      running_provider_attempt_task_kind_omitted_count:
        Math.max(0, allRunningTaskKinds.length - runningTaskKinds.length),
      running_provider_attempt_stage_attempt_ids: runningStageAttemptIds,
      running_provider_attempt_stage_attempt_id_omitted_count:
        Math.max(0, allRunningStageAttemptIds.length - runningStageAttemptIds.length),
      latest_running_provider_heartbeat_at: latestRunningHeartbeatAt,
      running_provider_attempt_summary_policy:
        'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
    },
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      reads_domain_latest_or_dispatch_latest: false,
      provider_completion_is_domain_ready: false,
      can_claim_domain_ready: false,
      can_claim_publication_ready: false,
      can_claim_artifact_ready: false,
    },
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
      lifecycle_domain_physical_delete_requires_owner_receipt: true,
      lifecycle_domain_physical_delete_can_execute:
        record(reconcile.summary).can_execute_domain_physical_delete === true,
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
      opl_cleanup_ledger_ready: deleteGate.opl_cleanup_apply_can_execute === true,
      opl_cleanup_apply_can_execute: deleteGate.opl_cleanup_apply_can_execute === true,
      domain_physical_delete_requires_owner_receipt: true,
      domain_physical_delete_can_execute: deleteGate.can_execute_domain_physical_delete === true,
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
      legacy_cleanup_opl_cleanup_ledger_ready_count:
        plans.filter((plan) => plan.opl_cleanup_ledger_ready).length,
      legacy_cleanup_domain_physical_delete_requires_owner_receipt_count:
        plans.filter((plan) => plan.domain_physical_delete_requires_owner_receipt).length,
      legacy_cleanup_domain_physical_delete_can_execute_count:
        plans.filter((plan) => plan.domain_physical_delete_can_execute).length,
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

function runtimeManagerRouteSupportRefs() {
  return {
    surface_kind: 'opl_app_drilldown_runtime_manager_route_support',
    source_surface: 'opl_runtime_manager.family_runtime_queue.mas_domain_route_projection',
    projection_policy:
      'refs_only_supported_route_catalog_no_owner_chain_closure_or_domain_ready_claim',
    mas_domain_route_projection: buildMasDomainRouteSupportProjection(),
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      can_claim_artifact_authority: false,
      can_close_owner_chain: false,
      can_record_owner_receipt: false,
      can_authorize_publication_aftercare: false,
    },
  };
}

function refEntries(refs: string[], role: string, attempt: JsonRecord | null = null) {
  return refs.map((ref) => ({
    ref,
    role,
    domain_id: attempt ? stringValue(attempt.domain_id) : null,
    stage_id: attempt ? stringValue(attempt.stage_id) : null,
    stage_attempt_id: attempt ? stringValue(attempt.stage_attempt_id) : null,
  }));
}

function routeTransitionDrilldown(input: {
  attempts: JsonRecord[];
  domainProjectionIngestion: JsonRecord;
  runtimeManagerRouteSupport: JsonRecord;
}) {
  const stageAttemptRefs = uniqueRefs(input.attempts.flatMap((attempt) => {
    const stageAttemptId = stringValue(attempt.stage_attempt_id);
    const routeImpact = record(attempt.route_impact);
    if (!stageAttemptId || Object.keys(routeImpact).length === 0) {
      return [];
    }
    return [{
      ref: `/stage_attempt_workbench/attempts/${stageAttemptId}/route_impact`,
      role: 'stage_attempt_route_transition',
      domain_id: stringValue(attempt.domain_id),
      stage_id: stringValue(attempt.stage_id),
      stage_attempt_id: stageAttemptId,
      task_id: stringValue(attempt.task_id),
      status: stringValue(attempt.status),
      decision: stringValue(routeImpact.decision),
      blocked_reason: stringValue(attempt.blocked_reason),
    }];
  }));
  const transitionSpecRefs = uniqueRefs(input.attempts.flatMap((attempt) =>
    refEntries(refsFromRecord(record(attempt.route_impact), [
      'transition_spec_ref',
      'transition_spec_refs',
      'family_transition_spec_ref',
      'family_transition_spec_refs',
    ]), 'route_transition_spec', attempt)
  ));
  const materializationRefs = uniqueRefs(input.attempts.flatMap((attempt) =>
    refEntries(refsFromRecord(record(attempt.route_impact), [
      'transition_materialization_ref',
      'transition_materialization_refs',
      'matrix_result_ref',
      'matrix_result_refs',
    ]), 'route_transition_materialization', attempt)
  ));
  const ownerRouteRefs = uniqueRefsByValue([
    ...input.attempts.flatMap((attempt) =>
      refEntries(refsFromRecord(record(attempt.route_impact), [
        'owner_route_ref',
        'owner_route_refs',
      ]), 'route_transition_owner_route', attempt)
    ),
    ...recordList(input.domainProjectionIngestion.items).flatMap((item) =>
      stringList(item.owner_route_refs).map((ref) => ({
        ref,
        role: 'domain_projection_owner_route',
        domain_id: stringValue(item.domain_id),
        source_surface: stringValue(item.source_surface),
      }))
    ),
  ]);
  const ownerReceiptRefs = uniqueRefsByValue([
    ...input.attempts.flatMap((attempt) =>
      refEntries(refsFromRecord(record(attempt.route_impact), [
        'owner_receipt_ref',
        'owner_receipt_refs',
        'domain_owner_receipt_ref',
        'domain_owner_receipt_refs',
      ]), 'route_transition_owner_receipt', attempt)
    ),
    ...recordList(input.domainProjectionIngestion.items).flatMap((item) =>
      stringList(item.owner_receipt_refs).map((ref) => ({
        ref,
        role: 'domain_projection_owner_receipt',
        domain_id: stringValue(item.domain_id),
        source_surface: stringValue(item.source_surface),
      }))
    ),
  ]);
  const typedBlockerRefs = uniqueRefsByValue([
    ...input.attempts.flatMap((attempt) =>
      refEntries(refsFromRecord(record(attempt.route_impact), [
        'typed_blocker_ref',
        'typed_blocker_refs',
      ]), 'route_transition_typed_blocker', attempt)
    ),
    ...recordList(input.domainProjectionIngestion.items).flatMap((item) =>
      stringList(item.typed_blocker_refs).map((ref) => ({
        ref,
        role: 'domain_projection_typed_blocker',
        domain_id: stringValue(item.domain_id),
        source_surface: stringValue(item.source_surface),
      }))
    ),
  ]);
  const humanGateRefs = uniqueRefs(input.attempts.flatMap((attempt) => [
    ...refEntries(refsFromRecord(record(attempt.route_impact), [
      'human_gate_ref',
      'human_gate_refs',
    ]), 'route_transition_human_gate', attempt),
    ...refEntries(stringList(attempt.human_gate_refs), 'stage_attempt_human_gate', attempt),
  ]));
  const deadLetterRefs = uniqueRefs(input.attempts.flatMap((attempt) => {
    const stageAttemptId = stringValue(attempt.stage_attempt_id);
    const deadLetter = record(attempt.dead_letter);
    return [
      ...refEntries(refsFromRecord(record(attempt.route_impact), [
        'dead_letter_ref',
        'dead_letter_refs',
      ]), 'route_transition_dead_letter', attempt),
      ...(stageAttemptId && Object.keys(deadLetter).length > 0
        ? [{
          ref: `/stage_attempt_workbench/attempts/${stageAttemptId}/dead_letter`,
          role: 'stage_attempt_dead_letter',
          domain_id: stringValue(attempt.domain_id),
          stage_id: stringValue(attempt.stage_id),
          stage_attempt_id: stageAttemptId,
          reason: stringValue(deadLetter.reason),
        }]
        : []),
    ];
  }));
  return {
    surface_kind: 'opl_app_drilldown_route_transition_drilldown',
    projection_policy: 'refs_only_no_domain_truth_or_owner_receipt_generation',
    mas_route_support: record(input.runtimeManagerRouteSupport.mas_domain_route_projection),
    transition_spec_refs: transitionSpecRefs,
    materialization_refs: materializationRefs,
    stage_attempt_refs: stageAttemptRefs,
    owner_route_refs: ownerRouteRefs,
    human_gate_refs: humanGateRefs,
    dead_letter_refs: deadLetterRefs,
    typed_blocker_refs: typedBlockerRefs,
    owner_receipt_refs: ownerReceiptRefs,
    summary: {
      stage_attempt_count: stageAttemptRefs.length,
      transition_spec_ref_count: transitionSpecRefs.length,
      materialization_ref_count: materializationRefs.length,
      owner_route_ref_count: ownerRouteRefs.length,
      human_gate_ref_count: humanGateRefs.length,
      dead_letter_ref_count: deadLetterRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      owner_receipt_ref_count: ownerReceiptRefs.length,
    },
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_record_owner_receipt: false,
      can_close_owner_chain: false,
      can_claim_domain_ready: false,
    },
  };
}

export function buildAppOperatorDrilldown(input: {
  stageAttemptWorkbench: JsonRecord;
  providerInspection?: JsonRecord;
  providerContinuousProof: JsonRecord;
  domainProjectionIngestion: JsonRecord;
  domainManifestProjects: DomainManifestCatalogEntry[];
  detailLevel?: AppOperatorDrilldownDetailLevel;
}) {
  const attempts = recordList(input.stageAttemptWorkbench.attempts);
  const evidenceAttempts = recordList(input.stageAttemptWorkbench.evidence_attempts);
  const operatorEvidenceAttempts = evidenceAttempts.length > 0 ? evidenceAttempts : attempts;
  const truePathProofs = attemptTruePathProofs(operatorEvidenceAttempts);
  const routeRefs = routeGraphRefs(attempts);
  const decisionRefs = decisionMapRefs(attempts);
  const reviewItems = reviewRepairItems(input.stageAttemptWorkbench);
  const artifactRefs = artifactGalleryRefs(input.stageAttemptWorkbench);
  const packageLifecycle = packageExportLifecycle(input.stageAttemptWorkbench);
  const evidenceRequests = buildDomainEvidenceRequestRefs(
    input.domainManifestProjects,
    replacementCoverage,
  );
  const memoryRefs = memoryWritebackRefs(input.stageAttemptWorkbench, record(evidenceRequests));
  const qualityRefs = qualityReadinessRefs(input.stageAttemptWorkbench);
  const providerActionRefs = providerSloRefs(input.providerContinuousProof);
  const providerCadenceWindow = providerCadenceWindowSummary(input.providerContinuousProof);
  const providerCapabilitySlo = providerCapabilitySloSummary(input.providerContinuousProof);
  const appRuntimeRole = buildCodexAppRuntimeRole();
  const runtimeManagerRouteSupport = runtimeManagerRouteSupportRefs();
  const routeTransitionDrilldownRefs = routeTransitionDrilldown({
    attempts,
    domainProjectionIngestion: input.domainProjectionIngestion,
    runtimeManagerRouteSupport,
  });
  const periodicRefs = periodicExecutionRefs(providerActionRefs);
  const domainRefs = domainProjectionRefs(input.domainProjectionIngestion);
  const ownerReceipts = ownerReceiptRefs(attempts, input.domainProjectionIngestion);
  const typedBlockers = typedBlockerRefs(attempts, input.domainProjectionIngestion);
  const domainDispatchEvidence = buildDomainDispatchEvidence(operatorEvidenceAttempts);
  const stageProductionEvidence = buildStageProductionEvidence({
    domainManifestProjects: input.domainManifestProjects,
    attempts: operatorEvidenceAttempts,
  });
  const freshness = freshnessRefs(attempts, input.domainProjectionIngestion);
  const refFamilies = refFamilyRefs(input.stageAttemptWorkbench, record(memoryRefs));
  const currentControlState = currentControlStateProjection(operatorEvidenceAttempts);
  const functionalSummary = functionalPrivatizationSummary(input.domainManifestProjects);
  const functionalAuditRefs = functionalPrivatizationAuditRefs(input.domainManifestProjects);
  const defaultCallerDeletionEvidenceRefs =
    buildDefaultCallerDeletionEvidenceRefs(input.domainManifestProjects);
  const domainOwnerPayloadSummaryRefs = buildDomainOwnerPayloadSummaryRefs({
    domainManifestProjects: input.domainManifestProjects,
  });
  const legacyCleanupPlans = legacyCleanupPlanRefs(
    input.domainManifestProjects,
    input.providerContinuousProof,
  );
  const oplMetaAgentRegistry = buildOplMetaAgentRegistryExtension();
  const standardAgentTemplateConsumption = buildStandardDomainAgentTemplateConsumptionReadModel();
  const oplMetaAgentProjection = record(oplMetaAgentRegistry as JsonRecord);
  const oplMetaAgentProductionConsumption = record(
    oplMetaAgentProjection.production_consumption_followthrough,
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
  const appReleaseUserPathEvidence = buildAppReleaseUserPathEvidenceFromRuntime({
    authorityBoundary: refsOnlyAuthorityBoundary(), appRuntimeRole, packageLifecycle,
    productionEvidenceTailLedger, providerActionRefs, periodicRefs,
  });
  const actionRefs = uniqueRefs([
    ...operatorActionRoutingRefs(input.stageAttemptWorkbench),
    ...buildStageProductionAttemptRoutes(record(stageProductionEvidence)),
    ...buildStageProductionAttemptStartRoutes(record(stageProductionEvidence)),
    ...buildStageProductionEvidenceReceiptRoutes(record(stageProductionEvidence)),
    ...buildDomainDispatchEvidenceReceiptRoutes(record(domainDispatchEvidence)),
    ...buildExternalEvidenceActionRoutes(record(evidenceRequests)),
    ...buildFunctionalPrivatizationSemanticEquivalenceActionRoutes(record(functionalAuditRefs)),
    ...buildDomainOwnerPayloadSummaryActionRoutes(record(domainOwnerPayloadSummaryRefs)),
    ...buildCodexAppRuntimeEvidenceActionRoutes(record(appRuntimeRole)),
    ...buildAppReleaseUserPathEvidenceActionRoutes(record(appReleaseUserPathEvidence)),
    ...buildOmaProductionConsumptionActionRoutes(oplMetaAgentProductionConsumption),
    ...buildProviderWorkerActionRoutes({ stageAttemptWorkbench: input.stageAttemptWorkbench, providerInspection: input.providerInspection }),
    ...buildProviderSchedulerActionRoutes(record(periodicRefs)),
    ...buildLegacyCleanupActionRoutes(record(legacyCleanupPlans)),
  ]);
  const evidenceEnvelope = buildEvidenceEnvelopeProjection({
    appOperatorDrilldown: {
      stage_production_evidence: stageProductionEvidence,
      domain_dispatch_evidence: domainDispatchEvidence,
      domain_evidence_request_refs: evidenceRequests,
      domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    },
    operatorRoutes: actionRefs,
  });
  const lifecycleRefs = lifecycleLedgerRefs();
  const safeActions = safeActionRefs(actionRefs, lifecycleRefs);
  const executionBridge = buildAppExecutionBridge(actionRefs, periodicRefs, lifecycleRefs);
  const runtimeVisualizationProjection = buildRuntimeVisualizationProjection({
    attempts,
    routeRefs,
    decisionRefs,
    artifactRefs,
    packageLifecycle,
    memoryRefs,
    qualityRefs,
    actionRefs,
    ownerReceipts,
    typedBlockers,
    domainProjectionIngestion: input.domainProjectionIngestion,
    routeTransitionDrilldown: routeTransitionDrilldownRefs,
    stageProductionEvidence,
    domainDispatchEvidence,
    safeActions,
  });
  const summary = {
    ...buildAppOperatorDrilldownSummary({
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
      runtimeManagerRouteSupport,
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
      domainOwnerPayloadSummaryRefs,
      productionEvidenceTailLedger,
      legacyCleanupPlans,
      oplMetaAgentRegistry,
      standardAgentTemplateConsumption,
      evidenceEnvelope,
      codexAppRuntimeRole: appRuntimeRole,
      appReleaseUserPathEvidence,
    }),
    codex_app_runtime_role_status: appRuntimeRole.runtime_policy,
    codex_app_runtime_role_count: Array.isArray(appRuntimeRole.codex_app_roles)
      ? appRuntimeRole.codex_app_roles.length
      : 0,
    codex_app_drives_long_running_tasks: appRuntimeRole.codex_app_drives_long_running_tasks,
    codex_app_long_running_task_driver_owner: appRuntimeRole.long_running_task_driver_owner,
    codex_app_long_running_task_driver_substrate:
      appRuntimeRole.long_running_task_driver_substrate,
    codex_app_production_long_soak_claimed: appRuntimeRole.production_long_soak_claimed,
    codex_app_production_evidence_gate_remains_open:
      appRuntimeRole.production_evidence_gate_remains_open,
    route_transition_drilldown_stage_attempt_count:
      record(routeTransitionDrilldownRefs.summary).stage_attempt_count,
    route_transition_drilldown_owner_route_ref_count:
      record(routeTransitionDrilldownRefs.summary).owner_route_ref_count,
    route_transition_drilldown_human_gate_ref_count:
      record(routeTransitionDrilldownRefs.summary).human_gate_ref_count,
    route_transition_drilldown_dead_letter_ref_count:
      record(routeTransitionDrilldownRefs.summary).dead_letter_ref_count,
    default_caller_deletion_evidence_open_requirement_count:
      record(defaultCallerDeletionEvidenceRefs.summary).open_deletion_evidence_requirement_count,
    default_caller_deletion_missing_domain_owner_receipt_or_typed_blocker_count:
      record(defaultCallerDeletionEvidenceRefs.summary)
        .missing_domain_owner_receipt_or_typed_blocker_count,
    default_caller_deletion_missing_no_forbidden_write_proof_count:
      record(defaultCallerDeletionEvidenceRefs.summary).missing_no_forbidden_write_proof_count,
    default_caller_deletion_missing_tombstone_or_provenance_ref_count:
      record(defaultCallerDeletionEvidenceRefs.summary).missing_tombstone_or_provenance_ref_count,
    domain_legacy_cleanup_opl_cleanup_ledger_ready_count:
      record(legacyCleanupPlans.summary).legacy_cleanup_opl_cleanup_ledger_ready_count,
    domain_legacy_cleanup_domain_physical_delete_requires_owner_receipt_count:
      record(legacyCleanupPlans.summary)
        .legacy_cleanup_domain_physical_delete_requires_owner_receipt_count,
    domain_legacy_cleanup_delete_ready_count: undefined,
    current_control_state_count: record(currentControlState.summary).current_control_state_count,
    current_control_state_blocked_count: record(currentControlState.summary).blocked_control_state_count,
    current_control_state_accepted_typed_closeout_count:
      record(currentControlState.summary).accepted_typed_closeout_count,
    current_control_state_running_count:
      record(currentControlState.summary).running_control_state_count,
    current_control_state_running_provider_attempt_count:
      record(currentControlState.summary).running_provider_attempt_count,
    current_control_state_running_provider_attempt_domain_ids:
      record(currentControlState.summary).running_provider_attempt_domain_ids,
    current_control_state_running_provider_attempt_domain_id_omitted_count:
      record(currentControlState.summary).running_provider_attempt_domain_id_omitted_count,
    current_control_state_running_provider_attempt_task_kinds:
      record(currentControlState.summary).running_provider_attempt_task_kinds,
    current_control_state_running_provider_attempt_task_kind_omitted_count:
      record(currentControlState.summary).running_provider_attempt_task_kind_omitted_count,
    current_control_state_running_provider_attempt_stage_attempt_ids:
      record(currentControlState.summary).running_provider_attempt_stage_attempt_ids,
    current_control_state_running_provider_attempt_stage_attempt_id_omitted_count:
      record(currentControlState.summary).running_provider_attempt_stage_attempt_id_omitted_count,
    current_control_state_latest_running_provider_heartbeat_at:
      record(currentControlState.summary).latest_running_provider_heartbeat_at,
    current_control_state_running_provider_attempt_summary_policy:
      record(currentControlState.summary).running_provider_attempt_summary_policy,
    runtime_visualization_node_count:
      record(runtimeVisualizationProjection.summary).node_count,
    runtime_visualization_edge_count:
      record(runtimeVisualizationProjection.summary).edge_count,
    runtime_visualization_timeline_event_count:
      record(runtimeVisualizationProjection.summary).timeline_event_count,
    runtime_visualization_paper_route_lens_ref_count:
      record(runtimeVisualizationProjection.summary).paper_route_lens_ref_count,
    runtime_visualization_stage_progress_event_count:
      record(runtimeVisualizationProjection.summary).stage_progress_event_count,
    runtime_visualization_temporal_stage_progress_ref_count:
      record(runtimeVisualizationProjection.summary).temporal_stage_progress_ref_count,
    attempt_true_path_proof_count: truePathProofs.length,
    attempt_true_path_observed_count: truePathProofs.filter((proof) =>
      stringValue(proof.proof_status) === 'observed'
    ).length,
  };
  const sourceRefs: RuntimeTraySourceRef[] = uniqueByRef([
    sourceRef('/runtime_tray_snapshot/stage_attempt_workbench', 'stage_attempt_workbench'),
    sourceRef('/runtime_tray_snapshot/domain_projection_ingestion', 'domain_projection_ingestion'),
    sourceRef('/runtime_tray_snapshot/provider_continuous_proof', 'provider_continuous_proof'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown', 'app_operator_drilldown'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/codex_app_runtime_role', 'codex_app_runtime_role'),
    appReleaseUserPathEvidenceSourceRef(),
    sourceRef('/app-release-user-path-evidence-ledger', 'app_release_user_path_evidence_ledger'),
    sourceRef('/runtime_manager/family_runtime_queue/mas_domain_route_projection', 'runtime_manager_mas_route_support'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/route_transition_drilldown', 'route_transition_drilldown'),
    sourceRef('/family-runtime/lifecycle-index', 'family_runtime_lifecycle_index'),
    sourceRef('/external-evidence-ledger', 'external_evidence_ledger'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/production_evidence_tail_ledger', 'production_evidence_tail_ledger'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs', 'domain_evidence_request_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_owner_payload_summary_refs', 'domain_owner_payload_summary_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_legacy_cleanup_plan_refs', 'domain_legacy_cleanup_plan_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/default_caller_deletion_evidence_refs', 'default_caller_deletion_evidence_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope', 'evidence_envelope'),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/runtime_visualization_projection',
      'runtime_visualization_projection',
    ),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/standard_agent_template_consumption_refs',
      'standard_agent_template_consumption_refs',
    ),
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
    summary,
    stage_progress_log: record(input.stageAttemptWorkbench.stage_progress_log),
    attempt_true_path_proofs: truePathProofs,
    codex_app_runtime_role: appRuntimeRole,
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
    app_release_user_path_evidence: appReleaseUserPathEvidence,
    runtime_manager_route_support: runtimeManagerRouteSupport,
    route_transition_drilldown: routeTransitionDrilldownRefs,
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
    current_control_state: currentControlState,
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
    domain_owner_payload_summary_refs: domainOwnerPayloadSummaryRefs,
    domain_evidence_request_refs: evidenceRequests,
    production_evidence_tail_ledger: productionEvidenceTailLedger,
    evidence_envelope: evidenceEnvelope,
    runtime_visualization_projection: runtimeVisualizationProjection,
    runtime_workbench: record(runtimeVisualizationProjection.runtime_workbench),
    visual_ref_groups: record(runtimeVisualizationProjection.visual_ref_groups),
    domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    standard_agent_template_consumption_refs: standardAgentTemplateConsumption,
    opl_meta_agent_workbench_refs: oplMetaAgentRegistry,
    oma_sections: record(oplMetaAgentRegistry.oma_sections),
    functional_privatization_audit_summary: functionalSummary,
    functional_privatization_audit_refs: functionalAuditRefs,
    default_caller_deletion_evidence_refs: defaultCallerDeletionEvidenceRefs,
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
