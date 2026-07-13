#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseOptions(argv) {
  const options = {
    ref: '',
    artifactType: '',
    sourceUrl: '',
    layers: [],
    expectedDigest: '',
    verifyOnly: false,
    anonymous: false,
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
  if (!options.ref || !options.artifactType || !options.sourceUrl || options.layers.length === 0) {
    throw new Error('Usage: oci-publication-preflight.mjs --ref <oci-ref> --artifact-type <media-type> --source-url <url> --layer <path=media-type> [...] [--verify-only --expected-digest <sha256:digest> --anonymous]');
  }
  if (options.verifyOnly && !/^sha256:[0-9a-f]{64}$/.test(options.expectedDigest)) {
    throw new Error('--verify-only requires --expected-digest sha256:<64 lowercase hex>');
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

function assertRemoteMatches(remote, options, layers) {
  const actualLayers = comparableLayers(remote.manifest?.layers);
  const expected = comparableLayers(layers);
  if (remote.manifest?.artifactType !== options.artifactType
    || remote.manifest?.annotations?.['org.opencontainers.image.source'] !== options.sourceUrl
    || JSON.stringify(actualLayers) !== JSON.stringify(expected)) {
    throw new Error(`Immutable OCI tag mutation rejected for ${options.ref}: remote artifact metadata or layer digests differ from the requested publication`);
  }
  const digest = remote.descriptor?.digest;
  if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? '')) {
    throw new Error(`OCI descriptor for ${options.ref} has no canonical digest`);
  }
  if (options.expectedDigest && digest !== options.expectedDigest) {
    throw new Error(`OCI digest readback mismatch for ${options.ref}: expected ${options.expectedDigest}, got ${digest}`);
  }
  return digest;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const layers = expectedLayers(options.layers);
  let anonymousConfig = null;
  try {
    if (options.anonymous) anonymousConfig = anonymousRegistryConfig();
    const remote = fetchRemote(options.ref, anonymousConfig?.configPath ?? '');
    if (remote.missing) {
      if (options.verifyOnly || options.anonymous) {
        throw new Error(`OCI artifact is not anonymously readable at ${options.ref}: ${remote.error}`);
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
    const digest = assertRemoteMatches(remote, options, layers);
    console.log(JSON.stringify({
      status: options.verifyOnly ? 'verified' : 'existing_identical_reuse',
      action: options.verifyOnly ? 'verify' : 'reuse',
      ref: options.ref,
      digest,
      source_annotation_verified: true,
      anonymous_pull_verified: options.anonymous,
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
