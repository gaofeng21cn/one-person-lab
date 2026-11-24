import {
  executeOplSoftwareSourceAction,
  SOFTWARE_SOURCE_ACTION_IDS,
  type SoftwareSourceActionId,
  SOFTWARE_INSTALLATION_ACTION_ID,
  executeSoftwareInstallationAction,
} from '../../../adapters/integration/index.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

export async function executeSoftwareSourceAppAction(options: AppActionExecuteOptions) {
  if (options.actionId === SOFTWARE_INSTALLATION_ACTION_ID) {
    if (options.dryRun) throw new FrameworkContractError('cli_usage_error', 'Installation changes require exact owner readback and confirmation.');
    return { delegatedSurface: 'installed_package_owner_installation_cli', result: await executeSoftwareInstallationAction(options.payload) };
  }
  if (!SOFTWARE_SOURCE_ACTION_IDS.includes(options.actionId as SoftwareSourceActionId)) return null;
  if (options.dryRun && options.actionId !== 'source_list') {
    throw new FrameworkContractError('cli_usage_error', 'Software source changes and checks do not support dry-run.', { reason_code: 'software_source_dry_run_unsupported' });
  }
  return {
    delegatedSurface: `opl sources ${options.actionId.slice('source_'.length)}`,
    result: await executeOplSoftwareSourceAction(options.actionId as SoftwareSourceActionId, options.payload),
  };
}
