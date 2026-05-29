import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';

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
  const blocked = sourceIsGitCheckout
    && usesDefaultSharedState
    && !explicitStateDir
    && !developerOverride;

  return {
    surface_kind: 'temporal_worker_mutation_guard',
    mutation_guard_status: blocked
      ? 'blocked_developer_checkout_shared_state'
      : explicitStateDir
        ? 'allowed_explicit_state_dir'
        : developerOverride
          ? 'allowed_explicit_developer_override'
          : 'allowed_managed_runtime',
    allowed: !blocked,
    source_root: sourceRoot,
    source_is_git_checkout: sourceIsGitCheckout,
    state_root: stateRoot,
    default_shared_state_root: defaultSharedState ? path.join(defaultSharedState, 'family-runtime') : null,
    uses_default_shared_state: usesDefaultSharedState,
    state_dir_explicit: explicitStateDir,
    explicit_developer_override: developerOverride,
    authority_boundary: {
      opl: 'provider_worker_lifecycle_mutation_guard',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
    },
  };
}
