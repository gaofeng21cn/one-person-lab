import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  binarySetSha256,
  binarySha256,
  managedToolHome,
  managedToolReceiptMatches,
  pathOwnership,
  readLatestToolVersionReceipt,
} from './tool-receipts.ts';
import {
  withCurrentness,
  type OplCompanionToolId,
  type OplCompanionToolSyncItem,
} from './tool-version.ts';

export function ensurePathEntry(entry: string) {
  const current = process.env.PATH ?? '';
  if (!entry || current.split(path.delimiter).includes(entry)) {
    return;
  }
  process.env.PATH = `${entry}${path.delimiter}${current}`;
}

export function findExecutableInPath(command: string) {
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

export function runCommandForOutput(
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

export function inspectToolBinary(
  toolId: OplCompanionToolId,
  binaryPath: string | null,
  versionArgs: string[],
  readVersion: (output: string) => string | null = (output) => output,
): OplCompanionToolSyncItem | null {
  if (!binaryPath || !fs.existsSync(binaryPath) || !fs.statSync(binaryPath).isFile()) {
    return null;
  }
  const output = runCommandForOutput(binaryPath, versionArgs);
  const version = output && readVersion(output);
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

export function inspectOfficeCliBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  return inspectToolBinary('officecli', binaryPath, ['--version']);
}

export function inspectMineruOpenApiBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  return inspectToolBinary('mineru-open-api', binaryPath, ['version']);
}

export function inspectGhStackEntrypoint(ghPath: string | null, home: string): OplCompanionToolSyncItem | null {
  if (!ghPath || !fs.existsSync(ghPath) || !fs.statSync(ghPath).isFile()) return null;
  const version = runCommandForOutput(
    ghPath,
    // The native extension dispatch permits its local version probe without a
    // GitHub login; `gh extension exec` requires authentication before dispatch.
    ['stack', '--version'],
    5_000,
    { ...process.env, HOME: home },
  );
  if (!version || !/\bgh stack version\s+\d+\.\d+\.\d+\b/.test(version)) return null;
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

export function inspectFfmpegPair(
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

type AgentReachChannels = NonNullable<OplCompanionToolSyncItem['health_check']>['channels'];

function parseAgentReachJson(output: string | null) {
  if (!output) return null;
  try {
    const document: unknown = JSON.parse(output);
    return isRecord(document) ? document : null;
  } catch {
    return null;
  }
}

function agentReachResult(document: Record<string, unknown> | null, action: 'version' | 'doctor') {
  if (document?.schema_version !== 1 || document.ok !== true || document.action !== action) return null;
  return isRecord(document.result) ? document.result : null;
}

function agentReachDoctorChannels(value: unknown): AgentReachChannels | null {
  if (!Array.isArray(value)) return null;
  const channels: AgentReachChannels = [];
  for (const channel of value) {
    if (!isRecord(channel)
      || typeof channel.channel !== 'string'
      || typeof channel.level !== 'string'
      || typeof channel.status !== 'string'
      || !Array.isArray(channel.problems)
      || !channel.problems.every((problem) => typeof problem === 'string')
      || (channel.hint !== undefined && typeof channel.hint !== 'string')) return null;
    channels.push({
      channel: channel.channel,
      level: channel.level,
      status: channel.status,
      problems: channel.problems as string[],
      ...(typeof channel.hint === 'string' ? { hint: channel.hint } : {}),
    });
  }
  return channels;
}

function legacyAgentReachDoctorChannels(document: Record<string, unknown> | null): AgentReachChannels | null {
  if (!document) return null;
  const channels: AgentReachChannels = [];
  for (const [channel, entry] of Object.entries(document)) {
    if (!isRecord(entry) || typeof entry.status !== 'string') return null;
    channels.push({
      channel,
      status: entry.status,
      problems: entry.status !== 'ok' && typeof entry.message === 'string' ? [entry.message] : [],
    });
  }
  return channels.length > 0 ? channels : null;
}

function inspectAgentReachBinary(
  binaryPath: string | null,
  options: { includeHealthCheck?: boolean } = {},
): OplCompanionToolSyncItem | null {
  const current = inspectToolBinary('agent-reach', binaryPath, ['version'], (output) => {
    const version = agentReachResult(parseAgentReachJson(output), 'version')?.version;
    return typeof version === 'string' ? version.trim() : null;
  });
  const inspected = current ?? inspectToolBinary('agent-reach', binaryPath, ['--version'], (output) =>
    /^Agent Reach v\d+\.\d+\.\d+$/.test(output) ? output : null);
  if (!inspected || !binaryPath || options.includeHealthCheck === false) return inspected;

  const doctorArgs = current ? ['doctor'] : ['doctor', '--json'];
  const doctorDocument = parseAgentReachJson(runCommandForOutput(binaryPath, doctorArgs, 15_000));
  const doctorResult = agentReachResult(doctorDocument, 'doctor');
  const doctorChannels = current
    ? agentReachDoctorChannels(doctorResult?.channels)
    : legacyAgentReachDoctorChannels(doctorDocument);
  const doctorVersion = current ? doctorResult?.version : inspected.version;
  const doctorIsValid = doctorChannels !== null
    && typeof doctorVersion === 'string'
    && doctorVersion.trim().length > 0;
  return {
    ...inspected,
    status: doctorIsValid ? 'ready' : 'failed',
    note: doctorIsValid ? null : 'agent-reach doctor did not return a valid readiness document.',
    health_check: {
      adapter: 'agent_reach_doctor',
      status: doctorIsValid ? 'ready' : 'invalid',
      version: doctorIsValid ? doctorVersion : null,
      channels: doctorChannels ?? [],
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
