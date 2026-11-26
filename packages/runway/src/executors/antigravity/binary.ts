import fs from 'node:fs';
import path from 'node:path';
import { RunwayError } from '../../errors.ts';

export type AgyBinarySource = 'explicit' | 'env' | 'path';

export interface AgyBinaryInfo {
  readonly path: string;
  readonly source: AgyBinarySource;
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

export function resolveAgyBinary(
  explicitBinaryPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): AgyBinaryInfo | null {
  const explicit = explicitBinaryPath?.trim();
  if (explicit) {
    if (!isExecutableFile(explicit)) {
      throw new RunwayError(
        'EXECUTOR_UNAVAILABLE',
        `Configured Antigravity binary '${explicit}' does not exist or is not executable.`,
        { agy_binary: explicit, source: 'explicit' },
      );
    }
    return { path: explicit, source: 'explicit' };
  }

  const envCandidate = env.OPL_AGY_BIN?.trim();
  if (envCandidate) {
    if (!isExecutableFile(envCandidate)) {
      throw new RunwayError(
        'EXECUTOR_UNAVAILABLE',
        'OPL_AGY_BIN is set but does not point to an executable Antigravity binary.',
        { agy_binary: envCandidate, env_var: 'OPL_AGY_BIN' },
      );
    }
    return { path: envCandidate, source: 'env' };
  }

  const pathEntries = (env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, process.platform === 'win32' ? 'agy.exe' : 'agy');
    if (isExecutableFile(candidate)) {
      return { path: candidate, source: 'path' };
    }
    if (process.platform === 'win32') {
      const cmdCandidate = path.join(entry, 'agy.cmd');
      if (isExecutableFile(cmdCandidate)) {
        return { path: cmdCandidate, source: 'path' };
      }
    }
  }
  return null;
}

export function parseAgyModelsOutput(stdout: string): Array<{ readonly id: string; readonly label: string }> {
  const models: Array<{ readonly id: string; readonly label: string }> = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Fetching')) continue;
    const parts = line.split(/\t+/);
    const id = (parts[0] ?? '').trim();
    if (!id || !/^[a-z0-9][a-z0-9._-]+$/i.test(id)) continue;
    const label = (parts[1] ?? id).trim();
    models.push({ id, label });
  }
  return models;
}
