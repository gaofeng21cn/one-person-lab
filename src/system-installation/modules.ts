import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GatewayContractError } from '../contracts.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../full-internal-package.ts';
import {
  resolveFamilyWorkspaceRootFromRepoRoot,
  syncFamilySkillPackFromRepoRoot,
} from '../opl-skills.ts';

import {
  type DomainModuleSpec,
  type OplModuleAction,
  type OplModuleId,
  type OplModuleInstallOrigin,
  type GitRepoSnapshot,
  type ModuleInspection,
  assertGitSuccess,
  getShellBinary,
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
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
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
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
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
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
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
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
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

function buildHealthCheckCommand(checkoutPath: string) {
  const verifyScript = path.join('scripts', 'verify.sh');
  return resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
    ?? {
      command: getShellBinary(),
      args: ['-lc', [
        'set -euo pipefail',
        buildPythonCommandShim(),
        ['bash', verifyScript, 'fast'].map(shellQuote).join(' '),
      ].join('\n')],
    };
}

function isGitRepo(repoPath: string) {
  if (!fs.existsSync(repoPath)) {
    return false;
  }

  const result = runGit(['rev-parse', '--is-inside-work-tree'], repoPath);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

function normalizePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveRemoteGitRetryAttempts() {
  return normalizePositiveInteger(process.env.OPL_GIT_RETRY_ATTEMPTS, 3);
}

function resolveRemoteGitRetryDelayMs() {
  return normalizePositiveInteger(process.env.OPL_GIT_RETRY_DELAY_MS, 2_000);
}

function sleepSync(ms: number) {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function appendGitRetryHistory(result: ReturnType<typeof runGit>, args: string[], attempts: ReturnType<typeof runGit>[]) {
  if (attempts.length <= 1) {
    return result;
  }

  const history = attempts.map((attempt, index) => {
    return [
      `git attempt ${index + 1}/${attempts.length} exited with ${attempt.exitCode}: git ${args.join(' ')}`,
      attempt.stdout.trim() ? `stdout:\n${attempt.stdout.trim()}` : '',
      attempt.stderr.trim() ? `stderr:\n${attempt.stderr.trim()}` : '',
    ].filter(Boolean).join('\n');
  });

  return {
    ...result,
    stderr: [result.stderr.trim(), ...history].filter(Boolean).join('\n\n'),
  };
}

function runRemoteGitWithRetry(args: string[], cwd?: string) {
  const maxAttempts = resolveRemoteGitRetryAttempts();
  const delayMs = resolveRemoteGitRetryDelayMs();
  const attempts: ReturnType<typeof runGit>[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runGit(args, cwd);
    attempts.push(result);
    if (result.exitCode === 0) {
      return result;
    }
    if (attempt < maxAttempts) {
      sleepSync(delayMs);
    }
  }

  return appendGitRetryHistory(attempts[attempts.length - 1], args, attempts);
}

function inspectGitRepo(repoPath: string, refreshRemote = false): GitRepoSnapshot {
  const branch = normalizeOptionalString(runGit(['branch', '--show-current'], repoPath).stdout);
  const headSha = normalizeOptionalString(runGit(['rev-parse', 'HEAD'], repoPath).stdout);
  const shortSha = normalizeOptionalString(runGit(['rev-parse', '--short', 'HEAD'], repoPath).stdout);
  const originResult = runGit(['remote', 'get-url', 'origin'], repoPath);
  const statusPorcelain = runGit(['status', '--porcelain'], repoPath);
  const upstreamResult = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath);
  const upstreamRef = upstreamResult.exitCode === 0 ? normalizeOptionalString(upstreamResult.stdout) : null;
  if (refreshRemote && originResult.exitCode === 0 && branch && upstreamRef) {
    runRemoteGitWithRetry(['fetch', '--quiet', '--prune', 'origin'], repoPath);
  }

  const upstreamHeadResult = upstreamRef ? runGit(['rev-parse', '@{u}'], repoPath) : null;
  const upstreamHeadSha =
    upstreamHeadResult?.exitCode === 0 ? normalizeOptionalString(upstreamHeadResult.stdout) : null;
  const aheadBehindResult = upstreamRef ? runGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], repoPath) : null;
  let aheadCount: number | null = null;
  let behindCount: number | null = null;
  let syncStatus: GitRepoSnapshot['sync_status'] = upstreamRef ? 'unknown' : 'no_upstream';

  if (aheadBehindResult?.exitCode === 0) {
    const [aheadRaw, behindRaw] = aheadBehindResult.stdout.trim().split(/\s+/);
    const ahead = Number(aheadRaw);
    const behind = Number(behindRaw);
    if (Number.isSafeInteger(ahead) && Number.isSafeInteger(behind)) {
      aheadCount = ahead;
      behindCount = behind;
      if (ahead === 0 && behind === 0) {
        syncStatus = 'synced';
      } else if (ahead > 0 && behind === 0) {
        syncStatus = 'ahead';
      } else if (ahead === 0 && behind > 0) {
        syncStatus = 'behind';
      } else {
        syncStatus = 'diverged';
      }
    }
  }

  return {
    branch,
    head_sha: headSha,
    short_sha: shortSha,
    origin_url: originResult.exitCode === 0 ? normalizeOptionalString(originResult.stdout) : null,
    upstream_ref: upstreamRef,
    upstream_head_sha: upstreamHeadSha,
    ahead_count: aheadCount,
    behind_count: behindCount,
    sync_status: syncStatus,
    dirty: statusPorcelain.stdout.trim().length > 0,
  };
}

function readPackagedModuleGitSnapshot(repoPath: string, spec: DomainModuleSpec): GitRepoSnapshot | null {
  const markerPath = path.join(repoPath, PACKAGED_MODULE_MARKER_FILE);
  if (!fs.existsSync(markerPath) || !fs.statSync(markerPath).isFile()) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (parsed.packaged_runtime !== true || parsed.module_id !== spec.module_id || parsed.repo_name !== spec.repo_name) {
    return null;
  }

  const sourceGit =
    typeof parsed.source_git === 'object' && parsed.source_git !== null
      ? parsed.source_git as Record<string, unknown>
      : {};
  const headSha = normalizeOptionalString(typeof sourceGit.head_sha === 'string' ? sourceGit.head_sha : null);

  return {
    branch: null,
    head_sha: headSha,
    short_sha: headSha ? headSha.slice(0, 12) : null,
    origin_url: spec.repo_url,
    upstream_ref: null,
    upstream_head_sha: null,
    ahead_count: null,
    behind_count: null,
    sync_status: 'no_upstream',
    dirty: false,
  };
}

function isModuleUpdateAvailable(git: GitRepoSnapshot) {
  return !git.dirty && git.sync_status === 'behind';
}

function buildModuleRepoUrlEnvKey(moduleId: OplModuleId) {
  return `OPL_MODULE_REPO_URL_${moduleId.toUpperCase()}`;
}

function buildModulePathEnvKey(moduleId: OplModuleId) {
  return `OPL_MODULE_PATH_${moduleId.toUpperCase()}`;
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
        health_status: 'ready',
        git: packagedGit,
        available_actions: [],
        recommended_action: null,
      };
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

export function buildOplModules() {
  const modules = DOMAIN_MODULE_SPECS.map((spec) => inspectModule(spec));
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
  const cloneResult = runRemoteGitWithRetry(['clone', resolveModuleRepoUrl(spec), checkoutPath]);
  assertGitSuccess(cloneResult, 'Failed to clone the requested OPL module.', {
    module_id: spec.module_id,
    repo_url: resolveModuleRepoUrl(spec),
    checkout_path: checkoutPath,
    git_attempts: resolveRemoteGitRetryAttempts(),
  });
}

function readHomeDir() {
  return process.env.HOME?.trim() || resolveOplStatePaths().home_dir;
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

function runExternalModuleWorkflow(spec: DomainModuleRuntimeSpec, checkoutPath: string) {
  const skill_sync = runModuleSkillSync(spec, checkoutPath);
  const health_check = runModuleHealthCheck(spec, checkoutPath);

  return {
    bootstrap: {
      status: 'skipped',
      summary: 'External developer checkouts are not bootstrapped by OPL.',
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
    },
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

export function runOplModuleAction(
  action: OplModuleAction,
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
      const pullResult = runRemoteGitWithRetry(['pull', '--ff-only'], current.checkout_path);
      assertGitSuccess(pullResult, 'Failed to update the requested OPL module.', {
        module_id: spec.module_id,
        checkout_path: current.checkout_path,
        git_attempts: resolveRemoteGitRetryAttempts(),
      });
      const updated = inspectModule(spec);
      if (updated.install_origin === 'managed_root') {
        workflow = runManagedModuleWorkflow(spec, updated.checkout_path);
      } else {
        workflow = runExternalModuleWorkflow(spec, updated.checkout_path);
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
    module_action: {
      action,
      status: 'completed',
      module: inspectModule(spec),
      turnkey: workflow,
    },
  };
}
