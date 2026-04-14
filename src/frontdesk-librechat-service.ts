import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import {
  getFrontDeskServiceStatus,
  installFrontDeskService,
  openFrontDeskService,
  startFrontDeskService,
} from './frontdesk-service.ts';
import { resolveFrontDeskStatePaths, ensureFrontDeskStateDir } from './frontdesk-state.ts';
import { buildLibreChatPilotPackage } from './librechat-pilot-package.ts';
import type { GatewayContracts } from './types.ts';
import {
  bootstrapLocalPaperclipControlPlane,
  buildPaperclipControlPlaneSummary,
  type PaperclipControlPlaneSummary,
} from './paperclip-control-plane.ts';

export type FrontDeskLibreChatServiceOptions = {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
  publicOrigin?: string;
  paperclipBaseUrl?: string;
};

type LibreChatServiceConfigFile = {
  version: 'g2';
  public_origin: string;
  host: string;
  port: number;
  base_path: string;
  workspace_path: string;
  sessions_limit: number;
  package_root: string;
  stack_root: string;
  env_file: string;
  compose_file: string;
  librechat_config: string;
  caddyfile: string;
  run_script: string;
  frontdesk_api_base_url: string;
};

type DockerComposeServiceState = {
  Service?: string;
  State?: string;
  Status?: string;
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function debugLog(message: string, details: Record<string, unknown> = {}) {
  if (process.env.OPL_DEBUG_FRONTDESK_LIBRECHAT !== '1') {
    return;
  }

  process.stderr.write(`[opl-frontdesk-librechat] ${message} ${JSON.stringify(details)}\n`);
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
  } satisfies CommandResult;
}

function getDockerBinary() {
  return process.env.OPL_DOCKER_BIN?.trim() || 'docker';
}

function getOpenBinary() {
  return process.env.OPL_OPEN_BIN?.trim() || 'open';
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBasePath(basePath?: string | null) {
  const trimmed = normalizeOptionalString(basePath);
  if (!trimmed || trimmed === '/') {
    return '/pilot/opl';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function normalizePublicOrigin(publicOrigin?: string | null) {
  const trimmed = normalizeOptionalString(publicOrigin);
  if (!trimmed) {
    return 'http://127.0.0.1:8080';
  }

  const parsed = new URL(trimmed);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat commands require an absolute http(s) --public-origin.',
      {
        public_origin: trimmed,
      },
    );
  }

  return parsed.origin;
}

function normalizeWorkspacePath(workspacePath?: string) {
  const resolved = path.resolve(workspacePath ?? process.cwd());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-install requires an existing workspace directory.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {} as Record<string, string>;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const parsed: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    parsed[key] = value;
  }

  return parsed;
}

function readHermesEnv() {
  const homeDir = process.env.HOME?.trim();
  if (!homeDir) {
    return {} as Record<string, string>;
  }

  return parseEnvFile(path.join(homeDir, '.hermes', '.env'));
}

function randomHex(bytes: number) {
  return randomBytes(bytes).toString('hex');
}

function buildRuntimeEnvFile(config: LibreChatServiceConfigFile) {
  const publicOrigin = new URL(config.public_origin);
  const publicHttpPort =
    publicOrigin.port.length > 0
      ? publicOrigin.port
      : publicOrigin.protocol === 'https:'
        ? '443'
        : '80';
  const hermesEnv = readHermesEnv();
  const uid = typeof process.getuid === 'function' ? String(process.getuid()) : '1000';
  const gid = typeof process.getgid === 'function' ? String(process.getgid()) : '1000';
  const envEntries: Array<[string, string]> = [
    ['HOST', '0.0.0.0'],
    ['PORT', '3080'],
    ['DOMAIN_CLIENT', config.public_origin],
    ['DOMAIN_SERVER', config.public_origin],
    ['TRUST_PROXY', '1'],
    ['NO_INDEX', 'true'],
    ['ALLOW_REGISTRATION', 'true'],
    ['CREDS_KEY', randomHex(24)],
    ['CREDS_IV', randomHex(8)],
    ['JWT_SECRET', randomHex(32)],
    ['JWT_REFRESH_SECRET', randomHex(32)],
    ['MONGO_URI', 'mongodb://mongodb:27017/LibreChat'],
    ['MEILI_MASTER_KEY', randomHex(16)],
    ['RAG_PORT', '8000'],
    ['OPENAI_API_KEY', hermesEnv.OPENAI_API_KEY ?? 'user_provided'],
    ['OPENAI_BASE_URL', hermesEnv.OPENAI_BASE_URL ?? 'user_provided'],
    ['ANTHROPIC_API_KEY', hermesEnv.ANTHROPIC_API_KEY ?? 'user_provided'],
    ['GOOGLE_KEY', hermesEnv.GOOGLE_KEY ?? 'user_provided'],
    ['UID', uid],
    ['GID', gid],
    ['PUBLIC_HTTP_PORT', publicHttpPort],
    ['OPL_FRONTDESK_UPSTREAM', `host.docker.internal:${config.port}`],
    ['OPL_FRONTDESK_API_BASE_URL', config.frontdesk_api_base_url],
  ];

  return envEntries.map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
}

function readLibreChatConfigFile(): LibreChatServiceConfigFile | null {
  const paths = resolveFrontDeskStatePaths();
  if (!fs.existsSync(paths.librechat_service_file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.librechat_service_file, 'utf8')) as Partial<LibreChatServiceConfigFile>;
    if (
      parsed.version !== 'g2'
      || typeof parsed.public_origin !== 'string'
      || typeof parsed.host !== 'string'
      || typeof parsed.port !== 'number'
      || typeof parsed.base_path !== 'string'
      || typeof parsed.workspace_path !== 'string'
      || typeof parsed.sessions_limit !== 'number'
      || typeof parsed.package_root !== 'string'
      || typeof parsed.stack_root !== 'string'
      || typeof parsed.env_file !== 'string'
      || typeof parsed.compose_file !== 'string'
      || typeof parsed.librechat_config !== 'string'
      || typeof parsed.caddyfile !== 'string'
      || typeof parsed.run_script !== 'string'
      || typeof parsed.frontdesk_api_base_url !== 'string'
    ) {
      throw new Error('Invalid LibreChat service config shape.');
    }

    return {
      version: 'g2',
      public_origin: parsed.public_origin,
      host: parsed.host,
      port: parsed.port,
      base_path: parsed.base_path,
      workspace_path: parsed.workspace_path,
      sessions_limit: parsed.sessions_limit,
      package_root: parsed.package_root,
      stack_root: parsed.stack_root,
      env_file: parsed.env_file,
      compose_file: parsed.compose_file,
      librechat_config: parsed.librechat_config,
      caddyfile: parsed.caddyfile,
      run_script: parsed.run_script,
      frontdesk_api_base_url: parsed.frontdesk_api_base_url,
    };
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Existing LibreChat frontdesk service config is invalid JSON or has an invalid shape.',
      {
        file: paths.librechat_service_file,
        cause: error instanceof Error ? error.message : 'Unknown config parse failure.',
      },
    );
  }
}

function writeLibreChatConfigFile(payload: LibreChatServiceConfigFile) {
  const paths = ensureFrontDeskStateDir();
  fs.writeFileSync(paths.librechat_service_file, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildDockerComposeArgs(config: LibreChatServiceConfigFile, command: 'up' | 'down' | 'ps') {
  const args = [
    'compose',
    '--project-name',
    'opl-librechat-pilot',
    '--env-file',
    config.env_file,
    '-f',
    config.compose_file,
  ];

  if (command === 'up') {
    args.push('up', '-d');
  } else if (command === 'down') {
    args.push('down');
  } else {
    args.push('ps', '--format', 'json');
  }

  return args;
}

function parseDockerPs(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [] as DockerComposeServiceState[];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is DockerComposeServiceState => typeof entry === 'object' && entry !== null);
    }
  } catch {
    // Some docker versions emit one JSON object per line; handle that below.
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DockerComposeServiceState);
}

function runDockerCompose(config: LibreChatServiceConfigFile, command: 'up' | 'down' | 'ps') {
  const args = buildDockerComposeArgs(config, command);
  const result = runCommand(getDockerBinary(), args);
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `frontdesk LibreChat docker command failed: docker ${args.join(' ')}`,
      {
        command: getDockerBinary(),
        args,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return result;
}

async function buildPayload(
  contracts: GatewayContracts,
  action: 'install' | 'status' | 'start' | 'stop' | 'open',
  config: LibreChatServiceConfigFile | null,
  paperclipSummary?: PaperclipControlPlaneSummary | null,
) {
  const frontdeskServicePayload = config
    ? await getFrontDeskServiceStatus(contracts)
    : {
        version: 'g2',
        contracts_context: {
          contracts_dir: contracts.contractsDir,
          contracts_root_source: contracts.contractsRootSource,
        },
        frontdesk_service: null,
      };
  const dockerStatus = config ? runDockerCompose(config, 'ps') : null;
  const services = dockerStatus ? parseDockerPs(dockerStatus.stdout) : [];

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    ...(frontdeskServicePayload.frontdesk_service
      ? { frontdesk_service: frontdeskServicePayload.frontdesk_service }
      : {}),
    ...(paperclipSummary ? { paperclip_control_plane: paperclipSummary } : {}),
    frontdesk_librechat: {
      action,
      installed: Boolean(config && fs.existsSync(config.compose_file) && fs.existsSync(config.env_file)),
      running: services.some((service) => String(service.State ?? '').toLowerCase() === 'running'),
      public_origin: config?.public_origin ?? null,
      host: config?.host ?? null,
      port: config?.port ?? null,
      base_path: config?.base_path ?? null,
      workspace_path: config?.workspace_path ?? null,
      sessions_limit: config?.sessions_limit ?? null,
      frontdesk_api_base_url: config?.frontdesk_api_base_url ?? null,
      assets: config
        ? {
            package_root: config.package_root,
            stack_root: config.stack_root,
            env_file: config.env_file,
            compose_file: config.compose_file,
            librechat_config: config.librechat_config,
            caddyfile: config.caddyfile,
            run_script: config.run_script,
          }
        : null,
      docker: {
        command_preview: config ? [getDockerBinary(), ...buildDockerComposeArgs(config, 'up')] : null,
        services,
        raw_status: dockerStatus?.stdout ?? '',
      },
      notes: [
        'This is the local LibreChat-first front door for OPL, not a claim that managed hosted runtime is landed.',
        'The chat shell talks to OPL through the shipped MCP stdio bridge, while the OPL front desk remains the routed gateway.',
      ],
    },
  };
}

function buildInstallConfig(options: FrontDeskLibreChatServiceOptions): LibreChatServiceConfigFile {
  const statePaths = ensureFrontDeskStateDir();
  const packageRoot = statePaths.librechat_pilot_root;
  const stackRoot = path.join(packageRoot, 'librechat-stack');
  const basePath = normalizeBasePath(options.basePath);
  const publicOrigin = normalizePublicOrigin(options.publicOrigin);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const sessionsLimit = options.sessionsLimit ?? 5;

  return {
    version: 'g2',
    public_origin: publicOrigin,
    host,
    port,
    base_path: basePath,
    workspace_path: workspacePath,
    sessions_limit: sessionsLimit,
    package_root: packageRoot,
    stack_root: stackRoot,
    env_file: path.join(stackRoot, '.env'),
    compose_file: path.join(stackRoot, 'docker-compose.yml'),
    librechat_config: path.join(stackRoot, 'librechat.yaml'),
    caddyfile: path.join(stackRoot, 'Caddyfile'),
    run_script: path.join(stackRoot, 'scripts', 'run-librechat-pilot.sh'),
    frontdesk_api_base_url: `http://host.docker.internal:${port}${basePath}/api`,
  };
}

export async function installFrontDeskLibreChatService(
  contracts: GatewayContracts,
  options: FrontDeskLibreChatServiceOptions = {},
) {
  const config = buildInstallConfig(options);
  debugLog('install.config_built', {
    public_origin: config.public_origin,
    workspace_path: config.workspace_path,
    stack_root: config.stack_root,
  });
  fs.rmSync(config.package_root, { recursive: true, force: true });
  fs.mkdirSync(config.package_root, { recursive: true });

  debugLog('install.frontdesk_service_install.start');
  await installFrontDeskService(contracts, {
    host: config.host,
    port: config.port,
    workspacePath: config.workspace_path,
    sessionsLimit: config.sessions_limit,
    basePath: config.base_path,
  });
  debugLog('install.frontdesk_service_install.done');

  debugLog('install.librechat_package.start');
  buildLibreChatPilotPackage(contracts, {
    outputDir: config.package_root,
    publicOrigin: config.public_origin,
    host: config.host,
    port: config.port,
    basePath: config.base_path,
    sessionsLimit: config.sessions_limit,
  });
  debugLog('install.librechat_package.done');
  fs.writeFileSync(config.env_file, buildRuntimeEnvFile(config), 'utf8');
  writeLibreChatConfigFile(config);
  debugLog('install.runtime_env_written', {
    env_file: config.env_file,
  });

  debugLog('install.paperclip_bootstrap.start');
  const paperclipSummary = await bootstrapLocalPaperclipControlPlane(contracts, {
    workspacePath: config.workspace_path,
    projectId: 'medautoscience',
    explicitBaseUrl: options.paperclipBaseUrl,
  });
  debugLog('install.paperclip_bootstrap.done', {
    readiness: paperclipSummary.readiness,
  });

  debugLog('install.docker_up.start');
  runDockerCompose(config, 'up');
  debugLog('install.docker_up.done');

  debugLog('install.payload.start');
  return await buildPayload(contracts, 'install', config, paperclipSummary);
}

export async function getFrontDeskLibreChatServiceStatus(contracts: GatewayContracts) {
  const config = readLibreChatConfigFile();
  const paperclipSummary = config ? buildPaperclipControlPlaneSummary(contracts) : null;
  return await buildPayload(contracts, 'status', config, paperclipSummary);
}

export async function stopFrontDeskLibreChatService(contracts: GatewayContracts) {
  const config = readLibreChatConfigFile();
  if (!config) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-stop requires an installed local LibreChat front door. Run frontdesk-librechat-install first.',
    );
  }

  runDockerCompose(config, 'down');
  return await buildPayload(contracts, 'stop', config, buildPaperclipControlPlaneSummary(contracts));
}

export async function startFrontDeskLibreChatService(contracts: GatewayContracts) {
  const config = readLibreChatConfigFile();
  if (!config) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-start requires an installed local LibreChat front door. Run frontdesk-librechat-install first.',
    );
  }

  await startFrontDeskService(contracts);
  runDockerCompose(config, 'up');
  return await buildPayload(contracts, 'start', config, buildPaperclipControlPlaneSummary(contracts));
}

export async function openFrontDeskLibreChatService(contracts: GatewayContracts) {
  const config = readLibreChatConfigFile();
  if (!config) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-open requires an installed local LibreChat front door. Run frontdesk-librechat-install first.',
    );
  }

  await openFrontDeskService(contracts);
  const result = runCommand(getOpenBinary(), [config.public_origin]);
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `Failed to open the local LibreChat front door at ${config.public_origin}.`,
      {
        command: getOpenBinary(),
        args: [config.public_origin],
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return await buildPayload(contracts, 'open', config, buildPaperclipControlPlaneSummary(contracts));
}
