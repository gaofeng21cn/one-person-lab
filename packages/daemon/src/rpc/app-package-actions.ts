import { isRecord } from '@opl/core';
import { readAppPackageOperations } from '../contributions/package-operations.ts';
import { DaemonRpcError } from '../errors.ts';
import type { RpcHandler, SocketConnectionState } from '../server/socket-server.ts';
import { setAppPackageEnabled, setAppShortcutPreference } from '../state/app-package-preferences.ts';
import type { DaemonRuntime } from '../state/runtime.ts';
import { pickBoolean, pickRecord, pickString } from '../utils/normalize.ts';

export async function executeAppPackageAction(
  runtime: DaemonRuntime,
  handlers: ReadonlyMap<string, RpcHandler>,
  actionId: string,
  params: Record<string, unknown>,
  conn: SocketConnectionState,
) {
  const payload = pickRecord(params, 'payload') ?? {};
  const dryRun = pickBoolean(params, 'dry_run', 'dryRun') === true || params.mode === 'preview';
  const confirmationRequired = ['agent_package_install', 'agent_package_uninstall', 'settings_apply_opl_packages'].includes(actionId);
  function requireMutation() {
    if (!conn.clientContext?.trusted_host) {
      throw new DaemonRpcError(-32003, 'TRUSTED_HOST_REQUIRED', 'App changes require a trusted host.');
    }
    if (confirmationRequired && payload.confirmed !== true) {
      throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm the Package action before execution.');
    }
  }
  function receipt(result: unknown, status = dryRun ? 'preview' : 'executed') {
    const action = { action_id: actionId, dry_run: dryRun, result };
    return { ...action, dryRun, status, confirmationRequired, authorityBoundary: 'app_bridge_no_domain_authority',
      app_action_execution: action };
  }
  async function callOwner(method: string, args: Record<string, unknown>) {
    const handler = handlers.get(method);
    if (!handler) throw new DaemonRpcError(-32004, 'ACTION_NOT_FOUND', `Pack does not support '${method}'.`);
    return handler(args, conn);
  }
  if (actionId === 'package_operation_status') {
    return receipt(readAppPackageOperations(runtime.packService));
  }
  if (actionId === 'settings_apply_opl_packages') {
    if (!dryRun) requireMutation();
    const result = await callOwner(dryRun ? 'pack.updatePlan' : 'pack.updateAll', {});
    const failed = isRecord(result) && Array.isArray(result.failures) && result.failures.length > 0;
    return receipt(result, failed ? 'failed' : undefined);
  }
  if (!['agent_package_install', 'agent_package_uninstall', 'agent_package_preferences_set', 'package_app_set_enabled'].includes(actionId)) {
    throw new DaemonRpcError(-32004, 'ACTION_NOT_FOUND', `No App action is registered for '${actionId}'.`);
  }
  const packageId = pickString(payload, 'package_id');
  const explicitPackage = pickString(params, 'package_id', 'packageId');
  if (!packageId || (explicitPackage && explicitPackage !== packageId)) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A matching payload.package_id is required.');
  }
  if (!dryRun) requireMutation();
  if (actionId === 'agent_package_install') {
    return receipt(await callOwner('pack.ensure', { package_id: packageId, dry_run: dryRun }));
  }
  const installed = runtime.packService.inspect(packageId);
  if (!installed) {
    throw new DaemonRpcError(-32004, 'PACKAGE_NOT_FOUND', `Package '${packageId}' is not installed.`);
  }
  if (actionId === 'package_app_set_enabled' || (actionId === 'agent_package_preferences_set' && !('exposure_action' in payload))) {
    const result = actionId === 'package_app_set_enabled'
      ? setAppPackageEnabled(runtime.db, installed, payload, { dryRun })
      : setAppShortcutPreference(runtime.db, installed, payload, { dryRun });
    if (!dryRun) runtime.appStateCache.invalidate();
    return receipt(result);
  }
  if (installed.origin === 'external') {
    throw new DaemonRpcError(-32004, 'PACKAGE_NOT_MANAGED', `Pack does not manage '${packageId}'.`);
  }
  const uninstall = actionId === 'agent_package_uninstall';
  const exposure = payload.exposure_action;
  if (!uninstall && ((exposure !== 'enable' && exposure !== 'disable') || 'shortcut_id' in payload)) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Specify a single Package enable or disable action.');
  }
  if (dryRun) return receipt({ package_id: packageId, ...(uninstall ? {} : { enabled: exposure === 'enable' }) });
  return receipt(await callOwner(uninstall ? 'pack.uninstall' : 'pack.toggle', {
    package_id: packageId, ...(uninstall ? {} : { enabled: exposure === 'enable' }),
  }));
}
