import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';

export type OplCompanionToolActionStatus = 'ready' | 'installed' | 'updated' | 'missing' | 'failed';
export const OPL_COMPANION_TOOL_IDS = [
  'officecli',
  'mineru-open-api',
  'agent-reach',
  'gh-stack',
  'ffmpeg',
] as const;
export type OplCompanionToolId = typeof OPL_COMPANION_TOOL_IDS[number];
export type OplCompanionToolCurrentness = 'current' | 'update_available' | 'unknown' | 'missing';
export type OplCompanionNetworkAccess = 'allowed' | 'forbidden';

export type OplCompanionToolSyncItem = {
  tool_id: OplCompanionToolId;
  binary_path: string | null;
  version: string | null;
  status: OplCompanionToolActionStatus;
  action: 'none' | 'install' | 'update';
  note: string | null;
  ownership: 'opl_managed' | 'app_bundled' | 'user_managed' | 'global_path' | 'missing';
  content_sha256: string | null;
  latest_version: string | null;
  currentness: OplCompanionToolCurrentness;
  latest_version_source: 'github_tags' | 'npm_registry' | 'configured' | null;
  binary_paths?: Record<string, string>;
  entrypoint?: string[];
  health_check?: {
    adapter: 'agent_reach_doctor';
    status: 'ready' | 'degraded' | 'invalid';
    required_channels: string[];
    ready_channels: string[];
    failed_channels: string[];
    github_api_check?: 'ready' | 'failed';
  };
};

type ParsedVersion = {
  version: string;
  parts: [number, number, number];
};

type LatestToolVersion = {
  version: string | null;
  source: OplCompanionToolSyncItem['latest_version_source'];
};

function managedToolHome() {
  return path.join(resolveOplStatePaths().state_dir, 'base-dependencies');
}

function managedToolReceiptPath(toolId: OplCompanionToolId) {
  return path.join(managedToolHome(), 'receipts', `${toolId}.json`);
}

function readManagedToolReceipt(toolId: OplCompanionToolId): Record<string, unknown> | null {
  const receiptPath = managedToolReceiptPath(toolId);
  if (!fs.existsSync(receiptPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    return record.dependency_id === toolId ? record : null;
  } catch {
    return null;
  }
}

function readLatestToolVersionReceipt(toolId: OplCompanionToolId): LatestToolVersion | null {
  const payload = readManagedToolReceipt(toolId);
  if (!payload) return null;
  try {
    const version = typeof payload.latest_version === 'string' ? payload.latest_version : null;
    const source = payload.latest_version_source;
    return {
      version,
      source: source === 'github_tags' || source === 'npm_registry' || source === 'configured' ? source : null,
    };
  } catch {
    return null;
  }
}

function managedToolReceiptMatches(
  toolId: OplCompanionToolId,
  binaryPaths: Record<string, string>,
  contentSha256: string,
) {
  const receipt = readManagedToolReceipt(toolId);
  if (!receipt || receipt.content_sha256 !== contentSha256) return false;
  if (!receipt.binary_paths || typeof receipt.binary_paths !== 'object') return false;
  const receiptPaths = receipt.binary_paths as Record<string, unknown>;
  const entries = Object.entries(binaryPaths);
  return Object.keys(receiptPaths).length === entries.length
    && entries.every(([name, binaryPath]) => (
      typeof receiptPaths[name] === 'string'
      && path.resolve(receiptPaths[name]) === path.resolve(binaryPath)
    ));
}

function binarySha256(binaryPath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(binaryPath)).digest('hex');
}

function binarySetSha256(binaryPaths: Record<string, string>) {
  const digest = crypto.createHash('sha256');
  for (const [name, binaryPath] of Object.entries(binaryPaths).sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(`${name}\0`);
    digest.update(fs.readFileSync(binaryPath));
  }
  return digest.digest('hex');
}

function pathOwnership(binaryPath: string | null): OplCompanionToolSyncItem['ownership'] {
  if (!binaryPath) return 'missing';
  const normalized = path.resolve(binaryPath);
  if (normalized.startsWith(`${path.resolve(managedToolHome())}${path.sep}`)) return 'opl_managed';
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  if (runtimeHome && normalized.startsWith(`${path.resolve(runtimeHome)}${path.sep}`)) return 'app_bundled';
  if (normalized.startsWith(`${path.resolve(resolveOplStatePaths().home_dir, '.local')}${path.sep}`)) return 'user_managed';
  return 'global_path';
}

function companionToolInstallDisabled() {
  return process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
}

function ensurePathEntry(entry: string) {
  const current = process.env.PATH ?? '';
  if (!entry || current.split(path.delimiter).includes(entry)) {
    return;
  }
  process.env.PATH = `${entry}${path.delimiter}${current}`;
}

function findExecutableInPath(command: string) {
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
  const names = process.platform === 'win32' ? [command, `${command}.exe`] : [command];
  for (const entry of pathEntries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

function runCommandForOutput(
  command: string,
  args: string[],
  timeoutMs = 5_000,
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    stdio: 'pipe',
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    return null;
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || null;
}

function parseVersion(value: string | null | undefined): ParsedVersion | null {
  const match = value?.match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/);
  if (!match) return null;
  return {
    version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion) {
  for (let index = 0; index < left.parts.length; index += 1) {
    const difference = left.parts[index] - right.parts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function maxVersion(values: string[]) {
  return values
    .map((value) => parseVersion(value))
    .filter((value): value is ParsedVersion => Boolean(value))
    .sort(compareVersions)
    .at(-1)?.version ?? null;
}

function configuredLatestVersion(toolId: OplCompanionToolId) {
  const key = {
    officecli: 'OPL_OFFICECLI_LATEST_VERSION',
    'mineru-open-api': 'OPL_MINERU_OPEN_API_LATEST_VERSION',
    'agent-reach': 'OPL_AGENT_REACH_LATEST_VERSION',
    'gh-stack': 'OPL_GH_STACK_LATEST_VERSION',
    ffmpeg: 'OPL_FFMPEG_LATEST_VERSION',
  }[toolId];
  const value = process.env[key]?.trim();
  return value ? parseVersion(value)?.version ?? value : null;
}

function resolveLatestToolVersion(toolId: OplCompanionToolId): LatestToolVersion {
  const configured = configuredLatestVersion(toolId);
  if (configured) return { version: configured, source: 'configured' };
  if (process.env.OPL_COMPANION_SKIP_LATEST_LOOKUP === '1') {
    return { version: null, source: null };
  }
  if (toolId === 'agent-reach') {
    return readLatestToolVersionReceipt(toolId) ?? { version: null, source: null };
  }
  if (toolId === 'ffmpeg') {
    return readLatestToolVersionReceipt(toolId) ?? { version: null, source: null };
  }
  if (toolId === 'gh-stack') {
    const output = runCommandForOutput(
      'git',
      ['ls-remote', '--tags', '--refs', 'https://github.com/github/gh-stack.git'],
    );
    return {
      version: output ? maxVersion(output.split('\n').map((line) => line.split('refs/tags/')[1] ?? '')) : null,
      source: output ? 'github_tags' : null,
    };
  }
  if (toolId === 'officecli') {
    const output = runCommandForOutput(
      'git',
      ['ls-remote', '--tags', '--refs', process.env.OPL_OFFICECLI_REPO_URL?.trim() || 'https://github.com/iOfficeAI/OfficeCLI.git'],
    );
    return {
      version: output ? maxVersion(output.split('\n').map((line) => line.split('refs/tags/')[1] ?? '')) : null,
      source: output ? 'github_tags' : null,
    };
  }
  const output = runCommandForOutput('npm', ['view', 'mineru-open-api', 'version', '--silent']);
  return {
    version: parseVersion(output)?.version ?? null,
    source: output ? 'npm_registry' : null,
  };
}

function withCurrentness(
  tool: OplCompanionToolSyncItem,
  latest: LatestToolVersion | null = null,
): OplCompanionToolSyncItem {
  if (!tool.binary_path) {
    return { ...tool, latest_version: latest?.version ?? null, currentness: 'missing', latest_version_source: latest?.source ?? null };
  }
  const current = parseVersion(tool.version);
  const target = parseVersion(latest?.version);
  return {
    ...tool,
    latest_version: target?.version ?? latest?.version ?? null,
    currentness: current && target
      ? compareVersions(current, target) >= 0 ? 'current' : 'update_available'
      : 'unknown',
    latest_version_source: latest?.source ?? null,
  };
}

function inspectToolBinary(
  toolId: OplCompanionToolId,
  binaryPath: string | null,
  versionArgs: string[],
): OplCompanionToolSyncItem | null {
  if (!binaryPath || !fs.existsSync(binaryPath) || !fs.statSync(binaryPath).isFile()) {
    return null;
  }
  const version = runCommandForOutput(binaryPath, versionArgs);
  if (!version) {
    return null;
  }
  return withCurrentness({
    tool_id: toolId,
    binary_path: binaryPath,
    version,
    status: 'ready',
    action: 'none',
    note: null,
    ownership: pathOwnership(binaryPath),
    content_sha256: binarySha256(binaryPath),
    latest_version: null,
    currentness: 'unknown',
    latest_version_source: null,
  }, readLatestToolVersionReceipt(toolId));
}

function inspectOfficeCliBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  return inspectToolBinary('officecli', binaryPath, ['--version']);
}

function inspectMineruOpenApiBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  return inspectToolBinary('mineru-open-api', binaryPath, ['version']);
}

function inspectGhStackEntrypoint(ghPath: string | null, home: string): OplCompanionToolSyncItem | null {
  if (!ghPath || !fs.existsSync(ghPath) || !fs.statSync(ghPath).isFile()) return null;
  const version = runCommandForOutput(
    ghPath,
    ['extension', 'exec', 'stack', '--version'],
    5_000,
    { ...process.env, HOME: home },
  );
  if (!version) return null;
  return withCurrentness({
    tool_id: 'gh-stack',
    binary_path: ghPath,
    binary_paths: { gh: ghPath },
    entrypoint: ['gh', 'stack'],
    version,
    status: 'ready',
    action: 'none',
    note: null,
    ownership: 'user_managed',
    content_sha256: binarySha256(ghPath),
    latest_version: null,
    currentness: 'unknown',
    latest_version_source: null,
  }, readLatestToolVersionReceipt('gh-stack'));
}

function inspectFfmpegPair(
  ffmpegPath: string | null,
  ffprobePath: string | null,
): OplCompanionToolSyncItem | null {
  if (!ffmpegPath || !ffprobePath) return null;
  if (
    !fs.existsSync(ffmpegPath)
    || !fs.statSync(ffmpegPath).isFile()
    || !fs.existsSync(ffprobePath)
    || !fs.statSync(ffprobePath).isFile()
  ) return null;
  const ffmpegVersion = runCommandForOutput(ffmpegPath, ['-version']);
  const ffprobeVersion = runCommandForOutput(ffprobePath, ['-version']);
  if (!ffmpegVersion || !ffprobeVersion) return null;
  const binaryPaths = { ffmpeg: ffmpegPath, ffprobe: ffprobePath };
  const contentSha256 = binarySetSha256(binaryPaths);
  return withCurrentness({
    tool_id: 'ffmpeg',
    binary_path: ffmpegPath,
    binary_paths: binaryPaths,
    entrypoint: ['ffmpeg', 'ffprobe'],
    version: [ffmpegVersion, ffprobeVersion]
      .map((value) => value.split('\n')[0])
      .join('\n'),
    status: 'ready',
    action: 'none',
    note: null,
    ownership: managedToolReceiptMatches('ffmpeg', binaryPaths, contentSha256)
      ? 'opl_managed'
      : pathOwnership(ffmpegPath),
    content_sha256: contentSha256,
    latest_version: null,
    currentness: 'unknown',
    latest_version_source: null,
  }, readLatestToolVersionReceipt('ffmpeg'));
}

const AGENT_REACH_CORE_CHANNELS = ['web', 'youtube', 'rss', 'github', 'bilibili', 'v2ex'] as const;

function verifyGitHubApiAccess(): boolean {
  const gh = process.env.OPL_GH_BIN?.trim() || findExecutableInPath('gh');
  if (!gh) return false;
  // Doctor deliberately skips gh auth status because it can mutate local state.
  // Verify the authenticated user with a bounded GET; never initiate a login.
  const output = runCommandForOutput(gh, ['api', '--hostname', 'github.com', '--method', 'GET', 'user']);
  try {
    const user = output ? JSON.parse(output) : null;
    return Number.isSafeInteger(user?.id) && user.id > 0
      && typeof user.login === 'string' && user.login.trim().length > 0;
  } catch {
    return false;
  }
}

function inspectAgentReachBinary(
  binaryPath: string | null,
  options: { includeHealthCheck?: boolean } = {},
): OplCompanionToolSyncItem | null {
  const inspected = inspectToolBinary('agent-reach', binaryPath, ['--version']);
  if (!inspected || !binaryPath) return null;
  if (options.includeHealthCheck === false) return inspected;
  const doctorOutput = runCommandForOutput(binaryPath, ['doctor', '--json'], 15_000);
  let doctor: Record<string, unknown> | null = null;
  try {
    doctor = doctorOutput ? JSON.parse(doctorOutput) as Record<string, unknown> : null;
  } catch {
    doctor = null;
  }
  const readyChannels = doctor
    ? AGENT_REACH_CORE_CHANNELS.filter((channel) => {
        const entry = doctor?.[channel];
        return Boolean(entry && typeof entry === 'object' && (entry as Record<string, unknown>).status === 'ok');
      })
    : [];
  const github = doctor?.github;
  const githubApiCheck = github && typeof github === 'object'
    && (github as Record<string, unknown>).status === 'warn'
    ? verifyGitHubApiAccess() ? 'ready' : 'failed'
    : undefined;
  if (githubApiCheck === 'ready') readyChannels.push('github');
  const failedChannels = AGENT_REACH_CORE_CHANNELS.filter((channel) => !readyChannels.includes(channel));
  const healthStatus = !doctor ? 'invalid' : failedChannels.length === 0 ? 'ready' : 'degraded';
  return {
    ...inspected,
    status: healthStatus === 'ready' ? 'ready' : 'failed',
    note: healthStatus === 'ready'
      ? null
      : healthStatus === 'invalid'
        ? 'agent-reach doctor --json did not return a valid readiness document.'
        : `Agent Reach core channels are unavailable: ${failedChannels.join(', ')}.`,
    health_check: {
      adapter: 'agent_reach_doctor',
      status: healthStatus,
      required_channels: [...AGENT_REACH_CORE_CHANNELS],
      ready_channels: readyChannels,
      failed_channels: failedChannels,
      ...(githubApiCheck ? { github_api_check: githubApiCheck } : {}),
    },
  };
}

export function resolveOfficeCliTool(home: string): OplCompanionToolSyncItem | null {
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const candidates = [
    process.env.OPL_OFFICECLI_BIN?.trim() || null,
    path.join(managedToolHome(), '.local', 'bin', 'officecli'),
    runtimeHome ? path.join(runtimeHome, 'bin', 'officecli') : null,
    findExecutableInPath('officecli'),
    path.join(home, '.local', 'bin', 'officecli'),
  ];
  for (const candidate of candidates) {
    const inspected = inspectOfficeCliBinary(candidate);
    if (inspected) {
      return inspected;
    }
  }
  return null;
}

export function resolveMineruOpenApiTool(home: string): OplCompanionToolSyncItem | null {
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const candidates = [
    process.env.OPL_MINERU_OPEN_API_BIN?.trim() || null,
    path.join(managedToolHome(), '.local', 'bin', 'mineru-open-api'),
    runtimeHome ? path.join(runtimeHome, 'bin', 'mineru-open-api') : null,
    findExecutableInPath('mineru-open-api'),
    path.join(home, '.local', 'bin', 'mineru-open-api'),
  ];
  for (const candidate of candidates) {
    const inspected = inspectMineruOpenApiBinary(candidate);
    if (inspected) {
      return inspected;
    }
  }
  return null;
}

export function resolveAgentReachTool(
  home: string,
  options: { includeHealthCheck?: boolean } = {},
): OplCompanionToolSyncItem | null {
  const candidates = [
    process.env.OPL_AGENT_REACH_BIN?.trim() || null,
    findExecutableInPath('agent-reach'),
    path.join(home, '.local', 'bin', 'agent-reach'),
  ];
  for (const candidate of candidates) {
    const inspected = inspectAgentReachBinary(candidate, options);
    if (inspected) return inspected;
  }
  return null;
}

export function resolveGhStackTool(home: string): OplCompanionToolSyncItem | null {
  const directBinary = process.env.OPL_GH_STACK_BIN?.trim() || null;
  if (directBinary) {
    const inspected = inspectToolBinary('gh-stack', directBinary, ['--version']);
    if (inspected) return { ...inspected, entrypoint: [directBinary] };
  }
  const ghCandidates = [
    process.env.OPL_GH_BIN?.trim() || null,
    findExecutableInPath('gh'),
  ];
  for (const candidate of ghCandidates) {
    const inspected = inspectGhStackEntrypoint(candidate, home);
    if (inspected) return inspected;
  }
  return null;
}

function resolveHomebrewFormulaBinary(formula: string, binaryName: string) {
  const brew = process.env.OPL_HOMEBREW_BIN?.trim() || findExecutableInPath('brew');
  if (!brew) return null;
  const prefix = runCommandForOutput(brew, ['--prefix', formula]);
  return prefix ? path.join(prefix, 'bin', binaryName) : null;
}

export function resolveFfmpegTool(
  home: string,
  options: { includeHomebrewFallback?: boolean } = {},
): OplCompanionToolSyncItem | null {
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const explicitFfmpeg = process.env.OPL_FFMPEG_BIN?.trim() || null;
  const explicitFfprobe = process.env.OPL_FFPROBE_BIN?.trim()
    || (explicitFfmpeg ? path.join(path.dirname(explicitFfmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : null);
  const pairs: Array<[string | null, string | null]> = [
    [explicitFfmpeg, explicitFfprobe],
    [
      path.join(managedToolHome(), '.local', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      path.join(managedToolHome(), '.local', 'bin', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'),
    ],
    [
      runtimeHome ? path.join(runtimeHome, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') : null,
      runtimeHome ? path.join(runtimeHome, 'bin', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : null,
    ],
    [findExecutableInPath('ffmpeg'), findExecutableInPath('ffprobe')],
    [
      path.join(home, '.local', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      path.join(home, '.local', 'bin', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'),
    ],
    ...(options.includeHomebrewFallback === false
      ? []
      : [[
          resolveHomebrewFormulaBinary('ffmpeg', 'ffmpeg'),
          resolveHomebrewFormulaBinary('ffmpeg', 'ffprobe'),
        ] as [string | null, string | null]]),
  ];
  for (const [ffmpegPath, ffprobePath] of pairs) {
    const inspected = inspectFfmpegPair(ffmpegPath, ffprobePath);
    if (inspected) return inspected;
  }
  return null;
}

export function resolveOplCompanionTool(
  home: string,
  toolId: OplCompanionToolId,
  options: { includeHealthCheck?: boolean; includeHomebrewFallback?: boolean } = {},
): OplCompanionToolSyncItem | null {
  if (toolId === 'officecli') return resolveOfficeCliTool(home);
  if (toolId === 'mineru-open-api') return resolveMineruOpenApiTool(home);
  if (toolId === 'agent-reach') return resolveAgentReachTool(home, options);
  if (toolId === 'gh-stack') return resolveGhStackTool(home);
  return resolveFfmpegTool(home, options);
}

export function installAgentReachSkill(home: string) {
  const tool = resolveAgentReachTool(home);
  if (!tool?.binary_path) {
    return { status: 'missing' as const, note: 'Agent Reach owner CLI is not installed.' };
  }
  const result = spawnSync(tool.binary_path, ['skill', '--install'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      CODEX_HOME: process.env.CODEX_HOME?.trim() || path.join(home, '.codex'),
    },
    stdio: 'pipe',
    timeout: 30_000,
  });
  return result.status === 0
    ? { status: 'installed' as const, note: null }
    : {
        status: 'failed' as const,
        note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
          || 'agent-reach skill --install failed.',
      };
}

function buildOfficeCliInstallCommand() {
  return process.env.OPL_OFFICECLI_INSTALL_COMMAND?.trim()
    || 'curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash';
}

function buildMineruOpenApiInstallCommand() {
  return process.env.OPL_MINERU_OPEN_API_INSTALL_COMMAND?.trim()
    || 'npm install -g mineru-open-api@latest';
}

function failedTool(
  toolId: OplCompanionToolId,
  action: 'none' | 'install' | 'update',
  status: 'missing' | 'failed',
  note: string,
): OplCompanionToolSyncItem {
  return {
    tool_id: toolId,
    binary_path: null,
    version: null,
    status,
    action,
    note,
    ownership: 'missing',
    content_sha256: null,
    latest_version: null,
    currentness: 'missing',
    latest_version_source: null,
  };
}

function writeManagedToolReceipt(tool: OplCompanionToolSyncItem) {
  const receiptPath = managedToolReceiptPath(tool.tool_id);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify({
    surface_kind: 'opl_base_managed_dependency_receipt',
    dependency_id: tool.tool_id,
    binary_path: tool.binary_path,
    binary_paths: tool.binary_paths,
    entrypoint: tool.entrypoint,
    version: tool.version,
    content_sha256: tool.content_sha256,
    latest_version: tool.latest_version,
    currentness: tool.currentness,
    latest_version_source: tool.latest_version_source,
    ownership: tool.ownership,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  return receiptPath;
}

function installOfficeCliTool(
  action: 'install' | 'update' = 'install',
  latest: LatestToolVersion | null = null,
): OplCompanionToolSyncItem {
  const dependencyHome = managedToolHome();
  const localBin = path.join(dependencyHome, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', buildOfficeCliInstallCommand()], {
    encoding: 'utf8',
    timeout: 300_000,
    killSignal: 'SIGKILL',
    env: { ...process.env, HOME: dependencyHome, PATH: process.env.PATH },
    stdio: 'pipe',
  });
  const installed = inspectOfficeCliBinary(path.join(localBin, 'officecli'));
  if (result.status === 0 && installed) {
    const managed = withCurrentness({
      ...installed,
      status: action === 'update' ? 'updated' as const : 'installed' as const,
      action,
      ownership: 'opl_managed' as const,
    }, latest ?? resolveLatestToolVersion('officecli'));
    writeManagedToolReceipt(managed);
    return managed;
  }
  return {
    tool_id: 'officecli', binary_path: null, version: null, status: 'failed', action,
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'officecli install did not produce a runnable binary.',
    ownership: 'missing', content_sha256: null, latest_version: null, currentness: 'missing', latest_version_source: null,
  };
}

function installMineruOpenApiTool(
  action: 'install' | 'update' = 'install',
  latest: LatestToolVersion | null = null,
): OplCompanionToolSyncItem {
  const dependencyHome = managedToolHome();
  const localPrefix = path.join(dependencyHome, '.local');
  const localBin = path.join(localPrefix, 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', buildMineruOpenApiInstallCommand()], {
    encoding: 'utf8',
    timeout: 300_000,
    killSignal: 'SIGKILL',
    env: { ...process.env, HOME: dependencyHome, PATH: process.env.PATH, npm_config_prefix: localPrefix, NPM_CONFIG_PREFIX: localPrefix },
    stdio: 'pipe',
  });
  const installed = inspectMineruOpenApiBinary(path.join(localBin, 'mineru-open-api'));
  if (result.status === 0 && installed) {
    const managed = withCurrentness({
      ...installed,
      status: action === 'update' ? 'updated' as const : 'installed' as const,
      action,
      ownership: 'opl_managed' as const,
    }, latest ?? resolveLatestToolVersion('mineru-open-api'));
    writeManagedToolReceipt(managed);
    return managed;
  }
  return {
    tool_id: 'mineru-open-api', binary_path: null, version: null, status: 'failed', action,
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'mineru-open-api install did not produce a runnable binary.',
    ownership: 'missing', content_sha256: null, latest_version: null, currentness: 'missing', latest_version_source: null,
  };
}

function installGhStackTool(
  home: string,
  action: 'install' | 'update' = 'install',
  latest: LatestToolVersion | null = null,
): OplCompanionToolSyncItem {
  const gh = process.env.OPL_GH_BIN?.trim() || findExecutableInPath('gh');
  if (!gh) {
    return failedTool('gh-stack', action, 'failed', 'GitHub CLI is required to install the official gh-stack extension.');
  }
  const args = action === 'update'
    ? ['extension', 'upgrade', 'github/gh-stack']
    : ['extension', 'install', 'github/gh-stack'];
  const result = spawnSync(gh, args, {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
    stdio: 'pipe',
    timeout: 60_000,
  });
  const installed = inspectGhStackEntrypoint(gh, home);
  if (result.status === 0 && installed) {
    const managed = withCurrentness({
      ...installed,
      status: action === 'update' ? 'updated' as const : 'installed' as const,
      action,
      ownership: 'user_managed' as const,
    }, latest ?? resolveLatestToolVersion('gh-stack'));
    writeManagedToolReceipt(managed);
    return managed;
  }
  return failedTool(
    'gh-stack',
    action,
    'failed',
    [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
      || 'GitHub CLI did not install a callable gh-stack extension.',
  );
}

function installFfmpegTool(
  home: string,
  action: 'install' | 'update' = 'install',
  latest: LatestToolVersion | null = null,
): OplCompanionToolSyncItem {
  const localBin = path.join(managedToolHome(), '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const customCommand = process.env.OPL_FFMPEG_INSTALL_COMMAND?.trim();
  const brew = process.env.OPL_HOMEBREW_BIN?.trim() || findExecutableInPath('brew');
  let result;
  if (customCommand) {
    result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', customCommand], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        PATH: process.env.PATH,
        OPL_COMPANION_TOOL_BIN_DIR: localBin,
      },
      stdio: 'pipe',
      timeout: 120_000,
    });
  } else if (brew) {
    result = spawnSync(brew, [action === 'update' ? 'upgrade' : 'install', 'ffmpeg'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
      stdio: 'pipe',
      timeout: 300_000,
    });
  } else {
    return failedTool(
      'ffmpeg',
      action,
      'failed',
      'No supported non-interactive FFmpeg package manager is available. Install both ffmpeg and ffprobe, or configure OPL_FFMPEG_INSTALL_COMMAND.',
    );
  }
  const installed = resolveFfmpegTool(home);
  if (result.status === 0 && installed) {
    const managed = withCurrentness({
      ...installed,
      status: action === 'update' ? 'updated' as const : 'installed' as const,
      action,
      ownership: 'opl_managed' as const,
    }, latest ?? resolveLatestToolVersion('ffmpeg'));
    writeManagedToolReceipt(managed);
    return managed;
  }
  return failedTool(
    'ffmpeg',
    action,
    'failed',
    [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
      || 'FFmpeg install did not produce callable ffmpeg and ffprobe binaries.',
  );
}

export function ensureOfficeCliTool(
  home: string,
  options: { networkAccess?: OplCompanionNetworkAccess } = {},
): OplCompanionToolSyncItem {
  const existing = resolveOfficeCliTool(home);
  if (existing) {
    return existing;
  }
  if (options.networkAccess === 'forbidden' || companionToolInstallDisabled()) {
    return {
      tool_id: 'officecli',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'Remote companion install is disabled; officecli binary was not installed.',
      ownership: 'missing',
      content_sha256: null,
      latest_version: null,
      currentness: 'missing',
      latest_version_source: null,
    };
  }
  return installOfficeCliTool();
}

export function ensureMineruOpenApiTool(
  home: string,
  options: { networkAccess?: OplCompanionNetworkAccess } = {},
): OplCompanionToolSyncItem {
  const existing = resolveMineruOpenApiTool(home);
  if (existing) {
    return existing;
  }
  if (options.networkAccess === 'forbidden' || companionToolInstallDisabled()) {
    return {
      tool_id: 'mineru-open-api',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'Remote companion install is disabled; mineru-open-api binary was not installed.',
      ownership: 'missing',
      content_sha256: null,
      latest_version: null,
      currentness: 'missing',
      latest_version_source: null,
    };
  }
  return installMineruOpenApiTool();
}

export function ensureAgentReachTool(
  home: string,
  _options: { networkAccess?: OplCompanionNetworkAccess } = {},
): OplCompanionToolSyncItem {
  return resolveAgentReachTool(home) ?? {
    tool_id: 'agent-reach',
    binary_path: null,
    version: null,
    status: 'missing',
    action: 'none',
    note: 'Install Agent Reach through its owner-supported installer, then rerun OPL Flow repair.',
    ownership: 'missing',
    content_sha256: null,
    latest_version: null,
    currentness: 'missing',
    latest_version_source: null,
    health_check: {
      adapter: 'agent_reach_doctor',
      status: 'invalid',
      required_channels: [...AGENT_REACH_CORE_CHANNELS],
      ready_channels: [],
      failed_channels: [...AGENT_REACH_CORE_CHANNELS],
    },
  };
}

export function ensureGhStackTool(
  home: string,
  options: { networkAccess?: OplCompanionNetworkAccess } = {},
): OplCompanionToolSyncItem {
  const existing = resolveGhStackTool(home);
  if (existing) return existing;
  if (options.networkAccess === 'forbidden' || companionToolInstallDisabled()) {
    return failedTool(
      'gh-stack',
      'none',
      'missing',
      'Remote companion install is disabled; the official gh-stack extension was not installed.',
    );
  }
  return installGhStackTool(home);
}

export function ensureFfmpegTool(
  home: string,
  options: { networkAccess?: OplCompanionNetworkAccess } = {},
): OplCompanionToolSyncItem {
  const existing = resolveFfmpegTool(home);
  if (existing) return existing;
  if (options.networkAccess === 'forbidden' || companionToolInstallDisabled()) {
    return failedTool(
      'ffmpeg',
      'none',
      'missing',
      'Remote companion install is disabled; callable ffmpeg and ffprobe binaries were not found.',
    );
  }
  return installFfmpegTool(home);
}

export function ensureOplCompanionTool(
  home: string,
  toolId: OplCompanionToolId,
  options: { networkAccess?: OplCompanionNetworkAccess } = {},
): OplCompanionToolSyncItem {
  if (toolId === 'officecli') return ensureOfficeCliTool(home, options);
  if (toolId === 'mineru-open-api') return ensureMineruOpenApiTool(home, options);
  if (toolId === 'agent-reach') return ensureAgentReachTool(home, options);
  if (toolId === 'gh-stack') return ensureGhStackTool(home, options);
  return ensureFfmpegTool(home, options);
}

export function inspectManagedCompanionToolCurrentness(
  home: string,
  toolIds: OplCompanionToolId[] = ['officecli', 'mineru-open-api'],
) {
  return toolIds.map((toolId) => {
    const current = resolveOplCompanionTool(home, toolId);
    return current && (current.ownership === 'opl_managed' || toolId === 'gh-stack')
      ? withCurrentness(current, resolveLatestToolVersion(toolId))
      : current;
  });
}

export function reconcileManagedCompanionTools(
  home: string,
  toolIds: OplCompanionToolId[] = ['officecli', 'mineru-open-api'],
) {
  return toolIds.map((toolId) => {
    const current = resolveOplCompanionTool(home, toolId);
    if (toolId === 'agent-reach') {
      return current ?? ensureAgentReachTool(home);
    }
    if (toolId === 'gh-stack') {
      if (current) {
        const latest = resolveLatestToolVersion(toolId);
        const inspected = withCurrentness(current, latest);
        if (inspected.currentness !== 'update_available' || companionToolInstallDisabled()) {
          writeManagedToolReceipt(inspected);
          return inspected;
        }
        return installGhStackTool(home, 'update', latest);
      }
      if (companionToolInstallDisabled()) {
        return failedTool('gh-stack', 'none', 'missing', 'Remote managed dependency update is disabled.');
      }
      return installGhStackTool(home);
    }
    if (current?.ownership === 'app_bundled'
      && current.binary_path
      && (toolId === 'officecli' || toolId === 'mineru-open-api')) {
      const targetPath = path.join(managedToolHome(), '.local', 'bin', toolId);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(current.binary_path, targetPath);
      fs.chmodSync(targetPath, 0o755);
      const seeded = toolId === 'officecli'
        ? inspectOfficeCliBinary(targetPath)
        : inspectMineruOpenApiBinary(targetPath);
      if (seeded) {
        const managed = {
          ...seeded,
          status: 'installed' as const,
          action: 'install' as const,
          ownership: 'opl_managed' as const,
          note: 'Materialized from the App Full offline seed into the OPL Base managed dependency root.',
        };
        writeManagedToolReceipt(managed);
        return managed;
      }
      fs.rmSync(targetPath, { force: true });
      return {
        ...current,
        status: 'failed' as const,
        action: 'install' as const,
        note: 'App bundled seed failed verification and was not activated.',
      };
    }
    if (current && current.ownership !== 'opl_managed') {
      return { ...current, note: `${current.ownership} dependency is detected but not overwritten by OPL Base.` };
    }
    if (current?.ownership === 'opl_managed') {
      const latest = resolveLatestToolVersion(toolId);
      const inspected = withCurrentness(current, latest);
      if (inspected.currentness !== 'update_available') {
        writeManagedToolReceipt(inspected);
        return inspected;
      }
      return toolId === 'officecli'
        ? installOfficeCliTool('update', latest)
        : toolId === 'mineru-open-api'
          ? installMineruOpenApiTool('update', latest)
          : installFfmpegTool(home, 'update', latest);
    }
    if (companionToolInstallDisabled()) {
      return current ?? {
        tool_id: toolId, binary_path: null, version: null, status: 'missing' as const, action: 'none' as const,
        note: 'Remote managed dependency update is disabled.', ownership: 'missing' as const, content_sha256: null,
        latest_version: null, currentness: 'missing' as const, latest_version_source: null,
      };
    }
    if (toolId === 'officecli') return installOfficeCliTool();
    if (toolId === 'mineru-open-api') return installMineruOpenApiTool();
    return installFfmpegTool(home);
  });
}
