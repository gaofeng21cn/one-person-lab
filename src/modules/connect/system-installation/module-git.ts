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

export function parseGitStatusPorcelainV2(output: string): Pick<
  GitRepoSnapshot,
  'branch' | 'head_sha' | 'upstream_ref' | 'ahead_count' | 'behind_count' | 'sync_status' | 'dirty'
> {
  let branch: string | null = null;
  let headSha: string | null = null;
  let upstreamRef: string | null = null;
  let aheadCount: number | null = null;
  let behindCount: number | null = null;
  let dirty = false;

  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      continue;
    }
    if (!line.startsWith('# ')) {
      dirty = true;
      continue;
    }

    const [key, ...valueParts] = line.slice(2).split(' ');
    const value = valueParts.join(' ').trim();
    if (key === 'branch.oid') {
      headSha = value && value !== '(initial)' ? value : null;
    } else if (key === 'branch.head') {
      branch = value && value !== '(detached)' ? value : null;
    } else if (key === 'branch.upstream') {
      upstreamRef = normalizeOptionalString(value);
    } else if (key === 'branch.ab') {
      const match = value.match(/^\+(\d+) -(\d+)$/);
      if (match) {
        const ahead = Number(match[1]);
        const behind = Number(match[2]);
        if (Number.isSafeInteger(ahead) && Number.isSafeInteger(behind)) {
          aheadCount = ahead;
          behindCount = behind;
        }
      }
    }
  }

  let syncStatus: GitRepoSnapshot['sync_status'] = upstreamRef ? 'unknown' : 'no_upstream';
  if (upstreamRef && aheadCount !== null && behindCount !== null) {
    syncStatus = aheadCount === 0 && behindCount === 0
      ? 'synced'
      : aheadCount > 0 && behindCount === 0
        ? 'ahead'
        : aheadCount === 0 && behindCount > 0
          ? 'behind'
          : 'diverged';
  }

  return {
    branch,
    head_sha: headSha,
    upstream_ref: upstreamRef,
    ahead_count: aheadCount,
    behind_count: behindCount,
    sync_status: syncStatus,
    dirty,
  };
}

export function inspectGitRepo(repoPath: string, refreshRemote = false): GitRepoSnapshot {
  const readStatus = () => parseGitStatusPorcelainV2(
    runGit(['status', '--porcelain=v2', '--branch', '--ahead-behind'], repoPath).stdout,
  );
  let status = readStatus();
  const originResult = runGit(['remote', 'get-url', 'origin'], repoPath);
  if (refreshRemote && originResult.exitCode === 0 && status.branch && status.upstream_ref) {
    runRemoteGitWithRetry(['fetch', '--quiet', '--prune', 'origin'], repoPath);
    status = readStatus();
  }

  const shortShaResult = status.head_sha ? runGit(['rev-parse', '--short', 'HEAD'], repoPath) : null;
  const upstreamHeadResult = status.upstream_ref ? runGit(['rev-parse', '@{u}'], repoPath) : null;
  const upstreamHeadSha =
    upstreamHeadResult?.exitCode === 0 ? normalizeOptionalString(upstreamHeadResult.stdout) : null;

  return {
    branch: status.branch,
    head_sha: status.head_sha,
    short_sha: shortShaResult?.exitCode === 0 ? normalizeOptionalString(shortShaResult.stdout) : null,
    origin_url: originResult.exitCode === 0 ? normalizeOptionalString(originResult.stdout) : null,
    upstream_ref: status.upstream_ref,
    upstream_head_sha: upstreamHeadSha,
    ahead_count: status.ahead_count,
    behind_count: status.behind_count,
    sync_status: status.sync_status,
    dirty: status.dirty,
  };
}
