import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunwayError } from '../../errors.ts';

export type CodexBinarySource = 'explicit' | 'env' | 'path' | 'runtime';

export interface CodexBinaryInfo {
  readonly path: string;
  readonly source: CodexBinarySource;
}

function isExecutableFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform !== 'win32') {
      fs.accessSync(filePath, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
}

function resolveCodexFromPath(env: NodeJS.ProcessEnv = process.env): CodexBinaryInfo | null {
  const pathEntries = (env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, process.platform === 'win32' ? 'codex.exe' : 'codex');
    if (isExecutableFile(candidate)) {
      return { path: candidate, source: 'path' };
    }
    if (process.platform === 'win32') {
      const cmdCandidate = path.join(entry, 'codex.cmd');
      if (isExecutableFile(cmdCandidate)) {
        return { path: cmdCandidate, source: 'path' };
      }
    }
  }
  return null;
}

export function codexRuntimeRoot(env: NodeJS.ProcessEnv): string {
  const override = env.OPL_RUNTIME_ROOT?.trim();
  if (override) return path.resolve(override);
  const home = resolveHomeDir(env);
  if (process.platform === 'darwin') return path.resolve(home, 'Library', 'Application Support', 'OPL', 'runtime');
  if (process.platform === 'win32') {
    return path.resolve(env.LOCALAPPDATA?.trim() || path.join(home, 'AppData', 'Local'), 'OPL', 'runtime');
  }
  return path.resolve(env.XDG_STATE_HOME?.trim() || path.join(home, '.local', 'state'), 'opl', 'runtime');
}

export function managedCodexBinary(env: NodeJS.ProcessEnv): string {
  return path.join(codexRuntimeRoot(env), 'current', 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
}

export function resolveCodexFromRuntime(env: NodeJS.ProcessEnv = process.env): CodexBinaryInfo | null {
  const candidate = managedCodexBinary(env);
  if (!isExecutableFile(candidate)) return null;
  return { path: candidate, source: 'runtime' };
}

export function resolveCodexBinary(
  explicitBinaryPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): CodexBinaryInfo | null {
  const explicit = explicitBinaryPath?.trim();
  if (explicit) {
    if (!isExecutableFile(explicit)) {
      throw new RunwayError(
        'EXECUTOR_UNAVAILABLE',
        `Configured Codex binary '${explicit}' does not exist or is not executable.`,
        { codex_binary: explicit, source: 'explicit' },
      );
    }
    return { path: explicit, source: 'explicit' };
  }

  const envCandidate = env.OPL_CODEX_BIN?.trim();
  if (envCandidate) {
    if (!isExecutableFile(envCandidate)) {
      throw new RunwayError(
        'EXECUTOR_UNAVAILABLE',
        'OPL_CODEX_BIN is set but does not point to an executable Codex binary.',
        { codex_binary: envCandidate, env_var: 'OPL_CODEX_BIN' },
      );
    }
    return { path: envCandidate, source: 'env' };
  }

  return resolveCodexFromPath(env) ?? resolveCodexFromRuntime(env);
}
