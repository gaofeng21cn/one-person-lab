import type { OplPackageManifestV2 } from '../manifest/schema.ts';
import type { PackageOperationAction, ReloadMode } from '../types.ts';

export interface ReloadModeContext {
  readonly action?: PackageOperationAction | 'link' | 'unlink' | 'toggle';
  readonly isFirstTimeDshProfileOverride?: boolean;
  readonly canHotReloadDshClient?: boolean;
}

export function classifyReloadMode(
  manifest: OplPackageManifestV2,
  context: ReloadModeContext = {},
): ReloadMode {
  const provides = manifest.provides;
  const ui = manifest.ui;
  const dshClient = ui?.dsh_client;

  if (dshClient?.host_entry) {
    return 'restart_required';
  }
  if (
    dshClient
    && (context.isFirstTimeDshProfileOverride === true || context.canHotReloadDshClient === false)
  ) {
    return 'restart_required';
  }
  if (
    (provides?.channels?.length ?? 0) > 0
    || (provides?.remote_companion_connectors?.length ?? 0) > 0
    || (provides?.executors?.length ?? 0) > 0
    || (provides?.cli_extensions?.length ?? 0) > 0
  ) {
    return 'restart_required';
  }
  if (
    manifest.permissions?.execution_mode === 'in_process'
    && ((provides?.connection_providers?.length ?? 0) > 0
      || provides?.contribution_handler?.kind === 'esm_module')
  ) {
    return 'restart_required';
  }
  if (context.action === 'uninstall' && dshClient !== undefined) {
    return 'restart_required';
  }

  if (dshClient && !dshClient.host_entry) {
    return 'renderer_reload';
  }
  const dec = ui?.declarative;
  if (
    (dec?.views?.length ?? 0) > 0
    || (dec?.settings_forms?.length ?? 0) > 0
    || (dec?.navigation?.length ?? 0) > 0
  ) {
    return 'renderer_reload';
  }
  if ((ui?.mcp_apps?.length ?? 0) > 0) {
    return 'renderer_reload';
  }

  return 'none';
}

export function combineReloadModes(modes: readonly ReloadMode[]): ReloadMode {
  if (modes.includes('restart_required')) return 'restart_required';
  if (modes.includes('renderer_reload')) return 'renderer_reload';
  return 'none';
}
