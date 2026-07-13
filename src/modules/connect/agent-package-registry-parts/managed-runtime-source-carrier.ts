import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  computePackageChannelTreeSha256,
  installManagedModuleFromPackageChannel,
  readPackageChannelLifecycle,
  refreshPackageChannelCurrentSnapshot,
  rollbackManagedModulePackageChannel,
  type ManagedModulePackageChannelSelection,
} from '../system-installation/module-package-channel.ts';
import {
  resolveManagedModuleCheckoutPath,
  resolveOplDomainModuleSpec,
} from '../system-installation/modules.ts';
import { readPackagedModuleMarker } from '../system-installation/module-packaged.ts';
import { runCommand } from '../system-installation/shared.ts';
import { materializeStandardAgentFrameworkLink } from '../standard-agent-framework-link.ts';
import {
  buildDeveloperCheckoutRuntimeSourceState,
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

function transactionMarkerDirectory() {
  return path.join(
    ensureOplStateDir(resolveOplStatePaths()).state_dir,
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
    ...input.preparation,
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
    const identity = readDeveloperCheckoutSourceIdentity(state.checkout_path);
    return {
      ...state,
      source_mode: sourceMode,
      source_git_head_sha: identity.source_git_head_sha,
      tree_sha256: identity.tree_sha256,
    };
  }
  const packaged = readPackagedModuleMarker(state.checkout_path, spec);
  if (
    sourceMode === 'bundled_full_runtime'
    && state.ownership === 'preexisting_adopted'
    && fs.existsSync(state.checkout_path)
    && !readPackageChannelLifecycle(state.checkout_path, spec)
    && packaged?.source_kind === 'full_runtime'
  ) {
    return {
      ...state,
      source_mode: sourceMode,
      tree_sha256: computePackageChannelTreeSha256(state.checkout_path),
    };
  }
  return sourceState({
    config: { carrier_kind: state.carrier_kind, module_id: state.module_id },
    checkoutPath: state.checkout_path,
    ownership: state.ownership,
    preparation: state,
  });
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
  const commandEnv = managedPackageScope
    ? {
        ...process.env,
        HOME: path.join(preparationRoot, 'home'),
        UV_TOOL_DIR: path.join(preparationRoot, 'uv-tools'),
        UV_TOOL_BIN_DIR: path.join(preparationRoot, 'bin'),
        XDG_CACHE_HOME: path.join(preparationRoot, 'cache'),
        npm_config_cache: path.join(preparationRoot, 'npm-cache'),
        PATH: `${path.join(preparationRoot, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
      }
    : process.env;
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
  if (!state.preparation_root) return process.env;
  return {
    ...process.env,
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
  const health = state.preparation_scope === 'managed_source_root'
    ? packageHealthCommand(state.module_id, state.checkout_path)
    : spec.health_check_command?.(state.checkout_path) ?? null;
  const handler = spec.runtime_probe_command?.(state.checkout_path)
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
  if (!fs.existsSync(state.checkout_path)) {
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
    const current = validateCurrentState(state);
    const spec = resolveOplDomainModuleSpec(state.module_id);
    const bundledFullRuntime = runtimeSourceMode(state, spec) === 'bundled_full_runtime';
    const matches = bundledFullRuntime
      ? current.tree_sha256 === state.tree_sha256
      : state.preparation_status === 'completed'
      && Boolean(state.health_output_sha256)
      && Boolean(state.handler_probe_output_sha256)
      && current.tree_sha256 === state.tree_sha256
      && current.source_git_head_sha === state.source_git_head_sha
      && current.layer_digest === state.layer_digest;
    if (matches && !bundledFullRuntime) {
      const commands = resolvedCurrentProbeCommands(state);
      if (!matchingCommand(commands.healthCommand, state.health_check_command)
        || !matchingCommand(commands.handlerCommand, state.handler_probe_command)) {
        return {
          status: 'incompatible' as const,
          operational_ready: false,
          module_id: state.module_id,
          checkout_path: state.checkout_path,
          expected_tree_sha256: state.tree_sha256,
          actual_tree_sha256: current.tree_sha256,
          reason: 'managed_runtime_source_command_drift',
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
          actual_tree_sha256: current.tree_sha256,
          reason: 'managed_runtime_source_probe_failed',
        };
      }
    }
    return {
      status: matches ? 'current' as const : 'incompatible' as const,
      operational_ready: matches,
      module_id: state.module_id,
      checkout_path: state.checkout_path,
      expected_tree_sha256: state.tree_sha256,
      actual_tree_sha256: current.tree_sha256,
      reason: matches ? null : 'managed_runtime_source_lock_mismatch',
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
  const checkoutPath = input.checkoutPath
    ? path.resolve(input.checkoutPath)
    : resolveManagedModuleCheckoutPath(spec);
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
    try {
      before = validateCurrentState(input.previous);
    } catch (error) {
      if (input.action !== 'repair' || input.previous.ownership !== 'package_created') throw error;
      before = input.previous;
    }
  }
  if (input.dryRun) {
    if (developerCheckout) {
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
        }),
        staged_removal_paths: [],
      };
    }
    const preview = sameCheckout && before ? before : {
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
    materializeStandardAgentFrameworkLink({ agentRoot: checkoutPath });
    const after = buildDeveloperCheckoutRuntimeSourceState({
      config: input.config,
      checkoutPath,
      status: 'current',
      dryRun: false,
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
  if (
    input.sourceKind === 'bundled_full_runtime_modules'
    && existed
    && !readPackageChannelLifecycle(checkoutPath, spec)
  ) {
    const packaged = readPackagedModuleMarker(checkoutPath, spec);
    if (packaged?.source_kind !== 'full_runtime') {
      throw sourceFailure('Bundled Full runtime source is missing its immutable package marker.', {
        module_id: input.config.module_id,
        checkout_path: checkoutPath,
        expected_source_kind: 'full_runtime',
      });
    }
    const treeSha256 = computePackageChannelTreeSha256(checkoutPath);
    const after: AgentPackageManagedRuntimeSourceState = {
      surface_kind: 'opl_agent_package_managed_runtime_source',
      status: 'current',
      carrier_kind: input.config.carrier_kind,
      module_id: input.config.module_id,
      checkout_path: checkoutPath,
      ownership: 'preexisting_adopted',
      source_mode: 'bundled_full_runtime',
      channel_version: null,
      artifact_ref: null,
      layer_digest: null,
      source_archive_sha256: null,
      source_git_head_sha: null,
      tree_sha256: treeSha256,
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
      before: input.previous ?? after,
      after,
      staged_removal_paths: [],
    };
  }
  const packageId = input.packageId ?? input.config.module_id;
  const transactionId = input.transactionId ?? `${input.action}-${process.pid}`;
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
  const mutationKind = existed ? 'activated_with_previous' : 'installed_fresh';
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
  if (input.state.ownership === 'preexisting_adopted') {
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
    throw sourceFailure('Managed runtime source rollback cannot restore a source without a current package-channel generation.', {
      module_id: input.restored.module_id,
      checkout_path: input.restored.checkout_path,
    });
  }
  const current = validateCurrentState(input.current);
  if (path.resolve(current.checkout_path) !== path.resolve(input.restored.checkout_path)) {
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
  if (current.tree_sha256 === input.restored.tree_sha256) {
    return {
      kind: 'none',
      module_id: current.module_id,
      checkout_path: current.checkout_path,
      before: current,
      after: { ...input.restored, status: input.dryRun ? 'validated_no_write' : 'current' },
      staged_removal_paths: [],
    };
  }
  const spec = resolveOplDomainModuleSpec(current.module_id);
  const lifecycle = readPackageChannelLifecycle(current.checkout_path, spec);
  if (!lifecycle?.previous || lifecycle.previous.tree_sha256 !== input.restored.tree_sha256) {
    throw sourceFailure('Managed runtime source rollback generation is unavailable.', {
      module_id: current.module_id,
      checkout_path: current.checkout_path,
      expected_previous_tree_sha256: input.restored.tree_sha256,
      actual_previous_tree_sha256: lifecycle?.previous?.tree_sha256 ?? null,
    });
  }
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
    const roots = mutation.action === 'repair'
      ? [mutation.checkout_path, `${mutation.checkout_path}.stage`]
      : [mutation.checkout_path, `${mutation.checkout_path}.previous`, `${mutation.checkout_path}.stage`];
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
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

function parseTransactionMarker(filePath: string) {
  const parsed = readJsonFileOrNull(filePath) as RuntimeSourceTransactionMarker | null;
  if (parsed?.surface_kind !== 'opl_agent_package_runtime_source_transaction'
    || parsed.version !== 1
    || !parsed.mutation?.kind) {
    throw sourceFailure('Managed runtime source recovery marker is invalid.', { marker_path: filePath });
  }
  return parsed;
}

function preparedMutationChangedPhysicalState(mutation: ManagedRuntimeSourceMutation) {
  if (mutation.kind === 'staged_removal') {
    return mutation.staged_removal_paths.some((entry) =>
      fs.existsSync(entry.backup) || !fs.existsSync(entry.original));
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
  const markerDir = transactionMarkerDirectory();
  if (!fs.existsSync(markerDir)) {
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
  for (const fileName of fs.readdirSync(markerDir).filter((entry) => entry.endsWith('.json')).sort()) {
    const marker = parseTransactionMarker(path.join(markerDir, fileName));
    const mutation = marker.mutation;
    if (marker.phase === 'prepared' && preparedMutationDidNotActivateChannel(mutation)) {
      fs.rmSync(`${mutation.checkout_path}.stage`, { recursive: true, force: true });
      clearTransactionMarker(mutation);
      clearedPreparedCount += 1;
      recoveredIds.push(mutation.transaction_id ?? fileName);
      continue;
    }
    if (marker.phase === 'prepared' && !preparedMutationChangedPhysicalState(mutation)) {
      if (mutation.action === 'install' || mutation.action === 'update' || mutation.action === 'repair') {
        fs.rmSync(`${mutation.checkout_path}.stage`, { recursive: true, force: true });
      }
      clearTransactionMarker(mutation);
      clearedPreparedCount += 1;
      recoveredIds.push(mutation.transaction_id ?? fileName);
      continue;
    }
    const lock = index.packages.find((entry) => entry.package_id === mutation.package_id) ?? null;
    const committed = mutation.action === 'uninstall'
      ? lock === null
      : mutation.after !== null
        && lock?.managed_runtime_source?.tree_sha256 === mutation.after.tree_sha256;
    if (committed) {
      const cleanup = finalizeManagedRuntimeSourceMutation(mutation, { ignoreTestFailure: true });
      if (cleanup.status === 'cleanup_completed') cleanupCompletedCount += 1;
    } else {
      rollbackManagedRuntimeSourceMutation(mutation);
      recoveredCount += 1;
    }
    recoveredIds.push(mutation.transaction_id ?? fileName);
  }
  return {
    status: 'recovered' as const,
    recovered_transaction_count: recoveredCount,
    cleanup_completed_count: cleanupCompletedCount,
    cleared_prepared_transaction_count: clearedPreparedCount,
    recovered_transaction_ids: recoveredIds,
  };
}
