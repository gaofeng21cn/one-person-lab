import { spawnSync } from 'node:child_process';

import type {
  FamilyDomainEntryContractSurface,
  FamilySharedHandoffSurface,
  GatewayInteractionContractSurface,
} from './family-entry-contracts.ts';
import {
  validateFamilyDomainEntryContract,
  validateGatewayInteractionContract,
  validateSharedHandoff,
} from './family-entry-contracts.ts';
import type { GatewayContracts } from './types.ts';
import { normalizeManagedRuntimeContract } from './managed-runtime-contract.ts';
import { getActiveWorkspaceBinding, type WorkspaceBinding } from './workspace-registry.ts';

type JsonRecord = Record<string, unknown>;

export interface NormalizedSurfaceRef {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
}

export interface NormalizedTaskSurfaceDescriptor {
  surface_kind: string;
  summary: string;
  command: string | null;
  ref: NormalizedSurfaceRef | null;
  step_id: string | null;
  locator_fields: string[];
}

export interface NormalizedCheckpointSummary {
  surface_kind: 'checkpoint_summary';
  status: string;
  summary: string;
  checkpoint_id: string | null;
  recorded_at: string | null;
  lineage_ref: NormalizedSurfaceRef | null;
  verification_ref: NormalizedSurfaceRef | null;
}

export interface NormalizedRuntimeInventory {
  surface_kind: 'runtime_inventory';
  summary: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  substrate: string;
  availability: string;
  health_status: string;
  status_surface: NormalizedSurfaceRef | null;
  attention_surface: NormalizedSurfaceRef | null;
  recovery_surface: NormalizedSurfaceRef | null;
  workspace_binding: JsonRecord | null;
  domain_projection: JsonRecord | null;
}

export interface NormalizedTaskLifecycle {
  surface_kind: 'task_lifecycle';
  task_kind: string;
  task_id: string;
  status: string;
  summary: string;
  session_id: string | null;
  run_id: string | null;
  progress_surface: NormalizedTaskSurfaceDescriptor | null;
  resume_surface: NormalizedTaskSurfaceDescriptor | null;
  checkpoint_summary: NormalizedCheckpointSummary | null;
  human_gate_ids: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedSessionContinuity {
  surface_kind: 'session_continuity';
  summary: string;
  domain_agent_id: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  status: string;
  session_id: string | null;
  run_id: string | null;
  entry_surface: NormalizedTaskSurfaceDescriptor | null;
  progress_surface: NormalizedTaskSurfaceDescriptor | null;
  artifact_surface: NormalizedTaskSurfaceDescriptor | null;
  restore_surface: NormalizedTaskSurfaceDescriptor | null;
  checkpoint_summary: NormalizedCheckpointSummary | null;
  human_gate_ids: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedProgressProjection {
  surface_kind: 'progress_projection';
  headline: string;
  latest_update: string;
  next_step: string;
  status_summary: string;
  session_id: string | null;
  current_status: string | null;
  runtime_status: string | null;
  progress_surface: NormalizedTaskSurfaceDescriptor | null;
  artifact_surface: NormalizedTaskSurfaceDescriptor | null;
  inspect_paths: string[];
  attention_items: string[];
  human_gate_ids: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedArtifactFileDescriptor {
  file_id: string;
  label: string;
  kind: 'deliverable' | 'supporting';
  path: string;
  summary: string;
  ref: NormalizedSurfaceRef | null;
}

export interface NormalizedArtifactInventory {
  surface_kind: 'artifact_inventory';
  session_id: string | null;
  workspace_path: string | null;
  summary: {
    deliverable_files_count: number;
    supporting_files_count: number;
    total_files_count: number;
  };
  deliverable_files: NormalizedArtifactFileDescriptor[];
  supporting_files: NormalizedArtifactFileDescriptor[];
  progress_headline: string | null;
  artifact_surface: NormalizedTaskSurfaceDescriptor | null;
  inspect_paths: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedSkillDescriptor {
  surface_kind: 'skill_descriptor';
  skill_id: string;
  title: string;
  owner: string;
  distribution_mode: string;
  target_surface_kind: string;
  description: string;
  command: string | null;
  readiness: string;
  tags: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedSkillCatalog {
  surface_kind: 'skill_catalog';
  summary: string;
  skills: NormalizedSkillDescriptor[];
  supported_commands: string[];
  command_contracts: JsonRecord[];
}

export interface NormalizedAutomationDescriptor {
  surface_kind: 'automation_descriptor';
  automation_id: string;
  title: string;
  owner: string;
  trigger_kind: string;
  target_surface_kind: string;
  summary: string;
  readiness_status: string;
  gate_policy: string;
  output_expectation: string[];
  target_command: string | null;
  domain_projection: JsonRecord | null;
}

export interface NormalizedAutomationCatalog {
  surface_kind: 'automation';
  summary: string;
  automations: NormalizedAutomationDescriptor[];
  readiness_summary: string | null;
}

export type DomainManifestStatus =
  | 'not_bound'
  | 'manifest_not_configured'
  | 'command_failed'
  | 'invalid_json'
  | 'invalid_manifest'
  | 'resolved';

export interface NormalizedDomainManifest {
  surface_kind: string;
  manifest_version: number | string | null;
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: {
    default: string;
    supported_protocols: string[];
    internal_surface: string | null;
  };
  workspace_locator: JsonRecord;
  runtime: JsonRecord | null;
  managed_runtime_contract: {
    shared_contract_ref: string;
    runtime_owner: string;
    domain_owner: string;
    executor_owner: string;
    supervision_status_surface: {
      surface_kind: string;
      owner: string;
    };
    attention_queue_surface: {
      surface_kind: string;
      owner: string;
    };
    recovery_contract_surface: {
      surface_kind: string;
      owner: string;
    };
    fail_closed_rules: string[];
  } | null;
  repo_mainline: JsonRecord | null;
  product_entry_status: {
    summary: string | null;
    next_focus: string[];
    remaining_gaps_count: number | null;
  } | null;
  frontdesk_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  operator_loop_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  operator_loop_actions: Record<string, JsonRecord>;
  recommended_shell: string | null;
  recommended_command: string | null;
  schema_ref: string | null;
  domain_entry_contract: FamilyDomainEntryContractSurface | null;
  gateway_interaction_contract: GatewayInteractionContractSurface | null;
  product_entry_shell: Record<string, JsonRecord>;
  shared_handoff: FamilySharedHandoffSurface;
  product_entry_overview: {
    surface_kind: string;
    summary: string | null;
    frontdesk_command: string | null;
    recommended_command: string | null;
    operator_loop_command: string | null;
    progress_surface: {
      surface_kind: string | null;
      command: string | null;
      step_id: string | null;
    } | null;
    resume_surface: {
      surface_kind: string | null;
      command: string | null;
      session_locator_field: string | null;
      checkpoint_locator_field: string | null;
    } | null;
    recommended_step_id: string | null;
    next_focus: string[];
    remaining_gaps_count: number | null;
    human_gate_ids: string[];
  } | null;
  product_entry_preflight: {
    surface_kind: string;
    summary: string | null;
    ready_to_try_now: boolean | null;
    recommended_check_command: string | null;
    recommended_start_command: string | null;
    blocking_check_ids: string[];
    checks: Array<{
      check_id: string;
      title: string | null;
      status: string | null;
      blocking: boolean | null;
      summary: string | null;
      command: string | null;
    }>;
  } | null;
  product_entry_readiness: {
    surface_kind: string;
    verdict: string | null;
    usable_now: boolean | null;
    good_to_use_now: boolean | null;
    fully_automatic: boolean | null;
    user_experience_level: string | null;
    summary: string | null;
    recommended_start_surface: string | null;
    recommended_start_command: string | null;
    recommended_loop_surface: string | null;
    recommended_loop_command: string | null;
    workflow_coverage: Array<{
      step_id: string;
      manual_flow_label: string | null;
      coverage_status: string | null;
      current_surface: string | null;
      remaining_gap: string | null;
    }>;
    blocking_gaps: string[];
  } | null;
  grant_authoring_readiness: {
    surface_kind: string;
    verdict: string | null;
    usable_now: boolean | null;
    good_to_use_now: boolean | null;
    fully_automatic: boolean | null;
    user_experience_level: string | null;
    summary: string | null;
    recommended_start_surface: string | null;
    recommended_start_command: string | null;
    recommended_loop_surface: string | null;
    recommended_loop_command: string | null;
    workflow_coverage: Array<{
      step_id: string;
      manual_flow_label: string | null;
      coverage_status: string | null;
      current_surface: string | null;
      remaining_gap: string | null;
    }>;
    blocking_gaps: string[];
  } | null;
  product_entry_guardrails: {
    surface_kind: string;
    summary: string | null;
    guardrail_classes: Array<{
      guardrail_id: string;
      trigger: string | null;
      symptom: string | null;
      recommended_command: string | null;
    }>;
    recovery_loop: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
    }>;
  } | null;
  phase3_clearance_lane: {
    surface_kind: string;
    summary: string | null;
    recommended_step_id: string | null;
    recommended_command: string | null;
    clearance_targets: Array<{
      target_id: string;
      title: string | null;
      commands: string[];
    }>;
    clearance_loop: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
    }>;
    proof_surfaces: Array<{
      surface_kind: string | null;
      command: string | null;
      ref: string | null;
    }>;
    recommended_phase_command: string | null;
  } | null;
  phase4_backend_deconstruction: {
    surface_kind: string;
    summary: string | null;
    substrate_targets: Array<{
      capability_id: string;
      owner: string | null;
      summary: string | null;
    }>;
    backend_retained_now: string[];
    current_backend_chain: string[];
    optional_executor_proofs: JsonRecord[];
    promotion_rules: string[];
    deconstruction_map_doc: string | null;
    recommended_phase_command: string | null;
  } | null;
  phase5_platform_target: {
    surface_kind: string;
    summary: string | null;
    sequence_scope: string | null;
    current_step_id: string | null;
    current_readiness_summary: string | null;
    north_star_topology: JsonRecord | null;
    target_internal_modules: string[];
    landing_sequence: Array<{
      step_id: string;
      title: string | null;
      phase_id: string | null;
      status: string | null;
      summary: string | null;
    }>;
    completed_step_ids: string[];
    remaining_step_ids: string[];
    promotion_gates: string[];
    recommended_phase_command: string | null;
    land_now: string[];
    not_yet: string[];
  } | null;
  product_entry_start: {
    surface_kind: string;
    summary: string | null;
    recommended_mode_id: string | null;
    modes: Array<{
      mode_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
      summary: string | null;
      requires: string[];
    }>;
    resume_surface: {
      surface_kind: string | null;
      command: string | null;
      session_locator_field: string | null;
      checkpoint_locator_field: string | null;
    } | null;
    human_gate_ids: string[];
  } | null;
  product_entry_quickstart: {
    surface_kind: string;
    summary: string | null;
    recommended_step_id: string | null;
    steps: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
      summary: string | null;
      requires: string[];
    }>;
    resume_contract: JsonRecord | null;
    human_gate_ids: string[];
  } | null;
  family_orchestration: {
    action_graph_ref: JsonRecord | null;
    action_graph: JsonRecord | null;
    human_gates: JsonRecord[];
    resume_contract: JsonRecord | null;
    event_envelope_surface: JsonRecord | null;
    checkpoint_lineage_surface: JsonRecord | null;
  } | null;
  runtime_inventory: NormalizedRuntimeInventory | null;
  task_lifecycle: NormalizedTaskLifecycle | null;
  session_continuity: NormalizedSessionContinuity | null;
  progress_projection: NormalizedProgressProjection | null;
  artifact_inventory: NormalizedArtifactInventory | null;
  skill_catalog: NormalizedSkillCatalog | null;
  automation: NormalizedAutomationCatalog | null;
  remaining_gaps: string[];
  notes: string[];
}

export interface DomainManifestCatalogEntry {
  project_id: string;
  project: string;
  binding_id: string | null;
  workspace_path: string | null;
  manifest_command: string | null;
  status: DomainManifestStatus;
  manifest: NormalizedDomainManifest | null;
  error: {
    code: string;
    message: string;
    stdout: string | null;
    stderr: string | null;
  } | null;
}

type DomainManifestErrorCode = 'command_failed' | 'invalid_json' | 'invalid_manifest';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function readStringList(value: unknown, _field?: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Missing required object field: ${field}`);
  }
  return value;
}

function normalizeRecordMap(value: unknown, field: string) {
  const record = requireRecord(value, field);
  const normalized: Record<string, JsonRecord> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (!isRecord(entry)) {
      throw new Error(`Field ${field}.${key} must be an object.`);
    }
    normalized[key] = entry;
  }

  return normalized;
}

function normalizeRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Field ${field}[${index}] must be an object.`);
    }
    return entry;
  });
}

function requireSurfaceKind(value: unknown, field: string, expected: string) {
  const surfaceKind = requireString(value, `${field}.surface_kind`);
  if (surfaceKind !== expected) {
    throw new Error(`${field}.surface_kind must be ${expected}.`);
  }
  return surfaceKind;
}

function normalizeSurfaceRef(value: unknown, field: string): NormalizedSurfaceRef | null {
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

function normalizeTaskSurfaceDescriptor(value: unknown, field: string): NormalizedTaskSurfaceDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    summary: requireString(value.summary, `${field}.summary`),
    command: optionalString(value.command),
    ref: normalizeSurfaceRef(value.ref, `${field}.ref`),
    step_id: optionalString(value.step_id),
    locator_fields: readStringList(value.locator_fields, `${field}.locator_fields`),
  };
}

function normalizeCheckpointSummary(value: unknown, field: string): NormalizedCheckpointSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, field, 'checkpoint_summary');

  return {
    surface_kind: 'checkpoint_summary',
    status: requireString(value.status, `${field}.status`),
    summary: requireString(value.summary, `${field}.summary`),
    checkpoint_id: optionalString(value.checkpoint_id),
    recorded_at: optionalString(value.recorded_at),
    lineage_ref: normalizeSurfaceRef(value.lineage_ref, `${field}.lineage_ref`),
    verification_ref: normalizeSurfaceRef(value.verification_ref, `${field}.verification_ref`),
  };
}

function normalizeRuntimeInventory(value: unknown): NormalizedRuntimeInventory | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'runtime_inventory', 'runtime_inventory');

  return {
    surface_kind: 'runtime_inventory',
    summary: requireString(value.summary, 'runtime_inventory.summary'),
    runtime_owner: requireString(value.runtime_owner, 'runtime_inventory.runtime_owner'),
    domain_owner: requireString(value.domain_owner, 'runtime_inventory.domain_owner'),
    executor_owner: requireString(value.executor_owner, 'runtime_inventory.executor_owner'),
    substrate: requireString(value.substrate, 'runtime_inventory.substrate'),
    availability: requireString(value.availability, 'runtime_inventory.availability'),
    health_status: requireString(value.health_status, 'runtime_inventory.health_status'),
    status_surface: normalizeSurfaceRef(value.status_surface, 'runtime_inventory.status_surface'),
    attention_surface: normalizeSurfaceRef(value.attention_surface, 'runtime_inventory.attention_surface'),
    recovery_surface: normalizeSurfaceRef(value.recovery_surface, 'runtime_inventory.recovery_surface'),
    workspace_binding: isRecord(value.workspace_binding) ? value.workspace_binding : null,
    domain_projection: isRecord(value.domain_projection) ? value.domain_projection : null,
  };
}

function normalizeTaskLifecycle(value: unknown): NormalizedTaskLifecycle | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'task_lifecycle', 'task_lifecycle');

  return {
    surface_kind: 'task_lifecycle',
    task_kind: requireString(value.task_kind, 'task_lifecycle.task_kind'),
    task_id: requireString(value.task_id, 'task_lifecycle.task_id'),
    status: requireString(value.status, 'task_lifecycle.status'),
    summary: requireString(value.summary, 'task_lifecycle.summary'),
    session_id:
      optionalString(value.session_id)
      ?? optionalString(value.grant_run_id)
      ?? optionalString(value.entry_session_id),
    run_id: optionalString(value.run_id),
    progress_surface: normalizeTaskSurfaceDescriptor(value.progress_surface, 'task_lifecycle.progress_surface'),
    resume_surface: normalizeTaskSurfaceDescriptor(value.resume_surface, 'task_lifecycle.resume_surface'),
    checkpoint_summary: normalizeCheckpointSummary(value.checkpoint_summary, 'task_lifecycle.checkpoint_summary'),
    human_gate_ids: readStringList(value.human_gate_ids, 'task_lifecycle.human_gate_ids'),
    domain_projection: isRecord(value.domain_projection) ? value.domain_projection : null,
  };
}

function buildInlineTaskSurfaceDescriptor(value: {
  surface_kind: string;
  summary: string;
  command?: string | null;
  ref?: NormalizedSurfaceRef | null;
  step_id?: string | null;
  locator_fields?: string[];
} | null): NormalizedTaskSurfaceDescriptor | null {
  if (!value) {
    return null;
  }

  return {
    surface_kind: value.surface_kind,
    summary: value.summary,
    command: value.command ?? null,
    ref: value.ref ?? null,
    step_id: value.step_id ?? null,
    locator_fields: value.locator_fields ?? [],
  };
}

function normalizeSessionContinuity(
  value: unknown,
  options: {
    domainAgentId: string | null;
    runtimeInventory: NormalizedRuntimeInventory | null;
    taskLifecycle: NormalizedTaskLifecycle | null;
    productEntryOverview: NormalizedDomainManifest['product_entry_overview'];
    productEntryStatus: NormalizedDomainManifest['product_entry_status'];
  },
): NormalizedSessionContinuity | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'session_continuity', 'session_continuity');
  const runtimeEntries = isRecord(value.runtime_entries) ? value.runtime_entries : null;
  const runtimeRun = isRecord(runtimeEntries?.runtime_run)
    ? buildInlineTaskSurfaceDescriptor({
        surface_kind: requireString(runtimeEntries.runtime_run.surface_kind, 'session_continuity.runtime_entries.runtime_run.surface_kind'),
        summary: requireString(runtimeEntries.runtime_run.summary, 'session_continuity.runtime_entries.runtime_run.summary'),
        command: optionalString(runtimeEntries.runtime_run.command),
      })
    : null;
  const runtimeResume = isRecord(runtimeEntries?.runtime_resume)
    ? buildInlineTaskSurfaceDescriptor({
        surface_kind: requireString(runtimeEntries.runtime_resume.surface_kind, 'session_continuity.runtime_entries.runtime_resume.surface_kind'),
        summary: requireString(runtimeEntries.runtime_resume.summary, 'session_continuity.runtime_entries.runtime_resume.summary'),
        command: optionalString(runtimeEntries.runtime_resume.command),
      })
    : null;
  const descriptorCommand = optionalString(value.session_command_template);
  const descriptorRestoreSurface = descriptorCommand
    ? buildInlineTaskSurfaceDescriptor({
        surface_kind: 'product_entry_session',
        summary: 'Read the repo-owned same-session continuity surface.',
        command: descriptorCommand,
      })
    : null;
  const derivedProgressSurface =
    buildInlineTaskSurfaceDescriptor({
      surface_kind: options.productEntryOverview?.progress_surface?.surface_kind ?? 'progress_surface',
      summary: 'Inspect the repo-owned runtime progress surface.',
      command: options.productEntryOverview?.progress_surface?.command ?? null,
      step_id: options.productEntryOverview?.progress_surface?.step_id ?? null,
    })
    ?? null;
  const domainProjection =
    isRecord(value.domain_projection)
      ? value.domain_projection
      : isRecord(value.repo_owned_truth)
        ? value.repo_owned_truth
        : isRecord(value.runtime_entries)
          ? value.runtime_entries
          : null;

  return {
    surface_kind: 'session_continuity',
    summary:
      optionalString(value.summary)
      ?? options.productEntryStatus?.summary
      ?? options.taskLifecycle?.summary
      ?? 'Repo-owned session continuity is available.',
    domain_agent_id: optionalString(value.domain_agent_id) ?? options.domainAgentId ?? 'unknown',
    runtime_owner:
      optionalString(value.runtime_owner)
      ?? options.runtimeInventory?.runtime_owner
      ?? 'unknown',
    domain_owner:
      optionalString(value.domain_owner)
      ?? options.runtimeInventory?.domain_owner
      ?? 'unknown',
    executor_owner:
      optionalString(value.executor_owner)
      ?? options.runtimeInventory?.executor_owner
      ?? 'unknown',
    status:
      optionalString(value.status)
      ?? optionalString(value.lifecycle_stage)
      ?? options.taskLifecycle?.status
      ?? 'available',
    session_id:
      optionalString(value.session_id)
      ?? optionalString(value.grant_run_id)
      ?? optionalString(value.entry_session_id),
    run_id: optionalString(value.run_id),
    entry_surface:
      normalizeTaskSurfaceDescriptor(value.entry_surface, 'session_continuity.entry_surface')
      ?? runtimeRun,
    progress_surface:
      normalizeTaskSurfaceDescriptor(value.progress_surface, 'session_continuity.progress_surface')
      ?? derivedProgressSurface,
    artifact_surface:
      normalizeTaskSurfaceDescriptor(value.artifact_surface, 'session_continuity.artifact_surface')
      ?? descriptorRestoreSurface,
    restore_surface:
      normalizeTaskSurfaceDescriptor(value.restore_surface, 'session_continuity.restore_surface')
      ?? runtimeResume
      ?? descriptorRestoreSurface
      ?? options.taskLifecycle?.resume_surface
      ?? null,
    checkpoint_summary: normalizeCheckpointSummary(
      value.checkpoint_summary,
      'session_continuity.checkpoint_summary',
    )
      ?? options.taskLifecycle?.checkpoint_summary
      ?? null,
    human_gate_ids:
      readStringList(value.human_gate_ids, 'session_continuity.human_gate_ids').length > 0
        ? readStringList(value.human_gate_ids, 'session_continuity.human_gate_ids')
        : options.taskLifecycle?.human_gate_ids ?? [],
    domain_projection: domainProjection,
  };
}

function normalizeProgressProjection(
  value: unknown,
  options: {
    runtimeInventory: NormalizedRuntimeInventory | null;
    taskLifecycle: NormalizedTaskLifecycle | null;
    productEntryOverview: NormalizedDomainManifest['product_entry_overview'];
    productEntryStatus: NormalizedDomainManifest['product_entry_status'];
  },
): NormalizedProgressProjection | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'progress_projection', 'progress_projection');
  const projection = isRecord(value.projection) ? value.projection : null;
  const truthAnchors = isRecord(value.truth_anchors) ? value.truth_anchors : null;
  const inspectProgressAnchor = isRecord(truthAnchors?.inspect_progress) ? truthAnchors.inspect_progress : null;
  const progressSurface =
    normalizeTaskSurfaceDescriptor(value.progress_surface, 'progress_projection.progress_surface')
    ?? (
      inspectProgressAnchor && optionalString(inspectProgressAnchor.ref_kind) === 'command'
        ? buildInlineTaskSurfaceDescriptor({
            surface_kind: options.productEntryOverview?.progress_surface?.surface_kind ?? 'progress_projection',
            summary: 'Inspect the repo-owned runtime progress projection.',
            command: optionalString(inspectProgressAnchor.ref),
          })
        : buildInlineTaskSurfaceDescriptor({
            surface_kind: options.productEntryOverview?.progress_surface?.surface_kind ?? 'progress_projection',
            summary: 'Inspect the repo-owned runtime progress projection.',
            command: options.productEntryOverview?.progress_surface?.command ?? null,
          })
    );
  const artifactSurface =
    normalizeTaskSurfaceDescriptor(value.artifact_surface, 'progress_projection.artifact_surface')
    ?? options.taskLifecycle?.resume_surface
    ?? null;
  const inspectPaths = readStringList(value.inspect_paths, 'progress_projection.inspect_paths');
  if (inspectPaths.length === 0 && truthAnchors) {
    for (const anchor of Object.values(truthAnchors)) {
      if (isRecord(anchor) && optionalString(anchor.ref_kind) === 'path' && optionalString(anchor.ref)) {
        inspectPaths.push(optionalString(anchor.ref)!);
      }
    }
  }
  const attentionItems = readStringList(value.attention_items, 'progress_projection.attention_items');
  if (attentionItems.length === 0 && Array.isArray(projection?.current_blockers)) {
    for (const item of projection.current_blockers) {
      if (typeof item === 'string' && item.trim()) {
        attentionItems.push(item.trim());
      }
    }
  }
  const projectionStatusNarration = isRecord(projection?.status_narration_contract)
    ? projection.status_narration_contract
    : null;

  return {
    surface_kind: 'progress_projection',
    headline:
      optionalString(value.headline)
      ?? optionalString(projectionStatusNarration?.latest_update)
      ?? optionalString(projection?.current_stage_summary)
      ?? optionalString(value.summary)
      ?? options.productEntryStatus?.summary
      ?? 'Repo-owned runtime progress projection is available.',
    latest_update:
      optionalString(value.latest_update)
      ?? optionalString(projectionStatusNarration?.latest_update)
      ?? optionalString(projection?.current_stage_summary)
      ?? optionalString(value.summary)
      ?? options.productEntryStatus?.summary
      ?? '当前还没有新的进度更新时间。',
    next_step:
      optionalString(value.next_step)
      ?? optionalString(projection?.next_system_action)
      ?? options.taskLifecycle?.resume_surface?.summary
      ?? '继续查看当前 runtime progress。',
    status_summary:
      optionalString(value.status_summary)
      ?? optionalString(projectionStatusNarration?.summary)
      ?? optionalString(value.summary)
      ?? options.productEntryStatus?.summary
      ?? '当前还没有结构化状态摘要。',
    session_id:
      optionalString(value.session_id)
      ?? optionalString(value.grant_run_id)
      ?? optionalString(value.entry_session_id),
    current_status:
      optionalString(value.current_status)
      ?? optionalString(projection?.current_stage)
      ?? options.taskLifecycle?.status
      ?? null,
    runtime_status:
      optionalString(value.runtime_status)
      ?? options.runtimeInventory?.health_status
      ?? null,
    progress_surface: progressSurface,
    artifact_surface: artifactSurface,
    inspect_paths: inspectPaths,
    attention_items: attentionItems,
    human_gate_ids:
      readStringList(value.human_gate_ids, 'progress_projection.human_gate_ids').length > 0
        ? readStringList(value.human_gate_ids, 'progress_projection.human_gate_ids')
        : options.taskLifecycle?.human_gate_ids ?? [],
    domain_projection:
      isRecord(value.domain_projection)
      ? value.domain_projection
      : projection,
  };
}

function normalizeArtifactFileDescriptor(
  value: unknown,
  field: string,
): NormalizedArtifactFileDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = requireString(value.kind, `${field}.kind`);
  if (kind !== 'deliverable' && kind !== 'supporting') {
    throw new Error(`${field}.kind must be deliverable or supporting.`);
  }

  return {
    file_id: requireString(value.file_id, `${field}.file_id`),
    label: requireString(value.label, `${field}.label`),
    kind,
    path: requireString(value.path, `${field}.path`),
    summary: requireString(value.summary, `${field}.summary`),
    ref: normalizeSurfaceRef(value.ref, `${field}.ref`),
  };
}

function normalizeArtifactInventory(
  value: unknown,
  options: {
    progressProjection: NormalizedProgressProjection | null;
    sessionContinuity: NormalizedSessionContinuity | null;
  },
): NormalizedArtifactInventory | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'artifact_inventory', 'artifact_inventory');
  const deliverableFiles = normalizeRecordList(value.deliverable_files, 'artifact_inventory.deliverable_files')
    .map((entry, index) => normalizeArtifactFileDescriptor(entry, `artifact_inventory.deliverable_files[${index}]`))
    .filter((entry): entry is NormalizedArtifactFileDescriptor => entry !== null);
  const supportingFileCandidates: Array<NormalizedArtifactFileDescriptor | null> = [
    ...normalizeRecordList(value.supporting_files, 'artifact_inventory.supporting_files').map(
      (entry, index) =>
        normalizeArtifactFileDescriptor(entry, `artifact_inventory.supporting_files[${index}]`),
    ),
    ...normalizeRecordList(value.artifacts, 'artifact_inventory.artifacts').map((entry, index) => {
      if (!isRecord(entry)) {
        return null;
      }
      const ref = isRecord(entry.ref) ? entry.ref : null;
      return {
        file_id: requireString(entry.artifact_kind, `artifact_inventory.artifacts[${index}].artifact_kind`),
        label: requireString(entry.label, `artifact_inventory.artifacts[${index}].label`),
        kind: 'supporting' as const,
        path: optionalString(ref?.ref) ?? `artifact_inventory:${index}`,
        summary: requireString(entry.label, `artifact_inventory.artifacts[${index}].label`),
        ref: normalizeSurfaceRef(ref, `artifact_inventory.artifacts[${index}].ref`),
      };
    }),
  ];
  const supportingFiles = supportingFileCandidates.filter(
    (entry): entry is NormalizedArtifactFileDescriptor => entry !== null,
  );
  const summary = isRecord(value.summary) ? value.summary : {};
  const inspectPaths = readStringList(value.inspect_paths, 'artifact_inventory.inspect_paths');
  if (inspectPaths.length === 0) {
    for (const entry of [...deliverableFiles, ...supportingFiles]) {
      if (entry.path) {
        inspectPaths.push(entry.path);
      }
    }
  }
  const artifactSurface =
    normalizeTaskSurfaceDescriptor(value.artifact_surface, 'artifact_inventory.artifact_surface')
    ?? options.sessionContinuity?.artifact_surface
    ?? options.sessionContinuity?.restore_surface
    ?? null;

  return {
    surface_kind: 'artifact_inventory',
    session_id: optionalString(value.session_id),
    workspace_path: optionalString(value.workspace_path),
    summary: {
      deliverable_files_count:
        typeof summary.deliverable_files_count === 'number'
          ? summary.deliverable_files_count
          : deliverableFiles.length,
      supporting_files_count:
        typeof summary.supporting_files_count === 'number'
          ? summary.supporting_files_count
          : supportingFiles.length,
      total_files_count:
        typeof summary.total_files_count === 'number'
          ? summary.total_files_count
          : deliverableFiles.length + supportingFiles.length,
    },
    deliverable_files: deliverableFiles,
    supporting_files: supportingFiles,
    progress_headline:
      optionalString(value.progress_headline)
      ?? options.progressProjection?.headline
      ?? optionalString(value.summary)
      ?? null,
    artifact_surface: artifactSurface,
    inspect_paths: inspectPaths,
    domain_projection:
      isRecord(value.domain_projection)
      ? value.domain_projection
      : isRecord(value.repo_owned_truth)
        ? value.repo_owned_truth
        : null,
  };
}

function normalizeSkillCatalog(value: unknown): NormalizedSkillCatalog | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'skill_catalog', 'skill_catalog');

  return {
    surface_kind: 'skill_catalog',
    summary: requireString(value.summary, 'skill_catalog.summary'),
    skills: normalizeRecordList(value.skills, 'skill_catalog.skills').map((skill, index) => {
      requireSurfaceKind(skill.surface_kind, `skill_catalog.skills[${index}]`, 'skill_descriptor');
      return {
        surface_kind: 'skill_descriptor',
        skill_id: requireString(skill.skill_id, `skill_catalog.skills[${index}].skill_id`),
        title: requireString(skill.title, `skill_catalog.skills[${index}].title`),
        owner: requireString(skill.owner, `skill_catalog.skills[${index}].owner`),
        distribution_mode: requireString(
          skill.distribution_mode,
          `skill_catalog.skills[${index}].distribution_mode`,
        ),
        target_surface_kind: requireString(
          skill.target_surface_kind,
          `skill_catalog.skills[${index}].target_surface_kind`,
        ),
        description: requireString(skill.description, `skill_catalog.skills[${index}].description`),
        command: optionalString(skill.command),
        readiness: requireString(skill.readiness, `skill_catalog.skills[${index}].readiness`),
        tags: readStringList(skill.tags, `skill_catalog.skills[${index}].tags`),
        domain_projection: isRecord(skill.domain_projection) ? skill.domain_projection : null,
      };
    }),
    supported_commands: readStringList(value.supported_commands, 'skill_catalog.supported_commands'),
    command_contracts: normalizeRecordList(value.command_contracts, 'skill_catalog.command_contracts'),
  };
}

function normalizeAutomationCatalog(value: unknown): NormalizedAutomationCatalog | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, 'automation', 'automation');

  return {
    surface_kind: 'automation',
    summary: requireString(value.summary, 'automation.summary'),
    automations: normalizeRecordList(value.automations, 'automation.automations').map((entry, index) => {
      requireSurfaceKind(entry.surface_kind, `automation.automations[${index}]`, 'automation_descriptor');
      return {
        surface_kind: 'automation_descriptor',
        automation_id: requireString(entry.automation_id, `automation.automations[${index}].automation_id`),
        title: requireString(entry.title, `automation.automations[${index}].title`),
        owner: requireString(entry.owner, `automation.automations[${index}].owner`),
        trigger_kind: requireString(entry.trigger_kind, `automation.automations[${index}].trigger_kind`),
        target_surface_kind: requireString(
          entry.target_surface_kind,
          `automation.automations[${index}].target_surface_kind`,
        ),
        summary: requireString(entry.summary, `automation.automations[${index}].summary`),
        readiness_status: requireString(
          entry.readiness_status,
          `automation.automations[${index}].readiness_status`,
        ),
        gate_policy: requireString(entry.gate_policy, `automation.automations[${index}].gate_policy`),
        output_expectation: readStringList(
          entry.output_expectation,
          `automation.automations[${index}].output_expectation`,
        ),
        target_command: optionalString(entry.target_command),
        domain_projection: isRecord(entry.domain_projection) ? entry.domain_projection : null,
      };
    }),
    readiness_summary: optionalString(value.readiness_summary),
  };
}

function unwrapManifestPayload(payload: JsonRecord) {
  if (isRecord(payload.product_entry_manifest)) {
    return payload.product_entry_manifest;
  }
  return payload;
}

function normalizeShellSurface(
  value: unknown,
  options: {
    field: string;
    productEntryShell: Record<string, JsonRecord>;
  },
) {
  const { field, productEntryShell } = options;

  if (!isRecord(value)) {
    return null;
  }

  const shellKey = requireString(value.shell_key, `${field}.shell_key`);
  if (!productEntryShell[shellKey]) {
    throw new Error(`${field}.shell_key points at unknown shell key: ${shellKey}`);
  }

  const explicitCommand = optionalString(value.command);
  const derivedCommand = optionalString(productEntryShell[shellKey]?.command);
  if (explicitCommand && derivedCommand && explicitCommand !== derivedCommand) {
    throw new Error(`${field}.command must match the command declared by ${field}.shell_key.`);
  }

  return {
    shell_key: shellKey,
    command: explicitCommand ?? derivedCommand,
    surface_kind:
      optionalString(value.surface_kind)
      ?? optionalString(productEntryShell[shellKey]?.surface_kind),
    summary: optionalString(value.summary),
    continuation_shell_key: optionalString(value.continuation_shell_key),
    continuation_command: optionalString(value.continuation_command),
  };
}

function normalizeProductEntryQuickstart(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const steps = normalizeRecordList(value.steps, 'product_entry_quickstart.steps').map((step, index) => ({
    step_id: requireString(step.step_id, `product_entry_quickstart.steps[${index}].step_id`),
    title: optionalString(step.title),
    command: optionalString(step.command),
    surface_kind: optionalString(step.surface_kind),
    summary: optionalString(step.summary),
    requires: readStringList(step.requires),
  }));
  const recommendedStepId = optionalString(value.recommended_step_id);

  if (recommendedStepId && !steps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error('product_entry_quickstart.recommended_step_id must reference an existing step_id.');
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_quickstart',
    summary: optionalString(value.summary),
    recommended_step_id: recommendedStepId,
    steps,
    resume_contract: isRecord(value.resume_contract) ? value.resume_contract : null,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

function normalizeProductEntryOverview(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const progressSurface = isRecord(value.progress_surface)
    ? {
        surface_kind: optionalString(value.progress_surface.surface_kind),
        command: optionalString(value.progress_surface.command),
        step_id: optionalString(value.progress_surface.step_id),
      }
    : null;
  const resumeSurface = isRecord(value.resume_surface)
    ? {
        surface_kind: optionalString(value.resume_surface.surface_kind),
        command: optionalString(value.resume_surface.command),
        session_locator_field: optionalString(value.resume_surface.session_locator_field),
        checkpoint_locator_field: optionalString(value.resume_surface.checkpoint_locator_field),
      }
    : null;

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_overview',
    summary: optionalString(value.summary),
    frontdesk_command: optionalString(value.frontdesk_command),
    recommended_command: optionalString(value.recommended_command),
    operator_loop_command: optionalString(value.operator_loop_command),
    progress_surface: progressSurface,
    resume_surface: resumeSurface,
    recommended_step_id: optionalString(value.recommended_step_id),
    next_focus: readStringList(value.next_focus),
    remaining_gaps_count: typeof value.remaining_gaps_count === 'number' ? value.remaining_gaps_count : null,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

function normalizeProductEntryPreflight(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const checks = normalizeRecordList(value.checks, 'product_entry_preflight.checks').map((check, index) => ({
    check_id: requireString(check.check_id, `product_entry_preflight.checks[${index}].check_id`),
    title: optionalString(check.title),
    status: optionalString(check.status),
    blocking: typeof check.blocking === 'boolean' ? check.blocking : null,
    summary: optionalString(check.summary),
    command: optionalString(check.command),
  }));

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_preflight',
    summary: optionalString(value.summary),
    ready_to_try_now: typeof value.ready_to_try_now === 'boolean' ? value.ready_to_try_now : null,
    recommended_check_command: optionalString(value.recommended_check_command),
    recommended_start_command: optionalString(value.recommended_start_command),
    blocking_check_ids: readStringList(value.blocking_check_ids),
    checks,
  };
}

function normalizeDetailedReadinessSurface(value: unknown, fallbackSurfaceKind: string) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? fallbackSurfaceKind,
    verdict: optionalString(value.verdict),
    usable_now: typeof value.usable_now === 'boolean' ? value.usable_now : null,
    good_to_use_now: typeof value.good_to_use_now === 'boolean' ? value.good_to_use_now : null,
    fully_automatic: typeof value.fully_automatic === 'boolean' ? value.fully_automatic : null,
    user_experience_level: optionalString(value.user_experience_level),
    summary: optionalString(value.summary),
    recommended_start_surface: optionalString(value.recommended_start_surface),
    recommended_start_command: optionalString(value.recommended_start_command),
    recommended_loop_surface: optionalString(value.recommended_loop_surface),
    recommended_loop_command: optionalString(value.recommended_loop_command),
    workflow_coverage: normalizeRecordList(value.workflow_coverage, `${fallbackSurfaceKind}.workflow_coverage`).map((entry, index) => ({
      step_id: requireString(entry.step_id, `${fallbackSurfaceKind}.workflow_coverage[${index}].step_id`),
      manual_flow_label: optionalString(entry.manual_flow_label),
      coverage_status: optionalString(entry.coverage_status),
      current_surface: optionalString(entry.current_surface),
      remaining_gap: optionalString(entry.remaining_gap),
    })),
    blocking_gaps: readStringList(value.blocking_gaps),
  };
}

function normalizeProductEntryReadiness(value: unknown) {
  return normalizeDetailedReadinessSurface(value, 'product_entry_readiness');
}

function normalizeProductEntryGuardrails(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_guardrails',
    summary: optionalString(value.summary),
    guardrail_classes: normalizeRecordList(value.guardrail_classes, 'product_entry_guardrails.guardrail_classes').map((entry, index) => ({
      guardrail_id: requireString(entry.guardrail_id, `product_entry_guardrails.guardrail_classes[${index}].guardrail_id`),
      trigger: optionalString(entry.trigger),
      symptom: optionalString(entry.symptom),
      recommended_command: optionalString(entry.recommended_command),
    })),
    recovery_loop: normalizeRecordList(value.recovery_loop, 'product_entry_guardrails.recovery_loop').map((entry, index) => ({
      step_id: requireString(entry.step_id, `product_entry_guardrails.recovery_loop[${index}].step_id`),
      title: optionalString(entry.title),
      command: optionalString(entry.command),
      surface_kind: optionalString(entry.surface_kind),
    })),
  };
}

function normalizeClearanceLane(value: unknown, fallbackSurfaceKind: string) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? fallbackSurfaceKind,
    summary: optionalString(value.summary),
    recommended_step_id: optionalString(value.recommended_step_id),
    recommended_command: optionalString(value.recommended_command),
    clearance_targets: normalizeRecordList(value.clearance_targets, `${fallbackSurfaceKind}.clearance_targets`).map((entry, index) => ({
      target_id: requireString(entry.target_id, `${fallbackSurfaceKind}.clearance_targets[${index}].target_id`),
      title: optionalString(entry.title),
      commands: readStringList(entry.commands),
    })),
    clearance_loop: normalizeRecordList(value.clearance_loop, `${fallbackSurfaceKind}.clearance_loop`).map((entry, index) => ({
      step_id: requireString(entry.step_id, `${fallbackSurfaceKind}.clearance_loop[${index}].step_id`),
      title: optionalString(entry.title),
      command: optionalString(entry.command),
      surface_kind: optionalString(entry.surface_kind),
    })),
    proof_surfaces: normalizeRecordList(value.proof_surfaces, `${fallbackSurfaceKind}.proof_surfaces`).map((entry) => ({
      surface_kind: optionalString(entry.surface_kind),
      command: optionalString(entry.command),
      ref: optionalString(entry.ref),
    })),
    recommended_phase_command: optionalString(value.recommended_phase_command),
  };
}

function normalizeBackendDeconstructionLane(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'phase4_backend_deconstruction_lane',
    summary: optionalString(value.summary),
    substrate_targets: normalizeRecordList(value.substrate_targets, 'phase4_backend_deconstruction_lane.substrate_targets').map((entry, index) => ({
      capability_id: requireString(entry.capability_id, `phase4_backend_deconstruction_lane.substrate_targets[${index}].capability_id`),
      owner: optionalString(entry.owner),
      summary: optionalString(entry.summary),
    })),
    backend_retained_now: readStringList(value.backend_retained_now),
    current_backend_chain: readStringList(value.current_backend_chain),
    optional_executor_proofs: normalizeRecordList(value.optional_executor_proofs, 'phase4_backend_deconstruction_lane.optional_executor_proofs'),
    promotion_rules: readStringList(value.promotion_rules),
    deconstruction_map_doc: optionalString(value.deconstruction_map_doc),
    recommended_phase_command: optionalString(value.recommended_phase_command),
  };
}

function normalizePlatformTarget(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'phase5_platform_target',
    summary: optionalString(value.summary),
    sequence_scope: optionalString(value.sequence_scope),
    current_step_id: optionalString(value.current_step_id),
    current_readiness_summary: optionalString(value.current_readiness_summary),
    north_star_topology: isRecord(value.north_star_topology) ? value.north_star_topology : null,
    target_internal_modules: readStringList(value.target_internal_modules),
    landing_sequence: normalizeRecordList(value.landing_sequence, 'phase5_platform_target.landing_sequence').map((entry, index) => ({
      step_id: requireString(entry.step_id, `phase5_platform_target.landing_sequence[${index}].step_id`),
      title: optionalString(entry.title),
      phase_id: optionalString(entry.phase_id),
      status: optionalString(entry.status),
      summary: optionalString(entry.summary),
    })),
    completed_step_ids: readStringList(value.completed_step_ids),
    remaining_step_ids: readStringList(value.remaining_step_ids),
    promotion_gates: readStringList(value.promotion_gates),
    recommended_phase_command: optionalString(value.recommended_phase_command),
    land_now: readStringList(value.land_now),
    not_yet: readStringList(value.not_yet),
  };
}

function normalizeProductEntryStart(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const modes = normalizeRecordList(value.modes, 'product_entry_start.modes').map((mode, index) => ({
    mode_id: requireString(mode.mode_id, `product_entry_start.modes[${index}].mode_id`),
    title: optionalString(mode.title),
    command: optionalString(mode.command),
    surface_kind: optionalString(mode.surface_kind),
    summary: optionalString(mode.summary),
    requires: readStringList(mode.requires),
  }));
  const recommendedModeId = optionalString(value.recommended_mode_id);

  if (recommendedModeId && !modes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error('product_entry_start.recommended_mode_id must reference an existing mode_id.');
  }

  const resumeSurface = isRecord(value.resume_surface)
    ? {
        surface_kind: optionalString(value.resume_surface.surface_kind),
        command: optionalString(value.resume_surface.command),
        session_locator_field: optionalString(value.resume_surface.session_locator_field),
        checkpoint_locator_field: optionalString(value.resume_surface.checkpoint_locator_field),
      }
    : null;

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_start',
    summary: optionalString(value.summary),
    recommended_mode_id: recommendedModeId,
    modes,
    resume_surface: resumeSurface,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

function normalizeManifest(payload: JsonRecord): NormalizedDomainManifest {
  const manifest = unwrapManifestPayload(payload);
  const formalEntry = requireRecord(manifest.formal_entry, 'formal_entry');
  const productEntryShell = normalizeRecordMap(manifest.product_entry_shell, 'product_entry_shell');
  const sharedHandoff = validateSharedHandoff(manifest.shared_handoff, 'shared_handoff');
  const recommendedShell = optionalString(manifest.recommended_shell);
  const explicitRecommendedCommand = optionalString(manifest.recommended_command);
  const derivedRecommendedCommand = recommendedShell
    ? optionalString(productEntryShell[recommendedShell]?.command)
    : null;
  const frontdeskSurface = normalizeShellSurface(manifest.frontdesk_surface, {
    field: 'frontdesk_surface',
    productEntryShell,
  });
  const operatorLoopSurface = normalizeShellSurface(manifest.operator_loop_surface, {
    field: 'operator_loop_surface',
    productEntryShell,
  });
  const operatorLoopActions = isRecord(manifest.operator_loop_actions)
    ? normalizeRecordMap(manifest.operator_loop_actions, 'operator_loop_actions')
    : {};
  const productEntryOverview = normalizeProductEntryOverview(manifest.product_entry_overview);
  const productEntryPreflight = normalizeProductEntryPreflight(manifest.product_entry_preflight);
  const productEntryReadiness = normalizeProductEntryReadiness(manifest.product_entry_readiness);
  const grantAuthoringReadiness = normalizeDetailedReadinessSurface(
    manifest.grant_authoring_readiness,
    'grant_authoring_readiness',
  );
  const productEntryGuardrails = normalizeProductEntryGuardrails(manifest.product_entry_guardrails);
  const phase3ClearanceLane = normalizeClearanceLane(
    manifest.phase3_clearance_lane,
    'phase3_host_clearance_lane',
  );
  const phase4BackendDeconstruction = normalizeBackendDeconstructionLane(
    manifest.phase4_backend_deconstruction,
  );
  const phase5PlatformTarget = normalizePlatformTarget(manifest.phase5_platform_target);
  const productEntryStart = normalizeProductEntryStart(manifest.product_entry_start);
  const productEntryQuickstart = normalizeProductEntryQuickstart(manifest.product_entry_quickstart);
  const runtimeInventory = normalizeRuntimeInventory(manifest.runtime_inventory);
  const taskLifecycle = normalizeTaskLifecycle(manifest.task_lifecycle);
  const schemaRef = optionalString(manifest.schema_ref);
  const domainEntryContract = manifest.domain_entry_contract === undefined
    ? null
    : validateFamilyDomainEntryContract(manifest.domain_entry_contract, 'domain_entry_contract');
  const gatewayInteractionContract = manifest.gateway_interaction_contract === undefined
    ? null
    : validateGatewayInteractionContract(
      manifest.gateway_interaction_contract,
      'gateway_interaction_contract',
    );
  const rawFamilyOrchestration = isRecord(manifest.family_orchestration)
    ? manifest.family_orchestration
    : null;
  const remainingGaps = readStringList(manifest.remaining_gaps);
  const rawProductEntryStatus = isRecord(manifest.product_entry_status) ? manifest.product_entry_status : null;
  const sessionContinuity = normalizeSessionContinuity(manifest.session_continuity, {
    domainAgentId: domainEntryContract?.domain_agent_entry_spec?.agent_id ?? null,
    runtimeInventory,
    taskLifecycle,
    productEntryOverview,
    productEntryStatus: rawProductEntryStatus
      ? {
          summary: optionalString(rawProductEntryStatus.summary),
          next_focus: readStringList(rawProductEntryStatus.next_focus),
          remaining_gaps_count:
            typeof rawProductEntryStatus.remaining_gaps_count === 'number'
              ? rawProductEntryStatus.remaining_gaps_count
              : remainingGaps.length,
        }
      : null,
  });
  const progressProjection = normalizeProgressProjection(manifest.progress_projection, {
    runtimeInventory,
    taskLifecycle,
    productEntryOverview,
    productEntryStatus: rawProductEntryStatus
      ? {
          summary: optionalString(rawProductEntryStatus.summary),
          next_focus: readStringList(rawProductEntryStatus.next_focus),
          remaining_gaps_count:
            typeof rawProductEntryStatus.remaining_gaps_count === 'number'
              ? rawProductEntryStatus.remaining_gaps_count
              : remainingGaps.length,
        }
      : null,
  });
  const artifactInventory = normalizeArtifactInventory(manifest.artifact_inventory, {
    progressProjection,
    sessionContinuity,
  });
  const skillCatalog = normalizeSkillCatalog(manifest.skill_catalog);
  const automation = normalizeAutomationCatalog(manifest.automation);

  if (recommendedShell && !productEntryShell[recommendedShell]) {
    throw new Error(`recommended_shell points at unknown shell key: ${recommendedShell}`);
  }
  if (
    recommendedShell
    && explicitRecommendedCommand
    && derivedRecommendedCommand
    && explicitRecommendedCommand !== derivedRecommendedCommand
  ) {
    throw new Error('recommended_command must match the command declared by recommended_shell.');
  }

  return {
    surface_kind: optionalString(manifest.surface_kind) ?? 'product_entry_manifest',
    manifest_version:
      typeof manifest.manifest_version === 'number' || typeof manifest.manifest_version === 'string'
        ? manifest.manifest_version
        : typeof manifest.schema_version === 'number' || typeof manifest.schema_version === 'string'
          ? manifest.schema_version
          : null,
    manifest_kind: requireString(manifest.manifest_kind, 'manifest_kind'),
    target_domain_id: requireString(manifest.target_domain_id, 'target_domain_id'),
    formal_entry: {
      default: requireString(formalEntry.default, 'formal_entry.default'),
      supported_protocols: readStringList(formalEntry.supported_protocols),
      internal_surface: optionalString(formalEntry.internal_surface),
    },
    workspace_locator: requireRecord(manifest.workspace_locator, 'workspace_locator'),
    runtime: isRecord(manifest.runtime) ? manifest.runtime : null,
    managed_runtime_contract: normalizeManagedRuntimeContract(manifest.managed_runtime_contract),
    repo_mainline: isRecord(manifest.repo_mainline) ? manifest.repo_mainline : null,
    product_entry_status: rawProductEntryStatus
      ? {
          summary: optionalString(rawProductEntryStatus.summary),
          next_focus: readStringList(rawProductEntryStatus.next_focus),
          remaining_gaps_count:
            typeof rawProductEntryStatus.remaining_gaps_count === 'number'
              ? rawProductEntryStatus.remaining_gaps_count
              : remainingGaps.length,
        }
      : null,
    frontdesk_surface: frontdeskSurface,
    operator_loop_surface: operatorLoopSurface,
    operator_loop_actions: operatorLoopActions,
    recommended_shell: recommendedShell,
    recommended_command: explicitRecommendedCommand ?? derivedRecommendedCommand,
    schema_ref: schemaRef,
    domain_entry_contract: domainEntryContract,
    gateway_interaction_contract: gatewayInteractionContract,
    product_entry_shell: productEntryShell,
    shared_handoff: sharedHandoff,
    product_entry_overview: productEntryOverview,
    product_entry_preflight: productEntryPreflight,
    product_entry_readiness: productEntryReadiness,
    grant_authoring_readiness: grantAuthoringReadiness,
    product_entry_guardrails: productEntryGuardrails,
    phase3_clearance_lane: phase3ClearanceLane,
    phase4_backend_deconstruction: phase4BackendDeconstruction,
    phase5_platform_target: phase5PlatformTarget,
    product_entry_start: productEntryStart,
    product_entry_quickstart: productEntryQuickstart,
    family_orchestration: rawFamilyOrchestration
      ? {
          action_graph_ref: isRecord(rawFamilyOrchestration.action_graph_ref)
            ? rawFamilyOrchestration.action_graph_ref
            : null,
          action_graph: isRecord(rawFamilyOrchestration.action_graph)
            ? rawFamilyOrchestration.action_graph
            : null,
          human_gates: normalizeRecordList(rawFamilyOrchestration.human_gates, 'family_orchestration.human_gates'),
          resume_contract: isRecord(rawFamilyOrchestration.resume_contract)
            ? rawFamilyOrchestration.resume_contract
            : null,
          event_envelope_surface: isRecord(rawFamilyOrchestration.event_envelope_surface)
            ? rawFamilyOrchestration.event_envelope_surface
            : null,
          checkpoint_lineage_surface: isRecord(rawFamilyOrchestration.checkpoint_lineage_surface)
            ? rawFamilyOrchestration.checkpoint_lineage_surface
            : null,
        }
      : null,
    runtime_inventory: runtimeInventory,
    task_lifecycle: taskLifecycle,
    session_continuity: sessionContinuity,
    progress_projection: progressProjection,
    artifact_inventory: artifactInventory,
    skill_catalog: skillCatalog,
    automation,
    remaining_gaps: remainingGaps,
    notes: readStringList(manifest.notes),
  };
}

function buildCommandFailureEntry(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  code: DomainManifestErrorCode,
  message: string,
  stdout: string,
  stderr: string,
): DomainManifestCatalogEntry {
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: binding.direct_entry.manifest_command,
    status:
      code === 'invalid_json'
        ? 'invalid_json'
        : code === 'invalid_manifest'
          ? 'invalid_manifest'
          : 'command_failed',
    manifest: null,
    error: {
      code,
      message,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
    },
  };
}

function resolveBindingManifest(projectId: string, project: string, binding: WorkspaceBinding): DomainManifestCatalogEntry {
  const manifestCommand = binding.direct_entry.manifest_command;
  if (!manifestCommand) {
    return {
      project_id: projectId,
      project,
      binding_id: binding.binding_id,
      workspace_path: binding.workspace_path,
      manifest_command: null,
      status: 'manifest_not_configured',
      manifest: null,
      error: null,
    };
  }

  const result = spawnSync('/bin/bash', ['-lc', manifestCommand], {
    cwd: binding.workspace_path,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error || (result.status ?? 1) !== 0) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'command_failed',
      'Domain manifest command failed.',
      result.stdout ?? '',
      result.stderr ?? result.error?.message ?? '',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout ?? '');
  } catch (error) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'invalid_json',
      error instanceof Error ? error.message : 'Manifest command did not return valid JSON.',
      result.stdout ?? '',
      result.stderr ?? '',
    );
  }

  try {
    if (!isRecord(parsed)) {
      throw new Error('Manifest payload must be a JSON object.');
    }

    return {
      project_id: projectId,
      project,
      binding_id: binding.binding_id,
      workspace_path: binding.workspace_path,
      manifest_command: manifestCommand,
      status: 'resolved',
      manifest: normalizeManifest(parsed),
      error: null,
    };
  } catch (error) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'invalid_manifest',
      error instanceof Error ? error.message : 'Manifest payload does not satisfy the minimum discovery contract.',
      result.stdout ?? '',
      result.stderr ?? '',
    );
  }
}

export function buildDomainManifestCatalog(contracts: GatewayContracts) {
  const projects = contracts.domains.domains.map((domain) => {
    const binding = getActiveWorkspaceBinding(domain.domain_id);
    if (!binding) {
      return {
        project_id: domain.domain_id,
        project: domain.project,
        binding_id: null,
        workspace_path: null,
        manifest_command: null,
        status: 'not_bound' as const,
        manifest: null,
        error: null,
      };
    }

    return resolveBindingManifest(domain.domain_id, domain.project, binding);
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    domain_manifests: {
      summary: {
        total_projects_count: projects.length,
        active_bindings_count: projects.filter((entry) => entry.binding_id !== null).length,
        manifest_configured_count: projects.filter((entry) => entry.manifest_command !== null).length,
        resolved_count: projects.filter((entry) => entry.status === 'resolved').length,
        failed_count: projects.filter((entry) =>
          entry.status === 'command_failed' || entry.status === 'invalid_json' || entry.status === 'invalid_manifest'
        ).length,
      },
      projects,
      notes: [
        'This surface executes the domain-owned manifest_command for active admitted-domain bindings only.',
        '`opl workspace list` remains the non-executing registry; `opl domain manifests` is the sibling discovery surface that resolves machine-readable product-entry manifests.',
      ],
    },
  };
}
