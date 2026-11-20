import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type {
  StageQualityFinding,
  StageReviewReceipt,
  StageRouteRecommendation,
} from '../../../authority/stages/index.ts';
import type {
  StageArtifactIdentityAuthority,
  TemporalStageRunAttemptSummary,
  TemporalStageRunWorkflowState,
} from '../family-runtime-temporal-stage-run.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

export function buildRecoveryWorkflowState(input: {
  attemptSummary: TemporalStageRunAttemptSummary;
  launch: JsonRecord;
  cycle: JsonRecord;
  priorAttemptSummaries: TemporalStageRunAttemptSummary[];
  findings: StageQualityFinding[];
  artifactRefs: string[];
  artifactHashes: string[];
  artifactIdentityReceiptRefs: string[];
  artifactIdentityAuthority?: StageArtifactIdentityAuthority | null;
  routeRecommendation: JsonRecord | null;
}) {
  const currentState = record(input.cycle.state);
  const stageRunId = requireString(input.launch.stage_run_id, 'launch.stage_run_id');
  const workflowId = requireString(input.launch.workflow_id, 'launch.workflow_id');
  const qualityCycleId = requireString(input.cycle.quality_cycle_id, 'cycle.quality_cycle_id');
  const attemptRef = `opl://stage_attempts/${input.attemptSummary.stage_attempt_id}`;
  const resumeAfterRepairer = input.attemptSummary.attempt_role === 'repairer';
  return {
    surface_kind: 'temporal_stage_run_query' as const,
    provider_kind: 'temporal' as const,
    stage_run_id: stageRunId,
    workflow_id: workflowId,
    scope_kind: input.launch.scope_kind as TemporalStageRunWorkflowState['scope_kind'],
    execution_scope: input.launch.execution_scope as TemporalStageRunWorkflowState['execution_scope'],
    quality_cycle_id: qualityCycleId,
    domain_id: requireString(input.launch.domain_id, 'launch.domain_id') as TemporalStageRunWorkflowState['domain_id'],
    stage_id: requireString(input.launch.stage_id, 'launch.stage_id'),
    status: 'running' as const,
    current_role: input.attemptSummary.attempt_role === 'reviewer' ? 'repairer' as const
      : resumeAfterRepairer ? 're_reviewer' as const : 'reviewer' as const,
    repair_rounds_used: resumeAfterRepairer
      ? input.attemptSummary.quality_round_index
      : Number(currentState.repair_rounds_used ?? 0),
    max_repair_rounds: Number(currentState.max_repair_rounds ?? 3),
    route_budget: currentState.route_budget as TemporalStageRunWorkflowState['route_budget'],
    quality_scope_budget: currentState.quality_scope_budget as TemporalStageRunWorkflowState['quality_scope_budget'],
    quality_scope_budget_usage: currentState.quality_scope_budget_usage as TemporalStageRunWorkflowState['quality_scope_budget_usage'],
    quality_scope_budget_stop_reason: null,
    attempts: input.priorAttemptSummaries,
    findings: input.findings,
    repair_map: Array.isArray(currentState.repair_map) ? currentState.repair_map : [],
    finding_closures: Array.isArray(currentState.finding_closures) ? currentState.finding_closures : [],
    review_receipts: Array.isArray(record(currentState.controller_readback).review_receipts)
      ? record(currentState.controller_readback).review_receipts as StageReviewReceipt[]
      : [],
    artifact_refs: input.artifactRefs,
    artifact_hashes: input.artifactHashes,
    artifact_identity_receipt_refs: input.artifactIdentityReceiptRefs,
    artifact_identity_authority: input.artifactIdentityAuthority ?? null,
    quality_debt_refs: Array.isArray(currentState.quality_debt_refs) ? currentState.quality_debt_refs : [],
    route_quality_debt_refs: Array.isArray(currentState.route_quality_debt_refs) ? currentState.route_quality_debt_refs : [],
    decisive_attempt_role: null,
    decisive_attempt_ref: null,
    selected_stage_route: null,
    route_evidence_refs: Array.isArray(currentState.route_evidence_refs) ? currentState.route_evidence_refs : [],
    route_recommendations: input.routeRecommendation
      ? [{
          attempt_ref: attemptRef,
          attempt_role: input.attemptSummary.attempt_role,
          quality_round_index: input.attemptSummary.quality_round_index,
          recommendation: input.routeRecommendation as StageRouteRecommendation,
        }]
      : [],
    next_stage_run_launch: null,
    blocked_reason: null,
    hard_stop_class: null,
    typed_blocker_refs: [],
    human_gate_refs: [],
    source_attempt_ref: attemptRef,
    sqlite_projection: { status: 'synced' as const, error: null },
    started_at: typeof currentState.started_at === 'string' ? currentState.started_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    authority_boundary: {
      opl: 'durable_quality_loop_orchestration_and_refs_transport_only' as const,
      domain: 'review_findings_repair_artifact_and_quality_verdict_owner' as const,
      provider_completion_is_domain_ready: false as const,
    },
  } satisfies TemporalStageRunWorkflowState;
}
