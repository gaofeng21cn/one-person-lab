import {
  inspectManagedBrowserAutomation,
  MANAGED_BROWSER_AUTOMATION_ACTION_IDS,
  reconcileManagedBrowserAutomation,
  type ManagedBrowserAutomationActionId,
} from '../../../adapters/integration/index.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import type { AppActionExecuteServices } from './action-execute-direct.ts';

export async function executeAutomationAppAction(
  options: AppActionExecuteOptions,
  services: AppActionExecuteServices,
) {

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
          current: await inspectManagedBrowserAutomation({ runExternalChecks: false }),
        }
        : {
          surface_kind: 'opl_managed_browser_automation_action_result',
          action_id: actionId,
          current: await reconcileManagedBrowserAutomation(actionId),
        },
    };
  }

  return null;
}
