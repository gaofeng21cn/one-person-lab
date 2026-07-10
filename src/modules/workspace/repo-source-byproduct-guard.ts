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
const GLOB_EXCLUDES = [
  ...[...EXCLUDED_DIRECTORY_NAMES].flatMap((name) => [name, `${name}/**`, `**/${name}`, `**/${name}/**`]),
  ...[...BYPRODUCT_DIRECTORY_NAMES].flatMap((name) => [`${name}/**`, `**/${name}/**`]),
  '**/*.egg-info/**',
  '**/.*.egg-info/**',
  '**/.egg-info/**',
];
const BYPRODUCT_GLOB_PATTERNS = [
  ...[...BYPRODUCT_DIRECTORY_NAMES].map((name) => `**/${name}`),
  '**/*.egg-info',
  '**/.*.egg-info',
  '**/.egg-info',
  '**/*.{pyc,pyo}',
  '**/.*.{pyc,pyo}',
];

export type RepoSourceByproductIssue = {
  kind: 'repo_source_byproduct_scan_failed' | 'repo_source_generated_byproduct';
  path: string;
  byproduct_type: 'directory' | 'file' | null;
  reason: string;
};

function isByproductDirectoryName(name: string) {
  return BYPRODUCT_DIRECTORY_NAMES.has(name) || name.endsWith('.egg-info');
}

function scanDirectory(root: string, issues: RepoSourceByproductIssue[]) {
  fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK);

  for (const relativePath of fs.globSync('**/{*,.*}/', { cwd: root, exclude: GLOB_EXCLUDES })) {
    if (relativePath !== '.' && !isByproductDirectoryName(path.basename(relativePath))) {
      fs.accessSync(path.join(root, relativePath), fs.constants.R_OK | fs.constants.X_OK);
    }
  }

  issues.push(...fs.globSync(BYPRODUCT_GLOB_PATTERNS, { cwd: root, exclude: GLOB_EXCLUDES })
    .map((relativePath) => ({
      kind: 'repo_source_generated_byproduct' as const,
      path: relativePath,
      byproduct_type: BYPRODUCT_DIRECTORY_NAMES.has(path.basename(relativePath))
        || fs.lstatSync(path.join(root, relativePath)).isDirectory()
        ? 'directory' as const
        : 'file' as const,
      reason: 'repo_source_must_not_rely_on_cache_or_install_byproducts',
    })));
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
      scanDirectory(root, issues);
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
