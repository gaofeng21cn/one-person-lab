import {
  buildAttemptArtifactGallery,
  buildWorkbenchArtifactGallery,
} from './runtime-tray-artifact-gallery.ts';
import {
  buildAttemptOperatorActionRouting,
  buildWorkbenchOperatorActionRouting,
} from './runtime-tray-action-routing.ts';
import {
  buildAttemptMemoryLocatorIndex,
  buildWorkbenchMemoryLocatorIndex,
} from './runtime-tray-memory-locator-index.ts';
import {
  buildAttemptObservabilitySlo,
  buildWorkbenchObservabilitySlo,
} from './runtime-tray-observability-slo.ts';
import {
  buildAttemptPackageExportLifecycle,
  buildWorkbenchPackageExportLifecycle,
} from './runtime-tray-package-export-lifecycle.ts';
import {
  buildAttemptQualityReadiness,
  buildWorkbenchQualityReadiness,
} from './runtime-tray-quality-readiness.ts';
import {
  buildAttemptReviewRepairQueue,
  buildWorkbenchReviewRepairQueue,
} from './runtime-tray-review-repair-queue.ts';
import {
  buildAttemptRouteDecisionGraph,
  buildWorkbenchRouteDecisionGraph,
} from './runtime-tray-route-decision-graph.ts';
import {
  buildAttemptTransitionBridgeEvidence,
  buildWorkbenchTransitionBridgeEvidence,
} from './runtime-tray-transition-bridge-evidence.ts';
import {
  buildAttemptWorkspaceSourceIntake,
  buildWorkbenchWorkspaceSourceIntake,
} from './runtime-tray-workspace-source-intake.ts';
import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

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
  dead_letter: JsonRecord | null;
  domain_ready_verdict: string | null;
  controlled_apply_contract: JsonRecord;
  lifecycle_primitives: JsonRecord;
  current_provider_readiness: JsonRecord | null;
};

export function buildAttemptGenericProjections(input: StageAttemptGenericProjectionInput) {
  const transitionBridgeEvidence = buildAttemptTransitionBridgeEvidence({
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    workspace_locator: input.workspace_locator,
  });
  return {
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
      dead_letter: input.dead_letter,
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
    action_routing: buildWorkbenchOperatorActionRouting(attempts),
    transition_bridge_evidence: buildWorkbenchTransitionBridgeEvidence(attempts),
  };
}
