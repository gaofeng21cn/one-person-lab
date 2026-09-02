import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { familyRuntimePaths } from './family-runtime-store.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;

export const PROVIDER_WORKER_SUPERVISOR_LABEL = 'ai.opl.family-runtime.provider-worker';
export const LEGACY_PROVIDER_SLO_WATCHDOG_LABEL = 'ai.opl.family-runtime.provider-slo';
export const PROVIDER_WORKER_SUPERVISOR_THROTTLE_SECONDS = 60;

export type ProviderWorkerSupervisorState = ReturnType<typeof inspectProviderWorkerSupervisorState>;

export function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function providerWorkerLaunchAgentsDir() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents');
}

export function providerWorkerSupervisorPlistPath() {
  return path.join(providerWorkerLaunchAgentsDir(), `${PROVIDER_WORKER_SUPERVISOR_LABEL}.plist`);
}

export function legacyProviderSloWatchdogPlistPath() {
  return path.join(providerWorkerLaunchAgentsDir(), `${LEGACY_PROVIDER_SLO_WATCHDOG_LABEL}.plist`);
}

export function providerWorkerSupervisorLaunchctlTarget() {
  return `gui/${process.getuid?.() ?? 501}`;
}

export function providerWorkerLauncherModulePath() {
  const currentModulePath = fileURLToPath(import.meta.url);
  const extension = path.extname(currentModulePath) || '.js';
  return path.join(path.dirname(currentModulePath), `family-runtime-provider-worker-launcher${extension}`);
}

export function runProviderWorkerSupervisorLaunchctl(args: string[]) {
  if (process.platform !== 'darwin') {
    return {
      ok: false,
      status: null,
      stdout: '',
      stderr: 'launchctl_unavailable_on_non_darwin',
      args,
    };
  }
  const result = spawnSync('launchctl', args, {
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    status: result.status ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    args,
  };
}

function textMentionsRoot(text: string, root: string) {
  return text.includes(root) || text.includes(escapeXml(root));
}

function readPlist(pathToPlist: string) {
  try {
    return fs.readFileSync(pathToPlist, 'utf8');
  } catch {
    return null;
  }
}

export function inspectProviderWorkerSupervisorState(paths: RuntimePaths) {
  const pathToPlist = providerWorkerSupervisorPlistPath();
  const plistExists = fs.existsSync(pathToPlist);
  const plist = readPlist(pathToPlist);
  const launcherModulePath = providerWorkerLauncherModulePath();
  const launchctl = plistExists
    ? runProviderWorkerSupervisorLaunchctl([
        'print',
        `${providerWorkerSupervisorLaunchctlTarget()}/${PROVIDER_WORKER_SUPERVISOR_LABEL}`,
      ])
    : null;
  const launchctlMentionsRoot = launchctl?.stdout
    ? textMentionsRoot(launchctl.stdout, paths.root)
    : false;
  const launchctlMentionsCurrentLauncher = launchctl?.stdout
    ? textMentionsRoot(launchctl.stdout, launcherModulePath)
    : false;
  const plistMentionsCurrentRoot = plist ? textMentionsRoot(plist, paths.root) : false;
  const plistMentionsCurrentLauncher = plist ? textMentionsRoot(plist, launcherModulePath) : false;
  const loadedConfigurationCurrent = !launchctl?.ok
    || (launchctlMentionsRoot && launchctlMentionsCurrentLauncher);
  const configurationCurrent = Boolean(
    plistExists
    && plistMentionsCurrentRoot
    && plistMentionsCurrentLauncher
    && loadedConfigurationCurrent,
  );
  const supervisesCurrentRoot = launchctl?.ok ? launchctlMentionsRoot : plistMentionsCurrentRoot;
  return {
    surface_kind: 'opl_family_runtime_provider_worker_supervisor_state',
    provider_kind: 'temporal',
    supervisor_label: PROVIDER_WORKER_SUPERVISOR_LABEL,
    status: !plistExists
      ? 'not_installed'
      : !configurationCurrent
        ? 'configuration_drift'
        : launchctl?.ok ? 'installed' : 'installed_not_loaded',
    plist_path: pathToPlist,
    plist_exists: plistExists,
    launchctl_loaded: launchctl?.ok ?? false,
    launchctl,
    configuration_current: configurationCurrent,
    configuration_checks: {
      plist_root_current: plistMentionsCurrentRoot,
      plist_launcher_current: plistMentionsCurrentLauncher,
      loaded_root_current: !launchctl?.ok || launchctlMentionsRoot,
      loaded_launcher_current: !launchctl?.ok || launchctlMentionsCurrentLauncher,
    },
    keep_alive: true,
    run_at_load: true,
    throttle_interval_seconds: PROVIDER_WORKER_SUPERVISOR_THROTTLE_SECONDS,
    resident_worker_process: true,
    supervises_family_runtime_root: supervisesCurrentRoot,
    family_runtime_root: paths.root,
    launcher_module_path: launcherModulePath,
    root_match_source: launchctlMentionsRoot
      ? 'launchctl_stdout'
      : plistMentionsCurrentRoot
        ? 'plist'
        : null,
  };
}

export function supervisorOwnsFamilyRuntimeRoot(
  supervisor: ProviderWorkerSupervisorState | null | undefined,
) {
  return supervisor?.status === 'installed'
    && supervisor.supervises_family_runtime_root === true
    && supervisor.keep_alive === true
    && supervisor.resident_worker_process === true;
}
