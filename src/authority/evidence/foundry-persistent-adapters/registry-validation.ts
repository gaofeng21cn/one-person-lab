import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { compileStandardAgentStageManifest } from '../../packages/index.ts';
import {
  foundryContentDigest,
  materializeFoundryOperationResult,
  validateFoundryEvaluationOperationIdentity,
  validateFoundryOperationResult,
  type FoundryEvaluationOperationIdentity,
  type FoundryOperationResultJournal,
} from '../../evolution/index.ts';
import type {
  ActivationPointer,
  ActivationRuntimeBindingVerification,
  ActivationTransaction,
  AgentVersion,
  CandidateCompiler,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  QualificationRecord,
  VersionRegistry,
} from '../../evolution/index.ts';
import {
  assertFoundryEventReplay,
  FOUNDRY_TERMINAL_STATES,
  snapshotFromEvents,
  verifyFoundryEventChain,
  type FoundryRunEvent,
  type FoundryRunSnapshot,
} from '../../evolution/index.ts';

import {
  CANDIDATE_ACTION_CATALOG_PATH,
  CANDIDATE_INDEX_VERSION,
  CANDIDATE_QUALITY_POLICY_PATH,
  CANDIDATE_QUALITY_ROLE_PROMPT_PATH,
  CANDIDATE_QUALITY_RUBRIC_PATH,
  CANDIDATE_RESOURCE_FIELDS,
  CANDIDATE_RESOURCE_LOCK_PATH,
  CANDIDATE_RESOURCE_LOCK_VERSION,
  CANDIDATE_STAGE_MANIFEST_PATH,
  FILE_STORE_VERSION,
  VERSION_REGISTRY_EPOCH_DIRECTORY,
  VERSION_REGISTRY_EPOCH_MARKER,
  VERSION_REGISTRY_EPOCH_VERSION,
  candidateResourcePackPath,
  canonicalDigest,
  cleanupDeadMutationLocks,
  cleanupDeadStaging,
  cleanupLegacyMutationLockTemps,
  clone,
  contentDigestFromRef,
  digestSegment,
  ensureDurableDirectory,
  ensureStorage,
  errorCode,
  fail,
  foundryStoragePaths,
  fsyncDirectory,
  fsyncFile,
  processIsAlive,
  readJson,
  readMutationLock,
  readPhysicalCanonicalJson,
  reclaimAbandonedMutationLock,
  requireSafeSegment,
  requireDigest,
  requireExactKeys,
  requireRecord,
  requireString,
  requireUnique,
  requireWritable,
  sha256,
  stagedEntry,
  targetStorageKey,
  withMutationLock,
  writeAtomic,
  writeExclusive,
  writeStagedFile,
  listPhysicalFiles,
  type CandidateResourceBinding,
  type CandidateResourceKind,
  type CandidateResourceLock,
  type FoundryPersistentAdapterOptions,
  type FoundryStoragePaths,
  type MutationLockRecord,
} from './shared.ts';

export type RegistryState = {
  versions: AgentVersion[];
  qualifications: QualificationRecord[];
  activation: ActivationPointer;
  transactions: ActivationTransaction[];
};

export type VersionRegistryEpochMarker = {
  surface_kind: 'opl_foundry_version_registry_epoch';
  version: typeof VERSION_REGISTRY_EPOCH_VERSION;
  target_agent_id: string;
  target_domain_id: string;
};

export type CandidateVersionIdentity = Pick<
  AgentVersion,
  'target_agent_id' | 'target_domain_id' | 'blueprint_digest' | 'candidate_digest' | 'candidate_ref'
>;

export function requireStoredIdentity(
  value: { target_agent_id: string; target_domain_id: string },
  targetAgentId: string,
  targetDomainId: string,
  label: string,
) {
  if (value.target_agent_id !== targetAgentId || value.target_domain_id !== targetDomainId) {
    fail(`${label} target identity does not match its registry.`, {
      expected_target_agent_id: targetAgentId,
      expected_target_domain_id: targetDomainId,
      actual_target_agent_id: value.target_agent_id,
      actual_target_domain_id: value.target_domain_id,
    });
  }
}

export function readCanonicalRegistryJson(file: string, label: string) {
  return readPhysicalCanonicalJson(file, label);
}

export function readRegistryDirectory<T>(
  directory: string,
  label: string,
  validate: (value: unknown, name: string) => T,
  readOnly = false,
) {
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a physical directory.`, { directory });
  let removed = false;
  const authoritative = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => {
    const match = /\.json\.tmp-(\d+)-[0-9a-f-]+$/.exec(entry.name);
    if (!match || !entry.isFile()) return true;
    if (!readOnly && !processIsAlive(Number(match[1]))) {
      fs.rmSync(path.join(directory, entry.name), { force: true });
      removed = true;
    }
    return false;
  });
  if (removed) fsyncDirectory(directory);
  return authoritative
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) {
        fail(`${label} contains a forbidden filesystem entry.`, { entry: entry.name });
      }
      return validate(readCanonicalRegistryJson(path.join(directory, entry.name), label), entry.name);
    });
}

export function validateQualificationRecord(
  value: unknown,
  targetAgentId: string,
  targetDomainId: string,
  fileName: string,
) {
  const raw = requireRecord(value, 'QualificationRecord');
  requireExactKeys(raw, [
    'surface_kind', 'qualification_id', 'qualification_digest', 'target_agent_id', 'target_domain_id',
    'blueprint_digest', 'candidate_digest', 'evidence_digest', 'risk_tier', 'qualified_at',
  ], 'QualificationRecord');
  const record = raw as unknown as QualificationRecord;
  if (record.surface_kind !== 'opl_foundry_qualification_record') fail('QualificationRecord surface is invalid.');
  requireStoredIdentity(record, targetAgentId, targetDomainId, 'QualificationRecord');
  requireDigest(record.blueprint_digest, 'blueprint_digest');
  requireDigest(record.candidate_digest, 'candidate_digest');
  requireDigest(record.evidence_digest, 'evidence_digest');
  requireString(record.qualified_at, 'qualified_at');
  if (!['low', 'medium', 'high'].includes(record.risk_tier)) fail('QualificationRecord risk tier is invalid.');
  if (record.qualification_id !== `qualification:${targetAgentId}:${record.candidate_digest}`) {
    fail('QualificationRecord identity is not canonical.', { qualification_id: record.qualification_id });
  }
  const { qualification_digest: _storedDigest, ...base } = record;
  const expectedDigest = canonicalDigest(base);
  if (record.qualification_digest !== expectedDigest) {
    fail('QualificationRecord digest does not match its canonical content.', {
      qualification_digest: record.qualification_digest,
      expected_digest: expectedDigest,
    });
  }
  if (fileName !== `${digestSegment(record.qualification_digest)}.json`) {
    fail('QualificationRecord filename does not match its digest.', { file_name: fileName });
  }
  return record;
}

export function validateAgentVersion(
  value: unknown,
  targetAgentId: string,
  targetDomainId: string,
  fileName: string,
) {
  const raw = requireRecord(value, 'AgentVersion');
  requireExactKeys(raw, [
    'surface_kind', 'version_id', 'version_digest', 'target_agent_id', 'target_domain_id',
    'blueprint_digest', 'candidate_digest', 'candidate_ref', 'qualification_digest', 'created_at',
  ], 'AgentVersion');
  const record = raw as unknown as AgentVersion;
  if (record.surface_kind !== 'opl_foundry_agent_version') fail('AgentVersion surface is invalid.');
  requireStoredIdentity(record, targetAgentId, targetDomainId, 'AgentVersion');
  requireDigest(record.blueprint_digest, 'blueprint_digest');
  requireDigest(record.candidate_digest, 'candidate_digest');
  requireDigest(record.qualification_digest, 'qualification_digest');
  requireString(record.created_at, 'created_at');
  if (record.candidate_ref !== `opl://foundry/candidate/${record.candidate_digest}`) {
    fail('AgentVersion candidate ref does not match its candidate digest.', { version_digest: record.version_digest });
  }
  if (record.version_id !== `version:${targetAgentId}:${record.candidate_digest}`) {
    fail('AgentVersion identity is not canonical.', { version_id: record.version_id });
  }
  const { version_digest: _storedDigest, ...base } = record;
  const expectedDigest = canonicalDigest(base);
  if (record.version_digest !== expectedDigest) {
    fail('AgentVersion digest does not match its canonical content.', {
      version_digest: record.version_digest,
      expected_digest: expectedDigest,
    });
  }
  if (fileName !== `${digestSegment(record.version_digest)}.json`) {
    fail('AgentVersion filename does not match its digest.', { file_name: fileName });
  }
  return record;
}

export function validateActivationPointer(value: unknown, targetAgentId: string, targetDomainId: string) {
  const raw = requireRecord(value, 'ActivationPointer');
  requireExactKeys(raw, [
    'surface_kind', 'target_agent_id', 'target_domain_id', 'active_version_digest',
    'revision', 'updated_at',
  ], 'ActivationPointer');
  const pointer = raw as unknown as ActivationPointer;
  if (pointer.surface_kind !== 'opl_foundry_activation_pointer') fail('ActivationPointer surface is invalid.');
  requireStoredIdentity(pointer, targetAgentId, targetDomainId, 'ActivationPointer');
  if (!Number.isSafeInteger(pointer.revision) || pointer.revision < 0) fail('ActivationPointer revision is invalid.');
  if (pointer.active_version_digest !== null) requireDigest(pointer.active_version_digest, 'active_version_digest');
  if (pointer.updated_at !== null) requireString(pointer.updated_at, 'updated_at');
  if (pointer.revision === 0 && (pointer.active_version_digest !== null || pointer.updated_at !== null)) {
    fail('ActivationPointer revision zero must be empty.');
  }
  if (pointer.revision > 0 && (pointer.active_version_digest === null || pointer.updated_at === null)) {
    fail('Activated pointer must identify an exact version and update time.');
  }
  return pointer;
}

export function validateActivationTransaction(
  value: unknown,
  targetAgentId: string,
  targetDomainId: string,
  fileName: string,
) {
  const raw = requireRecord(value, 'ActivationTransaction');
  requireExactKeys(raw, [
    'surface_kind', 'transaction_id', 'transaction_kind', 'target_agent_id', 'target_domain_id',
    'from_version_digest', 'to_version_digest', 'previous_revision', 'next_revision',
    'authority_receipt_ref', 'occurred_at', 'runtime_binding_verification',
  ], 'ActivationTransaction');
  const transaction = raw as unknown as ActivationTransaction;
  if (transaction.surface_kind !== 'opl_foundry_activation_transaction') fail('ActivationTransaction surface is invalid.');
  requireStoredIdentity(transaction, targetAgentId, targetDomainId, 'ActivationTransaction');
  if (transaction.transaction_kind !== 'activate' && transaction.transaction_kind !== 'rollback') {
    fail('ActivationTransaction kind is invalid.');
  }
  if (transaction.from_version_digest !== null) requireDigest(transaction.from_version_digest, 'from_version_digest');
  requireDigest(transaction.to_version_digest, 'to_version_digest');
  if (
    !Number.isSafeInteger(transaction.previous_revision)
    || transaction.previous_revision < 0
    || transaction.next_revision !== transaction.previous_revision + 1
  ) {
    fail('ActivationTransaction revision step is invalid.', { transaction_id: transaction.transaction_id });
  }
  if (transaction.authority_receipt_ref !== null) {
    requireString(transaction.authority_receipt_ref, 'authority_receipt_ref');
  }
  if (transaction.transaction_kind === 'rollback' && transaction.authority_receipt_ref === null) {
    fail('Rollback transaction requires an authority receipt.');
  }
  requireString(transaction.occurred_at, 'occurred_at');
  validateActivationRuntimeBindingVerification(transaction.runtime_binding_verification, {
    transaction_kind: transaction.transaction_kind,
    target_agent_id: transaction.target_agent_id,
    target_domain_id: transaction.target_domain_id,
    version_digest: transaction.to_version_digest,
    expected_revision: transaction.previous_revision,
  });
  const { transaction_id: _storedId, ...base } = transaction;
  const expectedId = `activation:${canonicalDigest(base)}`;
  if (transaction.transaction_id !== expectedId) {
    fail('ActivationTransaction id does not match its canonical content.', {
      transaction_id: transaction.transaction_id,
      expected_transaction_id: expectedId,
    });
  }
  const expectedFile = `${String(transaction.next_revision).padStart(10, '0')}.json`;
  if (fileName !== expectedFile) {
    fail('ActivationTransaction filename does not match its revision.', { file_name: fileName, expected_file: expectedFile });
  }
  return transaction;
}

export function validateActivationRuntimeBindingVerification(
  value: unknown,
  context: {
    transaction_kind: ActivationTransaction['transaction_kind'];
    target_agent_id: string;
    target_domain_id: string;
    version_digest: string;
    expected_revision: number;
    version?: AgentVersion;
  },
) {
  const raw = requireRecord(value, 'Activation runtime binding verification');
  requireExactKeys(raw, [
    'surface_kind', 'version', 'verification_phase', 'transaction_kind', 'target_agent_id',
    'target_domain_id', 'version_id', 'version_digest', 'candidate_digest', 'candidate_ref',
    'expected_activation_revision', 'preflight_ref', 'runtime_binding_ref',
  ], 'Activation runtime binding verification');
  const verification = raw as unknown as ActivationRuntimeBindingVerification;
  if (
    verification.surface_kind !== 'opl_foundry_activation_runtime_binding_verification'
    || verification.version !== 'opl-foundry-activation-runtime-binding-verification.v1'
    || verification.verification_phase !== 'pre_commit'
  ) {
    fail('Activation runtime binding verification surface is invalid.');
  }
  if (verification.transaction_kind !== context.transaction_kind) {
    fail('Activation runtime binding verification transaction kind does not match ActivationTransaction.');
  }
  if (
    verification.target_agent_id !== context.target_agent_id
    || verification.target_domain_id !== context.target_domain_id
  ) {
    fail('Activation runtime binding verification target identity does not match ActivationTransaction.');
  }
  requireString(verification.version_id, 'runtime_binding_verification.version_id');
  requireDigest(verification.version_digest, 'runtime_binding_verification.version_digest');
  requireDigest(verification.candidate_digest, 'runtime_binding_verification.candidate_digest');
  requireString(verification.candidate_ref, 'runtime_binding_verification.candidate_ref');
  if (verification.version_digest !== context.version_digest) {
    fail('Activation runtime binding verification version digest does not match ActivationTransaction.');
  }
  if (verification.expected_activation_revision !== context.expected_revision) {
    fail('Activation runtime binding verification expected revision does not match ActivationTransaction.');
  }
  requireString(verification.preflight_ref, 'runtime_binding_verification.preflight_ref');
  if (typeof verification.runtime_binding_ref !== 'string' || verification.runtime_binding_ref.length === 0) {
    fail('Activation runtime binding verification prepared runtime binding ref is invalid.');
  }
  if (context.version && (
    verification.version_id !== context.version.version_id
    || verification.version_digest !== context.version.version_digest
    || verification.candidate_digest !== context.version.candidate_digest
    || verification.candidate_ref !== context.version.candidate_ref
  )) {
    fail('Activation runtime binding verification does not match the exact AgentVersion.', {
      version_digest: context.version.version_digest,
    });
  }
  return verification;
}

export function storedBlueprintResourceRefs(value: unknown, version: CandidateVersionIdentity) {
  const blueprint = requireRecord(value, 'Foundry candidate AgentBlueprint');
  if (blueprint.surface_kind !== 'opl_foundry_agent_blueprint') {
    fail('Foundry candidate AgentBlueprint surface is invalid.', { candidate_digest: version.candidate_digest });
  }
  if (
    blueprint.target_agent_id !== version.target_agent_id
    || blueprint.target_domain_id !== version.target_domain_id
  ) {
    fail('Foundry candidate AgentBlueprint target identity does not match AgentVersion.', {
      candidate_digest: version.candidate_digest,
    });
  }
  if (foundryContentDigest(blueprint) !== version.blueprint_digest) {
    fail('Foundry candidate AgentBlueprint bytes do not match AgentVersion.', {
      candidate_digest: version.candidate_digest,
    });
  }
  const refs = requireRecord(blueprint.content_refs, 'Foundry candidate AgentBlueprint content_refs');
  requireExactKeys(
    refs,
    CANDIDATE_RESOURCE_FIELDS.map(({ field }) => field),
    'Foundry candidate AgentBlueprint content_refs',
  );
  return CANDIDATE_RESOURCE_FIELDS.flatMap(({ kind, field }) => {
    const values = refs[field];
    if (!Array.isArray(values)) {
      fail(`Foundry candidate AgentBlueprint ${field} must be an array.`, { field });
    }
    const normalized = values.map((ref, index) => requireString(ref, `${field}[${index}]`));
    requireUnique(normalized, `Foundry candidate AgentBlueprint ${field}`);
    return normalized.map((declaredRef) => ({ kind, declared_ref: declaredRef }));
  });
}

export function validateCandidateResourceLock(
  realDirectory: string,
  version: CandidateVersionIdentity,
  files: Array<{ path: string; sha256: string; byte_size: number }>,
) {
  const filesByPath = new Map(files.map((entry) => [entry.path, entry]));
  const requiredFiles = ['agent-blueprint.json', 'agent/agent-pack.json', CANDIDATE_RESOURCE_LOCK_PATH];
  const missingRequiredFiles = requiredFiles.filter((candidatePath) => !filesByPath.has(candidatePath));
  if (missingRequiredFiles.length > 0) {
    fail('Foundry candidate immutable resource closure is incomplete.', {
      candidate_digest: version.candidate_digest,
      missing_candidate_paths: missingRequiredFiles,
    });
  }
  const blueprint = readCanonicalRegistryJson(
    path.join(realDirectory, 'agent-blueprint.json'),
    'Foundry candidate AgentBlueprint',
  );
  const expectedResources = storedBlueprintResourceRefs(blueprint, version);
  const resourceLockFile = path.join(realDirectory, CANDIDATE_RESOURCE_LOCK_PATH);
  if (!fs.existsSync(resourceLockFile)) {
    fail('Foundry candidate immutable resource lock is missing.', { candidate_digest: version.candidate_digest });
  }
  const resourceLock = requireRecord(
    readCanonicalRegistryJson(resourceLockFile, 'Foundry candidate resource lock'),
    'Foundry candidate resource lock',
  );
  requireExactKeys(
    resourceLock,
    ['surface_kind', 'version', 'blueprint_digest', 'resources'],
    'Foundry candidate resource lock',
  );
  if (
    resourceLock.surface_kind !== 'opl_foundry_candidate_resource_lock'
    || resourceLock.version !== CANDIDATE_RESOURCE_LOCK_VERSION
    || resourceLock.blueprint_digest !== version.blueprint_digest
  ) {
    fail('Foundry candidate immutable resource lock identity is invalid.', {
      candidate_digest: version.candidate_digest,
    });
  }
  if (!Array.isArray(resourceLock.resources) || resourceLock.resources.length !== expectedResources.length) {
    fail('Foundry candidate immutable resource lock does not cover the complete AgentBlueprint inventory.', {
      candidate_digest: version.candidate_digest,
      expected_resource_count: expectedResources.length,
      actual_resource_count: Array.isArray(resourceLock.resources) ? resourceLock.resources.length : null,
    });
  }
  const resources = resourceLock.resources.map((value, index): CandidateResourceBinding => {
    const entry = requireRecord(value, `Foundry candidate resource lock entry ${index}`);
    requireExactKeys(
      entry,
      ['kind', 'declared_ref', 'immutable_ref', 'pack_path', 'sha256', 'byte_size'],
      `Foundry candidate resource lock entry ${index}`,
    );
    const expected = expectedResources[index]!;
    if (entry.kind !== expected.kind || entry.declared_ref !== expected.declared_ref) {
      fail('Foundry candidate immutable resource lock order or declaration differs from AgentBlueprint.', {
        candidate_digest: version.candidate_digest,
        resource_index: index,
      });
    }
    const declaredRef = requireString(entry.declared_ref, 'resource_lock.declared_ref');
    const immutableRef = requireString(entry.immutable_ref, 'resource_lock.immutable_ref');
    if (immutableRef !== declaredRef) {
      fail('Foundry candidate resource aliases cannot replace the declared immutable ref.', {
        candidate_digest: version.candidate_digest,
        declared_ref: declaredRef,
        immutable_ref: immutableRef,
      });
    }
    const digest = contentDigestFromRef(immutableRef);
    if (!digest) {
      fail('Foundry candidate resource lock contains a mutable or path-only ref.', {
        candidate_digest: version.candidate_digest,
        resource_ref: immutableRef,
      });
    }
    const resourceDigest = requireDigest(entry.sha256, 'resource_lock.sha256');
    const expectedPackPath = candidateResourcePackPath(expected.kind, digest);
    if (resourceDigest !== `sha256:${digest}` || entry.pack_path !== expectedPackPath) {
      fail('Foundry candidate resource lock address does not match its immutable ref.', {
        candidate_digest: version.candidate_digest,
        resource_ref: immutableRef,
      });
    }
    if (!Number.isSafeInteger(entry.byte_size) || (entry.byte_size as number) <= 0) {
      fail('Foundry candidate resource lock byte size is invalid.', { resource_ref: immutableRef });
    }
    const indexed = filesByPath.get(expectedPackPath);
    if (
      !indexed
      || indexed.sha256 !== digest
      || indexed.byte_size !== entry.byte_size
    ) {
      fail('Foundry candidate resource lock does not match the immutable file index.', {
        candidate_digest: version.candidate_digest,
        resource_ref: immutableRef,
      });
    }
    return {
      kind: expected.kind,
      declared_ref: declaredRef,
      immutable_ref: immutableRef,
      pack_path: expectedPackPath,
      sha256: resourceDigest,
      byte_size: entry.byte_size as number,
    };
  });
  requireUnique(resources.map(({ kind, declared_ref: ref }) => `${kind}\0${ref}`), 'Foundry candidate resource lock');
  const lockedResourceFiles = resources.map((entry) => entry.pack_path).sort();
  const lockedResourceFileSet = new Set(lockedResourceFiles);
  const indexedResourceFiles = files
    .map((entry) => entry.path)
    .filter((candidatePath) => candidatePath.startsWith('content/') || lockedResourceFileSet.has(candidatePath))
    .sort();
  if (canonicalJsonText(indexedResourceFiles) !== canonicalJsonText(lockedResourceFiles)) {
    fail('Foundry candidate contains resource bytes outside the immutable resource lock.', {
      candidate_digest: version.candidate_digest,
    });
  }

  const manifest = requireRecord(
    readCanonicalRegistryJson(path.join(realDirectory, 'agent/agent-pack.json'), 'Foundry candidate Agent Pack'),
    'Foundry candidate Agent Pack',
  );
  if (
    manifest.surface_kind !== 'opl_foundry_agent_pack'
    || manifest.blueprint_digest !== version.blueprint_digest
    || manifest.target_agent_id !== version.target_agent_id
    || manifest.target_domain_id !== version.target_domain_id
  ) {
    fail('Foundry candidate Agent Pack identity does not match AgentVersion.', {
      candidate_digest: version.candidate_digest,
    });
  }
  const manifestLock = requireRecord(manifest.resource_lock, 'Foundry candidate Agent Pack resource_lock');
  requireExactKeys(manifestLock, ['ref', 'digest'], 'Foundry candidate Agent Pack resource_lock');
  const resourceLockDigest = canonicalDigest(resourceLock);
  if (!Array.isArray(manifest.content_bindings)) {
    fail('Foundry candidate Agent Pack content bindings are missing.', {
      candidate_digest: version.candidate_digest,
    });
  }
  if (
    manifestLock.ref !== CANDIDATE_RESOURCE_LOCK_PATH
    || manifestLock.digest !== resourceLockDigest
    || canonicalJsonText(manifest.content_bindings) !== canonicalJsonText(resources)
  ) {
    fail('Foundry candidate Agent Pack is not bound to its exact immutable resource lock.', {
      candidate_digest: version.candidate_digest,
    });
  }
  return {
    manifest_digest: canonicalDigest(manifest),
    resource_lock_digest: resourceLockDigest,
  };
}

export function validateCandidateDirectory(paths: FoundryStoragePaths, version: CandidateVersionIdentity) {
  if (version.candidate_ref !== `opl://foundry/candidate/${version.candidate_digest}`) {
    fail('Candidate ref does not match the version candidate digest.', { candidate_ref: version.candidate_ref });
  }
  const rootStat = fs.lstatSync(paths.candidates);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('Foundry candidate root is not a physical directory.');
  const candidateRoot = fs.realpathSync.native(paths.candidates);
  const directory = path.join(candidateRoot, digestSegment(version.candidate_digest));
  if (!fs.existsSync(directory)) fail('AgentVersion candidate bytes are missing.', { candidate_digest: version.candidate_digest });
  const directoryStat = fs.lstatSync(directory);
  const realDirectory = fs.realpathSync.native(directory);
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || !realDirectory.startsWith(`${candidateRoot}${path.sep}`)
  ) {
    fail('AgentVersion candidate directory escapes immutable storage.', { candidate_digest: version.candidate_digest });
  }
  const indexFile = path.join(realDirectory, 'candidate-index.json');
  if (!fs.existsSync(indexFile)) fail('AgentVersion candidate index is missing.', { candidate_digest: version.candidate_digest });
  const rawIndex = requireRecord(readCanonicalRegistryJson(indexFile, 'Foundry candidate index'), 'Foundry candidate index');
  requireExactKeys(rawIndex, [
    'surface_kind', 'version', 'blueprint_digest', 'candidate_digest', 'files',
  ], 'Foundry candidate index');
  if (rawIndex.surface_kind !== 'opl_foundry_candidate_file_index' || rawIndex.version !== CANDIDATE_INDEX_VERSION) {
    fail('Foundry candidate index surface is invalid.', { candidate_digest: version.candidate_digest });
  }
  if (rawIndex.blueprint_digest !== version.blueprint_digest || rawIndex.candidate_digest !== version.candidate_digest) {
    fail('Foundry candidate index identity does not match AgentVersion.', { candidate_digest: version.candidate_digest });
  }
  if (!Array.isArray(rawIndex.files) || rawIndex.files.length === 0) {
    fail('Foundry candidate index has no immutable files.', { candidate_digest: version.candidate_digest });
  }
  const files = rawIndex.files.map((value, index) => {
    const entry = requireRecord(value, `Foundry candidate file ${index}`);
    requireExactKeys(entry, ['path', 'sha256', 'byte_size'], `Foundry candidate file ${index}`);
    const relativePath = requireString(entry.path, 'candidate_file.path');
    if (
      path.posix.isAbsolute(relativePath)
      || path.posix.normalize(relativePath) !== relativePath
      || relativePath.includes('\\')
      || relativePath.includes('\0')
      || relativePath === 'candidate-index.json'
      || relativePath.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0)
    ) {
      fail('Foundry candidate index contains an unsafe file path.', { candidate_path: relativePath });
    }
    const fileDigest = requireString(entry.sha256, 'candidate_file.sha256');
    if (!/^[a-f0-9]{64}$/.test(fileDigest)) fail('Foundry candidate file digest is invalid.', { candidate_path: relativePath });
    if (!Number.isSafeInteger(entry.byte_size) || (entry.byte_size as number) <= 0) {
      fail('Foundry candidate file size is invalid.', { candidate_path: relativePath });
    }
    return { path: relativePath, sha256: fileDigest, byte_size: entry.byte_size as number };
  });
  requireUnique(files.map((entry) => entry.path), 'Foundry candidate index files');
  const expectedCandidateDigest = canonicalDigest({
    surface_kind: rawIndex.surface_kind,
    version: rawIndex.version,
    blueprint_digest: rawIndex.blueprint_digest,
    files,
  });
  if (expectedCandidateDigest !== version.candidate_digest) {
    fail('Foundry candidate index does not match its content address.', {
      candidate_digest: version.candidate_digest,
      expected_candidate_digest: expectedCandidateDigest,
    });
  }
  const expectedFiles = [...files.map((entry) => entry.path), 'candidate-index.json'].sort();
  const actualFiles = listPhysicalFiles(realDirectory).sort();
  if (canonicalJsonText(actualFiles) !== canonicalJsonText(expectedFiles)) {
    fail('AgentVersion candidate contains missing or unexpected bytes.', {
      candidate_digest: version.candidate_digest,
      expected_files: expectedFiles,
      actual_files: actualFiles,
    });
  }
  for (const entry of files) {
    const file = path.join(realDirectory, entry.path);
    const stat = fs.lstatSync(file);
    const real = fs.realpathSync.native(file);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || !real.startsWith(`${realDirectory}${path.sep}`)
      || stat.size !== entry.byte_size
      || sha256(fs.readFileSync(real)) !== entry.sha256
    ) {
      fail('AgentVersion candidate bytes do not match the immutable file index.', {
        candidate_digest: version.candidate_digest,
        candidate_path: entry.path,
      });
    }
  }
  return {
    directory: realDirectory,
    ...validateCandidateResourceLock(realDirectory, version, files),
  };
}

export function publishImmutableRegistryRecord(
  file: string,
  value: unknown,
  label: string,
  stagingRoot: string,
) {
  const bytes = canonicalJsonBytes(value);
  if (fs.existsSync(file)) {
    const existing = readCanonicalRegistryJson(file, label);
    if (canonicalJsonText(existing) !== canonicalJsonText(value)) {
      fail(`${label} already exists with different immutable content.`, { file });
    }
    return;
  }
  writeExclusive(file, bytes, stagingRoot);
}

export function versionRegistryEpochMarker(agentId: string, domainId: string): VersionRegistryEpochMarker {
  return {
    surface_kind: 'opl_foundry_version_registry_epoch',
    version: VERSION_REGISTRY_EPOCH_VERSION,
    target_agent_id: agentId,
    target_domain_id: domainId,
  };
}

export function validateVersionRegistryEpoch(directory: string, agentId: string, domainId: string) {
  const markerFile = path.join(directory, VERSION_REGISTRY_EPOCH_MARKER);
  if (!fs.existsSync(markerFile)) {
    fail('Foundry version registry epoch marker is missing.', {
      target_agent_id: agentId,
      target_domain_id: domainId,
      registry_directory: directory,
    });
  }
  const marker = requireRecord(
    readCanonicalRegistryJson(markerFile, 'Foundry version registry epoch marker'),
    'Foundry version registry epoch marker',
  );
  requireExactKeys(
    marker,
    ['surface_kind', 'version', 'target_agent_id', 'target_domain_id'],
    'Foundry version registry epoch marker',
  );
  const expected = versionRegistryEpochMarker(agentId, domainId);
  if (canonicalJsonText(marker) !== canonicalJsonText(expected)) {
    fail('Foundry version registry epoch marker does not match its target identity or format.', {
      target_agent_id: agentId,
      target_domain_id: domainId,
      registry_directory: directory,
    });
  }
  const allowedEntries = new Set([
    VERSION_REGISTRY_EPOCH_MARKER,
    'activation.json',
    'agent-versions',
    'qualifications',
    'activation-transactions',
  ]);
  const unexpectedEntries = fs.readdirSync(directory).filter((entry) => !allowedEntries.has(entry));
  if (unexpectedEntries.length > 0) {
    fail('Foundry version registry epoch contains forbidden entries.', {
      registry_directory: directory,
      unexpected_entries: unexpectedEntries.sort(),
    });
  }
  return expected;
}

export function ensureVersionRegistryEpoch(
  directory: string,
  agentId: string,
  domainId: string,
  stagingRoot: string,
) {
  const markerFile = path.join(directory, VERSION_REGISTRY_EPOCH_MARKER);
  if (fs.existsSync(markerFile)) {
    validateVersionRegistryEpoch(directory, agentId, domainId);
    return;
  }
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Foundry version registry epoch must be a physical directory.', { registry_directory: directory });
    }
    const entries = fs.readdirSync(directory);
    if (entries.length > 0) {
      fail('Unmarked Foundry version registry epoch cannot become current truth.', {
        registry_directory: directory,
        archived_entry_count: entries.length,
      });
    }
  }
  writeExclusive(
    markerFile,
    canonicalJsonBytes(versionRegistryEpochMarker(agentId, domainId)),
    stagingRoot,
  );
  validateVersionRegistryEpoch(directory, agentId, domainId);
}

export function repairActivationProjection(directory: string, activation: ActivationPointer, stagingRoot: string) {
  const file = path.join(directory, 'activation.json');
  const bytes = canonicalJsonBytes(activation);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return;
  writeAtomic(file, bytes, stagingRoot);
}
