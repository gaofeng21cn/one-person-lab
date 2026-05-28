import { FrameworkContractError } from '../contracts.ts';
import {
  assertMagManifestSustainedConsumptionReceiptInputReady,
  preflightMagManifestSustainedConsumptionReceiptInput,
  recordMagManifestSustainedConsumptionReceipts,
  verifyMagManifestSustainedConsumptionReceipt,
  type MagManifestSustainedConsumptionReceiptInput,
} from '../mag-manifest-sustained-consumption-ledger.ts';

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  const scalar = stringValue(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return keys.flatMap((key) => stringList(payload[key]));
}

function magManifestSustainedConsumptionInput(
  route: JsonRecord,
  payload: JsonRecord,
): MagManifestSustainedConsumptionReceiptInput {
  return {
    target_identity: isRecord(route.target_identity) ? route.target_identity : {},
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

export function magManifestSustainedConsumptionExecution(
  route: JsonRecord,
  payload: JsonRecord,
  options: { dryRun: boolean },
) {
  const actionKind = stringValue(route.action_kind);
  if (actionKind === 'mag_manifest_sustained_consumption_followthrough_receipt_verify') {
    const receiptRef = stringValue(route.receipt_ref) ?? stringValue(payload.receipt_ref);
    return {
      executionKind: 'opl_cli_mag_manifest_sustained_consumption_followthrough_apply',
      runtimeArgs: [
        'runtime',
        'mag-manifest-sustained-consumption',
        'verify',
        ...(receiptRef ? ['--receipt-ref', receiptRef] : []),
      ],
      result: options.dryRun
        ? null
        : {
            mag_manifest_sustained_consumption_followthrough_ledger_verify:
              verifyMagManifestSustainedConsumptionReceipt({ receipt_ref: receiptRef }),
          },
    };
  }

  if (actionKind !== 'mag_manifest_sustained_consumption_followthrough_receipt_record') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Unsupported MAG manifest sustained consumption followthrough action kind.',
      {
        action_kind: actionKind,
        supported_action_kinds: [
          'mag_manifest_sustained_consumption_followthrough_receipt_record',
          'mag_manifest_sustained_consumption_followthrough_receipt_verify',
        ],
      },
    );
  }

  const input = magManifestSustainedConsumptionInput(route, payload);
  const preflight = options.dryRun
    ? preflightMagManifestSustainedConsumptionReceiptInput(input, payload)
    : assertMagManifestSustainedConsumptionReceiptInputReady(input, payload);
  return {
    executionKind: 'opl_cli_mag_manifest_sustained_consumption_followthrough_apply',
    runtimeArgs: ['runtime', 'mag-manifest-sustained-consumption', 'record'],
    result: options.dryRun
      ? {
          mag_manifest_sustained_consumption_followthrough_payload_preflight: preflight,
        }
      : {
          mag_manifest_sustained_consumption_followthrough_payload_preflight: preflight,
          mag_manifest_sustained_consumption_followthrough_ledger_record:
            recordMagManifestSustainedConsumptionReceipts([input], {
              rawPayloads: [payload],
            }),
        },
  };
}
