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
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './runtime-tray-app-operator-drilldown-parts/authority-boundary.ts';
import {
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

function currentControlStateProjection(attempts: JsonRecord[]) {
  const states = attempts
    .map((attempt) => record(attempt.current_control_state))
    .filter((state) => Object.keys(state).length > 0);
  const blockedStates = states.filter((state) => {
    const status = stringValue(state.reconciliation_status);
    return status?.startsWith('blocked_') || stringValue(state.current_attempt_state) === 'blocked';
  });
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
      running_control_state_count: states.filter((state) =>
        stringValue(state.reconciliation_status) === 'running'
      ).length,
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
      stage_attempt_requests_create_owner_receipts: false,
      stage_attempt_requests_close_expected_receipts: false,
      stage_attempt_requests_close_monitor_freshness: false,
      app_surface_routes_are_projection_only: true,
    },
    safe_action_routes: safeActionRoutes.map((ref) => ({
      action_id: ref.action_id,
      action_kind: ref.action_kind,
      owner: ref.owner,
      route_target_kind: ref.route_target_kind,
      ...('route_status' in ref ? { route_status: ref.route_status } : {}),
      ...('route_status_detail' in ref ? { route_status_detail: ref.route_status_detail } : {}),
      ...('request_scope' in ref ? { request_scope: ref.request_scope } : {}),
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
      unobserved_expected_receipt_refs:
        'unobserved_expected_receipt_refs' in ref ? ref.unobserved_expected_receipt_refs : [],
      monitor_refs:
        'monitor_refs' in ref ? ref.monitor_refs : [],
      unobserved_monitor_refs:
        'unobserved_monitor_refs' in ref ? ref.unobserved_monitor_refs : [],
      ...('creates_domain_action' in ref
        ? { creates_domain_action: ref.creates_domain_action }
        : {}),
      ...('creates_owner_receipt' in ref
        ? { creates_owner_receipt: ref.creates_owner_receipt }
        : {}),
      ...('closes_expected_receipt_refs' in ref
        ? { closes_expected_receipt_refs: ref.closes_expected_receipt_refs }
        : {}),
      ...('closes_monitor_freshness' in ref
        ? { closes_monitor_freshness: ref.closes_monitor_freshness }
        : {}),
      execution_surface: ref.execution_surface,
      route_status: 'route_status' in ref ? ref.route_status : null,
      route_status_detail: 'route_status_detail' in ref ? ref.route_status_detail : null,
      request_scope: 'request_scope' in ref ? ref.request_scope : null,
      route_closure_policy: 'route_closure_policy' in ref ? ref.route_closure_policy : null,
      open_reason: 'open_reason' in ref ? ref.open_reason : null,
      provider_repair_action_id:
        'provider_repair_action_id' in ref ? ref.provider_repair_action_id : null,
      provider_repair_command:
        'provider_repair_command' in ref ? ref.provider_repair_command : null,
      provider_required_next_action:
        'provider_required_next_action' in ref ? ref.provider_required_next_action : null,
      provider_slo_dispatch_status:
        'provider_slo_dispatch_status' in ref ? ref.provider_slo_dispatch_status : null,
      payload_requirement: 'payload_requirement' in ref ? ref.payload_requirement : null,
      payload_owner: 'payload_owner' in ref ? ref.payload_owner : null,
      payload_template: 'payload_template' in ref ? ref.payload_template : null,
      payload_ref_hints: 'payload_ref_hints' in ref ? ref.payload_ref_hints : null,
      payload_template_policy:
        'payload_template_policy' in ref ? ref.payload_template_policy : null,
      route_requires_domain_or_app_payload:
        'route_requires_domain_or_app_payload' in ref ? ref.route_requires_domain_or_app_payload : false,
      can_close_without_domain_or_app_payload:
        'can_close_without_domain_or_app_payload' in ref ? ref.can_close_without_domain_or_app_payload : true,
      opl_generated_receipt_policy:
        'opl_generated_receipt_policy' in ref ? ref.opl_generated_receipt_policy : null,
      creates_domain_action: 'creates_domain_action' in ref ? ref.creates_domain_action : false,
      creates_owner_receipt: 'creates_owner_receipt' in ref ? ref.creates_owner_receipt : false,
      owner_receipt_refs: 'owner_receipt_refs' in ref ? ref.owner_receipt_refs : [],
      request_id: 'request_id' in ref ? ref.request_id : null,
      request_pack_id: 'request_pack_id' in ref ? ref.request_pack_id : null,
      evidence_route_kind: 'evidence_route_kind' in ref ? ref.evidence_route_kind : null,
      evidence_source_ref: 'evidence_source_ref' in ref ? ref.evidence_source_ref : null,
      dispatch_identity_key: 'dispatch_identity_key' in ref ? ref.dispatch_identity_key : null,
      dispatch_identity_fields:
        'dispatch_identity_fields' in ref ? ref.dispatch_identity_fields : {},
      default_actionability_status:
        'default_actionability_status' in ref ? ref.default_actionability_status : null,
      default_actionable: 'default_actionable' in ref ? ref.default_actionable : null,
      superseded_by_stage_attempt_id:
        'superseded_by_stage_attempt_id' in ref ? ref.superseded_by_stage_attempt_id : null,
      superseded_reason: 'superseded_reason' in ref ? ref.superseded_reason : null,
      required_evidence_refs:
        'required_evidence_refs' in ref ? ref.required_evidence_refs : [],
      required_operator_payload_refs:
        'required_operator_payload_refs' in ref ? ref.required_operator_payload_refs : [],
      required_return_shapes:
        'required_return_shapes' in ref ? ref.required_return_shapes : [],
      required_receipt_shapes:
        'required_receipt_shapes' in ref ? ref.required_receipt_shapes : [],
      typed_blocker_refs: 'typed_blocker_refs' in ref ? ref.typed_blocker_refs : [],
      closes_expected_receipt_refs:
        'closes_expected_receipt_refs' in ref ? ref.closes_expected_receipt_refs : false,
      closes_monitor_freshness:
        'closes_monitor_freshness' in ref ? ref.closes_monitor_freshness : false,
      opl_cleanup_ledger_ready:
        'opl_cleanup_ledger_ready' in ref ? ref.opl_cleanup_ledger_ready : null,
      domain_physical_delete_requires_owner_receipt:
        'domain_physical_delete_requires_owner_receipt' in ref
          ? ref.domain_physical_delete_requires_owner_receipt
          : null,
      domain_physical_delete_can_execute:
        'domain_physical_delete_can_execute' in ref ? ref.domain_physical_delete_can_execute : null,
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
      opl_cleanup_ledger_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      domain_physical_delete_requires_owner_receipt:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_requires_owner_receipt,
      domain_physical_delete_can_execute:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_can_execute,
      domain_delete_executed_by_opl: false,
      reconcile_status: lifecycleRefs.summary.lifecycle_reconcile_status,
    },
    summary: {
      safe_action_route_count: safeActionRoutes.length,
      supervised_periodic_command_count: supervisedPeriodicCommands.length,
      lifecycle_index_ref_count: lifecycleRefs.summary.lifecycle_index_ref_count,
      cleanup_apply_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      opl_cleanup_ledger_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      domain_physical_delete_requires_owner_receipt:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_requires_owner_receipt,
      domain_physical_delete_can_execute:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_can_execute,
    },
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
  providerContinuousProof: JsonRecord;
  domainProjectionIngestion: JsonRecord;
  domainManifestProjects: DomainManifestCatalogEntry[];
  detailLevel?: AppOperatorDrilldownDetailLevel;
}) {
  const attempts = recordList(input.stageAttemptWorkbench.attempts);
  const evidenceAttempts = recordList(input.stageAttemptWorkbench.evidence_attempts);
  const operatorEvidenceAttempts = evidenceAttempts.length > 0 ? evidenceAttempts : attempts;
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
  const refFamilies = refFamilyRefs(input.stageAttemptWorkbench);
  const currentControlState = currentControlStateProjection(operatorEvidenceAttempts);
  const functionalSummary = functionalPrivatizationSummary(input.domainManifestProjects);
  const functionalAuditRefs = functionalPrivatizationAuditRefs(input.domainManifestProjects);
  const defaultCallerDeletionEvidenceRefs =
    buildDefaultCallerDeletionEvidenceRefs(input.domainManifestProjects);
  const evidenceRequests = buildDomainEvidenceRequestRefs(
    input.domainManifestProjects,
    replacementCoverage,
  );
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
    ...buildAppReleaseUserPathEvidenceActionRoutes(record(appReleaseUserPathEvidence)),
    ...buildOmaProductionConsumptionActionRoutes(oplMetaAgentProductionConsumption),
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
  const executionBridge = appExecutionBridge(actionRefs, periodicRefs, lifecycleRefs);
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
      productionEvidenceTailLedger,
      legacyCleanupPlans,
      oplMetaAgentRegistry,
      standardAgentTemplateConsumption,
      evidenceEnvelope,
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
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_legacy_cleanup_plan_refs', 'domain_legacy_cleanup_plan_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/default_caller_deletion_evidence_refs', 'default_caller_deletion_evidence_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope', 'evidence_envelope'),
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
    domain_evidence_request_refs: evidenceRequests,
    production_evidence_tail_ledger: productionEvidenceTailLedger,
    evidence_envelope: evidenceEnvelope,
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
