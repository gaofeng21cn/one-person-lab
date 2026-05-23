import {
  listAppReleaseUserPathEvidenceReceipts,
  recordAppReleaseUserPathEvidenceReceipts,
  verifyAppReleaseUserPathEvidenceReceipt,
  type AppReleaseUserPathEvidenceReceiptInput,
} from '../../app-release-user-path-evidence-ledger.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  readPayloadFileText,
} from '../modules/support.ts';
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

function parseRuntimeAppReleaseEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): AppReleaseUserPathEvidenceReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError('runtime app-release-evidence record payload must be valid JSON.', spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError('runtime app-release-evidence record payload must be a JSON object.', spec);
  }
  return {
    release_package_refs: stringList(parsed.release_package_refs ?? parsed.release_package_ref),
    screenshot_refs: stringList(parsed.screenshot_refs ?? parsed.screenshot_ref),
    reload_prompt_user_path_refs: stringList(
      parsed.reload_prompt_user_path_refs ?? parsed.reload_prompt_user_path_ref,
    ),
    provider_state_linkage_refs: stringList(
      parsed.provider_state_linkage_refs ?? parsed.provider_state_linkage_ref,
    ),
    long_operator_evidence_refs: stringList(
      parsed.long_operator_evidence_refs ?? parsed.long_operator_evidence_ref,
    ),
    typed_blocker_refs: stringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRuntimeAppReleaseEvidenceRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: AppReleaseUserPathEvidenceReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime app-release-evidence record requires --payload.', spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeAppReleaseEvidencePayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime app-release-evidence record requires --payload-file.', spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeAppReleaseEvidencePayload(readPayloadFileText(value, spec), spec);
      continue;
    }
    throw buildUsageError(`Unknown option for runtime app-release-evidence record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError('runtime app-release-evidence record requires --payload or --payload-file.', spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return payload;
}

function parseRuntimeAppReleaseEvidenceVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(`Unknown option for runtime app-release-evidence verify: ${token}.`, spec, {
        option: token,
      });
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError('runtime app-release-evidence verify requires --receipt-ref value.', spec, {
        option: '--receipt-ref',
      });
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

export function buildRuntimeAppReleaseEvidenceCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime app-release-evidence record': {
      usage: 'opl runtime app-release-evidence record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only App release/user-path evidence refs without claiming App release or production readiness.',
      examples: [
        'opl runtime app-release-evidence record --payload \'{"release_package_refs":["release:pkg"],"screenshot_refs":["screenshot:first-run"]}\'',
        'opl runtime app-release-evidence record --payload-file payload.json',
      ],
      handler: (args) => ({
        app_release_user_path_evidence_ledger_record:
          recordAppReleaseUserPathEvidenceReceipts([
            parseRuntimeAppReleaseEvidenceRecordArgs(
              args,
              commandSpecs['runtime app-release-evidence record'],
            ),
          ]),
      }),
    },
    'runtime app-release-evidence verify': {
      usage: 'opl runtime app-release-evidence verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only App release/user-path evidence receipt without claiming readiness.',
      examples: [
        'opl runtime app-release-evidence verify --receipt-ref opl://app-release-user-path-evidence/release%3Apkg',
      ],
      handler: (args) => ({
        app_release_user_path_evidence_ledger_verify:
          verifyAppReleaseUserPathEvidenceReceipt(
            parseRuntimeAppReleaseEvidenceVerifyArgs(
              args,
              commandSpecs['runtime app-release-evidence verify'],
            ),
          ),
      }),
    },
    'runtime app-release-evidence list': {
      usage: 'opl runtime app-release-evidence list',
      summary:
        'List refs-only App release/user-path evidence receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime app-release-evidence list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime app-release-evidence list']);
        const receipts = listAppReleaseUserPathEvidenceReceipts();
        return {
          app_release_user_path_evidence_ledger: {
            surface_kind: 'opl_app_release_user_path_evidence_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_write_domain_truth: false,
              can_write_memory_body: false,
              can_read_memory_body: false,
              can_read_artifact_body: false,
              can_mutate_artifact_body: false,
              can_create_owner_receipt: false,
              can_close_domain_ready: false,
              can_claim_release_ready: false,
              can_claim_production_ready: false,
              can_close_app_release_user_path: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
