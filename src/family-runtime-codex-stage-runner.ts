import { GatewayContractError } from './contracts.ts';

type JsonRecord = Record<string, unknown>;

export type TypedStageCloseoutPacket = {
  surface_kind: 'stage_attempt_closeout_packet' | 'stage_memory_closeout_packet' | 'domain_stage_closeout_packet';
  closeout_id?: string;
  closeout_refs: string[];
  consumed_refs: string[];
  rejected_writes: JsonRecord[];
  next_owner: string | null;
  domain_ready_verdict: string | null;
  authority_boundary: JsonRecord;
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

export function parseJsonObject(value: string, field: string): JsonRecord {
  const parsed = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new GatewayContractError('cli_usage_error', `${field} must be a JSON object.`, {
      field,
    });
  }
  return parsed;
}

export function normalizeTypedStageCloseoutPacket(value: unknown): TypedStageCloseoutPacket {
  if (!isRecord(value)) {
    throw new GatewayContractError('contract_shape_invalid', 'Stage closeout packet must be a JSON object.', {
      surface_kind: null,
    });
  }
  const surfaceKind = optionalString(value.surface_kind);
  if (
    surfaceKind !== 'stage_attempt_closeout_packet'
    && surfaceKind !== 'stage_memory_closeout_packet'
    && surfaceKind !== 'domain_stage_closeout_packet'
  ) {
    throw new GatewayContractError(
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
    throw new GatewayContractError('contract_shape_invalid', 'Typed stage closeout must include at least one closeout ref.', {
      required: ['closeout_refs|closeout_ref|receipt_ref|packet_ref'],
    });
  }

  return {
    surface_kind: surfaceKind,
    ...(optionalString(value.closeout_id) ? { closeout_id: optionalString(value.closeout_id)! } : {}),
    closeout_refs: [...new Set(closeoutRefs)],
    consumed_refs: readStringList(value.consumed_refs),
    rejected_writes: readRecordList(value.rejected_writes),
    next_owner: optionalString(value.next_owner),
    domain_ready_verdict: optionalString(value.domain_ready_verdict),
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
  return {
    activity_kind: 'codex_stage_activity',
    executor: 'codex_cli',
    attempt: input.attempt,
    stage_packet_ref: input.stagePacketRef ?? null,
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
