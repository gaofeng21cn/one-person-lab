import {
  listStageReplayMissingReceiptReceipts,
  recordStageReplayMissingReceiptReceipts,
  verifyStageReplayMissingReceiptReceipt,
  type StageReplayMissingReceiptInput,
} from '../../../modules/stagecraft/stage-replay-missing-receipt-ledger.ts';
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
): StageReplayMissingReceiptInput {
  return {
    target_identity: targetIdentity,
    source_ref: readOptionalString(payload.source_ref),
    receipt_refs: readStringList(payload.receipt_refs ?? payload.receipt_ref),
    typed_blocker_refs: readStringList(payload.typed_blocker_refs ?? payload.typed_blocker_ref),
    receipt_ref: readOptionalString(payload.receipt_ref),
  };
}

function parseRecordArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const values = parseCommandOptions(args, spec, {
    payload: { type: 'string' },
    'payload-file': { type: 'string' },
    'target-identity': { type: 'string' },
  });
  const payloadValue = values.payload as string | undefined;
  const payloadFile = values['payload-file'] as string | undefined;
  const targetIdentityValue = values['target-identity'] as string | undefined;
  const hasPayload = payloadValue !== undefined;
  const hasPayloadFile = payloadFile !== undefined;
  assertSinglePayloadSource(hasPayload && hasPayloadFile, spec);
  if (!hasPayload && !hasPayloadFile) {
    throw buildUsageError(
      'runtime stage-replay-missing-receipt record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  if (!targetIdentityValue) {
    throw buildUsageError(
      'runtime stage-replay-missing-receipt record requires --target-identity.',
      spec,
      { required: ['--target-identity'] },
    );
  }
  const payload = parseJsonObject(
    hasPayload ? payloadValue as string : readPayloadFileText(payloadFile as string, spec),
    'runtime stage-replay-missing-receipt record payload must be a JSON object.',
    spec,
  );
  const targetIdentity = parseJsonObject(
    targetIdentityValue,
    'runtime stage-replay-missing-receipt target identity must be a JSON object.',
    spec,
  );
  return {
    input: payloadInput(payload, targetIdentity),
    rawPayload: payload,
  };
}

function parseVerifyArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const values = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  });
  return { receipt_ref: values['receipt-ref'] as string | undefined ?? null };
}

export function buildRuntimeStageReplayMissingReceiptCommandSpecs():
Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime stage-replay-missing-receipt record': {
      usage:
        'opl runtime stage-replay-missing-receipt record --target-identity <json> (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only stage replay missing receipt evidence without requerying humans or creating owner receipts.',
      examples: [
        'opl runtime stage-replay-missing-receipt record --target-identity \'{"domain_id":"redcube_ai","stage_id":"visual_direction","missing_ref":"human_gate:redcube_operator_review_gate"}\' --payload \'{"typed_blocker_refs":["typed-blocker:rca/operator-review-pending"]}\'',
      ],
      handler: (args) => {
        const parsed = parseRecordArgs(
          args,
          commandSpecs['runtime stage-replay-missing-receipt record'],
        );
        return {
          stage_replay_missing_receipt_ledger_record:
            recordStageReplayMissingReceiptReceipts([parsed.input], {
              rawPayloads: [parsed.rawPayload],
            }),
        };
      },
    },
    'runtime stage-replay-missing-receipt verify': {
      usage: 'opl runtime stage-replay-missing-receipt verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only stage replay missing receipt record without claiming domain or production readiness.',
      examples: [
        'opl runtime stage-replay-missing-receipt verify --receipt-ref opl://stage-replay-missing-receipt/redcube_ai%2Fvisual_direction%2Fhuman_gate%3Aredcube_operator_review_gate',
      ],
      handler: (args) => ({
        stage_replay_missing_receipt_ledger_verify:
          verifyStageReplayMissingReceiptReceipt(
            parseVerifyArgs(
              args,
              commandSpecs['runtime stage-replay-missing-receipt verify'],
            ),
          ),
      }),
    },
    'runtime stage-replay-missing-receipt list': {
      usage: 'opl runtime stage-replay-missing-receipt list',
      summary:
        'List refs-only stage replay missing receipt receipts in the local OPL state ledger.',
      examples: ['opl runtime stage-replay-missing-receipt list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime stage-replay-missing-receipt list']);
        const receipts = listStageReplayMissingReceiptReceipts();
        return {
          stage_replay_missing_receipt_ledger: {
            surface_kind: 'opl_stage_replay_missing_receipt_ledger_projection',
            receipt_count: receipts.length,
            recorded_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
            verified_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_execute_domain_action: false,
              can_requery_human: false,
              can_write_domain_truth: false,
              can_create_owner_receipt: false,
              can_generate_typed_blocker: false,
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
