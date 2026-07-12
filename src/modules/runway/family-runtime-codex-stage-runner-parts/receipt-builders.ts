import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  type CodexExecOptions,
} from '../codex.ts';
import type {
  AgentExecutionReceipt,
  AgentExecutorKind,
} from '../agent-executor.ts';
import {
  codexStageRunnerCostSummaryFrom,
} from '../family-runtime-codex-session-usage.ts';
import {
  checkpointRefsFromAttempt,
  normalizeCodexStageRunnerMode,
  resolvedStagePacketRef,
  runnerPromptFor,
  stageIdFromAttempt,
  workspaceRootFromAttempt,
  type CodexStageRunnerMode,
  type RunnerEventSummary,
} from './input-prompt.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';
import type { buildProgressCloseoutProjection } from '../progress-closeout-projection.ts';
import type { JsonRecord } from './shared.ts';

type CodexStageRunnerStatus = {
  runner_kind: 'codex_cli_stage_runner';
  runner_mode: CodexStageRunnerMode;
  live_process_started: boolean;
  dry_run_transport: boolean;
  process_id: number | null;
  exit_code: number | null;
  stdout_bytes: number;
  stderr_bytes: number;
  timeout_ms: number | null;
  no_output_timeout_ms: number | null;
  command_preview: string[];
  typed_closeout_required_for_progress: false;
  raw_artifact_sufficient_for_progress: true;
};

export type CodexStageRunnerBaseReceipt = {
  runner_status: CodexStageRunnerStatus;
  heartbeat_summary: {
    heartbeat_status: 'recorded';
    last_heartbeat_at: string | null;
    checkpoint_count: number;
    checkpoint_refs: string[];
  };
  progress_summary: {
    progress_status: 'checkpointed' | 'running';
    stage_id: string;
    stage_packet_ref: string | null;
    progress_requires_typed_closeout: false;
    raw_artifact_sufficient_for_progress: true;
    thread_id: string | null;
    runner_events: RunnerEventSummary[];
  };
  cost_summary: ReturnType<typeof codexStageRunnerCostSummaryFrom>;
};

export type CodexStageRunnerProcessOutputSummary = {
  exit_code: number;
  final_message_chars: number;
  stderr_tail: string[];
  timeout_reason?:
    | 'total_timeout'
    | 'no_output_timeout'
    | 'command_no_progress_timeout'
    | 'unsupported_tool_protocol'
    | 'activity_cancelled'
    | 'provider_unavailable';
  no_output_timeout_ms?: number | null;
  command_no_progress_timeout_ms?: number | null;
  captured_last_message_chars?: number;
  raw_stage_artifact?: {
    output_ref: string;
    metadata_ref: string;
    sha256: string;
    size_bytes: number;
  };
  progress_closeout_projection?: ReturnType<typeof buildProgressCloseoutProjection>;
  active_command?: {
    tool_call_id: string;
    title: string;
    status: 'pending' | 'in_progress';
    started_at: string;
    last_output_at: string | null;
    output_chars: number;
  };
  blocked_reason?: string;
  pending_function_call_count?: number;
  function_call_names?: string[];
  unsupported_function_call_session_path?: string;
  recovered_session_path?: string;
  recovered_final_message_chars?: number;
  session_recovery_status?: string;
  session_recovery_attempts?: number;
  domain_receipt_recovery_status?: string;
  domain_receipt_recovery_ref?: string;
  closeout_rejection_reason?:
    | 'stage_attempt_id_mismatch'
    | 'idempotency_key_mismatch'
    | 'domain_route_user_stage_log_missing';
  rejected_closeout_stage_attempt_id?: string;
  rejected_closeout_idempotency_key?: string;
  provider_error_count?: number;
  provider_error_status_codes?: number[];
  provider_error_messages?: string[];
  sandbox_execution?: {
    execution_substrate: 'local_sandbox' | 'external_sandbox';
    provider_kind: 'local_devcontainer' | 'local_docker' | 'e2b';
    sandbox_workspace_root: string;
    workspace_transport: {
      transport_kind: 'git_clone';
      repo_url: string;
      checkout_ref: string | null;
      clone_exit_code: number;
      checkout_exit_code: number | null;
    };
    command_exit_code: number;
    jsonl_stdout_bytes: number;
    stderr_tail: string[];
    diff_refs: {
      changed_file_refs: string[];
      diff_stat: string[];
    };
    external_api_called: boolean;
    credential_material_logged: false;
    forwarded_env_keys: string[];
    sandbox_id?: string;
    sandbox_domain?: string | null;
    sandbox_reuse?: 'created' | 'connected';
    template?: string | null;
    image?: string;
    container_name?: string;
    docker_cli_called?: true;
    host_workspace_mutated?: false;
  };
  external_sandbox_execution?: {
    execution_substrate: 'external_sandbox';
    provider_kind: 'e2b';
    sandbox_id: string;
    sandbox_domain: string | null;
    sandbox_reuse: 'created' | 'connected';
    template: string | null;
    sandbox_workspace_root: string;
    workspace_transport: {
      transport_kind: 'git_clone';
      repo_url: string;
      checkout_ref: string | null;
      clone_exit_code: number;
      checkout_exit_code: number | null;
    };
    command_exit_code: number;
    jsonl_stdout_bytes: number;
    stderr_tail: string[];
    diff_refs: {
      changed_file_refs: string[];
      diff_stat: string[];
    };
    external_api_called: boolean;
    credential_material_logged: false;
    forwarded_env_keys: string[];
  };
};

export type CodexStageRunnerReceipt = CodexStageRunnerBaseReceipt & {
  closeout_packet: TypedStageCloseoutPacket | null;
  process_output_summary?: CodexStageRunnerProcessOutputSummary;
};

export function buildAgentStageRunnerReceipt(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode: AgentExecutorKind;
  observedAt?: string | null;
  agentExecutionReceipt: AgentExecutionReceipt;
}) {
  const checkpointRefs = checkpointRefsFromAttempt(input.attempt);
  return {
    runner_status: {
      runner_kind: 'agent_executor_stage_runner',
      runner_mode: input.runnerMode,
      executor_kind: input.agentExecutionReceipt.executor_kind,
      live_process_started: true,
      dry_run_transport: false,
      process_id: null,
      exit_code: input.agentExecutionReceipt.exit_code,
      stdout_bytes: Buffer.byteLength(input.agentExecutionReceipt.stdout_preview, 'utf8'),
      stderr_bytes: Buffer.byteLength(input.agentExecutionReceipt.stderr_preview, 'utf8'),
      timeout_ms: null,
      typed_closeout_required_for_progress: false,
      raw_artifact_sufficient_for_progress: true,
    },
    heartbeat_summary: {
      heartbeat_status: 'recorded',
      last_heartbeat_at: input.observedAt ?? null,
      checkpoint_count: checkpointRefs.length,
      checkpoint_refs: checkpointRefs,
    },
    progress_summary: {
      progress_status: input.agentExecutionReceipt.closeout_packet ? 'checkpointed' : 'running',
      stage_id: stageIdFromAttempt(input.attempt),
      stage_packet_ref: input.stagePacketRef ?? null,
      progress_requires_typed_closeout: false,
      raw_artifact_sufficient_for_progress: true,
      thread_id: input.agentExecutionReceipt.session_id,
      runner_events: input.agentExecutionReceipt.event_summary,
    },
    cost_summary: {
      cost_status: 'not_measured_agent_executor_receipt',
      estimated_cost_usd: 0,
      token_usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      billing_boundary: 'agent_executor_adapter_reports_only_declared_or_observed_usage',
    },
    agent_execution_receipt: input.agentExecutionReceipt,
  };
}

export function buildCodexStageRunnerReceipt(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  liveProcessStarted?: boolean;
  processId?: number | null;
  exitCode?: number | null;
  stdoutBytes?: number;
  stderrBytes?: number;
  runnerEvents?: RunnerEventSummary[];
  threadId?: string | null;
  timeoutMs?: number | null;
  noOutputTimeoutMs?: number | null;
  codexExecOptions?: Pick<CodexExecOptions, 'model' | 'provider' | 'reasoningEffort'>;
}): CodexStageRunnerBaseReceipt {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const checkpointRefs = checkpointRefsFromAttempt(input.attempt);
  const stagePacketRef = resolvedStagePacketRef(input);
  const observedAt = input.observedAt ?? null;
  const args = buildCodexExecArgs(runnerPromptFor({ attempt: input.attempt, stagePacketRef }), {
    cwd: workspaceRootFromAttempt(input.attempt) ?? undefined,
    json: true,
    ...input.codexExecOptions,
  });
  return {
    runner_status: {
      runner_kind: 'codex_cli_stage_runner',
      runner_mode: runnerMode,
      live_process_started: Boolean(input.liveProcessStarted),
      dry_run_transport: runnerMode !== 'codex_cli',
      process_id: input.processId ?? null,
      exit_code: input.exitCode ?? null,
      stdout_bytes: input.stdoutBytes ?? 0,
      stderr_bytes: input.stderrBytes ?? 0,
      timeout_ms: input.timeoutMs ?? null,
      no_output_timeout_ms: input.noOutputTimeoutMs ?? null,
      command_preview: buildCodexCliPreview(args),
      typed_closeout_required_for_progress: false,
      raw_artifact_sufficient_for_progress: true,
    },
    heartbeat_summary: {
      heartbeat_status: 'recorded',
      last_heartbeat_at: observedAt,
      checkpoint_count: checkpointRefs.length,
      checkpoint_refs: checkpointRefs,
    },
    progress_summary: {
      progress_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
      stage_id: stageIdFromAttempt(input.attempt),
      stage_packet_ref: stagePacketRef,
      progress_requires_typed_closeout: false,
      raw_artifact_sufficient_for_progress: true,
      thread_id: input.threadId ?? null,
      runner_events: input.runnerEvents ?? [],
    },
    cost_summary: codexStageRunnerCostSummaryFrom('', runnerMode),
  };
}
