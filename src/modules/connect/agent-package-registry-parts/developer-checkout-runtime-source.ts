import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { materializeStandardAgentFrameworkLink } from '../standard-agent-framework-link.ts';
import { computePackageChannelTreeSha256 } from '../system-installation/module-package-channel.ts';
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

type CapturedRuntimeFile = {
  path: string;
  content: Buffer;
  mode: number;
};

export type DeveloperCheckoutSourceIdentity = ReturnType<typeof readDeveloperCheckoutSourceIdentity>;
export type ExpectedDeveloperCheckoutSourceIdentity = {
  source_git_head_sha: string | null;
  tree_sha256: string;
};

type CapturedRuntimeSnapshot = {
  files: CapturedRuntimeFile[];
  sourceIdentity: DeveloperCheckoutSourceIdentity;
  snapshotSha256: string;
};

const MAX_RUNTIME_CAPTURE_ATTEMPTS = 3;

function runtimeSnapshotDigest(files: CapturedRuntimeFile[]) {
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path, 'en'))) {
    hash.update(`${Buffer.byteLength(file.path)}\0${file.path}\0${file.mode.toString(8)}\0${file.content.length}\0`);
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function sameSourceIdentity(
  left: DeveloperCheckoutSourceIdentity,
  right: ExpectedDeveloperCheckoutSourceIdentity,
) {
  return left.source_git_head_sha === right.source_git_head_sha
    && left.tree_sha256 === right.tree_sha256;
}

function captureDeveloperRuntimeFiles(checkoutPath: string) {
  const before = readDeveloperCheckoutSourceIdentity(checkoutPath);
  const listed = runCommand(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    checkoutPath,
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (listed.exitCode !== 0 || listed.timedOut) {
    throw sourceFailure('Developer checkout runtime files could not be enumerated.', {
      checkout_path: checkoutPath,
      exit_code: listed.exitCode,
    });
  }
  const root = fs.realpathSync(checkoutPath);
  const files: CapturedRuntimeFile[] = [];
  for (const relativePath of [...new Set(listed.stdout.split('\0').filter(Boolean))].sort()) {
    const firstSegment = relativePath.split(/[\\/]/, 1)[0];
    if (new Set(['.codegraph', '.git', '.opl', '.venv', 'node_modules', '__pycache__', '.pytest_cache'])
      .has(firstSegment)) continue;
    const absolutePath = path.resolve(root, relativePath);
    const relative = path.relative(root, absolutePath);
    if (!relative
      || relative.startsWith('..')
      || path.isAbsolute(relative)
      || !fs.existsSync(absolutePath)) continue;
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw sourceFailure('Developer checkout runtime snapshot only admits regular files.', {
        checkout_path: checkoutPath,
        source_path: absolutePath,
      });
    }
    files.push({
      path: relative.split(path.sep).join('/'),
      content: fs.readFileSync(absolutePath),
      mode: stat.mode & 0o777,
    });
  }
  const after = readDeveloperCheckoutSourceIdentity(checkoutPath);
  if (before.source_git_head_sha !== after.source_git_head_sha
    || before.tree_sha256 !== after.tree_sha256) {
    return { stable: false as const, sourceIdentity: after };
  }
  return {
    stable: true as const,
    files,
    sourceIdentity: after,
    snapshotSha256: runtimeSnapshotDigest(files),
  };
}

function freezeRuntimeSnapshotTree(root: string) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    fs.chmodSync(root, stat.mode & 0o111 ? 0o555 : 0o444);
    return;
  }
  if (!stat.isDirectory()) {
    throw sourceFailure('Developer runtime snapshot contains an unsupported filesystem entry.', {
      snapshot_path: root,
    });
  }
  for (const entry of fs.readdirSync(root)) freezeRuntimeSnapshotTree(path.join(root, entry));
  fs.chmodSync(root, 0o555);
}

export function makeDeveloperCheckoutRuntimeSnapshotWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    fs.chmodSync(root, stat.mode & 0o111 ? 0o755 : 0o644);
    return;
  }
  if (!stat.isDirectory()) return;
  fs.chmodSync(root, 0o755);
  for (const entry of fs.readdirSync(root)) {
    makeDeveloperCheckoutRuntimeSnapshotWritable(path.join(root, entry));
  }
}

function removeRuntimeSnapshotTree(root: string) {
  if (!fs.existsSync(root)) return;
  makeDeveloperCheckoutRuntimeSnapshotWritable(root);
  fs.rmSync(root, { recursive: true, force: true });
}

function stageDeveloperRuntimeSnapshot(
  snapshotRoot: string,
  captured: CapturedRuntimeSnapshot,
) {
  const stage = fs.mkdtempSync(path.join(snapshotRoot, '.stage-'));
  try {
    for (const file of captured.files) {
      const target = path.join(stage, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, { mode: file.mode });
      fs.chmodSync(target, file.mode);
    }
    const stagedFiles = captured.files.map((file) => ({
      ...file,
      content: fs.readFileSync(path.join(stage, file.path)),
    }));
    if (runtimeSnapshotDigest(stagedFiles) !== captured.snapshotSha256) {
      throw sourceFailure('Developer runtime snapshot failed staged-byte verification.', {
        checkout_path: stage,
      });
    }
    materializeStandardAgentFrameworkLink({ agentRoot: stage });
    freezeRuntimeSnapshotTree(stage);
    return {
      stage,
      runtimeSnapshotSha256: computePackageChannelTreeSha256(stage),
    };
  } catch (error) {
    removeRuntimeSnapshotTree(stage);
    throw error;
  }
}

export function materializeDeveloperCheckoutRuntimeSnapshot(input: {
  moduleId: string;
  checkoutPath: string;
  dryRun: boolean;
  expectedSourceIdentity?: ExpectedDeveloperCheckoutSourceIdentity | null;
}) {
  if (!input.moduleId
    || input.moduleId === '.'
    || input.moduleId === '..'
    || input.moduleId.includes('/')
    || input.moduleId.includes('\\')) {
    throw sourceFailure('Developer runtime snapshot module id is unsafe.', {
      module_id: input.moduleId,
    });
  }
  let captured: CapturedRuntimeSnapshot | null = null;
  let observedIdentity: DeveloperCheckoutSourceIdentity | null = null;
  for (let attempt = 0; attempt < MAX_RUNTIME_CAPTURE_ATTEMPTS; attempt += 1) {
    const candidate = captureDeveloperRuntimeFiles(input.checkoutPath);
    observedIdentity = candidate.sourceIdentity;
    if (!candidate.stable) continue;
    if (input.expectedSourceIdentity
      && !sameSourceIdentity(candidate.sourceIdentity, input.expectedSourceIdentity)) continue;
    captured = candidate;
    break;
  }
  if (!captured) {
    throw sourceFailure('Developer checkout did not remain at the package-captured identity.', {
      checkout_path: input.checkoutPath,
      capture_attempts: MAX_RUNTIME_CAPTURE_ATTEMPTS,
      expected_source_git_head_sha: input.expectedSourceIdentity?.source_git_head_sha ?? null,
      actual_source_git_head_sha: observedIdentity?.source_git_head_sha ?? null,
      expected_tree_sha256: input.expectedSourceIdentity?.tree_sha256 ?? null,
      actual_tree_sha256: observedIdentity?.tree_sha256 ?? null,
    });
  }
  const snapshotRoot = path.join(
    ensureOplStateDir(resolveOplStatePaths()).state_dir,
    'agent-package-developer-runtime-snapshots',
    input.moduleId,
  );
  const snapshotPath = path.join(snapshotRoot, captured.snapshotSha256);
  if (input.dryRun) {
    return {
      ...captured,
      snapshotPath,
      runtimeSnapshotSha256: null,
      created: false,
    };
  }
  fs.mkdirSync(snapshotRoot, { recursive: true });
  const staged = stageDeveloperRuntimeSnapshot(snapshotRoot, captured);
  if (fs.existsSync(snapshotPath)) {
    try {
      if (!fs.lstatSync(snapshotPath).isSymbolicLink()
        && fs.lstatSync(snapshotPath).isDirectory()
        && computePackageChannelTreeSha256(snapshotPath) === staged.runtimeSnapshotSha256) {
        removeRuntimeSnapshotTree(staged.stage);
        return {
          ...captured,
          snapshotPath,
          runtimeSnapshotSha256: staged.runtimeSnapshotSha256,
          created: false,
        };
      }
    } catch {
      // A partial or polluted cache is replaced below from the captured source bytes.
    }
  }
  const displaced = `${snapshotPath}.displaced-${process.pid}-${Date.now()}`;
  let displacedExisting = false;
  try {
    if (fs.existsSync(snapshotPath)) {
      fs.renameSync(snapshotPath, displaced);
      displacedExisting = true;
    }
    fs.renameSync(staged.stage, snapshotPath);
    if (displacedExisting) removeRuntimeSnapshotTree(displaced);
  } catch (error) {
    removeRuntimeSnapshotTree(staged.stage);
    if (!fs.existsSync(snapshotPath) && displacedExisting && fs.existsSync(displaced)) {
      fs.renameSync(displaced, snapshotPath);
    }
    throw error;
  }
  return {
    ...captured,
    snapshotPath,
    runtimeSnapshotSha256: staged.runtimeSnapshotSha256,
    created: true,
  };
}

export function buildDeveloperCheckoutRuntimeSourceState(input: {
  config: AgentPackageManagedRuntimeSourceCarrier;
  checkoutPath: string;
  status: AgentPackageManagedRuntimeSourceState['status'];
  dryRun: boolean;
  sourceCheckoutPath?: string;
  sourceIdentity?: ReturnType<typeof readDeveloperCheckoutSourceIdentity>;
  runtimeSnapshotSha256?: string | null;
  preparation?: Pick<AgentPackageManagedRuntimeSourceState,
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
  const immutableSnapshot = Boolean(input.sourceCheckoutPath);
  const health = (
    immutableSnapshot
      ? spec.package_health_check_command
        ?? spec.runtime_probe_command
        ?? spec.health_check_command
      : spec.health_check_command
  )?.(input.checkoutPath) ?? null;
  const handler = spec.runtime_probe_command?.(input.checkoutPath)
    ?? (immutableSnapshot ? spec.package_health_check_command?.(input.checkoutPath) : null)
    ?? spec.exec_command?.(input.checkoutPath, ['--help'])
    ?? null;
  if (!health || !handler) {
    throw sourceFailure('Developer checkout runtime source is missing a health or handler probe.', {
      module_id: input.config.module_id,
      checkout_path: input.checkoutPath,
    });
  }
  if (!input.dryRun && !input.preparation) {
    throw sourceFailure('Developer checkout runtime source is missing its carrier-owned preparation result.', {
      module_id: input.config.module_id,
      checkout_path: input.checkoutPath,
    });
  }
  const identity = input.sourceIdentity
    ?? readDeveloperCheckoutSourceIdentity(input.sourceCheckoutPath ?? input.checkoutPath);
  return {
    surface_kind: 'opl_agent_package_managed_runtime_source',
    status: input.status,
    carrier_kind: input.config.carrier_kind,
    module_id: input.config.module_id,
    checkout_path: input.checkoutPath,
    source_checkout_path: input.sourceCheckoutPath ?? input.checkoutPath,
    ownership: input.sourceCheckoutPath ? 'package_created' : 'preexisting_adopted',
    source_mode: 'developer_checkout',
    channel_version: null,
    artifact_ref: null,
    layer_digest: null,
    source_archive_sha256: null,
    source_git_head_sha: identity.source_git_head_sha,
    tree_sha256: identity.tree_sha256,
    runtime_snapshot_sha256: input.runtimeSnapshotSha256 ?? null,
    rollback_ref: null,
    preparation_status: input.preparation?.preparation_status ?? 'validated_no_write',
    bootstrap_command: input.preparation?.bootstrap_command ?? null,
    package_prepare_command: input.preparation?.package_prepare_command ?? null,
    health_check_command: input.preparation?.health_check_command ?? [health.command, ...health.args],
    handler_probe_command: input.preparation?.handler_probe_command ?? [handler.command, ...handler.args],
    health_output_sha256: input.preparation?.health_output_sha256 ?? null,
    handler_probe_output_sha256: input.preparation?.handler_probe_output_sha256 ?? null,
    preparation_root: input.preparation?.preparation_root ?? null,
    preparation_scope: input.sourceCheckoutPath ? 'developer_snapshot_root' : 'developer_checkout_root',
  };
}
