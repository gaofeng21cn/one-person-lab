import type { RuntimeTrayActionKind, RuntimeTrayActionOwner } from './runtime-tray-action.ts';

export type RuntimeTrayHealthStatus = 'offline' | 'needs_attention' | 'running' | 'idle';
export type RuntimeTrayLane = 'running' | 'attention' | 'recent';

export type RuntimeTraySourceRef = {
  ref_kind: string;
  ref: string;
  role: string;
  label?: string;
};

export type RuntimeTrayCommand = {
  step_id: string;
  title: string;
  surface_kind: string;
  command: string;
};

export type JsonRecord = Record<string, unknown>;

export type RuntimeTrayItem = {
  item_id: string;
  project_id: string;
  project_label: string;
  lane: RuntimeTrayLane;
  title: string;
  status: string | null;
  status_label: string;
  summary: string | null;
  updated_at: string | null;
  command: string | null;
  workspace_path: string | null;
  runtime_owner: 'upstream_hermes_agent';
  domain_owner: string;
  source_refs: RuntimeTraySourceRef[];
  action_owner: RuntimeTrayActionOwner;
  requires_user_action: boolean;
  action_kind: RuntimeTrayActionKind | null;
  action_summary: string;
  study_id?: string | null;
  workspace_label?: string | null;
  detail_summary?: string | null;
  next_action_summary?: string | null;
  active_run_id?: string | null;
  browser_url?: string | null;
  quest_session_api_url?: string | null;
  health_status?: string | null;
  blockers?: string[];
  recommended_commands?: RuntimeTrayCommand[];
  portal_path?: string | null;
  portal_url?: string | null;
  portal_payload_ref?: string | null;
  portal_freshness?: JsonRecord | null;
  portal_source_refs?: RuntimeTraySourceRef[];
  workbench_projection?: JsonRecord | null;
  workbench_projection_source_refs?: RuntimeTraySourceRef[];
  family_stage_control_plane?: JsonRecord | null;
  family_stage_workbench?: JsonRecord | null;
  study_workbench?: JsonRecord | null;
  stage_attempt_workbench?: JsonRecord | null;
};

export type MasWorkspaceProjectionRef = {
  workspace_root: string;
  profile_ref: string | null;
  profile_name: string | null;
  source_refs: RuntimeTraySourceRef[];
};
