import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { syncFamilySkillPackFromRepoRoot } from '../opl-skills.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  type DomainModuleSpec,
  type GitRepoSnapshot,
  runCommand,
} from './shared.ts';
import type { PackagedModuleMarker } from './module-packaged.ts';

export type DomainModuleRuntimeSpec = DomainModuleSpec & {
  default_install: boolean;
  bootstrap_command?: (checkoutPath: string) => { command: string; args: string[] } | null;
  health_check_command?: (checkoutPath: string) => { command: string; args: string[] } | null;
  exec_command?: (checkoutPath: string, args: string[]) => { command: string; args: string[] } | null;
  skill_sync_domain?: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent' | 'oplbookforge' | 'mas-scholar-skills';
};

export type ModuleActionStepResult = {
  status: 'completed' | 'skipped' | 'blocked';
  summary: string;
  command_preview: string[] | null;
  stdout: string;
  stderr: string;
  result: Record<string, unknown> | null;
  domain_id?: string | null;
};

export type ModuleActionWorkflow = {
  bootstrap: ModuleActionStepResult;
  skill_sync: ModuleActionStepResult;
  health_check: ModuleActionStepResult;
};

type ModuleWorkflowDeps = {
  readPackagedModuleGitSnapshot: (repoPath: string, spec: DomainModuleSpec) => GitRepoSnapshot | null;
  readPackagedModuleMarker?: (repoPath: string, spec: DomainModuleSpec) => PackagedModuleMarker | null;
};

const DEFAULT_MODULE_ACTION_STEP_TIMEOUT_MS = 10 * 60 * 1000;

function resolveModuleActionStepTimeoutMs() {
  const raw = process.env.OPL_MODULE_ACTION_STEP_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_MODULE_ACTION_STEP_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL_MODULE_ACTION_STEP_TIMEOUT_MS must be a positive integer.',
      { env: 'OPL_MODULE_ACTION_STEP_TIMEOUT_MS', value: raw },
    );
  }
  return parsed;
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
    const parsed = parseJsonText(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

  const timeoutMs = resolveModuleActionStepTimeoutMs();
  const result = runCommand(commandPreview.command, commandPreview.args, checkoutPath, {
    timeoutMs,
  });
  if (result.timedOut) {
    return {
      status: 'blocked',
      summary: `OPL module ${stepId} timed out before completion.`,
      command_preview: [commandPreview.command, ...commandPreview.args],
      stdout: result.stdout,
      stderr: result.stderr,
      result: {
        blocker_kind: 'module_action_step_timeout',
        step_id: stepId,
        module_id: spec.module_id,
        timeout_ms: timeoutMs,
        signal: result.signal ?? null,
        authority_boundary: {
          opl: 'startup_maintenance_transport_and_blocker_projection_only',
          domain: 'module_health_and_truth_owner',
          can_claim_module_healthy: false,
          can_claim_production_ready: false,
        },
      },
    } satisfies ModuleActionStepResult;
  }
  if (result.exitCode !== 0) {
    throw new FrameworkContractError(
      'build_command_failed',
      `Failed to run OPL module ${stepId}.`,
      {
        module_id: spec.module_id,
        checkout_path: checkoutPath,
        command: [commandPreview.command, ...commandPreview.args],
        timeout_ms: timeoutMs,
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

function runPackagedModuleHealthCheck(
  spec: DomainModuleRuntimeSpec,
  checkoutPath: string,
  deps: ModuleWorkflowDeps,
) {
  const marker = deps.readPackagedModuleMarker?.(checkoutPath, spec);
  const packagedGit = marker?.source_git ?? deps.readPackagedModuleGitSnapshot(checkoutPath, spec);
  const sourceKind = marker?.source_kind ?? 'full_runtime';
  return {
    status: 'completed',
    summary: sourceKind === 'package_channel'
      ? 'Package-channel module marker is present and matches this module.'
      : 'Packaged Full runtime marker is present and matches this module.',
    command_preview: null,
    stdout: '',
    stderr: '',
    result: {
      packaged_runtime: sourceKind === 'full_runtime',
      package_channel: sourceKind === 'package_channel',
      module_id: spec.module_id,
      repo_name: spec.repo_name,
      source_git: packagedGit,
    },
  } satisfies ModuleActionStepResult;
}

export function runManagedModuleWorkflow(
  spec: DomainModuleRuntimeSpec,
  checkoutPath: string,
  deps: ModuleWorkflowDeps,
) {
  const packagedModule = Boolean(
    deps.readPackagedModuleMarker?.(checkoutPath, spec)
    ?? deps.readPackagedModuleGitSnapshot(checkoutPath, spec),
  );
  const bootstrap = packagedModule
    ? {
      status: 'skipped',
      summary: 'Packaged module sources are already staged; bootstrap is not required.',
      command_preview: null,
      stdout: '',
      stderr: '',
      result: null,
    } satisfies ModuleActionStepResult
    : runModuleBootstrap(spec, checkoutPath);
  const skill_sync = runModuleSkillSync(spec, checkoutPath);
  const health_check = packagedModule
    ? runPackagedModuleHealthCheck(spec, checkoutPath, deps)
    : runModuleHealthCheck(spec, checkoutPath);

  return {
    bootstrap,
    skill_sync,
    health_check,
  } satisfies ModuleActionWorkflow;
}

export function runExternalModuleWorkflow(spec: DomainModuleRuntimeSpec, checkoutPath: string) {
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

export function buildSkippedWorkflow(summary: string): ModuleActionWorkflow {
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
