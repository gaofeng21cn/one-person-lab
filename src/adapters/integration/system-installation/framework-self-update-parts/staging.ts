import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isRecord } from '../../../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../../../kernel/json-file.ts';
import {
  assertGitSuccess,
  runCommand,
  runGit,
  type CommandResult,
} from '../shared.ts';
import { frameworkGenerationDigest, isDeveloperRuntimePath } from '../pending-runtime-integrity.ts';
import {
  FRAMEWORK_PENDING_METADATA_SUFFIX,
  FRAMEWORK_PENDING_ROOT_SUFFIX,
  FRAMEWORK_SOURCE_METADATA_FILE,
  buildResult,
  currentProcessInstanceId,
  frameworkSourceAlreadyCurrent,
  isOplFrameworkRoot,
  resolveFrameworkUpdateSource,
  readManagedFrameworkGitInstallation,
  skippedDependencyInstall,
  shouldSkipDependencyInstall,
} from './source-resolution.ts';
import type {
  FrameworkDependencyInstall,
  FrameworkPendingMetadata,
  FrameworkSelfUpdateInput,
} from './source-resolution.ts';
import {
  activateFrameworkStage,
  copyDirectoryContents,
  moveDirectory,
  rollbackFrameworkRoot,
  writeFrameworkSourceMetadata,
} from './rollback.ts';

export function dependencyInputsChanged(sourceRoot: string, targetRoot: string) {
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

export function listTrackedFiles(sourceRoot: string) {
  const result = runGit(['ls-files', '-z'], sourceRoot);
  assertGitSuccess(result, 'Failed to list tracked OPL Framework source files.', {
    source_root: sourceRoot,
  });
  return result.stdout.split('\0').filter((entry) => entry.length > 0);
}

export function copyTrackedFiles(sourceRoot: string, targetRoot: string, files: string[]) {
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

export function runDependencyInstall(targetRoot: string): FrameworkDependencyInstall {
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

export function stageFrameworkForRestart(targetRoot: string, stageRoot: string, metadata: Omit<FrameworkPendingMetadata, 'surface_kind' | 'target_root' | 'pending_root' | 'staged_at' | 'staging_process_instance_id' | 'generation_sha256'>) {
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
    generation_sha256: frameworkGenerationDigest(pendingRoot),
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
  const managedGit = readManagedFrameworkGitInstallation(targetRoot);
  const unchangedManagedGit = managedGit?.clean && managedGit.source_current;
  if ((!unchangedManagedGit && isDeveloperRuntimePath(targetRoot)) || (fs.existsSync(targetRoot) && (
    fs.lstatSync(targetRoot).isSymbolicLink() || (!unchangedManagedGit && isDeveloperRuntimePath(fs.realpathSync(targetRoot)))
  )) || resolveFrameworkUpdateSource()) {
    return {
      surface_kind: 'opl_framework_generation_activation.v1', status: 'manual_required',
      reason: 'framework_activation_developer_source_protected', target_root: targetRoot,
    };
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
  if (typeof pending.pending_root !== 'string' || path.resolve(pending.pending_root) !== path.resolve(pendingRoot)
    || pending.target_root !== targetRoot || !fs.existsSync(pendingRoot) || !isOplFrameworkRoot(pendingRoot)) {
    return {
      surface_kind: 'opl_framework_generation_activation.v1', status: 'manual_required',
      reason: 'framework_pending_generation_invalid', target_root: targetRoot, pending_root: pendingRoot,
    };
  }
  if (fs.lstatSync(pendingRoot).isSymbolicLink() || isDeveloperRuntimePath(pendingRoot)
    || !pending.generation_sha256 || frameworkGenerationDigest(pendingRoot) !== pending.generation_sha256) {
    return {
      surface_kind: 'opl_framework_generation_activation.v1', status: 'manual_required',
      reason: 'framework_pending_generation_verification_failed', target_root: targetRoot, pending_root: pendingRoot,
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
  let metadataRef: string;
  try {
    metadataRef = writeFrameworkSourceMetadata({
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
  } catch (error) {
    rollbackFrameworkRoot(targetRoot, activation.previousRoot);
    throw error;
  }
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

export function pendingFrameworkArtifactResult(targetRoot: string, input: {
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
      || !isOplFrameworkRoot(pendingRoot)
      || !pending.generation_sha256
      || frameworkGenerationDigest(pendingRoot) !== pending.generation_sha256) return null;
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

export function applyFrameworkArchive(input: FrameworkSelfUpdateInput & {
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
    // Activation swaps the whole root, so the incoming generation must carry its own dependencies.
    const dependencyInstallRequired = dependencyInputsChanged(finalStageRoot, input.targetRoot)
      || !fs.existsSync(path.join(finalStageRoot, 'node_modules'));
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
