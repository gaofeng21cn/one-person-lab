import {
  buildMemoryArtifactLifecycleEvidenceProjection,
  listMemoryArtifactLifecycleEvidenceReceipts,
  memoryArtifactLifecycleEvidenceAuthorityBoundary,
  recordMemoryArtifactLifecycleEvidenceReceipts,
  verifyMemoryArtifactLifecycleEvidenceReceipt,
  type MemoryArtifactLifecycleEvidenceReceiptInput,
} from '../../memory-artifact-lifecycle-evidence-ledger.ts';
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

function parseMemoryArtifactLifecycleEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): MemoryArtifactLifecycleEvidenceReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError(
      'runtime memory-artifact-lifecycle-evidence record payload must be valid JSON.',
      spec,
      { parse_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(
      'runtime memory-artifact-lifecycle-evidence record payload must be a JSON object.',
      spec,
    );
  }
  return {
    memory_receipt_refs: stringList(parsed.memory_receipt_refs ?? parsed.memory_receipt_ref),
    memory_writeback_receipt_refs: stringList(
      parsed.memory_writeback_receipt_refs ?? parsed.memory_writeback_receipt_ref,
    ),
    artifact_mutation_receipt_refs: stringList(
      parsed.artifact_mutation_receipt_refs ?? parsed.artifact_mutation_receipt_ref,
    ),
    package_lifecycle_receipt_refs: stringList(
      parsed.package_lifecycle_receipt_refs ?? parsed.package_lifecycle_receipt_ref,
    ),
    export_lifecycle_receipt_refs: stringList(
      parsed.export_lifecycle_receipt_refs ?? parsed.export_lifecycle_receipt_ref,
    ),
    cleanup_restore_retention_receipt_refs: stringList(
      parsed.cleanup_restore_retention_receipt_refs
        ?? parsed.cleanup_restore_retention_receipt_ref,
    ),
    typed_blocker_refs: stringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    owner_acceptance_refs: stringList(
      parsed.owner_acceptance_refs ?? parsed.owner_acceptance_ref,
    ),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: MemoryArtifactLifecycleEvidenceReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime memory-artifact-lifecycle-evidence record requires --payload.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseMemoryArtifactLifecycleEvidencePayload(value, spec);
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime memory-artifact-lifecycle-evidence record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseMemoryArtifactLifecycleEvidencePayload(
        readPayloadFileText(value, spec),
        spec,
      );
      continue;
    }
    throw buildUsageError(
      `Unknown option for runtime memory-artifact-lifecycle-evidence record: ${token}.`,
      spec,
      { option: token },
    );
  }
  if (!payload) {
    throw buildUsageError(
      'runtime memory-artifact-lifecycle-evidence record requires --payload or --payload-file.',
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
        `Unknown option for runtime memory-artifact-lifecycle-evidence verify: ${token}.`,
        spec,
        { option: token },
      );
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError(
        'runtime memory-artifact-lifecycle-evidence verify requires --receipt-ref value.',
        spec,
        { option: '--receipt-ref' },
      );
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
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
