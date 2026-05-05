import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SHARED_OWNER_RELEASE_CONTRACT_PATH = 'contracts/family-release/shared-owner-release.json';

const PYTHON_DEPENDENCY_PATTERN = /opl-harness-shared @ git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared/g;
const PYTHON_LOCK_PATTERN = /https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git\?subdirectory=python%2Fopl-harness-shared&rev=([0-9a-f]{40})(#[0-9a-f]{40})?/g;
const JS_GIT_PATTERN = /git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git#([0-9a-f]{40})/g;
const CONTRACT_PYTHON_PACKAGE_PATTERN = /git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared/g;
const CONTRACT_JS_PACKAGE_PATTERN = /git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git#([0-9a-f]{40})/g;
const SHARED_PYTHON_GIT_LOCATOR_PATTERN = /^git\+(.+)@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared$/;
const SHARED_JS_GIT_LOCATOR_PATTERN = /^git\+(.+)#([0-9a-f]{40})$/;

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  for (const consumer of contract.consumers) {
    if (typeof consumer.verify_command !== 'string' || consumer.verify_command.trim() === '') {
      throw new Error(`shared owner release contract consumer is missing verify_command: ${consumer.repo_id}`);
    }
  }
  return contract;
}

function requireOwnerCommit(ownerCommit, context = 'owner_commit') {
  const normalizedCommit = String(ownerCommit ?? '').trim();
  if (!/^[0-9a-f]{40}$/.test(normalizedCommit)) {
    throw new Error(`invalid ${context}: ${ownerCommit}`);
  }
  return normalizedCommit;
}

export function parseSharedPackageLocator(locator, context = 'shared package locator') {
  const normalizedLocator = String(locator ?? '').trim();
  let match = normalizedLocator.match(SHARED_PYTHON_GIT_LOCATOR_PATTERN);
  if (match) {
    return {
      remote_url: match[1],
      owner_commit: requireOwnerCommit(match[2], `${context} owner commit`),
      package_kind: 'python',
    };
  }
  match = normalizedLocator.match(SHARED_JS_GIT_LOCATOR_PATTERN);
  if (match) {
    return {
      remote_url: match[1],
      owner_commit: requireOwnerCommit(match[2], `${context} owner commit`),
      package_kind: 'js',
    };
  }
  throw new Error(`unsupported ${context}: ${locator}`);
}

export function collectSharedOwnerReleaseRemotes({
  contract,
  ownerCommit = contract?.owner_commit,
} = {}) {
  const expectedOwnerCommit = requireOwnerCommit(ownerCommit, 'owner_commit');
  const locators = [
    contract?.packages?.python?.git_locator,
    contract?.packages?.js?.git_locator,
  ].filter((value) => typeof value === 'string' && value.trim() !== '');
  if (locators.length === 0) {
    throw new Error('shared owner release contract must declare at least one package git locator');
  }
  return unique(locators.map((locator, index) => {
    const parsed = parseSharedPackageLocator(locator, `contract.packages[${index}]`);
    if (parsed.owner_commit !== expectedOwnerCommit) {
      throw new Error(
        `shared owner release contract package locator is not pinned to owner_commit ${expectedOwnerCommit}: ${locator}`,
      );
    }
    return parsed.remote_url;
  }));
}

function formatExecError(error) {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const stderr = typeof error.stderr === 'string'
    ? error.stderr.trim()
    : Buffer.isBuffer(error.stderr)
    ? error.stderr.toString('utf8').trim()
    : '';
  if (stderr) {
    return stderr;
  }
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  return message;
}

function assertRemoteOwnerCommitReachable({
  remoteUrl,
  ownerCommit,
}) {
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-release-remote-probe-'));
  try {
    execFileSync('git', ['init', '--bare'], {
      cwd: probeRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync(
      'git',
      ['-C', probeRoot, 'fetch', '--force', '--update-head-ok', remoteUrl, `+${ownerCommit}:refs/commit/${ownerCommit}`],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const detail = formatExecError(error);
    throw new Error(
      `owner commit ${ownerCommit} is not reachable from shared package remote ${remoteUrl}; push the owner repo first before release${detail ? ` (${detail})` : ''}`,
    );
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true });
  }
}

export function assertPublishedOwnerCommitReachable({
  contract,
  ownerCommit = contract?.owner_commit,
} = {}) {
  const expectedOwnerCommit = requireOwnerCommit(ownerCommit, 'owner_commit');
  const remotes = collectSharedOwnerReleaseRemotes({
    contract,
    ownerCommit: expectedOwnerCommit,
  });
  for (const remoteUrl of remotes) {
    assertRemoteOwnerCommitReachable({
      remoteUrl,
      ownerCommit: expectedOwnerCommit,
    });
  }
}

function rewriteContractPackageLocator(locator, ownerCommit) {
  if (typeof locator !== 'string') {
    return locator;
  }
  const parsed = parseSharedPackageLocator(locator);
  if (parsed.package_kind === 'python') {
    return `git+${parsed.remote_url}@${ownerCommit}#subdirectory=python/opl-harness-shared`;
  }
  if (parsed.package_kind === 'js') {
    return `git+${parsed.remote_url}#${ownerCommit}`;
  }
  return locator;
}

export function rewriteSharedOwnerReleaseContract(contract, ownerCommit) {
  const nextOwnerCommit = requireOwnerCommit(ownerCommit);
  const nextContract = JSON.parse(JSON.stringify(contract));
  nextContract.owner_commit = nextOwnerCommit;
  if (nextContract.packages?.python?.git_locator) {
    nextContract.packages.python.git_locator = rewriteContractPackageLocator(
      nextContract.packages.python.git_locator,
      nextOwnerCommit,
    );
  }
  if (nextContract.packages?.js?.git_locator) {
    nextContract.packages.js.git_locator = rewriteContractPackageLocator(
      nextContract.packages.js.git_locator,
      nextOwnerCommit,
    );
  }
  return nextContract;
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
      verify_command: consumer.verify_command,
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
    verify_command: consumer.verify_command,
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
    if (repo.verify_command) {
      lines.push(`  verify: ${repo.verify_command}`);
    }
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

function formatRelease(result) {
  return [
    `released owner commit: ${result.owner_commit}`,
    `updated contract: ${result.contract_path}`,
  ].join('\n');
}

function resolveOwnerCommitForRelease({
  repoRoot,
  ownerCommit,
}) {
  if (ownerCommit) {
    return requireOwnerCommit(ownerCommit, 'owner_commit');
  }
  try {
    return requireOwnerCommit(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim(),
      'git HEAD',
    );
  } catch {
    throw new Error('unable to resolve owner commit from git; pass --owner-commit <40-hex-sha>');
  }
}

export function releaseFamilySharedPins({
  repoRoot = repoRootFromImportMeta(),
  familyRoot = resolveDefaultFamilyRoot({ repoRoot }),
  repoOverrides = [],
  ownerCommit,
  validatePublishedOwnerCommit = assertPublishedOwnerCommitReachable,
} = {}) {
  const contractPath = path.join(repoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH);
  const nextOwnerCommit = resolveOwnerCommitForRelease({ repoRoot, ownerCommit });
  const nextContract = rewriteSharedOwnerReleaseContract(
    loadSharedOwnerReleaseContract({ repoRoot }),
    nextOwnerCommit,
  );
  validatePublishedOwnerCommit({
    contract: nextContract,
    ownerCommit: nextOwnerCommit,
  });
  writeJson(contractPath, nextContract);
  const syncResults = syncFamilySharedPins({
    contract: nextContract,
    familyRoot,
    repoOverrides,
  });
  const summary = inspectFamilySharedPins({
    contract: nextContract,
    familyRoot,
    repoOverrides,
  });
  return {
    owner_commit: nextOwnerCommit,
    contract_path: contractPath,
    sync_results: syncResults,
    summary,
  };
}

function parseArgs(argv, { repoRoot = repoRootFromImportMeta() } = {}) {
  const [command, ...rest] = argv;
  const repoOverrides = [];
  let familyRoot;
  let ownerCommit;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--family-root') {
      familyRoot = path.resolve(rest[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--owner-commit') {
      ownerCommit = rest[index + 1];
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
    ownerCommit,
    repoOverrides,
  };
}

export function runFamilySharedReleaseCli(
  argv,
  {
    repoRoot = repoRootFromImportMeta(),
    validatePublishedOwnerCommit = assertPublishedOwnerCommitReachable,
  } = {},
) {
  const parsed = parseArgs(argv, { repoRoot });
  const contract = loadSharedOwnerReleaseContract({ repoRoot });
  if (parsed.command === 'check') {
    validatePublishedOwnerCommit({
      contract,
      ownerCommit: contract.owner_commit,
    });
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
  if (parsed.command === 'release') {
    const releaseResult = releaseFamilySharedPins({
      repoRoot,
      familyRoot: parsed.familyRoot,
      repoOverrides: parsed.repoOverrides,
      ownerCommit: parsed.ownerCommit,
      validatePublishedOwnerCommit,
    });
    return {
      exit_code: releaseResult.summary.ok ? 0 : 1,
      stdout: [
        formatRelease(releaseResult),
        formatSync(releaseResult.sync_results),
        formatInspection(releaseResult.summary),
      ].join('\n').trim(),
    };
  }
  throw new Error('usage: node scripts/family-shared-release.mjs <check|sync|release> [--family-root <path>] [--owner-commit <40-hex-sha>] [--repo <repo_id>=<path>]');
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
