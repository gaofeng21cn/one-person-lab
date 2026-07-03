import crypto from 'node:crypto';

export function stableId(prefix: string, parts: unknown[]) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}_${digest}`;
}
