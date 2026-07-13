import { stableId } from '../../kernel/stable-id.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import type { TemporalStageRunWorkflowInput } from './family-runtime-temporal.ts';
import {
  buildStageRunImmutableSpec,
  deriveStageRunId,
  stageRunSpecSha256,
} from './family-runtime-stage-run-identity.ts';

export function buildPackBoundTemporalStageRunInput(input: {
  binding: StandardAgentStageQualityRuntimeBinding;
  domainPackRoot: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  stageRunInvocationId: string;
  parentRouteDecisionRef?: string | null;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint: string | null;
  executorKind?: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  checkpointRefs?: string[];
  artifactRefs?: string[];
  artifactHashes?: string[];
  actionId?: string | null;
  taskId?: string | null;
}): TemporalStageRunWorkflowInput {
  const stageRunId = deriveStageRunId({
    domainId: input.domainId,
    stageId: input.stageId,
    stageRunInvocationId: input.stageRunInvocationId,
  });
  const stagePacketRef = input.checkpointRefs?.[0]
    ?? `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}#stage=${encodeURIComponent(input.stageId)}`;
  const checkpointRefs = [stagePacketRef, ...(input.checkpointRefs ?? []).filter((ref) => ref !== stagePacketRef)];
  const stageRunSpec = buildStageRunImmutableSpec({
    binding: input.binding,
    domainId: input.domainId,
    stageId: input.stageId,
    workspaceLocator: input.workspaceLocator,
    sourceFingerprint: input.sourceFingerprint,
    executorKind: input.executorKind,
    stageAttemptExecutorPolicy: input.stageAttemptExecutorPolicy,
    stagePacketRef,
    actionId: input.actionId,
    taskId: input.taskId,
    checkpointRefs,
    artifactRefs: input.artifactRefs,
    artifactHashes: input.artifactHashes,
    parentRouteDecisionRef: input.parentRouteDecisionRef,
  });
  return {
    stage_run_id: stageRunId,
    stage_run_invocation_id: input.stageRunInvocationId,
    stage_run_spec_sha256: stageRunSpecSha256(stageRunSpec),
    stage_run_spec: stageRunSpec,
    parent_route_decision_ref: input.parentRouteDecisionRef ?? null,
    workflow_id: stableId('wf_stage_run', [stageRunId]),
    domain_id: input.domainId,
    stage_id: input.stageId,
    action_id: input.actionId ?? null,
    task_id: input.taskId ?? null,
    declared_stage_ids: input.binding.declared_stage_ids,
    workspace_locator: {
      ...input.workspaceLocator,
      domain_pack_root: input.domainPackRoot,
    },
    source_fingerprint: input.sourceFingerprint,
    executor_kind: input.executorKind?.trim() || 'codex_cli',
    stage_attempt_executor_policy: input.stageAttemptExecutorPolicy ?? null,
    stage_packet_ref: stagePacketRef,
    checkpoint_refs: checkpointRefs,
    quality_policy_ref: input.binding.policy_ref,
    domain_pack_root: input.domainPackRoot,
    stage_manifest_ref: input.binding.manifest_ref,
    stage_manifest_sha256: input.binding.manifest_sha256,
    stage_role: input.binding.stage_role,
    quality_policy: input.binding.quality_policy,
    role_prompt_refs: input.binding.role_prompt_refs,
    quality_rubric_refs: input.binding.quality_rubric_refs,
    stage_goal_refs: input.binding.stage_goal_refs,
    source_refs: input.binding.source_refs,
    artifact_refs: input.artifactRefs ?? [],
    artifact_hashes: input.artifactHashes ?? [],
    lineage_refs: [
      input.binding.policy_ref,
      `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}`,
      input.binding.stage_prompt_ref,
      ...input.binding.lineage_refs,
    ],
  };
}
