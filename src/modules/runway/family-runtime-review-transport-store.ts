import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const READ_CHUNK_BYTES = 64 * 1024;

export type ReviewTransportExactRef = {
  kind: string;
  ref: string;
  size_bytes: number;
  sha256: string;
};

export function reviewTransportError(
  failureCode: string,
  message: string,
  details: Record<string, unknown> = {},
): FrameworkContractError {
  return new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: failureCode,
    ...details,
  });
}

export function requiredReviewTransportText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw reviewTransportError(
      'review_transport_field_missing',
      `Review transport requires ${field}.`,
      { field },
    );
  }
  return value.trim();
}

export function canonicalReviewTransportSha256(value: unknown, field: string) {
  const candidate = requiredReviewTransportText(value, field);
  const match = candidate.match(SHA256_PATTERN);
  if (!match) {
    throw reviewTransportError(
      'review_transport_digest_invalid',
      `Review transport requires a canonical SHA-256 digest for ${field}.`,
      { field, received_digest: candidate },
    );
  }
  return `sha256:${match[1]!.toLowerCase()}`;
}

export function reviewTransportSize(value: unknown, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw reviewTransportError(
      'review_transport_size_invalid',
      `Review transport requires ${field} to be an integer >= ${minimum}.`,
      { field, received_size: value ?? null },
    );
  }
  return Number(value);
}

export function requireReviewTransportRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw reviewTransportError(
      'review_transport_shape_invalid',
      `Review transport requires ${field} to be an object.`,
      { field },
    );
  }
  return value;
}

export function requireExactReviewTransportKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw reviewTransportError(
      'review_transport_shape_invalid',
      `${field} must use the exact declared fields.`,
      { field, expected_fields: expected, received_fields: actual },
    );
  }
}

export function reviewTransportRoots() {
  const state = ensureOplStateDir();
  const root = path.join(state.state_dir, 'family-runtime', 'review-transport');
  return {
    root,
    reviewer_snapshot_root: path.join(root, 'reviewer-input-snapshots'),
    reviewer_snapshot_object_root: path.join(root, 'reviewer-input-snapshots', 'objects'),
    reviewer_snapshot_manifest_root: path.join(root, 'reviewer-input-snapshots', 'manifests'),
    evidence_cache_root: path.join(root, 'page-evidence-cache'),
    evidence_cache_candidate_root: path.join(root, 'page-evidence-cache', 'candidates'),
    evidence_cache_entry_root: path.join(root, 'page-evidence-cache', 'entries'),
    evidence_cache_receipt_root: path.join(root, 'page-evidence-cache', 'receipts'),
  };
}

function stableStatIdentity(stat: fs.Stats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

function digestHex(value: string) {
  return value.replace(/^sha256:/, '');
}

function pathInside(candidateInput: string, rootInput: string) {
  let candidate: string;
  let root: string;
  try {
    candidate = fs.realpathSync.native(candidateInput);
    root = fs.realpathSync.native(rootInput);
  } catch {
    return false;
  }
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function stableFileObservation(filePath: string, ref: string) {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      throw reviewTransportError(
        'review_transport_ref_not_file',
        'Review transport exact ref must resolve to a regular file.',
        { ref, resolved_path: filePath },
      );
    }
    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      const read = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      sizeBytes += read;
      hash.update(chunk.subarray(0, read));
    }
    const after = fs.fstatSync(descriptor);
    if (sizeBytes !== before.size || stableStatIdentity(before) !== stableStatIdentity(after)) {
      throw reviewTransportError(
        'review_transport_ref_changed_during_read',
        'Review transport exact ref changed while it was being verified.',
        { ref, resolved_path: filePath },
      );
    }
    return { sha256: `sha256:${hash.digest('hex')}`, size_bytes: sizeBytes };
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    throw reviewTransportError(
      'review_transport_ref_unreadable',
      'Review transport exact ref is not readable.',
      {
        ref,
        resolved_path: filePath,
        read_error: error instanceof Error ? error.message : String(error),
      },
    );
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function persistBytesAtDigest(input: {
  root: string;
  extension: string;
  digest: string;
  bytes: Buffer;
}) {
  fs.mkdirSync(input.root, { recursive: true, mode: 0o700 });
  const target = path.join(input.root, `${digestHex(input.digest)}${input.extension}`);
  if (fs.existsSync(target)) {
    const observed = stableFileObservation(target, pathToFileURL(target).href);
    if (observed.sha256 !== input.digest || observed.size_bytes !== input.bytes.length) {
      throw reviewTransportError(
        'review_transport_persisted_bytes_tampered',
        'Persisted review transport bytes do not match their content-addressed identity.',
        { ref: pathToFileURL(target).href, expected_sha256: input.digest },
      );
    }
    return { path: target, created: false };
  }

  const temporary = path.join(
    input.root,
    `.${digestHex(input.digest)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, input.bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    try {
      fs.linkSync(temporary, target);
      fs.chmodSync(target, 0o444);
      return { path: target, created: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const observed = stableFileObservation(target, pathToFileURL(target).href);
      if (observed.sha256 !== input.digest || observed.size_bytes !== input.bytes.length) {
        throw reviewTransportError(
          'review_transport_persisted_bytes_tampered',
          'Concurrent review transport bytes do not match their content-addressed identity.',
          { ref: pathToFileURL(target).href, expected_sha256: input.digest },
        );
      }
      return { path: target, created: false };
    }
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

export function persistCanonicalReviewTransportJson(input: {
  root: string;
  kind: string;
  value: Record<string, unknown>;
}) {
  const bytes = canonicalJsonBytes(input.value);
  const sha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const persisted = persistBytesAtDigest({
    root: input.root,
    extension: '.json',
    digest: sha256,
    bytes,
  });
  return {
    created: persisted.created,
    exact_ref: {
      kind: input.kind,
      ref: pathToFileURL(persisted.path).href,
      size_bytes: bytes.length,
      sha256,
    } satisfies ReviewTransportExactRef,
  };
}

export function resolveContainedWorkspaceFile(workspaceRootInput: unknown, refInput: unknown) {
  const workspaceRootText = requiredReviewTransportText(workspaceRootInput, 'workspace_root');
  const ref = requiredReviewTransportText(refInput, 'source_ref');
  let workspaceRoot: string;
  try {
    workspaceRoot = fs.realpathSync.native(path.resolve(workspaceRootText));
  } catch (error) {
    throw reviewTransportError(
      'reviewer_input_snapshot_workspace_unreadable',
      'Reviewer input snapshot workspace root is not readable.',
      { workspace_root: workspaceRootText, read_error: error instanceof Error ? error.message : String(error) },
    );
  }
  let candidate: string;
  try {
    if (ref.startsWith('file://')) {
      candidate = fileURLToPath(ref);
    } else if (path.isAbsolute(ref)) {
      candidate = ref;
    } else if (!URI_SCHEME_PATTERN.test(ref)) {
      candidate = path.resolve(workspaceRoot, ref);
    } else {
      throw new Error('unsupported non-file URI');
    }
    candidate = fs.realpathSync.native(candidate);
  } catch (error) {
    throw reviewTransportError(
      'reviewer_input_snapshot_source_unreadable',
      'Reviewer input snapshot source ref is not a readable local file.',
      { source_ref: ref, read_error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!pathInside(candidate, workspaceRoot)) {
    throw reviewTransportError(
      'reviewer_input_snapshot_source_path_escape',
      'Reviewer input snapshot source ref escapes the declared workspace root.',
      { source_ref: ref, workspace_root: workspaceRoot },
    );
  }
  return { workspace_root: workspaceRoot, source_ref: ref, source_path: candidate };
}

export function persistReviewerSnapshotObject(input: {
  sourcePath?: string;
  sourceRef?: string;
  expectedSha256: string;
  expectedSizeBytes: number;
}) {
  const roots = reviewTransportRoots();
  fs.mkdirSync(roots.reviewer_snapshot_object_root, { recursive: true, mode: 0o700 });
  const target = path.join(
    roots.reviewer_snapshot_object_root,
    `${digestHex(input.expectedSha256)}.bin`,
  );
  if (fs.existsSync(target)) {
    const observed = stableFileObservation(target, pathToFileURL(target).href);
    if (observed.sha256 !== input.expectedSha256 || observed.size_bytes !== input.expectedSizeBytes) {
      throw reviewTransportError(
        'reviewer_input_snapshot_object_tampered',
        'Persisted reviewer input snapshot object does not match its expected byte identity.',
        {
          snapshot_ref: pathToFileURL(target).href,
          expected_sha256: input.expectedSha256,
          observed_sha256: observed.sha256,
          expected_size_bytes: input.expectedSizeBytes,
          observed_size_bytes: observed.size_bytes,
        },
      );
    }
    return { created: false, ref: pathToFileURL(target).href };
  }
  if (!input.sourcePath || !input.sourceRef) {
    throw reviewTransportError(
      'reviewer_input_snapshot_source_required',
      'Reviewer input snapshot source is required to materialize a missing immutable object.',
      { expected_sha256: input.expectedSha256 },
    );
  }

  const temporary = path.join(
    roots.reviewer_snapshot_object_root,
    `.${digestHex(input.expectedSha256)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let source: number | null = null;
  let destination: number | null = null;
  try {
    source = fs.openSync(input.sourcePath, 'r');
    const before = fs.fstatSync(source);
    if (!before.isFile()) {
      throw reviewTransportError(
        'reviewer_input_snapshot_source_not_file',
        'Reviewer input snapshot source must be a regular file.',
        { source_ref: input.sourceRef },
      );
    }
    destination = fs.openSync(temporary, 'wx', 0o600);
    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      const read = fs.readSync(source, chunk, 0, chunk.length, null);
      if (read === 0) break;
      const bytes = chunk.subarray(0, read);
      sizeBytes += read;
      hash.update(bytes);
      fs.writeSync(destination, bytes);
    }
    const after = fs.fstatSync(source);
    const sha256 = `sha256:${hash.digest('hex')}`;
    if (sizeBytes !== before.size || stableStatIdentity(before) !== stableStatIdentity(after)) {
      throw reviewTransportError(
        'reviewer_input_snapshot_source_changed_during_copy',
        'Reviewer input snapshot source changed while it was being copied.',
        { source_ref: input.sourceRef },
      );
    }
    if (sha256 !== input.expectedSha256 || sizeBytes !== input.expectedSizeBytes) {
      throw reviewTransportError(
        'reviewer_input_snapshot_member_identity_mismatch',
        'Reviewer input snapshot source bytes do not match the MAS-provided member identity.',
        {
          source_ref: input.sourceRef,
          expected_sha256: input.expectedSha256,
          observed_sha256: sha256,
          expected_size_bytes: input.expectedSizeBytes,
          observed_size_bytes: sizeBytes,
        },
      );
    }
    fs.fsyncSync(destination);
    fs.closeSync(destination);
    destination = null;
    try {
      fs.linkSync(temporary, target);
      fs.chmodSync(target, 0o444);
      return { created: true, ref: pathToFileURL(target).href };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const observed = stableFileObservation(target, pathToFileURL(target).href);
      if (observed.sha256 !== input.expectedSha256 || observed.size_bytes !== input.expectedSizeBytes) {
        throw reviewTransportError(
          'reviewer_input_snapshot_object_tampered',
          'Concurrent reviewer input snapshot object has the wrong byte identity.',
          { snapshot_ref: pathToFileURL(target).href },
        );
      }
      return { created: false, ref: pathToFileURL(target).href };
    }
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    throw reviewTransportError(
      'reviewer_input_snapshot_copy_failed',
      'Reviewer input snapshot bytes could not be copied into OPL state.',
      { source_ref: input.sourceRef, copy_error: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    if (source !== null) fs.closeSync(source);
    if (destination !== null) fs.closeSync(destination);
    fs.rmSync(temporary, { force: true });
  }
}

export function readReviewTransportFileExactRef(input: {
  exactRef: unknown;
  expectedKind: string;
  trustedRoot: string;
}) {
  const exactRef = requireReviewTransportRecord(input.exactRef, 'exact_ref');
  requireExactReviewTransportKeys(exactRef, ['kind', 'ref', 'size_bytes', 'sha256'], 'exact_ref');
  if (exactRef.kind !== input.expectedKind) {
    throw reviewTransportError(
      'review_transport_exact_ref_kind_mismatch',
      'Review transport exact ref kind does not match the expected surface.',
      { expected_kind: input.expectedKind, received_kind: exactRef.kind ?? null },
    );
  }
  const ref = requiredReviewTransportText(exactRef.ref, 'exact_ref.ref');
  const sha256 = canonicalReviewTransportSha256(exactRef.sha256, 'exact_ref.sha256');
  const sizeBytes = reviewTransportSize(exactRef.size_bytes, 'exact_ref.size_bytes');
  let filePath: string;
  try {
    filePath = fileURLToPath(ref);
  } catch {
    throw reviewTransportError(
      'review_transport_exact_ref_not_file_url',
      'Review transport exact ref must be a local file URL.',
      { ref },
    );
  }
  if (!pathInside(filePath, input.trustedRoot)) {
    throw reviewTransportError(
      'review_transport_exact_ref_untrusted_root',
      'Review transport exact ref is outside its OPL-owned state root.',
      { ref, trusted_root: input.trustedRoot },
    );
  }
  const observed = stableFileObservation(filePath, ref);
  const filenameDigest = path.basename(filePath).replace(/\.(?:json|bin)$/, '').toLowerCase();
  if (
    observed.sha256 !== sha256
    || observed.size_bytes !== sizeBytes
    || `sha256:${filenameDigest}` !== sha256
  ) {
    throw reviewTransportError(
      'review_transport_exact_ref_byte_mismatch',
      'Review transport exact ref does not bind the persisted bytes.',
      {
        ref,
        expected_sha256: sha256,
        observed_sha256: observed.sha256,
        expected_size_bytes: sizeBytes,
        observed_size_bytes: observed.size_bytes,
      },
    );
  }
  return {
    exact_ref: {
      kind: input.expectedKind,
      ref,
      size_bytes: sizeBytes,
      sha256,
    } satisfies ReviewTransportExactRef,
    file_path: filePath,
  };
}

export function readReviewTransportJsonExactRef(input: {
  exactRef: unknown;
  expectedKind: string;
  trustedRoot: string;
}) {
  const verified = readReviewTransportFileExactRef(input);
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(verified.file_path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('body is not an object');
    value = parsed;
  } catch (error) {
    throw reviewTransportError(
      'review_transport_json_invalid',
      'Review transport exact ref body is not valid JSON.',
      {
        ref: verified.exact_ref.ref,
        parse_error: error instanceof Error ? error.message : String(error),
      },
    );
  }
  return {
    exact_ref: verified.exact_ref,
    value,
  };
}
