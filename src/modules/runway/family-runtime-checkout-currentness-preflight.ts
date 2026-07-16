import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';

export type CheckoutCurrentnessPreflight = {
  status: 'not_git_checkout' | 'current' | 'observed';
  currentness_status:
    | 'not_git_checkout'
    | 'current'
    | 'dirty_observed'
    | 'behind_observed'
    | 'diverged_observed'
    | 'target_unresolved_observed'
    | 'git_unreadable_observed'
    | 'ahead_observed';
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
      status: 'observed',
      currentness_status: 'git_unreadable_observed',
      workspace_path: workspacePath,
      reason: 'git_head_unreadable',
      detail: gitErrorDetail(head),
    };
  }

  const status = runGit(cwd, ['status', '--porcelain']);
  if (status.status !== 0) {
    return {
      status: 'observed',
      currentness_status: 'git_unreadable_observed',
      workspace_path: workspacePath,
      reason: 'git_status_unreadable',
      head_sha: headSha,
      detail: gitErrorDetail(status),
    };
  }
  if (gitOutput(status)) {
    return {
      status: 'observed',
      currentness_status: 'dirty_observed',
      workspace_path: workspacePath,
      reason: 'dirty_checkout',
      head_sha: headSha,
      detail: 'Checkout has uncommitted changes; current bytes remain the execution source and this state is recorded as provenance.',
    };
  }

  const targetRef = checkoutCurrentnessTargetRef(env);
  const target = runGit(cwd, ['rev-parse', '--verify', targetRef]);
  if (target.status !== 0) {
    return {
      status: 'observed',
      currentness_status: 'target_unresolved_observed',
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
    return {
      status: 'observed',
      currentness_status: 'behind_observed',
      workspace_path: workspacePath,
      target_ref: targetRef,
      head_sha: headSha,
      target_sha: targetSha,
      reason: 'checkout_behind_target',
      detail: 'Checkout is behind the observed target ref; execution continues from the current local bytes without mutating the checkout.',
    };
  }

  const targetAncestor = runGit(cwd, ['merge-base', '--is-ancestor', targetRef, 'HEAD']);
  return {
    status: 'observed',
    currentness_status: targetAncestor.status === 0 ? 'ahead_observed' : 'diverged_observed',
    workspace_path: workspacePath,
    reason: targetAncestor.status === 0 ? 'checkout_ahead_of_target' : 'diverged_checkout',
    target_ref: targetRef,
    head_sha: headSha,
    target_sha: targetSha,
    detail: 'Checkout differs from the observed target ref; execution continues from the current local bytes and records the difference as provenance.',
  };
}
