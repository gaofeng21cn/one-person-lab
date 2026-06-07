import { FrameworkContractError } from './contracts.ts';
import { adoptWorkspace, doctorWorkspace, validateWorkspace } from './workspace-diagnostics.ts';
import { ensureWorkspace, initializeWorkspace } from './workspace-initializer.ts';
import type { FrameworkContracts } from './types.ts';

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

  return null;
}
