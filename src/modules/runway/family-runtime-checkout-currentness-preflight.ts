import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';

export type CheckoutCurrentnessPreflight = {
  status: 'not_git_checkout' | 'current' | 'fast_forwarded' | 'blocked';
  currentness_status:
    | 'not_git_checkout'
    | 'current'
    | 'fast_forwarded'
    | 'dirty_fail_closed'
    | 'diverged_fail_closed'
    | 'target_unresolved_fail_closed'
    | 'git_unreadable_fail_closed'
    | 'fetch_failed_fail_closed'
    | 'fast_forward_failed_fail_closed'
    | 'ahead_fail_closed';
  workspace_path: string;
  target_ref?: string;
  head_sha?: string;
  target_sha?: string;
  reason?: string;
  detail?: string;
};

function runGit(cwd: string, args: string[]) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
}

function gitOutput(result: SpawnSyncReturns<string>) {
  return (result.stdout ?? '').trim();
}

function shortExcerpt(value: string, maxLength = 500) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function gitErrorDetail(result: SpawnSyncReturns<string>) {
  return shortExcerpt([
    result.error?.message,
    result.stderr,
    result.stdout,
  ].filter(Boolean).join('\n'));
}

function checkoutCurrentnessTargetRef(env: NodeJS.ProcessEnv) {
  return env.OPL_FAMILY_RUNTIME_CHECKOUT_CURRENTNESS_TARGET_REF?.trim()
    || 'origin/main';
}

export function preflightGitCheckoutCurrentness(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): CheckoutCurrentnessPreflight {
  const workspacePath = path.resolve(cwd);
  const inside = runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || gitOutput(inside) !== 'true') {
    return { status: 'not_git_checkout', currentness_status: 'not_git_checkout', workspace_path: workspacePath };
  }

  const head = runGit(cwd, ['rev-parse', 'HEAD']);
  const headSha = head.status === 0 ? gitOutput(head) : undefined;
  if (head.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'git_unreadable_fail_closed',
      workspace_path: workspacePath,
      reason: 'git_head_unreadable',
      detail: gitErrorDetail(head),
    };
  }

  const status = runGit(cwd, ['status', '--porcelain']);
  if (status.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'git_unreadable_fail_closed',
      workspace_path: workspacePath,
      reason: 'git_status_unreadable',
      head_sha: headSha,
      detail: gitErrorDetail(status),
    };
  }
  if (gitOutput(status)) {
    return {
      status: 'blocked',
      currentness_status: 'dirty_fail_closed',
      workspace_path: workspacePath,
      reason: 'dirty_checkout',
      head_sha: headSha,
      detail: 'Checkout has uncommitted changes; refusing to run against a mutable source tree.',
    };
  }

  const targetRef = checkoutCurrentnessTargetRef(env);
  const fetch = runGit(cwd, ['fetch', '--quiet', 'origin']);
  if (fetch.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'fetch_failed_fail_closed',
      workspace_path: workspacePath,
      reason: 'git_fetch_failed',
      target_ref: targetRef,
      head_sha: headSha,
      detail: gitErrorDetail(fetch),
    };
  }

  const target = runGit(cwd, ['rev-parse', '--verify', targetRef]);
  if (target.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'target_unresolved_fail_closed',
      workspace_path: workspacePath,
      reason: 'target_ref_unreadable',
      target_ref: targetRef,
      head_sha: headSha,
      detail: gitErrorDetail(target),
    };
  }
  const targetSha = gitOutput(target);
  if (headSha === targetSha) {
    return {
      status: 'current',
      currentness_status: 'current',
      workspace_path: workspacePath,
      target_ref: targetRef,
      head_sha: headSha,
      target_sha: targetSha,
    };
  }

  const headAncestor = runGit(cwd, ['merge-base', '--is-ancestor', 'HEAD', targetRef]);
  if (headAncestor.status === 0) {
    const merge = runGit(cwd, ['merge', '--ff-only', targetRef]);
    if (merge.status !== 0) {
      return {
        status: 'blocked',
        currentness_status: 'fast_forward_failed_fail_closed',
        workspace_path: workspacePath,
        reason: 'fast_forward_failed',
        target_ref: targetRef,
        head_sha: headSha,
        target_sha: targetSha,
        detail: gitErrorDetail(merge),
      };
    }
    const newHead = runGit(cwd, ['rev-parse', 'HEAD']);
    return {
      status: 'fast_forwarded',
      currentness_status: 'fast_forwarded',
      workspace_path: workspacePath,
      target_ref: targetRef,
      head_sha: newHead.status === 0 ? gitOutput(newHead) : targetSha,
      target_sha: targetSha,
    };
  }

  const targetAncestor = runGit(cwd, ['merge-base', '--is-ancestor', targetRef, 'HEAD']);
  return {
    status: 'blocked',
    currentness_status: targetAncestor.status === 0 ? 'ahead_fail_closed' : 'diverged_fail_closed',
    workspace_path: workspacePath,
    reason: targetAncestor.status === 0 ? 'checkout_ahead_of_target' : 'diverged_checkout',
    target_ref: targetRef,
    head_sha: headSha,
    target_sha: targetSha,
    detail: 'Checkout is not a clean fast-forward from the target ref; refusing to run against a non-current source tree.',
  };
}
