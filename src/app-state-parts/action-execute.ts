import { FrameworkContractError } from '../contracts.ts';
import { runRuntimeOperatorActionExecute } from '../runtime-operator-action-execution.ts';
import { runOplModuleAction } from '../system-installation/modules.ts';
import { runOplSystemAction } from '../system-installation/system-actions.ts';
import { writeOplWorkspaceRootSurface } from '../system-installation/workspace-root.ts';
import type { OplUpdateChannel } from '../system-preferences.ts';
import { runFamilyRuntime } from '../family-runtime.ts';
import { runOplEngineAction } from '../system-installation/engine-actions.ts';
import { type OplEngineAction, type OplModuleAction, type OplModuleId } from '../system-installation/shared.ts';
import { executeWorkspaceAppAction } from '../app-state-workspace-actions.ts';
import { syncFamilySkillPacks } from '../opl-skills.ts';
import type { FrameworkContracts } from '../types.ts';

type JsonRecord = Record<string, unknown>;

export type AppActionExecuteOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value: string, context: string): JsonRecord {
  const parsed = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${context} must be a JSON object.`, {
      context,
    });
  }
  return parsed;
}

export function parseAppActionExecuteArgs(args: string[]): AppActionExecuteOptions {
  let actionId = '';
  let payload: JsonRecord = {};
  let payloadSet = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if (token === '--action' && value) {
      actionId = value;
      index += 1;
      continue;
    }

    if (token === '--payload' && value) {
      if (payloadSet) {
        throw new FrameworkContractError('cli_usage_error', 'Use --payload only once.', {
          option: '--payload',
        });
      }
      payload = parseJsonObject(value, '--payload');
      payloadSet = true;
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    throw new FrameworkContractError('cli_usage_error', `Unknown app action execute option: ${token}.`, {
      option: token,
      usage: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run]',
    });
  }

  if (!actionId) {
    throw new FrameworkContractError('cli_usage_error', 'app action execute requires --action.', {
      required: ['--action'],
    });
  }

  return { actionId, payload, dryRun };
}

function buildDryRunUnresolvedAction(options: AppActionExecuteOptions) {
  return {
    runtime_operator_action_execution: {
      surface_kind: 'opl_runtime_operator_action_execution',
      action_id: options.actionId,
      dry_run: true,
      route: null,
      execution: {
        execution_status: 'dry_run_unresolved',
        execution_kind: 'unresolved_action_route',
        route_ref: null,
        action_kind: null,
        executed_runtime_command: null,
        result: null,
      },
      authority_boundary: {
        opl: 'app_action_execute_preflight',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        provider_completion_is_domain_ready: false,
      },
      non_goals: [
        'does_not_write_domain_truth',
        'does_not_read_or_store_memory_body',
        'does_not_read_or_mutate_artifact_body',
        'does_not_authorize_quality_readiness_or_export_verdict',
      ],
    },
  };
}

function stringPayloadField(payload: JsonRecord, field: string) {
  const value = payload[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function releaseChannelPayload(payload: JsonRecord) {
  const channel = stringPayloadField(payload, 'channel');
  if (channel !== 'stable' && channel !== 'preview') {
    throw new FrameworkContractError('cli_usage_error', 'update_channel action requires payload.channel stable or preview.', {
      action_id: 'update_channel',
      allowed_channels: ['stable', 'preview'],
    });
  }
  return { channel: channel as OplUpdateChannel };
}

function workspaceRootPayload(payload: JsonRecord) {
  const workspaceRoot = stringPayloadField(payload, 'path')
    ?? stringPayloadField(payload, 'workspace_root')
    ?? stringPayloadField(payload, 'workspaceRoot');
  if (!workspaceRoot) {
    throw new FrameworkContractError('cli_usage_error', 'workspace_root_set action requires payload.path.', {
      action_id: 'workspace_root_set',
      required: ['path'],
    });
  }
  return workspaceRoot;
}

function scholarskillsWorkspaceRootPayload(payload: JsonRecord) {
  const workspaceRoot = stringPayloadField(payload, 'workspace_root')
    ?? stringPayloadField(payload, 'workspaceRoot')
    ?? stringPayloadField(payload, 'path');
  if (!workspaceRoot) {
    throw new FrameworkContractError('cli_usage_error', 'scholarskills_workspace_sync action requires payload.workspace_root.', {
      action_id: 'scholarskills_workspace_sync',
      required: ['workspace_root'],
    });
  }
  return workspaceRoot;
}

function scholarskillsQuestRootPayload(payload: JsonRecord) {
  const questRoot = stringPayloadField(payload, 'quest_root')
    ?? stringPayloadField(payload, 'questRoot')
    ?? stringPayloadField(payload, 'path');
  if (!questRoot) {
    throw new FrameworkContractError('cli_usage_error', 'scholarskills_quest_sync action requires payload.quest_root.', {
      action_id: 'scholarskills_quest_sync',
      required: ['quest_root'],
    });
  }
  return questRoot;
}

function booleanPayloadField(payload: JsonRecord, field: string, fallback = false) {
  const value = payload[field];
  return typeof value === 'boolean' ? value : fallback;
}

function positiveIntegerPayloadField(payload: JsonRecord, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new FrameworkContractError('cli_usage_error', `${field} must be a positive integer.`, {
      field,
      value,
    });
  }
  return value;
}

function parseCodexAction(actionId: string): OplEngineAction | null {
  const match = /^codex_(install|update|reinstall|remove)$/.exec(actionId);
  return match ? match[1] as OplEngineAction : null;
}

function parseModuleAction(actionId: string): OplModuleAction | null {
  const match = /^module_(install|update|reinstall|remove)$/.exec(actionId);
  return match ? match[1] as OplModuleAction : null;
}

function modulePayload(payload: JsonRecord): OplModuleId {
  const moduleId = stringPayloadField(payload, 'module_id')
    ?? stringPayloadField(payload, 'moduleId')
    ?? stringPayloadField(payload, 'module');
  if (
    moduleId !== 'medautoscience'
    && moduleId !== 'medautogrant'
    && moduleId !== 'redcube'
    && moduleId !== 'oplmetaagent'
    && moduleId !== 'oplbookforge'
    && moduleId !== 'meddeepscientist'
  ) {
    throw new FrameworkContractError('cli_usage_error', 'module action requires a known payload.module_id.', {
      required: ['module_id'],
      allowed_module_ids: ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'meddeepscientist'],
    });
  }
  return moduleId;
}

function dryRunEngineAction(action: OplEngineAction) {
  return {
    engine_action: {
      engine_id: 'codex',
      action,
      status: 'dry_run',
    },
  };
}

function dryRunModuleAction(action: OplModuleAction, moduleId: OplModuleId) {
  return {
    module_action: {
      module_id: moduleId,
      action,
      status: 'dry_run',
    },
  };
}

function schedulerTickArgs(payload: JsonRecord) {
  const args = ['scheduler', 'tick', '--provider', 'temporal'];
  if (booleanPayloadField(payload, 'force')) {
    args.push('--force');
  }
  const limit = positiveIntegerPayloadField(payload, 'limit');
  if (limit !== null) {
    args.push('--limit', String(limit));
  }
  const profile = stringPayloadField(payload, 'profile');
  if (profile) {
    args.push('--profile', profile);
  }
  if (payload.hydrate === false) {
    args.push('--no-hydrate');
  }
  return args;
}

function dryRunFamilyRuntimeResult(surface: string, args: string[]) {
  const commandPreview = ['opl', 'family-runtime', ...args];
  if (surface === 'scheduler_tick') {
    return {
      family_runtime_scheduler_tick: {
        action: 'tick',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'scheduler_cadence') {
    return {
      family_runtime_scheduler_cadence: {
        action: args[1],
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'provider_repair') {
    return {
      family_runtime_provider: {
        action: 'repair',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  return {
    family_runtime_worker: {
      action: args[1],
      provider_kind: 'temporal',
      status: 'dry_run',
      command_preview: commandPreview,
    },
  };
}

async function executeDirectAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const codexAction = parseCodexAction(options.actionId);
  if (codexAction) {
    return {
      delegatedSurface: `opl engine ${codexAction} --engine codex`,
      result: options.dryRun
        ? dryRunEngineAction(codexAction)
        : await runOplEngineAction(contracts, codexAction, 'codex'),
    };
  }

  const moduleAction = parseModuleAction(options.actionId);
  if (moduleAction) {
    const moduleId = modulePayload(options.payload);
    return {
      delegatedSurface: `opl connect ${moduleAction} --module ${moduleId}`,
      result: options.dryRun
        ? dryRunModuleAction(moduleAction, moduleId)
        : runOplModuleAction(moduleAction, moduleId),
    };
  }

  if (options.actionId === 'module_sync') {
    return {
      delegatedSurface: 'opl connect reconcile-modules',
      result: options.dryRun
        ? {
            system_action: {
              action: 'reconcile_modules',
              status: 'dry_run',
            },
          }
        : await runOplSystemAction(contracts, 'reconcile_modules'),
    };
  }

  if (options.actionId === 'developer_supervisor') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: options.payload,
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor', {
          developerSupervisorEnabled: stringPayloadField(options.payload, 'developerSupervisorEnabled') as 'auto' | 'on' | 'off' | undefined,
          developerSupervisorMode: stringPayloadField(options.payload, 'developerSupervisorMode') as 'external_observe' | 'developer_apply_safe' | undefined,
          developerSupervisorAutoEnableGithubLogin:
            stringPayloadField(options.payload, 'developerSupervisorAutoEnableGithubLogin') ?? undefined,
        }),
    };
  }

  if (options.actionId === 'developer_supervisor_refresh') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: {},
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor'),
    };
  }

  if (options.actionId === 'update_channel') {
    return {
      delegatedSurface: 'opl system update-channel',
      result: options.dryRun
        ? {
            system_action: {
              action: 'update_channel',
              status: 'dry_run',
              details: releaseChannelPayload(options.payload),
            },
          }
        : await runOplSystemAction(contracts, 'update_channel', releaseChannelPayload(options.payload)),
    };
  }

  if (options.actionId === 'workspace_root_set') {
    const workspaceRoot = workspaceRootPayload(options.payload);
    return {
      delegatedSurface: 'opl workspace root set',
      result: options.dryRun
        ? {
            workspace_root: {
              selected_path: workspaceRoot,
              status: 'dry_run',
            },
          }
        : writeOplWorkspaceRootSurface(workspaceRoot),
    };
  }

  if (options.actionId === 'scholarskills_workspace_sync') {
    const workspaceRoot = scholarskillsWorkspaceRootPayload(options.payload);
    return {
      delegatedSurface: 'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace_root>',
      result: options.dryRun
        ? {
            skill_sync: {
              surface_id: 'opl_skill_sync',
              status: 'dry_run',
              domain_id: 'scholarskills',
              scope: 'workspace',
              target_workspace: workspaceRoot,
              target_skill_path: `${workspaceRoot}/.codex/skills/opl-scholarskills`,
              command: `opl connect sync-skills --domain scholarskills --scope workspace --target-workspace ${workspaceRoot} --json`,
              authority_boundary: {
                can_write_domain_truth: false,
                can_sign_owner_receipt: false,
                can_create_typed_blocker: false,
                can_write_runtime_queue: false,
                can_write_owner_receipt: false,
                can_write_paper_body: false,
                can_write_artifact_authority: false,
                can_authorize_publication_readiness: false,
              },
            },
          }
        : syncFamilySkillPacks({
            domains: ['scholarskills'],
            scope: 'workspace',
            targetWorkspace: workspaceRoot,
          }),
    };
  }

  if (options.actionId === 'scholarskills_quest_sync') {
    const questRoot = scholarskillsQuestRootPayload(options.payload);
    return {
      delegatedSurface: 'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest_root>',
      result: options.dryRun
        ? {
            skill_sync: {
              surface_id: 'opl_skill_sync',
              status: 'dry_run',
              domain_id: 'scholarskills',
              scope: 'quest',
              target_quest: questRoot,
              target_skill_path: `${questRoot}/.codex/skills/opl-scholarskills`,
              command: `opl connect sync-skills --domain scholarskills --scope quest --target-quest ${questRoot} --json`,
              authority_boundary: {
                can_write_domain_truth: false,
                can_sign_owner_receipt: false,
                can_create_typed_blocker: false,
                can_write_runtime_queue: false,
                can_write_owner_receipt: false,
                can_write_paper_body: false,
                can_write_artifact_authority: false,
                can_authorize_publication_readiness: false,
              },
            },
          }
        : syncFamilySkillPacks({
            domains: ['scholarskills'],
            scope: 'quest',
            targetQuest: questRoot,
          }),
    };
  }

  const workspaceAction = executeWorkspaceAppAction(contracts, options);
  if (workspaceAction) {
    return workspaceAction;
  }

  if (options.actionId === 'provider_scheduler_status') {
    return {
      delegatedSurface: 'opl family-runtime scheduler status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_scheduler_cadence: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await runFamilyRuntime(['scheduler', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_scheduler_install') {
    const args = ['scheduler', 'install', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler install --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_trigger') {
    const args = ['scheduler', 'trigger', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler trigger --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_tick') {
    const args = schedulerTickArgs(options.payload);
    return {
      delegatedSurface: 'opl family-runtime scheduler tick --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_tick', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_status') {
    return {
      delegatedSurface: 'opl family-runtime worker status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_worker: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await runFamilyRuntime(['worker', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_worker_start') {
    const args = ['worker', 'start', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime worker start --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('worker', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_restart') {
    const args = ['repair', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime repair --provider temporal',
      result: options.dryRun
        ? dryRunFamilyRuntimeResult('provider_repair', args)
        : await runFamilyRuntime(args),
    };
  }

  return null;
}

export async function runOplAppActionExecute(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const direct = await executeDirectAppAction(contracts, options);
  if (direct) {
    return {
      version: 'g2',
      app_action_execution: {
        surface_kind: 'opl_app_action_execution.v1',
        action_id: options.actionId,
        dry_run: options.dryRun,
        delegated_surface: direct.delegatedSurface,
        result: direct.result,
        authority_boundary: {
          opl: 'app_action_boundary_and_runtime_route_delegate',
          app_repo: 'gui_product_truth_and_release_gate_owner',
          shell: 'implementation_adapter_only',
          can_write_domain_truth: false,
          can_read_memory_body: false,
          can_read_artifact_body: false,
        },
      },
    };
  }

  let result: unknown;
  try {
    result = await runRuntimeOperatorActionExecute(contracts, [
      '--action',
      options.actionId,
      ...(Object.keys(options.payload).length > 0 ? ['--payload', JSON.stringify(options.payload)] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
    ]);
  } catch (error) {
    if (!options.dryRun) {
      throw error;
    }
    if (!(error instanceof FrameworkContractError) || error.code !== 'cli_usage_error') {
      throw error;
    }
    result = buildDryRunUnresolvedAction(options);
  }

  return {
    version: 'g2',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1',
      action_id: options.actionId,
      dry_run: options.dryRun,
      delegated_surface: 'opl runtime action execute',
      result,
      authority_boundary: {
        opl: 'app_action_boundary_and_runtime_route_delegate',
        app_repo: 'gui_product_truth_and_release_gate_owner',
        shell: 'implementation_adapter_only',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
      },
    },
  };
}
