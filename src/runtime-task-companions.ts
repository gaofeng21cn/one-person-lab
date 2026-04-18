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
