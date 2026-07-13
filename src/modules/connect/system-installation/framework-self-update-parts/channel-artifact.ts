import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../../kernel/contract-validation.ts';
import {
  parseJsonText,
  readJsonPayloadFile,
} from '../../../../kernel/json-file.ts';
import { stringValue } from '../../../../kernel/json-record.ts';
import { resolveOplReleaseManifestRef } from '../release-channel.ts';
import { normalizeOptionalString, runCommand } from '../shared.ts';

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

function resolveChannelManifestRef() {
  return parseImageRef(resolveOplReleaseManifestRef());
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

function selectLayer(manifest: { layers?: OciLayer[] }, mediaType: string, titleSuffix?: string) {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  return layers.find((layer) => layer.mediaType === mediaType)
    ?? (titleSuffix
      ? layers.find((layer) => String(layer.annotations?.['org.opencontainers.image.title'] ?? '').endsWith(titleSuffix))
      : null)
    ?? null;
}

export function readFrameworkChannelEntry() {
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
    const parsedChannelManifest = readJsonPayloadFile(manifestPath);
    const channelManifest = (isRecord(parsedChannelManifest) ? parsedChannelManifest : {}) as {
      release_set_generation?: string;
      release_set?: {
        surface_kind?: string;
        components?: {
          base?: {
            version?: string;
            source_commit?: string;
            artifact_ref?: string;
            artifact_digest?: string;
          };
        };
      };
      packages?: {
        framework_core?: {
          version?: string;
          artifact?: string;
          source_archive?: { sha256?: string };
          source_git?: { head_sha?: string };
        };
      };
    };
    const framework = channelManifest.packages?.framework_core;
    const base = channelManifest.release_set?.surface_kind === 'opl_release_set.v2'
      ? channelManifest.release_set.components?.base
      : null;
    const artifact = normalizeOptionalString(base?.artifact_ref ?? framework?.artifact);
    if (!artifact) {
      throw new FrameworkContractError('contract_shape_invalid', 'OPL channel manifest is missing packages.framework_core.artifact.', {
        channel_version: channelManifest.release_set_generation ?? null,
      });
    }
    return {
      channel_version: normalizeOptionalString(base?.version ?? framework?.version ?? channelManifest.release_set_generation),
      release_set_generation: normalizeOptionalString(channelManifest.release_set_generation),
      artifact,
      artifact_digest: normalizeOptionalString(base?.artifact_digest),
      source_archive_sha256: normalizeOptionalString(framework?.source_archive?.sha256),
      source_git_head_sha: normalizeOptionalString(base?.source_commit ?? framework?.source_git?.head_sha),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function fetchFrameworkArtifactFromChannel(
  tempRoot: string,
  entry: ReturnType<typeof readFrameworkChannelEntry> = readFrameworkChannelEntry(),
) {
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
