import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';

export type OplCompanionToolActionStatus = 'ready' | 'installed' | 'missing' | 'failed';
export type OplCompanionToolId = 'officecli' | 'mineru-open-api';

export type OplCompanionToolSyncItem = {
  tool_id: OplCompanionToolId;
  binary_path: string | null;
  version: string | null;
  status: OplCompanionToolActionStatus;
  action: 'none' | 'install';
  note: string | null;
  ownership: 'opl_managed' | 'app_bundled' | 'user_managed' | 'global_path' | 'missing';
  content_sha256: string | null;
};

function managedToolHome() {
  return path.join(resolveOplStatePaths().state_dir, 'base-dependencies');
}

function managedToolReceiptPath(toolId: OplCompanionToolId) {
  return path.join(managedToolHome(), 'receipts', `${toolId}.json`);
}

function binarySha256(binaryPath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(binaryPath)).digest('hex');
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
    ownership: pathOwnership(binaryPath),
    content_sha256: binarySha256(binaryPath),
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

function buildOfficeCliInstallCommand() {
  return process.env.OPL_OFFICECLI_INSTALL_COMMAND?.trim()
    || 'curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash';
}

function buildMineruOpenApiInstallCommand() {
  return process.env.OPL_MINERU_OPEN_API_INSTALL_COMMAND?.trim()
    || 'npm install -g mineru-open-api';
}

function writeManagedToolReceipt(tool: OplCompanionToolSyncItem) {
  const receiptPath = managedToolReceiptPath(tool.tool_id);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify({
    surface_kind: 'opl_base_managed_dependency_receipt',
    dependency_id: tool.tool_id,
    binary_path: tool.binary_path,
    version: tool.version,
    content_sha256: tool.content_sha256,
    ownership: tool.ownership,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  return receiptPath;
}

function installOfficeCliTool(): OplCompanionToolSyncItem {
  const dependencyHome = managedToolHome();
  const localBin = path.join(dependencyHome, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', buildOfficeCliInstallCommand()], {
    encoding: 'utf8',
    env: { ...process.env, HOME: dependencyHome, PATH: process.env.PATH },
    stdio: 'pipe',
  });
  const installed = inspectOfficeCliBinary(path.join(localBin, 'officecli'));
  if (result.status === 0 && installed) {
    const managed = { ...installed, status: 'installed' as const, action: 'install' as const, ownership: 'opl_managed' as const };
    writeManagedToolReceipt(managed);
    return managed;
  }
  return {
    tool_id: 'officecli', binary_path: null, version: null, status: 'failed', action: 'install',
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'officecli install did not produce a runnable binary.',
    ownership: 'missing', content_sha256: null,
  };
}

function installMineruOpenApiTool(): OplCompanionToolSyncItem {
  const dependencyHome = managedToolHome();
  const localPrefix = path.join(dependencyHome, '.local');
  const localBin = path.join(localPrefix, 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', buildMineruOpenApiInstallCommand()], {
    encoding: 'utf8',
    env: { ...process.env, HOME: dependencyHome, PATH: process.env.PATH, npm_config_prefix: localPrefix, NPM_CONFIG_PREFIX: localPrefix },
    stdio: 'pipe',
  });
  const installed = inspectMineruOpenApiBinary(path.join(localBin, 'mineru-open-api'));
  if (result.status === 0 && installed) {
    const managed = { ...installed, status: 'installed' as const, action: 'install' as const, ownership: 'opl_managed' as const };
    writeManagedToolReceipt(managed);
    return managed;
  }
  return {
    tool_id: 'mineru-open-api', binary_path: null, version: null, status: 'failed', action: 'install',
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'mineru-open-api install did not produce a runnable binary.',
    ownership: 'missing', content_sha256: null,
  };
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
      ownership: 'missing',
      content_sha256: null,
    };
  }
  return installOfficeCliTool();
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
      ownership: 'missing',
      content_sha256: null,
    };
  }
  return installMineruOpenApiTool();
}

export function reconcileManagedCompanionTools(
  home: string,
  toolIds: OplCompanionToolId[] = ['officecli', 'mineru-open-api'],
) {
  return toolIds.map((toolId) => {
    const current = toolId === 'officecli' ? resolveOfficeCliTool(home) : resolveMineruOpenApiTool(home);
    if (current?.ownership === 'app_bundled' && current.binary_path) {
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
    if (companionToolInstallDisabled()) {
      return current ?? {
        tool_id: toolId, binary_path: null, version: null, status: 'missing' as const, action: 'none' as const,
        note: 'Remote managed dependency update is disabled.', ownership: 'missing' as const, content_sha256: null,
      };
    }
    return toolId === 'officecli' ? installOfficeCliTool() : installMineruOpenApiTool();
  });
}
