import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import receiptSchema from
  '../../../contracts/opl-framework/domain-artifact-cas-materialization-receipt.schema.json' with { type: 'json' };
import requestSchema from
  '../../../contracts/opl-framework/domain-artifact-cas-materialization-request.schema.json' with { type: 'json' };
import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

export const DOMAIN_ARTIFACT_CAS_CAPABILITY_ID = 'opl_domain_artifact_cas_materialization.v1' as const;

const REQUEST_SCHEMA_REF =
  'contracts/opl-framework/domain-artifact-cas-materialization-request.schema.json';
const RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/domain-artifact-cas-materialization-receipt.schema.json';
const DIGEST = /^(?:sha256:)?([a-f0-9]{64})$/u;
const NON_MATERIALIZING_AUTHORITY_STATUSES = new Set(['typed_blocker', 'invalid_host_input']);

type HostMaterializationContract = {
  capability_id: typeof DOMAIN_ARTIFACT_CAS_CAPABILITY_ID;
  request_output_field: string;
  authorization_output_field: string;
};

type ExistingExactPrecondition = {
  kind: 'existing_exact';
  sha256: string;
  byte_size: number;
};

type AbsentPrecondition = { kind: 'absent' };
type CasPrecondition = ExistingExactPrecondition | AbsentPrecondition;

type CasOperation = {
  target_relative_path: string;
  precondition: CasPrecondition;
  replacement_bytes_base64: string;
  replacement_sha256: string;
  replacement_byte_size: number;
};

type CasRequest = {
  surface_kind: 'opl_domain_artifact_cas_materialization_request';
  version: 'opl-domain-artifact-cas-materialization.v1';
  capability_id: typeof DOMAIN_ARTIFACT_CAS_CAPABILITY_ID;
  request_id: string;
  domain_id: string;
  authorization_ref: string;
  operations_sha256: string;
  operations: CasOperation[];
};

type PreparedOperation = {
  relative: string;
  target: string;
  staging: string;
  backup: string;
  before: { kind: 'existing_exact'; sha256: string; byteSize: number } | { kind: 'absent' };
  after: Buffer;
  afterSha256: string;
};

type TransactionPaths = ReturnType<typeof transactionPaths>;

export type DomainArtifactCasMaterialization = {
  receipt_path: string;
  receipt_ref: string;
  receipt_sha256: string;
  receipt: Record<string, unknown>;
};

export type DomainArtifactCasMaterializationHooks = {
  rename?: typeof fs.renameSync;
  beforePersistReceipt?: () => void;
};

export type DomainArtifactCasMaterializationReadObservation = {
  state: 'clear' | 'sync_pending' | 'indeterminate';
  reason:
    | 'no_workspace_cas_journal'
    | 'workspace_cas_journal_present'
    | 'workspace_cas_epoch_in_progress'
    | 'workspace_cas_read_generation_changed'
    | 'workspace_cas_journal_observation_failed';
  workspace_root: string;
  journal_refs: string[];
  epoch_ref: string;
  observed_generation: string;
  observed_at: string;
  error: string | null;
};

type DomainArtifactCasReadEpoch = {
  phase: 'absent' | 'in_progress' | 'settled' | 'invalid';
  generation: string;
  ref: string;
  error: string | null;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'domain_artifact_cas_materialization_invalid',
    ...details,
  });
}

function sha256(bytes: string | Buffer | Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function digest(value: unknown, field: string) {
  if (typeof value !== 'string') fail(`${field} must be a SHA-256 digest.`, { field });
  const match = DIGEST.exec(value);
  if (!match) fail(`${field} must be a SHA-256 digest.`, { field, value });
  return match[1]!;
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

function stringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${field} must be an array of non-empty strings.`, { field });
  }
  const normalized = value.map((entry) => String(entry).trim());
  if (new Set(normalized).size !== normalized.length) fail(`${field} must not contain duplicates.`, { field });
  return normalized;
}

function hostContract(value: unknown): HostMaterializationContract | null {
  if (value === undefined) return null;
  if (!isRecord(value)) fail('host_materialization_contract must be an object.');
  const allowed = ['capability_id', 'request_output_field', 'authorization_output_field'];
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    fail('host_materialization_contract contains unsupported fields.', { unsupported_fields: unsupported });
  }
  if (value.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID) {
    fail('host_materialization_contract capability_id is unsupported.', { capability_id: value.capability_id });
  }
  return {
    capability_id: DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
    request_output_field: text(value.request_output_field, 'request_output_field'),
    authorization_output_field: text(value.authorization_output_field, 'authorization_output_field'),
  };
}

function safeRelativePath(value: string, field: string) {
  if (
    path.isAbsolute(value)
    || value.split(/[\\/]+/u).some((segment) => segment === '..' || segment === '.' || !segment)
  ) {
    fail(`${field} must be a contained relative path.`, { field, value });
  }
  return value.split(/[\\/]+/u).join('/');
}

function lstatOrNull(file: string) {
  try {
    return fs.lstatSync(file, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function containedTarget(root: string, relative: string) {
  const normalized = safeRelativePath(relative, 'operations[].target_relative_path');
  const target = path.resolve(root, normalized);
  const relation = path.relative(root, target);
  if (relation.startsWith(`..${path.sep}`) || relation === '..' || path.isAbsolute(relation)) {
    fail('CAS target escapes the selected workspace.', { target_relative_path: relative });
  }
  let cursor = root;
  for (const segment of path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = lstatOrNull(cursor);
    if (!stat) fail('CAS target parent is missing.', { path: cursor });
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('CAS target ancestors must be physical directories.', { path: cursor });
    }
  }
  return { target, normalized };
}

function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableFile(file: string, field: string) {
  const before = lstatOrNull(file);
  if (!before) fail(`${field} is missing.`, { file });
  if (before.isSymbolicLink() || !before.isFile()) fail(`${field} must be a physical file.`, { file });
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const openedBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(before, openedBefore)) fail(`${field} changed identity before reading.`, { file });
    const bytes = fs.readFileSync(descriptor);
    const openedAfter = fs.fstatSync(descriptor, { bigint: true });
    const after = fs.lstatSync(file, { bigint: true });
    if (
      after.isSymbolicLink()
      || !sameStableFile(openedBefore, openedAfter)
      || !sameStableFile(openedAfter, after)
      || BigInt(bytes.byteLength) !== after.size
    ) fail(`${field} changed while reading.`, { file });
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function exactFileMatches(file: string, expectedSha256: string, expectedSize: number) {
  const stat = lstatOrNull(file);
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size !== BigInt(expectedSize)) return false;
  return sha256(readStableFile(file, 'CAS transaction file')) === expectedSha256;
}

function replacementBytes(value: string, expectedSize: number) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    fail('replacement_bytes_base64 is not canonical base64.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength !== expectedSize || bytes.toString('base64') !== value) {
    fail('replacement_bytes_base64 does not match replacement_byte_size.');
  }
  return bytes;
}

function fsyncDirectory(directory: string) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

function durableExclusiveFile(file: string, bytes: Buffer) {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function atomicJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  durableExclusiveFile(temporary, Buffer.from(formatJsonPayload(value)));
  fs.renameSync(temporary, file);
  fsyncDirectory(path.dirname(file));
}

function processAlive(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) return false;
  try {
    process.kill(Number(value), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readJsonRecord(file: string, label = 'JSON file') {
  const bytes = readStableFile(file, label);
  let value: unknown;
  try {
    value = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    fail(`${label} is invalid JSON.`, { file, cause: error instanceof Error ? error.message : String(error) });
  }
  if (!isRecord(value)) fail(`${label} must contain an object.`, { file });
  return { value, bytes };
}

function operationIdentity(operation: PreparedOperation) {
  return {
    target_ref: pathToFileURL(operation.target).href,
    before_state: operation.before.kind === 'absent'
      ? { kind: 'absent' as const }
      : {
          kind: 'existing_exact' as const,
          sha256: operation.before.sha256,
          byte_size: operation.before.byteSize,
        },
    after_sha256: operation.afterSha256,
    after_byte_size: operation.after.byteLength,
  };
}

function beforeMatches(operation: PreparedOperation) {
  if (operation.before.kind === 'absent') return lstatOrNull(operation.target) === null;
  return exactFileMatches(operation.target, operation.before.sha256, operation.before.byteSize);
}

function afterMatches(operation: PreparedOperation) {
  return exactFileMatches(operation.target, operation.afterSha256, operation.after.byteLength);
}

function targetsMatch(operations: PreparedOperation[], side: 'before' | 'after') {
  return operations.every((operation) => side === 'before' ? beforeMatches(operation) : afterMatches(operation));
}

function transactionPaths(workspaceRoot: string, requestSha256: string) {
  const configuredStateRoot = resolveOplStatePaths().state_dir;
  fs.mkdirSync(configuredStateRoot, { recursive: true });
  const stateRoot = path.join(
    fs.realpathSync.native(configuredStateRoot),
    'runway',
    'domain-artifact-cas',
  );
  const workspaceKey = sha256(workspaceRoot);
  return {
    lock: path.join(stateRoot, 'locks', `${workspaceKey}.lock`),
    journal: path.join(stateRoot, 'transactions', `${workspaceKey}-${requestSha256}.json`),
    readEpoch: path.join(stateRoot, 'read-epochs', `${workspaceKey}.json`),
    receiptByRequest: path.join(stateRoot, 'receipts', 'by-request', `${requestSha256}.json`),
    receiptRoot: path.join(stateRoot, 'receipts', 'sha256'),
  };
}

function writeReadEpoch(input: {
  file: string;
  workspaceRoot: string;
  requestSha256: string;
  phase: 'in_progress' | 'settled';
  outcome: 'materialized' | 'rolled_back' | null;
}) {
  atomicJson(input.file, {
    surface_kind: 'opl_domain_artifact_cas_read_epoch',
    version: 'opl-domain-artifact-cas-read-epoch.v1',
    workspace_sha256: sha256(input.workspaceRoot),
    request_sha256: input.requestSha256,
    transition_id: crypto.randomUUID(),
    phase: input.phase,
    outcome: input.outcome,
    updated_at: new Date().toISOString(),
  });
}

function readReadEpoch(file: string, workspaceKey: string): DomainArtifactCasReadEpoch {
  const ref = pathToFileURL(file).href;
  if (!fs.existsSync(file)) {
    return { phase: 'absent', generation: 'absent', ref, error: null };
  }
  try {
    const bytes = readStableFile(file, 'Domain artifact CAS read epoch');
    const value = parseJsonText(bytes.toString('utf8'));
    if (
      !isRecord(value)
      || value.surface_kind !== 'opl_domain_artifact_cas_read_epoch'
      || value.version !== 'opl-domain-artifact-cas-read-epoch.v1'
      || value.workspace_sha256 !== workspaceKey
      || !['in_progress', 'settled'].includes(String(value.phase))
      || typeof value.transition_id !== 'string'
      || !value.transition_id
    ) {
      return {
        phase: 'invalid',
        generation: `sha256:${sha256(bytes)}`,
        ref,
        error: 'Domain artifact CAS read epoch is invalid.',
      };
    }
    return {
      phase: value.phase as 'in_progress' | 'settled',
      generation: `sha256:${sha256(bytes)}`,
      ref,
      error: null,
    };
  } catch (error) {
    return {
      phase: 'invalid',
      generation: 'unreadable',
      ref,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function observeDomainArtifactCasMaterialization(
  input: { workspaceRoot: string },
): DomainArtifactCasMaterializationReadObservation {
  const observedAt = new Date().toISOString();
  let workspaceRoot: string;
  try {
    workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  } catch (error) {
    return {
      state: 'indeterminate',
      reason: 'workspace_cas_journal_observation_failed',
      workspace_root: path.resolve(input.workspaceRoot),
      journal_refs: [],
      epoch_ref: '',
      observed_generation: 'unreadable',
      observed_at: observedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const transactionsRoot = path.join(
    resolveOplStatePaths().state_dir,
    'runway',
    'domain-artifact-cas',
    'transactions',
  );
  const workspaceKey = sha256(workspaceRoot);
  const prefix = `${workspaceKey}-`;
  const epochPath = path.join(
    resolveOplStatePaths().state_dir,
    'runway',
    'domain-artifact-cas',
    'read-epochs',
    `${workspaceKey}.json`,
  );
  const beforeEpoch = readReadEpoch(epochPath, workspaceKey);
  let journalRefs: string[];
  try {
    journalRefs = fs.readdirSync(transactionsRoot, { withFileTypes: true })
      .filter((entry) => entry.name.startsWith(prefix) && entry.name.endsWith('.json'))
      .map((entry) => pathToFileURL(path.join(transactionsRoot, entry.name)).href)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      journalRefs = [];
    } else {
      return {
        state: 'indeterminate',
        reason: 'workspace_cas_journal_observation_failed',
        workspace_root: workspaceRoot,
        journal_refs: [],
        epoch_ref: beforeEpoch.ref,
        observed_generation: beforeEpoch.generation,
        observed_at: observedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const afterEpoch = readReadEpoch(epochPath, workspaceKey);
  if (beforeEpoch.phase === 'invalid' || afterEpoch.phase === 'invalid') {
    return {
      state: 'indeterminate',
      reason: 'workspace_cas_journal_observation_failed',
      workspace_root: workspaceRoot,
      journal_refs: journalRefs,
      epoch_ref: afterEpoch.ref,
      observed_generation: afterEpoch.generation,
      observed_at: observedAt,
      error: afterEpoch.error ?? beforeEpoch.error,
    };
  }
  if (beforeEpoch.generation !== afterEpoch.generation) {
    return {
      state: 'sync_pending',
      reason: 'workspace_cas_read_generation_changed',
      workspace_root: workspaceRoot,
      journal_refs: journalRefs,
      epoch_ref: afterEpoch.ref,
      observed_generation: `${beforeEpoch.generation}->${afterEpoch.generation}`,
      observed_at: observedAt,
      error: null,
    };
  }
  if (afterEpoch.phase === 'in_progress') {
    return {
      state: 'sync_pending',
      reason: 'workspace_cas_epoch_in_progress',
      workspace_root: workspaceRoot,
      journal_refs: journalRefs,
      epoch_ref: afterEpoch.ref,
      observed_generation: afterEpoch.generation,
      observed_at: observedAt,
      error: null,
    };
  }
  return {
    state: journalRefs.length > 0 ? 'sync_pending' : 'clear',
    reason: journalRefs.length > 0
      ? 'workspace_cas_journal_present'
      : 'no_workspace_cas_journal',
    workspace_root: workspaceRoot,
    journal_refs: journalRefs,
    epoch_ref: afterEpoch.ref,
    observed_generation: afterEpoch.generation,
    observed_at: observedAt,
    error: null,
  };
}

export function domainArtifactCasMaterializationInProgress(input: {
  workspaceRoot: string;
  requestSha256: string;
}) {
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  return fs.existsSync(transactionPaths(workspaceRoot, digest(input.requestSha256, 'request_sha256')).journal);
}

function acquireLock(lockPath: string, requestSha256: string) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (;;) {
    try {
      durableExclusiveFile(lockPath, Buffer.from(formatJsonPayload({
        pid: process.pid,
        request_sha256: requestSha256,
        acquired_at: new Date().toISOString(),
        scope: 'workspace_scoped_cooperative_opl_cas_lock',
      })));
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const current = readJsonRecord(lockPath, 'CAS cooperative lock').value;
    if (processAlive(current.pid)) fail('Another domain artifact CAS transaction is active.', { lock_path: lockPath });
    if (current.request_sha256 !== requestSha256) {
      fail('A stale CAS transaction for another request must be recovered by replaying that exact request.', {
        lock_path: lockPath,
        stale_request_sha256: current.request_sha256 ?? null,
        request_sha256: requestSha256,
      });
    }
    const stale = `${lockPath}.stale-${process.pid}-${crypto.randomUUID()}`;
    try {
      fs.renameSync(lockPath, stale);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    fs.rmSync(stale, { force: true });
  }
}

function validatePreparedPaths(workspaceRoot: string, operations: PreparedOperation[]) {
  for (const operation of operations) {
    const resolved = containedTarget(workspaceRoot, operation.relative);
    if (resolved.target !== operation.target) fail('CAS target resolution changed while waiting for the lock.');
    for (const auxiliary of [operation.staging, operation.backup]) {
      const stat = lstatOrNull(auxiliary);
      if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
        fail('CAS transaction auxiliary paths must be physical files.', { path: auxiliary });
      }
    }
  }
}

function journalOperations(operations: PreparedOperation[]) {
  return operations.map((operation) => ({
    target: operation.target,
    staging: operation.staging,
    backup: operation.backup,
    before_state: operationIdentity(operation).before_state,
    after_sha256: operation.afterSha256,
    after_byte_size: operation.after.byteLength,
  }));
}

function assertJournal(paths: TransactionPaths, requestSha256: string, operations: PreparedOperation[]) {
  const journal = readJsonRecord(paths.journal, 'CAS recovery journal').value;
  if (
    journal.surface_kind !== 'opl_domain_artifact_cas_transaction_journal'
    || journal.version !== 'opl-domain-artifact-cas-transaction-journal.v1'
    || journal.request_sha256 !== requestSha256
    || JSON.stringify(journal.operations) !== JSON.stringify(journalOperations(operations))
  ) fail('CAS recovery journal does not match the exact authorized transaction.', { journal_path: paths.journal });
}

function ensureStaging(operation: PreparedOperation) {
  if (exactFileMatches(operation.staging, operation.afterSha256, operation.after.byteLength)) return;
  if (lstatOrNull(operation.staging)) fail('CAS staging file conflicts with the authorized replacement.', {
    path: operation.staging,
  });
  durableExclusiveFile(operation.staging, operation.after);
}

function rollbackTransaction(operations: PreparedOperation[], journalPath: string) {
  for (const operation of [...operations].reverse()) {
    if (operation.before.kind === 'absent') {
      if (afterMatches(operation)) fs.rmSync(operation.target);
      else if (lstatOrNull(operation.target)) {
        fail('CAS rollback found an unauthorized created-target state.', { target: operation.target });
      }
    } else if (exactFileMatches(operation.backup, operation.before.sha256, operation.before.byteSize)) {
      fs.rmSync(operation.target, { force: true });
      fs.renameSync(operation.backup, operation.target);
    } else if (!beforeMatches(operation)) {
      fail('CAS rollback cannot restore an exact existing-target before state.', { target: operation.target });
    }
    fs.rmSync(operation.staging, { force: true });
    fs.rmSync(operation.backup, { force: true });
    fsyncDirectory(path.dirname(operation.target));
  }
  fs.rmSync(journalPath, { force: true });
  if (!targetsMatch(operations, 'before')) fail('CAS rollback did not restore every exact before state.');
}

function switchTransaction(input: {
  workspaceRoot: string;
  requestSha256: string;
  paths: TransactionPaths;
  operations: PreparedOperation[];
  rename: typeof fs.renameSync;
}) {
  const recovering = fs.existsSync(input.paths.journal);
  if (recovering) {
    assertJournal(input.paths, input.requestSha256, input.operations);
  } else {
    if (!targetsMatch(input.operations, 'before')) {
      fail('CAS targets do not match the authorized transaction preconditions.');
    }
    for (const operation of input.operations) {
      fs.rmSync(operation.staging, { force: true });
      fs.rmSync(operation.backup, { force: true });
      ensureStaging(operation);
    }
    atomicJson(input.paths.journal, {
      surface_kind: 'opl_domain_artifact_cas_transaction_journal',
      version: 'opl-domain-artifact-cas-transaction-journal.v1',
      request_sha256: input.requestSha256,
      operations_sha256: sha256(canonicalJsonBytes(journalOperations(input.operations))),
      phase: 'switching',
      visibility_model: 'cooperating_opl_readers_must_treat_journal_as_sync_pending',
      operations: journalOperations(input.operations),
    });
  }

  try {
    for (const operation of input.operations) {
      if (afterMatches(operation)) {
        fs.rmSync(operation.staging, { force: true });
        continue;
      }
      ensureStaging(operation);
      if (operation.before.kind === 'existing_exact') {
        if (beforeMatches(operation)) {
          input.rename(operation.target, operation.backup);
          if (!exactFileMatches(operation.backup, operation.before.sha256, operation.before.byteSize)) {
            fail('CAS backup bytes changed before replacement installation.', { target: operation.target });
          }
        } else if (
          lstatOrNull(operation.target) === null
          && exactFileMatches(operation.backup, operation.before.sha256, operation.before.byteSize)
        ) {
          // A prior process stopped between target->backup and staging->target.
        } else {
          fail('CAS existing target is neither its exact before nor exact after state.', { target: operation.target });
        }
      } else if (lstatOrNull(operation.target) !== null) {
        fail('CAS absent precondition collided with an existing target.', { target: operation.target });
      }
      input.rename(operation.staging, operation.target);
      fsyncDirectory(path.dirname(operation.target));
      if (!afterMatches(operation)) fail('CAS installed target does not match the authorized replacement.');
    }
    if (!targetsMatch(input.operations, 'after')) fail('CAS transaction did not install every authorized target.');
    for (const operation of input.operations) {
      fs.rmSync(operation.staging, { force: true });
      fs.rmSync(operation.backup, { force: true });
      fsyncDirectory(path.dirname(operation.target));
    }
    return recovering ? 'resumed_interrupted_transaction' as const : 'none' as const;
  } catch (error) {
    rollbackTransaction(input.operations, input.paths.journal);
    throw error;
  }
}

function existingReceipt(input: {
  paths: TransactionPaths;
  request: CasRequest;
  requestSha256: string;
  operationsSha256: string;
  operations: PreparedOperation[];
  domainId: string;
  actionId: string;
  runId: string;
  handlerOutputRef: string;
  handlerOutputSha256: string;
}) {
  if (!fs.existsSync(input.paths.receiptByRequest) || fs.existsSync(input.paths.journal)) return null;
  const stored = readJsonRecord(input.paths.receiptByRequest, 'Stored CAS materialization receipt');
  assertJsonSchemaPayload({
    schemaId: 'opl-domain-artifact-cas-materialization-receipt.v1',
    schema: receiptSchema,
    sourceRef: RECEIPT_SCHEMA_REF,
  }, stored.value);
  const result = isRecord(stored.value.domain_authority_result) ? stored.value.domain_authority_result : null;
  if (
    stored.value.request_id !== input.request.request_id
    || stored.value.request_sha256 !== input.requestSha256
    || stored.value.domain_id !== input.domainId
    || stored.value.authorization_ref !== input.request.authorization_ref
    || stored.value.operations_sha256 !== input.operationsSha256
    || !result
    || result.run_id !== input.runId
    || result.action_id !== input.actionId
    || result.output_ref !== input.handlerOutputRef
    || result.output_sha256 !== input.handlerOutputSha256
    || !targetsMatch(input.operations, 'after')
  ) fail('Stored CAS materialization receipt does not bind current exact bytes and run identity.');
  return {
    receipt_path: input.paths.receiptByRequest,
    receipt_ref: pathToFileURL(input.paths.receiptByRequest).href,
    receipt_sha256: sha256(stored.bytes),
    receipt: stored.value,
  } satisfies DomainArtifactCasMaterialization;
}

function persistReceipt(paths: TransactionPaths, receipt: Record<string, unknown>) {
  const bytes = Buffer.from(formatJsonPayload(receipt));
  const receiptSha256 = sha256(bytes);
  const contentAddressed = path.join(paths.receiptRoot, `${receiptSha256}.json`);
  fs.mkdirSync(paths.receiptRoot, { recursive: true });
  if (!fs.existsSync(contentAddressed)) {
    const temporary = `${contentAddressed}.${process.pid}.${crypto.randomUUID()}.tmp`;
    durableExclusiveFile(temporary, bytes);
    try {
      fs.linkSync(temporary, contentAddressed);
      fsyncDirectory(paths.receiptRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  const contentBytes = readStableFile(contentAddressed, 'Content-addressed CAS receipt');
  if (!contentBytes.equals(bytes)) fail('Content-addressed CAS receipt bytes conflict with their digest path.');
  fs.mkdirSync(path.dirname(paths.receiptByRequest), { recursive: true });
  if (!fs.existsSync(paths.receiptByRequest)) {
    fs.linkSync(contentAddressed, paths.receiptByRequest);
    fsyncDirectory(path.dirname(paths.receiptByRequest));
  }
  const requestBytes = readStableFile(paths.receiptByRequest, 'Request-addressed CAS receipt');
  if (!requestBytes.equals(bytes)) fail('Request-addressed CAS receipt conflicts with the exact signed receipt bytes.');
  return {
    receipt_path: paths.receiptByRequest,
    receipt_ref: pathToFileURL(paths.receiptByRequest).href,
    receipt_sha256: sha256(requestBytes),
    receipt,
  } satisfies DomainArtifactCasMaterialization;
}

export function applyDomainArtifactCasMaterialization(input: {
  workspaceRoot: string;
  domainId: string;
  actionId: string;
  runId: string;
  handlerRef: string;
  hostedRuntimeBindingRef: string;
  actionAuthorityBoundary: Record<string, unknown> | null;
  handlerOutput: unknown;
  handlerOutputRef: string;
  handlerOutputSha256: string;
}, hooks: DomainArtifactCasMaterializationHooks = {}): DomainArtifactCasMaterialization | null {
  const contract = hostContract(input.actionAuthorityBoundary?.host_materialization_contract);
  const output = isRecord(input.handlerOutput) ? input.handlerOutput : null;
  const undeclaredRequest = output?.opl_host_materialization_request;
  if (!contract) {
    if (undeclaredRequest !== undefined) {
      fail('Handler output requested host materialization without a declared host capability.');
    }
    return null;
  }
  if (!output) fail('Host materialization requires an object handler output.');
  const requestValue = output[contract.request_output_field];
  const authorization = output[contract.authorization_output_field];
  if (NON_MATERIALIZING_AUTHORITY_STATUSES.has(String(output.status))) {
    if (requestValue !== null || authorization !== null) {
      fail('Non-materializing domain authority output must set its host request and authorization to null.', {
        domain_authority_status: output.status,
      });
    }
    return null;
  }
  if (!isRecord(requestValue) || !isRecord(authorization)) {
    fail('Declared host materialization output is missing its request or authorization record.');
  }
  assertJsonSchemaPayload({
    schemaId: 'opl-domain-artifact-cas-materialization-request.v1',
    schema: requestSchema,
    sourceRef: REQUEST_SCHEMA_REF,
  }, requestValue);
  const request = requestValue as unknown as CasRequest;
  if (request.domain_id !== input.domainId) {
    fail('Host materialization request domain does not match the bound action.', {
      request_domain_id: request.domain_id,
      action_domain_id: input.domainId,
    });
  }
  const operationsSha256 = sha256(canonicalJsonBytes(request.operations));
  if (digest(request.operations_sha256, 'operations_sha256') !== operationsSha256) {
    fail('Host materialization operations_sha256 does not bind operations.');
  }
  const authorizationFields = {
    authorization_ref: text(authorization.authorization_ref, 'authorization.authorization_ref'),
    capability_id: text(authorization.capability_id, 'authorization.capability_id'),
    request_id: text(authorization.request_id, 'authorization.request_id'),
    domain_id: text(authorization.domain_id, 'authorization.domain_id'),
    operations_sha256: digest(authorization.operations_sha256, 'authorization.operations_sha256'),
    authority_receipt_ref: text(authorization.authority_receipt_ref, 'authorization.authority_receipt_ref'),
    satisfied_gate_ids: stringList(authorization.satisfied_gate_ids, 'authorization.satisfied_gate_ids'),
  };
  if (
    authorization.authorized !== true
    || authorizationFields.authorization_ref !== request.authorization_ref
    || authorizationFields.capability_id !== DOMAIN_ARTIFACT_CAS_CAPABILITY_ID
    || authorizationFields.request_id !== request.request_id
    || authorizationFields.domain_id !== input.domainId
    || authorizationFields.operations_sha256 !== operationsSha256
  ) fail('Host materialization authorization does not bind the exact request.');

  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const requestSha256 = sha256(canonicalJsonBytes(request));
  const paths = transactionPaths(workspaceRoot, requestSha256);
  const suffix = requestSha256.slice(0, 20);
  const targetSet = new Set<string>();
  const operations = request.operations.map((operation): PreparedOperation => {
    const { target, normalized } = containedTarget(workspaceRoot, operation.target_relative_path);
    if (targetSet.has(target)) fail('Host materialization request contains duplicate targets.', { target });
    targetSet.add(target);
    const after = replacementBytes(operation.replacement_bytes_base64, operation.replacement_byte_size);
    const afterSha256 = digest(operation.replacement_sha256, 'replacement_sha256');
    if (sha256(after) !== afterSha256) fail('CAS replacement bytes do not match their declared digest.', { target });
    const before = operation.precondition.kind === 'absent'
      ? { kind: 'absent' as const }
      : {
          kind: 'existing_exact' as const,
          sha256: digest(operation.precondition.sha256, 'precondition.sha256'),
          byteSize: operation.precondition.byte_size,
        };
    return {
      relative: normalized,
      target,
      staging: path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.opl-cas.staging`),
      backup: path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.opl-cas.backup`),
      before,
      after,
      afterSha256,
    };
  });
  const receiptInput = {
    paths,
    request,
    requestSha256,
    operationsSha256,
    operations,
    domainId: input.domainId,
    actionId: input.actionId,
    runId: input.runId,
    handlerOutputRef: input.handlerOutputRef,
    handlerOutputSha256: digest(input.handlerOutputSha256, 'handler_output_sha256'),
  };
  const prior = existingReceipt(receiptInput);
  if (prior) {
    writeReadEpoch({
      file: paths.readEpoch,
      workspaceRoot,
      requestSha256,
      phase: 'settled',
      outcome: 'materialized',
    });
    return prior;
  }

  acquireLock(paths.lock, requestSha256);
  let readEpochStarted = false;
  try {
    validatePreparedPaths(workspaceRoot, operations);
    const existing = existingReceipt(receiptInput);
    if (existing) {
      writeReadEpoch({
        file: paths.readEpoch,
        workspaceRoot,
        requestSha256,
        phase: 'settled',
        outcome: 'materialized',
      });
      return existing;
    }
    writeReadEpoch({
      file: paths.readEpoch,
      workspaceRoot,
      requestSha256,
      phase: 'in_progress',
      outcome: null,
    });
    readEpochStarted = true;
    const recoveryAction = switchTransaction({
      workspaceRoot,
      requestSha256,
      paths,
      operations,
      rename: hooks.rename ?? fs.renameSync,
    });
    if (fs.existsSync(paths.receiptByRequest)) {
      fs.rmSync(paths.journal, { force: true });
      fsyncDirectory(path.dirname(paths.journal));
      const recovered = existingReceipt(receiptInput)
        ?? fail('Recovered CAS receipt is not admissible after transaction finalization.');
      writeReadEpoch({
        file: paths.readEpoch,
        workspaceRoot,
        requestSha256,
        phase: 'settled',
        outcome: 'materialized',
      });
      return recovered;
    }
    const receipt = {
      surface_kind: 'opl_domain_artifact_cas_materialization_receipt',
      version: 'opl-domain-artifact-cas-materialization-receipt.v1',
      capability_id: DOMAIN_ARTIFACT_CAS_CAPABILITY_ID,
      status: 'materialized',
      request_id: request.request_id,
      request_sha256: requestSha256,
      domain_id: input.domainId,
      authorization_ref: authorizationFields.authorization_ref,
      authority_receipt_ref: authorizationFields.authority_receipt_ref,
      satisfied_gate_ids: authorizationFields.satisfied_gate_ids,
      domain_authority_result: {
        run_id: input.runId,
        action_id: input.actionId,
        handler_ref: input.handlerRef,
        hosted_runtime_binding_ref: input.hostedRuntimeBindingRef,
        output_ref: input.handlerOutputRef,
        output_sha256: receiptInput.handlerOutputSha256,
      },
      operations_sha256: operationsSha256,
      operations: operations.map(operationIdentity),
      transaction: {
        all_targets_preflighted_before_write: true,
        all_targets_revalidated_before_switch: true,
        rollback_on_failure: true,
        durable_recovery_journal: true,
        recovery_action: recoveryAction,
        visibility_model: 'journaled_all_or_rollback_for_cooperating_opl_readers',
        journal_must_be_absent_for_admission: true,
      },
      authority_boundary: {
        opl_role: 'exact_byte_cas_transport_and_receipt',
        domain_role: 'mutation_semantics_and_authorization_owner',
        opl_interprets_domain_semantics: false,
        provider_completion_is_domain_truth: false,
        receipt_is_domain_owner_receipt: false,
      },
    };
    assertJsonSchemaPayload({
      schemaId: 'opl-domain-artifact-cas-materialization-receipt.v1',
      schema: receiptSchema,
      sourceRef: RECEIPT_SCHEMA_REF,
    }, receipt);
    hooks.beforePersistReceipt?.();
    const persisted = persistReceipt(paths, receipt);
    fs.rmSync(paths.journal, { force: true });
    fsyncDirectory(path.dirname(paths.journal));
    writeReadEpoch({
      file: paths.readEpoch,
      workspaceRoot,
      requestSha256,
      phase: 'settled',
      outcome: 'materialized',
    });
    return persisted;
  } catch (error) {
    if (readEpochStarted && !fs.existsSync(paths.journal)) {
      writeReadEpoch({
        file: paths.readEpoch,
        workspaceRoot,
        requestSha256,
        phase: 'settled',
        outcome: fs.existsSync(paths.receiptByRequest) ? 'materialized' : 'rolled_back',
      });
    }
    throw error;
  } finally {
    for (const operation of operations) fs.rmSync(operation.staging, { force: true });
    fs.rmSync(paths.lock, { force: true });
  }
}
