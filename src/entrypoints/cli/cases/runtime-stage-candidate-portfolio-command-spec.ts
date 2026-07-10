import {
  summarizeStageCandidatePortfolio,
  validateStageCandidatePortfolio,
} from '../../../modules/foundry-lab/stage-candidate-portfolio.ts';
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
    parseErrorMessage:
      'runtime stage-candidate-portfolio summary payload must be valid JSON.',
    objectErrorMessage:
      'runtime stage-candidate-portfolio summary payload must be valid JSON.',
  }).payload;
}

function parseRuntimeStageCandidatePortfolioSummaryArgs(
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
      'runtime stage-candidate-portfolio summary requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseJsonPayload(
    payload ?? readPayloadFileText(payloadFile as string, spec),
    spec,
  );
}

function buildStageCandidatePortfolioReadModel(
  payload: unknown,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const validation = validateStageCandidatePortfolio(payload);
  if (!validation.valid) {
    throw buildUsageError(
      'runtime stage-candidate-portfolio summary requires a valid body-free stage candidate portfolio.',
      spec,
      { validation_errors: validation.errors },
    );
  }
  return summarizeStageCandidatePortfolio(payload);
}

export function buildRuntimeStageCandidatePortfolioCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime stage-candidate-portfolio summary': {
      usage:
        'opl runtime stage-candidate-portfolio summary (--payload <json>|--payload-file <path>)',
      summary:
        'Project a body-free stage candidate portfolio read model without claiming candidate acceptance, quality, artifact, or owner receipt authority.',
      examples: [
        'opl runtime stage-candidate-portfolio summary --payload-file stage-candidate-portfolio.json',
      ],
      group: 'runtime',
      handler: (args) => ({
        stage_candidate_portfolio_read_model: buildStageCandidatePortfolioReadModel(
          parseRuntimeStageCandidatePortfolioSummaryArgs(
            args,
            commandSpecs['runtime stage-candidate-portfolio summary'],
          ),
          commandSpecs['runtime stage-candidate-portfolio summary'],
        ),
      }),
    },
  };
  return commandSpecs;
}
