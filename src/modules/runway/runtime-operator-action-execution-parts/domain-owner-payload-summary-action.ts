import { FrameworkContractError } from '../../charter/contracts.ts';
import {
  assertDomainOwnerPayloadSummaryReceiptInputReady,
  preflightDomainOwnerPayloadSummaryReceiptInput,
  recordDomainOwnerPayloadSummaryReceipts,
  verifyDomainOwnerPayloadSummaryReceipt,
  type DomainOwnerPayloadSummaryReceiptInput,
} from '../../ledger/domain-owner-payload-summary-ledger.ts';

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

function domainOwnerPayloadSummaryInput(
  route: JsonRecord,
  payload: JsonRecord,
): DomainOwnerPayloadSummaryReceiptInput {
  return {
    target_identity: isRecord(route.target_identity) ? route.target_identity : {},
    source_ref: stringValue(route.evidence_source_ref) ?? stringValue(route.ref),
    domain_owner_receipt_refs: refsFromPayload(payload, [
      'domain_owner_receipt_refs',
      'domain_owner_receipt_ref',
    ]),
    domain_receipt_refs: refsFromPayload(payload, [
      'domain_receipt_refs',
      'domain_receipt_ref',
      'receipt_refs',
    ]),
    no_regression_evidence_refs: refsFromPayload(payload, [
      'no_regression_evidence_refs',
      'no_regression_evidence_ref',
      'no_regression_refs',
      'no_regression_ref',
    ]),
    owner_chain_refs: refsFromPayload(payload, [
      'owner_chain_refs',
      'owner_chain_ref',
    ]),
    human_gate_refs: refsFromPayload(payload, [
      'human_gate_refs',
      'human_gate_ref',
    ]),
    quality_or_export_receipt_refs: refsFromPayload(payload, [
      'quality_or_export_receipt_refs',
      'quality_or_export_receipt_ref',
      'quality_gate_receipt_refs',
      'quality_gate_receipt_ref',
      'export_receipt_refs',
      'export_receipt_ref',
    ]),
    reviewer_receipt_refs: refsFromPayload(payload, [
      'reviewer_receipt_refs',
      'reviewer_receipt_ref',
    ]),
    long_soak_refs: refsFromPayload(payload, [
      'long_soak_refs',
      'long_soak_ref',
    ]),
    monitor_freshness_refs: refsFromPayload(payload, [
      'monitor_freshness_refs',
      'monitor_freshness_ref',
    ]),
    runtime_event_refs: refsFromPayload(payload, [
      'runtime_event_refs',
      'runtime_event_ref',
    ]),
    typed_blocker_refs: refsFromPayload(payload, [
      'typed_blocker_refs',
      'typed_blocker_ref',
    ]),
    receipt_ref: stringValue(payload.receipt_ref),
  };
}

export function domainOwnerPayloadSummaryExecution(
  route: JsonRecord,
  payload: JsonRecord,
  options: { dryRun: boolean },
) {
  const actionKind = stringValue(route.action_kind);
  if (actionKind === 'domain_owner_payload_summary_receipt_verify') {
    const receiptRef = stringValue(route.receipt_ref) ?? stringValue(payload.receipt_ref);
    return {
      executionKind: 'opl_cli_domain_owner_payload_summary_apply',
      runtimeArgs: [
        'runtime',
        'domain-owner-payload-summary',
        'verify',
        ...(receiptRef ? ['--receipt-ref', receiptRef] : []),
      ],
      result: options.dryRun
        ? null
        : {
            domain_owner_payload_summary_ledger_verify:
              verifyDomainOwnerPayloadSummaryReceipt({ receipt_ref: receiptRef }),
          },
    };
  }

  if (actionKind !== 'domain_owner_payload_summary_receipt_record') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Unsupported domain owner payload summary action kind.',
      {
        action_kind: actionKind,
        supported_action_kinds: [
          'domain_owner_payload_summary_receipt_record',
          'domain_owner_payload_summary_receipt_verify',
        ],
      },
    );
  }

  const input = domainOwnerPayloadSummaryInput(route, payload);
  const preflight = options.dryRun
    ? preflightDomainOwnerPayloadSummaryReceiptInput(input, payload)
    : assertDomainOwnerPayloadSummaryReceiptInputReady(input, payload);
  return {
    executionKind: 'opl_cli_domain_owner_payload_summary_apply',
    runtimeArgs: ['runtime', 'domain-owner-payload-summary', 'record'],
    result: options.dryRun
      ? {
          domain_owner_payload_summary_payload_preflight:
            preflight,
        }
      : {
          domain_owner_payload_summary_payload_preflight: preflight,
          domain_owner_payload_summary_ledger_record:
            recordDomainOwnerPayloadSummaryReceipts([input], {
              rawPayloads: [payload],
            }),
        },
  };
}
