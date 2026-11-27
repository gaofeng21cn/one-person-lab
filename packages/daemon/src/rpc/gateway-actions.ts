import { DaemonRpcError } from '../errors.ts';
import { callGatewayAccount } from './gateway-account.ts';

const operations = [
  {
    action_id: 'gateway_account_complete_setup', label: 'Complete OPL Gateway setup',
    delegated_surface: 'connect.gateway.completeSetup', mutates: 'opl_gateway_account_and_managed_key',
    confirmation_required: false, payload_fields: ['group_id'],
  },
  {
    action_id: 'gateway_account_refresh', label: 'Refresh OPL Gateway account',
    delegated_surface: 'connect.gateway.refresh', mutates: 'opl_gateway_rotating_session_and_cache',
    confirmation_required: false, payload_fields: [],
  },
  {
    action_id: 'gateway_account_repair', label: 'Repair OPL Gateway account',
    delegated_surface: 'connect.gateway.repair', mutates: 'opl_gateway_account_and_managed_key',
    confirmation_required: false, payload_fields: [],
  },
  {
    action_id: 'gateway_account_use_for_model_access', label: 'Use OPL Gateway for model access',
    delegated_surface: 'connect.gateway.useForModelAccess', mutates: 'local_codex_provider_config',
    confirmation_required: true, payload_fields: [],
  },
  {
    action_id: 'gateway_account_disconnect', label: 'Disconnect OPL Gateway account',
    delegated_surface: 'connect.gateway.disconnect', mutates: 'opl_gateway_managed_key_and_private_session',
    confirmation_required: true, payload_fields: [],
  },
] as const;

export const gatewayAccountActions = operations.map(action => ({
  ...action,
  owner: 'one-person-lab',
  route: `opl app action execute --action ${action.action_id}`,
  dry_run_supported: false,
  danger_level: action.confirmation_required ? 'medium' : 'low',
}));

export async function executeGatewayAction(
  action: typeof gatewayAccountActions[number],
  payload: Record<string, unknown>,
  dryRun: boolean,
  stateDirectory: string,
) {
  if (dryRun) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Gateway account actions do not support preview.', {
      reason_code: 'gateway_account_dry_run_unsupported',
    });
  }
  const acceptsGroup = action.delegated_surface === 'connect.gateway.completeSetup' || action.delegated_surface === 'connect.gateway.repair';
  if (Object.keys(payload).some(key => key !== 'confirmed' && !(key === 'group_id' && acceptsGroup))) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Unexpected Gateway account action fields.', {
      reason_code: 'gateway_account_payload_forbidden',
    });
  }
  if (action.confirmation_required && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm this Gateway account action before executing it.');
  }
  const result = await callGatewayAccount(action.delegated_surface, { group_id: payload.group_id }, stateDirectory);
  return {
    ok: true,
    status: 'executed',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1',
      action_id: action.action_id,
      dry_run: false,
      delegated_surface: action.delegated_surface,
      result,
    },
  };
}
