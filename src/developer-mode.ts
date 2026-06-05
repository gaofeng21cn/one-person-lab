import type { OplDeveloperSupervisorConfigFile } from './system-preferences.ts';
import { readOplDeveloperSupervisorConfig } from './system-preferences.ts';
import { listDefaultOplDomainModuleSpecs } from './system-installation/modules.ts';
import {
  type DeveloperModeGhFixture,
  type DeveloperModeGithubIdentityProjection,
  detectDeveloperModeGithubIdentity,
  parseGithubRepoFromUrl,
  permissionAllowsDeveloperModeDirectWrite,
  readDeveloperModeGhFixture,
  readDeveloperModeRepoPermission,
} from './developer-mode-source-policy.ts';

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
type GithubIdentityStatus = DeveloperModeGithubIdentityProjection['status'];
type GithubIdentitySource = DeveloperModeGithubIdentityProjection['source'];
type RepoAuthorityStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'not_checked';
type RepoTargetSource = 'opl_framework_constant' | 'domain_module_spec';
type DeveloperProfileId = 'contributor' | 'maintainer' | 'runtime_maintainer';
type DeveloperCapabilityStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'not_checked';
type DeveloperCapabilityId =
  | 'source_channel'
  | 'workspace_trust'
  | 'github_authority'
  | 'agent_automation'
  | 'runtime_mutation_scope';

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

type DeveloperProfileProjection = {
  profile_id: DeveloperProfileId;
  status: DeveloperCapabilityStatus;
  level: DeveloperProfileId;
  source: string;
  impact: string;
};

type DeveloperCapabilityProjection = {
  status: DeveloperCapabilityStatus;
  level: string;
  source: string;
  impact: string;
};

type DeveloperCapabilitiesProjection = Record<DeveloperCapabilityId, DeveloperCapabilityProjection>;

export type OplDeveloperModeProjection = {
  surface_id: 'opl_developer_mode';
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  effective_state: DeveloperModeEffectiveState;
  mode: OplDeveloperSupervisorConfigFile['mode'];
  config_source: OplDeveloperSupervisorConfigFile['source'];
  auto_enable_github_login: string;
  allowed_route: DeveloperModeAllowedRoute;
  developer_profile: DeveloperProfileProjection;
  capabilities: DeveloperCapabilitiesProjection;
  github_identity: GithubIdentityProjection;
  repo_authority: RepoAuthoritySummary;
  inspection_detail?: 'fast' | 'full';
};

type GhFixture = DeveloperModeGhFixture;

const OPL_FRAMEWORK_REPO_TARGET: RepoAuthorityTarget = {
  target_id: 'opl_framework',
  label: 'One Person Lab Framework',
  repo: 'gaofeng21cn/one-person-lab',
  repo_url: 'https://github.com/gaofeng21cn/one-person-lab.git',
  source: 'opl_framework_constant',
};

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

function buildNotCheckedRepoAuthority(reason: string): RepoAuthoritySummary {
  const targets = buildRepoTargets();
  return {
    status: 'not_checked',
    required_repo_count: targets.length,
    direct_write_repo_count: 0,
    pr_route_repo_count: 0,
    blocked_repo_count: 0,
    repos: targets.map((target) => ({
      ...target,
      status: 'not_checked',
      permission: null,
      direct_write_allowed: false,
      allowed_route: 'blocked',
      reason,
    })),
  };
}

function readRepoPermission(target: RepoAuthorityTarget, login: string, fixture: GhFixture | null) {
  return readDeveloperModeRepoPermission(target.repo, login, fixture);
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
    const directWriteAllowed = permissionAllowsDeveloperModeDirectWrite(permission);
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

function developerCapability(
  status: DeveloperCapabilityStatus,
  level: string,
  source: string,
  impact: string,
): DeveloperCapabilityProjection {
  return {
    status,
    level,
    source,
    impact,
  };
}

function resolveDeveloperProfile(input: {
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  mode: OplDeveloperSupervisorConfigFile['mode'];
  configSource: OplDeveloperSupervisorConfigFile['source'];
  allowedRoute: DeveloperModeAllowedRoute;
  githubIdentity: GithubIdentityProjection;
  repoAuthority: RepoAuthoritySummary;
}): DeveloperProfileProjection {
  if (input.status === 'disabled') {
    return {
      profile_id: 'contributor',
      status: 'disabled',
      level: 'contributor',
      source: 'developer_mode_disabled',
      impact: 'Developer Mode is disabled; repair and runtime mutation routes are not offered.',
    };
  }

  if (input.status === 'blocked') {
    return {
      profile_id: 'contributor',
      status: 'blocked',
      level: 'contributor',
      source: input.githubIdentity.status !== 'ready'
        ? 'github_identity_unavailable'
        : 'repo_authority_blocked',
      impact: 'Developer Mode repair and runtime mutation routes are blocked until GitHub identity is available.',
    };
  }

  if (input.status === 'inactive') {
    return {
      profile_id: 'contributor',
      status: 'blocked',
      level: 'contributor',
      source: 'auto_identity_mismatch',
      impact: 'Auto Developer Mode remains inactive for this GitHub identity.',
    };
  }

  if (input.allowedRoute === 'direct_repo_fix' && input.configSource === 'user_config' && input.enabled === 'on') {
    return {
      profile_id: 'runtime_maintainer',
      status: 'ready',
      level: 'runtime_maintainer',
      source: 'repo_authority_all_direct_write',
      impact: 'may use direct repository repair routes and supervised shared runtime maintenance.',
    };
  }

  if (input.allowedRoute === 'direct_repo_fix' || input.allowedRoute === 'mixed_direct_and_pr') {
    return {
      profile_id: 'maintainer',
      status: input.allowedRoute === 'mixed_direct_and_pr' ? 'limited' : 'ready',
      level: 'maintainer',
      source: input.allowedRoute === 'mixed_direct_and_pr'
        ? 'repo_authority_mixed_routes'
        : 'repo_authority_direct_write',
      impact: input.allowedRoute === 'mixed_direct_and_pr'
        ? 'May use direct repair only for repos with write authority and pull request routes elsewhere.'
        : 'May use direct repository repair routes for required OPL repos.',
    };
  }

  if (input.allowedRoute === 'observe_only') {
    return {
      profile_id: 'contributor',
      status: 'limited',
      level: 'contributor',
      source: 'developer_mode_observe_only',
      impact: 'May inspect Developer Mode state without repository or shared runtime mutation.',
    };
  }

  return {
    profile_id: 'contributor',
    status: input.status === 'limited' ? 'limited' : 'ready',
    level: 'contributor',
    source: 'repo_authority_pull_request_route',
    impact: 'May prepare fork or pull request route evidence without direct repo mutation.',
  };
}

function resolveDeveloperCapabilities(input: {
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  mode: OplDeveloperSupervisorConfigFile['mode'];
  configSource: OplDeveloperSupervisorConfigFile['source'];
  allowedRoute: DeveloperModeAllowedRoute;
  githubIdentity: GithubIdentityProjection;
  repoAuthority: RepoAuthoritySummary;
}): DeveloperCapabilitiesProjection {
  const developerApplySafe = input.enabled === 'on' && input.mode === 'developer_apply_safe';
  const explicitlyTrusted = developerApplySafe && input.configSource === 'user_config';
  const disabled = input.status === 'disabled';
  const blocked = input.status === 'blocked' || input.status === 'inactive';

  const githubAuthority = (() => {
    if (disabled) {
      return developerCapability(
        'disabled',
        'disabled',
        'developer_mode_disabled',
        'Repository repair routes are not offered while Developer Mode is disabled.',
      );
    }
    if (input.githubIdentity.status !== 'ready') {
      return developerCapability(
        'blocked',
        'blocked',
        'github_identity_unavailable',
        'Cannot determine direct write or pull request authority.',
      );
    }
    if (input.repoAuthority.status === 'not_checked') {
      return developerCapability(
        'not_checked',
        'permission_check_deferred',
        'fast_profile',
        'Repository authority is deferred in fast profile reads.',
      );
    }
    if (input.allowedRoute === 'direct_repo_fix') {
      return developerCapability(
        'ready',
        'direct_write',
        'github_repo_permissions',
        'All required OPL repos allow direct repair branches from this identity.',
      );
    }
    if (input.allowedRoute === 'mixed_direct_and_pr') {
      return developerCapability(
        'limited',
        'mixed_direct_and_pull_request',
        'github_repo_permissions',
        'Some required OPL repos allow direct repair branches; others require fork or pull request evidence.',
      );
    }
    if (input.allowedRoute === 'fork_pull_request') {
      return developerCapability(
        'limited',
        'pull_request',
        'github_repo_permissions',
        'Direct writes are unavailable; repairs must route through fork or pull request evidence.',
      );
    }
    return developerCapability(
      blocked ? 'blocked' : 'limited',
      input.allowedRoute,
      input.allowedRoute === 'observe_only' ? 'developer_supervisor_mode' : 'repo_authority',
      input.allowedRoute === 'observe_only'
        ? 'Repository mutation is not offered in observe-only mode.'
        : 'Repository repair route is not available.',
    );
  })();

  const sourceChannel = developerApplySafe
    ? developerCapability(
      'ready',
      'local_checkout',
      'developer_mode_git_checkout_source',
      'Module source may use local developer checkouts for App and CLI read-models.',
    )
    : developerCapability(
      disabled ? 'disabled' : 'limited',
      'managed_package_channel',
      disabled ? 'developer_mode_disabled' : 'stable_default',
      'Module source remains on the managed package channel unless Developer Mode explicitly selects developer_apply_safe.',
    );

  const workspaceTrust = explicitlyTrusted
    ? developerCapability(
      'ready',
      'trusted_developer_workspace',
      'user_config_developer_supervisor',
      'Developer workspace can be used for supervised Agent Lab and module checkout discovery.',
    )
    : developerCapability(
      disabled ? 'disabled' : 'limited',
      developerApplySafe ? 'developer_workspace_unconfirmed' : 'managed_workspace',
      disabled ? 'developer_mode_disabled' : 'developer_supervisor_config',
      developerApplySafe
        ? 'Developer workspace may be used for local checkout discovery, but shared runtime mutation remains gated by explicit user config.'
        : 'Developer workspace trust is not elevated.',
    );

  const agentAutomation = input.mode === 'external_observe'
    ? developerCapability(
      disabled ? 'disabled' : 'limited',
      'observe_only',
      disabled ? 'developer_mode_disabled' : 'developer_supervisor_mode',
      'Agent Lab can inspect state without repository repair automation.',
    )
    : developerCapability(
      blocked ? 'blocked' : disabled ? 'disabled' : 'ready',
      blocked ? 'blocked' : disabled ? 'disabled' : 'repo_repair_automation',
      blocked ? 'developer_mode_not_active' : disabled ? 'developer_mode_disabled' : 'developer_supervisor_mode',
      blocked
        ? 'Agent Lab repair automation is not offered until Developer Mode is active.'
        : disabled
          ? 'Agent Lab repair automation is disabled.'
          : 'Agent Lab can expose supervised repository repair routes.',
    );

  const runtimeMutationScope = explicitlyTrusted
    ? developerCapability(
      'ready',
      'shared_runtime_maintenance',
      'explicit_developer_supervisor_user_config',
      'Shared runtime provider maintenance actions may be offered from developer checkout surfaces.',
    )
    : developerCapability(
      disabled ? 'disabled' : 'blocked',
      disabled ? 'disabled' : 'blocked_developer_checkout_shared_state',
      disabled ? 'developer_mode_disabled' : 'explicit_user_config_required',
      disabled
        ? 'Shared runtime mutation is disabled.'
        : 'Shared runtime mutation requires enabled=on, developer_apply_safe mode, and user_config source.',
    );

  return {
    source_channel: sourceChannel,
    workspace_trust: workspaceTrust,
    github_authority: githubAuthority,
    agent_automation: agentAutomation,
    runtime_mutation_scope: runtimeMutationScope,
  };
}

function buildDeveloperModeProjection(input: {
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  effectiveState: DeveloperModeEffectiveState;
  mode: OplDeveloperSupervisorConfigFile['mode'];
  configSource: OplDeveloperSupervisorConfigFile['source'];
  autoEnableGithubLogin: string;
  allowedRoute: DeveloperModeAllowedRoute;
  githubIdentity: GithubIdentityProjection;
  repoAuthority: RepoAuthoritySummary;
  inspectionDetail: 'fast' | 'full';
}): OplDeveloperModeProjection {
  const common = {
    status: input.status,
    enabled: input.enabled,
    mode: input.mode,
    configSource: input.configSource,
    allowedRoute: input.allowedRoute,
    githubIdentity: input.githubIdentity,
    repoAuthority: input.repoAuthority,
  };
  return {
    surface_id: 'opl_developer_mode',
    status: input.status,
    enabled: input.enabled,
    effective_state: input.effectiveState,
    mode: input.mode,
    config_source: input.configSource,
    auto_enable_github_login: input.autoEnableGithubLogin,
    allowed_route: input.allowedRoute,
    developer_profile: resolveDeveloperProfile(common),
    capabilities: resolveDeveloperCapabilities(common),
    github_identity: input.githubIdentity,
    repo_authority: input.repoAuthority,
    inspection_detail: input.inspectionDetail,
  };
}

export function buildOplDeveloperModeProjection(
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
  options: { detail?: 'fast' | 'full' } = {},
): OplDeveloperModeProjection {
  if (config.enabled === 'off') {
    return buildDeveloperModeProjection({
      status: 'disabled',
      enabled: config.enabled,
      effectiveState: 'disabled',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: 'disabled',
      githubIdentity: buildSkippedIdentity('skipped', 'developer_mode_disabled'),
      repoAuthority: buildDisabledRepoAuthority('disabled', 'developer_mode_disabled'),
      inspectionDetail: options.detail ?? 'full',
    });
  }

  if (options.detail === 'fast') {
    const repoAuthority = buildNotCheckedRepoAuthority('fast_profile_defers_github_permission_check');
    const githubIdentity = buildSkippedIdentity('skipped', 'fast_profile_defers_github_identity_check');
    if (config.enabled === 'auto') {
      return buildDeveloperModeProjection({
        status: 'inactive',
        enabled: config.enabled,
        effectiveState: 'inactive_auto_identity_mismatch',
        mode: config.mode,
        configSource: config.source,
        autoEnableGithubLogin: config.auto_enable_github_login,
        allowedRoute: 'blocked',
        githubIdentity: githubIdentity,
        repoAuthority: repoAuthority,
        inspectionDetail: 'fast',
      });
    }
    return buildDeveloperModeProjection({
      status: 'ready',
      enabled: config.enabled,
      effectiveState: config.mode === 'external_observe' ? 'observe_only' : 'active_direct',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: config.mode === 'external_observe' ? 'observe_only' : 'direct_repo_fix',
      githubIdentity: githubIdentity,
      repoAuthority: repoAuthority,
      inspectionDetail: 'fast',
    });
  }

  const fixture = readDeveloperModeGhFixture();
  const identity = detectDeveloperModeGithubIdentity(fixture);
  if (identity.status !== 'ready' || !identity.login) {
    return buildDeveloperModeProjection({
      status: 'blocked',
      enabled: config.enabled,
      effectiveState: 'blocked',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: 'blocked',
      githubIdentity: identity,
      repoAuthority: buildDisabledRepoAuthority('blocked', 'github_identity_unavailable'),
      inspectionDetail: 'full',
    });
  }

  if (config.enabled === 'auto' && identity.login !== config.auto_enable_github_login) {
    return buildDeveloperModeProjection({
      status: 'inactive',
      enabled: config.enabled,
      effectiveState: 'inactive_auto_identity_mismatch',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: 'blocked',
      githubIdentity: identity,
      repoAuthority: buildDisabledRepoAuthority('not_checked', 'auto_identity_mismatch'),
      inspectionDetail: 'full',
    });
  }

  const repoAuthority = buildRepoAuthority(identity.login, fixture);
  if (config.mode === 'external_observe') {
    return buildDeveloperModeProjection({
      status: repoAuthority.status === 'blocked' ? 'blocked' : 'ready',
      enabled: config.enabled,
      effectiveState: repoAuthority.status === 'blocked' ? 'blocked' : 'observe_only',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: repoAuthority.status === 'blocked' ? 'blocked' : 'observe_only',
      githubIdentity: identity,
      repoAuthority: repoAuthority,
      inspectionDetail: 'full',
    });
  }

  const allowedRoute = resolveAllowedRoute(repoAuthority);
  const status: DeveloperModeStatus =
    repoAuthority.status === 'ready'
      ? 'ready'
      : repoAuthority.status === 'limited'
        ? 'limited'
        : 'blocked';

  return buildDeveloperModeProjection({
    status,
    enabled: config.enabled,
    effectiveState: resolveEffectiveState(status, allowedRoute),
    mode: config.mode,
    configSource: config.source,
    autoEnableGithubLogin: config.auto_enable_github_login,
    allowedRoute: allowedRoute,
    githubIdentity: identity,
    repoAuthority: repoAuthority,
    inspectionDetail: 'full',
  });
}
