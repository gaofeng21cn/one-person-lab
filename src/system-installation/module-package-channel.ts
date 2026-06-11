import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../contracts.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import {
  type DomainModuleSpec,
  normalizeOptionalString,
  runCommand,
} from './shared.ts';

const MODULE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.module.source.v1+gzip';
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
  size?: number;
  annotations?: Record<string, string>;
};

type OplChannelManifest = {
  opl_version?: string;
  packages?: {
    modules?: Record<string, OplChannelModuleEntry>;
  };
};

type OplChannelModuleEntry = {
  module_id?: string;
  repo_name?: string;
  artifact?: string;
  source_archive?: {
    sha256?: string;
  };
  source_git?: {
    head_sha?: string;
  };
};

type OplChannelModuleEntryWithArtifact = OplChannelModuleEntry & {
  artifact: string;
};

export type PackageChannelActivationSnapshot = {
  root: string;
  channel_version: string | null;
  artifact_ref: string | null;
  layer_digest: string | null;
  source_archive_sha256: string | null;
  source_git_head_sha: string | null;
  tree_sha256: string;
  activated_at: string;
};

export type PackageChannelLifecycle = {
  schema_version: 1;
  staged: {
    root: string;
    status: 'activated' | 'rolled_back' | 'previous';
    activated_at: string;
  };
  current: PackageChannelActivationSnapshot;
  previous: PackageChannelActivationSnapshot | null;
  rollback_ref: string | null;
};

export type PackageChannelRollbackResult = {
  status: 'completed';
  module_id: DomainModuleSpec['module_id'];
  checkout_path: string;
  previous_path: string;
  current: PackageChannelActivationSnapshot;
  previous: PackageChannelActivationSnapshot | null;
  rollback_ref: string | null;
};

function resolvePackageOwner() {
  return normalizeOptionalString(process.env.OPL_PACKAGES_OWNER) ?? 'gaofeng21cn';
}

function resolvePackageChannelTag() {
  return normalizeOptionalString(process.env.OPL_PACKAGE_CHANNEL_VERSION)
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
  if (explicit) {
    return parseImageRef(explicit);
  }
  const owner = resolvePackageOwner();
  const tag = normalizeOptionalString(process.env.OPL_PACKAGE_CHANNEL_TAG) ?? resolvePackageChannelTag();
  return parseImageRef(`ghcr.io/${owner}/one-person-lab-manifest:${tag}`);
}

function runCurl(args: string[], errorKind: string, details: Record<string, unknown>, capture = true) {
  const result = runCommand('curl', args, undefined, { maxBuffer: 64 * 1024 * 1024 });
  if (result.exitCode !== 0) {
    throw new FrameworkContractError(
      'build_command_failed',
      `Failed to fetch OPL package channel data: ${errorKind}.`,
      {
        ...details,
        command: ['curl', ...args],
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }
  return capture ? result.stdout : '';
}

function fetchGhcrToken(imageRef: OciImageRef) {
  if (imageRef.registry !== 'ghcr.io') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Only ghcr.io package-channel refs are supported.',
      { image: `${imageRef.image}:${imageRef.tag}` },
    );
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

function verifySha256(filePath: string, expected: string, details: Record<string, unknown>) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actual !== expected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL package-channel artifact sha256 mismatch.',
      { ...details, expected_sha256: expected, actual_sha256: actual },
    );
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

export function computePackageChannelTreeSha256(rootPath: string) {
  const hash = crypto.createHash('sha256');
  const visit = (directory: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosixPath(path.relative(rootPath, absolutePath));
      if (relativePath === PACKAGED_MODULE_MARKER_FILE) {
        continue;
      }

      const stat = fs.lstatSync(absolutePath);
      const mode = (stat.mode & 0o777).toString(8);
      if (entry.isDirectory()) {
        hash.update(`dir\0${relativePath}\0${mode}\0`);
        visit(absolutePath);
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${relativePath}\0${mode}\0${fs.readlinkSync(absolutePath)}\0`);
      } else if (entry.isFile()) {
        const fileHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
        hash.update(`file\0${relativePath}\0${mode}\0${fileHash}\0`);
      } else {
        hash.update(`special\0${relativePath}\0${mode}\0`);
      }
    }
  };

  visit(rootPath);
  return hash.digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function optionalStringField(record: Record<string, unknown> | null, key: string) {
  return normalizeOptionalString(typeof record?.[key] === 'string' ? record[key] : null);
}

function packageChannelStageRoot(targetPath: string) {
  return `${targetPath}.stage`;
}

function packageChannelPreviousRoot(targetPath: string) {
  return `${targetPath}.previous`;
}

function markerPath(repoPath: string) {
  return path.join(repoPath, PACKAGED_MODULE_MARKER_FILE);
}

function readMarkerRecord(repoPath: string, spec: DomainModuleSpec) {
  const file = markerPath(repoPath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.module_id !== spec.module_id || parsed.repo_name !== spec.repo_name) {
    return null;
  }
  return parsed;
}

function parseActivationSnapshot(value: unknown): PackageChannelActivationSnapshot | null {
  const record = optionalRecord(value);
  const root = optionalStringField(record, 'root');
  const treeSha256 = optionalStringField(record, 'tree_sha256');
  const activatedAt = optionalStringField(record, 'activated_at');
  if (!record || !root || !treeSha256 || !activatedAt) {
    return null;
  }
  return {
    root,
    channel_version: optionalStringField(record, 'channel_version'),
    artifact_ref: optionalStringField(record, 'artifact_ref'),
    layer_digest: optionalStringField(record, 'layer_digest'),
    source_archive_sha256: optionalStringField(record, 'source_archive_sha256'),
    source_git_head_sha: optionalStringField(record, 'source_git_head_sha'),
    tree_sha256: treeSha256,
    activated_at: activatedAt,
  };
}

export function readPackageChannelLifecycle(repoPath: string, spec: DomainModuleSpec): PackageChannelLifecycle | null {
  const marker = readMarkerRecord(repoPath, spec);
  if (marker?.package_channel !== true) {
    return null;
  }
  const lifecycle = optionalRecord(marker.package_channel_lifecycle);
  const staged = optionalRecord(lifecycle?.staged);
  const current = parseActivationSnapshot(lifecycle?.current);
  const previous = lifecycle && 'previous' in lifecycle && lifecycle.previous !== null
    ? parseActivationSnapshot(lifecycle.previous)
    : null;
  const stagedRoot = optionalStringField(staged, 'root');
  const stagedStatus = optionalStringField(staged, 'status');
  const stagedActivatedAt = optionalStringField(staged, 'activated_at');
  if (
    lifecycle?.schema_version !== 1
    || !stagedRoot
    || (stagedStatus !== 'activated' && stagedStatus !== 'rolled_back' && stagedStatus !== 'previous')
    || !stagedActivatedAt
    || !current
    || (lifecycle.previous !== null && !previous)
  ) {
    return null;
  }
  return {
    schema_version: 1,
    staged: {
      root: stagedRoot,
      status: stagedStatus,
      activated_at: stagedActivatedAt,
    },
    current,
    previous,
    rollback_ref: optionalStringField(lifecycle, 'rollback_ref'),
  };
}

function readPackageChannelActivation(repoPath: string, spec: DomainModuleSpec) {
  return readPackageChannelLifecycle(repoPath, spec)?.current ?? null;
}

function writePackageChannelMarker(
  repoPath: string,
  spec: DomainModuleSpec,
  lifecycle: PackageChannelLifecycle,
) {
  fs.writeFileSync(
    markerPath(repoPath),
    `${JSON.stringify({
      marker_version: 1,
      module_id: spec.module_id,
      repo_name: spec.repo_name,
      package_channel: true,
      source_git: { head_sha: lifecycle.current.source_git_head_sha },
      package_channel_lifecycle: lifecycle,
    }, null, 2)}\n`,
    'utf8',
  );
}

function readGitHeadSha(repoPath: string) {
  const result = runCommand('git', ['rev-parse', 'HEAD'], repoPath);
  return result.exitCode === 0 ? normalizeOptionalString(result.stdout) : null;
}

function assertCleanGitCheckout(repoPath: string, spec: DomainModuleSpec) {
  const result = runCommand('git', ['status', '--porcelain'], repoPath);
  if (result.exitCode !== 0 || result.stdout.trim()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Module package-channel activation requires a clean managed checkout.',
      {
        module_id: spec.module_id,
        checkout_path: repoPath,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      2,
    );
  }
}

function assertCleanPackageChannelRoot(repoPath: string, spec: DomainModuleSpec) {
  const marker = readMarkerRecord(repoPath, spec);
  if (marker?.package_channel === true) {
    const lifecycle = readPackageChannelLifecycle(repoPath, spec);
    if (!lifecycle?.current.tree_sha256) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'Module package-channel activation requires lifecycle metadata for the current managed root.',
        {
          module_id: spec.module_id,
          checkout_path: repoPath,
          expected_marker: PACKAGED_MODULE_MARKER_FILE,
        },
        2,
      );
    }
    const actualTreeSha256 = computePackageChannelTreeSha256(repoPath);
    if (actualTreeSha256 !== lifecycle.current.tree_sha256) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'Module package-channel activation requires a clean managed package root.',
        {
          module_id: spec.module_id,
          checkout_path: repoPath,
          expected_tree_sha256: lifecycle.current.tree_sha256,
          actual_tree_sha256: actualTreeSha256,
        },
        2,
      );
    }
    return;
  }

  if (fs.existsSync(path.join(repoPath, '.git'))) {
    assertCleanGitCheckout(repoPath, spec);
    return;
  }

  throw new FrameworkContractError(
    'cli_usage_error',
    'Module package-channel activation can only replace a clean managed package root or clean managed git checkout.',
    {
      module_id: spec.module_id,
      checkout_path: repoPath,
      expected_marker: PACKAGED_MODULE_MARKER_FILE,
    },
    2,
  );
}

function previousSnapshotForExistingRoot(repoPath: string, previousPath: string, spec: DomainModuleSpec) {
  const packageSnapshot = readPackageChannelActivation(repoPath, spec);
  if (packageSnapshot) {
    return {
      ...packageSnapshot,
      root: previousPath,
    };
  }

  const gitHeadSha = fs.existsSync(path.join(repoPath, '.git')) ? readGitHeadSha(repoPath) : null;
  return {
    root: previousPath,
    channel_version: null,
    artifact_ref: null,
    layer_digest: null,
    source_archive_sha256: null,
    source_git_head_sha: gitHeadSha,
    tree_sha256: computePackageChannelTreeSha256(repoPath),
    activated_at: nowIso(),
  } satisfies PackageChannelActivationSnapshot;
}

function buildRollbackRef(spec: DomainModuleSpec, previous: PackageChannelActivationSnapshot | null) {
  if (!previous) {
    return null;
  }
  return `opl://managed-module-package-channel/${spec.module_id}/rollback/${previous.source_git_head_sha ?? previous.tree_sha256}`;
}

function selectLayer(manifest: { layers?: OciLayer[] }, mediaType: string, titleSuffix?: string) {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  return layers.find((layer) => layer.mediaType === mediaType)
    ?? (titleSuffix
      ? layers.find((layer) => String(layer.annotations?.['org.opencontainers.image.title'] ?? '').endsWith(titleSuffix))
      : null)
    ?? null;
}

function readChannelManifest() {
  const imageRef = resolveChannelManifestRef();
  const token = fetchGhcrToken(imageRef);
  const manifest = fetchOciManifest(imageRef, token);
  const layer = selectLayer(manifest, CHANNEL_MANIFEST_LAYER_MEDIA_TYPE, 'opl-channel-manifest.json');
  if (!layer?.digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL package-channel manifest layer is missing.', {
      image: imageRef.image,
      tag: imageRef.tag,
    });
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-channel-manifest-'));
  try {
    const manifestPath = path.join(tempRoot, 'opl-channel-manifest.json');
    fetchOciBlob(imageRef, token, layer.digest, manifestPath);
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as OplChannelManifest;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function moduleEntry(channelManifest: OplChannelManifest, spec: DomainModuleSpec): OplChannelModuleEntryWithArtifact {
  const entry = channelManifest.packages?.modules?.[spec.module_id];
  const artifact = normalizeOptionalString(entry?.artifact);
  if (!entry || !artifact) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL package-channel module entry is missing.', {
      module_id: spec.module_id,
      channel_version: channelManifest.opl_version ?? null,
    });
  }
  return { ...entry, artifact };
}

function extractArchiveToStage(archivePath: string, stagePath: string, spec: DomainModuleSpec) {
  const unpackPath = `${stagePath}.unpack-${process.pid}`;
  fs.rmSync(stagePath, { recursive: true, force: true });
  fs.rmSync(unpackPath, { recursive: true, force: true });
  fs.mkdirSync(unpackPath, { recursive: true });
  const extract = runCommand('tar', ['-xzf', archivePath, '-C', unpackPath]);
  if (extract.exitCode !== 0) {
    fs.rmSync(unpackPath, { recursive: true, force: true });
    throw new FrameworkContractError('build_command_failed', 'Failed to extract OPL module package archive.', {
      module_id: spec.module_id,
      archive_path: archivePath,
      stdout: extract.stdout,
      stderr: extract.stderr,
    });
  }

  const extractedRoot = path.join(unpackPath, spec.repo_name);
  const sourcePath = fs.existsSync(extractedRoot) ? extractedRoot : unpackPath;

  fs.mkdirSync(path.dirname(stagePath), { recursive: true });
  fs.renameSync(sourcePath, stagePath);
  if (sourcePath !== unpackPath) {
    fs.rmSync(unpackPath, { recursive: true, force: true });
  }
}

function activateStagedPackageChannel(input: {
  spec: DomainModuleSpec;
  targetPath: string;
  stagePath: string;
  channelVersion: string | null;
  artifactRef: string;
  layerDigest: string;
  sourceArchiveSha256: string | null;
  sourceGitHeadSha: string | null;
}) {
  const previousPath = packageChannelPreviousRoot(input.targetPath);
  const activatedAt = nowIso();
  const previous = fs.existsSync(input.targetPath)
    ? previousSnapshotForExistingRoot(input.targetPath, previousPath, input.spec)
    : null;
  const current = {
    root: input.targetPath,
    channel_version: input.channelVersion,
    artifact_ref: input.artifactRef,
    layer_digest: input.layerDigest,
    source_archive_sha256: input.sourceArchiveSha256,
    source_git_head_sha: input.sourceGitHeadSha,
    tree_sha256: computePackageChannelTreeSha256(input.stagePath),
    activated_at: activatedAt,
  } satisfies PackageChannelActivationSnapshot;
  const lifecycle = {
    schema_version: 1,
    staged: {
      root: input.stagePath,
      status: 'activated',
      activated_at: activatedAt,
    },
    current,
    previous,
    rollback_ref: buildRollbackRef(input.spec, previous),
  } satisfies PackageChannelLifecycle;

  writePackageChannelMarker(input.stagePath, input.spec, lifecycle);
  fs.mkdirSync(path.dirname(input.targetPath), { recursive: true });
  fs.rmSync(previousPath, { recursive: true, force: true });
  try {
    if (fs.existsSync(input.targetPath)) {
      fs.renameSync(input.targetPath, previousPath);
    }
    fs.renameSync(input.stagePath, input.targetPath);
  } catch (error) {
    if (!fs.existsSync(input.targetPath) && fs.existsSync(previousPath)) {
      fs.renameSync(previousPath, input.targetPath);
    }
    throw error;
  }
}

export function installManagedModuleFromPackageChannel(spec: DomainModuleSpec, targetPath: string) {
  const channelManifest = readChannelManifest();
  const entry = moduleEntry(channelManifest, spec);
  const imageRef = parseImageRef(entry.artifact);
  const token = fetchGhcrToken(imageRef);
  const manifest = fetchOciManifest(imageRef, token);
  const layer = selectLayer(manifest, MODULE_LAYER_MEDIA_TYPE, `${spec.repo_name}-${channelManifest.opl_version}.tar.gz`);
  if (!layer?.digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL module package source layer is missing.', {
      module_id: spec.module_id,
      image: imageRef.image,
      tag: imageRef.tag,
    });
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-package-'));
  const stagePath = packageChannelStageRoot(targetPath);
  try {
    const archivePath = path.join(tempRoot, `${spec.repo_name}.tar.gz`);
    fetchOciBlob(imageRef, token, layer.digest, archivePath);
    if (entry.source_archive?.sha256) {
      verifySha256(archivePath, entry.source_archive.sha256, {
        module_id: spec.module_id,
        image: imageRef.image,
        tag: imageRef.tag,
      });
    }
    if (fs.existsSync(targetPath)) {
      assertCleanPackageChannelRoot(targetPath, spec);
    }
    extractArchiveToStage(archivePath, stagePath, spec);
    activateStagedPackageChannel({
      spec,
      targetPath,
      stagePath,
      channelVersion: normalizeOptionalString(channelManifest.opl_version),
      artifactRef: entry.artifact,
      layerDigest: layer.digest,
      sourceArchiveSha256: normalizeOptionalString(entry.source_archive?.sha256),
      sourceGitHeadSha: normalizeOptionalString(entry.source_git?.head_sha),
    });
  } finally {
    fs.rmSync(stagePath, { recursive: true, force: true });
    fs.rmSync(`${stagePath}.unpack-${process.pid}`, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function rollbackManagedModulePackageChannel(
  spec: DomainModuleSpec,
  targetPath: string,
): PackageChannelRollbackResult {
  const previousPath = packageChannelPreviousRoot(targetPath);
  const stagePath = packageChannelStageRoot(targetPath);
  const lifecycle = readPackageChannelLifecycle(targetPath, spec);
  if (!lifecycle?.previous) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Module package-channel rollback requires a recorded previous root.',
      {
        module_id: spec.module_id,
        checkout_path: targetPath,
        previous_path: previousPath,
      },
      2,
    );
  }
  if (path.resolve(lifecycle.previous.root) !== path.resolve(previousPath)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Module package-channel rollback previous root does not match the managed previous path.',
      {
        module_id: spec.module_id,
        checkout_path: targetPath,
        previous_root: lifecycle.previous.root,
        expected_previous_root: previousPath,
      },
    );
  }
  if (!fs.existsSync(previousPath)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Module package-channel rollback previous root is missing.',
      {
        module_id: spec.module_id,
        checkout_path: targetPath,
        previous_path: previousPath,
      },
      2,
    );
  }

  assertCleanPackageChannelRoot(targetPath, spec);
  assertCleanPackageChannelRoot(previousPath, spec);

  const swapPath = `${targetPath}.rollback-${process.pid}`;
  fs.rmSync(swapPath, { recursive: true, force: true });
  try {
    fs.renameSync(targetPath, swapPath);
    fs.renameSync(previousPath, targetPath);
    fs.renameSync(swapPath, previousPath);
  } catch (error) {
    if (!fs.existsSync(targetPath) && fs.existsSync(swapPath)) {
      fs.renameSync(swapPath, targetPath);
    }
    throw error;
  }

  const activatedAt = nowIso();
  const current = {
    ...lifecycle.previous,
    root: targetPath,
    tree_sha256: computePackageChannelTreeSha256(targetPath),
    activated_at: activatedAt,
  } satisfies PackageChannelActivationSnapshot;
  const previous = {
    ...lifecycle.current,
    root: previousPath,
    tree_sha256: computePackageChannelTreeSha256(previousPath),
    activated_at: lifecycle.current.activated_at,
  } satisfies PackageChannelActivationSnapshot;
  const rollbackRef = buildRollbackRef(spec, previous);
  const currentLifecycle = {
    schema_version: 1,
    staged: {
      root: stagePath,
      status: 'rolled_back',
      activated_at: activatedAt,
    },
    current,
    previous,
    rollback_ref: rollbackRef,
  } satisfies PackageChannelLifecycle;
  const previousLifecycle = {
    schema_version: 1,
    staged: {
      root: stagePath,
      status: 'previous',
      activated_at: previous.activated_at,
    },
    current: previous,
    previous: current,
    rollback_ref: buildRollbackRef(spec, current),
  } satisfies PackageChannelLifecycle;
  writePackageChannelMarker(targetPath, spec, currentLifecycle);
  writePackageChannelMarker(previousPath, spec, previousLifecycle);

  return {
    status: 'completed',
    module_id: spec.module_id,
    checkout_path: targetPath,
    previous_path: previousPath,
    current,
    previous,
    rollback_ref: rollbackRef,
  };
}
