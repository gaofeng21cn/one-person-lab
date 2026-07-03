import type { JsonRecord } from '../../../kernel/types.ts';

type TransitionBridgeAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  workspace_locator: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function transitionBridge(workspaceLocator: JsonRecord) {
  return isRecord(workspaceLocator.transition_bridge) ? workspaceLocator.transition_bridge : null;
}

function transitionEvidence(bridge: JsonRecord) {
  return isRecord(bridge.evidence) ? bridge.evidence : {};
}

function authorityBoundary() {
  return {
    opl: 'transition_bridge_refs_only_operator_projection',
    domain: 'transition_truth_quality_artifact_gate_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_authorize_domain_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

export function buildAttemptTransitionBridgeEvidence(attempt: TransitionBridgeAttempt) {
  const bridge = transitionBridge(attempt.workspace_locator);
  if (!bridge) {
    return null;
  }
  const evidence = transitionEvidence(bridge);
  const receiptRefs = uniqueStrings(stringList(evidence.receipt_refs));
  const ownerReceiptRefs = uniqueStrings(stringList(evidence.owner_receipt_refs));
  const noRegressionEvidenceRefs = uniqueStrings(stringList(evidence.no_regression_evidence_refs));
  const typedBlockerRefs = uniqueStrings(stringList(evidence.typed_blocker_refs));
  const typedBlockers = recordList(evidence.typed_blockers);
  const typedBlockerCount = optionalNumber(evidence.typed_blocker_count) ?? typedBlockers.length;

  return {
    surface_kind: 'opl_transition_bridge_evidence_projection',
    projection_scope: 'stage_attempt',
    availability: 'transition_bridge_observed',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    transition_id: optionalString(bridge.transition_id),
    transition_status: optionalString(bridge.transition_status),
    current_state: optionalString(bridge.current_state),
    next_state: optionalString(bridge.next_state),
    event: optionalString(bridge.event),
    owner_route: isRecord(bridge.owner_route) ? bridge.owner_route : null,
    domain_owner_receipt_required: optionalBoolean(bridge.domain_owner_receipt_required) ?? true,
    evidence: {
      receipt_refs: receiptRefs,
      owner_receipt_refs: ownerReceiptRefs,
      no_regression_evidence_refs: noRegressionEvidenceRefs,
      typed_blocker_refs: typedBlockerRefs,
      typed_blockers: typedBlockers,
      domain_owner_receipt_observed:
        optionalBoolean(evidence.domain_owner_receipt_observed) ?? ownerReceiptRefs.length > 0,
      no_regression_evidence_observed:
        optionalBoolean(evidence.no_regression_evidence_observed) ?? noRegressionEvidenceRefs.length > 0,
      typed_blocker_count: typedBlockerCount,
      opl_evidence_boundary:
        optionalString(evidence.opl_evidence_boundary) ?? 'refs_only_no_domain_verdict_authority',
    },
    summary: {
      receipt_ref_count: receiptRefs.length,
      owner_receipt_ref_count: ownerReceiptRefs.length,
      no_regression_evidence_ref_count: noRegressionEvidenceRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      typed_blocker_count: typedBlockerCount,
    },
    authority_boundary: authorityBoundary(),
  };
}

type TransitionBridgeEvidenceProjection = NonNullable<ReturnType<typeof buildAttemptTransitionBridgeEvidence>>;

export function buildWorkbenchTransitionBridgeEvidence(attempts: TransitionBridgeAttempt[]) {
  const projections = attempts
    .map(buildAttemptTransitionBridgeEvidence)
    .filter((projection): projection is TransitionBridgeEvidenceProjection => Boolean(projection));
  return {
    surface_kind: 'opl_transition_bridge_evidence_projection',
    projection_scope: 'stage_attempt_workbench',
    availability: projections.length > 0 ? 'transition_bridge_observed' : 'no_transition_bridge',
    attempts: projections,
    summary: {
      attempt_count: attempts.length,
      attempt_with_transition_bridge_count: projections.length,
      receipt_ref_count: projections.reduce((count, projection) => (
        count + Number(projection.summary.receipt_ref_count)
      ), 0),
      owner_receipt_ref_count: projections.reduce((count, projection) => (
        count + Number(projection.summary.owner_receipt_ref_count)
      ), 0),
      no_regression_evidence_ref_count: projections.reduce((count, projection) => (
        count + Number(projection.summary.no_regression_evidence_ref_count)
      ), 0),
      typed_blocker_ref_count: projections.reduce((count, projection) => (
        count + Number(projection.summary.typed_blocker_ref_count)
      ), 0),
      typed_blocker_count: projections.reduce((count, projection) => (
        count + Number(projection.summary.typed_blocker_count)
      ), 0),
      domain_owner_receipt_observed_attempt_count: projections.filter((projection) =>
        projection.evidence.domain_owner_receipt_observed
      ).length,
      no_regression_evidence_observed_attempt_count: projections.filter((projection) =>
        projection.evidence.no_regression_evidence_observed
      ).length,
      typed_blocker_attempt_count: projections.filter((projection) =>
        Number(projection.summary.typed_blocker_count) > 0
      ).length,
    },
    authority_boundary: authorityBoundary(),
  };
}
