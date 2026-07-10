import {
  buildMemoryArtifactLifecycleEvidenceProjection,
  listMemoryArtifactLifecycleEvidenceReceipts,
  memoryArtifactLifecycleEvidenceAuthorityBoundary,
  recordMemoryArtifactLifecycleEvidenceReceipts,
  verifyMemoryArtifactLifecycleEvidenceReceipt,
  type MemoryArtifactLifecycleEvidenceReceiptInput,
} from '../../../modules/ledger/memory-artifact-lifecycle-evidence-ledger.ts';
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

function parseMemoryArtifactLifecycleEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): MemoryArtifactLifecycleEvidenceReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage:
      'runtime memory-artifact-lifecycle-evidence record payload must be valid JSON.',
    objectErrorMessage:
      'runtime memory-artifact-lifecycle-evidence record payload must be a JSON object.',
  });
  return {
    memory_receipt_refs: readStringList(parsed.memory_receipt_refs ?? parsed.memory_receipt_ref),
    memory_writeback_receipt_refs: readStringList(
      parsed.memory_writeback_receipt_refs ?? parsed.memory_writeback_receipt_ref,
    ),
    artifact_mutation_receipt_refs: readStringList(
      parsed.artifact_mutation_receipt_refs ?? parsed.artifact_mutation_receipt_ref,
    ),
    package_lifecycle_receipt_refs: readStringList(
      parsed.package_lifecycle_receipt_refs ?? parsed.package_lifecycle_receipt_ref,
    ),
    export_lifecycle_receipt_refs: readStringList(
      parsed.export_lifecycle_receipt_refs ?? parsed.export_lifecycle_receipt_ref,
    ),
    cleanup_restore_retention_receipt_refs: readStringList(
      parsed.cleanup_restore_retention_receipt_refs
        ?? parsed.cleanup_restore_retention_receipt_ref,
    ),
    typed_blocker_refs: readStringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    owner_acceptance_refs: readStringList(
      parsed.owner_acceptance_refs ?? parsed.owner_acceptance_ref,
    ),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRecordArgs(
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
      'runtime memory-artifact-lifecycle-evidence record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return parseMemoryArtifactLifecycleEvidencePayload(payloadValue, spec);
}

function parseVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError(
      'runtime memory-artifact-lifecycle-evidence verify requires --receipt-ref value.',
      spec,
      { option: '--receipt-ref' },
    );
  }
  return { receipt_ref: receiptRef ?? null };
}

export function buildRuntimeMemoryArtifactLifecycleEvidenceCommandSpecs():
  Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime memory-artifact-lifecycle-evidence record': {
      usage:
        'opl runtime memory-artifact-lifecycle-evidence record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only memory, artifact, package, export, cleanup/restore, typed blocker, or owner acceptance refs without taking body or verdict authority.',
      examples: [
        'opl runtime memory-artifact-lifecycle-evidence record --payload \'{"memory_receipt_refs":["memory-receipt:domain/accepted"],"artifact_mutation_receipt_refs":["artifact-receipt:domain/package"],"owner_acceptance_refs":["owner-acceptance:lifecycle"]}\'',
        'opl runtime memory-artifact-lifecycle-evidence record --payload-file payload.json',
      ],
      handler: (args) => ({
        memory_artifact_lifecycle_evidence_ledger_record:
          recordMemoryArtifactLifecycleEvidenceReceipts([
            parseRecordArgs(
              args,
              commandSpecs['runtime memory-artifact-lifecycle-evidence record'],
            ),
          ]),
      }),
    },
    'runtime memory-artifact-lifecycle-evidence verify': {
      usage: 'opl runtime memory-artifact-lifecycle-evidence verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only memory/artifact/lifecycle evidence receipt without claiming readiness.',
      examples: [
        'opl runtime memory-artifact-lifecycle-evidence verify --receipt-ref opl://memory-artifact-lifecycle-evidence/memory-receipt%3Adomain%2Faccepted',
      ],
      handler: (args) => ({
        memory_artifact_lifecycle_evidence_ledger_verify:
          verifyMemoryArtifactLifecycleEvidenceReceipt(
            parseVerifyArgs(
              args,
              commandSpecs['runtime memory-artifact-lifecycle-evidence verify'],
            ),
          ),
      }),
    },
    'runtime memory-artifact-lifecycle-evidence list': {
      usage: 'opl runtime memory-artifact-lifecycle-evidence list',
      summary:
        'List refs-only memory/artifact/lifecycle evidence receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime memory-artifact-lifecycle-evidence list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime memory-artifact-lifecycle-evidence list']);
        const receipts = listMemoryArtifactLifecycleEvidenceReceipts();
        return {
          memory_artifact_lifecycle_evidence_ledger: {
            surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            projection: buildMemoryArtifactLifecycleEvidenceProjection(),
            authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
          },
        };
      },
    },
  };
  const subcommands = [
    'runtime memory-artifact-lifecycle-evidence record',
    'runtime memory-artifact-lifecycle-evidence verify',
    'runtime memory-artifact-lifecycle-evidence list',
  ].map((command) => {
    const spec = commandSpecs[command];
    return {
      command,
      usage: spec.usage,
      summary: spec.summary,
    };
  });
  commandSpecs['runtime memory-artifact-lifecycle-evidence'] = {
    usage: 'opl runtime memory-artifact-lifecycle-evidence <record|verify|list>',
    summary:
      'Inspect or update refs-only memory/artifact/lifecycle evidence without claiming memory, artifact, package, export, domain, or production readiness.',
    examples: [
      'opl runtime memory-artifact-lifecycle-evidence list --json',
      'opl help runtime memory-artifact-lifecycle-evidence record',
    ],
    group: 'runtime',
    subcommands,
    handler: (args) => {
      assertNoArgs(args, commandSpecs['runtime memory-artifact-lifecycle-evidence']);
      return {
        memory_artifact_lifecycle_evidence_commands: {
          surface_kind: 'opl_runtime_memory_artifact_lifecycle_evidence_command_group',
          usage: 'opl runtime memory-artifact-lifecycle-evidence <record|verify|list>',
          accepted_refs_only_result_shapes: [
            'memory_receipt_ref',
            'memory_writeback_receipt_ref',
            'artifact_mutation_receipt_ref',
            'package_lifecycle_receipt_ref',
            'export_lifecycle_receipt_ref',
            'cleanup_restore_retention_receipt_ref',
            'typed_blocker_ref',
            'owner_acceptance_ref',
          ],
          subcommands,
          authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
        },
      };
    },
  };
  return commandSpecs;
}
