import { FrameworkContractError } from '../contracts.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import type { PaperAutonomyStageRunIdentity } from '../family-runtime-paper-autonomy.ts';
import { parsePayload, parsePayloadFile } from './shared.ts';

export function parsePaperAutonomyArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  if (rest[0] !== 'supervisor' || rest[1] !== 'readback') {
    return null;
  }

  let obligationLedgerPath = '';
  let decisionLedgerPath = '';
  let obligationId = '';
  let currentIdentity: PaperAutonomyStageRunIdentity | null = null;

  for (let index = 2; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--obligation-ledger' && value) {
      obligationLedgerPath = value;
      index += 1;
    } else if (token === '--decision-ledger' && value) {
      decisionLedgerPath = value;
      index += 1;
    } else if (token === '--obligation-id' && value) {
      obligationId = value;
      index += 1;
    } else if (token === '--current-identity' && value) {
      currentIdentity = parsePaperAutonomyStageRunIdentity(parsePayload(value));
      index += 1;
    } else if (token === '--current-identity-file' && value) {
      currentIdentity = parsePaperAutonomyStageRunIdentity(parsePayloadFile(value));
      index += 1;
    } else {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Unknown family-runtime paper-autonomy supervisor readback option: ${token}.`,
        {
          option: token,
          usage: 'opl family-runtime paper-autonomy supervisor readback --obligation-ledger <path> --decision-ledger <path> --obligation-id <id> --current-identity <json>|--current-identity-file <path>',
        },
      );
    }
  }

  const missing = [
    obligationLedgerPath ? null : '--obligation-ledger',
    decisionLedgerPath ? null : '--decision-ledger',
    obligationId ? null : '--obligation-id',
    currentIdentity ? null : '--current-identity or --current-identity-file',
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime paper-autonomy supervisor readback requires obligation ledger, decision ledger, obligation id, and current identity.',
      {
        required: missing,
      },
    );
  }
  if (!currentIdentity) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime paper-autonomy supervisor readback requires current identity.',
      {
        required: ['--current-identity', '--current-identity-file'],
      },
    );
  }

  return {
    mode: 'paper_autonomy_supervisor_readback',
    input: {
      obligation_ledger_path: obligationLedgerPath,
      decision_ledger_path: decisionLedgerPath,
      obligation_id: obligationId,
      current_identity: currentIdentity,
    },
  };
}

function parsePaperAutonomyStageRunIdentity(
  payload: Record<string, unknown>,
): PaperAutonomyStageRunIdentity {
  const stagePacketRefs = Array.isArray(payload.stage_packet_refs)
    ? payload.stage_packet_refs.filter((value): value is string => typeof value === 'string')
    : [];
  if (stagePacketRefs.length === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime paper-autonomy supervisor readback current identity requires stage_packet_refs.',
      {
        field: 'stage_packet_refs',
      },
    );
  }
  return {
    stage_run_id: stringField(payload, 'stage_run_id'),
    route_identity_key: stringField(payload, 'route_identity_key'),
    attempt_idempotency_key: stringField(payload, 'attempt_idempotency_key'),
    selected_dispatch_ref: stringField(payload, 'selected_dispatch_ref'),
    stage_packet_ref: stringField(payload, 'stage_packet_ref'),
    stage_packet_refs: stagePacketRefs,
    provider_attempt_ref: stringField(payload, 'provider_attempt_ref'),
    attempt_lease_ref: stringField(payload, 'attempt_lease_ref'),
    workflow_ref: stringField(payload, 'workflow_ref'),
    source_fingerprint: stringField(payload, 'source_fingerprint'),
    truth_epoch: stringField(payload, 'truth_epoch'),
    runtime_health_epoch: stringField(payload, 'runtime_health_epoch'),
    work_unit_fingerprint: stringField(payload, 'work_unit_fingerprint'),
  };
}

function stringField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `family-runtime paper-autonomy supervisor readback current identity requires ${field}.`,
      {
        field,
      },
    );
  }
  return value;
}
