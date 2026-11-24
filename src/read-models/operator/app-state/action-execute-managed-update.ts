import {
  MANAGED_UPDATE_OWNER_ACTIONS,
  managedUpdateCommand,
  buildManagedUpdateKernelProjection,
  runManagedUpdateKernelOperation,
  listExternalOwnerDelegatedUpdateActions,
  runExternalOwnerDelegatedUpdate,
} from '../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import { buildSettingsControlCenterDryRun } from './action-execute-previews.ts';

type ManagedUpdateAppActionResult = {
  delegatedSurface: string;
  result: unknown;
};

async function buildManagedUpdateControlCenterDryRun(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  componentId: string,
  operation: 'status' | 'check' | 'plan' = 'plan',
) {
  const projection = await buildManagedUpdateKernelProjection(contracts, {
    operation,
    componentId,
  });
  return {
    ...buildSettingsControlCenterDryRun(options.actionId, options.payload),
    managed_update: projection.managed_update,
  };
}

function runManagedUpdateApply(contracts: FrameworkContracts, componentId: string) {
  return runManagedUpdateKernelOperation(contracts, {
    operation: 'apply',
    componentId,
  });
}

export function executeExternalOwnerManagedUpdateAppAction(
  options: AppActionExecuteOptions,
): ManagedUpdateAppActionResult | null {
  if (!(
    options.actionId.startsWith('external_codex_update_')
    || options.actionId === 'external_temporal_update_homebrew'
  )) {
    return null;
  }
  const externalAction = listExternalOwnerDelegatedUpdateActions()
    .find((candidate) => candidate.action_id === options.actionId);
  return {
    delegatedSurface: externalAction?.delegated_surface ?? 'verified external package-manager owner route',
    result: runExternalOwnerDelegatedUpdate(options.actionId, options.dryRun),
  };
}

export async function executeModuleSyncManagedUpdateAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
): Promise<ManagedUpdateAppActionResult | null> {
  if (options.actionId !== 'module_sync') {
    return null;
  }
  return {
    delegatedSurface: managedUpdateCommand('apply', 'opl_packages', { json: false }),
    result: options.dryRun
      ? await buildManagedUpdateKernelProjection(contracts, {
          operation: 'plan',
          componentId: 'opl_packages',
        })
      : await runManagedUpdateApply(contracts, 'opl_packages'),
  };
}

export async function executeSettingsManagedUpdateApplyAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
): Promise<ManagedUpdateAppActionResult | null> {
  if (options.actionId === 'settings_sync_capabilities') {
    return {
      delegatedSurface: managedUpdateCommand('apply', 'opl_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'opl_packages')
        : await runManagedUpdateApply(contracts, 'opl_packages'),
    };
  }

  if (options.actionId === 'settings_apply_opl_packages') {
    return {
      delegatedSurface: managedUpdateCommand('apply', 'opl_packages', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'opl_packages')
        : await runManagedUpdateApply(contracts, 'opl_packages'),
    };
  }

  if (options.actionId === 'settings_apply_opl_base_update') {
    return {
      delegatedSurface: managedUpdateCommand('apply', 'opl_base', { json: false }),
      result: options.dryRun
        ? await buildManagedUpdateControlCenterDryRun(contracts, options, 'opl_base')
        : await runManagedUpdateApply(contracts, 'opl_base'),
    };
  }

  return null;
}

export async function executeSettingsManagedUpdateCheckAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
): Promise<ManagedUpdateAppActionResult | null> {
  if (options.actionId === 'settings_check_opl_base_update') {
    return {
      delegatedSurface: managedUpdateCommand('check', 'opl_base', { json: false }),
      result: await buildManagedUpdateControlCenterDryRun(contracts, options, 'opl_base', 'check'),
    };
  }

  if (options.actionId === 'settings_check_app_update') {
    const dryRun = buildSettingsControlCenterDryRun(options.actionId, options.payload);
    const projection = await buildManagedUpdateKernelProjection(contracts, {
      operation: 'status',
      componentId: 'opl_app',
    }, { allowExternalProbes: false });
    return {
      delegatedSurface: managedUpdateCommand('status', 'opl_app', { json: false }),
      result: {
        settings_control_center_action: dryRun.settings_control_center_action,
        managed_update: projection.managed_update,
      },
    };
  }

  return null;
}

export function executeSettingsManagedUpdateRollbackAppAction(
  options: AppActionExecuteOptions,
): ManagedUpdateAppActionResult | null {
  if (options.actionId === 'settings_rollback_runtime_substrate') {
    return {
      delegatedSurface: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'opl_base', { json: false }),
      result: buildSettingsControlCenterDryRun(options.actionId, options.payload),
    };
  }

  return null;
}
