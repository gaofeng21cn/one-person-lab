import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { normalizeCommandOutput } from '../../../kernel/terminal.ts';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type GitCommandResult = CommandResult & {
  ok: boolean;
  text: string;
};

function runCommand(command: string, args: string[], cwd?: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = runCommand('git', ['-C', cwd, ...args]);

  return {
    ...result,
    ok: result.exitCode === 0,
    text: normalizeCommandOutput(result.stdout, result.stderr),
  };
}

function parseStatusLine(statusLine: string) {
  const branchMatch = statusLine.match(/^##\s+([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(.+)\])?$/);

  return {
    raw: statusLine,
    branch: branchMatch?.[1] ?? null,
    upstream: branchMatch?.[2] ?? null,
    upstream_state: branchMatch?.[3] ?? null,
  };
}

export function buildWorkspaceEntriesSummary(absolutePath: string) {
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).length;
  const files = entries.filter((entry) => entry.isFile()).length;
  const others = entries.length - directories - files;

  return {
    total: entries.length,
    directories,
    files,
    others,
    sample: entries
      .slice(0, 12)
      .map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      })),
  };
}

export function buildGitWorkspaceStatus(absolutePath: string) {
  const inside = runGit(absolutePath, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.text !== 'true') {
    return {
      inside_work_tree: false,
    };
  }

  const root = runGit(absolutePath, ['rev-parse', '--show-toplevel']);
  const gitDir = runGit(absolutePath, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const commonDir = runGit(absolutePath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const status = runGit(absolutePath, ['status', '--short', '--branch']);
  const lines = status.ok
    ? status.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
    : [];
  const statusLine = lines[0] ?? null;
  const fileLines = lines.slice(statusLine ? 1 : 0);

  const stagedCount = fileLines.filter((line) => {
    const indexStatus = line[0];
    return indexStatus && indexStatus !== ' ' && indexStatus !== '?';
  }).length;
  const modifiedCount = fileLines.filter((line) => {
    const worktreeStatus = line[1];
    return worktreeStatus && worktreeStatus !== ' ';
  }).length;
  const untrackedCount = fileLines.filter((line) => line.startsWith('??')).length;

  return {
    inside_work_tree: true,
    root: root.ok ? root.text : absolutePath,
    git_dir: gitDir.ok ? gitDir.text : null,
    git_common_dir: commonDir.ok ? commonDir.text : null,
    linked_worktree: Boolean(gitDir.ok && commonDir.ok && gitDir.text !== commonDir.text),
    status_line: statusLine,
    branch: statusLine ? parseStatusLine(statusLine).branch : null,
    upstream: statusLine ? parseStatusLine(statusLine).upstream : null,
    upstream_state: statusLine ? parseStatusLine(statusLine).upstream_state : null,
    modified_count: modifiedCount,
    staged_count: stagedCount,
    untracked_count: untrackedCount,
    is_clean: fileLines.length === 0,
  };
}

export function normalizeWorkspacePath(workspacePath?: string) {
  const resolved = path.resolve(workspacePath ?? process.cwd());

  if (!fs.existsSync(resolved)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace-status requires an existing path.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export { isRecord, optionalString };

export function normalizeInlineText(value: string | null | undefined) {
  const normalized = value
    ?.replace(/\r?\n+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\\$/g, '')
    .trim();

  return normalized ? normalized : null;
}
