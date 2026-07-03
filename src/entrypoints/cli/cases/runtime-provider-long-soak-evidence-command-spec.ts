import {
  buildProviderLongSoakEvidenceProjection,
  listProviderLongSoakEvidenceReceipts,
  providerLongSoakEvidenceAuthorityBoundary,
  recordProviderLongSoakEvidenceReceipts,
  verifyProviderLongSoakEvidenceReceipt,
  type ProviderLongSoakEvidenceReceiptInput,
} from '../../../modules/ledger/provider-long-soak-evidence-ledger.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseProviderLongSoakEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): ProviderLongSoakEvidenceReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime provider-long-soak-evidence record payload must be valid JSON.',
    objectErrorMessage: 'runtime provider-long-soak-evidence record payload must be a JSON object.',
  });
  return {
    long_soak_refs: readStringList(parsed.long_soak_refs ?? parsed.long_soak_ref),
    recovery_refs: readStringList(parsed.recovery_refs ?? parsed.recovery_ref),
    dead_letter_refs: readStringList(parsed.dead_letter_refs ?? parsed.dead_letter_ref),
    provider_blocker_refs: readStringList(
      parsed.provider_blocker_refs ?? parsed.provider_blocker_ref,
    ),
    typed_blocker_refs: readStringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    owner_acceptance_refs: readStringList(
      parsed.owner_acceptance_refs ?? parsed.owner_acceptance_ref,
    ),
    capability_requirement_ids: readStringList(
      parsed.capability_requirement_ids ?? parsed.capability_requirement_id,
    ),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: ProviderLongSoakEvidenceReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime provider-long-soak-evidence record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseProviderLongSoakEvidencePayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime provider-long-soak-evidence record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseProviderLongSoakEvidencePayload(readPayloadFileText(value, spec), spec);
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime provider-long-soak-evidence record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime provider-long-soak-evidence record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return payload;
}

function parseVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(
        `Unknown option for runtime provider-long-soak-evidence verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime provider-long-soak-evidence verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

export function buildRuntimeProviderLongSoakEvidenceCommandSpecs():
  Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime provider-long-soak-evidence record': {
      usage:
        'opl runtime provider-long-soak-evidence record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only provider long-soak, recovery, dead-letter, provider blocker, typed blocker, or owner acceptance refs without claiming production readiness.',
      examples: [
        'opl runtime provider-long-soak-evidence record --payload \'{"long_soak_refs":["provider-long-soak:temporal/window"],"provider_blocker_refs":["provider-blocker:temporal/capability-slo"],"owner_acceptance_refs":["owner-acceptance:runtime/provider-window"],"capability_requirement_ids":["signal_history_ready"]}\'',
        'opl runtime provider-long-soak-evidence record --payload-file payload.json',
      ],
      handler: (args) => ({
        provider_long_soak_evidence_ledger_record:
          recordProviderLongSoakEvidenceReceipts([
            parseRecordArgs(args, commandSpecs['runtime provider-long-soak-evidence record']),
          ]),
      }),
    },
    'runtime provider-long-soak-evidence verify': {
      usage: 'opl runtime provider-long-soak-evidence verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only provider long-soak evidence receipt without claiming readiness.',
      examples: [
        'opl runtime provider-long-soak-evidence verify --receipt-ref opl://provider-long-soak-evidence/provider-long-soak%3Atemporal%2Fwindow',
      ],
      handler: (args) => ({
        provider_long_soak_evidence_ledger_verify:
          verifyProviderLongSoakEvidenceReceipt(
            parseVerifyArgs(args, commandSpecs['runtime provider-long-soak-evidence verify']),
          ),
      }),
    },
    'runtime provider-long-soak-evidence list': {
      usage: 'opl runtime provider-long-soak-evidence list',
      summary:
        'List refs-only provider long-soak evidence receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime provider-long-soak-evidence list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime provider-long-soak-evidence list']);
        const receipts = listProviderLongSoakEvidenceReceipts();
        return {
          provider_long_soak_evidence_ledger: {
            surface_kind: 'opl_provider_long_soak_evidence_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            projection: buildProviderLongSoakEvidenceProjection(),
            authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
          },
        };
      },
    },
  };
  const subcommands = [
    'runtime provider-long-soak-evidence record',
    'runtime provider-long-soak-evidence verify',
    'runtime provider-long-soak-evidence list',
  ].map((command) => {
    const spec = commandSpecs[command];
    return {
      command,
      usage: spec.usage,
      summary: spec.summary,
    };
  });
  commandSpecs['runtime provider-long-soak-evidence'] = {
    usage: 'opl runtime provider-long-soak-evidence <record|verify|list>',
    summary:
      'Inspect or update refs-only provider long-soak evidence without claiming provider or production readiness.',
    examples: [
      'opl runtime provider-long-soak-evidence list --json',
      'opl help runtime provider-long-soak-evidence record',
    ],
    group: 'runtime',
    subcommands,
    handler: (args) => {
      assertNoArgs(args, commandSpecs['runtime provider-long-soak-evidence']);
      return {
        provider_long_soak_evidence_commands: {
          surface_kind: 'opl_runtime_provider_long_soak_evidence_command_group',
          usage: 'opl runtime provider-long-soak-evidence <record|verify|list>',
          accepted_refs_only_result_shapes: [
            'long_soak_ref',
            'recovery_ref',
            'dead_letter_ref',
            'provider_blocker_ref',
            'typed_blocker_ref',
            'owner_acceptance_ref',
            'capability_requirement_id',
          ],
          subcommands,
          authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
        },
      };
    },
  };
  return commandSpecs;
}
