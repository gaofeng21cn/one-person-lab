import path from 'node:path';
import type { SandboxMode } from '../../types.ts';
import type { StageExecutionRequest, StageMcpServerConfig } from '../spi.ts';

export interface CodexArgsOptions {
  readonly promptViaStdin?: boolean;
  readonly ephemeral?: boolean;
  readonly outputLastMessagePath?: string;
  readonly provider?: string;
  readonly shellHome?: string;
}

export function quoteTomlString(value: string): string {
  return JSON.stringify(value);
}

function sanitizeTomlKey(id: string): string {
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : quoteTomlString(id);
}

export function appendPerRunSkillConfig(
  args: string[],
  skillDirs: readonly string[],
): void {
  if (!skillDirs || skillDirs.length === 0) return;
  const entries = [...skillDirs]
    .map((dir) => dir.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((dir) => `{path=${quoteTomlString(dir)},enabled=true}`);
  if (entries.length > 0) {
    args.push('--config', `skills.config=[${entries.join(',')}]`);
  }
}

export function appServerMcpConfig(servers: readonly StageMcpServerConfig[]) {
  const entries: Array<[string, Record<string, unknown>]> = [];
  for (const server of servers) {
    if (server.transport === 'stdio' && server.command) {
      entries.push([server.id, { command: server.command, args: server.args ?? [], env: server.env ?? {} }]);
    } else if (server.transport === 'streamable_http' && server.url) {
      entries.push([server.id, { url: server.url }]);
    }
  }
  return entries.length ? { config: { mcp_servers: Object.fromEntries(entries) } } : {};
}

export function appendPerRunMcpConfig(
  args: string[],
  mcpServers: readonly StageMcpServerConfig[],
): void {
  if (!mcpServers || mcpServers.length === 0) return;
  const sorted = [...mcpServers].sort((a, b) => a.id.localeCompare(b.id));
  for (const srv of sorted) {
    const key = sanitizeTomlKey(srv.id);
    if (srv.transport === 'stdio' && srv.command) {
      args.push('--config', `mcp_servers.${key}.command=${quoteTomlString(srv.command)}`);
      if (srv.args && srv.args.length > 0) {
        const serializedArgs = srv.args.map((a) => quoteTomlString(a)).join(',');
        args.push('--config', `mcp_servers.${key}.args=[${serializedArgs}]`);
      }
      if (srv.env) {
        for (const [envKey, envVal] of Object.entries(srv.env).sort(([a], [b]) => a.localeCompare(b))) {
          args.push(
            '--config',
            `mcp_servers.${key}.env.${sanitizeTomlKey(envKey)}=${quoteTomlString(envVal)}`,
          );
        }
      }
    } else if (srv.transport === 'streamable_http' && srv.url) {
      args.push('--config', `mcp_servers.${key}.url=${quoteTomlString(srv.url)}`);
    }
  }
}

export function effectiveSandboxMode(
  req: Pick<StageExecutionRequest, 'role' | 'sandbox_mode'>,
): SandboxMode {
  if (req.role === 'reviewer') return 'read-only';
  return req.sandbox_mode;
}

/**
 * Builds arguments for `codex exec --json`.
 * Uses `-c sandbox_mode="..."` + `spawn(..., { cwd: req.workspace_root })` uniformly.
 */
export function buildCodexExecArgs(
  req: StageExecutionRequest,
  options: CodexArgsOptions = {},
): string[] {
  const sandboxMode = effectiveSandboxMode(req);
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--json',
    '--config',
    `sandbox_mode=${quoteTomlString(sandboxMode)}`,
  ];

  if (options.ephemeral) {
    args.push('--ephemeral');
  }

  if (req.model_id) {
    args.push('--model', req.model_id);
  }

  if (options.provider) {
    args.push('--config', `model_provider=${quoteTomlString(options.provider)}`);
  }

  if (req.reasoning_effort) {
    args.push('--config', `model_reasoning_effort=${quoteTomlString(req.reasoning_effort)}`);
  }

  for (const ref of req.knowledge_snapshot_refs) {
    const trimmed = ref.trim();
    if (trimmed && path.isAbsolute(trimmed)) {
      args.push('--add-dir', trimmed);
    }
  }

  appendPerRunSkillConfig(args, req.skill_dirs);
  appendPerRunMcpConfig(args, req.mcp_servers);

  if (options.shellHome) {
    args.push('--config', `shell_environment_policy.set.HOME=${quoteTomlString(options.shellHome)}`);
  }

  if (options.outputLastMessagePath) {
    args.push('--output-last-message', options.outputLastMessagePath);
  }

  args.push(options.promptViaStdin ? '-' : req.prompt);
  return args;
}

/**
 * Builds arguments for `codex exec resume <session_id>`.
 * CRITICAL: NEVER passes `--sandbox`, `--cd`, or `--add-dir` to `codex exec resume`!
 * Uses `-c sandbox_mode="..."` + `spawn(..., { cwd: req.workspace_root })` uniformly.
 */
export function buildCodexExecResumeArgs(
  sessionId: string,
  req: StageExecutionRequest,
  options: CodexArgsOptions = {},
): string[] {
  const sandboxMode = effectiveSandboxMode(req);
  const args = [
    'exec',
    'resume',
    '--skip-git-repo-check',
    '--json',
    '--config',
    `sandbox_mode=${quoteTomlString(sandboxMode)}`,
  ];

  if (options.ephemeral) {
    args.push('--ephemeral');
  }

  if (req.model_id) {
    args.push('--model', req.model_id);
  }

  if (options.provider) {
    args.push('--config', `model_provider=${quoteTomlString(options.provider)}`);
  }

  if (req.reasoning_effort) {
    args.push('--config', `model_reasoning_effort=${quoteTomlString(req.reasoning_effort)}`);
  }

  appendPerRunSkillConfig(args, req.skill_dirs);
  appendPerRunMcpConfig(args, req.mcp_servers);

  if (options.shellHome) {
    args.push('--config', `shell_environment_policy.set.HOME=${quoteTomlString(options.shellHome)}`);
  }

  if (options.outputLastMessagePath) {
    args.push('--output-last-message', options.outputLastMessagePath);
  }

  args.push(sessionId, options.promptViaStdin ? '-' : req.prompt);
  return args;
}
