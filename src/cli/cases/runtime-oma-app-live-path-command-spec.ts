import {
  listOmaAppLivePathReceipts,
  recordOmaAppLivePathReceipts,
  type OmaAppLivePathReceiptInput,
} from '../../oma-app-live-path-ledger.ts';
import { assertNoArgs, buildUsageError } from '../modules/support.ts';
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

function parseRuntimeOmaAppLivePathPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OmaAppLivePathReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError('runtime oma-app-live-path record payload must be valid JSON.', spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError('runtime oma-app-live-path record payload must be a JSON object.', spec);
  }
  return {
    app_live_path_refs: stringList(parsed.app_live_path_refs ?? parsed.app_live_path_ref),
    app_surface_ref: optionalString(parsed.app_surface_ref),
    operator_evidence_refs: stringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
  };
}

function parseRuntimeOmaAppLivePathRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: OmaAppLivePathReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime oma-app-live-path record requires --payload.', spec, {
          required: ['--payload'],
        });
      }
      payload = parseRuntimeOmaAppLivePathPayload(value, spec);
      continue;
    }
    throw buildUsageError(`Unknown option for runtime oma-app-live-path record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError('runtime oma-app-live-path record requires --payload.', spec, {
      required: ['--payload'],
    });
  }
  return payload;
}

export function buildRuntimeOmaAppLivePathCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime oma-app-live-path record': {
      usage: 'opl runtime oma-app-live-path record --payload <json>',
      summary:
        'Record refs-only OMA App live-path evidence refs without claiming production readiness.',
      examples: [
        'opl runtime oma-app-live-path record --payload \'{"app_live_path_refs":["app:oma-live"],"operator_evidence_refs":["screenshot:oma-live"]}\'',
      ],
      handler: (args) => ({
        oma_app_live_path_ledger_record: recordOmaAppLivePathReceipts([
          parseRuntimeOmaAppLivePathRecordArgs(
            args,
            commandSpecs['runtime oma-app-live-path record'],
          ),
        ]),
      }),
    },
    'runtime oma-app-live-path list': {
      usage: 'opl runtime oma-app-live-path list',
      summary:
        'List refs-only OMA App live-path receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime oma-app-live-path list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime oma-app-live-path list']);
        const receipts = listOmaAppLivePathReceipts();
        return {
          oma_app_live_path_ledger: {
            surface_kind: 'opl_oma_app_live_path_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            authority_boundary: {
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
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
