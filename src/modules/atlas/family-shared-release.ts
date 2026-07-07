import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';

export const SHARED_OWNER_RELEASE_CONTRACT_PATH = 'contracts/family-release/shared-owner-release.json';

const PYTHON_DEPENDENCY_PATTERN = /opl-harness-shared @ git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared/g;
const PYTHON_LOCK_PATTERN = /https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git\?subdirectory=python%2Fopl-harness-shared&rev=([0-9a-f]{40})(#[0-9a-f]{40})?/g;
const JS_GIT_PATTERN = /git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git#([0-9a-f]{40})/g;
const SHARED_PYTHON_GIT_LOCATOR_PATTERN = /^git\+(.+)@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared$/;
const SHARED_JS_GIT_LOCATOR_PATTERN = /^git\+(.+)#([0-9a-f]{40})$/;

export type FamilySharedPinKind = 'python_dependency' | 'python_lock' | 'js_dependency' | 'js_lock';

export interface FamilySharedReleaseTarget {
  file: string;
  kind: FamilySharedPinKind;
}

export interface FamilySharedReleaseConsumer {
  repo_id: string;
  repo_dir: string;
  verify_command: string;
  targets: FamilySharedReleaseTarget[];
}

export interface FamilySharedOwnerReleaseContract {
  contract_kind: string;
  owner_repo: string;
  owner_commit: string;
  consumers: FamilySharedReleaseConsumer[];
  packages: {
    python?: { git_locator?: string; [key: string]: unknown };
    js?: { git_locator?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
}

export interface FamilySharedReleaseFinding {
  file: string | null;
  kind: FamilySharedPinKind | 'repo';
  status: 'aligned' | 'missing_file' | 'missing_repo' | 'pin_not_found' | 'stale_pin';
  pins: string[];
}

export interface FamilySharedReleaseInspection {
  repo_id: string;
  repo_root: string;
  owner_commit: string;
  verify_command: string | null;
  status: 'aligned' | 'missing_consumer' | 'missing_repo' | 'stale';
  findings: FamilySharedReleaseFinding[];
}

export interface FamilySharedReleaseRepoInspection {
  repo_id: string;
  repo_path: string;
  verify_command: string | null;
  status: FamilySharedReleaseInspection['status'];
  findings: FamilySharedReleaseFinding[];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function cloneJsonPayload<T>(value: T): T {
  return structuredClone(value);
}

export function resolveCanonicalRepoRoot({ repoRoot = process.cwd() }: { repoRoot?: string } = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  try {
    const gitCommonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      {
        cwd: resolvedRepoRoot,
        encoding: 'utf8',
      },
    ).trim();
    return path.resolve(gitCommonDir, '..');
  } catch {
    return resolvedRepoRoot;
  }
}

export function resolveDefaultFamilyRoot({ repoRoot = process.cwd() }: { repoRoot?: string } = {}) {
  return path.resolve(resolveCanonicalRepoRoot({ repoRoot }), '..');
}

export function resolveOwnerRepoRoot({
  repoRoot = process.cwd(),
  ownerRepoRoot,
  ownerRepo = 'one-person-lab',
}: {
  repoRoot?: string;
  ownerRepoRoot?: string;
  ownerRepo?: string;
} = {}) {
  if (ownerRepoRoot) {
    return path.resolve(ownerRepoRoot);
  }
  return path.join(resolveDefaultFamilyRoot({ repoRoot }), ownerRepo);
}

export function loadSharedOwnerReleaseContract({
  repoRoot = process.cwd(),
  ownerRepoRoot,
  ownerRepo = 'one-person-lab',
}: {
  repoRoot?: string;
  ownerRepoRoot?: string;
  ownerRepo?: string;
} = {}) {
  const resolvedOwnerRepoRoot = resolveOwnerRepoRoot({ repoRoot, ownerRepoRoot, ownerRepo });
  const contractPath = path.join(resolvedOwnerRepoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH);
  const contract = readJsonPayloadFile(contractPath) as FamilySharedOwnerReleaseContract;
  if (!/^[0-9a-f]{40}$/.test(contract.owner_commit)) {
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

function requireOwnerCommit(ownerCommit: unknown, context = 'owner_commit') {
  const normalizedCommit = String(ownerCommit ?? '').trim();
  if (!/^[0-9a-f]{40}$/.test(normalizedCommit)) {
    throw new Error(`invalid ${context}: ${ownerCommit}`);
  }
  return normalizedCommit;
}

export function parseSharedPackageLocator(locator: unknown, context = 'shared package locator') {
  const normalizedLocator = String(locator ?? '').trim();
  let match = normalizedLocator.match(SHARED_PYTHON_GIT_LOCATOR_PATTERN);
  if (match) {
    return {
      remote_url: match[1],
      owner_commit: requireOwnerCommit(match[2], `${context} owner commit`),
      package_kind: 'python' as const,
    };
  }
  match = normalizedLocator.match(SHARED_JS_GIT_LOCATOR_PATTERN);
  if (match) {
    return {
      remote_url: match[1],
      owner_commit: requireOwnerCommit(match[2], `${context} owner commit`),
      package_kind: 'js' as const,
    };
  }
  throw new Error(`unsupported ${context}: ${locator}`);
}

function packageRecord(value: unknown): { git_locator?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as { git_locator?: unknown }
    : {};
}

export function collectSharedOwnerReleaseRemotes({
  contract,
  ownerCommit = contract?.owner_commit,
}: {
  contract?: FamilySharedOwnerReleaseContract;
  ownerCommit?: string;
} = {}) {
  const expectedOwnerCommit = requireOwnerCommit(ownerCommit, 'owner_commit');
  const packages = contract?.packages ?? {};
  const locators = [
    packageRecord(packages.python).git_locator,
    packageRecord(packages.js).git_locator,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '');
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

function formatExecError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const stderr = 'stderr' in error ? (error as { stderr?: unknown }).stderr : null;
  if (typeof stderr === 'string' && stderr.trim()) {
    return stderr.trim();
  }
  if (Buffer.isBuffer(stderr)) {
    return stderr.toString('utf8').trim();
  }
  return error instanceof Error ? error.message.trim() : '';
}

function assertRemoteOwnerCommitReachable({
  remoteUrl,
  ownerCommit,
}: {
  remoteUrl: string;
  ownerCommit: string;
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
}: {
  contract?: FamilySharedOwnerReleaseContract;
  ownerCommit?: string;
} = {}) {
  const expectedOwnerCommit = requireOwnerCommit(ownerCommit, 'owner_commit');
  for (const remoteUrl of collectSharedOwnerReleaseRemotes({ contract, ownerCommit: expectedOwnerCommit })) {
    assertRemoteOwnerCommitReachable({ remoteUrl, ownerCommit: expectedOwnerCommit });
  }
}

function rewriteContractPackageLocator(locator: unknown, ownerCommit: string) {
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

export function rewriteSharedOwnerReleaseContract(contract: FamilySharedOwnerReleaseContract, ownerCommit: string) {
  const nextOwnerCommit = requireOwnerCommit(ownerCommit);
  const nextContract = cloneJsonPayload(contract);
  nextContract.owner_commit = nextOwnerCommit;
  const packages = nextContract.packages as Record<string, { git_locator?: unknown } | undefined> | undefined;
  if (packages?.python?.git_locator) {
    packages.python.git_locator = rewriteContractPackageLocator(packages.python.git_locator, nextOwnerCommit);
  }
  if (packages?.js?.git_locator) {
    packages.js.git_locator = rewriteContractPackageLocator(packages.js.git_locator, nextOwnerCommit);
  }
  return nextContract;
}

export function extractTrackedPins(text: string, kind: FamilySharedPinKind) {
  if (kind === 'python_dependency') {
    return unique([...text.matchAll(PYTHON_DEPENDENCY_PATTERN)].map((match) => match[1] ?? ''));
  }
  if (kind === 'python_lock') {
    return unique(
      [...text.matchAll(PYTHON_LOCK_PATTERN)].flatMap((match) => [match[1], match[2]?.slice(1)].filter(Boolean) as string[]),
    );
  }
  if (kind === 'js_dependency' || kind === 'js_lock') {
    return unique([...text.matchAll(JS_GIT_PATTERN)].map((match) => match[1] ?? ''));
  }
  return [];
}

export function rewriteTrackedPins(text: string, kind: FamilySharedPinKind, ownerCommit: string) {
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

export function inspectFamilySharedConsumerAlignment({
  contract,
  consumerRepoId,
  repoRoot,
}: {
  contract: FamilySharedOwnerReleaseContract;
  consumerRepoId: string;
  repoRoot: string;
}): FamilySharedReleaseInspection {
  const consumer = contract.consumers.find((entry) => entry.repo_id === consumerRepoId);
  const resolvedRepoRoot = path.resolve(repoRoot);
  if (!consumer) {
    return {
      repo_id: consumerRepoId,
      repo_root: resolvedRepoRoot,
      owner_commit: contract.owner_commit,
      verify_command: null,
      status: 'missing_consumer',
      findings: [],
    };
  }
  if (!fs.existsSync(resolvedRepoRoot)) {
    return {
      repo_id: consumerRepoId,
      repo_root: resolvedRepoRoot,
      owner_commit: contract.owner_commit,
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

  const findings = consumer.targets.map((target) => {
    const filePath = path.join(resolvedRepoRoot, target.file);
    if (!fs.existsSync(filePath)) {
      return {
        file: target.file,
        kind: target.kind,
        status: 'missing_file' as const,
        pins: [],
      };
    }
    const pins = extractTrackedPins(fs.readFileSync(filePath, 'utf8'), target.kind);
    if (pins.length === 0) {
      return {
        file: target.file,
        kind: target.kind,
        status: 'pin_not_found' as const,
        pins,
      };
    }
    if (pins.some((entry) => entry !== contract.owner_commit)) {
      return {
        file: target.file,
        kind: target.kind,
        status: 'stale_pin' as const,
        pins,
      };
    }
    return {
      file: target.file,
      kind: target.kind,
      status: 'aligned' as const,
      pins,
    };
  });

  const status = findings.every((entry) => entry.status === 'aligned') ? 'aligned' : 'stale';
  return {
    repo_id: consumerRepoId,
    repo_root: resolvedRepoRoot,
    owner_commit: contract.owner_commit,
    verify_command: consumer.verify_command,
    status,
    findings,
  };
}

function resolveOverrides(repoOverrides: string[] = []) {
  const mapping = new Map<string, string>();
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
  overrides = new Map<string, string>(),
}: {
  familyRoot: string;
  consumer: FamilySharedReleaseConsumer;
  overrides?: Map<string, string>;
}) {
  return overrides.get(consumer.repo_id) ?? path.resolve(familyRoot, consumer.repo_dir);
}

export function inspectConsumerRepo({
  consumer,
  repoPath,
  contract,
}: {
  consumer: FamilySharedReleaseConsumer;
  repoPath: string;
  contract: FamilySharedOwnerReleaseContract;
}): FamilySharedReleaseRepoInspection {
  const inspection = inspectFamilySharedConsumerAlignment({
    contract,
    consumerRepoId: consumer.repo_id,
    repoRoot: repoPath,
  });
  return {
    repo_id: inspection.repo_id,
    repo_path: inspection.repo_root,
    verify_command: inspection.verify_command,
    status: inspection.status,
    findings: inspection.findings,
  };
}

export function inspectFamilySharedPins({
  contract,
  familyRoot,
  repoOverrides = [],
}: {
  contract: FamilySharedOwnerReleaseContract;
  familyRoot: string;
  repoOverrides?: string[];
}) {
  const overrides = resolveOverrides(repoOverrides);
  const repos = contract.consumers.map((consumer) => inspectConsumerRepo({
    consumer,
    repoPath: resolveConsumerRepoPath({ familyRoot, consumer, overrides }),
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
}: {
  consumer: FamilySharedReleaseConsumer;
  repoPath: string;
  contract: FamilySharedOwnerReleaseContract;
}) {
  const changedFiles: string[] = [];
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
}: {
  contract: FamilySharedOwnerReleaseContract;
  familyRoot: string;
  repoOverrides?: string[];
}) {
  const overrides = resolveOverrides(repoOverrides);
  return contract.consumers.map((consumer) => syncConsumerRepo({
    consumer,
    repoPath: resolveConsumerRepoPath({ familyRoot, consumer, overrides }),
    contract,
  }));
}

function resolveOwnerCommitForRelease({
  repoRoot,
  ownerCommit,
}: {
  repoRoot: string;
  ownerCommit?: string;
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
  repoRoot = process.cwd(),
  familyRoot = resolveDefaultFamilyRoot({ repoRoot }),
  repoOverrides = [],
  ownerCommit,
  validatePublishedOwnerCommit = assertPublishedOwnerCommitReachable,
}: {
  repoRoot?: string;
  familyRoot?: string;
  repoOverrides?: string[];
  ownerCommit?: string;
  validatePublishedOwnerCommit?: (input: {
    contract: FamilySharedOwnerReleaseContract;
    ownerCommit: string;
  }) => void;
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
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  writeJsonPayloadFile(contractPath, nextContract);
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

export function inspectCurrentRepoFamilySharedAlignment({
  repoRoot = process.cwd(),
  consumerRepoId,
  ownerRepoRoot,
  ownerRepo = 'one-person-lab',
}: {
  repoRoot?: string;
  consumerRepoId: string;
  ownerRepoRoot?: string;
  ownerRepo?: string;
}) {
  const contract = loadSharedOwnerReleaseContract({ repoRoot, ownerRepoRoot, ownerRepo });
  return inspectFamilySharedConsumerAlignment({
    contract,
    consumerRepoId,
    repoRoot,
  });
}
