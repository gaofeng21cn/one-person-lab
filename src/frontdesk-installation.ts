import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCodexBinary } from './codex.ts';
import { GatewayContractError } from './contracts.ts';
import { buildFrontDeskEndpoints } from './frontdesk-paths.ts';
import {
  buildFrontDeskWorkspaceRootStatus,
  readFrontDeskUpdateChannel,
  readFrontDeskWorkspaceRoot,
  type FrontDeskUpdateChannel,
  writeFrontDeskUpdateChannel,
  writeFrontDeskWorkspaceRoot,
} from './frontdesk-preferences.ts';
import { readFrontDeskRuntimeModes } from './frontdesk-runtime-modes.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import { getFrontDeskServiceStatus, installFrontDeskService } from './frontdesk-service.ts';
import { inspectHermesRuntime } from './hermes.ts';
import { readLocalCodexDefaultsIfAvailable } from './local-codex-defaults.ts';
import { runProductEntryRepairHermesGateway } from './product-entry.ts';
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

export type FrontDeskEngineId = 'codex' | 'hermes';

export type FrontDeskEngineAction =
  | 'install'
  | 'update'
  | 'reinstall'
  | 'remove';

export type FrontDeskSystemAction =
  | 'repair'
  | 'reinstall_support'
  | 'update_channel';

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

type FrontDeskShellActionSpec = {
  strategy: 'env_override' | 'builtin' | 'manual_required';
  command_preview: string[];
  note: string | null;
  executable: ((cwd?: string) => CommandResult) | null;
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

function normalizeOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

function getShellBinary() {
  return process.env.SHELL?.trim() || '/bin/bash';
}

function runShellCommand(command: string, cwd?: string): CommandResult {
  return runCommand(getShellBinary(), ['-lc', command], cwd);
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

function buildEngineActionEnvKey(engineId: FrontDeskEngineId, action: FrontDeskEngineAction) {
  return `OPL_${engineId.toUpperCase()}_${action.toUpperCase()}_COMMAND`;
}

function resolveHermesInstallCommand() {
  return 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash';
}

function resolveBuiltinEngineActionCommand(
  engineId: FrontDeskEngineId,
  action: FrontDeskEngineAction,
) {
  if (engineId === 'codex') {
    switch (action) {
      case 'install':
      case 'update':
      case 'reinstall':
        return 'npm install -g @openai/codex';
      case 'remove':
        return 'npm uninstall -g @openai/codex';
    }
  }

  const hermes = inspectHermesRuntime();

  if (engineId === 'hermes') {
    switch (action) {
      case 'install':
      case 'reinstall':
        return resolveHermesInstallCommand();
      case 'update':
        return hermes.binary ? `${hermes.binary.path} update` : null;
      case 'remove':
        return null;
    }
  }

  return null;
}

function resolveShellActionSpec(
  envOverride: string | undefined,
  builtinCommand: string | null,
  manualNote: string,
): FrontDeskShellActionSpec {
  const normalizedOverride = normalizeOptionalString(envOverride);
  if (normalizedOverride) {
    const executablePath = path.resolve(normalizedOverride);
    if (!/\s/.test(normalizedOverride) && fs.existsSync(executablePath) && fs.statSync(executablePath).isFile()) {
      return {
        strategy: 'env_override',
        command_preview: [executablePath],
        note: null,
        executable: (cwd?: string) => runCommand(executablePath, [], cwd),
      };
    }

    return {
      strategy: 'env_override',
      command_preview: [getShellBinary(), '-lc', normalizedOverride],
      note: null,
      executable: (cwd?: string) => runShellCommand(normalizedOverride, cwd),
    };
  }

  if (builtinCommand) {
    return {
      strategy: 'builtin',
      command_preview: [getShellBinary(), '-lc', builtinCommand],
      note: null,
      executable: (cwd?: string) => runShellCommand(builtinCommand, cwd),
    };
  }

  return {
    strategy: 'manual_required',
    command_preview: [],
    note: manualNote,
    executable: null,
  };
}

function resolveEngineActionSpec(
  engineId: FrontDeskEngineId,
  action: FrontDeskEngineAction,
): FrontDeskShellActionSpec {
  const envOverride = process.env[buildEngineActionEnvKey(engineId, action)];
  const builtinCommand = resolveBuiltinEngineActionCommand(engineId, action);
  const manualNote =
    engineId === 'hermes' && action === 'remove'
      ? 'Hermes remove does not currently have a safe cross-platform uninstall command. Use the installer-specific removal path manually.'
      : `No built-in ${engineId} ${action} command is configured. Set ${buildEngineActionEnvKey(engineId, action)} to enable it.`;

  return resolveShellActionSpec(envOverride, builtinCommand, manualNote);
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
        workspace_root_file: statePaths.workspace_root_file,
        session_ledger_file: statePaths.session_ledger_file,
        runtime_modes_file: statePaths.runtime_modes_file,
        update_channel_file: statePaths.update_channel_file,
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

export async function buildFrontDeskInitialize(contracts: GatewayContracts) {
  const environmentPayload = await buildFrontDeskEnvironment(contracts);
  const modulesPayload = buildFrontDeskModules();
  const settings = readFrontDeskRuntimeModes();
  const workspaceRoot = readFrontDeskWorkspaceRoot();
  const updateChannel = readFrontDeskUpdateChannel();
  const endpoints = buildFrontDeskEndpoints();

  const checklist = [
    {
      item_id: 'codex',
      label: 'Codex CLI',
      status: environmentPayload.frontdesk_environment.core_engines.codex.health_status,
    },
    {
      item_id: 'workspace_root',
      label: 'Workspace Root',
      status: workspaceRoot.health_status,
    },
    {
      item_id: 'frontdesk_service',
      label: 'Local Frontdesk Service',
      status: environmentPayload.frontdesk_environment.local_frontdesk.service_health,
    },
  ];

  const overallState =
    environmentPayload.frontdesk_environment.core_engines.codex.health_status === 'ready'
      && workspaceRoot.health_status === 'ready'
      ? 'ready_to_finalize'
      : 'attention_needed';

  const recommendedNextAction =
    workspaceRoot.health_status !== 'ready'
      ? {
          action_id: 'set_workspace_root',
          label: 'Choose workspace root',
          endpoint: endpoints.workspace_root,
        }
      : environmentPayload.frontdesk_environment.core_engines.codex.health_status !== 'ready'
        ? {
            action_id: 'install_or_configure_codex',
            label: 'Install or configure Codex',
            endpoint: endpoints.frontdesk_engine_action,
          }
        : {
            action_id: 'open_environment_settings',
            label: 'Review environment and modules',
            endpoint: endpoints.frontdesk_initialize,
          };

  return {
    version: 'g2',
    frontdesk_initialize: {
      surface_id: 'opl_frontdesk_initialize',
      overall_state: overallState,
      checklist,
      core_engines: environmentPayload.frontdesk_environment.core_engines,
      domain_modules: modulesPayload.frontdesk_modules,
      settings: {
        interaction_mode: settings.interaction_mode,
        execution_mode: settings.execution_mode,
        endpoint: endpoints.frontdesk_settings,
        action_endpoint: endpoints.frontdesk_settings,
      },
      workspace_root: {
        ...workspaceRoot,
        endpoint: endpoints.workspace_root,
        action_endpoint: endpoints.workspace_root,
      },
      system: {
        update_channel: updateChannel.channel,
        local_frontdesk: environmentPayload.frontdesk_environment.local_frontdesk,
        actions: [
          {
            action_id: 'repair',
            endpoint: endpoints.frontdesk_system_action,
          },
          {
            action_id: 'reinstall_support',
            endpoint: endpoints.frontdesk_system_action,
          },
          {
            action_id: 'update_channel',
            endpoint: endpoints.frontdesk_system_action,
          },
        ],
      },
      endpoints: {
        frontdesk_initialize: endpoints.frontdesk_initialize,
        frontdesk_environment: endpoints.frontdesk_environment,
        frontdesk_modules: endpoints.frontdesk_modules,
        frontdesk_settings: endpoints.frontdesk_settings,
        frontdesk_engine_action: endpoints.frontdesk_engine_action,
        workspace_root: endpoints.workspace_root,
        frontdesk_system_action: endpoints.frontdesk_system_action,
      },
      recommended_next_action: recommendedNextAction,
      notes: [
        'Initialize OPL reuses the same truth surfaces as long-lived settings management.',
        'Workspace root and update channel are stored in OPL-managed state files.',
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

function findEngineOrThrow(engineId: string): FrontDeskEngineId {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'hermes') {
    return normalized;
  }

  throw new GatewayContractError(
    'cli_usage_error',
    'Unknown OPL engine id.',
    {
      engine_id: engineId,
      available_engine_ids: ['codex', 'hermes'],
    },
    2,
  );
}

export async function runFrontDeskEngineAction(
  contracts: GatewayContracts,
  action: FrontDeskEngineAction,
  engineId: string,
) {
  const resolvedEngineId = findEngineOrThrow(engineId);
  const spec = resolveEngineActionSpec(resolvedEngineId, action);

  if (!spec.executable) {
    return {
      version: 'g2',
      frontdesk_engine_action: {
        engine_id: resolvedEngineId,
        action,
        status: 'manual_required',
        strategy: spec.strategy,
        command_preview: spec.command_preview,
        note: spec.note,
        stdout: '',
        stderr: '',
        frontdesk_environment: (await buildFrontDeskEnvironment(contracts)).frontdesk_environment,
      },
    };
  }

  const result = spec.executable();
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'build_command_failed',
      `Failed to run ${resolvedEngineId} ${action} command for OPL frontdesk.`,
      {
        engine_id: resolvedEngineId,
        action,
        command_preview: spec.command_preview,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return {
    version: 'g2',
    frontdesk_engine_action: {
      engine_id: resolvedEngineId,
      action,
      status: 'completed',
      strategy: spec.strategy,
      command_preview: spec.command_preview,
      note: spec.note,
      stdout: normalizeOutput(result.stdout, result.stderr),
      stderr: result.stderr,
      frontdesk_environment: (await buildFrontDeskEnvironment(contracts)).frontdesk_environment,
    },
  };
}

type FrontDeskSystemActionInput = Partial<{
  channel: FrontDeskUpdateChannel;
  host: string;
  port: number;
  workspacePath: string;
  sessionsLimit: number;
  basePath: string;
}>;

export async function runFrontDeskSystemAction(
  contracts: GatewayContracts,
  action: FrontDeskSystemAction,
  input: FrontDeskSystemActionInput = {},
) {
  if (action === 'repair') {
    const repairPayload = runProductEntryRepairHermesGateway();
    return {
      version: 'g2',
      frontdesk_system_action: {
        action,
        status: 'completed',
        update_channel: readFrontDeskUpdateChannel().channel,
        workspace_root: readFrontDeskWorkspaceRoot(),
        details: repairPayload.product_entry,
      },
    };
  }

  if (action === 'reinstall_support') {
    const servicePayload = await installFrontDeskService(contracts, {
      host: input.host,
      port: input.port,
      workspacePath: input.workspacePath ?? readFrontDeskWorkspaceRoot().selected_path ?? process.cwd(),
      sessionsLimit: input.sessionsLimit,
      basePath: input.basePath,
    });
    return {
      version: 'g2',
      frontdesk_system_action: {
        action,
        status: 'completed',
        update_channel: readFrontDeskUpdateChannel().channel,
        workspace_root: readFrontDeskWorkspaceRoot(),
        details: servicePayload.frontdesk_service,
      },
    };
  }

  if (!input.channel) {
    const current = readFrontDeskUpdateChannel();
    return {
      version: 'g2',
      frontdesk_system_action: {
        action,
        status: 'ready',
        update_channel: current.channel,
        workspace_root: readFrontDeskWorkspaceRoot(),
        details: current,
      },
    };
  }

  const payload = writeFrontDeskUpdateChannel(input.channel);
  return {
    version: 'g2',
    frontdesk_system_action: {
      action,
      status: 'completed',
      update_channel: payload.channel,
      workspace_root: readFrontDeskWorkspaceRoot(),
      details: payload,
    },
  };
}

export function buildFrontDeskWorkspaceRootSurface() {
  return buildFrontDeskWorkspaceRootStatus();
}

export function writeFrontDeskWorkspaceRootSurface(workspaceRoot: string) {
  return {
    version: 'g2',
    workspace_root: writeFrontDeskWorkspaceRoot(workspaceRoot),
  };
}
