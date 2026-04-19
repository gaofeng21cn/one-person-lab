import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCodexBinary } from './codex.ts';
import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import { getFrontDeskServiceStatus } from './frontdesk-service.ts';
import { inspectHermesRuntime } from './hermes.ts';
import { readLocalCodexDefaultsIfAvailable } from './local-codex-defaults.ts';
import type { GatewayContracts } from './types.ts';

export type FrontDeskModuleId =
  | 'medautoscience'
  | 'meddeepscientist'
  | 'medautogrant'
  | 'redcube';

export type FrontDeskModuleAction =
  | 'install'
  | 'update'
  | 'reinstall'
  | 'remove';

type FrontDeskModuleInstallOrigin =
  | 'managed_root'
  | 'sibling_workspace'
  | 'env_override'
  | 'missing'
  | 'invalid_checkout';

type DomainModuleSpec = {
  module_id: FrontDeskModuleId;
  label: string;
  repo_name: string;
  repo_url: string;
  scope: 'domain_module';
  description: string;
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type GitRepoSnapshot = {
  branch: string | null;
  head_sha: string | null;
  short_sha: string | null;
  origin_url: string | null;
  dirty: boolean;
};

type ModuleInspection = {
  module_id: FrontDeskModuleId;
  label: string;
  scope: 'domain_module';
  description: string;
  repo_url: string;
  installed: boolean;
  install_origin: FrontDeskModuleInstallOrigin;
  checkout_path: string;
  managed_checkout_path: string;
  health_status: 'ready' | 'missing' | 'invalid_checkout' | 'dirty';
  git: GitRepoSnapshot | null;
  available_actions: FrontDeskModuleAction[];
  recommended_action: FrontDeskModuleAction | null;
};

const DOMAIN_MODULE_SPECS: DomainModuleSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    description: 'Research Foundry in medicine: study execution, paper drafting, progress narration, and deliverable files.',
  },
  {
    module_id: 'meddeepscientist',
    label: 'Med Deep Scientist',
    repo_name: 'med-deepscientist',
    repo_url: 'https://github.com/gaofeng21cn/med-deepscientist.git',
    scope: 'domain_module',
    description: 'Long-horizon research worker and analysis module for deeper experiment and runtime supervision lanes.',
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    description: 'Grant Foundry for proposal planning, critique, revision, and package assembly.',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    description: 'Presentation Ops module for slide decks and other visual deliverables.',
  },
];

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function resolveSiblingWorkspaceRoot() {
  return path.dirname(resolveProjectRoot());
}

function runCommand(command: string, args: string[], cwd?: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'build_command_failed',
      `Failed to launch command: ${command} ${args.join(' ')}`,
      {
        command,
        args,
        cwd: cwd ?? null,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runGit(args: string[], cwd?: string) {
  return runCommand('git', args, cwd);
}

function assertGitSuccess(result: CommandResult, message: string, details: Record<string, unknown>) {
  if (result.exitCode === 0) {
    return;
  }

  throw new GatewayContractError(
    'build_command_failed',
    message,
    {
      ...details,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  );
}

function isGitRepo(repoPath: string) {
  if (!fs.existsSync(repoPath)) {
    return false;
  }

  const result = runGit(['rev-parse', '--is-inside-work-tree'], repoPath);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

function inspectGitRepo(repoPath: string): GitRepoSnapshot {
  const branch = normalizeOptionalString(runGit(['branch', '--show-current'], repoPath).stdout);
  const headSha = normalizeOptionalString(runGit(['rev-parse', 'HEAD'], repoPath).stdout);
  const shortSha = normalizeOptionalString(runGit(['rev-parse', '--short', 'HEAD'], repoPath).stdout);
  const originResult = runGit(['remote', 'get-url', 'origin'], repoPath);
  const statusPorcelain = runGit(['status', '--porcelain'], repoPath);

  return {
    branch,
    head_sha: headSha,
    short_sha: shortSha,
    origin_url: originResult.exitCode === 0 ? normalizeOptionalString(originResult.stdout) : null,
    dirty: statusPorcelain.stdout.trim().length > 0,
  };
}

function buildModuleRepoUrlEnvKey(moduleId: FrontDeskModuleId) {
  return `OPL_MODULE_REPO_URL_${moduleId.toUpperCase()}`;
}

function buildModulePathEnvKey(moduleId: FrontDeskModuleId) {
  return `OPL_MODULE_PATH_${moduleId.toUpperCase()}`;
}

function resolveManagedModulesRoot() {
  const statePaths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  const explicitRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  return path.resolve(explicitRoot ?? path.join(statePaths.state_dir, 'modules'));
}

function resolveModuleRepoUrl(spec: DomainModuleSpec) {
  return normalizeOptionalString(process.env[buildModuleRepoUrlEnvKey(spec.module_id)]) ?? spec.repo_url;
}

function resolveManagedModulePath(spec: DomainModuleSpec) {
  return path.join(resolveManagedModulesRoot(), spec.repo_name);
}

function inspectModule(spec: DomainModuleSpec): ModuleInspection {
  const managedCheckoutPath = resolveManagedModulePath(spec);
  const envCheckoutPath = normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]);
  const explicitModulesRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  const siblingCheckoutPath = path.join(resolveSiblingWorkspaceRoot(), spec.repo_name);
  const candidates: Array<{ path: string; origin: FrontDeskModuleInstallOrigin }> = [];

  if (envCheckoutPath) {
    candidates.push({
      path: path.resolve(envCheckoutPath),
      origin: 'env_override',
    });
  }
  candidates.push({
    path: managedCheckoutPath,
    origin: 'managed_root',
  });
  if (!explicitModulesRoot && !envCheckoutPath) {
    candidates.push({
      path: siblingCheckoutPath,
      origin: 'sibling_workspace',
    });
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.path)) {
      continue;
    }

    if (!isGitRepo(candidate.path)) {
      return {
        module_id: spec.module_id,
        label: spec.label,
        scope: spec.scope,
        description: spec.description,
        repo_url: resolveModuleRepoUrl(spec),
        installed: false,
        install_origin: 'invalid_checkout',
        checkout_path: candidate.path,
        managed_checkout_path: managedCheckoutPath,
        health_status: 'invalid_checkout',
        git: null,
        available_actions: candidate.origin === 'managed_root' ? ['reinstall', 'remove'] : [],
        recommended_action: candidate.origin === 'managed_root' ? 'reinstall' : null,
      };
    }

    const git = inspectGitRepo(candidate.path);
    return {
      module_id: spec.module_id,
      label: spec.label,
      scope: spec.scope,
      description: spec.description,
      repo_url: resolveModuleRepoUrl(spec),
      installed: true,
      install_origin: candidate.origin,
      checkout_path: candidate.path,
      managed_checkout_path: managedCheckoutPath,
      health_status: git.dirty ? 'dirty' : 'ready',
      git,
      available_actions: candidate.origin === 'managed_root'
        ? ['update', 'reinstall', 'remove']
        : ['update'],
      recommended_action: git.dirty ? null : 'update',
    };
  }

  return {
    module_id: spec.module_id,
    label: spec.label,
    scope: spec.scope,
    description: spec.description,
    repo_url: resolveModuleRepoUrl(spec),
    installed: false,
    install_origin: 'missing',
    checkout_path: managedCheckoutPath,
    managed_checkout_path: managedCheckoutPath,
    health_status: 'missing',
    git: null,
    available_actions: ['install'],
    recommended_action: 'install',
  };
}

function findModuleSpecOrThrow(moduleId: string): DomainModuleSpec {
  const normalized = moduleId.trim().toLowerCase();
  const aliases = new Map<string, FrontDeskModuleId>([
    ['med-autoscience', 'medautoscience'],
    ['med_autoscience', 'medautoscience'],
    ['mas', 'medautoscience'],
    ['med-deepscientist', 'meddeepscientist'],
    ['med_deepscientist', 'meddeepscientist'],
    ['mds', 'meddeepscientist'],
    ['med-autogrant', 'medautogrant'],
    ['med_autogrant', 'medautogrant'],
    ['mag', 'medautogrant'],
    ['redcube-ai', 'redcube'],
    ['redcube_ai', 'redcube'],
    ['rca', 'redcube'],
  ]);
  const canonical = aliases.get(normalized) ?? normalized;
  const spec = DOMAIN_MODULE_SPECS.find((entry) => entry.module_id === canonical);
  if (!spec) {
    throw new GatewayContractError(
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

function resolveCodexVersion() {
  const binary = resolveCodexBinary();
  if (!binary) {
    return {
      installed: false,
      version: null,
      binary_path: null,
      binary_source: null,
    };
  }

  const versionResult = runCommand(binary.path, ['--version']);
  return {
    installed: true,
    version: normalizeOptionalString(versionResult.stdout) ?? normalizeOptionalString(versionResult.stderr),
    binary_path: binary.path,
    binary_source: binary.source,
  };
}

export async function buildFrontDeskEnvironment(contracts: GatewayContracts) {
  const statePaths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  const codexDefaults = readLocalCodexDefaultsIfAvailable();
  const codexBinary = resolveCodexVersion();
  const hermes = inspectHermesRuntime();
  const localService = (await getFrontDeskServiceStatus(contracts)).frontdesk_service;
  const moduleSummary = buildFrontDeskModules().frontdesk_modules.summary;
  const codexHealthStatus =
    codexBinary.installed && codexDefaults
      ? 'ready'
      : codexBinary.installed
        ? 'attention_needed'
        : 'missing';
  const hermesHealthStatus =
    hermes.binary && hermes.gateway_service.loaded
      ? 'ready'
      : hermes.binary
        ? 'attention_needed'
        : 'missing';
  const overallStatus =
    codexHealthStatus === 'ready' && hermesHealthStatus === 'ready'
      ? 'ready'
      : 'attention_needed';

  return {
    version: 'g2',
    frontdesk_environment: {
      surface_id: 'opl_frontdesk_environment',
      overall_status: overallStatus,
      core_engines: {
        codex: {
          installed: codexBinary.installed,
          version: codexBinary.version,
          binary_path: codexBinary.binary_path,
          binary_source: codexBinary.binary_source,
          config_path: codexDefaults?.config_path ?? null,
          default_model: codexDefaults?.model ?? null,
          default_reasoning_effort: codexDefaults?.reasoning_effort ?? null,
          provider_base_url: codexDefaults?.provider_base_url ?? null,
          health_status: codexHealthStatus,
        },
        hermes: {
          installed: Boolean(hermes.binary),
          version: hermes.version,
          binary_path: hermes.binary?.path ?? null,
          binary_source: hermes.binary?.source ?? null,
          gateway_loaded: hermes.gateway_service.loaded,
          gateway_status_raw: hermes.gateway_service.raw_output,
          health_status: hermesHealthStatus,
          issues: hermes.issues,
        },
      },
      local_frontdesk: {
        service_installed: localService.installed,
        service_loaded: localService.loaded,
        service_health: localService.health.status,
        gui_shell_strategy: 'external_overlay',
      },
      module_summary: moduleSummary,
      managed_paths: {
        state_dir: statePaths.state_dir,
        modules_root: resolveManagedModulesRoot(),
        workspace_registry_file: statePaths.workspace_registry_file,
        session_ledger_file: statePaths.session_ledger_file,
        runtime_modes_file: statePaths.runtime_modes_file,
        service_config_file: statePaths.service_config_file,
      },
      notes: [
        'OPL owns the user-facing initialization surface and reports whether the local Codex and Hermes engines are ready to be reused.',
        'Local frontdesk service is the repo-tracked adapter/API surface for external GUI shells.',
        'Domain modules are tracked separately so the GUI can manage install and upgrade actions from one settings area.',
      ],
    },
  };
}

export function buildFrontDeskModules() {
  const modules = DOMAIN_MODULE_SPECS.map((spec) => inspectModule(spec));
  return {
    version: 'g2',
    frontdesk_modules: {
      surface_id: 'opl_frontdesk_modules',
      modules_root: resolveManagedModulesRoot(),
      summary: {
        total_modules_count: modules.length,
        installed_modules_count: modules.filter((entry) => entry.installed).length,
        managed_modules_count: modules.filter((entry) => entry.install_origin === 'managed_root').length,
        healthy_modules_count: modules.filter((entry) => entry.health_status === 'ready').length,
      },
      modules,
      notes: [
        'OPL-managed installs live under modules_root by default.',
        'External sibling checkouts are still recognized so existing developer machines remain visible to the GUI without forcing a reinstall.',
      ],
    },
  };
}

function cloneManagedModule(spec: DomainModuleSpec, checkoutPath: string) {
  fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
  const cloneResult = runGit(['clone', resolveModuleRepoUrl(spec), checkoutPath]);
  assertGitSuccess(cloneResult, 'Failed to clone the requested OPL module.', {
    module_id: spec.module_id,
    repo_url: resolveModuleRepoUrl(spec),
    checkout_path: checkoutPath,
  });
}

export function runFrontDeskModuleAction(
  action: FrontDeskModuleAction,
  moduleId: string,
) {
  const spec = findModuleSpecOrThrow(moduleId);
  const current = inspectModule(spec);

  switch (action) {
    case 'install': {
      if (!current.installed) {
        cloneManagedModule(spec, current.managed_checkout_path);
      }
      break;
    }
    case 'update': {
      if (!current.installed || current.health_status === 'missing') {
        throw new GatewayContractError(
          'cli_usage_error',
          'Module update requires an installed checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      if (current.git?.dirty) {
        throw new GatewayContractError(
          'cli_usage_error',
          'Module update requires a clean checkout.',
          {
            module_id: spec.module_id,
            checkout_path: current.checkout_path,
          },
          2,
        );
      }
      const pullResult = runGit(['pull', '--ff-only'], current.checkout_path);
      assertGitSuccess(pullResult, 'Failed to update the requested OPL module.', {
        module_id: spec.module_id,
        checkout_path: current.checkout_path,
      });
      break;
    }
    case 'reinstall': {
      if (current.install_origin !== 'managed_root' && current.install_origin !== 'missing' && current.install_origin !== 'invalid_checkout') {
        throw new GatewayContractError(
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
      fs.rmSync(current.managed_checkout_path, { recursive: true, force: true });
      cloneManagedModule(spec, current.managed_checkout_path);
      break;
    }
    case 'remove': {
      if (current.install_origin !== 'managed_root') {
        throw new GatewayContractError(
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
    frontdesk_module_action: {
      action,
      status: 'completed',
      module: inspectModule(spec),
    },
  };
}
