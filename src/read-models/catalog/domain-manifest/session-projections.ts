import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  normalizeCheckpointSummary,
  normalizeSurfaceRef,
  normalizeTaskSurfaceDescriptor,
} from './surface-utils.ts';
import type {
  NormalizedDomainManifest,
  NormalizedProgressProjection,
  NormalizedRuntimeInventory,
  NormalizedSessionContinuity,
  NormalizedSurfaceRef,
  NormalizedTaskLifecycle,
  NormalizedTaskSurfaceDescriptor,
} from './types.ts';
import { isRecord, readStringList, requireString, requireSurfaceKind } from './shared-utils.ts';

export function normalizeRuntimeInventory(value: unknown): NormalizedRuntimeInventory | null {
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

export function normalizeTaskLifecycle(value: unknown): NormalizedTaskLifecycle | null {
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

export function normalizeSessionContinuity(
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
  const repoOwnedTruth = isRecord(value.repo_owned_truth) ? value.repo_owned_truth : null;
  const generatedSessionSurfaceRef = optionalString(value.generated_session_surface_ref);
  const generatedResumeSurfaceRef = optionalString(value.generated_resume_surface_ref);
  const domainAuthoritySurfaceRef = optionalString(value.domain_authority_surface_ref);
  const generatedSessionProjection =
    repoOwnedTruth || generatedSessionSurfaceRef || generatedResumeSurfaceRef || domainAuthoritySurfaceRef
      ? {
          ...(repoOwnedTruth ?? {}),
          ...(generatedSessionSurfaceRef ? { generated_session_surface_ref: generatedSessionSurfaceRef } : {}),
          ...(generatedResumeSurfaceRef ? { generated_resume_surface_ref: generatedResumeSurfaceRef } : {}),
          ...(domainAuthoritySurfaceRef ? { domain_authority_surface_ref: domainAuthoritySurfaceRef } : {}),
        }
      : null;
  const domainProjection =
    isRecord(value.domain_projection)
      ? value.domain_projection
      : generatedSessionProjection;

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
      normalizeTaskSurfaceDescriptor(value.entry_surface, 'session_continuity.entry_surface'),
    progress_surface:
      normalizeTaskSurfaceDescriptor(value.progress_surface, 'session_continuity.progress_surface')
      ?? derivedProgressSurface,
    artifact_surface:
      normalizeTaskSurfaceDescriptor(value.artifact_surface, 'session_continuity.artifact_surface')
      ?? descriptorRestoreSurface,
    restore_surface:
      normalizeTaskSurfaceDescriptor(value.restore_surface, 'session_continuity.restore_surface')
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

export function normalizeProgressProjection(
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

