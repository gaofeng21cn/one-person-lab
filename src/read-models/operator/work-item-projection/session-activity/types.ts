import type { WorkItemProjectionDiagnostic, WorkItemProjectionItem } from '../types.ts';

export type WorkItemSessionActivityKind = 'coordination' | 'controlled_execution';
export type WorkItemSessionActivityState =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkItemExecutionSessionIdentity = {
  agent_id: string;
  project_id: string;
  project_scope_id: string;
  work_item_id: string;
  work_item_scope_id: string;
  workspace_binding_id: string;
  observed_generation: string;
};

export type WorkItemExecutionSessionBinding = {
  binding_id: string;
  execution_session_ref: string;
  identity: WorkItemExecutionSessionIdentity;
  activity_kind: WorkItemSessionActivityKind;
  activity_state: WorkItemSessionActivityState;
  stage_attempt_id: string | null;
  workflow_id: string | null;
  observed_at: string;
  ttl_ms: number;
  expires_at: string;
  sequence: number;
  source_ref: string | null;
  recorded_at: string;
};

export type ObserveWorkItemExecutionSessionInput = WorkItemExecutionSessionIdentity & {
  execution_session_ref: string;
  activity_kind?: 'coordination';
  activity_state: WorkItemSessionActivityState;
  observed_at: string;
  sequence: number;
  source_ref?: string | null;
};

export type SessionActivityReadResult = {
  bindings: WorkItemExecutionSessionBinding[];
  source_ref: string;
  diagnostics: WorkItemProjectionDiagnostic[];
};

export type SessionActivityObservationTarget = (
  items: WorkItemProjectionItem[],
  input: ObserveWorkItemExecutionSessionInput,
) => WorkItemProjectionItem;
