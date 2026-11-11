import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { resolveAgentPluginManifest } from '../../../kernel/agent-plugin-manifest.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { packageContentDigest } from '../../../kernel/package-content-lock.ts';
import {
  listCurrentPackageProjections,
  PACKAGE_PROJECTION_ROOT,
} from '../../../kernel/standard-agent-registry.ts';
import {
  localReadbackFailure,
  marketplaceName,
  pluginBareName,
  runConfiguredDownloadWithTransientRetry,
  stringValue,
} from './configured-codex-plugin-carrier-native.ts';
import type { AgentPackageConfiguredCodexPluginCarrierDescriptor } from './types.ts';
import { assertPackageDownloadAllowed, packageAccessSubject } from './package-access.ts';
import { acquireHostedPackageSource } from './configured-codex-plugin-carrier-source.ts';

function projectedManifestPath(sourceRef: string) {
  return path.isAbsolute(sourceRef)
    ? sourceRef
    : path.join(PACKAGE_PROJECTION_ROOT, path.basename(sourceRef));
}
function packagePayloadProjection(packageId: string, packageDirectory?: string) {
  const projection = listCurrentPackageProjections(packageDirectory)
    .find((candidate) => candidate.payload.package_id === packageId);
  if (!projection) return null;
  const manifestPath = projectedManifestPath(projection.source_ref);
  const codexSurface = isRecord(projection.payload.codex_surface)
    ? projection.payload.codex_surface
    : null;
  const payloadRef = stringValue(codexSurface?.plugin_payload_manifest_url);
  const pluginId = stringValue(codexSurface?.plugin_id);
  const sourceCommit = stringValue(codexSurface?.carrier_source_commit)
    ?? stringValue(projection.payload.source_commit);
  const contentLock = isRecord(projection.payload.content_lock)
    ? projection.payload.content_lock
    : null;
  const contentLockPaths = Array.isArray(contentLock?.paths)
    ? contentLock.paths.filter((candidate): candidate is string => typeof candidate === 'string')
    : null;
  if (!payloadRef || !pluginId || !sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) return null;
  const payloadPath = path.resolve(path.dirname(manifestPath), payloadRef);
  if (payloadPath !== path.dirname(manifestPath)
    && !payloadPath.startsWith(`${path.dirname(manifestPath)}${path.sep}`)) return null;
  return {
    payloadPath,
    ownerManifest: projection.payload,
    pluginId,
    packageVersion: stringValue(projection.payload.version),
    sourceCommit,
    contentLockPaths,
  };
}

function payloadRelativePath(value: unknown, label: string) {
  const candidate = stringValue(value);
  if (!candidate || path.isAbsolute(candidate) || candidate.includes('\0')) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      `Configured Package payload ${label} is invalid.`,
    );
  }
  const normalized = path.posix.normalize(candidate);
  if (normalized === '..' || normalized.startsWith('../') || normalized !== candidate) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      `Configured Package payload ${label} escapes its plugin root.`,
    );
  }
  return normalized;
}

function payloadSha256(value: unknown, label: string) {
  const digest = stringValue(value);
  if (!digest || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      `Configured Package payload ${label} is not an exact SHA-256 digest.`,
    );
  }
  return digest;
}

function resolvePayloadFileSource(value: unknown, sourceCommit: string) {
  const source = stringValue(value);
  if (!source) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload file has no source URL.',
    );
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload file source URL is invalid.',
    );
  }
  if (url.protocol === 'file:') return url;
  if (url.protocol !== 'https:'
    || url.hostname !== 'raw.githubusercontent.com'
    || !url.pathname.split('/').includes(sourceCommit)) {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload file source is not pinned to its owner commit.',
    );
  }
  return url;
}

export function githubArchiveFileSource(source: URL, sourceCommit: string) {
  if (source.protocol !== 'https:' || source.hostname !== 'raw.githubusercontent.com') return null;
  const segments = source.pathname.split('/').filter(Boolean);
  const [owner, repository, commit, ...relativePath] = segments;
  if (!owner || !repository || commit !== sourceCommit || relativePath.length === 0) {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload file source is not pinned to one GitHub commit.',
    );
  }
  return {
    key: `${owner}/${repository}@${commit}`,
    archiveUrl: `https://codeload.github.com/${owner}/${repository}/tar.gz/${commit}`,
    relativePath: relativePath.join('/'),
  };
}

function runPayloadCurl(input: {
  url: string;
  outputPath?: string;
  maxTimeSeconds: number;
  maxBuffer: number;
  env: NodeJS.ProcessEnv;
}) {
  const curl = fs.existsSync('/usr/bin/curl') ? '/usr/bin/curl' : 'curl';
  return runConfiguredDownloadWithTransientRetry(() => {
    const result = spawnSync(curl, [
      '--disable', '--fail', '--silent', '--show-error', '--location',
      '--proto', '=https', '--tlsv1.2', '--ipv4',
      '--connect-timeout', '10', '--max-time', String(input.maxTimeSeconds),
      input.url,
      ...(input.outputPath ? ['--output', input.outputPath] : []),
    ], { encoding: null, env: input.env, maxBuffer: input.maxBuffer });
    return {
      status: result.status,
      stdout: result.stdout ?? Buffer.alloc(0),
      stderr: result.stderr?.toString('utf8') ?? '',
      error: result.error ?? null,
    };
  });
}

function materializeGithubArchive(input: {
  packageId: string;
  payloadFiles: readonly Record<string, unknown>[];
  sourceCommit: string;
  env: NodeJS.ProcessEnv;
}) {
  const sources = input.payloadFiles.map((candidate) => {
    const source = resolvePayloadFileSource(candidate.source_url, input.sourceCommit);
    return source ? { source, archive: githubArchiveFileSource(source, input.sourceCommit) } : null;
  });
  const githubSources = sources.filter(
    (value): value is { source: URL; archive: NonNullable<ReturnType<typeof githubArchiveFileSource>> } =>
      value !== null && value.archive !== null,
  );
  if (githubSources.length === 0) return null;
  const archiveKeys = new Set(githubSources.map((value) => value.archive.key));
  if (archiveKeys.size !== 1) {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload files reference more than one GitHub archive.',
      { package_id: input.packageId },
    );
  }
  const archive = githubSources[0].archive;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-archive-'));
  const archivePath = path.join(temporaryRoot, 'source.tar.gz');
  const download = runPayloadCurl({
    url: archive.archiveUrl,
    outputPath: archivePath,
    maxTimeSeconds: 120,
    maxBuffer: 8 * 1024 * 1024,
    env: input.env,
  });
  if (download.status !== 0 || download.error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_download_failed',
      'Configured Package payload archive download did not complete.',
      {
        package_id: input.packageId,
        archive_url: archive.archiveUrl,
        exit_status: download.status,
        attempt_count: download.attemptCount,
        error: download.error?.message || download.stderr.trim() || null,
      },
    );
  }
  const extractRoot = path.join(temporaryRoot, 'source');
  fs.mkdirSync(extractRoot, { recursive: true });
  const extract = spawnSync('/usr/bin/tar', ['-xzf', archivePath, '-C', extractRoot], {
    encoding: 'utf8',
    env: input.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (extract.status !== 0 || extract.error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload archive could not be extracted.',
      { package_id: input.packageId, error: extract.error?.message ?? extract.stderr.trim() ?? null },
    );
  }
  const roots = fs.readdirSync(extractRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (roots.length !== 1) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload archive has an invalid root.',
      { package_id: input.packageId },
    );
  }
  const sourceRoot = path.join(extractRoot, roots[0].name);
  return {
    sourceRoot,
    cleanup: () => fs.rmSync(temporaryRoot, { recursive: true, force: true }),
    pathFor: (source: URL) => {
      const fileSource = githubArchiveFileSource(source, input.sourceCommit);
      if (!fileSource || fileSource.key !== archive.key) {
        return localReadbackFailure(
          'configured_codex_plugin_carrier_payload_invalid',
          'Configured Package payload file does not belong to its downloaded GitHub archive.',
          { package_id: input.packageId },
        );
      }
      const relativePath = fileSource.relativePath;
      const candidate = path.resolve(sourceRoot, ...relativePath.split('/'));
      if (candidate !== sourceRoot && !candidate.startsWith(`${sourceRoot}${path.sep}`)) {
        return localReadbackFailure(
          'configured_codex_plugin_carrier_payload_invalid',
          'Configured Package payload path escapes its source archive.',
          { package_id: input.packageId, payload_path: relativePath },
        );
      }
      const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
      if (!stat?.isFile() || stat.isSymbolicLink()) {
        return localReadbackFailure(
          'configured_codex_plugin_carrier_payload_invalid',
          'Configured Package payload archive is missing a declared physical file.',
          { package_id: input.packageId, payload_path: relativePath },
        );
      }
      return fs.readFileSync(candidate);
    },
  };
}

function writePayloadMarketplaceManifest(input: {
  marketplaceRoot: string;
  marketplaceId: string;
  pluginId: string;
}) {
  const manifestPath = path.join(input.marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    name: input.marketplaceId,
    plugins: [{
      name: input.pluginId,
      source: { source: 'local', path: `./plugins/${input.pluginId}` },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    }],
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function readProjectedPayload(projection: NonNullable<ReturnType<typeof packagePayloadProjection>>, packageId: string): Record<string, unknown> & { files: unknown[] } {
  let payload: Record<string, unknown>;
  try {
    const stat = fs.lstatSync(projection.payloadPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('payload manifest is not a physical file');
    payload = parseJsonText(fs.readFileSync(projection.payloadPath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload manifest is missing or invalid.',
      { package_id: packageId, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!isRecord(payload)
    || payload.package_id !== packageId
    || payload.plugin_id !== projection.pluginId
    || payload.package_version !== projection.packageVersion
    || payload.source_commit !== projection.sourceCommit
    || !Array.isArray(payload.files)
    || payload.files.length === 0) {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_payload_invalid',
      'Configured Package payload identity does not match its owner projection.',
      { package_id: packageId },
    );
  }

  return { ...payload, files: payload.files };
}

/** Read only the same immutable payload identity consumed by installation. */
export function configuredPackagePayloadAvailable(input: {
  packageId: string;
  pluginId: string;
  packageDirectory?: string;
}) {
  const projection = packagePayloadProjection(input.packageId, input.packageDirectory);
  if (!projection || projection.pluginId !== pluginBareName(input.pluginId)) return false;
  try {
    const payload = readProjectedPayload(projection, input.packageId);
    const paths = new Set<string>();
    for (const [index, file] of payload.files.entries()) {
      if (!isRecord(file)) return false;
      const relativePath = payloadRelativePath(file.path, `files[${index}].path`);
      if (paths.has(relativePath)) return false;
      paths.add(relativePath);
      payloadSha256(file.sha256, `files[${index}].sha256`);
      const source = resolvePayloadFileSource(file.source_url, projection.sourceCommit);
      if (source.protocol === 'https:') githubArchiveFileSource(source, projection.sourceCommit);
    }
    const lock = isRecord(payload.content_lock) ? payload.content_lock : null;
    payloadSha256(lock?.digest, 'content_lock.digest');
    if (projection.contentLockPaths?.some((ref) => !paths.has(ref))) return false;
    return true;
  } catch {
    return false;
  }
}

export function installPayloadMarketplace(input: {
  packageId: string;
  pluginId: string;
  env: NodeJS.ProcessEnv;
  packageDirectory?: string;
}) {
  const projection = packagePayloadProjection(input.packageId, input.packageDirectory);
  if (!projection || projection.pluginId !== pluginBareName(input.pluginId)) return null;
  if (projection?.ownerManifest.visibility === 'authorized_only') {
    assertPackageDownloadAllowed(packageAccessSubject(projection.ownerManifest), input.env);
  }
  const payload = readProjectedPayload(projection, input.packageId);

  const home = input.env.HOME?.trim() || os.homedir();
  const stateDir = input.env.OPL_STATE_DIR?.trim()
    ? path.resolve(input.env.OPL_STATE_DIR)
    : path.join(home, 'Library', 'Application Support', 'OPL', 'state');
  const marketplaceId = marketplaceName(input.pluginId);
  const marketplaceRoot = path.join(stateDir, 'codex-plugin-marketplaces', marketplaceId);
  const stagingRoot = `${marketplaceRoot}.${process.pid}.${crypto.randomUUID()}.staging`;
  const pluginRoot = path.join(stagingRoot, 'plugins', projection.pluginId);
  const downloaded = new Map<string, string>();
  const hostedSource = acquireHostedPackageSource({
    packageId: input.packageId,
    ownerManifest: projection.ownerManifest,
    payload,
    env: input.env,
  });
  if (projection.ownerManifest.management_scope === 'local_component' && !hostedSource) {
    return localReadbackFailure('package_install_source_unavailable',
      'Local components require the matching parent-product Full seed.', { package_id: input.packageId });
  }
  if (projection.ownerManifest.visibility === 'authorized_only' && !hostedSource) {
    return localReadbackFailure('private_package_transport_unavailable',
      'Private Packages require their declared authenticated source.', { package_id: input.packageId });
  }
  const archive = hostedSource ?? materializeGithubArchive({
    packageId: input.packageId,
    payloadFiles: payload.files.filter(isRecord),
    sourceCommit: projection.sourceCommit,
    env: input.env,
  });
  try {
    if (hostedSource) {
      // Keep runtime contracts and the minimal plugin in the same native
      // marketplace lifetime and atomic replacement; no separate registry.
      if (projection.ownerManifest.surface_kind === 'opl_agent_package_manifest.v1') {
        fs.cpSync(hostedSource.sourceRoot, stagingRoot, { recursive: true, errorOnExist: true, force: false });
      } else {
        // Capability content lives inside its plugin; do not duplicate a whole media library.
        fs.mkdirSync(stagingRoot, { recursive: true });
      }
      fs.writeFileSync(path.join(stagingRoot, '.codex-marketplace-install.json'),
        `${JSON.stringify(hostedSource.provenance, null, 2)}\n`, { mode: 0o600 });
    }
    for (const [index, candidate] of payload.files.entries()) {
      if (!isRecord(candidate)) {
        localReadbackFailure(
          'configured_codex_plugin_carrier_payload_invalid',
          `Configured Package payload files[${index}] is invalid.`,
        );
      }
      const relativePath = payloadRelativePath(candidate.path, `files[${index}].path`);
      const expectedDigest = payloadSha256(candidate.sha256, `files[${index}].sha256`);
      const source = resolvePayloadFileSource(candidate.source_url, projection.sourceCommit);
      const destination = path.join(pluginRoot, ...relativePath.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      let bytes: Buffer;
      if (source.protocol === 'file:') {
        bytes = fs.readFileSync(fileURLToPath(source));
      } else if (archive) {
        bytes = archive.pathFor(source);
      } else {
        const result = runPayloadCurl({
          url: source.toString(),
          maxTimeSeconds: 30,
          maxBuffer: 128 * 1024 * 1024,
          env: input.env,
        });
        if (result.status !== 0 || result.error) {
          localReadbackFailure(
            'configured_codex_plugin_carrier_payload_download_failed',
            'Configured Package payload download did not complete.',
            {
              package_id: input.packageId,
              payload_path: relativePath,
              exit_status: result.status,
              attempt_count: result.attemptCount,
              error: result.error?.message || result.stderr.trim() || null,
            },
          );
        }
        bytes = result.stdout ?? Buffer.alloc(0);
      }
      const actualDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      if (actualDigest !== expectedDigest) {
        localReadbackFailure(
          'configured_codex_plugin_carrier_payload_digest_mismatch',
          'Configured Package payload file digest does not match its owner manifest.',
          { package_id: input.packageId, payload_path: relativePath },
        );
      }
      fs.writeFileSync(destination, bytes, {
        mode: candidate.mode === '100755' ? 0o755 : 0o644,
      });
      downloaded.set(relativePath, destination);
    }

    const lock = isRecord(payload.content_lock) ? payload.content_lock : null;
    const expectedLock = payloadSha256(lock?.digest, 'content_lock.digest');
    const contentLockPaths = projection.contentLockPaths ?? [...downloaded.keys()];
    if (contentLockPaths.length === 0
      || contentLockPaths.some((relativePath) => !downloaded.has(relativePath))) {
      localReadbackFailure(
        'configured_codex_plugin_carrier_payload_invalid',
        'Configured Package content lock paths do not match its payload files.',
        { package_id: input.packageId },
      );
    }
    const actualLock = packageContentDigest(contentLockPaths, (relativePath) =>
      fs.readFileSync(downloaded.get(relativePath)!));
    if (actualLock !== expectedLock) {
      localReadbackFailure(
        'configured_codex_plugin_carrier_payload_digest_mismatch',
        'Configured Package payload content lock does not match its owner manifest.',
        { package_id: input.packageId },
      );
    }
    // Some native plugin payloads predate embedded Package descriptors. Carry
    // their bound owner projection so installed discovery retains Package truth.
    const ownerManifestPath = path.join(pluginRoot, 'opl-package.json');
    if (!fs.existsSync(ownerManifestPath)) {
      fs.writeFileSync(ownerManifestPath, `${JSON.stringify(projection.ownerManifest, null, 2)}\n`, {
        encoding: 'utf8', mode: 0o644,
      });
    }
    if (!resolveAgentPluginManifest([pluginRoot], { expectedName: projection.pluginId })) {
      localReadbackFailure(
        'configured_codex_plugin_carrier_payload_invalid',
        'Configured Package payload does not contain its declared plugin manifest.',
        { package_id: input.packageId },
      );
    }
    writePayloadMarketplaceManifest({
      marketplaceRoot: stagingRoot,
      marketplaceId,
      pluginId: projection.pluginId,
    });

    const backupRoot = `${marketplaceRoot}.${process.pid}.previous`;
    fs.mkdirSync(path.dirname(marketplaceRoot), { recursive: true });
    fs.rmSync(backupRoot, { recursive: true, force: true });
    if (fs.existsSync(marketplaceRoot)) fs.renameSync(marketplaceRoot, backupRoot);
    try {
      fs.renameSync(stagingRoot, marketplaceRoot);
      fs.rmSync(backupRoot, { recursive: true, force: true });
    } catch (error) {
      if (!fs.existsSync(marketplaceRoot) && fs.existsSync(backupRoot)) {
        fs.renameSync(backupRoot, marketplaceRoot);
      }
      throw error;
    }
    return marketplaceRoot;
  } finally {
    archive?.cleanup();
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}
