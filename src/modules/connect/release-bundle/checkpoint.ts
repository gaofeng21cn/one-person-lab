import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../../kernel/json-file.ts';
import {
  assertReleaseBundle,
  assertReleaseBundleCheckpoint,
  readReleaseBundleQualificationReceipt,
  sha256,
} from './contracts.ts';
import { restoreQualifiedReleaseBundleTrackFromCheckpoint } from './operations.ts';
import {
  installReleaseBundleOperationControl,
  installFrozenReleaseBundle,
  markReleaseBundleLegacyCheckpointReadOnly,
  readReleaseBundleOperation,
  readReleaseBundleOperationControls,
  readStagedReleaseBundleAssets,
  readStoredReleaseBundle,
  recordReleaseBundleOperation,
  releaseBundleStorePaths,
  releaseBundleHasUnknownOutcome,
  releaseBundleLegacyCheckpointReadOnly,
  stageReleaseBundleAssets,
  withReleaseBundleStateLock,
} from './store.ts';
import type {
  ReleaseBundleCheckpoint,
  ReleaseBundleCheckpointEntry,
  ReleaseBundleCheckpointStage,
  ReleaseBundleCheckpointTrack,
  ReleaseBundleOperationReceipt,
  ReleaseBundleTrackName,
} from './types.ts';

const BUFFER_SIZE = 1024 * 1024;
const TRACKS = ['standard', 'full'] as const;

type Snapshot = {
  path: string;
  size_bytes: number;
  sha256: string;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle_checkpoint.v1',
    ...details,
  });
}

function safeRelativePath(value: string, label: string) {
  if (
    !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail(`${label} must be a canonical relative POSIX path.`, { path: value });
  }
  return value;
}

function inspectFile(filePath: string, label: string): Snapshot {
  const exactPath = path.resolve(filePath);
  let descriptor: number;
  try {
    descriptor = fs.openSync(exactPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
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
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function copySnapshot(source: Snapshot, target: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source.path, target, fs.constants.COPYFILE_EXCL);
  const copied = inspectFile(target, 'Exported Release Bundle checkpoint entry');
  if (copied.size_bytes !== source.size_bytes || copied.sha256 !== source.sha256) {
    fail('Release Bundle checkpoint entry changed while it was exported.', {
      source_path: source.path,
      target_path: target,
    });
  }
}

function checkpointEntry(input: {
  root: string;
  source: string;
  relativePath: string;
  role: ReleaseBundleCheckpointEntry['role'];
  track?: ReleaseBundleTrackName;
  assetName?: string;
}) {
  const relativePath = safeRelativePath(input.relativePath, 'Release Bundle checkpoint entry path');
  const source = inspectFile(input.source, 'Release Bundle checkpoint source entry');
  copySnapshot(source, path.join(input.root, ...relativePath.split('/')));
  return {
    path: relativePath,
    role: input.role,
    track: input.track ?? null,
    asset_name: input.assetName ?? null,
    size_bytes: source.size_bytes,
    sha256: source.sha256,
  } satisfies ReleaseBundleCheckpointEntry;
}

function derivedStage(
  tracks: Record<ReleaseBundleTrackName, ReleaseBundleCheckpointTrack>,
): ReleaseBundleCheckpointStage {
  if (tracks.full.verified) return 'full_qualified';
  if (tracks.full.built) return 'full_built';
  if (tracks.standard.verified) return 'standard_qualified';
  if (tracks.standard.built) return 'standard_built';
  return 'frozen';
}

function assertNoUnknownExecutorOutcome(
  paths: ReturnType<typeof releaseBundleStorePaths>,
) {
  for (const track of TRACKS) {
    for (const operation of ['build', 'publish'] as const) {
      if (releaseBundleHasUnknownOutcome(paths, operation, track)) {
        fail('Release Bundle checkpoint export requires every executor outcome to be reconciled.', {
          operation,
          track,
        });
      }
    }
  }
}

function qualificationPath(
  paths: ReturnType<typeof releaseBundleStorePaths>,
  track: ReleaseBundleTrackName,
) {
  const verification = readReleaseBundleOperation(paths, 'verify', track);
  if (!verification || !['complete', 'idempotent'].includes(verification.status)) return null;
  const receiptPath = verification.details.qualification_receipt_path;
  if (typeof receiptPath !== 'string' || !receiptPath.trim()) {
    fail('Verified Release Bundle track is missing its qualification receipt path.', { track });
  }
  return receiptPath;
}

function readCheckpointJson(filePath: string) {
  const snapshot = inspectFile(filePath, 'Release Bundle checkpoint manifest');
  let value: unknown;
  try {
    value = parseJsonText(fs.readFileSync(snapshot.path, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Release Bundle checkpoint is not valid JSON.', {
      path: snapshot.path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  assertReleaseBundleCheckpoint(value);
  return { checkpoint: value, path: snapshot.path, root: path.dirname(snapshot.path) };
}

function listFiles(root: string, current = root): string[] {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(current, entry.name);
    const relative = path.relative(root, entryPath).split(path.sep).join('/');
    if (entry.isSymbolicLink()) fail('Release Bundle checkpoint must not contain symlinks.', { path: relative });
    if (entry.isDirectory()) return listFiles(root, entryPath);
    if (!entry.isFile()) fail('Release Bundle checkpoint contains a non-regular entry.', { path: relative });
    return [relative];
  });
}

function validateCheckpointDirectory(input: ReturnType<typeof readCheckpointJson>) {
  const { checkpoint, root } = input;
  const paths = checkpoint.entries.map((entry) => safeRelativePath(entry.path, 'Checkpoint entry path'));
  if (paths.length !== new Set(paths).size) fail('Release Bundle checkpoint contains duplicate entry paths.');
  const actualFiles = listFiles(root).sort();
  const expectedFiles = ['checkpoint.json', ...paths].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail('Release Bundle checkpoint directory must contain exactly the declared closed file set.', {
      expected_files: expectedFiles,
      actual_files: actualFiles,
    });
  }
  for (const entry of checkpoint.entries) {
    const observed = inspectFile(
      path.join(root, ...entry.path.split('/')),
      'Release Bundle checkpoint entry',
    );
    if (observed.size_bytes !== entry.size_bytes || observed.sha256 !== entry.sha256) {
      fail('Release Bundle checkpoint entry does not match its declared identity.', {
        path: entry.path,
        expected_size_bytes: entry.size_bytes,
        actual_size_bytes: observed.size_bytes,
        expected_sha256: entry.sha256,
        actual_sha256: observed.sha256,
      });
    }
  }
}

function entryByRole(
  checkpoint: ReleaseBundleCheckpoint,
  role: ReleaseBundleCheckpointEntry['role'],
  track: ReleaseBundleTrackName | null,
) {
  return checkpoint.entries.filter((entry) => entry.role === role && entry.track === track);
}

function assertCheckpointSemantics(input: ReturnType<typeof readCheckpointJson>) {
  const { checkpoint, root } = input;
  const bundleEntries = entryByRole(checkpoint, 'bundle', null);
  const noteEntries = entryByRole(checkpoint, 'prepared_notes', null);
  if (bundleEntries.length !== 1 || bundleEntries[0].path !== 'bundle.json') {
    fail('Release Bundle checkpoint requires exactly one bundle.json entry.');
  }
  if (noteEntries.length !== 1 || noteEntries[0].path !== 'notes.md') {
    fail('Release Bundle checkpoint requires exactly one notes.md entry.');
  }
  const bundleValue = parseJsonText(fs.readFileSync(path.join(root, 'bundle.json'), 'utf8'));
  assertReleaseBundle(bundleValue);
  if (bundleValue.bundle_digest !== checkpoint.bundle_digest) {
    fail('Release Bundle checkpoint manifest and bundle.json use different Bundle digests.');
  }
  const notes = fs.readFileSync(path.join(root, 'notes.md'), 'utf8');
  if (notes !== bundleValue.prepared_notes.markdown) {
    fail('Release Bundle checkpoint notes.md differs from the immutable prepared notes.');
  }

  for (const track of TRACKS) {
    const plan = checkpoint.tracks[track];
    if (plan.verified && !plan.built) fail('A verified checkpoint track must also be built.', { track });
    const assetEntries = entryByRole(checkpoint, 'track_asset', track);
    const assetNames = assetEntries.map((entry) => entry.asset_name).sort();
    if (assetNames.some((name) => typeof name !== 'string')) {
      fail('Checkpoint track asset entries require asset_name.', { track });
    }
    const declared = [...plan.asset_names].sort();
    if (JSON.stringify(assetNames) !== JSON.stringify(declared)) {
      fail('Checkpoint track asset entries do not match the track plan.', { track });
    }
    const required = plan.built ? [...bundleValue.tracks[track].required_asset_names].sort() : [];
    if (JSON.stringify(declared) !== JSON.stringify(required)) {
      fail('Checkpoint built track does not contain the exact closed Bundle asset set.', { track });
    }
    for (const entry of assetEntries) {
      const expectedPath = `tracks/${track}/assets/${entry.asset_name}`;
      if (entry.path !== expectedPath) {
        fail('Checkpoint track asset path is not canonical.', { track, path: entry.path });
      }
    }
    const qualifications = entryByRole(checkpoint, 'qualification_receipt', track);
    if (plan.verified) {
      const expectedPath = `tracks/${track}/qualification.json`;
      if (
        qualifications.length !== 1
        || qualifications[0].path !== expectedPath
        || plan.qualification_receipt_path !== expectedPath
        || plan.qualification_receipt_sha256 !== qualifications[0].sha256
      ) {
        fail('Verified checkpoint track requires one canonical qualification receipt.', { track });
      }
      const receipt = readReleaseBundleQualificationReceipt(path.join(root, expectedPath));
      if (receipt.bundle_digest !== checkpoint.bundle_digest || receipt.track !== track) {
        fail('Checkpoint qualification receipt is bound to another Bundle or track.', { track });
      }
    } else if (
      qualifications.length !== 0
      || plan.qualification_receipt_path !== null
      || plan.qualification_receipt_sha256 !== null
    ) {
      fail('Unverified checkpoint track must not contain qualification evidence.', { track });
    }
  }
  if (checkpoint.tracks.full.built && !checkpoint.tracks.standard.verified) {
    fail('Full checkpoint bytes require a verified Standard track.');
  }
  if (checkpoint.checkpoint_stage !== derivedStage(checkpoint.tracks)) {
    fail('Release Bundle checkpoint stage does not match its completed track state.');
  }
  const controls = checkpoint.operation_controls;
  if (controls) {
    for (const control of Object.values(controls)) {
      if (control && control.bundle_digest !== checkpoint.bundle_digest) {
        fail('Checkpoint operation control belongs to another Release Bundle.');
      }
    }
    if (controls.append_full && !controls.standard) {
      fail('append_full checkpoint control requires the immutable Standard operation control.');
    }
    if (controls.append_full && !checkpoint.tracks.standard.verified) {
      fail('append_full checkpoint control requires a qualified Standard track.');
    }
    if (
      controls.standard
      && controls.append_full
      && controls.standard.operation_id === controls.append_full.operation_id
    ) {
      fail('append_full checkpoint control must use an independent operation identity.');
    }
  }
  return bundleValue;
}

function exportReleaseBundleCheckpointUnlocked(input: {
  bundleDigest: string;
  outputDirectory: string;
  storeRoot?: string;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  assertNoUnknownExecutorOutcome(stored.paths);
  const output = path.resolve(input.outputDirectory);
  if (fs.existsSync(output)) {
    const existing = readCheckpointJson(path.join(output, 'checkpoint.json'));
    validateCheckpointDirectory(existing);
    assertCheckpointSemantics(existing);
    if (existing.checkpoint.bundle_digest !== input.bundleDigest) {
      fail('Checkpoint output already belongs to a different Release Bundle.', { output });
    }
    return {
      version: 'g2' as const,
      release_bundle_checkpoint_export: {
        status: 'idempotent' as const,
        checkpoint_digest: existing.checkpoint.checkpoint_digest,
        checkpoint_stage: existing.checkpoint.checkpoint_stage,
        bundle_digest: input.bundleDigest,
        checkpoint_path: existing.path,
      },
    };
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = path.join(
    path.dirname(output),
    `.${path.basename(output)}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
  fs.mkdirSync(temporary, { recursive: false, mode: 0o755 });
  try {
    const entries: ReleaseBundleCheckpointEntry[] = [
      checkpointEntry({ root: temporary, source: stored.paths.bundle, relativePath: 'bundle.json', role: 'bundle' }),
      checkpointEntry({ root: temporary, source: stored.paths.notes, relativePath: 'notes.md', role: 'prepared_notes' }),
    ];
    const tracks = {} as Record<ReleaseBundleTrackName, ReleaseBundleCheckpointTrack>;
    for (const track of TRACKS) {
      const staged = readStagedReleaseBundleAssets(stored.paths, track);
      const qualification = qualificationPath(stored.paths, track);
      if (qualification && !staged) fail('Verified track has no staged assets.', { track });
      if (track === 'full' && staged && !qualificationPath(stored.paths, 'standard')) {
        fail('Full checkpoint bytes require a verified Standard track.');
      }
      for (const asset of staged?.assets ?? []) {
        entries.push(checkpointEntry({
          root: temporary,
          source: asset.path,
          relativePath: `tracks/${track}/assets/${asset.name}`,
          role: 'track_asset',
          track,
          assetName: asset.name,
        }));
      }
      let qualificationEntry: ReleaseBundleCheckpointEntry | null = null;
      if (qualification) {
        qualificationEntry = checkpointEntry({
          root: temporary,
          source: qualification,
          relativePath: `tracks/${track}/qualification.json`,
          role: 'qualification_receipt',
          track,
        });
        entries.push(qualificationEntry);
      }
      tracks[track] = {
        built: staged !== null,
        verified: qualification !== null,
        asset_names: (staged?.assets ?? []).map((asset) => asset.name).sort(),
        qualification_receipt_path: qualificationEntry?.path ?? null,
        qualification_receipt_sha256: qualificationEntry?.sha256 ?? null,
      };
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    const operationControls = releaseBundleLegacyCheckpointReadOnly(stored.paths)
      ? undefined
      : readReleaseBundleOperationControls(stored.paths);
    const core = {
      surface_kind: 'opl_release_bundle_checkpoint.v1' as const,
      schema_ref: 'contracts/opl-framework/release-bundle-checkpoint.schema.json' as const,
      bundle_digest: input.bundleDigest,
      checkpoint_stage: derivedStage(tracks),
      ...(operationControls ? { operation_controls: operationControls } : {}),
      tracks,
      entries,
      policy: {
        portable_between_executors: true as const,
        import_never_rebuilds: true as const,
        publish_state_requires_fresh_remote_readback: true as const,
      },
    };
    const checkpoint: ReleaseBundleCheckpoint = {
      ...core,
      checkpoint_digest: sha256(canonicalJsonBytes(core)),
    };
    assertReleaseBundleCheckpoint(checkpoint);
    fs.writeFileSync(path.join(temporary, 'checkpoint.json'), formatJsonPayload(checkpoint), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    });
    try {
      fs.renameSync(temporary, output);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = readCheckpointJson(path.join(output, 'checkpoint.json'));
      validateCheckpointDirectory(existing);
      if (existing.checkpoint.checkpoint_digest !== checkpoint.checkpoint_digest) {
        fail('Checkpoint output raced with different bytes.', { output });
      }
    }
    return {
      version: 'g2' as const,
      release_bundle_checkpoint_export: {
        status: 'complete' as const,
        checkpoint_digest: checkpoint.checkpoint_digest,
        checkpoint_stage: checkpoint.checkpoint_stage,
        bundle_digest: input.bundleDigest,
        checkpoint_path: path.join(output, 'checkpoint.json'),
      },
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function exportReleaseBundleCheckpoint(input: {
  bundleDigest: string;
  outputDirectory: string;
  storeRoot?: string;
}) {
  const paths = releaseBundleStorePaths(input.bundleDigest, input.storeRoot);
  return withReleaseBundleStateLock(paths, () => exportReleaseBundleCheckpointUnlocked(input));
}

function importReleaseBundleCheckpointUnlocked(input: {
  checkpointPath: string;
  storeRoot?: string;
}, source: ReturnType<typeof readCheckpointJson>) {
  validateCheckpointDirectory(source);
  const bundle = assertCheckpointSemantics(source);
  const installed = installFrozenReleaseBundle(bundle, input.storeRoot);
  assertNoUnknownExecutorOutcome(installed.paths);
  if (source.checkpoint.operation_controls) {
    for (const control of Object.values(source.checkpoint.operation_controls)) {
      if (control) installReleaseBundleOperationControl(installed.paths, control);
    }
  } else {
    markReleaseBundleLegacyCheckpointReadOnly(
      installed.paths,
      source.checkpoint.checkpoint_digest,
    );
  }
  const liveMutationCompatible = Boolean(source.checkpoint.operation_controls)
    && !releaseBundleLegacyCheckpointReadOnly(installed.paths);
  const previous = readReleaseBundleOperation(installed.paths, 'checkpoint_import', null);
  if (previous?.details.checkpoint_digest === source.checkpoint.checkpoint_digest) {
    for (const track of TRACKS) {
      const expected = source.checkpoint.tracks[track];
      const staged = readStagedReleaseBundleAssets(installed.paths, track);
      if (expected.built !== Boolean(staged)) {
        fail('Imported Release Bundle store no longer matches its checkpoint stage.', { track });
      }
      if (expected.verified) {
        const verification = readReleaseBundleOperation(installed.paths, 'verify', track);
        if (!verification || !['complete', 'idempotent'].includes(verification.status)) {
          fail('Imported Release Bundle store lost its qualification state.', { track });
        }
      }
    }
    return {
      version: 'g2' as const,
      release_bundle_checkpoint_import: {
        status: 'idempotent' as const,
        checkpoint_digest: source.checkpoint.checkpoint_digest,
        checkpoint_stage: source.checkpoint.checkpoint_stage,
        bundle_digest: source.checkpoint.bundle_digest,
        store_path: installed.paths.directory,
        rebuild_performed: false as const,
        publish_state_imported: false as const,
        live_mutation_compatible: liveMutationCompatible,
      },
    };
  }

  for (const track of TRACKS) {
    const checkpointTrack = source.checkpoint.tracks[track];
    if (!checkpointTrack.built) continue;
    const assets = source.checkpoint.entries
      .filter((entry) => entry.role === 'track_asset' && entry.track === track)
      .map((entry) => ({
        name: entry.asset_name!,
        path: path.join(source.root, ...entry.path.split('/')),
        size_bytes: entry.size_bytes,
        sha256: entry.sha256,
      }));
    stageReleaseBundleAssets({
      bundle,
      paths: installed.paths,
      executorReceipt: {
        surface_kind: 'opl_release_bundle_executor_receipt.v1',
        schema_ref: 'contracts/opl-framework/release-bundle-executor-receipt.schema.json',
        operation: 'build',
        executor: 'local',
        attempt_id: source.checkpoint.checkpoint_digest,
        bundle_digest: source.checkpoint.bundle_digest,
        track,
        outcome: 'complete',
        assets,
      },
    });
    if (checkpointTrack.verified) {
      restoreQualifiedReleaseBundleTrackFromCheckpoint({
        bundleDigest: source.checkpoint.bundle_digest,
        track,
        qualificationReceiptPath: path.join(source.root, checkpointTrack.qualification_receipt_path!),
        storeRoot: input.storeRoot,
        operationControl: source.checkpoint.operation_controls?.[
          track === 'standard' ? 'standard' : 'append_full'
        ] ?? null,
      });
    }
  }

  const receipt: ReleaseBundleOperationReceipt = {
    surface_kind: 'opl_release_bundle_operation_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-operation-receipt.schema.json',
    operation: 'checkpoint_import',
    status: 'complete',
    bundle_digest: source.checkpoint.bundle_digest,
    track: null,
    executor: null,
    attempt_id: source.checkpoint.checkpoint_digest,
    recorded_at: new Date().toISOString(),
    release_operation: null,
    operation_control: null,
    unknown_marker: null,
    details: {
      checkpoint_digest: source.checkpoint.checkpoint_digest,
      checkpoint_stage: source.checkpoint.checkpoint_stage,
      checkpoint_path: source.path,
      imported_tracks: source.checkpoint.tracks,
      rebuild_performed: false,
      publish_state_imported: false,
      required_next_remote_action: 'fresh_remote_inspect_then_publish_or_reconcile',
      operation_control_imported: Boolean(source.checkpoint.operation_controls),
      live_mutation_compatible: liveMutationCompatible,
    },
  };
  recordReleaseBundleOperation(installed.paths, receipt);
  return {
    version: 'g2' as const,
    release_bundle_checkpoint_import: {
      status: 'complete' as const,
      checkpoint_digest: source.checkpoint.checkpoint_digest,
      checkpoint_stage: source.checkpoint.checkpoint_stage,
      bundle_digest: source.checkpoint.bundle_digest,
      store_path: installed.paths.directory,
      rebuild_performed: false as const,
      publish_state_imported: false as const,
      live_mutation_compatible: liveMutationCompatible,
    },
  };
}

export function importReleaseBundleCheckpoint(input: {
  checkpointPath: string;
  storeRoot?: string;
}) {
  const source = readCheckpointJson(path.resolve(input.checkpointPath));
  const paths = releaseBundleStorePaths(source.checkpoint.bundle_digest, input.storeRoot);
  return withReleaseBundleStateLock(
    paths,
    () => importReleaseBundleCheckpointUnlocked(input, source),
  );
}
