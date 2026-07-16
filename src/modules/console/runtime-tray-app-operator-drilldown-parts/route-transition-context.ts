import type { DomainManifestCatalogEntry } from '../../atlas/index.ts';
import {
  buildStandardDomainAgentSkeletonInspection,
} from '../../workspace/index.ts';
import type {
  ProviderContinuousProof,
} from '../../runway/index.ts';
import { buildDomainRouteSupportProjection } from '../../runway/index.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import { QUEUE_PROJECTION_VOCABULARY } from '../../../kernel/queue-projection-vocabulary.ts';
import {
  cleanupCommandDomainId,
  record,
  recordList,
  refsFromRecord,
  stringList,
  stringValue,
  uniqueRefs,
  uniqueRefsByValue,
} from './value-utils.ts';

export function legacyCleanupPlanRefs(
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

export function runtimeManagerRouteSupportRefs() {
  return {
    surface_kind: 'opl_app_drilldown_runtime_manager_route_support',
    source_surface: 'opl_runtime_manager.family_runtime_stage_attempt_index.domain_route_projection',
    projection_policy:
      'refs_only_supported_route_catalog_no_owner_chain_closure_or_domain_ready_claim',
    domain_route_projection: buildDomainRouteSupportProjection(),
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      can_claim_artifact_authority: false,
      can_close_owner_chain: false,
      can_record_owner_receipt: false,
      can_authorize_domain_route: false,
    },
  };
}

export function effectiveCurrentContextPacket(workbench: JsonRecord) {
  const packet = record(workbench.effective_current_context);
  if (Object.keys(packet).length > 0) {
    return packet;
  }
  return {
    surface_kind: 'opl_effective_current_context_packet',
    packet_version: 'effective_current_context.v1',
    projection_policy: 'refs_only_current_context_packet_no_domain_truth_or_ready_verdict',
    contexts: [],
    summary: {
      context_count: 0,
      running_attempt_count: 0,
      latest_closeout_count: 0,
      superseded_context_count: 0,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function familyStallLineagePacket(workbench: JsonRecord) {
  const packet = record(workbench.family_stall_lineage);
  if (Object.keys(packet).length > 0) {
    return packet;
  }
  return {
    surface_kind: 'opl_family_stall_lineage',
    packet_version: 'family-stall-lineage.v1',
    projection_policy:
      'repeated_blocker_lineage_requires_next_forced_delta_without_claiming_domain_or_production_ready',
    lineages: [],
    summary: {
      lineage_count: 0,
      repeated_lineage_count: 0,
      terminal_lineage_count: 0,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
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

export function routeTransitionDrilldown(input: {
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
    const deadLetter = record(attempt[QUEUE_PROJECTION_VOCABULARY.deadLetter]);
    return [
      ...refEntries(refsFromRecord(record(attempt.route_impact), [
        QUEUE_PROJECTION_VOCABULARY.deadLetterRef,
        QUEUE_PROJECTION_VOCABULARY.deadLetterRefs,
      ]), 'route_transition_dead_letter', attempt),
      ...(stageAttemptId && Object.keys(deadLetter).length > 0
        ? [{
          ref: `/stage_attempt_workbench/attempts/${stageAttemptId}/${QUEUE_PROJECTION_VOCABULARY.deadLetter}`,
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
    domain_route_support: record(input.runtimeManagerRouteSupport.domain_route_projection),
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
