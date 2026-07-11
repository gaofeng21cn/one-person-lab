import fs from 'node:fs';
import path from 'node:path';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  fileURLToPath } from 'node:url';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../opl-skills.ts';
import { developerModePrefersLocalCheckouts } from '../developer-mode-source-policy.ts';
import {
  type DomainModuleSpec,
  type ModuleSourcePolicy,
  type OplModuleAction,
  type OplModuleId,
  type OplModuleInstallOrigin,
  type ModuleExecResult,
  type ModuleInspection,
  assertGitSuccess,
  normalizeOptionalString,
  runCommand,
} from './shared.ts';
import { resolveModuleExecMaxBuffer } from './module-exec-buffer.ts';
import {
  buildSkippedWorkflow,
  type DomainModuleRuntimeSpec,
  type ModuleActionWorkflow,
  runExternalModuleWorkflow,
  runManagedModuleWorkflow,
} from './module-action-workflow.ts';
import {
  inspectGitRepo,
  isGitRepo,
  resolveRemoteGitRetryAttempts,
  runRemoteGitWithRetry,
} from './module-git.ts';
import {
  copyManagedModuleFromPackagedRuntime,
  inspectPackagedModule,
  isPackagedModuleCheckout,
  readPackagedModuleGitSnapshot,
  readPackagedModuleMarker,
} from './module-packaged.ts';
import { installManagedModuleFromPackageChannel } from './module-package-channel.ts';
import { DOMAIN_MODULE_SPECS } from './module-specs.ts';

const MODULE_WORKFLOW_DEPS = {
  readPackagedModuleGitSnapshot,
  readPackagedModuleMarker,
};

export const DEFAULT_OPL_MODULE_IDS: readonly OplModuleId[] = DOMAIN_MODULE_SPECS
  .filter((entry) => entry.default_install)
  .map((entry) => entry.module_id);

export function listDefaultOplDomainModuleSpecs(): DomainModuleSpec[] {
  return DOMAIN_MODULE_SPECS
    .filter((entry) => entry.default_install)
    .map((entry) => ({
      module_id: entry.module_id,
      label: entry.label,
      repo_name: entry.repo_name,
      repo_url: entry.repo_url,
      scope: entry.scope,
      default_install: entry.default_install,
      description: entry.description,
      capability_dependencies: entry.capability_dependencies,
    }));
}

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function resolveSiblingWorkspaceRoot() {
  return resolveDefaultFamilyWorkspaceRoot({ repoRootHint: resolveRepoRoot() });
}

function isModuleUpdateAvailable(git: NonNullable<ModuleInspection['git']>) {
  return !git.dirty && git.sync_status === 'behind';
}

function buildModuleRepoUrlEnvKey(moduleId: OplModuleId) {
  return `OPL_MODULE_REPO_URL_${moduleId.toUpperCase()}`;
}

function buildModulePathEnvKey(moduleId: OplModuleId) {
  return `OPL_MODULE_PATH_${moduleId.toUpperCase()}`;
}

function moduleSourceMode() {
  const raw = normalizeOptionalString(process.env.OPL_MODULE_SOURCE_MODE);
  if (!raw || raw === 'package_channel') {
    return 'package_channel';
  }
  if (raw === 'git_checkout') {
    return 'git_checkout';
  }
  throw new FrameworkContractError('contract_shape_invalid', 'OPL_MODULE_SOURCE_MODE must be package_channel or git_checkout.', {
    env: 'OPL_MODULE_SOURCE_MODE',
    value: raw,
  });
}

function pathsReferToSameLocation(left: string, right: string) {
  const resolveExisting = (value: string) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return path.resolve(value);
    }
  };

  return resolveExisting(left) === resolveExisting(right);
}

function resolveManagedModulesRoot() {
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const explicitRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  return path.resolve(explicitRoot ?? path.join(statePaths.state_dir, 'modules'));
}

function resolveModuleRepoUrl(spec: DomainModuleSpec) {
  return normalizeOptionalString(process.env[buildModuleRepoUrlEnvKey(spec.module_id)]) ?? spec.repo_url;
}

function moduleHasGitCheckoutOverride(spec: DomainModuleSpec) {
  return Boolean(
    normalizeOptionalString(process.env[buildModuleRepoUrlEnvKey(spec.module_id)])
    || normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]),
  );
}

function moduleHasRepoUrlOverride(spec: DomainModuleSpec) {
  return Boolean(normalizeOptionalString(process.env[buildModuleRepoUrlEnvKey(spec.module_id)]));
}

function moduleHasPathOverride(spec: DomainModuleSpec) {
  return Boolean(normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]));
}

function explicitGitCheckoutSourceMode() {
  return moduleSourceMode() === 'git_checkout';
}

function developerModeUsesGitCheckouts() {
  return developerModePrefersLocalCheckouts();
}

function shouldUsePackageChannel(spec: DomainModuleSpec) {
  return !explicitGitCheckoutSourceMode()
    && !moduleHasGitCheckoutOverride(spec)
    && !developerModeUsesGitCheckouts();
}

function resolveManagedModulePath(spec: DomainModuleSpec) {
  return path.join(resolveManagedModulesRoot(), spec.repo_name);
}

export function resolveManagedModuleCheckoutPath(spec: DomainModuleSpec) {
  return resolveManagedModulePath(spec);
}

function resolvePackagedModuleSourcePath(spec: DomainModuleSpec) {
  const envCheckoutPath = normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]);
  if (!envCheckoutPath) {
    return null;
  }

  const sourcePath = path.resolve(envCheckoutPath);
  return readPackagedModuleMarker(sourcePath, spec)?.source_kind === 'full_runtime' ? sourcePath : null;
}

function fullRuntimeModuleOverridesAreLaunchSources() {
  return Boolean(normalizeOptionalString(process.env.OPL_FULL_RUNTIME_HOME));
}

function externalCheckoutSyncAvailable(
  sourcePolicy: ModuleSourcePolicy,
  installOrigin: OplModuleInstallOrigin,
) {
  return installOrigin === 'env_override'
    || (
      installOrigin === 'sibling_workspace'
      && (
        sourcePolicy.configured_by === 'developer_mode'
        || sourcePolicy.configured_by === 'env_source_mode'
      )
    );
}

function buildModuleSourcePolicy(spec: DomainModuleSpec): ModuleSourcePolicy {
  const pathOverride = moduleHasPathOverride(spec);
  const repoUrlOverride = moduleHasRepoUrlOverride(spec);
  if (pathOverride && fullRuntimeModuleOverridesAreLaunchSources()) {
    return {
      effective_install_update_source: 'full_runtime',
      configured_by: 'full_runtime_override',
      package_channel_auto_update: false,
      app_setting_surface: null,
      low_level_override_env: buildModulePathEnvKey(spec.module_id),
    };
  }
  if (pathOverride) {
    return {
      effective_install_update_source: 'git_checkout',
      configured_by: 'module_path_override',
      package_channel_auto_update: false,
      app_setting_surface: null,
      low_level_override_env: buildModulePathEnvKey(spec.module_id),
    };
  }
  if (repoUrlOverride) {
    return {
      effective_install_update_source: 'git_checkout',
      configured_by: 'module_repo_url_override',
      package_channel_auto_update: false,
      app_setting_surface: null,
      low_level_override_env: buildModuleRepoUrlEnvKey(spec.module_id),
    };
  }
  if (explicitGitCheckoutSourceMode()) {
    return {
      effective_install_update_source: 'git_checkout',
      configured_by: 'env_source_mode',
      package_channel_auto_update: false,
      app_setting_surface: null,
      low_level_override_env: 'OPL_MODULE_SOURCE_MODE',
    };
  }
  if (developerModeUsesGitCheckouts()) {
    return {
      effective_install_update_source: 'git_checkout',
      configured_by: 'developer_mode',
      package_channel_auto_update: false,
      app_setting_surface: 'Developer Mode',
      low_level_override_env: null,
    };
  }
  return {
    effective_install_update_source: 'package_channel',
    configured_by: 'agent_latest_package_channel',
    package_channel_auto_update: true,
    app_setting_surface: null,
    low_level_override_env: null,
  };
}

function buildModuleCapabilities(
  sourcePolicy: ModuleSourcePolicy,
  installOrigin: OplModuleInstallOrigin,
  installed: boolean,
) {
  if (!installed) {
    return {
      source_channel: {
        status: installOrigin === 'invalid_checkout' ? 'blocked' as const : 'limited' as const,
        level: installOrigin === 'invalid_checkout' ? 'invalid_checkout' as const : 'missing' as const,
        source: sourcePolicy.configured_by,
        impact: installOrigin === 'invalid_checkout'
          ? 'This module checkout is invalid and cannot be used as a launch source.'
          : 'This module is not installed yet.',
      },
    };
  }

  if (sourcePolicy.effective_install_update_source === 'full_runtime') {
    return {
      source_channel: {
        status: 'ready' as const,
        level: 'full_runtime' as const,
        source: sourcePolicy.configured_by,
        impact: 'This module is read from the packaged Full runtime launch source.',
      },
    };
  }

  if (installOrigin === 'sibling_workspace' || installOrigin === 'env_override') {
    return {
      source_channel: {
        status: 'ready' as const,
        level: 'local_checkout' as const,
        source: sourcePolicy.configured_by,
        impact: 'This module is read from a local developer checkout.',
      },
    };
  }

  if (sourcePolicy.effective_install_update_source === 'git_checkout') {
    return {
      source_channel: {
        status: 'ready' as const,
        level: 'local_checkout' as const,
        source: sourcePolicy.configured_by,
        impact: 'This module install and update source uses Git checkout semantics.',
      },
    };
  }

  return {
    source_channel: {
      status: 'ready' as const,
      level: 'managed_package_channel' as const,
      source: sourcePolicy.configured_by,
      impact: 'This module uses the managed GHCR capability packages channel.',
    },
  };
}

type ModuleInspectionProfile = 'fast' | 'full';

function inspectModule(spec: DomainModuleSpec, profile: ModuleInspectionProfile = 'full'): ModuleInspection {
  const managedCheckoutPath = resolveManagedModulePath(spec);
  const envCheckoutPath = normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]);
  const explicitModulesRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  const siblingCheckoutPath = path.join(resolveSiblingWorkspaceRoot(), spec.repo_name);
  const candidates: Array<{ path: string; origin: OplModuleInstallOrigin }> = [];
  const sourcePolicy = buildModuleSourcePolicy(spec);
  const preferLocalDeveloperCheckout = !explicitModulesRoot && developerModePrefersLocalCheckouts();

  if (envCheckoutPath) {
    candidates.push({
      path: path.resolve(envCheckoutPath),
      origin: 'env_override',
    });
  }
  if (preferLocalDeveloperCheckout && !envCheckoutPath) {
    candidates.push({
      path: siblingCheckoutPath,
      origin: 'sibling_workspace',
    });
  }
  candidates.push({
    path: managedCheckoutPath,
    origin: 'managed_root',
  });
  if (!explicitModulesRoot && !envCheckoutPath && !preferLocalDeveloperCheckout) {
    candidates.push({
      path: siblingCheckoutPath,
      origin: 'sibling_workspace',
    });
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.path)) {
      continue;
    }

    const packagedModule = inspectPackagedModule(candidate.path, spec);
    if (packagedModule) {
      if (
        candidate.origin === 'env_override'
        && !pathsReferToSameLocation(candidate.path, managedCheckoutPath)
        && !fullRuntimeModuleOverridesAreLaunchSources()
      ) {
        continue;
      }

      return {
        module_id: spec.module_id,
        label: spec.label,
        scope: spec.scope,
        default_install: spec.default_install,
        description: spec.description,
        capability_dependencies: spec.capability_dependencies ?? [],
        repo_url: resolveModuleRepoUrl(spec),
        installed: true,
        install_origin: candidate.origin,
        checkout_path: candidate.path,
        managed_checkout_path: managedCheckoutPath,
        health_status: packagedModule.dirty ? 'dirty' : 'ready',
        git: packagedModule.git,
        source_policy: sourcePolicy,
        capabilities: buildModuleCapabilities(sourcePolicy, candidate.origin, true),
        available_actions: candidate.origin === 'managed_root'
          ? [...(!packagedModule.dirty ? (['update'] as const) : []), 'reinstall', 'remove']
          : [],
        recommended_action: candidate.origin === 'managed_root' && !packagedModule.dirty ? 'update' : null,
      };
    }

    if (!isGitRepo(candidate.path)) {
      return {
        module_id: spec.module_id,
        label: spec.label,
        scope: spec.scope,
        default_install: spec.default_install,
        description: spec.description,
        capability_dependencies: spec.capability_dependencies ?? [],
        repo_url: resolveModuleRepoUrl(spec),
        installed: false,
        install_origin: 'invalid_checkout',
        checkout_path: candidate.path,
        managed_checkout_path: managedCheckoutPath,
        health_status: 'invalid_checkout',
        git: null,
        source_policy: sourcePolicy,
        capabilities: buildModuleCapabilities(sourcePolicy, 'invalid_checkout', false),
        available_actions: candidate.origin === 'managed_root' ? ['reinstall', 'remove'] : [],
        recommended_action: candidate.origin === 'managed_root' ? 'reinstall' : null,
      };
    }

    const git = inspectGitRepo(candidate.path, profile === 'full' && candidate.origin === 'managed_root');
    const updateAvailable = isModuleUpdateAvailable(git);
    const availableActions: OplModuleAction[] = (() => {
      if (candidate.origin === 'managed_root') {
        return [...(updateAvailable ? (['update'] as const) : []), 'reinstall', 'remove'];
      }

      return [
        ...(updateAvailable ? (['update'] as const) : []),
        ...(externalCheckoutSyncAvailable(sourcePolicy, candidate.origin) ? (['sync'] as const) : []),
      ];
    })();
    return {
      module_id: spec.module_id,
      label: spec.label,
      scope: spec.scope,
      default_install: spec.default_install,
      description: spec.description,
      capability_dependencies: spec.capability_dependencies ?? [],
      repo_url: resolveModuleRepoUrl(spec),
      installed: true,
      install_origin: candidate.origin,
      checkout_path: candidate.path,
      managed_checkout_path: managedCheckoutPath,
      health_status: git.dirty ? 'dirty' : 'ready',
      git,
      source_policy: sourcePolicy,
      capabilities: buildModuleCapabilities(sourcePolicy, candidate.origin, true),
      available_actions: availableActions,
      recommended_action: updateAvailable ? 'update' : null,
    };
  }

  return {
    module_id: spec.module_id,
    label: spec.label,
    scope: spec.scope,
    default_install: spec.default_install,
    description: spec.description,
    capability_dependencies: spec.capability_dependencies ?? [],
    repo_url: resolveModuleRepoUrl(spec),
    installed: false,
    install_origin: 'missing',
    checkout_path: managedCheckoutPath,
    managed_checkout_path: managedCheckoutPath,
    health_status: 'missing',
    git: null,
    source_policy: sourcePolicy,
    capabilities: buildModuleCapabilities(sourcePolicy, 'missing', false),
    available_actions: ['install'],
    recommended_action: 'install',
  };
}

function findModuleSpecOrThrow(moduleId: string): DomainModuleRuntimeSpec {
  const normalized = moduleId.trim().toLowerCase();
  const aliases = new Map<string, OplModuleId>([
    ['med-autoscience', 'medautoscience'],
    ['med_autoscience', 'medautoscience'],
    ['mas', 'medautoscience'],
    ['mds', 'meddeepscientist'],
    ['med-deepscientist', 'meddeepscientist'],
    ['med_deepscientist', 'meddeepscientist'],
    ['meddeepscientist', 'meddeepscientist'],
    ['med-autogrant', 'medautogrant'],
    ['med_autogrant', 'medautogrant'],
    ['mag', 'medautogrant'],
    ['opl-meta-agent', 'oplmetaagent'],
    ['opl_meta_agent', 'oplmetaagent'],
    ['oplmetaagent', 'oplmetaagent'],
    ['meta-agent', 'oplmetaagent'],
    ['meta_agent', 'oplmetaagent'],
    ['bookforge', 'oplbookforge'],
    ['book-forge', 'oplbookforge'],
    ['book_forge', 'oplbookforge'],
    ['opl-bookforge', 'oplbookforge'],
    ['opl_bookforge', 'oplbookforge'],
    ['oplbookforge', 'oplbookforge'],
    ['redcube-ai', 'redcube'],
    ['redcube_ai', 'redcube'],
    ['rca', 'redcube'],
    ['mas-scholar-skills', 'scholarskills'],
    ['mas_scholar_skills', 'scholarskills'],
    ['scholar-skills', 'scholarskills'],
    ['scholar_skills', 'scholarskills'],
  ]);
  const canonical = aliases.get(normalized) ?? normalized;
  const spec = DOMAIN_MODULE_SPECS.find((entry) => entry.module_id === canonical);
  if (!spec) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Unknown OPL module id.',
      {
        module_id: moduleId,
        available_module_ids: DOMAIN_MODULE_SPECS.map((entry) => entry.module_id),
      },
      2,
    );
  }

  return spec;
}

export function resolveOplDomainModuleSpec(moduleId: string): DomainModuleRuntimeSpec {
  return findModuleSpecOrThrow(moduleId);
}

export function buildOplModules(input: { profile?: ModuleInspectionProfile } = {}) {
  const profile = input.profile ?? 'full';
  const modules = DOMAIN_MODULE_SPECS.map((spec) => inspectModule(spec, profile));
  const defaultModules = modules.filter((entry) => entry.default_install);
  return {
    version: 'g2',
    modules: {
      surface_id: 'opl_modules',
      modules_root: resolveManagedModulesRoot(),
      summary: {
        total_modules_count: modules.length,
        installed_modules_count: modules.filter((entry) => entry.installed).length,
        managed_modules_count: modules.filter((entry) => entry.install_origin === 'managed_root').length,
        healthy_modules_count: modules.filter((entry) => entry.health_status === 'ready').length,
        default_modules_count: defaultModules.length,
        installed_default_modules_count: defaultModules.filter((entry) => entry.installed).length,
        managed_default_modules_count: defaultModules.filter((entry) => entry.install_origin === 'managed_root').length,
        healthy_default_modules_count: defaultModules.filter((entry) => entry.health_status === 'ready').length,
        optional_modules_count: modules.length - defaultModules.length,
      },
      modules,
      notes: [
        'OPL-managed default installs live under modules_root by default.',
        'MDS remains available only as an explicit MAS-declared diagnostic, intake, or parity-oracle companion; it is not installed during the default OPL first-run path.',
        'OPL Meta Agent is a managed default ecosystem module so the App can install and maintain the Foundry Agent used to create new OPL-compatible agents.',
        'Managed module installs and updates use the OPL GHCR capability packages channel by default.',
        'When Developer Mode is explicitly on in developer_apply_safe mode, module install/update source switches to Git checkout and local sibling checkouts are preferred over OPL-managed module roots so the App uses the same repositories the developer is editing.',
        'OPL_MODULE_SOURCE_MODE and module-specific path/repo environment overrides remain low-level developer and CI controls, not the ordinary user update path.',
        'External sibling checkouts are still recognized on developer machines without forcing a reinstall.',
      ],
    },
  };
}

function cloneManagedModule(spec: DomainModuleSpec, checkoutPath: string) {
  fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
  const cloneResult = runRemoteGitWithRetry(['clone', resolveModuleRepoUrl(spec), checkoutPath]);
  assertGitSuccess(cloneResult, 'Failed to clone the requested OPL module.', {
    module_id: spec.module_id,
    repo_url: resolveModuleRepoUrl(spec),
    checkout_path: checkoutPath,
    git_attempts: resolveRemoteGitRetryAttempts(),
  });
}

function replaceManagedModuleWithFreshClone(spec: DomainModuleSpec, checkoutPath: string) {
  const tempTarget = `${checkoutPath}.upstream-${process.pid}`;
  fs.rmSync(tempTarget, { recursive: true, force: true });
  try {
    cloneManagedModule(spec, tempTarget);
    fs.rmSync(checkoutPath, { recursive: true, force: true });
    fs.renameSync(tempTarget, checkoutPath);
  } catch (error) {
    fs.rmSync(tempTarget, { recursive: true, force: true });
    throw error;
  }
}

function installManagedModule(spec: DomainModuleSpec, checkoutPath: string) {
  const packagedSourcePath = resolvePackagedModuleSourcePath(spec);
  if (packagedSourcePath) {
    copyManagedModuleFromPackagedRuntime(spec, packagedSourcePath, checkoutPath);
    return;
  }

  if (shouldUsePackageChannel(spec)) {
    installManagedModuleFromPackageChannel(spec, checkoutPath);
    return;
  }

  cloneManagedModule(spec, checkoutPath);
}

function runManagedInstallWorkflow(spec: DomainModuleRuntimeSpec) {
  const checkoutPath = resolveManagedModulePath(spec);
  if (fs.existsSync(checkoutPath)) {
    if (shouldUsePackageChannel(spec) || resolvePackagedModuleSourcePath(spec)) {
      installManagedModule(spec, checkoutPath);
    } else {
      replaceManagedModuleWithFreshClone(spec, checkoutPath);
    }
  } else {
    installManagedModule(spec, checkoutPath);
  }
  return runManagedModuleWorkflow(spec, checkoutPath, MODULE_WORKFLOW_DEPS);
}

function maybeParseJsonRecord(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = parseJsonText(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function runOplModuleAction(
  action: OplModuleAction,
  moduleId: string,
) {
  const spec = findModuleSpecOrThrow(moduleId);
  const current = inspectModule(spec);
  let workflow: ModuleActionWorkflow = buildSkippedWorkflow('Workflow not required for this action.');

  switch (action) {
    case 'install': {
      if (current.install_origin !== 'managed_root') {
        workflow = runManagedInstallWorkflow(spec);
        break;
      }
      const installed = inspectModule(spec);
      if (installed.install_origin === 'managed_root') {
        workflow = runManagedModuleWorkflow(spec, installed.checkout_path, MODULE_WORKFLOW_DEPS);
      } else if (installed.installed && installed.install_origin !== 'missing' && installed.install_origin !== 'invalid_checkout') {
        workflow = runExternalModuleWorkflow(spec, installed.checkout_path);
      }
      break;
    }
    case 'update': {
      if (!current.installed || current.health_status === 'missing') {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module update requires an installed checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      if (
        current.install_origin === 'managed_root'
        && shouldUsePackageChannel(spec)
      ) {
        if (current.git?.dirty) {
          throw new FrameworkContractError(
            'cli_usage_error',
            'Module update requires a clean checkout.',
            {
              module_id: spec.module_id,
              checkout_path: current.checkout_path,
            },
            2,
          );
        }
        installManagedModuleFromPackageChannel(spec, current.checkout_path);
        const updated = inspectModule(spec);
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path, MODULE_WORKFLOW_DEPS);
        break;
      }
      if (
        current.install_origin === 'managed_root'
        && isPackagedModuleCheckout(current.checkout_path, spec)
      ) {
        replaceManagedModuleWithFreshClone(spec, current.checkout_path);
        const updated = inspectModule(spec);
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path, MODULE_WORKFLOW_DEPS);
        break;
      }
      if (current.git?.dirty) {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module update requires a clean checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      const pullResult = runRemoteGitWithRetry(['pull', '--ff-only'], current.checkout_path);
      assertGitSuccess(pullResult, 'Failed to update the requested OPL module.', {
        module_id: spec.module_id,
        checkout_path: current.checkout_path,
        git_attempts: resolveRemoteGitRetryAttempts(),
      });
      const updated = inspectModule(spec);
      if (updated.install_origin === 'managed_root') {
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path, MODULE_WORKFLOW_DEPS);
      } else {
        workflow = runExternalModuleWorkflow(spec, updated.checkout_path);
      }
      break;
    }
    case 'sync': {
      if (!current.installed || current.health_status === 'missing') {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module sync requires an installed checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      if (current.health_status === 'invalid_checkout') {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module sync requires a valid git or packaged module checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      workflow = current.install_origin === 'managed_root'
        ? runManagedModuleWorkflow(spec, current.checkout_path, MODULE_WORKFLOW_DEPS)
        : runExternalModuleWorkflow(spec, current.checkout_path);
      break;
    }
    case 'reinstall': {
      if (current.install_origin !== 'managed_root' && current.install_origin !== 'missing' && current.install_origin !== 'invalid_checkout') {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module reinstall is only available for OPL-managed installs.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
            install_origin: current.install_origin,
          },
          2,
        );
      }
      if (current.health_status === 'dirty' || current.git?.dirty) {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module reinstall requires a clean managed checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      fs.rmSync(current.managed_checkout_path, { recursive: true, force: true });
      installManagedModule(spec, current.managed_checkout_path);
      workflow = runManagedModuleWorkflow(spec, current.managed_checkout_path, MODULE_WORKFLOW_DEPS);
      break;
    }
    case 'remove': {
      if (current.install_origin !== 'managed_root') {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Module remove is only available for OPL-managed installs.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
            install_origin: current.install_origin,
          },
          2,
        );
      }
      fs.rmSync(current.checkout_path, { recursive: true, force: true });
      break;
    }
  }

  return {
    version: 'g2',
    module_action: {
      action,
      status: 'completed',
      module: inspectModule(spec),
      turnkey: workflow,
    },
  };
}

export function runOplModuleExec(
  moduleId: string,
  args: string[],
) {
  const commandPreview = resolveOplModuleExecCommand(moduleId, args);
  const current = commandPreview.module;
  const maxBuffer = resolveModuleExecMaxBuffer();
  const result = runCommand(commandPreview.command, commandPreview.args, current.checkout_path, { maxBuffer });
  const execResult: ModuleExecResult = {
    module_id: commandPreview.module_id,
    status: 'completed',
    module: current,
    working_directory: current.checkout_path,
    command_preview: commandPreview.command_preview,
    exit_code: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    result: maybeParseJsonRecord(result.stdout),
    max_buffer_bytes: maxBuffer,
  };

  if (result.exitCode !== 0) {
    throw new FrameworkContractError(
      'build_command_failed',
      'OPL module exec command failed.',
      execResult,
      result.exitCode,
    );
  }

  return {
    version: 'g2',
    module_exec: execResult,
  };
}

export function resolveOplModuleExecCommand(
  moduleId: string,
  args: string[],
) {
  const spec = findModuleSpecOrThrow(moduleId);
  const current = inspectModule(spec);
  if (!current.installed || current.health_status === 'missing') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Module command resolution requires an installed checkout.',
      {
        module_id: spec.module_id,
        checkout_path: current.checkout_path,
        recommended_action: current.recommended_action,
      },
      2,
    );
  }
  if (current.health_status === 'invalid_checkout') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Module command resolution requires a valid git or packaged module checkout.',
      {
        module_id: spec.module_id,
        checkout_path: current.checkout_path,
        install_origin: current.install_origin,
      },
      2,
    );
  }
  if (spec.scope !== 'domain_module' || !spec.exec_command) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'This module does not expose an OPL module exec entry.',
      {
        module_id: spec.module_id,
        scope: spec.scope,
      },
      2,
    );
  }

  const commandPreview = spec.exec_command(current.checkout_path, args);
  if (!commandPreview) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'This module does not expose an OPL module exec command.',
      {
        module_id: spec.module_id,
      },
      2,
    );
  }

  return {
    module_id: spec.module_id,
    module: current,
    working_directory: current.checkout_path,
    command_preview: [commandPreview.command, ...commandPreview.args],
    command: commandPreview.command,
    args: commandPreview.args,
  };
}
