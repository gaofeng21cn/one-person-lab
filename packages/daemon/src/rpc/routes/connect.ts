import type { CapabilityInput } from '@opl/connect';
import { clearCachedCloudSoftwareEntitlements } from '@opl/pack';
import { DaemonRpcError } from '../../errors.ts';
import type { RpcHandler } from '../../server/socket-server.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import {
  pickBoolean,
  pickNumber,
  pickOptionalString,
  pickRecord,
  pickString,
  pickStringArray,
} from '../../utils/normalize.ts';
import { configureCodexApiKey } from '../configure-codex-api-key.ts';
import { requireClientContext, requireTrustedHost, resolveSocketSessionId } from '../context.ts';
import { callGatewayAccount, gatewayAccountMethods } from '../gateway-account.ts';

export function registerConnectRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  handlers.set('connect.configureCodexApiKey', (params, conn) => {
    requireTrustedHost(conn, 'connect.configureCodexApiKey');
    const res = configureCodexApiKey(params);
    runtime.appStateCache.invalidate();
    return res;
  });

  for (const method of gatewayAccountMethods) {
    handlers.set(method, async (params, conn) => {
      requireTrustedHost(conn, method);
      try {
        const res = await callGatewayAccount(method, params, runtime.paths.state_dir);
        if (method === 'connect.gateway.disconnect') {
          clearCachedCloudSoftwareEntitlements(runtime.db);
        }
        return res;
      } finally {
        // Failed refresh or disconnect can still update the visible account status.
        if (method !== 'connect.gateway.status') runtime.appStateCache.invalidate();
      }
    });
  }

  handlers.set('connect.list', (params) => {
    const providerType = pickString(params, 'provider_type', 'providerType');
    const status = pickString(params, 'status') as 'active' | 'disabled' | 'expired' | 'deleted' | undefined;
    const includeDeleted = pickBoolean(params, 'include_deleted', 'includeDeleted') ?? false;
    const consumerPackageId = pickString(params, 'consumer_package_id', 'consumerPackageId');
    const connections = runtime.connectService.list({
      ...(providerType ? { provider_type: providerType } : {}),
      ...(status ? { status } : {}),
      include_deleted: includeDeleted,
    });
    const projection = runtime.connectService.listProjection(
      consumerPackageId ? { consumer_package_id: consumerPackageId } : undefined,
    );
    return {
      connections,
      grants: projection.grants,
      invocations: projection.invocations,
    };
  });

  const handleConnectAdd: RpcHandler = async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.add');
    const providerType = pickString(params, 'provider_type', 'providerType') ?? '';
    const displayName = pickString(params, 'display_name', 'displayName') ?? '';
    if (!providerType || !displayName) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.add requires provider_type and display_name.');
    }
    const connectionId = pickString(params, 'connection_id', 'connectionId');
    const accountLabel = pickOptionalString(params, 'account_label', 'accountLabel');
    const endpoint = pickOptionalString(params, 'endpoint');
    const secret = pickOptionalString(params, 'secret');
    const credentialHandle = pickOptionalString(params, 'credential_handle', 'credentialHandle');

    // Guard legacy connect.add envelopes so Gateway/Codex credentials cannot fall into generic connections.
    const legacyStudioForm = !connectionId && !endpoint && !credentialHandle && !params.capabilities && secret !== undefined;
    if (legacyStudioForm && providerType === 'opl_gateway' && accountLabel === displayName) {
      try {
        await callGatewayAccount('connect.gateway.login', { email: displayName, password: secret }, runtime.paths.state_dir);
        return { ok: true };
      } finally {
        runtime.appStateCache.invalidate();
      }
    }
    if (legacyStudioForm && providerType === 'openai_codex' && displayName === 'Codex API Key' && accountLabel === undefined) {
      const res = configureCodexApiKey({ api_key: secret });
      runtime.appStateCache.invalidate();
      return res;
    }

    let capabilities = Array.isArray(params.capabilities)
      ? (params.capabilities as Array<{
          capability_id: string;
          title: string | Record<string, string>;
          risk: 'read' | 'local_write' | 'external_write';
        }>)
      : undefined;

    if (!capabilities || capabilities.length === 0) {
      const discovered = runtime.getCapabilitiesForProviderType(providerType);
      if (discovered.length > 0) {
        capabilities = discovered.map((c) => ({
          capability_id: c.capability_id,
          title: c.title as string | Record<string, string>,
          risk: c.risk,
        }));
      }
    }

    const res = await runtime.connectService.add(ctx, {
      ...(connectionId ? { connection_id: connectionId } : {}),
      provider_type: providerType,
      display_name: displayName,
      ...(accountLabel !== undefined ? { account_label: accountLabel } : {}),
      ...(endpoint !== undefined ? { endpoint } : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(secret !== undefined ? { secret } : {}),
      ...(credentialHandle !== undefined ? { credential_handle: credentialHandle } : {}),
    });
    runtime.appStateCache.invalidate();
    return res;
  };
  handlers.set('connect.add', handleConnectAdd);
  handlers.set('connect.register', handleConnectAdd);

  handlers.set('connect.check', async (params) => {
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    if (!connectionId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.check requires connection_id.');
    }
    return runtime.connectService.checkConnection(connectionId);
  });

  handlers.set('connect.remove', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.remove');
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    if (!connectionId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.remove requires connection_id.');
    }
    const purgeSecret = pickBoolean(params, 'purge_secret', 'purgeSecret') ?? false;
    const deletePermanently = pickBoolean(params, 'delete_permanently', 'deletePermanently') ?? true;
    const reason = pickString(params, 'reason');
    const res = await runtime.connectService.revoke(ctx, {
      connection_id: connectionId,
      delete_permanently: deletePermanently,
      purge_secret: purgeSecret,
      ...(reason ? { reason } : {}),
    });
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('connect.rotateCredential', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.rotateCredential');
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    if (!connectionId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.rotateCredential requires connection_id.');
    }
    const secret = pickOptionalString(params, 'secret');
    const credentialHandle = pickOptionalString(params, 'credential_handle', 'credentialHandle');
    const expectedSecRev = pickNumber(params, 'expected_security_revision', 'expectedSecurityRevision');
    const res = await runtime.connectService.rotateCredential(ctx, {
      connection_id: connectionId,
      ...(secret !== undefined ? { secret } : {}),
      ...(credentialHandle !== undefined ? { credential_handle: credentialHandle } : {}),
      ...(expectedSecRev !== undefined ? { expected_security_revision: expectedSecRev } : {}),
    });
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('connect.setConnectionStatus', (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.setConnectionStatus');
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    const status = pickString(params, 'status') as 'active' | 'disabled' | 'expired' | undefined;
    if (!connectionId || !status) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.setConnectionStatus requires connection_id and status.');
    }
    const res = runtime.connectService.setConnectionStatus(ctx, {
      connection_id: connectionId,
      status,
    });
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('connect.updateCapabilities', (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.updateCapabilities');
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    const capabilities = Array.isArray(params.capabilities) ? params.capabilities : null;
    if (!connectionId || !capabilities) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.updateCapabilities requires connection_id and capabilities.');
    }
    const bumpSecRev = pickBoolean(params, 'bump_security_revision', 'bumpSecurityRevision');
    const expectedSecRev = pickNumber(params, 'expected_security_revision', 'expectedSecurityRevision');
    const res = runtime.connectService.updateCapabilities(ctx, {
      connection_id: connectionId,
      capabilities: capabilities as CapabilityInput[],
      ...(bumpSecRev !== undefined ? { bump_security_revision: bumpSecRev } : {}),
      ...(expectedSecRev !== undefined ? { expected_security_revision: expectedSecRev } : {}),
    });
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('connect.issueConsumerBindToken', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.issueConsumerBindToken');
    const consumerPackageId = pickString(params, 'consumer_package_id', 'consumerPackageId') ?? '';
    if (!consumerPackageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'connect.issueConsumerBindToken requires consumer_package_id.');
    }
    const targetSessionId = pickString(params, 'session_id', 'sessionId') ?? ctx.session_id;
    const ttlMs = pickNumber(params, 'ttl_ms', 'ttlMs');
    const issued = await runtime.connectService.issueConsumerBindToken(ctx, {
      consumer_package_id: consumerPackageId,
      session_id: targetSessionId,
      ...(ttlMs !== undefined ? { ttl_ms: ttlMs } : {}),
    });
    return {
      ...issued,
      consumer_bind_token: issued.token,
    };
  });

  handlers.set('connect.requestAccess', async (params, conn) => {
    const ctx = requireClientContext(conn);
    const sessionId = resolveSocketSessionId(conn, pickString(params, 'session_id', 'sessionId'));
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    const consumerPackageId = pickString(params, 'consumer_package_id', 'consumerPackageId');
    const consumerBindToken = pickString(params, 'consumer_bind_token', 'consumerBindToken');
    const capIds = pickStringArray(params, 'capability_ids', 'capabilityIds');
    const singleCap = pickString(params, 'capability_id', 'capabilityId');
    const capabilityIds = capIds && capIds.length > 0 ? capIds : singleCap ? [singleCap] : [];
    const expiresAt = pickString(params, 'expires_at', 'expiresAt');

    const res = await runtime.connectService.requestAccess({
      ...(consumerPackageId ? { consumer_package_id: consumerPackageId } : {}),
      ...(consumerBindToken ? { consumer_bind_token: consumerBindToken } : {}),
      session_id: sessionId,
      client_context: ctx,
      connection_id: connectionId,
      capability_ids: capabilityIds,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    });
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('connect.approveRequest', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.approveRequest');
    const requestId = pickString(params, 'request_id', 'requestId');
    const grantId = pickString(params, 'grant_id', 'grantId');
    const approvedBy = pickString(params, 'approved_by', 'approvedBy');
    const expiresAt = pickString(params, 'expires_at', 'expiresAt');
    const reason = pickString(params, 'reason');
    const grants = await runtime.connectService.approveRequest(ctx, {
      ...(requestId ? { request_id: requestId } : {}),
      ...(grantId ? { grant_id: grantId } : {}),
      ...(approvedBy ? { approved_by: approvedBy } : {}),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
      ...(reason ? { reason } : {}),
    });
    runtime.appStateCache.invalidate();
    return {
      ok: true,
      stateRefreshRequired: true,
      grants,
    };
  });

  handlers.set('connect.denyRequest', (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.denyRequest');
    const requestId = pickString(params, 'request_id', 'requestId');
    const grantId = pickString(params, 'grant_id', 'grantId');
    const reason = pickString(params, 'reason');
    const grants = runtime.connectService.denyRequest(ctx, {
      ...(requestId ? { request_id: requestId } : {}),
      ...(grantId ? { grant_id: grantId } : {}),
      ...(reason ? { reason } : {}),
    });
    runtime.appStateCache.invalidate();
    return {
      ok: true,
      grants,
    };
  });

  const handleConnectRevoke: RpcHandler = async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'connect.revoke');
    const grantId = pickString(params, 'grant_id', 'grantId');
    const connectionId = pickString(params, 'connection_id', 'connectionId');
    const deletePermanently = pickBoolean(params, 'delete_permanently', 'deletePermanently');
    const purgeSecret = pickBoolean(params, 'purge_secret', 'purgeSecret');
    const reason = pickString(params, 'reason');
    const res = await runtime.connectService.revoke(ctx, {
      ...(grantId ? { grant_id: grantId } : {}),
      ...(connectionId ? { connection_id: connectionId } : {}),
      ...(deletePermanently !== undefined ? { delete_permanently: deletePermanently } : {}),
      ...(purgeSecret !== undefined ? { purge_secret: purgeSecret } : {}),
      ...(reason ? { reason } : {}),
    });
    runtime.appStateCache.invalidate();
    return res;
  };
  handlers.set('connect.revoke', handleConnectRevoke);
  handlers.set('connect.revokeGrant', handleConnectRevoke);

  handlers.set('connect.grants.list', (params) => {
    const consumerPackageId = pickString(params, 'consumer_package_id', 'consumerPackageId');
    const connectionId = pickString(params, 'connection_id', 'connectionId');
    const proj = runtime.connectService.listProjection(
      consumerPackageId ? { consumer_package_id: consumerPackageId } : undefined,
    );
    const grants = connectionId
      ? proj.grants.filter((g) => g.connection_id === connectionId)
      : proj.grants;
    return { grants };
  });

  handlers.set('connect.invoke', async (params, conn) => {
    const ctx = requireClientContext(conn);
    const sessionId = resolveSocketSessionId(conn, pickString(params, 'session_id', 'sessionId'));
    const consumerBindToken = pickString(params, 'consumer_bind_token', 'consumerBindToken');
    const consumerPackageId = pickString(params, 'consumer_package_id', 'consumerPackageId');
    const connectionId = pickString(params, 'connection_id', 'connectionId') ?? '';
    const capabilityId = pickString(params, 'capability_id', 'capabilityId') ?? '';
    const input = pickRecord(params, 'input') ?? {};
    const auditContext = pickRecord(params, 'audit_context', 'auditContext');

    try {
      return await runtime.connectService.invoke({
        ...(consumerBindToken ? { consumer_bind_token: consumerBindToken } : {}),
        ...(consumerPackageId ? { consumer_package_id: consumerPackageId } : {}),
        ...(consumerBindToken ? {} : { client_context: ctx }),
        session_id: sessionId,
        connection_id: connectionId,
        capability_id: capabilityId,
        input,
        ...(auditContext ? { audit_context: auditContext as Record<string, string> } : {}),
      });
    } finally {
      runtime.appStateCache.invalidate();
    }
  });
}
