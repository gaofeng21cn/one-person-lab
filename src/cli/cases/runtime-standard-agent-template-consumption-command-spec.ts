import {
  listStandardAgentTemplateConsumptionReceipts,
  recordStandardAgentTemplateConsumptionReceipts,
  verifyStandardAgentTemplateConsumptionReceipt,
  type StandardAgentTemplateConsumptionReceiptInput,
} from '../../standard-agent-template-consumption-ledger.ts';
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

function parseRuntimeStandardAgentTemplateConsumptionPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): StandardAgentTemplateConsumptionReceiptInput & Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError(
      'runtime standard-agent-template-consumption record payload must be valid JSON.',
      spec,
      { parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(
      'runtime standard-agent-template-consumption record payload must be a JSON object.',
      spec,
    );
  }
  return {
    ...parsed,
    evidence_ref: optionalString(parsed.evidence_ref),
    evidence_fingerprint: optionalString(parsed.evidence_fingerprint),
    cohort_evidence_ref: optionalString(parsed.cohort_evidence_ref),
    cohort_evidence_fingerprint: optionalString(parsed.cohort_evidence_fingerprint),
    sample_evidence_refs: stringList(parsed.sample_evidence_refs ?? parsed.sample_evidence_ref),
    sample_evidence_fingerprints: stringList(
      parsed.sample_evidence_fingerprints ?? parsed.sample_evidence_fingerprint,
    ),
    consumed_surface_refs: stringList(parsed.consumed_surface_refs ?? parsed.consumed_surface_ref),
    replay_command_ref: optionalString(parsed.replay_command_ref),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: (StandardAgentTemplateConsumptionReceiptInput & Record<string, unknown>) | null =
    null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime standard-agent-template-consumption record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeStandardAgentTemplateConsumptionPayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime standard-agent-template-consumption record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeStandardAgentTemplateConsumptionPayload(
        readPayloadFileText(value, spec),
        spec,
      );
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime standard-agent-template-consumption record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime standard-agent-template-consumption record requires --payload or --payload-file.',
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
        `Unknown option for runtime standard-agent-template-consumption verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime standard-agent-template-consumption verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

export function buildRuntimeStandardAgentTemplateConsumptionCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime standard-agent-template-consumption record': {
      usage:
        'opl runtime standard-agent-template-consumption record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only standard agent template consumption replay evidence without claiming domain or production readiness.',
      examples: [
        'opl runtime standard-agent-template-consumption record --payload \'{"cohort_evidence_ref":"opl://standard-agent-template-consumption/cohort/demo","cohort_evidence_fingerprint":"sha256:demo","evidence_ref":"opl://standard-agent-template-consumption/award-foundry/demo","evidence_fingerprint":"sha256:demo"}\'',
        'opl runtime standard-agent-template-consumption record --payload-file payload.json',
      ],
      handler: (args) => ({
        standard_agent_template_consumption_ledger_record:
          recordStandardAgentTemplateConsumptionReceipts([
            parseRecordArgs(
              args,
              commandSpecs['runtime standard-agent-template-consumption record'],
            ),
          ]),
      }),
    },
    'runtime standard-agent-template-consumption verify': {
      usage: 'opl runtime standard-agent-template-consumption verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only standard agent template consumption receipt without claiming readiness.',
      examples: [
        'opl runtime standard-agent-template-consumption verify --receipt-ref opl://standard-agent-template-consumption-ledger/demo',
      ],
      handler: (args) => ({
        standard_agent_template_consumption_ledger_verify:
          verifyStandardAgentTemplateConsumptionReceipt(
            parseVerifyArgs(
              args,
              commandSpecs['runtime standard-agent-template-consumption verify'],
            ),
          ),
      }),
    },
    'runtime standard-agent-template-consumption list': {
      usage: 'opl runtime standard-agent-template-consumption list',
      summary:
        'List refs-only standard agent template consumption receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime standard-agent-template-consumption list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime standard-agent-template-consumption list']);
        const receipts = listStandardAgentTemplateConsumptionReceipts();
        return {
          standard_agent_template_consumption_ledger: {
            surface_kind: 'opl_standard_agent_template_consumption_ledger_projection',
            receipt_count: receipts.length,
            verified_receipt_ref_count: receipts.filter((receipt) =>
              receipt.receipt_status === 'verified'
            ).length,
            pending_verify_receipt_ref_count: receipts.filter((receipt) =>
              receipt.receipt_status === 'recorded'
            ).length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_write_domain_truth: false,
              can_write_memory_body: false,
              can_read_memory_body: false,
              can_read_artifact_body: false,
              can_mutate_artifact_body: false,
              can_create_owner_receipt: false,
              can_claim_domain_ready: false,
              can_claim_artifact_authority: false,
              can_claim_production_ready: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
