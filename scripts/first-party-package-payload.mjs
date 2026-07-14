#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, TextDecoder } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const PACKAGE_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const GITHUB_COMPONENT = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;
const MAX_GIT_OUTPUT = 128 * 1024 * 1024;
const CANONICAL_PAYLOAD_SURFACE = 'opl_package_payload_manifest.v2';
const CANONICAL_PAYLOAD_SCHEMA = 'contracts/opl-framework/package-payload-manifest-v2.schema.json';
const CANONICAL_CONTENT_LOCK = 'ordered_path_length_file_length_bytes';
const LEGACY_CONTENT_LOCK = 'ordered_path_nul_file_bytes';
const LEGACY_PAYLOAD_SURFACES = new Set([
  'opl_agent_package_payload_manifest',
  'opl_package_payload_manifest.v1',
]);
const ALLOWED_FILE_MODES = new Set(['100644', '100755']);
const EXPECTED_REMOTE_REF = 'refs/remotes/origin/main';
const PACKAGE_MANIFEST_SCHEMAS = new Map([
  ['opl_agent_package_manifest.v1', {
    ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    localPath: 'contracts/opl-framework/agent-package-manifest.schema.json',
  }],
  ['opl_capability_package_manifest.v2', {
    ref: 'one-person-lab/contracts/opl-framework/capability-package-manifest.schema.json',
    localPath: 'contracts/opl-framework/capability-package-manifest.schema.json',
  }],
  ['opl_workflow_profile_package_manifest.v1', {
    ref: 'contracts/opl-framework/workflow-profile-package-manifest.schema.json',
    localPath: 'contracts/opl-framework/workflow-profile-package-manifest.schema.json',
  }],
]);
const FIRST_PARTY_SOURCES = new Set(['first_party', 'first_party_owner_projection']);
const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaCompiler = new Ajv2020({ allErrors: true, strict: false });
const schemaValidators = new Map();

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      manifest: { type: 'string' },
      allowlist: { type: 'string' },
      'owner-cohort-lock': { type: 'string' },
      repo: { type: 'string' },
      'source-commit': { type: 'string' },
      check: { type: 'boolean', default: false },
    },
  });
  const required = ['manifest', 'allowlist', 'owner-cohort-lock', 'repo', 'source-commit'];
  const missing = required.filter((name) => typeof values[name] !== 'string' || !values[name].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required options: ${missing.map((name) => `--${name}`).join(', ')}`);
  }
  return {
    manifest: path.resolve(values.manifest.trim()),
    allowlist: path.resolve(values.allowlist.trim()),
    ownerCohortLock: path.resolve(values['owner-cohort-lock'].trim()),
    repo: path.resolve(values.repo.trim()),
    sourceCommit: values['source-commit'].trim(),
    check: values.check,
  };
}

function decodeUtf8(bytes, label) {
  let value;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Buffer.from(value, 'utf8').equals(bytes)) {
    throw new Error(`${label} is not canonical round-trip UTF-8`);
  }
  return value;
}

function readRegularFile(filePath, label) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new Error(`Cannot open ${label} ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new Error(`${label} is not a regular file: ${filePath}`);
    }
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(decodeUtf8(bytes, label));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label} is not`)) throw error;
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJsonFile(filePath, label) {
  return parseJsonBytes(readRegularFile(filePath, label), label);
}

function assertSchemaPayload(schemaRef, payload, label) {
  let validate = schemaValidators.get(schemaRef);
  if (!validate) {
    const schema = readJsonFile(path.resolve(FRAMEWORK_ROOT, schemaRef), `JSON Schema ${schemaRef}`);
    validate = schemaCompiler.compile(schema);
    schemaValidators.set(schemaRef, validate);
  }
  if (!validate(payload)) {
    throw new Error(`${label} failed canonical JSON Schema ${schemaRef}: ${JSON.stringify(validate.errors)}`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (Buffer.from(value, 'utf8').toString('utf8') !== value) {
    throw new Error(`${label} must round-trip through UTF-8 without replacement`);
  }
  return value;
}

function assertSemver(value, label) {
  const match = SEMVER.exec(value);
  if (!match) {
    throw new Error(`${label} must be strict SemVer: ${value}`);
  }
  const prerelease = match[4];
  if (prerelease) {
    for (const identifier of prerelease.split('.')) {
      if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0')) {
        throw new Error(`${label} has a numeric prerelease identifier with a leading zero: ${value}`);
      }
    }
  }
}

function assertSafePosixPath(value, label, { allowRoot = false } = {}) {
  requireString(value, label);
  if (allowRoot && value === '.') return;
  if (value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a relative POSIX path without backslashes: ${value}`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must not contain control characters: ${JSON.stringify(value)}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label} must not contain empty or dot segments: ${value}`);
  }
  if (path.posix.normalize(value) !== value) {
    throw new Error(`${label} must be a canonical relative POSIX path: ${value}`);
  }
  if (value.normalize('NFC') !== value) {
    throw new Error(`${label} must use NFC Unicode normalization: ${value}`);
  }
}

function assertNoPortablePathCollisions(paths) {
  const seen = new Map();
  for (const candidate of paths) {
    const collisionKey = candidate.normalize('NFKC').toLowerCase();
    const previous = seen.get(collisionKey);
    if (previous !== undefined) {
      throw new Error(`Payload allowlist has a case or Unicode path collision: ${previous} <> ${candidate}`);
    }
    seen.set(collisionKey, candidate);
  }
}

function parseGithubRepository(value, label) {
  requireString(value, label);
  const prefix = 'https://github.com/';
  if (!value.startsWith(prefix) || value.includes('\\') || /[?#]/.test(value)) {
    throw new Error(`${label} must be a canonical HTTPS GitHub URL ending in .git: ${value}`);
  }
  const rawSegments = value.slice(prefix.length).split('/');
  if (rawSegments.some((segment) => /^%2e(?:%2e)?$/i.test(segment) || segment === '.' || segment === '..')) {
    throw new Error(`${label} must not contain URL dot segments: ${value}`);
  }
  if (rawSegments.length !== 2 || rawSegments.some((segment) => segment.includes('%'))) {
    throw new Error(`${label} must be a canonical HTTPS GitHub URL ending in .git: ${value}`);
  }
  const [owner, repositoryWithSuffix] = rawSegments;
  if (!repositoryWithSuffix.endsWith('.git')) {
    throw new Error(`${label} must be a canonical HTTPS GitHub URL ending in .git: ${value}`);
  }
  const repository = repositoryWithSuffix.slice(0, -4);
  if (!GITHUB_COMPONENT.test(owner) || !GITHUB_COMPONENT.test(repository)) {
    throw new Error(`${label} has an invalid GitHub owner or repository name: ${value}`);
  }
  return { owner, repository };
}

function loadOwnerCohortAuthority(options, packageId, sourceRepoUrl, githubRepository) {
  const lock = requireObject(
    readJsonFile(options.ownerCohortLock, 'Package owner cohort lock'),
    'Package owner cohort lock',
  );
  assertSchemaPayload(
    'contracts/opl-framework/package-owner-cohort-lock.schema.json',
    lock,
    'Package owner cohort lock',
  );
  const packages = requireObject(lock.packages, 'Package owner cohort lock packages');
  const entry = requireObject(packages[packageId], `Package owner cohort lock entry ${packageId}`);
  if (entry.package_id !== packageId
    || entry.repo_url !== sourceRepoUrl
    || entry.repo_name !== githubRepository.repository) {
    throw new Error(
      `Package owner cohort authority does not match Framework identity: package=${packageId} repo=${sourceRepoUrl}`,
    );
  }
  const expectedCommit = requireString(entry.source_commit, 'Package owner cohort source commit');
  if (!FULL_GIT_SHA.test(expectedCommit)) {
    throw new Error(`Package owner cohort source commit must be an exact lowercase 40-character Git SHA: ${expectedCommit}`);
  }
  if (!FULL_GIT_SHA.test(options.sourceCommit)) {
    throw new Error(`Source commit must be one exact lowercase 40-character Git SHA: ${options.sourceCommit}`);
  }
  if (options.sourceCommit !== expectedCommit) {
    throw new Error(
      `Caller source commit does not match Package owner cohort authority: expected=${expectedCommit} actual=${options.sourceCommit}`,
    );
  }
  return {
    expectedCommit,
    remoteRef: EXPECTED_REMOTE_REF,
  };
}

function loadAuthority(options) {
  const manifest = requireObject(readJsonFile(options.manifest, 'Framework package manifest'), 'Framework package manifest');
  const surfaceKind = requireString(manifest.surface_kind, 'Framework package manifest surface_kind');
  const schemaBinding = PACKAGE_MANIFEST_SCHEMAS.get(surfaceKind);
  if (!schemaBinding || manifest.schema_ref !== schemaBinding.ref) {
    throw new Error(`Unsupported or non-canonical Framework package manifest schema: ${String(manifest.schema_ref)}`);
  }
  if (!FIRST_PARTY_SOURCES.has(manifest.source)) {
    throw new Error(`Framework package manifest is not first-party: ${String(manifest.source)}`);
  }

  const packageId = requireString(manifest.package_id, 'Framework package id');
  if (!PACKAGE_ID.test(packageId)) {
    throw new Error(`Invalid canonical package id: ${packageId}`);
  }
  if (path.basename(options.manifest) !== `${packageId}.json`) {
    throw new Error(`Framework package manifest filename must match package id: expected=${packageId}.json`);
  }
  const packageVersion = requireString(manifest.version, 'Framework package version');
  assertSemver(packageVersion, 'Framework package version');
  const codexSurface = requireObject(manifest.codex_surface, 'Framework package codex_surface');
  const pluginId = requireString(codexSurface.plugin_id, 'Framework package plugin id');
  if (!PACKAGE_ID.test(pluginId)) {
    throw new Error(`Invalid canonical plugin id: ${pluginId}`);
  }

  const outputRef = requireString(codexSurface.plugin_payload_manifest_url, 'Framework package payload manifest URL');
  assertSafePosixPath(outputRef, 'Framework package payload manifest URL');
  const expectedOutputRef = `payloads/${packageId}-${packageVersion}.json`;
  if (outputRef !== expectedOutputRef) {
    throw new Error(`Framework package payload output is not identity-bound: expected=${expectedOutputRef} actual=${outputRef}`);
  }

  const allowlist = requireObject(readJsonFile(options.allowlist, 'Framework payload allowlist'), 'Framework payload allowlist');
  if (allowlist.surface_kind !== 'opl_package_payload_allowlist.v1') {
    throw new Error(`Unsupported Framework payload allowlist surface: ${String(allowlist.surface_kind)}`);
  }
  if (path.basename(options.allowlist) !== `${packageId}.json`) {
    throw new Error(`Framework payload allowlist filename must match package id: expected=${packageId}.json`);
  }
  if (allowlist.package_id !== packageId || allowlist.plugin_id !== pluginId) {
    throw new Error(`Framework package and payload allowlist identities do not match: package=${packageId} plugin=${pluginId}`);
  }
  const sourceRepoUrl = requireString(allowlist.source_repo, 'Framework payload source repository');
  const githubRepository = parseGithubRepository(sourceRepoUrl, 'Framework payload source repository');
  if (manifest.source_repo !== undefined && manifest.source_repo !== sourceRepoUrl) {
    throw new Error(`Framework package and payload allowlist source repositories do not match: manifest=${String(manifest.source_repo)} allowlist=${sourceRepoUrl}`);
  }
  const sourceRoot = requireString(allowlist.source_root, 'Framework payload source root');
  assertSafePosixPath(sourceRoot, 'Framework payload source root', { allowRoot: true });
  if (!Array.isArray(allowlist.paths) || allowlist.paths.length === 0) {
    throw new Error('Framework payload allowlist paths must be a non-empty array');
  }
  const paths = allowlist.paths.map((candidate, index) => {
    const value = requireString(candidate, `Framework payload allowlist path ${index}`);
    assertSafePosixPath(value, `Framework payload allowlist path ${index}`);
    return value;
  });
  assertNoPortablePathCollisions(paths);
  let contentLock = null;
  if (manifest.content_lock !== undefined) {
    const declared = requireObject(manifest.content_lock, 'Framework package content_lock');
    if (declared.algorithm !== 'sha256'
      || ![LEGACY_CONTENT_LOCK, CANONICAL_CONTENT_LOCK].includes(declared.canonicalization)
      || typeof declared.digest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(declared.digest)) {
      throw new Error('Framework package content_lock must use a supported sha256 canonicalization');
    }
    if (!Array.isArray(declared.paths)
      || declared.paths.length !== paths.length
      || declared.paths.some((candidate, index) => candidate !== paths[index])) {
      throw new Error('Framework package content_lock paths do not match the payload allowlist');
    }
    contentLock = {
      canonicalization: declared.canonicalization,
      digest: declared.digest,
    };
  }
  if (!paths.includes('.codex-plugin/plugin.json')) {
    throw new Error('Framework payload allowlist must include .codex-plugin/plugin.json');
  }
  if (!paths.includes(`skills/${pluginId}/SKILL.md`)) {
    throw new Error(`Framework payload allowlist must include skills/${pluginId}/SKILL.md`);
  }
  assertSchemaPayload(schemaBinding.localPath, manifest, 'Framework package manifest');
  assertSchemaPayload(
    'contracts/opl-framework/package-payload-allowlist.schema.json',
    allowlist,
    'Framework payload allowlist',
  );
  const sourceAuthority = loadOwnerCohortAuthority(
    options,
    packageId,
    sourceRepoUrl,
    githubRepository,
  );

  return {
    packageId,
    packageVersion,
    pluginId,
    sourceRepoUrl,
    githubRepository,
    sourceRoot,
    paths,
    contentLock,
    ...sourceAuthority,
    output: path.resolve(path.dirname(options.manifest), outputRef),
  };
}

function gitEnvironment() {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('GIT_') && value !== undefined) environment[name] = value;
  }
  return {
    ...environment,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_LITERAL_PATHSPECS: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function spawnGit(repo, args, encoding = null) {
  return spawnSync('git', ['-C', repo, ...args], {
    encoding,
    maxBuffer: MAX_GIT_OUTPUT,
    env: gitEnvironment(),
  });
}

function resultError(result) {
  if (result.error) return result.error.message;
  return String(result.stderr ?? '').trim() || `git exited with status ${result.status}`;
}

function gitText(repo, args, errorMessage) {
  const result = spawnGit(repo, args, 'utf8');
  if (result.status !== 0) {
    throw new Error(`${errorMessage}: ${resultError(result)}`);
  }
  return result.stdout.trim();
}

function gitBytes(repo, args, errorMessage) {
  const result = spawnGit(repo, args);
  if (result.status !== 0) {
    throw new Error(`${errorMessage}: ${resultError(result)}`);
  }
  return result.stdout;
}

function assertRepositoryBinding(repo, sourceRepoUrl) {
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    throw new Error(`Git repository does not exist: ${repo}`);
  }
  const inside = spawnGit(repo, ['rev-parse', '--is-inside-work-tree'], 'utf8');
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    throw new Error(`Not a Git worktree: ${repo}`);
  }
  if (gitText(repo, ['rev-parse', '--is-bare-repository'], `Cannot inspect Git repository ${repo}`) !== 'false') {
    throw new Error(`--repo must name a non-bare Git worktree root: ${repo}`);
  }
  const topLevel = fs.realpathSync(path.resolve(
    gitText(repo, ['rev-parse', '--show-toplevel'], `Cannot resolve Git worktree root ${repo}`),
  ));
  if (topLevel !== fs.realpathSync(repo)) {
    throw new Error(`--repo must name the Git worktree root: ${repo}`);
  }
  const origin = spawnGit(repo, ['config', '--local', '--get-all', 'remote.origin.url'], 'utf8');
  const originUrls = origin.status === 0 ? origin.stdout.split(/\r?\n/).filter(Boolean) : [];
  if (originUrls.length !== 1 || originUrls[0] !== sourceRepoUrl) {
    throw new Error(`Git origin does not match Framework payload source repository: expected=${sourceRepoUrl} actual=${originUrls.join(',') || '<missing>'}`);
  }
}

function assertExactCommit(repo, commit) {
  if (!FULL_GIT_SHA.test(commit)) {
    throw new Error(`Source commit must be one exact lowercase 40-character Git SHA: ${commit}`);
  }
  const type = spawnGit(repo, ['cat-file', '-t', commit], 'utf8');
  if (type.status !== 0 || type.stdout.trim() !== 'commit') {
    throw new Error(`Source commit does not exist as an exact local Git commit object: ${commit}`);
  }
  const resolved = gitText(repo, ['rev-parse', '--verify', `${commit}^{commit}`], `Cannot resolve source commit ${commit}`);
  if (resolved !== commit) {
    throw new Error(`Source commit did not resolve to the requested exact object: requested=${commit} resolved=${resolved}`);
  }
}

function assertRemoteReachability(repo, commit, remoteRef) {
  const resolvedRemote = spawnGit(repo, ['rev-parse', '--verify', `${remoteRef}^{commit}`], 'utf8');
  if (resolvedRemote.status !== 0 || !FULL_GIT_SHA.test(resolvedRemote.stdout.trim())) {
    throw new Error(`Expected remote-tracking authority ref is missing: ${remoteRef}`);
  }
  const reachable = spawnGit(repo, ['merge-base', '--is-ancestor', commit, remoteRef], 'utf8');
  if (reachable.status !== 0) {
    throw new Error(`Package owner cohort source commit is not reachable from ${remoteRef}: ${commit}`);
  }
}

function assertSourceTree(repo, commit, sourceRoot) {
  const treeish = sourceRoot === '.' ? `${commit}^{tree}` : `${commit}:${sourceRoot}`;
  const probe = spawnGit(repo, ['cat-file', '-t', treeish], 'utf8');
  if (probe.status !== 0 || probe.stdout.trim() !== 'tree') {
    throw new Error(`Source root is not a Git tree at exact commit: ${commit}:${sourceRoot}`);
  }
}

function fullTreePath(sourceRoot, relativePath) {
  return sourceRoot === '.' ? relativePath : `${sourceRoot}/${relativePath}`;
}

function allowlistedTreeEntries(repo, commit, sourceRoot, paths) {
  const fullPaths = paths.map((relativePath) => fullTreePath(sourceRoot, relativePath));
  const allowed = new Map(fullPaths.map((treePath, index) => [treePath, paths[index]]));
  const source = gitBytes(
    repo,
    ['ls-tree', '-z', '--full-tree', commit, '--', ...fullPaths],
    `Cannot inspect allowlisted carrier files at ${commit}:${sourceRoot}`,
  );
  const decoded = decodeUtf8(source, 'Git tree path output');
  if (decoded && !decoded.endsWith('\0')) {
    throw new Error('Git tree path output is not NUL terminated');
  }
  const entries = new Map();
  for (const record of decoded.split('\0').filter(Boolean)) {
    const match = /^([0-9]{6}) ([a-z]+) ([0-9a-f]+)\t(.+)$/.exec(record);
    if (!match) {
      throw new Error(`Unexpected git ls-tree record: ${JSON.stringify(record)}`);
    }
    const [, mode, type, objectId, treePath] = match;
    assertSafePosixPath(treePath, 'Git carrier tree path');
    const relativePath = allowed.get(treePath);
    if (relativePath === undefined || entries.has(relativePath)) {
      throw new Error(`Git returned an unexpected or duplicate carrier path: ${treePath}`);
    }
    if (type !== 'blob' || !ALLOWED_FILE_MODES.has(mode)) {
      throw new Error(`Unsupported carrier tree entry at ${treePath}: mode=${mode} type=${type}; only 100644 and 100755 blobs are allowed`);
    }
    entries.set(relativePath, { mode, objectId, relativePath, treePath });
  }
  const missing = paths.filter((relativePath) => !entries.has(relativePath));
  if (missing.length > 0) {
    throw new Error(`Allowlisted carrier files are missing at exact commit: ${missing.join(', ')}`);
  }
  return paths.map((relativePath) => entries.get(relativePath));
}

function encodeUrlSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function rawSourceUrl(githubRepository, commit, treePath) {
  const encodedPath = treePath.split('/').map(encodeUrlSegment).join('/');
  if (encodedPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Generated source URL would contain a dot segment: ${treePath}`);
  }
  return `https://raw.githubusercontent.com/${githubRepository.owner}/${githubRepository.repository}/${commit}/${encodedPath}`;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function contentLockDigest(canonicalization, paths, blobs) {
  const digest = crypto.createHash('sha256');
  for (const relativePath of paths) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = blobs.get(relativePath);
    if (canonicalization === LEGACY_CONTENT_LOCK) {
      digest.update(pathBytes);
      digest.update('\0');
      digest.update(fileBytes);
      continue;
    }
    if (canonicalization !== CANONICAL_CONTENT_LOCK) {
      throw new Error(`Unsupported content_lock canonicalization: ${canonicalization}`);
    }
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(fileLength);
    digest.update(fileBytes);
  }
  return `sha256:${digest.digest('hex')}`;
}

function readSourceSnapshot(options, authority) {
  assertRepositoryBinding(options.repo, authority.sourceRepoUrl);
  assertExactCommit(options.repo, authority.expectedCommit);
  assertRemoteReachability(options.repo, authority.expectedCommit, authority.remoteRef);
  assertSourceTree(options.repo, authority.expectedCommit, authority.sourceRoot);
  const entries = allowlistedTreeEntries(
    options.repo,
    authority.expectedCommit,
    authority.sourceRoot,
    authority.paths,
  );
  const blobs = new Map(entries.map((entry) => [
    entry.relativePath,
    gitBytes(options.repo, ['cat-file', 'blob', entry.objectId], `Cannot read carrier blob ${entry.objectId}`),
  ]));
  const plugin = requireObject(
    parseJsonBytes(blobs.get('.codex-plugin/plugin.json'), 'Committed Codex plugin manifest'),
    'Committed Codex plugin manifest',
  );
  if (plugin.name !== authority.pluginId) {
    throw new Error(`Committed plugin name does not match Framework identity: expected=${authority.pluginId} actual=${String(plugin.name)}`);
  }
  const pluginVersion = requireString(plugin.version, 'Committed plugin version');
  assertSemver(pluginVersion, 'Committed plugin version');
  if (pluginVersion !== authority.packageVersion) {
    throw new Error(`Committed plugin version does not match Framework package version: expected=${authority.packageVersion} actual=${pluginVersion}`);
  }
  return { blobs, entries };
}

function verifyDeclaredContentLock(authority, snapshot, { allowLegacy }) {
  if (authority.contentLock) {
    if (!allowLegacy && authority.contentLock.canonicalization !== CANONICAL_CONTENT_LOCK) {
      throw new Error(
        `Framework package content_lock uses the historical ${LEGACY_CONTENT_LOCK} boundary; bump SemVer and issue ${CANONICAL_CONTENT_LOCK}`,
      );
    }
    const actual = contentLockDigest(
      authority.contentLock.canonicalization,
      authority.paths,
      snapshot.blobs,
    );
    if (actual !== authority.contentLock.digest) {
      throw new Error(`Exact commit does not match Framework package content_lock: expected=${authority.contentLock.digest} actual=${actual}`);
    }
  }
  return contentLockDigest(CANONICAL_CONTENT_LOCK, authority.paths, snapshot.blobs);
}

function buildPayload(authority, snapshot) {
  const canonicalDigest = verifyDeclaredContentLock(authority, snapshot, { allowLegacy: false });

  return {
    surface_kind: CANONICAL_PAYLOAD_SURFACE,
    schema_ref: CANONICAL_PAYLOAD_SCHEMA,
    package_id: authority.packageId,
    plugin_id: authority.pluginId,
    package_version: authority.packageVersion,
    source_repo: authority.sourceRepoUrl,
    source_commit: authority.expectedCommit,
    source_root: authority.sourceRoot,
    content_lock: {
      algorithm: 'sha256',
      canonicalization: CANONICAL_CONTENT_LOCK,
      digest: canonicalDigest,
    },
    files: snapshot.entries.map((entry) => {
      const bytes = snapshot.blobs.get(entry.relativePath);
      return {
        path: entry.relativePath,
        mode: entry.mode,
        source_url: rawSourceUrl(authority.githubRepository, authority.expectedCommit, entry.treePath),
        sha256: `sha256:${sha256(bytes)}`,
      };
    }),
  };
}

function readImmutableTarget(filePath, missingMessage) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') throw new Error(missingMessage);
    throw new Error(`Cannot open immutable payload manifest ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      throw new Error(`Immutable payload manifest is not a regular file: ${filePath}`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    let linked;
    try {
      linked = fs.lstatSync(filePath, { bigint: true });
    } catch {
      throw new Error(`Immutable payload manifest path changed while being read: ${filePath}`);
    }
    if (before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || !linked.isFile()
      || linked.dev !== after.dev
      || linked.ino !== after.ino) {
      throw new Error(`Immutable payload manifest changed while being read: ${filePath}`);
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function assertExpectedBytes(filePath, expected, expectedDigest, conflictMessage) {
  const actual = readImmutableTarget(filePath, `Tracked payload manifest is missing: ${filePath}`);
  if (!actual.equals(expected)) {
    throw new Error(`${conflictMessage}: ${filePath} expected=${expectedDigest} actual=sha256:${sha256(actual)}`);
  }
}

function legacyPayloadAt(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const bytes = readImmutableTarget(filePath, `Tracked payload manifest is missing: ${filePath}`);
  let payload;
  try {
    payload = parseJsonBytes(bytes, 'Published payload manifest');
  } catch {
    return null;
  }
  return payload && typeof payload === 'object' && LEGACY_PAYLOAD_SURFACES.has(payload.surface_kind)
    ? { bytes, payload }
    : null;
}

function checkLegacyPayload(authority, snapshot, legacy) {
  const payload = requireObject(legacy.payload, 'Published legacy payload manifest');
  if (payload.surface_kind === 'opl_package_payload_manifest.v1') {
    assertSchemaPayload(
      'contracts/opl-framework/package-payload-manifest.schema.json',
      payload,
      'Published legacy package payload manifest',
    );
  } else if (payload.schema_ref !== undefined) {
    throw new Error('Historical unversioned payload manifest must not claim a canonical schema_ref');
  }
  if (payload.package_id !== authority.packageId
    || payload.package_version !== authority.packageVersion
    || payload.source_repo !== authority.sourceRepoUrl
    || payload.source_commit !== authority.expectedCommit
    || payload.source_root !== authority.sourceRoot) {
    throw new Error('Published legacy payload identity does not match Framework and owner cohort authority');
  }
  if (!Array.isArray(payload.files) || payload.files.length !== snapshot.entries.length) {
    throw new Error('Published legacy payload files do not match the Framework allowlist');
  }
  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const expected = snapshot.entries[index];
    const actual = requireObject(payload.files[index], `Published legacy payload file ${index}`);
    const bytes = snapshot.blobs.get(expected.relativePath);
    if (actual.path !== expected.relativePath
      || actual.source_url !== rawSourceUrl(authority.githubRepository, authority.expectedCommit, expected.treePath)
      || actual.sha256 !== `sha256:${sha256(bytes)}`) {
      throw new Error(`Published legacy payload file does not match exact source authority: ${expected.relativePath}`);
    }
  }
  verifyDeclaredContentLock(authority, snapshot, { allowLegacy: true });
  return `sha256:${sha256(legacy.bytes)}`;
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(
    directory,
    fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0),
  );
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function processIsRunning(pid) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === 'object' && error.code === 'EPERM');
  }
}

function cleanupTargetTemporaryFiles(directory, filePath) {
  const escaped = path.basename(filePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\.${escaped}\\.([1-9][0-9]*)\\.[0-9a-f]{24}\\.tmp$`);
  let removed = false;
  for (const name of fs.readdirSync(directory)) {
    const match = pattern.exec(name);
    if (!match || processIsRunning(Number(match[1]))) continue;
    const temporary = path.join(directory, name);
    const state = fs.lstatSync(temporary);
    if (!state.isFile() || state.isSymbolicLink()) continue;
    fs.rmSync(temporary);
    removed = true;
  }
  if (removed) fsyncDirectory(directory);
}

function prepareOutputDirectory(filePath, manifestPath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const directoryState = fs.lstatSync(directory);
  const expectedDirectory = path.join(fs.realpathSync(path.dirname(manifestPath)), 'payloads');
  if (!directoryState.isDirectory()
    || directoryState.isSymbolicLink()
    || fs.realpathSync(directory) !== expectedDirectory) {
    throw new Error(`Payload output directory must be the real packages/payloads directory beside the manifest: ${directory}`);
  }
  return directory;
}

function installImmutable(filePath, expected, expectedDigest, manifestPath) {
  const directory = prepareOutputDirectory(filePath, manifestPath);
  cleanupTargetTemporaryFiles(directory, filePath);
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    fs.writeFileSync(descriptor, expected);
    fs.fchmodSync(descriptor, 0o644);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      // A hard-link install is an atomic create-if-absent CAS and never replaces a published SemVer path.
      fs.linkSync(temporary, filePath);
      fsyncDirectory(directory);
      return 'created';
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
      assertExpectedBytes(filePath, expected, expectedDigest, 'Immutable payload manifest conflict');
      return 'unchanged';
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    const temporaryExists = fs.existsSync(temporary);
    fs.rmSync(temporary, { force: true });
    if (temporaryExists) fsyncDirectory(directory);
  }
}

function applyPayload(options, authority, source) {
  const expected = Buffer.from(source, 'utf8');
  const expectedDigest = `sha256:${sha256(expected)}`;
  if (options.check) {
    assertExpectedBytes(authority.output, expected, expectedDigest, 'Tracked payload manifest drift detected');
    return { status: 'checked', payloadSha256: expectedDigest };
  }
  const status = installImmutable(authority.output, expected, expectedDigest, options.manifest);
  return { status, payloadSha256: expectedDigest };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const authority = loadAuthority(options);
  const snapshot = readSourceSnapshot(options, authority);
  const legacy = legacyPayloadAt(authority.output);
  if (legacy) {
    if (!options.check) {
      throw new Error(
        `Published legacy payload is historical read-only; bump package SemVer before creating ${CANONICAL_PAYLOAD_SURFACE}: ${authority.output}`,
      );
    }
    const payloadSha256 = checkLegacyPayload(authority, snapshot, legacy);
    process.stdout.write(`${JSON.stringify({
      status: 'checked_legacy',
      output: authority.output,
      package_id: authority.packageId,
      package_version: authority.packageVersion,
      plugin_id: authority.pluginId,
      source_commit: authority.expectedCommit,
      source_remote_ref: authority.remoteRef,
      source_root: authority.sourceRoot,
      file_count: legacy.payload.files.length,
      payload_sha256: payloadSha256,
    }, null, 2)}\n`);
    return;
  }
  const payload = buildPayload(authority, snapshot);
  assertSchemaPayload(
    CANONICAL_PAYLOAD_SCHEMA,
    payload,
    'Generated package payload manifest',
  );
  const source = `${JSON.stringify(payload, null, 2)}\n`;
  const result = applyPayload(options, authority, source);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    output: authority.output,
    package_id: authority.packageId,
    package_version: authority.packageVersion,
    plugin_id: authority.pluginId,
    source_commit: authority.expectedCommit,
    source_remote_ref: authority.remoteRef,
    source_root: authority.sourceRoot,
    file_count: payload.files.length,
    payload_sha256: result.payloadSha256,
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
