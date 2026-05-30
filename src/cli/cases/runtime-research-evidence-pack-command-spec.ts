import {
  summarizeResearchEvidencePack,
  validateResearchEvidencePack,
} from '../../research-evidence-pack.ts';
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
      'runtime research-evidence-pack summary payload must be valid JSON.',
      spec,
      { parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
}

function parseRuntimeResearchEvidencePackSummaryArgs(
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
          'runtime research-evidence-pack summary requires --payload value.',
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
          'runtime research-evidence-pack summary requires --payload-file value.',
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
      `Unknown option for runtime research-evidence-pack summary: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payloadPresent) {
    throw buildUsageError(
      'runtime research-evidence-pack summary requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return payload;
}

function buildResearchEvidencePackReadModel(
  payload: unknown,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const validation = validateResearchEvidencePack(payload);
  if (!validation.valid) {
    throw buildUsageError(
      'runtime research-evidence-pack summary requires a valid body-free research evidence pack.',
      spec,
      { validation_errors: validation.errors },
    );
  }
  return summarizeResearchEvidencePack(payload);
}

export function buildRuntimeResearchEvidencePackCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime research-evidence-pack summary': {
      usage:
        'opl runtime research-evidence-pack summary (--payload <json>|--payload-file <path>)',
      summary:
        'Project a body-free research evidence pack read model without reading evidence bodies or claiming domain authority.',
      examples: [
        'opl runtime research-evidence-pack summary --payload-file research-evidence-pack.json',
      ],
      group: 'runtime',
      handler: (args) => ({
        research_evidence_pack_read_model: buildResearchEvidencePackReadModel(
          parseRuntimeResearchEvidencePackSummaryArgs(args, commandSpecs['runtime research-evidence-pack summary']),
          commandSpecs['runtime research-evidence-pack summary'],
        ),
      }),
    },
  };
  return commandSpecs;
}
