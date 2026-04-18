import { spawnSync } from 'node:child_process';

import type {
  FamilyDomainEntryContractSurface,
  GatewayInteractionContractSurface,
} from './family-entry-contracts.ts';
import {
  validateFamilyDomainEntryContract,
  validateGatewayInteractionContract,
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
  shared_handoff: Record<string, JsonRecord>;
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
    session_id: optionalString(value.session_id),
    run_id: optionalString(value.run_id),
    progress_surface: normalizeTaskSurfaceDescriptor(value.progress_surface, 'task_lifecycle.progress_surface'),
    resume_surface: normalizeTaskSurfaceDescriptor(value.resume_surface, 'task_lifecycle.resume_surface'),
    checkpoint_summary: normalizeCheckpointSummary(value.checkpoint_summary, 'task_lifecycle.checkpoint_summary'),
    human_gate_ids: readStringList(value.human_gate_ids, 'task_lifecycle.human_gate_ids'),
    domain_projection: isRecord(value.domain_projection) ? value.domain_projection : null,
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
  const sharedHandoff = normalizeRecordMap(manifest.shared_handoff, 'shared_handoff');
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
  const skillCatalog = normalizeSkillCatalog(manifest.skill_catalog);
  const automation = normalizeAutomationCatalog(manifest.automation);
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
  const remainingGaps = readStringList(manifest.remaining_gaps);
  const rawProductEntryStatus = isRecord(manifest.product_entry_status) ? manifest.product_entry_status : null;

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
