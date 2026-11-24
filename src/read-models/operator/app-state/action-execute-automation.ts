import {
  inspectManagedBrowserAutomation,
  MANAGED_BROWSER_AUTOMATION_ACTION_IDS,
  reconcileManagedBrowserAutomation,
  type ManagedBrowserAutomationActionId,
  inspectManagedComputerUse,
  MANAGED_COMPUTER_USE_ACTION_IDS,
  reconcileManagedComputerUse,
  type ManagedComputerUseActionId,
} from '../../../adapters/integration/index.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import type { AppActionExecuteServices } from './action-execute-types.ts';

export async function executeAutomationAppAction(
  options: AppActionExecuteOptions,
  services: AppActionExecuteServices,
) {
  if (MANAGED_COMPUTER_USE_ACTION_IDS.includes(options.actionId as ManagedComputerUseActionId)) {
    const actionId = options.actionId as ManagedComputerUseActionId;
    if (services.automationProviderHost) {
      return {
        delegatedSurface: `opl managed companion ${actionId}`,
        result: options.dryRun
          ? {
            surface_kind: 'opl_managed_computer_use_action_preflight',
            action_id: actionId,
            status: 'dry_run',
            current: await services.automationProviderHost.inspect({
              automation_kind: 'computer_use',
              runExternalChecks: false,
            }),
          }
          : {
            surface_kind: 'opl_managed_computer_use_action_result',
            action_id: actionId,
            current: await services.automationProviderHost.execute({
              automation_kind: 'computer_use',
              action_id: actionId,
            }),
          },
      };
    }
    return {
      delegatedSurface: `opl managed companion ${actionId}`,
      result: options.dryRun
        ? {
          surface_kind: 'opl_managed_computer_use_action_preflight',
          action_id: actionId,
          status: 'dry_run',
          current: inspectManagedComputerUse({ runExternalChecks: false }),
        }
        : {
          surface_kind: 'opl_managed_computer_use_action_result',
          action_id: actionId,
          current: reconcileManagedComputerUse(actionId),
        },
    };
  }

  if (MANAGED_BROWSER_AUTOMATION_ACTION_IDS.includes(options.actionId as ManagedBrowserAutomationActionId)) {
    const actionId = options.actionId as ManagedBrowserAutomationActionId;
    if (services.automationProviderHost) {
      return {
        delegatedSurface: `opl managed companion ${actionId}`,
        result: options.dryRun
          ? {
            surface_kind: 'opl_managed_browser_automation_action_preflight',
            action_id: actionId,
            status: 'dry_run',
            current: await services.automationProviderHost.inspect({
              automation_kind: 'browser_automation',
              runExternalChecks: false,
            }),
          }
          : {
            surface_kind: 'opl_managed_browser_automation_action_result',
            action_id: actionId,
            current: await services.automationProviderHost.execute({
              automation_kind: 'browser_automation',
              action_id: actionId,
            }),
          },
      };
    }
    return {
      delegatedSurface: `opl managed companion ${actionId}`,
      result: options.dryRun
        ? {
          surface_kind: 'opl_managed_browser_automation_action_preflight',
          action_id: actionId,
          status: 'dry_run',
          current: inspectManagedBrowserAutomation({ runExternalChecks: false }),
        }
        : {
          surface_kind: 'opl_managed_browser_automation_action_result',
          action_id: actionId,
          current: reconcileManagedBrowserAutomation(actionId),
        },
    };
  }

  return null;
}
