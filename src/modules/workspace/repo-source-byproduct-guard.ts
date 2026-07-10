import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', '.worktrees', 'worktrees']);
const BYPRODUCT_DIRECTORY_NAMES = new Set([
  '.venv',
  '__pycache__',
  '.pytest_cache',
  'dist',
  'coverage',
  'node_modules',
]);

export type RepoSourceByproductIssue = {
  kind: 'repo_source_byproduct_scan_failed' | 'repo_source_generated_byproduct';
  path: string;
  byproduct_type: 'directory' | 'file' | null;
  reason: string;
};

function scanDirectory(root: string, current: string, issues: RepoSourceByproductIssue[]) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (BYPRODUCT_DIRECTORY_NAMES.has(entry.name) || entry.name.endsWith('.egg-info')) {
      issues.push({
        kind: 'repo_source_generated_byproduct',
        path: relativePath,
        byproduct_type: 'directory',
        reason: 'repo_source_must_not_rely_on_cache_or_install_byproducts',
      });
      continue;
    }
    if (entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
      issues.push({
        kind: 'repo_source_generated_byproduct',
        path: relativePath,
        byproduct_type: 'file',
        reason: 'repo_source_must_not_rely_on_cache_or_install_byproducts',
      });
      continue;
    }
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      scanDirectory(root, absolutePath, issues);
      continue;
    }
  }
}

export function inspectRepoSourceByproducts(sourceRoot: string) {
  const root = path.resolve(sourceRoot);
  const issues: RepoSourceByproductIssue[] = [];

  try {
    if (!fs.statSync(root).isDirectory()) {
      issues.push({
        kind: 'repo_source_byproduct_scan_failed',
        path: root,
        byproduct_type: null,
        reason: 'source_root_missing_or_not_a_directory',
      });
    } else {
      scanDirectory(root, root, issues);
      issues.sort((left, right) => left.path.localeCompare(right.path));
    }
  } catch (error) {
    issues.push({
      kind: 'repo_source_byproduct_scan_failed',
      path: root,
      byproduct_type: null,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    surface_kind: 'opl_repo_source_byproduct_guard',
    version: 'repo-source-byproduct-guard.v1',
    owner: 'OPL Workspace',
    source_root: root,
    status: issues.length === 0 ? 'passed' as const : 'blocked' as const,
    issues,
    policy: {
      forbidden_directory_names: [...BYPRODUCT_DIRECTORY_NAMES],
      forbidden_file_suffixes: ['.egg-info', '.pyc', '.pyo'],
      excluded_worktree_roots: [...EXCLUDED_DIRECTORY_NAMES],
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
