import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  createOplConnection,
  deleteOplConnection,
  assertCredentialHandleOnlyPayload,
  listOplConnections,
  setDefaultOplConnection,
  testOplConnection,
  updateOplConnection,
} from '../../connect/index.ts';

type JsonRecord = Record<string, unknown>;

type ConnectionActionOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
};

const CONNECTION_ACTIONS = new Set([
  'connection_list',
  'connection_create',
  'connection_update',
  'connection_delete',
  'connection_test',
  'connection_set_default',
]);

function requiredString(payload: JsonRecord, field: string) {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('cli_usage_error', `${field} is required.`, {
      reason_code: 'connection_field_required',
      field,
    });
  }
  return value.trim();
}

export async function executeConnectionAppAction(options: ConnectionActionOptions) {
  if (!CONNECTION_ACTIONS.has(options.actionId)) return null;
  assertCredentialHandleOnlyPayload(options.payload);
  if (options.dryRun && options.actionId !== 'connection_list') {
    throw new FrameworkContractError('cli_usage_error', 'Connection mutations and tests do not support dry-run.', {
      reason_code: 'connection_dry_run_unsupported',
      action_id: options.actionId,
    });
  }

  const delegatedSurface = `opl connect connections ${options.actionId.replace('connection_', '')}`;
  if (options.actionId === 'connection_list') {
    return { delegatedSurface, result: { connection_registry: listOplConnections() } };
  }
  const connectionId = requiredString(options.payload, 'connection_id');
  if (options.actionId === 'connection_create') {
    return {
      delegatedSurface,
      result: createOplConnection({
        connection_id: connectionId,
        name: requiredString(options.payload, 'name'),
        connection_type: requiredString(options.payload, 'connection_type'),
        endpoint: typeof options.payload.endpoint === 'string' ? options.payload.endpoint : null,
        credential_handle: requiredString(options.payload, 'credential_handle'),
        disabled: options.payload.disabled === true,
      }),
    };
  }
  if (options.actionId === 'connection_update') {
    return {
      delegatedSurface,
      result: updateOplConnection(connectionId, {
        ...(options.payload.name !== undefined ? { name: String(options.payload.name) } : {}),
        ...(options.payload.connection_type !== undefined
          ? { connection_type: String(options.payload.connection_type) }
          : {}),
        ...(options.payload.endpoint !== undefined
          ? { endpoint: options.payload.endpoint === null ? null : String(options.payload.endpoint) }
          : {}),
        ...(options.payload.credential_handle !== undefined
          ? { credential_handle: String(options.payload.credential_handle) }
          : {}),
        ...(options.payload.disabled !== undefined ? { disabled: options.payload.disabled === true } : {}),
      }),
    };
  }
  if (options.actionId === 'connection_delete') {
    return { delegatedSurface, result: deleteOplConnection(connectionId) };
  }
  if (options.actionId === 'connection_test') {
    return { delegatedSurface, result: await testOplConnection(connectionId) };
  }
  return { delegatedSurface, result: setDefaultOplConnection(connectionId) };
}
