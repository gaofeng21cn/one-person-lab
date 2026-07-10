import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

const BYPRODUCT_PATTERN =
  '**/{.venv,__pycache__,.pytest_cache,dist,coverage,node_modules,*.egg-info,*.pyc,*.pyo}';
const EXCLUDED_DESCENDANTS = [
  '.git/**',
  '**/.git/**',
  '.worktrees/**',
  '**/.worktrees/**',
  'worktrees/**',
  '**/worktrees/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/dist/**',
  '**/coverage/**',
  '**/node_modules/**',
  '**/*.egg-info/**',
] as const;

export type RepoSourceByproductIssue = {
  kind: 'repo_source_byproduct_scan_failed' | 'repo_source_generated_byproduct';
  path: string;
  byproduct_type: 'directory' | 'file' | null;
  reason: string;
};

export function inspectRepoSourceByproducts(sourceRoot: string) {
  const root = path.resolve(sourceRoot);
  const issues: RepoSourceByproductIssue[] = [];

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    issues.push({
      kind: 'repo_source_byproduct_scan_failed',
      path: root,
      byproduct_type: null,
      reason: 'source_root_missing_or_not_a_directory',
    });
  } else {
    for (const relativePath of fs.globSync(BYPRODUCT_PATTERN, {
      cwd: root,
      exclude: EXCLUDED_DESCENDANTS,
    }).sort()) {
      const absolutePath = path.join(root, relativePath);
      issues.push({
        kind: 'repo_source_generated_byproduct',
        path: relativePath,
        byproduct_type: fs.statSync(absolutePath).isDirectory() ? 'directory' : 'file',
        reason: 'repo_source_must_not_rely_on_cache_or_install_byproducts',
      });
    }
  }

  return {
    surface_kind: 'opl_repo_source_byproduct_guard',
    version: 'repo-source-byproduct-guard.v1',
    owner: 'OPL Workspace',
    source_root: root,
    status: issues.length === 0 ? 'passed' as const : 'blocked' as const,
    issues,
    policy: {
      forbidden_pattern: BYPRODUCT_PATTERN,
      excluded_worktree_roots: ['.git', '.worktrees', 'worktrees'],
      ignored_only_is_fallback_not_authority: true,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      source_clean_counts_as_domain_ready: false,
      source_clean_counts_as_release_ready: false,
      source_clean_counts_as_production_ready: false,
    },
  };
}

export function assertRepoSourceByproductsClean(sourceRoot: string) {
  const report = inspectRepoSourceByproducts(sourceRoot);
  if (report.status === 'blocked') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Repository source contains cache or install byproducts.',
      { report },
    );
  }
  return report;
}
