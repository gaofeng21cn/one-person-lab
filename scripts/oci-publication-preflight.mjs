#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PACKAGE_ARTIFACT_TYPE = 'application/vnd.onepersonlab.package.v1';
const PACKAGE_MANIFEST_MEDIA_TYPE = 'application/vnd.onepersonlab.package.manifest.v1+json';
const PACKAGE_REGISTRY_PROJECTION_FIELDS = [
  'publication_projection_order',
  'publication_source',
  'compatibility_projection',
];

function parseOptions(argv) {
  const options = {
    ref: '',
    artifactType: '',
    sourceUrl: '',
    layers: [],
    expectedDigest: '',
    verifyOnly: false,
    digestOnly: false,
    anonymous: false,
    requireAnonymousDenied: false,
    allowPackageManifestProjectionDrift: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--verify-only') {
      options.verifyOnly = true;
      continue;
    }
    if (token === '--anonymous') {
      options.anonymous = true;
      continue;
    }
    if (token === '--require-anonymous-denied') {
      options.requireAnonymousDenied = true;
      continue;
    }
    if (token === '--digest-only') {
      options.digestOnly = true;
      continue;
    }
    if (token === '--allow-package-manifest-projection-drift') {
      options.allowPackageManifestProjectionDrift = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    index += 1;
    if (token === '--ref') options.ref = value;
    else if (token === '--artifact-type') options.artifactType = value;
    else if (token === '--source-url') options.sourceUrl = value;
    else if (token === '--layer') options.layers.push(value);
    else if (token === '--expected-digest') options.expectedDigest = value;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.ref || !options.artifactType || !options.sourceUrl || (!options.digestOnly && options.layers.length === 0)) {
    throw new Error('Usage: oci-publication-preflight.mjs --ref <oci-ref> --artifact-type <media-type> --source-url <url> [--layer <path=media-type> ... | --digest-only] [--allow-package-manifest-projection-drift] [--verify-only --expected-digest <sha256:digest> --anonymous]');
  }
  if (options.verifyOnly && !/^sha256:[0-9a-f]{64}$/.test(options.expectedDigest)) {
    throw new Error('--verify-only requires --expected-digest sha256:<64 lowercase hex>');
  }
  if (options.digestOnly && !options.verifyOnly) {
    throw new Error('--digest-only requires --verify-only and an exact expected digest');
  }
  if (options.requireAnonymousDenied && (!options.verifyOnly || options.anonymous)) {
    throw new Error('--require-anonymous-denied requires authenticated --verify-only and cannot be combined with --anonymous');
  }
  if (options.allowPackageManifestProjectionDrift
    && (options.digestOnly || options.artifactType !== PACKAGE_ARTIFACT_TYPE)) {
    throw new Error('--allow-package-manifest-projection-drift requires Package layers and cannot be combined with --digest-only');
  }
  return options;
}

function expectedLayers(rawLayers) {
  return rawLayers.map((raw) => {
    const separator = raw.indexOf('=');
    if (separator <= 0 || separator === raw.length - 1) {
      throw new Error(`--layer must use <path=media-type>: ${raw}`);
    }
    const filePath = path.resolve(raw.slice(0, separator));
    const mediaType = raw.slice(separator + 1);
    const content = fs.readFileSync(filePath);
    return {
      filePath,
      mediaType,
      digest: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
      size: content.length,
    };
  });
}

function anonymousRegistryConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oras-anonymous-'));
  const configPath = path.join(root, 'config.json');
  fs.writeFileSync(configPath, '{"auths":{}}\n', 'utf8');
  return { root, configPath };
}

function runOras(args, registryConfig = '') {
  const fullArgs = registryConfig
    ? [...args.slice(0, 2), '--registry-config', registryConfig, ...args.slice(2)]
    : args;
  return spawnSync('oras', fullArgs, {
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      ...(registryConfig ? { DOCKER_CONFIG: path.dirname(registryConfig) } : {}),
    },
  });
}

function isMissing(result) {
  return /(?:manifest unknown|MANIFEST_UNKNOWN|not found|\b404\b)/i.test(
    `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
}

function fetchRemote(ref, registryConfig = '') {
  const manifestResult = runOras(['manifest', 'fetch', ref], registryConfig);
  if (manifestResult.status !== 0) {
    return {
      missing: isMissing(manifestResult),
      inaccessible: true,
      accessDenied: /(?:unauthorized|denied|forbidden|\b401\b|\b403\b)/i.test(
        `${manifestResult.stdout ?? ''}\n${manifestResult.stderr ?? ''}`,
      ) || isMissing(manifestResult),
      error: `${manifestResult.stdout ?? ''}\n${manifestResult.stderr ?? ''}`.trim(),
    };
  }
  const descriptorResult = runOras(['manifest', 'fetch', '--descriptor', ref], registryConfig);
  if (descriptorResult.status !== 0) {
    throw new Error(`Unable to resolve OCI descriptor for ${ref}: ${descriptorResult.stderr || descriptorResult.stdout}`);
  }
  return {
    missing: false,
    manifest: JSON.parse(manifestResult.stdout),
    descriptor: JSON.parse(descriptorResult.stdout),
  };
}

function comparableLayers(layers) {
  return (Array.isArray(layers) ? layers : []).map((layer) => ({
    mediaType: layer?.mediaType ?? null,
    digest: layer?.digest ?? null,
    size: layer?.size ?? null,
  }));
}

function immutableDigestRef(ref, digest) {
  const withoutDigest = ref.split('@', 1)[0];
  const lastSlash = withoutDigest.lastIndexOf('/');
  const lastColon = withoutDigest.lastIndexOf(':');
  const repository = lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest;
  return `${repository}@${digest}`;
}

function fetchRemoteBlob(ref, digest, registryConfig = '') {
  const result = runOras([
    'blob', 'fetch', '--output', '-', immutableDigestRef(ref, digest),
  ], registryConfig);
  if (result.status !== 0) {
    throw new Error(`Unable to fetch OCI Package manifest layer for ${ref}: ${result.stderr || result.stdout}`);
  }
  return Buffer.from(result.stdout);
}

function normalizedPackageArtifactManifest(content, label) {
  let parsed;
  try {
    parsed = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  for (const field of PACKAGE_REGISTRY_PROJECTION_FIELDS) delete parsed[field];
  return canonicalJson(parsed);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalJson(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]),
  );
}

function assertPackageManifestProjectionEquivalent(remote, options, layers, registryConfig) {
  const actualLayers = comparableLayers(remote.manifest?.layers);
  if (actualLayers.length !== layers.length) return false;
  let manifestIndex = -1;
  for (let index = 0; index < layers.length; index += 1) {
    const expectedLayer = layers[index];
    const actualLayer = actualLayers[index];
    if (expectedLayer.mediaType !== actualLayer.mediaType) return false;
    if (expectedLayer.mediaType === PACKAGE_MANIFEST_MEDIA_TYPE) {
      if (manifestIndex !== -1) return false;
      manifestIndex = index;
      continue;
    }
    if (expectedLayer.digest !== actualLayer.digest || expectedLayer.size !== actualLayer.size) return false;
  }
  if (manifestIndex === -1) return false;

  const actualLayer = actualLayers[manifestIndex];
  const expectedLayer = layers[manifestIndex];
  const remoteBytes = fetchRemoteBlob(options.ref, actualLayer.digest, registryConfig);
  const remoteDigest = `sha256:${crypto.createHash('sha256').update(remoteBytes).digest('hex')}`;
  if (remoteDigest !== actualLayer.digest || remoteBytes.length !== actualLayer.size) {
    throw new Error(`OCI Package manifest layer readback mismatch for ${options.ref}`);
  }
  const remoteManifest = normalizedPackageArtifactManifest(remoteBytes, 'remote OCI Package manifest layer');
  const expectedManifest = normalizedPackageArtifactManifest(
    fs.readFileSync(expectedLayer.filePath),
    'requested OCI Package manifest layer',
  );
  return JSON.stringify(remoteManifest) === JSON.stringify(expectedManifest);
}

function assertRemoteMatches(remote, options, layers, registryConfig = '') {
  const actualLayers = comparableLayers(remote.manifest?.layers);
  const expected = comparableLayers(layers);
  const metadataMatches = remote.manifest?.artifactType === options.artifactType
    && remote.manifest?.annotations?.['org.opencontainers.image.source'] === options.sourceUrl;
  const exactLayersMatch = options.digestOnly || JSON.stringify(actualLayers) === JSON.stringify(expected);
  const packageManifestProjectionEquivalent = metadataMatches
    && !exactLayersMatch
    && options.allowPackageManifestProjectionDrift
    && assertPackageManifestProjectionEquivalent(remote, options, layers, registryConfig);
  if (!metadataMatches || (!exactLayersMatch && !packageManifestProjectionEquivalent)) {
    throw new Error(`Immutable OCI tag mutation rejected for ${options.ref}: remote artifact metadata or layer digests differ from the requested publication`);
  }
  const digest = remote.descriptor?.digest;
  if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? '')) {
    throw new Error(`OCI descriptor for ${options.ref} has no canonical digest`);
  }
  if (options.expectedDigest && digest !== options.expectedDigest) {
    throw new Error(`OCI digest readback mismatch for ${options.ref}: expected ${options.expectedDigest}, got ${digest}`);
  }
  return { digest, layers: actualLayers, packageManifestProjectionEquivalent };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const layers = expectedLayers(options.layers);
  let anonymousConfig = null;
  try {
    if (options.anonymous) anonymousConfig = anonymousRegistryConfig();
    const remote = fetchRemote(options.ref, anonymousConfig?.configPath ?? '');
    if (remote.inaccessible && !remote.missing) {
      throw new Error(`OCI artifact access failed at ${options.ref}`);
    }
    if (remote.missing) {
      if (options.verifyOnly || options.anonymous) {
        throw new Error(`OCI artifact is not ${options.anonymous ? 'anonymously' : 'authenticated'} readable at ${options.ref}`);
      }
      console.log(JSON.stringify({
        status: 'absent_publish_required',
        action: 'publish',
        ref: options.ref,
        digest: null,
        source_annotation_verified: false,
        anonymous_pull_verified: false,
      }));
      return;
    }
    const matched = assertRemoteMatches(remote, options, layers, anonymousConfig?.configPath ?? '');
    if (options.requireAnonymousDenied) {
      anonymousConfig = anonymousRegistryConfig();
      const anonymousRemote = fetchRemote(options.ref, anonymousConfig.configPath);
      if (!anonymousRemote.inaccessible) {
        throw new Error(`Private OCI artifact is anonymously readable at ${options.ref}`);
      }
      if (!anonymousRemote.accessDenied) {
        throw new Error(`Private OCI artifact anonymous access denial could not be verified at ${options.ref}`);
      }
    }
    console.log(JSON.stringify({
      status: matched.packageManifestProjectionEquivalent
        ? (options.verifyOnly ? 'verified_package_projection_equivalent' : 'existing_package_projection_equivalent_reuse')
        : (options.verifyOnly ? 'verified' : 'existing_identical_reuse'),
      action: options.verifyOnly ? 'verify' : 'reuse',
      ref: options.ref,
      digest: matched.digest,
      layers: matched.layers,
      package_manifest_projection_equivalent: matched.packageManifestProjectionEquivalent,
      source_annotation_verified: true,
      anonymous_pull_verified: options.anonymous,
      authenticated_pull_verified: options.requireAnonymousDenied,
      anonymous_access_denied_verified: options.requireAnonymousDenied,
    }));
  } finally {
    if (anonymousConfig) fs.rmSync(anonymousConfig.root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
