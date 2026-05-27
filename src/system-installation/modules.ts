import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../contracts.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../opl-skills.ts';
import { readOplDeveloperSupervisorConfig } from '../system-preferences.ts';
import {
  type DomainModuleSpec,
  type OplModuleAction,
  type OplModuleId,
  type OplModuleInstallOrigin,
  type ModuleExecResult,
  type ModuleInspection,
  assertGitSuccess,
  getShellBinary,
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
  isPackagedModuleCheckout,
  readPackagedModuleGitSnapshot,
} from './module-packaged.ts';

const DOMAIN_MODULE_SPECS: DomainModuleRuntimeSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Research Foundry in medicine: study execution, paper drafting, progress narration, and deliverable files.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.12')
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    exec_command: (checkoutPath, args) => ({
      command: 'uv',
      args: ['run', '--directory', checkoutPath, '--extra', 'analysis', 'medautosci', ...args],
    }),
    skill_sync_domain: 'medautoscience',
  },
  {
    module_id: 'meddeepscientist',
    label: 'Med Deep Scientist',
    repo_name: 'med-deepscientist',
    repo_url: 'https://github.com/gaofeng21cn/med-deepscientist.git',
    scope: 'runtime_dependency',
    default_install: false,
    description: 'Optional MAS-declared legacy oracle and backend audit companion; not part of the default OPL install.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.11')
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Grant Foundry for proposal planning, critique, revision, and package assembly.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.12')
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    exec_command: (checkoutPath, args) => ({
      command: 'uv',
      args: ['run', '--directory', checkoutPath, 'medautogrant', ...args],
    }),
    skill_sync_domain: 'medautogrant',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Presentation Ops module for slide decks and other visual deliverables.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    exec_command: (_checkoutPath, args) => ({
      command: 'npm',
      args: ['run', '--silent', 'redcube', '--', ...args],
    }),
    skill_sync_domain: 'redcube',
  },
  {
    module_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    repo_name: 'opl-meta-agent',
    repo_url: 'https://github.com/gaofeng21cn/opl-meta-agent.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Foundry Agent for building new OPL-compatible high-value knowledge delivery agents.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath, 'smoke'),
    exec_command: (_checkoutPath, args) => ({
      command: 'npm',
      args: ['test', '--', ...args],
    }),
    skill_sync_domain: 'oplmetaagent',
  },
];

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
    }));
}

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function resolveSiblingWorkspaceRoot() {
  return resolveDefaultFamilyWorkspaceRoot({ repoRootHint: resolveRepoRoot() });
}

function resolveRepoOwnedScriptCommand(checkoutPath: string, relativePath: string) {
  const scriptPath = path.join(checkoutPath, relativePath);
  if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
    return null;
  }

  return {
    command: 'bash',
    args: [scriptPath],
  };
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function buildPythonCommandShim() {
  return [
    'OPL_PYTHON_SHIM_DIR="$(mktemp -d "${TMPDIR:-/tmp}/opl-python-shim.XXXXXX")"',
    'trap \'rm -rf "$OPL_PYTHON_SHIM_DIR"\' EXIT',
    'if ! command -v python >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then',
    '  ln -s "$(command -v python3)" "$OPL_PYTHON_SHIM_DIR/python"',
    '  export PATH="$OPL_PYTHON_SHIM_DIR:$PATH"',
    'fi',
  ].join('\n');
}

function buildPythonEditableBootstrapCommand(checkoutPath: string, pythonVersion: string) {
  const uvArgs = ['uv', 'tool', 'install', '--managed-python', '--python', pythonVersion, '--force', '--editable', checkoutPath];
  return {
    command: getShellBinary(),
    args: ['-lc', [
      'set -euo pipefail',
      buildPythonCommandShim(),
      'if ! command -v uv >/dev/null 2>&1; then',
      '  command -v curl >/dev/null 2>&1 || { echo "Missing uv and curl; cannot bootstrap Python module tooling." >&2; exit 127; }',
      '  curl -LsSf https://astral.sh/uv/install.sh | sh',
      '  export PATH="$HOME/.local/bin:$PATH"',
      'fi',
      'command -v uv >/dev/null 2>&1',
      uvArgs.map(shellQuote).join(' '),
    ].join('\n')],
  };
}

function buildHealthCheckCommand(checkoutPath: string, verifyLane = 'fast') {
  const verifyScript = path.join('scripts', 'verify.sh');
  return resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
    ?? {
      command: getShellBinary(),
      args: ['-lc', [
        'set -euo pipefail',
        buildPythonCommandShim(),
        ['bash', verifyScript, verifyLane].map(shellQuote).join(' '),
      ].join('\n')],
    };
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

function resolveManagedModulePath(spec: DomainModuleSpec) {
  return path.join(resolveManagedModulesRoot(), spec.repo_name);
}

function resolvePackagedModuleSourcePath(spec: DomainModuleSpec) {
  const envCheckoutPath = normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]);
  if (!envCheckoutPath) {
    return null;
  }

  const sourcePath = path.resolve(envCheckoutPath);
  return readPackagedModuleGitSnapshot(sourcePath, spec) ? sourcePath : null;
}

function fullRuntimeModuleOverridesAreLaunchSources() {
  return Boolean(normalizeOptionalString(process.env.OPL_FULL_RUNTIME_HOME));
}

function developerModePrefersLocalCheckouts() {
  const config = readOplDeveloperSupervisorConfig();
  return config.enabled === 'on' && config.mode === 'developer_apply_safe';
}

function inspectModule(spec: DomainModuleSpec): ModuleInspection {
  const managedCheckoutPath = resolveManagedModulePath(spec);
  const envCheckoutPath = normalizeOptionalString(process.env[buildModulePathEnvKey(spec.module_id)]);
  const explicitModulesRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  const siblingCheckoutPath = path.join(resolveSiblingWorkspaceRoot(), spec.repo_name);
  const candidates: Array<{ path: string; origin: OplModuleInstallOrigin }> = [];

  if (envCheckoutPath) {
    candidates.push({
      path: path.resolve(envCheckoutPath),
      origin: 'env_override',
    });
  }
  if (!explicitModulesRoot && !envCheckoutPath && developerModePrefersLocalCheckouts()) {
    candidates.push({
      path: siblingCheckoutPath,
      origin: 'sibling_workspace',
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

    const packagedGit = readPackagedModuleGitSnapshot(candidate.path, spec);
    if (packagedGit) {
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
        repo_url: resolveModuleRepoUrl(spec),
        installed: true,
        install_origin: candidate.origin,
        checkout_path: candidate.path,
        managed_checkout_path: managedCheckoutPath,
        health_status: 'ready',
        git: packagedGit,
        available_actions: candidate.origin === 'managed_root' ? ['update', 'reinstall', 'remove'] : [],
        recommended_action: candidate.origin === 'managed_root' ? 'update' : null,
      };
    }

    if (!isGitRepo(candidate.path)) {
      return {
        module_id: spec.module_id,
        label: spec.label,
        scope: spec.scope,
        default_install: spec.default_install,
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

    const git = inspectGitRepo(candidate.path, candidate.origin === 'managed_root');
    const updateAvailable = isModuleUpdateAvailable(git);
    const availableActions: OplModuleAction[] =
      candidate.origin === 'managed_root'
        ? [...(updateAvailable ? (['update'] as const) : []), 'reinstall', 'remove']
        : updateAvailable
          ? ['update']
          : [];
    return {
      module_id: spec.module_id,
      label: spec.label,
      scope: spec.scope,
      default_install: spec.default_install,
      description: spec.description,
      repo_url: resolveModuleRepoUrl(spec),
      installed: true,
      install_origin: candidate.origin,
      checkout_path: candidate.path,
      managed_checkout_path: managedCheckoutPath,
      health_status: git.dirty ? 'dirty' : 'ready',
      git,
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
    ['redcube-ai', 'redcube'],
    ['redcube_ai', 'redcube'],
    ['rca', 'redcube'],
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

export function buildOplModules() {
  const modules = DOMAIN_MODULE_SPECS.map((spec) => inspectModule(spec));
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
        'External sibling checkouts are still recognized so existing developer machines remain visible to the GUI without forcing a reinstall.',
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

  cloneManagedModule(spec, checkoutPath);
}

function runManagedInstallWorkflow(spec: DomainModuleRuntimeSpec) {
  const checkoutPath = resolveManagedModulePath(spec);
  installManagedModule(spec, checkoutPath);
  return runManagedModuleWorkflow(spec, checkoutPath, { readPackagedModuleGitSnapshot });
}

function maybeParseJsonRecord(raw: string) {
  const trimmed = raw.trim();
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
        workflow = runManagedModuleWorkflow(spec, installed.checkout_path, { readPackagedModuleGitSnapshot });
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
        && isPackagedModuleCheckout(current.checkout_path, spec)
      ) {
        replaceManagedModuleWithFreshClone(spec, current.checkout_path);
        const updated = inspectModule(spec);
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path, { readPackagedModuleGitSnapshot });
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
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path, { readPackagedModuleGitSnapshot });
      } else {
        workflow = runExternalModuleWorkflow(spec, updated.checkout_path);
      }
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
      fs.rmSync(current.managed_checkout_path, { recursive: true, force: true });
      installManagedModule(spec, current.managed_checkout_path);
      workflow = runManagedModuleWorkflow(spec, current.managed_checkout_path, { readPackagedModuleGitSnapshot });
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
