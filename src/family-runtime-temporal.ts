import type { FamilyRuntimeDomainId } from './family-runtime-command.ts';

export const STAGE_ATTEMPT_WORKFLOW_NAME = 'StageAttemptWorkflow';
export const CODEX_STAGE_ACTIVITY_NAME = 'CodexStageActivity';
export const DOMAIN_SIDECAR_DISPATCH_ACTIVITY_NAME = 'DomainSidecarDispatchActivity';

export const TEMPORAL_STAGE_ATTEMPT_SIGNALS = [
  'HumanGateSignal',
  'UserInstructionSignal',
  'ResumeSignal',
] as const;

export const TEMPORAL_STAGE_ATTEMPT_QUERIES = [
  'StageAttemptQuery',
] as const;

export type TemporalStageAttemptSignalKind =
  | 'human_gate'
  | 'user_instruction'
  | 'resume';

export type TemporalStageAttemptWorkflowInput = {
  stage_attempt_id: string;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  workspace_locator: Record<string, unknown>;
  source_fingerprint: string | null;
  executor_kind: string;
  retry_budget: Record<string, unknown>;
};

export function buildTemporalStageAttemptWorkflowContract() {
  return {
    provider_kind: 'temporal',
    workflow_name: STAGE_ATTEMPT_WORKFLOW_NAME,
    activity_names: {
      codex_stage_activity: CODEX_STAGE_ACTIVITY_NAME,
      domain_sidecar_dispatch_activity: DOMAIN_SIDECAR_DISPATCH_ACTIVITY_NAME,
    },
    signals: [...TEMPORAL_STAGE_ATTEMPT_SIGNALS],
    queries: [...TEMPORAL_STAGE_ATTEMPT_QUERIES],
    provider_completion_boundary: {
      provider_completion: 'workflow/activity transport completed',
      domain_ready_verdict: 'read from domain-owned quality or gate surface',
      opl_forbidden_authority: [
        'domain_truth',
        'domain_quality_verdict',
        'canonical_artifact_write',
      ],
    },
  };
}

export function buildTemporalStageAttemptWorkflowInput(
  attempt: {
    stage_attempt_id: string;
    workflow_id: string;
    domain_id: FamilyRuntimeDomainId;
    stage_id: string;
    workspace_locator: Record<string, unknown>;
    source_fingerprint: string | null;
    executor_kind: string;
    retry_budget: Record<string, unknown>;
  },
): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: attempt.stage_attempt_id,
    workflow_id: attempt.workflow_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    workspace_locator: attempt.workspace_locator,
    source_fingerprint: attempt.source_fingerprint,
    executor_kind: attempt.executor_kind,
    retry_budget: attempt.retry_budget,
  };
}
