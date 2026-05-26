import {
  listCodexAppRuntimeEvidenceReceipts,
  recordCodexAppRuntimeEvidenceReceipts,
  verifyCodexAppRuntimeEvidenceReceipt,
  type CodexAppRuntimeEvidenceReceiptInput,
} from '../../codex-app-runtime-evidence-ledger.ts';
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

function parseRuntimeCodexAppRuntimeEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): CodexAppRuntimeEvidenceReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence record payload must be valid JSON.',
      spec,
      { parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence record payload must be a JSON object.',
      spec,
    );
  }
  return {
    temporal_hosted_long_soak_refs: stringList(
      parsed.temporal_hosted_long_soak_refs ?? parsed.temporal_hosted_long_soak_ref,
    ),
    provider_state_linkage_refs: stringList(
      parsed.provider_state_linkage_refs ?? parsed.provider_state_linkage_ref,
    ),
    operator_evidence_refs: stringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
    typed_blocker_refs: stringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRuntimeCodexAppRuntimeEvidenceRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: CodexAppRuntimeEvidenceReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime codex-app-runtime-evidence record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeCodexAppRuntimeEvidencePayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime codex-app-runtime-evidence record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeCodexAppRuntimeEvidencePayload(
        readPayloadFileText(value, spec),
        spec,
      );
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime codex-app-runtime-evidence record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return payload;
}

function parseRuntimeCodexAppRuntimeEvidenceVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(
        `Unknown option for runtime codex-app-runtime-evidence verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime codex-app-runtime-evidence verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

export function buildRuntimeCodexAppRuntimeEvidenceCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime codex-app-runtime-evidence record': {
      usage:
        'opl runtime codex-app-runtime-evidence record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only Codex App runtime evidence refs without claiming Temporal long-soak or production readiness.',
      examples: [
        'opl runtime codex-app-runtime-evidence record --payload \'{"temporal_hosted_long_soak_refs":["temporal:soak"],"provider_state_linkage_refs":["provider:slo"]}\'',
        'opl runtime codex-app-runtime-evidence record --payload-file payload.json',
      ],
      handler: (args) => ({
        codex_app_runtime_evidence_ledger_record:
          recordCodexAppRuntimeEvidenceReceipts([
            parseRuntimeCodexAppRuntimeEvidenceRecordArgs(
              args,
              commandSpecs['runtime codex-app-runtime-evidence record'],
            ),
          ]),
      }),
    },
    'runtime codex-app-runtime-evidence verify': {
      usage: 'opl runtime codex-app-runtime-evidence verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only Codex App runtime evidence receipt without claiming readiness.',
      examples: [
        'opl runtime codex-app-runtime-evidence verify --receipt-ref opl://codex-app-runtime-evidence/temporal%3Asoak',
      ],
      handler: (args) => ({
        codex_app_runtime_evidence_ledger_verify:
          verifyCodexAppRuntimeEvidenceReceipt(
            parseRuntimeCodexAppRuntimeEvidenceVerifyArgs(
              args,
              commandSpecs['runtime codex-app-runtime-evidence verify'],
            ),
          ),
      }),
    },
    'runtime codex-app-runtime-evidence list': {
      usage: 'opl runtime codex-app-runtime-evidence list',
      summary:
        'List refs-only Codex App runtime evidence receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime codex-app-runtime-evidence list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime codex-app-runtime-evidence list']);
        const receipts = listCodexAppRuntimeEvidenceReceipts();
        return {
          codex_app_runtime_evidence_ledger: {
            surface_kind: 'opl_codex_app_runtime_evidence_ledger_projection',
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
              can_generate_typed_blocker: false,
              can_close_domain_ready: false,
              can_close_long_soak: false,
              can_claim_production_ready: false,
              can_drive_long_running_task_loop: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
