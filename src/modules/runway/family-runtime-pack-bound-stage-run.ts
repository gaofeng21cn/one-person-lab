import { stableId } from '../../kernel/stable-id.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import type { TemporalStageRunWorkflowInput } from './family-runtime-temporal.ts';

export function buildPackBoundTemporalStageRunInput(input: {
  binding: StandardAgentStageQualityRuntimeBinding;
  domainPackRoot: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint: string | null;
  executorKind?: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  checkpointRefs?: string[];
  taskId?: string | null;
}): TemporalStageRunWorkflowInput {
  const stageRunId = stableId('sr', [
    input.domainId,
    input.stageId,
    input.workspaceLocator,
    input.sourceFingerprint,
    input.taskId ?? null,
    input.binding.manifest_sha256,
    input.binding.policy_ref,
  ]);
  const stagePacketRef = input.checkpointRefs?.[0]
    ?? `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}#stage=${encodeURIComponent(input.stageId)}`;
  return {
    stage_run_id: stageRunId,
    workflow_id: stableId('wf_stage_run', [stageRunId]),
    domain_id: input.domainId,
    stage_id: input.stageId,
    workspace_locator: {
      ...input.workspaceLocator,
      domain_pack_root: input.domainPackRoot,
    },
    source_fingerprint: input.sourceFingerprint,
    executor_kind: input.executorKind?.trim() || 'codex_cli',
    stage_attempt_executor_policy: input.stageAttemptExecutorPolicy ?? null,
    stage_packet_ref: stagePacketRef,
    checkpoint_refs: [stagePacketRef, ...(input.checkpointRefs ?? []).filter((ref) => ref !== stagePacketRef)],
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
    lineage_refs: [
      input.binding.policy_ref,
      `${input.binding.manifest_ref}@sha256:${input.binding.manifest_sha256}`,
      input.binding.stage_prompt_ref,
      ...input.binding.lineage_refs,
    ],
  };
}
