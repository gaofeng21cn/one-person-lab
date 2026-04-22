import type {
  AcpArtifactEventView,
  AcpArtifactFileView,
  AcpSessionLedgerView,
  AcpSessionListView,
  AcpWorkspaceListView,
  AcpResumeView,
  AcpSessionSeedView,
  AcpTaskAcceptanceView,
  AcpUpdateEventView,
  JsonRecord,
} from './opl-acp-types.ts';

export class AcpBridgePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcpBridgePayloadError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function requiredRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new AcpBridgePayloadError(`ACP bridge payload 缺少对象字段: ${field}`);
  }
  return value;
}

function requiredString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new AcpBridgePayloadError(`ACP bridge payload 缺少字符串字段: ${field}`);
  }
  return text;
}

function readSessionId(entry: JsonRecord) {
  const seed = isRecord(entry.seed) ? entry.seed : null;
  const resume = isRecord(entry.resume) ? entry.resume : null;
  const hermes = isRecord(entry.hermes) ? entry.hermes : null;
  const codex = isRecord(entry.codex) ? entry.codex : null;
  return (
    optionalString(entry.session_id)
    ?? optionalString(seed?.session_id)
    ?? optionalString(resume?.session_id)
    ?? optionalString(hermes?.session_id)
    ?? optionalString(codex?.session_id)
    ?? null
  );
}

function readTaskAcceptance(value: unknown): AcpTaskAcceptanceView | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    task_id: requiredString(value.task_id, 'task.task_id'),
    status: requiredString(value.status, 'task.status'),
    stage: optionalString(value.stage),
    summary: requiredString(value.summary, 'task.summary'),
    executor_backend: optionalString(value.executor_backend),
    session_id: optionalString(value.session_id),
  };
}

function readCommandPreview(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readArtifactFile(value: unknown, role: AcpArtifactFileView['role']) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    role,
    file_id: optionalString(value.file_id),
    title: optionalString(value.title),
    path: optionalString(value.path),
  } satisfies AcpArtifactFileView;
}

export function translateSessionCreatePayload(payload: unknown): AcpSessionSeedView {
  const envelope = requiredRecord(payload, 'payload');
  const sessionCreate = requiredRecord(envelope.session_create, 'session_create');
  const nestedPayload = requiredRecord(sessionCreate.payload, 'session_create.payload');
  const productEntry = requiredRecord(nestedPayload.product_entry, 'session_create.payload.product_entry');

  return {
    surface_id: requiredString(sessionCreate.surface_id, 'session_create.surface_id'),
    request_mode: requiredString(sessionCreate.request_mode, 'session_create.request_mode'),
    entry_surface: optionalString(productEntry.entry_surface),
    entry_mode: optionalString(productEntry.mode),
    session_id: readSessionId(productEntry),
    routing_status: isRecord(productEntry.routing) ? optionalString(productEntry.routing.status) : null,
    handoff_prompt_preview: optionalString(productEntry.handoff_prompt_preview),
    task_acceptance: readTaskAcceptance(productEntry.task),
  };
}

export function translateSessionResumePayload(payload: unknown): AcpResumeView {
  const envelope = requiredRecord(payload, 'payload');
  const sessionResume = requiredRecord(envelope.session_resume, 'session_resume');
  const resume = requiredRecord(sessionResume.resume, 'session_resume.resume');

  return {
    surface_id: requiredString(sessionResume.surface_id, 'session_resume.surface_id'),
    session_id: requiredString(resume.session_id, 'session_resume.resume.session_id'),
    output: requiredString(resume.output, 'session_resume.resume.output'),
    exit_code: typeof resume.exit_code === 'number' ? resume.exit_code : null,
    command_preview: readCommandPreview(resume.command_preview),
  };
}

export function translateSessionLogsPayload(payload: unknown): AcpUpdateEventView {
  const envelope = requiredRecord(payload, 'payload');
  const sessionLogs = requiredRecord(envelope.session_logs, 'session_logs');

  return {
    source: 'session_logs',
    surface_id: requiredString(sessionLogs.surface_id, 'session_logs.surface_id'),
    session_id: optionalString(sessionLogs.session_id),
    summary: optionalString(sessionLogs.raw_output),
    raw_output: optionalString(sessionLogs.raw_output),
    headline: null,
    latest_update: null,
    next_step: null,
    status_summary: null,
    task_acceptance: null,
  };
}

export function translateProgressPayload(payload: unknown): AcpUpdateEventView {
  const envelope = requiredRecord(payload, 'payload');
  const progress = requiredRecord(envelope.progress, 'progress');

  return {
    source: 'progress',
    surface_id: requiredString(progress.surface_id, 'progress.surface_id'),
    session_id: optionalString(progress.session_id),
    summary: optionalString(progress.status_summary) ?? optionalString(progress.headline),
    raw_output: null,
    headline: optionalString(progress.headline),
    latest_update: optionalString(progress.latest_update),
    next_step: optionalString(progress.next_step),
    status_summary: optionalString(progress.status_summary),
    task_acceptance: readTaskAcceptance(progress.task),
  };
}

export function translateArtifactsPayload(payload: unknown): AcpArtifactEventView {
  const envelope = requiredRecord(payload, 'payload');
  const artifacts = requiredRecord(envelope.artifacts, 'artifacts');
  const summary = requiredRecord(artifacts.summary, 'artifacts.summary');
  const deliverableFiles = Array.isArray(artifacts.deliverable_files) ? artifacts.deliverable_files : [];
  const supportingFiles = Array.isArray(artifacts.supporting_files) ? artifacts.supporting_files : [];

  return {
    surface_id: requiredString(artifacts.surface_id, 'artifacts.surface_id'),
    session_id: optionalString(artifacts.session_id),
    workspace_path: optionalString(artifacts.workspace_path),
    progress_headline: optionalString(artifacts.progress_headline),
    summary: {
      deliverable_files_count:
        typeof summary.deliverable_files_count === 'number' ? summary.deliverable_files_count : deliverableFiles.length,
      supporting_files_count:
        typeof summary.supporting_files_count === 'number' ? summary.supporting_files_count : supportingFiles.length,
      total_files_count:
        typeof summary.total_files_count === 'number'
          ? summary.total_files_count
          : deliverableFiles.length + supportingFiles.length,
    },
    files: [
      ...deliverableFiles
        .map((entry) => readArtifactFile(entry, 'deliverable'))
        .filter((entry): entry is AcpArtifactFileView => Boolean(entry)),
      ...supportingFiles
        .map((entry) => readArtifactFile(entry, 'supporting'))
        .filter((entry): entry is AcpArtifactFileView => Boolean(entry)),
    ],
  };
}

export function translateSessionListPayload(payload: unknown): AcpSessionListView {
  const envelope = requiredRecord(payload, 'payload');
  const productEntry = requiredRecord(envelope.product_entry, 'product_entry');
  const sessions = Array.isArray(productEntry.sessions) ? productEntry.sessions : [];

  return {
    surface_id: requiredString(productEntry.entry_surface, 'product_entry.entry_surface'),
    mode: requiredString(productEntry.mode, 'product_entry.mode'),
    limit: typeof productEntry.limit === 'number' ? productEntry.limit : null,
    items: sessions.map((entry, index) => {
      const session = requiredRecord(entry, `product_entry.sessions[${index}]`);
      return {
        session_id: requiredString(session.session_id, `product_entry.sessions[${index}].session_id`),
        source: optionalString(session.source),
        preview: optionalString(session.preview),
        updated_at: optionalString(session.updated_at) ?? optionalString(session.last_updated_at),
      };
    }),
  };
}

export function translateSessionLedgerPayload(payload: unknown): AcpSessionLedgerView {
  const envelope = requiredRecord(payload, 'payload');
  const ledger = requiredRecord(envelope.session_ledger, 'session_ledger');
  const sessions = Array.isArray(ledger.sessions) ? ledger.sessions : [];

  return {
    surface_id: requiredString(ledger.surface_id, 'session_ledger.surface_id'),
    ledger_scope: requiredString(ledger.ledger_scope, 'session_ledger.ledger_scope'),
    summary: requiredRecord(ledger.summary, 'session_ledger.summary'),
    sessions: sessions.map((entry, index) => {
      const session = requiredRecord(entry, `session_ledger.sessions[${index}]`);
      return {
        session_id: requiredString(session.session_id, `session_ledger.sessions[${index}].session_id`),
        event_count: typeof session.event_count === 'number' ? session.event_count : 0,
        last_recorded_at: requiredString(
          session.last_recorded_at,
          `session_ledger.sessions[${index}].last_recorded_at`,
        ),
      };
    }),
  };
}

export function translateWorkspaceListPayload(payload: unknown): AcpWorkspaceListView {
  const envelope = requiredRecord(payload, 'payload');
  const catalog = requiredRecord(envelope.workspace_catalog, 'workspace_catalog');
  const projects = Array.isArray(catalog.projects) ? catalog.projects : [];
  const summary = isRecord(catalog.summary) ? catalog.summary : null;

  return {
    surface_id: requiredString(catalog.surface_id, 'workspace_catalog.surface_id'),
    mode: requiredString(catalog.mode, 'workspace_catalog.mode'),
    active_binding_count:
      summary && typeof summary.active_binding_count === 'number' ? summary.active_binding_count : null,
    projects: projects.map((entry, index) => {
      const project = requiredRecord(entry, `workspace_catalog.projects[${index}]`);
      const activeBinding = isRecord(project.active_binding) ? project.active_binding : null;
      return {
        project_id: requiredString(project.project_id, `workspace_catalog.projects[${index}].project_id`),
        label: optionalString(project.label),
        workspace_path: activeBinding ? optionalString(activeBinding.workspace_path) : null,
        status: activeBinding ? optionalString(activeBinding.status) : null,
      };
    }),
  };
}
