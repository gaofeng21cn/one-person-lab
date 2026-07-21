import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  assertBundleDigest,
  assertOperationReceipt,
  assertReleaseBundle,
  assertReleaseBundleOperationControl,
  assertReleaseBundleUnknownOutcomeMarker,
  sha256,
} from './contracts.ts';
import type {
  ReleaseBundleCanonicalOperation,
  ReleaseBundle,
  ReleaseBundleExecutorReceipt,
  ReleaseBundleOperationControl,
  ReleaseBundleOperationReceipt,
  ReleaseBundleQualificationReceipt,
  ReleaseBundleStageOperation,
  ReleaseBundleTrackName,
  ReleaseBundleUnknownOutcomeMarker,
  StoredReleaseBundleAsset,
} from './types.ts';

const BUFFER_SIZE = 1024 * 1024;
const STATE_LOCK_WAIT = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const STATE_LOCK_WAIT_MS = 30_000;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle.v1',
    ...details,
  });
}

function storeRoot(input?: string) {
  return path.resolve(input?.trim() || path.join(resolveOplStatePaths().state_dir, 'release-bundles'));
}

export function resolveReleaseBundleStoreRoot(input?: string) {
  return storeRoot(input);
}

export function releaseBundleStorePaths(bundleDigest: string, selectedStoreRoot?: string) {
  assertBundleDigest(bundleDigest);
  const root = storeRoot(selectedStoreRoot);
  const directory = path.join(root, 'bundles', bundleDigest.slice('sha256:'.length));
  return {
    root,
    directory,
    bundle: path.join(directory, 'bundle.json'),
    notes: path.join(directory, 'notes.md'),
    receipts: path.join(directory, 'receipts'),
    state: path.join(directory, 'state'),
  };
}

export function withReleaseBundleStateLock<T>(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  action: () => T,
  options: { maxWaitMs?: number } = {},
) {
  ensureDirectory(paths.state);
  const maxWaitMs = options.maxWaitMs ?? STATE_LOCK_WAIT_MS;
  if (!Number.isInteger(maxWaitMs) || maxWaitMs < 0 || maxWaitMs > STATE_LOCK_WAIT_MS) {
    fail('Release Bundle state lock wait must be a bounded non-negative integer.', { max_wait_ms: maxWaitMs });
  }
  const lockPath = path.join(paths.state, '.bundle-state-transition.lock');
  const owner = {
    surface_kind: 'opl_release_bundle_state_lock.v1',
    owner_id: crypto.randomUUID(),
    pid: process.pid,
    hostname: os.hostname(),
    acquired_at: new Date().toISOString(),
  };
  const ownerBytes = Buffer.from(formatJsonPayload(owner), 'utf8');
  const candidatePath = `${lockPath}.${owner.owner_id}.candidate`;
  const descriptor = fs.openSync(
    candidatePath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
      | (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, ownerBytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  const waitStartedAt = Date.now();
  try {
    while (true) {
      try {
        fs.linkSync(candidatePath, lockPath);
        fs.unlinkSync(candidatePath);
        fsyncDirectory(paths.state);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let currentOwner: unknown = null;
        try {
          currentOwner = parseJsonText(fs.readFileSync(lockPath, 'utf8'));
        } catch {
          currentOwner = { unreadable: true };
        }
        if (isRecord(currentOwner) && currentOwner.pid === process.pid) {
          fail('Release Bundle state transition lock is not reentrant.', {
            lock_path: lockPath,
            current_owner: currentOwner,
          });
        }
        const waitedMs = Date.now() - waitStartedAt;
        if (waitedMs >= maxWaitMs) {
          fail('Release Bundle state transition is already locked by another process.', {
            lock_path: lockPath,
            waited_ms: waitedMs,
            current_owner: currentOwner,
          });
        }
        Atomics.wait(STATE_LOCK_WAIT, 0, 0, Math.min(25, maxWaitMs - waitedMs));
      }
    }

    try {
      return action();
    } finally {
      const installedOwner = fs.readFileSync(lockPath);
      if (!installedOwner.equals(ownerBytes)) {
        fail('Release Bundle state transition lock ownership changed before release.', {
          lock_path: lockPath,
          owner_id: owner.owner_id,
        });
      }
      removeDurableFile(lockPath);
    }
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function fsyncDirectory(directory: string) {
  const descriptor = fs.openSync(
    directory,
    fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0),
  );
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('Release Bundle store path must be a real directory.', { path: directory });
  }
}

function writeDurableJsonState(filePath: string, payload: unknown) {
  const directory = path.dirname(filePath);
  ensureDirectory(directory);
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
        | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    fs.writeFileSync(descriptor, formatJsonPayload(payload), 'utf8');
    fs.fchmodSync(descriptor, 0o644);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
    fsyncDirectory(directory);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function removeDurableFile(filePath: string) {
  fs.unlinkSync(filePath);
  fsyncDirectory(path.dirname(filePath));
}

function installImmutableBytes(filePath: string, bytes: Buffer) {
  const directory = path.dirname(filePath);
  ensureDirectory(directory);
  if (fs.existsSync(filePath)) {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail('Release Bundle immutable target must be a regular file.', { path: filePath });
    }
    const existing = fs.readFileSync(filePath);
    if (!existing.equals(bytes)) {
      fail('Release Bundle immutable target already contains different bytes.', { path: filePath });
    }
    return 'idempotent' as const;
  }
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
        | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    fs.writeFileSync(descriptor, bytes);
    fs.fchmodSync(descriptor, 0o644);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      fs.linkSync(temporary, filePath);
      fsyncDirectory(directory);
      return 'created' as const;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = fs.readFileSync(filePath);
      if (!existing.equals(bytes)) {
        fail('Release Bundle immutable target raced with different bytes.', { path: filePath });
      }
      return 'idempotent' as const;
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function readJsonObject(filePath: string, label: string) {
  let value: unknown;
  try {
    value = parseJsonText(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_file_missing', `${label} is unavailable.`, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(value)) fail(`${label} must be a JSON object.`, { path: filePath });
  return value;
}

export function installFrozenReleaseBundle(bundle: ReleaseBundle, selectedStoreRoot?: string) {
  assertReleaseBundle(bundle);
  const paths = releaseBundleStorePaths(bundle.bundle_digest, selectedStoreRoot);
  ensureDirectory(paths.directory);
  const bundleStatus = installImmutableBytes(paths.bundle, Buffer.from(formatJsonPayload(bundle), 'utf8'));
  const notesStatus = installImmutableBytes(paths.notes, Buffer.from(bundle.prepared_notes.markdown, 'utf8'));
  ensureDirectory(paths.receipts);
  ensureDirectory(paths.state);
  return {
    status: bundleStatus === 'idempotent' && notesStatus === 'idempotent'
      ? 'idempotent' as const
      : 'frozen' as const,
    paths,
  };
}

export function readStoredReleaseBundle(bundleDigest: string, selectedStoreRoot?: string) {
  const paths = releaseBundleStorePaths(bundleDigest, selectedStoreRoot);
  const value = readJsonObject(paths.bundle, 'Frozen Release Bundle');
  assertReleaseBundle(value);
  if (value.bundle_digest !== bundleDigest) {
    fail('Release Bundle store path does not match the stored bundle digest.', {
      requested_bundle_digest: bundleDigest,
      stored_bundle_digest: value.bundle_digest,
    });
  }
  return { bundle: value, paths };
}

type FileSnapshot = {
  path: string;
  size_bytes: number;
  sha256: string;
  dev: bigint;
  ino: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
};

function inspectRegularFile(filePath: string, label: string): FileSnapshot {
  const exactPath = path.resolve(filePath);
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  let descriptor: number;
  try {
    descriptor = fs.openSync(exactPath, fs.constants.O_RDONLY | noFollow);
  } catch (error) {
    throw new FrameworkContractError('contract_file_missing', `${label} is unavailable.`, {
      path: exactPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) {
      fail(`${label} must be a regular non-symlink file.`, { path: exactPath });
    }
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(BUFFER_SIZE);
    let offset = 0;
    while (true) {
      const read = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
      offset += read;
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
      || BigInt(offset) !== after.size
    ) {
      fail(`${label} changed while its bytes were inspected.`, { path: exactPath });
    }
    return {
      path: exactPath,
      size_bytes: Number(after.size),
      sha256: `sha256:${hash.digest('hex')}`,
      dev: after.dev,
      ino: after.ino,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function copyImmutableFile(source: FileSnapshot, target: string) {
  const directory = path.dirname(target);
  ensureDirectory(directory);
  if (fs.existsSync(target)) {
    const existing = inspectRegularFile(target, 'Stored Release Bundle asset');
    if (existing.size_bytes !== source.size_bytes || existing.sha256 !== source.sha256) {
      fail('Release Bundle already contains different asset bytes.', {
        asset_path: target,
        expected_sha256: source.sha256,
        actual_sha256: existing.sha256,
      });
    }
    return 'idempotent' as const;
  }

  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
  try {
    fs.copyFileSync(source.path, temporary, fs.constants.COPYFILE_EXCL);
    const copied = inspectRegularFile(temporary, 'Staged Release Bundle asset');
    const sourceAfter = inspectRegularFile(source.path, 'Executor Release Bundle asset');
    if (
      copied.size_bytes !== source.size_bytes
      || copied.sha256 !== source.sha256
      || sourceAfter.size_bytes !== source.size_bytes
      || sourceAfter.sha256 !== source.sha256
      || sourceAfter.dev !== source.dev
      || sourceAfter.ino !== source.ino
      || sourceAfter.mtimeNs !== source.mtimeNs
      || sourceAfter.ctimeNs !== source.ctimeNs
    ) {
      fail('Executor asset changed while it was being staged.', { source_path: source.path });
    }
    try {
      fs.linkSync(temporary, target);
      fsyncDirectory(directory);
      return 'created' as const;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = inspectRegularFile(target, 'Stored Release Bundle asset');
      if (existing.size_bytes !== source.size_bytes || existing.sha256 !== source.sha256) {
        fail('Release Bundle asset raced with different bytes.', { asset_path: target });
      }
      return 'idempotent' as const;
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function trackRoot(paths: ReturnType<typeof releaseBundleStorePaths>, track: ReleaseBundleTrackName) {
  return path.join(paths.directory, 'tracks', track);
}

export function stageReleaseBundleAssets(input: {
  bundle: ReleaseBundle;
  paths: ReturnType<typeof releaseBundleStorePaths>;
  executorReceipt: ReleaseBundleExecutorReceipt;
}) {
  const { bundle, paths, executorReceipt } = input;
  const expectedNames = [...bundle.tracks[executorReceipt.track].required_asset_names].sort();
  const receivedNames = executorReceipt.assets.map((asset) => asset.name).sort();
  if (JSON.stringify(receivedNames) !== JSON.stringify(expectedNames)) {
    fail('Release Bundle build receipt must provide the exact closed track asset set.', {
      track: executorReceipt.track,
      expected_asset_names: expectedNames,
      received_asset_names: receivedNames,
    });
  }

  const prepared = executorReceipt.assets.map((asset) => {
    const source = inspectRegularFile(asset.path!, 'Executor Release Bundle asset');
    if (source.size_bytes !== asset.size_bytes || source.sha256 !== asset.sha256) {
      fail('Executor Release Bundle asset does not match its declared identity.', {
        asset_name: asset.name,
        expected_size_bytes: asset.size_bytes,
        actual_size_bytes: source.size_bytes,
        expected_sha256: asset.sha256,
        actual_sha256: source.sha256,
      });
    }
    const target = path.join(trackRoot(paths, executorReceipt.track), 'assets', asset.name);
    if (fs.existsSync(target)) {
      const existing = inspectRegularFile(target, 'Stored Release Bundle asset');
      if (existing.size_bytes !== source.size_bytes || existing.sha256 !== source.sha256) {
        fail('Release Bundle already contains different asset bytes.', {
          track: executorReceipt.track,
          asset_name: asset.name,
          expected_sha256: existing.sha256,
          received_sha256: source.sha256,
        });
      }
    }
    return { asset, source, target };
  });

  let created = false;
  for (const entry of prepared) {
    if (copyImmutableFile(entry.source, entry.target) === 'created') created = true;
  }
  const assets = prepared
    .map(({ asset, target }) => ({ ...asset, path: target }) as StoredReleaseBundleAsset)
    .sort((left, right) => left.name.localeCompare(right.name));
  const manifestPath = path.join(trackRoot(paths, executorReceipt.track), 'assets.json');
  const manifest = {
    surface_kind: 'opl_release_bundle_staged_assets.v1',
    bundle_digest: bundle.bundle_digest,
    track: executorReceipt.track,
    assets,
  };
  const manifestStatus = installImmutableBytes(
    manifestPath,
    Buffer.from(formatJsonPayload(manifest), 'utf8'),
  );
  return {
    status: !created && manifestStatus === 'idempotent' ? 'idempotent' as const : 'complete' as const,
    assets,
    manifestPath,
  };
}

export function readStagedReleaseBundleAssets(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  track: ReleaseBundleTrackName,
) {
  const manifestPath = path.join(trackRoot(paths, track), 'assets.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = readJsonObject(manifestPath, 'Release Bundle staged asset manifest');
  if (
    manifest.surface_kind !== 'opl_release_bundle_staged_assets.v1'
    || manifest.track !== track
    || !Array.isArray(manifest.assets)
  ) {
    fail('Release Bundle staged asset manifest is invalid.', { path: manifestPath });
  }
  const assets = manifest.assets as StoredReleaseBundleAsset[];
  for (const asset of assets) {
    const observed = inspectRegularFile(asset.path, 'Stored Release Bundle asset');
    if (observed.size_bytes !== asset.size_bytes || observed.sha256 !== asset.sha256) {
      fail('Stored Release Bundle asset bytes drifted after build.', {
        track,
        asset_name: asset.name,
        expected_sha256: asset.sha256,
        actual_sha256: observed.sha256,
      });
    }
  }
  return { manifestPath, assets };
}

function operationStatePath(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: string,
  track: ReleaseBundleTrackName | null,
) {
  return path.join(paths.state, `${operation}-${track ?? 'bundle'}.json`);
}

export function recordReleaseBundleOperation(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  receipt: ReleaseBundleOperationReceipt,
) {
  assertOperationReceipt(receipt);
  const receiptBytes = canonicalJsonBytes(receipt);
  const receiptSha256 = sha256(receiptBytes);
  const receiptPath = path.join(
    paths.receipts,
    `${receipt.operation}-${receipt.track ?? 'bundle'}-${receiptSha256.slice(7)}.json`,
  );
  installImmutableBytes(receiptPath, receiptBytes);
  const statePath = operationStatePath(paths, receipt.operation, receipt.track);
  writeDurableJsonState(statePath, {
    surface_kind: 'opl_release_bundle_operation_state.v1',
    receipt_path: receiptPath,
    receipt_sha256: receiptSha256,
    receipt,
  });
  return { receiptPath, receiptSha256, statePath };
}

export function readReleaseBundleOperation(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: string,
  track: ReleaseBundleTrackName | null,
) {
  const statePath = operationStatePath(paths, operation, track);
  if (!fs.existsSync(statePath)) return null;
  const state = readJsonObject(statePath, 'Release Bundle operation state');
  return isRecord(state.receipt) ? state.receipt as ReleaseBundleOperationReceipt : null;
}

export function clearReleaseBundleOperation(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: string,
  track: ReleaseBundleTrackName | null,
) {
  const filePath = operationStatePath(paths, operation, track);
  if (fs.existsSync(filePath)) removeDurableFile(filePath);
}

function operationControlStatePath(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: ReleaseBundleCanonicalOperation,
) {
  return path.join(paths.state, `operation-control-${operation}.json`);
}

export function installReleaseBundleOperationControl(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  control: ReleaseBundleOperationControl,
) {
  assertReleaseBundleOperationControl(control);
  const filePath = operationControlStatePath(paths, control.operation_kind);
  const status = installImmutableBytes(filePath, Buffer.from(formatJsonPayload(control), 'utf8'));
  return { status, filePath };
}

export function readReleaseBundleOperationControl(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: ReleaseBundleCanonicalOperation,
) {
  const filePath = operationControlStatePath(paths, operation);
  if (!fs.existsSync(filePath)) return null;
  const value = readJsonObject(filePath, 'Release Bundle operation control');
  assertReleaseBundleOperationControl(value);
  return value;
}

export function readReleaseBundleOperationControls(
  paths: ReturnType<typeof releaseBundleStorePaths>,
) {
  return {
    standard: readReleaseBundleOperationControl(paths, 'standard'),
    append_full: readReleaseBundleOperationControl(paths, 'append_full'),
  };
}

function legacyCheckpointStatePath(paths: ReturnType<typeof releaseBundleStorePaths>) {
  return path.join(paths.state, 'legacy-checkpoint-read-only.json');
}

export function markReleaseBundleLegacyCheckpointReadOnly(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  checkpointDigest: string,
) {
  const marker = {
    surface_kind: 'opl_release_bundle_legacy_checkpoint_read_only.v1',
    checkpoint_digest: checkpointDigest,
    live_mutation_compatible: false,
    reason: 'operation_control_missing',
  };
  return installImmutableBytes(
    legacyCheckpointStatePath(paths),
    Buffer.from(formatJsonPayload(marker), 'utf8'),
  );
}

export function releaseBundleLegacyCheckpointReadOnly(
  paths: ReturnType<typeof releaseBundleStorePaths>,
) {
  return fs.existsSync(legacyCheckpointStatePath(paths));
}

function unknownStatePath(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: ReleaseBundleStageOperation,
  track: ReleaseBundleTrackName,
) {
  return path.join(paths.state, `unknown-${operation}-${track}.json`);
}

export function readReleaseBundleUnknownOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: ReleaseBundleStageOperation,
  track: ReleaseBundleTrackName,
) {
  const filePath = unknownStatePath(paths, operation, track);
  if (!fs.existsSync(filePath)) return null;
  const value = readJsonObject(filePath, 'Release Bundle unknown outcome marker');
  assertReleaseBundleUnknownOutcomeMarker(value);
  return value;
}

export function listReleaseBundleUnknownOutcomes(
  paths: ReturnType<typeof releaseBundleStorePaths>,
) {
  const markers: ReleaseBundleUnknownOutcomeMarker[] = [];
  for (const operation of ['build', 'publish'] as const) {
    for (const track of ['standard', 'full'] as const) {
      const marker = readReleaseBundleUnknownOutcome(paths, operation, track);
      if (marker) markers.push(marker);
    }
  }
  return markers.sort((left, right) => left.marker_digest.localeCompare(right.marker_digest));
}

export function releaseBundleHasUnknownOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: ReleaseBundleStageOperation,
  track: ReleaseBundleTrackName,
) {
  return readReleaseBundleUnknownOutcome(paths, operation, track) !== null;
}

export function recordReleaseBundleUnknownOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  marker: ReleaseBundleUnknownOutcomeMarker,
) {
  assertReleaseBundleUnknownOutcomeMarker(marker);
  const filePath = unknownStatePath(paths, marker.stage_operation, marker.track);
  const status = installImmutableBytes(filePath, Buffer.from(formatJsonPayload(marker), 'utf8'));
  return { status, filePath };
}

export function clearReleaseBundleUnknownOutcomeExact(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  expected: ReleaseBundleUnknownOutcomeMarker,
) {
  assertReleaseBundleUnknownOutcomeMarker(expected);
  const filePath = unknownStatePath(paths, expected.stage_operation, expected.track);
  const current = readReleaseBundleUnknownOutcome(
    paths,
    expected.stage_operation,
    expected.track,
  );
  if (!current) {
    fail('Release Bundle exact unknown outcome marker no longer exists.', {
      expected_marker_digest: expected.marker_digest,
    });
  }
  if (!canonicalJsonBytes(current).equals(canonicalJsonBytes(expected))) {
    fail('Release Bundle unknown outcome marker changed before exact clear.', {
      expected_marker_digest: expected.marker_digest,
      actual_marker_digest: current.marker_digest,
    });
  }
  removeDurableFile(filePath);
  return filePath;
}

export function installReleaseBundleQualificationReceipt(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  receipt: ReleaseBundleQualificationReceipt,
) {
  const bytes = canonicalJsonBytes(receipt);
  const receiptSha256 = sha256(bytes);
  const receiptPath = path.join(
    paths.receipts,
    `qualification-${receipt.track}-${receiptSha256.slice(7)}.json`,
  );
  installImmutableBytes(receiptPath, bytes);
  return { receiptPath, receiptSha256 };
}
