import {
  buildAgentPackageStoreStorageInventory,
  buildWebuiDataVolumeStorageInventory,
  runOplSystemAction,
} from '../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  stringPayloadField,
} from './action-execute-payloads.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import {
  buildSettingsControlCenterDryRun,
  buildSettingsPruneRuntimeRootsPlan,
} from './action-execute-previews.ts';
import {
  executeSettingsManagedUpdateApplyAppAction,
  executeSettingsManagedUpdateCheckAppAction,
  executeSettingsManagedUpdateRollbackAppAction,
} from './action-execute-managed-update.ts';

export async function executeSettingsRepairAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  if (options.actionId !== 'settings_repair_model_access') return null;
  return {
    delegatedSurface: 'opl system developer-supervisor',
    result: options.dryRun
      ? buildSettingsControlCenterDryRun(options.actionId, options.payload)
      : await runOplSystemAction(contracts, 'developer_supervisor', {
        developerSupervisorEnabled: stringPayloadField(options.payload, 'developerSupervisorEnabled') as 'auto' | 'on' | 'off' | undefined,
        developerSupervisorMode: stringPayloadField(options.payload, 'developerSupervisorMode') as 'external_observe' | 'developer_apply_safe' | undefined,
        developerSupervisorAutoEnableGithubLogin:
          stringPayloadField(options.payload, 'developerSupervisorAutoEnableGithubLogin') ?? undefined,
      }),
  };
}

export async function executeSettingsManagedUpdateApplyAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  return executeSettingsManagedUpdateApplyAppAction(contracts, options);
}

export async function executeSettingsManagedUpdateCheckAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  return executeSettingsManagedUpdateCheckAppAction(contracts, options);
}

export function executeSettingsPostPackageAction(options: AppActionExecuteOptions) {
  if (options.actionId === 'settings_prune_runtime_roots_dry_run') {
    return {
      delegatedSurface: 'opl settings control-center cleanup_plan --dry-run',
      result: buildSettingsPruneRuntimeRootsPlan(),
    };
  }

  if (options.actionId === 'settings_inventory_agent_package_store') {
    const action = buildSettingsControlCenterDryRun(options.actionId, options.payload);
    return {
      delegatedSurface: 'opl app action execute --action settings_inventory_agent_package_store',
      result: {
        settings_control_center_action: action.settings_control_center_action,
        agent_package_store: buildAgentPackageStoreStorageInventory({ persist: !options.dryRun }),
      },
    };
  }

  if (options.actionId === 'settings_inventory_webui_data_volume') {
    const action = buildSettingsControlCenterDryRun(options.actionId, options.payload);
    return {
      delegatedSurface: 'opl app action execute --action settings_inventory_webui_data_volume',
      result: {
        settings_control_center_action: action.settings_control_center_action,
        webui_data_volume: buildWebuiDataVolumeStorageInventory({ persist: !options.dryRun }),
      },
    };
  }

  return null;
}

export function executeSettingsManagedUpdateRollbackAction(options: AppActionExecuteOptions) {
  return executeSettingsManagedUpdateRollbackAppAction(options);
}
