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
  domain_output?: {
    surface_kind: 'domain_owned_stage_output_ref';
    version: 'domain-owned-stage-output-ref.v1';
    domain_id: string;
    output_ref: string;
  };
  next_owner: string | null;
  domain_ready_verdict: string | null;
  token_usage?: JsonRecord;
  usage_refs?: string[];
  session_usage_refs?: JsonRecord;
  cost_summary?: JsonRecord;
  user_stage_log?: JsonRecord;
  stage_log_summary?: JsonRecord;
  human_stage_log?: JsonRecord;
  route_impact?: JsonRecord;
  authority_boundary: JsonRecord;
};

function normalizeDomainOutput(value: unknown, closeoutRefs: string[]): TypedStageCloseoutPacket['domain_output'] {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'domain_output must be a refs-only JSON object.', {
      field: 'domain_output',
    });
  }
  const allowedFields = new Set(['surface_kind', 'version', 'domain_id', 'output_ref']);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'domain_output contains unsupported fields; only refs-only output identity is allowed.',
      { allowed_fields: [...allowedFields] },
    );
  }
  const surfaceKind = optionalString(value.surface_kind);
  const version = optionalString(value.version);
  const domainId = optionalString(value.domain_id);
  const outputRef = optionalString(value.output_ref);
  if (
    surfaceKind !== 'domain_owned_stage_output_ref'
    || version !== 'domain-owned-stage-output-ref.v1'
    || !domainId
    || !outputRef
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'domain_output must declare the canonical refs-only output shape.', {
      field: 'domain_output',
      required: [
        'surface_kind=domain_owned_stage_output_ref',
        'version=domain-owned-stage-output-ref.v1',
        'domain_id',
        'output_ref',
      ],
    });
  }
  if (!closeoutRefs.includes(outputRef)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'domain_output.output_ref must be present in closeout_refs.',
      { output_ref: outputRef },
    );
  }
  return {
    surface_kind: surfaceKind,
    version,
    domain_id: domainId,
    output_ref: outputRef,
  };
}

export type StageCloseoutPacketRejection = {
  reason:
    | 'stage_attempt_id_mismatch'
    | 'idempotency_key_mismatch'
    | 'domain_route_user_stage_log_missing';
  stage_attempt_id: string | null;
  idempotency_key: string | null;
};

function isDomainRouteAttempt(attempt: JsonRecord) {
  const locator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return optionalString(locator.task_kind) === 'domain_route/stage-route'
    || optionalString(locator.runtime_request_kind) === 'domain_route_stage_route'
    || optionalString(locator.surface_kind) === 'opl_domain_route_runtime_request';
}

function recordHasDomainProvidedStageLog(value: JsonRecord) {
  return isRecord(value.user_stage_log)
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
  const allowedMetadataFields = new Set(['ref_kind', 'kind', 'uri', 'sha256', 'ref', 'size_bytes']);
  const stringMetadataFields = ['ref_kind', 'kind', 'uri', 'sha256', 'ref'] as const;
  for (const entry of value) {
    const direct = optionalString(entry);
    if (direct) {
      refs.push(direct);
      continue;
    }
    if (!isRecord(entry)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'closeout_refs object metadata contains an unsupported field or value.',
        { allowed_fields: [...allowedMetadataFields] },
      );
    }
    if (
      Object.keys(entry).some((field) => !allowedMetadataFields.has(field))
      || stringMetadataFields.some((field) => field in entry && !optionalString(entry[field]))
      || ('size_bytes' in entry && (
        typeof entry.size_bytes !== 'number'
        || !Number.isFinite(entry.size_bytes)
        || entry.size_bytes < 0
      ))
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'closeout_refs object metadata contains an unsupported field or value.',
        { allowed_fields: [...allowedMetadataFields] },
      );
    }
    const ref = optionalString(entry.ref) ?? optionalString(entry.uri);
    if (!ref) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'closeout_refs object metadata contains an unsupported field or value.',
        { required: ['ref|uri'] },
      );
    }
    refs.push(ref);
    const normalizedMetadata: JsonRecord = {};
    for (const field of stringMetadataFields) {
      const fieldValue = optionalString(entry[field]);
      if (fieldValue) {
        normalizedMetadata[field] = fieldValue;
      }
    }
    metadata.push({
      ...normalizedMetadata,
      ...('size_bytes' in entry ? { size_bytes: entry.size_bytes } : {}),
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
  if (value.closeout_ref_metadata != null && !Array.isArray(value.closeout_ref_metadata)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'closeout_ref_metadata must be an array of refs-only metadata.',
    );
  }
  if (
    Array.isArray(value.closeout_ref_metadata)
    && value.closeout_ref_metadata.some((entry) => !isRecord(entry))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'closeout_ref_metadata must contain refs-only metadata objects.',
    );
  }
  const explicitCloseoutRefMetadata = readCloseoutRefEntries(value.closeout_ref_metadata);
  const closeoutRefs = [
    ...closeoutRefEntries.refs,
    ...explicitCloseoutRefMetadata.refs,
    optionalString(value.closeout_ref),
    optionalString(value.receipt_ref),
    optionalString(value.packet_ref),
  ].filter((entry): entry is string => Boolean(entry));
  if (closeoutRefs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Typed stage closeout must include at least one closeout ref.', {
      required: ['closeout_refs|closeout_ref|receipt_ref|packet_ref'],
    });
  }
  const uniqueCloseoutRefs = [...new Set(closeoutRefs)];
  const domainOutput = normalizeDomainOutput(value.domain_output, uniqueCloseoutRefs);

  return {
    surface_kind: surfaceKind,
    ...(optionalString(value.stage_attempt_id) ? { stage_attempt_id: optionalString(value.stage_attempt_id)! } : {}),
    ...(optionalString(value.idempotency_key) ? { idempotency_key: optionalString(value.idempotency_key)! } : {}),
    ...(optionalString(value.closeout_id) ? { closeout_id: optionalString(value.closeout_id)! } : {}),
    closeout_refs: uniqueCloseoutRefs,
    ...(closeoutRefEntries.metadata.length + explicitCloseoutRefMetadata.metadata.length > 0
      ? {
          closeout_ref_metadata: [
            ...closeoutRefEntries.metadata,
            ...explicitCloseoutRefMetadata.metadata,
          ],
        }
      : {}),
    consumed_refs: readStringList(value.consumed_refs),
    consumed_memory_refs: readStringList(value.consumed_memory_refs),
    writeback_receipt_refs: readStringList(value.writeback_receipt_refs),
    rejected_writes: readRecordList(value.rejected_writes),
    ...(domainOutput ? { domain_output: domainOutput } : {}),
    next_owner: optionalString(value.next_owner),
    domain_ready_verdict: optionalString(value.domain_ready_verdict),
    ...(isRecord(value.token_usage) ? { token_usage: value.token_usage } : {}),
    ...(readStringList(value.usage_refs).length > 0 ? { usage_refs: readStringList(value.usage_refs) } : {}),
    ...(isRecord(value.session_usage_refs) ? { session_usage_refs: value.session_usage_refs } : {}),
    ...(isRecord(value.cost_summary) ? { cost_summary: value.cost_summary } : {}),
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
}): { closeoutPacket: TypedStageCloseoutPacket | null; rejection: StageCloseoutPacketRejection | null } {
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
  if (isDomainRouteAttempt(input.attempt) && !hasDomainProvidedStageLog(closeoutPacket, input.attempt)) {
    return {
      closeoutPacket: null,
      rejection: {
        reason: 'domain_route_user_stage_log_missing' as const,
        stage_attempt_id: closeoutPacket.stage_attempt_id ?? null,
        idempotency_key: closeoutPacket.idempotency_key ?? null,
      },
    };
  }
  return { closeoutPacket, rejection: null };
}
