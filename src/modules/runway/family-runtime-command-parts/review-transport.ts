import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { parseCliOptions, parsePayloadArg } from './shared.ts';

export function parseReviewTransportArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  const action = rest[0];
  if (action !== 'snapshot' && action !== 'evidence-cache') return null;
  let payload: string | undefined;
  let payloadFile: string | undefined;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--payload' && value) {
      payload = value;
      return true;
    }
    if (token === '--payload-file' && value) {
      payloadFile = value;
      return true;
    }
    throw new FrameworkContractError(
      'cli_usage_error',
      `Unknown family-runtime review ${action} option: ${token}.`,
      { option: token },
    );
  });
  if (!payload && !payloadFile) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `family-runtime review ${action} requires --payload or --payload-file.`,
      {
        usage: `opl family-runtime review ${action} (--payload <json>|--payload-file <path>)`,
      },
    );
  }
  return {
    mode: action === 'snapshot'
      ? 'review_snapshot_materialize'
      : 'review_evidence_cache_persist',
    input: parsePayloadArg(payload, payloadFile),
  };
}
