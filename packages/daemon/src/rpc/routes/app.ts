import { DaemonRpcError } from '../../errors.ts';
import type { RpcHandler, SocketConnectionState } from '../../server/socket-server.ts';
import { toProjectedPackageSummary } from '../../state/app-state-cache.ts';
import { restoreCodexUserInstructions } from '../../state/codex-personalization.ts';
import { writeCodexUserInstructions } from '../../state/codex-user-instructions.ts';
import { readDomainTaskDetail } from '../../state/domain-task-detail.ts';
import { readSystemInitialize } from '../../state/initialize.ts';
import { readOperatorDrilldown } from '../../state/operator-drilldown.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import { setTaskVisibility } from '../../state/task-visibility.ts';
import { executeWorkspaceRootAction } from '../../state/workspace-root.ts';
import { pickBoolean, pickNumber, pickRecord, pickString } from '../../utils/normalize.ts';
import { executeAppPackageAction } from '../app-package-actions.ts';
import { activateAppCodexRuntime, codexInstallAction, executeCodexInstall, readCodexRuntime } from '../codex-runtime.ts';
import { connectionActions, executeConnectionAction } from '../connection-actions.ts';
import { requireClientContext, requireTrustedHost } from '../context.ts';
import { executeGatewayAction, gatewayAccountActions } from '../gateway-actions.ts';
import { readCloudSoftwareSourceSnapshot, refreshCloudSoftwareEntitlements } from '../cloud-software-source.ts';
import { clearCachedCloudSoftwareEntitlements } from '@opl/pack';
import { executeKnowledgeSourceAction, knowledgeSourceActions } from '../knowledge-source-actions.ts';
import { executeSoftwareSourceAction, softwareSourceActions } from '../software-source-actions.ts';

export function registerAppRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  const appState = (profile: 'fast' | 'full', conn: SocketConnectionState) => {
    const trusted = conn.clientContext?.trusted_host;
    return runtime.appStateCache.getState(profile, trusted ? runtime.paths.state_dir : undefined);
  };

  handlers.set('app.state.get', async (params, conn) => {
    await runtime.waitForInitialPackageDiscovery();
    const rawProfile = pickString(params, 'profile') ?? 'fast';
    const profile = rawProfile === 'full' ? 'full' : 'fast';
    const state = appState(profile, conn);
    if (!conn.clientContext?.trusted_host || !pickBoolean(params, 'include_setup', 'includeSetup')) return state;
    const model = state.app_state.settings_control_center?.app_settings_read_model.codex_model_policy;
    if (!model) return state;
    return {
      ...state,
      app_state: { ...state.app_state, system_initialize: readSystemInitialize(runtime.db, model.model_access_ready) },
    };
  });

  handlers.set('app.operatorDrilldown.get', () => readOperatorDrilldown(runtime));

  handlers.set('app.codexRuntime.get', (_params, conn) => {
    requireTrustedHost(conn, 'app.codexRuntime.get');
    return readCodexRuntime();
  });
  handlers.set('app.codexRuntime.activate', async (_params, conn) => {
    requireTrustedHost(conn, 'app.codexRuntime.activate');
    try {
      return await activateAppCodexRuntime();
    } finally {
      runtime.appStateCache.invalidate();
    }
  });

  handlers.set('app.initialize.get', async (_params, conn) => {
    await runtime.waitForInitialPackageDiscovery();
    const doc = runtime.doctor(true, { repairPermissions: false });
    const state = appState('fast', conn);
    const model = state.app_state.settings_control_center?.app_settings_read_model.codex_model_policy;
    return {
      ...doc,
      state,
      ...(model && {
        system_initialize: readSystemInitialize(
          runtime.db,
          model.model_access_ready,
          (await readCodexRuntime()).runtime_activation.status === 'active',
        ),
      }),
    };
  });

  handlers.set('app.domainDetail.get', async (params) => {
    await runtime.waitForInitialPackageDiscovery();
    const itemId = pickString(params, 'item_id', 'itemId');
    const viewId = pickString(params, 'view_id', 'viewId');
    const ifRevision = pickNumber(params, 'if_revision', 'ifRevision');
    if (!itemId || !viewId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'app.domainDetail.get requires itemId and viewId.');
    }
    if (ifRevision !== undefined && ifRevision < 0) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'ifRevision must be >= 0.');
    }
    const item = runtime.appStateCache.getState('fast').app_state.operator.workbench.work_item_projection_v2.items
      .find(entry => entry.item_id === itemId);
    if (item) return readDomainTaskDetail(item.identity.agent_id ? runtime.packService.inspect(item.identity.agent_id) : null, item, viewId, ifRevision);
    const pkg = runtime.packService.inspect(itemId);
    const view =
      pkg?.manifest.ui?.declarative?.views?.find((v) => v.id === viewId)
      ?? pkg?.manifest.ui?.mcp_apps?.find((a) => a.id === viewId)
      ?? null;
    return {
      ok: true,
      item_id: itemId,
      view_id: viewId,
      revision: runtime.appStateCache.revision,
      view,
      package: pkg ? toProjectedPackageSummary(pkg) : null,
      data: {
        item_id: itemId,
        view_id: viewId,
        status: pkg?.enabled ? 'active' : 'unavailable',
      },
    };
  });

  handlers.set('app.contribution.read', async (params, conn) => {
    const ctx = requireClientContext(conn);
    const packageId = pickString(params, 'package_id', 'packageId');
    const ref = pickString(params, 'ref', 'data_ref', 'dataRef', 'view_id', 'viewId') ?? '';
    const consumerBindToken = pickString(params, 'consumer_bind_token', 'consumerBindToken');
    const explicitSessionId = pickString(params, 'session_id', 'sessionId');
    const ifRevision = pickNumber(params, 'if_revision', 'ifRevision');
    const input = pickRecord(params, 'input', 'context') ?? {};

    return runtime.contributionDispatcher.readContribution({
      callerSessionId: ctx.session_id,
      clientContext: ctx,
      packageId,
      ref,
      consumerBindToken,
      explicitSessionId,
      ifRevision,
      input,
    });
  });

  const handleContributionExecute: RpcHandler = async (params, conn) => {
    const ctx = requireClientContext(conn);
    const explicitPackage = pickString(params, 'package_id', 'packageId');
    const actionId = pickString(params, 'action_id', 'actionId', 'action_ref', 'actionRef') ?? '';
    const payload = pickRecord(params, 'payload', 'input') ?? {};
    const payloadPackage = pickString(payload, 'package_id');
    if (explicitPackage && payloadPackage && explicitPackage !== payloadPackage) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Conflicting Package identities.');
    }
    const packageId = explicitPackage ?? payloadPackage;
    const dryRun = pickBoolean(params, 'dry_run', 'dryRun') ?? false;
    const mode = pickString(params, 'mode');
    const confirmed = pickBoolean(params, 'confirmed');

    return runtime.contributionDispatcher.executeContribution({
      callerSessionId: ctx.session_id,
      clientContext: ctx,
      packageId,
      actionId,
      ...(confirmed !== undefined ? { confirmed } : {}),
      payload,
      dryRun,
      mode,
    });
  };
  handlers.set('app.contribution.execute', handleContributionExecute);

  handlers.set('app.action.execute', async (params, conn) => {
    const actionId = pickString(params, 'action_id', 'actionId') ?? '';
    if (!pickString(params, 'package_id', 'packageId') &&
        (actionId === 'codex_user_instructions_set' || actionId === 'codex_user_instructions_restore_opl_flow_default')) {
      requireTrustedHost(conn, actionId);
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      const payload = pickRecord(params, 'payload') ?? {};
      const result = actionId === 'codex_user_instructions_set'
        ? writeCodexUserInstructions(runtime.paths.state_dir, payload, dryRun)
        : restoreCodexUserInstructions(runtime.packService, runtime.paths.state_dir, payload, dryRun);
      if (!dryRun) runtime.appStateCache.invalidate();
      const execution = { action_id: actionId, dry_run: dryRun, status: dryRun ? 'preview' : 'executed', result };
      return { ...execution, app_action_execution: execution };
    }
    if (actionId === codexInstallAction.action_id) {
      requireTrustedHost(conn, actionId);
      const payload = pickRecord(params, 'payload', 'input') ?? {};
      if (pickString(params, 'package_id', 'packageId') || pickString(payload, 'package_id')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Codex installation does not accept a Package target.');
      }
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      try {
        return await executeCodexInstall(payload, dryRun);
      } finally {
        if (!dryRun) runtime.appStateCache.invalidate();
      }
    }
    if (actionId === 'workspace_root_set') {
      requireTrustedHost(conn, actionId);
      const payload = pickRecord(params, 'payload', 'input') ?? {};
      if (pickString(params, 'package_id', 'packageId') || pickString(payload, 'package_id')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Workspace setup does not accept a Package target.');
      }
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      const result = executeWorkspaceRootAction(runtime.db, payload, dryRun);
      if (!dryRun) runtime.appStateCache.invalidate();
      return result;
    }
    const knowledgeAction = knowledgeSourceActions.find(action => action.action_id === actionId);
    if (knowledgeAction) {
      requireTrustedHost(conn, actionId);
      return executeKnowledgeSourceAction(knowledgeAction, pickRecord(params, 'payload', 'input') ?? {},
        pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview', runtime.workspaceService);
    }
    if (actionId === 'runway_human_gate_resolve') {
      requireTrustedHost(conn, actionId);
      if (pickBoolean(params, 'dry_run', 'dryRun') || params.mode === 'preview') {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Runway decisions require execution mode.');
      }
      const result = await handlers.get('runway.humanGate.resolve')!(pickRecord(params, 'payload', 'input') ?? {}, conn);
      return { ok: true, status: 'executed', app_action_execution: {
        surface_kind: 'opl_app_action_execution.v1', action_id: actionId, dry_run: false, result,
      } };
    }
    const sourceAction = softwareSourceActions.find(action => action.action_id === actionId);
    if (sourceAction) {
      requireTrustedHost(conn, actionId);
      const payload = pickRecord(params, 'payload', 'input') ?? {};
      if (pickString(params, 'package_id', 'packageId')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Software source actions do not accept a Package target.');
      }
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      try {
        return await executeSoftwareSourceAction(sourceAction, payload, dryRun, runtime.db,
          () => runtime.appStateCache.invalidate(),
          () => Promise.resolve(handlers.get('pack.sources.refresh')!(payload, conn)),
          {
            readCloudSource: () => readCloudSoftwareSourceSnapshot(runtime.db, runtime.paths.state_dir),
            checkCloudSource: () => refreshCloudSoftwareEntitlements(runtime.db, runtime.paths.state_dir),
          });
      } finally {
        if (!dryRun && actionId !== 'source_list') runtime.appStateCache.invalidate();
      }
    }
    const connectionAction = connectionActions.find(entry => entry.action_id === actionId);
    if (connectionAction) {
      const context = requireTrustedHost(conn, actionId);
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      try {
        return await executeConnectionAction(connectionAction, pickRecord(params, 'payload', 'input') ?? {}, dryRun, runtime.connectService, context);
      } finally {
        if (!dryRun) runtime.appStateCache.invalidate();
      }
    }
    if (actionId === 'work_item_visibility_set') {
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      if (!dryRun) requireTrustedHost(conn, 'app.action.execute');
      const payload = pickRecord(params, 'payload') ?? {};
      const items = runtime.appStateCache.getState('fast').app_state.operator.workbench.work_item_projection_v2.items;
      const result = setTaskVisibility(runtime.db, payload, {
        dryRun,
        resolveTask: (agentId, projectId, itemId) => items.some(({ identity }) =>
          identity.agent_id !== null && identity.agent_id === agentId
          && identity.project_id === projectId && identity.work_item_id === itemId),
      });
      if (result.status === 'executed') runtime.appStateCache.invalidate();
      return result;
    }
    const gatewayAction = gatewayAccountActions.find(action => action.action_id === actionId);
    if (gatewayAction) {
      requireTrustedHost(conn, actionId);
      const payload = pickRecord(params, 'payload', 'input') ?? {};
      if (pickString(params, 'package_id', 'packageId') || pickString(payload, 'package_id')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Gateway actions do not accept Package targets.');
      }
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      try {
        const res = await executeGatewayAction(gatewayAction, payload, dryRun, runtime.paths.state_dir);
        if (gatewayAction.action_id === 'gateway_account_disconnect') {
          clearCachedCloudSoftwareEntitlements(runtime.db);
        }
        return res;
      } finally {
        runtime.appStateCache.invalidate();
      }
    }

    if (actionId === 'package_contribution_execute') {
      return handleContributionExecute(params, conn);
    }
    return executeAppPackageAction(runtime, handlers, actionId, params, conn);
  });
}
