import type { ClientContext } from '@opl/core';
import type { ConnectService } from '@opl/connect';
import { DaemonRpcError } from '../errors.ts';

export const connectionActions = [
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
  if (dryRun || typeof id !== 'string' || !id.trim() || Object.keys(payload).some(key => key !== idField && key !== 'confirmed')) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Expected ${idField} for ${action.action_id}.`);
  }
  if (action.confirmation_required && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm this grant revocation before executing it.');
  }
  const result = action.delegated_surface === 'connect.denyRequest'
    ? connect.denyRequest(context, { request_id: id })
    : await connect.revoke(context, { grant_id: id });
  return {
    ok: true, status: 'executed', dry_run: false,
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1', action_id: action.action_id,
      delegated_surface: action.delegated_surface, dry_run: false, result,
    },
  };
}
