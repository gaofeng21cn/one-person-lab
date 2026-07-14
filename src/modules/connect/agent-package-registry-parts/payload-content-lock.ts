import crypto from 'node:crypto';

export const LEGACY_PACKAGE_CONTENT_LOCK = 'ordered_path_nul_file_bytes';
export const CANONICAL_PACKAGE_CONTENT_LOCK = 'ordered_path_length_file_length_bytes';

export type PackageContentLockCanonicalization =
  | typeof LEGACY_PACKAGE_CONTENT_LOCK
  | typeof CANONICAL_PACKAGE_CONTENT_LOCK;

export function packageContentLockDigest(
  canonicalization: PackageContentLockCanonicalization,
  files: Array<{ path: string; content: Buffer }>,
) {
  const digest = crypto.createHash('sha256');
  for (const file of files) {
    const pathBytes = Buffer.from(file.path, 'utf8');
    if (canonicalization === LEGACY_PACKAGE_CONTENT_LOCK) {
      digest.update(pathBytes);
      digest.update('\0');
      digest.update(file.content);
      continue;
    }
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(file.content.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(fileLength);
    digest.update(file.content);
  }
  return `sha256:${digest.digest('hex')}`;
}
