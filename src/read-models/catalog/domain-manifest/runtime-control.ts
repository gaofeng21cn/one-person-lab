import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { normalizeSurfaceRef } from './surface-utils.ts';
import type {
  NormalizedArtifactInventory,
  NormalizedProgressProjection,
  NormalizedRuntimeControl,
  NormalizedRuntimeInventory,
  NormalizedSessionContinuity,
  NormalizedTaskLifecycle,
  NormalizedTaskSurfaceDescriptor,
} from './types.ts';
import { isRecord, readStringList, requireString, requireSurfaceKind } from './shared-utils.ts';

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

export function normalizeRuntimeControl(
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
      opl_hosted_entry_command:
        optionalString(value.opl_hosted_entry_command)
        ?? optionalString(sourceLinkage.opl_hosted_entry_command),
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
      opl_hosted_entry_command: optionalString(value.opl_hosted_entry_command),
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
  const restorePointResumeSurface =
    optionalString(restorePoint.resume_surface_kind)
      || optionalString(restorePoint.resume_surface_ref)
      || optionalString(restorePoint.resume_command)
      ? {
          surface_kind: optionalString(restorePoint.resume_surface_kind) ?? 'opl_generated_session_resume',
          summary: optionalString(restorePoint.summary) ?? 'Resume via the OPL generated session surface.',
          command: optionalString(restorePoint.resume_command),
          surface_ref: optionalString(restorePoint.resume_surface_ref),
        }
      : null;
  const resumeSurface =
    normalizeRuntimeControlSurfaceDescriptor(
      controlSurfaces.resume ?? value.resume_surface ?? restorePointResumeSurface,
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
      ?? optionalString(restorePoint.resume_surface_ref)
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
    opl_hosted_entry_command: optionalString(value.opl_hosted_entry_command),
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
