import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  record,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  assertOwnerEvidenceSustainedConsumptionReceiptInputReady,
  preflightOwnerEvidenceSustainedConsumptionReceiptInput,
  recordOwnerEvidenceSustainedConsumptionReceipts,
  verifyOwnerEvidenceSustainedConsumptionReceipt,
  type OwnerEvidenceSustainedConsumptionReceiptInput,
} from '../../ledger/index.ts';

function stringList(value: unknown) {
  const scalar = stringValue(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return keys.flatMap((key) => stringList(payload[key]));
}

const RECORD_ACTION_KINDS = [
  'owner_evidence_sustained_consumption_receipt_record',
  'mag_manifest_sustained_consumption_followthrough_receipt_record',
] as const;

const VERIFY_ACTION_KINDS = [
  'owner_evidence_sustained_consumption_receipt_verify',
  'mag_manifest_sustained_consumption_followthrough_receipt_verify',
] as const;

function ownerEvidenceSustainedConsumptionInput(
  route: JsonRecord,
  payload: JsonRecord,
): OwnerEvidenceSustainedConsumptionReceiptInput {
  return {
    target_identity: record(route.target_identity),
    source_ref: stringValue(route.evidence_source_ref) ?? stringValue(route.ref),
    app_operator_consumption_refs: refsFromPayload(payload, [
      'app_operator_consumption_refs',
      'app_operator_consumption_ref',
    ]),
    default_caller_consumption_refs: refsFromPayload(payload, [
      'default_caller_consumption_refs',
      'default_caller_consumption_ref',
    ]),
    owner_payload_response_refs: refsFromPayload(payload, [
      'owner_payload_response_refs',
      'owner_payload_response_ref',
    ]),
    workspace_receipt_scaleout_evidence_refs: refsFromPayload(payload, [
      'workspace_receipt_scaleout_evidence_refs',
      'workspace_receipt_scaleout_evidence_ref',
    ]),
    no_forbidden_write_refs: refsFromPayload(payload, [
      'no_forbidden_write_refs',
      'no_forbidden_write_ref',
    ]),
    long_soak_or_typed_blocker_refs: refsFromPayload(payload, [
      'long_soak_or_typed_blocker_refs',
      'long_soak_or_typed_blocker_ref',
    ]),
    typed_blocker_refs: refsFromPayload(payload, [
      'typed_blocker_refs',
      'typed_blocker_ref',
    ]),
    receipt_ref: stringValue(payload.receipt_ref),
  };
}

export function ownerEvidenceSustainedConsumptionExecution(
  route: JsonRecord,
  payload: JsonRecord,
  options: { dryRun: boolean },
) {
  const actionKind = stringValue(route.action_kind);
  if (VERIFY_ACTION_KINDS.some((kind) => kind === actionKind)) {
    const receiptRef = stringValue(route.receipt_ref) ?? stringValue(payload.receipt_ref);
    return {
      executionKind: 'opl_cli_owner_evidence_sustained_consumption_apply',
      runtimeArgs: [
        'runtime',
        'owner-evidence-sustained-consumption',
        'verify',
        ...(receiptRef ? ['--receipt-ref', receiptRef] : []),
      ],
      result: options.dryRun
        ? null
        : {
            owner_evidence_sustained_consumption_ledger_verify:
              verifyOwnerEvidenceSustainedConsumptionReceipt({ receipt_ref: receiptRef }),
          },
    };
  }

  if (!RECORD_ACTION_KINDS.some((kind) => kind === actionKind)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Unsupported owner-evidence sustained consumption action kind.',
      {
        action_kind: actionKind,
        supported_action_kinds: [
          ...RECORD_ACTION_KINDS,
          ...VERIFY_ACTION_KINDS,
        ],
      },
    );
  }

  const input = ownerEvidenceSustainedConsumptionInput(route, payload);
  const preflight = options.dryRun
    ? preflightOwnerEvidenceSustainedConsumptionReceiptInput(input, payload)
    : assertOwnerEvidenceSustainedConsumptionReceiptInputReady(input, payload);
  return {
    executionKind: 'opl_cli_owner_evidence_sustained_consumption_apply',
    runtimeArgs: ['runtime', 'owner-evidence-sustained-consumption', 'record'],
    result: options.dryRun
      ? {
          owner_evidence_sustained_consumption_payload_preflight: preflight,
        }
      : {
          owner_evidence_sustained_consumption_payload_preflight: preflight,
          owner_evidence_sustained_consumption_ledger_record:
            recordOwnerEvidenceSustainedConsumptionReceipts([input], {
              rawPayloads: [payload],
            }),
        },
  };
}

export const magManifestSustainedConsumptionExecution =
  ownerEvidenceSustainedConsumptionExecution;
