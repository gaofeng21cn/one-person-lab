import {
  runOplModuleAction,
} from '../../../adapters/integration/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  modulePayload,
  parseModuleAction,
} from './action-execute-payloads.ts';
import { dryRunModuleAction } from './action-execute-previews.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import {
  executeModuleSyncManagedUpdateAppAction,
} from './action-execute-managed-update.ts';

export function executeModuleAppAction(options: AppActionExecuteOptions) {
  const moduleAction = parseModuleAction(options.actionId);
  if (!moduleAction) return null;

  const moduleId = modulePayload(options.payload);
  return {
    delegatedSurface: `opl connect ${moduleAction} --module ${moduleId}`,
    result: options.dryRun
      ? dryRunModuleAction(moduleAction, moduleId)
      : runOplModuleAction(moduleAction, moduleId),
  };
}

export async function executeModuleSyncAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  return executeModuleSyncManagedUpdateAppAction(contracts, options);
}
