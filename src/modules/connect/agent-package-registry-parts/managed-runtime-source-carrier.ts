import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  computePackageChannelTreeSha256,
  installManagedModuleFromPackageChannel,
  readPackageChannelLifecycle,
  refreshPackageChannelCurrentSnapshot,
  rollbackManagedModulePackageChannel,
  validateManagedModulePackageChannelRollback,
  type PackageChannelActivationSnapshot,
  type ManagedModulePackageChannelSelection,
} from '../system-installation/module-package-channel.ts';
import {
  resolveManagedModuleCheckoutPath,
  resolveOplDomainModuleSpec,
} from '../system-installation/modules.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { readPackagedModuleMarker } from '../system-installation/module-packaged.ts';
import { runCommand } from '../system-installation/shared.ts';
import { materializeStandardAgentFrameworkLink } from '../standard-agent-framework-link.ts';
import {
  buildDeveloperCheckoutRuntimeSourceState,
  makeDeveloperCheckoutRuntimeSnapshotWritable,
  materializeDeveloperCheckoutRuntimeSnapshot,
  readDeveloperCheckoutSourceIdentity,
} from './developer-checkout-runtime-source.ts';
import type {
  AgentPackageManagedRuntimeSourceCarrier,
  AgentPackageLockIndex,
  AgentPackageManagedRuntimeSourceState,
  AgentPackageSourceKind,
} from './types.ts';

type RuntimeSourceMutationKind =
  | 'none'
  | 'installed_fresh'
  | 'activated_with_previous'
  | 'restored_previous'
  | 'staged_removal';

export type ManagedRuntimeSourceMutation = {
  kind: RuntimeSourceMutationKind;
  module_id: string;
  checkout_path: string;
  before: AgentPackageManagedRuntimeSourceState | null;
  after: AgentPackageManagedRuntimeSourceState | null;
  staged_removal_paths: Array<{ original: string; backup: string }>;
  package_id?: string;
  action?: 'install' | 'update' | 'repair' | 'rollback' | 'uninstall';
  transaction_id?: string;
  marker_path?: string;
  repair_displaced_path?: string | null;
  checkout_existed_before?: boolean;
};

type RuntimeSourceTransactionMarker = {
  surface_kind: 'opl_agent_package_runtime_source_transaction';
  version: 1;
  phase: 'prepared' | 'physical_applied' | 'cleanup_pending';
  mutation: ManagedRuntimeSourceMutation;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

function safeDeveloperRuntimeSnapshotModuleId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value !== '.'
    && value !== '..'
    && path.basename(value) === value;
}

function lstatOrNull(filePath: string) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function developerRuntimeSnapshotRoot() {
  return path.resolve(
    resolveOplStatePaths().state_dir,
    'agent-package-developer-runtime-snapshots',
  );
}

function packageRuntimeGenerationRoot() {
  return path.resolve(
    resolveOplStatePaths().state_dir,
    'agent-package-runtime-generations',
  );
}

function packageRuntimeGenerationModuleRoot(moduleId: string) {
  return path.join(packageRuntimeGenerationRoot(), moduleId);
}

function packageRuntimeGenerationPath(
  moduleId: string,
  selection: ManagedModulePackageChannelSelection,
) {
  if (!safeDeveloperRuntimeSnapshotModuleId(moduleId)
    || !/^sha256:[0-9a-f]{64}$/.test(selection.package_content_digest)) {
    throw sourceFailure('Package runtime generation identity is unsafe.', {
      module_id: moduleId,
      package_content_digest: selection.package_content_digest,
    });
  }
  return path.join(
    packageRuntimeGenerationModuleRoot(moduleId),
    selection.package_content_digest.replace(/^sha256:/, ''),
  );
}

function safePackageRuntimeGenerationPath(value: unknown, moduleId: string) {
  if (!safeDeveloperRuntimeSnapshotModuleId(moduleId)
    || typeof value !== 'string'
    || !path.isAbsolute(value)) return null;
  const resolved = path.resolve(value);
  const moduleRoot = packageRuntimeGenerationModuleRoot(moduleId);
  return path.dirname(resolved) === moduleRoot && SHA256_HEX.test(path.basename(resolved))
    ? resolved
    : null;
}

function realPackageRuntimeGenerationPath(value: unknown, moduleId: string) {
  const resolved = safePackageRuntimeGenerationPath(value, moduleId);
  if (!resolved) return null;
  try {
    const generationRoot = packageRuntimeGenerationRoot();
    const moduleRoot = packageRuntimeGenerationModuleRoot(moduleId);
    const generationRootStat = lstatOrNull(generationRoot);
    const moduleRootStat = lstatOrNull(moduleRoot);
    const resolvedStat = lstatOrNull(resolved);
    for (const stat of [generationRootStat, moduleRootStat, resolvedStat]) {
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) return null;
    }
    if (moduleRootStat) {
      if (!generationRootStat
        || path.dirname(fs.realpathSync(moduleRoot)) !== fs.realpathSync(generationRoot)) {
        return null;
      }
    }
    if (resolvedStat
      && (!moduleRootStat
        || path.dirname(fs.realpathSync(resolved)) !== fs.realpathSync(moduleRoot))) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function developerRuntimeSnapshotModuleRoot(moduleId: string) {
  return path.join(developerRuntimeSnapshotRoot(), moduleId);
}

function safeDeveloperRuntimeSnapshotPath(value: unknown, moduleId: string) {
  if (!safeDeveloperRuntimeSnapshotModuleId(moduleId)
    || typeof value !== 'string'
    || !path.isAbsolute(value)) return null;
  const resolved = path.resolve(value);
  const moduleRoot = developerRuntimeSnapshotModuleRoot(moduleId);
  if (path.dirname(resolved) !== moduleRoot || !SHA256_HEX.test(path.basename(resolved))) {
    return null;
  }
  return resolved;
}

function realDeveloperRuntimeSnapshotPath(value: unknown, moduleId: string) {
  const resolved = safeDeveloperRuntimeSnapshotPath(value, moduleId);
  if (!resolved) return null;
  try {
    const snapshotRoot = developerRuntimeSnapshotRoot();
    const moduleRoot = developerRuntimeSnapshotModuleRoot(moduleId);
    const snapshotRootStat = lstatOrNull(snapshotRoot);
    const moduleRootStat = lstatOrNull(moduleRoot);
    const resolvedStat = lstatOrNull(resolved);
    for (const stat of [snapshotRootStat, moduleRootStat, resolvedStat]) {
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) return null;
    }
    if (moduleRootStat) {
      if (!snapshotRootStat
        || path.dirname(fs.realpathSync(moduleRoot)) !== fs.realpathSync(snapshotRoot)) {
        return null;
      }
    }
    if (resolvedStat
      && (!moduleRootStat
        || path.dirname(fs.realpathSync(resolved)) !== fs.realpathSync(moduleRoot))) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function transactionMarkerDirectory() {
  return path.join(
    resolveOplStatePaths().state_dir,
    'agent-package-runtime-source-transactions',
  );
}

function transactionMarkerPath(packageId: string, transactionId: string) {
  return path.join(transactionMarkerDirectory(), `${packageId}-${transactionId}.json`);
}

function persistTransactionMarker(
  mutation: ManagedRuntimeSourceMutation,
  phase: RuntimeSourceTransactionMarker['phase'],
) {
  if (!mutation.marker_path) return;
  fs.mkdirSync(path.dirname(mutation.marker_path), { recursive: true });
  writeJsonPayloadFile(mutation.marker_path, {
    surface_kind: 'opl_agent_package_runtime_source_transaction',
    version: 1,
    phase,
    mutation,
  } satisfies RuntimeSourceTransactionMarker);
}

function clearTransactionMarker(mutation: ManagedRuntimeSourceMutation) {
  if (mutation.marker_path) fs.rmSync(mutation.marker_path, { force: true });
}

function transactionMutation(input: {
  kind: RuntimeSourceMutationKind;
  packageId: string;
  action: ManagedRuntimeSourceMutation['action'];
  transactionId: string;
  moduleId: string;
  checkoutPath: string;
  before: AgentPackageManagedRuntimeSourceState | null;
  repairDisplacedPath?: string | null;
  checkoutExistedBefore?: boolean;
}): ManagedRuntimeSourceMutation {
  const mutation: ManagedRuntimeSourceMutation = {
    kind: input.kind,
    package_id: input.packageId,
    action: input.action,
    transaction_id: input.transactionId,
    marker_path: transactionMarkerPath(input.packageId, input.transactionId),
    module_id: input.moduleId,
    checkout_path: input.checkoutPath,
    before: input.before,
    after: null,
    staged_removal_paths: [],
    repair_displaced_path: input.repairDisplacedPath ?? null,
    checkout_existed_before: input.checkoutExistedBefore,
  };
  persistTransactionMarker(mutation, 'prepared');
  return mutation;
}

function sourceFailure(message: string, details: Record<string, unknown>) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'agent_package_runtime_source_carrier_invalid',
  });
}

function validateBundledFullRuntimeCheckout(input: {
  checkoutPath: string;
  spec: ReturnType<typeof resolveOplDomainModuleSpec>;
  expectedOwnerSourceCommit: string | null;
}) {
  if (!fs.existsSync(input.checkoutPath)
    || !fs.lstatSync(input.checkoutPath).isDirectory()
    || fs.lstatSync(input.checkoutPath).isSymbolicLink()) {
    throw sourceFailure('Bundled Full runtime source directory is missing or unsafe.', {
      module_id: input.spec.module_id,
      checkout_path: input.checkoutPath,
      expected_source_kind: 'full_runtime',
    });
  }
  const packaged = readPackagedModuleMarker(input.checkoutPath, input.spec);
  if (packaged?.source_kind !== 'full_runtime') {
    throw sourceFailure('Bundled Full runtime source is missing its immutable package marker.', {
      module_id: input.spec.module_id,
      checkout_path: input.checkoutPath,
      expected_source_kind: 'full_runtime',
    });
  }
  if (!/^[0-9a-f]{40}$/.test(input.expectedOwnerSourceCommit ?? '')) {
    throw sourceFailure('Bundled Full runtime source is missing its verified carrier commit.', {
      module_id: input.spec.module_id,
      checkout_path: input.checkoutPath,
      expected_owner_source_commit: input.expectedOwnerSourceCommit,
    });
  }
  if (packaged.source_git.head_sha !== input.expectedOwnerSourceCommit) {
    throw sourceFailure('Bundled Full runtime source does not match the verified Release Set carrier commit.', {
      module_id: input.spec.module_id,
      checkout_path: input.checkoutPath,
      expected_owner_source_commit: input.expectedOwnerSourceCommit,
      actual_owner_source_commit: packaged.source_git.head_sha,
    });
  }
  return {
    sourceGitHeadSha: packaged.source_git.head_sha,
    treeSha256: computePackageChannelTreeSha256(input.checkoutPath),
  };
}

function sourceState(input: {
  config: AgentPackageManagedRuntimeSourceCarrier;
  checkoutPath: string;
  ownership: AgentPackageManagedRuntimeSourceState['ownership'];
  status?: AgentPackageManagedRuntimeSourceState['status'];
  preparation: Pick<AgentPackageManagedRuntimeSourceState,
    'preparation_status'
    | 'bootstrap_command'
    | 'package_prepare_command'
    | 'health_check_command'
    | 'handler_probe_command'
    | 'health_output_sha256'
    | 'handler_probe_output_sha256'
    | 'preparation_root'
    | 'preparation_scope'>;
}): AgentPackageManagedRuntimeSourceState {
  const spec = resolveOplDomainModuleSpec(input.config.module_id);
  const lifecycle = readPackageChannelLifecycle(input.checkoutPath, spec);
  if (!lifecycle || !fs.existsSync(input.checkoutPath)) {
    throw sourceFailure('Managed runtime source carrier is missing package-channel lifecycle metadata.', {
      module_id: input.config.module_id,
      checkout_path: input.checkoutPath,
    });
  }
  const actualTreeSha256 = computePackageChannelTreeSha256(input.checkoutPath);
  if (actualTreeSha256 !== lifecycle.current.tree_sha256) {
    throw sourceFailure('Managed runtime source carrier tree digest does not match its package-channel lifecycle.', {
      module_id: input.config.module_id,
      checkout_path: input.checkoutPath,
      expected_tree_sha256: lifecycle.current.tree_sha256,
      actual_tree_sha256: actualTreeSha256,
    });
  }
  return {
    surface_kind: 'opl_agent_package_managed_runtime_source',
    status: input.status ?? 'current',
    carrier_kind: input.config.carrier_kind,
    module_id: input.config.module_id,
    checkout_path: input.checkoutPath,
    ownership: input.ownership,
    source_mode: 'package_channel',
    channel_version: lifecycle.current.channel_version,
    artifact_ref: lifecycle.current.artifact_ref,
    layer_digest: lifecycle.current.layer_digest,
    source_archive_sha256: lifecycle.current.source_archive_sha256,
    source_git_head_sha: lifecycle.current.source_git_head_sha,
    tree_sha256: lifecycle.current.tree_sha256,
    rollback_ref: lifecycle.rollback_ref,
    preparation_status: input.preparation.preparation_status,
    bootstrap_command: input.preparation.bootstrap_command,
    package_prepare_command: input.preparation.package_prepare_command,
    health_check_command: input.preparation.health_check_command,
    handler_probe_command: input.preparation.handler_probe_command,
    health_output_sha256: input.preparation.health_output_sha256,
    handler_probe_output_sha256: input.preparation.handler_probe_output_sha256,
    preparation_root: input.preparation.preparation_root,
    preparation_scope: input.preparation.preparation_scope,
  };
}

function runtimeSourceMode(
  state: AgentPackageManagedRuntimeSourceState,
  spec: ReturnType<typeof resolveOplDomainModuleSpec>,
) {
  if (state.source_mode) return state.source_mode;
  if (readPackageChannelLifecycle(state.checkout_path, spec)) return 'package_channel' as const;
  if (readPackagedModuleMarker(state.checkout_path, spec)?.source_kind === 'full_runtime') {
    return 'bundled_full_runtime' as const;
  }
  return state.ownership === 'preexisting_adopted'
    ? 'developer_checkout' as const
    : 'package_channel' as const;
}

function validateCurrentState(state: AgentPackageManagedRuntimeSourceState) {
  const spec = resolveOplDomainModuleSpec(state.module_id);
  const sourceMode = runtimeSourceMode(state, spec);
  if (sourceMode === 'developer_checkout' && fs.existsSync(state.checkout_path)) {
    if (state.preparation_scope === 'developer_snapshot_root'
      && realDeveloperRuntimeSnapshotPath(state.checkout_path, state.module_id) === null) {
      throw sourceFailure('Developer runtime snapshot path is outside its managed immutable root or contains a symbolic link.', {
        module_id: state.module_id,
        checkout_path: state.checkout_path,
      });
    }
    return { ...state, source_mode: sourceMode };
  }
  if (
    sourceMode === 'bundled_full_runtime'
    && state.ownership === 'preexisting_adopted'
    && fs.existsSync(state.checkout_path)
  ) {
    const verified = validateBundledFullRuntimeCheckout({
      checkoutPath: state.checkout_path,
      spec,
      expectedOwnerSourceCommit: state.source_git_head_sha,
    });
    return {
      ...state,
      source_mode: sourceMode,
      source_git_head_sha: verified.sourceGitHeadSha,
      tree_sha256: verified.treeSha256,
    };
  }
  const current = sourceState({
    config: { carrier_kind: state.carrier_kind, module_id: state.module_id },
    checkoutPath: state.checkout_path,
    ownership: state.ownership,
    preparation: state,
  });
  if (current.channel_version !== state.channel_version
    || current.artifact_ref !== state.artifact_ref
    || current.layer_digest !== state.layer_digest
    || current.source_archive_sha256 !== state.source_archive_sha256
    || current.source_git_head_sha !== state.source_git_head_sha
    || current.tree_sha256 !== state.tree_sha256) {
    throw sourceFailure('Managed runtime source carrier no longer matches its persisted lock identity.', {
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: current.tree_sha256,
    });
  }
  return current;
}

function packageChannelSnapshotMatchesState(
  snapshot: PackageChannelActivationSnapshot,
  state: AgentPackageManagedRuntimeSourceState,
) {
  return snapshot.channel_version === state.channel_version
    && snapshot.artifact_ref === state.artifact_ref
    && snapshot.layer_digest === state.layer_digest
    && snapshot.source_archive_sha256 === state.source_archive_sha256
    && snapshot.source_git_head_sha === state.source_git_head_sha
    && snapshot.tree_sha256 === state.tree_sha256;
}

function commandDigest(stdout: string, stderr: string) {
  return `sha256:${crypto.createHash('sha256').update(stdout).update('\0').update(stderr).digest('hex')}`;
}

function runRequiredCommand(
  moduleId: string,
  checkoutPath: string,
  commandSpec: { command: string; args: string[] } | null,
  step: 'bootstrap' | 'package_prepare' | 'health_check' | 'handler_probe',
  env: NodeJS.ProcessEnv,
) {
  if (!commandSpec) {
    throw sourceFailure(`Managed runtime source carrier is missing its ${step} command.`, {
      module_id: moduleId,
      checkout_path: checkoutPath,
      step,
    });
  }
  const result = runCommand(commandSpec.command, commandSpec.args, checkoutPath, {
    timeoutMs: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env,
  });
  if (result.exitCode !== 0 || result.timedOut) {
    throw new FrameworkContractError('build_command_failed', `Managed runtime source ${step} failed.`, {
      module_id: moduleId,
      checkout_path: checkoutPath,
      step,
      command: [commandSpec.command, ...commandSpec.args],
      exit_code: result.exitCode,
      timed_out: result.timedOut === true,
      stdout: result.stdout,
      stderr: result.stderr,
      failure_code: 'agent_package_runtime_source_preparation_failed',
    });
  }
  return {
    command: [commandSpec.command, ...commandSpec.args],
    outputSha256: commandDigest(result.stdout, result.stderr),
  };
}

function packageHealthCommand(moduleId: string, checkoutPath: string) {
  const spec = resolveOplDomainModuleSpec(moduleId);
  return spec.package_health_check_command?.(checkoutPath)
    ?? spec.runtime_probe_command?.(checkoutPath)
    ?? spec.exec_command?.(checkoutPath, ['--help'])
    ?? null;
}

function prepareRuntimeSource(
  moduleId: string,
  checkoutPath: string,
  includeBootstrap: boolean,
  packageProbeOnly = false,
) {
  const spec = resolveOplDomainModuleSpec(moduleId);
  const lifecycle = readPackageChannelLifecycle(checkoutPath, spec);
  if (!lifecycle) {
    throw sourceFailure('Managed runtime source preparation requires package-channel lifecycle metadata.', {
      module_id: moduleId,
      checkout_path: checkoutPath,
    });
  }
  const preparationRoot = path.join(
    ensureOplStateDir(resolveOplStatePaths()).state_dir,
    'agent-package-runtime-envs',
    moduleId,
    lifecycle.current.tree_sha256,
  );
  const managedPackageScope = includeBootstrap || packageProbeOnly;
  const commandEnv = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: path.join(preparationRoot, 'python-cache'),
    ...(managedPackageScope
      ? {
        HOME: path.join(preparationRoot, 'home'),
        UV_TOOL_DIR: path.join(preparationRoot, 'uv-tools'),
        UV_TOOL_BIN_DIR: path.join(preparationRoot, 'bin'),
        XDG_CACHE_HOME: path.join(preparationRoot, 'cache'),
        npm_config_cache: path.join(preparationRoot, 'npm-cache'),
        PATH: `${path.join(preparationRoot, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
      }
      : {}),
  };
  if (managedPackageScope) fs.mkdirSync(commandEnv.HOME!, { recursive: true });
  const bootstrap = includeBootstrap
    ? runRequiredCommand(
      moduleId,
      checkoutPath,
      spec.package_bootstrap_command?.(checkoutPath) ?? spec.bootstrap_command?.(checkoutPath) ?? null,
      'bootstrap',
      commandEnv,
    )
    : null;
  if (includeBootstrap) materializeStandardAgentFrameworkLink({ agentRoot: checkoutPath });
  const packagePrepare = includeBootstrap && spec.package_prepare_command
    ? runRequiredCommand(
      moduleId,
      checkoutPath,
      spec.package_prepare_command(checkoutPath),
      'package_prepare',
      commandEnv,
    )
    : null;
  const health = runRequiredCommand(
    moduleId,
    checkoutPath,
    managedPackageScope ? packageHealthCommand(moduleId, checkoutPath) : spec.health_check_command?.(checkoutPath) ?? null,
    'health_check',
    commandEnv,
  );
  const handler = runRequiredCommand(
    moduleId,
    checkoutPath,
    spec.runtime_probe_command?.(checkoutPath)
      ?? spec.exec_command?.(checkoutPath, ['--help'])
      ?? null,
    'handler_probe',
    commandEnv,
  );
  return {
    preparation_status: 'completed' as const,
    bootstrap_command: bootstrap?.command ?? null,
    package_prepare_command: packagePrepare?.command ?? null,
    health_check_command: health.command,
    handler_probe_command: handler.command,
    health_output_sha256: health.outputSha256,
    handler_probe_output_sha256: handler.outputSha256,
    preparation_root: managedPackageScope ? preparationRoot : null,
    preparation_scope: managedPackageScope ? 'managed_source_root' as const : 'preexisting_read_only_probe' as const,
  };
}

function currentProbeEnvironment(state: AgentPackageManagedRuntimeSourceState) {
  if (!state.preparation_root) {
    return {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    };
  }
  return {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: path.join(state.preparation_root, 'python-cache'),
    HOME: path.join(state.preparation_root, 'home'),
    UV_TOOL_DIR: path.join(state.preparation_root, 'uv-tools'),
    UV_TOOL_BIN_DIR: path.join(state.preparation_root, 'bin'),
    XDG_CACHE_HOME: path.join(state.preparation_root, 'cache'),
    npm_config_cache: path.join(state.preparation_root, 'npm-cache'),
    PATH: `${path.join(state.preparation_root, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  };
}

function resolvedCurrentProbeCommands(state: AgentPackageManagedRuntimeSourceState) {
  const spec = resolveOplDomainModuleSpec(state.module_id);
  const developerSnapshot = state.preparation_scope === 'developer_snapshot_root';
  const immutablePackagedRuntime = state.source_mode === 'bundled_full_runtime';
  const health = state.preparation_scope === 'managed_source_root' || immutablePackagedRuntime
    ? packageHealthCommand(state.module_id, state.checkout_path)
    : developerSnapshot
      ? (spec.package_health_check_command
        ?? spec.runtime_probe_command
        ?? spec.health_check_command)?.(state.checkout_path) ?? null
      : spec.health_check_command?.(state.checkout_path) ?? null;
  const handler = spec.runtime_probe_command?.(state.checkout_path)
    ?? (developerSnapshot ? spec.package_health_check_command?.(state.checkout_path) : null)
    ?? spec.exec_command?.(state.checkout_path, ['--help'])
    ?? null;
  return {
    health,
    handler,
    healthCommand: health ? [health.command, ...health.args] : [],
    handlerCommand: handler ? [handler.command, ...handler.args] : [],
  };
}

function matchingCommand(left: string[], right: string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function probeCurrentRuntimeSource(
  state: AgentPackageManagedRuntimeSourceState,
  commands: ReturnType<typeof resolvedCurrentProbeCommands>,
) {
  const env = currentProbeEnvironment(state);
  runRequiredCommand(
    state.module_id,
    state.checkout_path,
    commands.health,
    'health_check',
    env,
  );
  runRequiredCommand(
    state.module_id,
    state.checkout_path,
    commands.handler,
    'handler_probe',
    env,
  );
}

function managedRuntimeCheckoutIsDirectory(checkoutPath: string) {
  try {
    const stat = fs.lstatSync(checkoutPath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function developerCheckoutReadiness(state: AgentPackageManagedRuntimeSourceState) {
  const managedSnapshot = state.preparation_scope === 'developer_snapshot_root';
  if (managedSnapshot
    && realDeveloperRuntimeSnapshotPath(state.checkout_path, state.module_id) === null) {
    return {
      status: 'incompatible' as const,
      operational_ready: false,
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: null,
      reason: 'managed_runtime_source_snapshot_path_invalid',
    };
  }
  let actualRuntimeSnapshotSha256: string | null = null;
  let snapshotFailureReason: string | null = null;
  if (managedSnapshot) {
    if (typeof state.runtime_snapshot_sha256 !== 'string'
      || !SHA256_HEX.test(state.runtime_snapshot_sha256)) {
      snapshotFailureReason = 'managed_runtime_source_snapshot_digest_missing';
    } else {
      try {
        actualRuntimeSnapshotSha256 = computePackageChannelTreeSha256(state.checkout_path);
        if (actualRuntimeSnapshotSha256 !== state.runtime_snapshot_sha256) {
          snapshotFailureReason = 'managed_runtime_source_snapshot_integrity_mismatch';
        }
      } catch {
        snapshotFailureReason = 'managed_runtime_source_snapshot_invalid';
      }
    }
  }
  let probeFailed = false;
  if (!snapshotFailureReason) {
    try {
      probeCurrentRuntimeSource(state, resolvedCurrentProbeCommands(state));
    } catch {
      probeFailed = true;
    }
  }
  if (managedSnapshot && !snapshotFailureReason && !probeFailed) {
    try {
      actualRuntimeSnapshotSha256 = computePackageChannelTreeSha256(state.checkout_path);
      if (actualRuntimeSnapshotSha256 !== state.runtime_snapshot_sha256) {
        snapshotFailureReason = 'managed_runtime_source_snapshot_integrity_mismatch';
      }
    } catch {
      snapshotFailureReason = 'managed_runtime_source_snapshot_invalid';
    }
  }

  let actualSourceGitHeadSha: string | null = null;
  let actualTreeSha256: string | null = null;
  try {
    const identity = readDeveloperCheckoutSourceIdentity(
      state.source_checkout_path ?? state.checkout_path,
    );
    actualSourceGitHeadSha = identity.source_git_head_sha;
    actualTreeSha256 = identity.tree_sha256;
  } catch {
    // Source identity is provenance for a developer checkout; live probes decide readiness.
  }
  const identityUnavailable = actualTreeSha256 === null;
  const identityChanged = !identityUnavailable && (
    actualTreeSha256 !== state.tree_sha256
    || actualSourceGitHeadSha !== state.source_git_head_sha
  );
  const snapshotIdentityUnavailable = managedSnapshot
    && (!state.runtime_snapshot_sha256 || actualRuntimeSnapshotSha256 === null);
  const snapshotIdentityChanged = managedSnapshot
    && !snapshotIdentityUnavailable
    && actualRuntimeSnapshotSha256 !== state.runtime_snapshot_sha256;
  const operationalReady = !probeFailed && !snapshotFailureReason;

  return {
    status: operationalReady ? 'current' as const : 'incompatible' as const,
    operational_ready: operationalReady,
    module_id: state.module_id,
    checkout_path: state.checkout_path,
    expected_tree_sha256: state.tree_sha256,
    actual_tree_sha256: actualTreeSha256,
    reason: snapshotFailureReason
      ?? (probeFailed ? 'managed_runtime_source_probe_failed' : null),
    provenance_observation: {
      policy: 'observation_only' as const,
      status: identityUnavailable
        ? 'unavailable' as const
        : identityChanged ? 'changed' as const : 'unchanged' as const,
      recorded_source_git_head_sha: state.source_git_head_sha,
      actual_source_git_head_sha: actualSourceGitHeadSha,
      recorded_tree_sha256: state.tree_sha256,
      actual_tree_sha256: actualTreeSha256,
      runtime_snapshot: managedSnapshot ? {
        status: snapshotIdentityUnavailable
          ? 'unavailable' as const
          : snapshotIdentityChanged ? 'changed' as const : 'unchanged' as const,
        recorded_sha256: state.runtime_snapshot_sha256 ?? null,
        actual_sha256: actualRuntimeSnapshotSha256,
      } : null,
    },
  };
}

export function managedRuntimeSourceReadiness(
  state: AgentPackageManagedRuntimeSourceState | null | undefined,
  declaration: AgentPackageManagedRuntimeSourceCarrier | null | undefined = null,
) {
  if (!state) {
    if (declaration) {
      const spec = resolveOplDomainModuleSpec(declaration.module_id);
      return {
        status: 'missing' as const,
        operational_ready: false,
        module_id: declaration.module_id,
        checkout_path: resolveManagedModuleCheckoutPath(spec),
        expected_tree_sha256: null,
        actual_tree_sha256: null,
        reason: 'managed_runtime_source_lock_missing',
      };
    }
    return {
      status: 'not_required' as const,
      operational_ready: true,
      module_id: null,
      checkout_path: null,
      expected_tree_sha256: null,
      actual_tree_sha256: null,
      reason: null,
    };
  }
  if (!managedRuntimeCheckoutIsDirectory(state.checkout_path)) {
    return {
      status: 'missing' as const,
      operational_ready: false,
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: null,
      reason: 'managed_runtime_source_missing',
    };
  }
  try {
    const spec = resolveOplDomainModuleSpec(state.module_id);
    const sourceMode = runtimeSourceMode(state, spec);
    if (sourceMode === 'developer_checkout') {
      return developerCheckoutReadiness(state);
    }
    const commands = resolvedCurrentProbeCommands(state);
    const readImmutableIdentity = () => {
      const lifecycle = readPackageChannelLifecycle(state.checkout_path, spec);
      const packaged = readPackagedModuleMarker(state.checkout_path, spec);
      const actualTreeSha256 = computePackageChannelTreeSha256(state.checkout_path);
      if ((sourceMode === 'package_channel' && !lifecycle)
        || (sourceMode === 'bundled_full_runtime' && !packaged)) {
        throw new Error('immutable runtime identity metadata is missing');
      }
      return {
        lifecycle,
        packaged,
        actualTreeSha256,
        actualSourceGitHeadSha: sourceMode === 'bundled_full_runtime'
          ? packaged?.source_git.head_sha ?? null
          : lifecycle?.current.source_git_head_sha ?? null,
        actualLayerDigest: sourceMode === 'package_channel'
          ? lifecycle?.current.layer_digest ?? null
          : null,
      };
    };
    let identity: ReturnType<typeof readImmutableIdentity>;
    const immutableIdentityChanged = (candidate: ReturnType<typeof readImmutableIdentity>) =>
      candidate.actualTreeSha256 !== state.tree_sha256
      || candidate.actualSourceGitHeadSha !== state.source_git_head_sha
      || candidate.actualLayerDigest !== state.layer_digest
      || (sourceMode === 'package_channel' && (
        candidate.lifecycle!.current.channel_version !== state.channel_version
        || candidate.lifecycle!.current.artifact_ref !== state.artifact_ref
        || candidate.lifecycle!.current.source_archive_sha256 !== state.source_archive_sha256
      ));
    try {
      identity = readImmutableIdentity();
    } catch {
      return {
        status: 'incompatible' as const,
        operational_ready: false,
        module_id: state.module_id,
        checkout_path: state.checkout_path,
        expected_tree_sha256: state.tree_sha256,
        actual_tree_sha256: null,
        reason: 'managed_runtime_source_identity_unavailable',
      };
    }
    const commandChanged = sourceMode === 'package_channel'
      && (!matchingCommand(commands.healthCommand, state.health_check_command)
        || !matchingCommand(commands.handlerCommand, state.handler_probe_command));
    const identityChanged = immutableIdentityChanged(identity);
    if (identityChanged || commandChanged) {
      return {
        status: 'incompatible' as const,
        operational_ready: false,
        module_id: state.module_id,
        checkout_path: state.checkout_path,
        expected_tree_sha256: state.tree_sha256,
        actual_tree_sha256: identity.actualTreeSha256,
        reason: identityChanged
          ? 'managed_runtime_source_identity_mismatch'
          : 'managed_runtime_source_command_drift',
      };
    }
    try {
      probeCurrentRuntimeSource(state, commands);
    } catch {
      return {
        status: 'incompatible' as const,
        operational_ready: false,
        module_id: state.module_id,
        checkout_path: state.checkout_path,
        expected_tree_sha256: state.tree_sha256,
        actual_tree_sha256: identity.actualTreeSha256,
        reason: 'managed_runtime_source_probe_failed',
      };
    }
    try {
      identity = readImmutableIdentity();
    } catch {
      return {
        status: 'incompatible' as const,
        operational_ready: false,
        module_id: state.module_id,
        checkout_path: state.checkout_path,
        expected_tree_sha256: state.tree_sha256,
        actual_tree_sha256: null,
        reason: 'managed_runtime_source_identity_unavailable',
      };
    }
    const postProbeIdentityChanged = immutableIdentityChanged(identity);
    return {
      status: postProbeIdentityChanged ? 'incompatible' as const : 'current' as const,
      operational_ready: !postProbeIdentityChanged,
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: identity.actualTreeSha256,
      reason: postProbeIdentityChanged ? 'managed_runtime_source_identity_mismatch' : null,
    };
  } catch {
    return {
      status: 'incompatible' as const,
      operational_ready: false,
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: null,
      reason: 'managed_runtime_source_lifecycle_invalid',
    };
  }
}

export function managedRuntimeSourceLockReadiness(
  state: AgentPackageManagedRuntimeSourceState | null | undefined,
  declaration: AgentPackageManagedRuntimeSourceCarrier | null | undefined = null,
) {
  if (!state) {
    return declaration
      ? {
          status: 'missing' as const,
          operational_ready: false,
          module_id: declaration.module_id,
          checkout_path: resolveManagedModuleCheckoutPath(resolveOplDomainModuleSpec(declaration.module_id)),
          expected_tree_sha256: null,
          actual_tree_sha256: null,
          reason: 'managed_runtime_source_lock_missing',
        }
      : {
          status: 'not_required' as const,
          operational_ready: true,
          module_id: null,
          checkout_path: null,
          expected_tree_sha256: null,
          actual_tree_sha256: null,
          reason: null,
        };
  }
  if (!managedRuntimeCheckoutIsDirectory(state.checkout_path)) {
    return {
      status: 'missing' as const,
      operational_ready: false,
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: null,
      reason: 'managed_runtime_source_missing',
    };
  }
  const preparationReady = state.source_mode === 'bundled_full_runtime'
    || state.preparation_status === 'completed';
  const operationalReady = state.status === 'current' && preparationReady;
  return {
    status: operationalReady ? 'current' as const : 'incompatible' as const,
    operational_ready: operationalReady,
    module_id: state.module_id,
    checkout_path: state.checkout_path,
    expected_tree_sha256: state.tree_sha256,
    actual_tree_sha256: null,
    reason: operationalReady ? null : 'managed_runtime_source_lock_not_current',
  };
}

export function applyManagedRuntimeSourceCarrier(input: {
  config: AgentPackageManagedRuntimeSourceCarrier | null;
  previous: AgentPackageManagedRuntimeSourceState | null | undefined;
  action: 'install' | 'update' | 'repair';
  dryRun: boolean;
  packageId?: string;
  transactionId?: string;
  sourceKind?: AgentPackageSourceKind;
  checkoutPath?: string | null;
  packageChannelSelection?: ManagedModulePackageChannelSelection | null;
  expectedDeveloperSourceIdentity?: {
    source_git_head_sha: string | null;
    tree_sha256: string;
  } | null;
  verifiedCarrierSourceCommit?: string | null;
}): ManagedRuntimeSourceMutation {
  if (!input.config) {
    return {
      kind: 'none',
      module_id: '',
      checkout_path: '',
      before: null,
      after: null,
      staged_removal_paths: [],
    };
  }
  if (input.previous && input.previous.module_id !== input.config.module_id) {
    throw sourceFailure('Managed runtime source carrier module identity cannot change in place.', {
      previous_module_id: input.previous.module_id,
      next_module_id: input.config.module_id,
      manual_confirmation_path: 'uninstall the package, review the new runtime source carrier, then install explicitly',
    });
  }
  const spec = resolveOplDomainModuleSpec(input.config.module_id);
  const requestedCheckoutPath = input.checkoutPath
    ? path.resolve(input.checkoutPath)
    : resolveManagedModuleCheckoutPath(spec);
  const immutablePackageGeneration = input.sourceKind === 'first_party_managed_cohort'
    && input.packageChannelSelection
    ? packageRuntimeGenerationPath(input.config.module_id, input.packageChannelSelection)
    : null;
  const checkoutPath = immutablePackageGeneration ?? requestedCheckoutPath;
  if (immutablePackageGeneration
    && realPackageRuntimeGenerationPath(checkoutPath, input.config.module_id) === null) {
    throw sourceFailure('Package runtime generation path is unsafe.', {
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
    });
  }
  const existed = fs.existsSync(checkoutPath);
  const developerCheckout = input.sourceKind === 'developer_checkout_override';
  if (developerCheckout && !input.checkoutPath) {
    throw sourceFailure('Developer checkout runtime source requires an explicit agent root.', {
      module_id: input.config.module_id,
      source_kind: input.sourceKind,
    });
  }
  if (developerCheckout && (!existed || !fs.statSync(checkoutPath).isDirectory())) {
    throw sourceFailure('Developer checkout runtime source must reference an existing directory.', {
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      source_kind: input.sourceKind,
    });
  }
  const sameCheckout = input.previous
    ? path.resolve(input.previous.checkout_path) === checkoutPath
    : false;
  const ownership = sameCheckout
    ? input.previous!.ownership
    : existed ? 'preexisting_adopted' : 'package_created';
  let before: AgentPackageManagedRuntimeSourceState | null = null;
  if (input.previous) {
    if (input.sourceKind === 'bundled_full_runtime_modules'
      || (developerCheckout && input.action === 'install')) {
      before = input.previous;
    } else {
      try {
        before = validateCurrentState(input.previous);
      } catch (error) {
        if (input.action !== 'repair' || input.previous.ownership !== 'package_created') throw error;
        before = input.previous;
      }
    }
  }
  if (input.sourceKind === 'bundled_full_runtime_modules') {
    const expectedOwnerSourceCommit = input.verifiedCarrierSourceCommit ?? null;
    const verified = validateBundledFullRuntimeCheckout({
      checkoutPath,
      spec,
      expectedOwnerSourceCommit,
    });
    const after: AgentPackageManagedRuntimeSourceState = {
      surface_kind: 'opl_agent_package_managed_runtime_source',
      status: input.dryRun ? 'validated_no_write' : 'current',
      carrier_kind: input.config.carrier_kind,
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      ownership: 'preexisting_adopted',
      source_mode: 'bundled_full_runtime',
      channel_version: null,
      artifact_ref: null,
      layer_digest: null,
      source_archive_sha256: null,
      source_git_head_sha: verified.sourceGitHeadSha,
      tree_sha256: verified.treeSha256,
      rollback_ref: null,
      preparation_status: 'validated_no_write',
      bootstrap_command: null,
      health_check_command: [],
      handler_probe_command: [],
      health_output_sha256: null,
      handler_probe_output_sha256: null,
      preparation_root: null,
      preparation_scope: 'preexisting_read_only_probe',
    };
    return {
      kind: 'none',
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      before: before ?? after,
      after,
      staged_removal_paths: [],
    };
  }
  if (input.dryRun) {
    if (developerCheckout) {
      const previewSnapshot = materializeDeveloperCheckoutRuntimeSnapshot({
        moduleId: input.config.module_id,
        checkoutPath,
        dryRun: true,
        expectedSourceIdentity: input.expectedDeveloperSourceIdentity,
      });
      return {
        kind: 'none',
        module_id: input.config.module_id,
        checkout_path: checkoutPath,
        before,
        after: buildDeveloperCheckoutRuntimeSourceState({
          config: input.config,
          checkoutPath,
          status: 'validated_no_write',
          dryRun: true,
          sourceIdentity: previewSnapshot.sourceIdentity,
        }),
        staged_removal_paths: [],
      };
    }
    const baseline = sameCheckout && before ? before : {
      surface_kind: 'opl_agent_package_managed_runtime_source' as const,
      status: 'validated_no_write' as const,
      carrier_kind: input.config.carrier_kind,
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      ownership,
      source_mode: 'package_channel' as const,
      channel_version: null,
      artifact_ref: null,
      layer_digest: null,
      source_archive_sha256: null,
      source_git_head_sha: null,
      tree_sha256: '',
      rollback_ref: null,
      preparation_status: 'validated_no_write' as const,
      bootstrap_command: null,
      health_check_command: [],
      handler_probe_command: [],
      health_output_sha256: null,
      handler_probe_output_sha256: null,
      preparation_root: null,
      preparation_scope: 'managed_source_root' as const,
    };
    const preview = input.packageChannelSelection
      ? {
          ...baseline,
          channel_version: input.packageChannelSelection.package_version,
          artifact_ref: `${input.packageChannelSelection.source_artifact_ref.replace(/@sha256:[0-9a-f]{64}$/, '')}@${input.packageChannelSelection.artifact_digest}`,
          layer_digest: null,
          source_archive_sha256: input.packageChannelSelection.package_content_digest.replace(/^sha256:/, ''),
          source_git_head_sha: input.packageChannelSelection.owner_source_commit ?? null,
        }
      : baseline;
    return {
      kind: 'none',
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      before,
      after: { ...preview, status: 'validated_no_write' },
      staged_removal_paths: [],
    };
  }
  if (developerCheckout) {
    const snapshot = materializeDeveloperCheckoutRuntimeSnapshot({
      moduleId: input.config.module_id,
      checkoutPath,
      dryRun: false,
      expectedSourceIdentity: input.expectedDeveloperSourceIdentity,
    });
    let after: AgentPackageManagedRuntimeSourceState;
    try {
      after = buildDeveloperCheckoutRuntimeSourceState({
        config: input.config,
        checkoutPath: snapshot.snapshotPath,
        status: 'current',
        dryRun: false,
        sourceCheckoutPath: checkoutPath,
        sourceIdentity: snapshot.sourceIdentity,
        runtimeSnapshotSha256: snapshot.runtimeSnapshotSha256,
      });
    } catch (error) {
      if (snapshot.created) {
        makeDeveloperCheckoutRuntimeSnapshotWritable(snapshot.snapshotPath);
        fs.rmSync(snapshot.snapshotPath, { recursive: true, force: true });
      }
      throw error;
    }
    const sameSnapshot = input.previous
      && path.resolve(input.previous.checkout_path) === path.resolve(snapshot.snapshotPath);
    const mutation = sameSnapshot ? null : transactionMutation({
      kind: 'installed_fresh',
      packageId: input.packageId ?? input.config.module_id,
      action: input.action,
      transactionId: input.transactionId ?? `${input.action}-${process.pid}`,
      moduleId: input.config.module_id,
      checkoutPath: snapshot.snapshotPath,
      before,
      checkoutExistedBefore: !snapshot.created,
    });
    if (mutation) {
      mutation.after = after;
      persistTransactionMarker(mutation, 'physical_applied');
    }
    return mutation ?? {
      kind: 'none',
      module_id: input.config.module_id,
      checkout_path: snapshot.snapshotPath,
      before,
      after,
      staged_removal_paths: [],
    };
  }
  const packageId = input.packageId ?? input.config.module_id;
  const transactionId = input.transactionId ?? `${input.action}-${process.pid}`;
  if (immutablePackageGeneration && existed) {
    const lifecycle = readPackageChannelLifecycle(checkoutPath, spec);
    const selection = input.packageChannelSelection!;
    const immutableArtifactRef = `${selection.source_artifact_ref.replace(/@sha256:[0-9a-f]{64}$/, '')}@${selection.artifact_digest}`;
    if (!lifecycle
      || lifecycle.current.channel_version !== selection.package_version
      || lifecycle.current.artifact_ref !== immutableArtifactRef
      || lifecycle.current.source_archive_sha256 !== selection.package_content_digest.replace(/^sha256:/, '')) {
      throw sourceFailure('Existing package runtime generation does not match its content-addressed identity.', {
        module_id: input.config.module_id,
        checkout_path: checkoutPath,
        package_content_digest: selection.package_content_digest,
      });
    }
    const preparation = prepareRuntimeSource(input.config.module_id, checkoutPath, false, true);
    const after = sourceState({
      config: input.config,
      checkoutPath,
      ownership: 'package_created',
      preparation,
    });
    return {
      kind: 'none',
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      before,
      after,
      staged_removal_paths: [],
    };
  }
  if (input.action === 'install' && existed) {
    materializeStandardAgentFrameworkLink({ agentRoot: checkoutPath });
    const preparation = prepareRuntimeSource(input.config.module_id, checkoutPath, false);
    refreshPackageChannelCurrentSnapshot(checkoutPath, spec);
    const after = sourceState({ config: input.config, checkoutPath, ownership, preparation });
    return {
      kind: 'none',
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      before: before ?? after,
      after,
      staged_removal_paths: [],
    };
  }
  const mutationKind = immutablePackageGeneration
    ? 'installed_fresh'
    : existed ? 'activated_with_previous' : 'installed_fresh';
  const repairDisplacedPath = input.action === 'repair' && existed
    ? `${checkoutPath}.repair-displaced-${transactionId}`
    : null;
  const mutation = transactionMutation({
    kind: mutationKind,
    packageId,
    action: input.action,
    transactionId,
    moduleId: input.config.module_id,
    checkoutPath,
    before,
    repairDisplacedPath,
    checkoutExistedBefore: existed,
  });
  if (process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED === '1'
    && process.env.OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_PREPARE_APPLY === '1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Injected interruption after runtime source prepare marker.', {
      failure_code: 'test_runtime_source_interrupted_after_prepare_apply',
    });
  }
  let activated = false;
  try {
    const activation = installManagedModuleFromPackageChannel(spec, checkoutPath, {
      repairTransactionId: input.action === 'repair' ? transactionId : null,
      selection: input.packageChannelSelection,
    });
    activated = activation.status === 'updated';
    mutation.repair_displaced_path = activation?.repair_displaced_path ?? null;
    materializeStandardAgentFrameworkLink({ agentRoot: checkoutPath });
    const preparation = prepareRuntimeSource(input.config.module_id, checkoutPath, activated, !activated);
    if (!activated) {
      refreshPackageChannelCurrentSnapshot(checkoutPath, spec);
      clearTransactionMarker(mutation);
      return {
        ...mutation,
        kind: 'none',
        after: sourceState({ config: input.config, checkoutPath, ownership, preparation }),
      };
    }
    refreshPackageChannelCurrentSnapshot(checkoutPath, spec);
    const after = sourceState({ config: input.config, checkoutPath, ownership, preparation });
    mutation.after = after;
    persistTransactionMarker(mutation, 'physical_applied');
    return mutation;
  } catch (error) {
    if (activated) {
      rollbackManagedRuntimeSourceMutation(mutation);
    } else clearTransactionMarker(mutation);
    throw error;
  }
}

function stagedRemovalPaths(state: AgentPackageManagedRuntimeSourceState, transactionId: string) {
  if (state.source_mode === 'developer_checkout'
    && state.preparation_scope === 'developer_snapshot_root') {
    const snapshotPath = realDeveloperRuntimeSnapshotPath(state.checkout_path, state.module_id);
    if (!snapshotPath) {
      throw sourceFailure('Developer runtime snapshot cannot be removed outside its managed immutable root.', {
        module_id: state.module_id,
        checkout_path: state.checkout_path,
      });
    }
    return fs.existsSync(snapshotPath)
      ? [{ original: snapshotPath, backup: `${snapshotPath}.opl-package-remove-${transactionId}-0` }]
      : [];
  }
  if (state.source_mode === 'package_channel') {
    const generationPath = realPackageRuntimeGenerationPath(state.checkout_path, state.module_id);
    if (generationPath) {
      return [{
        original: generationPath,
        backup: `${generationPath}.opl-package-remove-${transactionId}-0`,
      }];
    }
  }
  const runtimeEnvironmentModuleRoot = state.preparation_root
    ? path.dirname(state.preparation_root)
    : null;
  const roots = [
    state.checkout_path,
    `${state.checkout_path}.previous`,
    ...(runtimeEnvironmentModuleRoot ? [runtimeEnvironmentModuleRoot] : []),
  ];
  return roots.flatMap((original, index) => fs.existsSync(original)
    ? [{ original, backup: `${original}.opl-package-remove-${transactionId}-${index}` }]
    : []);
}

export function removeManagedRuntimeSourceCarrier(input: {
  state: AgentPackageManagedRuntimeSourceState | null | undefined;
  transactionId: string;
  dryRun: boolean;
  packageId?: string;
  retainLastKnownGood?: boolean;
}): ManagedRuntimeSourceMutation {
  if (!input.state) {
    return {
      kind: 'none',
      module_id: '',
      checkout_path: '',
      before: null,
      after: null,
      staged_removal_paths: [],
    };
  }
  const current = validateCurrentState(input.state);
  if (input.state.ownership === 'preexisting_adopted' || input.retainLastKnownGood === true) {
    return {
      kind: 'none',
      module_id: input.state.module_id,
      checkout_path: input.state.checkout_path,
      before: current,
      after: { ...current, status: input.dryRun ? 'validated_no_write' : 'retained_on_uninstall' },
      staged_removal_paths: [],
    };
  }
  const staged = stagedRemovalPaths(input.state, input.transactionId);
  if (input.dryRun) {
    return {
      kind: 'none',
      module_id: input.state.module_id,
      checkout_path: input.state.checkout_path,
      before: input.state,
      after: { ...input.state, status: 'validated_no_write' },
      staged_removal_paths: [],
    };
  }
  const mutation = transactionMutation({
    kind: 'staged_removal',
    packageId: input.packageId ?? input.state.module_id,
    action: 'uninstall',
    transactionId: input.transactionId,
    moduleId: input.state.module_id,
    checkoutPath: input.state.checkout_path,
    before: input.state,
  });
  mutation.staged_removal_paths = staged;
  persistTransactionMarker(mutation, 'prepared');
  try {
    for (const entry of staged) fs.renameSync(entry.original, entry.backup);
  } catch (error) {
    for (const entry of [...staged].reverse()) {
      if (!fs.existsSync(entry.original) && fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.original);
    }
    clearTransactionMarker(mutation);
    throw error;
  }
  mutation.after = { ...input.state, status: 'removed' };
  persistTransactionMarker(mutation, 'physical_applied');
  return mutation;
}

export function restoreManagedRuntimeSourceCarrier(input: {
  current: AgentPackageManagedRuntimeSourceState | null | undefined;
  restored: AgentPackageManagedRuntimeSourceState | null | undefined;
  transactionId: string;
  dryRun: boolean;
  packageId?: string;
}): ManagedRuntimeSourceMutation {
  if (!input.restored) {
    return removeManagedRuntimeSourceCarrier({
      state: input.current,
      transactionId: input.transactionId,
      dryRun: input.dryRun,
      packageId: input.packageId,
    });
  }
  if (!input.current) {
    const restored = validateCurrentState(input.restored);
    return {
      kind: 'none',
      module_id: restored.module_id,
      checkout_path: restored.checkout_path,
      before: null,
      after: { ...restored, status: input.dryRun ? 'validated_no_write' : 'current' },
      staged_removal_paths: [],
    };
  }
  if (path.resolve(input.current.checkout_path) !== path.resolve(input.restored.checkout_path)) {
    const current = validateCurrentState(input.current);
    const restored = validateCurrentState(input.restored);
    return {
      kind: 'none',
      module_id: restored.module_id,
      checkout_path: restored.checkout_path,
      before: current,
      after: { ...restored, status: input.dryRun ? 'validated_no_write' : 'current' },
      staged_removal_paths: [],
    };
  }
  if (input.current.tree_sha256 === input.restored.tree_sha256) {
    const current = validateCurrentState(input.current);
    return {
      kind: 'none',
      module_id: current.module_id,
      checkout_path: current.checkout_path,
      before: current,
      after: { ...input.restored, status: input.dryRun ? 'validated_no_write' : 'current' },
      staged_removal_paths: [],
    };
  }
  const spec = resolveOplDomainModuleSpec(input.current.module_id);
  const rollbackTarget = validateManagedModulePackageChannelRollback(spec, input.current.checkout_path);
  if (
    input.restored.module_id !== input.current.module_id
    || !packageChannelSnapshotMatchesState(rollbackTarget.lifecycle.current, input.current)
    || !packageChannelSnapshotMatchesState(rollbackTarget.previousSnapshot, input.restored)
  ) {
    throw sourceFailure('Managed runtime source rollback generation is unavailable.', {
      module_id: input.current.module_id,
      checkout_path: input.current.checkout_path,
      expected_previous_tree_sha256: input.restored.tree_sha256,
      actual_previous_tree_sha256: rollbackTarget.previousSnapshot.tree_sha256,
    });
  }
  const current = {
    ...input.current,
    source_mode: 'package_channel' as const,
    tree_sha256: computePackageChannelTreeSha256(input.current.checkout_path),
  };
  if (input.dryRun) {
    return {
      kind: 'none',
      module_id: current.module_id,
      checkout_path: current.checkout_path,
      before: current,
      after: { ...input.restored, status: 'validated_no_write' },
      staged_removal_paths: [],
    };
  }
  const mutation = transactionMutation({
    kind: 'restored_previous',
    packageId: input.packageId ?? current.module_id,
    action: 'rollback',
    transactionId: input.transactionId,
    moduleId: current.module_id,
    checkoutPath: current.checkout_path,
    before: current,
    checkoutExistedBefore: true,
  });
  if (process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED === '1'
    && process.env.OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_PREPARE_ROLLBACK === '1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Injected interruption after runtime source rollback prepare marker.', {
      failure_code: 'test_runtime_source_interrupted_after_prepare_rollback',
    });
  }
  try {
    rollbackManagedModulePackageChannel(spec, current.checkout_path);
  } catch (error) {
    clearTransactionMarker(mutation);
    throw error;
  }
  const after = validateCurrentState(input.restored);
  mutation.after = after;
  persistTransactionMarker(mutation, 'physical_applied');
  return mutation;
}

export function rollbackManagedRuntimeSourceMutation(mutation: ManagedRuntimeSourceMutation) {
  if (mutation.kind === 'none') {
    clearTransactionMarker(mutation);
    return;
  }
  if (mutation.repair_displaced_path) {
    if (fs.existsSync(mutation.repair_displaced_path)) {
      fs.rmSync(mutation.checkout_path, { recursive: true, force: true });
      fs.renameSync(mutation.repair_displaced_path, mutation.checkout_path);
    }
    if (mutation.after?.preparation_root
      && mutation.after.preparation_root !== mutation.before?.preparation_root) {
      fs.rmSync(mutation.after.preparation_root, { recursive: true, force: true });
    }
    clearTransactionMarker(mutation);
    return;
  }
  if (mutation.kind === 'installed_fresh') {
    const developerSnapshotPath = safeDeveloperRuntimeSnapshotPath(
      mutation.checkout_path,
      mutation.module_id,
    );
    const packageGenerationPath = safePackageRuntimeGenerationPath(
      mutation.checkout_path,
      mutation.module_id,
    );
    const roots = developerSnapshotPath
      ? [developerSnapshotPath]
      : packageGenerationPath
        ? [packageGenerationPath]
      : mutation.action === 'repair'
        ? [mutation.checkout_path, `${mutation.checkout_path}.stage`]
        : [mutation.checkout_path, `${mutation.checkout_path}.previous`, `${mutation.checkout_path}.stage`];
    if (mutation.checkout_existed_before !== true) {
      for (const root of roots) {
        if ((developerSnapshotPath
          && realDeveloperRuntimeSnapshotPath(root, mutation.module_id) === null)
          || (packageGenerationPath
            && realPackageRuntimeGenerationPath(root, mutation.module_id) === null)) {
          throw sourceFailure('Runtime generation rollback refused an unsafe persisted path.', {
            module_id: mutation.module_id,
            checkout_path: root,
          });
        }
        if (developerSnapshotPath) makeDeveloperCheckoutRuntimeSnapshotWritable(root);
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
    if (mutation.after?.preparation_root) {
      fs.rmSync(mutation.after.preparation_root, { recursive: true, force: true });
    }
    clearTransactionMarker(mutation);
    return;
  }
  if (mutation.kind === 'staged_removal') {
    for (const entry of [...mutation.staged_removal_paths].reverse()) {
      if (!fs.existsSync(entry.original) && fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.original);
    }
    clearTransactionMarker(mutation);
    return;
  }
  const spec = resolveOplDomainModuleSpec(mutation.module_id);
  rollbackManagedModulePackageChannel(spec, mutation.checkout_path);
  if (mutation.before) {
    const restored = validateCurrentState(mutation.before);
    if (restored.tree_sha256 !== mutation.before.tree_sha256) {
      throw sourceFailure('Managed runtime source compensation restored the wrong generation.', {
        module_id: mutation.module_id,
        checkout_path: mutation.checkout_path,
        expected_tree_sha256: mutation.before.tree_sha256,
        actual_tree_sha256: restored.tree_sha256,
      });
    }
  }
  if (mutation.after?.preparation_root
    && mutation.after.preparation_root !== mutation.before?.preparation_root) {
    fs.rmSync(mutation.after.preparation_root, { recursive: true, force: true });
  }
  clearTransactionMarker(mutation);
}

export function finalizeManagedRuntimeSourceMutation(
  mutation: ManagedRuntimeSourceMutation,
  options: { ignoreTestFailure?: boolean } = {},
) {
  if (mutation.kind === 'none') {
    clearTransactionMarker(mutation);
    return { status: 'not_required' as const, cleanup_paths: [] };
  }
  const cleanupPaths = [
    ...mutation.staged_removal_paths.map((entry) => entry.backup),
    ...(mutation.repair_displaced_path ? [mutation.repair_displaced_path] : []),
  ];
  try {
    if (!options.ignoreTestFailure
      && process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED === '1'
      && process.env.OPL_TEST_RUNTIME_SOURCE_FINALIZE_FAIL === '1') {
      throw new Error('injected runtime source finalize failure');
    }
    for (const cleanupPath of cleanupPaths) {
      if (mutation.before?.preparation_scope === 'developer_snapshot_root'
        || mutation.after?.preparation_scope === 'developer_snapshot_root') {
        makeDeveloperCheckoutRuntimeSnapshotWritable(cleanupPath);
      }
      fs.rmSync(cleanupPath, { recursive: true, force: true });
    }
    clearTransactionMarker(mutation);
    const parent = path.dirname(mutation.checkout_path);
    if (mutation.kind === 'staged_removal' && fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
      fs.rmdirSync(parent);
    }
    return { status: 'cleanup_completed' as const, cleanup_paths: cleanupPaths };
  } catch {
    persistTransactionMarker(mutation, 'cleanup_pending');
    return { status: 'cleanup_pending' as const, cleanup_paths: cleanupPaths };
  }
}

function developerRuntimeSnapshotRefs(index: AgentPackageLockIndex) {
  return [
    ...index.packages,
    ...(index.last_known_good_transactions ?? []).flatMap((entry) => entry.package_locks),
  ].flatMap((lock) => {
    const state = lock.managed_runtime_source;
    return state?.source_mode === 'developer_checkout'
      && state.preparation_scope === 'developer_snapshot_root'
      ? [{ moduleId: state.module_id, checkoutPath: state.checkout_path }]
      : [];
  });
}

export function cleanupUnreferencedDeveloperRuntimeSnapshots(
  previous: AgentPackageLockIndex,
  current: AgentPackageLockIndex,
) {
  const root = developerRuntimeSnapshotRoot();
  const rootStat = lstatOrNull(root);
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) return;
  const retained = new Set(developerRuntimeSnapshotRefs(current).flatMap((entry) => {
    const resolved = safeDeveloperRuntimeSnapshotPath(entry.checkoutPath, entry.moduleId);
    return resolved ? [resolved] : [];
  }));
  for (const entry of developerRuntimeSnapshotRefs(previous)) {
    const resolved = safeDeveloperRuntimeSnapshotPath(entry.checkoutPath, entry.moduleId);
    if (!resolved || retained.has(resolved)) continue;
    const moduleRoot = developerRuntimeSnapshotModuleRoot(entry.moduleId);
    const moduleRootStat = lstatOrNull(moduleRoot);
    const candidateStat = lstatOrNull(resolved);
    if (!moduleRootStat
      || moduleRootStat.isSymbolicLink()
      || !moduleRootStat.isDirectory()
      || !candidateStat
      || candidateStat.isSymbolicLink()
      || !candidateStat.isDirectory()) continue;
    try {
      if (path.dirname(fs.realpathSync(moduleRoot)) !== fs.realpathSync(root)
        || path.dirname(fs.realpathSync(resolved)) !== fs.realpathSync(moduleRoot)) continue;
    } catch {
      continue;
    }
    makeDeveloperCheckoutRuntimeSnapshotWritable(resolved);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function transactionMarkerFailure(filePath: string, reason: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError(
    'contract_shape_invalid',
    'Managed runtime source recovery marker requires manual intervention.',
    {
      marker_path: filePath,
      reason,
      failure_code: 'agent_package_runtime_source_transaction_invalid',
      recovery_status: 'recovery_required',
      recovery_action_state: 'manual_owner_intervention_required',
      ...details,
    },
  );
}

function requiredMarkerId(value: unknown, filePath: string, field: string) {
  if (typeof value !== 'string'
    || value.length === 0
    || value === '.'
    || value === '..'
    || path.basename(value) !== value) {
    throw transactionMarkerFailure(filePath, 'marker_identity_invalid', { field });
  }
  return value;
}

function requireExactMarkerPath(value: unknown, expected: string, filePath: string, field: string) {
  if (typeof value !== 'string'
    || !path.isAbsolute(value)
    || path.resolve(value) !== path.resolve(expected)) {
    throw transactionMarkerFailure(filePath, 'managed_path_mismatch', {
      field,
      expected_path: expected,
    });
  }
  return path.resolve(value);
}

function validateMarkerRuntimeState(
  value: unknown,
  filePath: string,
  field: string,
  moduleId: string,
  managedCheckoutPath: string,
  runtimeEnvironmentModuleRoot: string,
) {
  if (value === null) return;
  if (!isRecord(value)
    || value.module_id !== moduleId
    || typeof value.tree_sha256 !== 'string') {
    throw transactionMarkerFailure(filePath, 'runtime_state_identity_invalid', { field });
  }
  const developerState = value.source_mode === 'developer_checkout';
  const developerSnapshotState = developerState
    && value.preparation_scope === 'developer_snapshot_root';
  if (developerSnapshotState) {
    if (realDeveloperRuntimeSnapshotPath(value.checkout_path, moduleId) === null) {
      throw transactionMarkerFailure(filePath, 'developer_snapshot_path_invalid', { field });
    }
    if (typeof value.runtime_snapshot_sha256 !== 'string'
      || !SHA256_HEX.test(value.runtime_snapshot_sha256)) {
      throw transactionMarkerFailure(filePath, 'developer_snapshot_digest_invalid', { field });
    }
    if (typeof value.source_checkout_path !== 'string'
      || !path.isAbsolute(value.source_checkout_path)) {
      throw transactionMarkerFailure(filePath, 'developer_source_checkout_path_invalid', { field });
    }
  } else if (developerState) {
    if (typeof value.checkout_path !== 'string' || !path.isAbsolute(value.checkout_path)) {
      throw transactionMarkerFailure(filePath, 'developer_checkout_path_invalid', { field });
    }
    if (fs.existsSync(value.checkout_path)) {
      const stat = fs.lstatSync(value.checkout_path);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw transactionMarkerFailure(filePath, 'developer_checkout_path_invalid', { field });
      }
    }
  } else {
    requireExactMarkerPath(
      value.checkout_path,
      managedCheckoutPath,
      filePath,
      `${field}.checkout_path`,
    );
  }
  if (value.source_checkout_path !== undefined
    && value.source_checkout_path !== null
    && (typeof value.source_checkout_path !== 'string'
      || !path.isAbsolute(value.source_checkout_path))) {
    throw transactionMarkerFailure(filePath, 'developer_source_checkout_path_invalid', { field });
  }
  if (value.preparation_root !== null) {
    if (typeof value.preparation_root !== 'string'
      || !path.isAbsolute(value.preparation_root)
      || path.dirname(path.resolve(value.preparation_root)) !== path.resolve(runtimeEnvironmentModuleRoot)) {
      throw transactionMarkerFailure(filePath, 'runtime_preparation_root_invalid', { field });
    }
  }
}

function parseTransactionMarker(filePath: string) {
  const parsed = readJsonFileOrNull(filePath);
  if (!isRecord(parsed)
    || parsed.surface_kind !== 'opl_agent_package_runtime_source_transaction'
    || parsed.version !== 1
    || !['prepared', 'physical_applied', 'cleanup_pending'].includes(String(parsed.phase))
    || !isRecord(parsed.mutation)) {
    throw transactionMarkerFailure(filePath, 'root_shape_invalid');
  }
  const mutation = parsed.mutation;
  const packageId = requiredMarkerId(mutation.package_id, filePath, 'mutation.package_id');
  if (canonicalAgentPackageId(packageId) !== packageId) {
    throw transactionMarkerFailure(filePath, 'package_identity_not_canonical');
  }
  const transactionId = requiredMarkerId(mutation.transaction_id, filePath, 'mutation.transaction_id');
  const moduleId = requiredMarkerId(mutation.module_id, filePath, 'mutation.module_id');
  if (path.resolve(filePath) !== path.resolve(transactionMarkerPath(packageId, transactionId))) {
    throw transactionMarkerFailure(filePath, 'marker_file_identity_mismatch');
  }
  let spec: ReturnType<typeof resolveOplDomainModuleSpec>;
  try {
    spec = resolveOplDomainModuleSpec(moduleId);
  } catch {
    throw transactionMarkerFailure(filePath, 'module_identity_invalid', { module_id: moduleId });
  }
  const managedCheckoutPath = resolveManagedModuleCheckoutPath(spec);
  const developerSnapshotCheckoutPath = realDeveloperRuntimeSnapshotPath(
    mutation.checkout_path,
    moduleId,
  );
  const developerSnapshotMutation = developerSnapshotCheckoutPath !== null;
  const checkoutPath = developerSnapshotCheckoutPath ?? managedCheckoutPath;
  if (!developerSnapshotMutation) {
    requireExactMarkerPath(
      mutation.checkout_path,
      managedCheckoutPath,
      filePath,
      'mutation.checkout_path',
    );
  }
  requireExactMarkerPath(mutation.marker_path, filePath, filePath, 'mutation.marker_path');
  const kind = mutation.kind;
  const action = mutation.action;
  const validKindAction = kind === 'installed_fresh'
    ? action === 'install' || action === 'update' || action === 'repair'
    : kind === 'activated_with_previous'
      ? action === 'update' || action === 'repair'
    : kind === 'restored_previous'
      ? action === 'rollback'
      : kind === 'staged_removal' && action === 'uninstall';
  if (!validKindAction) {
    throw transactionMarkerFailure(filePath, 'mutation_kind_action_mismatch', { kind, action });
  }
  const expectedCheckoutExistedBefore = kind === 'installed_fresh' && !developerSnapshotMutation
    ? false
    : kind === 'activated_with_previous' || kind === 'restored_previous'
      ? true
      : null;
  if (expectedCheckoutExistedBefore !== null
    && mutation.checkout_existed_before !== expectedCheckoutExistedBefore) {
    throw transactionMarkerFailure(filePath, 'checkout_history_mismatch');
  }
  const runtimeEnvironmentModuleRoot = path.join(
    resolveOplStatePaths().state_dir,
    'agent-package-runtime-envs',
    moduleId,
  );
  validateMarkerRuntimeState(
    mutation.before,
    filePath,
    'mutation.before',
    moduleId,
    managedCheckoutPath,
    runtimeEnvironmentModuleRoot,
  );
  validateMarkerRuntimeState(
    mutation.after,
    filePath,
    'mutation.after',
    moduleId,
    managedCheckoutPath,
    runtimeEnvironmentModuleRoot,
  );
  if (developerSnapshotMutation && mutation.after !== null) {
    if (!isRecord(mutation.after)
      || mutation.after.source_mode !== 'developer_checkout'
      || mutation.after.preparation_scope !== 'developer_snapshot_root') {
      throw transactionMarkerFailure(filePath, 'developer_snapshot_state_invalid', {
        field: 'mutation.after',
      });
    }
    requireExactMarkerPath(
      mutation.after.checkout_path,
      checkoutPath,
      filePath,
      'mutation.after.checkout_path',
    );
  }
  if (!Array.isArray(mutation.staged_removal_paths)) {
    throw transactionMarkerFailure(filePath, 'staged_removal_paths_invalid');
  }
  const allowedRemovalRoots = new Map(developerSnapshotMutation
    ? [[path.resolve(checkoutPath), 0] as const]
    : [
        [path.resolve(checkoutPath), 0] as const,
        [path.resolve(`${checkoutPath}.previous`), 1] as const,
        [path.resolve(runtimeEnvironmentModuleRoot), 2] as const,
      ]);
  const observedRemovalRoots = new Set<string>();
  for (const entry of mutation.staged_removal_paths) {
    if (!isRecord(entry) || typeof entry.original !== 'string') {
      throw transactionMarkerFailure(filePath, 'staged_removal_entry_invalid');
    }
    const original = path.resolve(entry.original);
    const originalIndex = allowedRemovalRoots.get(original);
    if (kind !== 'staged_removal'
      || originalIndex === undefined
      || observedRemovalRoots.has(original)) {
      throw transactionMarkerFailure(filePath, 'staged_removal_path_outside_managed_roots');
    }
    requireExactMarkerPath(
      entry.backup,
      `${original}.opl-package-remove-${transactionId}-${originalIndex}`,
      filePath,
      'mutation.staged_removal_paths.backup',
    );
    observedRemovalRoots.add(original);
  }
  if (kind !== 'staged_removal' && mutation.staged_removal_paths.length > 0) {
    throw transactionMarkerFailure(filePath, 'staged_removal_paths_not_allowed');
  }
  if (mutation.repair_displaced_path !== null && mutation.repair_displaced_path !== undefined) {
    if (action !== 'repair' || developerSnapshotMutation) {
      throw transactionMarkerFailure(filePath, 'repair_displaced_path_not_allowed');
    }
    requireExactMarkerPath(
      mutation.repair_displaced_path,
      `${checkoutPath}.repair-displaced-${transactionId}`,
      filePath,
      'mutation.repair_displaced_path',
    );
  } else if (action === 'repair'
    && !developerSnapshotMutation
    && mutation.checkout_existed_before === true) {
    throw transactionMarkerFailure(filePath, 'repair_displaced_path_missing');
  }
  return parsed as unknown as RuntimeSourceTransactionMarker;
}

function transactionMarkerFiles() {
  const markerDir = transactionMarkerDirectory();
  if (!fs.existsSync(markerDir)) return [];
  return fs.readdirSync(markerDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((fileName) => path.join(markerDir, fileName));
}

export function inspectManagedRuntimeSourceTransactions() {
  const markerFiles = transactionMarkerFiles();
  for (const markerFile of markerFiles) parseTransactionMarker(markerFile);
  return {
    status: markerFiles.length > 0 ? 'recovery_required' as const : 'not_required' as const,
    pending_transaction_count: markerFiles.length,
    recovered_transaction_count: 0,
    cleanup_completed_count: 0,
    cleared_prepared_transaction_count: 0,
    recovered_transaction_ids: [] as string[],
    writes_performed: false,
  };
}

function preparedMutationChangedPhysicalState(mutation: ManagedRuntimeSourceMutation) {
  if (mutation.kind === 'staged_removal') {
    return mutation.staged_removal_paths.some((entry) =>
      fs.existsSync(entry.backup) || !fs.existsSync(entry.original));
  }
  const developerSnapshotPath = safeDeveloperRuntimeSnapshotPath(
    mutation.checkout_path,
    mutation.module_id,
  );
  if (developerSnapshotPath) {
    return mutation.checkout_existed_before !== true && lstatOrNull(developerSnapshotPath) !== null;
  }
  if (mutation.action === 'repair') {
    return Boolean(mutation.repair_displaced_path && fs.existsSync(mutation.repair_displaced_path))
      || fs.existsSync(mutation.checkout_path) !== mutation.checkout_existed_before;
  }
  if (!mutation.before) return fs.existsSync(mutation.checkout_path);
  if (!fs.existsSync(mutation.checkout_path)) return true;
  try {
    return computePackageChannelTreeSha256(mutation.checkout_path) !== mutation.before.tree_sha256;
  } catch {
    return true;
  }
}

function clearPreparedRuntimeSourceMutation(mutation: ManagedRuntimeSourceMutation) {
  if (!safeDeveloperRuntimeSnapshotPath(mutation.checkout_path, mutation.module_id)
    && (mutation.action === 'install'
      || mutation.action === 'update'
      || mutation.action === 'repair')) {
    fs.rmSync(`${mutation.checkout_path}.stage`, { recursive: true, force: true });
  }
  clearTransactionMarker(mutation);
}

function runtimeSourceStateMatches(
  actual: AgentPackageManagedRuntimeSourceState | null | undefined,
  expected: AgentPackageManagedRuntimeSourceState,
) {
  return Boolean(
    actual
    && actual.module_id === expected.module_id
    && path.resolve(actual.checkout_path) === path.resolve(expected.checkout_path)
    && (actual.source_mode ?? null) === (expected.source_mode ?? null)
    && actual.tree_sha256 === expected.tree_sha256
    && (actual.runtime_snapshot_sha256 ?? null) === (expected.runtime_snapshot_sha256 ?? null),
  );
}

function preparedMutationDidNotActivateChannel(mutation: ManagedRuntimeSourceMutation) {
  if (mutation.kind !== 'activated_with_previous' || !mutation.before) return false;
  try {
    const spec = resolveOplDomainModuleSpec(mutation.module_id);
    const current = readPackageChannelLifecycle(mutation.checkout_path, spec)?.current;
    return Boolean(
      current
      && current.channel_version === mutation.before.channel_version
      && current.artifact_ref === mutation.before.artifact_ref
      && current.layer_digest === mutation.before.layer_digest
      && current.source_archive_sha256 === mutation.before.source_archive_sha256
      && current.source_git_head_sha === mutation.before.source_git_head_sha,
    );
  } catch {
    return false;
  }
}

export function recoverManagedRuntimeSourceTransactions(index: AgentPackageLockIndex) {
  const markerFiles = transactionMarkerFiles();
  if (markerFiles.length === 0) {
    return {
      status: 'not_required' as const,
      recovered_transaction_count: 0,
      cleanup_completed_count: 0,
      cleared_prepared_transaction_count: 0,
      recovered_transaction_ids: [] as string[],
    };
  }
  let recoveredCount = 0;
  let cleanupCompletedCount = 0;
  let clearedPreparedCount = 0;
  const recoveredIds: string[] = [];
  const markers = markerFiles.map((markerFile) => ({
    markerFile,
    marker: parseTransactionMarker(markerFile),
  }));
  for (const { markerFile, marker } of markers) {
    const mutation = marker.mutation;
    if (marker.phase === 'prepared' && preparedMutationDidNotActivateChannel(mutation)) {
      clearPreparedRuntimeSourceMutation(mutation);
      clearedPreparedCount += 1;
      recoveredIds.push(mutation.transaction_id ?? path.basename(markerFile));
      continue;
    }
    if (marker.phase === 'prepared' && !preparedMutationChangedPhysicalState(mutation)) {
      clearPreparedRuntimeSourceMutation(mutation);
      clearedPreparedCount += 1;
      recoveredIds.push(mutation.transaction_id ?? path.basename(markerFile));
      continue;
    }
    const lock = index.packages.find((entry) => entry.package_id === mutation.package_id) ?? null;
    const committed = mutation.action === 'uninstall'
      ? lock === null
      : mutation.after !== null
        && runtimeSourceStateMatches(lock?.managed_runtime_source, mutation.after);
    if (committed) {
      const cleanup = finalizeManagedRuntimeSourceMutation(mutation, { ignoreTestFailure: true });
      if (cleanup.status === 'cleanup_completed') cleanupCompletedCount += 1;
    } else {
      rollbackManagedRuntimeSourceMutation(mutation);
      recoveredCount += 1;
    }
    recoveredIds.push(mutation.transaction_id ?? path.basename(markerFile));
  }
  return {
    status: 'recovered' as const,
    recovered_transaction_count: recoveredCount,
    cleanup_completed_count: cleanupCompletedCount,
    cleared_prepared_transaction_count: clearedPreparedCount,
    recovered_transaction_ids: recoveredIds,
  };
}
