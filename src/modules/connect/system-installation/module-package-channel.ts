import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import {
  parseJsonText,
  readJsonFileOrNull,
  readJsonPayloadFile,
} from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import {
  MANAGED_UPDATE_OWNER_ACTIONS,
  ownerBoundaryRef,
} from '../managed-update-owner-boundary.ts';
import {
  type DomainModuleSpec,
  normalizeOptionalString,
  runCommand,
} from './shared.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
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
  release_set_generation?: string;
  packages?: {
    package_catalog?: Record<string, OplChannelPackageCatalogEntry>;
  };
};

type OplChannelPackageCatalogEntry = {
  package_id?: string;
  selected_version?: string;
  versions?: OplChannelPackageCatalogVersion[];
};

type OplChannelPackageCatalogVersion = {
  package_version?: string;
  selection_status?: string;
  source_artifact_ref?: string;
  artifact_digest?: string;
  artifact_status?: string;
  package_content_digest?: string;
  owner_source_commit?: string;
};

type OplChannelPackageVersionSelection = OplChannelPackageCatalogVersion & {
  package_id: string;
  package_version: string;
  immutable_artifact_ref: string;
  package_content_digest: string;
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
    ?? 'latest-stable';
}

function parseImageRef(raw: string): OciImageRef {
  const [registry, ...repositoryParts] = raw.split('/');
  if (!registry || repositoryParts.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Invalid OCI image reference.', { image: raw });
  }
  let repository = repositoryParts.join('/');
  let tag = 'latest-stable';
  const digestSeparator = repository.lastIndexOf('@');
  if (digestSeparator > repository.lastIndexOf('/')) {
    tag = repository.slice(digestSeparator + 1);
    repository = repository.slice(0, digestSeparator);
  }
  const separator = repository.lastIndexOf(':');
  if (separator > repository.lastIndexOf('/')) {
    if (digestSeparator < 0) tag = repository.slice(separator + 1);
    repository = repository.slice(0, separator);
  }
  return {
    registry,
    repository,
    tag,
    image: `${registry}/${repository}`,
  };
}

function resolveChannelManifestRef(declaredRef?: string) {
  const explicit = normalizeOptionalString(process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF);
  if (explicit) {
    return parseImageRef(explicit);
  }
  if (declaredRef) return parseImageRef(declaredRef);
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
  const parsed = parseJsonText(payload);
  const token = isRecord(parsed) ? stringValue(parsed.token) : null;
  if (!token) {
    throw new FrameworkContractError('contract_shape_invalid', 'GHCR token response is missing token.', {
      image: imageRef.image,
      tag: imageRef.tag,
    });
  }
  return token;
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
  const parsed = parseJsonText(payload);
  return isRecord(parsed) ? parsed as { layers?: OciLayer[] } : {};
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
  const parsed = readJsonFileOrNull(file);
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

export function refreshPackageChannelCurrentSnapshot(repoPath: string, spec: DomainModuleSpec) {
  const lifecycle = readPackageChannelLifecycle(repoPath, spec);
  if (!lifecycle) {
    throw new FrameworkContractError('contract_shape_invalid', 'Cannot refresh package-channel snapshot without lifecycle metadata.', {
      module_id: spec.module_id,
      checkout_path: repoPath,
    });
  }
  const refreshed = {
    ...lifecycle,
    current: {
      ...lifecycle.current,
      tree_sha256: computePackageChannelTreeSha256(repoPath),
    },
  } satisfies PackageChannelLifecycle;
  writePackageChannelMarker(repoPath, spec, refreshed);
  return refreshed.current;
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
  return ownerBoundaryRef(
    'opl://managed-module-package-channel',
    spec.module_id,
    MANAGED_UPDATE_OWNER_ACTIONS.revert,
    previous.source_git_head_sha ?? previous.tree_sha256,
  );
}

function selectLayer(manifest: { layers?: OciLayer[] }, mediaType: string, titleSuffix?: string) {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  return layers.find((layer) => layer.mediaType === mediaType)
    ?? (titleSuffix
      ? layers.find((layer) => String(layer.annotations?.['org.opencontainers.image.title'] ?? '').endsWith(titleSuffix))
      : null)
    ?? null;
}

export function readOplPackageChannelManifestWithMetadata(declaredRef?: string) {
  const imageRef = resolveChannelManifestRef(declaredRef);
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
    const raw = fs.readFileSync(manifestPath);
    const parsed = readJsonPayloadFile(manifestPath);
    return {
      payload: isRecord(parsed) ? parsed as OplChannelManifest : {},
      channel_ref: `${imageRef.image}:${imageRef.tag}`,
      layer_digest: layer.digest,
      source_sha256: `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`,
      checked_at: nowIso(),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function readOplPackageChannelManifest(declaredRef?: string) {
  return readOplPackageChannelManifestWithMetadata(declaredRef).payload;
}

function packageEntry(
  channelManifest: OplChannelManifest,
  spec: DomainModuleSpec,
): OplChannelPackageVersionSelection {
  const packageId = canonicalAgentPackageId(spec.module_id);
  const entry = packageId ? channelManifest.packages?.package_catalog?.[packageId] : null;
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  const version = versions.find((candidate) => (
    candidate.selection_status === 'selected_for_release_set'
    && candidate.package_version === entry?.selected_version
  )) ?? versions.find((candidate) => candidate.selection_status === 'selected_for_release_set') ?? null;
  const packageVersion = normalizeOptionalString(version?.package_version);
  const sourceArtifactRef = normalizeOptionalString(version?.source_artifact_ref);
  const artifactDigest = normalizeOptionalString(version?.artifact_digest);
  const packageContentDigest = normalizeOptionalString(version?.package_content_digest);
  if (!packageId || !entry || !version || !packageVersion || !sourceArtifactRef
    || !artifactDigest?.match(/^sha256:[0-9a-f]{64}$/)
    || version.artifact_status !== 'published_immutable'
    || !packageContentDigest?.match(/^sha256:[0-9a-f]{64}$/)) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog has no published immutable package selection.', {
      module_id: spec.module_id,
      package_id: packageId,
      channel_version: channelManifest.release_set_generation ?? null,
      failure_code: 'opl_package_catalog_selection_invalid',
    });
  }
  return {
    ...version,
    package_id: packageId,
    package_version: packageVersion,
    immutable_artifact_ref: `${sourceArtifactRef.replace(/@sha256:[0-9a-f]{64}$/, '')}@${artifactDigest}`,
    package_content_digest: packageContentDigest,
  };
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
  repairTransactionId?: string | null;
}) {
  const previousPath = packageChannelPreviousRoot(input.targetPath);
  const repairDisplacedPath = input.repairTransactionId
    ? `${input.targetPath}.repair-displaced-${input.repairTransactionId}`
    : null;
  const activatedAt = nowIso();
  const preservedPrevious = input.repairTransactionId && fs.existsSync(previousPath)
    ? readPackageChannelActivation(previousPath, input.spec)
    : null;
  const previous = input.repairTransactionId
    ? (preservedPrevious ? { ...preservedPrevious, root: previousPath } : null)
    : fs.existsSync(input.targetPath)
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
  if (!input.repairTransactionId) fs.rmSync(previousPath, { recursive: true, force: true });
  if (repairDisplacedPath) fs.rmSync(repairDisplacedPath, { recursive: true, force: true });
  try {
    if (repairDisplacedPath && fs.existsSync(input.targetPath)) {
      fs.renameSync(input.targetPath, repairDisplacedPath);
    } else if (fs.existsSync(input.targetPath)) {
      fs.renameSync(input.targetPath, previousPath);
    }
    fs.renameSync(input.stagePath, input.targetPath);
  } catch (error) {
    if (!fs.existsSync(input.targetPath) && repairDisplacedPath && fs.existsSync(repairDisplacedPath)) {
      fs.renameSync(repairDisplacedPath, input.targetPath);
    } else if (!fs.existsSync(input.targetPath) && fs.existsSync(previousPath)) {
      fs.renameSync(previousPath, input.targetPath);
    }
    throw error;
  }
  return { repair_displaced_path: repairDisplacedPath && fs.existsSync(repairDisplacedPath) ? repairDisplacedPath : null };
}

export function installManagedModuleFromPackageChannel(
  spec: DomainModuleSpec,
  targetPath: string,
  options: { repairTransactionId?: string | null } = {},
) {
  const channelManifest = readOplPackageChannelManifest();
  const entry = packageEntry(channelManifest, spec);
  const imageRef = parseImageRef(entry.immutable_artifact_ref);
  const token = fetchGhcrToken(imageRef);
  const manifest = fetchOciManifest(imageRef, token);
  const layer = selectLayer(manifest, PACKAGE_LAYER_MEDIA_TYPE, `${entry.package_id}-${entry.package_version}.tar.gz`);
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
    verifySha256(archivePath, entry.package_content_digest.replace(/^sha256:/, ''), {
      module_id: spec.module_id,
      package_id: entry.package_id,
      image: imageRef.image,
      reference: imageRef.tag,
    });
    if (fs.existsSync(targetPath) && !options.repairTransactionId) {
      assertCleanPackageChannelRoot(targetPath, spec);
    }
    extractArchiveToStage(archivePath, stagePath, spec);
    return activateStagedPackageChannel({
      spec,
      targetPath,
      stagePath,
      channelVersion: entry.package_version,
      artifactRef: entry.immutable_artifact_ref,
      layerDigest: layer.digest,
      sourceArchiveSha256: entry.package_content_digest.replace(/^sha256:/, ''),
      sourceGitHeadSha: normalizeOptionalString(entry.owner_source_commit),
      repairTransactionId: options.repairTransactionId,
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
  operations: { renameSync?: typeof fs.renameSync } = {},
): PackageChannelRollbackResult {
  const previousPath = packageChannelPreviousRoot(targetPath);
  const stagePath = packageChannelStageRoot(targetPath);
  const lifecycle = readPackageChannelLifecycle(targetPath, spec);
  if (!lifecycle?.previous) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Module package-channel revert requires a recorded previous root.',
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
      'Module package-channel revert previous root does not match the managed previous path.',
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
      'Module package-channel revert previous root is missing.',
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

  const swapPath = `${targetPath}.revert-${process.pid}`;
  const renameSync = operations.renameSync ?? fs.renameSync;
  fs.rmSync(swapPath, { recursive: true, force: true });
  let completedRenameCount = 0;
  try {
    renameSync(targetPath, swapPath);
    completedRenameCount = 1;
    renameSync(previousPath, targetPath);
    completedRenameCount = 2;
    renameSync(swapPath, previousPath);
    completedRenameCount = 3;
  } catch (error) {
    if (completedRenameCount === 2) {
      renameSync(targetPath, previousPath);
      renameSync(swapPath, targetPath);
    } else if (completedRenameCount === 1 && !fs.existsSync(targetPath) && fs.existsSync(swapPath)) {
      renameSync(swapPath, targetPath);
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
