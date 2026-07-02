import {
  listStageReplayMissingReceiptReceipts,
  recordStageReplayMissingReceiptReceipts,
  verifyStageReplayMissingReceiptReceipt,
  type StageReplayMissingReceiptInput,
} from '../../../modules/stagecraft/stage-replay-missing-receipt-ledger.ts';
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
): StageReplayMissingReceiptInput {
  return {
    target_identity: targetIdentity,
    source_ref: optionalString(payload.source_ref),
    receipt_refs: stringList(payload.receipt_refs ?? payload.receipt_ref),
    typed_blocker_refs: stringList(payload.typed_blocker_refs ?? payload.typed_blocker_ref),
    receipt_ref: optionalString(payload.receipt_ref),
  };
}

function parseRecordArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  let payload: Record<string, unknown> | null = null;
  let targetIdentity: Record<string, unknown> | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime stage-replay-missing-receipt record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseJsonObject(
        value,
        'runtime stage-replay-missing-receipt record payload must be a JSON object.',
        spec,
      );
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime stage-replay-missing-receipt record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseJsonObject(
        readPayloadFileText(value, spec),
        'runtime stage-replay-missing-receipt record payload must be a JSON object.',
        spec,
      );
      continue;
    }
    if (token === '--target-identity') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime stage-replay-missing-receipt record requires --target-identity value.',
          spec,
          { option: '--target-identity' },
        );
      }
      targetIdentity = parseJsonObject(
        value,
        'runtime stage-replay-missing-receipt target identity must be a JSON object.',
        spec,
      );
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime stage-replay-missing-receipt record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime stage-replay-missing-receipt record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  if (!targetIdentity) {
    throw buildUsageError(
      'runtime stage-replay-missing-receipt record requires --target-identity.',
      spec,
      { required: ['--target-identity'] },
    );
  }
  return {
    input: payloadInput(payload, targetIdentity),
    rawPayload: payload,
  };
}

function parseVerifyArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(
        `Unknown option for runtime stage-replay-missing-receipt verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime stage-replay-missing-receipt verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
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
