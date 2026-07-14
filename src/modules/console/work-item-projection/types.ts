import type { JsonRecord } from '../../../kernel/json-record.ts';

export type WorkItemBusinessState =
  | 'active'
  | 'delivered_paused'
  | 'paused'
  | 'stopped'
  | 'archived'
  | 'unknown';

export type WorkItemExecutionState =
  | 'running'
  | 'queued'
  | 'idle'
  | 'succeeded'
  | 'failed'
  | 'unknown';

export type WorkItemAttentionKind = 'none' | 'user' | 'system';
export type WorkItemTelemetryState = 'observed' | 'partial' | 'missing' | 'stale';
export type WorkItemFreshnessState = 'current' | 'stale' | 'unknown';
export type WorkItemPrimaryState =
  | 'automatically_advancing'
  | 'awaiting_user_decision'
  | 'system_attention'
  | 'delivered_auto_paused'
  | 'paused'
  | 'stopped'
  | 'sync_pending';

export type WorkItemActionKind =
  | 'user_action'
  | 'system_action'
  | 'agent_action'
  | 'safe_action'
  | 'blocked_no_action';

export type WorkItemActionOwnerKind = 'user' | 'system' | 'agent' | 'other';
export type WorkItemVisibilityState = 'visible' | 'archived';

export type WorkItemStageState =
  | 'completed'
  | 'current'
  | 'next'
  | 'pending'
  | 'waiting_user'
  | 'system_attention'
  | 'stopped'
  | 'failed';

export type WorkItemStageDisplayNames = {
  'en-US': string;
  [locale: string]: string;
};

export type WorkItemSourceRef = {
  ref_kind: 'file' | 'sqlite' | 'projection';
  ref: string;
  role: string;
};

export type WorkItemCondition = {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message: string;
  owner: string;
  severity: 'none' | 'info' | 'warning' | 'error';
  last_transition_time: string | null;
  observed_generation: string | null;
  ref: string | null;
};

export type AgentAvailability = {
  agent_id: string;
  domain_id: string;
  display_name: string;
  availability: 'available' | 'attention_required' | 'unavailable';
  reason: string;
  last_checked_at: string;
  source: 'package_directory' | 'package_status';
  independent_from_work_item_state: true;
  package_id: string;
  source_ref: string | null;
  inventory_descriptor: {
    status: 'readable' | 'unreadable' | 'not_checked';
    reason: string;
    source_ref: string | null;
  };
  package_launch_readiness: {
    status: 'ready' | 'blocked' | 'unknown';
    launch_allowed: boolean | null;
    reason: string;
  };
};

export type AgentCatalogEntry = {
  agent_id: string;
  domain_id: string;
  display_name: string;
  short_label: string;
  package_id: string;
  scope_id: string;
};

export type ProjectCatalogEntry = {
  project_id: string;
  scope_id: string;
  agent_id: string;
  agent_display_name: string;
  domain_id: string;
  display_name: string;
  workspace_path: string;
  binding_status: 'active' | 'inactive';
  selected_binding_id: string;
  binding_ids: string[];
  source_refs: WorkItemSourceRef[];
};

export type TokenObservation = {
  state: 'observed' | 'missing' | 'stale';
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  observed_at: string | null;
  missing_reason: string | null;
  source_refs: string[];
};

export type WorkItemProjectionItem = {
  item_id: string;
  identity: {
    agent_id: string;
    agent_display_name: string;
    domain_id: string;
    project_id: string;
    project_display_name: string;
    project_scope_id: string;
    workspace_binding_id: string;
    workspace_path: string;
    work_item_id: string;
    work_item_display_name: string;
    work_item_kind: string;
    work_item_root: string | null;
    work_item_scope_id: string;
    source_kind: 'domain_inventory' | 'runtime_only';
  };
  lifecycle: {
    business_state: WorkItemBusinessState;
    domain_business_state: WorkItemBusinessState;
    control_state: Exclude<WorkItemBusinessState, 'unknown'> | null;
    primary_state: WorkItemPrimaryState;
    primary_state_label: string;
    primary_state_reason: string;
    reason: string;
    last_transition_at: string;
    raw_business_status: string | null;
    current_stage_id: string | null;
    current_stage_display_name: string | null;
    current_stage_status: string | null;
    package_status: string | null;
    lifecycle_ref: string | null;
    source: 'work_item_control_ledger' | 'domain_inventory_projection' | 'runtime_only';
    control_ref: string | null;
    control_updated_at: string | null;
    observed_generation: string;
  };
  visibility: {
    state: WorkItemVisibilityState;
    source: 'default' | 'work_item_control_ledger';
    updated_at: string | null;
    control_ref: string | null;
    generation: number;
  };
  execution: {
    state: WorkItemExecutionState;
    stage_id: string | null;
    stage_status: string | null;
    current_stage_id: string | null;
    current_stage_display_name: string | null;
    next_stage_id: string | null;
    next_stage_display_name: string | null;
    attempt_id: string | null;
    attempt_ids: string[];
    workflow_id: string | null;
    provider_kind: string | null;
    started_at: string | null;
    last_heartbeat_at: string | null;
    updated_at: string | null;
    running_proof_status: string;
    diagnostic_reason: string | null;
  };
  attention: {
    kind: WorkItemAttentionKind;
    reason: string;
    owner: string | null;
    responsible_component: string | null;
    issue: string | null;
    impact: string | null;
    repair_action: string | null;
    expected_outcome: string | null;
  };
  telemetry: {
    state: WorkItemTelemetryState;
    current_stage: TokenObservation;
    cumulative: TokenObservation;
    missing_reason: string | null;
  };
  action: {
    kind: WorkItemActionKind;
    title: string;
    title_key: string;
    summary: string;
    summary_key: string;
    message_args: JsonRecord;
    owner: string;
    owner_kind: WorkItemActionOwnerKind;
    owner_display_name: string;
    action_ref: string;
    dry_run_required: boolean;
  };
  stage_map: Array<{
    stage_id: string;
    display_name: string;
    display_names: WorkItemStageDisplayNames;
    state: WorkItemStageState;
    owner: string | null;
    owner_display_name: string | null;
    elapsed_seconds: number | null;
    usage: TokenObservation | null;
    next_action: string | null;
  }>;
  conditions: WorkItemCondition[];
  freshness: {
    state: WorkItemFreshnessState;
    inventory_observed_at: string;
    execution_observed_at: string | null;
    last_transition_time: string;
    observed_generation: string;
    reason: string;
  };
  source_refs: WorkItemSourceRef[];
};

export type WorkItemProjectionDiagnostic = {
  reason: string;
  agent_id?: string;
  project_id?: string;
  work_item_id?: string;
  ref?: string;
  details?: JsonRecord;
};

export type WorkItemProjectionV2 = {
  surface_kind: 'opl_work_item_projection';
  schema_version: 'work-item-projection.v2';
  profile: 'fast' | 'full';
  generated_at: string;
  agent_catalog: AgentCatalogEntry[];
  agent_availability: AgentAvailability[];
  project_catalog: ProjectCatalogEntry[];
  summary: {
    agent_count: number;
    project_count: number;
    work_item_count: number;
    visible_work_item_count: number;
    archived_work_item_count: number;
    total_work_item_count: number;
    running_count: number;
    user_attention_count: number;
    system_attention_count: number;
    telemetry_observed_count: number;
    telemetry_missing_count: number;
  };
  items: WorkItemProjectionItem[];
  diagnostics: {
    count: number;
    items: WorkItemProjectionDiagnostic[];
    detail_policy: 'summary_only' | 'included';
  };
  detail_policy: {
    all_work_item_summaries_included: true;
    attempt_ref_limit_per_item: number;
    diagnostic_details: 'lazy' | 'included';
  };
  authority_boundary: {
    projection_only: true;
    can_write_domain_truth: false;
    can_create_owner_receipt: false;
    can_create_typed_blocker: false;
    can_authorize_quality_verdict: false;
    temporal_is_work_item_inventory: false;
  };
};
