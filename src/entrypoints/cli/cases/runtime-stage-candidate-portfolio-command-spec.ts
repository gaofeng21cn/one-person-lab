import {
  summarizeStageCandidatePortfolio,
  validateStageCandidatePortfolio,
} from '../../../read-models/operator/index.ts';
import {
  buildUsageError,
  parseCommandOptions,
} from '../modules/support.ts';
import { readJsonObject } from '../modules/json-boundary.ts';
import { readSinglePayloadText } from '../modules/payload-file.ts';
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
  const payloadValue = readSinglePayloadText(values, spec);
  if (payloadValue === null) {
    throw buildUsageError(
      'runtime stage-candidate-portfolio summary requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseJsonPayload(
    payloadValue,
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
