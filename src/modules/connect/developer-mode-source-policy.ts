import { spawnSync } from 'node:child_process';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { OplDeveloperSupervisorConfigFile } from '../../kernel/system-preferences.ts';
import { readOplDeveloperSupervisorConfig } from '../../kernel/system-preferences.ts';

export type DeveloperModeGithubIdentityStatus = 'ready' | 'unavailable' | 'skipped';
export type DeveloperModeGithubIdentitySource = 'gh_cli' | 'env_fixture' | 'not_checked';

export type DeveloperModeGithubIdentityProjection = {
  status: DeveloperModeGithubIdentityStatus;
  login: string | null;
  source: DeveloperModeGithubIdentitySource;
  reason: string | null;
};

export type DeveloperModeGhFixture = {
  user?: unknown;
  login?: unknown;
  permissions?: unknown;
};

const DIRECT_WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

let cachedIdentity: {
  key: string;
  value: DeveloperModeGithubIdentityProjection;
} | null = null;

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePermission(value: unknown) {
  return normalizeOptionalString(value)?.toLowerCase() ?? null;
}

function parseJsonRecord(raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = parseJsonText(trimmed);
    if (isRecord(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function parseGithubRepoFromUrl(repoUrl: string) {
  const normalized = repoUrl.trim();
  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const sshUrlMatch = normalized.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshUrlMatch) {
    return `${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  return null;
}

export function readDeveloperModeGhFixture(): DeveloperModeGhFixture | null {
  const parsed = parseJsonRecord(process.env.OPL_DEVELOPER_MODE_GH_FIXTURE);
  return parsed ? parsed as DeveloperModeGhFixture : null;
}

function readFixtureLogin(fixture: DeveloperModeGhFixture | null) {
  const explicitIdentity = process.env.OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE?.trim();
  if (explicitIdentity) {
    const parsed = parseJsonRecord(explicitIdentity);
    if (parsed) {
      return normalizeOptionalString(parsed.login);
    }
    return explicitIdentity;
  }

  if (!fixture) {
    return null;
  }

  const directLogin = normalizeOptionalString(fixture.login);
  if (directLogin) {
    return directLogin;
  }

  if (typeof fixture.user === 'string') {
    return normalizeOptionalString(fixture.user);
  }

  if (typeof fixture.user === 'object' && fixture.user !== null && !Array.isArray(fixture.user)) {
    return normalizeOptionalString((fixture.user as Record<string, unknown>).login);
  }

  return null;
}

function readFixturePermission(fixture: DeveloperModeGhFixture | null, repo: string) {
  const explicitPermissions = parseJsonRecord(process.env.OPL_DEVELOPER_MODE_REPO_PERMISSIONS_FIXTURE);
  const source = explicitPermissions ?? (
    typeof fixture?.permissions === 'object' && fixture.permissions !== null && !Array.isArray(fixture.permissions)
      ? fixture.permissions as Record<string, unknown>
      : null
  );
  if (!source || !(repo in source)) {
    return null;
  }

  const value = source[repo];
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return normalizePermission((value as Record<string, unknown>).permission);
  }

  return normalizePermission(value);
}

function readGhTimeoutMs() {
  const parsed = Number.parseInt(process.env.OPL_DEVELOPER_MODE_GH_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 10_000);
  }
  return 5_000;
}

function runGhApi(args: string[]) {
  const ghBinary = process.env.OPL_DEVELOPER_MODE_GH_BINARY?.trim() || 'gh';
  const result = spawnSync(ghBinary, ['api', ...args], {
    encoding: 'utf8',
    env: process.env,
    timeout: readGhTimeoutMs(),
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    return {
      status: 'unavailable' as const,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      reason: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      status: 'unavailable' as const,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      reason: (result.stderr ?? '').trim() || `gh exited with code ${result.status ?? 1}`,
    };
  }

  return {
    status: 'ready' as const,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    reason: null,
  };
}

function identityCacheKey() {
  return [
    process.env.OPL_DEVELOPER_MODE_GH_FIXTURE ?? '',
    process.env.OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE ?? '',
    process.env.OPL_DEVELOPER_MODE_GH_BINARY ?? '',
    process.env.OPL_DEVELOPER_MODE_GH_TIMEOUT_MS ?? '',
  ].join('\0');
}

export function detectDeveloperModeGithubIdentity(
  fixture: DeveloperModeGhFixture | null = readDeveloperModeGhFixture(),
): DeveloperModeGithubIdentityProjection {
  const fixtureLogin = readFixtureLogin(fixture);
  if (fixtureLogin) {
    return {
      status: 'ready',
      login: fixtureLogin,
      source: 'env_fixture',
      reason: null,
    };
  }

  const key = identityCacheKey();
  if (cachedIdentity?.key === key) {
    return cachedIdentity.value;
  }

  const result = runGhApi(['user']);
  const identity: DeveloperModeGithubIdentityProjection = (() => {
    if (result.status !== 'ready') {
      return {
        status: 'unavailable',
        login: null,
        source: 'gh_cli',
        reason: result.reason,
      };
    }

    const parsed = parseJsonRecord(result.stdout);
    const login = parsed ? normalizeOptionalString(parsed.login) : null;
    if (!login) {
      return {
        status: 'unavailable',
        login: null,
        source: 'gh_cli',
        reason: 'gh api user did not return a login.',
      };
    }

    return {
      status: 'ready',
      login,
      source: 'gh_cli',
      reason: null,
    };
  })();

  cachedIdentity = { key, value: identity };
  return identity;
}

export function readDeveloperModeRepoPermission(
  repo: string,
  login: string,
  fixture: DeveloperModeGhFixture | null = readDeveloperModeGhFixture(),
) {
  const fixturePermission = readFixturePermission(fixture, repo);
  if (fixturePermission) {
    return {
      status: 'ready' as const,
      permission: fixturePermission,
      reason: null,
    };
  }

  const result = runGhApi([
    `repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
  ]);
  if (result.status !== 'ready') {
    return {
      status: 'unavailable' as const,
      permission: null,
      reason: result.reason,
    };
  }

  const parsed = parseJsonRecord(result.stdout);
  const permission = parsed ? normalizePermission(parsed.permission) : null;
  if (!permission) {
    return {
      status: 'unavailable' as const,
      permission: null,
      reason: 'gh permission response did not include a permission.',
    };
  }

  return {
    status: 'ready' as const,
    permission,
    reason: null,
  };
}

export function permissionAllowsDeveloperModeDirectWrite(permission: string | null) {
  return Boolean(permission && DIRECT_WRITE_PERMISSIONS.has(permission));
}

export function developerModePrefersLocalCheckouts(
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
) {
  if (config.enabled === 'off') {
    return false;
  }
  if (config.enabled === 'on') {
    return true;
  }

  const identity = detectDeveloperModeGithubIdentity();
  return identity.status === 'ready' && identity.login === config.auto_enable_github_login;
}
