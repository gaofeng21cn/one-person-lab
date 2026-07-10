import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';

import {
  assertPublishedOwnerCommitReachable,
  inspectFamilySharedPins,
  loadSharedOwnerReleaseContract,
  releaseFamilySharedPins,
  resolveDefaultFamilyRoot,
  syncFamilySharedPins,
} from '../src/modules/atlas/family-shared-release.ts';

export {
  SHARED_OWNER_RELEASE_CONTRACT_PATH,
  assertPublishedOwnerCommitReachable,
  collectSharedOwnerReleaseRemotes,
  extractTrackedPins,
  inspectConsumerRepo,
  inspectFamilySharedPins,
  loadSharedOwnerReleaseContract,
  parseSharedPackageLocator,
  releaseFamilySharedPins,
  resolveCanonicalRepoRoot,
  resolveConsumerRepoPath,
  resolveDefaultFamilyRoot,
  rewriteSharedOwnerReleaseContract,
  rewriteTrackedPins,
  syncConsumerRepo,
  syncFamilySharedPins,
} from '../src/modules/atlas/family-shared-release.ts';

function repoRootFromImportMeta() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function formatInspection(summary) {
  const latestStable = summary.latest_stable;
  const lines = [
    latestStable
      ? `family shared latest-stable: ${latestStable.ref} -> ${latestStable.commit}`
      : `family shared owner commit: ${summary.owner_commit}`,
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
    } else {
      for (const relativePath of result.changed_files) {
        lines.push(`  - ${relativePath}`);
      }
    }
    for (const command of result.lock_refresh_commands ?? []) {
      lines.push(`  - refresh lock receipt: (cd ${result.repo_path} && ${command})`);
    }
  }
  return lines.join('\n');
}

function formatRelease(result) {
  return [
    `promoted latest-stable commit: ${result.owner_commit}`,
    `updated contract: ${result.contract_path}`,
  ].join('\n');
}

function parseCliOptions(argv, { repoRoot = repoRootFromImportMeta() } = {}) {
  const { values, positionals } = parseNodeArgs({
    args: argv,
    options: {
      'family-root': { type: 'string' },
      'owner-commit': { type: 'string' },
      repo: { type: 'string', multiple: true, default: [] },
    },
    strict: true,
    allowPositionals: true,
  });
  return {
    command: positionals[0] ?? 'check',
    familyRoot: values['family-root']
      ? path.resolve(values['family-root'])
      : resolveDefaultFamilyRoot({ repoRoot }),
    ownerCommit: values['owner-commit'],
    repoOverrides: values.repo,
  };
}

export function runFamilySharedReleaseCli(
  argv,
  {
    repoRoot = repoRootFromImportMeta(),
    validatePublishedOwnerCommit = assertPublishedOwnerCommitReachable,
  } = {},
) {
  const parsed = parseCliOptions(argv, { repoRoot });
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
    validatePublishedOwnerCommit({
      contract,
      ownerCommit: contract.owner_commit,
    });
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
