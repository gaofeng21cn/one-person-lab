import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { formatJsonPayload } from '../../../kernel/json-file.ts';
import {
  assertAbsentPreconditions,
  afterMatches,
  atomicJson,
  beforeMatches,
  containedTarget,
  digest,
  durableExclusiveFile,
  exactFileMatches,
  fail,
  fsyncDirectory,
  lstatOrNull,
  operationIdentity,
  processAlive,
  preparedAbsentPreconditions,
  readJsonRecord,
  replacementBytes,
  sha256,
  targetsMatch,
  type CasRequest,
  type PreparedAbsentPrecondition,
  type PreparedOperation,
  type PreparedParentDirectory,
  type TransactionPaths,
} from './shared.ts';

export function prepareOperations(input: {
  workspaceRoot: string;
  request: CasRequest;
  requestSha256: string;
  absentRelativePathPreconditions: string[];
}) {
  const { workspaceRoot, request, requestSha256, absentRelativePathPreconditions } = input;
  const suffix = requestSha256.slice(0, 20);
  const targetSet = new Set<string>();
  const targetOperations = new Map<string, PreparedOperation>();
  const parentDirectoryMap = new Map<string, PreparedParentDirectory>();
  const operations = request.operations.map((operation): PreparedOperation => {
    const { target, normalized, parentDirectories: operationParentDirectories } = containedTarget(
      workspaceRoot,
      operation.target_relative_path,
      'operations[].target_relative_path',
      true,
    );
    for (const directory of operationParentDirectories) parentDirectoryMap.set(directory.target, directory);
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
    const prepared = {
      relative: normalized,
      target,
      staging: path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.opl-cas.staging`),
      backup: path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.opl-cas.backup`),
      before,
      after,
      afterSha256,
    };
    targetOperations.set(target, prepared);
    return prepared;
  });
  const parentDirectories = [...parentDirectoryMap.values()].sort((left, right) => (
    left.relative.split('/').length - right.relative.split('/').length
    || left.relative.localeCompare(right.relative)
  ));
  const absentPreconditions = preparedAbsentPreconditions(
    workspaceRoot,
    absentRelativePathPreconditions,
  );
  const overlappingAbsence = absentPreconditions.find((precondition) => {
    const operation = targetOperations.get(precondition.target);
    return operation !== undefined && operation.before.kind !== 'absent';
  });
  if (overlappingAbsence) {
    fail('Absent-path authorization scope overlaps a materialization operation with a non-absent target precondition.', {
      target_relative_path: overlappingAbsence.relative,
    });
  }
  const independentAbsentPreconditions = absentPreconditions.filter((precondition) => (
    !targetSet.has(precondition.target)
  ));
  return { operations, parentDirectories, independentAbsentPreconditions };
}

export function acquireLock(lockPath: string, requestSha256: string) {
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

export function validatePreparedPaths(
  workspaceRoot: string,
  operations: PreparedOperation[],
  parentDirectories: PreparedParentDirectory[],
) {
  for (const operation of operations) {
    const resolved = containedTarget(workspaceRoot, operation.relative, 'operations[].target_relative_path', true);
    if (resolved.target !== operation.target) fail('CAS target resolution changed while waiting for the lock.');
    for (const auxiliary of [operation.staging, operation.backup]) {
      const stat = lstatOrNull(auxiliary);
      if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
        fail('CAS transaction auxiliary paths must be physical files.', { path: auxiliary });
      }
    }
  }
  for (const directory of parentDirectories) {
    const resolved = containedTarget(
      workspaceRoot,
      path.posix.join(directory.relative, '.opl-directory-probe'),
      'materialized_parent_directories[]',
      true,
    );
    if (path.dirname(resolved.target) !== directory.target) {
      fail('CAS parent-directory resolution changed while waiting for the lock.', { path: directory.target });
    }
    const stat = lstatOrNull(directory.target);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      fail('CAS target ancestors must be physical directories.', { path: directory.target });
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

function assertJournal(
  paths: TransactionPaths,
  requestSha256: string,
  operations: PreparedOperation[],
  parentDirectories: PreparedParentDirectory[],
) {
  const journal = readJsonRecord(paths.journal, 'CAS recovery journal').value;
  const allowedDirectories = new Set(parentDirectories.map((directory) => directory.target));
  const createdDirectories = Array.isArray(journal.created_parent_directories)
    ? journal.created_parent_directories
    : null;
  if (
    journal.surface_kind !== 'opl_domain_artifact_cas_transaction_journal'
    || journal.version !== 'opl-domain-artifact-cas-transaction-journal.v1'
    || journal.request_sha256 !== requestSha256
    || JSON.stringify(journal.operations) !== JSON.stringify(journalOperations(operations))
    || !createdDirectories
    || createdDirectories.some((directory) => typeof directory !== 'string' || !allowedDirectories.has(directory))
    || new Set(createdDirectories).size !== createdDirectories.length
  ) fail('CAS recovery journal does not match the exact authorized transaction.', { journal_path: paths.journal });
  return createdDirectories.map((target) => parentDirectories.find((directory) => directory.target === target)!);
}

function ensureParentDirectories(input: {
  directories: PreparedParentDirectory[];
  recovering: boolean;
  materializedDirectories: PreparedParentDirectory[];
}) {
  for (const directory of input.directories) {
    const stat = lstatOrNull(directory.target);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        fail('CAS target ancestors must be physical directories.', { path: directory.target });
      }
      if (!input.recovering) {
        fail('CAS parent-directory creation collided with a concurrent writer.', { path: directory.target });
      }
      continue;
    }
    fs.mkdirSync(directory.target, { mode: 0o700 });
    input.materializedDirectories.push(directory);
    fsyncDirectory(path.dirname(directory.target));
  }
}

function ensureStaging(operation: PreparedOperation) {
  if (exactFileMatches(operation.staging, operation.afterSha256, operation.after.byteLength)) return;
  if (lstatOrNull(operation.staging)) fail('CAS staging file conflicts with the authorized replacement.', {
    path: operation.staging,
  });
  durableExclusiveFile(operation.staging, operation.after);
}

function rollbackTransaction(
  operations: PreparedOperation[],
  createdDirectories: PreparedParentDirectory[],
  journalPath: string,
) {
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
    const parent = lstatOrNull(path.dirname(operation.target));
    if (parent?.isDirectory() && !parent.isSymbolicLink()) fsyncDirectory(path.dirname(operation.target));
  }
  for (const directory of [...createdDirectories].reverse()) {
    const stat = lstatOrNull(directory.target);
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('CAS rollback found an invalid created parent-directory state.', { path: directory.target });
    }
    if (fs.readdirSync(directory.target).length > 0) {
      fail('CAS rollback cannot remove a non-empty transaction-created parent directory.', { path: directory.target });
    }
    fs.rmdirSync(directory.target);
    fsyncDirectory(path.dirname(directory.target));
  }
  fs.rmSync(journalPath, { force: true });
  if (!targetsMatch(operations, 'before')) fail('CAS rollback did not restore every exact before state.');
}

export function switchTransaction(input: {
  workspaceRoot: string;
  requestSha256: string;
  paths: TransactionPaths;
  operations: PreparedOperation[];
  parentDirectories: PreparedParentDirectory[];
  absentPreconditions: PreparedAbsentPrecondition[];
  rename: typeof fs.renameSync;
  beforeJournalSwitch?: () => void;
}) {
  assertAbsentPreconditions(input.absentPreconditions, 'before_journal_switch');
  const recovering = fs.existsSync(input.paths.journal);
  let createdDirectories: PreparedParentDirectory[];
  const materializedDirectories: PreparedParentDirectory[] = [];
  if (recovering) {
    createdDirectories = assertJournal(
      input.paths,
      input.requestSha256,
      input.operations,
      input.parentDirectories,
    );
  } else {
    if (!targetsMatch(input.operations, 'before')) {
      fail('CAS targets do not match the authorized transaction preconditions.');
    }
    createdDirectories = input.parentDirectories.filter((directory) => lstatOrNull(directory.target) === null);
    input.beforeJournalSwitch?.();
    validatePreparedPaths(input.workspaceRoot, input.operations, input.parentDirectories);
    assertAbsentPreconditions(input.absentPreconditions, 'immediately_before_journal_switch');
    atomicJson(input.paths.journal, {
      surface_kind: 'opl_domain_artifact_cas_transaction_journal',
      version: 'opl-domain-artifact-cas-transaction-journal.v1',
      request_sha256: input.requestSha256,
      operations_sha256: sha256(canonicalJsonBytes(journalOperations(input.operations))),
      phase: 'switching',
      visibility_model: 'cooperating_opl_readers_must_treat_journal_as_sync_pending',
      created_parent_directories: createdDirectories.map((directory) => directory.target),
      operations: journalOperations(input.operations),
    });
  }

  try {
    validatePreparedPaths(input.workspaceRoot, input.operations, input.parentDirectories);
    ensureParentDirectories({
      directories: createdDirectories,
      recovering,
      materializedDirectories,
    });
    for (const operation of input.operations) {
      if (!recovering) {
        fs.rmSync(operation.staging, { force: true });
        fs.rmSync(operation.backup, { force: true });
      }
      ensureStaging(operation);
    }
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
    return {
      recoveryAction: recovering ? 'resumed_interrupted_transaction' as const : 'none' as const,
      createdDirectories,
    };
  } catch (error) {
    rollbackTransaction(
      input.operations,
      recovering ? createdDirectories : materializedDirectories,
      input.paths.journal,
    );
    throw error;
  }
}
