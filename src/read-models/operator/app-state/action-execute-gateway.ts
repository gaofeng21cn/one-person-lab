import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  completeOplGatewaySetup,
  disconnectOplGatewayAccount,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
  useOplGatewayForModelAccess,
} from '../../../adapters/integration/index.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import { stringPayloadField } from './action-execute-payloads.ts';

export async function executeGatewayAppAction(options: AppActionExecuteOptions) {
  const gatewayActions = new Set([
    'gateway_account_complete_setup',
    'gateway_account_refresh',
    'gateway_account_repair',
    'gateway_account_use_for_model_access',
    'gateway_account_disconnect',
  ]);
  if (!gatewayActions.has(options.actionId)) return null;

  if (options.dryRun) {
    throw new FrameworkContractError('cli_usage_error', 'OPL Gateway account actions do not support dry-run.', {
      reason_code: 'gateway_account_dry_run_unsupported',
    });
  }
  const allowedFields = options.actionId === 'gateway_account_complete_setup' || options.actionId === 'gateway_account_repair'
    ? new Set(['group_id'])
    : new Set<string>();
  const extraFields = Object.keys(options.payload).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new FrameworkContractError('cli_usage_error', 'OPL Gateway account actions reject secret or unknown payload fields.', {
      reason_code: 'gateway_account_payload_forbidden',
      fields: extraFields,
    });
  }
  if (options.actionId === 'gateway_account_complete_setup') {
    const groupId = stringPayloadField(options.payload, 'group_id');
    if (!groupId) {
      throw new FrameworkContractError('cli_usage_error', 'gateway_account_complete_setup requires payload.group_id.', {
        reason_code: 'gateway_group_required',
      });
    }
    return { delegatedSurface: 'opl connect gateway complete-setup --group-id <id>', result: await completeOplGatewaySetup(groupId) };
  }
  if (options.actionId === 'gateway_account_refresh') {
    return { delegatedSurface: 'opl connect gateway refresh', result: await refreshOplGatewayAccount() };
  }
  if (options.actionId === 'gateway_account_repair') {
    const groupId = typeof options.payload.group_id === 'string' ? options.payload.group_id : undefined;
    return { delegatedSurface: 'opl connect gateway repair', result: await repairOplGatewayAccount(groupId) };
  }
  if (options.actionId === 'gateway_account_use_for_model_access') {
    return { delegatedSurface: 'opl connect gateway use-for-model-access', result: await useOplGatewayForModelAccess() };
  }
  return { delegatedSurface: 'opl connect gateway disconnect', result: await disconnectOplGatewayAccount() };
}
