import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  isRecord,
  readRecordList,
  readStringList,
  type JsonRecord,
} from './shared.ts';

export type TypedStageCloseoutPacket = {
  surface_kind: 'stage_attempt_closeout_packet' | 'stage_memory_closeout_packet' | 'domain_stage_closeout_packet';
  stage_attempt_id?: string;
  idempotency_key?: string;
  closeout_id?: string;
  closeout_refs: string[];
  closeout_ref_metadata?: JsonRecord[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: JsonRecord[];
  next_owner: string | null;
  domain_ready_verdict: string | null;
  token_usage?: JsonRecord;
  usage_refs?: string[];
  session_usage_refs?: JsonRecord;
  cost_summary?: JsonRecord;
  paper_stage_log?: JsonRecord;
  user_stage_log?: JsonRecord;
  stage_log_summary?: JsonRecord;
  human_stage_log?: JsonRecord;
  route_impact?: JsonRecord;
  authority_boundary: JsonRecord;
};

function normalizedDomainId(attempt: JsonRecord) {
  const locator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  const raw = optionalString(attempt.domain_id)
    ?? optionalString(locator.domain_id)
    ?? optionalString(locator.project_id);
  const normalized = raw?.toLowerCase().replace(/[-_]/g, '');
  return normalized === 'mas' || normalized === 'medautoscience' ? 'medautoscience' : raw;
}

function isMasPaperMissionStageRouteAttempt(attempt: JsonRecord) {
  const locator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return normalizedDomainId(attempt) === 'medautoscience'
    && (
      optionalString(locator.task_kind) === 'paper_mission/stage-route'
      || optionalString(locator.runtime_request_kind) === 'mas_paper_mission_stage_route'
      || optionalString(locator.surface_kind) === 'opl_mas_paper_mission_stage_route_workspace_locator'
    );
}

function recordHasDomainProvidedStageLog(value: JsonRecord) {
  return isRecord(value.paper_stage_log)
    || isRecord(value.user_stage_log)
    || isRecord(value.stage_log_summary)
    || isRecord(value.human_stage_log);
}

function hasDomainProvidedStageLog(closeoutPacket: TypedStageCloseoutPacket, attempt: JsonRecord) {
  const closeoutRouteImpact = isRecord(closeoutPacket.route_impact) ? closeoutPacket.route_impact : {};
  const attemptRouteImpact = isRecord(attempt.route_impact) ? attempt.route_impact : {};
  return recordHasDomainProvidedStageLog(closeoutPacket)
    || recordHasDomainProvidedStageLog(closeoutRouteImpact)
    || recordHasDomainProvidedStageLog(attemptRouteImpact);
}

function readCloseoutRefEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return {
      refs: [],
      metadata: [],
    };
  }
  const refs: string[] = [];
  const metadata: JsonRecord[] = [];
  for (const entry of value) {
    const direct = optionalString(entry);
    if (direct) {
      refs.push(direct);
      continue;
    }
    if (!isRecord(entry)) {
      continue;
    }
    const ref = optionalString(entry.ref) ?? optionalString(entry.uri);
    if (!ref) {
      continue;
    }
    refs.push(ref);
    metadata.push({
      ...entry,
      ref,
    });
  }
  return {
    refs,
    metadata,
  };
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

  const closeoutRefEntries = readCloseoutRefEntries(value.closeout_refs);
  const closeoutRefs = [
    ...closeoutRefEntries.refs,
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
    ...(optionalString(value.stage_attempt_id) ? { stage_attempt_id: optionalString(value.stage_attempt_id)! } : {}),
    ...(optionalString(value.idempotency_key) ? { idempotency_key: optionalString(value.idempotency_key)! } : {}),
    ...(optionalString(value.closeout_id) ? { closeout_id: optionalString(value.closeout_id)! } : {}),
    closeout_refs: [...new Set(closeoutRefs)],
    ...(closeoutRefEntries.metadata.length > 0
      ? { closeout_ref_metadata: closeoutRefEntries.metadata }
      : {}),
    consumed_refs: readStringList(value.consumed_refs),
    consumed_memory_refs: readStringList(value.consumed_memory_refs),
    writeback_receipt_refs: readStringList(value.writeback_receipt_refs),
    rejected_writes: readRecordList(value.rejected_writes),
    next_owner: optionalString(value.next_owner),
    domain_ready_verdict: optionalString(value.domain_ready_verdict),
    ...(isRecord(value.token_usage) ? { token_usage: value.token_usage } : {}),
    ...(readStringList(value.usage_refs).length > 0 ? { usage_refs: readStringList(value.usage_refs) } : {}),
    ...(isRecord(value.session_usage_refs) ? { session_usage_refs: value.session_usage_refs } : {}),
    ...(isRecord(value.cost_summary) ? { cost_summary: value.cost_summary } : {}),
    ...(isRecord(value.paper_stage_log) ? { paper_stage_log: value.paper_stage_log } : {}),
    ...(isRecord(value.user_stage_log) ? { user_stage_log: value.user_stage_log } : {}),
    ...(isRecord(value.stage_log_summary) ? { stage_log_summary: value.stage_log_summary } : {}),
    ...(isRecord(value.human_stage_log) ? { human_stage_log: value.human_stage_log } : {}),
    ...(isRecord(value.route_impact) ? { route_impact: value.route_impact } : {}),
    authority_boundary: isRecord(value.authority_boundary)
      ? value.authority_boundary
      : {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
  };
}

export function validateCloseoutPacketForAttempt(input: {
  closeoutPacket: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
}) {
  const closeoutPacket = input.closeoutPacket;
  if (!closeoutPacket) {
    return { closeoutPacket: null, rejection: null };
  }
  const attemptId = optionalString(input.attempt.stage_attempt_id);
  if (attemptId && closeoutPacket.stage_attempt_id && closeoutPacket.stage_attempt_id !== attemptId) {
    return {
      closeoutPacket: null,
      rejection: {
        reason: 'stage_attempt_id_mismatch' as const,
        stage_attempt_id: closeoutPacket.stage_attempt_id,
        idempotency_key: closeoutPacket.idempotency_key ?? null,
      },
    };
  }
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  if (idempotencyKey && closeoutPacket.idempotency_key && closeoutPacket.idempotency_key !== idempotencyKey) {
    return {
      closeoutPacket: null,
      rejection: {
        reason: 'idempotency_key_mismatch' as const,
        stage_attempt_id: closeoutPacket.stage_attempt_id ?? null,
        idempotency_key: closeoutPacket.idempotency_key,
      },
    };
  }
  if (isMasPaperMissionStageRouteAttempt(input.attempt) && !hasDomainProvidedStageLog(closeoutPacket, input.attempt)) {
    return {
      closeoutPacket: null,
      rejection: {
        reason: 'paper_mission_stage_route_user_stage_log_missing' as const,
        stage_attempt_id: closeoutPacket.stage_attempt_id ?? null,
        idempotency_key: closeoutPacket.idempotency_key ?? null,
      },
    };
  }
  return { closeoutPacket, rejection: null };
}
