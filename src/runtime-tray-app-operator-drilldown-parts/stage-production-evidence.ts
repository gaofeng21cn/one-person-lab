import type { DomainManifestCatalogEntry } from '../domain-manifest/types.ts';
import {
  buildFamilyStageAdmissionReview,
} from '../family-stage-admission.ts';
import {
  buildFamilyStageCohortLoopProjection,
} from '../family-stage-cohort-loop.ts';
import {
  buildFamilyStageProofBundle,
} from '../family-stage-proof-bundle.ts';
import type { FamilyStageSurfaceRef } from '../family-stage-control-plane-contract.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

type StageProductionEvidenceStatus =
  | 'production_caller_evidence_observed'
  | 'stage_pack_ready_waiting_for_production_caller'
  | 'stage_pack_blocked';

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

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
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

function attemptExecutorKind(attempt: JsonRecord) {
  return stringValue(attempt.executor_kind)
    ?? stringValue(attemptLaunchInvocation(attempt).selected_executor_kind);
}

function productionEvidenceStatus(input: {
  admissionStatus: string;
  hasAttempt: boolean;
  observedRefCount: number;
}): StageProductionEvidenceStatus {
  if (input.hasAttempt && input.observedRefCount > 0) {
    return 'production_caller_evidence_observed';
  }
  return input.admissionStatus === 'admitted'
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
  const admission = buildFamilyStageAdmissionReview(plane, manifest);
  const admissionByStage = new Map(admission.stage_results.map((stage) => [stage.stage_id, stage]));
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: manifest?.family_action_catalog ?? null,
    admissionReview: admission,
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
  const attemptsByStage = new Map<string, JsonRecord[]>();
  for (const attempt of attempts) {
    if (stringValue(attempt.domain_id) !== plane.target_domain_id
      && stringValue(attempt.domain_id) !== project.project_id) {
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
    const observedRefs = uniqueStrings(stageAttempts.flatMap(attemptObservedRefs));
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
    const monitorRefs = uniqueStrings([
      ...refValues(stage.stage_contract?.monitor_refs),
      ...refValues(cohortStage?.monitor_refs),
      ...refValues(cohortStage?.metric_refs),
      ...refValues(cohortStage?.dashboard_metric_refs),
    ]);
    const triggerRefs = refValues(cohortStage?.trigger_refs);
    const cohortQueryRefs = refValues(cohortStage?.cohort_query_refs);
    const missingEvidence = [
      selectedExecutorKinds.length === 0 ? 'selected_executor_binding_not_observed' : null,
      stageAttempts.length === 0 ? 'production_caller_attempt_not_observed' : null,
      expectedReceiptRefs.length > 0
        && !expectedReceiptRefs.some((ref) => observedRefs.includes(ref))
        ? 'expected_receipt_ref_not_observed'
        : null,
      sourceScopeRefs.length > 0
        && !sourceScopeRefs.some((ref) => observedRefs.includes(ref))
        ? 'source_scope_ref_not_observed'
        : null,
      runtimeRequirement?.required === true
        && runtimeRequirement.runtime_event_refs.length > 0
        && !runtimeRequirement.runtime_event_refs.some((ref) => observedRefs.includes(ref))
        ? 'runtime_event_ref_not_observed'
        : null,
      monitorRefs.length > 0
        && !monitorRefs.some((ref) => observedRefs.includes(ref))
        ? 'monitor_freshness_ref_not_observed'
        : null,
    ].filter((entry): entry is string => Boolean(entry));
    const status = productionEvidenceStatus({
      admissionStatus: admissionByStage.get(stage.stage_id)?.status ?? admission.status,
      hasAttempt: stageAttempts.length > 0,
      observedRefCount: observedRefs.length,
    });
    return {
      ref: `/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence/${plane.target_domain_id}/${stage.stage_id}`,
      project_id: project.project_id,
      target_domain_id: plane.target_domain_id,
      stage_id: stage.stage_id,
      owner: stage.owner,
      admission_status: admissionByStage.get(stage.stage_id)?.status ?? admission.status,
      cohort_loop_status: cohortStage?.closure_status ?? 'missing_scope',
      production_evidence_status: status,
      attempt_count: stageAttempts.length,
      selected_executor_kinds: selectedExecutorKinds,
      default_executor_attempt_count: defaultExecutorAttemptCount,
      non_default_executor_attempt_count: nonDefaultExecutorAttemptCount,
      executor_binding_refs: executorBindingRefs,
      source_scope_refs: sourceScopeRefs,
      artifact_scope_refs: artifactScopeRefs,
      workspace_scope_refs: workspaceScopeRefs,
      cohort_query_refs: cohortQueryRefs,
      trigger_refs: triggerRefs,
      monitor_refs: monitorRefs,
      runtime_event_refs: runtimeRequirement?.runtime_event_refs ?? [],
      expected_receipt_refs: expectedReceiptRefs,
      observed_evidence_refs: observedRefs,
      missing_production_evidence: uniqueStrings(missingEvidence),
      authority_boundary: authorityBoundary(),
    };
  });
  return {
    project_id: project.project_id,
    target_domain_id: plane.target_domain_id,
    plane_id: plane.plane_id,
    stage_count: stages.length,
    admitted_stage_count: stages.filter((stage) => stage.admission_status === 'admitted').length,
    observed_stage_count: stages.filter((stage) =>
      stage.production_evidence_status === 'production_caller_evidence_observed'
    ).length,
    missing_production_caller_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('production_caller_attempt_not_observed')
    ).length,
    missing_expected_receipt_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('expected_receipt_ref_not_observed')
    ).length,
    missing_executor_binding_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('selected_executor_binding_not_observed')
    ).length,
    missing_monitor_freshness_stage_count: stages.filter((stage) =>
      stage.missing_production_evidence.includes('monitor_freshness_ref_not_observed')
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
      admitted_stage_count: domains.reduce((count, domain) => count + domain.admitted_stage_count, 0),
      observed_stage_count: domains.reduce((count, domain) => count + domain.observed_stage_count, 0),
      missing_production_caller_stage_count:
        domains.reduce((count, domain) => count + domain.missing_production_caller_stage_count, 0),
      missing_expected_receipt_stage_count:
        domains.reduce((count, domain) => count + domain.missing_expected_receipt_stage_count, 0),
      missing_executor_binding_stage_count:
        domains.reduce((count, domain) => count + domain.missing_executor_binding_stage_count, 0),
      missing_monitor_freshness_stage_count:
        domains.reduce((count, domain) => count + domain.missing_monitor_freshness_stage_count, 0),
      provider_completion_is_domain_ready: false,
      projection_can_authorize_domain_ready: false,
    },
    domains,
    stages,
    authority_boundary: authorityBoundary(),
  };
}
