import { spawnSync } from 'node:child_process';

import type { OplDeveloperSupervisorConfigFile } from './system-preferences.ts';
import { readOplDeveloperSupervisorConfig } from './system-preferences.ts';
import { listDefaultOplDomainModuleSpecs } from './system-installation/modules.ts';

type DeveloperModeStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'inactive';
type DeveloperModeEffectiveState =
  | 'active_direct'
  | 'active_pr_only'
  | 'active_mixed_routes'
  | 'blocked'
  | 'disabled'
  | 'inactive_auto_identity_mismatch'
  | 'observe_only';
type DeveloperModeAllowedRoute =
  | 'direct_repo_fix'
  | 'fork_pull_request'
  | 'mixed_direct_and_pr'
  | 'observe_only'
  | 'blocked'
  | 'disabled';
type GithubIdentityStatus = 'ready' | 'unavailable' | 'skipped';
type GithubIdentitySource = 'gh_cli' | 'env_fixture' | 'not_checked';
type RepoAuthorityStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'not_checked';
type RepoTargetSource = 'opl_framework_constant' | 'domain_module_spec';

type GithubIdentityProjection = {
  status: GithubIdentityStatus;
  login: string | null;
  source: GithubIdentitySource;
  reason: string | null;
};

type RepoAuthorityTarget = {
  target_id: string;
  label: string;
  repo: string;
  repo_url: string;
  source: RepoTargetSource;
};

type RepoAuthorityProjection = RepoAuthorityTarget & {
  status: RepoAuthorityStatus;
  permission: string | null;
  direct_write_allowed: boolean;
  allowed_route: DeveloperModeAllowedRoute;
  reason: string | null;
};

type RepoAuthoritySummary = {
  status: RepoAuthorityStatus;
  required_repo_count: number;
  direct_write_repo_count: number;
  pr_route_repo_count: number;
  blocked_repo_count: number;
  repos: RepoAuthorityProjection[];
};

export type OplDeveloperModeProjection = {
  surface_id: 'opl_developer_mode';
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  effective_state: DeveloperModeEffectiveState;
  mode: OplDeveloperSupervisorConfigFile['mode'];
  config_source: OplDeveloperSupervisorConfigFile['source'];
  auto_enable_github_login: string;
  allowed_route: DeveloperModeAllowedRoute;
  github_identity: GithubIdentityProjection;
  repo_authority: RepoAuthoritySummary;
};

type GhFixture = {
  user?: unknown;
  login?: unknown;
  permissions?: unknown;
};

const OPL_FRAMEWORK_REPO_TARGET: RepoAuthorityTarget = {
  target_id: 'opl_framework',
  label: 'One Person Lab Framework',
  repo: 'gaofeng21cn/one-person-lab',
  repo_url: 'https://github.com/gaofeng21cn/one-person-lab.git',
  source: 'opl_framework_constant',
};

const DIRECT_WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePermission(value: unknown) {
  const permission = normalizeOptionalString(value)?.toLowerCase() ?? null;
  return permission;
}

function parseJsonRecord(raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function parseGithubRepoFromUrl(repoUrl: string) {
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

function readGhFixture(): GhFixture | null {
  const parsed = parseJsonRecord(process.env.OPL_DEVELOPER_MODE_GH_FIXTURE);
  return parsed ? parsed as GhFixture : null;
}

function readFixtureLogin(fixture: GhFixture | null) {
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

function readFixturePermission(fixture: GhFixture | null, repo: string) {
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

function detectGithubIdentity(fixture: GhFixture | null): GithubIdentityProjection {
  const fixtureLogin = readFixtureLogin(fixture);
  if (fixtureLogin) {
    return {
      status: 'ready',
      login: fixtureLogin,
      source: 'env_fixture',
      reason: null,
    };
  }

  const result = runGhApi(['user']);
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
}

function buildRepoTargets(): RepoAuthorityTarget[] {
  return [
    OPL_FRAMEWORK_REPO_TARGET,
    ...listDefaultOplDomainModuleSpecs().map((entry) => {
      const repo = parseGithubRepoFromUrl(entry.repo_url);
      return {
        target_id: entry.module_id,
        label: entry.label,
        repo: repo ?? `unknown/${entry.repo_name}`,
        repo_url: entry.repo_url,
        source: 'domain_module_spec' as const,
      };
    }),
  ];
}

function buildDisabledRepoAuthority(status: RepoAuthorityStatus, reason: string): RepoAuthoritySummary {
  const targets = buildRepoTargets();
  return {
    status,
    required_repo_count: targets.length,
    direct_write_repo_count: 0,
    pr_route_repo_count: 0,
    blocked_repo_count: status === 'blocked' ? targets.length : 0,
    repos: targets.map((target) => ({
      ...target,
      status,
      permission: null,
      direct_write_allowed: false,
      allowed_route: status === 'disabled' ? 'disabled' : 'blocked',
      reason,
    })),
  };
}

function readRepoPermission(target: RepoAuthorityTarget, login: string, fixture: GhFixture | null) {
  const fixturePermission = readFixturePermission(fixture, target.repo);
  if (fixturePermission) {
    return {
      status: 'ready' as const,
      permission: fixturePermission,
      reason: null,
    };
  }

  const result = runGhApi([
    `repos/${target.repo}/collaborators/${encodeURIComponent(login)}/permission`,
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

function buildRepoAuthority(login: string, fixture: GhFixture | null): RepoAuthoritySummary {
  const repos = buildRepoTargets().map((target): RepoAuthorityProjection => {
    const permissionResult = readRepoPermission(target, login, fixture);
    if (permissionResult.status !== 'ready') {
      return {
        ...target,
        status: 'blocked',
        permission: null,
        direct_write_allowed: false,
        allowed_route: 'blocked',
        reason: permissionResult.reason,
      };
    }

    const permission = permissionResult.permission;
    const directWriteAllowed = DIRECT_WRITE_PERMISSIONS.has(permission);
    return {
      ...target,
      status: directWriteAllowed ? 'ready' : 'limited',
      permission,
      direct_write_allowed: directWriteAllowed,
      allowed_route: directWriteAllowed ? 'direct_repo_fix' : 'fork_pull_request',
      reason: directWriteAllowed ? null : 'direct_write_permission_missing',
    };
  });

  const directWriteRepoCount = repos.filter((entry) => entry.direct_write_allowed).length;
  const prRouteRepoCount = repos.filter((entry) => entry.allowed_route === 'fork_pull_request').length;
  const blockedRepoCount = repos.filter((entry) => entry.allowed_route === 'blocked').length;
  const status: RepoAuthorityStatus =
    blockedRepoCount > 0
      ? 'blocked'
      : directWriteRepoCount === repos.length
        ? 'ready'
        : 'limited';

  return {
    status,
    required_repo_count: repos.length,
    direct_write_repo_count: directWriteRepoCount,
    pr_route_repo_count: prRouteRepoCount,
    blocked_repo_count: blockedRepoCount,
    repos,
  };
}

function resolveAllowedRoute(repoAuthority: RepoAuthoritySummary): DeveloperModeAllowedRoute {
  if (repoAuthority.status === 'blocked') {
    return 'blocked';
  }
  if (repoAuthority.direct_write_repo_count === repoAuthority.required_repo_count) {
    return 'direct_repo_fix';
  }
  if (repoAuthority.direct_write_repo_count > 0 && repoAuthority.pr_route_repo_count > 0) {
    return 'mixed_direct_and_pr';
  }
  return 'fork_pull_request';
}

function resolveEffectiveState(
  status: DeveloperModeStatus,
  allowedRoute: DeveloperModeAllowedRoute,
): DeveloperModeEffectiveState {
  if (status === 'blocked') {
    return 'blocked';
  }
  if (allowedRoute === 'direct_repo_fix') {
    return 'active_direct';
  }
  if (allowedRoute === 'mixed_direct_and_pr') {
    return 'active_mixed_routes';
  }
  if (allowedRoute === 'observe_only') {
    return 'observe_only';
  }
  return 'active_pr_only';
}

function buildSkippedIdentity(status: GithubIdentityStatus, reason: string | null): GithubIdentityProjection {
  return {
    status,
    login: null,
    source: 'not_checked',
    reason,
  };
}

export function buildOplDeveloperModeProjection(
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
): OplDeveloperModeProjection {
  if (config.enabled === 'off') {
    return {
      surface_id: 'opl_developer_mode',
      status: 'disabled',
      enabled: config.enabled,
      effective_state: 'disabled',
      mode: config.mode,
      config_source: config.source,
      auto_enable_github_login: config.auto_enable_github_login,
      allowed_route: 'disabled',
      github_identity: buildSkippedIdentity('skipped', 'developer_mode_disabled'),
      repo_authority: buildDisabledRepoAuthority('disabled', 'developer_mode_disabled'),
    };
  }

  const fixture = readGhFixture();
  const identity = detectGithubIdentity(fixture);
  if (identity.status !== 'ready' || !identity.login) {
    return {
      surface_id: 'opl_developer_mode',
      status: 'blocked',
      enabled: config.enabled,
      effective_state: 'blocked',
      mode: config.mode,
      config_source: config.source,
      auto_enable_github_login: config.auto_enable_github_login,
      allowed_route: 'blocked',
      github_identity: identity,
      repo_authority: buildDisabledRepoAuthority('blocked', 'github_identity_unavailable'),
    };
  }

  if (config.enabled === 'auto' && identity.login !== config.auto_enable_github_login) {
    return {
      surface_id: 'opl_developer_mode',
      status: 'inactive',
      enabled: config.enabled,
      effective_state: 'inactive_auto_identity_mismatch',
      mode: config.mode,
      config_source: config.source,
      auto_enable_github_login: config.auto_enable_github_login,
      allowed_route: 'blocked',
      github_identity: identity,
      repo_authority: buildDisabledRepoAuthority('not_checked', 'auto_identity_mismatch'),
    };
  }

  const repoAuthority = buildRepoAuthority(identity.login, fixture);
  if (config.mode === 'external_observe') {
    return {
      surface_id: 'opl_developer_mode',
      status: repoAuthority.status === 'blocked' ? 'blocked' : 'ready',
      enabled: config.enabled,
      effective_state: repoAuthority.status === 'blocked' ? 'blocked' : 'observe_only',
      mode: config.mode,
      config_source: config.source,
      auto_enable_github_login: config.auto_enable_github_login,
      allowed_route: repoAuthority.status === 'blocked' ? 'blocked' : 'observe_only',
      github_identity: identity,
      repo_authority: repoAuthority,
    };
  }

  const allowedRoute = resolveAllowedRoute(repoAuthority);
  const status: DeveloperModeStatus =
    repoAuthority.status === 'ready'
      ? 'ready'
      : repoAuthority.status === 'limited'
        ? 'limited'
        : 'blocked';

  return {
    surface_id: 'opl_developer_mode',
    status,
    enabled: config.enabled,
    effective_state: resolveEffectiveState(status, allowedRoute),
    mode: config.mode,
    config_source: config.source,
    auto_enable_github_login: config.auto_enable_github_login,
    allowed_route: allowedRoute,
    github_identity: identity,
    repo_authority: repoAuthority,
  };
}
