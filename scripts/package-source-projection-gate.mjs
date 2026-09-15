#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  getOplPackageSpecs,
  getPublicationAdmittedOplPackageSpecs,
  normalizeDistributionVersion,
} from '../src/adapters/integration/package-distribution.ts';
import { assertJsonSchemaPayload } from '../src/kernel/schema-registry.ts';
import { parseJsonText, readJsonFile } from './script-json-boundary.mjs';

export const TEST_ONLY_PACKAGE_RELEASE_GATE = 'test_owner_sha_release_gate';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semVerPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const exactCommitPattern = /^[0-9a-f]{40}$/;
const allowedPayloadModes = new Set(['100644', '100755']);
const canonicalContentLock = 'ordered_path_length_file_length_bytes';
const canonicalPayloadSchemaRef = 'contracts/opl-framework/package-payload-manifest-v2.schema.json';
const canonicalPayloadSchema = readJsonFile(path.join(repoRoot, canonicalPayloadSchemaRef));

function fail(code, packageId, message, details = {}) {
  const error = new Error(`${code}: ${packageId}: ${message}`);
  error.code = code;
  error.details = { package_id: packageId, ...details };
  throw error;
}

function assertCanonicalPayloadSchema(payload, packageId) {
  try {
    assertJsonSchemaPayload({
      schemaId: canonicalPayloadSchema.$id ?? canonicalPayloadSchemaRef,
      schema: canonicalPayloadSchema,
      sourceRef: canonicalPayloadSchemaRef,
    }, payload);
  } catch (error) {
    fail('payload_surface_invalid', packageId, 'payload must satisfy the canonical v2 Package payload schema', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function git(repoPath, args, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error([
      `Command failed: git ${args.join(' ')}`,
      result.stderr?.trim(),
      result.stdout?.trim(),
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function gitValue(repoPath, args, allowFailure = false) {
  const result = git(repoPath, args, allowFailure);
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitBytes(repoPath, args) {
  const result = spawnSync('git', args, {
    cwd: repoPath,
    stdio: 'pipe',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: git ${args.join(' ')}`,
      result.stderr?.toString('utf8').trim(),
    ].filter(Boolean).join('\n'));
  }
  return result.stdout;
}

function ownerVersion(spec, ownerRepoPath) {
  const ownerManifest = readJsonFile(path.join(ownerRepoPath, spec.owner_package_manifest_ref));
  const ownerPackage = spec.owner_manifest_kind === 'workflow_profile'
    ? ownerManifest.package
    : ownerManifest;
  const packageId = String(ownerPackage?.package_id ?? ownerPackage?.id ?? '').trim();
  const agentId = String(ownerPackage?.agent_id ?? packageId).trim();
  const languageVersion = String(ownerPackage?.version ?? '').trim();
  const version = normalizeDistributionVersion(languageVersion);
  if (packageId !== spec.package_id
    || (spec.owner_manifest_kind === 'standard_agent' && agentId !== spec.package_id)) {
    fail('package_identity_drift', spec.package_id, 'owner manifest identity is not canonical', {
      owner_package_id: packageId,
      owner_agent_id: agentId,
    });
  }
  if (!semVerPattern.test(version)) {
    fail('package_version_invalid', spec.package_id, 'owner version does not normalize to SemVer', {
      owner_version: languageVersion,
    });
  }
  return { ownerManifest, ownerPackage, languageVersion, version };
}

export function resolveAnnotatedOwnerVersionTag({
  spec,
  ownerRepoPath,
  packageVersion,
  sourceCommit = gitValue(ownerRepoPath, ['rev-parse', 'HEAD']),
  releaseGate = /** @type {string | null} */ (null),
}) {
  if (!exactCommitPattern.test(sourceCommit ?? '')) {
    fail('carrier_source_commit_invalid', spec.package_id, 'carrier source commit must be an exact Git commit', {
      carrier_source_commit: sourceCommit,
    });
  }
  const tagName = `v${packageVersion}`;
  const tagRef = `refs/tags/${tagName}`;
  const objectType = gitValue(ownerRepoPath, ['cat-file', '-t', tagRef], true);
  const taggedCommit = objectType === 'tag'
    ? gitValue(ownerRepoPath, ['rev-list', '-n', '1', tagRef], true)
    : null;
  if (taggedCommit === sourceCommit) {
    return tagName;
  }
  if (releaseGate === TEST_ONLY_PACKAGE_RELEASE_GATE) {
    return null;
  }
  fail('version_bump_required', spec.package_id, `carrier source commit ${sourceCommit} requires an annotated v${packageVersion} tag`, {
    owner_source_commit: sourceCommit,
    package_version: packageVersion,
  });
}

function sha256(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function repoCoordinates(repoUrl, packageId) {
  let parsed;
  try {
    parsed = new URL(repoUrl);
  } catch {
    fail('source_repository_invalid', packageId, `invalid owner repository URL: ${repoUrl}`);
  }
  const parts = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parts.length !== 2) {
    fail('source_repository_invalid', packageId, `owner repository must be one GitHub HTTPS repository: ${repoUrl}`);
  }
  return { owner: parts[0], repo: parts[1] };
}

function safeRelativePath(value, field, packageId, allowDot = false) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || path.posix.isAbsolute(value)) {
    fail('source_path_invalid', packageId, `${field} must be a relative POSIX path`);
  }
  const normalized = path.posix.normalize(value);
  if ((!allowDot && normalized === '.') || normalized === '..' || normalized.startsWith('../')) {
    fail('source_path_invalid', packageId, `${field} escapes the owner checkout`, { value });
  }
  return normalized;
}

function sourceTreePath(ownerRepoPath, sourceRoot, filePath, packageId) {
  const relative = sourceRoot === '.' ? filePath : path.posix.join(sourceRoot, filePath);
  const resolved = path.resolve(ownerRepoPath, relative);
  const ownerRoot = `${path.resolve(ownerRepoPath)}${path.sep}`;
  if (!resolved.startsWith(ownerRoot)) {
    fail('source_path_invalid', packageId, 'payload file escapes the owner checkout', { path: filePath });
  }
  return relative;
}

function readCommitRegularFile({ packageId, ownerRepoPath, sourceCommit, treePath, failureCode }) {
  // NUL output preserves literal Unicode paths regardless of core.quotePath.
  const result = git(ownerRepoPath, ['ls-tree', '-z', '--full-tree', sourceCommit, '--', treePath], true);
  const entry = result.status === 0 ? result.stdout : null;
  const match = /^([0-9]{6}) blob ([0-9a-f]+)\t([^\0]+)\0$/.exec(entry ?? '');
  if (!match || match[3] !== treePath || !allowedPayloadModes.has(match[1])) {
    fail(failureCode, packageId, `source is not a regular carrier file at exact commit: ${sourceCommit}:${treePath}`, {
      source_commit: sourceCommit,
      source_path: treePath,
      tree_entry: entry,
    });
  }
  return {
    bytes: gitBytes(ownerRepoPath, ['cat-file', 'blob', match[2]]),
    mode: match[1],
  };
}

function readCommitBlob(input) {
  return readCommitRegularFile(input).bytes;
}

function projectedCarrierSourceCommit(packageId, projectedManifest) {
  const topLevel = projectedManifest.source_commit;
  const codexSurface = projectedManifest.codex_surface?.carrier_source_commit;
  if (topLevel !== undefined && codexSurface !== undefined && topLevel !== codexSurface) {
    fail('carrier_source_commit_drift', packageId, 'Framework source_commit and codex carrier_source_commit differ', {
      source_commit: topLevel,
      carrier_source_commit: codexSurface,
    });
  }
  return topLevel ?? codexSurface ?? null;
}

function resolveCarrierSourceCommit({ spec, ownerRepoPath, owner, projectedManifest }) {
  const ownerCommit = owner.ownerPackage?.codex_surface?.carrier_source_commit
    ?? owner.ownerManifest?.codex_surface?.carrier_source_commit
    ?? null;
  const projectedCommit = projectedCarrierSourceCommit(spec.package_id, projectedManifest);
  if (!exactCommitPattern.test(projectedCommit ?? '')) {
    fail('carrier_source_commit_invalid', spec.package_id, 'Framework carrier source projection must be an exact Git commit', {
      owner_carrier_source_commit: ownerCommit,
      projected_carrier_source_commit: projectedCommit,
    });
  }
  if (ownerCommit !== null && ownerCommit !== projectedCommit) {
    fail('carrier_source_commit_drift', spec.package_id, 'Framework projection differs from owner carrier source authority', {
      owner_carrier_source_commit: ownerCommit,
      projected_carrier_source_commit: projectedCommit,
    });
  }
  const sourceCommit = projectedCommit;
  const objectType = gitValue(ownerRepoPath, ['cat-file', '-t', `${sourceCommit}^{commit}`], true);
  if (objectType !== 'commit') {
    fail('carrier_source_commit_unavailable', spec.package_id, 'carrier source commit is not available in the owner repository', {
      carrier_source_commit: sourceCommit,
    });
  }
  return sourceCommit;
}

function validateContentLock({
  packageId,
  ownerPackageManifestRef,
  ownerManifestKind,
  ownerPluginManifestRef,
  ownerRepoPath,
  sourceCommit,
  ownerManifest,
  projectedManifest,
  payload,
}) {
  if (ownerManifestKind !== 'capability_package') return;
  const ownerLock = ownerManifest.content_lock;
  const projectedLock = projectedManifest.content_lock;
  if (JSON.stringify(projectedLock) !== JSON.stringify(ownerLock)) {
    fail('content_lock_drift', packageId, 'Framework and owner content locks differ');
  }
  if (ownerLock?.algorithm !== 'sha256'
    || ownerLock?.canonicalization !== canonicalContentLock
    || !Array.isArray(ownerLock?.paths)
    || !/^sha256:[0-9a-f]{64}$/.test(ownerLock?.digest ?? '')) {
    fail('content_lock_invalid', packageId, 'owner content lock contract is invalid');
  }
  const descriptorRef = projectedManifest.owner_package_descriptor_ref === undefined
    ? null
    : safeRelativePath(projectedManifest.owner_package_descriptor_ref, 'owner_package_descriptor_ref', packageId);
  const projectedOwnerManifestRef = projectedManifest.owner_package_manifest_ref === undefined
    ? null
    : safeRelativePath(projectedManifest.owner_package_manifest_ref, 'owner_package_manifest_ref', packageId);
  if ((descriptorRef === null) !== (projectedOwnerManifestRef === null)) {
    fail('owner_package_descriptor_invalid', packageId, 'owner package manifest and descriptor refs must be declared together');
  }
  if (projectedOwnerManifestRef !== null && projectedOwnerManifestRef !== ownerPackageManifestRef) {
    fail('owner_package_descriptor_invalid', packageId, 'Framework owner package manifest ref differs from the canonical owner surface', {
      expected: ownerPackageManifestRef,
      actual: projectedOwnerManifestRef,
    });
  }
  const payloadPaths = payload.files.map((entry) => entry.path);
  const contentPaths = descriptorRef === null
    ? payloadPaths
    : payloadPaths.filter((entry) => entry !== descriptorRef);
  const descriptorOccurrences = descriptorRef === null
    ? 0
    : payloadPaths.filter((entry) => entry === descriptorRef).length;
  if ((descriptorRef !== null && descriptorOccurrences !== 1)
    || JSON.stringify(contentPaths) !== JSON.stringify(ownerLock.paths)) {
    fail('content_lock_drift', packageId, 'payload files do not match the ordered content lock paths');
  }
  const hash = crypto.createHash('sha256');
  const pluginManifestPath = safeRelativePath(
    ownerPluginManifestRef,
    'owner_plugin_manifest_ref',
    packageId,
  );
  // Owner plugin manifests may be either the package-root `plugin.json` or the
  // nested `.codex-plugin/plugin.json`; resolve the carrier root from that
  // shape instead of assuming every manifest has the nested layout.
  const pluginManifestParent = path.posix.dirname(pluginManifestPath);
  const carrierRoot = path.posix.basename(pluginManifestParent) === '.codex-plugin'
    ? path.posix.dirname(pluginManifestParent)
    : pluginManifestParent;
  if (descriptorRef !== null) {
    const descriptorPath = carrierRoot === '.' ? descriptorRef : path.posix.join(carrierRoot, descriptorRef);
    const descriptorBytes = readCommitBlob({
      packageId,
      ownerRepoPath,
      sourceCommit,
      treePath: descriptorPath,
      failureCode: 'owner_package_descriptor_invalid',
    });
    const ownerManifestBytes = readCommitBlob({
      packageId,
      ownerRepoPath,
      sourceCommit,
      treePath: ownerPackageManifestRef,
      failureCode: 'owner_package_manifest_invalid',
    });
    if (!descriptorBytes.equals(ownerManifestBytes)) {
      fail('owner_package_descriptor_drift', packageId, 'owner package descriptor bytes differ from the canonical owner package manifest');
    }
    let descriptor;
    try {
      descriptor = parseJsonText(descriptorBytes.toString('utf8'));
    } catch {
      fail('owner_package_descriptor_invalid', packageId, 'owner package descriptor is not valid JSON');
    }
    if (descriptor.package_id !== packageId
      || descriptor.version !== projectedManifest.version
      || JSON.stringify(descriptor.content_lock) !== JSON.stringify(ownerLock)) {
      fail('owner_package_descriptor_drift', packageId, 'owner package descriptor identity, version, or content_lock differs from the Framework projection');
    }
  }
  for (const declaredPath of ownerLock.paths) {
    const relative = safeRelativePath(declaredPath, 'content_lock.paths[]', packageId);
    const bytes = readCommitBlob({
      packageId,
      ownerRepoPath,
      sourceCommit,
      treePath: carrierRoot === '.' ? relative : path.posix.join(carrierRoot, relative),
      failureCode: 'content_lock_source_missing',
    });
    const pathBytes = Buffer.from(relative, 'utf8');
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(pathLength);
    hash.update(pathBytes);
    hash.update(fileLength);
    hash.update(bytes);
  }
  const digest = `sha256:${hash.digest('hex')}`;
  if (digest !== ownerLock.digest) {
    fail('content_lock_digest_mismatch', packageId, 'owner content lock digest does not match current bytes', {
      expected: ownerLock.digest,
      actual: digest,
    });
  }
  if (payload.content_lock.digest !== digest) {
    fail('payload_content_lock_mismatch', packageId, 'payload content lock digest differs from owner carrier bytes', {
      expected: digest,
      actual: payload.content_lock.digest,
    });
  }
}

export function validatePackageSourceProjection({
  frameworkRoot = repoRoot,
  spec,
  ownerRepoPath,
  releaseGate = null,
}) {
  if (releaseGate === TEST_ONLY_PACKAGE_RELEASE_GATE) {
    return { package_id: spec.package_id, status: 'test_fixture_bypass' };
  }
  const owner = ownerVersion(spec, ownerRepoPath);
  const ownerHead = gitValue(ownerRepoPath, ['rev-parse', 'HEAD']);
  const manifestPath = path.join(frameworkRoot, spec.package_manifest_ref);
  const projectedManifest = readJsonFile(manifestPath);
  if (projectedManifest.package_id !== spec.package_id
    || projectedManifest.version !== owner.version) {
    fail('package_projection_version_drift', spec.package_id, 'Framework manifest does not match owner identity/version', {
      projected_version: projectedManifest.version,
      owner_version: owner.version,
    });
  }
  if (projectedManifest.source_repo !== spec.repo_url) {
    fail('source_repository_drift', spec.package_id, 'Framework manifest source repository differs from owner');
  }
  const carrierSourceCommit = resolveCarrierSourceCommit({
    spec,
    ownerRepoPath,
    owner,
    projectedManifest,
  });
  const ownerVersionTag = resolveAnnotatedOwnerVersionTag({
    spec,
    ownerRepoPath,
    packageVersion: owner.version,
    sourceCommit: carrierSourceCommit,
    releaseGate,
  });
  const expectedPayloadRef = `payloads/${spec.package_id}-${owner.version}.json`;
  const payloadRef = projectedManifest.codex_surface?.plugin_payload_manifest_url;
  if (payloadRef !== expectedPayloadRef) {
    fail('payload_ref_drift', spec.package_id, `Framework manifest must select ${expectedPayloadRef}`, {
      payload_ref: payloadRef,
    });
  }
  const payload = readJsonFile(path.join(path.dirname(manifestPath), payloadRef));
  if (payload.surface_kind !== 'opl_package_payload_manifest.v2'
    || payload.schema_ref !== canonicalPayloadSchemaRef) {
    fail('payload_surface_invalid', spec.package_id, 'payload must use the canonical v2 Package payload manifest');
  }
  assertCanonicalPayloadSchema(payload, spec.package_id);
  if (payload.package_id !== spec.package_id
    || payload.plugin_id !== projectedManifest.codex_surface?.plugin_id
    || payload.package_version !== owner.version
    || payload.source_repo !== spec.repo_url
    || payload.source_commit !== carrierSourceCommit) {
    fail('payload_source_drift', spec.package_id, 'payload identity, plugin, version, repository, or commit differs from carrier authority', {
      owner_head: ownerHead,
      carrier_source_commit: carrierSourceCommit,
      projected_plugin_id: projectedManifest.codex_surface?.plugin_id,
      payload_plugin_id: payload.plugin_id,
      payload_source_commit: payload.source_commit,
    });
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    fail('payload_files_invalid', spec.package_id, 'payload must declare at least one source file');
  }
  const sourceRoot = safeRelativePath(payload.source_root, 'source_root', spec.package_id, true);
  const coordinates = repoCoordinates(spec.repo_url, spec.package_id);
  const seen = new Set();
  const payloadContentLock = crypto.createHash('sha256');
  for (const entry of payload.files) {
    const relativePath = safeRelativePath(entry?.path, 'files[].path', spec.package_id);
    if (seen.has(relativePath)) {
      fail('payload_files_invalid', spec.package_id, `payload repeats source file: ${relativePath}`);
    }
    seen.add(relativePath);
    const sourcePath = sourceTreePath(ownerRepoPath, sourceRoot, relativePath, spec.package_id);
    const sourceEntry = readCommitRegularFile({
      packageId: spec.package_id,
      ownerRepoPath,
      sourceCommit: carrierSourceCommit,
      treePath: sourcePath,
      failureCode: 'payload_source_missing',
    });
    const sourceBytes = sourceEntry.bytes;
    if (entry.mode !== sourceEntry.mode) {
      fail('payload_source_mode_mismatch', spec.package_id, `payload mode differs from owner Git bytes: ${relativePath}`, {
        expected: sourceEntry.mode,
        actual: entry.mode,
      });
    }
    const encodedPath = sourcePath.split('/').map((segment) => encodeURIComponent(segment)
      .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
    const expectedUrl = `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.repo}/${carrierSourceCommit}/${encodedPath}`;
    if (entry.source_url !== expectedUrl) {
      fail('payload_source_url_drift', spec.package_id, `payload source URL is not bound to carrier authority: ${relativePath}`, {
        expected: expectedUrl,
        actual: entry.source_url,
      });
    }
    const actualDigest = sha256(sourceBytes);
    if (entry.sha256 !== actualDigest) {
      fail('payload_source_digest_mismatch', spec.package_id, `payload digest differs from owner bytes: ${relativePath}`, {
        expected: entry.sha256,
        actual: actualDigest,
      });
    }
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(sourceBytes.length));
    payloadContentLock.update(pathLength);
    payloadContentLock.update(pathBytes);
    payloadContentLock.update(fileLength);
    payloadContentLock.update(sourceBytes);
  }
  if (spec.owner_manifest_kind !== 'capability_package') {
    const actualPayloadDigest = `sha256:${payloadContentLock.digest('hex')}`;
    if (payload.content_lock.digest !== actualPayloadDigest) {
      fail('payload_content_lock_mismatch', spec.package_id, 'payload content lock digest differs from owner carrier bytes', {
        expected: actualPayloadDigest,
        actual: payload.content_lock.digest,
      });
    }
  }
  validateContentLock({
    packageId: spec.package_id,
    ownerPackageManifestRef: spec.owner_package_manifest_ref,
    ownerManifestKind: spec.owner_manifest_kind,
    ownerPluginManifestRef: spec.owner_plugin_manifest_ref,
    ownerRepoPath,
    sourceCommit: carrierSourceCommit,
    ownerManifest: owner.ownerManifest,
    projectedManifest,
    payload,
  });
  return {
    package_id: spec.package_id,
    package_version: owner.version,
    owner_source_commit: carrierSourceCommit,
    owner_head: ownerHead,
    owner_version_tag: ownerVersionTag,
    payload_ref: expectedPayloadRef,
    file_count: payload.files.length,
    status: 'validated',
  };
}

function parseOptions(argv) {
  const options = { frameworkRoot: repoRoot, packageId: null, ownerRoot: null, releaseGate: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--framework-root') options.frameworkRoot = path.resolve(value);
    else if (flag === '--package-id') options.packageId = value;
    else if (flag === '--owner-root') options.ownerRoot = path.resolve(value);
    else if (flag === '--release-gate') options.releaseGate = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.packageId || !options.ownerRoot) {
    throw new Error('Usage: package-source-projection-gate.mjs --package-id <id> --owner-root <path> [--framework-root <path>]');
  }
  return options;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const spec = getPublicationAdmittedOplPackageSpecs()
    .find((entry) => entry.package_id === options.packageId);
  if (!spec) {
    const discovered = getOplPackageSpecs().some((entry) => entry.package_id === options.packageId);
    if (discovered) {
      throw new Error(`Package is not admitted to the publication channel: ${options.packageId}`);
    }
    throw new Error(`Unknown canonical Package id: ${options.packageId}`);
  }
  const result = validatePackageSourceProjection({
    frameworkRoot: options.frameworkRoot,
    spec,
    ownerRepoPath: options.ownerRoot,
    releaseGate: options.releaseGate,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
