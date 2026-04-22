type JsonRecord = Record<string, unknown>;

interface FamilyReference {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
}

interface BuildTaskSurfaceDescriptorInput {
  surface_kind: string;
  summary: string;
  command?: string | null;
  ref?: FamilyReference | null;
  step_id?: string | null;
  locator_fields?: string[];
}

interface BuildCheckpointSummaryInput {
  status: string;
  summary: string;
  checkpoint_id?: string | null;
  recorded_at?: string | null;
  lineage_ref?: FamilyReference | null;
  verification_ref?: FamilyReference | null;
}

interface BuildRuntimeInventoryInput {
  summary: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  substrate: string;
  availability: string;
  health_status: string;
  status_surface?: FamilyReference | null;
  attention_surface?: FamilyReference | null;
  recovery_surface?: FamilyReference | null;
  workspace_binding?: JsonRecord | null;
  domain_projection?: JsonRecord | null;
}

interface BuildTaskLifecycleInput {
  task_kind: string;
  task_id: string;
  status: string;
  summary: string;
  session_id?: string | null;
  run_id?: string | null;
  progress_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  resume_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  checkpoint_summary?: ReturnType<typeof buildCheckpointSummary> | null;
  human_gate_ids?: string[];
  domain_projection?: JsonRecord | null;
}

interface BuildSessionContinuityInput {
  summary: string;
  domain_agent_id: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  status: string;
  session_id?: string | null;
  run_id?: string | null;
  entry_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  progress_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  artifact_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  restore_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  checkpoint_summary?: ReturnType<typeof buildCheckpointSummary> | null;
  human_gate_ids?: string[];
  domain_projection?: JsonRecord | null;
}

interface BuildProgressProjectionInput {
  headline: string;
  latest_update: string;
  next_step: string;
  status_summary: string;
  session_id?: string | null;
  current_status?: string | null;
  runtime_status?: string | null;
  progress_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  artifact_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  inspect_paths?: string[];
  attention_items?: string[];
  human_gate_ids?: string[];
  domain_projection?: JsonRecord | null;
}

export type ArtifactFileKind = 'deliverable' | 'supporting';

interface BuildArtifactFileDescriptorInput {
  file_id: string;
  label: string;
  kind: ArtifactFileKind;
  path: string;
  summary: string;
  ref?: FamilyReference | null;
}

interface BuildArtifactInventoryInput {
  deliverable_files: Array<ReturnType<typeof buildArtifactFileDescriptor> | BuildArtifactFileDescriptorInput>;
  supporting_files?: Array<ReturnType<typeof buildArtifactFileDescriptor> | BuildArtifactFileDescriptorInput>;
  session_id?: string | null;
  workspace_path?: string | null;
  progress_headline?: string | null;
  artifact_surface?: ReturnType<typeof buildTaskSurfaceDescriptor> | null;
  inspect_paths?: string[];
  domain_projection?: JsonRecord | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`runtime/task companion 缺少字符串字段: ${field}`);
  }
  return text;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function normalizeRef(value: unknown, field: string) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ref_kind: requireString(value.ref_kind, `${field}.ref_kind`),
    ref: requireString(value.ref, `${field}.ref`),
    ...(optionalString(value.role) ? { role: optionalString(value.role)! } : {}),
    ...(optionalString(value.label) ? { label: optionalString(value.label)! } : {}),
  };
}

export function buildTaskSurfaceDescriptor(input: BuildTaskSurfaceDescriptorInput) {
  return {
    surface_kind: requireString(input.surface_kind, 'surface_kind'),
    summary: requireString(input.summary, 'summary'),
    ...(optionalString(input.command) ? { command: optionalString(input.command)! } : {}),
    ...(normalizeRef(input.ref, 'ref') ? { ref: normalizeRef(input.ref, 'ref') } : {}),
    ...(optionalString(input.step_id) ? { step_id: optionalString(input.step_id)! } : {}),
    ...(readStringList(input.locator_fields, 'locator_fields').length > 0
      ? { locator_fields: readStringList(input.locator_fields, 'locator_fields') }
      : {}),
  };
}

export function buildCheckpointSummary(input: BuildCheckpointSummaryInput) {
  return {
    surface_kind: 'checkpoint_summary',
    status: requireString(input.status, 'status'),
    summary: requireString(input.summary, 'summary'),
    ...(optionalString(input.checkpoint_id) ? { checkpoint_id: optionalString(input.checkpoint_id)! } : {}),
    ...(optionalString(input.recorded_at) ? { recorded_at: optionalString(input.recorded_at)! } : {}),
    ...(normalizeRef(input.lineage_ref, 'lineage_ref') ? { lineage_ref: normalizeRef(input.lineage_ref, 'lineage_ref') } : {}),
    ...(normalizeRef(input.verification_ref, 'verification_ref')
      ? { verification_ref: normalizeRef(input.verification_ref, 'verification_ref') }
      : {}),
  };
}

export function buildRuntimeInventory(input: BuildRuntimeInventoryInput) {
  return {
    surface_kind: 'runtime_inventory',
    summary: requireString(input.summary, 'summary'),
    runtime_owner: requireString(input.runtime_owner, 'runtime_owner'),
    domain_owner: requireString(input.domain_owner, 'domain_owner'),
    executor_owner: requireString(input.executor_owner, 'executor_owner'),
    substrate: requireString(input.substrate, 'substrate'),
    availability: requireString(input.availability, 'availability'),
    health_status: requireString(input.health_status, 'health_status'),
    ...(normalizeRef(input.status_surface, 'status_surface')
      ? { status_surface: normalizeRef(input.status_surface, 'status_surface') }
      : {}),
    ...(normalizeRef(input.attention_surface, 'attention_surface')
      ? { attention_surface: normalizeRef(input.attention_surface, 'attention_surface') }
      : {}),
    ...(normalizeRef(input.recovery_surface, 'recovery_surface')
      ? { recovery_surface: normalizeRef(input.recovery_surface, 'recovery_surface') }
      : {}),
    ...(isRecord(input.workspace_binding) ? { workspace_binding: { ...input.workspace_binding } } : {}),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}

export function buildTaskLifecycle(input: BuildTaskLifecycleInput) {
  return {
    surface_kind: 'task_lifecycle',
    task_kind: requireString(input.task_kind, 'task_kind'),
    task_id: requireString(input.task_id, 'task_id'),
    status: requireString(input.status, 'status'),
    summary: requireString(input.summary, 'summary'),
    ...(optionalString(input.session_id) ? { session_id: optionalString(input.session_id)! } : {}),
    ...(optionalString(input.run_id) ? { run_id: optionalString(input.run_id)! } : {}),
    ...(input.progress_surface ? { progress_surface: buildTaskSurfaceDescriptor(input.progress_surface) } : {}),
    ...(input.resume_surface ? { resume_surface: buildTaskSurfaceDescriptor(input.resume_surface) } : {}),
    ...(input.checkpoint_summary ? { checkpoint_summary: buildCheckpointSummary(input.checkpoint_summary) } : {}),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}

export function buildSessionContinuity(input: BuildSessionContinuityInput) {
  return {
    surface_kind: 'session_continuity',
    summary: requireString(input.summary, 'summary'),
    domain_agent_id: requireString(input.domain_agent_id, 'domain_agent_id'),
    runtime_owner: requireString(input.runtime_owner, 'runtime_owner'),
    domain_owner: requireString(input.domain_owner, 'domain_owner'),
    executor_owner: requireString(input.executor_owner, 'executor_owner'),
    status: requireString(input.status, 'status'),
    ...(optionalString(input.session_id) ? { session_id: optionalString(input.session_id)! } : {}),
    ...(optionalString(input.run_id) ? { run_id: optionalString(input.run_id)! } : {}),
    ...(input.entry_surface ? { entry_surface: buildTaskSurfaceDescriptor(input.entry_surface) } : {}),
    ...(input.progress_surface ? { progress_surface: buildTaskSurfaceDescriptor(input.progress_surface) } : {}),
    ...(input.artifact_surface ? { artifact_surface: buildTaskSurfaceDescriptor(input.artifact_surface) } : {}),
    ...(input.restore_surface ? { restore_surface: buildTaskSurfaceDescriptor(input.restore_surface) } : {}),
    ...(input.checkpoint_summary ? { checkpoint_summary: buildCheckpointSummary(input.checkpoint_summary) } : {}),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}

export function buildProgressProjection(input: BuildProgressProjectionInput) {
  return {
    surface_kind: 'progress_projection',
    headline: requireString(input.headline, 'headline'),
    latest_update: requireString(input.latest_update, 'latest_update'),
    next_step: requireString(input.next_step, 'next_step'),
    status_summary: requireString(input.status_summary, 'status_summary'),
    ...(optionalString(input.session_id) ? { session_id: optionalString(input.session_id)! } : {}),
    ...(optionalString(input.current_status) ? { current_status: optionalString(input.current_status)! } : {}),
    ...(optionalString(input.runtime_status) ? { runtime_status: optionalString(input.runtime_status)! } : {}),
    ...(input.progress_surface ? { progress_surface: buildTaskSurfaceDescriptor(input.progress_surface) } : {}),
    ...(input.artifact_surface ? { artifact_surface: buildTaskSurfaceDescriptor(input.artifact_surface) } : {}),
    inspect_paths: readStringList(input.inspect_paths, 'inspect_paths'),
    attention_items: readStringList(input.attention_items, 'attention_items'),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}

export function buildArtifactFileDescriptor(input: BuildArtifactFileDescriptorInput) {
  return {
    file_id: requireString(input.file_id, 'file_id'),
    label: requireString(input.label, 'label'),
    kind: requireString(input.kind, 'kind') as ArtifactFileKind,
    path: requireString(input.path, 'path'),
    summary: requireString(input.summary, 'summary'),
    ...(normalizeRef(input.ref, 'ref') ? { ref: normalizeRef(input.ref, 'ref') } : {}),
  };
}

export function buildArtifactInventory(input: BuildArtifactInventoryInput) {
  const deliverableFiles = input.deliverable_files.map((entry, index) =>
    buildArtifactFileDescriptor({
      file_id: requireString(entry.file_id, `deliverable_files[${index}].file_id`),
      label: requireString(entry.label, `deliverable_files[${index}].label`),
      kind: 'deliverable',
      path: requireString(entry.path, `deliverable_files[${index}].path`),
      summary: requireString(entry.summary, `deliverable_files[${index}].summary`),
      ref: entry.ref,
    }),
  );
  const supportingFiles = (input.supporting_files ?? []).map((entry, index) =>
    buildArtifactFileDescriptor({
      file_id: requireString(entry.file_id, `supporting_files[${index}].file_id`),
      label: requireString(entry.label, `supporting_files[${index}].label`),
      kind: 'supporting',
      path: requireString(entry.path, `supporting_files[${index}].path`),
      summary: requireString(entry.summary, `supporting_files[${index}].summary`),
      ref: entry.ref,
    }),
  );

  return {
    surface_kind: 'artifact_inventory',
    ...(optionalString(input.session_id) ? { session_id: optionalString(input.session_id)! } : {}),
    ...(optionalString(input.workspace_path) ? { workspace_path: optionalString(input.workspace_path)! } : {}),
    summary: {
      deliverable_files_count: deliverableFiles.length,
      supporting_files_count: supportingFiles.length,
      total_files_count: deliverableFiles.length + supportingFiles.length,
    },
    deliverable_files: deliverableFiles,
    supporting_files: supportingFiles,
    ...(optionalString(input.progress_headline) ? { progress_headline: optionalString(input.progress_headline)! } : {}),
    ...(input.artifact_surface ? { artifact_surface: buildTaskSurfaceDescriptor(input.artifact_surface) } : {}),
    inspect_paths: readStringList(input.inspect_paths, 'inspect_paths'),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}
