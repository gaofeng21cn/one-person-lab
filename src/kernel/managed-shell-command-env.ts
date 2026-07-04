import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { isRecord } from './contract-validation.ts';
import { readJsonFileOrNull } from './json-file.ts';

const UV_CACHE_RECOVERY_MARKER = 'uv-cache-archive-missing.recovery.json';
type ManagedShellRecoveryTrigger = 'uv_cache_archive_missing' | 'managed_python_env_missing_dependency';
const MANAGED_SHELL_RECOVERY_TRIGGERS = new Set<string>([
  'uv_cache_archive_missing',
  'managed_python_env_missing_dependency',
]);

function normalizePath(value: string) {
  return path.resolve(value);
}

function isInsidePath(root: string, value: string) {
  const relative = path.relative(normalizePath(root), normalizePath(value));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stableWorkspaceId(cwd: string) {
  return path.basename(path.resolve(cwd)).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

function workspaceScopedExternalRoot(
  env: NodeJS.ProcessEnv,
  cwd: string,
  workspaceId: string,
) {
  const configuredRoot = env.OPL_DOMAIN_COMMAND_TMP_ROOT?.trim();
  const baseRoot = configuredRoot && !isInsidePath(cwd, configuredRoot)
    ? configuredRoot
    : path.join(os.tmpdir(), 'opl-domain-command');
  const normalizedBase = normalizePath(baseRoot);
  return path.basename(normalizedBase) === workspaceId
    ? normalizedBase
    : path.join(normalizedBase, workspaceId);
}

function externalPath(env: NodeJS.ProcessEnv, cwd: string, name: string, fallback: string) {
  const value = env[name]?.trim();
  if (value && !isInsidePath(cwd, value)) {
    return value;
  }
  return fallback;
}

function stripPytestCacheOptions(existing: string | undefined) {
  const tokens = existing?.trim().split(/\s+/).filter(Boolean) ?? [];
  const stripped: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === '--cache-dir') {
      index += 1;
      continue;
    }
    if (token.startsWith('--cache-dir=')) {
      continue;
    }
    if (token === '-o' && next?.startsWith('cache_dir=')) {
      index += 1;
      continue;
    }
    if (token.startsWith('cache_dir=')) {
      continue;
    }
    stripped.push(token);
  }

  return stripped.join(' ');
}

function appendPytestCacheOption(existing: string | undefined, cacheDir: string) {
  const normalized = stripPytestCacheOptions(existing);
  const cacheOption = `-o cache_dir=${cacheDir}`;
  const noCacheProvider = '-p no:cacheprovider';
  const parts = [
    normalized,
    normalized?.includes('-p no:cacheprovider') ? '' : noCacheProvider,
    cacheOption,
  ].filter(Boolean);

  return parts.join(' ');
}

export function buildManagedShellCommandEnv(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const workspaceId = stableWorkspaceId(cwd);
  const tmpRoot = workspaceScopedExternalRoot(env, cwd, workspaceId);
  const pycacheRoot = path.join(tmpRoot, 'pycache');
  const uvProjectEnvironment = path.join(tmpRoot, 'uv-project');
  const uvCacheDir = path.join(tmpRoot, 'uv-cache');
  const xdgCacheHome = path.join(tmpRoot, 'xdg-cache');
  const pipCacheDir = path.join(tmpRoot, 'pip-cache');
  const masCleanRunnerRoot = externalPath(env, cwd, 'MAS_CLEAN_RUNNER_TMP_ROOT', path.join(tmpRoot, 'mas'));
  const magCleanRunnerRoot = externalPath(env, cwd, 'MAG_CLEAN_RUNNER_TMP_ROOT', path.join(tmpRoot, 'mag'));
  const rcaCleanRunnerRoot = externalPath(env, cwd, 'RCA_CLEAN_RUNNER_TMP_ROOT', path.join(tmpRoot, 'rca'));
  const magEditableSharedRoot = externalPath(
    env,
    cwd,
    'MED_AUTOGRANT_EDITABLE_SHARED_ENV_ROOT',
    path.join(tmpRoot, 'mag-editable-shared'),
  );
  const pytestCacheDir = path.join(tmpRoot, 'pytest-cache');

  return {
    ...env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: pycacheRoot,
    UV_PROJECT_ENVIRONMENT: uvProjectEnvironment,
    UV_CACHE_DIR: uvCacheDir,
    XDG_CACHE_HOME: xdgCacheHome,
    PIP_CACHE_DIR: pipCacheDir,
    OPL_DOMAIN_COMMAND_TMP_ROOT: tmpRoot,
    MAS_CLEAN_RUNNER_TMP_ROOT: masCleanRunnerRoot,
    MAG_CLEAN_RUNNER_TMP_ROOT: magCleanRunnerRoot,
    RCA_CLEAN_RUNNER_TMP_ROOT: rcaCleanRunnerRoot,
    MED_AUTOGRANT_EDITABLE_SHARED_ENV_ROOT: magEditableSharedRoot,
    PYTEST_ADDOPTS: appendPytestCacheOption(env.PYTEST_ADDOPTS, pytestCacheDir),
  };
}

export function buildManagedShellRecoveryTmpRoot(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const workspaceId = stableWorkspaceId(cwd);
  const baseEnv = buildManagedShellCommandEnv(cwd, env);
  return path.join(baseEnv.OPL_DOMAIN_COMMAND_TMP_ROOT, 'recovery', workspaceId);
}

function managedShellUvCacheRecoveryMarkerPath(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return path.join(buildManagedShellCommandEnv(cwd, env).OPL_DOMAIN_COMMAND_TMP_ROOT, UV_CACHE_RECOVERY_MARKER);
}

function parseManagedShellUvCacheRecoveryMarker(cwd: string, markerPath: string) {
  try {
    const record = readJsonFileOrNull(markerPath);
    if (!isRecord(record)) {
      return null;
    }
    if (
      record.surface_kind !== 'opl_managed_shell_uv_cache_recovery_marker'
      || typeof record.trigger_kind !== 'string'
      || !MANAGED_SHELL_RECOVERY_TRIGGERS.has(record.trigger_kind)
      || typeof record.recovery_tmp_root !== 'string'
      || isInsidePath(cwd, record.recovery_tmp_root)
    ) {
      return null;
    }
    return normalizePath(record.recovery_tmp_root);
  } catch {
    return null;
  }
}

export function buildManagedShellEnvWithUvCacheRecovery(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const markerPath = managedShellUvCacheRecoveryMarkerPath(cwd, env);
  const recoveryTmpRoot = parseManagedShellUvCacheRecoveryMarker(cwd, markerPath);
  return recoveryTmpRoot
    ? { ...env, OPL_DOMAIN_COMMAND_TMP_ROOT: recoveryTmpRoot }
    : env;
}

export function recordManagedShellUvCacheRecovery(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  recovery: {
    triggerKind?: ManagedShellRecoveryTrigger;
    recoveryTmpRoot: string;
    firstExitCode: number;
    retryExitCode: number;
    firstErrorExcerpt: string;
  },
) {
  const markerPath = managedShellUvCacheRecoveryMarkerPath(cwd, env);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${JSON.stringify({
    surface_kind: 'opl_managed_shell_uv_cache_recovery_marker',
    trigger_kind: recovery.triggerKind ?? 'uv_cache_archive_missing',
    recovery_tmp_root: normalizePath(recovery.recoveryTmpRoot),
    first_exit_code: recovery.firstExitCode,
    retry_exit_code: recovery.retryExitCode,
    first_error_excerpt: recovery.firstErrorExcerpt,
    recorded_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

export function shouldUseManagedShellScratchCwd(command: string | null | undefined) {
  const value = command?.trim();
  if (!value) {
    return false;
  }

  if (isReadOnlyProductEntryCommand(value)) {
    return false;
  }

  return Boolean(value.match(/(?:^|[;&|]\s*)uv\s+run\b/));
}

function isReadOnlyProductEntryCommand(command: string) {
  const normalized = command.replace(/\s+/g, ' ');
  if (normalized.match(
    /(?:^|(?:&&|\|\||[;&|])\s*)uv\s+run\s+(?:(?:python|python3)\s+-m\s+[\w.-]+\s+|[\w.-]+\s+)product\s+(?:manifest|status)\b/,
  )) {
    return true;
  }

  if (normalized.match(
    /(?:^|(?:&&|\|\||[;&|])\s*)uv\s+run\s+(?:python|python3)\s+-m\s+med_autoscience\.cli\s+study-state-matrix\b/,
  )) {
    return true;
  }

  return Boolean(normalized.match(
    /(?:^|(?:&&|\|\||[;&|])\s*)uv\s+run\s+--directory\s+\S+\s+(?:python|python3)\s+-c\s+.*(?:med_autoscience\.controllers\.product_entry|med_autogrant\.product_entry)/,
  ));
}

function buildManagedShellScratchCwd(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return path.join(
    buildManagedShellCommandEnv(cwd, env).OPL_DOMAIN_COMMAND_TMP_ROOT,
    'source-scratch-',
  );
}

export type ManagedShellCommandCwd = {
  cwd: string;
  cleanup: () => void;
};

export function prepareManagedShellCommandCwd(
  cwd: string,
  command: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ManagedShellCommandCwd {
  if (!shouldUseManagedShellScratchCwd(command)) {
    return {
      cwd,
      cleanup: () => {},
    };
  }

  const scratchPrefix = buildManagedShellScratchCwd(cwd, env);
  fs.mkdirSync(path.dirname(scratchPrefix), { recursive: true });
  const scratchCwd = fs.mkdtempSync(scratchPrefix);
  fs.cpSync(cwd, scratchCwd, {
    recursive: true,
    dereference: true,
    filter: (source) => shouldCopyToManagedShellScratch(cwd, source),
  });
  return {
    cwd: scratchCwd,
    cleanup: () => fs.rmSync(scratchCwd, { recursive: true, force: true }),
  };
}

function shouldCopyToManagedShellScratch(cwd: string, sourcePath: string) {
  const relative = path.relative(cwd, sourcePath);
  if (!relative) {
    return true;
  }

  return !relative.split(path.sep).some((part) => [
    '.venv',
    '.worktrees',
    '.pytest_cache',
    '__pycache__',
    'build',
    'dist',
    'node_modules',
  ].includes(part) || part.endsWith('.egg-info'));
}
