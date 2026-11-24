import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
  TemporalStageAttemptSignalKind,
} from '../family-runtime-types.ts';
import type {
  RuntimeExecutionIdentityState,
  RuntimeExecutionScopeKind,
} from '../family-runtime-execution-scope-persistence.ts';

export type StageAttemptStatus =
  | 'queued'
  | 'running'
  | 'checkpointed'
  | 'blocked'
  | 'human_gate'
  | 'completed'
  | 'failed'
  | 'dead_lettered';

export type StageAttemptRow = {
  stage_attempt_id: string;
  idempotency_key: string;
  provider_kind: FamilyRuntimeProviderKind;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  workspace_locator_json: string;
  source_fingerprint: string | null;
  executor_kind: string;
  stage_attempt_executor_policy_json?: string | null;
  stage_run_id?: string | null;
  scope_kind?: RuntimeExecutionScopeKind;
  project_scope_id?: string | null;
  work_item_scope_id?: string | null;
  workspace_binding_id?: string | null;
  binding_version_id?: string | null;
  scope_digest?: string | null;
  execution_scope_json?: string | null;
  identity_state?: RuntimeExecutionIdentityState;
  quality_cycle_id?: string | null;
  attempt_role?: string | null;
  quality_round_index?: number | null;
  parent_attempt_ref?: string | null;
  input_artifact_refs_json?: string | null;
  reviewed_artifact_hashes_json?: string | null;
  quality_source_refs_json?: string | null;
  quality_knowledge_refs_json?: string | null;
  quality_skill_refs_json?: string | null;
  quality_policy_refs_json?: string | null;
  quality_stage_goal_refs_json?: string | null;
  quality_lineage_refs_json?: string | null;
  quality_rubric_refs_json?: string | null;
  prior_finding_refs_json?: string | null;
  repair_map_refs_json?: string | null;
  quality_context_json?: string | null;
  quality_role_prompt_ref?: string | null;
  execution_session_ref?: string | null;
  usage_observation_json?: string | null;
  context_manifest_ref?: string | null;
  context_manifest_json?: string | null;
  no_context_inheritance?: number | null;
  status: StageAttemptStatus;
  checkpoint_refs_json: string;
  closeout_refs_json: string;
  human_gate_refs_json: string;
  retry_budget_json: string;
  attempt_count: number;
  task_id: string | null;
  blocked_reason: string | null;
  provider_receipt_json: string;
  provider_run_json: string;
  activity_events_json: string;
  route_impact_json: string;
  closeout_receipt_status: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  archived_source: string | null;
  created_at: string;
  updated_at: string;
};

export type StageAttemptSignalRow = {
  signal_id: string;
  stage_attempt_id: string;
  signal_kind: TemporalStageAttemptSignalKind;
  payload_json: string;
  source: string;
  created_at: string;
};

export type StageAttemptCloseoutRow = {
  closeout_id: string;
  stage_attempt_id: string;
  packet_json: string;
  created_at: string;
};
