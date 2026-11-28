import path from 'node:path';
import type { StageExecutionRequest } from '../spi.ts';

export function inferEffortFromModelId(
  modelId: string,
  explicitEffort?: StageExecutionRequest['reasoning_effort'],
): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (explicitEffort) return explicitEffort;
  if (modelId.endsWith('-xhigh')) return 'xhigh';
  if (modelId.endsWith('-high')) return 'high';
  if (modelId.endsWith('-low')) return 'low';
  return 'medium';
}

export interface BuildAgyArgsOptions {
  readonly ephemeralSettingsPath?: string;
}

/**
 * Builds Antigravity (`agy`) CLI arguments.
 * Forces `--mode plan --sandbox` whenever `role === 'reviewer' || sandbox_mode === 'read-only'`.
 */
export function buildAgyArgs(
  req: StageExecutionRequest,
  options: BuildAgyArgsOptions = {},
): string[] {
  const modelId = req.model_id?.trim() || '';
  const effort = req.reasoning_effort ?? (modelId ? inferEffortFromModelId(modelId) : undefined);
  const isReadOnlyReviewer = req.role === 'reviewer' || req.sandbox_mode === 'read-only';
  const mode = isReadOnlyReviewer
    ? 'plan'
    : req.sandbox_mode === 'danger-full-access'
      ? 'auto'
      : 'accept-edits';
  const needsSandbox = isReadOnlyReviewer || req.sandbox_mode !== 'danger-full-access';

  const args: string[] = [
    '--print',
    '--output-format',
    'stream-json',
  ];
  if (modelId) {
    args.push('--model', modelId);
  }
  if (effort) {
    args.push('--effort', effort);
  }
  args.push('--mode', mode);

  if (needsSandbox) {
    args.push('--sandbox');
  }

  if (req.resume_session_ref) {
    args.push('--conversation', req.resume_session_ref);
  }

  const addDirSet = new Set<string>();
  const rawWsRoot = req.workspace_root?.trim() ?? '';
  if (rawWsRoot && !rawWsRoot.includes('\0') && path.isAbsolute(rawWsRoot)) {
    addDirSet.add(path.resolve(rawWsRoot));
  }
  for (const dir of req.knowledge_snapshot_refs ?? []) {
    const trimmed = dir.trim();
    if (trimmed && !trimmed.includes('\0') && path.isAbsolute(trimmed)) {
      addDirSet.add(path.resolve(trimmed));
    }
  }
  for (const dir of addDirSet) {
    args.push('--add-dir', dir);
  }

  if (req.json_schema !== undefined) {
    const schemaArg =
      typeof req.json_schema === 'string'
        ? req.json_schema
        : JSON.stringify(req.json_schema);
    if (schemaArg.trim()) {
      args.push('--json-schema', schemaArg);
    }
  }

  if (options.ephemeralSettingsPath) {
    args.push('--settings', options.ephemeralSettingsPath);
  }

  args.push(req.prompt);
  return args;
}

export function buildAgyEphemeralSettingsPayload(
  req: StageExecutionRequest,
): Record<string, unknown> | null {
  const mcpList = req.mcp_servers ?? [];
  const skillDirs = req.skill_dirs ?? [];
  if (mcpList.length === 0 && skillDirs.length === 0) {
    return null;
  }

  const mcpServers: Record<string, unknown> = {};
  for (const srv of mcpList) {
    if (srv.transport === 'stdio' && srv.command) {
      mcpServers[srv.id] = {
        command: srv.command,
        ...(srv.args ? { args: [...srv.args] } : {}),
        ...(srv.env ? { env: { ...srv.env } } : {}),
      };
    } else if (srv.transport === 'streamable_http' && srv.url) {
      mcpServers[srv.id] = {
        type: 'http',
        url: srv.url,
      };
    }
  }

  return {
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    ...(skillDirs.length > 0 ? { skillDirs: [...skillDirs] } : {}),
  };
}
