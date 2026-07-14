#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const PACKAGE_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const GITHUB_REPO = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\.git$/;
const MAX_GIT_OUTPUT = 128 * 1024 * 1024;

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      'package-id': { type: 'string' },
      'package-version': { type: 'string' },
      repo: { type: 'string' },
      'source-repo-url': { type: 'string' },
      'source-commit': { type: 'string' },
      'source-root': { type: 'string' },
      output: { type: 'string' },
      check: { type: 'boolean', default: false },
    },
  });
  const required = ['package-id', 'package-version', 'repo', 'source-repo-url', 'source-commit', 'source-root', 'output'];
  const missing = required.filter((name) => typeof values[name] !== 'string' || !values[name].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required options: ${missing.map((name) => `--${name}`).join(', ')}`);
  }
  return {
    packageId: values['package-id'].trim(),
    packageVersion: values['package-version'].trim(),
    repo: path.resolve(values.repo),
    sourceRepoUrl: values['source-repo-url'].trim(),
    sourceCommit: values['source-commit'].trim(),
    sourceRoot: values['source-root'].trim(),
    output: path.resolve(values.output),
    check: values.check,
  };
}

function validateOptions(options) {
  if (!PACKAGE_ID.test(options.packageId)) {
    throw new Error(`Invalid canonical package id: ${options.packageId}`);
  }
  if (!SEMVER.test(options.packageVersion)) {
    throw new Error(`Package version must be SemVer: ${options.packageVersion}`);
  }
  if (!FULL_GIT_SHA.test(options.sourceCommit)) {
    throw new Error(`Source commit must be one exact lowercase 40-character Git SHA: ${options.sourceCommit}`);
  }
  if (!GITHUB_REPO.test(options.sourceRepoUrl)) {
    throw new Error(`Source repository URL must be canonical HTTPS GitHub form ending in .git: ${options.sourceRepoUrl}`);
  }
  const normalizedRoot = path.posix.normalize(options.sourceRoot);
  if (options.sourceRoot.includes('\\')
    || path.posix.isAbsolute(options.sourceRoot)
    || normalizedRoot !== options.sourceRoot
    || normalizedRoot === '..'
    || normalizedRoot.startsWith('../')) {
    throw new Error(`Source root must be a canonical relative POSIX path: ${options.sourceRoot}`);
  }
  if (path.extname(options.output) !== '.json') {
    throw new Error(`Payload output must be a .json file: ${options.output}`);
  }
}

function spawnGit(repo, args, encoding = null) {
  return spawnSync('git', ['-C', repo, ...args], {
    encoding,
    maxBuffer: MAX_GIT_OUTPUT,
    env: {
      ...process.env,
      GIT_NO_LAZY_FETCH: '1',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    },
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

function assertRepositoryRoot(repo) {
  if (!fs.existsSync(repo)) {
    throw new Error(`Git repository does not exist: ${repo}`);
  }
  const probe = spawnGit(repo, ['rev-parse', '--git-dir'], 'utf8');
  if (probe.status !== 0) {
    throw new Error(`Not a Git repository: ${repo}`);
  }
  const isBare = gitText(repo, ['rev-parse', '--is-bare-repository'], `Cannot inspect Git repository ${repo}`) === 'true';
  if (!isBare) {
    const topLevel = fs.realpathSync(
      path.resolve(gitText(repo, ['rev-parse', '--show-toplevel'], `Cannot resolve Git worktree root ${repo}`)),
    );
    if (topLevel !== fs.realpathSync(repo)) {
      throw new Error(`--repo must name the Git worktree root or a bare repository: ${repo}`);
    }
  }
}

function assertExactCommit(repo, commit) {
  const probe = spawnGit(repo, ['cat-file', '-e', `${commit}^{commit}`], 'utf8');
  if (probe.status !== 0) {
    throw new Error(`Source commit does not exist as a local Git commit object: ${commit}`);
  }
  const resolved = gitText(repo, ['rev-parse', '--verify', `${commit}^{commit}`], `Cannot resolve source commit ${commit}`);
  if (resolved !== commit) {
    throw new Error(`Source commit did not resolve to the requested exact object: requested=${commit} resolved=${resolved}`);
  }
}

function assertSourceTree(repo, commit, sourceRoot) {
  const treeish = sourceRoot === '.' ? `${commit}^{tree}` : `${commit}:${sourceRoot}`;
  const probe = spawnGit(repo, ['cat-file', '-t', treeish], 'utf8');
  if (probe.status !== 0) {
    throw new Error(`Source root does not exist at exact commit: ${commit}:${sourceRoot}`);
  }
  if (probe.stdout.trim() !== 'tree') {
    throw new Error(`Source root is not a Git tree at exact commit: ${commit}:${sourceRoot}`);
  }
}

function parseTreeEntries(source, sourceRoot) {
  const records = source.toString('utf8').split('\0').filter(Boolean);
  const prefix = sourceRoot === '.' ? '' : `${sourceRoot}/`;
  return records.map((record) => {
    const match = /^([0-9]{6}) ([a-z]+) ([0-9a-f]+)\t(.+)$/.exec(record);
    if (!match) {
      throw new Error(`Unexpected git ls-tree record: ${JSON.stringify(record)}`);
    }
    const [, mode, type, objectId, treePath] = match;
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
      throw new Error(`Unsupported carrier tree entry at ${treePath}: mode=${mode} type=${type}`);
    }
    if (prefix && !treePath.startsWith(prefix)) {
      throw new Error(`Carrier entry escaped source root ${sourceRoot}: ${treePath}`);
    }
    const relativePath = prefix ? treePath.slice(prefix.length) : treePath;
    if (!relativePath || relativePath.startsWith('../')) {
      throw new Error(`Invalid carrier payload path from Git tree: ${treePath}`);
    }
    return { objectId, relativePath, treePath };
  }).sort((left, right) => (left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0));
}

function rawSourceUrl(sourceRepoUrl, commit, treePath) {
  const match = GITHUB_REPO.exec(sourceRepoUrl);
  const encodedPath = treePath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${commit}/${encodedPath}`;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function buildPayload(options) {
  assertRepositoryRoot(options.repo);
  assertExactCommit(options.repo, options.sourceCommit);
  assertSourceTree(options.repo, options.sourceCommit, options.sourceRoot);
  const args = ['ls-tree', '-rz', '--full-tree', options.sourceCommit];
  if (options.sourceRoot !== '.') args.push('--', options.sourceRoot);
  const entries = parseTreeEntries(
    gitBytes(options.repo, args, `Cannot list carrier tree ${options.sourceCommit}:${options.sourceRoot}`),
    options.sourceRoot,
  );
  if (entries.length === 0) {
    throw new Error(`Source root has no regular carrier files at exact commit: ${options.sourceCommit}:${options.sourceRoot}`);
  }
  return {
    surface_kind: 'opl_agent_package_payload_manifest',
    package_id: options.packageId,
    package_version: options.packageVersion,
    source_repo: options.sourceRepoUrl,
    source_commit: options.sourceCommit,
    source_root: options.sourceRoot,
    files: entries.map((entry) => {
      const bytes = gitBytes(options.repo, ['cat-file', 'blob', entry.objectId], `Cannot read carrier blob ${entry.objectId}`);
      return {
        path: entry.relativePath,
        source_url: rawSourceUrl(options.sourceRepoUrl, options.sourceCommit, entry.treePath),
        sha256: `sha256:${sha256(bytes)}`,
      };
    }),
  };
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function applyPayload(options, source) {
  const expectedDigest = `sha256:${sha256(source)}`;
  if (options.check) {
    if (!fs.existsSync(options.output)) {
      throw new Error(`Tracked payload manifest is missing: ${options.output}`);
    }
    const actual = fs.readFileSync(options.output);
    if (!actual.equals(Buffer.from(source))) {
      throw new Error(
        `Tracked payload manifest drift detected: ${options.output} expected=${expectedDigest} actual=sha256:${sha256(actual)}`,
      );
    }
    return { status: 'checked', payloadSha256: expectedDigest };
  }
  atomicWrite(options.output, source);
  return { status: 'written', payloadSha256: expectedDigest };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  validateOptions(options);
  const payload = buildPayload(options);
  const source = `${JSON.stringify(payload, null, 2)}\n`;
  const result = applyPayload(options, source);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    output: options.output,
    package_id: options.packageId,
    package_version: options.packageVersion,
    source_commit: options.sourceCommit,
    source_root: options.sourceRoot,
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
