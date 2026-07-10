import {
  listDomainOwnerPayloadSummaryReceipts,
  recordDomainOwnerPayloadSummaryReceipts,
  verifyDomainOwnerPayloadSummaryReceipt,
  type DomainOwnerPayloadSummaryReceiptInput,
} from '../../../modules/ledger/domain-owner-payload-summary-ledger.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseJsonObject(
  value: string,
  message: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  return readJsonObject(value, spec, {
    parseErrorMessage: message,
    objectErrorMessage: message,
  });
}

function payloadInput(
  payload: Record<string, unknown>,
  targetIdentity: Record<string, unknown>,
): DomainOwnerPayloadSummaryReceiptInput {
  return {
    target_identity: targetIdentity,
    source_ref: readOptionalString(payload.source_ref),
    domain_owner_receipt_refs: readStringList(
      payload.domain_owner_receipt_refs ?? payload.domain_owner_receipt_ref,
    ),
    domain_receipt_refs: readStringList(
      payload.domain_receipt_refs ?? payload.domain_receipt_ref ?? payload.receipt_refs,
    ),
    no_regression_evidence_refs: readStringList(
      payload.no_regression_evidence_refs ?? payload.no_regression_evidence_ref
        ?? payload.no_regression_refs ?? payload.no_regression_ref,
    ),
    owner_chain_refs: readStringList(payload.owner_chain_refs ?? payload.owner_chain_ref),
    human_gate_refs: readStringList(payload.human_gate_refs ?? payload.human_gate_ref),
    quality_or_export_receipt_refs: readStringList(
      payload.quality_or_export_receipt_refs ?? payload.quality_or_export_receipt_ref
        ?? payload.quality_gate_receipt_refs ?? payload.quality_gate_receipt_ref
        ?? payload.export_receipt_refs ?? payload.export_receipt_ref,
    ),
    reviewer_receipt_refs: readStringList(
      payload.reviewer_receipt_refs ?? payload.reviewer_receipt_ref,
    ),
    long_soak_refs: readStringList(payload.long_soak_refs ?? payload.long_soak_ref),
    monitor_freshness_refs: readStringList(
      payload.monitor_freshness_refs ?? payload.monitor_freshness_ref,
    ),
    runtime_event_refs: readStringList(payload.runtime_event_refs ?? payload.runtime_event_ref),
    typed_blocker_refs: readStringList(payload.typed_blocker_refs ?? payload.typed_blocker_ref),
    receipt_ref: readOptionalString(payload.receipt_ref),
  };
}

function parseRuntimeDomainOwnerPayloadSummaryRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = parseCommandOptions(args, spec, {
    payload: { type: 'string', multiple: true },
    'payload-file': { type: 'string', multiple: true },
    'target-identity': { type: 'string' },
  });
  const inlinePayloads = parsed.payload as string[] | undefined;
  const payloadFiles = parsed['payload-file'] as string[] | undefined;
  const targetIdentityValue = parsed['target-identity'] as string | undefined;
  assertSinglePayloadSource((inlinePayloads?.length ?? 0) + (payloadFiles?.length ?? 0) > 1, spec);
  const inlinePayload = inlinePayloads?.[0];
  const payloadFile = payloadFiles?.[0];
  const payloadValue = inlinePayload ?? (payloadFile ? readPayloadFileText(payloadFile, spec) : null);
  if (!payloadValue) {
    throw buildUsageError(
      'runtime domain-owner-payload-summary record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  if (!targetIdentityValue) {
    throw buildUsageError(
      'runtime domain-owner-payload-summary record requires --target-identity.',
      spec,
      { required: ['--target-identity'] },
    );
  }
  const payload = parseJsonObject(
    payloadValue,
    'runtime domain-owner-payload-summary record payload must be a JSON object.',
    spec,
  );
  const targetIdentity = parseJsonObject(
    targetIdentityValue,
    'runtime domain-owner-payload-summary target identity must be a JSON object.',
    spec,
  );
  return {
    input: payloadInput(payload, targetIdentity),
    rawPayload: payload,
  };
}

function parseRuntimeDomainOwnerPayloadSummaryVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError(
      'runtime domain-owner-payload-summary verify requires --receipt-ref value.',
      spec,
      { option: '--receipt-ref' },
    );
  }
  return { receipt_ref: receiptRef ?? null };
}

export function buildRuntimeDomainOwnerPayloadSummaryCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime domain-owner-payload-summary record': {
      usage:
        'opl runtime domain-owner-payload-summary record --target-identity <json> (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only domain owner payload summary evidence without creating owner receipts, typed blockers, or readiness claims.',
      examples: [
        'opl runtime domain-owner-payload-summary record --target-identity \'{"domain_id":"redcube","summary_kind":"owner_payload_item","item_id":"owner_chain_apply"}\' --payload \'{"owner_chain_refs":["rca:owner-chain"]}\'',
      ],
      handler: (args) => {
        const parsed = parseRuntimeDomainOwnerPayloadSummaryRecordArgs(
          args,
          commandSpecs['runtime domain-owner-payload-summary record'],
        );
        return {
          domain_owner_payload_summary_ledger_record:
            recordDomainOwnerPayloadSummaryReceipts([parsed.input], {
              rawPayloads: [parsed.rawPayload],
            }),
        };
      },
    },
    'runtime domain-owner-payload-summary verify': {
      usage: 'opl runtime domain-owner-payload-summary verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only domain owner payload summary receipt without claiming domain or production readiness.',
      examples: [
        'opl runtime domain-owner-payload-summary verify --receipt-ref opl://domain-owner-payload-summary/redcube%2Fowner_payload_item%2Fowner_chain_apply',
      ],
      handler: (args) => ({
        domain_owner_payload_summary_ledger_verify:
          verifyDomainOwnerPayloadSummaryReceipt(
            parseRuntimeDomainOwnerPayloadSummaryVerifyArgs(
              args,
              commandSpecs['runtime domain-owner-payload-summary verify'],
            ),
          ),
      }),
    },
    'runtime domain-owner-payload-summary list': {
      usage: 'opl runtime domain-owner-payload-summary list',
      summary:
        'List refs-only domain owner payload summary receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime domain-owner-payload-summary list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime domain-owner-payload-summary list']);
        const receipts = listDomainOwnerPayloadSummaryReceipts();
        return {
          domain_owner_payload_summary_ledger: {
            surface_kind: 'opl_domain_owner_payload_summary_ledger_projection',
            receipt_count: receipts.length,
            recorded_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
            verified_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_write_domain_truth: false,
              can_write_memory_body: false,
              can_read_memory_body: false,
              can_read_artifact_body: false,
              can_mutate_artifact_body: false,
              can_create_owner_receipt: false,
              can_generate_typed_blocker: false,
              can_close_owner_chain: false,
              can_close_domain_ready: false,
              can_claim_domain_ready: false,
              can_claim_production_ready: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
