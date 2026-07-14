import type { OplDeveloperSupervisorConfigFile } from '../../kernel/system-preferences.ts';
import type { buildOplFrameworkLocator } from './opl-framework-locator.ts';
import type { DeveloperModeGithubIdentityProjection } from './developer-mode-source-policy.ts';

export type DeveloperModeStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'inactive' | 'pending';
export type DeveloperModeEffectiveState =
  | 'active_direct'
  | 'active_pr_only'
  | 'active_mixed_routes'
  | 'blocked'
  | 'disabled'
  | 'inactive_auto_identity_mismatch'
  | 'inspection_pending'
  | 'observe_only';
export type DeveloperModeAllowedRoute =
  | 'direct_repo_fix'
  | 'fork_pull_request'
  | 'mixed_direct_and_pr'
  | 'observe_only'
  | 'blocked'
  | 'disabled';
export type GithubIdentityStatus = DeveloperModeGithubIdentityProjection['status'];
export type GithubIdentitySource = DeveloperModeGithubIdentityProjection['source'];
export type RepoAuthorityStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'not_checked';
export type RepoTargetSource = 'opl_framework_constant' | 'domain_module_spec' | 'framework_capability_package_spec';
export type DeveloperProfileId = 'contributor' | 'maintainer' | 'runtime_maintainer';
export type DeveloperIdentityClass = 'opl_maintainer' | 'target_agent_developer' | 'contributor';
export type DeveloperCapabilityStatus = 'ready' | 'limited' | 'blocked' | 'disabled' | 'not_checked';
export type DeveloperCapabilityId =
  | 'source_channel'
  | 'workspace_trust'
  | 'github_authority'
  | 'agent_automation'
  | 'runtime_mutation_scope';

export type GithubIdentityProjection = {
  status: GithubIdentityStatus;
  login: string | null;
  source: GithubIdentitySource;
  reason: string | null;
};

export type RepoAuthorityTarget = {
  target_id: string;
  label: string;
  repo: string;
  repo_url: string;
  source: RepoTargetSource;
};

export type RepoAuthorityProjection = RepoAuthorityTarget & {
  status: RepoAuthorityStatus;
  permission: string | null;
  direct_write_allowed: boolean;
  allowed_route: DeveloperModeAllowedRoute;
  reason: string | null;
};

export type RepoAuthoritySummary = {
  status: RepoAuthorityStatus;
  required_repo_count: number;
  direct_write_repo_count: number;
  pr_route_repo_count: number;
  blocked_repo_count: number;
  repos: RepoAuthorityProjection[];
};

export type DeveloperProfileProjection = {
  profile_id: DeveloperProfileId;
  status: DeveloperCapabilityStatus;
  level: DeveloperProfileId;
  source: string;
  impact: string;
};

export type DeveloperCapabilityProjection = {
  status: DeveloperCapabilityStatus;
  level: string;
  source: string;
  impact: string;
};

export type DeveloperCapabilitiesProjection = Record<DeveloperCapabilityId, DeveloperCapabilityProjection>;
export type FrameworkLocatorResolution = ReturnType<typeof buildOplFrameworkLocator>['framework_locator']['resolved'];

export type DeveloperModeInactiveReason =
  | 'developer_mode_disabled'
  | 'authority_inspection_pending'
  | 'github_identity_unavailable'
  | 'auto_identity_mismatch'
  | 'repo_authority_blocked'
  | null;

export type DeveloperModeRepositoryMaintenanceProtection = {
  status: 'ready';
  dirty_worktree: {
    policy: 'block_in_place_mutation';
    requires_isolated_worktree: true;
    preserves_existing_changes: true;
  };
  branch: {
    policy: 'topic_branch_required';
    protected_branches: ['main', 'master'];
    direct_push_to_protected_branch: false;
  };
};

export type DeveloperModeAgentAuthorityProjection = {
  surface_kind: 'opl_developer_mode_agent_authority_policy';
  policy_id: 'developer_mode_agent_authority_matrix.v1';
  feedback_capture_requires_developer_mode: false;
  self_evolution_repo_mutation_requires_developer_mode: true;
  manual_enable_without_repo_write_cannot_grant_direct_write: true;
  activation_sources: {
    auto_github_identity: {
      can_select_local_checkout_source: true;
      can_grant_direct_repo_write: false;
    };
    manual_user_config: {
      can_request_developer_routes: true;
      no_direct_permission_route: 'fork_pull_request';
      can_grant_direct_repo_write: false;
    };
  };
  authority_levels: {
    opl_maintainer: string;
    target_agent_developer: string;
    contributor: string;
  };
  route_matrix: Array<{
    case_id: string;
    route: DeveloperModeAllowedRoute;
    direct_write_required: boolean;
  }>;
};

export type OplDeveloperModeFrameworkCheckoutProjection = {
  surface_kind: 'opl_developer_mode_framework_checkout_locator';
  policy_id: 'developer_mode_framework_checkout_locator.v1';
  status: 'resolved' | 'unresolved';
  selected_source_kind: 'local_checkout' | 'managed_runtime';
  should_use_local_checkout: boolean;
  resolution_source: FrameworkLocatorResolution['source'] | 'developer_workspace_sibling_checkout' | 'unresolved';
  checkout_root: string | null;
  checkout_bin: string | null;
  checkout_cli_entry: string | null;
  reason: string | null;
};

export type DeveloperModeTargetAuthorityStatus = RepoAuthorityStatus | 'unresolved';

export type OplDeveloperModeTargetAuthorityInput = {
  target_agent_id?: string | null;
  target_repo_id?: string | null;
  target_repo_url?: string | null;
};

export type OplDeveloperModeTargetAuthorityProjection = {
  target_kind: 'standard_agent' | 'framework_capability_package' | 'explicit_repo' | 'unresolved';
  resolution_source:
    | 'standard_agent_registry'
    | 'framework_capability_package_spec'
    | 'explicit_target_repo_id'
    | 'explicit_target_repo_url'
    | 'unresolved';
  target_agent_id: string | null;
  target_repo_id: string | null;
  target_repo_url: string | null;
  target_label: string | null;
  status: DeveloperModeTargetAuthorityStatus;
  developer_identity_class: DeveloperIdentityClass;
  permission: string | null;
  direct_write_allowed: boolean;
  allowed_route: DeveloperModeAllowedRoute;
  feedback_capture_requires_developer_mode: false;
  repo_mutation_requires_developer_mode: true;
  manual_enable_cannot_grant_direct_write: true;
  developer_mode_status: DeveloperModeStatus;
  developer_mode_enabled: OplDeveloperSupervisorConfigFile['enabled'];
  developer_mode_mode: OplDeveloperSupervisorConfigFile['mode'];
  reason: string | null;
};

export type OplDeveloperModeTargetAuthoritySurface = {
  surface_kind: 'opl_developer_mode_target_authority_resolver';
  policy_id: 'developer_mode_target_authority_resolver.v1';
  accepted_inputs: ['target_agent_id', 'target_repo_id', 'target_repo_url'];
  standard_targets: OplDeveloperModeTargetAuthorityProjection[];
};

export type DeveloperModeContext = {
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  effectiveState: DeveloperModeEffectiveState;
  mode: OplDeveloperSupervisorConfigFile['mode'];
  configSource: OplDeveloperSupervisorConfigFile['source'];
  autoEnableGithubLogin: string;
  allowedRoute: DeveloperModeAllowedRoute;
  inactiveReason: DeveloperModeInactiveReason;
  githubIdentity: GithubIdentityProjection;
  repoAuthority: RepoAuthoritySummary;
  inspectionDetail: 'fast' | 'full';
};

export type OplDeveloperModeProjection = {
  surface_id: 'opl_developer_mode';
  status: DeveloperModeStatus;
  enabled: OplDeveloperSupervisorConfigFile['enabled'];
  effective_state: DeveloperModeEffectiveState;
  inactive_reason: DeveloperModeInactiveReason;
  mode: OplDeveloperSupervisorConfigFile['mode'];
  config_source: OplDeveloperSupervisorConfigFile['source'];
  auto_enable_github_login: string;
  allowed_route: DeveloperModeAllowedRoute;
  developer_profile: DeveloperProfileProjection;
  capabilities: DeveloperCapabilitiesProjection;
  agent_authority: DeveloperModeAgentAuthorityProjection;
  framework_checkout: OplDeveloperModeFrameworkCheckoutProjection;
  target_authority: OplDeveloperModeTargetAuthoritySurface;
  github_identity: GithubIdentityProjection;
  repo_authority: RepoAuthoritySummary;
  repository_maintenance_protection: DeveloperModeRepositoryMaintenanceProtection;
  inspection_detail?: 'fast' | 'full';
};
