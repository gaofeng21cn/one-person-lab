import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { resolveOplStatePaths } from '../../../../kernel/runtime-state-paths.ts';
import { isRecord } from '../../../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../../../kernel/json-file.ts';
import { normalizeOptionalString, runGit } from '../shared.ts';

export type FrameworkDependencyInstall = {
  required: boolean;
  status: 'completed' | 'skipped' | 'failed';
  command_preview: string[];
  exit_code: number | null;
  stdout: string;
  stderr: string;
};

export type FrameworkSelfUpdateResult = {
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

export type FrameworkSelfRollbackResult = {
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

export type FrameworkSelfUpdateInput = {
  targetRoot: string;
  channelEntry?: ReturnType<typeof import('./channel-artifact.ts').readFrameworkChannelEntry>;
  sourceRoot?: string | null;
  sourceArchive?: string | null;
  sourceArchiveSha256?: string | null;
  allowChannelArtifact?: boolean;
  stageOnly?: boolean;
  allowDirtySource?: boolean;
  skipDependencyInstall?: boolean;
};

export const FRAMEWORK_SOURCE_METADATA_FILE = '.opl-framework-source.json';
export const FRAMEWORK_PREVIOUS_ROOT_SUFFIX = '.previous';
export const FRAMEWORK_PENDING_ROOT_SUFFIX = '.pending';
export const FRAMEWORK_PENDING_METADATA_SUFFIX = '.pending.json';
const HEADLESS_PROCESS_INSTANCE_ID = `headless-cli:${process.pid}:${Date.now()}`;

export type FrameworkPendingMetadata = {
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
  generation_sha256: string;
};

export function currentProcessInstanceId() {
  return normalizeOptionalString(process.env.OPL_APP_PROCESS_INSTANCE_ID) ?? HEADLESS_PROCESS_INSTANCE_ID;
}

export function pathsReferToSameLocation(left: string, right: string) {
  const resolveExisting = (value: string) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return path.resolve(value);
    }
  };

  return resolveExisting(left) === resolveExisting(right);
}

export function isGitRepo(repoPath: string) {
  return runGit(['rev-parse', '--is-inside-work-tree'], repoPath).exitCode === 0;
}

/** Legacy Git installs are managed only when the installer receipt and active command agree. */
export function readManagedFrameworkGitInstallation(root: string, env: NodeJS.ProcessEnv = process.env) {
  try {
    if (!fs.statSync(path.join(root, '.git')).isDirectory()) return null;
    const identity = readJsonPayloadFile(path.join(root, '.opl-framework-installed-source-identity.json'));
    if (!isRecord(identity) || identity.schema !== 'opl_framework_installed_source_identity.v1'
      || identity.install_mode !== 'git' || !['git_head', 'explicit_source_commit'].includes(String(identity.identity_source))
      || typeof identity.framework_sha !== 'string' || !/^[0-9a-f]{40}$/.test(identity.framework_sha)) return null;
    const installedCommand = path.join(env.HOME?.trim() || os.homedir(), '.local', 'bin', 'opl');
    if (!pathsReferToSameLocation(installedCommand, path.join(root, 'bin', 'opl'))) return null;
    const top = runGit(['rev-parse', '--show-toplevel'], root);
    if (top.exitCode !== 0 || !pathsReferToSameLocation(top.stdout.trim(), root)) return null;
    const head = runGit(['rev-parse', 'HEAD'], root);
    const status = runGit(['status', '--porcelain', '--untracked-files=all'], root);
    return { source_current: head.exitCode === 0 && head.stdout.trim() === identity.framework_sha,
      clean: status.exitCode === 0 && status.stdout.trim() === '' };
  } catch { return null; }
}

export function isOplFrameworkRoot(repoPath: string) {
  return fs.existsSync(path.join(repoPath, 'package.json'))
    && (
      fs.existsSync(path.join(repoPath, 'src', 'entrypoints', 'cli.ts'))
      || fs.existsSync(path.join(repoPath, 'src', 'cli.ts'))
      || fs.existsSync(path.join(repoPath, 'dist', 'entrypoints', 'cli.js'))
    )
    && fs.existsSync(path.join(repoPath, 'bin', 'opl'));
}

export function resolveFrameworkUpdateSource(explicitSource?: string | null) {
  return normalizeOptionalString(explicitSource ?? process.env.OPL_FRAMEWORK_UPDATE_SOURCE) ?? null;
}

export function resolveFrameworkUpdateArchive(explicitArchive?: string | null) {
  return normalizeOptionalString(explicitArchive ?? process.env.OPL_FRAMEWORK_UPDATE_ARCHIVE) ?? null;
}

export function resolveFrameworkUpdateArchiveSha256(explicitSha256?: string | null) {
  return normalizeOptionalString(explicitSha256 ?? process.env.OPL_FRAMEWORK_UPDATE_ARCHIVE_SHA256) ?? null;
}

export function resolveFrameworkUpdateTargetRoot(defaultTargetRoot: string) {
  const explicitTargetRoot = normalizeOptionalString(process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT);
  if (explicitTargetRoot) {
    return path.resolve(explicitTargetRoot);
  }
  const dockerDataDir = normalizeOptionalString(process.env.OPL_DATA_DIR);
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

export function shouldSkipDependencyInstall(input: FrameworkSelfUpdateInput) {
  return Boolean(input.skipDependencyInstall)
    || process.env.OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL?.trim() === '1';
}

export function shouldAllowDirtySource(input: FrameworkSelfUpdateInput) {
  return Boolean(input.allowDirtySource)
    || process.env.OPL_FRAMEWORK_UPDATE_ALLOW_DIRTY_SOURCE?.trim() === '1';
}

export function shouldDisableRemoteFrameworkArtifact() {
  return process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
}

export function readFrameworkSourceMetadata(targetRoot: string) {
  const metadataPath = path.join(targetRoot, FRAMEWORK_SOURCE_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    const payload = readJsonPayloadFile(metadataPath);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function frameworkSourceAlreadyCurrent(targetRoot: string, input: {
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

export function buildResult(
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

export function skippedDependencyInstall(required: boolean): FrameworkDependencyInstall {
  return {
    required,
    status: 'skipped',
    command_preview: [],
    exit_code: null,
    stdout: '',
    stderr: '',
  };
}
