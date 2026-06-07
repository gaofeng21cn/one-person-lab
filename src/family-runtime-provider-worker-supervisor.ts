import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from './contracts.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import {
  insertEvent,
  type familyRuntimePaths,
} from './family-runtime-store.ts';
import {
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;
type ProviderWorkerSupervisorAction = 'status' | 'install' | 'remove' | 'trigger';

const SUPERVISOR_LABEL = 'ai.opl.family-runtime.provider-worker';
const LEGACY_WATCHDOG_LABEL = 'ai.opl.family-runtime.provider-slo';

function launchAgentsDir() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents');
}

function plistPath() {
  return path.join(launchAgentsDir(), `${SUPERVISOR_LABEL}.plist`);
}

function legacyWatchdogPlistPath() {
  return path.join(launchAgentsDir(), `${LEGACY_WATCHDOG_LABEL}.plist`);
}

function launchctlTarget() {
  return `gui/${process.getuid?.() ?? 501}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function workerSupervisorCommandForDisplay() {
  return [
    'opl',
    'family-runtime',
    'worker',
    'start',
    '--provider',
    'temporal',
    '--foreground',
  ];
}

function providerSloTriggerCommandForDisplay() {
  return ['opl', 'family-runtime', 'provider-slo', 'tick', '--provider', 'temporal'];
}

function temporalWorkerForegroundModulePath() {
  const currentModulePath = fileURLToPath(import.meta.url);
  const extension = path.extname(currentModulePath) || '.js';
  return path.join(path.dirname(currentModulePath), `family-runtime-temporal-provider${extension}`);
}

function workerSupervisorProgramArguments(paths: RuntimePaths) {
  const workerModulePath = temporalWorkerForegroundModulePath();
  return [
    process.execPath,
    ...(workerModulePath.endsWith('.ts') ? ['--experimental-strip-types'] : []),
    workerModulePath,
    '--temporal-worker-foreground',
    '--family-runtime-root',
    paths.root,
  ];
}

function plistEnvironmentVariables(paths: RuntimePaths) {
  const values: Record<string, string> = {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_STATE_DIR: paths.state_dir,
  };
  const pathEnv = process.env.PATH?.trim();
  if (pathEnv) {
    values.PATH = pathEnv;
  }
  const temporalAddress = process.env.OPL_TEMPORAL_ADDRESS?.trim() || process.env.TEMPORAL_ADDRESS?.trim();
  if (temporalAddress) {
    values.OPL_TEMPORAL_ADDRESS = temporalAddress;
  }
  return values;
}

function plistEnvironmentXml(paths: RuntimePaths) {
  const values = plistEnvironmentVariables(paths);
  return Object.entries(values)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join('\n');
}

function buildPlist(paths: RuntimePaths) {
  const logsDir = path.join(paths.root, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const args = workerSupervisorProgramArguments(paths)
    .map((entry) => `    <string>${escapeXml(entry)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SUPERVISOR_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${plistEnvironmentXml(paths)}
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logsDir, 'provider-worker-supervisor.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logsDir, 'provider-worker-supervisor.err.log'))}</string>
</dict>
</plist>
`;
}

function runLaunchctl(args: string[]) {
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

function removeLegacyWatchdog() {
  const pathToPlist = legacyWatchdogPlistPath();
  if (!fs.existsSync(pathToPlist)) {
    return {
      legacy_plist_exists: false,
      removed: false,
      launchctl: null,
      legacy_plist_path: pathToPlist,
    };
  }
  const launchctl = runLaunchctl(['bootout', launchctlTarget(), pathToPlist]);
  fs.rmSync(pathToPlist, { force: true });
  return {
    legacy_plist_exists: true,
    removed: true,
    launchctl,
    legacy_plist_path: pathToPlist,
  };
}

function inspectLaunchd() {
  const pathToPlist = plistPath();
  const exists = fs.existsSync(pathToPlist);
  if (!exists) {
    return {
      plist_exists: false,
      launchctl_loaded: false,
      launchctl: null,
    };
  }
  const launchctl = runLaunchctl(['print', `${launchctlTarget()}/${SUPERVISOR_LABEL}`]);
  return {
    plist_exists: true,
    launchctl_loaded: launchctl.ok,
    launchctl,
  };
}

function basePayload(input: {
  paths: RuntimePaths;
  action: ProviderWorkerSupervisorAction;
  status: string;
  launchctl?: ReturnType<typeof runLaunchctl> | null;
  legacyWatchdog?: ReturnType<typeof removeLegacyWatchdog> | null;
  providerSloTick?: Awaited<ReturnType<typeof runTemporalProviderSloTick>> | null;
}) {
  const pathToPlist = plistPath();
  return {
    surface_kind: 'opl_family_runtime_provider_worker_supervisor',
    provider_kind: 'temporal',
    action: input.action,
    status: input.status,
    supervisor_label: SUPERVISOR_LABEL,
    retired_legacy_watchdog_label: LEGACY_WATCHDOG_LABEL,
    supervisor_role: 'provider_worker_process_supervisor',
    supervisor_owner: 'opl_provider_runtime_manager',
    command: workerSupervisorCommandForDisplay(),
    environment_variables: plistEnvironmentVariables(input.paths),
    health_check_command: providerSloTriggerCommandForDisplay(),
    plist_path: pathToPlist,
    keep_alive: true,
    run_at_load: true,
    resident_worker_process: true,
    temporal_worker_dependency: true,
    provider_scheduler_dependency: false,
    primary_dispatcher: false,
    health_monitor_only: false,
    provider_slo_tick_is_fallback_health_check: true,
    launchctl: input.launchctl ?? null,
    legacy_watchdog_cleanup: input.legacyWatchdog ?? null,
    provider_slo_tick: input.providerSloTick ?? null,
    authority_boundary: {
      opl: 'provider_worker_lifecycle_supervisor_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export async function runProviderWorkerSupervisorCommand(
  db: DatabaseSync,
  paths: RuntimePaths,
  input: {
    action: ProviderWorkerSupervisorAction;
    providerKind?: FamilyRuntimeProviderKind;
  },
) {
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime provider-worker supervisor supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }

  if (input.action === 'status') {
    const inspection = inspectLaunchd();
    return basePayload({
      paths,
      action: input.action,
      status: !inspection.plist_exists
        ? 'not_installed'
        : inspection.launchctl_loaded ? 'installed' : 'installed_not_loaded',
      launchctl: inspection.launchctl,
    });
  }

  if (input.action === 'install') {
    const pathToPlist = plistPath();
    fs.mkdirSync(path.dirname(pathToPlist), { recursive: true });
    const legacyWatchdog = removeLegacyWatchdog();
    fs.writeFileSync(pathToPlist, buildPlist(paths));
    const launchctl = runLaunchctl(['bootstrap', launchctlTarget(), pathToPlist]);
    const payload = basePayload({
      paths,
      action: input.action,
      status: launchctl.ok ? 'installed' : 'blocked',
      launchctl,
      legacyWatchdog,
    });
    insertEvent(db, {
      eventType: 'temporal_provider_worker_supervisor_install',
      source: 'opl-cli',
      payload,
    });
    return payload;
  }

  if (input.action === 'remove') {
    const pathToPlist = plistPath();
    const launchctl = fs.existsSync(pathToPlist)
      ? runLaunchctl(['bootout', launchctlTarget(), pathToPlist])
      : null;
    fs.rmSync(pathToPlist, { force: true });
    const legacyWatchdog = removeLegacyWatchdog();
    const payload = basePayload({
      paths,
      action: input.action,
      status: 'removed',
      launchctl,
      legacyWatchdog,
    });
    insertEvent(db, {
      eventType: 'temporal_provider_worker_supervisor_remove',
      source: 'opl-cli',
      payload,
    });
    return payload;
  }

  const providerSloTick = await runTemporalProviderSloTick(db, paths);
  const payload = basePayload({
    paths,
    action: input.action,
    status: 'triggered',
    providerSloTick,
  });
  insertEvent(db, {
    eventType: 'temporal_provider_worker_supervisor_health_check_trigger',
    source: 'opl-cli',
    payload: {
      provider_kind: 'temporal',
      provider_slo_tick_status: providerSloTick.execution_status,
      provider_slo_event_id: providerSloTick.event_id,
      authority_boundary: payload.authority_boundary,
    },
  });
  return payload;
}
