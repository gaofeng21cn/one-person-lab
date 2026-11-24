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
import { isRecord, type JsonRecord } from './shared.ts';

export const RAW_EXECUTOR_OUTPUT_FILENAME = 'raw-executor-output.txt';
export const RAW_EXECUTOR_OUTPUT_METADATA_FILENAME = 'raw-executor-output.metadata.json';
export const MAX_RAW_METADATA_BYTES = 1024 * 1024;

export type RawExecutorOutputLocation = {
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

export type RecoveredFrameworkRawArtifact = {
  root_identity_continuation?: WorkItemRootIdentityContinuation;
  output_ref: string;
  metadata_ref: string;
  sha256: string;
  size_bytes: number;
};

export function rawArtifactError(input: {
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

export function safeAttemptDirectory(attemptId: string) {
  const readable = attemptId
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'attempt';
  const digest = crypto.createHash('sha256').update(attemptId).digest('hex').slice(0, 12);
  return readable + '-' + digest;
}

export function rawExecutorOutputLocation(attemptId: string): RawExecutorOutputLocation {
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

export function rawStateLineageError(input: {
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

export function rawProvenanceError(input: {
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
    || relative.startsWith('..' + path.sep)
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

export function rawRootIdentity(input: {
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

export function assertRawRootIdentity(input: {
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

export function rawPhysicalLineageContinuation(input: {
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

export function readStableRawStateFile(input: {
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

export function rawArtifactMetadata(input: {
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
    before.sha256 !== 'sha256:' + capturedSha256
    || after.sha256 !== 'sha256:' + capturedSha256
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
    output.sha256 !== 'sha256:' + declaredSha256
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

export function sameRawArtifactsRoot(candidate: string, expected: string) {
  if (candidate === expected) return true;
  try {
    return fs.realpathSync.native(candidate) === fs.realpathSync.native(expected);
  } catch {
    return false;
  }
}
