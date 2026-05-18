import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { readFamilyRuntimeLifecycleRefs } from './family-runtime-lifecycle-index.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';

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

function providerSloRefs(providerContinuousProof: JsonRecord) {
  const loop = record(providerContinuousProof.operator_slo_repair_loop);
  const cadenceAction = record(loop.operator_cadence_action);
  const cadenceCommand = stringValue(cadenceAction.command);
  const cadenceRef = cadenceCommand
    ? {
        ref: cadenceCommand,
        role: stringValue(cadenceAction.action_kind) ?? 'provider_slo_cadence_action',
        provider_kind: stringValue(cadenceAction.provider_kind),
        execution_owner: stringValue(cadenceAction.execution_owner),
        execution_policy: stringValue(cadenceAction.execution_policy),
        dispatch_status: stringValue(cadenceAction.dispatch_status),
        can_execute: false,
      }
    : null;
  const commandRefs = cadenceRef ? [cadenceRef] : recordList(loop.operator_commands)
    .map((command) => ({
      ref: stringValue(command.command),
      role: stringValue(command.command_role) ?? 'provider_slo_operator_command',
      provider_kind: stringValue(providerContinuousProof.provider_kind),
      execution_owner: stringValue(command.execution_owner),
      execution_policy: stringValue(command.execution_policy),
      dispatch_status: null,
      can_execute: false,
    }))
    .filter((entry): entry is {
      ref: string;
      role: string;
      provider_kind: string | null;
      execution_owner: string | null;
      execution_policy: string | null;
      dispatch_status: null;
      can_execute: false;
    } => Boolean(entry.ref));

  return uniqueRefs(commandRefs);
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
    },
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

export function buildAppOperatorDrilldown(input: {
  stageAttemptWorkbench: JsonRecord;
  providerContinuousProof: JsonRecord;
  domainProjectionIngestion: JsonRecord;
  domainManifestProjects: DomainManifestCatalogEntry[];
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
  const actionRefs = operatorActionRoutingRefs(input.stageAttemptWorkbench);
  const domainRefs = domainProjectionRefs(input.domainProjectionIngestion);
  const ownerReceipts = ownerReceiptRefs(attempts, input.domainProjectionIngestion);
  const typedBlockers = typedBlockerRefs(attempts, input.domainProjectionIngestion);
  const freshness = freshnessRefs(attempts, input.domainProjectionIngestion);
  const refFamilies = refFamilyRefs(input.stageAttemptWorkbench);
  const lifecycleRefs = lifecycleLedgerRefs();
  const safeActions = safeActionRefs(actionRefs, lifecycleRefs);
  const functionalSummary = functionalPrivatizationSummary(input.domainManifestProjects);
  const sourceRefs: RuntimeTraySourceRef[] = uniqueByRef([
    sourceRef('/runtime_tray_snapshot/stage_attempt_workbench', 'stage_attempt_workbench'),
    sourceRef('/runtime_tray_snapshot/domain_projection_ingestion', 'domain_projection_ingestion'),
    sourceRef('/runtime_tray_snapshot/provider_continuous_proof', 'provider_continuous_proof'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown', 'app_operator_drilldown'),
    sourceRef('/family-runtime/lifecycle-index', 'family_runtime_lifecycle_index'),
  ]);

  return {
    surface_kind: 'opl_app_operator_drilldown_read_model',
    projection_scope: 'runtime_snapshot',
    consumer: 'one_person_lab_app_operator_workbench',
    availability:
      attempts.length > 0 || domainRefs.length > 0 || providerActionRefs.length > 0
        ? 'available'
        : 'empty',
    projection_policy: 'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
    summary: {
      stage_attempt_count: attempts.length,
      domain_projection_ref_count: domainRefs.length,
      route_graph_ref_count: routeRefs.length,
      decision_map_ref_count: decisionRefs.length,
      review_repair_queue_item_count: reviewItems.length,
      artifact_gallery_item_count: artifactRefs.length,
      package_ref_count: packageLifecycle.package_refs.length,
      export_ref_count: packageLifecycle.export_refs.length,
      memory_ref_count: memoryRefs.consumed_memory_refs.length,
      memory_writeback_ref_count: memoryRefs.writeback_receipt_refs.length,
      quality_ref_count: qualityRefs.quality_refs.length,
      readiness_ref_count: qualityRefs.readiness_refs.length,
      provider_slo_action_count: providerActionRefs.length,
      operator_action_route_count: actionRefs.length,
      opl_owned_action_route_count: actionRefs.filter((ref) => ref.owner === 'opl').length,
      provider_owned_action_route_count: actionRefs.filter((ref) => ref.owner === 'provider').length,
      domain_owned_action_route_count: actionRefs.filter((ref) => ref.owner === 'domain').length,
      user_owned_action_route_count: actionRefs.filter((ref) => ref.owner === 'user').length,
      owner_receipt_ref_count: ownerReceipts.length,
      typed_blocker_ref_count: typedBlockers.refs.length,
      typed_blocker_count: typedBlockers.blockers.length,
      freshness_signal_count: freshness.length,
      source_ref_count: refFamilies.summary.source_ref_count,
      artifact_ref_count: refFamilies.summary.artifact_ref_count,
      ref_family_memory_ref_count: refFamilies.summary.memory_ref_count,
      safe_action_ref_count: safeActions.length,
      lifecycle_index_ref_count: lifecycleRefs.summary.lifecycle_index_ref_count,
      lifecycle_restore_proof_ref_count: lifecycleRefs.summary.restore_proof_ref_count,
      lifecycle_domain_artifact_mutation_receipt_ref_count:
        lifecycleRefs.summary.domain_artifact_mutation_receipt_ref_count,
      functional_privatization_default_watchlist_count: functionalSummary.default_watchlist_count,
      functional_privatization_semantic_equivalence_review_count:
        functionalSummary.semantic_equivalence_review_count,
      functional_privatization_active_private_generic_residue_count:
        functionalSummary.active_private_generic_residue_count,
      functional_privatization_blocker_count: functionalSummary.blocker_count,
    },
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
    lifecycle_ledger_refs: lifecycleRefs,
    domain_projection_refs: {
      surface_kind: 'opl_app_drilldown_domain_projection_refs',
      refs: domainRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    functional_privatization_audit_summary: functionalSummary,
    authority_boundary: refsOnlyAuthorityBoundary(),
    source_refs: sourceRefs,
    non_goals: [
      'does_not_write_domain_truth',
      'does_not_read_or_store_memory_body',
      'does_not_read_or_mutate_artifact_body',
      'does_not_authorize_quality_readiness_or_export_verdict',
      'does_not_execute_domain_or_provider_actions',
    ],
  };
}
