import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  assertBundleDigest,
  assertOperationReceipt,
  assertReleaseBundle,
  sha256,
} from './contracts.ts';
import type {
  ReleaseBundle,
  ReleaseBundleExecutorReceipt,
  ReleaseBundleOperationReceipt,
  ReleaseBundleQualificationReceipt,
  ReleaseBundleTrackName,
  StoredReleaseBundleAsset,
} from './types.ts';

const BUFFER_SIZE = 1024 * 1024;

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
  writeJsonPayloadFile(statePath, {
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
  fs.rmSync(operationStatePath(paths, operation, track), { force: true });
}

function unknownStatePath(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: 'build' | 'publish',
  track: ReleaseBundleTrackName,
) {
  return path.join(paths.state, `unknown-${operation}-${track}.json`);
}

export function releaseBundleHasUnknownOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: 'build' | 'publish',
  track: ReleaseBundleTrackName,
) {
  return fs.existsSync(unknownStatePath(paths, operation, track));
}

export function recordReleaseBundleUnknownOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: 'build' | 'publish',
  executorReceipt: ReleaseBundleExecutorReceipt,
) {
  const filePath = unknownStatePath(paths, operation, executorReceipt.track);
  writeJsonPayloadFile(filePath, {
    surface_kind: 'opl_release_bundle_unknown_outcome.v1',
    operation,
    bundle_digest: executorReceipt.bundle_digest,
    track: executorReceipt.track,
    executor: executorReceipt.executor,
    attempt_id: executorReceipt.attempt_id,
  });
  return filePath;
}

export function clearReleaseBundleUnknownOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  operation: 'build' | 'publish',
  track: ReleaseBundleTrackName,
) {
  fs.rmSync(unknownStatePath(paths, operation, track), { force: true });
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
