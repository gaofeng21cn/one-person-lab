import { FrameworkContractError } from './contracts.ts';

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

export type CodexStageRunnerMode = 'dry_run' | 'live_dry_run';

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
  return normalized === 'live_dry_run' ? 'live_dry_run' : 'dry_run';
}

export function buildCodexStageRunnerReceipt(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
}) {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const checkpointRefs = checkpointRefsFromAttempt(input.attempt);
  const stagePacketRef = input.stagePacketRef ?? null;
  const observedAt = input.observedAt ?? null;
  return {
    runner_status: {
      runner_kind: 'codex_cli_stage_runner',
      runner_mode: runnerMode,
      live_process_started: false,
      dry_run_transport: true,
      command_preview: [
        process.env.OPL_CODEX_BIN?.trim() || 'codex',
        'exec',
        '--json',
        ...(stagePacketRef ? ['--stage-packet-ref', stagePacketRef] : []),
      ],
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
    },
    cost_summary: {
      cost_status: 'not_measured_dry_run',
      estimated_cost_usd: 0,
      token_usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      billing_boundary: 'codex_cli_activity_runner_reports_only_observed_or_declared_usage',
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
