import type { DomainManifestCatalogEntry } from '../../atlas/index.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildFamilyStageConformanceReview,
} from '../../stagecraft/index.ts';
import {
  buildFamilyStageCohortLoopProjection,
} from '../../stagecraft/index.ts';
import {
  buildFamilyStageProofBundle,
} from '../../stagecraft/index.ts';
import {
  listExternalEvidenceReceipts,
} from '../../ledger/index.ts';
import type { FamilyStageSurfaceRef } from '../../stagecraft/index.ts';
import {
  familyRuntimeCommandDomainId,
  stageProductionEvidenceRequestId,
} from './stage-production-evidence-route-common.ts';

type StageProductionEvidenceStatus =
  | 'production_caller_evidence_observed'
  | 'stage_pack_ready_waiting_for_production_caller'
  | 'stage_pack_blocked';

type StageProductionEvidenceObligationId =
  | 'production_caller'
  | 'selected_executor_binding'
  | 'expected_receipt'
  | 'monitor_freshness'
  | 'source_scope'
  | 'runtime_event';

type StageProductionEvidenceObligationStatus =
  | 'closed_by_observed_evidence'
  | 'blocked_by_domain_owned_typed_blocker'
  | 'open';

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function looksLikeDeclaredObligationRef(ref: string) {
  return ref === 'owner_receipt'
    || ref === 'monitor_freshness'
    || ref === 'no_regression'
    || ref === 'typed_blocker'
    || ref === 'domain_receipt'
    || ref.startsWith('owner_receipt:')
    || ref.startsWith('monitor_freshness:')
    || ref.startsWith('no_regression:')
    || ref.startsWith('typed_blocker:')
    || ref.startsWith('domain_receipt:');
}

function concreteRefs(refs: string[]) {
  return refs.filter((ref) => !looksLikeDeclaredObligationRef(ref));
}

function observedExpectedRefs(input: {
  expectedRefs: string[];
  observedRefs: string[];
}) {
  const concreteExpectedRefs = concreteRefs(input.expectedRefs);
  const declaredObligationRefs = input.expectedRefs.filter(looksLikeDeclaredObligationRef);
  const concreteObservedRefs = concreteRefs(input.observedRefs);
  return uniqueStrings([
    ...concreteExpectedRefs.filter((ref) => input.observedRefs.includes(ref)),
    ...(declaredObligationRefs.length > 0 && concreteObservedRefs.length > 0
      ? concreteObservedRefs
      : []),
  ]);
}

function unobservedExpectedRefs(input: {
  expectedRefs: string[];
  observedRefs: string[];
}) {
  const concreteExpectedRefs = concreteRefs(input.expectedRefs);
  const declaredObligationRefs = input.expectedRefs.filter(looksLikeDeclaredObligationRef);
  const concreteObservedRefs = concreteRefs(input.observedRefs);
  return uniqueStrings([
    ...concreteExpectedRefs.filter((ref) => !input.observedRefs.includes(ref)),
    ...(declaredObligationRefs.length > 0 && concreteObservedRefs.length === 0
      ? declaredObligationRefs
      : []),
  ]);
}

function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    return typeof entry === 'string' ? [entry] : stringList(entry);
  }));
}

function refValues(refs: FamilyStageSurfaceRef[] | undefined) {
  return uniqueStrings((refs ?? []).flatMap((ref) => (
    Array.isArray(ref.ref)
      ? ref.ref
      : [ref.ref]
  )).filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0));
}

function attemptLaunchInvocation(attempt: JsonRecord) {
  return record(attempt.launch_invocation);
}

function attemptSourceRefs(attempt: JsonRecord) {
  const workspaceLocator = record(attempt.workspace_locator);
  return uniqueStrings([
    ...stringList(workspaceLocator.source_refs),
    ...(stringValue(attempt.source_fingerprint)
      ? [`source_fingerprint:${stringValue(attempt.source_fingerprint)}`]
      : []),
  ]);
}

function transitionEvidence(attempt: JsonRecord) {
  return record(record(attempt.transition_bridge_evidence).evidence);
}

function attemptRef(attempt: JsonRecord) {
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  return stageAttemptId ? `opl://stage_attempts/${stageAttemptId}` : null;
}

function attemptDomainTypedBlockerRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const controlled = record(attempt.controlled_apply_contract);
  const transition = transitionEvidence(attempt);
  return uniqueStrings([
    ...refsFromRecord(routeImpact, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refsFromRecord(controlled, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refsFromRecord(transition, ['typed_blocker_ref', 'typed_blocker_refs']),
  ]);
}

function attemptReviewerReceiptRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const controlled = record(attempt.controlled_apply_contract);
  const transition = transitionEvidence(attempt);
  const launchInvocation = attemptLaunchInvocation(attempt);
  return uniqueStrings([
    ...refsFromRecord(attempt, ['reviewer_receipt_ref', 'reviewer_receipt_refs']),
    ...refsFromRecord(attempt, ['independent_review_receipt_ref', 'independent_review_receipt_refs']),
    ...refsFromRecord(routeImpact, ['reviewer_receipt_ref', 'reviewer_receipt_refs']),
    ...refsFromRecord(routeImpact, ['independent_review_receipt_ref', 'independent_review_receipt_refs']),
    ...refsFromRecord(controlled, ['reviewer_receipt_ref', 'reviewer_receipt_refs']),
    ...refsFromRecord(transition, ['reviewer_receipt_ref', 'reviewer_receipt_refs']),
    ...refsFromRecord(launchInvocation, ['reviewer_receipt_ref', 'reviewer_receipt_refs']),
  ]);
}

function attemptGateReceiptRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const controlled = record(attempt.controlled_apply_contract);
  const transition = transitionEvidence(attempt);
  const launchInvocation = attemptLaunchInvocation(attempt);
  return uniqueStrings([
    ...refsFromRecord(attempt, ['gate_receipt_ref', 'gate_receipt_refs']),
    ...refsFromRecord(attempt, ['independent_gate_receipt_ref', 'independent_gate_receipt_refs']),
    ...refsFromRecord(routeImpact, ['gate_receipt_ref', 'gate_receipt_refs']),
    ...refsFromRecord(routeImpact, ['independent_gate_receipt_ref', 'independent_gate_receipt_refs']),
    ...refsFromRecord(controlled, ['gate_receipt_ref', 'gate_receipt_refs']),
    ...refsFromRecord(transition, ['gate_receipt_ref', 'gate_receipt_refs']),
    ...refsFromRecord(launchInvocation, ['gate_receipt_ref', 'gate_receipt_refs']),
  ]);
}

function attemptDomainTypedBlockerCount(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const controlled = record(attempt.controlled_apply_contract);
  const transition = transitionEvidence(attempt);
  return attemptDomainTypedBlockerRefs(attempt).length
    + recordList(routeImpact.typed_blockers).length
    + recordList(controlled.typed_blockers).length
    + recordList(transition.typed_blockers).length
    + Number(transition.typed_blocker_count ?? 0);
}

function attemptObservedRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const controlled = record(attempt.controlled_apply_contract);
  const launchInvocation = attemptLaunchInvocation(attempt);
  const launchRefs = record(launchInvocation.launch_refs);
  return uniqueStrings([
    ...attemptSourceRefs(attempt),
    ...stringList(attempt.consumed_refs),
    ...stringList(attempt.consumed_memory_refs),
    ...stringList(attempt.writeback_receipt_refs),
    ...stringList(attempt.closeout_refs),
    ...stringList(attempt.artifact_refs),
    ...stringList(controlled.owner_receipt_refs),
    ...stringList(controlled.no_regression_evidence_refs),
    ...stringList(routeImpact.owner_receipt_refs),
    ...stringList(routeImpact.no_regression_evidence_refs),
    ...stringList(routeImpact.typed_blocker_refs),
    ...Object.values(launchRefs).flatMap((value) => typeof value === 'string' ? [value] : []),
  ]);
}

function attemptExpectedReceiptObservedRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const controlled = record(attempt.controlled_apply_contract);
  const transition = transitionEvidence(attempt);
  const launchInvocation = attemptLaunchInvocation(attempt);
  return uniqueStrings([
    ...stringList(attempt.closeout_refs),
    ...stringList(controlled.owner_receipt_refs),
    ...stringList(routeImpact.owner_receipt_refs),
    ...refsFromRecord(transition, ['owner_receipt_ref', 'owner_receipt_refs']),
    ...refsFromRecord(launchInvocation, ['owner_receipt_ref', 'owner_receipt_refs']),
    ...attemptReviewerReceiptRefs(attempt),
    ...attemptGateReceiptRefs(attempt),
  ]);
}

function stageEvidenceReceipts(input: {
  targetDomainId: string | null;
  projectId: string | null;
  stageId: string;
}) {
  const commandDomainId = familyRuntimeCommandDomainId(input.targetDomainId, input.projectId);
  if (!commandDomainId) {
    return [];
  }
  return listExternalEvidenceReceipts({
    domain_id: commandDomainId,
    request_id: stageProductionEvidenceRequestId(commandDomainId, input.stageId),
  });
}

function receiptRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .flatMap((receipt) => [
    receipt.receipt_ref,
    ...receipt.receipt_refs,
    ...receipt.evidence_refs,
    ...receipt.no_regression_refs,
    ...receipt.owner_chain_refs,
    ...receipt.source_scope_refs,
    ...receipt.runtime_event_refs,
  ]));
}

function recordedReceiptRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'recorded')
    .map((receipt) => receipt.receipt_ref));
}

function domainReceiptRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .flatMap((receipt) => receipt.receipt_refs));
}

function evidenceRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .flatMap((receipt) => receipt.evidence_refs));
}

function sourceScopeRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .flatMap((receipt) => receipt.source_scope_refs));
}

function runtimeEventRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .flatMap((receipt) => receipt.runtime_event_refs));
}

function typedBlockerRefsForStageEvidence(receipts: ReturnType<typeof stageEvidenceReceipts>) {
  return uniqueStrings(receipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .flatMap((receipt) => receipt.typed_blocker_refs));
}

function attemptExecutorKind(attempt: JsonRecord) {
  return stringValue(attempt.executor_kind)
    ?? stringValue(attemptLaunchInvocation(attempt).selected_executor_kind);
}

function executorEnvelope(selectedExecutorKinds: string[]) {
  const nonDefaultExecutorKinds = selectedExecutorKinds.filter((kind) => kind !== 'codex_cli');
  return {
    surface_kind: 'opl_stage_executor_envelope',
    default_executor_kind: 'codex_cli',
    default_quality_path: 'codex_cli',
    selected_executor_kinds: selectedExecutorKinds,
    codex_cli_default_quality_path_observed: selectedExecutorKinds.includes('codex_cli'),
    non_default_executor_kinds: nonDefaultExecutorKinds,
    non_default_adapter_receipt_only: nonDefaultExecutorKinds.length > 0,
    non_default_receipt_policy: 'adapter_receipt_only_no_reasoning_tool_resume_or_quality_equivalence',
    reasoning_equivalence_claim: false,
    tool_semantics_equivalence_claim: false,
    resume_equivalence_claim: false,
    quality_equivalence_claim: false,
    authority_boundary: {
      codex_cli: 'default_quality_path',
      non_default_executor: 'adapter_receipt_only',
      can_claim_reasoning_equivalence: false,
      can_claim_tool_semantics_equivalence: false,
      can_claim_resume_equivalence: false,
      can_claim_quality_equivalence: false,
    },
  };
}

function evidenceObligation(input: {
  obligationId: StageProductionEvidenceObligationId;
  required: boolean;
  observedRefs: string[];
  unobservedRefs: string[];
  domainOwnedTypedBlockerRefs: string[];
  domainOwnedTypedBlockerCount: number;
}) {
  const unobservedRefs = uniqueStrings(input.required ? input.unobservedRefs : []);
  const observedRefs = uniqueStrings(input.observedRefs);
  const domainOwnedTypedBlockerRefs = uniqueStrings(input.domainOwnedTypedBlockerRefs);
  const status: StageProductionEvidenceObligationStatus =
    !input.required || unobservedRefs.length === 0
      ? 'closed_by_observed_evidence'
      : domainOwnedTypedBlockerRefs.length > 0 || input.domainOwnedTypedBlockerCount > 0
        ? 'blocked_by_domain_owned_typed_blocker'
        : 'open';
  return {
    obligation_id: input.obligationId,
    required: input.required,
    status,
    observed_refs: observedRefs,
    unobserved_refs: unobservedRefs,
    domain_owned_typed_blocker_refs: domainOwnedTypedBlockerRefs,
    domain_owned_typed_blocker_count: input.domainOwnedTypedBlockerCount,
    resolution_policy:
      'close_with_observed_refs_or_domain_owned_typed_blocker_without_domain_truth_or_quality_verdict',
  };
}

function obligationSummary(obligations: ReturnType<typeof evidenceObligation>[]) {
  return {
    obligation_count: obligations.length,
    closed_count: obligations.filter((obligation) =>
      obligation.status === 'closed_by_observed_evidence'
    ).length,
    open_count: obligations.filter((obligation) =>
      obligation.status === 'open'
    ).length,
    blocked_by_domain_typed_blocker_count: obligations.filter((obligation) =>
      obligation.status === 'blocked_by_domain_owned_typed_blocker'
    ).length,
  };
}

function productionEvidenceStatus(input: {
  conformanceStatus: string;
  hasAttempt: boolean;
  observedRefCount: number;
}): StageProductionEvidenceStatus {
  if (input.hasAttempt && input.observedRefCount > 0) {
    return 'production_caller_evidence_observed';
  }
  return input.conformanceStatus === 'conformant'
    ? 'stage_pack_ready_waiting_for_production_caller'
    : 'stage_pack_blocked';
}

function stageProductionEvidence(
  project: DomainManifestCatalogEntry,
  attempts: JsonRecord[],
) {
  const manifest = project.status === 'resolved' ? project.manifest : null;
  const plane = manifest?.family_stage_control_plane ?? null;
  if (!plane) {
    return null;
  }
  const conformance = buildFamilyStageConformanceReview(plane, manifest);
  const conformanceByStage = new Map(conformance.stage_results.map((stage) => [stage.stage_id, stage]));
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: manifest?.family_action_catalog ?? null,
    conformanceReview: conformance,
  });
  const cohortLoop = buildFamilyStageCohortLoopProjection(plane);
  const cohortByStage = new Map(cohortLoop.stages.map((stage) => [stage.stage_id, stage]));
  const expectedReceiptRefsByStage = new Map<string, string[]>();
  for (const receipt of proofBundle.expected_receipt_refs) {
    const refs = expectedReceiptRefsByStage.get(receipt.stage_id) ?? [];
    refs.push(receipt.ref);
    expectedReceiptRefsByStage.set(receipt.stage_id, uniqueStrings(refs));
  }
  const runtimeEventsByStage = new Map(proofBundle.runtime_event_requirements.map((requirement) => [
    requirement.stage_id,
    requirement,
  ]));
  const commandDomainId = familyRuntimeCommandDomainId(plane.target_domain_id, project.project_id);
  const attemptsByStage = new Map<string, JsonRecord[]>();
  for (const attempt of attempts) {
    const attemptDomainId = stringValue(attempt.domain_id);
    if (attemptDomainId !== plane.target_domain_id
      && attemptDomainId !== project.project_id
      && attemptDomainId !== commandDomainId) {
      continue;
    }
    const stageId = stringValue(attempt.stage_id);
    if (!stageId) {
      continue;
    }
    const stageAttempts = attemptsByStage.get(stageId) ?? [];
    stageAttempts.push(attempt);
    attemptsByStage.set(stageId, stageAttempts);
  }

  const stages = plane.stages.map((stage) => {
    const stageAttempts = attemptsByStage.get(stage.stage_id) ?? [];
    const externalStageEvidenceReceipts = stageEvidenceReceipts({
      targetDomainId: plane.target_domain_id,
      projectId: project.project_id,
      stageId: stage.stage_id,
    });
    const stageEvidenceReceiptStatus = externalStageEvidenceReceipts.some((receipt) =>
      receipt.receipt_status === 'verified'
    )
      ? 'verified'
      : externalStageEvidenceReceipts.length > 0
        ? 'recorded'
        : 'missing';
    const recordedStageEvidenceReceiptRefs = recordedReceiptRefsForStageEvidence(externalStageEvidenceReceipts);
    const externalStageEvidenceRefs = receiptRefsForStageEvidence(externalStageEvidenceReceipts);
    const externalStageTypedBlockerRefs = typedBlockerRefsForStageEvidence(externalStageEvidenceReceipts);
    const observedRefs = uniqueStrings(stageAttempts.flatMap(attemptObservedRefs));
    const allObservedRefs = uniqueStrings([
      ...observedRefs,
      ...externalStageEvidenceRefs,
    ]);
    const stageAttemptRefs = uniqueStrings(stageAttempts
      .map(attemptRef)
      .filter((ref): ref is string => Boolean(ref)));
    const stageAttemptStatuses = uniqueStrings(stageAttempts
      .map((attempt) => stringValue(attempt.status))
      .filter((status): status is string => Boolean(status)));
    const domainOwnedTypedBlockerRefs = uniqueStrings([
      ...stageAttempts.flatMap(attemptDomainTypedBlockerRefs),
      ...externalStageTypedBlockerRefs,
    ]);
    const reviewerReceiptRefs = uniqueStrings(stageAttempts.flatMap(attemptReviewerReceiptRefs));
    const gateReceiptRefs = uniqueStrings(stageAttempts.flatMap(attemptGateReceiptRefs));
    const domainOwnedTypedBlockerCount = stageAttempts.reduce(
      (count, attempt) => count + attemptDomainTypedBlockerCount(attempt),
      0,
    ) + externalStageTypedBlockerRefs.length;
    const launchInvocations = stageAttempts
      .map(attemptLaunchInvocation)
      .filter((invocation) => Object.keys(invocation).length > 0);
    const selectedExecutorKinds = uniqueStrings(stageAttempts
      .map(attemptExecutorKind)
      .filter((kind): kind is string => Boolean(kind)));
    const executorBindingRefs = uniqueStrings(launchInvocations
      .map((invocation) => stringValue(invocation.executor_binding_ref))
      .filter((ref): ref is string => Boolean(ref)));
    const defaultExecutorAttemptCount = launchInvocations.filter((invocation) =>
      invocation.default_executor === true
      || stringValue(invocation.executor_binding_status) === 'default_codex_cli'
    ).length;
    const nonDefaultExecutorAttemptCount = stageAttempts.filter((attempt) => {
      const executorKind = attemptExecutorKind(attempt);
      return executorKind !== null && executorKind !== 'codex_cli';
    }).length;
    const runtimeRequirement = runtimeEventsByStage.get(stage.stage_id);
    const cohortStage = cohortByStage.get(stage.stage_id);
    const expectedReceiptRefs = expectedReceiptRefsByStage.get(stage.stage_id) ?? [];
    const sourceScopeRefs = refValues(stage.stage_contract?.source_scope_refs);
    const artifactScopeRefs = refValues(stage.stage_contract?.artifact_scope_refs);
    const workspaceScopeRefs = refValues(stage.stage_contract?.workspace_scope_refs);
    const declaredMonitorFreshnessRefs = refValues(stage.stage_contract?.monitor_freshness_refs);
    const fallbackMonitorRefs = uniqueStrings([
      ...refValues(stage.stage_contract?.monitor_refs),
      ...refValues(cohortStage?.monitor_refs),
      ...refValues(cohortStage?.metric_refs),
      ...refValues(cohortStage?.dashboard_metric_refs),
    ]);
    const monitorRefs = declaredMonitorFreshnessRefs.length > 0
      ? declaredMonitorFreshnessRefs
      : fallbackMonitorRefs;
    const expectedReceiptObservedRefs = uniqueStrings([
      ...stageAttempts.flatMap(attemptExpectedReceiptObservedRefs),
      ...domainReceiptRefsForStageEvidence(externalStageEvidenceReceipts),
    ]);
    const observedExpectedReceiptRefs = observedExpectedRefs({
      expectedRefs: expectedReceiptRefs,
      observedRefs: expectedReceiptObservedRefs,
    });
    const unobservedExpectedReceiptRefs = unobservedExpectedRefs({
      expectedRefs: expectedReceiptRefs,
      observedRefs: expectedReceiptObservedRefs,
    });
    const observedMonitorFreshnessRefs = observedExpectedRefs({
      expectedRefs: monitorRefs,
      observedRefs: uniqueStrings([
        ...observedRefs,
        ...evidenceRefsForStageEvidence(externalStageEvidenceReceipts),
      ]),
    });
    const unobservedMonitorFreshnessRefs = unobservedExpectedRefs({
      expectedRefs: monitorRefs,
      observedRefs: uniqueStrings([
        ...observedRefs,
        ...evidenceRefsForStageEvidence(externalStageEvidenceReceipts),
      ]),
    });
    const observedSourceScopeRefs = observedExpectedRefs({
      expectedRefs: sourceScopeRefs,
      observedRefs: uniqueStrings([
        ...observedRefs,
        ...sourceScopeRefsForStageEvidence(externalStageEvidenceReceipts),
      ]),
    });
    const unobservedSourceScopeRefs = unobservedExpectedRefs({
      expectedRefs: sourceScopeRefs,
      observedRefs: uniqueStrings([
        ...observedRefs,
        ...sourceScopeRefsForStageEvidence(externalStageEvidenceReceipts),
      ]),
    });
    const runtimeEventRefs = runtimeRequirement?.runtime_event_refs ?? [];
    const observedRuntimeEventRefs = observedExpectedRefs({
      expectedRefs: runtimeEventRefs,
      observedRefs: uniqueStrings([
        ...observedRefs,
        ...runtimeEventRefsForStageEvidence(externalStageEvidenceReceipts),
      ]),
    });
    const unobservedRuntimeEventRefs = unobservedExpectedRefs({
      expectedRefs: runtimeEventRefs,
      observedRefs: uniqueStrings([
        ...observedRefs,
        ...runtimeEventRefsForStageEvidence(externalStageEvidenceReceipts),
      ]),
    });
    const triggerRefs = refValues(cohortStage?.trigger_refs);
    const cohortQueryRefs = refValues(cohortStage?.cohort_query_refs);
    const missingEvidence = [
      selectedExecutorKinds.length === 0 ? 'selected_executor_binding_not_observed' : null,
      stageAttempts.length === 0 ? 'production_caller_attempt_not_observed' : null,
      unobservedExpectedReceiptRefs.length > 0
        ? 'expected_receipt_ref_not_observed'
        : null,
      unobservedSourceScopeRefs.length > 0
        ? 'source_scope_ref_not_observed'
        : null,
      runtimeRequirement?.required === true
        && unobservedRuntimeEventRefs.length > 0
        ? 'runtime_event_ref_not_observed'
        : null,
      unobservedMonitorFreshnessRefs.length > 0
        ? 'monitor_freshness_ref_not_observed'
        : null,
    ].filter((entry): entry is string => Boolean(entry));
    const status = productionEvidenceStatus({
      conformanceStatus: conformanceByStage.get(stage.stage_id)?.status ?? conformance.status,
      hasAttempt: stageAttempts.length > 0,
      observedRefCount: observedRefs.length,
    });
    const admissionStatus = conformanceByStage.get(stage.stage_id)?.status ?? conformance.status;
    const obligations = [
      evidenceObligation({
        obligationId: 'production_caller',
        required: admissionStatus === 'conformant',
        observedRefs: stageAttemptRefs,
        unobservedRefs: stageAttempts.length === 0 ? ['production_caller_attempt'] : [],
        domainOwnedTypedBlockerRefs,
        domainOwnedTypedBlockerCount,
      }),
      evidenceObligation({
        obligationId: 'selected_executor_binding',
        required: admissionStatus === 'conformant',
        observedRefs: uniqueStrings([
          ...selectedExecutorKinds.map((kind) => `executor_kind:${kind}`),
          ...executorBindingRefs,
        ]),
        unobservedRefs: selectedExecutorKinds.length === 0 ? ['selected_executor_binding'] : [],
        domainOwnedTypedBlockerRefs,
        domainOwnedTypedBlockerCount,
      }),
      evidenceObligation({
        obligationId: 'expected_receipt',
        required: expectedReceiptRefs.length > 0,
        observedRefs: observedExpectedReceiptRefs,
        unobservedRefs: unobservedExpectedReceiptRefs,
        domainOwnedTypedBlockerRefs,
        domainOwnedTypedBlockerCount,
      }),
      evidenceObligation({
        obligationId: 'monitor_freshness',
        required: monitorRefs.length > 0,
        observedRefs: observedMonitorFreshnessRefs,
        unobservedRefs: unobservedMonitorFreshnessRefs,
        domainOwnedTypedBlockerRefs,
        domainOwnedTypedBlockerCount,
      }),
      evidenceObligation({
        obligationId: 'source_scope',
        required: sourceScopeRefs.length > 0,
        observedRefs: observedSourceScopeRefs,
        unobservedRefs: unobservedSourceScopeRefs,
        domainOwnedTypedBlockerRefs,
        domainOwnedTypedBlockerCount,
      }),
      evidenceObligation({
        obligationId: 'runtime_event',
        required: runtimeRequirement?.required === true,
        observedRefs: observedRuntimeEventRefs,
        unobservedRefs: unobservedRuntimeEventRefs,
        domainOwnedTypedBlockerRefs,
        domainOwnedTypedBlockerCount,
      }),
    ];
    return {
      ref: `/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence/${plane.target_domain_id}/${stage.stage_id}`,
      project_id: project.project_id,
      target_domain_id: plane.target_domain_id,
      stage_id: stage.stage_id,
      owner: stage.owner,
      conformance_status: admissionStatus,
      cohort_loop_status: cohortStage?.closure_status ?? 'missing_scope',
      production_evidence_status: status,
      attempt_count: stageAttempts.length,
      stage_attempt_refs: stageAttemptRefs,
      stage_attempt_statuses: stageAttemptStatuses,
      selected_executor_kinds: selectedExecutorKinds,
      default_executor_attempt_count: defaultExecutorAttemptCount,
      non_default_executor_attempt_count: nonDefaultExecutorAttemptCount,
      executor_binding_refs: executorBindingRefs,
      executor_envelope: executorEnvelope(selectedExecutorKinds),
      source_scope_refs: sourceScopeRefs,
      artifact_scope_refs: artifactScopeRefs,
      workspace_scope_refs: workspaceScopeRefs,
      cohort_query_refs: cohortQueryRefs,
      trigger_refs: triggerRefs,
      monitor_refs: monitorRefs,
      monitor_ref_projection_source: declaredMonitorFreshnessRefs.length > 0
        ? 'explicit_stage_contract_monitor_freshness_refs'
        : 'stage_monitor_refs_and_cohort_metrics_fallback',
      runtime_event_refs: runtimeEventRefs,
      expected_receipt_refs: expectedReceiptRefs,
      reviewer_receipt_refs: reviewerReceiptRefs,
      gate_receipt_refs: gateReceiptRefs,
      stage_evidence_receipt_status: stageEvidenceReceiptStatus,
      stage_evidence_receipt_refs: uniqueStrings(externalStageEvidenceReceipts.map((receipt) => receipt.receipt_ref)),
      recorded_stage_evidence_receipt_refs: recordedStageEvidenceReceiptRefs,
      verified_stage_evidence_receipt_refs: uniqueStrings(externalStageEvidenceReceipts
        .filter((receipt) => receipt.receipt_status === 'verified')
        .map((receipt) => receipt.receipt_ref)),
      independent_reviewer_gate_policy: {
        surface_kind: 'opl_stage_independent_reviewer_gate_policy',
        reviewer_attempt_must_be_separate_from_execution_attempt: true,
        gate_attempt_must_be_separate_from_execution_attempt: true,
        same_attempt_self_review_valid: false,
        closes_domain_ready: false,
        closes_quality_or_export_verdict: false,
        missing_reviewer_or_gate_is_route_back_or_typed_blocker_input: true,
      },
      expected_receipt_declared: expectedReceiptRefs.length > 0,
      observed_expected_receipt_refs: observedExpectedReceiptRefs,
      unobserved_expected_receipt_refs: unobservedExpectedReceiptRefs,
      observed_source_scope_refs: observedSourceScopeRefs,
      unobserved_source_scope_refs: unobservedSourceScopeRefs,
      observed_runtime_event_refs: observedRuntimeEventRefs,
      unobserved_runtime_event_refs: unobservedRuntimeEventRefs,
      observed_evidence_refs: allObservedRefs,
      monitor_freshness_refs: observedMonitorFreshnessRefs,
      unobserved_monitor_refs: unobservedMonitorFreshnessRefs,
      domain_owned_typed_blocker_refs: domainOwnedTypedBlockerRefs,
      domain_owned_typed_blocker_count: domainOwnedTypedBlockerCount,
      evidence_obligations: obligations,
      evidence_obligation_summary: obligationSummary(obligations),
      missing_production_evidence: uniqueStrings(missingEvidence),
      authority_boundary: authorityBoundary(),
    };
  });
  const evidenceObligations = stages.flatMap((stage) => stage.evidence_obligations);
  return {
    project_id: project.project_id,
    target_domain_id: plane.target_domain_id,
    plane_id: plane.plane_id,
    stage_count: stages.length,
    conformant_stage_count: stages.filter((stage) => stage.conformance_status === 'conformant').length,
    observed_stage_count: stages.filter((stage) =>
      stage.production_evidence_status === 'production_caller_evidence_observed'
    ).length,
    missing_production_caller_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('production_caller_attempt_not_observed')
    ).length,
    missing_expected_receipt_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('expected_receipt_ref_not_observed')
    ).length,
    expected_receipt_declared_stage_count: stages.filter((stage) =>
      stage.expected_receipt_declared
    ).length,
    expected_receipt_observed_stage_count: stages.filter((stage) =>
      stage.observed_expected_receipt_refs.length > 0
    ).length,
    expected_receipt_unobserved_stage_count: stages.filter((stage) =>
      stage.unobserved_expected_receipt_refs.length > 0
    ).length,
    missing_executor_binding_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('selected_executor_binding_not_observed')
    ).length,
    executor_binding_observed_stage_count: stages.filter((stage) =>
      stage.selected_executor_kinds.length > 0
    ).length,
    missing_monitor_freshness_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('monitor_freshness_ref_not_observed')
    ).length,
    monitor_declared_stage_count: stages.filter((stage) => stage.monitor_refs.length > 0).length,
    monitor_freshness_observed_stage_count: stages.filter((stage) =>
      stage.monitor_freshness_refs.length > 0
    ).length,
    monitor_freshness_unobserved_stage_count: stages.filter((stage) =>
      stage.unobserved_monitor_refs.length > 0
    ).length,
    stages_with_domain_typed_blocker_count: stages.filter((stage) =>
      stage.domain_owned_typed_blocker_refs.length > 0 || stage.domain_owned_typed_blocker_count > 0
    ).length,
    evidence_obligation_count: evidenceObligations.length,
    evidence_obligation_closed_count: evidenceObligations.filter((obligation) =>
      obligation.status === 'closed_by_observed_evidence'
    ).length,
    evidence_obligation_open_count: evidenceObligations.filter((obligation) =>
      obligation.status === 'open'
    ).length,
    evidence_obligation_blocked_by_domain_typed_blocker_count: evidenceObligations.filter((obligation) =>
      obligation.status === 'blocked_by_domain_owned_typed_blocker'
    ).length,
    stages,
  };
}

function authorityBoundary() {
  return {
    opl: 'refs_only_stage_production_evidence_projection',
    domain: 'truth_quality_artifact_memory_and_verdict_owner',
    provider: 'runtime_attempt_and_provider_receipt_owner',
    can_execute_stage: false,
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_authorize_export_verdict: false,
    provider_completion_is_domain_ready: false,
    production_evidence_projection_is_domain_ready: false,
  };
}

export function buildStageProductionEvidence(input: {
  domainManifestProjects: DomainManifestCatalogEntry[];
  attempts: JsonRecord[];
}) {
  const domains = input.domainManifestProjects
    .map((project) => stageProductionEvidence(project, input.attempts))
    .filter((entry): entry is NonNullable<ReturnType<typeof stageProductionEvidence>> => Boolean(entry));
  const stages = domains.flatMap((domain) => domain.stages);
  return {
    surface_kind: 'opl_app_drilldown_stage_production_evidence',
    projection_policy: 'refs_only_stage_launch_and_production_caller_evidence_no_domain_verdict_authority',
    summary: {
      domain_count: domains.length,
      stage_count: stages.length,
      conformant_stage_count: domains.reduce((count, domain) => count + domain.conformant_stage_count, 0),
      observed_stage_count: domains.reduce((count, domain) => count + domain.observed_stage_count, 0),
      missing_production_caller_stage_count:
        domains.reduce((count, domain) => count + domain.missing_production_caller_stage_count, 0),
      missing_expected_receipt_stage_count:
        domains.reduce((count, domain) => count + domain.missing_expected_receipt_stage_count, 0),
      expected_receipt_declared_stage_count:
        domains.reduce((count, domain) => count + domain.expected_receipt_declared_stage_count, 0),
      expected_receipt_observed_stage_count:
        domains.reduce((count, domain) => count + domain.expected_receipt_observed_stage_count, 0),
      expected_receipt_unobserved_stage_count:
        domains.reduce((count, domain) => count + domain.expected_receipt_unobserved_stage_count, 0),
      missing_executor_binding_stage_count:
        domains.reduce((count, domain) => count + domain.missing_executor_binding_stage_count, 0),
      executor_binding_observed_stage_count:
        domains.reduce((count, domain) => count + domain.executor_binding_observed_stage_count, 0),
      missing_monitor_freshness_stage_count:
        domains.reduce((count, domain) => count + domain.missing_monitor_freshness_stage_count, 0),
      monitor_declared_stage_count:
        domains.reduce((count, domain) => count + domain.monitor_declared_stage_count, 0),
      monitor_freshness_observed_stage_count:
        domains.reduce((count, domain) => count + domain.monitor_freshness_observed_stage_count, 0),
      monitor_freshness_unobserved_stage_count:
        domains.reduce((count, domain) => count + domain.monitor_freshness_unobserved_stage_count, 0),
      stages_with_domain_typed_blocker_count:
        domains.reduce((count, domain) => count + domain.stages_with_domain_typed_blocker_count, 0),
      evidence_obligation_count:
        domains.reduce((count, domain) => count + domain.evidence_obligation_count, 0),
      evidence_obligation_closed_count:
        domains.reduce((count, domain) => count + domain.evidence_obligation_closed_count, 0),
      evidence_obligation_open_count:
        domains.reduce((count, domain) => count + domain.evidence_obligation_open_count, 0),
      evidence_obligation_blocked_by_domain_typed_blocker_count:
        domains.reduce((count, domain) => count + domain.evidence_obligation_blocked_by_domain_typed_blocker_count, 0),
      provider_completion_is_domain_ready: false,
      projection_can_authorize_domain_ready: false,
    },
    domains,
    stages,
    authority_boundary: authorityBoundary(),
  };
}
