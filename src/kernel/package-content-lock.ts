import { createHash } from 'node:crypto';

/** Hash the ordered path length, path, file length and exact file bytes. */
export function packageContentDigest(paths: readonly string[], readBytes: (relativePath: string) => Uint8Array): string {
  const digest = createHash('sha256');
  for (const relativePath of paths) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = readBytes(relativePath);
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(pathBytes.length));
    digest.update(length);
    digest.update(pathBytes);
    length.writeBigUInt64BE(BigInt(fileBytes.length));
    digest.update(length);
    digest.update(fileBytes);
  }
  return `sha256:${digest.digest('hex')}`;
}
