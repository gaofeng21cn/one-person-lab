import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { resolveCodexBinary } from './codex.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import {
  insertEvent,
  type familyRuntimePaths,
} from './family-runtime-store.ts';
import {
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import {
  escapeXml,
  inspectProviderWorkerSupervisorState,
  legacyProviderSloWatchdogPlistPath,
  LEGACY_PROVIDER_SLO_WATCHDOG_LABEL,
  providerWorkerSupervisorLaunchctlTarget,
  providerWorkerSupervisorPlistPath,
  PROVIDER_WORKER_SUPERVISOR_LABEL,
  PROVIDER_WORKER_SUPERVISOR_THROTTLE_SECONDS,
  runProviderWorkerSupervisorLaunchctl,
} from './family-runtime-provider-worker-supervisor-state.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;
type ProviderWorkerSupervisorAction = 'status' | 'install' | 'remove' | 'trigger';
type ProviderWorkerSupervisorEnvironment = NodeJS.ProcessEnv;

const FOUNDRY_OWNER_GATE_BIN = 'OPL_FOUNDRY_OWNER_GATE_BIN';
const FOUNDRY_OWNER_GATE_ARGS = 'OPL_FOUNDRY_OWNER_GATE_ARGS';
const FOUNDRY_OWNER_GATE_TIMEOUT_MS = 'OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS';
const MAX_PERSISTED_OWNER_GATE_TIMEOUT_MS = 300_000;
const FOUNDRY_OWNER_GATE_ENVIRONMENT_KEYS = [
  FOUNDRY_OWNER_GATE_BIN,
  FOUNDRY_OWNER_GATE_ARGS,
  FOUNDRY_OWNER_GATE_TIMEOUT_MS,
] as const;

function failOwnerGateEnvironment(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'foundry_owner_gate_supervisor_environment_invalid',
    ...details,
  });
}

function configuredOwnerGateExecutable(environment: ProviderWorkerSupervisorEnvironment) {
  const configured = environment[FOUNDRY_OWNER_GATE_BIN]?.trim();
  if (!configured) return null;
  if (!path.isAbsolute(configured)) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_BIN} must be an absolute path.`);
  }
  let metadata: fs.Stats;
  let canonicalPath: string;
  try {
    metadata = fs.lstatSync(configured);
    canonicalPath = fs.realpathSync(configured);
  } catch (error) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_BIN} must resolve to a physical executable.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (metadata.isSymbolicLink() || canonicalPath !== configured) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_BIN} must be a canonical non-symlink path.`);
  }
  if (!metadata.isFile()) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_BIN} must be a regular file.`);
  }
  try {
    fs.accessSync(configured, fs.constants.X_OK);
  } catch {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_BIN} must be executable.`);
  }
  return configured;
}

function configuredOwnerGateArgs(environment: ProviderWorkerSupervisorEnvironment) {
  const raw = environment[FOUNDRY_OWNER_GATE_ARGS];
  if (raw === undefined) return null;
  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch (error) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_ARGS} must be valid JSON.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_ARGS} must be a JSON array of strings.`);
  }
  return JSON.stringify(parsed);
}

function configuredOwnerGateTimeout(environment: ProviderWorkerSupervisorEnvironment) {
  const raw = environment[FOUNDRY_OWNER_GATE_TIMEOUT_MS];
  if (raw === undefined) return null;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    failOwnerGateEnvironment(`${FOUNDRY_OWNER_GATE_TIMEOUT_MS} must be a positive safe integer.`);
  }
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_PERSISTED_OWNER_GATE_TIMEOUT_MS) {
    failOwnerGateEnvironment(
      `${FOUNDRY_OWNER_GATE_TIMEOUT_MS} must be between 1 and ${MAX_PERSISTED_OWNER_GATE_TIMEOUT_MS}.`,
    );
  }
  return String(timeoutMs);
}

export function providerWorkerFoundryOwnerGateEnvironment(
  environment: ProviderWorkerSupervisorEnvironment = process.env,
) {
  const executable = configuredOwnerGateExecutable(environment);
  if (!executable) {
    return {
      persisted: {} as Record<string, string>,
      projection: {
        configured: false,
        arg_count: 0,
        timeout_ms: null,
      },
    };
  }
  const args = configuredOwnerGateArgs(environment);
  const timeoutMs = configuredOwnerGateTimeout(environment);
  const persisted: Record<string, string> = {
    [FOUNDRY_OWNER_GATE_BIN]: executable,
  };
  if (args !== null) persisted[FOUNDRY_OWNER_GATE_ARGS] = args;
  if (timeoutMs !== null) persisted[FOUNDRY_OWNER_GATE_TIMEOUT_MS] = timeoutMs;
  return {
    persisted,
    projection: {
      configured: true,
      arg_count: args === null ? 0 : (parseJsonText(args) as string[]).length,
      timeout_ms: timeoutMs === null ? null : Number(timeoutMs),
    },
  };
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

export function providerWorkerSupervisorEnvironmentVariables(
  paths: RuntimePaths,
  environment: ProviderWorkerSupervisorEnvironment = process.env,
) {
  const values: Record<string, string> = {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_STATE_DIR: paths.state_dir,
  };
  const pathEnv = environment.PATH?.trim();
  if (pathEnv) {
    values.PATH = pathEnv;
  }
  const codexBinary = resolveCodexBinary();
  if (codexBinary) {
    values.OPL_CODEX_BIN = codexBinary.path;
  }
  const temporalAddress = environment.OPL_TEMPORAL_ADDRESS?.trim() || environment.TEMPORAL_ADDRESS?.trim();
  if (temporalAddress) {
    values.OPL_TEMPORAL_ADDRESS = temporalAddress;
  }
  Object.assign(values, providerWorkerFoundryOwnerGateEnvironment(environment).persisted);
  return values;
}

export function providerWorkerSupervisorEnvironmentProjection(
  paths: RuntimePaths,
  environment: ProviderWorkerSupervisorEnvironment = process.env,
) {
  const values = providerWorkerSupervisorEnvironmentVariables(paths, environment);
  delete values[FOUNDRY_OWNER_GATE_BIN];
  delete values[FOUNDRY_OWNER_GATE_ARGS];
  delete values[FOUNDRY_OWNER_GATE_TIMEOUT_MS];
  return values;
}

function decodeXml(value: string) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function persistedOwnerGateEnvironment(pathToPlist: string) {
  if (!fs.existsSync(pathToPlist)) return {};
  const plist = fs.readFileSync(pathToPlist, 'utf8');
  const values: Record<string, string> = {};
  for (const key of FOUNDRY_OWNER_GATE_ENVIRONMENT_KEYS) {
    const match = plist.match(new RegExp(
      `<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`,
    ));
    if (match?.[1] !== undefined) values[key] = decodeXml(match[1]);
  }
  return values;
}

function persistedOwnerGateProjection(pathToPlist: string) {
  return providerWorkerFoundryOwnerGateEnvironment(
    persistedOwnerGateEnvironment(pathToPlist),
  ).projection;
}

function redactOwnerGateEnvironmentText(value: string) {
  let redacted = value;
  for (const key of FOUNDRY_OWNER_GATE_ENVIRONMENT_KEYS) {
    redacted = redacted.replace(
      new RegExp(`(^\\s*${key}\\s*=>\\s*).*$`, 'gm'),
      '$1[redacted]',
    );
  }
  return redacted;
}

export function redactProviderWorkerSupervisorLaunchctl(
  value: ReturnType<typeof runProviderWorkerSupervisorLaunchctl> | null | undefined,
) {
  return value
    ? {
        ...value,
        stdout: redactOwnerGateEnvironmentText(value.stdout),
        stderr: redactOwnerGateEnvironmentText(value.stderr),
      }
    : value ?? null;
}

function plistEnvironmentXml(
  paths: RuntimePaths,
  environment: ProviderWorkerSupervisorEnvironment = process.env,
) {
  const values = providerWorkerSupervisorEnvironmentVariables(paths, environment);
  return Object.entries(values)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join('\n');
}

export function buildProviderWorkerSupervisorPlist(
  paths: RuntimePaths,
  environment: ProviderWorkerSupervisorEnvironment = process.env,
) {
  const environmentXml = plistEnvironmentXml(paths, environment);
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
  <string>${PROVIDER_WORKER_SUPERVISOR_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${environmentXml}
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>${PROVIDER_WORKER_SUPERVISOR_THROTTLE_SECONDS}</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logsDir, 'provider-worker-supervisor.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logsDir, 'provider-worker-supervisor.err.log'))}</string>
</dict>
</plist>
`;
}

function removeLegacyWatchdog() {
  const pathToPlist = legacyProviderSloWatchdogPlistPath();
  if (!fs.existsSync(pathToPlist)) {
    return {
      legacy_plist_exists: false,
      removed: false,
      launchctl: null,
      legacy_plist_path: pathToPlist,
    };
  }
  const launchctl = runProviderWorkerSupervisorLaunchctl([
    'bootout',
    providerWorkerSupervisorLaunchctlTarget(),
    pathToPlist,
  ]);
  fs.rmSync(pathToPlist, { force: true });
  return {
    legacy_plist_exists: true,
    removed: true,
    launchctl,
    legacy_plist_path: pathToPlist,
  };
}

function basePayload(input: {
  paths: RuntimePaths;
  action: ProviderWorkerSupervisorAction;
  status: string;
  launchctl?: ReturnType<typeof runProviderWorkerSupervisorLaunchctl> | null;
  legacyWatchdog?: ReturnType<typeof removeLegacyWatchdog> | null;
  providerSloTick?: Awaited<ReturnType<typeof runTemporalProviderSloTick>> | null;
  supervisorState?: ReturnType<typeof inspectProviderWorkerSupervisorState> | null;
  foundryOwnerGate?: ReturnType<typeof providerWorkerFoundryOwnerGateEnvironment>['projection'];
}) {
  const pathToPlist = providerWorkerSupervisorPlistPath();
  const supervisorState = input.supervisorState
    ? {
        ...input.supervisorState,
        launchctl: redactProviderWorkerSupervisorLaunchctl(input.supervisorState.launchctl),
      }
    : null;
  return {
    surface_kind: 'opl_family_runtime_provider_worker_supervisor',
    provider_kind: 'temporal',
    action: input.action,
    status: input.status,
    supervisor_label: PROVIDER_WORKER_SUPERVISOR_LABEL,
    retired_legacy_watchdog_label: LEGACY_PROVIDER_SLO_WATCHDOG_LABEL,
    supervisor_role: 'provider_worker_process_supervisor',
    supervisor_owner: 'opl_provider_runtime_manager',
    command: workerSupervisorCommandForDisplay(),
    environment_variables: providerWorkerSupervisorEnvironmentProjection(input.paths),
    foundry_owner_gate: input.foundryOwnerGate
      ?? providerWorkerFoundryOwnerGateEnvironment().projection,
    health_check_command: providerSloTriggerCommandForDisplay(),
    plist_path: pathToPlist,
    keep_alive: true,
    run_at_load: true,
    throttle_interval_seconds: PROVIDER_WORKER_SUPERVISOR_THROTTLE_SECONDS,
    resident_worker_process: true,
    temporal_worker_dependency: true,
    provider_scheduler_dependency: false,
    primary_dispatcher: false,
    health_monitor_only: false,
    provider_slo_tick_is_fallback_health_check: true,
    supervises_family_runtime_root: supervisorState?.supervises_family_runtime_root ?? null,
    supervisor_state: supervisorState,
    launchctl: redactProviderWorkerSupervisorLaunchctl(input.launchctl),
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
    const inspection = inspectProviderWorkerSupervisorState(paths);
    return basePayload({
      paths,
      action: input.action,
      status: !inspection.plist_exists
        ? 'not_installed'
        : inspection.launchctl_loaded ? 'installed' : 'installed_not_loaded',
      launchctl: inspection.launchctl,
      supervisorState: inspection,
      foundryOwnerGate: persistedOwnerGateProjection(inspection.plist_path),
    });
  }

  if (input.action === 'install') {
    const pathToPlist = providerWorkerSupervisorPlistPath();
    const plist = buildProviderWorkerSupervisorPlist(paths);
    fs.mkdirSync(path.dirname(pathToPlist), { recursive: true });
    const legacyWatchdog = removeLegacyWatchdog();
    fs.writeFileSync(pathToPlist, plist);
    const launchctl = runProviderWorkerSupervisorLaunchctl([
      'bootstrap',
      providerWorkerSupervisorLaunchctlTarget(),
      pathToPlist,
    ]);
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
    const pathToPlist = providerWorkerSupervisorPlistPath();
    const launchctl = fs.existsSync(pathToPlist)
      ? runProviderWorkerSupervisorLaunchctl([
          'bootout',
          providerWorkerSupervisorLaunchctlTarget(),
          pathToPlist,
        ])
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
