import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type DomainSourceInput =
  | { kind: 'file'; source_path: string; role?: string; label?: string }
  | { kind: 'text'; text: string; role?: string; label?: string };

export const DEFAULT_DOMAIN_WORKSPACE_GITIGNORE_ENTRIES = [
  '.DS_Store',
  '.venv/',
  '__pycache__/',
  '.pytest_cache/',
  'node_modules/',
  'runtime/',
  'logs/',
  'tmp/',
  '*.log',
  '*.pid',
  '*.sock',
] as const;

function normalizedEntries(entries: readonly string[]) {
  return [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))];
}

export function renderDomainWorkspaceGitignore(input: {
  entries?: readonly string[];
  header?: string;
} = {}) {
  const entries = normalizedEntries(input.entries ?? DEFAULT_DOMAIN_WORKSPACE_GITIGNORE_ENTRIES);
  const header = input.header?.trim() || '# OPL domain workspace-local Git boundary.';
  return `${header}\n${entries.join('\n')}\n`;
}

function mergeDomainWorkspaceGitignore(existing: string, entries: readonly string[]) {
  const required = normalizedEntries(entries);
  const existingLines = new Set(existing.split(/\r?\n/));
  const missing = required.filter((entry) => !existingLines.has(entry));
  if (missing.length === 0) return existing;
  const base = existing.trimEnd();
  return `${base}${base ? '\n\n' : ''}${missing.join('\n')}\n`;
}

export function ensureDomainWorkspaceGitBoundary(input: {
  workspace_root: string;
  gitignore_entries?: readonly string[];
  gitignore_header?: string;
  git_runner?: typeof spawnSync;
}) {
  const workspaceRoot = path.resolve(input.workspace_root);
  const entries = input.gitignore_entries ?? DEFAULT_DOMAIN_WORKSPACE_GITIGNORE_ENTRIES;
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf8');
    const merged = mergeDomainWorkspaceGitignore(existing, entries);
    if (merged !== existing) fs.writeFileSync(gitignorePath, merged, 'utf8');
  } else {
    fs.writeFileSync(gitignorePath, renderDomainWorkspaceGitignore({
      entries,
      header: input.gitignore_header,
    }), 'utf8');
  }

  const gitDir = path.join(workspaceRoot, '.git');
  const alreadyInitialized = fs.existsSync(gitDir);
  const run = input.git_runner ?? spawnSync;
  const runGit = (args: string[], action: string) => {
    const result = run('git', args, { cwd: workspaceRoot, encoding: 'utf8' });
    if (result.error) {
      throw new FrameworkContractError('surface_not_found', `${action} failed.`, {
        workspace_root: workspaceRoot,
        cause: result.error.message,
      });
    }
    if (result.status !== 0) {
      throw new FrameworkContractError('build_command_failed', `${action} failed.`, {
        workspace_root: workspaceRoot,
        stderr: String(result.stderr || result.stdout || '').trim(),
      });
    }
  };
  if (!alreadyInitialized) runGit(['init'], 'git init');
  runGit(['branch', '-M', 'main'], 'git branch');
  runGit(['config', 'worktree.useRelativePaths', 'true'], 'git config');

  return {
    surface_kind: 'opl_domain_workspace_git_boundary',
    workspace_root: workspaceRoot,
    initialized: !alreadyInitialized,
    already_initialized: alreadyInitialized,
    git_dir: gitDir,
    gitignore_path: gitignorePath,
    authority_boundary: {
      framework_owns_workspace_git_bootstrap: true,
      framework_owns_domain_truth: false,
      framework_can_decide_source_readiness: false,
      framework_can_authorize_artifact_mutation: false,
    },
  };
}

export function fingerprintDomainSource(body: string | Buffer) {
  return crypto.createHash('sha256').update(body).digest('hex');
}
function safeSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

export function materializeDomainSources(input: {
  material_root: string;
  sources: DomainSourceInput[];
  apply?: boolean;
}) {
  if (input.sources.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'Domain source materialization requires at least one source.');
  }
  const root = path.resolve(input.material_root);
  const apply = input.apply !== false;
  const entries = input.sources.map((source, index) => {
    const role = safeSegment(source.role ?? 'source_material');
    const body = source.kind === 'file' ? fs.readFileSync(path.resolve(source.source_path)) : source.text;
    const sha256 = fingerprintDomainSource(body);
    const sourceName = source.kind === 'file' ? path.basename(source.source_path) : `${source.label ?? `text-${index + 1}`}.txt`;
    const relativePath = path.posix.join(role, `${sha256.slice(0, 16)}-${safeSegment(sourceName)}`);
    const target = path.join(root, relativePath);
    if (apply) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
    return {
      source_kind: source.kind,
      source_role: role,
      label: source.label ?? sourceName,
      source_path: source.kind === 'file' ? path.resolve(source.source_path) : null,
      material_ref: `source-material:sha256:${sha256}`,
      fingerprint_ref: `sha256:${sha256}`,
      relative_path: relativePath,
      path: target,
      bytes: Buffer.byteLength(body),
      sha256,
      copied: apply,
    };
  });
  return {
    surface_kind: 'opl_domain_source_materialization',
    material_root: root,
    status: apply ? 'applied' : 'dry_run_ready',
    entries,
    refs: entries.flatMap((entry) => [entry.material_ref, entry.fingerprint_ref, entry.relative_path]),
    authority_boundary: {
      framework_can_copy_and_hash_source: true,
      framework_can_extract_source_semantics: false,
      framework_can_decide_source_readiness: false,
      framework_can_create_domain_blocker: false,
    },
  };
}
