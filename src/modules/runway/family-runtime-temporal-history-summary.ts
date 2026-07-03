import {
  record,
  recordList,
  type JsonRecord,
} from '../../kernel/json-record.ts';

function recordOrNull(value: unknown): JsonRecord | null {
  const payload = record(value);
  return payload === value ? payload : null;
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry)) : [];
}

function historyRunnerEventSummary(value: unknown) {
  return recordList(value).map((event) => {
    const eventKind = typeof event.event_kind === 'string' ? event.event_kind : 'unknown';
    const eventValue = typeof event.value === 'string'
      ? event.value.length > 240
        ? `[omitted:${event.value.length} chars]`
        : event.value
      : null;
    return {
      event_kind: eventKind,
      value: eventValue,
    };
  });
}

function historyProcessOutputSummary(value: unknown) {
  const summary = record(value);
  if (Object.keys(summary).length === 0) {
    return undefined;
  }
  return {
    ...(typeof summary.exit_code === 'number' ? { exit_code: summary.exit_code } : {}),
    ...(typeof summary.final_message_chars === 'number'
      ? { final_message_chars: summary.final_message_chars }
      : {}),
    stderr_tail: [],
    ...(typeof summary.timeout_reason === 'string' ? { timeout_reason: summary.timeout_reason } : {}),
    ...(typeof summary.no_output_timeout_ms === 'number'
      ? { no_output_timeout_ms: summary.no_output_timeout_ms }
      : {}),
    ...(typeof summary.blocked_reason === 'string' ? { blocked_reason: summary.blocked_reason } : {}),
    ...(typeof summary.pending_function_call_count === 'number'
      ? { pending_function_call_count: summary.pending_function_call_count }
      : {}),
    ...(Array.isArray(summary.function_call_names)
      ? { function_call_names: summary.function_call_names.filter((entry): entry is string => typeof entry === 'string') }
      : {}),
    ...(typeof summary.unsupported_function_call_session_path === 'string'
      ? { unsupported_function_call_session_path: summary.unsupported_function_call_session_path }
      : {}),
    ...(typeof summary.recovered_session_path === 'string'
      ? { recovered_session_path: summary.recovered_session_path }
      : {}),
    ...(typeof summary.recovered_final_message_chars === 'number'
      ? { recovered_final_message_chars: summary.recovered_final_message_chars }
      : {}),
    ...(typeof summary.session_recovery_status === 'string'
      ? { session_recovery_status: summary.session_recovery_status }
      : {}),
    ...(typeof summary.session_recovery_attempts === 'number'
      ? { session_recovery_attempts: summary.session_recovery_attempts }
      : {}),
    ...(recordOrNull(summary.closeout_enforcement)
      ? { closeout_enforcement: summary.closeout_enforcement }
      : {}),
  };
}

export function providerBlockerFromCodexResult(value: JsonRecord) {
  const summary = record(value.process_output_summary);
  const blockedReason = typeof summary.blocked_reason === 'string' && summary.blocked_reason.trim()
    ? summary.blocked_reason.trim()
    : null;
  if (!blockedReason) {
    return null;
  }
  const closeoutPacket = record(value.closeout_packet);
  const closeoutRouteImpact = record(closeoutPacket.route_impact);
  return {
    blocked_reason: blockedReason,
    route_impact: {
      ...closeoutRouteImpact,
      provider_blocker_reason: blockedReason,
      provider_blocker_surface: 'codex_stage_activity.process_output_summary',
      runner_timeout_reason: typeof summary.timeout_reason === 'string' ? summary.timeout_reason : null,
      pending_function_call_count: typeof summary.pending_function_call_count === 'number'
        ? summary.pending_function_call_count
        : null,
      function_call_names: Array.isArray(summary.function_call_names)
        ? summary.function_call_names.filter((entry): entry is string => typeof entry === 'string')
        : [],
    },
  };
}

export function codexActivityEventForTemporalHistory(codexResult: JsonRecord) {
  const runnerStatus = record(codexResult.runner_status);
  const heartbeatSummary = record(codexResult.heartbeat_summary);
  const progressSummary = record(codexResult.progress_summary);
  const processOutputSummary = historyProcessOutputSummary(codexResult.process_output_summary);
  const providerBlocker = providerBlockerFromCodexResult(codexResult);
  return {
    activity_kind: 'codex_stage_activity',
    activity_status: 'completed',
    surface_kind: typeof codexResult.surface_kind === 'string' ? codexResult.surface_kind : null,
    stage_attempt_id: typeof codexResult.stage_attempt_id === 'string' ? codexResult.stage_attempt_id : null,
    stage_id: typeof codexResult.stage_id === 'string' ? codexResult.stage_id : null,
    executor_kind: typeof codexResult.executor_kind === 'string' ? codexResult.executor_kind : null,
    checkpoint_refs: asStringList(codexResult.checkpoint_refs),
    stage_packet_ref: typeof codexResult.stage_packet_ref === 'string' ? codexResult.stage_packet_ref : null,
    runner_status: {
      runner_kind: typeof runnerStatus.runner_kind === 'string' ? runnerStatus.runner_kind : null,
      runner_mode: typeof runnerStatus.runner_mode === 'string' ? runnerStatus.runner_mode : null,
      live_process_started: runnerStatus.live_process_started === true,
      dry_run_transport: runnerStatus.dry_run_transport === true,
      process_id: typeof runnerStatus.process_id === 'number' ? runnerStatus.process_id : null,
      exit_code: typeof runnerStatus.exit_code === 'number' ? runnerStatus.exit_code : null,
      stdout_bytes: typeof runnerStatus.stdout_bytes === 'number' ? runnerStatus.stdout_bytes : 0,
      stderr_bytes: typeof runnerStatus.stderr_bytes === 'number' ? runnerStatus.stderr_bytes : 0,
      timeout_ms: typeof runnerStatus.timeout_ms === 'number' ? runnerStatus.timeout_ms : null,
      no_output_timeout_ms: typeof runnerStatus.no_output_timeout_ms === 'number'
        ? runnerStatus.no_output_timeout_ms
        : null,
      typed_closeout_required_for_completion: runnerStatus.typed_closeout_required_for_completion === true,
      free_text_closeout_accepted: runnerStatus.free_text_closeout_accepted === true,
    },
    heartbeat_summary: {
      heartbeat_status: typeof heartbeatSummary.heartbeat_status === 'string'
        ? heartbeatSummary.heartbeat_status
        : null,
      last_heartbeat_at: typeof heartbeatSummary.last_heartbeat_at === 'string'
        ? heartbeatSummary.last_heartbeat_at
        : null,
      checkpoint_count: typeof heartbeatSummary.checkpoint_count === 'number'
        ? heartbeatSummary.checkpoint_count
        : asStringList(heartbeatSummary.checkpoint_refs).length,
      checkpoint_refs: asStringList(heartbeatSummary.checkpoint_refs),
    },
    progress_summary: {
      progress_status: typeof progressSummary.progress_status === 'string' ? progressSummary.progress_status : null,
      stage_id: typeof progressSummary.stage_id === 'string' ? progressSummary.stage_id : null,
      stage_packet_ref: typeof progressSummary.stage_packet_ref === 'string' ? progressSummary.stage_packet_ref : null,
      completed_requires_typed_closeout: progressSummary.completed_requires_typed_closeout === true,
      thread_id: typeof progressSummary.thread_id === 'string' ? progressSummary.thread_id : null,
      runner_events: historyRunnerEventSummary(progressSummary.runner_events),
    },
    ...(processOutputSummary ? { process_output_summary: processOutputSummary } : {}),
    cost_summary: record(codexResult.cost_summary),
    ...(providerBlocker ? { provider_blocker: providerBlocker } : {}),
    authority_boundary: {
      opl: 'activity_packet_and_receipt_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
