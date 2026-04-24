import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from '../contracts.ts';
import { normalizeCommandOutput } from '../runtime-observer.ts';

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GitCommandResult = CommandResult & {
  ok: boolean;
  text: string;
};

export function runCommand(command: string, args: string[], cwd?: string): CommandResult {
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

export function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = runCommand('git', ['-C', cwd, ...args]);

  return {
    ...result,
    ok: result.exitCode === 0,
    text: normalizeCommandOutput(result.stdout, result.stderr),
  };
}

export function parseStatusLine(statusLine: string) {
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
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace-status requires an existing path.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

export function normalizeBaseUrlHost(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }

  if (host === '::') {
    return '[::1]';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function optionalStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function readOptionalJsonRecord(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function runJsonShellCommand(command: string | null, cwd: string) {
  if (!command) {
    return {
      payload: null,
      error: null,
    };
  }

  const result = spawnSync('/bin/bash', ['-lc', command], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error || (result.status ?? 1) !== 0) {
    const failure = normalizeCommandOutput(result.stdout ?? '', result.stderr ?? result.error?.message ?? '');
    return {
      payload: null,
      error: failure || 'Command execution failed.',
    };
  }

  try {
    const parsed = JSON.parse(result.stdout ?? '');
    if (!isRecord(parsed)) {
      return {
        payload: null,
        error: 'Command returned a JSON payload that is not an object.',
      };
    }

    return {
      payload: parsed,
      error: null,
    };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : 'Command did not return valid JSON.',
    };
  }
}

export function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readOptionalText(filePath: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function normalizeInlineText(value: string | null | undefined) {
  const normalized = value
    ?.replace(/\r?\n+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\\$/g, '')
    .trim();

  return normalized ? normalized : null;
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractMarkedField(markdown: string | null, label: string) {
  if (!markdown) {
    return null;
  }

  const pattern = new RegExp(
    `\\*\\*${escapeRegex(label)}:\\*\\*\\s*([\\s\\S]*?)(?:\\\\\\s*$|\\n\\*\\*|\\n##|\\n#|$)`,
    'im',
  );
  const match = markdown.match(pattern);
  return normalizeInlineText(match?.[1] ?? null);
}

export function extractFrontMatterTitle(markdown: string | null) {
  if (!markdown) {
    return null;
  }

  const match = markdown.match(/^title:\s*"(.+)"$/m);
  return normalizeInlineText(match?.[1] ?? null);
}

export function summarizeFigureCounts(figureCatalog: Record<string, unknown> | null) {
  const figures = Array.isArray(figureCatalog?.figures)
    ? figureCatalog.figures.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  let main = 0;
  let supplementary = 0;

  for (const figure of figures) {
    const figureId = optionalString(figure.figure_id);
    const paperRole = optionalString(figure.paper_role);
    const isSupplementary = (figureId && /^S/i.test(figureId)) || paperRole === 'supplementary';
    if (isSupplementary) {
      supplementary += 1;
    } else {
      main += 1;
    }
  }

  return {
    main: figures.length > 0 ? main : null,
    supplementary: figures.length > 0 ? supplementary : null,
  };
}

export function summarizeTableCounts(tableCatalog: Record<string, unknown> | null) {
  const tables = Array.isArray(tableCatalog?.tables)
    ? tableCatalog.tables.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  let main = 0;
  let supplementary = 0;

  for (const table of tables) {
    const tableId = optionalString(table.table_id);
    const paperRole = optionalString(table.paper_role);
    const isSupplementary = (tableId && /^TA/i.test(tableId)) || paperRole === 'supplementary';
    if (isSupplementary) {
      supplementary += 1;
    } else {
      main += 1;
    }
  }

  return {
    main: tables.length > 0 ? main : null,
    supplementary: tables.length > 0 ? supplementary : null,
  };
}
