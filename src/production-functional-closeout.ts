import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import { resolveManifestCommandTimeoutMs } from './domain-manifest/resolver.ts';
import { isRecord, optionalString } from './domain-manifest/shared-utils.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { buildFamilyAgentsList } from './family-domain-agent-skeleton.ts';
import { buildFamilyDomainMemoryList } from './family-domain-memory.ts';
import { buildFamilyStageListEntry, buildFamilyStagesList } from './family-stage-control-plane.ts';
import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import { buildProviderReadiness } from './production-functional-closeout-provider-readiness.ts';
import { buildProviderContinuousProof } from './family-runtime-provider-continuous-proof.ts';
import {
  listStageAttemptCloseouts,
  listStageAttemptSignals,
  listStageAttempts,
  stageAttemptSummary,
  stageAttemptToPayload,
} from './family-runtime-stage-attempts.ts';
import { familyRuntimePaths, listEvents, queueSummary } from './family-runtime-store.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import { buildWorkbenchOperatorActionRouting } from './runtime-tray-action-routing.ts';
import {
  buildWorkbenchGenericProjections,
  type StageAttemptGenericProjectionInput,
} from './runtime-tray-stage-attempt-generic-projections.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

type TypedBlocker = {
  blocker_kind: string;
  blocker_id: string;
  owner: string;
  source_surface: string;
  repair_command?: string | null;
  next_action?: string;
  timeout_ms?: number | null;
  manifest_command?: string | null;
  error_message?: string | null;
};

const PRODUCTION_CLOSEOUT_MANIFEST_COMMAND_TIMEOUT_MS = 30_000;

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function tableExists(db: DatabaseSync, tableName: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function safeReadAttemptLedger(paths: ReturnType<typeof familyRuntimePaths>) {
  if (!fs.existsSync(paths.queue_db)) {
    return {
      status: 'not_initialized' as const,
      queue: { total: 0, by_status: {} },
      stage_attempts: { total: 0, by_status: {} },
      attempts: [],
      closeouts: [],
      attempt_signals: [],
      events: [],
    };
  }

  const db = new DatabaseSync(paths.queue_db, { readOnly: true });
  try {
    const tasksReady = tableExists(db, 'tasks');
    const attemptsReady = tableExists(db, 'stage_attempts');
    const attempts = attemptsReady ? listStageAttempts(db) : [];
    return {
      status: 'readable' as const,
      queue: tasksReady ? queueSummary(db) : { total: 0, by_status: {} },
      stage_attempts: attemptsReady ? stageAttemptSummary(db) : { total: 0, by_status: {} },
      attempts,
      closeouts: attemptsReady
        ? attempts.flatMap((attempt) =>
            listStageAttemptCloseouts(db, attempt.stage_attempt_id).map((closeout) => ({
              ...closeout,
              domain_id: attempt.domain_id,
              stage_id: attempt.stage_id,
            })),
          )
        : [],
      attempt_signals: attemptsReady
        ? attempts.flatMap((attempt) =>
            listStageAttemptSignals(db, attempt.stage_attempt_id).map((signal) => ({
              ...signal,
              domain_id: attempt.domain_id,
              stage_id: attempt.stage_id,
            })),
          )
        : [],
      events: tasksReady ? listEvents(db) : [],
    };
  } finally {
    db.close();
  }
}

function contractForAttempt(attempt: ReturnType<typeof stageAttemptToPayload>) {
  return buildFamilyRuntimeControlledApplyContract({
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workspaceLocator: attempt.workspace_locator,
    routeImpact: attempt.route_impact,
  });
}

function lifecycleForAttempt(attempt: ReturnType<typeof stageAttemptToPayload>) {
  return buildFamilyRuntimeLifecyclePrimitives({
    workspaceLocator: attempt.workspace_locator,
    artifactRefs: [
      ...stringList(attempt.closeout_refs),
      ...stringList(attempt.checkpoint_refs),
    ],
  }).guarded_apply_proof;
}

function lifecycleRequestRef(value: unknown) {
  return isRecord(value) ? optionalString(value.ref) : null;
}

function lifecycleProofRefs(proofs: ReturnType<typeof lifecycleForAttempt>[]) {
  const actions = proofs.flatMap((proof) => recordList(proof.actions));
  return {
    restore_refs: uniqueStrings(
      actions
        .map((action) => lifecycleRequestRef(action.restore_ref))
        .filter((ref): ref is string => Boolean(ref)),
    ),
    domain_receipt_refs: uniqueStrings(
      actions
        .map((action) => lifecycleRequestRef(action.domain_receipt_ref))
        .filter((ref): ref is string => Boolean(ref)),
    ),
  };
}

function latestCloseoutPacketsByAttempt(
  closeouts: Array<ReturnType<typeof listStageAttemptCloseouts>[number]>,
) {
  return closeouts.reduce<Map<string, JsonRecord>>((byAttempt, closeout) => {
    byAttempt.set(closeout.stage_attempt_id, closeout.packet);
    return byAttempt;
  }, new Map());
}

function signalsByAttempt(
  signals: Array<ReturnType<typeof listStageAttemptSignals>[number]>,
) {
  return signals.reduce<Map<string, JsonRecord[]>>((byAttempt, signal) => {
    const entries = byAttempt.get(signal.stage_attempt_id) ?? [];
    entries.push(signal as JsonRecord);
    byAttempt.set(signal.stage_attempt_id, entries);
    return byAttempt;
  }, new Map());
}

function summarizeOperatorActionRouting(
  attempts: Array<ReturnType<typeof stageAttemptToPayload>>,
  closeouts: Array<ReturnType<typeof listStageAttemptCloseouts>[number]>,
  signals: Array<ReturnType<typeof listStageAttemptSignals>[number]>,
) {
  const closeoutsByAttempt = latestCloseoutPacketsByAttempt(closeouts);
  const signalEntriesByAttempt = signalsByAttempt(signals);
  return buildWorkbenchOperatorActionRouting(attempts.map((attempt) => {
    const latestCloseout = closeoutsByAttempt.get(attempt.stage_attempt_id) ?? {};
    const nextOwner = optionalString(latestCloseout.next_owner)
      ?? optionalString(attempt.route_impact.next_owner)
      ?? attempt.domain_id;
    return {
      stage_attempt_id: attempt.stage_attempt_id,
      domain_id: attempt.domain_id,
      stage_id: attempt.stage_id,
      next_owner: nextOwner,
      route_impact: attempt.route_impact,
      human_gate_refs: stringList(attempt.human_gate_refs),
      resume_ledger: signalEntriesByAttempt.get(attempt.stage_attempt_id) ?? [],
    };
  }));
}

function actionRouteRefs(
  actions: Array<{
    route_target_kind: string;
    command_or_surface_ref: string;
  }>,
  targetKind: string,
) {
  return uniqueStrings(actions
    .filter((action) => action.route_target_kind === targetKind)
    .map((action) => action.command_or_surface_ref));
}

function closeoutPacketForAttempt(
  closeoutsByAttempt: Map<string, JsonRecord>,
  stageAttemptId: string,
) {
  return closeoutsByAttempt.get(stageAttemptId) ?? {};
}

function attemptSignalPayloads(signals: JsonRecord[], signalKind: string) {
  return signals.filter((signal) => optionalString(signal.signal_kind) === signalKind);
}

function attemptHasHumanGate(
  attempt: ReturnType<typeof stageAttemptToPayload>,
  humanGateRefs: string[],
  humanGateLedger: JsonRecord[],
) {
  return attempt.status === 'human_gate' || humanGateRefs.length > 0 || humanGateLedger.length > 0;
}

function genericProjectionInputs(
  attempts: Array<ReturnType<typeof stageAttemptToPayload>>,
  closeouts: Array<ReturnType<typeof listStageAttemptCloseouts>[number]>,
  signals: Array<ReturnType<typeof listStageAttemptSignals>[number]>,
): StageAttemptGenericProjectionInput[] {
  const closeoutsByAttempt = latestCloseoutPacketsByAttempt(closeouts);
  const signalEntriesByAttempt = signalsByAttempt(signals);
  return attempts.map((attempt) => {
    const latestCloseout = closeoutPacketForAttempt(closeoutsByAttempt, attempt.stage_attempt_id);
    const routeImpact = attempt.route_impact;
    const humanGateRefs = stringList(attempt.human_gate_refs);
    const signalEntries = signalEntriesByAttempt.get(attempt.stage_attempt_id) ?? [];
    const humanGateLedger = attemptSignalPayloads(signalEntries, 'human_gate');
    const resumeLedger = attemptSignalPayloads(signalEntries, 'resume');
    const rejectedWrites = recordList(latestCloseout.rejected_writes);
    const closeoutRefs = stringList(attempt.closeout_refs);
    const consumedRefs = stringList(latestCloseout.consumed_refs);
    const writebackReceiptRefs = stringList(latestCloseout.writeback_receipt_refs);
    const nextOwner = optionalString(latestCloseout.next_owner)
      ?? optionalString(routeImpact.next_owner)
      ?? attempt.domain_id;
    return {
      stage_attempt_id: attempt.stage_attempt_id,
      domain_id: attempt.domain_id,
      stage_id: attempt.stage_id,
      next_owner: nextOwner,
      route_impact: routeImpact,
      workspace_locator: attempt.workspace_locator,
      source_fingerprint: attempt.source_fingerprint,
      checkpoint_refs: stringList(attempt.checkpoint_refs),
      closeout_refs: closeoutRefs,
      consumed_refs: consumedRefs,
      consumed_memory_refs: stringList(latestCloseout.consumed_memory_refs),
      writeback_receipt_refs: writebackReceiptRefs,
      artifact_refs: uniqueStrings([
        ...closeoutRefs,
        ...consumedRefs,
        ...writebackReceiptRefs,
      ]),
      rejected_writes: rejectedWrites,
      attention_flags: [
        attemptHasHumanGate(attempt, humanGateRefs, humanGateLedger) ? 'human_gate' : null,
        resumeLedger.length > 0 ? 'resume_available' : null,
        attempt.status === 'dead_lettered' ? 'dead_lettered' : null,
        attempt.blocked_reason ? 'blocked' : null,
        rejectedWrites.length > 0 ? 'rejected_writes' : null,
      ].filter((flag): flag is string => Boolean(flag)),
      human_gate_refs: humanGateRefs,
      human_gate_ledger: humanGateLedger,
      resume_ledger: resumeLedger,
      dead_letter: attempt.status === 'dead_lettered'
        ? {
            reason: attempt.blocked_reason,
            task: null,
          }
        : null,
      domain_ready_verdict: optionalString(latestCloseout.domain_ready_verdict)
        ?? optionalString(routeImpact.domain_ready_verdict),
      controlled_apply_contract: contractForAttempt(attempt),
      lifecycle_primitives: buildFamilyRuntimeLifecyclePrimitives({
        workspaceLocator: attempt.workspace_locator,
        artifactRefs: [
          ...closeoutRefs,
          ...consumedRefs,
          ...writebackReceiptRefs,
        ],
      }),
      current_provider_readiness: null,
    };
  });
}

function summarizeGenericProjections(
  attempts: Array<ReturnType<typeof stageAttemptToPayload>>,
  closeouts: Array<ReturnType<typeof listStageAttemptCloseouts>[number]>,
  signals: Array<ReturnType<typeof listStageAttemptSignals>[number]>,
) {
  const projections = buildWorkbenchGenericProjections(genericProjectionInputs(attempts, closeouts, signals));
  return {
    surface_kind: 'opl_stage_attempt_generic_projection_closeout_evidence',
    projection_scope: 'production_functional_closeout',
    projection_policy: 'refs_only_no_domain_truth_body_no_action_execution',
    summary: {
      artifact_gallery: projections.artifact_gallery.summary,
      route_decision_graph: projections.route_decision_graph.summary,
      review_repair_queue: projections.review_repair_queue.summary,
      quality_readiness: projections.quality_readiness.summary,
      observability_slo: projections.observability_slo.summary,
      workspace_source_intake: projections.workspace_source_intake.summary,
      memory_locator_index: projections.memory_locator_index.summary,
      package_export_lifecycle: projections.package_export_lifecycle.summary,
      action_routing: projections.action_routing.summary,
    },
    projections: {
      artifact_gallery: projections.artifact_gallery,
      route_decision_graph: projections.route_decision_graph,
      review_repair_queue: projections.review_repair_queue,
      quality_readiness: projections.quality_readiness,
      observability_slo: projections.observability_slo,
      workspace_source_intake: projections.workspace_source_intake,
      memory_locator_index: projections.memory_locator_index,
      package_export_lifecycle: projections.package_export_lifecycle,
    },
    authority_boundary: {
      can_read_domain_truth_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_source_readiness: false,
      can_authorize_package_readiness: false,
      can_authorize_export_verdict: false,
      can_execute_repair_command: false,
      can_execute_domain_action: false,
      can_execute_direct_skill: false,
      can_mutate_domain_artifact: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function closeoutMemoryRefEvidence(
  closeouts: Array<ReturnType<typeof listStageAttemptCloseouts>[number] & {
    domain_id: string;
    stage_id: string;
  }>,
  domainIds: string[],
) {
  const byDomain = domainIds.map((domainId) => {
    const domainCloseouts = closeouts.filter((closeout) => closeout.domain_id === domainId);
    return {
      domain_id: domainId,
      closeout_count: domainCloseouts.length,
      consumed_refs: uniqueStrings(domainCloseouts.flatMap((closeout) => stringList(closeout.packet.consumed_refs))),
      consumed_memory_refs: uniqueStrings(domainCloseouts.flatMap((closeout) =>
        stringList(closeout.packet.consumed_memory_refs)
      )),
      writeback_receipt_refs: uniqueStrings(domainCloseouts.flatMap((closeout) =>
        stringList(closeout.packet.writeback_receipt_refs)
      )),
      rejected_write_count: domainCloseouts.reduce(
        (count, closeout) => count + recordList(closeout.packet.rejected_writes).length,
        0,
      ),
    };
  });
  return {
    surface_kind: 'opl_stage_attempt_memory_ref_evidence',
    consumed_ref_count: uniqueStrings(closeouts.flatMap((closeout) => stringList(closeout.packet.consumed_refs))).length,
    consumed_memory_ref_count: uniqueStrings(closeouts.flatMap((closeout) =>
      stringList(closeout.packet.consumed_memory_refs)
    )).length,
    writeback_receipt_ref_count: uniqueStrings(closeouts.flatMap((closeout) =>
      stringList(closeout.packet.writeback_receipt_refs)
    )).length,
    rejected_write_count: closeouts.reduce(
      (count, closeout) => count + recordList(closeout.packet.rejected_writes).length,
      0,
    ),
    domains: byDomain,
    authority_boundary: {
      opl: 'memory_receipt_ref_projection_only',
      domain: 'memory_body_accept_reject_truth_owner',
      opl_writes_memory_body: false,
    },
  };
}

function summarizeAttemptEvidence(
  attempts: Array<ReturnType<typeof stageAttemptToPayload>>,
  closeouts: Array<ReturnType<typeof listStageAttemptCloseouts>[number] & {
    domain_id: string;
    stage_id: string;
  }>,
  signals: Array<ReturnType<typeof listStageAttemptSignals>[number] & {
    domain_id: string;
    stage_id: string;
  }>,
  domainIds: string[],
) {
  const contracts = attempts.map(contractForAttempt);
  const lifecycleProofs = attempts.map(lifecycleForAttempt);
  const lifecycleRefs = lifecycleProofRefs(lifecycleProofs);
  const memoryRefEvidence = closeoutMemoryRefEvidence(closeouts, domainIds);
  const operatorActionRouting = summarizeOperatorActionRouting(attempts, closeouts, signals);
  const genericProjections = summarizeGenericProjections(attempts, closeouts, signals);
  return {
    surface_kind: 'opl_stage_attempt_functional_closeout_evidence',
    ledger_attempt_count: attempts.length,
    closeout_packet_count: closeouts.length,
    controlled_apply_summary: {
      contract_open_count: contracts.filter((contract) => contract.contract_open).length,
      domain_receipt_observed_count: contracts.filter((contract) => contract.apply_status === 'domain_receipt_observed').length,
      no_regression_evidence_observed_count: contracts.filter((contract) => contract.apply_status === 'no_regression_evidence_observed').length,
      blocked_domain_receipt_required_count: contracts.filter((contract) => contract.apply_status === 'blocked_domain_receipt_required').length,
      no_controlled_apply_request_count: contracts.filter((contract) => contract.apply_status === 'no_controlled_apply_request').length,
    },
    lifecycle_guarded_apply_summary: {
      domain_receipt_observed_count: lifecycleProofs.filter((proof) => proof.apply_status === 'domain_receipt_observed').length,
      opl_apply_ready_count: lifecycleProofs.filter((proof) => proof.apply_status === 'opl_apply_ready').length,
      blocked_domain_receipt_required_count: lifecycleProofs.filter((proof) => proof.apply_status === 'blocked_domain_receipt_required').length,
      no_apply_requests_count: lifecycleProofs.filter((proof) => proof.apply_status === 'no_apply_requests').length,
      lifecycle_restore_ref_count: lifecycleRefs.restore_refs.length,
      lifecycle_domain_receipt_ref_count: lifecycleRefs.domain_receipt_refs.length,
      domain_writes_performed: false,
    },
    memory_ref_summary: {
      consumed_ref_count: memoryRefEvidence.consumed_ref_count,
      consumed_memory_ref_count: memoryRefEvidence.consumed_memory_ref_count,
      writeback_receipt_ref_count: memoryRefEvidence.writeback_receipt_ref_count,
      rejected_write_count: memoryRefEvidence.rejected_write_count,
      opl_writes_memory_body: false,
    },
    operator_action_routing_summary: operatorActionRouting.summary,
    generic_projection_summary: genericProjections.summary,
    generic_projections: genericProjections,
    operator_action_routing: {
      surface_kind: operatorActionRouting.surface_kind,
      routing_scope: operatorActionRouting.routing_scope,
      router_role: operatorActionRouting.router_role,
      availability: operatorActionRouting.availability,
      summary: operatorActionRouting.summary,
      actions: operatorActionRouting.actions,
      authority_boundary: operatorActionRouting.authority_boundary,
    },
    domain_breakdown: domainIds.map((domainId) => {
      const domainAttempts = attempts.filter((attempt) => attempt.domain_id === domainId);
      const domainContracts = domainAttempts.map(contractForAttempt);
      const domainLifecycleProofs = domainAttempts.map(lifecycleForAttempt);
      const domainLifecycleRefs = lifecycleProofRefs(domainLifecycleProofs);
      const domainMemory = memoryRefEvidence.domains.find((entry) => entry.domain_id === domainId);
      const domainActions = operatorActionRouting.actions.filter((action) => action.domain_id === domainId);
      return {
        domain_id: domainId,
        attempt_count: domainAttempts.length,
        closeout_packet_count: domainMemory?.closeout_count ?? 0,
        controlled_apply_statuses: domainContracts.map((contract) => contract.apply_status),
        owner_receipt_refs: domainContracts.flatMap((contract) => contract.owner_receipt_refs),
        no_regression_evidence_refs: domainContracts.flatMap((contract) => contract.no_regression_evidence_refs),
        typed_blockers: domainContracts.flatMap((contract) => contract.typed_blockers),
        lifecycle_apply_statuses: domainLifecycleProofs.map((proof) => proof.apply_status),
        lifecycle_restore_refs: domainLifecycleRefs.restore_refs,
        lifecycle_domain_receipt_refs: domainLifecycleRefs.domain_receipt_refs,
        consumed_refs: domainMemory?.consumed_refs ?? [],
        consumed_memory_refs: domainMemory?.consumed_memory_refs ?? [],
        writeback_receipt_refs: domainMemory?.writeback_receipt_refs ?? [],
        rejected_write_count: domainMemory?.rejected_write_count ?? 0,
        operator_action_route_count: domainActions.length,
        operator_action_route_refs: uniqueStrings(domainActions.map((action) => action.command_or_surface_ref)),
        operator_app_surface_route_refs: actionRouteRefs(domainActions, 'app_surface'),
        operator_provider_signal_route_refs: actionRouteRefs(domainActions, 'provider_signal'),
        operator_domain_sidecar_route_refs: actionRouteRefs(domainActions, 'domain_sidecar'),
        operator_direct_skill_route_refs: actionRouteRefs(domainActions, 'direct_skill'),
      };
    }),
    memory_ref_evidence: memoryRefEvidence,
    authority_boundary: {
      opl_writes_domain_truth: false,
      opl_writes_domain_artifact: false,
      opl_writes_domain_memory_body: false,
      opl_declares_domain_quality_verdict: false,
      opl_executes_operator_action_routes: false,
      opl_executes_generic_projection_actions: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function findByProject<T extends { project_id: string }>(items: T[], projectId: string) {
  return items.find((item) => item.project_id === projectId) ?? null;
}

function entriesByProject(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord & { project_id: string } => (
        isRecord(entry) && typeof entry.project_id === 'string'
      ))
    : [];
}

function physicalSkeletonEvidenceFromAgent(agent: JsonRecord | null) {
  const evidence = isRecord(agent?.physical_skeleton_evidence)
    ? agent.physical_skeleton_evidence
    : null;
  if (!evidence) {
    return null;
  }
  return {
    surface_kind: 'opl_domain_physical_skeleton_evidence_refs',
    status: optionalString(evidence.status) ?? 'repo_source_anchor_evidence_observed',
    evidence_refs: stringList(evidence.evidence_refs),
    evidence_surface_kind: optionalString(evidence.evidence_surface_kind),
    evidence_status: optionalString(evidence.evidence_status),
    repository_boundary: isRecord(evidence.repository_boundary) ? evidence.repository_boundary : null,
    authority_boundary: {
      opl_role: 'read_only_evidence_ref_aggregation',
      domain_role: 'repo_layout_owner',
    },
  };
}

function physicalSkeletonLegacyEvidenceObserved(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  if (optionalString(value.legacy_active_path_policy) !== 'physically_removed_or_history_tombstone_only') {
    return false;
  }
  const residue = recordList(value.legacy_active_path_residue);
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

function legacyNoActiveCallerObserved(manifest: DomainManifestCatalogEntry['manifest']) {
  const tombstone = manifest?.legacy_retirement_tombstone_proof;
  const residue = manifest?.runtime_residue_retirement;
  const physicalSkeletonFollowThrough = manifest?.physical_skeleton_follow_through;
  const activeDefaultCallers = isRecord(tombstone) ? tombstone.active_default_callers : null;
  const activePathPolicy = isRecord(residue) ? residue.active_path_policy : null;
  return {
    observed:
      (Array.isArray(activeDefaultCallers) && activeDefaultCallers.length === 0)
      || optionalString(tombstone?.status) === 'no_active_default_caller_proven'
      || optionalString(residue?.status) === 'active_path_retired'
      || (isRecord(activePathPolicy)
        && Object.values(activePathPolicy).every((value) => value === false || typeof value !== 'boolean'))
      || physicalSkeletonLegacyEvidenceObserved(physicalSkeletonFollowThrough),
    source_surface:
      tombstone
        ? 'legacy_retirement_tombstone_proof'
        : residue
          ? 'runtime_residue_retirement'
          : physicalSkeletonLegacyEvidenceObserved(physicalSkeletonFollowThrough)
            ? 'physical_skeleton_follow_through'
          : null,
    source_refs: [
      ...stringList(tombstone?.source_refs),
      ...stringList(residue?.source_refs),
      ...recordList(residue?.source_refs).flatMap((ref) => stringList([ref.ref])),
      ...stringList(physicalSkeletonFollowThrough?.source_refs),
      ...recordList(physicalSkeletonFollowThrough?.legacy_active_path_residue)
        .flatMap((entry) => stringList([entry.evidence_ref])),
    ],
  };
}

function domainProductionClosureGaps(agent: JsonRecord | null, manifest: DomainManifestCatalogEntry['manifest']) {
  const gaps = recordList(agent?.production_closure_gaps).map((gap) => ({ ...gap }));
  const legacyEvidence = legacyNoActiveCallerObserved(manifest);
  return gaps.map((gap) => {
    if (gap.gap_id === 'legacy_surface_physical_retirement' && legacyEvidence.observed) {
      return {
        ...gap,
        projection_status: 'no_active_caller_evidence_observed',
        legacy_delete_allowed: false,
        typed_blocker: {
          blocker_kind: 'legacy_physical_delete',
          blocker_id: 'legacy_physical_delete_requires_full_no_active_caller_and_provenance_proof',
          owner: 'opl_and_domain_repos',
          source_surface: legacyEvidence.source_surface,
          next_action: 'Keep physical delete blocked until full no-active-caller, replacement parity, and provenance retention proof are all present.',
        },
        evidence_refs: legacyEvidence.source_refs,
      };
    }
    return gap;
  });
}

function manifestErrorProjection(entry: DomainManifestCatalogEntry) {
  if (!entry.error) {
    return null;
  }
  const timeoutMs = typeof entry.error.timeout_ms === 'number'
    ? entry.error.timeout_ms
    : entry.status === 'command_timeout'
      ? resolveManifestCommandTimeoutMs(PRODUCTION_CLOSEOUT_MANIFEST_COMMAND_TIMEOUT_MS)
      : null;
  const suggestedTimeoutMs = timeoutMs ? Math.max(10_000, timeoutMs * 5) : null;
  return {
    code: entry.error.code,
    message: entry.error.message,
    stdout: entry.error.stdout,
    stderr: entry.error.stderr,
    timeout_ms: timeoutMs,
    manifest_command: entry.manifest_command,
    repair_command: entry.status === 'command_timeout' && suggestedTimeoutMs
      ? `OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=${suggestedTimeoutMs} opl framework production-closeout`
      : entry.manifest_command
        ? `opl domain manifests --json`
        : null,
    next_action: entry.status === 'command_timeout'
      ? 'Increase OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS for this closeout read, or optimize the domain manifest command so it returns within the production closeout budget.'
      : 'Repair the domain manifest command, then rerun `opl framework production-closeout`.',
  };
}

function buildDomainBlockers(input: {
  entry: DomainManifestCatalogEntry;
  agent: JsonRecord | null;
  memory: JsonRecord | null;
  stageDomain: JsonRecord | null;
  attemptEvidence: ReturnType<typeof summarizeAttemptEvidence>['domain_breakdown'][number] | null;
}) {
  const blockers: TypedBlocker[] = [];
  const projectId = input.entry.project_id;
  if (input.entry.status !== 'resolved') {
    const manifestError = manifestErrorProjection(input.entry);
    blockers.push({
      blocker_kind: input.entry.status === 'command_timeout'
        ? 'domain_manifest_timeout'
        : 'domain_manifest',
      blocker_id: `${projectId}:manifest_not_resolved`,
      owner: projectId,
      source_surface: 'opl_domain_manifest_catalog',
      repair_command: manifestError?.repair_command,
      timeout_ms: manifestError?.timeout_ms,
      manifest_command: manifestError?.manifest_command,
      error_message: manifestError?.message,
      next_action: manifestError?.next_action ?? 'Bind a domain workspace with a valid manifest command.',
    });
    return blockers;
  }
  if (input.agent?.skeleton_status !== 'aligned') {
    blockers.push({
      blocker_kind: 'domain_skeleton',
      blocker_id: `${projectId}:standard_skeleton_not_aligned`,
      owner: projectId,
      source_surface: 'opl_standard_domain_agent_skeleton_index',
      next_action: 'Expose aligned agent/contracts/runtime/docs skeleton refs without artifact blobs.',
    });
  }
  if (input.stageDomain?.ready !== true) {
    blockers.push({
      blocker_kind: 'domain_stage_plane',
      blocker_id: `${projectId}:stage_control_plane_missing`,
      owner: projectId,
      source_surface: 'opl_family_stage_control_plane_index',
      next_action: 'Expose the domain-owned family_stage_control_plane descriptor.',
    });
  }
  if (input.memory?.ready !== true) {
    blockers.push({
      blocker_kind: 'domain_memory',
      blocker_id: `${projectId}:domain_memory_descriptor_missing`,
      owner: projectId,
      source_surface: 'opl_family_domain_memory_index',
      next_action: 'Expose domain-owned memory locator and receipt refs.',
    });
  }
  if (!input.entry.manifest?.owner_receipt_contract && !input.entry.manifest?.domain_owner_receipt_contract) {
    blockers.push({
      blocker_kind: 'domain_owner_receipt',
      blocker_id: `${projectId}:owner_receipt_contract_not_declared`,
      owner: projectId,
      source_surface: 'domain_product_entry_manifest',
      next_action: 'Declare the domain owner receipt envelope or return typed blocker refs.',
    });
  }
  if (!legacyNoActiveCallerObserved(input.entry.manifest).observed) {
    blockers.push({
      blocker_kind: 'legacy_retirement',
      blocker_id: `${projectId}:legacy_tombstone_proof_not_declared`,
      owner: projectId,
      source_surface: 'domain_product_entry_manifest',
      next_action: 'Publish no-active-default-caller proof or keep legacy residue in history/reference context.',
    });
  }
  if (!input.attemptEvidence || input.attemptEvidence.attempt_count === 0) {
    blockers.push({
      blocker_kind: 'provider_hosted_soak',
      blocker_id: `${projectId}:no_stage_attempt_evidence_in_opl_ledger`,
      owner: projectId,
      source_surface: 'opl_family_runtime_stage_attempt_ledger',
      next_action: 'Run an OPL provider-hosted attempt and return domain receipt, no-regression evidence, or typed blocker.',
    });
  }
  return blockers;
}

function buildDomainCloseoutEntries(input: {
  catalog: ReturnType<typeof buildDomainManifestCatalog>;
  agents: ReturnType<typeof buildFamilyAgentsList>['family_agents'];
  memories: ReturnType<typeof buildFamilyDomainMemoryList>['family_domain_memory'];
  stages: ReturnType<typeof buildFamilyStagesList>['family_stages'];
  attemptEvidence: ReturnType<typeof summarizeAttemptEvidence>;
}) {
  const agentEntries = entriesByProject(input.agents.agents);
  const memoryEntries = entriesByProject(input.memories.memories);
  const stageDomainEntries = entriesByProject(input.stages.domains);
  return input.catalog.domain_manifests.projects.map((entry) => {
    const agent = findByProject(agentEntries, entry.project_id);
    const memory = findByProject(memoryEntries, entry.project_id);
    const stageDomain = findByProject(stageDomainEntries, entry.project_id);
    const attemptEvidence = input.attemptEvidence.domain_breakdown.find((item) => item.domain_id === entry.project_id) ?? null;
    const manifest = entry.manifest;
    const lifecycleFromManifest = manifest
      ? manifest.lifecycle_guarded_apply_proof ?? buildFamilyRuntimeLifecyclePrimitives({
          workspaceLocator: {
            ...manifest.workspace_locator,
            lifecycle_apply_requests: manifest.lifecycle_apply_requests,
          },
        }).guarded_apply_proof
      : null;
    return {
      project_id: entry.project_id,
      project: entry.project,
      manifest_status: entry.status,
      manifest_error: manifestErrorProjection(entry),
      descriptor_status: agent?.descriptor_readiness && isRecord(agent.descriptor_readiness)
        ? optionalString(agent.descriptor_readiness.status)
        : null,
      skeleton_status: optionalString(agent?.skeleton_status),
      physical_skeleton_status: agent?.physical_skeleton_layout_audit && isRecord(agent.physical_skeleton_layout_audit)
        ? optionalString(agent.physical_skeleton_layout_audit.status)
        : null,
      physical_skeleton_evidence: physicalSkeletonEvidenceFromAgent(agent),
      physical_skeleton_follow_through_gate: isRecord(agent?.physical_skeleton_follow_through_gate)
        ? agent.physical_skeleton_follow_through_gate
        : null,
      production_closure_gaps: domainProductionClosureGaps(agent, manifest),
      stage_plane_ready: stageDomain?.ready === true,
      memory_descriptor_ready: memory?.ready === true,
      owner_receipt_contract_declared: Boolean(
        manifest?.owner_receipt_contract ?? manifest?.domain_owner_receipt_contract,
      ),
      managed_temporal_state_consistency_declared: Boolean(manifest?.managed_temporal_state_consistency),
      lifecycle_guarded_apply: lifecycleFromManifest,
      legacy_retirement_tombstone_declared: legacyNoActiveCallerObserved(manifest).observed,
      stage_attempt_evidence: attemptEvidence,
      typed_blockers: buildDomainBlockers({
        entry,
        agent,
        memory,
        stageDomain,
        attemptEvidence,
      }),
      authority_boundary: {
        opl: 'descriptor_attempt_receipt_locator_projection_only',
        domain: 'truth_quality_artifact_memory_owner',
      },
    };
  });
}

function buildGlobalBlockers(input: {
  providerReadiness: Awaited<ReturnType<typeof buildProviderReadiness>>;
  providerContinuousProof: ReturnType<typeof buildProviderContinuousProof>;
  domainEntries: ReturnType<typeof buildDomainCloseoutEntries>;
  attemptEvidence: ReturnType<typeof summarizeAttemptEvidence>;
}) {
  const blockers: TypedBlocker[] = [];
  if (input.providerReadiness.typed_blocker) {
    blockers.push(input.providerReadiness.typed_blocker);
  }
  if (input.providerContinuousProof.continuous_proof_status !== 'all_observed_proofs_proven') {
    blockers.push({
      blocker_kind: 'temporal_provider_slo',
      blocker_id: 'temporal_provider_continuous_proof_not_proven',
      owner: 'opl_provider_runtime',
      source_surface: 'opl_temporal_provider_continuous_proof_projection',
      repair_command: 'opl family-runtime residency proof --provider temporal --production',
      next_action: input.providerContinuousProof.required_next_action,
    });
  }
  if (
    input.providerContinuousProof.continuous_proof_status === 'all_observed_proofs_proven'
    && input.providerContinuousProof.proof_slo_status !== 'proof_fresh'
  ) {
    blockers.push({
      blocker_kind: 'temporal_provider_slo',
      blocker_id: 'temporal_provider_proof_freshness_not_current',
      owner: 'opl_provider_runtime',
      source_surface: 'opl_temporal_provider_continuous_proof_projection',
      repair_command: 'opl family-runtime residency proof --provider temporal --production',
      next_action: input.providerContinuousProof.required_next_action,
    });
  }
  blockers.push(...input.domainEntries.flatMap((entry) => entry.typed_blockers));
  if (input.attemptEvidence.controlled_apply_summary.blocked_domain_receipt_required_count > 0) {
    blockers.push({
      blocker_kind: 'controlled_apply',
      blocker_id: 'controlled_apply_domain_receipt_or_no_regression_required',
      owner: 'domain_agents',
      source_surface: 'family_runtime_controlled_apply_contract',
      next_action: 'Return domain owner receipt refs, no-regression evidence refs, or typed blocker refs.',
    });
  }
  if (input.attemptEvidence.lifecycle_guarded_apply_summary.blocked_domain_receipt_required_count > 0) {
    blockers.push({
      blocker_kind: 'lifecycle_apply',
      blocker_id: 'domain_lifecycle_receipt_required',
      owner: 'domain_agents',
      source_surface: 'family_runtime_lifecycle_guarded_apply_proof',
      next_action: 'Return domain lifecycle receipt refs for cleanup/restore/retention that mutates domain-owned artifacts.',
    });
  }
  return blockers;
}

export async function buildProductionFunctionalCloseout(contracts: FrameworkContracts) {
  const paths = familyRuntimePaths();
  const domainIds = contracts.domains.domains.map((domain) => domain.domain_id);
  const manifestCatalogOptions = {
    manifestCommandTimeoutMs: PRODUCTION_CLOSEOUT_MANIFEST_COMMAND_TIMEOUT_MS,
  };
  const catalog = buildDomainManifestCatalog(contracts, manifestCatalogOptions);
  const sharedManifestCatalogOptions = {
    ...manifestCatalogOptions,
    domainManifests: catalog.domain_manifests,
  };
  const agents = buildFamilyAgentsList(contracts, sharedManifestCatalogOptions).family_agents;
  const memories = buildFamilyDomainMemoryList(contracts, sharedManifestCatalogOptions).family_domain_memory;
  const stages = buildFamilyStagesList(contracts, sharedManifestCatalogOptions).family_stages;
  const providerReadiness = await buildProviderReadiness(paths);
  const ledger = safeReadAttemptLedger(paths);
  const attemptEvidence = summarizeAttemptEvidence(
    ledger.attempts,
    ledger.closeouts,
    ledger.attempt_signals,
    domainIds,
  );
  const continuousProof = buildProviderContinuousProof(ledger.events);
  const domainEntries = buildDomainCloseoutEntries({
    catalog,
    agents,
    memories,
    stages,
    attemptEvidence,
  });
  const blockers = buildGlobalBlockers({
    providerReadiness,
    providerContinuousProof: continuousProof,
    domainEntries,
    attemptEvidence,
  });
  return {
    version: 'g2',
    production_functional_closeout: {
      surface_kind: 'opl_production_functional_closeout_gate',
      status: blockers.length === 0 ? 'functional_closure_ready_for_live_soak' : 'usable_with_typed_blockers',
      proof_mode: 'read_only_no_long_running_soak',
      scope: [
        'provider_readiness',
        'domain_descriptor_alignment',
        'owner_receipt_contract',
        'domain_memory_receipt_projection',
        'lifecycle_guarded_apply',
        'physical_skeleton_layout',
        'legacy_tombstone',
        'stage_attempt_evidence',
      ],
      summary: {
        domain_count: domainEntries.length,
        resolved_manifest_count: catalog.domain_manifests.summary.resolved_count,
        descriptor_aligned_count: agents.summary.descriptor_aligned_count,
        physical_skeleton_evidence_observed_count: agents.summary.physical_skeleton_evidence_observed_count,
        physical_skeleton_audit_pending_count: agents.summary.physical_skeleton_audit_pending_count,
        resolved_stage_plane_count: stages.summary.resolved_planes_count,
        resolved_memory_descriptor_count: memories.summary.resolved_memory_descriptor_count,
        provider_ready: providerReadiness.production_provider_ready,
        typed_blocker_count: blockers.length,
        live_soak_excluded: true,
      },
      provider_readiness: providerReadiness,
      provider_continuous_proof: continuousProof,
      domain_manifests: catalog.domain_manifests.summary,
      descriptor_alignment: agents.summary,
      stage_plane: stages.summary,
      domain_memory: memories.summary,
      runtime_ledger: {
        state_dir: paths.state_dir,
        runtime_dir: paths.root,
        queue_db: paths.queue_db,
        ledger_status: ledger.status,
        queue: ledger.queue,
        stage_attempts: ledger.stage_attempts,
        provider_continuous_proof: {
          surface_kind: continuousProof.surface_kind,
          provider_kind: continuousProof.provider_kind,
          proof_event_count: continuousProof.proof_event_count,
          proven_event_count: continuousProof.proven_event_count,
          latest_event_id: continuousProof.latest_event_id,
          latest_event_created_at: continuousProof.latest_event_created_at,
          latest_event_age_seconds: continuousProof.latest_event_age_seconds,
          max_proof_age_seconds: continuousProof.max_proof_age_seconds,
          proof_freshness_status: continuousProof.proof_freshness_status,
          latest_closeout_status: continuousProof.latest_closeout_status,
          slo_execution_receipt_event_count: continuousProof.slo_execution_receipt_event_count,
          latest_slo_execution_event_created_at: continuousProof.latest_slo_execution_event_created_at,
          continuous_proof_status: continuousProof.continuous_proof_status,
          proof_slo_status: continuousProof.proof_slo_status,
          operator_slo_repair_loop: continuousProof.operator_slo_repair_loop,
          authority_boundary: continuousProof.authority_boundary,
        },
      },
      stage_attempt_evidence: attemptEvidence,
      domains: domainEntries,
      typed_blockers: blockers,
      authority_boundary: {
        opl: 'framework_readiness_attempt_receipt_locator_projection_only',
        domain_agents: 'truth_quality_artifact_memory_lifecycle_owner',
        opl_writes_domain_truth: false,
        opl_writes_domain_artifact: false,
        opl_writes_domain_memory_body: false,
        opl_declares_paper_grant_visual_success: false,
      },
    },
  };
}
