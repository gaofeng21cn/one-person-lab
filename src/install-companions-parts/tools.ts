import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type OplCompanionToolActionStatus = 'ready' | 'installed' | 'missing' | 'failed';
export type OplCompanionToolId = 'officecli' | 'mineru-open-api';

export type OplCompanionToolSyncItem = {
  tool_id: OplCompanionToolId;
  binary_path: string | null;
  version: string | null;
  status: OplCompanionToolActionStatus;
  action: 'none' | 'install';
  note: string | null;
};

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

function runCommandForOutput(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    return null;
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || null;
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
  return {
    tool_id: toolId,
    binary_path: binaryPath,
    version,
    status: 'ready',
    action: 'none',
    note: null,
  };
}

function inspectOfficeCliBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  return inspectToolBinary('officecli', binaryPath, ['--version']);
}

function inspectMineruOpenApiBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  return inspectToolBinary('mineru-open-api', binaryPath, ['version']);
}

export function resolveOfficeCliTool(home: string): OplCompanionToolSyncItem | null {
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const candidates = [
    process.env.OPL_OFFICECLI_BIN?.trim() || null,
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

function buildOfficeCliInstallCommand() {
  return process.env.OPL_OFFICECLI_INSTALL_COMMAND?.trim()
    || 'curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash';
}

function buildMineruOpenApiInstallCommand() {
  return process.env.OPL_MINERU_OPEN_API_INSTALL_COMMAND?.trim()
    || 'npm install -g mineru-open-api';
}

export function ensureOfficeCliTool(home: string): OplCompanionToolSyncItem {
  const existing = resolveOfficeCliTool(home);
  if (existing) {
    return existing;
  }
  if (companionToolInstallDisabled()) {
    return {
      tool_id: 'officecli',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'Remote companion install is disabled; officecli binary was not installed.',
    };
  }

  const localBin = path.join(home, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const installCommand = buildOfficeCliInstallCommand();
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', installCommand], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: process.env.PATH,
    },
    stdio: 'pipe',
  });
  const installed = resolveOfficeCliTool(home);
  if (result.status === 0 && installed) {
    return {
      ...installed,
      status: 'installed',
      action: 'install',
    };
  }
  return {
    tool_id: 'officecli',
    binary_path: null,
    version: null,
    status: 'failed',
    action: 'install',
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'officecli install did not produce a runnable binary.',
  };
}

export function ensureMineruOpenApiTool(home: string): OplCompanionToolSyncItem {
  const existing = resolveMineruOpenApiTool(home);
  if (existing) {
    return existing;
  }
  if (companionToolInstallDisabled()) {
    return {
      tool_id: 'mineru-open-api',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'Remote companion install is disabled; mineru-open-api binary was not installed.',
    };
  }

  const localPrefix = path.join(home, '.local');
  const localBin = path.join(localPrefix, 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const installCommand = buildMineruOpenApiInstallCommand();
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', installCommand], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: process.env.PATH,
      npm_config_prefix: localPrefix,
      NPM_CONFIG_PREFIX: localPrefix,
    },
    stdio: 'pipe',
  });
  const installed = resolveMineruOpenApiTool(home);
  if (result.status === 0 && installed) {
    return {
      ...installed,
      status: 'installed',
      action: 'install',
    };
  }
  return {
    tool_id: 'mineru-open-api',
    binary_path: null,
    version: null,
    status: 'failed',
    action: 'install',
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'mineru-open-api install did not produce a runnable binary.',
  };
}
