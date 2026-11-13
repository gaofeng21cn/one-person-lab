import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import {
  MANAGED_UPDATE_OWNER_ACTIONS,
  managedUpdateCommand,
  ownerBoundaryRef,
} from '../managed-update-owner-boundary.ts';
import { inspectGitRepo } from './module-git.ts';
import {
  fetchFrameworkArtifactFromChannel,
  readFrameworkChannelEntry,
} from './framework-self-update-parts/channel-artifact.ts';
import { resolveDockerWebuiFrameworkCarrier } from './framework-self-update-parts/docker-webui-carrier.ts';
import {
  FRAMEWORK_PENDING_METADATA_SUFFIX,
  FRAMEWORK_PENDING_ROOT_SUFFIX,
  FRAMEWORK_PREVIOUS_ROOT_SUFFIX,
  FRAMEWORK_SOURCE_METADATA_FILE,
  buildResult,
  frameworkSourceAlreadyCurrent,
  isGitRepo,
  isOplFrameworkRoot,
  pathsReferToSameLocation,
  readManagedFrameworkGitInstallation,
  resolveFrameworkUpdateArchive,
  resolveFrameworkUpdateArchiveSha256,
  resolveFrameworkUpdateSource,
  resolveFrameworkUpdateTargetRoot,
  shouldAllowDirtySource,
  shouldDisableRemoteFrameworkArtifact,
  shouldSkipDependencyInstall,
  skippedDependencyInstall,
} from './framework-self-update-parts/source-resolution.ts';
import type {
  FrameworkPendingMetadata,
  FrameworkSelfUpdateInput,
  OplFrameworkRollbackTargetResult,
  OplFrameworkUpdateTargetResult,
} from './framework-self-update-parts/source-resolution.ts';
import {
  activatePendingOplFrameworkRuntime,
  applyFrameworkArchive,
  copyTrackedFiles,
  listTrackedFiles,
  pendingFrameworkArtifactResult,
  runDependencyInstall,
} from './framework-self-update-parts/staging.ts';
import {
  runOplFrameworkSelfRollback,
  writeFrameworkSourceMetadata,
} from './framework-self-update-parts/rollback.ts';

export type { OplFrameworkRollbackTargetResult, OplFrameworkUpdateTargetResult } from './framework-self-update-parts/source-resolution.ts';
export { activatePendingOplFrameworkRuntime, resolveFrameworkUpdateTargetRoot, runOplFrameworkSelfRollback };

export function runOplFrameworkSelfUpdate(
  input: FrameworkSelfUpdateInput,
): OplFrameworkUpdateTargetResult {
  const targetRoot = path.resolve(input.targetRoot);
  const sourceArchiveRaw = resolveFrameworkUpdateArchive(input.sourceArchive);
  const sourceRootRaw = resolveFrameworkUpdateSource(input.sourceRoot);
  if (input.stageOnly && (!isOplFrameworkRoot(targetRoot) || sourceRootRaw)) {
    return buildResult('skipped', 'background_requires_existing_managed_framework', {
      target_root: targetRoot, source_root: sourceRootRaw, source_head_sha: null,
      source_archive: null, source_archive_sha256: null, previous_root: null,
      rollback_ref: null, copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false), metadata_ref: null,
    });
  }
  const allowChannelArtifact = input.allowChannelArtifact !== false && !shouldDisableRemoteFrameworkArtifact();
  const archiveOrChannelApplyRequested = Boolean(sourceArchiveRaw || (!sourceRootRaw && allowChannelArtifact));
  const dockerWebuiCarrier = !sourceArchiveRaw && !sourceRootRaw
    ? resolveDockerWebuiFrameworkCarrier()
    : null;

  if (dockerWebuiCarrier) {
    return buildResult('skipped', 'framework_runtime_owned_by_webui_image_carrier', {
      target_root: targetRoot,
      source_root: dockerWebuiCarrier.frameworkRoot,
      source_head_sha: dockerWebuiCarrier.sourceHeadSha,
      source_archive: null,
      source_archive_sha256: null,
      previous_root: null,
      rollback_ref: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: dockerWebuiCarrier.seedMetadataPath,
    });
  }

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

  const managedGit = readManagedFrameworkGitInstallation(targetRoot);
  if (fs.existsSync(targetRoot) && isGitRepo(targetRoot) && !(managedGit?.clean && managedGit.source_current)) {
    return buildResult('skipped', managedGit ? 'framework_managed_git_installation_changed' : 'framework_update_target_is_developer_checkout', {
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
      const channelEntry = input.channelEntry ?? readFrameworkChannelEntry();
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

  const copiedFileCount = copyTrackedFiles(sourceRoot, targetRoot, listTrackedFiles(sourceRoot));
  // npm's prepare lifecycle rebuilds dist and the MCP App resource. Source-only
  // updates need it even when versions and dependency manifests are unchanged.
  const dependencyInstall = !shouldSkipDependencyInstall(input)
    ? runDependencyInstall(targetRoot)
    : skippedDependencyInstall(true);
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
  let pendingGeneration: FrameworkPendingMetadata | null = null;
  try {
    const pending = readJsonPayloadFile(`${targetRoot}${FRAMEWORK_PENDING_METADATA_SUFFIX}`);
    if (isRecord(pending) && pending.surface_kind === 'opl_framework_pending_generation.v1'
      && pending.target_root === targetRoot
      && pending.pending_root === `${targetRoot}${FRAMEWORK_PENDING_ROOT_SUFFIX}`
      && isOplFrameworkRoot(pending.pending_root)) {
      pendingGeneration = pending as FrameworkPendingMetadata;
    }
  } catch { /* No verified pending generation. */ }
  const channelArtifactAvailable = Boolean(channelEntry?.artifact);
  const channelArtifactCurrent = Boolean(channelEntry && fs.existsSync(targetRoot) && frameworkSourceAlreadyCurrent(targetRoot, {
    sourceHeadSha: channelEntry.source_git_head_sha,
    sourceArchiveSha256: channelEntry.source_archive_sha256,
  }));
  return {
    target_root: targetRoot,
    pending_generation: pendingGeneration,
    target_valid: fs.existsSync(targetRoot) && fs.statSync(targetRoot).isDirectory() && isOplFrameworkRoot(targetRoot),
    target_is_developer_checkout: fs.existsSync(targetRoot) && isGitRepo(targetRoot) && !readManagedFrameworkGitInstallation(targetRoot),
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
