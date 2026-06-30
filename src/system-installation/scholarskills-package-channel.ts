import fs from 'node:fs';
import path from 'node:path';

import { developerModePrefersLocalCheckouts } from '../developer-mode-source-policy.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../family-workspace-root.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import {
  normalizeOptionalString,
  type DomainModuleSpec,
  type GitRepoSnapshot,
  type OplModuleInstallOrigin,
} from './shared.ts';
import {
  installManagedModuleFromPackageChannel,
  rollbackManagedModulePackageChannel,
} from './module-package-channel.ts';
import { inspectPackagedModule, readPackagedModuleMarker } from './module-packaged.ts';
import { inspectGitRepo, isGitRepo } from './module-git.ts';

const SCHOLARSKILLS_REPO_NAME = 'opl-scholarskills';

export const SCHOLARSKILLS_PACKAGE_SPEC: DomainModuleSpec = {
  module_id: 'scholarskills',
  label: 'OPL ScholarSkills',
  repo_name: SCHOLARSKILLS_REPO_NAME,
  repo_url: 'https://github.com/gaofeng21cn/opl-scholarskills.git',
  scope: 'framework_capability_package',
  default_install: true,
  description: 'Framework capability package for paper/workspace-local scholarly skills used by OPL-hosted agents.',
};

type ScholarSkillsSourceAction = 'install' | 'update' | null;

type ScholarSkillsSourcePolicy = {
  effective_install_update_source: 'package_channel' | 'developer_git_checkout';
  configured_by:
    | 'agent_latest_package_channel'
    | 'developer_mode'
    | 'env_repo_root_override'
    | 'module_path_override';
  package_channel_auto_update: boolean;
  app_managed_auto_update: boolean;
  low_level_override_env: string | null;
  app_setting_surface: 'Developer Mode' | null;
};

export type ScholarSkillsSourceTarget = {
  target_type: 'framework_capability_package';
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

export function resolveManagedScholarSkillsSourcePath() {
  return path.join(resolveManagedModulesRoot(), SCHOLARSKILLS_REPO_NAME);
}

function buildSourcePolicy(configuredBy: ScholarSkillsSourcePolicy['configured_by']): ScholarSkillsSourcePolicy {
  if (configuredBy === 'developer_mode' || configuredBy === 'env_repo_root_override' || configuredBy === 'module_path_override') {
    return {
      effective_install_update_source: 'developer_git_checkout',
      configured_by: configuredBy,
      package_channel_auto_update: false,
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
    effective_install_update_source: 'package_channel',
    configured_by: configuredBy,
    package_channel_auto_update: true,
    app_managed_auto_update: true,
    low_level_override_env: null,
    app_setting_surface: null,
  };
}

function packageChannelGitSnapshot(sourcePath: string) {
  const marker = readPackagedModuleMarker(sourcePath, SCHOLARSKILLS_PACKAGE_SPEC);
  if (!marker) {
    return null;
  }
  return {
    ...marker.source_git,
    dirty: inspectPackagedModule(sourcePath, SCHOLARSKILLS_PACKAGE_SPEC)?.dirty ?? marker.source_git.dirty,
  };
}

export function inspectScholarSkillsSource(): ScholarSkillsSourceInspection {
  const managedCheckoutPath = resolveManagedScholarSkillsSourcePath();
  const envRepoRoot = normalizeOptionalString(process.env.OPL_SCHOLARSKILLS_REPO_ROOT);
  const modulePath = normalizeOptionalString(process.env.OPL_MODULE_PATH_SCHOLARSKILLS);
  const siblingCheckoutPath = path.join(resolveDefaultFamilyWorkspaceRoot(), SCHOLARSKILLS_REPO_NAME);
  const developerModeLocal = developerModePrefersLocalCheckouts();
  const candidates: Array<{
    checkout_path: string;
    install_origin_before: OplModuleInstallOrigin;
    source_policy: ScholarSkillsSourcePolicy;
    source_kind: 'developer' | 'managed';
  }> = [];

  if (envRepoRoot) {
    candidates.push({
      checkout_path: path.resolve(envRepoRoot),
      install_origin_before: 'env_override',
      source_policy: buildSourcePolicy('env_repo_root_override'),
      source_kind: 'developer',
    });
  }
  if (modulePath) {
    candidates.push({
      checkout_path: path.resolve(modulePath),
      install_origin_before: 'env_override',
      source_policy: buildSourcePolicy('module_path_override'),
      source_kind: 'developer',
    });
  }
  if (developerModeLocal) {
    candidates.push({
      checkout_path: siblingCheckoutPath,
      install_origin_before: 'sibling_workspace',
      source_policy: buildSourcePolicy('developer_mode'),
      source_kind: 'developer',
    });
  }
  candidates.push({
    checkout_path: managedCheckoutPath,
    install_origin_before: 'managed_root',
    source_policy: buildSourcePolicy('agent_latest_package_channel'),
    source_kind: 'managed',
  });

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.checkout_path)) {
      continue;
    }
    if (candidate.source_kind === 'managed') {
      const packaged = inspectPackagedModule(candidate.checkout_path, SCHOLARSKILLS_PACKAGE_SPEC);
      if (!packaged) {
        return {
          repo_url: SCHOLARSKILLS_PACKAGE_SPEC.repo_url,
          install_origin_before: 'invalid_checkout',
          health_status_before: 'invalid_checkout',
          checkout_path: candidate.checkout_path,
          managed_checkout_path: managedCheckoutPath,
          git_before: null,
          source_policy: candidate.source_policy,
        };
      }
      return {
        repo_url: SCHOLARSKILLS_PACKAGE_SPEC.repo_url,
        install_origin_before: candidate.install_origin_before,
        health_status_before: packaged.dirty ? 'dirty' : 'ready',
        checkout_path: candidate.checkout_path,
        managed_checkout_path: managedCheckoutPath,
        git_before: {
          ...packaged.git,
          dirty: packaged.dirty,
        },
        source_policy: candidate.source_policy,
      };
    }

    if (!isGitRepo(candidate.checkout_path)) {
      return {
        repo_url: SCHOLARSKILLS_PACKAGE_SPEC.repo_url,
        install_origin_before: 'invalid_checkout',
        health_status_before: 'invalid_checkout',
        checkout_path: candidate.checkout_path,
        managed_checkout_path: managedCheckoutPath,
        git_before: null,
        source_policy: candidate.source_policy,
      };
    }
    const git = inspectGitRepo(candidate.checkout_path, false);
    return {
      repo_url: SCHOLARSKILLS_PACKAGE_SPEC.repo_url,
      install_origin_before: candidate.install_origin_before,
      health_status_before: git.dirty ? 'dirty' : 'ready',
      checkout_path: candidate.checkout_path,
      managed_checkout_path: managedCheckoutPath,
      git_before: git,
      source_policy: candidate.source_policy,
    };
  }

  return {
    repo_url: SCHOLARSKILLS_PACKAGE_SPEC.repo_url,
    install_origin_before: 'missing',
    health_status_before: 'missing',
    checkout_path: managedCheckoutPath,
    managed_checkout_path: managedCheckoutPath,
    git_before: null,
    source_policy: buildSourcePolicy('agent_latest_package_channel'),
  };
}

function buildTarget(
  inspection: ScholarSkillsSourceInspection,
  input: Pick<ScholarSkillsSourceTarget, 'status' | 'reason' | 'action' | 'git_after' | 'result' | 'error'>,
): ScholarSkillsSourceTarget {
  return {
    target_type: 'framework_capability_package',
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
    code: 'scholarskills_package_channel_maintenance_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function scholarSkillsStateForAgentPackageChannel() {
  const inspection = inspectScholarSkillsSource();
  const recommendedAction: ScholarSkillsSourceAction =
    inspection.source_policy.effective_install_update_source === 'package_channel'
      ? inspection.install_origin_before === 'missing'
        ? 'install'
        : inspection.health_status_before === 'ready'
          ? 'update'
          : null
      : null;
  return {
    module_id: 'scholarskills',
    label: SCHOLARSKILLS_PACKAGE_SPEC.label,
    scope: SCHOLARSKILLS_PACKAGE_SPEC.scope,
    default_install: true,
    installed: inspection.install_origin_before !== 'missing'
      && inspection.health_status_before !== 'invalid_checkout',
    install_origin: inspection.install_origin_before,
    health_status: inspection.health_status_before,
    checkout_path: inspection.checkout_path,
    managed_checkout_path: inspection.managed_checkout_path,
    source_policy: inspection.source_policy,
    git: inspection.git_before,
    recommended_action: recommendedAction,
    available_actions: recommendedAction ? [recommendedAction] : [],
  };
}

export function rollbackManagedScholarSkillsPackageChannel() {
  return rollbackManagedModulePackageChannel(
    SCHOLARSKILLS_PACKAGE_SPEC,
    resolveManagedScholarSkillsSourcePath(),
  );
}

export function runScholarSkillsSourceMaintenance(): ScholarSkillsSourceTarget {
  const inspection = inspectScholarSkillsSource();
  const developerSource = inspection.source_policy.effective_install_update_source === 'developer_git_checkout';

  if (inspection.health_status_before === 'invalid_checkout') {
    return buildTarget(inspection, {
      status: 'manual_required',
      reason: 'invalid_scholarskills_package_source',
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
      reason: 'dirty_scholarskills_package_channel_root',
      action: null,
      git_after: inspection.git_before,
      result: null,
      error: null,
    });
  }

  const action: ScholarSkillsSourceAction = inspection.install_origin_before === 'missing' ? 'install' : 'update';
  try {
    installManagedModuleFromPackageChannel(
      SCHOLARSKILLS_PACKAGE_SPEC,
      inspection.managed_checkout_path,
    );
    const gitAfter = packageChannelGitSnapshot(inspection.managed_checkout_path);
    return buildTarget(inspection, {
      status: 'completed',
      reason: action === 'install'
        ? 'scholarskills_package_channel_missing'
        : 'scholarskills_package_channel_refresh',
      action,
      git_after: gitAfter,
      result: {
        source: 'capability_packages',
        source_ready: true,
        source_root: inspection.managed_checkout_path,
        source_head_sha: gitAfter?.head_sha ?? null,
        package_channel_auto_update: true,
        app_managed_workspace_sync_required: true,
        workspace_sync_command_ref: 'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace-root> --json',
        quest_sync_command_ref: 'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest-root> --json',
      },
      error: null,
    });
  } catch (error) {
    return buildTarget(inspection, {
      status: 'manual_required',
      reason: `${action ?? 'inspect'}_scholarskills_package_channel_failed`,
      action,
      git_after: inspection.git_before,
      result: null,
      error: normalizeError(error),
    });
  }
}
