import type { DatabaseSync } from 'node:sqlite';

import { loadFrameworkContracts } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { buildFamilyConflictOrBlockerEnvelope, buildFamilyConflictSubject } from './family-conflict-envelope.ts';
import { buildFamilyStageAdmissionReview } from './family-stage-admission.ts';
import { buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
import { buildFamilyStageRuntimeBudgetProjection } from './family-stage-runtime-budget.ts';
import type {
  FamilyStageAdmissionReview,
  FamilyStageAdmissionStageResult,
} from './family-stage-admission.ts';
import type { FamilyStageCohortLoopStage } from './family-stage-cohort-loop.ts';
import type { FamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
import type { FamilyStageDescriptor } from './family-stage-control-plane-contract.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

const STAGE_KERNEL_LAUNCH_BLOCKER_CODES = new Set([
  'missing_stage_contract',
  'missing_requires_contract',
  'missing_ensures_contract',
  'missing_scope_refs',
  'missing_authority_boundary_role',
  'invalid_opl_authority_role',
  'forbidden_opl_authority',
  'effect_boundary_without_event_recording',
  'runtime_guard_without_event_recording',
  'effect_boundary_missing_runtime_event_refs',
  'runtime_guard_missing_runtime_event_refs',
  'human_review_gate_budget_blocked',
]);

export type StageAdmissionLaunchGateInput = {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  taskKind?: string | null;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  idempotencyKey?: string | null;
  requireAdmission?: boolean;
};

export type StageAdmissionLaunchGateResult = {
  surface_kind: 'opl_stage_launch_admission_gate';
  version: 'opl-stage-launch-admission-gate.v1';
  gate_owner: 'opl_runtime';
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  required: boolean;
  status: 'allowed' | 'blocked' | 'not_applicable';
  blocked_reason: string | null;
  admission_status: FamilyStageAdmissionReview['status'] | null;
  plane_id: string | null;
  target_domain_id: string | null;
  inspected_stage: FamilyStageAdmissionStageResult | null;
  inspected_cohort_loop_stage: FamilyStageCohortLoopStage | null;
  findings: FamilyStageAdmissionReview['findings'];
  blocker_findings: FamilyStageAdmissionReview['findings'];
  recommendation_findings: FamilyStageAdmissionReview['findings'];
  conflict_or_blocker_envelopes: ReturnType<typeof buildFamilyConflictOrBlockerEnvelope>[];
  authority_boundary: {
    opl: 'launch_gate_and_blocker_projection_only';
    domain: 'truth_quality_artifact_gate_owner';
    executor: 'selected_executor_runs_only_after_admission';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
};

function normalize(value: string) {
  return value.trim().toLowerCase().replaceAll('_', '-');
}

function domainAliases(domainId: FamilyRuntimeDomainId) {
  if (domainId === 'medautoscience') {
    return new Set(['medautoscience', 'med-autoscience', 'mas']);
  }
  if (domainId === 'medautogrant') {
    return new Set(['medautogrant', 'med-autogrant', 'mag']);
  }
  return new Set(['redcube', 'redcube-ai', 'rca']);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolvePlane(entry: DomainManifestCatalogEntry): FamilyStageControlPlane | null {
  return entry.status === 'resolved' ? entry.manifest?.family_stage_control_plane ?? null : null;
}

function entryMatchesDomain(entry: DomainManifestCatalogEntry, domainId: FamilyRuntimeDomainId) {
  const aliases = domainAliases(domainId);
  const plane = resolvePlane(entry);
  const agentId = optionalString(entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id);
  return [
    entry.project_id,
    entry.project,
    plane?.target_domain_id,
    entry.manifest?.target_domain_id,
    agentId,
  ].some((value) => typeof value === 'string' && aliases.has(normalize(value)));
}

function stageResult(review: FamilyStageAdmissionReview, stageId: string) {
  return review.stage_results.find((stage) => stage.stage_id === stageId) ?? null;
}

function stageLaunchBlockerFindings(findings: FamilyStageAdmissionReview['findings']) {
  return findings.filter((finding) => (
    finding.severity === 'blocker'
    && STAGE_KERNEL_LAUNCH_BLOCKER_CODES.has(finding.code)
  ));
}

function scopeRefFindings(stage: FamilyStageDescriptor): FamilyStageAdmissionReview['findings'] {
  const contract = stage.stage_contract;
  if (!contract) {
    return [];
  }
  if (contract.source_scope_refs.length + contract.artifact_scope_refs.length + contract.workspace_scope_refs.length > 0) {
    return [];
  }
  return [{
    severity: 'blocker',
    code: 'missing_scope_refs',
    message: 'Stage launch requires at least one source, artifact, or workspace scope ref.',
    stage_id: stage.stage_id,
    failure_lane: 'source',
    source_ref: `family_stage:${stage.stage_id}`,
    minimal_counterexample: {
      stage_id: stage.stage_id,
      missing_field: 'source_scope_refs_or_artifact_scope_refs_or_workspace_scope_refs',
    },
  }];
}

function statusForMissing(input: StageAdmissionLaunchGateInput, reason: string): StageAdmissionLaunchGateResult {
  const required = input.requireAdmission === true;
  const status = required ? 'blocked' : 'not_applicable';
  const subject = buildFamilyConflictSubject({
    domain: input.domainId,
    stageId: input.stageId,
    taskKind: input.taskKind,
    sourceFingerprint: input.sourceFingerprint,
    idempotencyKey: input.idempotencyKey,
    taskId: input.taskId,
  });
  return {
    surface_kind: 'opl_stage_launch_admission_gate',
    version: 'opl-stage-launch-admission-gate.v1',
    gate_owner: 'opl_runtime',
    domain_id: input.domainId,
    stage_id: input.stageId,
    required,
    status,
    blocked_reason: required ? reason : null,
    admission_status: null,
    plane_id: null,
    target_domain_id: null,
    inspected_stage: null,
    inspected_cohort_loop_stage: null,
    findings: [],
    blocker_findings: [],
    recommendation_findings: [],
    conflict_or_blocker_envelopes: required
      ? [
          buildFamilyConflictOrBlockerEnvelope({
            subject,
            classification: 'evidence_blocker',
            owner: 'opl_runtime',
            authority: 'opl_runtime',
            status: 'blocked',
            reason,
            allowedNextActions: ['repair_stage_control_plane', 'retry_after_admission'],
            forbiddenActions: ['start_executor_without_stage_admission', 'fallback_complete'],
            failClosed: true,
          }),
        ]
      : [],
    authority_boundary: launchGateAuthorityBoundary(),
  };
}

function launchGateAuthorityBoundary(): StageAdmissionLaunchGateResult['authority_boundary'] {
  return {
    opl: 'launch_gate_and_blocker_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    executor: 'selected_executor_runs_only_after_admission',
    can_execute_stage: false,
    can_write_domain_truth: false,
    can_authorize_quality_verdict: false,
    can_mutate_artifact_body: false,
  };
}

export function buildStageAdmissionLaunchGateFromReview(
  input: StageAdmissionLaunchGateInput & {
    plane: FamilyStageControlPlane;
    review: FamilyStageAdmissionReview;
  },
): StageAdmissionLaunchGateResult {
  const inspectedStage = stageResult(input.review, input.stageId);
  if (!inspectedStage) {
    return statusForMissing(input, 'stage_admission_stage_missing');
  }
  const inspectedDescriptor = input.plane.stages.find((stage) => stage.stage_id === input.stageId) ?? null;
  const cohortLoop = buildFamilyStageCohortLoopProjection(input.plane);
  const inspectedCohortLoopStage = cohortLoop.stages.find((stage) => stage.stage_id === input.stageId) ?? null;
  const runtimeBudget = buildFamilyStageRuntimeBudgetProjection(input.plane);
  const inspectedRuntimeBudgetStage = runtimeBudget.stages.find((stage) => stage.stage_id === input.stageId) ?? null;
  const stageFindings = input.review.findings.filter((finding) => finding.stage_id === input.stageId);
  const cohortLoopNeedsAttention = input.requireAdmission === true
    && inspectedCohortLoopStage !== null
    && inspectedCohortLoopStage.closure_status !== 'closed_loop_ready';
  const cohortLoopFindings: FamilyStageAdmissionReview['findings'] = cohortLoopNeedsAttention
    ? inspectedCohortLoopStage.blockers.map((cohortBlocker) => ({
        severity: 'warning' as const,
        code: cohortBlocker.blocker_id,
        message: cohortBlocker.minimal_counterexample.reason,
        stage_id: input.stageId,
        failure_lane: cohortBlocker.blocker_id === 'cohort_monitor_or_metric_missing' ? 'monitor' as const : 'source' as const,
        source_ref: `family_stage_cohort_loop:${input.stageId}`,
        minimal_counterexample: cohortBlocker.minimal_counterexample,
      }))
    : [];
  const runtimeBudgetFindings: FamilyStageAdmissionReview['findings'] = input.requireAdmission === true
    && inspectedRuntimeBudgetStage !== null
    && inspectedRuntimeBudgetStage.reliability_budget_status !== 'ready'
    ? inspectedRuntimeBudgetStage.minimal_counterexamples.map((budgetCounterexample) => ({
        severity: 'warning' as const,
        code: `runtime_budget_${budgetCounterexample.missing_field}_missing`,
        message: budgetCounterexample.reason,
        stage_id: input.stageId,
        failure_lane: budgetCounterexample.missing_field === 'monitor_refs' ? 'monitor' as const : 'runtime' as const,
        source_ref: `family_stage_runtime_budget:${input.stageId}`,
        minimal_counterexample: { ...budgetCounterexample },
      }))
    : [];
  const findings = [
    ...stageFindings,
    ...(input.requireAdmission === true && inspectedDescriptor ? scopeRefFindings(inspectedDescriptor) : []),
    ...cohortLoopFindings,
    ...runtimeBudgetFindings,
  ];
  const blockerFindings = stageLaunchBlockerFindings(findings);
  const recommendationFindings = findings.filter((finding) => !blockerFindings.includes(finding));
  const blockedReason = blockerFindings.length > 0
    ? inspectedStage.status === 'admitted'
      ? 'stage_admission_stage_kernel_blocked'
      : `stage_admission_${inspectedStage.status}`
    : null;
  const subject = buildFamilyConflictSubject({
    domain: input.domainId,
    stageId: input.stageId,
    taskKind: input.taskKind,
    sourceFingerprint: input.sourceFingerprint,
    idempotencyKey: input.idempotencyKey,
    taskId: input.taskId,
    sourceRefs: [
      `opl://family_stage_control_planes/${input.plane.plane_id}`,
      `opl://family_stage_admission/${input.review.plane_id}`,
    ],
  });
  return {
    surface_kind: 'opl_stage_launch_admission_gate',
    version: 'opl-stage-launch-admission-gate.v1',
    gate_owner: 'opl_runtime',
    domain_id: input.domainId,
    stage_id: input.stageId,
    required: input.requireAdmission === true,
    status: blockedReason ? 'blocked' : 'allowed',
    blocked_reason: blockedReason,
    admission_status: input.review.status,
    plane_id: input.plane.plane_id,
    target_domain_id: input.plane.target_domain_id,
    inspected_stage: inspectedStage,
    inspected_cohort_loop_stage: inspectedCohortLoopStage,
    findings,
    blocker_findings: blockerFindings,
    recommendation_findings: recommendationFindings,
    conflict_or_blocker_envelopes: blockedReason
      ? [
          buildFamilyConflictOrBlockerEnvelope({
            subject,
            classification: 'evidence_blocker',
            owner: 'opl_runtime',
            authority: 'opl_runtime',
            status: 'blocked',
            reason: blockedReason,
            evidenceRefs: blockerFindings.map((finding) => `finding:${finding.code}`),
            allowedNextActions: ['repair_stage_contract', 'retry_after_admission'],
            forbiddenActions: ['start_executor_without_stage_admission', 'fallback_complete'],
            failClosed: true,
          }),
        ]
      : [],
    authority_boundary: launchGateAuthorityBoundary(),
  };
}

export function buildStageAdmissionLaunchGate(
  input: StageAdmissionLaunchGateInput,
  options: {
    domainManifests?: { projects: DomainManifestCatalogEntry[] };
  } = {},
): StageAdmissionLaunchGateResult {
  const catalog = options.domainManifests
    ?? buildDomainManifestCatalog(loadFrameworkContracts()).domain_manifests;
  const entry = catalog.projects.find((candidate) => entryMatchesDomain(candidate, input.domainId));
  if (!entry) {
    return statusForMissing(input, 'stage_admission_manifest_missing');
  }
  const plane = resolvePlane(entry);
  if (!plane) {
    return statusForMissing(input, 'stage_admission_manifest_missing');
  }
  const review = buildFamilyStageAdmissionReview(plane, entry.manifest);
  return buildStageAdmissionLaunchGateFromReview({
    ...input,
    plane,
    review,
  });
}

export function blockTaskForStageAdmissionGate(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  attempt: {
    stage_attempt_id: string;
    stage_id: string;
    blocked_reason: string | null;
  },
) {
  const blockedReason = attempt.blocked_reason ?? 'stage_admission_blocked';
  const updatedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    'Stage attempt blocked by OPL stage admission gate before executor launch.',
    blockedReason,
    updatedAt,
    row.task_id,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_blocked_by_stage_admission_gate',
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: attempt.stage_attempt_id,
      stage_id: attempt.stage_id,
      blocked_reason: blockedReason,
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'error',
    title: 'Family runtime task blocked by stage admission',
    body: blockedReason,
    payload: {
      stage_attempt_id: attempt.stage_attempt_id,
      stage_id: attempt.stage_id,
      reason: blockedReason,
    },
  });
  return {
    task_id: row.task_id,
    status: 'blocked',
    reason: blockedReason,
    stage_attempts: [attempt],
  };
}
