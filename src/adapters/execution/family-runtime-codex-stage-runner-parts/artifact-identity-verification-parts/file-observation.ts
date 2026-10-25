import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';
import { artifactIdentityError } from './identity-contract.ts';

const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const FILE_READ_CHUNK_BYTES = 64 * 1024;

export type StableFileObservation = {
  sha256: string;
  sizeBytes: number;
  bytes: Buffer | null;
};

export function localPathForRef(ref: string, workspaceRoot: string) {
  if (ref.startsWith('file://')) {
    try {
      return fileURLToPath(ref);
    } catch {
      throw artifactIdentityError({
        message: 'Artifact file URL is invalid.',
        blockedReason: 'artifact_ref_unreadable',
        artifactRef: ref,
      });
    }
  }
  if (path.isAbsolute(ref)) return ref;
  if (URI_SCHEME_PATTERN.test(ref)) return null;
  return path.resolve(workspaceRoot, ref);
}

export function stableStatIdentity(stat: fs.Stats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

export function observeStableFile(input: {
  filePath: string;
  artifactRef: string;
  captureBytes?: boolean;
  maxBytes?: number;
  authorityReceipt?: boolean;
}): StableFileObservation {
  let descriptor: number | null = null;
  const blockedReason = input.authorityReceipt
    ? 'artifact_identity_receipt_unverifiable_authority_violation'
    : 'artifact_ref_unreadable';
  const hardStopClass = input.authorityReceipt ? 'authority_boundary_violation' as const : undefined;
  try {
    descriptor = fs.openSync(input.filePath, 'r');
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      throw artifactIdentityError({
        message: input.authorityReceipt
          ? 'Artifact identity receipt must be a regular file.'
          : 'Artifact identity must point to a regular local file.',
        blockedReason,
        hardStopClass,
        artifactRef: input.artifactRef,
        details: { resolved_path: input.filePath },
      });
    }
    if (input.maxBytes !== undefined && before.size > input.maxBytes) {
      throw artifactIdentityError({
        message: 'Artifact identity receipt exceeds the transport verification limit.',
        blockedReason,
        hardStopClass,
        artifactRef: input.artifactRef,
        details: { resolved_path: input.filePath, size_bytes: before.size, max_bytes: input.maxBytes },
      });
    }

    const hash = crypto.createHash('sha256');
    const captured: Buffer[] = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(FILE_READ_CHUNK_BYTES);
      const read = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      const bytes = chunk.subarray(0, read);
      total += read;
      if (input.maxBytes !== undefined && total > input.maxBytes) {
        throw artifactIdentityError({
          message: 'Artifact identity receipt exceeds the transport verification limit.',
          blockedReason,
          hardStopClass,
          artifactRef: input.artifactRef,
          details: { resolved_path: input.filePath, observed_size_bytes: total, max_bytes: input.maxBytes },
        });
      }
      hash.update(bytes);
      if (input.captureBytes) captured.push(Buffer.from(bytes));
    }
    const after = fs.fstatSync(descriptor);
    if (total !== before.size || stableStatIdentity(before) !== stableStatIdentity(after)) {
      throw artifactIdentityError({
        message: input.authorityReceipt
          ? 'Artifact identity receipt changed while it was being verified.'
          : 'Artifact bytes changed while their identity was being verified.',
        blockedReason: input.authorityReceipt
          ? 'artifact_identity_receipt_changed_during_verification'
          : 'artifact_changed_during_identity_verification',
        hardStopClass,
        artifactRef: input.artifactRef,
        details: { resolved_path: input.filePath },
      });
    }
    return {
      sha256: hash.digest('hex'),
      sizeBytes: total,
      bytes: input.captureBytes ? Buffer.concat(captured, total) : null,
    };
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    throw artifactIdentityError({
      message: input.authorityReceipt
        ? 'Artifact identity receipt is not readable by the transport.'
        : 'Artifact identity points to an unreadable local file.',
      blockedReason,
      hardStopClass,
      artifactRef: input.artifactRef,
      details: {
        resolved_path: input.filePath,
        read_error: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}
