import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';
import { readOplDeveloperSupervisorConfig } from '../../console/index.ts';

function normalize(value: string) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function defaultStateDir() {
  const home = process.env.HOME?.trim() || '';
  return home
    ? path.join(home, 'Library', 'Application Support', 'OPL', 'state')
    : null;
}

function repoRootFromModuleUrl(moduleUrl: string) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '..');
}

function isGitCheckout(root: string) {
  return fs.existsSync(path.join(root, '.git'));
}

function explicitStateDirConfigured() {
  return Boolean(process.env.OPL_STATE_DIR?.trim());
}

function explicitDeveloperOverrideEnabled() {
  return process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER?.trim() === '1';
}

function explicitDeveloperSupervisorWorkerMutationAllowed() {
  try {
    const config = readOplDeveloperSupervisorConfig();
    return {
      allowed:
        config.source === 'user_config'
        && config.enabled === 'on'
        && config.mode === 'developer_apply_safe',
      config: {
        version: config.version,
        enabled: config.enabled,
        mode: config.mode,
        source: config.source,
        auto_enable_github_login: config.auto_enable_github_login,
      },
    };
  } catch (error) {
    return {
      allowed: false,
      config: null,
      error: error instanceof Error ? error.message : 'Unknown developer supervisor config error.',
    };
  }
}

export function buildTemporalWorkerMutationGuard(input: {
  moduleUrl: string;
  paths: TemporalWorkerPaths;
}) {
  const sourceRoot = repoRootFromModuleUrl(input.moduleUrl);
  const sourceIsGitCheckout = isGitCheckout(sourceRoot);
  const explicitStateDir = explicitStateDirConfigured();
  const defaultSharedState = defaultStateDir();
  const stateRoot = path.resolve(input.paths.root);
  const usesDefaultSharedState = defaultSharedState
    ? normalize(stateRoot) === normalize(path.join(defaultSharedState, 'family-runtime'))
    : false;
  const developerOverride = explicitDeveloperOverrideEnabled();
  const developerSupervisor = explicitDeveloperSupervisorWorkerMutationAllowed();
  const blocked = sourceIsGitCheckout
    && usesDefaultSharedState
    && !explicitStateDir
    && !developerOverride
    && !developerSupervisor.allowed;

  return {
    surface_kind: 'temporal_worker_mutation_guard',
    mutation_guard_status: blocked
      ? 'blocked_developer_checkout_shared_state'
      : explicitStateDir
        ? 'allowed_explicit_state_dir'
        : developerOverride
          ? 'allowed_explicit_developer_override'
          : developerSupervisor.allowed
            ? 'allowed_explicit_developer_supervisor'
          : 'allowed_managed_runtime',
    allowed: !blocked,
    source_root: sourceRoot,
    source_is_git_checkout: sourceIsGitCheckout,
    state_root: stateRoot,
    default_shared_state_root: defaultSharedState ? path.join(defaultSharedState, 'family-runtime') : null,
    uses_default_shared_state: usesDefaultSharedState,
    state_dir_explicit: explicitStateDir,
    explicit_developer_override: developerOverride,
    developer_supervisor_override: developerSupervisor.allowed,
    developer_supervisor_config: developerSupervisor.config,
    developer_supervisor_config_error: developerSupervisor.error ?? null,
    authority_boundary: {
      opl: 'provider_worker_lifecycle_mutation_guard',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
    },
  };
}

export function assertTemporalWorkerMutationAllowed(input: {
  moduleUrl: string;
  paths: TemporalWorkerPaths;
}) {
  const mutationGuard = buildTemporalWorkerMutationGuard(input);
  if (mutationGuard.allowed) {
    return mutationGuard;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Temporal worker lifecycle mutation is blocked for developer checkout against the shared OPL state root.',
    {
      provider_kind: 'temporal',
      mutation_guard: mutationGuard,
      repair_action:
        'Run the managed runtime/current OPL CLI, set OPL_STATE_DIR for an isolated developer worker, explicitly enable OPL Developer Mode developer_apply_safe, or set OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER=1.',
    },
  );
}
