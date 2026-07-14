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
      repo: { type: 'string' },
      'source-commit': { type: 'string' },
      check: { type: 'boolean', default: false },
    },
  });
  const required = ['manifest', 'allowlist', 'repo', 'source-commit'];
  const missing = required.filter((name) => typeof values[name] !== 'string' || !values[name].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required options: ${missing.map((name) => `--${name}`).join(', ')}`);
  }
  return {
    manifest: path.resolve(values.manifest.trim()),
    allowlist: path.resolve(values.allowlist.trim()),
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
  let contentLockDigest = null;
  if (manifest.content_lock !== undefined) {
    const contentLock = requireObject(manifest.content_lock, 'Framework package content_lock');
    if (contentLock.algorithm !== 'sha256'
      || contentLock.canonicalization !== 'ordered_path_nul_file_bytes'
      || typeof contentLock.digest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(contentLock.digest)) {
      throw new Error('Framework package content_lock must use sha256 ordered_path_nul_file_bytes canonicalization');
    }
    if (!Array.isArray(contentLock.paths)
      || contentLock.paths.length !== paths.length
      || contentLock.paths.some((candidate, index) => candidate !== paths[index])) {
      throw new Error('Framework package content_lock paths do not match the payload allowlist');
    }
    contentLockDigest = contentLock.digest;
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

  return {
    packageId,
    packageVersion,
    pluginId,
    sourceRepoUrl,
    githubRepository,
    sourceRoot,
    paths,
    contentLockDigest,
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
    if (type !== 'blob' || mode !== '100644') {
      throw new Error(`Unsupported carrier tree entry at ${treePath}: mode=${mode} type=${type}; only 100644 blobs are allowed`);
    }
    entries.set(relativePath, { objectId, relativePath, treePath });
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

function buildPayload(options, authority) {
  assertRepositoryBinding(options.repo, authority.sourceRepoUrl);
  assertExactCommit(options.repo, options.sourceCommit);
  assertSourceTree(options.repo, options.sourceCommit, authority.sourceRoot);
  const entries = allowlistedTreeEntries(
    options.repo,
    options.sourceCommit,
    authority.sourceRoot,
    authority.paths,
  );
  const blobs = new Map(entries.map((entry) => [
    entry.relativePath,
    gitBytes(options.repo, ['cat-file', 'blob', entry.objectId], `Cannot read carrier blob ${entry.objectId}`),
  ]));
  if (authority.contentLockDigest) {
    const contentLock = crypto.createHash('sha256');
    for (const relativePath of authority.paths) {
      contentLock.update(relativePath, 'utf8');
      contentLock.update('\0');
      contentLock.update(blobs.get(relativePath));
    }
    const actualContentLockDigest = `sha256:${contentLock.digest('hex')}`;
    if (actualContentLockDigest !== authority.contentLockDigest) {
      throw new Error(`Exact commit does not match Framework package content_lock: expected=${authority.contentLockDigest} actual=${actualContentLockDigest}`);
    }
  }
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

  return {
    surface_kind: 'opl_package_payload_manifest.v1',
    schema_ref: 'contracts/opl-framework/package-payload-manifest.schema.json',
    package_id: authority.packageId,
    package_version: authority.packageVersion,
    source_repo: authority.sourceRepoUrl,
    source_commit: options.sourceCommit,
    source_root: authority.sourceRoot,
    files: entries.map((entry) => {
      const bytes = blobs.get(entry.relativePath);
      return {
        path: entry.relativePath,
        source_url: rawSourceUrl(authority.githubRepository, options.sourceCommit, entry.treePath),
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
      return 'created';
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
      assertExpectedBytes(filePath, expected, expectedDigest, 'Immutable payload manifest conflict');
      return 'unchanged';
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
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
  const payload = buildPayload(options, authority);
  assertSchemaPayload(
    'contracts/opl-framework/package-payload-manifest.schema.json',
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
    source_commit: options.sourceCommit,
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
