import fs from 'node:fs';
import path from 'node:path';

import {
  assertGitSuccess,
  normalizeOptionalString,
  runCommand,
  runGit,
  type CommandResult,
} from './shared.ts';
import { inspectGitRepo } from './module-git.ts';

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

type FrameworkSelfUpdateInput = {
  targetRoot: string;
  sourceRoot?: string | null;
  allowDirtySource?: boolean;
  skipDependencyInstall?: boolean;
};

const FRAMEWORK_SOURCE_METADATA_FILE = '.opl-framework-source.json';

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
    && fs.existsSync(path.join(repoPath, 'src', 'cli.ts'))
    && fs.existsSync(path.join(repoPath, 'bin', 'opl'));
}

function resolveFrameworkUpdateSource(explicitSource?: string | null) {
  return normalizeOptionalString(explicitSource ?? process.env.OPL_FRAMEWORK_UPDATE_SOURCE) ?? null;
}

export function resolveFrameworkUpdateTargetRoot(defaultTargetRoot: string) {
  return path.resolve(
    normalizeOptionalString(process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT) ?? defaultTargetRoot,
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

function runDependencyInstall(targetRoot: string): FrameworkDependencyInstall {
  const command = 'npm';
  const args = ['install', '--include=optional', '--ignore-scripts=false'];
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
  sourceRoot: string;
  sourceHeadSha: string | null;
  copiedFileCount: number;
}) {
  const metadataPath = path.join(input.targetRoot, FRAMEWORK_SOURCE_METADATA_FILE);
  const payload = {
    surface_kind: 'opl_framework_runtime_source',
    version: 1,
    source_root: input.sourceRoot,
    source_head_sha: input.sourceHeadSha,
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

export function runOplFrameworkSelfUpdate(
  input: FrameworkSelfUpdateInput,
): OplFrameworkUpdateTargetResult {
  const targetRoot = path.resolve(input.targetRoot);
  const sourceRootRaw = resolveFrameworkUpdateSource(input.sourceRoot);
  if (!sourceRootRaw) {
    return buildResult('skipped', 'framework_update_source_not_configured');
  }

  const sourceRoot = path.resolve(sourceRootRaw);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory() || !isOplFrameworkRoot(sourceRoot)) {
    return buildResult('manual_required', 'framework_update_source_invalid', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (!fs.existsSync(targetRoot) || !fs.statSync(targetRoot).isDirectory() || !isOplFrameworkRoot(targetRoot)) {
    return buildResult('manual_required', 'framework_update_target_invalid', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (pathsReferToSameLocation(sourceRoot, targetRoot)) {
    return buildResult('skipped', 'framework_update_target_is_source');
  }

  if (isGitRepo(targetRoot)) {
    return buildResult('skipped', 'framework_update_target_is_developer_checkout', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: null,
      copied_file_count: 0,
      dependency_install: skippedDependencyInstall(false),
      metadata_ref: null,
    });
  }

  if (!isGitRepo(sourceRoot)) {
    return buildResult('manual_required', 'framework_update_source_not_git_checkout', {
      target_root: targetRoot,
      source_root: sourceRoot,
      source_head_sha: null,
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
      copied_file_count: copiedFileCount,
      dependency_install: dependencyInstall,
      metadata_ref: metadataRef,
    },
  );
}
