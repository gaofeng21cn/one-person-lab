import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import receiptSchema from
  '../../../contracts/opl-framework/artifact-projection-materialization-receipt.schema.json' with { type: 'json' };
import requestSchema from
  '../../../contracts/opl-framework/artifact-projection-materialization-request.schema.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

export const OPL_PACK_MATERIALIZE_ARTIFACT_PROJECTION_ACTION_ID =
  'opl_pack_materialize_artifact_projection' as const;

const REQUEST_SCHEMA_REF =
  'contracts/opl-framework/artifact-projection-materialization-request.schema.json';
const RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/artifact-projection-materialization-receipt.schema.json';

type FileIdentity = {
  path: string;
  byte_size: number;
  sha256: string;
};

type DomainAuthorization = {
  owner: string;
  ref: string;
  scope: 'artifact_projection_only';
  artifact_body_write_authorized: true;
  authorizes_quality_publication_or_submission: false;
};

export type ArtifactProjectionMaterializationRequest = {
  surface_kind: 'opl_artifact_projection_materialization_request.v1';
  schema_version: 1;
  operation_id: string;
  domain_id: string;
  generation_id: string;
  workspace_root: string;
  source_root: string;
  target_relative_path: string;
  expected_files: FileIdentity[];
  expected_tree_sha256: string;
  completion_marker_paths: string[];
  domain_authorization: DomainAuthorization;
  dry_run?: boolean;
};

export type ArtifactProjectionMaterializationHooks = {
  rename?: typeof fs.renameSync;
};

const AUTHORITY_BOUNDARY = {
  framework_role: 'atomic_artifact_projection_transport',
  copies_domain_prepared_bytes_only: true,
  requires_declared_domain_authorization: true,
  framework_validates_authorization_semantics: false,
  can_write_domain_truth: false,
  can_create_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_publication_or_submission: false,
} as const;

function sha256(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function contractError(message: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    action_id: OPL_PACK_MATERIALIZE_ARTIFACT_PROJECTION_ACTION_ID,
    ...details,
  });
}

function assertSchema(
  schemaId: string,
  schema: Record<string, unknown>,
  sourceRef: string,
  payload: unknown,
) {
  assertJsonSchemaPayload({ schemaId, schema, sourceRef }, payload);
}

function safeRelativePath(value: string, field: string) {
  if (
    !value.trim()
    || path.isAbsolute(value)
    || value.split(/[\\/]+/).includes('..')
    || value.split(/[\\/]+/).includes('.')
  ) {
    throw contractError(`${field} must be a contained relative path.`, { field, value });
  }
  return value.split(/[\\/]+/).join('/');
}

function assertRealDirectory(directory: string, field: string) {
  const resolved = path.resolve(directory);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw new FrameworkContractError('contract_file_missing', `${field} is missing.`, {
      field,
      path: resolved,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw contractError(`${field} must be a real directory, not a symbolic link.`, {
      field,
      path: resolved,
    });
  }
  return fs.realpathSync(resolved);
}

function isOutside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function pathsOverlap(left: string, right: string) {
  return !isOutside(left, right) || !isOutside(right, left);
}

function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableSnapshot(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableFile(file: string) {
  const before = fs.lstatSync(file, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) {
    throw contractError('Artifact projection sources must be regular files without symbolic links.', {
      path: file,
    });
  }
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const openedBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!openedBefore.isFile() || !sameFileIdentity(before, openedBefore)) {
      throw contractError('Artifact projection source changed identity before reading.', { path: file });
    }
    const bytes = fs.readFileSync(descriptor);
    const openedAfter = fs.fstatSync(descriptor, { bigint: true });
    const after = fs.lstatSync(file, { bigint: true });
    if (
      after.isSymbolicLink()
      || !sameStableSnapshot(openedBefore, openedAfter)
      || !sameStableSnapshot(openedAfter, after)
      || BigInt(bytes.length) !== after.size
    ) {
      throw contractError('Artifact projection source changed while reading.', { path: file });
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function collectTree(root: string, prefix = ''): FileIdentity[] {
  const entries: FileIdentity[] = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relativePath = path.join(prefix, entry.name);
    const file = path.join(root, relativePath);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      throw contractError('Artifact projection trees must not contain symbolic links.', { path: file });
    }
    if (stat.isDirectory()) {
      entries.push(...collectTree(root, relativePath));
      continue;
    }
    if (!stat.isFile()) {
      throw contractError('Artifact projection trees may contain only directories and regular files.', {
        path: file,
      });
    }
    const bytes = readStableFile(file);
    entries.push({
      path: relativePath.split(path.sep).join('/'),
      byte_size: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function artifactProjectionTreeSha256(entries: FileIdentity[]) {
  const canonical = entries.map((entry) => ({
    byte_size: entry.byte_size,
    path: entry.path,
    sha256: entry.sha256,
  }));
  return sha256(JSON.stringify(canonical));
}

function normalizeExpectedFiles(entries: FileIdentity[]) {
  const paths = new Set<string>();
  const normalized = entries.map((entry) => {
    const relativePath = safeRelativePath(entry.path, 'expected_files[].path');
    if (paths.has(relativePath)) {
      throw contractError('expected_files must not contain duplicate paths.', { path: relativePath });
    }
    paths.add(relativePath);
    return { ...entry, path: relativePath, sha256: entry.sha256.toLowerCase() };
  }).sort((left, right) => left.path.localeCompare(right.path));
  return normalized;
}

function assertTreeMatches(actual: FileIdentity[], expected: FileIdentity[], label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw contractError(`${label} does not match the exact expected file manifest.`, {
      expected_tree_sha256: artifactProjectionTreeSha256(expected),
      actual_tree_sha256: artifactProjectionTreeSha256(actual),
      expected_file_count: expected.length,
      actual_file_count: actual.length,
    });
  }
}

function targetMatches(targetRoot: string, expected: FileIdentity[]) {
  if (!fs.existsSync(targetRoot)) return false;
  try {
    return JSON.stringify(collectTree(assertRealDirectory(targetRoot, 'target_root')))
      === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function prepareTargetParent(workspaceRoot: string, relativeTarget: string, apply: boolean) {
  const targetRoot = path.resolve(workspaceRoot, relativeTarget);
  if (isOutside(workspaceRoot, targetRoot)) {
    throw contractError('target_relative_path resolves outside workspace_root.', {
      workspace_root: workspaceRoot,
      target_relative_path: relativeTarget,
    });
  }
  let cursor = workspaceRoot;
  for (const segment of path.relative(workspaceRoot, path.dirname(targetRoot)).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) {
      if (!apply) continue;
      fs.mkdirSync(cursor);
    }
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw contractError('Artifact projection target ancestors must be real directories.', { path: cursor });
    }
  }
  if (fs.existsSync(targetRoot)) {
    const stat = fs.lstatSync(targetRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw contractError('Artifact projection target must be a real directory when present.', {
        path: targetRoot,
      });
    }
  }
  return targetRoot;
}

function fsyncDirectory(directory: string) {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error;
    }
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function writeDurableFile(file: string, bytes: Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function copyExpectedTree(sourceRoot: string, stagingRoot: string, expected: FileIdentity[]) {
  fs.mkdirSync(stagingRoot);
  for (const identity of expected) {
    const bytes = readStableFile(path.join(sourceRoot, identity.path));
    if (bytes.length !== identity.byte_size || sha256(bytes) !== identity.sha256) {
      throw contractError('Artifact projection source changed after preflight validation.', {
        path: identity.path,
      });
    }
    writeDurableFile(path.join(stagingRoot, identity.path), bytes);
  }
  fsyncDirectory(stagingRoot);
}

type RecoveryAction =
  | 'none'
  | 'removed_abandoned_staging'
  | 'restored_previous_target'
  | 'finalized_installed_target'
  | 'kept_existing_target';

function recoverInterruptedTransaction(input: {
  targetRoot: string;
  stagingRoot: string;
  backupRoot: string;
  expected: FileIdentity[];
}): RecoveryAction {
  const { targetRoot, stagingRoot, backupRoot, expected } = input;
  if (targetMatches(targetRoot, expected)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.rmSync(backupRoot, { recursive: true, force: true });
    return 'finalized_installed_target';
  }
  if (fs.existsSync(backupRoot)) {
    fs.rmSync(targetRoot, { recursive: true, force: true });
    fs.renameSync(backupRoot, targetRoot);
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    return 'restored_previous_target';
  }
  if (fs.existsSync(stagingRoot)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    return 'removed_abandoned_staging';
  }
  return fs.existsSync(targetRoot) ? 'kept_existing_target' : 'none';
}

function processAlive(pid: unknown) {
  if (!Number.isInteger(pid) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLock(file: string) {
  try {
    const payload = parseJsonText(fs.readFileSync(file, 'utf8'));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function acquireLock(input: {
  lockPath: string;
  lockPayload: Record<string, unknown>;
  recover: () => RecoveryAction;
}) {
  let recoveryAction: RecoveryAction = 'none';
  for (;;) {
    try {
      const descriptor = fs.openSync(input.lockPath, 'wx');
      try {
        fs.writeFileSync(descriptor, formatJsonPayload(input.lockPayload));
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return recoveryAction;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const currentLock = readLock(input.lockPath);
    if (processAlive(currentLock?.pid)) {
      throw contractError('Another artifact projection transaction is active for this target.', {
        lock_path: input.lockPath,
        owner_pid: currentLock?.pid,
      });
    }
    const recoveryLock = `${input.lockPath}.recovering-${process.pid}-${crypto.randomUUID()}`;
    try {
      fs.renameSync(input.lockPath, recoveryLock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    try {
      recoveryAction = input.recover();
    } finally {
      fs.rmSync(recoveryLock, { force: true });
    }
  }
}

function writeContentAddressedReceipt(receipt: Record<string, unknown>) {
  const bytes = Buffer.from(formatJsonPayload(receipt));
  const digest = sha256(bytes);
  const receiptPath = path.join(
    resolveOplStatePaths().state_dir,
    'pack',
    'artifact-projections',
    'receipts',
    'sha256',
    `${digest}.json`,
  );
  if (!fs.existsSync(receiptPath)) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    const temporary = `${receiptPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    writeDurableFile(temporary, bytes);
    try {
      fs.linkSync(temporary, receiptPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  return { receiptPath, receiptSha256: digest };
}

export function materializeArtifactProjection(
  input: unknown,
  hooks: ArtifactProjectionMaterializationHooks = {},
) {
  assertSchema(
    'opl-artifact-projection-materialization-request.v1',
    requestSchema,
    REQUEST_SCHEMA_REF,
    input,
  );
  const request = input as ArtifactProjectionMaterializationRequest;
  const workspaceRoot = assertRealDirectory(request.workspace_root, 'workspace_root');
  const sourceRoot = assertRealDirectory(request.source_root, 'source_root');
  const targetRelativePath = safeRelativePath(request.target_relative_path, 'target_relative_path');
  const targetRoot = prepareTargetParent(workspaceRoot, targetRelativePath, false);
  if (pathsOverlap(sourceRoot, targetRoot)) {
    throw contractError('source_root and target_root must not overlap.', { sourceRoot, targetRoot });
  }

  const expected = normalizeExpectedFiles(request.expected_files);
  const expectedTreeSha256 = artifactProjectionTreeSha256(expected);
  if (expectedTreeSha256 !== request.expected_tree_sha256) {
    throw contractError('expected_tree_sha256 does not match expected_files.', {
      expected_tree_sha256: request.expected_tree_sha256,
      computed_tree_sha256: expectedTreeSha256,
    });
  }
  const markers = request.completion_marker_paths.map((marker) =>
    safeRelativePath(marker, 'completion_marker_paths[]')
  );
  const expectedPaths = new Set(expected.map((entry) => entry.path));
  const missingMarkers = markers.filter((marker) => !expectedPaths.has(marker));
  if (missingMarkers.length > 0) {
    throw contractError('Completion markers must be included in expected_files.', {
      missing_completion_markers: missingMarkers,
    });
  }
  assertTreeMatches(collectTree(sourceRoot), expected, 'source_root');

  if (request.dry_run !== true) prepareTargetParent(workspaceRoot, targetRelativePath, true);
  const parent = path.dirname(targetRoot);
  const baseName = path.basename(targetRoot);
  const stagingRoot = path.join(parent, `.${baseName}.opl-artifact-projection.staging`);
  const backupRoot = path.join(parent, `.${baseName}.opl-artifact-projection.backup`);
  const lockPath = path.join(parent, `.${baseName}.opl-artifact-projection.lock`);
  const rename = hooks.rename ?? fs.renameSync;
  let status: 'materialized' | 'already_materialized' | 'dry_run' = 'dry_run';
  let recoveryAction: RecoveryAction = 'none';

  if (request.dry_run !== true) {
    recoveryAction = acquireLock({
      lockPath,
      lockPayload: {
        surface_kind: 'opl_artifact_projection_materialization_lock.v1',
        pid: process.pid,
        operation_id: request.operation_id,
        generation_id: request.generation_id,
        target_root: targetRoot,
      },
      recover: () => recoverInterruptedTransaction({ targetRoot, stagingRoot, backupRoot, expected }),
    });
    let installed = false;
    try {
      if (targetMatches(targetRoot, expected)) {
        status = 'already_materialized';
      } else {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        fs.rmSync(backupRoot, { recursive: true, force: true });
        copyExpectedTree(sourceRoot, stagingRoot, expected);
        assertTreeMatches(collectTree(stagingRoot), expected, 'validated staging tree');

        const movedPrevious = fs.existsSync(targetRoot);
        if (movedPrevious) rename(targetRoot, backupRoot);
        try {
          rename(stagingRoot, targetRoot);
          installed = true;
          assertTreeMatches(collectTree(targetRoot), expected, 'installed target tree');
          fsyncDirectory(parent);
        } catch (error) {
          fs.rmSync(targetRoot, { recursive: true, force: true });
          if (movedPrevious && fs.existsSync(backupRoot)) rename(backupRoot, targetRoot);
          throw error;
        }
        fs.rmSync(backupRoot, { recursive: true, force: true });
        status = 'materialized';
      }
    } finally {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      if (!installed && !fs.existsSync(targetRoot) && fs.existsSync(backupRoot)) {
        rename(backupRoot, targetRoot);
      }
      fs.rmSync(lockPath, { force: true });
    }
  }

  const receipt = {
    surface_kind: 'opl_pack_artifact_projection_materialization_receipt.v1',
    schema_version: 1,
    action_id: OPL_PACK_MATERIALIZE_ARTIFACT_PROJECTION_ACTION_ID,
    status,
    operation_id: request.operation_id,
    domain_id: request.domain_id,
    generation_id: request.generation_id,
    source: {
      root: sourceRoot,
      file_count: expected.length,
      tree_sha256: expectedTreeSha256,
    },
    target: {
      root: targetRoot,
      file_count: expected.length,
      tree_sha256: expectedTreeSha256,
    },
    completion_marker_paths: markers,
    domain_authorization: request.domain_authorization,
    transaction: {
      staging_validated_before_switch: true,
      canonical_root_never_exposed_as_incomplete: true,
      previous_root_restored_on_switch_failure: true,
      recovery_action: recoveryAction,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  assertSchema(
    'opl-artifact-projection-materialization-receipt.v1',
    receiptSchema,
    RECEIPT_SCHEMA_REF,
    receipt,
  );
  const receiptBytes = Buffer.from(formatJsonPayload(receipt));
  const dryRunReceiptPath = path.join(
    resolveOplStatePaths().state_dir,
    'pack',
    'artifact-projections',
    'receipts',
    'sha256',
    `${sha256(receiptBytes)}.json`,
  );
  const stored = request.dry_run === true
    ? { receiptPath: dryRunReceiptPath, receiptSha256: sha256(receiptBytes) }
    : writeContentAddressedReceipt(receipt);
  return {
    version: 'g2',
    pack_artifact_projection_materialization: {
      status,
      dry_run: request.dry_run === true,
      writes_performed: status === 'materialized',
      receipt_path: stored.receiptPath,
      receipt_sha256: stored.receiptSha256,
      receipt,
    },
  };
}

export function materializeArtifactProjectionRequestFile(requestPath: string, dryRun = false) {
  const exactPath = path.resolve(requestPath);
  let payload: unknown;
  try {
    payload = parseJsonText(fs.readFileSync(exactPath, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Artifact projection request must be valid JSON.', {
      path: exactPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(payload)) {
    throw contractError('Artifact projection request root must be an object.', { path: exactPath });
  }
  return materializeArtifactProjection({ ...payload, ...(dryRun ? { dry_run: true } : {}) });
}
