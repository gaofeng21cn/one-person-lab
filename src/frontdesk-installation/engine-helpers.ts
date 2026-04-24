import fs from 'node:fs';
import path from 'node:path';

import { resolveCodexBinary } from '../codex.ts';
import { inspectHermesRuntime } from '../hermes.ts';

import {
  type FrontDeskEngineAction,
  type FrontDeskEngineId,
  type FrontDeskShellActionSpec,
  getShellBinary,
  normalizeOptionalString,
  runCommand,
  runShellCommand,
} from './shared.ts';

export function resolveCodexVersion() {
  const binary = resolveCodexBinary();
  if (!binary) {
    return {
      installed: false,
      version: null,
      binary_path: null,
      binary_source: null,
    };
  }

  const versionResult = runCommand(binary.path, ['--version']);
  return {
    installed: true,
    version: normalizeOptionalString(versionResult.stdout) ?? normalizeOptionalString(versionResult.stderr),
    binary_path: binary.path,
    binary_source: binary.source,
  };
}

export function findEngineOrThrow(engineId: string): FrontDeskEngineId {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'hermes') {
    return normalized;
  }

  throw new Error(`Unknown engine id: ${engineId}`);
}

function buildEngineActionEnvKey(engineId: FrontDeskEngineId, action: FrontDeskEngineAction) {
  return `OPL_${engineId.toUpperCase()}_${action.toUpperCase()}_COMMAND`;
}

function resolveHermesInstallCommand() {
  return 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash';
}

function resolveBuiltinEngineActionCommand(
  engineId: FrontDeskEngineId,
  action: FrontDeskEngineAction,
) {
  if (engineId === 'codex') {
    switch (action) {
      case 'install':
      case 'update':
      case 'reinstall':
        return 'npm install -g @openai/codex';
      case 'remove':
        return 'npm uninstall -g @openai/codex';
    }
  }

  const hermes = inspectHermesRuntime();

  switch (action) {
    case 'install':
    case 'reinstall':
      return resolveHermesInstallCommand();
    case 'update':
      return hermes.binary ? `${hermes.binary.path} update` : null;
    case 'remove':
      return null;
  }
}

function resolveShellActionSpec(
  envOverride: string | undefined,
  builtinCommand: string | null,
  manualNote: string,
): FrontDeskShellActionSpec {
  const normalizedOverride = normalizeOptionalString(envOverride);
  if (normalizedOverride) {
    const executablePath = path.resolve(normalizedOverride);
    if (!/\s/.test(normalizedOverride) && fs.existsSync(executablePath) && fs.statSync(executablePath).isFile()) {
      return {
        strategy: 'env_override',
        command_preview: [executablePath],
        note: null,
        executable: (cwd?: string) => runCommand(executablePath, [], cwd),
      };
    }

    return {
      strategy: 'env_override',
      command_preview: [getShellBinary(), '-lc', normalizedOverride],
      note: null,
      executable: (cwd?: string) => runShellCommand(normalizedOverride, cwd),
    };
  }

  if (builtinCommand) {
    return {
      strategy: 'builtin',
      command_preview: [getShellBinary(), '-lc', builtinCommand],
      note: null,
      executable: (cwd?: string) => runShellCommand(builtinCommand, cwd),
    };
  }

  return {
    strategy: 'manual_required',
    command_preview: [],
    note: manualNote,
    executable: null,
  };
}

export function resolveEngineActionSpec(
  engineId: FrontDeskEngineId,
  action: FrontDeskEngineAction,
): FrontDeskShellActionSpec {
  const envOverride = process.env[buildEngineActionEnvKey(engineId, action)];
  const builtinCommand = resolveBuiltinEngineActionCommand(engineId, action);
  const manualNote =
    engineId === 'hermes' && action === 'remove'
      ? 'Hermes remove does not currently have a safe cross-platform uninstall command. Use the installer-specific removal path manually.'
      : `No built-in ${engineId} ${action} command is configured. Set ${buildEngineActionEnvKey(engineId, action)} to enable it.`;

  return resolveShellActionSpec(envOverride, builtinCommand, manualNote);
}
