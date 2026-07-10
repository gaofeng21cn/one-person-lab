import {
  summarizeStageRunEvidencePack,
  validateStageRunEvidencePack,
} from '../../../modules/ledger/stage-run-evidence-pack.ts';
import {
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import { readJsonObject } from '../modules/json-boundary.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseJsonPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  return readJsonObject(`{"payload":${value}}`, spec, {
    parseErrorMessage: 'runtime stage-run-evidence-pack summary payload must be valid JSON.',
    objectErrorMessage: 'runtime stage-run-evidence-pack summary payload must be valid JSON.',
  }).payload;
}

function parseRuntimeStageRunEvidencePackSummaryArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    payload: { type: 'string', multiple: true },
    'payload-file': { type: 'string', multiple: true },
  });
  const payloads = values.payload as string[] | undefined;
  const payloadFiles = values['payload-file'] as string[] | undefined;
  assertSinglePayloadSource((payloads?.length ?? 0) + (payloadFiles?.length ?? 0) > 1, spec);
  const payload = payloads?.[0];
  const payloadFile = payloadFiles?.[0];
  if (!payload && !payloadFile) {
    throw buildUsageError(
      'runtime stage-run-evidence-pack summary requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseJsonPayload(
    payload ?? readPayloadFileText(payloadFile as string, spec),
    spec,
  );
}

function buildStageRunEvidencePackReadModel(
  payload: unknown,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const validation = validateStageRunEvidencePack(payload);
  if (!validation.valid) {
    throw buildUsageError(
      'runtime stage-run-evidence-pack summary requires a valid body-free stage run evidence pack.',
      spec,
      { validation_errors: validation.errors },
    );
  }
  return summarizeStageRunEvidencePack(payload);
}

export function buildRuntimeStageRunEvidencePackCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime stage-run-evidence-pack summary': {
      usage:
        'opl runtime stage-run-evidence-pack summary (--payload <json>|--payload-file <path>)',
      summary:
        'Project a body-free stage run evidence pack read model without reading evidence bodies or claiming domain authority.',
      examples: [
        'opl runtime stage-run-evidence-pack summary --payload-file stage-run-evidence-pack.json',
      ],
      group: 'runtime',
      handler: (args) => ({
        stage_run_evidence_pack_read_model: buildStageRunEvidencePackReadModel(
          parseRuntimeStageRunEvidencePackSummaryArgs(args, commandSpecs['runtime stage-run-evidence-pack summary']),
          commandSpecs['runtime stage-run-evidence-pack summary'],
        ),
      }),
    },
  };
  return commandSpecs;
}
