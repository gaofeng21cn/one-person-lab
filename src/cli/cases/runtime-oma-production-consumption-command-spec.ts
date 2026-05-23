import {
  listOmaProductionConsumptionReceipts,
  recordOmaProductionConsumptionReceipts,
  verifyOmaProductionConsumptionReceipt,
  type OmaProductionConsumptionReceiptInput,
} from '../../oma-production-consumption-ledger.ts';
import {
  finishOmaLongSoakObservation,
  startOmaLongSoakObservation,
} from '../../oma-long-soak-observation.ts';
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

function parsePositiveInteger(
  value: string | undefined,
  option: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (!value) {
    throw buildUsageError(`runtime oma-production-consumption long-soak start requires ${option}.`, spec, {
      option,
    });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw buildUsageError(`${option} must be a positive integer.`, spec, {
      option,
      value,
    });
  }
  return parsed;
}

function parseRuntimeOmaLongSoakStartArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let evidenceDir: string | null = null;
  let minimumDurationMinutes: number | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--evidence-dir' && value) {
      evidenceDir = value;
      index += 1;
      continue;
    }
    if (token === '--minimum-duration-minutes') {
      minimumDurationMinutes = parsePositiveInteger(value, token, spec);
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime oma-production-consumption long-soak start: ${token}.`, spec, {
      option: token,
    });
  }
  if (!minimumDurationMinutes) {
    throw buildUsageError(
      'runtime oma-production-consumption long-soak start requires --minimum-duration-minutes.',
      spec,
      { required: ['--minimum-duration-minutes'] },
    );
  }
  if (!evidenceDir) {
    throw buildUsageError(
      'runtime oma-production-consumption long-soak start requires --evidence-dir.',
      spec,
      { required: ['--evidence-dir'] },
    );
  }
  return {
    evidenceDir,
    minimumDurationMinutes,
  };
}

function parseRuntimeOmaLongSoakFinishArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let workorderFile = '';
  let finishedAt: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--workorder-file' && value) {
      workorderFile = value;
      index += 1;
      continue;
    }
    if (token === '--finished-at' && value) {
      finishedAt = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime oma-production-consumption long-soak finish: ${token}.`, spec, {
      option: token,
    });
  }
  if (!workorderFile) {
    throw buildUsageError(
      'runtime oma-production-consumption long-soak finish requires --workorder-file.',
      spec,
      { required: ['--workorder-file'] },
    );
  }
  return { workorderFile, finishedAt };
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
    'runtime oma-production-consumption long-soak start': {
      usage:
        'opl runtime oma-production-consumption long-soak start --minimum-duration-minutes <n> --evidence-dir <path>',
      summary:
        'Prepare a body-local OMA long-soak observation workorder without recording production-consumption evidence.',
      examples: [
        'opl runtime oma-production-consumption long-soak start --minimum-duration-minutes 240 --evidence-dir /tmp/opl-oma-long-soak',
      ],
      handler: (args) => ({
        oma_long_soak_observation_start:
          startOmaLongSoakObservation(
            parseRuntimeOmaLongSoakStartArgs(
              args,
              commandSpecs['runtime oma-production-consumption long-soak start'],
            ),
          ),
      }),
    },
    'runtime oma-production-consumption long-soak finish': {
      usage:
        'opl runtime oma-production-consumption long-soak finish --workorder-file <path> [--finished-at <iso>]',
      summary:
        'Materialize an OMA long-soak evidence ref and record payload only after the observation workorder passes preflight.',
      examples: [
        'opl runtime oma-production-consumption long-soak finish --workorder-file /tmp/opl-oma-long-soak/oma-long-soak-workorder.json',
      ],
      handler: (args) => ({
        oma_long_soak_observation_finish:
          finishOmaLongSoakObservation(
            parseRuntimeOmaLongSoakFinishArgs(
              args,
              commandSpecs['runtime oma-production-consumption long-soak finish'],
            ),
          ),
      }),
    },
  };
  return commandSpecs;
}
