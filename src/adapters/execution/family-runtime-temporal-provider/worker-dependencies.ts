import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromHere = createRequire(import.meta.url);

type WorkerDependencyHealth = {
  surface_kind: 'temporal_worker_runtime_dependency_health';
  provider_kind: 'temporal';
  status: 'ready' | 'blocked';
  required_dependency: '@swc/core';
  dependency_owner: '@temporalio/worker workflow bundler';
  module_root: string;
  resolved_path: string | null;
  blocker: null | {
    blocker_kind: 'platform_dependency';
    blocker_id: 'temporal_worker_swc_native_binding_unavailable';
    owner: 'one-person-lab';
    reason: string;
    required_owner_surface: 'OPL managed runtime dependency install/update';
    repair_command: string;
  };
  error_message: string | null;
  authority_boundary: {
    opl: 'worker_runtime_dependency_integrity_only';
    domain: 'truth_quality_artifact_gate_owner';
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_authorize_artifact_gate: false;
  };
};

function repairCommand(moduleRoot: string) {
  const quotedRoot = process.platform === 'win32'
    ? JSON.stringify(moduleRoot)
    : `'${moduleRoot.replaceAll("'", "'\\''")}'`;
  return `cd ${quotedRoot} && npm install --include=optional --ignore-scripts=false`;
}

function dependencyHealth(input: {
  moduleRoot: string;
  resolvedPath: string | null;
  error: unknown;
}): WorkerDependencyHealth {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return {
    surface_kind: 'temporal_worker_runtime_dependency_health',
    provider_kind: 'temporal',
    status: 'blocked',
    required_dependency: '@swc/core',
    dependency_owner: '@temporalio/worker workflow bundler',
    module_root: input.moduleRoot,
    resolved_path: input.resolvedPath,
    blocker: {
      blocker_kind: 'platform_dependency',
      blocker_id: 'temporal_worker_swc_native_binding_unavailable',
      owner: 'one-person-lab',
      reason: 'Temporal workflow bundling requires the SWC native binding that belongs to the OPL managed runtime install.',
      required_owner_surface: 'OPL managed runtime dependency install/update',
      repair_command: repairCommand(input.moduleRoot),
    },
    error_message: message,
    authority_boundary: {
      opl: 'worker_runtime_dependency_integrity_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_gate: false,
    },
  };
}

function temporalWorkerRuntimeModuleRoot(moduleUrl: string) {
  let directory = path.dirname(fileURLToPath(moduleUrl));
  while (true) {
    if (fs.existsSync(path.join(directory, 'package.json'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Temporal worker module is outside a runtime package');
    directory = parent;
  }
}

export function inspectTemporalWorkerRuntimeDependencies(input: {
  moduleUrl?: string;
  dependencyRequire?: NodeJS.Require;
} = {}): WorkerDependencyHealth {
  const moduleRoot = temporalWorkerRuntimeModuleRoot(input.moduleUrl ?? import.meta.url);
  let resolvedPath: string | null = null;
  try {
    const dependencyRequire = input.dependencyRequire
      ?? createRequire(requireFromHere.resolve('@temporalio/worker'));
    resolvedPath = dependencyRequire.resolve('@swc/core');
    dependencyRequire('@swc/core');
    return {
      surface_kind: 'temporal_worker_runtime_dependency_health',
      provider_kind: 'temporal',
      status: 'ready',
      required_dependency: '@swc/core',
      dependency_owner: '@temporalio/worker workflow bundler',
      module_root: moduleRoot,
      resolved_path: resolvedPath,
      blocker: null,
      error_message: null,
      authority_boundary: {
        opl: 'worker_runtime_dependency_integrity_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
        can_authorize_artifact_gate: false,
      },
    };
  } catch (error) {
    return dependencyHealth({ moduleRoot, resolvedPath, error });
  }
}
