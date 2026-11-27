import fs from 'node:fs';

/** Return a collision-resistant stat signature for zero-staleness cache validation. */
export function fileStatFingerprint(filePath: string, followSymlinks = false): string {
  if (!filePath) return 'empty';
  const stat = followSymlinks
    ? fs.statSync(filePath, { bigint: true, throwIfNoEntry: false })
    : fs.lstatSync(filePath, { bigint: true, throwIfNoEntry: false });
  if (!stat) return 'missing';
  return [stat.mode, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.uid].join(':');
}
