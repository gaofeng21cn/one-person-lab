import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import {
  assertGitSuccess,
  normalizeOptionalString,
  resolveProjectRoot,
  runCommand,
  runGit,
  type CommandResult,
} from './shared.ts';
import { inspectGitRepo } from './module-git.ts';
import {
  MANAGED_UPDATE_OWNER_ACTIONS,
  managedUpdateCommand,
  ownerBoundaryRef,
} from '../managed-update-owner-boundary.ts';
import {
  fetchFrameworkArtifactFromChannel,
  readFrameworkChannelEntry,
} from './framework-self-update-parts/channel-artifact.ts';

type FrameworkDependencyInstall = {
  required: boolean;
  status: 'completed' | 'skipped' | 'failed';
  command_preview: string[];
  exit_code: number | null;
  stdout: string;
  stderr: string;
};

type FrameworkSelfUpdateResult = {
  target_root: string;
  source_root: string | null;
  source_head_sha: string | null;
  source_archive: string | null;
  source_archive_sha256: string | null;
  previous_root: string | null;
  rollback_ref: string | null;
  copied_file_count: number;
  dependency_install: FrameworkDependencyInstall;
  metadata_ref: string | null;
};

export type OplFrameworkUpdateTargetResult = {
  target_type: 'framework';
  target_id: 'opl-framework';
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  result: FrameworkSelfUpdateResult | null;
};

type FrameworkSelfRollbackResult = {
  target_root: string;
  previous_root: string;
  rollback_root: string | null;
  metadata_ref: string | null;
};

export type OplFrameworkRollbackTargetResult = {
  target_type: 'framework';
  target_id: 'opl-framework';
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  result: FrameworkSelfRollbackResult | null;
};

type FrameworkSelfUpdateInput = {
  targetRoot: string;
  sourceRoot?: string | null;
  sourceArchive?: string | null;
  sourceArchiveSha256?: string | null;
  allowChannelArtifact?: boolean;
  allowDirtySource?: boolean;
  skipDependencyInstall?: boolean;
};

const FRAMEWORK_SOURCE_METADATA_FILE = '.opl-framework-source.json';
const FRAMEWORK_PREVIOUS_ROOT_SUFFIX = '.previous';
const FRAMEWORK_PENDING_ROOT_SUFFIX = '.pending';
const FRAMEWORK_PENDING_METADATA_SUFFIX = '.pending.json';
const HEADLESS_PROCESS_INSTANCE_ID = `headless-cli:${process.pid}:${Date.now()}`;

function currentProcessInstanceId() {
  return normalizeOptionalString(process.env.OPL_APP_PROCESS_INSTANCE_ID) ?? HEADLESS_PROCESS_INSTANCE_ID;
}

type FrameworkPendingMetadata = {
  surface_kind: 'opl_framework_pending_generation.v1';
  target_root: string;
  pending_root: string;
  source_root: string | null;
  source_head_sha: string | null;
  source_archive: string | null;
  source_archive_sha256: string | null;
  copied_file_count: number;
  staged_at: string;
  staging_process_instance_id: string;
};

function pathsReferToSameLocation(left: string, right: string) {
  const resolveExisting = (value: string) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return path.resolve(value);
    }
  };

  return resolveExisting(left) === resolveExisting(right);
}

function isGitRepo(repoPath: string) {
  return runGit(['rev-parse', '--is-inside-work-tree'], repoPath).exitCode === 0;
}

function isOplFrameworkRoot(repoPath: string) {
  return fs.existsSync(path.join(repoPath, 'package.json'))
    && (
      fs.existsSync(path.join(repoPath, 'src', 'entrypoints', 'cli.ts'))
      || fs.existsSync(path.join(repoPath, 'src', 'cli.ts'))
      || fs.existsSync(path.join(repoPath, 'dist', 'entrypoints', 'cli.js'))
    )
    && fs.existsSync(path.join(repoPath, 'bin', 'opl'));
}

function resolveFrameworkUpdateSource(explicitSource?: string | null) {
  return normalizeOptionalString(explicitSource ?? process.env.OPL_FRAMEWORK_UPDATE_SOURCE) ?? null;
}

function resolveFrameworkUpdateArchive(explicitArchive?: string | null) {
  return normalizeOptionalString(explicitArchive ?? process.env.OPL_FRAMEWORK_UPDATE_ARCHIVE) ?? null;
}

function resolveFrameworkUpdateArchiveSha256(explicitSha256?: string | null) {
  return normalizeOptionalString(explicitSha256 ?? process.env.OPL_FRAMEWORK_UPDATE_ARCHIVE_SHA256) ?? null;
}

export function resolveFrameworkUpdateTargetRoot(defaultTargetRoot: string) {
  const explicitTargetRoot = normalizeOptionalString(process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT);
  if (explicitTargetRoot) {
    return path.resolve(explicitTargetRoot);
  }
  const dockerDataDir = normalizeOptionalString(process.env.OPL_DATA_DIR)
    ?? normalizeOptionalString(process.env.AIONUI_DATA_DIR);
  if (dockerDataDir) {
    return path.join(path.resolve(dockerDataDir), 'opl', 'framework');
  }
  const stateDir = normalizeOptionalString(process.env.OPL_STATE_DIR);
  if (stateDir) {
    return path.resolve(stateDir, '..', 'framework');
  }
  const paths = resolveOplStatePaths();
  const appSupportDir = path.dirname(paths.state_dir);
  return path.resolve(
    appSupportDir.includes(`${path.sep}Library${path.sep}Application Support${path.sep}OPL`)
      ? path.join(appSupportDir, 'framework')
      : defaultTargetRoot,
  );
}

function shouldSkipDependencyInstall(input: FrameworkSelfUpdateInput) {
  return Boolean(input.skipDependencyInstall)
    || process.env.OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL?.trim() === '1';
}

function shouldAllowDirtySource(input: FrameworkSelfUpdateInput) {
  return Boolean(input.allowDirtySource)
    || process.env.OPL_FRAMEWORK_UPDATE_ALLOW_DIRTY_SOURCE?.trim() === '1';
}

function shouldDisableRemoteFrameworkArtifact() {
  return process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
}

function dependencyInputsChanged(sourceRoot: string, targetRoot: string) {
  for (const fileName of ['package.json', 'package-lock.json']) {
    const sourcePath = path.join(sourceRoot, fileName);
    const targetPath = path.join(targetRoot, fileName);
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    const target = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
    if (source !== target) {
      return true;
    }
  }
  return !fs.existsSync(path.join(targetRoot, 'node_modules'));
}

function listTrackedFiles(sourceRoot: string) {
  const result = runGit(['ls-files', '-z'], sourceRoot);
  assertGitSuccess(result, 'Failed to list tracked OPL Framework source files.', {
    source_root: sourceRoot,
  });
  return result.stdout.split('\0').filter((entry) => entry.length > 0);
}

function copyTrackedFiles(sourceRoot: string, targetRoot: string, files: string[]) {
  let copied = 0;
  for (const relativePath of files) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, fs.statSync(sourcePath).mode);
    copied += 1;
  }
  return copied;
}

function copyDirectoryContents(sourceRoot: string, targetRoot: string) {
  let copied = 0;
  const visit = (root: string) => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const sourcePath = path.join(root, entry.name);
      const relativePath = path.relative(sourceRoot, sourcePath);
      const targetPath = path.join(targetRoot, relativePath);
      if (entry.isDirectory()) {
        visit(sourcePath);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
        fs.chmodSync(targetPath, fs.statSync(sourcePath).mode);
        copied += 1;
      }
    }
  };
  visit(sourceRoot);
  return copied;
}

function moveDirectory(sourceRoot: string, targetRoot: string) {
  try {
    fs.renameSync(sourceRoot, targetRoot);
  } catch (error) {
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error;
    }
    fs.cpSync(sourceRoot, targetRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function resolveFallbackPreviousFrameworkRoot(targetRoot: string) {
  const explicit = normalizeOptionalString(process.env.OPL_FRAMEWORK_PREVIOUS_ROOT_SOURCE);
  if (explicit && fs.existsSync(explicit) && fs.statSync(explicit).isDirectory() && isOplFrameworkRoot(explicit)) {
    return path.resolve(explicit);
  }
  const projectRoot = resolveProjectRoot();
  if (!pathsReferToSameLocation(projectRoot, targetRoot) && isOplFrameworkRoot(projectRoot)) {
    return projectRoot;
  }
  return null;
}

function runDependencyInstall(targetRoot: string): FrameworkDependencyInstall {
  const command = 'npm';
  const runtimePayload = fs.existsSync(path.join(targetRoot, 'dist', 'entrypoints', 'cli.js'))
    && !fs.existsSync(path.join(targetRoot, 'src'));
  const args = runtimePayload
    ? ['ci', '--omit=dev', '--include=optional', '--ignore-scripts=false']
    : ['install', '--include=dev', '--include=optional', '--ignore-scripts=false'];
  const result: CommandResult = runCommand(command, args, targetRoot, {
    maxBuffer: 16 * 1024 * 1024,
    timeoutMs: 180_000,
  });
  return {
    required: true,
    status: result.exitCode === 0 ? 'completed' : 'failed',
    command_preview: [command, ...args],
    exit_code: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function skippedDependencyInstall(required: boolean): FrameworkDependencyInstall {
  return {
    required,
    status: 'skipped',
    command_preview: [],
    exit_code: null,
    stdout: '',
    stderr: '',
  };
}

function writeFrameworkSourceMetadata(input: {
  targetRoot: string;
  sourceRoot: string | null;
  sourceHeadSha: string | null;
  sourceArchive: string | null;
  sourceArchiveSha256: string | null;
  previousRoot: string | null;
  rollbackRef: string | null;
  copiedFileCount: number;
}) {
  const metadataPath = path.join(input.targetRoot, FRAMEWORK_SOURCE_METADATA_FILE);
  const payload = {
    surface_kind: 'opl_framework_runtime_source',
    version: 1,
    source_root: input.sourceRoot,
    source_head_sha: input.sourceHeadSha,
    source_archive: input.sourceArchive,
    source_archive_sha256: input.sourceArchiveSha256,
    previous_root: input.previousRoot,
    rollback_ref: input.rollbackRef,
    copied_file_count: input.copiedFileCount,
    updated_at: new Date().toISOString(),
    authority_boundary: {
      owner: 'one-person-lab',
      writes_domain_truth: false,
      writes_domain_quality: false,
      writes_domain_artifacts: false,
    },
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return metadataPath;
}

function readFrameworkSourceMetadata(targetRoot: string) {
  const metadataPath = path.join(targetRoot, FRAMEWORK_SOURCE_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    const payload = readJsonPayloadFile(metadataPath);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function frameworkSourceAlreadyCurrent(targetRoot: string, input: {
  sourceHeadSha?: string | null;
  sourceArchiveSha256?: string | null;
}) {
  const metadata = readFrameworkSourceMetadata(targetRoot);
  if (!metadata) return false;
  return Boolean(
    (input.sourceHeadSha && metadata.source_head_sha === input.sourceHeadSha)
    || (input.sourceArchiveSha256 && metadata.source_archive_sha256 === input.sourceArchiveSha256)
  );
}

function stageFrameworkForRestart(targetRoot: string, stageRoot: string, metadata: Omit<FrameworkPendingMetadata, 'surface_kind' | 'target_root' | 'pending_root' | 'staged_at' | 'staging_process_instance_id'>) {
  const pendingRoot = `${targetRoot}${FRAMEWORK_PENDING_ROOT_SUFFIX}`;
  const pendingMetadataPath = `${targetRoot}${FRAMEWORK_PENDING_METADATA_SUFFIX}`;
  fs.rmSync(pendingRoot, { recursive: true, force: true });
  moveDirectory(stageRoot, pendingRoot);
  const payload: FrameworkPendingMetadata = {
    surface_kind: 'opl_framework_pending_generation.v1',
    target_root: targetRoot,
    pending_root: pendingRoot,
    ...metadata,
    staged_at: new Date().toISOString(),
    staging_process_instance_id: currentProcessInstanceId(),
  };
  const tempPath = `${pendingMetadataPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, pendingMetadataPath);
  return { pendingRoot, pendingMetadataPath };
}

export function activatePendingOplFrameworkRuntime(targetRootInput: string) {
  const targetRoot = path.resolve(targetRootInput);
  const pendingRoot = `${targetRoot}${FRAMEWORK_PENDING_ROOT_SUFFIX}`;
  const pendingMetadataPath = `${targetRoot}${FRAMEWORK_PENDING_METADATA_SUFFIX}`;
  if (!fs.existsSync(pendingMetadataPath) && !fs.existsSync(pendingRoot)) {
    return { surface_kind: 'opl_framework_generation_activation.v1', status: 'no_pending_generation', target_root: targetRoot };
  }
  let pending: FrameworkPendingMetadata;
  try {
    const payload = readJsonPayloadFile(pendingMetadataPath);
    if (!isRecord(payload) || payload.surface_kind !== 'opl_framework_pending_generation.v1') throw new Error('invalid pending metadata shape');
    pending = payload as FrameworkPendingMetadata;
  } catch (error) {
    return {
      surface_kind: 'opl_framework_generation_activation.v1', status: 'manual_required',
      reason: 'framework_pending_metadata_invalid', target_root: targetRoot,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (path.resolve(pending.pending_root) !== path.resolve(pendingRoot)
    || pending.target_root !== targetRoot || !fs.existsSync(pendingRoot) || !isOplFrameworkRoot(pendingRoot)) {
    return {
      surface_kind: 'opl_framework_generation_activation.v1', status: 'manual_required',
      reason: 'framework_pending_generation_invalid', target_root: targetRoot, pending_root: pendingRoot,
    };
  }
  if (pending.staging_process_instance_id === currentProcessInstanceId()) {
    return {
      surface_kind: 'opl_framework_generation_activation.v1', status: 'deferred_same_app_instance',
      target_root: targetRoot, pending_root: pendingRoot,
      staging_process_instance_id: pending.staging_process_instance_id,
    };
  }
  const activation = activateFrameworkStage(targetRoot, pendingRoot);
  const metadataRef = writeFrameworkSourceMetadata({
    targetRoot,
    sourceRoot: pending.source_root,
    sourceHeadSha: pending.source_head_sha,
    sourceArchive: pending.source_archive,
    sourceArchiveSha256: pending.source_archive_sha256,
    previousRoot: activation.previousRoot,
    rollbackRef: activation.rollbackRef,
    copiedFileCount: pending.copied_file_count,
  });
  fs.rmSync(pendingMetadataPath, { force: true });
  return {
    surface_kind: 'opl_framework_generation_activation.v1', status: 'activated', target_root: targetRoot,
    previous_root: activation.previousRoot, rollback_ref: activation.rollbackRef, metadata_ref: metadataRef,
    activated_at: new Date().toISOString(),
  };
}

function verifyArchiveSha256(archivePath: string, expectedSha256: string | null) {
  if (!expectedSha256) return null;
  const result = runCommand('shasum', ['-a', '256', archivePath], process.cwd());
  if (result.exitCode !== 0) {
    throw new Error(`Failed to hash OPL Framework archive: ${result.stderr || result.stdout}`);
  }
  const actual = result.stdout.trim().split(/\s+/)[0] ?? '';
  if (actual !== expectedSha256) {
    throw new Error(`OPL Framework archive sha256 mismatch: expected ${expectedSha256}, got ${actual}`);
  }
  return actual;
}

function extractArchiveToStage(archivePath: string, stageRoot: string) {
  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(stageRoot, { recursive: true });
  const result = runCommand('tar', ['-xzf', archivePath, '-C', stageRoot]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to extract OPL Framework archive: ${result.stderr || result.stdout}`);
  }
  const entries = fs.readdirSync(stageRoot).filter((entry) => !entry.startsWith('__MACOSX'));
  if (entries.length === 1) {
    const candidate = path.join(stageRoot, entries[0]);
    if (fs.statSync(candidate).isDirectory() && isOplFrameworkRoot(candidate)) {
      return candidate;
    }
  }
  return stageRoot;
}

function activateFrameworkStage(targetRoot: string, stageRoot: string) {
  const previousRoot = `${targetRoot}${FRAMEWORK_PREVIOUS_ROOT_SUFFIX}`;
  const rollbackRef = ownerBoundaryRef('opl://managed-update', 'runtime_substrate', 'framework', MANAGED_UPDATE_OWNER_ACTIONS.revert, previousRoot);
  const incomingRoot = `${targetRoot}.incoming-${process.pid}-${Date.now()}`;
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.rmSync(previousRoot, { recursive: true, force: true });
  fs.rmSync(incomingRoot, { recursive: true, force: true });
  try {
    moveDirectory(stageRoot, incomingRoot);
    if (fs.existsSync(targetRoot)) {
      fs.renameSync(targetRoot, previousRoot);
    } else {
      const fallbackPreviousRoot = resolveFallbackPreviousFrameworkRoot(targetRoot);
      if (fallbackPreviousRoot) {
        copyDirectoryContents(fallbackPreviousRoot, previousRoot);
      }
    }
    fs.renameSync(incomingRoot, targetRoot);
  } catch (error) {
    fs.rmSync(incomingRoot, { recursive: true, force: true });
    if (!fs.existsSync(targetRoot) && fs.existsSync(previousRoot)) {
      fs.renameSync(previousRoot, targetRoot);
    }
    throw error;
  }
  return { previousRoot, rollbackRef };
}

function rollbackFrameworkRoot(targetRoot: string, previousRoot: string) {
  const rollbackRoot = `${targetRoot}.rolled-back`;
  fs.rmSync(rollbackRoot, { recursive: true, force: true });
  try {
    if (fs.existsSync(targetRoot)) {
      fs.renameSync(targetRoot, rollbackRoot);
    }
    fs.renameSync(previousRoot, targetRoot);
  } catch (error) {
    if (!fs.existsSync(targetRoot) && fs.existsSync(rollbackRoot)) {
      fs.renameSync(rollbackRoot, targetRoot);
    }
    throw error;
  }
  return rollbackRoot;
}

function buildResult(
  status: OplFrameworkUpdateTargetResult['status'],
  reason: string,
  result: OplFrameworkUpdateTargetResult['result'] = null,
): OplFrameworkUpdateTargetResult {
  return {
    target_type: 'framework',
    target_id: 'opl-framework',
    status,
    reason,
    result,
  };
}

function pendingFrameworkArtifactResult(targetRoot: string, input: {
  sourceHeadSha?: string | null;
  sourceArchiveSha256?: string | null;
}) {
  const pendingMetadataPath = `${targetRoot}${FRAMEWORK_PENDING_METADATA_SUFFIX}`;
  const pendingRoot = `${targetRoot}${FRAMEWORK_PENDING_ROOT_SUFFIX}`;
  if (!fs.existsSync(pendingMetadataPath) || !fs.existsSync(pendingRoot)) return null;
  try {
    const payload = readJsonPayloadFile(pendingMetadataPath);
    if (!isRecord(payload) || payload.surface_kind !== 'opl_framework_pending_generation.v1') return null;
    const pending = payload as FrameworkPendingMetadata;
    const sameArtifact = Boolean(
      (input.sourceHeadSha && pending.source_head_sha === input.sourceHeadSha)
      || (input.sourceArchiveSha256 && pending.source_archive_sha256 === input.sourceArchiveSha256)
    );
    if (!sameArtifact
      || pending.target_root !== targetRoot
      || path.resolve(pending.pending_root) !== path.resolve(pendingRoot)
      || !isOplFrameworkRoot(pendingRoot)) return null;
    return buildResult('skipped', 'framework_runtime_artifact_pending_restart', {
      target_root: targetRoot,
      source_root: pending.source_root,
      source_head_sha: pending.source_head_sha,
      source_archive: pending.source_archive,
      source_archive_sha256: pending.source_archive_sha256,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: pending.copied_file_count,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: pendingMetadataPath,
    });
  } catch {
    return null;
  }
}

function applyFrameworkArchive(input: FrameworkSelfUpdateInput & {
  targetRoot: string;
  sourceArchive: string;
  expectedSha256: string | null;
  sourceGitHeadSha?: string | null;
}) {
  const pendingResult = pendingFrameworkArtifactResult(input.targetRoot, {
    sourceHeadSha: input.sourceGitHeadSha,
    sourceArchiveSha256: input.expectedSha256,
  });
  if (pendingResult) return pendingResult;
  if (fs.existsSync(input.targetRoot) && frameworkSourceAlreadyCurrent(input.targetRoot, {
    sourceHeadSha: input.sourceGitHeadSha,
    sourceArchiveSha256: input.expectedSha256,
  })) {
    return buildResult('skipped', 'framework_runtime_artifact_current', {
      target_root: input.targetRoot, source_root: null, source_head_sha: input.sourceGitHeadSha ?? null,
      source_archive: input.sourceArchive, source_archive_sha256: input.expectedSha256,
      previous_root: null, rollback_ref: null, copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false), metadata_ref: path.join(input.targetRoot, FRAMEWORK_SOURCE_METADATA_FILE),
    });
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-update-'));
  try {
    verifyArchiveSha256(input.sourceArchive, input.expectedSha256);
    const stageRoot = path.join(tempRoot, 'stage');
    const extractedRoot = extractArchiveToStage(input.sourceArchive, stageRoot);
    if (!isOplFrameworkRoot(extractedRoot)) {
      return buildResult('manual_required', 'framework_update_archive_not_framework_root', {
        target_root: input.targetRoot,
        source_root: extractedRoot,
        source_head_sha: input.sourceGitHeadSha ?? null,
        source_archive: input.sourceArchive,
        source_archive_sha256: input.expectedSha256,
        previous_root: null,
        rollback_ref: null,
        copied_file_count: 0,
        dependency_install: skippedDependencyInstall(false),
        metadata_ref: null,
      });
    }
    const finalStageRoot = path.join(tempRoot, 'framework-stage');
    const copiedFileCount = copyDirectoryContents(extractedRoot, finalStageRoot);
    const dependencyInstallRequired = dependencyInputsChanged(finalStageRoot, input.targetRoot);
    const dependencyInstall = dependencyInstallRequired && !shouldSkipDependencyInstall(input)
      ? runDependencyInstall(finalStageRoot)
      : skippedDependencyInstall(dependencyInstallRequired);
    if (dependencyInstall.status === 'failed') {
      return buildResult('manual_required', 'framework_dependency_install_failed', {
        target_root: input.targetRoot,
        source_root: extractedRoot,
        source_head_sha: input.sourceGitHeadSha ?? null,
        source_archive: input.sourceArchive,
        source_archive_sha256: input.expectedSha256,
        previous_root: null,
        rollback_ref: null,
        copied_file_count: copiedFileCount,
        dependency_install: dependencyInstall,
        metadata_ref: null,
      });
    }
    if (fs.existsSync(input.targetRoot)) {
      const staged = stageFrameworkForRestart(input.targetRoot, finalStageRoot, {
        source_root: extractedRoot,
        source_head_sha: input.sourceGitHeadSha ?? null,
        source_archive: input.sourceArchive,
        source_archive_sha256: input.expectedSha256,
        copied_file_count: copiedFileCount,
      });
      return buildResult('completed', 'framework_runtime_artifact_staged_for_restart', {
        target_root: input.targetRoot, source_root: extractedRoot, source_head_sha: input.sourceGitHeadSha ?? null,
        source_archive: input.sourceArchive, source_archive_sha256: input.expectedSha256,
        previous_root: null, rollback_ref: null, copied_file_count: copiedFileCount,
        dependency_install: dependencyInstall, metadata_ref: staged.pendingMetadataPath,
      });
    }
    const activation = activateFrameworkStage(input.targetRoot, finalStageRoot);
    const metadataRef = writeFrameworkSourceMetadata({
      targetRoot: input.targetRoot,
      sourceRoot: extractedRoot,
      sourceHeadSha: input.sourceGitHeadSha ?? null,
      sourceArchive: input.sourceArchive,
      sourceArchiveSha256: input.expectedSha256,
      previousRoot: activation.previousRoot,
      rollbackRef: activation.rollbackRef,
      copiedFileCount,
    });
    return buildResult('completed', 'framework_runtime_artifact_applied', {
      target_root: input.targetRoot,
      source_root: extractedRoot,
      source_head_sha: input.sourceGitHeadSha ?? null,
      source_archive: input.sourceArchive,
      source_archive_sha256: input.expectedSha256,
      previous_root: activation.previousRoot,
      rollback_ref: activation.rollbackRef,
      copied_file_count: copiedFileCount,
      dependency_install: dependencyInstall,
      metadata_ref: metadataRef,
    });
  } catch (error) {
    return buildResult('manual_required', 'framework_update_archive_apply_failed', {
      target_root: input.targetRoot,
      source_root: null,
      source_head_sha: input.sourceGitHeadSha ?? null,
      source_archive: input.sourceArchive,
      source_archive_sha256: input.expectedSha256,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function runOplFrameworkSelfUpdate(
  input: FrameworkSelfUpdateInput,
): OplFrameworkUpdateTargetResult {
  const targetRoot = path.resolve(input.targetRoot);
  const sourceArchiveRaw = resolveFrameworkUpdateArchive(input.sourceArchive);
  const sourceRootRaw = resolveFrameworkUpdateSource(input.sourceRoot);
  const allowChannelArtifact = input.allowChannelArtifact !== false && !shouldDisableRemoteFrameworkArtifact();
  const archiveOrChannelApplyRequested = Boolean(sourceArchiveRaw || (!sourceRootRaw && allowChannelArtifact));

  if (!sourceArchiveRaw && !sourceRootRaw && !allowChannelArtifact) {
    return buildResult('skipped', 'framework_update_channel_not_requested', {
      target_root: targetRoot,
      source_root: null,
      source_head_sha: null,
      source_archive: null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (
    fs.existsSync(targetRoot)
    && (!fs.statSync(targetRoot).isDirectory() || !isOplFrameworkRoot(targetRoot))
  ) {
    return buildResult('manual_required', 'framework_update_target_invalid', {
      target_root: targetRoot,
      source_root: sourceRootRaw ? path.resolve(sourceRootRaw) : null,
      source_head_sha: null,
      source_archive: sourceArchiveRaw ? path.resolve(sourceArchiveRaw) : null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (!fs.existsSync(targetRoot) && !archiveOrChannelApplyRequested) {
    return buildResult('manual_required', 'framework_update_target_invalid', {
      target_root: targetRoot,
      source_root: sourceRootRaw ? path.resolve(sourceRootRaw) : null,
      source_head_sha: null,
      source_archive: sourceArchiveRaw ? path.resolve(sourceArchiveRaw) : null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (fs.existsSync(targetRoot) && isGitRepo(targetRoot)) {
    return buildResult('skipped', 'framework_update_target_is_developer_checkout', {
      target_root: targetRoot,
      source_root: sourceRootRaw ? path.resolve(sourceRootRaw) : null,
      source_head_sha: null,
      source_archive: sourceArchiveRaw ? path.resolve(sourceArchiveRaw) : null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (sourceArchiveRaw) {
    const sourceArchive = path.resolve(sourceArchiveRaw);
    if (!fs.existsSync(sourceArchive) || !fs.statSync(sourceArchive).isFile()) {
      return buildResult('manual_required', 'framework_update_archive_invalid', {
        target_root: targetRoot,
        source_root: null,
        source_head_sha: null,
        source_archive: sourceArchive,
        source_archive_sha256: resolveFrameworkUpdateArchiveSha256(input.sourceArchiveSha256),
        previous_root: null,
        rollback_ref: null,
        copied_file_count: 0,
        dependency_install: skippedDependencyInstall(false),
        metadata_ref: null,
      });
    }
    const expectedSha256 = resolveFrameworkUpdateArchiveSha256(input.sourceArchiveSha256);
    return applyFrameworkArchive({
      ...input,
      targetRoot,
      sourceArchive,
      expectedSha256,
    });
  }

  if (!sourceRootRaw) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-channel-artifact-'));
    try {
      const channelEntry = readFrameworkChannelEntry();
      const pendingResult = pendingFrameworkArtifactResult(targetRoot, {
        sourceHeadSha: channelEntry.source_git_head_sha,
        sourceArchiveSha256: channelEntry.source_archive_sha256,
      });
      if (pendingResult) return pendingResult;
      const artifact = fetchFrameworkArtifactFromChannel(tempRoot, channelEntry);
      return applyFrameworkArchive({
        ...input,
        targetRoot,
        sourceArchive: artifact.archivePath,
        expectedSha256: artifact.expectedSha256,
        sourceGitHeadSha: artifact.sourceGitHeadSha,
      });
    } catch (error) {
      return buildResult('manual_required', 'framework_update_channel_artifact_unavailable', {
        target_root: targetRoot,
        source_root: null,
        source_head_sha: null,
        source_archive: null,
        source_archive_sha256: null,
        previous_root: null,
        rollback_ref: null,
        copied_file_count: 0,
        dependency_install: skippedDependencyInstall(false),
        metadata_ref: error instanceof Error ? error.message : String(error),
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
  const sourceRoot = path.resolve(sourceRootRaw);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory() || !isOplFrameworkRoot(sourceRoot)) {
    return buildResult('manual_required', 'framework_update_source_invalid', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: null,
      source_archive: null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (pathsReferToSameLocation(sourceRoot, targetRoot)) {
    return buildResult('skipped', 'framework_update_target_is_source');
  }

  if (!isGitRepo(sourceRoot)) {
    return buildResult('manual_required', 'framework_update_source_not_git_checkout', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: null,
      source_archive: null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  const sourceGit = inspectGitRepo(sourceRoot, false);
  if (sourceGit.dirty && !shouldAllowDirtySource(input)) {
    return buildResult('manual_required', 'framework_update_source_dirty', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: sourceGit.head_sha,
      source_archive: null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  const dependencyInstallRequired = dependencyInputsChanged(sourceRoot, targetRoot);
  const copiedFileCount = copyTrackedFiles(sourceRoot, targetRoot, listTrackedFiles(sourceRoot));
  const dependencyInstall = dependencyInstallRequired && !shouldSkipDependencyInstall(input)
    ? runDependencyInstall(targetRoot)
    : skippedDependencyInstall(dependencyInstallRequired);
  const metadataRef = writeFrameworkSourceMetadata({
    targetRoot,
    sourceRoot,
    sourceHeadSha: sourceGit.head_sha,
    sourceArchive: null,
    sourceArchiveSha256: null,
    previousRoot: null,
    rollbackRef: null,
    copiedFileCount,
  });

  return buildResult(
    dependencyInstall.status === 'failed' ? 'manual_required' : 'completed',
    dependencyInstall.status === 'failed'
      ? 'framework_dependency_install_failed'
      : 'framework_runtime_source_refreshed',
    {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: sourceGit.head_sha,
      source_archive: null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: copiedFileCount,
      dependency_install: dependencyInstall,
      metadata_ref: metadataRef,
    },
  );
}

export function runOplFrameworkSelfRollback(input: { targetRoot: string }): OplFrameworkRollbackTargetResult {
  const targetRoot = path.resolve(input.targetRoot);
  const previousRoot = `${targetRoot}${FRAMEWORK_PREVIOUS_ROOT_SUFFIX}`;
  if (!fs.existsSync(previousRoot) || !fs.statSync(previousRoot).isDirectory()) {
    return {
      target_type: 'framework',
      target_id: 'opl-framework',
      status: 'skipped',
      reason: 'framework_previous_root_not_available',
      result: null,
    };
  }
  if (!isOplFrameworkRoot(previousRoot)) {
    return {
      target_type: 'framework',
      target_id: 'opl-framework',
      status: 'manual_required',
      reason: 'framework_previous_root_invalid',
      result: {
        target_root: targetRoot,
        previous_root: previousRoot,
        rollback_root: null,
        metadata_ref: null,
      },
    };
  }
  if (fs.existsSync(targetRoot) && isGitRepo(targetRoot)) {
    return {
      target_type: 'framework',
      target_id: 'opl-framework',
      status: 'skipped',
      reason: 'framework_update_target_is_developer_checkout',
      result: {
        target_root: targetRoot,
        previous_root: previousRoot,
        rollback_root: null,
        metadata_ref: null,
      },
    };
  }

  try {
    const rollbackRoot = rollbackFrameworkRoot(targetRoot, previousRoot);
    const metadataRef = writeFrameworkSourceMetadata({
      targetRoot,
      sourceRoot: null,
      sourceHeadSha: null,
      sourceArchive: null,
      sourceArchiveSha256: null,
      previousRoot: rollbackRoot,
      rollbackRef: ownerBoundaryRef('opl://managed-update', 'runtime_substrate', 'framework', MANAGED_UPDATE_OWNER_ACTIONS.revert, rollbackRoot),
      copiedFileCount: 0,
    });
    return {
      target_type: 'framework',
      target_id: 'opl-framework',
      status: 'completed',
      reason: 'framework_runtime_rollback_completed',
      result: {
        target_root: targetRoot,
        previous_root: previousRoot,
        rollback_root: rollbackRoot,
        metadata_ref: metadataRef,
      },
    };
  } catch (error) {
    return {
      target_type: 'framework',
      target_id: 'opl-framework',
      status: 'manual_required',
      reason: 'framework_runtime_rollback_failed',
      result: {
        target_root: targetRoot,
        previous_root: previousRoot,
        rollback_root: null,
        metadata_ref: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function readOplFrameworkRuntimeUpdateStatus(
  defaultTargetRoot: string,
  options: { allowChannelLookup?: boolean } = {},
) {
  const targetRoot = resolveFrameworkUpdateTargetRoot(defaultTargetRoot);
  const sourceArchiveRaw = resolveFrameworkUpdateArchive();
  const sourceRootRaw = resolveFrameworkUpdateSource();
  const sourceArchive = sourceArchiveRaw ? path.resolve(sourceArchiveRaw) : null;
  const sourceRoot = sourceRootRaw ? path.resolve(sourceRootRaw) : null;
  let channelEntry: ReturnType<typeof readFrameworkChannelEntry> | null = null;
  const channelLookupSkipped = options.allowChannelLookup === false && !sourceArchive && !sourceRoot;
  if (!sourceArchive && !sourceRoot && options.allowChannelLookup !== false) {
    try {
      channelEntry = readFrameworkChannelEntry();
    } catch {
      channelEntry = null;
    }
  }
  const previousRoot = `${targetRoot}${FRAMEWORK_PREVIOUS_ROOT_SUFFIX}`;
  const metadataPath = path.join(targetRoot, FRAMEWORK_SOURCE_METADATA_FILE);
  const channelArtifactAvailable = Boolean(channelEntry?.artifact);
  const channelArtifactCurrent = Boolean(channelEntry && fs.existsSync(targetRoot) && frameworkSourceAlreadyCurrent(targetRoot, {
    sourceHeadSha: channelEntry.source_git_head_sha,
    sourceArchiveSha256: channelEntry.source_archive_sha256,
  }));
  return {
    target_root: targetRoot,
    target_valid: fs.existsSync(targetRoot) && fs.statSync(targetRoot).isDirectory() && isOplFrameworkRoot(targetRoot),
    target_is_developer_checkout: fs.existsSync(targetRoot) && isGitRepo(targetRoot),
    source_archive: sourceArchive,
    source_archive_configured: Boolean(sourceArchive),
    source_archive_exists: Boolean(sourceArchive && fs.existsSync(sourceArchive) && fs.statSync(sourceArchive).isFile()),
    source_archive_sha256: resolveFrameworkUpdateArchiveSha256(),
    source_root: sourceRoot,
    source_root_configured: Boolean(sourceRoot),
    source_root_exists: Boolean(sourceRoot && fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory()),
    channel_lookup_skipped: channelLookupSkipped,
    channel_artifact: channelEntry?.artifact ?? null,
    channel_version: channelEntry?.channel_version ?? null,
    channel_release_set_generation: channelEntry?.release_set_generation ?? null,
    channel_artifact_digest: channelEntry?.artifact_digest ?? null,
    channel_artifact_current: channelArtifactCurrent,
    channel_source_archive_sha256: channelEntry?.source_archive_sha256 ?? null,
    update_configured: Boolean(sourceArchive || sourceRoot || channelEntry),
    update_available: Boolean(
      (sourceArchive && fs.existsSync(sourceArchive) && fs.statSync(sourceArchive).isFile())
      || (sourceRoot && fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory())
      || (channelArtifactAvailable && !channelArtifactCurrent),
    ),
    previous_root: previousRoot,
    previous_root_available: fs.existsSync(previousRoot) && fs.statSync(previousRoot).isDirectory() && isOplFrameworkRoot(previousRoot),
    rollback_ref: fs.existsSync(previousRoot)
      ? ownerBoundaryRef('opl://managed-update', 'runtime_substrate', 'framework', MANAGED_UPDATE_OWNER_ACTIONS.revert, previousRoot)
      : null,
    metadata_ref: fs.existsSync(metadataPath) ? metadataPath : null,
    command_ref: 'opl update apply --json',
    rollback_command_ref: managedUpdateCommand(MANAGED_UPDATE_OWNER_ACTIONS.revert, 'runtime_substrate'),
  };
}
