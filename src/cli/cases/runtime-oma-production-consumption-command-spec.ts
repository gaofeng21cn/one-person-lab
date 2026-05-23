import {
  listOmaProductionConsumptionReceipts,
  recordOmaProductionConsumptionReceipts,
  verifyOmaProductionConsumptionReceipt,
  type OmaProductionConsumptionReceiptInput,
} from '../../oma-production-consumption-ledger.ts';
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

function parseRuntimeOmaProductionConsumptionPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OmaProductionConsumptionReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError('runtime oma-production-consumption record payload must be valid JSON.', spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError('runtime oma-production-consumption record payload must be a JSON object.', spec);
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
    typed_blocker_refs: stringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    operator_evidence_refs: stringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
  };
}

function parseRuntimeOmaProductionConsumptionRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: OmaProductionConsumptionReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime oma-production-consumption record requires --payload.', spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeOmaProductionConsumptionPayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime oma-production-consumption record requires --payload-file.', spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeOmaProductionConsumptionPayload(readPayloadFileText(value, spec), spec);
      continue;
    }
    throw buildUsageError(`Unknown option for runtime oma-production-consumption record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError('runtime oma-production-consumption record requires --payload or --payload-file.', spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return payload;
}

function parseRuntimeOmaProductionConsumptionVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(`Unknown option for runtime oma-production-consumption verify: ${token}.`, spec, {
        option: token,
      });
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime oma-production-consumption verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

function omaProductionConsumptionAuthorityBoundary() {
  return {
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
    can_promote_default_agent_without_gate: false,
  };
}

export function buildRuntimeOmaProductionConsumptionCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime oma-production-consumption record': {
      usage: 'opl runtime oma-production-consumption record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only OMA production-consumption long-soak or typed blocker refs without claiming production readiness.',
      examples: [
        'opl runtime oma-production-consumption record --payload \'{"long_soak_refs":["long-soak:oma"],"operator_evidence_refs":["monitor:oma"]}\'',
        'opl runtime oma-production-consumption record --payload-file payload.json',
      ],
      handler: (args) => ({
        oma_production_consumption_ledger_record: recordOmaProductionConsumptionReceipts([
          parseRuntimeOmaProductionConsumptionRecordArgs(
            args,
            commandSpecs['runtime oma-production-consumption record'],
          ),
        ]),
      }),
    },
    'runtime oma-production-consumption verify': {
      usage: 'opl runtime oma-production-consumption verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only OMA production-consumption receipt without claiming production readiness.',
      examples: [
        'opl runtime oma-production-consumption verify --receipt-ref opl://oma-production-consumption/long-soak%3Aoma',
      ],
      handler: (args) => ({
        oma_production_consumption_ledger_verify: verifyOmaProductionConsumptionReceipt(
          parseRuntimeOmaProductionConsumptionVerifyArgs(
            args,
            commandSpecs['runtime oma-production-consumption verify'],
          ),
        ),
      }),
    },
    'runtime oma-production-consumption list': {
      usage: 'opl runtime oma-production-consumption list',
      summary:
        'List refs-only OMA production-consumption receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime oma-production-consumption list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime oma-production-consumption list']);
        const receipts = listOmaProductionConsumptionReceipts();
        return {
          oma_production_consumption_ledger: {
            surface_kind: 'opl_oma_production_consumption_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            authority_boundary: omaProductionConsumptionAuthorityBoundary(),
          },
        };
      },
    },
  };
  return commandSpecs;
}
