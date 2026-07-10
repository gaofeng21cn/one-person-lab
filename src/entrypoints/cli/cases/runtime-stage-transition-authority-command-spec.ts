import {
  evaluateStageTransitionIntent,
  inspectStageTransitionAuthorityLedger,
  listStageTransitionAuthorityEvents,
  rebuildStageTransitionAuthorityReadModelFromLedger,
  recordStageTransitionAuthorityIntent,
  rebuildStageTransitionAuthorityReadModel,
} from '../../../modules/stagecraft/stage-transition-authority.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import { readJsonObject } from '../modules/json-boundary.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseJsonValue(
  value: string,
  message: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  return readJsonObject(`{"value":${value}}`, spec, {
    parseErrorMessage: message,
    objectErrorMessage: message,
  }).value;
}

function parsePayloadArg(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  commandName: string,
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
    throw buildUsageError(`${commandName} requires --payload or --payload-file.`, spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return parseJsonValue(
    hasPayload ? payload as string : readPayloadFileText(payloadFile as string, spec),
    hasPayload
      ? `${commandName} payload must be valid JSON.`
      : `${commandName} payload file must contain valid JSON.`,
    spec,
  );
}

function parseIntentPayload(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payload = parsePayloadArg(args, spec, 'runtime stage-transition-authority evaluate');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw buildUsageError(
      'runtime stage-transition-authority evaluate payload must be a JSON object.',
      spec,
    );
  }
  return payload as Record<string, unknown>;
}

function parseIntentListPayload(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payload = parsePayloadArg(args, spec, 'runtime stage-transition-authority read-model');
  const intents = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).intents
      : null;
  if (!Array.isArray(intents)
    || !intents.every((intent) =>
      Boolean(intent) && typeof intent === 'object' && !Array.isArray(intent))) {
    throw buildUsageError(
      'runtime stage-transition-authority read-model payload must be a JSON array or {"intents":[...]} object.',
      spec,
    );
  }
  return intents as Array<Record<string, unknown>>;
}

function parseRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const filteredArgs: string[] = [];
  let dryRun = false;
  for (const token of args) {
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    filteredArgs.push(token);
  }
  return {
    payload: parseIntentPayload(filteredArgs, spec),
    dryRun,
  };
}

function parseReadModelArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const fromLedger = args.includes('--from-ledger');
  if (!fromLedger) {
    return {
      fromLedger: false,
      intents: parseIntentListPayload(args, spec),
    };
  }
  const unexpected = args.filter((token) => token !== '--from-ledger' && token !== '--json');
  if (unexpected.length > 0) {
    throw buildUsageError(
      'runtime stage-transition-authority read-model --from-ledger cannot be combined with --payload or --payload-file.',
      spec,
      { option: unexpected[0] },
    );
  }
  return {
    fromLedger: true,
    intents: [],
  };
}

export function buildRuntimeStageTransitionAuthorityCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime stage-transition-authority evaluate': {
      usage:
        'opl runtime stage-transition-authority evaluate (--payload <json>|--payload-file <path>)',
      summary:
        'Evaluate one refs-only Stage transition intent through the single-writer authority without writing runtime state.',
      examples: [
        'opl runtime stage-transition-authority evaluate --payload-file stage-transition-intent.json --json',
      ],
      handler: (args) => ({
        stage_transition_authority_evaluate: evaluateStageTransitionIntent(
          parseIntentPayload(
            args,
            commandSpecs['runtime stage-transition-authority evaluate'],
          ),
        ),
      }),
    },
    'runtime stage-transition-authority read-model': {
      usage:
        'opl runtime stage-transition-authority read-model ((--payload <json>|--payload-file <path>)|--from-ledger)',
      summary:
        'Rebuild the append-only Stage transition authority read model from refs-only intent inputs without creating owner answers.',
      examples: [
        'opl runtime stage-transition-authority read-model --payload-file stage-transition-intents.json --json',
        'opl runtime stage-transition-authority read-model --from-ledger --json',
      ],
      handler: (args) => {
        const parsed = parseReadModelArgs(
          args,
          commandSpecs['runtime stage-transition-authority read-model'],
        );
        return {
          stage_transition_authority_read_model: parsed.fromLedger
            ? rebuildStageTransitionAuthorityReadModelFromLedger()
            : rebuildStageTransitionAuthorityReadModel(parsed.intents),
        };
      },
    },
    'runtime stage-transition-authority record': {
      usage:
        'opl runtime stage-transition-authority record (--payload <json>|--payload-file <path>) [--dry-run]',
      summary:
        'Record one refs-only Stage transition authority event in local state without creating domain owner answers.',
      examples: [
        'opl runtime stage-transition-authority record --payload-file stage-transition-intent.json --json',
        'opl runtime stage-transition-authority record --payload-file stage-transition-intent.json --dry-run --json',
      ],
      handler: (args) => {
        const parsed = parseRecordArgs(
          args,
          commandSpecs['runtime stage-transition-authority record'],
        );
        return {
          stage_transition_authority_event_ledger_record:
            recordStageTransitionAuthorityIntent(parsed.payload, {
              dry_run: parsed.dryRun,
            }),
        };
      },
    },
    'runtime stage-transition-authority list': {
      usage: 'opl runtime stage-transition-authority list',
      summary:
        'List refs-only Stage transition authority events recorded in local state.',
      examples: ['opl runtime stage-transition-authority list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime stage-transition-authority list']);
        const inspection = inspectStageTransitionAuthorityLedger();
        return {
          stage_transition_authority_event_ledger: {
            surface_kind: 'opl_stage_transition_authority_event_ledger_projection',
            ledger_file: inspection.ledger_file,
            ledger_exists: inspection.ledger_exists,
            raw_event_count: inspection.raw_event_count,
            strict_schema_rejected_event_count: inspection.strict_schema_rejected_event_count,
            read_error: inspection.read_error,
            event_count: listStageTransitionAuthorityEvents().length,
            events: listStageTransitionAuthorityEvents(),
            authority_boundary: inspection.events.length > 0
              ? inspection.events[0].authority_boundary
              : null,
          },
        };
      },
    },
  };

  return commandSpecs;
}
