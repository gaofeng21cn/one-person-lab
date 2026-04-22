export type JsonRecord = Record<string, unknown>;

export interface AcpTaskAcceptanceView {
  task_id: string;
  status: string;
  stage: string | null;
  summary: string;
  executor_backend: string | null;
  session_id: string | null;
}

export interface AcpSessionSeedView {
  surface_id: string;
  request_mode: string;
  entry_surface: string | null;
  entry_mode: string | null;
  session_id: string | null;
  routing_status: string | null;
  handoff_prompt_preview: string | null;
  task_acceptance: AcpTaskAcceptanceView | null;
}

export interface AcpResumeView {
  surface_id: string;
  session_id: string;
  output: string;
  exit_code: number | null;
  command_preview: string[] | null;
}

export type AcpUpdateSource = 'session_logs' | 'progress';

export interface AcpUpdateEventView {
  source: AcpUpdateSource;
  surface_id: string;
  session_id: string | null;
  summary: string | null;
  raw_output: string | null;
  headline: string | null;
  latest_update: string | null;
  next_step: string | null;
  status_summary: string | null;
  task_acceptance: AcpTaskAcceptanceView | null;
}

export type AcpArtifactRole = 'deliverable' | 'supporting';

export interface AcpArtifactFileView {
  role: AcpArtifactRole;
  file_id: string | null;
  title: string | null;
  path: string | null;
}

export interface AcpArtifactSummaryView {
  deliverable_files_count: number;
  supporting_files_count: number;
  total_files_count: number;
}

export interface AcpArtifactEventView {
  surface_id: string;
  session_id: string | null;
  workspace_path: string | null;
  progress_headline: string | null;
  summary: AcpArtifactSummaryView;
  files: AcpArtifactFileView[];
}

export interface AcpSessionListItemView {
  session_id: string;
  source: string | null;
  preview: string | null;
  updated_at: string | null;
}

export interface AcpSessionListView {
  surface_id: string;
  mode: string;
  limit: number | null;
  items: AcpSessionListItemView[];
}

export interface AcpSessionLedgerView {
  surface_id: string;
  ledger_scope: string;
  summary: Record<string, unknown>;
  sessions: Array<{
    session_id: string;
    event_count: number;
    last_recorded_at: string;
  }>;
}

export interface AcpWorkspaceListItemView {
  project_id: string;
  label: string | null;
  workspace_path: string | null;
  status: string | null;
}

export interface AcpWorkspaceListView {
  surface_id: string;
  mode: string;
  projects: AcpWorkspaceListItemView[];
  active_binding_count: number | null;
}
