import {
  listCodexAppRuntimeEvidenceReceipts,
  recordCodexAppRuntimeEvidenceReceipts,
  verifyCodexAppRuntimeEvidenceReceipt,
  type CodexAppRuntimeEvidenceReceiptInput,
} from '../../../modules/runway/codex-app-runtime-evidence-ledger.ts';
import {
  finishCodexAppRuntimeLongSoakObservation,
  recordCodexAppRuntimeLongSoakObservationEvent,
  startCodexAppRuntimeLongSoakObservation,
} from '../../../modules/runway/codex-app-runtime-long-soak-observation.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseRuntimeCodexAppRuntimeEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): CodexAppRuntimeEvidenceReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime codex-app-runtime-evidence record payload must be valid JSON.',
    objectErrorMessage: 'runtime codex-app-runtime-evidence record payload must be a JSON object.',
  });
  return {
    temporal_hosted_long_soak_refs: readStringList(
      parsed.temporal_hosted_long_soak_refs ?? parsed.temporal_hosted_long_soak_ref,
    ),
    provider_state_linkage_refs: readStringList(
      parsed.provider_state_linkage_refs ?? parsed.provider_state_linkage_ref,
    ),
    operator_evidence_refs: readStringList(
      parsed.operator_evidence_refs ?? parsed.operator_evidence_ref,
    ),
    typed_blocker_refs: readStringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRuntimeCodexAppRuntimeEvidenceRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = parseCommandOptions(args, spec, {
    payload: { type: 'string', multiple: true },
    'payload-file': { type: 'string', multiple: true },
  });
  const inlinePayloads = parsed.payload as string[] | undefined;
  const payloadFiles = parsed['payload-file'] as string[] | undefined;
  assertSinglePayloadSource((inlinePayloads?.length ?? 0) + (payloadFiles?.length ?? 0) > 1, spec);
  const inlinePayload = inlinePayloads?.[0];
  const payloadFile = payloadFiles?.[0];
  const payloadValue = inlinePayload ?? (payloadFile ? readPayloadFileText(payloadFile, spec) : null);
  if (!payloadValue) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseRuntimeCodexAppRuntimeEvidencePayload(payloadValue, spec);
}

function parseRuntimeCodexAppRuntimeEvidenceVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence verify requires --receipt-ref value.',
      spec,
      { option: '--receipt-ref' },
    );
  }
  return { receipt_ref: receiptRef ?? null };
}

function parsePositiveInteger(
  value: string | undefined,
  option: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (!value) {
    throw buildUsageError(
      `runtime codex-app-runtime-evidence long-soak start requires ${option}.`,
      spec,
      { option },
    );
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw buildUsageError(`${option} must be a positive integer.`, spec, {
      option,
      value,
    });
  }
  return parsed;
}

function parseRuntimeCodexAppRuntimeLongSoakStartArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let evidenceDir: string | null = null;
  let minimumDurationMinutes: number | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--evidence-dir' && value) {
      evidenceDir = value;
      index += 1;
      continue;
    }
    if (token === '--minimum-duration-minutes') {
      minimumDurationMinutes = parsePositiveInteger(value, token, spec);
      index += 1;
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime codex-app-runtime-evidence long-soak start: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!minimumDurationMinutes) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence long-soak start requires --minimum-duration-minutes.',
      spec,
      { required: ['--minimum-duration-minutes'] },
    );
  }
  if (!evidenceDir) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence long-soak start requires --evidence-dir.',
      spec,
      { required: ['--evidence-dir'] },
    );
  }
  return {
    evidenceDir,
    minimumDurationMinutes,
  };
}

function parseRuntimeCodexAppRuntimeLongSoakEventArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let workorderFile = '';
  let eventKind = '';
  let observedAt: string | null = null;
  let evidenceRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--workorder-file' && value) {
      workorderFile = value;
      index += 1;
      continue;
    }
    if (token === '--event-kind' && value) {
      eventKind = value;
      index += 1;
      continue;
    }
    if (token === '--observed-at' && value) {
      observedAt = value;
      index += 1;
      continue;
    }
    if (token === '--evidence-ref' && value) {
      evidenceRef = value;
      index += 1;
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime codex-app-runtime-evidence long-soak event: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!workorderFile) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence long-soak event requires --workorder-file.',
      spec,
      { required: ['--workorder-file'] },
    );
  }
  if (!eventKind) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence long-soak event requires --event-kind.',
      spec,
      { required: ['--event-kind'] },
    );
  }
  return { workorderFile, eventKind, observedAt, evidenceRef };
}

function parseRuntimeCodexAppRuntimeLongSoakFinishArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let workorderFile = '';
  let finishedAt: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--workorder-file' && value) {
      workorderFile = value;
      index += 1;
      continue;
    }
    if (token === '--finished-at' && value) {
      finishedAt = value;
      index += 1;
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime codex-app-runtime-evidence long-soak finish: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!workorderFile) {
    throw buildUsageError(
      'runtime codex-app-runtime-evidence long-soak finish requires --workorder-file.',
      spec,
      { required: ['--workorder-file'] },
    );
  }
  return { workorderFile, finishedAt };
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
    'runtime codex-app-runtime-evidence long-soak start': {
      usage:
        'opl runtime codex-app-runtime-evidence long-soak start --minimum-duration-minutes <n> --evidence-dir <path>',
      summary:
        'Prepare a local Codex App runtime long-soak observation workorder without recording runtime evidence.',
      examples: [
        'opl runtime codex-app-runtime-evidence long-soak start --minimum-duration-minutes 240 --evidence-dir /tmp/opl-codex-app-runtime-long-soak',
      ],
      handler: (args) => ({
        codex_app_runtime_long_soak_observation_start:
          startCodexAppRuntimeLongSoakObservation(
            parseRuntimeCodexAppRuntimeLongSoakStartArgs(
              args,
              commandSpecs['runtime codex-app-runtime-evidence long-soak start'],
            ),
          ),
      }),
    },
    'runtime codex-app-runtime-evidence long-soak event': {
      usage:
        'opl runtime codex-app-runtime-evidence long-soak event --workorder-file <path> --event-kind <kind> [--observed-at <iso>] [--evidence-ref <ref>]',
      summary:
        'Append a constrained Codex App runtime long-soak observation event to the local workorder log without recording runtime evidence.',
      examples: [
        'opl runtime codex-app-runtime-evidence long-soak event --workorder-file /tmp/opl-codex-app-runtime-long-soak/codex-app-runtime-long-soak-workorder.json --event-kind provider_state_linkage_checked --evidence-ref provider-state:temporal/cadence-current',
      ],
      handler: (args) => ({
        codex_app_runtime_long_soak_observation_event:
          recordCodexAppRuntimeLongSoakObservationEvent(
            parseRuntimeCodexAppRuntimeLongSoakEventArgs(
              args,
              commandSpecs['runtime codex-app-runtime-evidence long-soak event'],
            ),
          ),
      }),
    },
    'runtime codex-app-runtime-evidence long-soak finish': {
      usage:
        'opl runtime codex-app-runtime-evidence long-soak finish --workorder-file <path> [--finished-at <iso>]',
      summary:
        'Materialize Codex App runtime evidence refs and a record payload only after the local observation workorder passes preflight.',
      examples: [
        'opl runtime codex-app-runtime-evidence long-soak finish --workorder-file /tmp/opl-codex-app-runtime-long-soak/codex-app-runtime-long-soak-workorder.json',
      ],
      handler: (args) => ({
        codex_app_runtime_long_soak_observation_finish:
          finishCodexAppRuntimeLongSoakObservation(
            parseRuntimeCodexAppRuntimeLongSoakFinishArgs(
              args,
              commandSpecs['runtime codex-app-runtime-evidence long-soak finish'],
            ),
          ),
      }),
    },
  };
  return commandSpecs;
}
