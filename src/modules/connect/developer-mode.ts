import type { OplDeveloperSupervisorConfigFile } from '../../kernel/system-preferences.ts';
import { readOplDeveloperSupervisorConfig } from '../../kernel/system-preferences.ts';
import {
  STANDARD_AGENT_REGISTRY,
  resolveStandardAgent,
} from '../atlas/index.ts';
import { listDefaultOplDomainModuleSpecs } from './system-installation/modules.ts';
import {
  type DeveloperModeGhFixture,
  detectDeveloperModeGithubIdentity,
  parseGithubRepoFromUrl,
  permissionAllowsDeveloperModeDirectWrite,
  readDeveloperModeGhFixture,
  readDeveloperModeRepoPermission,
} from './developer-mode-source-policy.ts';
import { buildFrameworkCheckoutProjection } from './developer-mode-framework-checkout.ts';
import type {
  DeveloperCapabilitiesProjection,
  DeveloperCapabilityProjection,
  DeveloperCapabilityStatus,
  DeveloperIdentityClass,
  DeveloperModeAllowedRoute,
  DeveloperModeAgentAuthorityProjection,
  DeveloperModeContext,
  DeveloperModeEffectiveState,
  DeveloperModeRepositoryMaintenanceProtection,
  DeveloperModeStatus,
  DeveloperModeTargetAuthorityStatus,
  DeveloperProfileProjection,
  GithubIdentityProjection,
  GithubIdentityStatus,
  OplDeveloperModeProjection,
  OplDeveloperModeTargetAuthorityInput,
  OplDeveloperModeTargetAuthorityProjection,
  OplDeveloperModeTargetAuthoritySurface,
  RepoAuthorityProjection,
  RepoAuthorityStatus,
  RepoAuthoritySummary,
  RepoAuthorityTarget,
} from './developer-mode-types.ts';
export type {
  OplDeveloperModeFrameworkCheckoutProjection,
  OplDeveloperModeProjection,
  OplDeveloperModeTargetAuthorityInput,
  OplDeveloperModeTargetAuthorityProjection,
} from './developer-mode-types.ts';

type GhFixture = DeveloperModeGhFixture;

const OPL_FRAMEWORK_REPO_TARGET: RepoAuthorityTarget = {
  target_id: 'opl_framework',
  label: 'One Person Lab Framework',
  repo: 'gaofeng21cn/one-person-lab',
  repo_url: 'https://github.com/gaofeng21cn/one-person-lab.git',
  source: 'opl_framework_constant',
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9/]/g, '');
}

function normalizeRepoId(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = parseGithubRepoFromUrl(trimmed);
  if (parsed) {
    return parsed.toLowerCase();
  }
  const repoMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (repoMatch) {
    return `${repoMatch[1]}/${repoMatch[2]}`.toLowerCase();
  }
  return null;
}

function repoNameFromRepoId(repoId: string) {
  return repoId.split('/')[1] ?? repoId;
}

function defaultRepoUrlForRepoId(repoId: string) {
  return `https://github.com/${repoId}.git`;
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
        source: entry.scope === 'framework_capability_package'
          ? 'framework_capability_package_spec' as const
          : 'domain_module_spec' as const,
      };
    }),
  ];
}

function findRepoAuthorityProjection(repoAuthority: RepoAuthoritySummary, repoId: string) {
  const normalized = normalizeRepoId(repoId);
  if (!normalized) {
    return null;
  }
  return repoAuthority.repos.find((entry) => normalizeRepoId(entry.repo) === normalized) ?? null;
}

function findRepoTargetByRepoId(repoId: string) {
  const normalized = normalizeRepoId(repoId);
  if (!normalized) {
    return null;
  }
  return buildRepoTargets().find((entry) => normalizeRepoId(entry.repo) === normalized) ?? null;
}

function findStandardAgentRepoTarget(targetAgentId: string) {
  const standardAgent = resolveStandardAgent(targetAgentId);
  if (!standardAgent) {
    return null;
  }
  const aliases = [
    standardAgent.agent_id,
    standardAgent.project,
    standardAgent.canonical_plugin_name,
    standardAgent.module_id,
    standardAgent.domain_id,
  ].map(normalizeKey);
  const repoTarget = buildRepoTargets().find((candidate) => {
    const repoId = normalizeRepoId(candidate.repo) ?? '';
    const repoName = normalizeKey(repoNameFromRepoId(repoId));
    return aliases.includes(normalizeKey(candidate.target_id))
      || aliases.includes(repoName);
  });
  if (!repoTarget) {
    return null;
  }
  return {
    standardAgent,
    repoTarget,
  };
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
  if (input.status === 'pending') {
    return {
      profile_id: 'contributor',
      status: 'not_checked',
      level: 'contributor',
      source: 'authority_inspection_pending',
      impact: 'Developer repository authority is pending a full identity and permission inspection.',
    };
  }

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
  const pending = input.status === 'pending';
  const blocked = input.status === 'blocked' || input.status === 'inactive';
  const developerSourceSelected =
    input.enabled === 'on'
    || (input.enabled === 'auto' && !disabled && !blocked && !pending);
  const developerWorkspaceSelected = developerSourceSelected && input.configSource === 'user_config';

  const githubAuthority = (() => {
    if (disabled) {
      return developerCapability(
        'disabled',
        'disabled',
        'developer_mode_disabled',
        'Repository repair routes are not offered while Developer Mode is disabled.',
      );
    }
    if (pending) {
      return developerCapability(
        'not_checked',
        'permission_check_pending',
        'authority_inspection_pending',
        'Repository authority will be resolved by a full identity and permission inspection.',
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

  const sourceChannel = pending
    ? developerCapability(
      'not_checked',
      'identity_check_pending',
      'authority_inspection_pending',
      'The managed package channel remains selected until automatic Developer Mode identity inspection completes.',
    )
    : developerSourceSelected
    ? developerCapability(
      'ready',
      'local_checkout',
      'developer_mode_git_checkout_source',
      'Module source may use local developer checkouts for App and CLI read-models.',
    )
    : developerCapability(
      disabled ? 'disabled' : 'limited',
      'managed_package_channel',
      disabled ? 'developer_mode_disabled' : 'agent_latest_package_channel',
      'Module source remains on the managed package channel unless the source selector activates Developer Mode.',
    );

  const workspaceTrust = pending
    ? developerCapability(
      'not_checked',
      'developer_workspace_pending',
      'authority_inspection_pending',
      'Developer workspace trust is not elevated until automatic identity inspection completes.',
    )
    : developerWorkspaceSelected
    ? developerCapability(
      'ready',
      'trusted_developer_workspace',
      'user_config_developer_supervisor',
      'Developer workspace can be used for module checkout discovery; maintenance permission remains separately gated.',
    )
    : developerCapability(
      disabled ? 'disabled' : 'limited',
      developerApplySafe ? 'developer_workspace_unconfirmed' : 'managed_workspace',
      disabled ? 'developer_mode_disabled' : 'developer_supervisor_config',
      developerApplySafe
        ? 'Developer workspace may be used for local checkout discovery, but shared runtime mutation remains gated by explicit user config.'
        : 'Developer workspace trust is not elevated.',
    );

  const agentAutomation = pending
    ? developerCapability(
      'not_checked',
      'repo_repair_pending',
      'authority_inspection_pending',
      'Supervised repository repair routes are deferred until authority inspection completes.',
    )
    : input.mode === 'external_observe'
    ? developerCapability(
      disabled ? 'disabled' : 'limited',
      'observe_only',
      disabled ? 'developer_mode_disabled' : 'developer_supervisor_mode',
      'OPL Console can inspect state without repository repair automation.',
    )
    : developerCapability(
      blocked ? 'blocked' : disabled ? 'disabled' : 'ready',
      blocked ? 'blocked' : disabled ? 'disabled' : 'repo_repair_automation',
      blocked ? 'developer_mode_not_active' : disabled ? 'developer_mode_disabled' : 'developer_supervisor_mode',
      blocked
        ? 'Supervised repair automation is not offered until Developer Mode is active.'
        : disabled
          ? 'Supervised repair automation is disabled.'
          : 'OPL Console can expose supervised repository repair routes.',
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

function buildAgentAuthorityProjection(): DeveloperModeAgentAuthorityProjection {
  return {
    surface_kind: 'opl_developer_mode_agent_authority_policy',
    policy_id: 'developer_mode_agent_authority_matrix.v1',
    feedback_capture_requires_developer_mode: false,
    self_evolution_repo_mutation_requires_developer_mode: true,
    manual_enable_without_repo_write_cannot_grant_direct_write: true,
    activation_sources: {
      auto_github_identity: {
        can_select_local_checkout_source: true,
        can_grant_direct_repo_write: false,
      },
      manual_user_config: {
        can_request_developer_routes: true,
        no_direct_permission_route: 'fork_pull_request',
        can_grant_direct_repo_write: false,
      },
    },
    authority_levels: {
      opl_maintainer: 'may direct-fix OPL Framework and agent repos where GitHub permission allows writes',
      target_agent_developer: 'may direct-fix only the target agent repo where GitHub permission allows writes',
      contributor: 'may capture feedback and prepare fork or pull request evidence without direct mutation',
    },
    route_matrix: [
      {
        case_id: 'feedback_capture',
        route: 'observe_only',
        direct_write_required: false,
      },
      {
        case_id: 'authorized_agent_repo',
        route: 'direct_repo_fix',
        direct_write_required: true,
      },
      {
        case_id: 'manual_on_without_direct_write',
        route: 'fork_pull_request',
        direct_write_required: false,
      },
      {
        case_id: 'official_or_third_party_agent_without_authority',
        route: 'fork_pull_request',
        direct_write_required: false,
      },
    ],
  };
}

function buildRepositoryMaintenanceProtection(): DeveloperModeRepositoryMaintenanceProtection {
  return {
    status: 'ready',
    dirty_worktree: {
      policy: 'block_in_place_mutation',
      requires_isolated_worktree: true,
      preserves_existing_changes: true,
    },
    branch: {
      policy: 'topic_branch_required',
      protected_branches: ['main', 'master'],
      direct_push_to_protected_branch: false,
    },
  };
}

function resolveDeveloperIdentityClass(
  context: DeveloperModeContext,
  targetRepoId: string | null,
  directWriteAllowed: boolean,
): DeveloperIdentityClass {
  if (!directWriteAllowed || !targetRepoId) {
    return 'contributor';
  }
  const frameworkAuthority = findRepoAuthorityProjection(context.repoAuthority, OPL_FRAMEWORK_REPO_TARGET.repo);
  const targetIsFramework = normalizeRepoId(targetRepoId) === normalizeRepoId(OPL_FRAMEWORK_REPO_TARGET.repo);
  if (targetIsFramework || frameworkAuthority?.direct_write_allowed) {
    return 'opl_maintainer';
  }
  return 'target_agent_developer';
}

function buildUnresolvedTargetAuthority(
  context: DeveloperModeContext,
  input: OplDeveloperModeTargetAuthorityInput,
  reason: string,
): OplDeveloperModeTargetAuthorityProjection {
  return {
    target_kind: 'unresolved',
    resolution_source: input.target_repo_url ? 'explicit_target_repo_url' : input.target_repo_id ? 'explicit_target_repo_id' : 'unresolved',
    target_agent_id: input.target_agent_id ?? null,
    target_repo_id: normalizeRepoId(input.target_repo_id) ?? null,
    target_repo_url: input.target_repo_url?.trim() || null,
    target_label: input.target_agent_id ?? input.target_repo_id ?? input.target_repo_url ?? null,
    status: 'unresolved',
    developer_identity_class: 'contributor',
    permission: null,
    direct_write_allowed: false,
    allowed_route: context.status === 'disabled' ? 'disabled' : 'blocked',
    feedback_capture_requires_developer_mode: false,
    repo_mutation_requires_developer_mode: true,
    manual_enable_cannot_grant_direct_write: true,
    developer_mode_status: context.status,
    developer_mode_enabled: context.enabled,
    developer_mode_mode: context.mode,
    reason,
  };
}

function buildResolvedTargetAuthority(input: {
  context: DeveloperModeContext;
  target_kind: 'standard_agent' | 'framework_capability_package' | 'explicit_repo';
  resolution_source:
    | 'standard_agent_registry'
    | 'framework_capability_package_spec'
    | 'explicit_target_repo_id'
    | 'explicit_target_repo_url';
  target_agent_id: string | null;
  target_repo_id: string;
  target_repo_url: string;
  target_label: string | null;
  repoProjection: RepoAuthorityProjection;
}): OplDeveloperModeTargetAuthorityProjection {
  let allowedRoute: DeveloperModeAllowedRoute = input.repoProjection.allowed_route;
  let status: DeveloperModeTargetAuthorityStatus = input.repoProjection.status;
  let reason = input.repoProjection.reason;
  let directWriteAllowed = input.repoProjection.direct_write_allowed;

  if (input.context.status === 'disabled') {
    allowedRoute = 'disabled';
    status = 'disabled';
    directWriteAllowed = false;
    reason = 'developer_mode_disabled';
  } else if (input.context.status === 'pending') {
    allowedRoute = 'blocked';
    status = 'not_checked';
    directWriteAllowed = false;
    reason = 'authority_inspection_pending';
  } else if (input.context.status === 'inactive') {
    allowedRoute = 'blocked';
    status = 'blocked';
    directWriteAllowed = false;
    reason = 'auto_identity_mismatch';
  } else if (input.context.githubIdentity.status !== 'ready') {
    allowedRoute = 'blocked';
    status = 'blocked';
    directWriteAllowed = false;
    reason = 'github_identity_unavailable';
  } else if (input.context.mode === 'external_observe') {
    allowedRoute = 'observe_only';
    directWriteAllowed = false;
    reason = 'developer_mode_observe_only';
  }

  return {
    target_kind: input.target_kind,
    resolution_source: input.resolution_source,
    target_agent_id: input.target_agent_id,
    target_repo_id: input.target_repo_id,
    target_repo_url: input.target_repo_url,
    target_label: input.target_label,
    status,
    developer_identity_class: resolveDeveloperIdentityClass(input.context, input.target_repo_id, directWriteAllowed),
    permission: input.repoProjection.permission,
    direct_write_allowed: directWriteAllowed,
    allowed_route: allowedRoute,
    feedback_capture_requires_developer_mode: false,
    repo_mutation_requires_developer_mode: true,
    manual_enable_cannot_grant_direct_write: true,
    developer_mode_status: input.context.status,
    developer_mode_enabled: input.context.enabled,
    developer_mode_mode: input.context.mode,
    reason,
  };
}

function resolveExplicitRepoTarget(input: OplDeveloperModeTargetAuthorityInput) {
  const repoId = normalizeRepoId(input.target_repo_id) ?? normalizeRepoId(input.target_repo_url);
  if (!repoId) {
    return null;
  }
  return {
    target_kind: 'explicit_repo' as const,
    resolution_source: normalizeRepoId(input.target_repo_id) ? 'explicit_target_repo_id' as const : 'explicit_target_repo_url' as const,
    target_agent_id: input.target_agent_id ?? null,
    target_repo_id: repoId,
    target_repo_url: input.target_repo_url?.trim() || defaultRepoUrlForRepoId(repoId),
    target_label: input.target_agent_id ?? repoNameFromRepoId(repoId),
  };
}

function buildTargetRepoProjection(
  context: DeveloperModeContext,
  targetRepoId: string,
  targetRepoUrl: string,
  targetLabel: string | null,
): RepoAuthorityProjection {
  const knownRepoAuthority = findRepoAuthorityProjection(context.repoAuthority, targetRepoId);
  if (knownRepoAuthority) {
    return {
      ...knownRepoAuthority,
      target_id: targetRepoId,
      label: targetLabel ?? knownRepoAuthority.label,
      repo: targetRepoId,
      repo_url: targetRepoUrl,
    };
  }
  if (context.inspectionDetail === 'fast') {
    return {
      target_id: targetRepoId,
      label: targetLabel ?? targetRepoId,
      repo: targetRepoId,
      repo_url: targetRepoUrl,
      source: 'opl_framework_constant',
      status: 'not_checked',
      permission: null,
      direct_write_allowed: false,
      allowed_route: 'blocked',
      reason: 'fast_profile_defers_github_permission_check',
    };
  }
  if (context.githubIdentity.status !== 'ready' || !context.githubIdentity.login) {
    return {
      target_id: targetRepoId,
      label: targetLabel ?? targetRepoId,
      repo: targetRepoId,
      repo_url: targetRepoUrl,
      source: 'opl_framework_constant',
      status: 'blocked',
      permission: null,
      direct_write_allowed: false,
      allowed_route: 'blocked',
      reason: 'github_identity_unavailable',
    };
  }
  const permissionResult = readDeveloperModeRepoPermission(
    targetRepoId,
    context.githubIdentity.login,
    readDeveloperModeGhFixture(),
  );
  if (permissionResult.status !== 'ready') {
    return {
      target_id: targetRepoId,
      label: targetLabel ?? targetRepoId,
      repo: targetRepoId,
      repo_url: targetRepoUrl,
      source: 'opl_framework_constant',
      status: 'blocked',
      permission: null,
      direct_write_allowed: false,
      allowed_route: 'blocked',
      reason: permissionResult.reason,
    };
  }
  const directWriteAllowed = permissionAllowsDeveloperModeDirectWrite(permissionResult.permission);
  return {
    target_id: targetRepoId,
    label: targetLabel ?? targetRepoId,
    repo: targetRepoId,
    repo_url: targetRepoUrl,
    source: 'opl_framework_constant',
    status: directWriteAllowed ? 'ready' : 'limited',
    permission: permissionResult.permission,
    direct_write_allowed: directWriteAllowed,
    allowed_route: directWriteAllowed ? 'direct_repo_fix' : 'fork_pull_request',
    reason: directWriteAllowed ? null : 'direct_write_permission_missing',
  };
}

function buildTargetAuthorityProjection(
  context: DeveloperModeContext,
  input: OplDeveloperModeTargetAuthorityInput,
): OplDeveloperModeTargetAuthorityProjection {
  if (input.target_agent_id) {
    const resolved = findStandardAgentRepoTarget(input.target_agent_id);
    if (!resolved) {
      return buildUnresolvedTargetAuthority(context, input, 'standard_agent_not_found');
    }
    return buildResolvedTargetAuthority({
      context,
      target_kind: resolved.repoTarget.source === 'framework_capability_package_spec'
        ? 'framework_capability_package'
        : 'standard_agent',
      resolution_source: resolved.repoTarget.source === 'framework_capability_package_spec'
        ? 'framework_capability_package_spec'
        : 'standard_agent_registry',
      target_agent_id: resolved.standardAgent.agent_id,
      target_repo_id: resolved.repoTarget.repo,
      target_repo_url: resolved.repoTarget.repo_url,
      target_label: resolved.standardAgent.label,
      repoProjection: buildTargetRepoProjection(
        context,
        resolved.repoTarget.repo,
        resolved.repoTarget.repo_url,
        resolved.standardAgent.label,
      ),
    });
  }

  const explicitRepo = resolveExplicitRepoTarget(input);
  if (!explicitRepo) {
    return buildUnresolvedTargetAuthority(context, input, 'target_repo_not_resolvable');
  }
  return buildResolvedTargetAuthority({
    context,
    ...explicitRepo,
    repoProjection: buildTargetRepoProjection(
      context,
      explicitRepo.target_repo_id,
      explicitRepo.target_repo_url,
      explicitRepo.target_label,
    ),
  });
}

function buildTargetAuthoritySurface(context: DeveloperModeContext): OplDeveloperModeTargetAuthoritySurface {
  return {
    surface_kind: 'opl_developer_mode_target_authority_resolver',
    policy_id: 'developer_mode_target_authority_resolver.v1',
    accepted_inputs: ['target_agent_id', 'target_repo_id', 'target_repo_url'],
    standard_targets: STANDARD_AGENT_REGISTRY.map((entry) =>
      buildTargetAuthorityProjection(context, { target_agent_id: entry.agent_id })),
  };
}

function buildDeveloperModeProjection(input: DeveloperModeContext): OplDeveloperModeProjection {
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
    inactive_reason: input.inactiveReason,
    mode: input.mode,
    config_source: input.configSource,
    auto_enable_github_login: input.autoEnableGithubLogin,
    allowed_route: input.allowedRoute,
    developer_profile: resolveDeveloperProfile(common),
    capabilities: resolveDeveloperCapabilities(common),
    agent_authority: buildAgentAuthorityProjection(),
    framework_checkout: buildFrameworkCheckoutProjection(input),
    target_authority: buildTargetAuthoritySurface(input),
    github_identity: input.githubIdentity,
    repo_authority: input.repoAuthority,
    repository_maintenance_protection: buildRepositoryMaintenanceProtection(),
    inspection_detail: input.inspectionDetail,
  };
}

function buildDeveloperModeContext(
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
  options: { detail?: 'fast' | 'full' } = {},
): DeveloperModeContext {
  if (config.enabled === 'off') {
    return {
      status: 'disabled',
      enabled: config.enabled,
      effectiveState: 'disabled',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: 'disabled',
      inactiveReason: 'developer_mode_disabled',
      githubIdentity: buildSkippedIdentity('skipped', 'developer_mode_disabled'),
      repoAuthority: buildDisabledRepoAuthority('disabled', 'developer_mode_disabled'),
      inspectionDetail: options.detail ?? 'full',
    };
  }

  if (options.detail === 'fast') {
    const repoAuthority = buildNotCheckedRepoAuthority('fast_profile_defers_github_permission_check');
    const githubIdentity = buildSkippedIdentity('skipped', 'fast_profile_defers_github_identity_check');
    if (config.enabled === 'auto') {
      return {
        status: 'pending',
        enabled: config.enabled,
        effectiveState: 'inspection_pending',
        mode: config.mode,
        configSource: config.source,
        autoEnableGithubLogin: config.auto_enable_github_login,
        allowedRoute: 'blocked',
        inactiveReason: 'authority_inspection_pending',
        githubIdentity: githubIdentity,
        repoAuthority: repoAuthority,
        inspectionDetail: 'fast',
      };
    }
    return {
      status: 'ready',
      enabled: config.enabled,
      effectiveState: config.mode === 'external_observe' ? 'observe_only' : 'active_direct',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: config.mode === 'external_observe' ? 'observe_only' : 'direct_repo_fix',
      inactiveReason: null,
      githubIdentity: githubIdentity,
      repoAuthority: repoAuthority,
      inspectionDetail: 'fast',
    };
  }

  const fixture = readDeveloperModeGhFixture();
  const identity = detectDeveloperModeGithubIdentity(fixture);
  if (identity.status !== 'ready' || !identity.login) {
    return {
      status: 'blocked',
      enabled: config.enabled,
      effectiveState: 'blocked',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: 'blocked',
      inactiveReason: 'github_identity_unavailable',
      githubIdentity: identity,
      repoAuthority: buildDisabledRepoAuthority('blocked', 'github_identity_unavailable'),
      inspectionDetail: 'full',
    };
  }

  if (config.enabled === 'auto' && identity.login !== config.auto_enable_github_login) {
    return {
      status: 'inactive',
      enabled: config.enabled,
      effectiveState: 'inactive_auto_identity_mismatch',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: 'blocked',
      inactiveReason: 'auto_identity_mismatch',
      githubIdentity: identity,
      repoAuthority: buildDisabledRepoAuthority('not_checked', 'auto_identity_mismatch'),
      inspectionDetail: 'full',
    };
  }

  const repoAuthority = buildRepoAuthority(identity.login, fixture);
  if (config.mode === 'external_observe') {
    return {
      status: repoAuthority.status === 'blocked' ? 'blocked' : 'ready',
      enabled: config.enabled,
      effectiveState: repoAuthority.status === 'blocked' ? 'blocked' : 'observe_only',
      mode: config.mode,
      configSource: config.source,
      autoEnableGithubLogin: config.auto_enable_github_login,
      allowedRoute: repoAuthority.status === 'blocked' ? 'blocked' : 'observe_only',
      inactiveReason: repoAuthority.status === 'blocked' ? 'repo_authority_blocked' : null,
      githubIdentity: identity,
      repoAuthority: repoAuthority,
      inspectionDetail: 'full',
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
    status,
    enabled: config.enabled,
    effectiveState: resolveEffectiveState(status, allowedRoute),
    mode: config.mode,
    configSource: config.source,
    autoEnableGithubLogin: config.auto_enable_github_login,
    allowedRoute: allowedRoute,
    inactiveReason: status === 'blocked' ? 'repo_authority_blocked' : null,
    githubIdentity: identity,
    repoAuthority: repoAuthority,
    inspectionDetail: 'full',
  };
}

export function resolveOplDeveloperModeTargetAuthority(
  input: OplDeveloperModeTargetAuthorityInput,
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
  options: { detail?: 'fast' | 'full' } = {},
) {
  return buildTargetAuthorityProjection(buildDeveloperModeContext(config, options), input);
}

export function resolveOplDeveloperModeFrameworkCheckout(
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
  options: { detail?: 'fast' | 'full' } = {},
) {
  return buildFrameworkCheckoutProjection(buildDeveloperModeContext(config, options));
}

export function buildOplDeveloperModeProjection(
  config: OplDeveloperSupervisorConfigFile = readOplDeveloperSupervisorConfig(),
  options: { detail?: 'fast' | 'full' } = {},
): OplDeveloperModeProjection {
  return buildDeveloperModeProjection(buildDeveloperModeContext(config, options));
}
