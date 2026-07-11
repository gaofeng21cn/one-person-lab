import {
  buildAttemptArtifactGallery,
  buildWorkbenchArtifactGallery,
} from './artifact-gallery.ts';
import {
  buildAttemptOperatorActionRouting,
  buildWorkbenchOperatorActionRouting,
} from './action-routing.ts';
import {
  buildAttemptMemoryLocatorIndex,
  buildWorkbenchMemoryLocatorIndex,
} from './memory-locator-index.ts';
import {
  buildAttemptObservabilitySlo,
  buildWorkbenchObservabilitySlo,
} from './observability-slo.ts';
import {
  buildAttemptPackageExportLifecycle,
  buildWorkbenchPackageExportLifecycle,
} from './package-export-lifecycle.ts';
import {
  buildAttemptQualityReadiness,
  buildWorkbenchQualityReadiness,
} from './quality-readiness.ts';
import {
  buildAttemptStageCandidatePortfolio,
  buildWorkbenchStageCandidatePortfolio,
} from './stage-candidate-portfolio.ts';
import {
  buildAttemptReviewRepairQueue,
  buildWorkbenchReviewRepairQueue,
} from './review-repair-queue.ts';
import {
  buildAttemptRouteDecisionGraph,
  buildWorkbenchRouteDecisionGraph,
} from './route-decision-graph.ts';
import {
  buildAttemptTransitionBridgeEvidence,
  buildWorkbenchTransitionBridgeEvidence,
} from './transition-bridge-evidence.ts';
import {
  buildAttemptWorkspaceSourceIntake,
  buildWorkbenchWorkspaceSourceIntake,
} from './workspace-source-intake.ts';
import type { JsonRecord } from '../../../kernel/types.ts';
import { FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS } from '../family-runtime-queue-projection-boundary.ts';

export type StageAttemptGenericProjectionInput = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  next_owner: string | null;
  route_impact: JsonRecord;
  workspace_locator: JsonRecord;
  source_fingerprint: string | null;
  checkpoint_refs: string[];
  closeout_refs: string[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  artifact_refs: string[];
  rejected_writes: unknown[];
  attention_flags: string[];
  human_gate_refs: string[];
  human_gate_ledger: JsonRecord[];
  resume_ledger: JsonRecord[];
  [FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter]: JsonRecord | null;
  domain_ready_verdict: string | null;
  controlled_apply_contract: JsonRecord;
  lifecycle_primitives: JsonRecord;
  current_provider_readiness: JsonRecord | null;
  provider_readiness_currentness?: JsonRecord;
  stage_candidate_portfolio?: JsonRecord | null;
};

export function buildAttemptGenericProjections(input: StageAttemptGenericProjectionInput) {
  const deadLetter = input[FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter];
  const transitionBridgeEvidence = buildAttemptTransitionBridgeEvidence({
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    workspace_locator: input.workspace_locator,
  });
  return {
    current_provider_readiness: input.current_provider_readiness,
    ...(input.provider_readiness_currentness
      ? { provider_readiness_currentness: input.provider_readiness_currentness }
      : {}),
    artifact_gallery: buildAttemptArtifactGallery({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      closeout_refs: input.closeout_refs,
      consumed_refs: input.consumed_refs,
      writeback_receipt_refs: input.writeback_receipt_refs,
      controlled_apply_contract: input.controlled_apply_contract,
      lifecycle_primitives: input.lifecycle_primitives,
    }),
    route_decision_graph: buildAttemptRouteDecisionGraph({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      next_owner: input.next_owner,
      route_impact: input.route_impact,
      consumed_refs: input.consumed_refs,
      consumed_memory_refs: input.consumed_memory_refs,
      writeback_receipt_refs: input.writeback_receipt_refs,
      closeout_refs: input.closeout_refs,
    }),
    review_repair_queue: buildAttemptReviewRepairQueue({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      next_owner: input.next_owner,
      attention_flags: input.attention_flags,
      human_gate_refs: input.human_gate_refs,
      human_gate_ledger: input.human_gate_ledger,
      resume_ledger: input.resume_ledger,
      rejected_writes: input.rejected_writes,
      [FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter]: deadLetter,
      controlled_apply_contract: input.controlled_apply_contract,
      lifecycle_primitives: input.lifecycle_primitives,
    }),
    quality_readiness: buildAttemptQualityReadiness({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      domain_ready_verdict: input.domain_ready_verdict,
      route_impact: input.route_impact,
      closeout_refs: input.closeout_refs,
      consumed_refs: input.consumed_refs,
      consumed_memory_refs: input.consumed_memory_refs,
      writeback_receipt_refs: input.writeback_receipt_refs,
    }),
    observability_slo: buildAttemptObservabilitySlo({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      route_impact: input.route_impact,
      current_provider_readiness: input.current_provider_readiness,
    }),
    workspace_source_intake: buildAttemptWorkspaceSourceIntake({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      workspace_locator: input.workspace_locator,
      source_fingerprint: input.source_fingerprint,
      checkpoint_refs: input.checkpoint_refs,
    }),
    memory_locator_index: buildAttemptMemoryLocatorIndex({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      consumed_memory_refs: input.consumed_memory_refs,
      writeback_receipt_refs: input.writeback_receipt_refs,
      rejected_writes: input.rejected_writes,
      route_impact: input.route_impact,
      workspace_locator: input.workspace_locator,
    }),
    package_export_lifecycle: buildAttemptPackageExportLifecycle({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      route_impact: input.route_impact,
      artifact_refs: input.artifact_refs,
    }),
    stage_candidate_portfolio: buildAttemptStageCandidatePortfolio({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      stage_candidate_portfolio: input.stage_candidate_portfolio,
    }),
    action_routing: buildAttemptOperatorActionRouting({
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      next_owner: input.next_owner,
      route_impact: input.route_impact,
      human_gate_refs: input.human_gate_refs,
      resume_ledger: input.resume_ledger,
      transition_bridge_evidence: transitionBridgeEvidence,
    }),
    transition_bridge_evidence: transitionBridgeEvidence,
  };
}

export function buildWorkbenchGenericProjections(attempts: StageAttemptGenericProjectionInput[]) {
  return {
    artifact_gallery: buildWorkbenchArtifactGallery(attempts),
    route_decision_graph: buildWorkbenchRouteDecisionGraph(attempts),
    review_repair_queue: buildWorkbenchReviewRepairQueue(attempts),
    quality_readiness: buildWorkbenchQualityReadiness(attempts),
    observability_slo: buildWorkbenchObservabilitySlo(attempts),
    workspace_source_intake: buildWorkbenchWorkspaceSourceIntake(attempts),
    memory_locator_index: buildWorkbenchMemoryLocatorIndex(attempts),
    package_export_lifecycle: buildWorkbenchPackageExportLifecycle(attempts),
    stage_candidate_portfolio: buildWorkbenchStageCandidatePortfolio(attempts),
    action_routing: buildWorkbenchOperatorActionRouting(attempts),
    transition_bridge_evidence: buildWorkbenchTransitionBridgeEvidence(attempts),
  };
}
