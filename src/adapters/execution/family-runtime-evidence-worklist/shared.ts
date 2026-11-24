import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import { canonicalOwnerId } from '../../../authority/evidence/index.ts';
import {
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from '../../../kernel/default-caller-retirement-guard.ts';
import {
  countValue,
  firstRef,
  record,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

export const NOT_AUTHORIZED_CLAIMS = [
  'domain_truth_write',
  'domain_ready',
  'domain_ready_verdict',
  'quality_verdict',
  'artifact_authority',
  'artifact_authority_verdict',
  'memory_body_access',
  'production_ready',
  'submission_or_export_readiness_verdict',
  'domain_repo_physical_delete_authorization',
  'default_caller_delete_ready',
];

export const BLOCKED_ROUTE_STATUS_PREFIX = 'blocked_by_';

export const OPEN_WORKLIST_STATUS = 'open_safe_action_request_route_available';

export const DIAGNOSTIC_ONLY_STATUS = 'diagnostic_only';

export const DIAGNOSTIC_ONLY_ROUTE_SEMANTICS =
  'read_only_operator_diagnostic_not_safe_action_or_closeable_workorder';

export const OPEN_SAFE_ACTION_PAYLOAD_REQUIREMENT_SEMANTICS =
  'open_safe_action_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure';

export function familyRuntimeEvidenceWorklistAuthorityBoundary() {
  return {
    opl: 'evidence_worklist_derived_attention_lens_for_refs_only_safe_action_routes',
    provider: 'temporal_scheduler_and_provider_slo_receipt_owner',
    domain: 'truth_quality_artifact_domain_ready_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_authorize_artifact_or_export_verdict: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
  };
}

export function worklistOwnerId(value: unknown) {
  return typeof value === 'string' && canonicalOwnerId(value) === 'one-person-lab' ? 'opl' : value;
}

export function normalizeWorklistOwnerFields<T extends JsonRecord>(item: T): T {
  const owner = worklistOwnerId(stringValue(item.owner));
  const routeOwner = worklistOwnerId(stringValue(item.route_owner));
  const safeActionOwner = worklistOwnerId(stringValue(item.safe_action_owner));
  const evidenceRequirement = record(item.evidence_requirement);
  return {
    ...item,
    ...(owner ? { owner } : {}),
    ...(routeOwner ? { route_owner: routeOwner } : {}),
    ...(safeActionOwner ? { safe_action_owner: safeActionOwner } : {}),
    evidence_requirement: {
      ...evidenceRequirement,
      ...(owner ? { owner } : {}),
    },
  } as T;
}

export function freshnessRef(route: JsonRecord) {
  return stringValue(route.evidence_source_ref)
    ?? stringValue(route.source_ref)
    ?? firstRef(route.monitor_refs)
    ?? firstRef(route.runtime_event_refs)
    ?? firstRef(route.source_scope_refs)
    ?? stringValue(route.schedule_id)
    ?? '/runtime_tray_snapshot/app_operator_drilldown';
}

export function readOnlyExpectedRefs(route: JsonRecord) {
  return [
    ...stringList(route.expected_receipt_refs),
    ...stringList(route.missing_production_evidence),
    ...stringList(route.required_evidence_refs),
    ...stringList(route.monitor_refs),
    ...stringList(route.runtime_event_refs),
  ];
}

export function defaultCallerDeletionEvidenceCounts(worklistItems: JsonRecord[]) {
  const defaultCallerItems = worklistItems.filter((item) =>
    item.claim_scope === 'default_caller_deletion_evidence'
  );
  const defaultCallerAuditLaneItems = defaultCallerItems.filter((item) =>
    item.worklist_attention_class === 'audit_cleanup_lane'
  );
  const defaultCallerOrdinaryOpenSafeActionItems = defaultCallerItems.filter((item) =>
    item.status === 'open_safe_action_request_route_available'
    && item.ordinary_open_safe_action_attention !== false
  );
  const countActionKind = (actionKind: string) => defaultCallerItems.filter((item) =>
    item.action_kind === actionKind
  ).length;
  return {
    default_caller_deletion_evidence_item_count: defaultCallerItems.length,
    default_caller_deletion_audit_lane_item_count: defaultCallerAuditLaneItems.length,
    default_caller_deletion_cleanup_lane_item_count: defaultCallerAuditLaneItems.length,
    default_caller_deletion_open_safe_action_item_count:
      defaultCallerOrdinaryOpenSafeActionItems.length,
    default_caller_deletion_domain_owner_receipt_or_typed_blocker_missing_count:
      countActionKind('default_caller_deletion_domain_owner_receipt_or_typed_blocker_request'),
    default_caller_deletion_no_active_caller_missing_count:
      countActionKind('default_caller_deletion_no_active_caller_proof_request'),
    default_caller_deletion_no_forbidden_write_missing_count:
      countActionKind('default_caller_deletion_no_forbidden_write_proof_request'),
    default_caller_deletion_tombstone_or_provenance_missing_count:
      countActionKind('default_caller_deletion_tombstone_or_provenance_ref_request'),
    default_caller_deletion_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    default_caller_deletion_retirement_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
  };
}

export function readOnlyRouteMatchesDefaults(
  route: JsonRecord,
  input: {
    providerKind: FamilyRuntimeProviderKind;
    executorKind: 'codex_cli';
  },
) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const args = stringList(route.opl_cli_args);
  const worklistKind = actionKind.startsWith('provider_scheduler_')
    || actionKind === 'progress_first_attempt_supervision'
    || actionKind === 'stage_production_attempt_request'
    || actionKind.startsWith('stage_production_evidence_')
    || actionKind.startsWith('domain_dispatch_evidence_')
    || actionKind.startsWith('external_evidence_')
    || actionKind.startsWith('evidence_gate_')
    || actionKind.startsWith('legacy_cleanup_');
  const owner = stringValue(route.owner);
  if (!worklistKind || (owner !== 'opl' && (!owner || canonicalOwnerId(owner) !== 'one-person-lab'))) {
    return false;
  }
  if (actionKind.startsWith('provider_scheduler_')) {
    const providerIndex = args.indexOf('--provider');
    return (stringValue(route.provider_kind) ?? args[providerIndex + 1]) === input.providerKind;
  }
  if (actionKind === 'stage_production_attempt_request') {
    const providerIndex = args.indexOf('--provider');
    const executorIndex = args.indexOf('--executor-kind');
    return providerIndex >= 0
      && args[providerIndex + 1] === input.providerKind
      && executorIndex >= 0
      && args[executorIndex + 1] === input.executorKind;
  }
  return true;
}

type EvidenceEnvelopeSummary = {
  blocked_envelope_count?: unknown;
};

export function buildZeroOpenCompletionGuard(input: {
  openWorklistItemCount: number;
  evidenceEnvelopeSummary: EvidenceEnvelopeSummary;
}) {
  const blockedRefsOnlyEnvelopeCount =
    countValue(input.evidenceEnvelopeSummary.blocked_envelope_count);
  const blockedRefsOnlyAttentionRemains =
    input.openWorklistItemCount === 0 && blockedRefsOnlyEnvelopeCount > 0;
  return {
    status: blockedRefsOnlyAttentionRemains
      ? 'blocked_refs_only_attention_remains'
      : 'no_blocked_refs_only_attention',
    zero_open_worklist_item_count: input.openWorklistItemCount === 0,
    zero_open_worklist_blocked_refs_only_envelope_count: blockedRefsOnlyEnvelopeCount,
    zero_open_worklist_blocked_refs_only_attention_remains:
      blockedRefsOnlyAttentionRemains,
    zero_open_worklist_is_completion_claim: false,
    zero_open_worklist_is_domain_ready: false,
    zero_open_worklist_is_production_ready: false,
    worklist_item_is_completion_claim: false,
    can_authorize_domain_ready: false,
    can_claim_production_ready: false,
    refs_only: true,
  };
}

export function zeroOpenCompletionGuardSummaryFields(
  guard: ReturnType<typeof buildZeroOpenCompletionGuard>,
) {
  return {
    zero_open_worklist_blocked_refs_only_envelope_count:
      guard.zero_open_worklist_blocked_refs_only_envelope_count,
    zero_open_worklist_blocked_refs_only_attention_remains:
      guard.zero_open_worklist_blocked_refs_only_attention_remains,
    zero_open_worklist_is_completion_claim:
      guard.zero_open_worklist_is_completion_claim,
    zero_open_worklist_is_domain_ready:
      guard.zero_open_worklist_is_domain_ready,
    zero_open_worklist_is_production_ready:
      guard.zero_open_worklist_is_production_ready,
  };
}
