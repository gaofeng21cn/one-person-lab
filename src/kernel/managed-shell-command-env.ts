import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from './contract-validation.ts';
import { optionalString, readJsonFileOrNull, readJsonPayloadFile } from './json-file.ts';

const UV_CACHE_RECOVERY_MARKER = 'uv-cache-archive-missing.recovery.json';
type ManagedShellRecoveryTrigger = 'uv_cache_archive_missing' | 'managed_python_env_missing_dependency';
const MANAGED_SHELL_RECOVERY_TRIGGERS = new Set<string>([
  'uv_cache_archive_missing',
  'managed_python_env_missing_dependency',
]);
const DOMAIN_CLEAN_RUNNER_PROFILE_ROLE = 'domain_compatibility_clean_runner' as const;
const AGENT_PACKAGE_DESCRIPTOR_DIR = fileURLToPath(
  new URL('../../contracts/opl-framework/agent-packages/', import.meta.url),
);

export type DomainCleanRunnerProfile = {
  domainId: string;
  profileRole: typeof DOMAIN_CLEAN_RUNNER_PROFILE_ROLE;
  legacyEnvRoots: ReadonlyArray<{
    envName: string;
    fallbackSubdir: string;
  }>;
  readOnlyCommandPatterns: ReadonlyArray<RegExp>;
};

export type DomainCleanRunnerProfileRegistry = {
  profiles: ReadonlyArray<DomainCleanRunnerProfile>;
};

function cleanRunnerDescriptorError(sourceRef: string, field: string, message: string) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    contract_ref: sourceRef,
    field,
  });
}

function requireProfileString(value: unknown, field: string, sourceRef: string) {
  const text = optionalString(value);
  if (!text) {
    throw cleanRunnerDescriptorError(
      sourceRef,
      field,
      `Managed shell clean-runner profile must declare ${field}.`,
    );
  }
  return text;
}

function requireProfileRecordList(value: unknown, field: string, sourceRef: string) {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw cleanRunnerDescriptorError(
      sourceRef,
      field,
      `Managed shell clean-runner profile ${field} must be an object array.`,
    );
  }
  return value;
}

function compileReadOnlyCommandPattern(value: unknown, sourceRef: string, index: number) {
  if (!isRecord(value)) {
    throw cleanRunnerDescriptorError(
      sourceRef,
      `managed_shell.clean_runner_profile.read_only_command_patterns[${index}]`,
      'Managed shell clean-runner read-only command pattern must be an object.',
    );
  }
  const field = `managed_shell.clean_runner_profile.read_only_command_patterns[${index}].regex`;
  const regex = requireProfileString(value.regex, field, sourceRef);
  const flags = optionalString(value.flags);
  return new RegExp(regex, flags ?? undefined);
}

function normalizeCleanRunnerProfileFromDescriptor(
  descriptor: Record<string, unknown>,
  sourceRef: string,
): DomainCleanRunnerProfile | null {
  const managedShell = isRecord(descriptor.managed_shell) ? descriptor.managed_shell : null;
  const cleanRunnerProfile = managedShell && isRecord(managedShell.clean_runner_profile)
    ? managedShell.clean_runner_profile
    : null;
  if (!cleanRunnerProfile) {
    return null;
  }
  if (cleanRunnerProfile.profile_role !== DOMAIN_CLEAN_RUNNER_PROFILE_ROLE) {
    throw cleanRunnerDescriptorError(
      sourceRef,
      'managed_shell.clean_runner_profile.profile_role',
      `Managed shell clean-runner profile_role must be ${DOMAIN_CLEAN_RUNNER_PROFILE_ROLE}.`,
    );
  }

  const legacyEnvRoots = requireProfileRecordList(
    cleanRunnerProfile.legacy_env_roots,
    'managed_shell.clean_runner_profile.legacy_env_roots',
    sourceRef,
  ).map((root, index) => ({
    envName: requireProfileString(
      root.env_name,
      `managed_shell.clean_runner_profile.legacy_env_roots[${index}].env_name`,
      sourceRef,
    ),
    fallbackSubdir: requireProfileString(
      root.fallback_subdir,
      `managed_shell.clean_runner_profile.legacy_env_roots[${index}].fallback_subdir`,
      sourceRef,
    ),
  }));
  const readOnlyCommandPatterns = requireProfileRecordList(
    cleanRunnerProfile.read_only_command_patterns ?? [],
    'managed_shell.clean_runner_profile.read_only_command_patterns',
    sourceRef,
  ).map((pattern, index) => compileReadOnlyCommandPattern(pattern, sourceRef, index));

  return {
    domainId: optionalString(cleanRunnerProfile.domain_id)
      ?? requireProfileString(descriptor.agent_id, 'agent_id', sourceRef),
    profileRole: DOMAIN_CLEAN_RUNNER_PROFILE_ROLE,
    legacyEnvRoots,
    readOnlyCommandPatterns,
  };
}

export function loadDomainCleanRunnerProfilesFromAgentPackageDescriptors(
  descriptorDir = AGENT_PACKAGE_DESCRIPTOR_DIR,
): ReadonlyArray<DomainCleanRunnerProfile> {
  return fs.readdirSync(descriptorDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .flatMap((fileName) => {
      const sourceRef = `contracts/opl-framework/agent-packages/${fileName}`;
      const descriptor = readJsonPayloadFile(path.join(descriptorDir, fileName));
      if (!isRecord(descriptor)) {
        throw cleanRunnerDescriptorError(sourceRef, '<root>', 'Agent package descriptor must be a JSON object.');
      }
      const profile = normalizeCleanRunnerProfileFromDescriptor(descriptor, sourceRef);
      return profile ? [profile] : [];
    });
}

const DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILES: ReadonlyArray<DomainCleanRunnerProfile> =
  loadDomainCleanRunnerProfilesFromAgentPackageDescriptors();

export const DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY: DomainCleanRunnerProfileRegistry = {
  profiles: DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILES,
};

export function createDomainCleanRunnerProfileRegistry(
  extraProfiles: ReadonlyArray<DomainCleanRunnerProfile> = [],
): DomainCleanRunnerProfileRegistry {
  return {
    profiles: [
      ...DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY.profiles,
      ...extraProfiles,
    ],
  };
}

function domainCleanRunnerProfiles(registry = DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY) {
  return registry.profiles;
}

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

function buildDomainCleanRunnerEnv(
  env: NodeJS.ProcessEnv,
  cwd: string,
  tmpRoot: string,
  registry = DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY,
) {
  const nextEnv: Record<string, string> = {};
  for (const profile of domainCleanRunnerProfiles(registry)) {
    for (const root of profile.legacyEnvRoots) {
      nextEnv[root.envName] = externalPath(
        env,
        cwd,
        root.envName,
        path.join(tmpRoot, root.fallbackSubdir),
      );
    }
  }
  return nextEnv;
}

export function buildManagedShellCommandEnv(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  registry = DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY,
) {
  const workspaceId = stableWorkspaceId(cwd);
  const tmpRoot = workspaceScopedExternalRoot(env, cwd, workspaceId);
  const pycacheRoot = path.join(tmpRoot, 'pycache');
  const uvProjectEnvironment = path.join(tmpRoot, 'uv-project');
  const uvCacheDir = path.join(tmpRoot, 'uv-cache');
  const xdgCacheHome = path.join(tmpRoot, 'xdg-cache');
  const pipCacheDir = path.join(tmpRoot, 'pip-cache');
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
    ...buildDomainCleanRunnerEnv(env, cwd, tmpRoot, registry),
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

export function shouldUseManagedShellScratchCwd(
  command: string | null | undefined,
  registry = DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY,
) {
  const value = command?.trim();
  if (!value) {
    return false;
  }

  if (isNativeIsolatedProjectCommand(value) || isReadOnlyProductEntryCommand(value, registry)) {
    return false;
  }

  return Boolean(value.match(/(?:^|[;&|]\s*)uv\s+run\b/));
}

function isNativeIsolatedProjectCommand(command: string) {
  const normalized = command.replace(/\s+/g, ' ');
  return /(?:^|[;&|]\s*)uv\s+run\s+--isolated\s+--frozen\s+--project\s+(?:'[^']*'|"[^"]*"|\S+)\s+python\s+-c\b/.test(normalized);
}

function isReadOnlyProductEntryCommand(
  command: string,
  registry = DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY,
) {
  const normalized = command.replace(/\s+/g, ' ');
  return domainCleanRunnerProfiles(registry).some((profile) => profile.readOnlyCommandPatterns.some(
    (pattern) => pattern.test(normalized),
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
  registry = DEFAULT_DOMAIN_CLEAN_RUNNER_PROFILE_REGISTRY,
): ManagedShellCommandCwd {
  if (!shouldUseManagedShellScratchCwd(command, registry)) {
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
