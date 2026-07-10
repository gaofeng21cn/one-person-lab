import {
  listOwnerEvidenceSustainedConsumptionReceipts,
  recordOwnerEvidenceSustainedConsumptionReceipts,
  verifyOwnerEvidenceSustainedConsumptionReceipt,
  type OwnerEvidenceSustainedConsumptionReceiptInput,
} from '../../../modules/ledger/owner-evidence-sustained-consumption-ledger.ts';
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
): OwnerEvidenceSustainedConsumptionReceiptInput {
  return {
    target_identity: targetIdentity,
    source_ref: readOptionalString(payload.source_ref),
    app_operator_consumption_refs: readStringList(
      payload.app_operator_consumption_refs ?? payload.app_operator_consumption_ref,
    ),
    default_caller_consumption_refs: readStringList(
      payload.default_caller_consumption_refs ?? payload.default_caller_consumption_ref,
    ),
    owner_payload_response_refs: readStringList(
      payload.owner_payload_response_refs ?? payload.owner_payload_response_ref,
    ),
    workspace_receipt_scaleout_evidence_refs: readStringList(
      payload.workspace_receipt_scaleout_evidence_refs
        ?? payload.workspace_receipt_scaleout_evidence_ref,
    ),
    no_forbidden_write_refs: readStringList(
      payload.no_forbidden_write_refs ?? payload.no_forbidden_write_ref,
    ),
    long_soak_or_typed_blocker_refs: readStringList(
      payload.long_soak_or_typed_blocker_refs ?? payload.long_soak_or_typed_blocker_ref,
    ),
    typed_blocker_refs: readStringList(payload.typed_blocker_refs ?? payload.typed_blocker_ref),
    receipt_ref: readOptionalString(payload.receipt_ref),
  };
}

function parseRecordArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
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
      'runtime owner-evidence-sustained-consumption record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  if (!targetIdentityValue) {
    throw buildUsageError(
      'runtime owner-evidence-sustained-consumption record requires --target-identity.',
      spec,
      { required: ['--target-identity'] },
    );
  }
  const payload = parseJsonObject(
    payloadValue,
    'runtime owner-evidence-sustained-consumption record payload must be a JSON object.',
    spec,
  );
  const targetIdentity = parseJsonObject(
    targetIdentityValue,
    'runtime owner-evidence-sustained-consumption target identity must be a JSON object.',
    spec,
  );
  return {
    input: payloadInput(payload, targetIdentity),
    rawPayload: payload,
  };
}

function parseVerifyArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError(
      'runtime owner-evidence-sustained-consumption verify requires --receipt-ref value.',
      spec,
      { option: '--receipt-ref' },
    );
  }
  return { receipt_ref: receiptRef ?? null };
}

export function buildRuntimeOwnerEvidenceSustainedConsumptionCommandSpecs():
Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime owner-evidence-sustained-consumption record': {
      usage:
        'opl runtime owner-evidence-sustained-consumption record --target-identity <json> (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only owner-evidence sustained-consumption evidence without creating domain owner receipts or readiness claims.',
      examples: [
        'opl runtime owner-evidence-sustained-consumption record --target-identity \'{"domain_id":"example-domain"}\' --payload \'{"typed_blocker_refs":["typed-blocker:owner-consumption/open"]}\'',
      ],
      handler: (args) => {
        const parsed = parseRecordArgs(
          args,
          commandSpecs['runtime owner-evidence-sustained-consumption record'],
        );
        return {
          owner_evidence_sustained_consumption_ledger_record:
            recordOwnerEvidenceSustainedConsumptionReceipts([parsed.input], {
              rawPayloads: [parsed.rawPayload],
            }),
        };
      },
    },
    'runtime owner-evidence-sustained-consumption verify': {
      usage: 'opl runtime owner-evidence-sustained-consumption verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only owner-evidence sustained-consumption receipt without claiming App sustained consumption or production readiness.',
      examples: [
        'opl runtime owner-evidence-sustained-consumption verify --receipt-ref opl://owner-evidence/sustained-consumption/example-domain',
      ],
      handler: (args) => ({
        owner_evidence_sustained_consumption_ledger_verify:
          verifyOwnerEvidenceSustainedConsumptionReceipt(
            parseVerifyArgs(
              args,
              commandSpecs['runtime owner-evidence-sustained-consumption verify'],
            ),
          ),
      }),
    },
    'runtime owner-evidence-sustained-consumption list': {
      usage: 'opl runtime owner-evidence-sustained-consumption list',
      summary:
        'List refs-only owner-evidence sustained-consumption receipts in the local OPL state ledger.',
      examples: ['opl runtime owner-evidence-sustained-consumption list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime owner-evidence-sustained-consumption list']);
        const receipts = listOwnerEvidenceSustainedConsumptionReceipts();
        return {
          owner_evidence_sustained_consumption_ledger: {
            surface_kind:
              'opl_owner_evidence_sustained_consumption_ledger_projection',
            receipt_count: receipts.length,
            recorded_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
            verified_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_write_domain_truth: false,
              can_read_memory_body: false,
              can_read_artifact_body: false,
              can_create_owner_receipt: false,
              can_generate_typed_blocker: false,
              can_claim_sustained_app_consumption_complete: false,
              can_claim_submission_ready: false,
              can_claim_provider_long_soak_complete: false,
              can_claim_production_ready: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
