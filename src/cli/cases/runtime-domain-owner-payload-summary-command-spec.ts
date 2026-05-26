import {
  listDomainOwnerPayloadSummaryReceipts,
  recordDomainOwnerPayloadSummaryReceipts,
  verifyDomainOwnerPayloadSummaryReceipt,
  type DomainOwnerPayloadSummaryReceiptInput,
} from '../../domain-owner-payload-summary-ledger.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function parseJsonObject(
  value: string,
  message: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError(message, spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(message, spec);
  }
  return parsed;
}

function payloadInput(
  payload: Record<string, unknown>,
  targetIdentity: Record<string, unknown>,
): DomainOwnerPayloadSummaryReceiptInput {
  return {
    target_identity: targetIdentity,
    source_ref: optionalString(payload.source_ref),
    domain_owner_receipt_refs: stringList(
      payload.domain_owner_receipt_refs ?? payload.domain_owner_receipt_ref,
    ),
    domain_receipt_refs: stringList(
      payload.domain_receipt_refs ?? payload.domain_receipt_ref ?? payload.receipt_refs,
    ),
    no_regression_evidence_refs: stringList(
      payload.no_regression_evidence_refs ?? payload.no_regression_evidence_ref
        ?? payload.no_regression_refs ?? payload.no_regression_ref,
    ),
    owner_chain_refs: stringList(payload.owner_chain_refs ?? payload.owner_chain_ref),
    monitor_freshness_refs: stringList(
      payload.monitor_freshness_refs ?? payload.monitor_freshness_ref,
    ),
    runtime_event_refs: stringList(payload.runtime_event_refs ?? payload.runtime_event_ref),
    typed_blocker_refs: stringList(payload.typed_blocker_refs ?? payload.typed_blocker_ref),
    receipt_ref: optionalString(payload.receipt_ref),
  };
}

function parseRuntimeDomainOwnerPayloadSummaryRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: Record<string, unknown> | null = null;
  let targetIdentity: Record<string, unknown> | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime domain-owner-payload-summary record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseJsonObject(
        value,
        'runtime domain-owner-payload-summary record payload must be a JSON object.',
        spec,
      );
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime domain-owner-payload-summary record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseJsonObject(
        readPayloadFileText(value, spec),
        'runtime domain-owner-payload-summary record payload must be a JSON object.',
        spec,
      );
      continue;
    }
    if (token === '--target-identity') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime domain-owner-payload-summary record requires --target-identity value.',
          spec,
          { option: '--target-identity' },
        );
      }
      targetIdentity = parseJsonObject(
        value,
        'runtime domain-owner-payload-summary target identity must be a JSON object.',
        spec,
      );
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime domain-owner-payload-summary record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime domain-owner-payload-summary record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  if (!targetIdentity) {
    throw buildUsageError(
      'runtime domain-owner-payload-summary record requires --target-identity.',
      spec,
      { required: ['--target-identity'] },
    );
  }
  return {
    input: payloadInput(payload, targetIdentity),
    rawPayload: payload,
  };
}

function parseRuntimeDomainOwnerPayloadSummaryVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(
        `Unknown option for runtime domain-owner-payload-summary verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime domain-owner-payload-summary verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
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
