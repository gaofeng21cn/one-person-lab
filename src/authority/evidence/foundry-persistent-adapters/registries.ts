import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { compileStandardAgentStageManifest } from '../../packages/public/standard-agent-action-runtime.ts';
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

import {
  ensureVersionRegistryEpoch,
  publishImmutableRegistryRecord,
  readCanonicalRegistryJson,
  readRegistryDirectory,
  repairActivationProjection,
  validateActivationPointer,
  validateActivationRuntimeBindingVerification,
  validateActivationTransaction,
  validateAgentVersion,
  validateCandidateDirectory,
  validateQualificationRecord,
  validateVersionRegistryEpoch,
  versionRegistryEpochMarker,
  type CandidateVersionIdentity,
  type RegistryState,
  type VersionRegistryEpochMarker,
} from './registry-validation.ts';

export class LedgerFoundryOperationResultJournal implements FoundryOperationResultJournal {
  readonly #paths: FoundryStoragePaths;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
  }

  #file(identity: FoundryEvaluationOperationIdentity) {
    return path.join(this.#paths.operation_results, `${sha256(identity.operation_key)}.json`);
  }

  #read(identity: FoundryEvaluationOperationIdentity) {
    const operation = validateFoundryEvaluationOperationIdentity(identity);
    const file = this.#file(operation);
    if (!fs.existsSync(file)) return null;
    return validateFoundryOperationResult(
      readCanonicalRegistryJson(file, 'Foundry operation result'),
      operation,
    );
  }

  async read(identity: FoundryEvaluationOperationIdentity) {
    return clone(this.#read(identity));
  }

  async commit(input: Parameters<FoundryOperationResultJournal['commit']>[0]) {
    const identity = validateFoundryEvaluationOperationIdentity(input.identity);
    const result = materializeFoundryOperationResult(input);
    const lock = path.join(this.#paths.mutation_locks, `operation-${sha256(result.operation_key)}.lock`);
    return withMutationLock(lock, this.#paths.staging, () => {
      const existing = this.#read(identity);
      if (existing) {
        if (canonicalJsonText(existing) !== canonicalJsonText(result)) {
          fail('Foundry operation key is already committed with a different result.', {
            operation_key: result.operation_key,
          });
        }
        return clone(existing);
      }
      const file = this.#file(identity);
      try {
        writeExclusive(file, canonicalJsonBytes(result), this.#paths.staging);
      } catch (error) {
        const recovered = this.#read(identity);
        if (recovered && canonicalJsonText(recovered) === canonicalJsonText(result)) {
          return clone(recovered);
        }
        throw error;
      }
      return clone(this.#read(identity)
        ?? fail('Foundry operation result did not become visible.', { operation_key: result.operation_key }));
    });
  }
}

export class LedgerVersionRegistry implements VersionRegistry {
  readonly #paths: FoundryStoragePaths;
  readonly #readOnly: boolean;

  constructor(rootOverride?: string, options: FoundryPersistentAdapterOptions = {}) {
    this.#paths = foundryStoragePaths(rootOverride);
    this.#readOnly = options.readOnly === true;
    if (!this.#readOnly) ensureStorage(this.#paths);
  }

  #directory(agentId: string, domainId: string) {
    return path.join(
      this.#paths.registry,
      targetStorageKey(agentId, domainId),
      VERSION_REGISTRY_EPOCH_DIRECTORY,
    );
  }

  #mutationLock(agentId: string, domainId: string) {
    return path.join(this.#paths.mutation_locks, `registry-${targetStorageKey(agentId, domainId)}.lock`);
  }

  #empty(agentId: string, domainId: string): RegistryState {
    return {
      versions: [],
      qualifications: [],
      transactions: [],
      activation: {
        surface_kind: 'opl_foundry_activation_pointer',
        target_agent_id: agentId,
        target_domain_id: domainId,
        active_version_digest: null,
        revision: 0,
        updated_at: null,
      },
    };
  }

  #read(agentId: string, domainId: string): RegistryState {
    requireString(agentId, 'target_agent_id');
    requireString(domainId, 'target_domain_id');
    const directory = this.#directory(agentId, domainId);
    const activationFile = path.join(directory, 'activation.json');
    if (!fs.existsSync(directory)) return this.#empty(agentId, domainId);
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('Foundry version registry must be a physical directory.');
    validateVersionRegistryEpoch(directory, agentId, domainId);
    const versionsDirectory = path.join(directory, 'agent-versions');
    const qualificationsDirectory = path.join(directory, 'qualifications');
    const transactionsDirectory = path.join(directory, 'activation-transactions');
    const qualifications = readRegistryDirectory(
      qualificationsDirectory,
      'QualificationRecord directory',
      (value, name) => validateQualificationRecord(value, agentId, domainId, name),
      this.#readOnly,
    );
    const versions = readRegistryDirectory(
      versionsDirectory,
      'AgentVersion directory',
      (value, name) => validateAgentVersion(value, agentId, domainId, name),
      this.#readOnly,
    );
    requireUnique(qualifications.map((entry) => entry.qualification_digest), 'QualificationRecord digests');
    requireUnique(qualifications.map((entry) => entry.qualification_id), 'QualificationRecord identities');
    requireUnique(qualifications.map((entry) => entry.candidate_digest), 'QualificationRecord candidate identities');
    requireUnique(versions.map((entry) => entry.version_digest), 'AgentVersion digests');
    requireUnique(versions.map((entry) => entry.version_id), 'AgentVersion identities');
    requireUnique(versions.map((entry) => entry.candidate_digest), 'AgentVersion candidate identities');
    const qualificationsByDigest = new Map(qualifications.map((entry) => [entry.qualification_digest, entry]));
    const versionsByDigest = new Map(versions.map((entry) => [entry.version_digest, entry]));
    for (const version of versions) {
      const qualification = qualificationsByDigest.get(version.qualification_digest)
        ?? fail('AgentVersion qualification record is missing.', { version_digest: version.version_digest });
      if (
        qualification.blueprint_digest !== version.blueprint_digest
        || qualification.candidate_digest !== version.candidate_digest
        || qualification.qualified_at !== version.created_at
      ) {
        fail('AgentVersion and QualificationRecord cross-reference is inconsistent.', {
          version_digest: version.version_digest,
          qualification_digest: qualification.qualification_digest,
        });
      }
      validateCandidateDirectory(this.#paths, version);
    }
    const transactions = readRegistryDirectory(
      transactionsDirectory,
      'ActivationTransaction directory',
      (value, name) => validateActivationTransaction(value, agentId, domainId, name),
      this.#readOnly,
    );
    requireUnique(transactions.map((entry) => entry.transaction_id), 'ActivationTransaction identities');
    let activation = this.#empty(agentId, domainId).activation;
    const activationTimeline = new Map<number, ActivationPointer>([[0, activation]]);
    for (const transaction of transactions) {
      if (transaction.previous_revision !== activation.revision) {
        fail('Activation transaction history is not contiguous.', {
          target_agent_id: agentId,
          target_domain_id: domainId,
          activation_revision: activation.revision,
          transaction_id: transaction.transaction_id,
        });
      }
      if (transaction.from_version_digest !== activation.active_version_digest) {
        fail('Activation transaction source version does not match history.', { transaction_id: transaction.transaction_id });
      }
      const targetVersion = versionsByDigest.get(transaction.to_version_digest);
      if (!targetVersion) {
        fail('Activation transaction target version does not exist.', {
          transaction_id: transaction.transaction_id,
          version_digest: transaction.to_version_digest,
        });
      }
      validateActivationRuntimeBindingVerification(transaction.runtime_binding_verification, {
        transaction_kind: transaction.transaction_kind,
        target_agent_id: transaction.target_agent_id,
        target_domain_id: transaction.target_domain_id,
        version_digest: transaction.to_version_digest,
        expected_revision: transaction.previous_revision,
        version: targetVersion,
      });
      activation = {
        surface_kind: 'opl_foundry_activation_pointer',
        target_agent_id: agentId,
        target_domain_id: domainId,
        active_version_digest: transaction.to_version_digest,
        revision: transaction.next_revision,
        updated_at: transaction.occurred_at,
      };
      activationTimeline.set(activation.revision, activation);
    }
    if (fs.existsSync(activationFile)) {
      const stored = validateActivationPointer(
        readCanonicalRegistryJson(activationFile, 'ActivationPointer'),
        agentId,
        domainId,
      );
      const expected = activationTimeline.get(stored.revision);
      if (!expected || canonicalJsonText(expected) !== canonicalJsonText(stored)) {
        fail('ActivationPointer does not match immutable transaction history.', {
          stored_revision: stored.revision,
          history_revision: activation.revision,
        });
      }
    }
    if (activation.active_version_digest !== null && !versionsByDigest.has(activation.active_version_digest)) {
      fail('ActivationPointer target version does not exist.', { version_digest: activation.active_version_digest });
    }
    return {
      versions,
      qualifications,
      transactions,
      activation,
    };
  }

  async register(input: Parameters<VersionRegistry['register']>[0]) {
    requireWritable(this.#readOnly, 'version_registry_register');
    const directory = this.#directory(input.target_agent_id, input.target_domain_id);
    const lock = this.#mutationLock(input.target_agent_id, input.target_domain_id);
    return withMutationLock(lock, this.#paths.staging, () => {
      requireString(input.target_agent_id, 'target_agent_id');
      requireString(input.target_domain_id, 'target_domain_id');
      requireDigest(input.blueprint_digest, 'blueprint_digest');
      requireDigest(input.evidence_digest, 'evidence_digest');
      requireString(input.qualified_at, 'qualified_at');
      if (!['low', 'medium', 'high'].includes(input.risk_tier)) fail('Version registration risk tier is invalid.');
      if (input.candidate.surface_kind !== 'opl_foundry_materialized_candidate') {
        fail('Version registration candidate surface is invalid.');
      }
      if (
        input.candidate.target_agent_id !== input.target_agent_id
        || input.candidate.target_domain_id !== input.target_domain_id
      ) {
        fail('Version registration candidate target identity is inconsistent.');
      }
      if (input.candidate.blueprint_digest !== input.blueprint_digest) {
        fail('Version registration candidate blueprint digest is inconsistent.');
      }
      requireDigest(input.candidate.candidate_digest, 'candidate_digest');
      requireDigest(input.candidate.manifest_digest, 'manifest_digest');
      if (input.candidate.candidate_ref !== `opl://foundry/candidate/${input.candidate.candidate_digest}`) {
        fail('Version registration candidate ref does not match its digest.');
      }
      const candidateIntegrity = validateCandidateDirectory(this.#paths, input.candidate);
      if (candidateIntegrity.manifest_digest !== input.candidate.manifest_digest) {
        fail('Version registration candidate manifest digest is inconsistent.', {
          candidate_digest: input.candidate.candidate_digest,
          expected_manifest_digest: candidateIntegrity.manifest_digest,
        });
      }
      ensureVersionRegistryEpoch(
        directory,
        input.target_agent_id,
        input.target_domain_id,
        this.#paths.staging,
      );
      const state = this.#read(input.target_agent_id, input.target_domain_id);
      const qualificationBase = {
        surface_kind: 'opl_foundry_qualification_record' as const,
        qualification_id: `qualification:${input.target_agent_id}:${input.candidate.candidate_digest}`,
        target_agent_id: input.target_agent_id,
        target_domain_id: input.target_domain_id,
        blueprint_digest: input.blueprint_digest,
        candidate_digest: input.candidate.candidate_digest,
        evidence_digest: input.evidence_digest,
        risk_tier: input.risk_tier,
        qualified_at: input.qualified_at,
      };
      const qualification: QualificationRecord = {
        ...qualificationBase,
        qualification_digest: canonicalDigest(qualificationBase),
      };
      const versionBase = {
        surface_kind: 'opl_foundry_agent_version' as const,
        version_id: `version:${input.target_agent_id}:${input.candidate.candidate_digest}`,
        target_agent_id: input.target_agent_id,
        target_domain_id: input.target_domain_id,
        blueprint_digest: input.blueprint_digest,
        candidate_digest: input.candidate.candidate_digest,
        candidate_ref: input.candidate.candidate_ref,
        qualification_digest: qualification.qualification_digest,
        created_at: input.qualified_at,
      };
      const version: AgentVersion = { ...versionBase, version_digest: canonicalDigest(versionBase) };
      const existing = state.versions.find((entry) => entry.candidate_digest === input.candidate.candidate_digest);
      if (existing) {
        const existingQualification = state.qualifications.find(
          (entry) => entry.qualification_digest === existing.qualification_digest,
        ) ?? fail('Version qualification record is missing.', { version_digest: existing.version_digest });
        if (
          canonicalJsonText(existing) !== canonicalJsonText(version)
          || canonicalJsonText(existingQualification) !== canonicalJsonText(qualification)
        ) {
          fail('Candidate digest is already registered with different immutable metadata.', {
            candidate_digest: input.candidate.candidate_digest,
            version_digest: existing.version_digest,
          });
        }
        return { version: clone(existing), qualification: clone(existingQualification) };
      }
      const prepared = state.qualifications.find((entry) => entry.candidate_digest === input.candidate.candidate_digest);
      if (prepared && canonicalJsonText(prepared) !== canonicalJsonText(qualification)) {
        fail('Prepared qualification conflicts with version registration retry.', {
          candidate_digest: input.candidate.candidate_digest,
        });
      }
      publishImmutableRegistryRecord(
        path.join(directory, 'qualifications', `${digestSegment(qualification.qualification_digest)}.json`),
        qualification,
        'QualificationRecord',
        this.#paths.staging,
      );
      publishImmutableRegistryRecord(
        path.join(directory, 'agent-versions', `${digestSegment(version.version_digest)}.json`),
        version,
        'AgentVersion',
        this.#paths.staging,
      );
      const committed = this.#read(input.target_agent_id, input.target_domain_id);
      const committedVersion = committed.versions.find((entry) => entry.version_digest === version.version_digest)
        ?? fail('AgentVersion registration did not become visible.', { version_digest: version.version_digest });
      const committedQualification = committed.qualifications.find(
        (entry) => entry.qualification_digest === qualification.qualification_digest,
      ) ?? fail('QualificationRecord registration did not become visible.', {
        qualification_digest: qualification.qualification_digest,
      });
      validateCandidateDirectory(this.#paths, committedVersion);
      return { version: clone(committedVersion), qualification: clone(committedQualification) };
    });
  }

  async list(targetAgentId: string, targetDomainId: string) {
    return clone(this.#read(targetAgentId, targetDomainId).versions);
  }

  async resolveVersion(ref: string | null, targetAgentId: string, targetDomainId: string) {
    const state = this.#read(targetAgentId, targetDomainId);
    const resolved = ref ?? state.activation.active_version_digest;
    return clone(state.versions.find((entry) => entry.version_digest === resolved) ?? null);
  }

  async activation(targetAgentId: string, targetDomainId: string) {
    if (this.#readOnly) {
      return clone(this.#read(targetAgentId, targetDomainId).activation);
    }
    const directory = this.#directory(targetAgentId, targetDomainId);
    const lock = this.#mutationLock(targetAgentId, targetDomainId);
    return withMutationLock(lock, this.#paths.staging, () => {
      const activation = this.#read(targetAgentId, targetDomainId).activation;
      if (fs.existsSync(directory)) {
        repairActivationProjection(directory, activation, this.#paths.staging);
      }
      return clone(activation);
    });
  }

  async activationHistory(targetAgentId: string, targetDomainId: string) {
    return clone(this.#read(targetAgentId, targetDomainId).transactions);
  }

  async compareAndSwapActivation(input: Parameters<VersionRegistry['compareAndSwapActivation']>[0]) {
    return this.#switchActivation({ ...input, transaction_kind: 'activate' });
  }

  async rollback(input: Parameters<VersionRegistry['rollback']>[0]) {
    return this.#switchActivation({ ...input, transaction_kind: 'rollback' });
  }

  #switchActivation(input: Parameters<VersionRegistry['compareAndSwapActivation']>[0] & {
    transaction_kind: ActivationTransaction['transaction_kind'];
  }) {
    requireWritable(this.#readOnly, `version_registry_${input.transaction_kind}`);
    const directory = this.#directory(input.target_agent_id, input.target_domain_id);
    const lock = this.#mutationLock(input.target_agent_id, input.target_domain_id);
    return withMutationLock(lock, this.#paths.staging, () => {
      requireString(input.target_agent_id, 'target_agent_id');
      requireString(input.target_domain_id, 'target_domain_id');
      requireDigest(input.version_digest, 'version_digest');
      requireString(input.occurred_at, 'occurred_at');
      if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0) {
        fail('Activation expected revision is invalid.');
      }
      if (input.authority_receipt_ref !== null) requireString(input.authority_receipt_ref, 'authority_receipt_ref');
      if (input.transaction_kind === 'rollback' && input.authority_receipt_ref === null) {
        fail('Rollback requires an authority receipt.');
      }
      const state = this.#read(input.target_agent_id, input.target_domain_id);
      const targetVersion = state.versions.find((entry) => entry.version_digest === input.version_digest)
        ?? fail('Activation target version does not exist.', { version_digest: input.version_digest });
      const runtimeBindingVerification = validateActivationRuntimeBindingVerification(
        input.runtime_binding_verification,
        {
          transaction_kind: input.transaction_kind,
          target_agent_id: input.target_agent_id,
          target_domain_id: input.target_domain_id,
          version_digest: input.version_digest,
          expected_revision: input.expected_revision,
          version: targetVersion,
        },
      );
      const replay = state.transactions.find((entry) => entry.previous_revision === input.expected_revision);
      if (replay) {
        if (
          replay.transaction_kind !== input.transaction_kind
          || replay.to_version_digest !== input.version_digest
          || replay.authority_receipt_ref !== input.authority_receipt_ref
          || canonicalJsonText(replay.runtime_binding_verification)
            !== canonicalJsonText(runtimeBindingVerification)
        ) {
          fail('Activation transaction replay conflicts with immutable history.', {
            expected_revision: input.expected_revision,
            transaction_id: replay.transaction_id,
          });
        }
        const replayVersion = state.versions.find((entry) => entry.version_digest === replay.to_version_digest)
          ?? fail('Activation replay target version does not exist.', { version_digest: replay.to_version_digest });
        validateCandidateDirectory(this.#paths, replayVersion);
        repairActivationProjection(directory, state.activation, this.#paths.staging);
        return clone(replay);
      }
      if (state.activation.revision !== input.expected_revision) {
        fail('Activation pointer revision compare-and-swap failed.', {
          expected_revision: input.expected_revision,
          actual_revision: state.activation.revision,
        });
      }
      validateCandidateDirectory(this.#paths, targetVersion);
      if (input.transaction_kind === 'rollback') {
        if (state.activation.active_version_digest === input.version_digest) {
          fail('Rollback target version is already active.', { version_digest: input.version_digest });
        }
        if (!state.transactions.some((entry) => entry.to_version_digest === input.version_digest)) {
          fail('Rollback target version has never been active.', { version_digest: input.version_digest });
        }
      }
      const transactionBase = {
        surface_kind: 'opl_foundry_activation_transaction' as const,
        transaction_kind: input.transaction_kind,
        target_agent_id: input.target_agent_id,
        target_domain_id: input.target_domain_id,
        from_version_digest: state.activation.active_version_digest,
        to_version_digest: input.version_digest,
        previous_revision: state.activation.revision,
        next_revision: state.activation.revision + 1,
        authority_receipt_ref: input.authority_receipt_ref,
        occurred_at: input.occurred_at,
        runtime_binding_verification: clone(runtimeBindingVerification),
      };
      const transaction: ActivationTransaction = {
        ...transactionBase,
        transaction_id: `activation:${canonicalDigest(transactionBase)}`,
      };
      const activation: ActivationPointer = {
        ...state.activation,
        active_version_digest: input.version_digest,
        revision: transaction.next_revision,
        updated_at: input.occurred_at,
      };
      writeExclusive(
        path.join(directory, 'activation-transactions', `${String(transaction.next_revision).padStart(10, '0')}.json`),
        canonicalJsonBytes(transaction),
        this.#paths.staging,
      );
      repairActivationProjection(directory, activation, this.#paths.staging);
      const committed = this.#read(input.target_agent_id, input.target_domain_id);
      if (
        committed.activation.revision !== transaction.next_revision
        || committed.activation.active_version_digest !== transaction.to_version_digest
      ) {
        fail('Activation transaction did not become visible.', { transaction_id: transaction.transaction_id });
      }
      return clone(transaction);
    });
  }
}
