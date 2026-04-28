import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GatewayContractError } from '../contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from '../runtime-state-paths.ts';
import {
  resolveFamilyWorkspaceRootFromRepoRoot,
  syncFamilySkillPackFromRepoRoot,
} from '../opl-skills.ts';

import {
  type DomainModuleSpec,
  type FrontDeskModuleAction,
  type FrontDeskModuleId,
  type FrontDeskModuleInstallOrigin,
  type GitRepoSnapshot,
  type ModuleInspection,
  assertGitSuccess,
  normalizeOptionalString,
  runCommand,
  runGit,
} from './shared.ts';

type DomainModuleRuntimeSpec = DomainModuleSpec & {
  bootstrap_command?: (checkoutPath: string) => { command: string; args: string[] } | null;
  health_check_command?: (checkoutPath: string) => { command: string; args: string[] } | null;
  skill_sync_domain?: 'medautoscience' | 'medautogrant' | 'redcube';
};

type ModuleActionStepResult = {
  status: 'completed' | 'skipped';
  summary: string;
  command_preview: string[] | null;
  stdout: string;
  stderr: string;
  result: Record<string, unknown> | null;
  domain_id?: string | null;
};

type ModuleActionWorkflow = {
  bootstrap: ModuleActionStepResult;
  skill_sync: ModuleActionStepResult;
  health_check: ModuleActionStepResult;
};

const DOMAIN_MODULE_SPECS: DomainModuleRuntimeSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    description: 'Research Foundry in medicine: study execution, paper drafting, progress narration, and deliverable files.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.12')
    ),
    health_check_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
      ?? { command: 'bash', args: [path.join('scripts', 'verify.sh'), 'fast'] }
    ),
    skill_sync_domain: 'medautoscience',
  },
  {
    module_id: 'meddeepscientist',
    label: 'Med Deep Scientist',
    repo_name: 'med-deepscientist',
    repo_url: 'https://github.com/gaofeng21cn/med-deepscientist.git',
    scope: 'runtime_dependency',
    description: 'MAS-controlled deep-research backend companion for long-running scientific workflows.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.11')
    ),
    health_check_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
      ?? { command: 'bash', args: [path.join('scripts', 'verify.sh'), 'fast'] }
    ),
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    description: 'Grant Foundry for proposal planning, critique, revision, and package assembly.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.12')
    ),
    health_check_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
      ?? { command: 'bash', args: [path.join('scripts', 'verify.sh'), 'fast'] }
    ),
    skill_sync_domain: 'medautogrant',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    description: 'Presentation Ops module for slide decks and other visual deliverables.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    health_check_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
      ?? { command: 'bash', args: [path.join('scripts', 'verify.sh'), 'fast'] }
    ),
    skill_sync_domain: 'redcube',
  },
];

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function resolveSiblingWorkspaceRoot() {
  return resolveFamilyWorkspaceRootFromRepoRoot(resolveRepoRoot());
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

function buildPythonEditableBootstrapCommand(checkoutPath: string, pythonVersion: string) {
  return {
    command: 'uv',
    args: ['tool', 'install', '--managed-python', '--python', pythonVersion, '--force', '--editable', checkoutPath],
  };
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

function findModuleSpecOrThrow(moduleId: string): DomainModuleRuntimeSpec {
  const normalized = moduleId.trim().toLowerCase();
  const aliases = new Map<string, FrontDeskModuleId>([
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

function readHomeDir() {
  return process.env.HOME?.trim() || resolveFrontDeskStatePaths().home_dir;
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

function runModuleStep(
  spec: DomainModuleRuntimeSpec,
  stepId: 'bootstrap' | 'health_check',
  commandPreview: { command: string; args: string[] } | null,
  checkoutPath: string,
  skippedSummary: string,
) {
  if (!commandPreview) {
    return {
      status: 'skipped',
      summary: skippedSummary,
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
    } satisfies ModuleActionStepResult;
  }

  const result = runCommand(commandPreview.command, commandPreview.args, checkoutPath);
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'build_command_failed',
      `Failed to run OPL module ${stepId}.`,
      {
        module_id: spec.module_id,
        checkout_path: checkoutPath,
        command: [commandPreview.command, ...commandPreview.args],
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return {
    status: 'completed',
    summary: stepId === 'bootstrap'
      ? 'Completed repo bootstrap.'
      : 'Completed repo health check.',
    command_preview: [commandPreview.command, ...commandPreview.args],
    stdout: result.stdout,
    stderr: result.stderr,
    result: maybeParseJsonRecord(result.stdout),
  } satisfies ModuleActionStepResult;
}

function runModuleBootstrap(spec: DomainModuleRuntimeSpec, checkoutPath: string) {
  return runModuleStep(
    spec,
    'bootstrap',
    spec.bootstrap_command?.(checkoutPath) ?? null,
    checkoutPath,
    'No repo-specific bootstrap installer is declared for this module.',
  );
}

function runModuleSkillSync(spec: DomainModuleRuntimeSpec, checkoutPath: string) {
  if (!spec.skill_sync_domain) {
    return {
      status: 'skipped',
      summary: 'No Codex skill pack is declared for this module.',
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
      domain_id: null,
    } satisfies ModuleActionStepResult;
  }

  const syncResult = syncFamilySkillPackFromRepoRoot(
    spec.skill_sync_domain,
    checkoutPath,
    { home: readHomeDir() },
  );

  return {
    status: 'completed',
    summary: 'Synced the matching Codex skill pack into the current home.',
    command_preview: syncResult.command_preview,
    stdout: syncResult.stdout,
    stderr: syncResult.stderr,
    result: {
      domain_id: syncResult.domain_id,
      repo_root: syncResult.repo_root,
      sync_status: syncResult.sync_status,
      installer_result: syncResult.installer_result,
    },
    domain_id: spec.skill_sync_domain,
  } satisfies ModuleActionStepResult;
}

function runModuleHealthCheck(spec: DomainModuleRuntimeSpec, checkoutPath: string) {
  return runModuleStep(
    spec,
    'health_check',
    spec.health_check_command?.(checkoutPath) ?? null,
    checkoutPath,
    'No repo-specific health check is declared for this module.',
  );
}

function runManagedModuleWorkflow(spec: DomainModuleRuntimeSpec, checkoutPath: string) {
  const bootstrap = runModuleBootstrap(spec, checkoutPath);
  const skill_sync = runModuleSkillSync(spec, checkoutPath);
  const health_check = runModuleHealthCheck(spec, checkoutPath);

  return {
    bootstrap,
    skill_sync,
    health_check,
  } satisfies ModuleActionWorkflow;
}

function buildSkippedWorkflow(summary: string): ModuleActionWorkflow {
  return {
    bootstrap: {
      status: 'skipped',
      summary,
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
    },
    skill_sync: {
      status: 'skipped',
      summary,
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
      domain_id: null,
    },
    health_check: {
      status: 'skipped',
      summary,
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
    },
  };
}

export function runFrontDeskModuleAction(
  action: FrontDeskModuleAction,
  moduleId: string,
) {
  const spec = findModuleSpecOrThrow(moduleId);
  const current = inspectModule(spec);
  let workflow: ModuleActionWorkflow = buildSkippedWorkflow('Workflow not required for this action.');

  switch (action) {
    case 'install': {
      if (!current.installed) {
        cloneManagedModule(spec, current.managed_checkout_path);
      }
      const installed = inspectModule(spec);
      if (installed.install_origin === 'managed_root') {
        workflow = runManagedModuleWorkflow(spec, installed.checkout_path);
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
      const updated = inspectModule(spec);
      if (updated.install_origin === 'managed_root') {
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path);
      } else {
        workflow = buildSkippedWorkflow(
          'External developer checkouts are updated in place without OPL-managed turnkey steps.',
        );
      }
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
      workflow = runManagedModuleWorkflow(spec, current.managed_checkout_path);
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
      turnkey: workflow,
    },
  };
}
