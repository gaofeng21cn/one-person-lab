import fs from 'node:fs';
import path from 'node:path';

import { developerModePrefersLocalCheckouts } from '../developer-mode-source-policy.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../family-workspace-root.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import {
  assertGitSuccess,
  normalizeOptionalString,
  type GitRepoSnapshot,
  type OplModuleInstallOrigin,
} from './shared.ts';
import {
  inspectGitRepo,
  isGitRepo,
  resolveRemoteGitRetryAttempts,
  runRemoteGitWithRetry,
} from './module-git.ts';

const SCHOLARSKILLS_REPO_NAME = 'opl-scholarskills';
const SCHOLARSKILLS_DEFAULT_REPO_URL = 'https://github.com/gaofeng21cn/opl-scholarskills.git';

type ScholarSkillsSourceAction = 'install' | 'update' | null;

type ScholarSkillsSourcePolicy = {
  effective_install_update_source: 'managed_git_checkout' | 'developer_git_checkout';
  configured_by:
    | 'app_managed_default'
    | 'developer_mode'
    | 'env_repo_root_override'
    | 'module_path_override'
    | 'repo_url_override';
  app_managed_auto_update: boolean;
  low_level_override_env: string | null;
  app_setting_surface: 'Developer Mode' | null;
};

export type ScholarSkillsSourceTarget = {
  target_type: 'capability_source';
  target_id: 'scholarskills';
  capability_plugin_id: 'opl-scholarskills';
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  action: ScholarSkillsSourceAction;
  repo_url: string;
  install_origin_before: OplModuleInstallOrigin;
  health_status_before: 'ready' | 'missing' | 'invalid_checkout' | 'dirty';
  checkout_path: string;
  managed_checkout_path: string;
  git_before: GitRepoSnapshot | null;
  git_after: GitRepoSnapshot | null;
  source_policy: ScholarSkillsSourcePolicy;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  workspace_sync_command_ref: string;
  quest_sync_command_ref: string;
  authority_boundary: {
    can_write_domain_truth: false;
    can_sign_owner_receipt: false;
    can_create_typed_blocker: false;
    can_write_runtime_queue: false;
    can_install_system_codex_skill_by_default: false;
  };
};

type ScholarSkillsSourceInspection = Pick<
  ScholarSkillsSourceTarget,
  | 'repo_url'
  | 'install_origin_before'
  | 'health_status_before'
  | 'checkout_path'
  | 'managed_checkout_path'
  | 'git_before'
  | 'source_policy'
>;

function resolveManagedModulesRoot() {
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const explicitRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  return path.resolve(explicitRoot ?? path.join(statePaths.state_dir, 'modules'));
}

function resolveManagedSourcePath() {
  return path.join(resolveManagedModulesRoot(), SCHOLARSKILLS_REPO_NAME);
}

function resolveRepoUrl() {
  return normalizeOptionalString(process.env.OPL_SCHOLARSKILLS_REPO_URL) ?? SCHOLARSKILLS_DEFAULT_REPO_URL;
}

function buildSourcePolicy(configuredBy: ScholarSkillsSourcePolicy['configured_by']): ScholarSkillsSourcePolicy {
  if (configuredBy === 'developer_mode' || configuredBy === 'env_repo_root_override' || configuredBy === 'module_path_override') {
    return {
      effective_install_update_source: 'developer_git_checkout',
      configured_by: configuredBy,
      app_managed_auto_update: false,
      low_level_override_env: configuredBy === 'env_repo_root_override'
        ? 'OPL_SCHOLARSKILLS_REPO_ROOT'
        : configuredBy === 'module_path_override'
          ? 'OPL_MODULE_PATH_SCHOLARSKILLS'
          : null,
      app_setting_surface: configuredBy === 'developer_mode' ? 'Developer Mode' : null,
    };
  }

  return {
    effective_install_update_source: 'managed_git_checkout',
    configured_by: configuredBy,
    app_managed_auto_update: true,
    low_level_override_env: configuredBy === 'repo_url_override' ? 'OPL_SCHOLARSKILLS_REPO_URL' : null,
    app_setting_surface: null,
  };
}

function inspectSource(): ScholarSkillsSourceInspection {
  const repoUrl = resolveRepoUrl();
  const managedCheckoutPath = resolveManagedSourcePath();
  const envRepoRoot = normalizeOptionalString(process.env.OPL_SCHOLARSKILLS_REPO_ROOT);
  const modulePath = normalizeOptionalString(process.env.OPL_MODULE_PATH_SCHOLARSKILLS);
  const siblingCheckoutPath = path.join(resolveDefaultFamilyWorkspaceRoot(), SCHOLARSKILLS_REPO_NAME);
  const developerModeLocal = developerModePrefersLocalCheckouts();
  const repoUrlOverride = Boolean(normalizeOptionalString(process.env.OPL_SCHOLARSKILLS_REPO_URL));
  const candidates: Array<{
    checkout_path: string;
    install_origin_before: OplModuleInstallOrigin;
    source_policy: ScholarSkillsSourcePolicy;
  }> = [];

  if (envRepoRoot) {
    candidates.push({
      checkout_path: path.resolve(envRepoRoot),
      install_origin_before: 'env_override',
      source_policy: buildSourcePolicy('env_repo_root_override'),
    });
  }
  if (modulePath) {
    candidates.push({
      checkout_path: path.resolve(modulePath),
      install_origin_before: 'env_override',
      source_policy: buildSourcePolicy('module_path_override'),
    });
  }
  if (developerModeLocal) {
    candidates.push({
      checkout_path: siblingCheckoutPath,
      install_origin_before: 'sibling_workspace',
      source_policy: buildSourcePolicy('developer_mode'),
    });
  }
  candidates.push({
    checkout_path: managedCheckoutPath,
    install_origin_before: 'managed_root',
    source_policy: buildSourcePolicy(repoUrlOverride ? 'repo_url_override' : 'app_managed_default'),
  });

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.checkout_path)) {
      continue;
    }
    if (!isGitRepo(candidate.checkout_path)) {
      return {
        repo_url: repoUrl,
        install_origin_before: 'invalid_checkout',
        health_status_before: 'invalid_checkout',
        checkout_path: candidate.checkout_path,
        managed_checkout_path: managedCheckoutPath,
        git_before: null,
        source_policy: candidate.source_policy,
      };
    }
    const git = inspectGitRepo(candidate.checkout_path, candidate.install_origin_before === 'managed_root');
    return {
      repo_url: repoUrl,
      install_origin_before: candidate.install_origin_before,
      health_status_before: git.dirty ? 'dirty' : 'ready',
      checkout_path: candidate.checkout_path,
      managed_checkout_path: managedCheckoutPath,
      git_before: git,
      source_policy: candidate.source_policy,
    };
  }

  return {
    repo_url: repoUrl,
    install_origin_before: 'missing',
    health_status_before: 'missing',
    checkout_path: managedCheckoutPath,
    managed_checkout_path: managedCheckoutPath,
    git_before: null,
    source_policy: buildSourcePolicy(repoUrlOverride ? 'repo_url_override' : 'app_managed_default'),
  };
}

function buildTarget(
  inspection: ScholarSkillsSourceInspection,
  input: Pick<ScholarSkillsSourceTarget, 'status' | 'reason' | 'action' | 'git_after' | 'result' | 'error'>,
): ScholarSkillsSourceTarget {
  return {
    target_type: 'capability_source',
    target_id: 'scholarskills',
    capability_plugin_id: 'opl-scholarskills',
    workspace_sync_command_ref: 'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace-root> --json',
    quest_sync_command_ref: 'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest-root> --json',
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_install_system_codex_skill_by_default: false,
    },
    ...inspection,
    ...input,
  };
}

function normalizeError(error: unknown) {
  if (error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function') {
    return error.toJSON() as Record<string, unknown>;
  }
  return {
    code: 'scholarskills_source_maintenance_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

function installManagedSource(inspection: ScholarSkillsSourceInspection) {
  fs.mkdirSync(path.dirname(inspection.managed_checkout_path), { recursive: true });
  const cloneResult = runRemoteGitWithRetry([
    'clone',
    inspection.repo_url,
    inspection.managed_checkout_path,
  ]);
  assertGitSuccess(cloneResult, 'Failed to clone OPL ScholarSkills managed source.', {
    repo_url: inspection.repo_url,
    checkout_path: inspection.managed_checkout_path,
    git_attempts: resolveRemoteGitRetryAttempts(),
  });
}

function updateManagedSource(inspection: ScholarSkillsSourceInspection) {
  const pullResult = runRemoteGitWithRetry(['pull', '--ff-only'], inspection.checkout_path);
  assertGitSuccess(pullResult, 'Failed to update OPL ScholarSkills managed source.', {
    repo_url: inspection.repo_url,
    checkout_path: inspection.checkout_path,
    git_attempts: resolveRemoteGitRetryAttempts(),
  });
}

export function runScholarSkillsSourceMaintenance(): ScholarSkillsSourceTarget {
  const inspection = inspectSource();
  const developerSource = inspection.source_policy.effective_install_update_source === 'developer_git_checkout';

  if (inspection.health_status_before === 'invalid_checkout') {
    return buildTarget(inspection, {
      status: 'manual_required',
      reason: 'invalid_scholarskills_source_checkout',
      action: null,
      git_after: null,
      result: null,
      error: null,
    });
  }

  if (developerSource) {
    return buildTarget(inspection, {
      status: inspection.health_status_before === 'missing' ? 'manual_required' : 'skipped',
      reason: inspection.health_status_before === 'missing'
        ? 'developer_scholarskills_source_missing'
        : 'developer_scholarskills_source_visible_not_app_managed',
      action: null,
      git_after: inspection.git_before,
      result: {
        source: 'developer_checkout_visible_not_app_managed',
        source_ready: inspection.health_status_before === 'ready' || inspection.health_status_before === 'dirty',
      },
      error: null,
    });
  }

  if (inspection.health_status_before === 'dirty') {
    return buildTarget(inspection, {
      status: 'manual_required',
      reason: 'dirty_scholarskills_managed_source',
      action: null,
      git_after: inspection.git_before,
      result: null,
      error: null,
    });
  }

  if (
    inspection.git_before?.sync_status === 'ahead'
    || inspection.git_before?.sync_status === 'diverged'
    || inspection.git_before?.sync_status === 'no_upstream'
    || inspection.git_before?.sync_status === 'unknown'
  ) {
    return buildTarget(inspection, {
      status: 'manual_required',
      reason: `${inspection.git_before.sync_status}_scholarskills_managed_source`,
      action: null,
      git_after: inspection.git_before,
      result: null,
      error: null,
    });
  }

  const action: ScholarSkillsSourceAction = inspection.install_origin_before === 'missing' ? 'install' : 'update';
  try {
    if (action === 'install') {
      installManagedSource(inspection);
    } else {
      updateManagedSource(inspection);
    }
    const gitAfter = inspectGitRepo(inspection.managed_checkout_path, true);
    return buildTarget(inspection, {
      status: 'completed',
      reason: action === 'install'
        ? 'scholarskills_source_missing'
        : inspection.git_before?.sync_status === 'behind'
          ? 'scholarskills_source_update_available'
          : 'scholarskills_source_refresh',
      action,
      git_after: gitAfter,
      result: {
        source: 'app_managed_scholarskills_source',
        source_ready: true,
        source_root: inspection.managed_checkout_path,
        source_head_sha: gitAfter.head_sha,
        app_managed_workspace_sync_required: true,
        workspace_sync_command_ref: 'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace-root> --json',
        quest_sync_command_ref: 'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest-root> --json',
      },
      error: null,
    });
  } catch (error) {
    return buildTarget(inspection, {
      status: 'manual_required',
      reason: `${action ?? 'inspect'}_scholarskills_source_failed`,
      action,
      git_after: inspection.git_before,
      result: null,
      error: normalizeError(error),
    });
  }
}
