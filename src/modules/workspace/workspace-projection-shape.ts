import {
  currentStagePointerRef,
  STAGE_LIFECYCLE_STATUSES,
} from './workspace-artifacts.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import type { WorkspaceAgentProfile } from './workspace-agent-defaults.ts';
import type { WorkspaceProjectIndexEntry } from './workspace-topology.ts';

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isStageLifecycleStatus(value: unknown) {
  return typeof value === 'string' && STAGE_LIFECYCLE_STATUSES.includes(value as typeof STAGE_LIFECYCLE_STATUSES[number]);
}

export function validateStageOutputsIndexShape(input: {
  actual: Record<string, unknown>;
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  project: WorkspaceProjectIndexEntry;
}) {
  const protocol = isRecord(input.actual.stage_folder_protocol)
    ? input.actual.stage_folder_protocol
    : {};
  const authority = isRecord(input.actual.authority_boundary)
    ? input.actual.authority_boundary
    : {};
  const stages = Array.isArray(input.actual.stages) ? input.actual.stages : null;
  const blockers = [
    input.actual.surface_kind === 'opl_stage_outputs_index' ? null : 'surface_kind',
    input.actual.version === 'workspace-stage-outputs-index.v1' ? null : 'version',
    input.actual.workspace_id === input.workspaceId ? null : 'workspace_id',
    input.actual.agent_id === input.agent.agent_id ? null : 'agent_id',
    input.actual.project_id === input.project.project_id ? null : 'project_id',
    input.actual.stage_outputs_root === input.project.stage_outputs_root ? null : 'stage_outputs_root',
    input.actual.current_stage_pointer_ref === currentStagePointerRef(input.project.stage_outputs_root)
      ? null
      : 'current_stage_pointer_ref',
    sameJson(input.actual.stage_lifecycle_model, STAGE_LIFECYCLE_STATUSES) ? null : 'stage_lifecycle_model',
    protocol.closeout_answer_unit === 'progress_receipt_or_owner_answer_or_hard_stop'
      ? null
      : 'closeout_answer_unit',
    authority.index_is_projection_only === true ? null : 'index_is_projection_only',
    authority.index_can_claim_stage_complete === false ? null : 'index_can_claim_stage_complete',
    authority.index_can_replace_owner_receipt === false ? null : 'index_can_replace_owner_receipt',
    authority.index_can_replace_typed_blocker === false ? null : 'index_can_replace_typed_blocker',
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth',
  ].filter((entry): entry is string => Boolean(entry));

  if (!stages) {
    blockers.push('stages');
  } else {
    stages.forEach((stage, index) => {
      if (!isRecord(stage) || typeof stage.stage_id !== 'string') {
        blockers.push(`stages[${index}].stage_id`);
        return;
      }
      const lifecycle = isRecord(stage.lifecycle) ? stage.lifecycle : {};
      const status = lifecycle.status ?? stage.status;
      if (status !== undefined && !isStageLifecycleStatus(status)) {
        blockers.push(`stages[${index}].lifecycle.status`);
      }
      const authorityBoundary = isRecord(stage.authority_boundary) ? stage.authority_boundary : null;
      if (authorityBoundary) {
        if (authorityBoundary.file_presence_counts_as_stage_complete !== false) {
          blockers.push(`stages[${index}].authority_boundary.file_presence_counts_as_stage_complete`);
        }
        if (authorityBoundary.stage_folder_can_replace_owner_receipt !== false) {
          blockers.push(`stages[${index}].authority_boundary.stage_folder_can_replace_owner_receipt`);
        }
        if (authorityBoundary.stage_folder_can_replace_typed_blocker !== false) {
          blockers.push(`stages[${index}].authority_boundary.stage_folder_can_replace_typed_blocker`);
        }
      }
    });
  }

  return blockers;
}

export function validateCurrentStagePointerShape(input: {
  actual: Record<string, unknown>;
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  project: WorkspaceProjectIndexEntry;
}) {
  const authority = isRecord(input.actual.authority_boundary)
    ? input.actual.authority_boundary
    : {};
  const currentStage = input.actual.current_stage;
  const refFieldBlockers = [];
  for (const field of [
    'current_stage_manifest_ref',
    'latest_owner_receipt_ref',
    'latest_typed_blocker_ref',
  ]) {
    const value = input.actual[field];
    if (value !== null && typeof value !== 'string') {
      refFieldBlockers.push(field);
    }
  }
  const blockers = [
    input.actual.surface_kind === 'opl_current_stage_pointer' ? null : 'surface_kind',
    input.actual.version === 'workspace-current-stage-pointer.v1' ? null : 'version',
    input.actual.workspace_id === input.workspaceId ? null : 'workspace_id',
    input.actual.agent_id === input.agent.agent_id ? null : 'agent_id',
    input.actual.project_id === input.project.project_id ? null : 'project_id',
    input.actual.project_root === input.project.project_root ? null : 'project_root',
    input.actual.stage_outputs_root === input.project.stage_outputs_root ? null : 'stage_outputs_root',
    sameJson(input.actual.lifecycle_model, STAGE_LIFECYCLE_STATUSES) ? null : 'lifecycle_model',
    authority.pointer_is_projection_only === true ? null : 'pointer_is_projection_only',
    authority.pointer_role === 'workspace_stage_artifact_projection_not_stage_run_current_pointer'
      ? null
      : 'pointer_role',
    authority.pointer_can_claim_stage_complete === false ? null : 'pointer_can_claim_stage_complete',
    authority.pointer_can_write_stage_run_current_pointer === false
      ? null
      : 'pointer_can_write_stage_run_current_pointer',
    authority.pointer_can_write_stage_run_terminal_state === false
      ? null
      : 'pointer_can_write_stage_run_terminal_state',
    authority.pointer_can_publish_current_owner_delta === false
      ? null
      : 'pointer_can_publish_current_owner_delta',
    authority.pointer_can_replace_owner_receipt === false ? null : 'pointer_can_replace_owner_receipt',
    authority.pointer_can_replace_typed_blocker === false ? null : 'pointer_can_replace_typed_blocker',
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth',
    ...refFieldBlockers,
  ].filter((entry): entry is string => Boolean(entry));

  if (currentStage !== null) {
    if (!isRecord(currentStage)) {
      blockers.push('current_stage');
    } else {
      if (typeof currentStage.stage_id !== 'string' || !currentStage.stage_id.trim()) {
        blockers.push('current_stage.stage_id');
      }
      if (!isStageLifecycleStatus(currentStage.status)) {
        blockers.push('current_stage.status');
      }
    }
  }

  return blockers;
}
