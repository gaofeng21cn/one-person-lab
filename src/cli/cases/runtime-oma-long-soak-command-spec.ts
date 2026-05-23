import {
  listOmaLongSoakReceipts,
  recordOmaLongSoakReceipts,
  type OmaLongSoakReceiptInput,
} from '../../oma-long-soak-ledger.ts';
import { assertNoArgs, buildUsageError } from '../modules/support.ts';
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

function parseRuntimeOmaLongSoakPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OmaLongSoakReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError('runtime oma-long-soak record payload must be valid JSON.', spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError('runtime oma-long-soak record payload must be a JSON object.', spec);
  }
  return {
    long_soak_refs: [
      ...stringList(parsed.long_soak_refs ?? parsed.long_soak_ref),
      ...stringList(parsed.operator_long_soak_refs ?? parsed.operator_long_soak_ref),
      ...stringList(parsed.production_soak_refs ?? parsed.production_soak_ref),
      ...stringList(
        parsed.agent_lab_rerun_long_soak_refs ?? parsed.agent_lab_rerun_long_soak_ref,
      ),
    ],
    operator_evidence_refs: stringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
  };
}

function parseRuntimeOmaLongSoakRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: OmaLongSoakReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime oma-long-soak record requires --payload.', spec, {
          required: ['--payload'],
        });
      }
      payload = parseRuntimeOmaLongSoakPayload(value, spec);
      continue;
    }
    throw buildUsageError(`Unknown option for runtime oma-long-soak record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError('runtime oma-long-soak record requires --payload.', spec, {
      required: ['--payload'],
    });
  }
  return payload;
}

export function buildRuntimeOmaLongSoakCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime oma-long-soak record': {
      usage: 'opl runtime oma-long-soak record --payload <json>',
      summary:
        'Record refs-only OMA long-soak evidence refs without claiming production readiness.',
      examples: [
        'opl runtime oma-long-soak record --payload \'{"long_soak_refs":["long-soak:oma"],"operator_evidence_refs":["receipt:oma-soak"]}\'',
      ],
      handler: (args) => ({
        oma_long_soak_ledger_record: recordOmaLongSoakReceipts([
          parseRuntimeOmaLongSoakRecordArgs(
            args,
            commandSpecs['runtime oma-long-soak record'],
          ),
        ]),
      }),
    },
    'runtime oma-long-soak list': {
      usage: 'opl runtime oma-long-soak list',
      summary:
        'List refs-only OMA long-soak receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime oma-long-soak list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime oma-long-soak list']);
        const receipts = listOmaLongSoakReceipts();
        return {
          oma_long_soak_ledger: {
            surface_kind: 'opl_oma_long_soak_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_write_domain_truth: false,
              can_write_domain_memory_body: false,
              can_read_domain_memory_body: false,
              can_read_domain_artifact_body: false,
              can_mutate_domain_artifact_body: false,
              can_create_domain_owner_receipt: false,
              can_claim_domain_ready: false,
              can_claim_production_ready: false,
              can_authorize_quality_or_export: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
