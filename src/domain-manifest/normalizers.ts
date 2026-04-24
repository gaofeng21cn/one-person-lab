import {
  validateFamilyDomainEntryContract,
  validateGatewayInteractionContract,
  validateSharedHandoff,
} from '../family-entry-contracts.ts';
import { normalizeManagedRuntimeContract } from '../managed-runtime-contract.ts';
import {
  normalizeArtifactInventory,
  normalizeAutomationCatalog,
  normalizeSkillCatalog,
} from './artifact-skill-normalizers.ts';
import {
  normalizeBackendDeconstructionLane,
  normalizeClearanceLane,
  normalizeDetailedReadinessSurface,
  normalizePlatformTarget,
  normalizeProductEntryGuardrails,
  normalizeProductEntryOverview,
  normalizeProductEntryPreflight,
  normalizeProductEntryQuickstart,
  normalizeProductEntryReadiness,
  normalizeProductEntryStart,
  normalizeShellSurface,
  unwrapManifestPayload,
} from './entry-surfaces.ts';
import {
  normalizeCheckpointSummary,
  normalizeSurfaceRef,
  normalizeTaskSurfaceDescriptor,
} from './surface-normalizers.ts';
import type {
  NormalizedArtifactInventory,
  NormalizedDomainManifest,
  NormalizedProgressProjection,
  NormalizedRuntimeControl,
  NormalizedRuntimeInventory,
  NormalizedSessionContinuity,
  NormalizedSurfaceRef,
  NormalizedTaskLifecycle,
  NormalizedTaskSurfaceDescriptor,
} from './types.ts';
import {
  isRecord,
  normalizeRecordList,
  normalizeRecordMap,
  optionalString,
  readStringList,
  requireRecord,
  requireString,
  requireSurfaceKind,
} from './shared-utils.ts';

type JsonRecord = Record<string, unknown>;

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

function normalizeRuntimeControlSurfaceDescriptor(
  value: unknown,
  field: string,
  fallbackSummary: string,
  fallbackCommand: string | null = null,
): NormalizedTaskSurfaceDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const surfaceKind = requireString(value.surface_kind, `${field}.surface_kind`);
  const summary = optionalString(value.summary) ?? fallbackSummary;
  const command =
    optionalString(value.command)
    ?? optionalString(value.resume_command_template)
    ?? fallbackCommand;
  const ref =
    isRecord(value.ref)
      ? normalizeSurfaceRef(value.ref, `${field}.ref`)
      : optionalString(value.ref_kind) && optionalString(value.ref)
        ? normalizeSurfaceRef(
          {
            ref_kind: optionalString(value.ref_kind),
            ref: optionalString(value.ref),
          },
          `${field}.inline_ref`,
        )
        : optionalString(value.surface_ref)
          ? normalizeSurfaceRef(
            {
              ref_kind: 'json_pointer',
              ref: optionalString(value.surface_ref),
            },
            `${field}.surface_ref`,
          )
          : null;

  return {
    surface_kind: surfaceKind,
    summary,
    command,
    ref,
    step_id: optionalString(value.step_id),
    locator_fields: readStringList(value.locator_fields, `${field}.locator_fields`),
  };
}

function normalizeRuntimeControl(
  value: unknown,
  options: {
    domainAgentId: string | null;
    runtimeInventory: NormalizedRuntimeInventory | null;
    taskLifecycle: NormalizedTaskLifecycle | null;
    sessionContinuity: NormalizedSessionContinuity | null;
    progressProjection: NormalizedProgressProjection | null;
    artifactInventory: NormalizedArtifactInventory | null;
  },
): NormalizedRuntimeControl | null {
  if (!isRecord(value)) {
    return null;
  }

  const surfaceKind = requireString(value.surface_kind, 'runtime_control.surface_kind');
  const controlSurfaces = isRecord(value.control_surfaces) ? value.control_surfaces : {};

  if (surfaceKind === 'runtime_loop_closure') {
    const loopOwner = isRecord(value.loop_owner) ? value.loop_owner : {};
    const resumePoint = isRecord(value.resume_point) ? value.resume_point : {};
    const progressCursor = isRecord(value.progress_cursor) ? value.progress_cursor : {};
    const artifactPickup = isRecord(value.artifact_pickup) ? value.artifact_pickup : {};
    const controlPolicy = isRecord(value.control_policy) ? value.control_policy : {};
    const sourceLinkage = isRecord(value.source_linkage) ? value.source_linkage : {};
    const continueAction = isRecord(controlPolicy.continue_action) ? controlPolicy.continue_action : {};

    return {
      surface_kind: 'runtime_control',
      summary: 'Repo-owned runtime loop closure is available.',
      domain_agent_id: options.domainAgentId ?? 'rca',
      runtime_owner:
        optionalString(loopOwner.runtime_owner)
        ?? options.runtimeInventory?.runtime_owner
        ?? 'unknown',
      domain_owner:
        optionalString(loopOwner.domain_owner)
        ?? options.runtimeInventory?.domain_owner
        ?? 'unknown',
      executor_owner:
        optionalString(loopOwner.product_entry_owner)
        ?? options.runtimeInventory?.executor_owner
        ?? 'unknown',
      status:
        Boolean(controlPolicy.approval_required)
          ? 'operator_review_requested'
          : options.taskLifecycle?.status ?? 'available',
      session_id:
        optionalString(resumePoint.entry_session_id)
        ?? options.sessionContinuity?.session_id
        ?? null,
      run_id:
        optionalString(progressCursor.managed_run_id)
        ?? optionalString(resumePoint.latest_managed_run_id)
        ?? null,
      restore_point:
        optionalString(resumePoint.checkpoint_locator_field)
        ?? optionalString(resumePoint.latest_handle)
        ?? null,
      control_gate_ids:
        readStringList(controlPolicy.human_gate_ids, 'runtime_loop_closure.control_policy.human_gate_ids'),
      direct_entry_command:
        optionalString(value.direct_entry_command)
        ?? optionalString(sourceLinkage.direct_entry_command),
      federated_entry_command:
        optionalString(value.federated_entry_command)
        ?? optionalString(sourceLinkage.federated_entry_command),
      control_surfaces: {
        resume: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: optionalString(continueAction.surface_kind) ?? 'product_entry_session',
            command: optionalString(resumePoint.resume_command_template) ?? optionalString(continueAction.command),
            surface_ref: optionalString(sourceLinkage.session_surface_kind)
              ? '/session_continuity'
              : optionalString(progressCursor.surface_ref),
          },
          'runtime_loop_closure.resume_point',
          'Resume the repo-owned product-entry session.',
          optionalString(resumePoint.resume_command_template) ?? optionalString(continueAction.command) ?? null,
        ),
        interrupt: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: optionalString(continueAction.surface_kind) ?? 'product_entry_session',
            command: optionalString(continueAction.command),
            surface_ref: optionalString(progressCursor.surface_ref),
          },
          'runtime_loop_closure.control_policy.interrupt',
          'Inspect the same session before interrupting or rerouting.',
          optionalString(continueAction.command) ?? null,
        ),
        approval: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: optionalString(continueAction.surface_kind) ?? 'product_entry_session',
            command: optionalString(continueAction.command),
            surface_ref: optionalString(progressCursor.surface_ref),
          },
          'runtime_loop_closure.control_policy.approval',
          'Use the same session surface to clear the current human gate.',
          optionalString(continueAction.command) ?? null,
        ),
        progress: normalizeRuntimeControlSurfaceDescriptor(
          progressCursor,
          'runtime_loop_closure.progress_cursor',
          'Inspect the repo-owned progress cursor.',
          optionalString(continueAction.command) ?? null,
        ),
        artifact_pickup: normalizeRuntimeControlSurfaceDescriptor(
          artifactPickup,
          'runtime_loop_closure.artifact_pickup',
          'Inspect the repo-owned artifact pickup surface.',
          optionalString(continueAction.command) ?? null,
        ),
      },
      domain_projection: value,
    };
  }

  if (surfaceKind === 'research_runtime_control_projection' || surfaceKind === 'research_runtime_control_projection_contract') {
    const studySessionOwner = isRecord(value.study_session_owner) ? value.study_session_owner : {};
    const commandTemplates = isRecord(value.command_templates) ? value.command_templates : {};
    const researchGateSurface = isRecord(value.research_gate_surface) ? value.research_gate_surface : {};

    return {
      surface_kind: 'runtime_control',
      summary: 'Study-scoped research runtime control projection is available.',
      domain_agent_id: options.domainAgentId ?? 'mas',
      runtime_owner:
        optionalString(studySessionOwner.runtime_owner)
        ?? options.runtimeInventory?.runtime_owner
        ?? 'unknown',
      domain_owner:
        optionalString(studySessionOwner.study_owner)
        ?? options.runtimeInventory?.domain_owner
        ?? 'unknown',
      executor_owner:
        optionalString(studySessionOwner.executor_owner)
        ?? options.runtimeInventory?.executor_owner
        ?? 'unknown',
      status: 'study_scoped',
      session_id:
        options.sessionContinuity?.session_id
        ?? options.taskLifecycle?.session_id
        ?? 'study:<study_id>',
      run_id: options.taskLifecycle?.run_id ?? null,
      restore_point:
        options.taskLifecycle?.checkpoint_summary?.checkpoint_id
        ?? optionalString((isRecord(value.restore_point_surface) ? value.restore_point_surface : {}).field_path)
        ?? null,
      control_gate_ids: [
        optionalString(researchGateSurface.approval_gate_field),
      ].filter((entry): entry is string => Boolean(entry)),
      direct_entry_command: optionalString(value.direct_entry_command),
      federated_entry_command: optionalString(value.federated_entry_command),
      control_surfaces: {
        resume: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: 'launch_study',
            command: optionalString(commandTemplates.resume),
          },
          'research_runtime_control_projection.command_templates.resume',
          'Resume the current study runtime.',
          optionalString(commandTemplates.resume),
        ),
        interrupt: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: optionalString(researchGateSurface.surface_kind) ?? 'study_progress',
            command: optionalString(commandTemplates.check_runtime_status),
            surface_ref: '/progress_projection',
          },
          'research_runtime_control_projection.research_gate_surface.interrupt',
          'Inspect the current study gate before interrupting.',
          optionalString(commandTemplates.check_runtime_status),
        ),
        approval: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: optionalString(researchGateSurface.surface_kind) ?? 'study_progress',
            command: optionalString(commandTemplates.check_runtime_status),
            surface_ref: '/progress_projection',
          },
          'research_runtime_control_projection.research_gate_surface.approval',
          'Inspect the current study gate before approving continuation.',
          optionalString(commandTemplates.check_runtime_status),
        ),
        progress: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: 'study_progress',
            command: optionalString(commandTemplates.check_progress),
            surface_ref: '/progress_projection',
          },
          'research_runtime_control_projection.command_templates.check_progress',
          'Inspect the current study progress projection.',
          optionalString(commandTemplates.check_progress),
        ),
        artifact_pickup: normalizeRuntimeControlSurfaceDescriptor(
          {
            surface_kind: 'artifact_inventory',
            command: optionalString(commandTemplates.check_runtime_status),
            surface_ref: '/artifact_inventory',
          },
          'research_runtime_control_projection.command_templates.check_runtime_status',
          'Inspect current study artifacts and runtime status.',
          optionalString(commandTemplates.check_runtime_status),
        ),
      },
      domain_projection: value,
    };
  }

  requireSurfaceKind(value.surface_kind, 'runtime_control', 'runtime_control');
  const sessionLocator = isRecord(value.session_locator) ? value.session_locator : {};
  const restorePoint = isRecord(value.restore_point) ? value.restore_point : {};
  const resumeSurface =
    normalizeRuntimeControlSurfaceDescriptor(
      controlSurfaces.resume ?? value.resume_surface ?? {
        surface_kind: optionalString(restorePoint.resume_surface_kind) ?? 'runtime_resume',
        command: optionalString(restorePoint.resume_command),
      },
      'runtime_control.resume',
      'Resume the current repo-owned runtime session.',
      optionalString(restorePoint.resume_command) ?? null,
    )
    ?? options.sessionContinuity?.restore_surface
    ?? options.taskLifecycle?.resume_surface
    ?? null;
  const interruptSurface =
    normalizeRuntimeControlSurfaceDescriptor(
      controlSurfaces.interrupt ?? value.interrupt_surface,
      'runtime_control.interrupt',
      'Inspect the current runtime state before interrupting.',
    )
    ?? null;
  const approvalSurface =
    normalizeRuntimeControlSurfaceDescriptor(
      controlSurfaces.approval ?? value.approval_control_surface ?? value.approval_surface,
      'runtime_control.approval',
      'Inspect the current approval/control surface.',
    )
    ?? null;
  const progressSurface =
    normalizeRuntimeControlSurfaceDescriptor(
      controlSurfaces.progress ?? value.progress_surface,
      'runtime_control.progress',
      'Inspect the repo-owned runtime progress surface.',
    )
    ?? options.sessionContinuity?.progress_surface
    ?? options.progressProjection?.progress_surface
    ?? options.taskLifecycle?.progress_surface
    ?? null;
  const artifactPickupSurface =
    normalizeRuntimeControlSurfaceDescriptor(
      controlSurfaces.artifact_pickup ?? value.artifact_pickup_surface,
      'runtime_control.artifact_pickup',
      'Inspect the repo-owned artifact pickup surface.',
    )
    ?? options.sessionContinuity?.artifact_surface
    ?? options.progressProjection?.artifact_surface
    ?? options.artifactInventory?.artifact_surface
    ?? null;

  return {
    surface_kind: 'runtime_control',
    summary: requireString(value.summary, 'runtime_control.summary'),
    domain_agent_id:
      optionalString(value.domain_agent_id)
      ?? options.domainAgentId
      ?? options.sessionContinuity?.domain_agent_id
      ?? 'unknown',
    runtime_owner:
      optionalString(value.runtime_owner)
      ?? options.sessionContinuity?.runtime_owner
      ?? options.runtimeInventory?.runtime_owner
      ?? 'unknown',
    domain_owner:
      optionalString(value.domain_owner)
      ?? options.sessionContinuity?.domain_owner
      ?? options.runtimeInventory?.domain_owner
      ?? 'unknown',
    executor_owner:
      optionalString(value.executor_owner)
      ?? options.sessionContinuity?.executor_owner
      ?? options.runtimeInventory?.executor_owner
      ?? 'unknown',
    status:
      optionalString(value.status)
      ?? options.taskLifecycle?.status
      ?? options.sessionContinuity?.status
      ?? 'available',
    session_id:
      optionalString(value.session_id)
      ?? optionalString(sessionLocator.locator_value)
      ?? optionalString(restorePoint.session_id)
      ?? options.sessionContinuity?.session_id
      ?? options.taskLifecycle?.session_id
      ?? null,
    run_id:
      optionalString(value.run_id)
      ?? options.sessionContinuity?.run_id
      ?? options.taskLifecycle?.run_id
      ?? null,
    restore_point:
      optionalString(value.restore_point)
      ?? (
        optionalString(restorePoint.session_id) && optionalString(restorePoint.lifecycle_stage)
          ? `${optionalString(restorePoint.session_id)}:${optionalString(restorePoint.lifecycle_stage)}`
          : null
      )
      ?? optionalString(restorePoint.journal_path)
      ?? optionalString(restorePoint.resume_command)
      ?? options.taskLifecycle?.checkpoint_summary?.checkpoint_id
      ?? null,
    control_gate_ids:
      readStringList(value.control_gate_ids, 'runtime_control.control_gate_ids').length > 0
        ? readStringList(value.control_gate_ids, 'runtime_control.control_gate_ids')
        : options.taskLifecycle?.human_gate_ids
          ?? options.sessionContinuity?.human_gate_ids
          ?? [],
    direct_entry_command:
      optionalString(value.direct_entry_command)
      ?? optionalString((isRecord(value.direct_entry) ? value.direct_entry : {}).command),
    federated_entry_command: optionalString(value.federated_entry_command),
    control_surfaces: {
      resume: resumeSurface,
      interrupt: interruptSurface,
      approval: approvalSurface,
      progress: progressSurface,
      artifact_pickup: artifactPickupSurface,
    },
    domain_projection:
      isRecord(value.domain_projection)
      ? value.domain_projection
      : isRecord(controlSurfaces)
        ? controlSurfaces
        : value,
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

export function normalizeManifest(payload: JsonRecord): NormalizedDomainManifest {
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
  const runtimeControlSource =
    isRecord(manifest.runtime_control)
      ? manifest.runtime_control
      : isRecord(manifest.runtime_loop_closure)
        ? manifest.runtime_loop_closure
        : isRecord(manifest.progress_projection)
          && isRecord(manifest.progress_projection.domain_projection)
          && isRecord(manifest.progress_projection.domain_projection.research_runtime_control_projection)
          ? manifest.progress_projection.domain_projection.research_runtime_control_projection
          : isRecord(manifest.return_surface_contract)
            && isRecord(manifest.return_surface_contract.research_runtime_control_projection_contract)
            ? manifest.return_surface_contract.research_runtime_control_projection_contract
            : null;
  const runtimeControl = normalizeRuntimeControl(runtimeControlSource, {
    domainAgentId: domainEntryContract?.domain_agent_entry_spec?.agent_id ?? null,
    runtimeInventory,
    taskLifecycle,
    sessionContinuity,
    progressProjection,
    artifactInventory,
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
    runtime_control: runtimeControl,
    session_continuity: sessionContinuity,
    progress_projection: progressProjection,
    artifact_inventory: artifactInventory,
    skill_catalog: skillCatalog,
    automation,
    remaining_gaps: remainingGaps,
    notes: readStringList(manifest.notes),
  };
}
