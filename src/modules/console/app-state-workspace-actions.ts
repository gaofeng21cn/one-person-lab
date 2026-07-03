import { FrameworkContractError } from '../charter/index.ts';
import {
  adoptWorkspace,
  doctorWorkspace,
  validateWorkspace,
} from '../workspace/index.ts';
import {
  archiveWorkspaceProject,
  deleteWorkspaceProject,
  exportWorkspaceMap,
  inspectWorkspace,
  upgradeWorkspace,
  updateWorkspaceProjectLifecycle,
  workspaceFleetReport,
  workspaceHealth,
  workspaceInventory,
  workspaceReport,
} from '../workspace/index.ts';
import { ensureWorkspace, initializeWorkspace } from '../workspace/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

type JsonRecord = Record<string, unknown>;

type WorkspaceAppActionOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
};

function stringPayloadField(payload: JsonRecord, field: string) {
  const value = payload[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function workspaceInitializePayload(payload: JsonRecord, actionId = 'workspace_initialize') {
  const agentId = stringPayloadField(payload, 'agent_id')
    ?? stringPayloadField(payload, 'agentId')
    ?? stringPayloadField(payload, 'agent');
  const workspacePath = stringPayloadField(payload, 'workspace')
    ?? stringPayloadField(payload, 'workspace_path')
    ?? stringPayloadField(payload, 'workspacePath');
  const workspaceRoot = stringPayloadField(payload, 'workspace_root')
    ?? stringPayloadField(payload, 'workspaceRoot')
    ?? stringPayloadField(payload, 'root')
    ?? stringPayloadField(payload, 'path');
  if (!agentId) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} action requires payload.agent_id.`, {
      action_id: actionId,
      required: ['agent_id'],
    });
  }
  return {
    agentId,
    workspacePath: workspacePath ?? undefined,
    workspaceRoot: workspaceRoot ?? undefined,
    workspaceId: stringPayloadField(payload, 'workspace_id') ?? stringPayloadField(payload, 'workspaceId') ?? undefined,
    projectId: stringPayloadField(payload, 'project_id')
      ?? stringPayloadField(payload, 'projectId')
      ?? stringPayloadField(payload, 'deliverable_id')
      ?? stringPayloadField(payload, 'study_id')
      ?? undefined,
    title: stringPayloadField(payload, 'title') ?? undefined,
    mode: stringPayloadField(payload, 'mode') as 'auto' | 'one_off' | 'series' | 'portfolio' | undefined,
    bind: payload.bind === false ? false : undefined,
    force: payload.force === true,
  };
}

function workspacePathPayload(payload: JsonRecord, actionId: string) {
  const workspacePath = stringPayloadField(payload, 'workspace')
    ?? stringPayloadField(payload, 'workspace_path')
    ?? stringPayloadField(payload, 'workspacePath')
    ?? stringPayloadField(payload, 'path');
  if (!workspacePath) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} action requires payload.workspace_path.`, {
      action_id: actionId,
      required: ['workspace_path'],
    });
  }
  return workspacePath;
}

function workspaceProjectLifecyclePayload(payload: JsonRecord, actionId: string) {
  const workspacePath = workspacePathPayload(payload, actionId);
  const projectId = stringPayloadField(payload, 'project_id')
    ?? stringPayloadField(payload, 'projectId')
    ?? stringPayloadField(payload, 'deliverable_id')
    ?? stringPayloadField(payload, 'study_id');
  if (!projectId) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} action requires payload.project_id.`, {
      action_id: actionId,
      required: ['project_id'],
    });
  }
  return {
    workspacePath,
    projectId,
    reason: stringPayloadField(payload, 'reason') ?? undefined,
    supersededByProjectId: stringPayloadField(payload, 'superseded_by_project_id')
      ?? stringPayloadField(payload, 'supersededByProjectId')
      ?? stringPayloadField(payload, 'superseded_by')
      ?? undefined,
    ownerReceiptRef: stringPayloadField(payload, 'owner_receipt_ref')
      ?? stringPayloadField(payload, 'ownerReceiptRef')
      ?? undefined,
  };
}

export function executeWorkspaceAppAction(
  contracts: FrameworkContracts,
  options: WorkspaceAppActionOptions,
) {
  if (options.actionId === 'workspace_initialize') {
    return {
      delegatedSurface: 'opl workspace init',
      result: initializeWorkspace(contracts, {
        ...workspaceInitializePayload(options.payload, options.actionId),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'workspace_ensure') {
    return {
      delegatedSurface: 'opl workspace ensure',
      result: ensureWorkspace(contracts, {
        ...workspaceInitializePayload(options.payload, options.actionId),
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'workspace_validate') {
    return {
      delegatedSurface: 'opl workspace validate',
      result: validateWorkspace(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_doctor') {
    return {
      delegatedSurface: 'opl workspace doctor',
      result: doctorWorkspace(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_adopt_dry_run') {
    return {
      delegatedSurface: 'opl workspace adopt --dry-run',
      result: adoptWorkspace(contracts, {
        ...workspaceInitializePayload(options.payload, options.actionId),
        dryRun: true,
      }),
    };
  }

  if (options.actionId === 'workspace_adopt_apply') {
    return {
      delegatedSurface: 'opl workspace adopt --apply',
      result: adoptWorkspace(contracts, {
        ...workspaceInitializePayload(options.payload, options.actionId),
        apply: options.dryRun !== true,
        dryRun: options.dryRun === true,
      }),
    };
  }

  if (options.actionId === 'workspace_upgrade') {
    return {
      delegatedSurface: 'opl workspace upgrade',
      result: upgradeWorkspace(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
        apply: options.dryRun !== true,
        dryRun: options.dryRun === true,
      }),
    };
  }

  if (options.actionId === 'workspace_project_archive') {
    return {
      delegatedSurface: 'opl workspace project archive',
      result: archiveWorkspaceProject(contracts, {
        ...workspaceProjectLifecyclePayload(options.payload, options.actionId),
        apply: options.dryRun !== true,
        dryRun: options.dryRun === true,
      }),
    };
  }

  if (options.actionId === 'workspace_project_lifecycle') {
    const status = stringPayloadField(options.payload, 'status');
    return {
      delegatedSurface: 'opl workspace project lifecycle',
      result: updateWorkspaceProjectLifecycle(contracts, {
        ...workspaceProjectLifecyclePayload(options.payload, options.actionId),
        status: status as 'active' | 'paused' | 'archived' | 'superseded' | 'locked' | undefined,
        apply: options.dryRun !== true,
        dryRun: options.dryRun === true,
      }),
    };
  }

  const lifecycleActionStatuses: Record<string, 'active' | 'paused' | 'locked' | 'superseded'> = {
    workspace_project_pause: 'paused',
    workspace_project_resume: 'active',
    workspace_project_lock: 'locked',
    workspace_project_supersede: 'superseded',
  };
  if (Object.hasOwn(lifecycleActionStatuses, options.actionId)) {
    return {
      delegatedSurface: 'opl workspace project lifecycle',
      result: updateWorkspaceProjectLifecycle(contracts, {
        ...workspaceProjectLifecyclePayload(options.payload, options.actionId),
        status: lifecycleActionStatuses[options.actionId],
        apply: options.dryRun !== true,
        dryRun: options.dryRun === true,
      }),
    };
  }

  if (options.actionId === 'workspace_project_delete') {
    return {
      delegatedSurface: 'opl workspace project delete',
      result: deleteWorkspaceProject(contracts, {
        ...workspaceProjectLifecyclePayload(options.payload, options.actionId),
        apply: options.dryRun !== true,
        dryRun: options.dryRun === true,
      }),
    };
  }

  if (options.actionId === 'workspace_export_map') {
    return {
      delegatedSurface: 'opl workspace export-map',
      result: exportWorkspaceMap(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_inspect') {
    return {
      delegatedSurface: 'opl workspace inspect',
      result: inspectWorkspace(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_inventory') {
    return {
      delegatedSurface: 'opl workspace inventory',
      result: workspaceInventory(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_health') {
    return {
      delegatedSurface: 'opl workspace health',
      result: workspaceHealth(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_report') {
    return {
      delegatedSurface: 'opl workspace report',
      result: workspaceReport(contracts, {
        workspacePath: workspacePathPayload(options.payload, options.actionId),
      }),
    };
  }

  if (options.actionId === 'workspace_fleet_report') {
    return {
      delegatedSurface: 'opl workspace fleet report',
      result: workspaceFleetReport(contracts),
    };
  }

  return null;
}
