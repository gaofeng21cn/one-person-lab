import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';

export const DOMAIN_ARTIFACT_CAS_CAPABILITY_ID = 'opl_domain_artifact_cas_materialization.v1' as const;

const DIGEST = /^(?:sha256:)?([a-f0-9]{64})$/u;

export type ExistingExactPrecondition = {
  kind: 'existing_exact';
  sha256: string;
  byte_size: number;
};

export type AbsentPrecondition = { kind: 'absent' };
export type CasPrecondition = ExistingExactPrecondition | AbsentPrecondition;

export type CasOperation = {
  target_relative_path: string;
  precondition: CasPrecondition;
  replacement_bytes_base64: string;
  replacement_sha256: string;
  replacement_byte_size: number;
};

export type CasRequest = {
  surface_kind: 'opl_domain_artifact_cas_materialization_request';
  version: 'opl-domain-artifact-cas-materialization.v1';
  capability_id: typeof DOMAIN_ARTIFACT_CAS_CAPABILITY_ID;
  request_id: string;
  domain_id: string;
  authorization_ref: string;
  operations_sha256: string;
  materialization_scope_sha256?: string;
  absent_relative_path_preconditions?: string[];
  operations: CasOperation[];
};

export type PreparedOperation = {
  relative: string;
  target: string;
  staging: string;
  backup: string;
  before: { kind: 'existing_exact'; sha256: string; byteSize: number } | { kind: 'absent' };
  after: Buffer;
  afterSha256: string;
};

export type PreparedAbsentPrecondition = {
  relative: string;
  target: string;
};

export type PreparedParentDirectory = {
  relative: string;
  target: string;
};

export type TransactionPaths = ReturnType<typeof transactionPaths>;

export type DomainArtifactCasMaterialization = {
  receipt_path: string;
  receipt_ref: string;
  receipt_sha256: string;
  receipt: Record<string, unknown>;
};

export type DomainArtifactCasMaterializationHooks = {
  rename?: typeof fs.renameSync;
  beforeJournalSwitch?: () => void;
  beforePersistReceipt?: () => void;
};

export function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'domain_artifact_cas_materialization_invalid',
    ...details,
  });
}

export function sha256(bytes: string | Buffer | Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function digest(value: unknown, field: string) {
  if (typeof value !== 'string') fail(`${field} must be a SHA-256 digest.`, { field });
  const match = DIGEST.exec(value);
  if (!match) fail(`${field} must be a SHA-256 digest.`, { field, value });
  return match[1]!;
}

export function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value.trim();
}

export function stringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${field} must be an array of non-empty strings.`, { field });
  }
  const normalized = value.map((entry) => String(entry).trim());
  if (new Set(normalized).size !== normalized.length) fail(`${field} must not contain duplicates.`, { field });
  return normalized;
}

export function exactStringList(value: unknown, field: string) {
  const normalized = stringList(value, field);
  if (normalized.some((entry, index) => entry !== (value as unknown[])[index])) {
    fail(`${field} entries must not contain surrounding whitespace.`, { field });
  }
  return normalized;
}

export function safeRelativePath(value: string, field: string) {
  if (
    path.isAbsolute(value)
    || value.split(/[\\/]+/u).some((segment) => segment === '..' || segment === '.' || !segment)
  ) {
    fail(`${field} must be a contained relative path.`, { field, value });
  }
  return value.split(/[\\/]+/u).join('/');
}

export function lstatOrNull(file: string) {
  try {
    return fs.lstatSync(file, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function containedTarget(
  root: string,
  relative: string,
  field = 'operations[].target_relative_path',
  allowMissingParents = false,
) {
  const normalized = safeRelativePath(relative, field);
  const target = path.resolve(root, normalized);
  const relation = path.relative(root, target);
  if (relation.startsWith(`..${path.sep}`) || relation === '..' || path.isAbsolute(relation)) {
    fail('CAS target escapes the selected workspace.', { target_relative_path: relative });
  }
  let cursor = root;
  const parentDirectories: PreparedParentDirectory[] = [];
  for (const segment of path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    parentDirectories.push({
      relative: path.relative(root, cursor).split(path.sep).join('/'),
      target: cursor,
    });
    const stat = lstatOrNull(cursor);
    if (!stat) {
      if (!allowMissingParents) fail('CAS target parent is missing.', { path: cursor });
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('CAS target ancestors must be physical directories.', { path: cursor });
    }
  }
  return { target, normalized, parentDirectories };
}

export function preparedAbsentPreconditions(workspaceRoot: string, value: unknown) {
  const field = 'absent_relative_path_preconditions';
  const relativePaths = exactStringList(value, field);
  return relativePaths.map((relative, index): PreparedAbsentPrecondition => {
    const entryField = `${field}[${index}]`;
    const resolved = containedTarget(workspaceRoot, relative, entryField, true);
    if (resolved.normalized !== relative) {
      fail(`${entryField} must use its canonical normalized relative path.`, { value: relative });
    }
    return { relative, target: resolved.target };
  });
}

export function assertAbsentPreconditions(
  preconditions: PreparedAbsentPrecondition[],
  phase: string,
) {
  for (const precondition of preconditions) {
    if (lstatOrNull(precondition.target) !== null) {
      fail('Authorized absent path collided before materialization.', {
        phase,
        target_relative_path: precondition.relative,
      });
    }
  }
}

export function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

export function sameStableFile(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

export function readStableFile(file: string, field: string) {
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

export function exactFileMatches(file: string, expectedSha256: string, expectedSize: number) {
  const stat = lstatOrNull(file);
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size !== BigInt(expectedSize)) return false;
  return sha256(readStableFile(file, 'CAS transaction file')) === expectedSha256;
}

export function replacementBytes(value: string, expectedSize: number) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    fail('replacement_bytes_base64 is not canonical base64.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength !== expectedSize || bytes.toString('base64') !== value) {
    fail('replacement_bytes_base64 does not match replacement_byte_size.');
  }
  return bytes;
}

export function fsyncDirectory(directory: string) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function durableExclusiveFile(file: string, bytes: Buffer) {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function atomicJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  durableExclusiveFile(temporary, Buffer.from(formatJsonPayload(value)));
  fs.renameSync(temporary, file);
  fsyncDirectory(path.dirname(file));
}

export function processAlive(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) return false;
  try {
    process.kill(Number(value), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readJsonRecord(file: string, label = 'JSON file') {
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

export function operationIdentity(operation: PreparedOperation) {
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

export function beforeMatches(operation: PreparedOperation) {
  if (operation.before.kind === 'absent') return lstatOrNull(operation.target) === null;
  return exactFileMatches(operation.target, operation.before.sha256, operation.before.byteSize);
}

export function afterMatches(operation: PreparedOperation) {
  return exactFileMatches(operation.target, operation.afterSha256, operation.after.byteLength);
}

export function targetsMatch(operations: PreparedOperation[], side: 'before' | 'after') {
  return operations.every((operation) => side === 'before' ? beforeMatches(operation) : afterMatches(operation));
}

export function transactionPaths(workspaceRoot: string, requestSha256: string, replayOnly = false) {
  const configuredStateRoot = resolveOplStatePaths().state_dir;
  if (!replayOnly) fs.mkdirSync(configuredStateRoot, { recursive: true });
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
    requestBindingRoot: path.join(stateRoot, 'request-bindings'),
  };
}

export function bindSingleUseRequest(input: {
  paths: TransactionPaths;
  request: CasRequest;
  requestSha256: string;
  replayOnly?: boolean;
}) {
  const key = sha256(`${input.request.domain_id}\0${input.request.request_id}`);
  const file = path.join(input.paths.requestBindingRoot, `${key}.json`);
  const binding = {
    surface_kind: 'opl_domain_artifact_cas_request_binding',
    version: 'opl-domain-artifact-cas-request-binding.v1',
    request_id: input.request.request_id,
    domain_id: input.request.domain_id,
    request_sha256: input.requestSha256,
    authorization_ref: input.request.authorization_ref,
  };
  const bytes = Buffer.from(formatJsonPayload(binding));
  if (!input.replayOnly) {
    fs.mkdirSync(input.paths.requestBindingRoot, { recursive: true });
    try {
      durableExclusiveFile(file, bytes);
      fsyncDirectory(input.paths.requestBindingRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  if (!readStableFile(file, 'CAS single-use request binding').equals(bytes)) {
    fail('CAS request_id is already bound to different exact request bytes.', {
      request_id: input.request.request_id,
      domain_id: input.request.domain_id,
      request_binding_ref: pathToFileURL(file).href,
    });
  }
  return pathToFileURL(file).href;
}
