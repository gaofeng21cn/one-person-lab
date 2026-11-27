import type { ClientContext } from '@opl/core';
import type { ConnectService } from '@opl/connect';
import { DaemonRpcError } from '../errors.ts';

export const connectionActions = [
  { action_id: 'connection_test', label: 'Test connection', delegated_surface: 'connect.check',
    payload_fields: ['connection_id'], confirmation_required: false },
  { action_id: 'connection_update', label: 'Update connection', delegated_surface: 'connect.setConnectionStatus',
    payload_fields: ['connection_id', 'status'], confirmation_required: false },
  { action_id: 'connection_delete', label: 'Delete connection', delegated_surface: 'connect.remove',
    payload_fields: ['connection_id', 'purge_secret', 'reason'], confirmation_required: true },
  {
    action_id: 'connection_access_request_deny', label: 'Deny connection access request',
    delegated_surface: 'connect.denyRequest', payload_fields: ['request_id'], confirmation_required: false,
  },
  {
    action_id: 'connection_grant_revoke', label: 'Revoke consumer grant',
    delegated_surface: 'connect.revokeGrant', payload_fields: ['grant_id'], confirmation_required: true,
  },
].map(action => ({ ...action, route: 'app.action.execute', owner: 'one-person-lab', dry_run_supported: false }));

export async function executeConnectionAction(
  action: typeof connectionActions[number], payload: Record<string, unknown>, dryRun: boolean,
  connect: ConnectService, context: ClientContext,
) {
  const idField = action.payload_fields[0]!;
  const id = payload[idField];
  if (dryRun || typeof id !== 'string' || !id.trim() || Object.keys(payload).some(key => !action.payload_fields.includes(key) && key !== 'confirmed')) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Expected ${idField} for ${action.action_id}.`);
  }
  if (action.confirmation_required && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm this connection action before executing it.');
  }
  let result;
  switch (action.action_id) {
    case 'connection_test':
      result = await connect.checkConnection(id);
      break;
    case 'connection_update': {
      const status = payload.status;
      if (status !== 'active' && status !== 'disabled' && status !== 'expired') {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Expected active, disabled or expired connection status.');
      }
      result = connect.setConnectionStatus(context, { connection_id: id, status });
      break;
    }
    case 'connection_delete':
      if ((payload.purge_secret !== undefined && typeof payload.purge_secret !== 'boolean')
        || (payload.reason !== undefined && typeof payload.reason !== 'string')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Invalid connection deletion parameters.');
      }
      result = await connect.revoke(context, {
        connection_id: id, delete_permanently: true, purge_secret: payload.purge_secret === true,
        ...(typeof payload.reason === 'string' && { reason: payload.reason }),
      });
      break;
    case 'connection_access_request_deny':
      result = connect.denyRequest(context, { request_id: id });
      break;
    default:
      result = await connect.revoke(context, { grant_id: id });
  }
  return {
    ok: true, status: 'executed', dry_run: false,
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1', action_id: action.action_id,
      delegated_surface: action.delegated_surface, dry_run: false, result,
    },
  };
}
