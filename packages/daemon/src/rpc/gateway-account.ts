import {
  authorizeOplLinkCompanion,
  completeOplGatewaySetup,
  disconnectOplGatewayAccount,
  loginOplGatewayAccount,
  readOplGatewayAccount,
  refreshOplGatewayAccount,
  repairOplGatewayAccount,
  useOplGatewayForModelAccess,
  withGatewayStateDirectory,
} from '@opl/connect';
import { DaemonRpcError } from '../errors.ts';

export const gatewayAccountMethods = [
  'connect.gateway.status',
  'connect.gateway.login',
  'connect.gateway.refresh',
  'connect.gateway.completeSetup',
  'connect.gateway.repair',
  'connect.gateway.disconnect',
  'connect.gateway.useForModelAccess',
  'connect.gateway.authorizeCompanion',
] as const;
type GatewayMethod = typeof gatewayAccountMethods[number];

function invalid(message: string): never {
  throw new DaemonRpcError(-32602, 'INVALID_INPUT', message);
}

export function callGatewayAccount(method: GatewayMethod, params: Record<string, unknown>, stateDir: string): Promise<Record<string, unknown>> {
  return withGatewayStateDirectory(stateDir, async () => {
    switch (method) {
      case 'connect.gateway.status': return { gateway_account: readOplGatewayAccount() };
      case 'connect.gateway.login': {
        const { email, password, device_label } = params;
        if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password.trim()
            || (device_label !== undefined && typeof device_label !== 'string')
            || Buffer.byteLength(email + password + (device_label ?? '')) > 65_536) {
          invalid('Gateway login requires a bounded email and password.');
        }
        return loginOplGatewayAccount({ email: email.trim(), password, device_label });
      }
      case 'connect.gateway.refresh': return refreshOplGatewayAccount();
      case 'connect.gateway.completeSetup':
        if (typeof params.group_id !== 'string' || !params.group_id.trim()) invalid('Gateway setup requires group_id.');
        return completeOplGatewaySetup(params.group_id.trim());
      case 'connect.gateway.repair':
        if (params.group_id !== undefined && typeof params.group_id !== 'string') invalid('group_id must be a string.');
        return repairOplGatewayAccount(params.group_id?.trim() || undefined);
      case 'connect.gateway.disconnect': return disconnectOplGatewayAccount();
      case 'connect.gateway.useForModelAccess': return useOplGatewayForModelAccess();
      case 'connect.gateway.authorizeCompanion':
        if (typeof params.credential_file !== 'string' || !params.credential_file) invalid('A private credential file is required.');
        return authorizeOplLinkCompanion(params.request, params.credential_file);
    }
  });
}
