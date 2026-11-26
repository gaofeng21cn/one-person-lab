import { isProcessAlive } from '@opl/core';
import type { AttemptRole, SandboxMode } from '../types.ts';

export interface ExecutorModelInfo {
  readonly id: string;
  readonly label: string;
  readonly default?: boolean;
}

export interface ExecutorCapabilities {
  readonly executor_id: string;
  readonly display_name: string;
  readonly supports_streaming: boolean;
  readonly supports_session_resume: boolean;
  readonly supports_reconcile_after_restart: boolean;
  readonly supports_mcp_tools: boolean;
  readonly supports_sandbox_modes: readonly SandboxMode[];
  readonly models: readonly ExecutorModelInfo[];
}

export interface StageMcpServerConfig {
  readonly id: string;
  readonly transport: 'stdio' | 'streamable_http';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly url?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface StageExecutionRequest {
  readonly attempt_id: string;
  readonly task_id: string;
  readonly stage_run_id: string;
  readonly stage_id: string;
  readonly role: AttemptRole;
  readonly workspace_root: string;
  readonly sandbox_mode: SandboxMode;
  readonly model_id?: string;
  readonly reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly prompt: string;
  readonly knowledge_snapshot_refs: readonly string[];
  readonly skill_dirs: readonly string[];
  readonly mcp_servers: readonly StageMcpServerConfig[];
  readonly resume_session_ref?: string;
  readonly timeout_ms?: number;
  readonly json_schema?: string | Record<string, unknown>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ExecutorEvent =
  | { readonly kind: 'session_bound'; readonly session_ref: string; readonly local_pid?: number }
  | { readonly kind: 'progress'; readonly message: string; readonly phase?: string }
  | { readonly kind: 'text_delta'; readonly delta: string }
  | {
      readonly kind: 'tool_call';
      readonly tool_name: string;
      readonly status: 'started' | 'finished';
      readonly summary?: string;
    }
  | {
      readonly kind: 'human_gate_requested';
      readonly question: string;
      readonly options?: readonly string[];
      readonly context_refs?: readonly string[];
    }
  | { readonly kind: 'artifact_observed'; readonly path: string; readonly sha256?: string }
  | {
      readonly kind: 'usage';
      readonly input_tokens?: number;
      readonly output_tokens?: number;
      readonly cached_tokens?: number;
    };

export interface ExecutionUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cached_tokens?: number;
  readonly duration_ms: number;
}

export interface ExecutionOutcome {
  readonly status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out' | 'human_gate';
  readonly session_ref?: string;
  readonly summary_text?: string;
  readonly artifact_refs: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
  readonly usage?: ExecutionUsage;
  readonly human_gate?: {
    readonly question: string;
    readonly options?: readonly string[];
    readonly context_refs?: readonly string[];
  };
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export interface ReconcileResult {
  readonly state: 'still_running' | 'completed' | 'failed' | 'lost';
  readonly outcome?: ExecutionOutcome;
  readonly reattach?: () => AsyncIterable<ExecutorEvent>;
}

export interface ExecutorHealthStatus {
  readonly available: boolean;
  readonly version?: string;
  readonly reason?: string;
  readonly models?: readonly string[];
}

export interface ExecutorReconcileRef {
  readonly attempt_id: string;
  readonly session_ref?: string;
  readonly local_pid?: number;
  readonly workspace_root: string;
}

export interface ExecutorAdapter {
  readonly capabilities: ExecutorCapabilities;
  healthCheck(): Promise<ExecutorHealthStatus>;
  execute(
    req: StageExecutionRequest,
    emit: (ev: ExecutorEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionOutcome>;
  reconcile(ref: ExecutorReconcileRef): Promise<ReconcileResult>;
}

export interface TerminateProcessResult {
  readonly signalSent: 'SIGTERM' | 'SIGKILL' | 'none';
  readonly escalatedToSigkill: boolean;
  readonly exited: boolean;
}

function sendSignalToProcessGroup(pid: number, sig: NodeJS.Signals): boolean {
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, sig);
      return true;
    } catch {
      // Fallback to direct PID if process is not a group leader
    }
  }
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Gracefully terminates a child process group (SIGTERM -> graceMs wait -> SIGKILL fallback).
 */
export async function terminateProcessGroup(
  pid: number | undefined | null,
  graceMs = 10_000,
): Promise<TerminateProcessResult> {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return { signalSent: 'none', escalatedToSigkill: false, exited: true };
  }
  if (!isProcessAlive(pid)) {
    return { signalSent: 'none', escalatedToSigkill: false, exited: true };
  }

  sendSignalToProcessGroup(pid, 'SIGTERM');
  const deadline = Date.now() + Math.max(0, graceMs);
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return { signalSent: 'SIGTERM', escalatedToSigkill: false, exited: true };
    }
    await sleepMs(Math.min(25, Math.max(5, deadline - Date.now())));
  }

  if (!isProcessAlive(pid)) {
    return { signalSent: 'SIGTERM', escalatedToSigkill: false, exited: true };
  }

  sendSignalToProcessGroup(pid, 'SIGKILL');
  const killDeadline = Date.now() + 1_000;
  while (Date.now() < killDeadline) {
    if (!isProcessAlive(pid)) {
      return { signalSent: 'SIGKILL', escalatedToSigkill: true, exited: true };
    }
    await sleepMs(20);
  }
  return {
    signalSent: 'SIGKILL',
    escalatedToSigkill: true,
    exited: !isProcessAlive(pid),
  };
}

export function attachLineBuffer(
  stream: NodeJS.ReadableStream | null | undefined,
  onLine: (line: string) => void,
): () => string {
  if (!stream) {
    return () => '';
  }

  let buffer = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (true) {
      const nl = buffer.indexOf('\n');
      if (nl === -1) break;
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      onLine(line);
    }
  });

  return () => {
    if (!buffer) return '';
    const remainder = buffer.replace(/\r$/, '');
    buffer = '';
    if (remainder) {
      onLine(remainder);
    }
    return remainder;
  };
}
