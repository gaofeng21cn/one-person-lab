type JsonRecord = Record<string, unknown>;

interface FamilyReference {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
}

type FamilyPersistenceStorageRole =
  | 'file_authority'
  | 'sqlite_sidecar_index'
  | 'projection_cache'
  | 'legacy_diagnostic_only';

interface BuildFamilyPersistenceSurfaceInput {
  surface_id: string;
  surface_role: string;
  storage_role: FamilyPersistenceStorageRole;
  owner: string;
  ref: FamilyReference;
  rebuild_from_refs?: FamilyReference[];
}

interface BuildFamilyPersistencePolicyInput {
  target_domain_id: string;
  policy_id: string;
  summary: string;
  authority_surfaces: BuildFamilyPersistenceSurfaceInput[];
  sidecar_indexes?: BuildFamilyPersistenceSurfaceInput[];
  projection_caches?: BuildFamilyPersistenceSurfaceInput[];
  legacy_diagnostics?: BuildFamilyPersistenceSurfaceInput[];
}

type FamilyLifecyclePhase = 'inventory' | 'dry_run' | 'apply' | 'verify';

interface BuildFamilyLifecycleActionInput {
  action_id: string;
  action_kind: string;
  target_ref: FamilyReference;
  authority_owner: string;
  safety_gate: string;
  result: string;
  manifest_ref: FamilyReference;
  sha256: string;
  restore_ref: FamilyReference;
}

interface BuildFamilyLifecycleLedgerInput {
  target_domain_id: string;
  ledger_id: string;
  phase: FamilyLifecyclePhase;
  status: string;
  summary: string;
  actions: BuildFamilyLifecycleActionInput[];
}

interface BuildFamilyOwnerRouteInput {
  target_domain_id: string;
  route_id: string;
  route_epoch: string;
  source_fingerprint: string;
  next_owner: string;
  allowed_actions: string[];
  idempotency_key: string;
  status: string;
  summary: string;
  handoff_refs?: FamilyReference[];
  projection_refs?: FamilyReference[];
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

function requireRef(value: unknown, field: string) {
  const ref = normalizeRef(value, field);
  if (!ref) {
    throw new Error(`runtime/task companion 缺少 reference 字段: ${field}`);
  }
  return ref;
}

function normalizeRefs(values: unknown, field: string) {
  if (!Array.isArray(values)) {
    return [] as ReturnType<typeof requireRef>[];
  }
  return values.map((entry, index) => requireRef(entry, `${field}[${index}]`));
}

function requireSha256(value: unknown, field: string) {
  const text = requireString(value, field);
  if (!/^[a-fA-F0-9]{64}$/.test(text)) {
    throw new Error(`runtime/task companion ${field} 必须是 64 位 sha256`);
  }
  return text.toLowerCase();
}

function buildFamilyPersistenceSurface(
  input: BuildFamilyPersistenceSurfaceInput,
  expectedStorageRole: FamilyPersistenceStorageRole,
  field: string,
) {
  const storageRole = requireString(input.storage_role, `${field}.storage_role`) as FamilyPersistenceStorageRole;
  if (storageRole !== expectedStorageRole) {
    throw new Error(`runtime/task companion ${field}.storage_role 必须是 ${expectedStorageRole}`);
  }
  return {
    surface_id: requireString(input.surface_id, `${field}.surface_id`),
    surface_role: requireString(input.surface_role, `${field}.surface_role`),
    storage_role: storageRole,
    owner: requireString(input.owner, `${field}.owner`),
    ref: requireRef(input.ref, `${field}.ref`),
    rebuild_from_refs: normalizeRefs(input.rebuild_from_refs, `${field}.rebuild_from_refs`),
  };
}

export function buildFamilyPersistencePolicy(input: BuildFamilyPersistencePolicyInput) {
  const authoritySurfaces = input.authority_surfaces.map((entry, index) =>
    buildFamilyPersistenceSurface(entry, 'file_authority', `authority_surfaces[${index}]`)
  );
  if (authoritySurfaces.length === 0) {
    throw new Error('runtime/task companion family_persistence_policy 至少需要一个 file_authority surface');
  }

  return {
    surface_kind: 'family_persistence_policy',
    version: 'family-persistence-policy.v1',
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    policy_id: requireString(input.policy_id, 'policy_id'),
    summary: requireString(input.summary, 'summary'),
    authority_surfaces: authoritySurfaces,
    sidecar_indexes: (input.sidecar_indexes ?? []).map((entry, index) =>
      buildFamilyPersistenceSurface(entry, 'sqlite_sidecar_index', `sidecar_indexes[${index}]`)
    ),
    projection_caches: (input.projection_caches ?? []).map((entry, index) =>
      buildFamilyPersistenceSurface(entry, 'projection_cache', `projection_caches[${index}]`)
    ),
    legacy_diagnostics: (input.legacy_diagnostics ?? []).map((entry, index) =>
      buildFamilyPersistenceSurface(entry, 'legacy_diagnostic_only', `legacy_diagnostics[${index}]`)
    ),
  };
}

function buildFamilyLifecycleAction(input: BuildFamilyLifecycleActionInput, field: string) {
  return {
    action_id: requireString(input.action_id, `${field}.action_id`),
    action_kind: requireString(input.action_kind, `${field}.action_kind`),
    target_ref: requireRef(input.target_ref, `${field}.target_ref`),
    authority_owner: requireString(input.authority_owner, `${field}.authority_owner`),
    safety_gate: requireString(input.safety_gate, `${field}.safety_gate`),
    result: requireString(input.result, `${field}.result`),
    manifest_ref: requireRef(input.manifest_ref, `${field}.manifest_ref`),
    sha256: requireSha256(input.sha256, `${field}.sha256`),
    restore_ref: requireRef(input.restore_ref, `${field}.restore_ref`),
  };
}

export function buildFamilyLifecycleLedger(input: BuildFamilyLifecycleLedgerInput) {
  const actions = input.actions.map((entry, index) => buildFamilyLifecycleAction(entry, `actions[${index}]`));
  if (actions.length === 0) {
    throw new Error('runtime/task companion family_lifecycle_ledger 至少需要一个 action');
  }
  return {
    surface_kind: 'family_lifecycle_ledger',
    version: 'family-lifecycle-ledger.v1',
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    ledger_id: requireString(input.ledger_id, 'ledger_id'),
    phase: requireString(input.phase, 'phase') as FamilyLifecyclePhase,
    status: requireString(input.status, 'status'),
    summary: requireString(input.summary, 'summary'),
    actions,
  };
}

export function buildFamilyOwnerRoute(input: BuildFamilyOwnerRouteInput) {
  const allowedActions = readStringList(input.allowed_actions, 'allowed_actions');
  if (allowedActions.length === 0) {
    throw new Error('runtime/task companion family_owner_route 至少需要一个 allowed action');
  }
  return {
    surface_kind: 'family_owner_route',
    version: 'family-owner-route.v1',
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    route_id: requireString(input.route_id, 'route_id'),
    route_epoch: requireString(input.route_epoch, 'route_epoch'),
    source_fingerprint: requireString(input.source_fingerprint, 'source_fingerprint'),
    next_owner: requireString(input.next_owner, 'next_owner'),
    allowed_actions: allowedActions,
    idempotency_key: requireString(input.idempotency_key, 'idempotency_key'),
    status: requireString(input.status, 'status'),
    summary: requireString(input.summary, 'summary'),
    handoff_refs: normalizeRefs(input.handoff_refs, 'handoff_refs'),
    projection_refs: normalizeRefs(input.projection_refs, 'projection_refs'),
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
