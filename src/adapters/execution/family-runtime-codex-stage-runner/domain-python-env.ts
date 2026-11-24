import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { resolveDomainPythonCommand } from '../domain-helper-runtime.ts';
import { isRecord, type JsonRecord } from './shared.ts';

const FRAMEWORK_PYTHON_ROOT = path.resolve(import.meta.dirname, '../../../../python');

function domainPackSourceRoot(attempt: JsonRecord) {
  const locator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  const packRoot = optionalString(attempt.domain_pack_root) ?? optionalString(locator.domain_pack_root);
  if (!packRoot) return null;
  const srcRoot = path.resolve(packRoot, 'src');
  return fs.existsSync(srcRoot) && fs.statSync(srcRoot).isDirectory() ? srcRoot : null;
}

function minimumPython(sourceRoot: string) {
  const project = path.join(sourceRoot, '..', 'pyproject.toml');
  const declaration = fs.existsSync(project) ? fs.readFileSync(project, 'utf8') : '';
  const match = /requires-python\s*=\s*["']>=\s*(\d+)\.(\d+)/.exec(declaration);
  return match ? [Number(match[1]), Number(match[2])] : [3, 11];
}

function pythonBin(command: string, args: string[], env: NodeJS.ProcessEnv, minimum: number[]) {
  const probe = spawnSync(command, [...args, '-c',
    'import json,sys; print(json.dumps({"executable":sys.executable,"version":list(sys.version_info[:2])}))',
  ], { env, encoding: 'utf8', timeout: 2000 });
  if (probe.status !== 0) return null;
  try {
    const result = JSON.parse(probe.stdout);
    if (result.version[0] < minimum[0]! || (result.version[0] === minimum[0]! && result.version[1] < minimum[1]!)) return null;
    const dir = path.dirname(result.executable);
    // Codex authors invoke python3. A configured versioned command must also expose
    // a callable, compatible python3 in its bin directory; a directory name is no proof.
    const python3 = path.join(dir, process.platform === 'win32' ? 'python3.exe' : 'python3');
    const alias = spawnSync(python3, ['-c', `import sys; raise SystemExit(0 if sys.version_info[:2] >= (${minimum.join(',')}) else 1)`],
      { env, encoding: 'utf8', timeout: 2000 });
    return alias.status === 0 ? dir : null;
  } catch { return null; }
}

function resolvePythonBinDir(env: NodeJS.ProcessEnv, minimum: number[]) {
  if (env.OPL_DOMAIN_PYTHON_COMMAND?.trim() || env.OPL_MANAGED_PYTHON?.trim()) {
    const selected = resolveDomainPythonCommand({ env });
    if (env.OPL_MANAGED_PYTHON?.trim() && !env.OPL_DOMAIN_PYTHON_COMMAND?.trim()
      && selected.source !== 'managed_runtime') {
      throw new FrameworkContractError('surface_not_found', 'Configured domain Python is unavailable.', { fallback_allowed: false });
    }
    const dir = pythonBin(selected.command, selected.args, env, minimum);
    if (dir) return dir;
    throw new FrameworkContractError('surface_not_found', 'Configured domain Python cannot expose a compatible python3.', {
      minimum_python: minimum.join('.'), fallback_allowed: false,
    });
  }
  const installDir = optionalString(env.UV_PYTHON_INSTALL_DIR)
    ?? path.join(optionalString(env.HOME) ?? os.homedir(), '.local', 'share', 'uv', 'python');
  const managed = fs.existsSync(installDir) ? fs.readdirSync(installDir).sort().reverse()
    .map((entry) => path.join(installDir, entry, 'bin', 'python3')) : [];
  // Keep a compatible inherited environment and its installed packages; uv is recovery only.
  for (const command of ['python3', ...managed]) {
    const dir = pythonBin(command, [], env, minimum);
    if (dir) return dir;
  }
  throw new FrameworkContractError('surface_not_found', 'Domain Stage requires a compatible Python runtime.', {
    minimum_python: minimum.join('.'), fallback_installer_in_domain_repo: false,
  });
}

export function domainPythonEnvironment(input: {
  attempt: JsonRecord;
  env?: NodeJS.ProcessEnv;
}): Record<string, string | undefined> {
  const sourceRoot = domainPackSourceRoot(input.attempt);
  if (!sourceRoot || !fs.existsSync(path.join(FRAMEWORK_PYTHON_ROOT, 'opl_framework'))) return {};
  const env = { ...process.env, ...(input.env ?? {}) };
  const pythonBinDir = resolvePythonBinDir(env, minimumPython(sourceRoot));
  return {
    PYTHONPATH: [...new Set([sourceRoot, FRAMEWORK_PYTHON_ROOT, ...(env.PYTHONPATH ?? '').split(path.delimiter)].filter(Boolean))].join(path.delimiter),
    PYTHONDONTWRITEBYTECODE: env.PYTHONDONTWRITEBYTECODE ?? '1',
    PATH: [pythonBinDir, ...(env.PATH ?? '').split(path.delimiter).filter((entry) => entry && entry !== pythonBinDir)].join(path.delimiter),
  };
}

export const __testing = { FRAMEWORK_PYTHON_ROOT, domainPackSourceRoot, resolvePythonBinDir };
