import fs from 'node:fs';

import type { GitRepoSnapshot } from './shared.ts';
import {
  normalizeOptionalString,
  runGit,
} from './shared.ts';

function normalizePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRemoteGitRetryAttempts() {
  return normalizePositiveInteger(process.env.OPL_GIT_RETRY_ATTEMPTS, 3);
}

function resolveRemoteGitRetryDelayMs() {
  return normalizePositiveInteger(process.env.OPL_GIT_RETRY_DELAY_MS, 2_000);
}

function sleepSync(ms: number) {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function appendGitRetryHistory(result: ReturnType<typeof runGit>, args: string[], attempts: ReturnType<typeof runGit>[]) {
  if (attempts.length <= 1) {
    return result;
  }

  const history = attempts.map((attempt, index) => {
    return [
      `git attempt ${index + 1}/${attempts.length} exited with ${attempt.exitCode}: git ${args.join(' ')}`,
      attempt.stdout.trim() ? `stdout:\n${attempt.stdout.trim()}` : '',
      attempt.stderr.trim() ? `stderr:\n${attempt.stderr.trim()}` : '',
    ].filter(Boolean).join('\n');
  });

  return {
    ...result,
    stderr: [result.stderr.trim(), ...history].filter(Boolean).join('\n\n'),
  };
}

export function runRemoteGitWithRetry(args: string[], cwd?: string) {
  const maxAttempts = resolveRemoteGitRetryAttempts();
  const delayMs = resolveRemoteGitRetryDelayMs();
  const attempts: ReturnType<typeof runGit>[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runGit(args, cwd);
    attempts.push(result);
    if (result.exitCode === 0) {
      return result;
    }
    if (attempt < maxAttempts) {
      sleepSync(delayMs);
    }
  }

  return appendGitRetryHistory(attempts[attempts.length - 1], args, attempts);
}

export function isGitRepo(repoPath: string) {
  if (!fs.existsSync(repoPath)) {
    return false;
  }

  const result = runGit(['rev-parse', '--is-inside-work-tree'], repoPath);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

export function inspectGitRepo(repoPath: string, refreshRemote = false): GitRepoSnapshot {
  const branch = normalizeOptionalString(runGit(['branch', '--show-current'], repoPath).stdout);
  const headSha = normalizeOptionalString(runGit(['rev-parse', 'HEAD'], repoPath).stdout);
  const shortSha = normalizeOptionalString(runGit(['rev-parse', '--short', 'HEAD'], repoPath).stdout);
  const originResult = runGit(['remote', 'get-url', 'origin'], repoPath);
  const statusPorcelain = runGit(['status', '--porcelain'], repoPath);
  const upstreamResult = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath);
  const upstreamRef = upstreamResult.exitCode === 0 ? normalizeOptionalString(upstreamResult.stdout) : null;
  if (refreshRemote && originResult.exitCode === 0 && branch && upstreamRef) {
    runRemoteGitWithRetry(['fetch', '--quiet', '--prune', 'origin'], repoPath);
  }

  const upstreamHeadResult = upstreamRef ? runGit(['rev-parse', '@{u}'], repoPath) : null;
  const upstreamHeadSha =
    upstreamHeadResult?.exitCode === 0 ? normalizeOptionalString(upstreamHeadResult.stdout) : null;
  const aheadBehindResult = upstreamRef ? runGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], repoPath) : null;
  let aheadCount: number | null = null;
  let behindCount: number | null = null;
  let syncStatus: GitRepoSnapshot['sync_status'] = upstreamRef ? 'unknown' : 'no_upstream';

  if (aheadBehindResult?.exitCode === 0) {
    const [aheadRaw, behindRaw] = aheadBehindResult.stdout.trim().split(/\s+/);
    const ahead = Number(aheadRaw);
    const behind = Number(behindRaw);
    if (Number.isSafeInteger(ahead) && Number.isSafeInteger(behind)) {
      aheadCount = ahead;
      behindCount = behind;
      if (ahead === 0 && behind === 0) {
        syncStatus = 'synced';
      } else if (ahead > 0 && behind === 0) {
        syncStatus = 'ahead';
      } else if (ahead === 0 && behind > 0) {
        syncStatus = 'behind';
      } else {
        syncStatus = 'diverged';
      }
    }
  }

  return {
    branch,
    head_sha: headSha,
    short_sha: shortSha,
    origin_url: originResult.exitCode === 0 ? normalizeOptionalString(originResult.stdout) : null,
    upstream_ref: upstreamRef,
    upstream_head_sha: upstreamHeadSha,
    ahead_count: aheadCount,
    behind_count: behindCount,
    sync_status: syncStatus,
    dirty: statusPorcelain.stdout.trim().length > 0,
  };
}
