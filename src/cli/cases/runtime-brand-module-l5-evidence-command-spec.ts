import {
  listBrandModuleL5EvidenceReceipts,
  recordBrandModuleL5EvidenceReceipt,
  verifyBrandModuleL5EvidenceReceipt,
  type BrandModuleL5EvidenceReceiptInput,
} from '../../brand-module-l5-evidence-ledger.ts';
import type {
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  FrameworkContracts,
} from '../../types.ts';
import {
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

function parseRuntimeBrandModuleL5EvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): BrandModuleL5EvidenceReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError(
      'runtime brand-module-l5-evidence record payload must be valid JSON.',
      spec,
      { parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(
      'runtime brand-module-l5-evidence record payload must be a JSON object.',
      spec,
    );
  }
  const moduleId = optionalString(parsed.module_id ?? parsed.module);
  const evidenceClassId = optionalString(parsed.evidence_class_id ?? parsed.class_id ?? parsed.class);
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
    evidence_refs: stringList(parsed.evidence_refs ?? parsed.evidence_ref),
    typed_blocker_refs: stringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    owner_acceptance_refs: stringList(
      parsed.owner_acceptance_refs ?? parsed.owner_acceptance_ref,
    ),
    no_regression_refs: stringList(parsed.no_regression_refs ?? parsed.no_regression_ref),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRuntimeBrandModuleL5EvidenceRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: BrandModuleL5EvidenceReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime brand-module-l5-evidence record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeBrandModuleL5EvidencePayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime brand-module-l5-evidence record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseRuntimeBrandModuleL5EvidencePayload(readPayloadFileText(value, spec), spec);
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime brand-module-l5-evidence record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime brand-module-l5-evidence record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return payload;
}

function parseRuntimeBrandModuleL5EvidenceVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(
        `Unknown option for runtime brand-module-l5-evidence verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime brand-module-l5-evidence verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
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
