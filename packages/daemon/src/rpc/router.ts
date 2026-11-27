import { executeWorkspaceRootAction } from '../state/workspace-root.ts';
import { readDomainTaskDetail } from '../state/domain-task-detail.ts';
import { setTaskVisibility } from '../state/task-visibility.ts';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord, type ClientContext } from '@opl/core';
import type { CapabilityInput } from '@opl/connect';
import {
  LEDGER_ENTRY_KINDS,
  type LedgerEntryKind,
  type ReviewVerdictValue,
} from '@opl/ledger';
import {
  buildPackage,
  createOfficialPackageResolver,
  ensurePackage,
  ExactPackageReleaseSchema,
  migrateV1Package,
  readPackageManifestFromDir,
  verifyReleaseLock,
  type InstallSourceSpec,
  type PackageIntent,
  type PackageOrigin,
} from '@opl/pack';
import { RunwayError, type AttemptRole, type ExecuteStageOptions, type SandboxMode } from '@opl/runway';
import { activateAppCodexRuntime, codexInstallAction, executeCodexInstall, readCodexRuntime } from './codex-runtime.ts';
import { connectionActions, executeConnectionAction } from './connection-actions.ts';
import { executeSoftwareSourceAction, softwareSourceActions } from './software-source-actions.ts';
import { DaemonRpcError } from '../errors.ts';
import { executeGatewayAction, gatewayAccountActions } from './gateway-actions.ts';
import { configureCodexApiKey } from './configure-codex-api-key.ts';
import { gatewayAccountMethods, callGatewayAccount } from './gateway-account.ts';
import type { RpcHandler, SocketConnectionState } from '../server/socket-server.ts';
import { executeAppPackageAction } from './app-package-actions.ts';
import { readSystemInitialize } from '../state/initialize.ts';
import { toProjectedPackageSummary } from '../state/app-state-cache.ts';
import { readOperatorDrilldown } from '../state/operator-drilldown.ts';
import { readCodexPersonalization, restoreCodexUserInstructions } from '../state/codex-personalization.ts';
import { writeCodexUserInstructions } from '../state/codex-user-instructions.ts';
import type { DaemonRuntime } from '../state/runtime.ts';
import {
  coerceInstallSourceSpec,
  pickBoolean,
  pickNumber,
  pickOptionalString,
  pickRecord,
  pickString,
  pickStringArray,
} from '../utils/normalize.ts';

function requireClientContext(conn: SocketConnectionState): ClientContext {
  if (!conn.clientContext) {
    throw new DaemonRpcError(-32001, 'HANDSHAKE_REQUIRED', 'Handshake required.');
  }
  return conn.clientContext;
}

function requireTrustedHost(conn: SocketConnectionState, action: string): ClientContext {
  const ctx = requireClientContext(conn);
  if (!ctx.trusted_host) {
    throw new DaemonRpcError(
      -32003,
      'TRUSTED_HOST_REQUIRED',
      `Action '${action}' requires a trusted host client (opl_app or opl_cli).`,
      { client_kind: ctx.client_kind, action },
    );
  }
  return ctx;
}

function resolveSocketSessionId(
  conn: SocketConnectionState,
  explicitSessionId: string | undefined,
): string {
  const ctx = requireClientContext(conn);
  if (explicitSessionId && explicitSessionId !== ctx.session_id) {
    throw new DaemonRpcError(
      -32001,
      'BIND_TOKEN_SESSION_MISMATCH',
      'Caller session_id does not match authenticated socket session.',
    );
  }
  return ctx.session_id;
}

export function createDaemonRpcRouter(runtime: DaemonRuntime): Map<string, RpcHandler> {
  const handlers = new Map<string, RpcHandler>();

  handlers.set('connect.configureCodexApiKey', (params, conn) => {
    requireTrustedHost(conn, 'connect.configureCodexApiKey');
    return configureCodexApiKey(params);
  });
  for (const method of gatewayAccountMethods) {
    handlers.set(method, async (params, conn) => {
      requireTrustedHost(conn, method);
      try {
        return await callGatewayAccount(method, params, runtime.paths.state_dir);
      } finally {
        // Failed refresh or disconnect can still update the visible account status.
        if (method !== 'connect.gateway.status') runtime.appStateCache.invalidate();
      }
    });
  }

  // ---- daemon.* ----
  handlers.set('daemon.health', () => ({
    ok: true,
    status: 'healthy',
    pid: process.pid,
    version: runtime.version,
    api_version: '2.0',
    started_at: runtime.startedAt,
    db_ok: true,
  }));

  handlers.set('daemon.info', () => ({
    ok: true,
    pid: process.pid,
    version: runtime.version,
    api_version: '2.0',
    base_version: runtime.version,
    started_at: runtime.startedAt,
    state_dir: runtime.paths.state_dir,
    db_file: runtime.paths.db_file,
    socket_path: runtime.paths.socket_path,
    session_file: runtime.paths.session_file,
    marketplace_root: runtime.marketplaceRoot,
  }));

  handlers.set('daemon.doctor', async (params) => {
    const includeFirstRun = pickBoolean(params, 'include_first_run', 'includeFirstRun') ?? false;
    if (includeFirstRun) await runtime.waitForInitialPackageDiscovery();
    return runtime.doctor(includeFirstRun);
  });

  handlers.set('daemon.shutdown', (_params, conn) => {
    requireTrustedHost(conn, 'daemon.shutdown');
    return {
      ok: true,
      shutting_down: true,
    };
  });

  // ---- app.* ----
  const appState = (profile: 'fast' | 'full', conn: SocketConnectionState) => {
    const trusted = conn.clientContext?.trusted_host;
    const state = runtime.appStateCache.getState(profile, trusted ? runtime.paths.state_dir : undefined);
    if (!trusted) return state;
    return { ...state, app_state: { ...state.app_state, codex_personalization: readCodexPersonalization(runtime.packService) } };
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
      app_state: { ...state.app_state, system_initialize: readSystemInitialize(runtime.paths.state_dir, model.model_access_ready) },
    };
  });

  handlers.set('app.operatorDrilldown.get', () => readOperatorDrilldown(runtime));

  handlers.set('app.codexRuntime.get', (_params, conn) => {
    requireTrustedHost(conn, 'app.codexRuntime.get');
    return readCodexRuntime();
  });
  handlers.set('app.codexRuntime.activate', (_params, conn) => {
    requireTrustedHost(conn, 'app.codexRuntime.activate');
    return activateAppCodexRuntime();
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
          runtime.paths.state_dir,
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
    if (item) return readDomainTaskDetail(runtime.packService.inspect(item.identity.agent_id), item, viewId, ifRevision);
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
      return executeCodexInstall(payload, dryRun);
    }
    if (actionId === 'workspace_root_set') {
      requireTrustedHost(conn, actionId);
      const payload = pickRecord(params, 'payload', 'input') ?? {};
      if (pickString(params, 'package_id', 'packageId') || pickString(payload, 'package_id')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Workspace setup does not accept a Package target.');
      }
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      return executeWorkspaceRootAction(runtime.paths.state_dir, payload, dryRun);
    }
    const sourceAction = softwareSourceActions.find(action => action.action_id === actionId);
    if (sourceAction) {
      requireTrustedHost(conn, actionId);
      const payload = pickRecord(params, 'payload', 'input') ?? {};
      if (pickString(params, 'package_id', 'packageId')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Software source actions do not accept a Package target.');
      }
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      return executeSoftwareSourceAction(sourceAction, payload, dryRun, runtime.paths.state_dir);
    }
    const connectionAction = connectionActions.find(entry => entry.action_id === actionId);
    if (connectionAction) {
      const context = requireTrustedHost(conn, actionId);
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      return executeConnectionAction(connectionAction, pickRecord(params, 'payload', 'input') ?? {}, dryRun, runtime.connectService, context);
    }
    if (actionId === 'work_item_visibility_set') {
      const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
      if (!dryRun) requireTrustedHost(conn, 'app.action.execute');
      const payload = pickRecord(params, 'payload') ?? {};
      const items = runtime.appStateCache.getState('fast').app_state.operator.workbench.work_item_projection_v2.items;
      const result = setTaskVisibility(runtime.db, payload, {
        dryRun,
        resolveTask: (agentId, projectId, itemId) => items.some(({ identity }) =>
          identity.agent_id === agentId && identity.project_id === projectId && identity.work_item_id === itemId),
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
        return await executeGatewayAction(gatewayAction, payload, dryRun, runtime.paths.state_dir);
      } finally {
        runtime.appStateCache.invalidate();
      }
    }

    if (actionId === 'package_contribution_execute') {
      return handleContributionExecute(params, conn);
    }
    return executeAppPackageAction(runtime, handlers, actionId, params, conn);
  });

  // ---- workspace.* ----
  const handleWorkspaceInit: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.init');
    const rootPath = pickString(params, 'root_path', 'rootPath', 'path') ?? '';
    const name = pickString(params, 'name');
    const domainId = pickString(params, 'domain_id', 'domainId');
    const metadata = pickRecord(params, 'metadata');
    const ws = runtime.workspaceService.initWorkspace({
      root_path: rootPath,
      name,
      domain_id: domainId ?? null,
      metadata,
    });
    return { ...ws, workspace: ws };
  };
  handlers.set('workspace.init', handleWorkspaceInit);
  handlers.set('workspace.create', handleWorkspaceInit);

  handlers.set('workspace.list', () => ({
    workspaces: runtime.workspaceService.listWorkspaces(),
  }));

  handlers.set('workspace.inspect', (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId', 'id') ?? '';
    if (!workspaceId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'workspace.inspect requires workspace_id.');
    }
    return runtime.workspaceService.inspectWorkspace(workspaceId);
  });

  const handleSourcesBind: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.sources.bind');
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const scope = (pickString(params, 'scope') ?? 'project_local') as
      | 'personal_profile'
      | 'long_term_topic'
      | 'project_local';
    const adapterKind = pickString(params, 'adapter_kind', 'adapterKind', 'adapter') ?? 'local_dir';
    const rootPath = pickString(params, 'root_path', 'rootPath', 'path') ?? '';
    const acceptedRevision = pickString(params, 'accepted_revision', 'acceptedRevision');
    const src = runtime.workspaceService.bindSource({
      workspace_id: workspaceId,
      scope,
      adapter_kind: adapterKind,
      root_path: rootPath,
      accepted_revision: acceptedRevision,
    });
    return { ...src, source: src };
  };
  handlers.set('workspace.sources.bind', handleSourcesBind);
  handlers.set('workspace.knowledge.bind', handleSourcesBind);

  const handleSourcesList: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    return {
      sources: runtime.workspaceService.listSources(workspaceId),
    };
  };
  handlers.set('workspace.knowledge.list', handleSourcesList);
  handlers.set('workspace.sources.list', handleSourcesList);

  const handleSourcesRemove: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.sources.remove');
    const sourceId = pickString(params, 'source_id', 'sourceId') ?? '';
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    if (!sourceId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'workspace.sources.remove requires source_id.');
    }
    return runtime.workspaceService.removeSource({
      source_id: sourceId,
      workspace_id: workspaceId,
    });
  };
  handlers.set('workspace.sources.remove', handleSourcesRemove);
  handlers.set('workspace.knowledge.unbind', handleSourcesRemove);

  const handleSnapshotsCreate: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId') ?? '';
    const sourceId = pickString(params, 'source_id', 'sourceId');
    return runtime.workspaceService.createSnapshot({
      workspace_id: workspaceId,
      stage_run_id: stageRunId,
      source_id: sourceId,
    });
  };
  handlers.set('workspace.snapshots.create', handleSnapshotsCreate);
  handlers.set('workspace.knowledge.snapshot', handleSnapshotsCreate);

  const handleWritebackPropose: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const sourceId = pickString(params, 'source_id', 'sourceId') ?? '';
    const targetPath = pickString(params, 'target_path', 'targetPath') ?? '';
    const content = pickOptionalString(params, 'content') ?? '';
    const acceptedRevision = pickString(params, 'accepted_revision', 'acceptedRevision');
    return runtime.workspaceService.proposeWriteback({
      workspace_id: workspaceId,
      source_id: sourceId,
      target_path: targetPath,
      content,
      accepted_revision: acceptedRevision,
    });
  };
  handlers.set('workspace.writeback.propose', handleWritebackPropose);
  handlers.set('workspace.knowledge.proposeWriteback', handleWritebackPropose);

  const handleWritebackCommit: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'workspace.writeback.commit');
    const proposalId = pickString(params, 'proposal_id', 'proposalId');
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const sourceId = pickString(params, 'source_id', 'sourceId');
    const targetPath = pickString(params, 'target_path', 'targetPath');
    const content = pickOptionalString(params, 'content');
    const acceptedRevision = pickString(params, 'accepted_revision', 'acceptedRevision');
    if (content === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'workspace.writeback.commit requires content.');
    }
    return runtime.workspaceService.commitWriteback({
      proposal_id: proposalId,
      workspace_id: workspaceId,
      source_id: sourceId,
      target_path: targetPath,
      content,
      accepted_revision: acceptedRevision,
    });
  };
  handlers.set('workspace.writeback.commit', handleWritebackCommit);
  handlers.set('workspace.knowledge.commitWriteback', handleWritebackCommit);

  // ---- pack.* ----
  const handlePackList: RpcHandler = async (params) => {
    await runtime.waitForInitialPackageDiscovery();
    const intent = pickString(params, 'intent') as PackageIntent | undefined;
    const origin = pickString(params, 'origin') as PackageOrigin | undefined;
    const query = pickString(params, 'query');
    const enabledOnly = pickBoolean(params, 'enabled_only', 'enabledOnly');
    const packages = runtime.packService
      .list({
        ...(intent ? { intent } : {}),
        ...(origin ? { origin } : {}),
        ...(query ? { query } : {}),
        ...(enabledOnly !== undefined ? { enabledOnly } : {}),
      })
      .map(toProjectedPackageSummary);
    return { packages };
  };
  handlers.set('pack.list', handlePackList);
  handlers.set('pack.catalog.list', handlePackList);
  handlers.set('pack.search', handlePackList);

  handlers.set('pack.inspect', async (params) => {
    await runtime.waitForInitialPackageDiscovery();
    const packageId = pickString(params, 'package_id', 'packageId', 'id');
    const dir = pickString(params, 'dir');
    if (dir) {
      const { realRoot, manifest } = readPackageManifestFromDir(dir);
      const lockPath = path.join(realRoot, 'opl-release.lock.json');
      const lock = fs.existsSync(lockPath) ? verifyReleaseLock(realRoot, undefined, { allowSymlinks: true }) : null;
      const installed = runtime.packService.inspect(manifest.identity.id);
      return {
        manifest,
        dir: realRoot,
        lock,
        installed: installed ? toProjectedPackageSummary(installed) : null,
      };
    }
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.inspect requires package_id or dir.');
    }
    const installed = runtime.packService.inspect(packageId);
    if (!installed) {
      throw new DaemonRpcError(-32013, 'PACK_NOT_FOUND', `Package '${packageId}' is not installed.`);
    }
    return {
      ...toProjectedPackageSummary(installed),
      manifest: installed.manifest,
      installed: toProjectedPackageSummary(installed),
    };
  });

  async function handlePackEnsure(params: Record<string, unknown>, conn: SocketConnectionState, requireExact = false) {
    const ctx = requireTrustedHost(conn, 'pack.ensure');
    const packageId = pickString(params, 'package_id', 'packageId');
    if (!packageId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageId) || packageId.length > 128) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.ensure requires a valid Package ID.');
    }
    const runtimeRoot = params.runtime_root;
    if (runtimeRoot != null && (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot))) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.ensure requires an absolute Full runtime directory.');
    }
    const exact = requireExact || Object.hasOwn(params, 'exact_release')
      ? ExactPackageReleaseSchema.safeParse(params.exact_release)
      : undefined;
    if (exact && !exact.success) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'exact_release requires a valid version, git_commit and digest.');
    }
    const dryRun = pickBoolean(params, 'dry_run', 'dryRun') ?? false;
    try {
      return await ensurePackage(runtime.packService, {
        packageId,
        dryRun,
        exactRelease: exact?.data,
        clientContext: ctx,
        resolveSource: createOfficialPackageResolver({ runtimeRoot }),
        installSource: (input) => runtime.installPackage(input),
      });
    } finally {
      // A dependency may have been enabled even if a later Package failed.
      if (!dryRun) {
        runtime.syncDeclaredProviders();
        await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
        runtime.appStateCache.invalidate();
      }
    }
  }
  handlers.set('pack.ensure', handlePackEnsure);
  handlers.set('pack.ensureExact', (params, conn) => handlePackEnsure(params, conn, true));

  handlers.set('pack.build', (params) => {
    const dir = pickString(params, 'dir') ?? '.';
    const dryRun = pickBoolean(params, 'dry_run', 'dryRun') ?? false;
    const writeLock = dryRun ? false : (pickBoolean(params, 'write_lock', 'writeLock') ?? true);
    return buildPackage(dir, { writeLock, dryRun });
  });

  handlers.set('pack.link', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.link');
    const dir = pickString(params, 'dir') ?? '';
    if (!dir) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.link requires dir.');
    }
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const res = await runtime.linkPackage({ dir, syncCodex, clientContext: ctx });
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  });

  handlers.set('pack.unlink', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.unlink');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.unlink requires package_id.');
    }
    const res = await runtime.packService.unlink({ packageId, clientContext: ctx });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return res;
  });

  const handlePackInstall: RpcHandler = async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.install');
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const rawSources = params.sources;
    if (Array.isArray(rawSources)) {
      const specs = rawSources.map((s) => coerceInstallSourceSpec(s));
      const res = await runtime.packService.installBatch({
        sources: specs,
        syncCodex,
        clientContext: ctx,
      });
      runtime.syncDeclaredProviders();
      await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
      runtime.appStateCache.invalidate();
      return res;
    }
    const rawSource = params.source ?? params.manifest;
    const spec = coerceInstallSourceSpec(rawSource, pickString(params, 'package_id', 'packageId'));
    const res = await runtime.installPackage({
      source: spec,
      syncCodex,
      clientContext: ctx,
    });
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  };
  handlers.set('pack.install', handlePackInstall);
  handlers.set('pack.installBatch', handlePackInstall);

  handlers.set('pack.uninstall', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.uninstall');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.uninstall requires package_id.');
    }
    const res = await runtime.packService.uninstall({ packageId, clientContext: ctx });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('pack.update', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.update');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.update requires package_id.');
    }
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const spec = coerceInstallSourceSpec(params.source, packageId);
    const res = await runtime.packService.update({
      packageId,
      source: spec,
      syncCodex,
      clientContext: ctx,
    });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  });

  handlers.set('pack.updatePlan', (_params, conn) => {
    requireTrustedHost(conn, 'pack.updatePlan');
    return runtime.packService.updatePlan();
  });

  handlers.set('pack.updateAll', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.updateAll');
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const updates: Array<{ packageId: string; source: InstallSourceSpec }> = [];

    if (Array.isArray(params.updates)) {
      for (const item of params.updates) {
        if (!isRecord(item)) continue;
        const pkgId =
          typeof item.package_id === 'string'
            ? item.package_id
            : typeof item.packageId === 'string'
              ? item.packageId
              : '';
        if (!pkgId) continue;
        const rawSource = item.source ?? (isRecord(params.sources) ? params.sources[pkgId] : undefined);
        updates.push({
          packageId: pkgId,
          source: coerceInstallSourceSpec(rawSource, pkgId),
        });
      }
    } else if (isRecord(params.sources)) {
      for (const [pkgId, rawSource] of Object.entries(params.sources)) {
        updates.push({
          packageId: pkgId,
          source: coerceInstallSourceSpec(rawSource, pkgId),
        });
      }
    }

    if (params.updates !== undefined && !Array.isArray(params.updates)
      || params.sources !== undefined && !isRecord(params.sources)) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Invalid package update batch.');
    }
    const res = await runtime.packService.updateAll({
      ...(params.updates !== undefined || params.sources !== undefined ? { updates } : {}),
      background: pickBoolean(params, 'background'),
      syncCodex,
      clientContext: ctx,
    });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('pack.toggle', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.toggle');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    const enabled = pickBoolean(params, 'enabled');
    if (!packageId || enabled === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.toggle requires package_id and enabled boolean.');
    }
    const res = await runtime.packService.toggle({ packageId, enabled, clientContext: ctx });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  });

  handlers.set('pack.operation.status', (params) => {
    const opId = pickString(params, 'op_id', 'opId');
    const batchId = pickString(params, 'batch_id', 'batchId');
    return runtime.packService.operationStatus({
      ...(opId ? { opId } : {}),
      ...(batchId ? { batchId } : {}),
    });
  });

  handlers.set('pack.operation.cancel', (params, conn) => {
    requireTrustedHost(conn, 'pack.operation.cancel');
    const opId = pickString(params, 'op_id', 'opId') ?? '';
    if (!opId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.operation.cancel requires op_id.');
    }
    return runtime.packService.cancelOperation(opId);
  });

  handlers.set('pack.migrateV1', (params) => {
    const repoDir = pickString(params, 'repo_dir', 'repoDir', 'dir') ?? '.';
    const apply = pickBoolean(params, 'apply') ?? false;
    const clean = pickBoolean(params, 'clean') ?? false;
    return migrateV1Package({ repoDir, apply, clean });
  });

  const handleCodexSync: RpcHandler = async (params, conn) => {
    requireTrustedHost(conn, 'pack.codexSync');
    const packageId = pickString(params, 'package_id', 'packageId');
    const importExternal = pickBoolean(params, 'import_external', 'importExternal') ?? true;
    return runtime.codexSync({ packageId, importExternal });
  };
  handlers.set('pack.codexSync', handleCodexSync);
  handlers.set('pack.sync.codex', handleCodexSync);

  // ---- connect.* ----
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

    // Early Studio v2 used these specific connect.add envelopes for its sign-in forms.
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
      return configureCodexApiKey({ api_key: secret });
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

    return runtime.connectService.invoke({
      ...(consumerBindToken ? { consumer_bind_token: consumerBindToken } : {}),
      ...(consumerPackageId ? { consumer_package_id: consumerPackageId } : {}),
      ...(consumerBindToken ? {} : { client_context: ctx }),
      session_id: sessionId,
      connection_id: connectionId,
      capability_id: capabilityId,
      input,
      ...(auditContext ? { audit_context: auditContext as Record<string, string> } : {}),
    });
  });

  handlers.set('connect.channels.list', () => runtime.channelHost.getStateProjection());

  handlers.set('connect.channels.action', async (params, conn) => {
    requireTrustedHost(conn, 'connect.channels.action');
    const packageId = pickString(params, 'package_id', 'packageId') ?? '';
    const ref = pickString(params, 'ref', 'action_ref', 'actionRef') ?? '';
    const input = pickRecord(params, 'input') ?? {};
    const confirmed = pickBoolean(params, 'confirmed');
    return runtime.executeChannelAction({
      package_id: packageId,
      ref,
      input,
      confirmed,
    });
  });

  // ---- runway.* ----
  handlers.set('runway.task.create', (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId') ?? '';
    const agentId = pickString(params, 'agent_id', 'agentId');
    const title = pickString(params, 'title') ?? '';
    const goalPrompt = pickString(params, 'goal_prompt', 'goalPrompt', 'goal') ?? '';
    const autoStart = pickBoolean(params, 'auto_start', 'autoStart') ?? false;
    const explicitStages = Array.isArray(params.stages)
      ? (params.stages as Array<{ stage_id?: string; executor_id?: string; model_id?: string | null }>)
      : undefined;
    const resolvedStages =
      explicitStages && explicitStages.length > 0
        ? explicitStages
        : runtime.resolveAgentStages(agentId);
    const bundle = runtime.runwayRuntime.createTask({
      workspace_id: workspaceId,
      agent_id: agentId ?? null,
      title,
      goal_prompt: goalPrompt,
      ...(resolvedStages.length > 0 ? { stages: resolvedStages } : {}),
    });
    if (autoStart) {
      void runtime.launchNextStageInBackground(bundle.task_id);
    }
    return bundle;
  });

  handlers.set('runway.task.list', (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const status = pickString(params, 'status') as
      | 'active'
      | 'paused_by_human'
      | 'awaiting_human'
      | 'completed'
      | 'cancelled'
      | 'failed'
      | undefined;
    return runtime.runwayRuntime.listTasks({ workspace_id: workspaceId, status });
  });

  handlers.set('runway.task.get', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.get requires task_id.');
    }
    return runtime.runwayRuntime.getTask(taskId);
  });

  handlers.set('runway.stage.start', async (params) => {
    const taskId = pickString(params, 'task_id', 'taskId');
    const explicitStageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const stageId = pickString(params, 'stage_id', 'stageId');
    const executorId = pickString(params, 'executor_id', 'executorId');
    const modelId = pickString(params, 'model_id', 'modelId');
    const role = pickString(params, 'role') as AttemptRole | undefined;
    const reviewedAttemptId = pickString(params, 'reviewed_attempt_id', 'reviewedAttemptId');
    if (('reviewed_attempt_id' in params || 'reviewedAttemptId' in params) && !reviewedAttemptId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'reviewed_attempt_id must identify a producer or repair Attempt.');
    }
    const completeStageStatus = params.complete_stage_status ?? params.completeStageStatus;
    if (completeStageStatus !== undefined && completeStageStatus !== 'completed' && completeStageStatus !== 'awaiting_review') {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'complete_stage_status must be completed or awaiting_review.');
    }
    const sandboxMode = pickString(params, 'sandbox_mode', 'sandboxMode') as SandboxMode | undefined;
    const resumeSessionRef = pickString(params, 'resume_session_ref', 'resumeSessionRef');
    const envTimeoutRaw = process.env.OPL_RUNWAY_ATTEMPT_TIMEOUT_MS?.trim();
    const envTimeout = envTimeoutRaw ? Number(envTimeoutRaw) : undefined;
    const timeoutMs =
      pickNumber(params, 'timeout_ms', 'timeoutMs')
      ?? (envTimeout !== undefined && Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined);
    const promptOverride = pickOptionalString(params, 'prompt_override', 'promptOverride');
    const awaitCompletion = pickBoolean(params, 'await_completion', 'awaitCompletion') ?? false;

    const blockingStageStatuses = new Set([
      'running',
      'human_gate',
      'paused_by_human',
      'repair_required',
      'awaiting_review',
    ]);
    const assertTaskStageStartable = (
      bundle: ReturnType<typeof runtime.runwayRuntime.getTask>,
      targetStageRunId?: string,
    ): void => {
      if (runtime.hasActiveTaskLoop(bundle.task_id)) {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `Task '${bundle.task_id}' already has an active stage execution loop running.`,
          { task_id: bundle.task_id, ...(targetStageRunId ? { stage_run_id: targetStageRunId } : {}) },
        );
      }
      const launchingStageRunId = runtime.getLaunchingTaskStage(bundle.task_id);
      if (launchingStageRunId) {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `Task '${bundle.task_id}' already has stage '${launchingStageRunId}' launching.`,
          {
            task_id: bundle.task_id,
            blocking_stage_run_id: launchingStageRunId,
            ...(targetStageRunId ? { stage_run_id: targetStageRunId } : {}),
          },
        );
      }
      const blocking = bundle.stage_runs.find(
        (sr) => sr.stage_run_id !== targetStageRunId && blockingStageStatuses.has(sr.status),
      );
      if (blocking) {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `Task '${bundle.task_id}' has stage '${blocking.stage_id}' in blocking state '${blocking.status}'.`,
          {
            task_id: bundle.task_id,
            blocking_stage_run_id: blocking.stage_run_id,
            blocking_status: blocking.status,
            ...(targetStageRunId ? { stage_run_id: targetStageRunId } : {}),
          },
        );
      }
    };

    let stageRunId = explicitStageRunId;
    if (!stageRunId) {
      if (!taskId) {
        throw new DaemonRpcError(
          -32602,
          'INVALID_INPUT',
          'runway.stage.start requires stage_run_id or task_id.',
        );
      }
      if (stageId) {
        const bundle = runtime.runwayRuntime.getTask(taskId);
        if (bundle.task.status === 'paused_by_human') {
          throw new RunwayError(
            'TASK_PAUSED_BY_HUMAN',
            `Task '${taskId}' is paused_by_human and cannot start stage '${stageId}'.`,
            { task_id: taskId, stage_id: stageId },
          );
        }
        const matched = bundle.stage_runs.find((sr) => sr.stage_id === stageId);
        assertTaskStageStartable(bundle, matched?.stage_run_id);
        if (!matched) {
          if (bundle.task.status === 'cancelled') {
            throw new RunwayError('INVALID_STAGE_STATE', 'A cancelled task cannot start a new stage.');
          }
          runtime.runwayRuntime.resolveReviewTarget(bundle, undefined, role ?? 'producer', {
            reviewed_attempt_id: reviewedAttemptId,
            resume_session_ref: resumeSessionRef,
          });
        }
        stageRunId = matched
          ? matched.stage_run_id
          : runtime.prepareDynamicStageForStart({
              task_id: taskId,
              stage_id: stageId,
              executor_id: executorId,
              model_id: modelId,
            });
      } else {
        const initialBundle = runtime.runwayRuntime.getTask(taskId);
        if (initialBundle.task.status === 'paused_by_human') {
          throw new RunwayError(
            'TASK_PAUSED_BY_HUMAN',
            `Task '${taskId}' is paused_by_human and cannot claim stages.`,
            { task_id: taskId },
          );
        }
        assertTaskStageStartable(initialBundle);
        const claimed = runtime.runwayStore.claimNextQueuedStage(taskId);
        if (!claimed) {
          throw new RunwayError(
            'INVALID_STAGE_STATE',
            `No queued stage available to start on task '${taskId}'.`,
            { task_id: taskId },
          );
        }
        stageRunId = claimed.stage_run_id;
      }
    }

    const stage = runtime.runwayStore.getStageRun(stageRunId);
    const taskBundle = runtime.runwayRuntime.getTask(stage.task_id);
    if (taskId && taskId !== stage.task_id) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'The requested StageRun belongs to a different task.');
    }
    if (stageId && stageId !== stage.stage_id) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'stage_id and stage_run_id identify different stages.');
    }
    if (taskBundle.task.status === 'paused_by_human' || stage.status === 'paused_by_human') {
      throw new RunwayError(
        'TASK_PAUSED_BY_HUMAN',
        `StageRun '${stageRunId}' is paused_by_human and cannot be executed.`,
        { task_id: taskBundle.task_id, stage_run_id: stageRunId },
      );
    }
    assertTaskStageStartable(taskBundle, stageRunId);
    const reviewing = stage.status === 'awaiting_review' && role === 'reviewer';
    const resuming = resumeSessionRef && (stage.status === 'completed' || stage.status === 'failed');
    if (taskBundle.task.status === 'cancelled' || (stage.status !== 'queued' && stage.status !== 'repair_required' && !reviewing && !resuming)) {
      throw new RunwayError(
        'INVALID_STAGE_STATE',
        `StageRun '${stageRunId}' cannot start from status '${stage.status}'.`,
        { task_id: taskBundle.task_id, stage_run_id: stageRunId, status: stage.status },
      );
    }
    runtime.executorRegistry.get(stage.executor_id);

    const execOptions: ExecuteStageOptions = {
      ...(modelId ? { model_id: modelId } : {}),
      ...(role ? { role } : {}),
      ...(reviewedAttemptId ? { reviewed_attempt_id: reviewedAttemptId } : {}),
      ...(completeStageStatus ? { complete_stage_status: completeStageStatus } : {}),
      ...(sandboxMode ? { sandbox_mode: sandboxMode } : {}),
      ...(resumeSessionRef ? { resume_session_ref: resumeSessionRef } : {}),
      ...(timeoutMs !== undefined ? { timeout_ms: timeoutMs } : {}),
      ...(promptOverride !== undefined ? { prompt_override: promptOverride } : {}),
    };

    if (awaitCompletion) {
      return await runtime.runStageExecutionTracked(taskBundle.task_id, stageRunId, () =>
        runtime.runwayRuntime.executeStage(stageRunId, execOptions),
      );
    }

    runtime.runwayRuntime.resolveReviewTarget(taskBundle, stage, role ?? 'producer', execOptions);
    void runtime.launchStageInBackground(stageRunId, execOptions, taskBundle.task_id);
    return {
      ok: true,
      started: true,
      task_id: taskBundle.task_id,
      stage_run_id: stageRunId,
      stage_id: stage.stage_id,
      executor_id: stage.executor_id,
    };
  });

  const handleTaskPause: RpcHandler = async (params, conn) => {
    requireTrustedHost(conn, 'runway.task.pause');
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    const reason = pickString(params, 'reason');
    const actorId = pickString(params, 'actor_id', 'actorId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.pause requires task_id.');
    }
    return await runtime.runwayRuntime.pauseTask({ task_id: taskId, reason, actor_id: actorId });
  };
  handlers.set('runway.task.pause', handleTaskPause);
  handlers.set('runway.stage.pause', handleTaskPause);

  const handleTaskResume: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.task.resume');
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    const reason = pickString(params, 'reason');
    const actorId = pickString(params, 'actor_id', 'actorId');
    const autoStart = pickBoolean(params, 'auto_start', 'autoStart') ?? false;
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.resume requires task_id.');
    }
    const res = runtime.runwayRuntime.resumeTask({ task_id: taskId, reason, actor_id: actorId });
    if (autoStart) {
      void runtime.launchNextStageInBackground(taskId);
    }
    return res;
  };
  handlers.set('runway.task.resume', handleTaskResume);
  handlers.set('runway.stage.resume', handleTaskResume);

  const handleTaskCancel: RpcHandler = async (params, conn) => {
    requireTrustedHost(conn, 'runway.task.cancel');
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    const reason = pickString(params, 'reason');
    const actorId = pickString(params, 'actor_id', 'actorId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.cancel requires task_id.');
    }
    return await runtime.runwayRuntime.cancelTask({ task_id: taskId, reason, actor_id: actorId });
  };
  handlers.set('runway.task.cancel', handleTaskCancel);
  handlers.set('runway.stage.cancel', handleTaskCancel);

  const handleHumanGateResolve: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.humanGate.resolve');
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId') ?? '';
    const decision = pickString(params, 'decision') ?? '';
    const expectedRevision = pickNumber(params, 'expected_revision', 'expectedRevision');
    const actorId = pickString(params, 'actor_id', 'actorId');
    const waivedDebtIds = pickStringArray(params, 'waived_debt_ids', 'waivedDebtIds');
    const notes = pickString(params, 'notes', 'reason');
    const res = runtime.runwayRuntime.resolveHumanGate({
      stage_run_id: stageRunId,
      decision,
      expected_revision: expectedRevision,
      actor_id: actorId,
      waived_debt_ids: waivedDebtIds,
      notes,
    });
    if (res.status === 'queued') {
      const bundle = runtime.runwayRuntime.getTask(res.task_id);
      const stageAttempts = bundle.attempts.filter((a) => a.stage_run_id === res.stage_run_id);
      if (stageAttempts.length > 0) {
        void runtime.launchNextStageInBackground(res.task_id);
      }
    }
    return res;
  };
  handlers.set('runway.humanGate.resolve', handleHumanGateResolve);
  handlers.set('runway.stage.decide', handleHumanGateResolve);

  handlers.set('runway.executors.list', () => ({
    executors: runtime.runwayRuntime.listExecutors().map((cap) => ({
      ...cap,
      id: cap.executor_id,
      status: 'available',
    })),
  }));

  handlers.set('runway.executors.health', async () => {
    const report = await runtime.runwayRuntime.healthCheckExecutors();
    return {
      ok: true,
      executors: Object.entries(report).map(([id, item]) => ({
        id,
        ...item,
        healthy: item.available,
      })),
    };
  });

  const handleScheduleCreate: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.schedule.create');
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId') ?? '';
    const scheduleId = pickString(params, 'schedule_id', 'scheduleId');
    const agentId = pickString(params, 'agent_id', 'agentId');
    const cronExpr = pickString(params, 'cron_expr', 'cronExpr', 'cron') ?? '';
    const timezone = pickString(params, 'timezone');
    const overlapPolicy = pickString(params, 'overlap_policy', 'overlapPolicy') as
      | 'skip'
      | 'buffer_one'
      | 'cancel_other'
      | 'queue'
      | 'allow'
      | undefined;
    const payload = pickRecord(params, 'payload', 'payload_json', 'payloadJson') ?? {};
    const enabled = pickBoolean(params, 'enabled');
    const nextRunAt = pickString(params, 'next_run_at', 'nextRunAt');
    return runtime.runwayStore.upsertSchedule({
      schedule_id: scheduleId,
      workspace_id: workspaceId,
      agent_id: agentId ?? null,
      cron_expr: cronExpr,
      timezone,
      overlap_policy: overlapPolicy,
      payload,
      enabled,
      ...(nextRunAt ? { next_run_at: nextRunAt } : {}),
    });
  };
  handlers.set('runway.schedule.create', handleScheduleCreate);
  handlers.set('runway.schedules.upsert', handleScheduleCreate);

  const handleScheduleList: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    return {
      schedules: runtime.runwayStore.listSchedules(workspaceId),
    };
  };
  handlers.set('runway.schedule.list', handleScheduleList);
  handlers.set('runway.schedules.list', handleScheduleList);

  handlers.set('runway.schedule.toggle', (params, conn) => {
    requireTrustedHost(conn, 'runway.schedule.toggle');
    const scheduleId = pickString(params, 'schedule_id', 'scheduleId', 'id') ?? '';
    const enabled = pickBoolean(params, 'enabled');
    if (!scheduleId || enabled === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.schedule.toggle requires schedule_id and enabled.');
    }
    return runtime.runwayStore.toggleSchedule(scheduleId, enabled);
  });

  const handleScheduleDelete: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.schedules.delete');
    const scheduleId = pickString(params, 'schedule_id', 'scheduleId', 'id') ?? '';
    if (!scheduleId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.schedules.delete requires schedule_id.');
    }
    return runtime.runwayStore.deleteSchedule(scheduleId);
  };
  handlers.set('runway.schedules.delete', handleScheduleDelete);
  handlers.set('runway.schedule.delete', handleScheduleDelete);

  // ---- ledger.* (append-only; NEVER expose update/delete) ----
  handlers.set('ledger.append', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const attemptId = pickString(params, 'attempt_id', 'attemptId');
    const entryKind = pickString(params, 'entry_kind', 'entryKind') ?? '';
    const ownerId = pickString(params, 'owner_id', 'ownerId') ?? '';
    const payload = pickRecord(params, 'payload');
    const entryId = pickString(params, 'entry_id', 'entryId');
    const createdAt = pickString(params, 'created_at', 'createdAt');

    if (!LEDGER_ENTRY_KINDS.includes(entryKind as LedgerEntryKind)) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', `Unsupported ledger entry_kind '${entryKind}'.`);
    }
    if (!payload) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.append requires payload object.');
    }

    return runtime.ledgerStore.append({
      ...(entryId ? { entry_id: entryId } : {}),
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      entry_kind: entryKind as LedgerEntryKind,
      owner_id: ownerId,
      payload: payload as never,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  });

  handlers.set('ledger.timeline', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId');
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const attemptId = pickString(params, 'attempt_id', 'attemptId');
    const ownerId = pickString(params, 'owner_id', 'ownerId');
    const entryKind = pickString(params, 'entry_kind', 'entryKind') as LedgerEntryKind | undefined;
    const since = pickString(params, 'since');
    const limit = pickNumber(params, 'limit');
    const offset = pickNumber(params, 'offset');
    const order = pickString(params, 'order') as 'asc' | 'desc' | undefined;
    const entries = runtime.ledgerStore.timeline({
      ...(taskId ? { task_id: taskId } : {}),
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      ...(ownerId ? { owner_id: ownerId } : {}),
      ...(entryKind ? { entry_kind: entryKind } : {}),
      ...(since ? { since } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(order ? { order } : {}),
    });
    return {
      task_id: taskId ?? null,
      entries,
      timeline: entries,
    };
  });

  handlers.set('ledger.artifacts', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.artifacts requires task_id.');
    }
    const artifacts = runtime.ledgerStore.artifacts({
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
    });
    return { task_id: taskId, artifacts, entries: artifacts };
  });

  handlers.set('ledger.receipts', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.receipts requires task_id.');
    }
    const receipts = runtime.ledgerStore.receipts({
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
    });
    return { task_id: taskId, receipts, entries: receipts };
  });

  handlers.set('ledger.debts', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const unresolvedOnly = pickBoolean(params, 'unresolved_only', 'unresolvedOnly');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.debts requires task_id.');
    }
    const debts = runtime.ledgerStore.debts({
      task_id: taskId,
      ...(unresolvedOnly !== undefined ? { unresolved_only: unresolvedOnly } : {}),
    });
    return { task_id: taskId, debts, entries: debts };
  });

  handlers.set('ledger.review.record', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const attemptId = pickString(params, 'attempt_id', 'attemptId');
    const ownerId = pickString(params, 'owner_id', 'ownerId') ?? '';
    const verdict = pickString(params, 'verdict') as ReviewVerdictValue | undefined;
    const reviewerId = pickString(params, 'reviewer_id', 'reviewerId');
    const reviewerRole = pickString(params, 'reviewer_role', 'reviewerRole');
    const reviewedArtifactRefs = pickStringArray(params, 'reviewed_artifact_refs', 'reviewedArtifactRefs');
    const verifiedHashes = pickStringArray(params, 'verified_hashes', 'verifiedHashes');
    const findingRefs = pickStringArray(params, 'finding_refs', 'findingRefs');
    const qualityDebtIds = pickStringArray(params, 'quality_debt_ids', 'qualityDebtIds');
    const hardStopClass = pickString(params, 'hard_stop_class', 'hardStopClass');
    const summary = pickString(params, 'summary');

    if (!taskId || !ownerId || !verdict) {
      throw new DaemonRpcError(
        -32602,
        'INVALID_LEDGER_INPUT',
        'ledger.review.record requires task_id, owner_id, and verdict.',
      );
    }

    return runtime.ledgerStore.recordReview({
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      owner_id: ownerId,
      verdict,
      ...(reviewerId ? { reviewer_id: reviewerId } : {}),
      ...(reviewerRole ? { reviewer_role: reviewerRole as 'human' | 're_reviewer' | 'reviewer' } : {}),
      ...(reviewedArtifactRefs ? { reviewed_artifact_refs: reviewedArtifactRefs } : {}),
      ...(verifiedHashes ? { verified_hashes: verifiedHashes } : {}),
      ...(findingRefs ? { finding_refs: findingRefs } : {}),
      ...(qualityDebtIds ? { quality_debt_ids: qualityDebtIds } : {}),
      ...(hardStopClass ? { hard_stop_class: hardStopClass as NonNullable<import('@opl/ledger').RecordReviewInput['hard_stop_class']> } : {}),
      ...(summary ? { summary } : {}),
    });
  });

  handlers.set('ledger.verify', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.verify requires task_id.');
    }
    const checkFileHashes = pickBoolean(params, 'check_file_hashes', 'checkFileHashes') ?? true;
    return runtime.verifyLedgerTask(taskId, checkFileHashes);
  });

  return handlers;
}
