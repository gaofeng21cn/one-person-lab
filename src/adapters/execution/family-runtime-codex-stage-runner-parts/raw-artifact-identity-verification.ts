import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import {
  captureWorkItemRootIdentity,
  attestWorkItemRootIdentity,
  workItemRootIdentityContinues,
  readStableWorkItemFile,
  requireWorkItemRootIdentity,
  type WorkItemRootIdentity,
  type WorkItemRootIdentityContinuation,
  WorkItemFileBoundaryError,
} from '../../../authority/workspace/index.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';
import { isRecord, type JsonRecord } from './shared.ts';

const RAW_EXECUTOR_OUTPUT_FILENAME = 'raw-executor-output.txt';
const RAW_EXECUTOR_OUTPUT_METADATA_FILENAME = 'raw-executor-output.metadata.json';
const MAX_RAW_METADATA_BYTES = 1024 * 1024;

type RawExecutorOutputLocation = {
  stateRoot: string;
  attemptRoot: string;
  outputPath: string;
  metadataPath: string;
};

export type RawArtifactPhysicalLineageCapture = {
  artifactDir: string;
  outputPath: string;
  metadataPath: string;
  outputRef: string;
  physicalLineage: WorkItemRootIdentity;
  rootIdentity: WorkItemRootIdentity;
  location: RawExecutorOutputLocation;
};

type PersistedIdentityReceipt = {
  receiptRef: string;
  rollback: () => void;
};

type PendingIdentityReceipt = {
  commit: () => PersistedIdentityReceipt;
};

export type VerifiedFrameworkRawProgress = {
  artifactRef: string;
  artifactSha256: string;
  observed: {
    sha256: string;
    sizeBytes: number;
    bytes: null;
  };
  finalizeIdentityReceipt: (prepare: () => PendingIdentityReceipt) => string;
};

export type RecoveredFrameworkRawArtifact = {
  root_identity_continuation?: WorkItemRootIdentityContinuation;
  output_ref: string;
  metadata_ref: string;
  sha256: string;
  size_bytes: number;
};

function rawArtifactError(input: {
  message: string;
  blockedReason: string;
  artifactRef: string;
  details?: Record<string, unknown>;
}) {
  return new FrameworkContractError('contract_shape_invalid', input.message, {
    hard_stop_class: 'authority_boundary_violation',
    blocked_reason: input.blockedReason,
    artifact_ref: input.artifactRef,
    ...(input.details ?? {}),
  });
}

function safeAttemptDirectory(attemptId: string) {
  const readable = attemptId
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'attempt';
  const digest = crypto.createHash('sha256').update(attemptId).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

function rawExecutorOutputLocation(attemptId: string): RawExecutorOutputLocation {
  const stateRoot = ensureOplStateDir().state_dir;
  const attemptRoot = path.join(
    stateRoot,
    'runtime-state',
    'stage-attempt-artifacts',
    safeAttemptDirectory(attemptId),
  );
  return {
    stateRoot,
    attemptRoot,
    outputPath: path.join(attemptRoot, RAW_EXECUTOR_OUTPUT_FILENAME),
    metadataPath: path.join(attemptRoot, RAW_EXECUTOR_OUTPUT_METADATA_FILENAME),
  };
}

function exactObjectFields(value: JsonRecord, expected: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function rawStateLineageError(input: {
  artifactRef: string;
  location: RawExecutorOutputLocation;
  message: string;
  error?: unknown;
}): never {
  throw rawArtifactError({
    message: input.message,
    blockedReason: 'raw_executor_output_state_lineage_authority_violation',
    artifactRef: input.artifactRef,
    details: {
      state_root: input.location.stateRoot,
      attempt_root: input.location.attemptRoot,
      ...(input.error instanceof WorkItemFileBoundaryError
        ? { boundary_failure_code: input.error.failureCode }
        : {}),
      ...(input.error
        ? { lineage_error: input.error instanceof Error ? input.error.message : String(input.error) }
        : {}),
    },
  });
}

function rawProvenanceError(input: {
  artifactRef: string;
  message: string;
  details?: Record<string, unknown>;
}): never {
  throw rawArtifactError({
    message: input.message,
    blockedReason: 'raw_executor_output_provenance_mismatch_authority_violation',
    artifactRef: input.artifactRef,
    details: input.details,
  });
}

function physicalRawStateIdentity(input: {
  location: RawExecutorOutputLocation;
  artifactRef: string;
}) {
  const relative = path.relative(input.location.stateRoot, input.location.attemptRoot);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return rawStateLineageError({
      ...input,
      message: 'Raw executor output Attempt root is outside the configured OPL state root.',
    });
  }
  const lineagePaths = [input.location.stateRoot];
  let current = input.location.stateRoot;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    lineagePaths.push(current);
  }
  try {
    for (const directory of lineagePaths) {
      const stat = fs.lstatSync(directory, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return rawStateLineageError({
          ...input,
          message: 'Raw executor output ancestry must contain only physical OPL state directories.',
        });
      }
    }
    const stateStat = fs.lstatSync(input.location.stateRoot, { bigint: true });
    const attemptStat = fs.lstatSync(input.location.attemptRoot, { bigint: true });
    return {
      stateDevice: String(stateStat.dev),
      stateInode: String(stateStat.ino),
      attemptDevice: String(attemptStat.dev),
      attemptInode: String(attemptStat.ino),
    };
  } catch (error) {
    return rawStateLineageError({
      ...input,
      message: 'Raw executor output ancestry is missing, unreadable, or no longer physical.',
      error,
    });
  }
}

function rootIdentityFields(identity: WorkItemRootIdentity) {
  return {
    stateDevice: identity.workspace_device,
    stateInode: identity.workspace_inode,
    attemptDevice: identity.work_item_device,
    attemptInode: identity.work_item_inode,
  };
}

function rawRootIdentity(input: {
  location: RawExecutorOutputLocation;
  artifactRef: string;
}) {
  const before = physicalRawStateIdentity(input);
  let captured: WorkItemRootIdentity;
  try {
    captured = captureWorkItemRootIdentity({
      workspaceRoot: input.location.stateRoot,
      canonicalWorkItemRoot: input.location.attemptRoot,
      ref: input.artifactRef,
    });
  } catch (error) {
    return rawStateLineageError({
      ...input,
      message: 'Raw executor output state and Attempt roots could not be physically bound.',
      error,
    });
  }
  const after = physicalRawStateIdentity(input);
  const expected = rootIdentityFields(captured);
  if (JSON.stringify(before) !== JSON.stringify(expected) || JSON.stringify(after) !== JSON.stringify(expected)) {
    return rawStateLineageError({
      ...input,
      message: 'Raw executor output state or Attempt root changed physical identity during binding.',
    });
  }
  return captured;
}

function assertRawRootIdentity(input: {
  location: RawExecutorOutputLocation;
  artifactRef: string;
  rootIdentity: WorkItemRootIdentity;
}) {
  if (JSON.stringify(physicalRawStateIdentity(input)) !== JSON.stringify(rootIdentityFields(input.rootIdentity))) {
    return rawStateLineageError({
      ...input,
      message: 'Raw executor output state or Attempt root no longer matches its frozen physical identity.',
    });
  }
}

function rawPhysicalLineageContinuation(input: {
  location: RawExecutorOutputLocation;
  artifactRef: string;
  expected: WorkItemRootIdentity;
  actual: WorkItemRootIdentity;
}): WorkItemRootIdentityContinuation | undefined {
  if (workItemRootIdentityContinues(input.expected, input.actual)) {
    return input.expected.boot_uuid && input.expected.boot_uuid !== input.actual.boot_uuid
      ? { expected: input.expected, observed: input.actual } : undefined;
  }
  try {
    const attested = attestWorkItemRootIdentity({
      workspaceRoot: input.location.stateRoot,
      canonicalWorkItemRoot: input.location.attemptRoot,
      expectedRootIdentity: input.expected,
    });
    if (JSON.stringify(attested.root_identity) !== JSON.stringify(input.actual)) {
      throw new Error('Root identity changed during legacy re-attestation consumption.');
    }
    return attested.root_identity_continuation;
  } catch (error) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Raw executor output does not match its bound Attempt identity: no matching current-boot re-attestation.',
      details: { lineage_error: error instanceof Error ? error.message : String(error) },
    });
  }
}

export function captureRawArtifactPhysicalLineage(attemptId: string): RawArtifactPhysicalLineageCapture {
  const location = rawExecutorOutputLocation(attemptId);
  fs.mkdirSync(location.attemptRoot, { recursive: true });
  const outputRef = pathToFileURL(location.outputPath).href;
  const rootIdentity = rawRootIdentity({ location, artifactRef: outputRef });
  return {
    artifactDir: location.attemptRoot,
    outputPath: location.outputPath,
    metadataPath: location.metadataPath,
    outputRef,
    physicalLineage: rootIdentity,
    rootIdentity,
    location,
  };
}

export function assertRawArtifactPhysicalLineage(capture: RawArtifactPhysicalLineageCapture) {
  assertRawRootIdentity({
    location: capture.location,
    artifactRef: capture.outputRef,
    rootIdentity: capture.rootIdentity,
  });
}

function readStableRawStateFile(input: {
  location: RawExecutorOutputLocation;
  rootIdentity: WorkItemRootIdentity;
  filePath: string;
  artifactRef: string;
  maxBytes?: number;
}) {
  try {
    return readStableWorkItemFile({
      workspaceRoot: input.location.stateRoot,
      canonicalWorkItemRoot: input.location.attemptRoot,
      expectedRootIdentity: input.rootIdentity,
      filePath: input.filePath,
      ref: input.artifactRef,
      maxBytes: input.maxBytes,
    });
  } catch (error) {
    return rawStateLineageError({
      artifactRef: input.artifactRef,
      location: input.location,
      message: 'Raw executor output state lineage changed while its framework provenance was verified.',
      error,
    });
  }
}

function exactStringList(value: unknown, expected: string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
    ? value as string[]
    : null;
}

function requireCanonicalRawProgressPacket(input: {
  closeoutPacket: TypedStageCloseoutPacket;
  attempt: JsonRecord;
  routeImpact: JsonRecord;
  artifactRef: string;
  metadataRef: string;
}) {
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stageRunId = optionalString(input.attempt.stage_run_id);
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const executionScope = isRecord(input.attempt.execution_scope) ? input.attempt.execution_scope : null;
  const normalizationFindings = stringList(input.routeImpact.normalization_findings);
  const expectedQualityDebtRefs = normalizationFindings?.map(
    (finding) => `opl://stage-attempts/${encodeURIComponent(attemptId)}/quality-debt/${encodeURIComponent(finding)}`,
  ) ?? [];
  const expectedPacketFields = [
    'authority_boundary',
    'closeout_ref_metadata',
    'closeout_refs',
    'consumed_memory_refs',
    'consumed_refs',
    'domain_ready_verdict',
    'next_owner',
    'rejected_writes',
    'route_impact',
    'stage_attempt_id',
    'surface_kind',
    'writeback_receipt_refs',
    ...(stageRunId ? ['stage_run_id'] : []),
    ...(idempotencyKey ? ['idempotency_key'] : []),
    ...(executionScope ? ['execution_scope', 'scope_digest'] : []),
  ];
  const expectedRouteFields = [
    'artifact_metadata_refs',
    'consumable_artifact_refs',
    'framework_generated_envelope',
    'negative_or_partial_output_counts_as_progress',
    'next_stage_may_start',
    'normalization_findings',
    'quality_debt_refs',
    'route_back_may_target_any_declared_stage',
    'route_back_selection_owner',
    'transition_outcome',
  ];
  const authority = input.closeoutPacket.authority_boundary;
  const expectedAuthorityFields = [
    'can_authorize_quality_verdict',
    'can_create_owner_receipt',
    'can_create_typed_blocker',
    'can_write_domain_truth',
    'domain',
    'opl',
    'provider_completion_is_domain_ready',
  ];
  const consumedRefs = stringList(input.closeoutPacket.consumed_refs);
  if (
    !exactObjectFields(input.closeoutPacket as unknown as JsonRecord, expectedPacketFields)
    || !exactObjectFields(input.routeImpact, expectedRouteFields)
    || !exactObjectFields(authority, expectedAuthorityFields)
    || input.closeoutPacket.surface_kind !== 'stage_attempt_closeout_packet'
    || input.closeoutPacket.stage_attempt_id !== attemptId
    || input.closeoutPacket.stage_run_id !== (stageRunId ?? undefined)
    || input.closeoutPacket.idempotency_key !== (idempotencyKey ?? undefined)
    || (executionScope
      ? JSON.stringify(input.closeoutPacket.execution_scope) !== JSON.stringify(executionScope)
        || input.closeoutPacket.scope_digest !== executionScope.scope_digest
      : input.closeoutPacket.execution_scope !== undefined || input.closeoutPacket.scope_digest !== undefined)
    || !consumedRefs
    || consumedRefs.length !== 1
    || !exactStringList(input.closeoutPacket.consumed_memory_refs, [])
    || !exactStringList(input.closeoutPacket.writeback_receipt_refs, [])
    || input.closeoutPacket.rejected_writes.length !== 0
    || input.closeoutPacket.next_owner !== (optionalString(input.attempt.domain_id) ?? null)
    || input.closeoutPacket.domain_ready_verdict !== 'completed_with_quality_debt'
    || input.routeImpact.transition_outcome !== 'completed_with_quality_debt'
    || !exactStringList(input.routeImpact.consumable_artifact_refs, [input.artifactRef])
    || !exactStringList(input.routeImpact.artifact_metadata_refs, [input.metadataRef])
    || !normalizationFindings
    || !normalizationFindings.includes('typed_closeout_not_required_raw_artifact_advanced')
    || !exactStringList(input.routeImpact.quality_debt_refs, expectedQualityDebtRefs)
    || input.routeImpact.next_stage_may_start !== true
    || input.routeImpact.route_back_selection_owner !== 'codex_cli'
    || input.routeImpact.route_back_may_target_any_declared_stage !== true
    || input.routeImpact.negative_or_partial_output_counts_as_progress !== true
    || input.routeImpact.framework_generated_envelope !== true
    || authority.opl !== 'raw_executor_output_progress_envelope_only'
    || authority.domain !== 'truth_quality_route_back_and_artifact_authority_owner'
    || authority.can_write_domain_truth !== false
    || authority.can_create_owner_receipt !== false
    || authority.can_create_typed_blocker !== false
    || authority.can_authorize_quality_verdict !== false
    || authority.provider_completion_is_domain_ready !== false
  ) {
    throw rawArtifactError({
      message: 'Framework raw progress must exactly match the canonical runner-generated closeout shape.',
      blockedReason: 'raw_executor_output_semantic_authority_violation',
      artifactRef: input.artifactRef,
      details: {
        packet_fields: Object.keys(input.closeoutPacket).sort(),
        route_impact_fields: Object.keys(input.routeImpact).sort(),
        authority_boundary_fields: Object.keys(authority).sort(),
      },
    });
  }
}

function readBoundedRawMetadata(input: {
  location: RawExecutorOutputLocation;
  artifactRef: string;
}) {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(
      input.location.metadataPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size > MAX_RAW_METADATA_BYTES) {
      return rawStateLineageError({
        ...input,
        message: 'Raw executor output metadata is not a bounded regular file.',
      });
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    const stableIdentity = (stat: fs.Stats) => [
      stat.dev,
      stat.ino,
      stat.mode,
      stat.nlink,
      stat.size,
      stat.mtimeMs,
      stat.ctimeMs,
    ].join(':');
    if (offset !== bytes.length || stableIdentity(before) !== stableIdentity(after)) {
      return rawStateLineageError({
        ...input,
        message: 'Raw executor output metadata changed while its bytes were read.',
      });
    }
    return bytes;
  } catch (error) {
    return rawStateLineageError({
      ...input,
      message: 'Raw executor output metadata could not be read through its bound Attempt lineage.',
      error,
    });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function rawArtifactMetadata(input: {
  location: RawExecutorOutputLocation;
  rootIdentity: WorkItemRootIdentity;
  artifactRef: string;
  attemptId: string;
  domainId: string | null;
  stageId: string | null;
}) {
  const before = readStableRawStateFile({
    ...input,
    filePath: input.location.metadataPath,
    maxBytes: MAX_RAW_METADATA_BYTES,
  });
  const bytes = readBoundedRawMetadata(input);
  const after = readStableRawStateFile({
    ...input,
    filePath: input.location.metadataPath,
    maxBytes: MAX_RAW_METADATA_BYTES,
  });
  const capturedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (
    before.sha256 !== `sha256:${capturedSha256}`
    || after.sha256 !== `sha256:${capturedSha256}`
    || before.byte_size !== bytes.length
    || after.byte_size !== bytes.length
  ) {
    return rawStateLineageError({
      artifactRef: input.artifactRef,
      location: input.location,
      message: 'Raw executor output metadata changed while its framework provenance was verified.',
    });
  }
  let provenance: JsonRecord;
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isRecord(parsed)) throw new Error('metadata is not an object');
    provenance = parsed;
  } catch (error) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Raw executor output metadata is not valid framework provenance JSON.',
      details: { metadata_error: error instanceof Error ? error.message : String(error) },
    });
  }
  const authority = isRecord(provenance.authority_boundary) ? provenance.authority_boundary : {};
  const expectedProvenanceFields = [
    'artifact_is_consumable_progress_input',
    'artifact_is_domain_truth',
    'artifact_is_owner_receipt',
    'artifact_is_quality_verdict',
    'authority_boundary',
    'domain_id',
    'observed_at',
    'output_ref',
    'physical_lineage',
    'sha256',
    'size_bytes',
    'stage_attempt_id',
    'stage_id',
    'surface_kind',
    'version',
  ].sort();
  let physicalLineage: WorkItemRootIdentity;
  try {
    physicalLineage = requireWorkItemRootIdentity(provenance.physical_lineage);
  } catch (error) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Raw executor output metadata has invalid physical lineage.',
      details: { lineage_error: error instanceof Error ? error.message : String(error) },
    });
  }
  if (
    JSON.stringify(Object.keys(provenance).sort()) !== JSON.stringify(expectedProvenanceFields)
    || provenance.surface_kind !== 'opl_raw_stage_output_artifact'
    || provenance.version !== 'raw-stage-output-artifact.v1'
    || provenance.domain_id !== input.domainId
    || provenance.stage_id !== input.stageId
    || provenance.stage_attempt_id !== input.attemptId
    || provenance.output_ref !== input.artifactRef
    || !optionalString(provenance.observed_at)
    || provenance.artifact_is_domain_truth !== false
    || provenance.artifact_is_owner_receipt !== false
    || provenance.artifact_is_quality_verdict !== false
    || provenance.artifact_is_consumable_progress_input !== true
    || JSON.stringify(Object.keys(authority).sort()) !== JSON.stringify(['domain', 'opl'])
    || authority.opl !== 'raw_executor_output_persistence_and_refs_only_envelope'
    || authority.domain !== 'semantic_interpretation_quality_and_route_back_owner'
  ) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Raw executor output metadata does not match its bound Attempt identity.',
      details: { metadata_ref: pathToFileURL(input.location.metadataPath).href },
    });
  }
  return { provenance, physicalLineage };
}

export function recoverFrameworkRawArtifactForAttempt(
  attempt: JsonRecord,
): RecoveredFrameworkRawArtifact | null {
  const attemptId = optionalString(attempt.stage_attempt_id);
  if (!attemptId) return null;
  const location = rawExecutorOutputLocation(attemptId);
  if (!fs.existsSync(location.outputPath) && !fs.existsSync(location.metadataPath)) return null;
  const artifactRef = pathToFileURL(location.outputPath).href;
  if (!fs.existsSync(location.outputPath) || !fs.existsSync(location.metadataPath)) {
    return rawProvenanceError({
      artifactRef,
      message: 'Framework raw executor output recovery requires both bytes and metadata.',
      details: {
        output_exists: fs.existsSync(location.outputPath),
        metadata_exists: fs.existsSync(location.metadataPath),
      },
    });
  }
  const rootIdentity = rawRootIdentity({ location, artifactRef });
  const { provenance, physicalLineage } = rawArtifactMetadata({
    location, rootIdentity, artifactRef, attemptId,
    domainId: optionalString(attempt.domain_id),
    stageId: optionalString(attempt.stage_id),
  });
  const declaredSha256 = optionalString(provenance.sha256);
  const declaredSizeBytes = provenance.size_bytes;
  if (
    !declaredSha256?.match(/^[a-f0-9]{64}$/)
    || typeof declaredSizeBytes !== 'number'
    || !Number.isSafeInteger(declaredSizeBytes)
    || declaredSizeBytes <= 0
  ) {
    return rawProvenanceError({
      artifactRef,
      message: 'Recovered raw executor output metadata does not match its bound Attempt identity.',
    });
  }
  const continuation = rawPhysicalLineageContinuation({ location, artifactRef, expected: physicalLineage, actual: rootIdentity });
  const output = readStableRawStateFile({
    location,
    rootIdentity,
    filePath: location.outputPath,
    artifactRef,
  });
  assertRawRootIdentity({ location, artifactRef, rootIdentity });
  if (
    output.sha256 !== `sha256:${declaredSha256}`
    || output.byte_size !== declaredSizeBytes
  ) {
    return rawProvenanceError({
      artifactRef,
      message: 'Recovered raw executor output bytes do not match their framework metadata.',
      details: {
        declared_sha256: declaredSha256,
        observed_sha256: output.sha256,
        declared_size_bytes: declaredSizeBytes,
        observed_size_bytes: output.byte_size,
      },
    });
  }
  return {
    output_ref: artifactRef,
    metadata_ref: pathToFileURL(location.metadataPath).href,
    sha256: declaredSha256,
    size_bytes: declaredSizeBytes,
    ...(continuation ? { root_identity_continuation: continuation } : {}),
  };
}

export function verifyFrameworkRawArtifactInput(input: {
  attemptId: string;
  stageId: string;
  domainId: string;
  artifactRef: string;
  artifactSha256: string;
}) {
  const location = rawExecutorOutputLocation(input.attemptId);
  if (input.artifactRef !== pathToFileURL(location.outputPath).href) return null;
  const artifact = recoverFrameworkRawArtifactForAttempt({
    stage_attempt_id: input.attemptId,
    stage_id: input.stageId,
    domain_id: input.domainId,
  });
  if (!artifact || artifact.sha256 !== input.artifactSha256) {
    return rawProvenanceError({
      artifactRef: input.artifactRef,
      message: 'Raw progress input no longer matches its producing Attempt bytes.',
    });
  }
  return artifact;
}

export function verifyFrameworkRawProgressEnvelope(input: {
  closeoutPacket: TypedStageCloseoutPacket;
  attempt: JsonRecord;
  routeImpact: JsonRecord;
  closeoutMetadata: JsonRecord[];
}): VerifiedFrameworkRawProgress {
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const domainId = optionalString(input.attempt.domain_id) ?? 'unknown-domain';
  const stageId = optionalString(input.attempt.stage_id) ?? 'unknown-stage';
  const semanticFields = [
    ...(Object.prototype.hasOwnProperty.call(input.routeImpact, 'stage_quality_cycle')
      ? ['route_impact.stage_quality_cycle']
      : []),
    ...(Object.prototype.hasOwnProperty.call(input.routeImpact, 'domain_output')
      ? ['route_impact.domain_output']
      : []),
    ...(input.closeoutPacket.domain_output ? ['domain_output'] : []),
  ];
  if (semanticFields.length > 0) {
    throw rawArtifactError({
      message: 'Framework raw executor output cannot assert Stage quality or domain output semantics.',
      blockedReason: 'raw_executor_output_semantic_authority_violation',
      artifactRef: input.closeoutPacket.closeout_refs[0] ?? 'missing',
      details: { forbidden_fields: semanticFields },
    });
  }
  const rawEntries = input.closeoutMetadata.filter(
    (entry) => optionalString(entry.ref_kind) === 'raw_executor_output',
  );
  const rawEntry = rawEntries[0];
  const artifactRef = optionalString(rawEntry?.ref) ?? optionalString(rawEntry?.uri) ?? 'missing';
  const rawHash = optionalString(rawEntry?.sha256);
  const rawSize = rawEntry?.size_bytes;
  const location = rawExecutorOutputLocation(attemptId);
  const expectedArtifactRef = pathToFileURL(location.outputPath).href;
  const expectedMetadataRef = pathToFileURL(location.metadataPath).href;
  const expectedRawEntryFields = ['ref', 'ref_kind', 'sha256', 'size_bytes'];
  if (
    input.closeoutPacket.surface_kind !== 'stage_attempt_closeout_packet'
    || input.closeoutPacket.stage_attempt_id !== attemptId
    || input.closeoutMetadata.length !== 1
    || rawEntries.length !== 1
    || JSON.stringify(Object.keys(rawEntry ?? {}).sort()) !== JSON.stringify(expectedRawEntryFields)
    || !exactStringList(input.closeoutPacket.closeout_refs, [artifactRef])
    || artifactRef !== expectedArtifactRef
    || typeof rawHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(rawHash)
    || typeof rawSize !== 'number'
    || !Number.isSafeInteger(rawSize)
    || rawSize < 0
    || input.routeImpact.framework_generated_envelope !== true
    || !exactStringList(input.routeImpact.consumable_artifact_refs, [artifactRef])
    || !exactStringList(input.routeImpact.artifact_metadata_refs, [expectedMetadataRef])
    || optionalString(input.closeoutPacket.authority_boundary.opl)
      !== 'raw_executor_output_progress_envelope_only'
    || optionalString(input.closeoutPacket.authority_boundary.domain)
      !== 'truth_quality_route_back_and_artifact_authority_owner'
  ) {
    return rawProvenanceError({
      artifactRef,
      message: 'Raw executor output exception requires one exact framework-bound ref, hash, size, and metadata lineage.',
      details: {
        expected_artifact_ref: expectedArtifactRef,
        expected_metadata_ref: expectedMetadataRef,
        closeout_ref_count: input.closeoutPacket.closeout_refs.length,
        closeout_metadata_count: input.closeoutMetadata.length,
        raw_metadata_count: rawEntries.length,
      },
    });
  }
  requireCanonicalRawProgressPacket({
    closeoutPacket: input.closeoutPacket,
    attempt: input.attempt,
    routeImpact: input.routeImpact,
    artifactRef,
    metadataRef: expectedMetadataRef,
  });
  const rootIdentity = rawRootIdentity({ location, artifactRef });
  const { provenance, physicalLineage } = rawArtifactMetadata({
    location, rootIdentity, artifactRef, attemptId, domainId, stageId,
  });
  if (
    provenance.sha256 !== rawHash
    || provenance.size_bytes !== rawSize
  ) {
    return rawProvenanceError({
      artifactRef,
      message: 'Raw executor output metadata does not exactly bind its framework-owned Attempt lineage.',
      details: { metadata_ref: expectedMetadataRef },
    });
  }
  rawPhysicalLineageContinuation({ location, artifactRef, expected: physicalLineage, actual: rootIdentity });
  const output = readStableRawStateFile({
    location,
    rootIdentity,
    filePath: location.outputPath,
    artifactRef,
  });
  assertRawRootIdentity({ location, artifactRef, rootIdentity });
  const observed = {
    sha256: output.sha256.slice('sha256:'.length),
    sizeBytes: output.byte_size,
    bytes: null,
  };
  if (observed.sha256 !== rawHash || observed.sizeBytes !== rawSize) {
    return rawProvenanceError({
      artifactRef,
      message: 'Raw executor output bytes do not match their exact framework provenance metadata.',
      details: {
        declared_sha256: rawHash,
        observed_sha256: observed.sha256,
        declared_size_bytes: rawSize,
        observed_size_bytes: observed.sizeBytes,
      },
    });
  }
  const observeExpectedOutput = () => {
    const next = readStableRawStateFile({
      location,
      rootIdentity,
      filePath: location.outputPath,
      artifactRef,
    });
    assertRawRootIdentity({ location, artifactRef, rootIdentity });
    const nextSha256 = next.sha256.slice('sha256:'.length);
    if (nextSha256 !== rawHash || next.byte_size !== rawSize) {
      return rawProvenanceError({
        artifactRef,
        message: 'Raw executor output changed before its transport identity receipt was finalized.',
        details: {
          declared_sha256: rawHash,
          observed_sha256: nextSha256,
          declared_size_bytes: rawSize,
          observed_size_bytes: next.byte_size,
        },
      });
    }
  };
  return {
    artifactRef,
    artifactSha256: rawHash,
    observed,
    finalizeIdentityReceipt(prepare) {
      const pendingReceipt = prepare();
      observeExpectedOutput();
      const receipt = pendingReceipt.commit();
      try {
        observeExpectedOutput();
        return receipt.receiptRef;
      } catch (error) {
        receipt.rollback();
        throw error;
      }
    },
  };
}
