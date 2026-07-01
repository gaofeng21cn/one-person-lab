import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FrameworkContractError,
} from '../contracts.ts';
import {
  assertGitSuccess,
  normalizeOptionalString,
  runCommand,
  runGit,
  type CommandResult,
} from './shared.ts';
import { inspectGitRepo } from './module-git.ts';

const FRAMEWORK_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.framework.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

type OciImageRef = {
  registry: string;
  repository: string;
  tag: string;
  image: string;
};

type OciLayer = {
  mediaType?: string;
  digest?: string;
  annotations?: Record<string, string>;
};

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
  allowDirtySource?: boolean;
  skipDependencyInstall?: boolean;
};

const FRAMEWORK_SOURCE_METADATA_FILE = '.opl-framework-source.json';
const FRAMEWORK_PREVIOUS_ROOT_SUFFIX = '.previous';

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

function resolveFrameworkUpdateArchive(explicitArchive?: string | null) {
  return normalizeOptionalString(explicitArchive ?? process.env.OPL_FRAMEWORK_UPDATE_ARCHIVE) ?? null;
}

function resolveFrameworkUpdateArchiveSha256(explicitSha256?: string | null) {
  return normalizeOptionalString(explicitSha256 ?? process.env.OPL_FRAMEWORK_UPDATE_ARCHIVE_SHA256) ?? null;
}

function resolvePackageOwner() {
  return normalizeOptionalString(process.env.OPL_PACKAGES_OWNER) ?? 'gaofeng21cn';
}

function resolvePackageChannelTag() {
  return normalizeOptionalString(process.env.OPL_PACKAGE_CHANNEL_TAG)
    ?? normalizeOptionalString(process.env.OPL_PACKAGE_CHANNEL_VERSION)
    ?? 'latest';
}

function parseImageRef(raw: string): OciImageRef {
  const [registry, ...repositoryParts] = raw.split('/');
  if (!registry || repositoryParts.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Invalid OCI image reference.', { image: raw });
  }
  let repository = repositoryParts.join('/');
  let tag = 'latest';
  const separator = repository.lastIndexOf(':');
  if (separator > repository.lastIndexOf('/')) {
    tag = repository.slice(separator + 1);
    repository = repository.slice(0, separator);
  }
  return {
    registry,
    repository,
    tag,
    image: `${registry}/${repository}`,
  };
}

function resolveChannelManifestRef() {
  const explicit = normalizeOptionalString(process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF);
  if (explicit) return parseImageRef(explicit);
  return parseImageRef(`ghcr.io/${resolvePackageOwner()}/one-person-lab-manifest:${resolvePackageChannelTag()}`);
}

function runCurl(args: string[], errorKind: string, details: Record<string, unknown>, capture = true) {
  const curlBin = normalizeOptionalString(process.env.OPL_CURL_BIN) ?? 'curl';
  const result = runCommand(curlBin, args, undefined, { maxBuffer: 64 * 1024 * 1024 });
  if (result.exitCode !== 0) {
    throw new FrameworkContractError('build_command_failed', `Failed to fetch OPL Framework runtime artifact: ${errorKind}.`, {
      ...details,
        command: [curlBin, ...args],
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return capture ? result.stdout : '';
}

function fetchGhcrToken(imageRef: OciImageRef) {
  if (imageRef.registry !== 'ghcr.io') {
    throw new FrameworkContractError('contract_shape_invalid', 'Only ghcr.io OPL Framework runtime artifact refs are supported.', {
      image: `${imageRef.image}:${imageRef.tag}`,
    });
  }
  const scope = `repository:${imageRef.repository}:pull`;
  const tokenUrl = `https://${imageRef.registry}/token?service=${encodeURIComponent(imageRef.registry)}&scope=${encodeURIComponent(scope)}`;
  const payload = runCurl(['-fsSL', tokenUrl], 'ghcr_token', { image: imageRef.image, tag: imageRef.tag });
  const parsed = JSON.parse(payload) as { token?: string };
  if (!parsed.token) {
    throw new FrameworkContractError('contract_shape_invalid', 'GHCR token response is missing token.', {
      image: imageRef.image,
      tag: imageRef.tag,
    });
  }
  return parsed.token;
}

function fetchOciManifest(imageRef: OciImageRef, token: string) {
  const manifestUrl = `https://${imageRef.registry}/v2/${imageRef.repository}/manifests/${imageRef.tag}`;
  const payload = runCurl([
    '-fsSL',
    '-H',
    `Authorization: Bearer ${token}`,
    '-H',
    'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    manifestUrl,
  ], 'oci_manifest', { image: imageRef.image, tag: imageRef.tag });
  return JSON.parse(payload) as { layers?: OciLayer[] };
}

function fetchOciBlob(imageRef: OciImageRef, token: string, digest: string, targetPath: string) {
  const blobUrl = `https://${imageRef.registry}/v2/${imageRef.repository}/blobs/${digest}`;
  runCurl([
    '-fsSL',
    '-H',
    `Authorization: Bearer ${token}`,
    blobUrl,
    '-o',
    targetPath,
  ], 'oci_blob', { image: imageRef.image, tag: imageRef.tag, digest }, false);
}

function selectLayer(manifest: { layers?: OciLayer[] }, mediaType: string, titleSuffix?: string) {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  return layers.find((layer) => layer.mediaType === mediaType)
    ?? (titleSuffix
      ? layers.find((layer) => String(layer.annotations?.['org.opencontainers.image.title'] ?? '').endsWith(titleSuffix))
      : null)
    ?? null;
}

function readFrameworkChannelEntry() {
  const imageRef = resolveChannelManifestRef();
  const token = fetchGhcrToken(imageRef);
  const manifest = fetchOciManifest(imageRef, token);
  const layer = selectLayer(manifest, CHANNEL_MANIFEST_LAYER_MEDIA_TYPE, 'opl-channel-manifest.json');
  if (!layer?.digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL channel manifest layer is missing.', {
      image: imageRef.image,
      tag: imageRef.tag,
    });
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-channel-manifest-'));
  try {
    const manifestPath = path.join(tempRoot, 'opl-channel-manifest.json');
    fetchOciBlob(imageRef, token, layer.digest, manifestPath);
    const channelManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      opl_version?: string;
      packages?: {
        framework_core?: {
          artifact?: string;
          source_archive?: { sha256?: string };
          source_git?: { head_sha?: string };
        };
      };
    };
    const framework = channelManifest.packages?.framework_core;
    const artifact = normalizeOptionalString(framework?.artifact);
    if (!artifact) {
      throw new FrameworkContractError('contract_shape_invalid', 'OPL channel manifest is missing packages.framework_core.artifact.', {
        channel_version: channelManifest.opl_version ?? null,
      });
    }
    return {
      channel_version: normalizeOptionalString(channelManifest.opl_version),
      artifact,
      source_archive_sha256: normalizeOptionalString(framework?.source_archive?.sha256),
      source_git_head_sha: normalizeOptionalString(framework?.source_git?.head_sha),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function fetchFrameworkArtifactFromChannel(tempRoot: string) {
  const entry = readFrameworkChannelEntry();
  const imageRef = parseImageRef(entry.artifact);
  const token = fetchGhcrToken(imageRef);
  const manifest = fetchOciManifest(imageRef, token);
  const layer = selectLayer(manifest, FRAMEWORK_LAYER_MEDIA_TYPE, `one-person-lab-framework-${entry.channel_version ?? imageRef.tag}.tar.gz`);
  if (!layer?.digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Framework runtime artifact layer is missing.', {
      image: imageRef.image,
      tag: imageRef.tag,
    });
  }
  const archivePath = path.join(tempRoot, 'one-person-lab-framework.tar.gz');
  fetchOciBlob(imageRef, token, layer.digest, archivePath);
  return {
    archivePath,
    expectedSha256: entry.source_archive_sha256,
    artifactRef: entry.artifact,
    channelVersion: entry.channel_version,
    sourceGitHeadSha: entry.source_git_head_sha,
  };
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
  const rollbackRef = `opl://managed-update/runtime_substrate/framework/rollback/${encodeURIComponent(previousRoot)}`;
  fs.rmSync(previousRoot, { recursive: true, force: true });
  try {
    if (fs.existsSync(targetRoot)) {
      fs.renameSync(targetRoot, previousRoot);
    }
    fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
    fs.renameSync(stageRoot, targetRoot);
  } catch (error) {
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

function applyFrameworkArchive(input: FrameworkSelfUpdateInput & {
  targetRoot: string;
  sourceArchive: string;
  expectedSha256: string | null;
  sourceGitHeadSha?: string | null;
}) {
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

  if (!fs.existsSync(targetRoot) || !fs.statSync(targetRoot).isDirectory() || !isOplFrameworkRoot(targetRoot)) {
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

  if (isGitRepo(targetRoot)) {
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
      const artifact = fetchFrameworkArtifactFromChannel(tempRoot);
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
      rollbackRef: `opl://managed-update/runtime_substrate/framework/rollback/${encodeURIComponent(rollbackRoot)}`,
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

export function readOplFrameworkRuntimeUpdateStatus(defaultTargetRoot: string) {
  const targetRoot = resolveFrameworkUpdateTargetRoot(defaultTargetRoot);
  const sourceArchiveRaw = resolveFrameworkUpdateArchive();
  const sourceRootRaw = resolveFrameworkUpdateSource();
  const sourceArchive = sourceArchiveRaw ? path.resolve(sourceArchiveRaw) : null;
  const sourceRoot = sourceRootRaw ? path.resolve(sourceRootRaw) : null;
  let channelEntry: ReturnType<typeof readFrameworkChannelEntry> | null = null;
  if (!sourceArchive && !sourceRoot) {
    try {
      channelEntry = readFrameworkChannelEntry();
    } catch {
      channelEntry = null;
    }
  }
  const previousRoot = `${targetRoot}${FRAMEWORK_PREVIOUS_ROOT_SUFFIX}`;
  const metadataPath = path.join(targetRoot, FRAMEWORK_SOURCE_METADATA_FILE);
  const channelArtifactAvailable = Boolean(channelEntry?.artifact);
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
    channel_artifact: channelEntry?.artifact ?? null,
    channel_version: channelEntry?.channel_version ?? null,
    channel_source_archive_sha256: channelEntry?.source_archive_sha256 ?? null,
    update_configured: Boolean(sourceArchive || sourceRoot || channelEntry),
    update_available: Boolean(
      (sourceArchive && fs.existsSync(sourceArchive) && fs.statSync(sourceArchive).isFile())
      || (sourceRoot && fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory())
      || channelArtifactAvailable,
    ),
    previous_root: previousRoot,
    previous_root_available: fs.existsSync(previousRoot) && fs.statSync(previousRoot).isDirectory() && isOplFrameworkRoot(previousRoot),
    rollback_ref: fs.existsSync(previousRoot)
      ? `opl://managed-update/runtime_substrate/framework/rollback/${encodeURIComponent(previousRoot)}`
      : null,
    metadata_ref: fs.existsSync(metadataPath) ? metadataPath : null,
    command_ref: 'opl update apply --component runtime_substrate --json',
    rollback_command_ref: 'opl update rollback --component runtime_substrate --json',
  };
}
