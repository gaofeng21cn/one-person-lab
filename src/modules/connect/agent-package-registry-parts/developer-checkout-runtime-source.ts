import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { resolveOplDomainModuleSpec } from '../system-installation/modules.ts';
import { runCommand } from '../system-installation/shared.ts';
import type {
  AgentPackageManagedRuntimeSourceCarrier,
  AgentPackageManagedRuntimeSourceState,
} from './types.ts';

function sourceFailure(message: string, details: Record<string, unknown>) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'agent_package_runtime_source_carrier_invalid',
  });
}

function developerCheckoutGitHead(checkoutPath: string) {
  const result = runCommand('git', ['rev-parse', 'HEAD'], checkoutPath);
  if (result.exitCode !== 0 || result.timedOut || !result.stdout.trim()) {
    throw sourceFailure('Developer checkout runtime source must be a readable Git checkout.', {
      checkout_path: checkoutPath,
    });
  }
  return result.stdout.trim();
}

export function readDeveloperCheckoutSourceIdentity(checkoutPath: string) {
  const sourceGitHeadSha = developerCheckoutGitHead(checkoutPath);
  const diff = runCommand('git', ['diff', '--binary', '--no-ext-diff', 'HEAD', '--'], checkoutPath, {
    maxBuffer: 64 * 1024 * 1024,
  });
  const untracked = runCommand(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    checkoutPath,
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (diff.exitCode !== 0 || diff.timedOut || untracked.exitCode !== 0 || untracked.timedOut) {
    throw sourceFailure('Developer checkout runtime source identity could not be computed.', {
      checkout_path: checkoutPath,
      diff_exit_code: diff.exitCode,
      untracked_exit_code: untracked.exitCode,
    });
  }

  const hash = crypto.createHash('sha256');
  hash.update(`head\0${sourceGitHeadSha}\0diff\0${diff.stdout}\0`);
  const untrackedPaths = untracked.stdout.split('\0').filter(Boolean).sort();
  for (const relativePath of untrackedPaths) {
    const absolutePath = path.join(checkoutPath, relativePath);
    const stat = fs.lstatSync(absolutePath);
    const mode = (stat.mode & 0o777).toString(8);
    if (stat.isSymbolicLink()) {
      hash.update(`symlink\0${relativePath}\0${mode}\0${fs.readlinkSync(absolutePath)}\0`);
    } else if (stat.isFile()) {
      const fileHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
      hash.update(`file\0${relativePath}\0${mode}\0${fileHash}\0`);
    }
  }
  return {
    source_git_head_sha: sourceGitHeadSha,
    tree_sha256: hash.digest('hex'),
  };
}

function commandDigest(stdout: string, stderr: string) {
  return `sha256:${crypto.createHash('sha256').update(stdout).update('\0').update(stderr).digest('hex')}`;
}

function runRequiredProbe(
  moduleId: string,
  checkoutPath: string,
  commandSpec: { command: string; args: string[] } | null,
  step: 'health_check' | 'handler_probe',
) {
  if (!commandSpec) {
    throw sourceFailure(`Developer checkout runtime source is missing its ${step} command.`, {
      module_id: moduleId,
      checkout_path: checkoutPath,
      step,
    });
  }
  const result = runCommand(commandSpec.command, commandSpec.args, checkoutPath, {
    timeoutMs: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (result.exitCode !== 0 || result.timedOut) {
    throw new FrameworkContractError('build_command_failed', `Developer checkout runtime source ${step} failed.`, {
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

export function buildDeveloperCheckoutRuntimeSourceState(input: {
  config: AgentPackageManagedRuntimeSourceCarrier;
  checkoutPath: string;
  status: AgentPackageManagedRuntimeSourceState['status'];
  dryRun: boolean;
}): AgentPackageManagedRuntimeSourceState {
  const spec = resolveOplDomainModuleSpec(input.config.module_id);
  const health = spec.health_check_command?.(input.checkoutPath) ?? null;
  const handler = spec.runtime_probe_command?.(input.checkoutPath)
    ?? spec.exec_command?.(input.checkoutPath, ['--help'])
    ?? null;
  if (!health || !handler) {
    throw sourceFailure('Developer checkout runtime source is missing a health or handler probe.', {
      module_id: input.config.module_id,
      checkout_path: input.checkoutPath,
    });
  }
  const healthResult = input.dryRun
    ? null
    : runRequiredProbe(input.config.module_id, input.checkoutPath, health, 'health_check');
  const handlerResult = input.dryRun
    ? null
    : runRequiredProbe(input.config.module_id, input.checkoutPath, handler, 'handler_probe');
  const identity = readDeveloperCheckoutSourceIdentity(input.checkoutPath);
  return {
    surface_kind: 'opl_agent_package_managed_runtime_source',
    status: input.status,
    carrier_kind: input.config.carrier_kind,
    module_id: input.config.module_id,
    checkout_path: input.checkoutPath,
    ownership: 'preexisting_adopted',
    source_mode: 'developer_checkout',
    channel_version: null,
    artifact_ref: null,
    layer_digest: null,
    source_archive_sha256: null,
    source_git_head_sha: identity.source_git_head_sha,
    tree_sha256: identity.tree_sha256,
    rollback_ref: null,
    preparation_status: input.dryRun ? 'validated_no_write' : 'completed',
    bootstrap_command: null,
    package_prepare_command: null,
    health_check_command: [health.command, ...health.args],
    handler_probe_command: [handler.command, ...handler.args],
    health_output_sha256: healthResult?.outputSha256 ?? null,
    handler_probe_output_sha256: handlerResult?.outputSha256 ?? null,
    preparation_root: null,
    preparation_scope: 'developer_checkout_root',
  };
}
