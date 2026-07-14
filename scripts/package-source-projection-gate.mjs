#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  getOplPackageSpecs,
  normalizeDistributionVersion,
} from '../src/modules/connect/package-distribution.ts';
import { readJsonFile } from './script-json-boundary.mjs';

export const TEST_ONLY_PACKAGE_RELEASE_GATE = 'test_owner_sha_release_gate';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semVerPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(code, packageId, message, details = {}) {
  const error = new Error(`${code}: ${packageId}: ${message}`);
  error.code = code;
  error.details = { package_id: packageId, ...details };
  throw error;
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
  releaseGate = null,
}) {
  const head = gitValue(ownerRepoPath, ['rev-parse', 'HEAD']);
  const tagName = `v${packageVersion}`;
  const tagRef = `refs/tags/${tagName}`;
  const objectType = gitValue(ownerRepoPath, ['cat-file', '-t', tagRef], true);
  const taggedCommit = objectType === 'tag'
    ? gitValue(ownerRepoPath, ['rev-list', '-n', '1', tagRef], true)
    : null;
  if (taggedCommit === head) {
    return tagName;
  }
  if (releaseGate === TEST_ONLY_PACKAGE_RELEASE_GATE) {
    return null;
  }
  fail('version_bump_required', spec.package_id, `owner HEAD ${head} requires an annotated v${packageVersion} tag`, {
    owner_head: head,
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

function sourceFilePath(ownerRepoPath, sourceRoot, filePath, packageId) {
  const relative = sourceRoot === '.' ? filePath : path.posix.join(sourceRoot, filePath);
  const resolved = path.resolve(ownerRepoPath, relative);
  const ownerRoot = `${path.resolve(ownerRepoPath)}${path.sep}`;
  if (!resolved.startsWith(ownerRoot)) {
    fail('source_path_invalid', packageId, 'payload file escapes the owner checkout', { path: filePath });
  }
  return { relative, resolved };
}

function validateContentLock({ packageId, ownerRepoPath, ownerManifest, projectedManifest, payload }) {
  if (packageId !== 'mas-scholar-skills') return;
  const ownerLock = ownerManifest.content_lock;
  const projectedLock = projectedManifest.content_lock;
  if (JSON.stringify(projectedLock) !== JSON.stringify(ownerLock)) {
    fail('content_lock_drift', packageId, 'Framework and owner content locks differ');
  }
  if (ownerLock?.algorithm !== 'sha256'
    || ownerLock?.canonicalization !== 'ordered_path_nul_file_bytes'
    || !Array.isArray(ownerLock?.paths)
    || !/^sha256:[0-9a-f]{64}$/.test(ownerLock?.digest ?? '')) {
    fail('content_lock_invalid', packageId, 'owner content lock contract is invalid');
  }
  if (JSON.stringify(payload.files.map((entry) => entry.path)) !== JSON.stringify(ownerLock.paths)) {
    fail('content_lock_drift', packageId, 'payload files do not match the ordered content lock paths');
  }
  const hash = crypto.createHash('sha256');
  for (const declaredPath of ownerLock.paths) {
    const relative = safeRelativePath(declaredPath, 'content_lock.paths[]', packageId);
    const filePath = path.resolve(ownerRepoPath, relative);
    if (!filePath.startsWith(`${path.resolve(ownerRepoPath)}${path.sep}`) || !fs.statSync(filePath).isFile()) {
      fail('content_lock_source_missing', packageId, `content lock source is missing: ${relative}`);
    }
    hash.update(Buffer.from(relative, 'utf8'));
    hash.update(Buffer.from([0]));
    hash.update(fs.readFileSync(filePath));
  }
  const digest = `sha256:${hash.digest('hex')}`;
  if (digest !== ownerLock.digest) {
    fail('content_lock_digest_mismatch', packageId, 'owner content lock digest does not match current bytes', {
      expected: ownerLock.digest,
      actual: digest,
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
  const ownerVersionTag = resolveAnnotatedOwnerVersionTag({
    spec,
    ownerRepoPath,
    packageVersion: owner.version,
    releaseGate,
  });
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
  const expectedPayloadRef = `payloads/${spec.package_id}-${owner.version}.json`;
  const payloadRef = projectedManifest.codex_surface?.plugin_payload_manifest_url;
  if (payloadRef !== expectedPayloadRef) {
    fail('payload_ref_drift', spec.package_id, `Framework manifest must select ${expectedPayloadRef}`, {
      payload_ref: payloadRef,
    });
  }
  const payload = readJsonFile(path.join(path.dirname(manifestPath), payloadRef));
  if (payload.package_id !== spec.package_id
    || payload.package_version !== owner.version
    || payload.source_repo !== spec.repo_url
    || payload.source_commit !== ownerHead) {
    fail('payload_source_drift', spec.package_id, 'payload identity, version, repository, or commit differs from owner HEAD', {
      owner_head: ownerHead,
      payload_source_commit: payload.source_commit,
    });
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    fail('payload_files_invalid', spec.package_id, 'payload must declare at least one source file');
  }
  const sourceRoot = safeRelativePath(payload.source_root, 'source_root', spec.package_id, true);
  const coordinates = repoCoordinates(spec.repo_url, spec.package_id);
  const seen = new Set();
  for (const entry of payload.files) {
    const relativePath = safeRelativePath(entry?.path, 'files[].path', spec.package_id);
    if (seen.has(relativePath)) {
      fail('payload_files_invalid', spec.package_id, `payload repeats source file: ${relativePath}`);
    }
    seen.add(relativePath);
    const source = sourceFilePath(ownerRepoPath, sourceRoot, relativePath, spec.package_id);
    if (!fs.existsSync(source.resolved) || !fs.statSync(source.resolved).isFile()) {
      fail('payload_source_missing', spec.package_id, `owner source file is missing: ${source.relative}`);
    }
    const expectedUrl = `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.repo}/${ownerHead}/${source.relative}`;
    if (entry.source_url !== expectedUrl) {
      fail('payload_source_url_drift', spec.package_id, `payload source URL is not bound to owner HEAD: ${relativePath}`, {
        expected: expectedUrl,
        actual: entry.source_url,
      });
    }
    const actualDigest = sha256(fs.readFileSync(source.resolved));
    if (entry.sha256 !== actualDigest) {
      fail('payload_source_digest_mismatch', spec.package_id, `payload digest differs from owner bytes: ${relativePath}`, {
        expected: entry.sha256,
        actual: actualDigest,
      });
    }
  }
  if (spec.package_id === 'opl-flow'
    && projectedManifest.codex_surface?.carrier_source_commit !== ownerHead) {
    fail('carrier_source_commit_drift', spec.package_id, 'OPL Flow carrier source commit differs from owner HEAD');
  }
  validateContentLock({
    packageId: spec.package_id,
    ownerRepoPath,
    ownerManifest: owner.ownerManifest,
    projectedManifest,
    payload,
  });
  return {
    package_id: spec.package_id,
    package_version: owner.version,
    owner_source_commit: ownerHead,
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
  const spec = getOplPackageSpecs().find((entry) => entry.package_id === options.packageId);
  if (!spec) throw new Error(`Unknown canonical Package id: ${options.packageId}`);
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
