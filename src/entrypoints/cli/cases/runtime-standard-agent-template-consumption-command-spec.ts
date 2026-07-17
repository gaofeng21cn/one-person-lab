import {
  listStandardAgentTemplateConsumptionReceipts,
  recordStandardAgentTemplateConsumptionReceipts,
  verifyStandardAgentTemplateConsumptionReceipt,
  type StandardAgentTemplateConsumptionReceiptInput,
} from '../../../modules/ledger/standard-agent-template-consumption-ledger.ts';
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

function parseRuntimeStandardAgentTemplateConsumptionPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): StandardAgentTemplateConsumptionReceiptInput & Record<string, unknown> {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage:
      'runtime standard-agent-template-consumption record payload must be valid JSON.',
    objectErrorMessage:
      'runtime standard-agent-template-consumption record payload must be a JSON object.',
  });
  return {
    ...parsed,
    evidence_ref: readOptionalString(parsed.evidence_ref),
    evidence_fingerprint: readOptionalString(parsed.evidence_fingerprint),
    cohort_evidence_ref: readOptionalString(parsed.cohort_evidence_ref),
    cohort_evidence_fingerprint: readOptionalString(parsed.cohort_evidence_fingerprint),
    sample_evidence_refs: readStringList(parsed.sample_evidence_refs ?? parsed.sample_evidence_ref),
    sample_evidence_fingerprints: readStringList(
      parsed.sample_evidence_fingerprints ?? parsed.sample_evidence_fingerprint,
    ),
    consumed_surface_refs: readStringList(parsed.consumed_surface_refs ?? parsed.consumed_surface_ref),
    replay_api_ref: readOptionalString(parsed.replay_api_ref),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRecordArgs(
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
    throw buildUsageError(
      'runtime standard-agent-template-consumption record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseRuntimeStandardAgentTemplateConsumptionPayload(
    payload ?? readPayloadFileText(payloadFile as string, spec),
    spec,
  );
}

function parseVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  });
  return { receipt_ref: values['receipt-ref'] as string | undefined ?? null };
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
