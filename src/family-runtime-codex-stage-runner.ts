import { FrameworkContractError } from './contracts.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommandStreaming,
  type CodexExecEvent,
} from './codex.ts';

type JsonRecord = Record<string, unknown>;

export type TypedStageCloseoutPacket = {
  surface_kind: 'stage_attempt_closeout_packet' | 'stage_memory_closeout_packet' | 'domain_stage_closeout_packet';
  closeout_id?: string;
  closeout_refs: string[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: JsonRecord[];
  next_owner: string | null;
  domain_ready_verdict: string | null;
  route_impact?: JsonRecord;
  authority_boundary: JsonRecord;
};

export type CodexStageRunnerMode = 'dry_run' | 'live_dry_run' | 'codex_cli';

type RunnerEventSummary = {
  event_kind: string;
  value: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readRecordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function stageIdFromAttempt(attempt: JsonRecord) {
  return optionalString(attempt.stage_id) ?? 'stage';
}

function checkpointRefsFromAttempt(attempt: JsonRecord) {
  return readStringList(attempt.checkpoint_refs);
}

export function normalizeCodexStageRunnerMode(value?: string | null): CodexStageRunnerMode {
  const normalized = value?.trim().replace(/-/g, '_');
  if (normalized === 'codex_cli') {
    return 'codex_cli';
  }
  return normalized === 'live_dry_run' ? 'live_dry_run' : 'dry_run';
}

function workspaceRootFromAttempt(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return optionalString(workspaceLocator.workspace_root) ?? optionalString(workspaceLocator.repo_root);
}

function runnerPromptFor(input: { attempt: JsonRecord; stagePacketRef?: string | null }) {
  const stageId = stageIdFromAttempt(input.attempt);
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stagePacketRef = input.stagePacketRef ?? null;
  return [
    'You are running an OPL provider-backed stage attempt.',
    `Stage attempt id: ${attemptId}`,
    `Stage id: ${stageId}`,
    stagePacketRef ? `Stage packet ref: ${stagePacketRef}` : 'Stage packet ref: unavailable',
    'Execute only within the domain-owned stage packet and skill boundary.',
    'Return progress through structured events when available.',
    'Do not claim provider completion without a typed closeout packet from the domain sidecar.',
  ].join('\n');
}

function eventSummary(event: CodexExecEvent): RunnerEventSummary {
  if (event.type === 'thread.started') {
    return { event_kind: event.type, value: event.threadId };
  }
  if (event.type === 'agent_message') {
    return { event_kind: event.type, value: event.text.slice(0, 240) };
  }
  if (event.type === 'command_execution') {
    return {
      event_kind: event.type,
      value: [event.status, event.title, event.output].filter(Boolean).join(' | ').slice(0, 240),
    };
  }
  return { event_kind: event.type, value: null };
}

function costSummaryFrom(output: string, runnerMode: CodexStageRunnerMode) {
  const usageLines = output
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const tokenUsage = usageLines
    .map((entry) => (isRecord(entry.token_usage) ? entry.token_usage : null))
    .find((entry): entry is JsonRecord => Boolean(entry));
  return {
    cost_status: runnerMode === 'codex_cli' ? 'observed_or_unreported' : 'not_measured_dry_run',
    estimated_cost_usd: typeof tokenUsage?.estimated_cost_usd === 'number' ? tokenUsage.estimated_cost_usd : 0,
    token_usage: {
      input_tokens: typeof tokenUsage?.input_tokens === 'number' ? tokenUsage.input_tokens : 0,
      output_tokens: typeof tokenUsage?.output_tokens === 'number' ? tokenUsage.output_tokens : 0,
      total_tokens: typeof tokenUsage?.total_tokens === 'number' ? tokenUsage.total_tokens : 0,
    },
    billing_boundary: 'codex_cli_activity_runner_reports_only_observed_or_declared_usage',
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
}) {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const checkpointRefs = checkpointRefsFromAttempt(input.attempt);
  const stagePacketRef = input.stagePacketRef ?? null;
  const observedAt = input.observedAt ?? null;
  const args = buildCodexExecArgs(runnerPromptFor({ attempt: input.attempt, stagePacketRef }), {
    cwd: workspaceRootFromAttempt(input.attempt) ?? undefined,
    json: true,
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
      command_preview: buildCodexCliPreview(args),
      typed_closeout_required_for_completion: true,
      free_text_closeout_accepted: false,
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
      completed_requires_typed_closeout: true,
      thread_id: input.threadId ?? null,
      runner_events: input.runnerEvents ?? [],
    },
    cost_summary: costSummaryFrom('', runnerMode),
  };
}

export async function runCodexStageRunner(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  timeoutMs?: number | null;
}) {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  if (runnerMode !== 'codex_cli') {
    return buildCodexStageRunnerReceipt(input);
  }

  const args = buildCodexExecArgs(runnerPromptFor(input), {
    cwd: workspaceRootFromAttempt(input.attempt) ?? undefined,
    json: true,
  });
  const runnerEvents: RunnerEventSummary[] = [];
  let processId: number | null = null;
  const timeoutMs = input.timeoutMs ?? Number.parseInt(process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS ?? '600000', 10);
  const result = await runCodexCommandStreaming(args, {
    timeoutMs,
    onProcessStarted(pid) {
      processId = pid;
    },
    onStdoutEvent(event) {
      runnerEvents.push(eventSummary(event));
    },
  });
  const parsed = parseCodexExecOutput(result.stdout);
  return {
    ...buildCodexStageRunnerReceipt({
      ...input,
      runnerMode,
      liveProcessStarted: true,
      processId,
      exitCode: result.exitCode,
      stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
      stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
      runnerEvents,
      threadId: parsed.threadId,
      timeoutMs,
    }),
    cost_summary: costSummaryFrom(result.stdout, runnerMode),
    process_output_summary: {
      exit_code: result.exitCode,
      final_message_chars: parsed.finalMessage.length,
      stderr_tail: result.stderr.split(/\r?\n/).filter(Boolean).slice(-5),
    },
  };
}

export function parseJsonObject(value: string, field: string): JsonRecord {
  const parsed = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${field} must be a JSON object.`, {
      field,
    });
  }
  return parsed;
}

export function normalizeTypedStageCloseoutPacket(value: unknown): TypedStageCloseoutPacket {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage closeout packet must be a JSON object.', {
      surface_kind: null,
    });
  }
  const surfaceKind = optionalString(value.surface_kind);
  if (
    surfaceKind !== 'stage_attempt_closeout_packet'
    && surfaceKind !== 'stage_memory_closeout_packet'
    && surfaceKind !== 'domain_stage_closeout_packet'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage closeout packet must declare a supported typed surface_kind.',
      {
        surface_kind: surfaceKind,
        allowed_surface_kinds: [
          'stage_attempt_closeout_packet',
          'stage_memory_closeout_packet',
          'domain_stage_closeout_packet',
        ],
      },
    );
  }

  const closeoutRefs = [
    ...readStringList(value.closeout_refs),
    optionalString(value.closeout_ref),
    optionalString(value.receipt_ref),
    optionalString(value.packet_ref),
  ].filter((entry): entry is string => Boolean(entry));
  if (closeoutRefs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Typed stage closeout must include at least one closeout ref.', {
      required: ['closeout_refs|closeout_ref|receipt_ref|packet_ref'],
    });
  }

  return {
    surface_kind: surfaceKind,
    ...(optionalString(value.closeout_id) ? { closeout_id: optionalString(value.closeout_id)! } : {}),
    closeout_refs: [...new Set(closeoutRefs)],
    consumed_refs: readStringList(value.consumed_refs),
    consumed_memory_refs: readStringList(value.consumed_memory_refs),
    writeback_receipt_refs: readStringList(value.writeback_receipt_refs),
    rejected_writes: readRecordList(value.rejected_writes),
    next_owner: optionalString(value.next_owner),
    domain_ready_verdict: optionalString(value.domain_ready_verdict),
    ...(isRecord(value.route_impact) ? { route_impact: value.route_impact } : {}),
    authority_boundary: isRecord(value.authority_boundary)
      ? value.authority_boundary
      : {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
  };
}

export function buildCodexStageActivityInput(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
}) {
  const runnerReceipt = buildCodexStageRunnerReceipt({
    attempt: input.attempt,
    stagePacketRef: input.stagePacketRef,
    runnerMode: process.env.OPL_CODEX_STAGE_RUNNER_MODE,
  });
  return {
    activity_kind: 'codex_stage_activity',
    executor: 'codex_cli',
    attempt: input.attempt,
    stage_packet_ref: input.stagePacketRef ?? null,
    ...runnerReceipt,
    expected_closeout: {
      typed_packet_required_for_completion: true,
      free_text_closeout_accepted: false,
    },
    authority_boundary: {
      opl: 'activity_packet_and_receipt_transport_only',
      codex_cli: 'stage_execution_under_domain_prompt_and_skill',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function buildDomainSidecarDispatchActivityInput(input: {
  domainId: string;
  dispatchRef: string;
}) {
  return {
    activity_kind: 'domain_sidecar_dispatch_activity',
    domain_id: input.domainId,
    dispatch_ref: input.dispatchRef,
    authority_boundary: {
      opl: 'sidecar_transport_only',
      domain: 'sidecar_dispatch_and_receipt_owner',
    },
  };
}
