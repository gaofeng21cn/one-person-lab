import { resolveDependencyReleaseSync } from '../dependency-release-resolution-sync.ts';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  OPL_COMPANION_TOOL_IDS,
  configuredLatestVersion,
  maxVersion,
  parseVersion,
  withCurrentness,
} from './tool-version.ts';
import type {
  LatestToolVersion,
  OplCompanionNetworkAccess,
  OplCompanionToolId,
  OplCompanionToolSyncItem,
} from './tool-version.ts';
import {
  managedToolHome,
  readLatestToolVersionReceipt,
  writeManagedToolReceipt,
} from './tool-receipts.ts';
import {
  ensurePathEntry,
  findExecutableInPath,
  inspectGhStackEntrypoint,
  inspectMineruOpenApiBinary,
  inspectOfficeCliBinary,
  resolveAgentReachTool,
  resolveFfmpegTool,
  resolveGhStackTool,
  resolveMineruOpenApiTool,
  resolveOfficeCliTool,
  runCommandForOutput,
} from './tool-probes.ts';

export {
  OPL_COMPANION_TOOL_IDS,
};
export type {
  OplCompanionNetworkAccess,
  OplCompanionToolActionStatus,
  OplCompanionToolCurrentness,
  OplCompanionToolId,
  OplCompanionToolSyncItem,
} from './tool-version.ts';
export {
  resolveAgentReachTool,
  resolveFfmpegTool,
  resolveGhStackTool,
  resolveMineruOpenApiTool,
  resolveOfficeCliTool,
} from './tool-probes.ts';

function companionToolInstallDisabled() {
  return process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
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
  try {
    const resolved = resolveDependencyReleaseSync(toolId, { verifyArchive: false });
    return { version: resolved.version, source: toolId === 'officecli' ? 'github_tags' : 'npm_registry' };
  } catch { return { version: null, source: null }; }
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

export function installAgentReachSkill(binaryPath: string, skillsDir: string, legacyHome?: string) {
  const args = legacyHome ? ['skill', '--install'] : ['skill', 'link', skillsDir];
  const result = spawnSync(binaryPath, args, {
    encoding: 'utf8',
    env: legacyHome ? { ...process.env, HOME: legacyHome } : undefined,
    stdio: 'pipe',
    timeout: 30_000,
  });
  return result.status === 0
    ? { status: 'installed' as const, note: null }
    : {
        status: 'failed' as const,
        note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
          || `agent-reach ${args.slice(0, 2).join(' ')} failed.`,
      };
}

function buildOfficeCliInstallCommand() {
  return process.env.OPL_OFFICECLI_INSTALL_COMMAND?.trim()
    || 'curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash';
}

function buildMineruOpenApiInstallCommand(version: string) {
  return process.env.OPL_MINERU_OPEN_API_INSTALL_COMMAND?.trim()
    || `npm install -g mineru-open-api@${version}`;
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
  const target = latest ?? resolveLatestToolVersion('mineru-open-api');
  if (!target.version && !process.env.OPL_MINERU_OPEN_API_INSTALL_COMMAND?.trim()) {
    return failedTool('mineru-open-api', action, 'failed', 'Latest supported MinerU release could not be resolved.');
  }
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', buildMineruOpenApiInstallCommand(target.version ?? '')], {
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
    }, target);
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
      version: null,
      channels: [],
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
