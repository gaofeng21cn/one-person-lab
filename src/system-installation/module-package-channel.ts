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

function extractArchive(archivePath: string, targetPath: string, spec: DomainModuleSpec, sourceGitHead: string | null) {
  const tempTarget = `${targetPath}.pkg-${process.pid}`;
  fs.rmSync(tempTarget, { recursive: true, force: true });
  fs.mkdirSync(tempTarget, { recursive: true });
  const extract = runCommand('tar', ['-xzf', archivePath, '-C', tempTarget]);
  if (extract.exitCode !== 0) {
    fs.rmSync(tempTarget, { recursive: true, force: true });
    throw new FrameworkContractError('build_command_failed', 'Failed to extract OPL module package archive.', {
      module_id: spec.module_id,
      archive_path: archivePath,
      stdout: extract.stdout,
      stderr: extract.stderr,
    });
  }

  const extractedRoot = path.join(tempTarget, spec.repo_name);
  const sourcePath = fs.existsSync(extractedRoot) ? extractedRoot : tempTarget;
  fs.writeFileSync(
    path.join(sourcePath, PACKAGED_MODULE_MARKER_FILE),
    `${JSON.stringify({
      marker_version: 1,
      module_id: spec.module_id,
      repo_name: spec.repo_name,
      package_channel: true,
      source_git: { head_sha: sourceGitHead },
    }, null, 2)}\n`,
    'utf8',
  );

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.renameSync(sourcePath, targetPath);
  fs.rmSync(tempTarget, { recursive: true, force: true });
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
    extractArchive(archivePath, targetPath, spec, normalizeOptionalString(entry.source_git?.head_sha));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
