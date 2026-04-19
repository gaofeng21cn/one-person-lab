import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SHARED_OWNER_RELEASE_CONTRACT_PATH = 'contracts/family-release/shared-owner-release.json';

const PYTHON_DEPENDENCY_PATTERN = /opl-harness-shared @ git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared/g;
const PYTHON_LOCK_PATTERN = /https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git\?subdirectory=python%2Fopl-harness-shared&rev=([0-9a-f]{40})(#[0-9a-f]{40})?/g;
const JS_GIT_PATTERN = /git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git#([0-9a-f]{40})/g;

function repoRootFromImportMeta() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveCanonicalRepoRoot({ repoRoot = repoRootFromImportMeta() } = {}) {
  try {
    const gitCommonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    ).trim();
    return path.resolve(gitCommonDir, '..');
  } catch {
    return repoRoot;
  }
}

export function resolveDefaultFamilyRoot({ repoRoot = repoRootFromImportMeta() } = {}) {
  return path.resolve(resolveCanonicalRepoRoot({ repoRoot }), '..');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return [...new Set(values)];
}

export function loadSharedOwnerReleaseContract({ repoRoot = repoRootFromImportMeta() } = {}) {
  const contractPath = path.join(repoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH);
  const contract = readJson(contractPath);
  if (typeof contract.owner_commit !== 'string' || !/^[0-9a-f]{40}$/.test(contract.owner_commit)) {
    throw new Error(`shared owner release contract has invalid owner_commit: ${contract.owner_commit}`);
  }
  if (!Array.isArray(contract.consumers) || contract.consumers.length === 0) {
    throw new Error('shared owner release contract must declare at least one consumer');
  }
  return contract;
}

export function extractTrackedPins(text, kind) {
  if (kind === 'python_dependency') {
    return unique([...text.matchAll(PYTHON_DEPENDENCY_PATTERN)].map((match) => match[1]));
  }
  if (kind === 'python_lock') {
    return unique(
      [...text.matchAll(PYTHON_LOCK_PATTERN)].flatMap((match) => (
        [match[1], match[2]?.slice(1)].filter(Boolean)
      )),
    );
  }
  if (kind === 'js_dependency' || kind === 'js_lock') {
    return unique([...text.matchAll(JS_GIT_PATTERN)].map((match) => match[1]));
  }
  throw new Error(`unsupported shared pin kind: ${kind}`);
}

export function rewriteTrackedPins(text, kind, ownerCommit) {
  let replacementCount = 0;
  let nextText = text;

  if (kind === 'python_dependency') {
    nextText = text.replace(PYTHON_DEPENDENCY_PATTERN, () => {
      replacementCount += 1;
      return `opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${ownerCommit}#subdirectory=python/opl-harness-shared`;
    });
    return { text: nextText, replacement_count: replacementCount };
  }

  if (kind === 'python_lock') {
    nextText = text.replace(PYTHON_LOCK_PATTERN, (_match, _rev, hashSuffix) => {
      replacementCount += 1;
      return `https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${ownerCommit}${hashSuffix ? `#${ownerCommit}` : ''}`;
    });
    return { text: nextText, replacement_count: replacementCount };
  }

  if (kind === 'js_dependency' || kind === 'js_lock') {
    nextText = text.replace(JS_GIT_PATTERN, () => {
      replacementCount += 1;
      return `git+https://github.com/gaofeng21cn/one-person-lab.git#${ownerCommit}`;
    });
    return { text: nextText, replacement_count: replacementCount };
  }

  throw new Error(`unsupported shared pin kind: ${kind}`);
}

function resolveOverrides(repoOverrides = []) {
  const mapping = new Map();
  for (const override of repoOverrides) {
    const [repoId, repoPath] = String(override).split('=');
    if (!repoId || !repoPath) {
      throw new Error(`invalid --repo override: ${override}`);
    }
    mapping.set(repoId, path.resolve(repoPath));
  }
  return mapping;
}

export function resolveConsumerRepoPath({
  familyRoot,
  consumer,
  overrides = new Map(),
}) {
  const override = overrides.get(consumer.repo_id);
  if (override) {
    return override;
  }
  return path.resolve(familyRoot, consumer.repo_dir);
}

export function inspectConsumerRepo({
  consumer,
  repoPath,
  contract,
}) {
  const findings = [];
  const expectedCommit = contract.owner_commit;
  if (!fs.existsSync(repoPath)) {
    return {
      repo_id: consumer.repo_id,
      repo_path: repoPath,
      status: 'missing_repo',
      findings: [{
        file: null,
        kind: 'repo',
        status: 'missing_repo',
        pins: [],
      }],
    };
  }

  for (const target of consumer.targets) {
    const filePath = path.join(repoPath, target.file);
    if (!fs.existsSync(filePath)) {
      findings.push({
        file: target.file,
        kind: target.kind,
        status: 'missing_file',
        pins: [],
      });
      continue;
    }
    const pins = extractTrackedPins(fs.readFileSync(filePath, 'utf8'), target.kind);
    let status = 'aligned';
    if (pins.length === 0) {
      status = 'pin_not_found';
    } else if (pins.some((entry) => entry !== expectedCommit)) {
      status = 'stale_pin';
    }
    findings.push({
      file: target.file,
      kind: target.kind,
      status,
      pins,
    });
  }

  const statuses = new Set(findings.map((entry) => entry.status));
  const overallStatus = statuses.has('stale_pin') || statuses.has('pin_not_found') || statuses.has('missing_file')
    ? 'stale'
    : 'aligned';

  return {
    repo_id: consumer.repo_id,
    repo_path: repoPath,
    status: overallStatus,
    findings,
  };
}

export function inspectFamilySharedPins({
  contract,
  familyRoot,
  repoOverrides = [],
}) {
  const overrides = resolveOverrides(repoOverrides);
  const repos = contract.consumers.map((consumer) => inspectConsumerRepo({
    consumer,
    repoPath: resolveConsumerRepoPath({
      familyRoot,
      consumer,
      overrides,
    }),
    contract,
  }));
  return {
    owner_commit: contract.owner_commit,
    repos,
    ok: repos.every((repo) => repo.status === 'aligned'),
  };
}

export function syncConsumerRepo({
  consumer,
  repoPath,
  contract,
}) {
  const changedFiles = [];
  for (const target of consumer.targets) {
    const filePath = path.join(repoPath, target.file);
    const originalText = fs.readFileSync(filePath, 'utf8');
    const rewritten = rewriteTrackedPins(originalText, target.kind, contract.owner_commit);
    if (rewritten.replacement_count === 0) {
      throw new Error(`${consumer.repo_id}:${target.file} does not contain a tracked shared pin`);
    }
    if (rewritten.text !== originalText) {
      fs.writeFileSync(filePath, rewritten.text, 'utf8');
      changedFiles.push(target.file);
    }
  }
  return {
    repo_id: consumer.repo_id,
    repo_path: repoPath,
    changed_files: changedFiles,
  };
}

export function syncFamilySharedPins({
  contract,
  familyRoot,
  repoOverrides = [],
}) {
  const overrides = resolveOverrides(repoOverrides);
  return contract.consumers.map((consumer) => syncConsumerRepo({
    consumer,
    repoPath: resolveConsumerRepoPath({
      familyRoot,
      consumer,
      overrides,
    }),
    contract,
  }));
}

function formatInspection(summary) {
  const lines = [
    `family shared owner commit: ${summary.owner_commit}`,
  ];
  for (const repo of summary.repos) {
    lines.push(`[${repo.repo_id}] ${repo.status} ${repo.repo_path}`);
    for (const finding of repo.findings) {
      const fileLabel = finding.file ?? '(repo)';
      const pins = finding.pins.length > 0 ? finding.pins.join(', ') : 'none';
      lines.push(`  - ${fileLabel}: ${finding.status} [${pins}]`);
    }
  }
  return lines.join('\n');
}

function formatSync(results) {
  const lines = [];
  for (const result of results) {
    lines.push(`[${result.repo_id}] synced ${result.repo_path}`);
    if (result.changed_files.length === 0) {
      lines.push('  - no file content changed');
      continue;
    }
    for (const relativePath of result.changed_files) {
      lines.push(`  - ${relativePath}`);
    }
  }
  return lines.join('\n');
}

function parseArgs(argv, { repoRoot = repoRootFromImportMeta() } = {}) {
  const [command, ...rest] = argv;
  const repoOverrides = [];
  let familyRoot;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--family-root') {
      familyRoot = path.resolve(rest[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--repo') {
      repoOverrides.push(rest[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  return {
    command: command ?? 'check',
    familyRoot: familyRoot ?? resolveDefaultFamilyRoot({ repoRoot }),
    repoOverrides,
  };
}

export function runFamilySharedReleaseCli(argv, { repoRoot = repoRootFromImportMeta() } = {}) {
  const parsed = parseArgs(argv, { repoRoot });
  const contract = loadSharedOwnerReleaseContract({ repoRoot });
  if (parsed.command === 'check') {
    const summary = inspectFamilySharedPins({
      contract,
      familyRoot: parsed.familyRoot,
      repoOverrides: parsed.repoOverrides,
    });
    return {
      exit_code: summary.ok ? 0 : 1,
      stdout: formatInspection(summary),
    };
  }
  if (parsed.command === 'sync') {
    const syncResults = syncFamilySharedPins({
      contract,
      familyRoot: parsed.familyRoot,
      repoOverrides: parsed.repoOverrides,
    });
    const summary = inspectFamilySharedPins({
      contract,
      familyRoot: parsed.familyRoot,
      repoOverrides: parsed.repoOverrides,
    });
    return {
      exit_code: summary.ok ? 0 : 1,
      stdout: `${formatSync(syncResults)}\n${formatInspection(summary)}`.trim(),
    };
  }
  throw new Error('usage: node scripts/family-shared-release.mjs <check|sync> [--family-root <path>] [--repo <repo_id>=<path>]');
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  try {
    const result = runFamilySharedReleaseCli(process.argv.slice(2));
    if (result.stdout) {
      process.stdout.write(`${result.stdout}\n`);
    }
    process.exit(result.exit_code);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
