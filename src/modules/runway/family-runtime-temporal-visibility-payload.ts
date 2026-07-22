import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';

export function buildTemporalStageAttemptSearchAttributes(input: TemporalStageAttemptWorkflowInput) {
  return {
    OplStageAttemptId: [input.stage_attempt_id],
    OplStageRunId: input.stage_run_id ? [input.stage_run_id] : [],
    OplWorkItemScopeId: input.execution_scope ? [input.execution_scope.work_item_scope_id] : [],
  };
}

export function buildTemporalStageAttemptMemo(input: TemporalStageAttemptWorkflowInput) {
  return {
    surface_kind: 'opl_temporal_stage_attempt_memo',
    owner: 'one-person-lab',
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id ?? null,
    scope_kind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
    project_scope_id: input.execution_scope?.project_scope_id ?? null,
    work_item_scope_id: input.execution_scope?.work_item_scope_id ?? null,
    workspace_binding_id: input.execution_scope?.workspace_binding_id ?? null,
    scope_digest: input.execution_scope?.scope_digest ?? null,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    executor_kind: input.executor_kind,
    task_id: input.task_id ?? null,
    source_fingerprint: input.source_fingerprint ?? null,
  };
}
