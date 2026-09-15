import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../../kernel/contract-validation.ts';
import {
  parseJsonText,
} from '../../../../kernel/json-file.ts';
import { stringValue } from '../../../../kernel/json-record.ts';
import { resolveFrameworkArtifactRef } from '../release-channel.ts';
import { sanitizedCurlDiagnostics } from '../curl-diagnostics.ts';
import { normalizeOptionalString, runCommand } from '../shared.ts';

const FRAMEWORK_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.framework.source.v1+gzip';

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
  return parseImageRef(resolveFrameworkArtifactRef());
}

function runCurl(args: string[], errorKind: string, details: Record<string, unknown>, capture = true) {
  const curlBin = normalizeOptionalString(process.env.OPL_CURL_BIN) ?? 'curl';
  let result;
  try {
    result = runCommand(curlBin, args, undefined, { maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    throw new FrameworkContractError('build_command_failed', `Failed to launch OPL Framework runtime artifact transport: ${errorKind}.`, {
      ...details,
      ...sanitizedCurlDiagnostics({ binary: curlBin, args, stdout: '', stderr: '' }),
      launch_error_code: error instanceof FrameworkContractError ? error.code : 'command_launch_failed',
    });
  }
  if (result.exitCode !== 0) {
    throw new FrameworkContractError('build_command_failed', `Failed to fetch OPL Framework runtime artifact: ${errorKind}.`, {
      ...details,
      ...sanitizedCurlDiagnostics({
        binary: curlBin,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
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
  return { ...(isRecord(parsed) ? parsed as { artifactType?: string; layers?: OciLayer[]; annotations?: Record<string, string> } : {}), artifactDigest: `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}` };
}

function fetchPinnedOciManifest(imageRef: OciImageRef, token: string, expectedDigest: string) {
  const manifestUrl = `https://${imageRef.registry}/v2/${imageRef.repository}/manifests/${imageRef.tag}`;
  const raw = runCurl([
    '-fsSL',
    '-H',
    `Authorization: Bearer ${token}`,
    '-H',
    'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    manifestUrl,
  ], 'oci_manifest', { image: imageRef.image, reference: imageRef.tag });
  const actualDigest = `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`;
  if (actualDigest !== expectedDigest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Pinned OPL Framework OCI manifest digest mismatch.', {
      image: imageRef.image,
      reference: imageRef.tag,
      expected_artifact_digest: expectedDigest,
      actual_artifact_digest: actualDigest,
      failure_code: 'opl_framework_artifact_manifest_digest_mismatch',
    });
  }
  const parsed = parseJsonText(raw);
  return isRecord(parsed) ? parsed as { artifactType?: string; layers?: OciLayer[] } : {};
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

function selectLayer(manifest: { artifactType?: string; layers?: OciLayer[] }, mediaType: string) {
  if (manifest.artifactType !== 'application/vnd.onepersonlab.framework.v1') return null;
  const layers = Array.isArray(manifest.layers) ? manifest.layers.filter((layer) => layer.mediaType === mediaType) : [];
  return layers.length === 1 ? layers[0] : null;
}

function requireFrameworkArtifactDigest(value: string | null | undefined, details: Record<string, unknown>) {
  const digest = normalizeOptionalString(value);
  if (!digest || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL channel manifest must bind the Framework artifact to an immutable SHA-256 digest.', {
      ...details,
      artifact_digest: digest,
      failure_code: 'opl_framework_artifact_digest_invalid',
    });
  }
  return digest;
}

export function readFrameworkChannelEntry() {
  const imageRef = resolveChannelManifestRef();
  const manifest = fetchOciManifest(imageRef, fetchGhcrToken(imageRef));
  const layer = selectLayer(manifest, FRAMEWORK_LAYER_MEDIA_TYPE);
  const version = manifest.annotations?.['org.opencontainers.image.version'];
  const commit = manifest.annotations?.['org.opencontainers.image.revision'];
  if (!layer?.digest || !/^sha256:[0-9a-f]{64}$/.test(layer.digest)
    || !version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    || !commit || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Framework artifact must declare its version, source commit and source layer digest.', {
      image: imageRef.image, tag: imageRef.tag,
    });
  }
  if (imageRef.tag.startsWith('sha256:') && imageRef.tag !== manifest.artifactDigest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Framework manifest digest does not match the requested digest.');
  }
  return {
    channel_version: version,
    artifact: `${imageRef.image}@${manifest.artifactDigest}`,
    artifact_digest: manifest.artifactDigest,
    source_archive_sha256: layer.digest.slice('sha256:'.length),
    source_git_head_sha: commit,
  };
}

export function fetchFrameworkArtifactFromChannel(
  tempRoot: string,
  entry: ReturnType<typeof readFrameworkChannelEntry> = readFrameworkChannelEntry(),
) {
  const artifactDigest = requireFrameworkArtifactDigest(entry.artifact_digest, {
    channel_version: entry.channel_version,
    artifact: entry.artifact,
  });
  const explicitDigest = entry.artifact.match(/@([^/]+)$/)?.[1] ?? null;
  if (explicitDigest && explicitDigest !== artifactDigest) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Framework artifact ref conflicts with its channel digest.', {
      artifact_ref: entry.artifact,
      artifact_ref_digest: explicitDigest,
      artifact_digest: artifactDigest,
      failure_code: 'opl_framework_artifact_ref_digest_mismatch',
    });
  }
  const pinnedArtifactRef = `${entry.artifact.replace(/@[^/]+$/, '')}@${artifactDigest}`;
  const imageRef = parseImageRef(pinnedArtifactRef);
  const token = fetchGhcrToken(imageRef);
  const manifest = fetchPinnedOciManifest(imageRef, token, artifactDigest);
  const layer = selectLayer(manifest, FRAMEWORK_LAYER_MEDIA_TYPE);
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
