import {
  listOmaProductionConsumptionReceipts,
  recordOmaProductionConsumptionReceipts,
  verifyOmaProductionConsumptionReceipt,
  type OmaProductionConsumptionReceiptInput,
} from '../../../modules/foundry-lab/oma-production-consumption-ledger.ts';
import {
  finishOmaLongSoakObservation,
  recordOmaLongSoakObservationEvent,
  startOmaLongSoakObservation,
} from '../../../modules/foundry-lab/oma-long-soak-observation.ts';
import {
  readJsonObject,
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

function parseRuntimeOmaProductionConsumptionPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OmaProductionConsumptionReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime oma-production-consumption record payload must be valid JSON.',
    objectErrorMessage: 'runtime oma-production-consumption record payload must be a JSON object.',
  });
  return {
    long_soak_refs: [
      ...readStringList(parsed.long_soak_refs ?? parsed.long_soak_ref),
      ...readStringList(parsed.operator_long_soak_refs ?? parsed.operator_long_soak_ref),
      ...readStringList(parsed.production_soak_refs ?? parsed.production_soak_ref),
      ...readStringList(
        parsed.agent_lab_rerun_long_soak_refs ?? parsed.agent_lab_rerun_long_soak_ref,
      ),
    ],
    typed_blocker_refs: readStringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    operator_evidence_refs: readStringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
  };
}

function parseRuntimeOmaProductionConsumptionRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    payload: { type: 'string' },
    'payload-file': { type: 'string' },
  });
  const payload = values.payload as string | undefined;
  const payloadFile = values['payload-file'] as string | undefined;
  const hasPayload = payload !== undefined;
  const hasPayloadFile = payloadFile !== undefined;
  assertSinglePayloadSource(hasPayload && hasPayloadFile, spec);
  if (!hasPayload && !hasPayloadFile) {
    throw buildUsageError('runtime oma-production-consumption record requires --payload or --payload-file.', spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return parseRuntimeOmaProductionConsumptionPayload(
    hasPayload ? payload as string : readPayloadFileText(payloadFile as string, spec),
    spec,
  );
}

function parseRuntimeOmaProductionConsumptionVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  });
  return { receipt_ref: values['receipt-ref'] as string | undefined ?? null };
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
  const values = parseCommandOptions(args, spec, {
    'evidence-dir': { type: 'string' },
    'minimum-duration-minutes': { type: 'string' },
  });
  const evidenceDir = values['evidence-dir'] as string | undefined;
  const minimumDurationMinutesValue = values['minimum-duration-minutes'] as string | undefined;
  const minimumDurationMinutes = minimumDurationMinutesValue
    ? parsePositiveInteger(minimumDurationMinutesValue, '--minimum-duration-minutes', spec)
    : null;
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
  const values = parseCommandOptions(args, spec, {
    'workorder-file': { type: 'string' },
    'finished-at': { type: 'string' },
  });
  const workorderFile = values['workorder-file'] as string | undefined;
  if (!workorderFile) {
    throw buildUsageError(
      'runtime oma-production-consumption long-soak finish requires --workorder-file.',
      spec,
      { required: ['--workorder-file'] },
    );
  }
  return { workorderFile, finishedAt: values['finished-at'] as string | undefined ?? null };
}

function parseRuntimeOmaLongSoakEventArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    'workorder-file': { type: 'string' },
    'event-kind': { type: 'string' },
    'observed-at': { type: 'string' },
    'evidence-ref': { type: 'string' },
  });
  const workorderFile = values['workorder-file'] as string | undefined;
  const eventKind = values['event-kind'] as string | undefined;
  if (!workorderFile) {
    throw buildUsageError(
      'runtime oma-production-consumption long-soak event requires --workorder-file.',
      spec,
      { required: ['--workorder-file'] },
    );
  }
  if (!eventKind) {
    throw buildUsageError(
      'runtime oma-production-consumption long-soak event requires --event-kind.',
      spec,
      { required: ['--event-kind'] },
    );
  }
  return {
    workorderFile,
    eventKind,
    observedAt: values['observed-at'] as string | undefined ?? null,
    evidenceRef: values['evidence-ref'] as string | undefined ?? null,
  };
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
    'runtime oma-production-consumption long-soak event': {
      usage:
        'opl runtime oma-production-consumption long-soak event --workorder-file <path> --event-kind <kind> [--observed-at <iso>] [--evidence-ref <ref>]',
      summary:
        'Append a constrained OMA long-soak observation event to the body-local workorder log without recording production-consumption evidence.',
      examples: [
        'opl runtime oma-production-consumption long-soak event --workorder-file /tmp/opl-oma-long-soak/oma-long-soak-workorder.json --event-kind app_live_path_reexercised_or_confirmed_live --evidence-ref app:oma/live',
      ],
      handler: (args) => ({
        oma_long_soak_observation_event:
          recordOmaLongSoakObservationEvent(
            parseRuntimeOmaLongSoakEventArgs(
              args,
              commandSpecs['runtime oma-production-consumption long-soak event'],
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
