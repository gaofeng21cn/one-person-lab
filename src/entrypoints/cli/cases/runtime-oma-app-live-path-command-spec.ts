import {
  listOmaAppLivePathReceipts,
  recordOmaAppLivePathReceipts,
  type OmaAppLivePathReceiptInput,
} from '../../../modules/foundry-lab/oma-app-live-path-ledger.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseRuntimeOmaAppLivePathPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OmaAppLivePathReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime oma-app-live-path record payload must be valid JSON.',
    objectErrorMessage: 'runtime oma-app-live-path record payload must be a JSON object.',
  });
  return {
    app_live_path_refs: readStringList(parsed.app_live_path_refs ?? parsed.app_live_path_ref),
    app_surface_ref: readOptionalString(parsed.app_surface_ref),
    operator_evidence_refs: readStringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
  };
}

function parseRuntimeOmaAppLivePathRecordArgs(
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
    throw buildUsageError('runtime oma-app-live-path record requires --payload or --payload-file.', spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return parseRuntimeOmaAppLivePathPayload(
    payload ?? readPayloadFileText(payloadFile as string, spec),
    spec,
  );
}

export function buildRuntimeOmaAppLivePathCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime oma-app-live-path record': {
      usage: 'opl runtime oma-app-live-path record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only OMA App live-path evidence refs without claiming production readiness.',
      examples: [
        'opl runtime oma-app-live-path record --payload \'{"app_live_path_refs":["app:oma-live"],"operator_evidence_refs":["screenshot:oma-live"]}\'',
        'opl runtime oma-app-live-path record --payload-file payload.json',
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
