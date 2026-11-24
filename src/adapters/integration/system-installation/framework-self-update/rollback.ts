import fs from 'node:fs';
import path from 'node:path';

import { normalizeOptionalString, resolveProjectRoot } from '../shared.ts';
import {
  MANAGED_UPDATE_OWNER_ACTIONS,
  ownerBoundaryRef,
} from '../../managed-update-owner-boundary.ts';
import {
  FRAMEWORK_SOURCE_METADATA_FILE,
  FRAMEWORK_PREVIOUS_ROOT_SUFFIX,
  isGitRepo,
  isOplFrameworkRoot,
  pathsReferToSameLocation,
} from './source-resolution.ts';
import type {
  OplFrameworkRollbackTargetResult,
} from './source-resolution.ts';

export function copyDirectoryContents(sourceRoot: string, targetRoot: string) {
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

export function moveDirectory(sourceRoot: string, targetRoot: string) {
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

export function writeFrameworkSourceMetadata(input: {
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

export function activateFrameworkStage(targetRoot: string, stageRoot: string) {
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

export function rollbackFrameworkRoot(targetRoot: string, previousRoot: string) {
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
