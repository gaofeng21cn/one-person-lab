import {
  resolveStandardAgentStageTargetBinding,
  resolveStandardAgentStageQualityRuntimeBinding as resolveStageQualityRuntimeBinding,
} from './standard-agent-stage-manifest/runtime-quality-binding.ts';
import type {
  StandardAgentStageQualityRuntimeBinding,
} from './standard-agent-stage-manifest/types.ts';

export { STANDARD_AGENT_STAGE_MANIFEST_REF } from './standard-agent-stage-prompt.ts';

export {
  compileStandardAgentStageManifest,
  OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE,
  STANDARD_AGENT_DESCRIPTOR_REF,
} from './standard-agent-stage-manifest/manifest-compiler.ts';

export { resolveStandardAgentStageTargetBinding };

export function resolveStandardAgentStageQualityRuntimeBinding(
  repoDirInput: string,
  stageIdInput: string,
): StandardAgentStageQualityRuntimeBinding | null {
  return resolveStageQualityRuntimeBinding(repoDirInput, stageIdInput);
}

export {
  resolveStandardAgentStageReviewLane,
  stageAttemptExecutorPolicyWithReviewLane,
} from './standard-agent-stage-manifest/stage-quality-validation.ts';

export type {
  StandardAgentHandoffReviewBoundary,
  StandardAgentStageManifestCompilation,
  StandardAgentStageQualityPolicy,
  StandardAgentStageQualityRuntimeBinding,
  StandardAgentStageTargetBinding,
  StandardAgentStageReviewLaneBinding,
} from './standard-agent-stage-manifest/types.ts';
