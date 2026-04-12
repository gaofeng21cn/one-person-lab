import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import { buildFrontDeskEntryUrl, buildFrontDeskEndpoints, normalizeBasePath } from './frontdesk-paths.ts';
import { resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import type { GatewayContracts } from './types.ts';

export interface FrontDeskServiceOptions {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
}

type FrontDeskServiceConfig = {
  host: string;
  port: number;
  workspace_path: string;
  sessions_limit: number;
  base_path: string;
  base_url: string;
  entry_url: string;
};

type ServicePaths = {
  home_dir: string;
  launch_agents_dir: string;
  application_support_dir: string;
  logs_dir: string;
  launch_agent_plist: string;
  config_file: string;
  stdout_log: string;
  stderr_log: string;
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const FRONTDESK_SERVICE_LABEL = 'ai.opl.frontdesk';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_SESSIONS_LIMIT = 5;

function normalizeOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `Failed to launch command: ${command} ${args.join(' ')}`,
      {
        command,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function getLaunchctlBinary() {
  return process.env.OPL_LAUNCHCTL_BIN?.trim() || 'launchctl';
}

function getOpenBinary() {
  return process.env.OPL_OPEN_BIN?.trim() || 'open';
}

function getServiceDomain() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return `gui/${uid}`;
}

function normalizeBaseUrl(host: string, port: number) {
  const normalizedHost =
    host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${normalizedHost}:${port}`;
}

function resolveServicePaths() {
  const statePaths = resolveFrontDeskStatePaths();

  return {
    home_dir: statePaths.home_dir,
    launch_agents_dir: path.join(statePaths.home_dir, 'Library', 'LaunchAgents'),
    application_support_dir: statePaths.state_dir,
    logs_dir: path.join(statePaths.home_dir, 'Library', 'Logs', 'OPL'),
    launch_agent_plist: path.join(statePaths.home_dir, 'Library', 'LaunchAgents', `${FRONTDESK_SERVICE_LABEL}.plist`),
    config_file: statePaths.service_config_file,
    stdout_log: path.join(statePaths.home_dir, 'Library', 'Logs', 'OPL', 'frontdesk.stdout.log'),
    stderr_log: path.join(statePaths.home_dir, 'Library', 'Logs', 'OPL', 'frontdesk.stderr.log'),
  } satisfies ServicePaths;
}

function ensureParentDirectories(paths: ServicePaths) {
  fs.mkdirSync(paths.launch_agents_dir, { recursive: true });
  fs.mkdirSync(paths.application_support_dir, { recursive: true });
  fs.mkdirSync(paths.logs_dir, { recursive: true });
}

function normalizeWorkspacePath(workspacePath?: string) {
  const resolved = path.resolve(workspacePath ?? process.cwd());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-service-install requires an existing workspace directory.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

function buildServiceConfig(options: FrontDeskServiceOptions = {}): FrontDeskServiceConfig {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const basePath = normalizeBasePath(options.basePath);

  if (port <= 0) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk service commands require a fixed TCP port greater than 0.',
      {
        port,
      },
    );
  }

  return {
    host,
    port,
    workspace_path: normalizeWorkspacePath(options.workspacePath),
    sessions_limit: options.sessionsLimit ?? DEFAULT_SESSIONS_LIMIT,
    base_path: basePath,
    base_url: normalizeBaseUrl(host, port),
    entry_url: buildFrontDeskEntryUrl(normalizeBaseUrl(host, port), basePath),
  };
}

function loadServiceConfig(paths: ServicePaths): FrontDeskServiceConfig | null {
  if (!fs.existsSync(paths.config_file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.config_file, 'utf8')) as Partial<FrontDeskServiceConfig>;
    if (
      typeof parsed.host !== 'string'
      || typeof parsed.port !== 'number'
      || typeof parsed.workspace_path !== 'string'
      || typeof parsed.sessions_limit !== 'number'
      || typeof parsed.base_path !== 'string'
      || typeof parsed.base_url !== 'string'
      || typeof parsed.entry_url !== 'string'
    ) {
      throw new Error('Invalid frontdesk service config shape.');
    }

    return {
      host: parsed.host,
      port: parsed.port,
      workspace_path: parsed.workspace_path,
      sessions_limit: parsed.sessions_limit,
      base_path: parsed.base_path,
      base_url: parsed.base_url,
      entry_url: parsed.entry_url,
    };
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Existing frontdesk service config is invalid JSON or has an invalid shape.',
      {
        config_file: paths.config_file,
        cause: error instanceof Error ? error.message : 'Unknown config parse failure.',
      },
    );
  }
}

function buildWebProgramArguments(config: FrontDeskServiceConfig) {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Unable to determine the active OPL CLI entrypoint for service packaging.',
    );
  }

  const args = [
    ...process.execArgv,
    cliEntry,
    'web',
    '--host',
    config.host,
    '--port',
    String(config.port),
    '--path',
    config.workspace_path,
    '--sessions-limit',
    String(config.sessions_limit),
  ];

  if (config.base_path) {
    args.push('--base-path', config.base_path);
  }

  return args;
}

function writeServiceConfig(paths: ServicePaths, config: FrontDeskServiceConfig) {
  fs.writeFileSync(paths.config_file, `${JSON.stringify(config, null, 2)}\n`);
}

function buildLaunchAgentPlist(paths: ServicePaths, config: FrontDeskServiceConfig) {
  const programArguments = [process.execPath, ...buildWebProgramArguments(config)]
    .map((entry) => `      <string>${escapeXml(entry)}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${FRONTDESK_SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${programArguments}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${escapeXml(config.workspace_path)}</string>
    <key>StandardOutPath</key>
    <string>${escapeXml(paths.stdout_log)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(paths.stderr_log)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${escapeXml(process.env.PATH ?? '')}</string>
    </dict>
  </dict>
</plist>
`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writeLaunchAgent(paths: ServicePaths, config: FrontDeskServiceConfig) {
  fs.writeFileSync(paths.launch_agent_plist, buildLaunchAgentPlist(paths, config));
}

function runLaunchctl(args: string[], allowFailure = false): CommandResult {
  const result = runCommand(getLaunchctlBinary(), args);
  if (!allowFailure && result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `frontdesk service command failed: launchctl ${args.join(' ')}`,
      {
        command: getLaunchctlBinary(),
        args,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return result;
}

function stopLaunchAgent(paths: ServicePaths) {
  return runLaunchctl(['bootout', getServiceDomain(), paths.launch_agent_plist], true);
}

function startLaunchAgent(paths: ServicePaths) {
  const bootstrapResult = runLaunchctl(['bootstrap', getServiceDomain(), paths.launch_agent_plist]);
  const kickstartResult = runLaunchctl(['kickstart', '-k', `${getServiceDomain()}/${FRONTDESK_SERVICE_LABEL}`], true);

  return {
    bootstrapResult,
    kickstartResult,
  };
}

function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function buildServiceCommandPreview(paths: ServicePaths, config: FrontDeskServiceConfig) {
  return {
    launchctl_bootstrap: [getLaunchctlBinary(), 'bootstrap', getServiceDomain(), paths.launch_agent_plist],
    launchctl_bootout: [getLaunchctlBinary(), 'bootout', getServiceDomain(), paths.launch_agent_plist],
    launchctl_print: [getLaunchctlBinary(), 'print', `${getServiceDomain()}/${FRONTDESK_SERVICE_LABEL}`],
    launchctl_kickstart: [getLaunchctlBinary(), 'kickstart', '-k', `${getServiceDomain()}/${FRONTDESK_SERVICE_LABEL}`],
    open: [getOpenBinary(), config.entry_url],
    web_entrypoint: [process.execPath, ...buildWebProgramArguments(config)],
  };
}

async function probeHealth(baseUrl: string, basePath: string) {
  const endpoints = buildFrontDeskEndpoints(basePath);
  const healthUrl = new URL(endpoints.health, baseUrl).toString();

  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1_200),
    });

    if (!response.ok) {
      return {
        status: 'unreachable',
        url: healthUrl,
        reason: `health endpoint responded with status ${response.status}`,
      };
    }

    return {
      status: 'ok',
      url: healthUrl,
      payload: await response.json(),
    };
  } catch (error) {
    return {
      status: 'unreachable',
      url: healthUrl,
      reason: error instanceof Error ? error.message : 'Unknown health probe failure.',
    };
  }
}

async function buildServiceStatusPayload(
  contracts: GatewayContracts,
  action: 'status' | 'install' | 'start' | 'stop' | 'uninstall' | 'open',
  paths: ServicePaths,
  config: FrontDeskServiceConfig | null,
) {
  const installed = fs.existsSync(paths.launch_agent_plist);
  const loadedResult = installed
    ? runLaunchctl(['print', `${getServiceDomain()}/${FRONTDESK_SERVICE_LABEL}`], true)
    : null;
  const loaded = Boolean(loadedResult && loadedResult.exitCode === 0);
  const health =
    !config
      ? {
          status: 'not_installed',
          url: null,
        }
      : !loaded
        ? {
            status: 'not_running',
            url: new URL(buildFrontDeskEndpoints(config.base_path).health, config.base_url).toString(),
          }
        : await probeHealth(config.base_url, config.base_path);

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    frontdesk_service: {
      action,
      service_label: FRONTDESK_SERVICE_LABEL,
      platform_service: 'launchd_user_agent',
      domain: getServiceDomain(),
      installed,
      loaded,
      base_url: config?.base_url ?? null,
      base_path: config?.base_path ?? null,
      entry_url: config?.entry_url ?? null,
      host: config?.host ?? null,
      port: config?.port ?? null,
      workspace_path: config?.workspace_path ?? null,
      sessions_limit: config?.sessions_limit ?? null,
      health,
      paths,
      command_preview: config ? buildServiceCommandPreview(paths, config) : null,
      launchctl: {
        exit_code: loadedResult?.exitCode ?? null,
        raw_output: loadedResult ? normalizeOutput(loadedResult.stdout, loadedResult.stderr) : '',
      },
      notes: [
        'This is local product packaging for the OPL web front desk, not hosted packaging.',
        'The runtime kernel stays external; OPL only manages the launcher/service layer here.',
      ],
    },
  };
}

export async function installFrontDeskService(
  contracts: GatewayContracts,
  options: FrontDeskServiceOptions = {},
) {
  const config = buildServiceConfig(options);
  const paths = resolveServicePaths();
  ensureParentDirectories(paths);
  writeServiceConfig(paths, config);
  writeLaunchAgent(paths, config);
  stopLaunchAgent(paths);
  startLaunchAgent(paths);
  return buildServiceStatusPayload(contracts, 'install', paths, config);
}

export async function startFrontDeskService(contracts: GatewayContracts) {
  const paths = resolveServicePaths();
  const config = loadServiceConfig(paths);

  if (!config || !fs.existsSync(paths.launch_agent_plist)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-service-start requires an installed frontdesk service. Run frontdesk-service-install first.',
    );
  }

  stopLaunchAgent(paths);
  startLaunchAgent(paths);
  return buildServiceStatusPayload(contracts, 'start', paths, config);
}

export async function stopFrontDeskService(contracts: GatewayContracts) {
  const paths = resolveServicePaths();
  const config = loadServiceConfig(paths);
  stopLaunchAgent(paths);
  return buildServiceStatusPayload(contracts, 'stop', paths, config);
}

export async function uninstallFrontDeskService(contracts: GatewayContracts) {
  const paths = resolveServicePaths();
  const config = loadServiceConfig(paths);
  stopLaunchAgent(paths);

  fs.rmSync(paths.launch_agent_plist, { force: true });
  fs.rmSync(paths.config_file, { force: true });

  return buildServiceStatusPayload(contracts, 'uninstall', paths, config);
}

export async function getFrontDeskServiceStatus(contracts: GatewayContracts) {
  const paths = resolveServicePaths();
  return buildServiceStatusPayload(contracts, 'status', paths, loadServiceConfig(paths));
}

export async function openFrontDeskService(contracts: GatewayContracts) {
  const paths = resolveServicePaths();
  const config = loadServiceConfig(paths);

  if (!config) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-service-open requires an installed frontdesk service. Run frontdesk-service-install first.',
    );
  }

  const result = runCommand(getOpenBinary(), [config.entry_url]);
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `Failed to open the local OPL front desk at ${config.entry_url}.`,
      {
        command: getOpenBinary(),
        args: [config.entry_url],
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return buildServiceStatusPayload(contracts, 'open', paths, config);
}
