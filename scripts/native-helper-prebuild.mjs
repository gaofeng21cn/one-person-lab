#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const helperBinaries = [
  'opl-sysprobe',
  'opl-doctor-native',
  'opl-runtime-watch',
  'opl-artifact-indexer',
  'opl-state-indexer',
];
const defaultOciImage = 'ghcr.io/gaofeng21cn/one-person-lab-native-helper';
const nativeHelperLayerMediaType = 'application/vnd.onepersonlab.native-helper.v1+gzip';

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'install';
const options = parseOptions(args.slice(command === args[0] ? 1 : 0));
const targetTriple = options.target ?? `${process.platform}-${process.arch}`;
const crateVersion = nativeHelperCrateVersion();
const prebuildRoot = path.resolve(
  options['prebuild-root']
    ?? process.env.OPL_NATIVE_HELPER_PREBUILD_ROOT
    ?? path.join(rootDir, 'native-helper-prebuilds'),
);
const stateDir = path.resolve(
  options['state-dir']
    ?? process.env.OPL_STATE_DIR
    ?? path.join(process.env.HOME ?? rootDir, 'Library/Application Support/OPL/state'),
);

try {
  if (command === 'pack') {
    writeJson(packPrebuild());
  } else if (command === 'archive') {
    writeJson(archivePrebuild());
  } else if (command === 'install') {
    writeJson(installPrebuild());
  } else if (command === 'check') {
    writeJson(checkPrebuild());
  } else {
    process.stderr.write(`Unknown native helper prebuild command: ${command}\n`);
    process.exit(1);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

function packPrebuild() {
  const sourceDir = resolveSourceDir();
  const missing = helperBinaries
    .map((binary) => path.join(sourceDir, binaryFileName(binary)))
    .filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(`native helper prebuild pack missing binaries:\n${missing.map((entry) => `- ${entry}`).join('\n')}`);
  }

  const outDir = prebuildDir();
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const binaries = helperBinaries.map((binary) => {
    const source = path.join(sourceDir, binaryFileName(binary));
    const target = path.join(outDir, binaryFileName(binary));
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o755);
    return binaryManifestEntry(binary, target);
  });
  const manifest = buildManifest('packed', binaries);
  fs.writeFileSync(manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function installPrebuild() {
  const restoreAttempts = [];
  let check = checkPrebuild();
  if (check.status !== 'available') {
    const restore = restoreReleaseArchive();
    if (restore) {
      restoreAttempts.push(restore);
      check = checkPrebuild();
    }
  }
  if (check.status !== 'available') {
    const restore = restoreOciArchive();
    if (restore) {
      restoreAttempts.push(restore);
      check = checkPrebuild();
    }
  }
  if (check.status !== 'available') {
    return {
      ...basePayload('missing_prebuild'),
      prebuild_dir: prebuildDir(),
      cache_dir: cacheDir(),
      reason: check.status,
      restore_attempts: restoreAttempts,
      errors: check.errors,
    };
  }

  fs.mkdirSync(cacheDir(), { recursive: true });
  for (const binary of helperBinaries) {
    const source = path.join(prebuildDir(), binaryFileName(binary));
    const target = path.join(cacheDir(), binaryFileName(binary));
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o755);
  }

  return {
    ...basePayload('installed'),
    prebuild_dir: prebuildDir(),
    cache_dir: cacheDir(),
    restore_attempts: restoreAttempts,
    binaries: check.binaries,
  };
}

function checkPrebuild() {
  if (!fs.existsSync(manifestPath())) {
    return {
      ...basePayload('skipped_no_prebuild'),
      prebuild_dir: prebuildDir(),
      cache_dir: cacheDir(),
      binaries: [],
      errors: [{ code: 'prebuild_manifest_missing', message: `${manifestPath()} is not present` }],
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
  const errors = [];
  if (manifest.target_triple !== targetTriple) {
    errors.push({
      code: 'prebuild_target_mismatch',
      message: `expected ${targetTriple}, found ${manifest.target_triple}`,
    });
  }
  if (manifest.crate_version !== crateVersion) {
    errors.push({
      code: 'prebuild_version_mismatch',
      message: `expected ${crateVersion}, found ${manifest.crate_version}`,
    });
  }

  const manifestBinaries = Array.isArray(manifest.binaries) ? manifest.binaries : [];
  const binaries = [];
  for (const binary of helperBinaries) {
    const filePath = path.join(prebuildDir(), binaryFileName(binary));
    if (!fs.existsSync(filePath)) {
      errors.push({ code: 'prebuild_binary_missing', message: `${filePath} is not present` });
      continue;
    }
    const actual = binaryManifestEntry(binary, filePath);
    const expected = manifestBinaries.find((entry) => entry?.binary === binary);
    if (expected && (expected.sha256 !== actual.sha256 || expected.bytes !== actual.bytes)) {
      errors.push({
        code: 'prebuild_binary_checksum_mismatch',
        message: `${filePath} does not match the packed prebuild manifest`,
      });
    }
    binaries.push(actual);
  }

  if (errors.length > 0) {
    return {
      ...basePayload('invalid_prebuild'),
      prebuild_dir: prebuildDir(),
      cache_dir: cacheDir(),
      binaries,
      errors,
    };
  }

  return {
    ...basePayload('available'),
    prebuild_dir: prebuildDir(),
    cache_dir: cacheDir(),
    binaries,
    errors: [],
  };
}

function buildManifest(status, binaries) {
  return {
    ...basePayload(status),
    manifest_file: manifestPath(),
    prebuild_dir: prebuildDir(),
    binaries,
    errors: [],
  };
}

function archivePrebuild() {
  const check = checkPrebuild();
  if (check.status !== 'available') {
    throw new Error(`native helper prebuild archive requires an available prebuild, found ${check.status}`);
  }
  const archivesDir = path.join(prebuildRoot, 'archives');
  const archiveFile = path.join(archivesDir, archiveFileName());
  fs.mkdirSync(archivesDir, { recursive: true });
  const result = spawnSync('tar', tarArgs(['-czf', archiveFile, '-C', prebuildDir(), '.']), {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `tar exited with status ${result.status}`);
  }
  const bytes = fs.readFileSync(archiveFile);
  return {
    ...basePayload('archived'),
    archive_file: archiveFile,
    archive_name: path.basename(archiveFile),
    prebuild_dir: prebuildDir(),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    binaries: check.binaries,
    errors: [],
  };
}

function basePayload(status) {
  return {
    surface_kind: 'opl_native_helper_prebuild',
    version: 'v1',
    status,
    target_triple: targetTriple,
    crate_name: 'opl-native-helper',
    crate_version: crateVersion,
    generated_at: new Date().toISOString(),
  };
}

function binaryManifestEntry(binary, filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    binary,
    file_name: path.basename(filePath),
    path: filePath,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function resolveSourceDir() {
  const explicit = options['source-dir'];
  if (explicit) {
    return path.resolve(explicit);
  }
  for (const candidate of [path.join(rootDir, 'target', 'release'), path.join(rootDir, 'target', 'debug')]) {
    if (helperBinaries.every((binary) => fs.existsSync(path.join(candidate, binaryFileName(binary))))) {
      return candidate;
    }
  }
  return path.join(rootDir, 'target', 'release');
}

function restoreReleaseArchive() {
  const archiveUrl = resolveReleaseArchiveUrl();
  if (!archiveUrl) {
    return null;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-prebuild-archive-'));
  try {
    const archivePath = archivePathFromUrl(archiveUrl, tempRoot);
    fs.rmSync(prebuildDir(), { recursive: true, force: true });
    fs.mkdirSync(prebuildDir(), { recursive: true });
    const result = spawnSync('tar', tarArgs(['-xzf', archivePath, '-C', prebuildDir()]), {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      return {
        status: 'release_archive_extract_failed',
        archive_url: archiveUrl,
        error: result.stderr.trim() || `tar exited with status ${result.status}`,
      };
    }
    return {
      status: 'restored_release_archive',
      archive_url: archiveUrl,
      prebuild_dir: prebuildDir(),
    };
  } catch (error) {
    return {
      status: 'release_archive_restore_failed',
      archive_url: archiveUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function resolveReleaseArchiveUrl() {
  const explicit = options['release-archive-url'] ?? process.env.OPL_NATIVE_HELPER_PREBUILD_ARCHIVE_URL;
  if (explicit) {
    return explicit;
  }
  const base = options['release-base-url'] ?? process.env.OPL_NATIVE_HELPER_PREBUILD_RELEASE_BASE_URL;
  if (!base) {
    return null;
  }
  return `${base.replace(/\/$/, '')}/${archiveFileName()}`;
}

function restoreOciArchive() {
  const imageRef = resolveOciImageRef();
  if (!imageRef) {
    return null;
  }
  if (imageRef.registry !== 'ghcr.io') {
    return {
      status: 'oci_registry_unsupported',
      image: imageRef.image,
      tag: imageRef.tag,
      error: `unsupported native helper OCI registry: ${imageRef.registry}`,
    };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-prebuild-oci-'));
  try {
    const tokenResult = fetchGhcrToken(imageRef);
    if (tokenResult.status !== 'ok') {
      return tokenResult;
    }
    const manifestResult = fetchOciManifest(imageRef, tokenResult.token);
    if (manifestResult.status !== 'ok') {
      return manifestResult;
    }
    const layer = selectNativeHelperLayer(manifestResult.manifest);
    if (!layer) {
      return {
        status: 'oci_native_helper_layer_missing',
        image: imageRef.image,
        tag: imageRef.tag,
        error: 'native helper archive layer was not present in OCI manifest',
      };
    }

    const archivePath = path.join(tempRoot, archiveFileName());
    const blobResult = fetchOciBlob(imageRef, tokenResult.token, layer.digest, archivePath);
    if (blobResult.status !== 'ok') {
      return blobResult;
    }
    const digestStatus = verifyOciDigest(archivePath, layer.digest);
    if (digestStatus.status !== 'ok') {
      return digestStatus;
    }

    fs.rmSync(prebuildDir(), { recursive: true, force: true });
    fs.mkdirSync(prebuildDir(), { recursive: true });
    const result = spawnSync('tar', tarArgs(['-xzf', archivePath, '-C', prebuildDir()]), {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      return {
        status: 'oci_archive_extract_failed',
        image: imageRef.image,
        tag: imageRef.tag,
        digest: layer.digest,
        error: result.stderr.trim() || `tar exited with status ${result.status}`,
      };
    }
    return {
      status: 'restored_oci_archive',
      image: imageRef.image,
      tag: imageRef.tag,
      digest: layer.digest,
      prebuild_dir: prebuildDir(),
    };
  } catch (error) {
    return {
      status: 'oci_archive_restore_failed',
      image: imageRef.image,
      tag: imageRef.tag,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function archivePathFromUrl(archiveUrl, tempRoot) {
  if (archiveUrl.startsWith('file://')) {
    return fileURLToPath(archiveUrl);
  }
  if (/^https?:\/\//.test(archiveUrl)) {
    const target = path.join(tempRoot, archiveFileName());
    const result = spawnSync('curl', ['-fsSL', archiveUrl, '-o', target], {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `curl exited with status ${result.status}`);
    }
    return target;
  }
  return path.resolve(archiveUrl);
}

function resolveOciImageRef() {
  const configured = options['oci-image'] ?? process.env.OPL_NATIVE_HELPER_PREBUILD_OCI_IMAGE ?? defaultOciImage;
  if (!configured || ['0', 'false', 'off', 'none'].includes(String(configured).trim().toLowerCase())) {
    return null;
  }
  const raw = String(configured).trim();
  const [registry, ...repositoryParts] = raw.split('/');
  if (!registry || repositoryParts.length === 0) {
    throw new Error(`Invalid native helper OCI image: ${raw}`);
  }
  let repository = repositoryParts.join('/');
  let tag = options['oci-tag'] ?? process.env.OPL_NATIVE_HELPER_PREBUILD_OCI_TAG ?? `${targetTriple}-${crateVersion}`;
  const tagSeparator = repository.lastIndexOf(':');
  if (tagSeparator > repository.lastIndexOf('/')) {
    tag = repository.slice(tagSeparator + 1);
    repository = repository.slice(0, tagSeparator);
  }
  return {
    image: `${registry}/${repository}`,
    registry,
    repository,
    tag,
  };
}

function fetchGhcrToken(imageRef) {
  const scope = `repository:${imageRef.repository}:pull`;
  const tokenUrl = `https://${imageRef.registry}/token?service=${encodeURIComponent(imageRef.registry)}&scope=${encodeURIComponent(scope)}`;
  const result = spawnSync('curl', ['-fsSL', tokenUrl], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      status: 'oci_token_fetch_failed',
      image: imageRef.image,
      tag: imageRef.tag,
      error: result.stderr.trim() || `curl exited with status ${result.status}`,
    };
  }
  try {
    const payload = JSON.parse(result.stdout);
    const token = typeof payload.token === 'string' ? payload.token : '';
    if (!token) {
      throw new Error('missing token field');
    }
    return {
      status: 'ok',
      token,
    };
  } catch (error) {
    return {
      status: 'oci_token_parse_failed',
      image: imageRef.image,
      tag: imageRef.tag,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function fetchOciManifest(imageRef, token) {
  const manifestUrl = `https://${imageRef.registry}/v2/${imageRef.repository}/manifests/${imageRef.tag}`;
  const result = spawnSync('curl', [
    '-fsSL',
    '-H',
    `Authorization: Bearer ${token}`,
    '-H',
    'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    manifestUrl,
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      status: 'oci_manifest_fetch_failed',
      image: imageRef.image,
      tag: imageRef.tag,
      error: result.stderr.trim() || `curl exited with status ${result.status}`,
    };
  }
  try {
    return {
      status: 'ok',
      manifest: JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      status: 'oci_manifest_parse_failed',
      image: imageRef.image,
      tag: imageRef.tag,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function selectNativeHelperLayer(manifest) {
  const layers = Array.isArray(manifest?.layers) ? manifest.layers : [];
  return layers.find((layer) => layer?.mediaType === nativeHelperLayerMediaType)
    ?? layers.find((layer) => String(layer?.annotations?.['org.opencontainers.image.title'] ?? '').endsWith(archiveFileName()))
    ?? null;
}

function fetchOciBlob(imageRef, token, digest, target) {
  const blobUrl = `https://${imageRef.registry}/v2/${imageRef.repository}/blobs/${digest}`;
  const result = spawnSync('curl', [
    '-fsSL',
    '-H',
    `Authorization: Bearer ${token}`,
    blobUrl,
    '-o',
    target,
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      status: 'oci_blob_fetch_failed',
      image: imageRef.image,
      tag: imageRef.tag,
      digest,
      error: result.stderr.trim() || `curl exited with status ${result.status}`,
    };
  }
  return {
    status: 'ok',
  };
}

function verifyOciDigest(filePath, digest) {
  if (!String(digest).startsWith('sha256:')) {
    return { status: 'ok' };
  }
  const expected = digest.slice('sha256:'.length);
  const bytes = fs.readFileSync(filePath);
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    return {
      status: 'oci_blob_digest_mismatch',
      digest,
      error: `expected ${expected}, found ${actual}`,
    };
  }
  return { status: 'ok' };
}

function tarArgs(args) {
  return process.platform === 'win32' ? ['--force-local', ...args] : args;
}

function prebuildDir() {
  return path.join(prebuildRoot, targetTriple, crateVersion);
}

function manifestPath() {
  return path.join(prebuildDir(), 'manifest.json');
}

function archiveFileName() {
  return `opl-native-helper-${targetTriple}-${crateVersion}.tar.gz`;
}

function cacheDir() {
  return path.join(stateDir, 'native-helper', 'bin', targetTriple, crateVersion);
}

function nativeHelperCrateVersion() {
  const packageToml = fs.readFileSync(path.join(rootDir, 'native/opl-native-helper/Cargo.toml'), 'utf8');
  return packageToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '0.0.0';
}

function binaryFileName(binary) {
  return targetTriple.startsWith('win32-') ? `${binary}.exe` : binary;
}

function parseOptions(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const value = rawArgs[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (payload.status === 'invalid_prebuild') {
    process.exit(1);
  }
}
