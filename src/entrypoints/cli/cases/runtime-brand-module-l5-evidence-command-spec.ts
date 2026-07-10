import {
  listBrandModuleL5EvidenceReceipts,
  recordBrandModuleL5EvidenceReceipt,
  verifyBrandModuleL5EvidenceReceipt,
  type BrandModuleL5EvidenceReceiptInput,
} from '../../../modules/charter/brand-module-l5-evidence-ledger.ts';
import type {
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  FrameworkContracts,
} from '../../../kernel/types.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import {
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseRuntimeBrandModuleL5EvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): BrandModuleL5EvidenceReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime brand-module-l5-evidence record payload must be valid JSON.',
    objectErrorMessage: 'runtime brand-module-l5-evidence record payload must be a JSON object.',
  });
  const moduleId = readOptionalString(parsed.module_id ?? parsed.module);
  const evidenceClassId = readOptionalString(parsed.evidence_class_id ?? parsed.class_id ?? parsed.class);
  if (!moduleId || !evidenceClassId) {
    throw buildUsageError(
      'runtime brand-module-l5-evidence record payload requires module_id and evidence_class_id.',
      spec,
      { required: ['module_id', 'evidence_class_id'] },
    );
  }
  return {
    module_id: moduleId as BrandModuleId,
    evidence_class_id: evidenceClassId as BrandModuleL5EvidenceClassId,
    evidence_refs: readStringList(parsed.evidence_refs ?? parsed.evidence_ref),
    typed_blocker_refs: readStringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    owner_acceptance_refs: readStringList(
      parsed.owner_acceptance_refs ?? parsed.owner_acceptance_ref,
    ),
    no_regression_refs: readStringList(parsed.no_regression_refs ?? parsed.no_regression_ref),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRuntimeBrandModuleL5EvidenceRecordArgs(
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
      'runtime brand-module-l5-evidence record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseRuntimeBrandModuleL5EvidencePayload(payloadValue, spec);
}

function parseRuntimeBrandModuleL5EvidenceVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError(
      'runtime brand-module-l5-evidence verify requires --receipt-ref value.',
      spec,
      { option: '--receipt-ref' },
    );
  }
  return { receipt_ref: receiptRef ?? null };
}

function parseRuntimeBrandModuleL5EvidenceListArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let moduleId: BrandModuleId | null = null;
  let evidenceClassId: BrandModuleL5EvidenceClassId | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[++index];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(
        `runtime brand-module-l5-evidence list requires a value for ${token}.`,
        spec,
        { option: token },
      );
    }
    if (token === '--module') {
      moduleId = value as BrandModuleId;
      continue;
    }
    if (token === '--class' || token === '--evidence-class') {
      evidenceClassId = value as BrandModuleL5EvidenceClassId;
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime brand-module-l5-evidence list: ${token}.`,
      spec,
      { option: token },
    );
  }
  return { module_id: moduleId, evidence_class_id: evidenceClassId };
}

export function buildRuntimeBrandModuleL5EvidenceCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime brand-module-l5-evidence record': {
      usage:
        'opl runtime brand-module-l5-evidence record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only brand-module L5 operating evidence without claiming L5 completion.',
      examples: [
        'opl runtime brand-module-l5-evidence record --payload \'{"module_id":"runway","evidence_class_id":"long_soak_recovery","evidence_refs":["long-soak:runway/demo"]}\'',
        'opl runtime brand-module-l5-evidence record --payload-file payload.json',
      ],
      handler: (args) => ({
        brand_module_l5_evidence_ledger_record: recordBrandModuleL5EvidenceReceipt(
          getContracts(),
          parseRuntimeBrandModuleL5EvidenceRecordArgs(
            args,
            commandSpecs['runtime brand-module-l5-evidence record'],
          ),
        ),
      }),
    },
    'runtime brand-module-l5-evidence verify': {
      usage: 'opl runtime brand-module-l5-evidence verify [--receipt-ref <ref>]',
      summary:
        'Verify a refs-only brand-module L5 evidence receipt without converting it into an L5 completion claim.',
      examples: [
        'opl runtime brand-module-l5-evidence verify --receipt-ref opl://brand-module-l5-evidence/runway/long_soak_recovery/demo',
      ],
      handler: (args) => ({
        brand_module_l5_evidence_ledger_verify: verifyBrandModuleL5EvidenceReceipt(
          parseRuntimeBrandModuleL5EvidenceVerifyArgs(
            args,
            commandSpecs['runtime brand-module-l5-evidence verify'],
          ),
        ),
      }),
    },
    'runtime brand-module-l5-evidence list': {
      usage:
        'opl runtime brand-module-l5-evidence list [--module <module_id>] [--class <evidence_class_id>]',
      summary:
        'List refs-only brand-module L5 evidence receipts recorded in the local OPL state ledger.',
      examples: [
        'opl runtime brand-module-l5-evidence list --json',
        'opl runtime brand-module-l5-evidence list --module runway --class long_soak_recovery --json',
      ],
      handler: (args) => {
        const parsed = parseRuntimeBrandModuleL5EvidenceListArgs(
          args,
          commandSpecs['runtime brand-module-l5-evidence list'],
        );
        return {
          brand_module_l5_evidence_ledger: listBrandModuleL5EvidenceReceipts(
            getContracts(),
            parsed,
          ),
        };
      },
    },
  };
  return commandSpecs;
}
