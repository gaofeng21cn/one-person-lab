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
  type CandidateResourceBinding,
  type CandidateResourceKind,
  type CandidateResourceLock,
  type FoundryPersistentAdapterOptions,
  type FoundryStoragePaths,
  type MutationLockRecord,
} from './shared.ts';

export class FileFoundryObjectStore implements FoundryObjectStore {
  readonly #paths: FoundryStoragePaths;
  readonly #readOnly: boolean;

  constructor(rootOverride?: string, options: FoundryPersistentAdapterOptions = {}) {
    this.#paths = foundryStoragePaths(rootOverride);
    this.#readOnly = options.readOnly === true;
    if (!this.#readOnly) ensureStorage(this.#paths);
  }

  async put<T>(value: T) {
    requireWritable(this.#readOnly, 'object_store_put');
    const digest = foundryContentDigest(value);
    const file = path.join(this.#paths.objects, `${digestSegment(digest)}.json`);
    const bytes = canonicalJsonBytes(value);
    if (!fs.existsSync(file)) {
      try {
        writeExclusive(file, bytes, this.#paths.staging);
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
      }
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail('Content-addressed Foundry object address is not a physical file.', { digest });
    }
    const existing = fs.readFileSync(file);
    if (!existing.equals(bytes)) fail('Content-addressed Foundry object collision.', { digest });
    return { digest, ref: `opl://foundry/object/${digest}` };
  }

  async get<T>(digest: string) {
    const file = path.join(this.#paths.objects, `${digestSegment(digest)}.json`);
    if (!fs.existsSync(file)) return null;
    const value = readPhysicalCanonicalJson<T>(file, 'Content-addressed Foundry object');
    if (foundryContentDigest(value) !== digest) fail('Stored Foundry object digest does not match its address.', { digest });
    return clone(value);
  }
}

export class FileFoundryContentStore {
  readonly #root: string;
  readonly #stagingRoot: string;
  readonly #maxBytes: number;

  constructor(rootOverride?: string, maxBytes = 16 * 1024 * 1024) {
    const paths = foundryStoragePaths(rootOverride);
    ensureStorage(paths);
    const stat = fs.lstatSync(paths.content);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Foundry content store root must be a physical directory.');
    }
    this.#root = fs.realpathSync.native(paths.content);
    this.#stagingRoot = paths.staging;
    this.#maxBytes = maxBytes;
  }

  put(bytes: Buffer, expectedRef?: string) {
    if (bytes.byteLength <= 0 || bytes.byteLength > this.#maxBytes) {
      fail('Foundry content bytes are empty or exceed the content limit.', { byte_size: bytes.byteLength });
    }
    const digest = sha256(bytes);
    if (expectedRef && contentDigestFromRef(expectedRef) !== digest) {
      fail('Foundry content bytes do not match their content ref.', { content_ref: expectedRef });
    }
    const file = path.join(this.#root, `${digest}.blob`);
    if (!fs.existsSync(file)) {
      try {
        writeExclusive(file, bytes, this.#stagingRoot);
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
      }
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(file).equals(bytes)) {
      fail('Foundry content address is occupied by invalid bytes.', { digest: `sha256:${digest}` });
    }
    return {
      ref: `opl-content://sha256/${digest}`,
      digest: `sha256:${digest}`,
      byte_size: bytes.byteLength,
    };
  }

  readExact(ref: string) {
    const digest = contentDigestFromRef(ref);
    if (!digest) fail('Foundry content hydration requires an opl-content ref.', { content_ref: ref });
    const file = path.join(this.#root, `${digest}.blob`);
    if (!fs.existsSync(file)) fail('Foundry content ref is not available in the content store.', { content_ref: ref });
    const stat = fs.lstatSync(file);
    const real = fs.realpathSync.native(file);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || !real.startsWith(`${this.#root}${path.sep}`)
      || stat.size <= 0
      || stat.size > this.#maxBytes
    ) {
      fail('Foundry content ref resolves outside the immutable content store.', { content_ref: ref });
    }
    const bytes = fs.readFileSync(real);
    if (sha256(bytes) !== digest) fail('Foundry content store bytes fail digest verification.', { content_ref: ref });
    return bytes;
  }

  has(ref: string) {
    const digest = contentDigestFromRef(ref);
    if (!digest) return false;
    try {
      this.readExact(ref);
      return true;
    } catch {
      return false;
    }
  }
}
