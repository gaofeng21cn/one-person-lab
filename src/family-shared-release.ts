import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SHARED_OWNER_RELEASE_CONTRACT_PATH = 'contracts/family-release/shared-owner-release.json';

const PYTHON_DEPENDENCY_PATTERN = /opl-harness-shared @ git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git@([0-9a-f]{40})#subdirectory=python\/opl-harness-shared/g;
const PYTHON_LOCK_PATTERN = /https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git\?subdirectory=python%2Fopl-harness-shared&rev=([0-9a-f]{40})(#[0-9a-f]{40})?/g;
const JS_GIT_PATTERN = /git\+https:\/\/github\.com\/gaofeng21cn\/one-person-lab\.git#([0-9a-f]{40})/g;

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
  packages?: Record<string, unknown>;
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

function unique(values: string[]) {
  return [...new Set(values)];
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
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as FamilySharedOwnerReleaseContract;
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
