import {
  evaluateStageTransitionIntent,
  rebuildStageTransitionAuthorityReadModel,
} from '../../stage-transition-authority.ts';
import {
  assertSinglePayloadSource,
  buildUsageError,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonValue(
  value: string,
  message: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw buildUsageError(message, spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parsePayloadArg(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  commandName: string,
) {
  let payload: unknown = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(`${commandName} requires --payload value.`, spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(payload !== null, spec);
      payload = parseJsonValue(value, `${commandName} payload must be valid JSON.`, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(`${commandName} requires --payload-file value.`, spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(payload !== null, spec);
      payload = parseJsonValue(
        readPayloadFileText(value, spec),
        `${commandName} payload file must contain valid JSON.`,
        spec,
      );
      continue;
    }
    throw buildUsageError(`Unknown option for ${commandName}: ${token}.`, spec, {
      option: token,
    });
  }
  if (payload === null) {
    throw buildUsageError(`${commandName} requires --payload or --payload-file.`, spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return payload;
}

function parseIntentPayload(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payload = parsePayloadArg(args, spec, 'runtime stage-transition-authority evaluate');
  if (!isRecord(payload)) {
    throw buildUsageError(
      'runtime stage-transition-authority evaluate payload must be a JSON object.',
      spec,
    );
  }
  return payload;
}

function parseIntentListPayload(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payload = parsePayloadArg(args, spec, 'runtime stage-transition-authority read-model');
  const intents = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? payload.intents
      : null;
  if (!Array.isArray(intents) || !intents.every(isRecord)) {
    throw buildUsageError(
      'runtime stage-transition-authority read-model payload must be a JSON array or {"intents":[...]} object.',
      spec,
    );
  }
  return intents;
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
        'opl runtime stage-transition-authority read-model (--payload <json>|--payload-file <path>)',
      summary:
        'Rebuild the append-only Stage transition authority read model from refs-only intent inputs without creating owner answers.',
      examples: [
        'opl runtime stage-transition-authority read-model --payload-file stage-transition-intents.json --json',
      ],
      handler: (args) => ({
        stage_transition_authority_read_model: rebuildStageTransitionAuthorityReadModel(
          parseIntentListPayload(
            args,
            commandSpecs['runtime stage-transition-authority read-model'],
          ),
        ),
      }),
    },
  };

  return commandSpecs;
}
