import {
  summarizeResearchHypothesisPortfolio,
  validateResearchHypothesisPortfolio,
} from '../../research-hypothesis-portfolio.ts';
import {
  assertSinglePayloadSource,
  buildUsageError,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseJsonPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw buildUsageError(
      'runtime research-hypothesis-portfolio summary payload must be valid JSON.',
      spec,
      { parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
}

function parseRuntimeResearchHypothesisPortfolioSummaryArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: unknown = null;
  let payloadPresent = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime research-hypothesis-portfolio summary requires --payload value.',
          spec,
          { option: '--payload' },
        );
      }
      assertSinglePayloadSource(payloadPresent, spec);
      payload = parseJsonPayload(value, spec);
      payloadPresent = true;
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime research-hypothesis-portfolio summary requires --payload-file value.',
          spec,
          { option: '--payload-file' },
        );
      }
      assertSinglePayloadSource(payloadPresent, spec);
      payload = parseJsonPayload(readPayloadFileText(value, spec), spec);
      payloadPresent = true;
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime research-hypothesis-portfolio summary: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payloadPresent) {
    throw buildUsageError(
      'runtime research-hypothesis-portfolio summary requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return payload;
}

function buildResearchHypothesisPortfolioReadModel(
  payload: unknown,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const validation = validateResearchHypothesisPortfolio(payload);
  if (!validation.valid) {
    throw buildUsageError(
      'runtime research-hypothesis-portfolio summary requires a valid body-free research hypothesis portfolio.',
      spec,
      { validation_errors: validation.errors },
    );
  }
  return summarizeResearchHypothesisPortfolio(payload);
}

export function buildRuntimeResearchHypothesisPortfolioCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime research-hypothesis-portfolio summary': {
      usage:
        'opl runtime research-hypothesis-portfolio summary (--payload <json>|--payload-file <path>)',
      summary:
        'Project a body-free research hypothesis portfolio read model without claiming hypothesis, quality, artifact, or owner receipt authority.',
      examples: [
        'opl runtime research-hypothesis-portfolio summary --payload-file research-hypothesis-portfolio.json',
      ],
      group: 'runtime',
      handler: (args) => ({
        research_hypothesis_portfolio_read_model: buildResearchHypothesisPortfolioReadModel(
          parseRuntimeResearchHypothesisPortfolioSummaryArgs(
            args,
            commandSpecs['runtime research-hypothesis-portfolio summary'],
          ),
          commandSpecs['runtime research-hypothesis-portfolio summary'],
        ),
      }),
    },
  };
  return commandSpecs;
}
