import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type DomainSourceInput =
  | { kind: 'file'; source_path: string; role?: string; label?: string }
  | { kind: 'text'; text: string; role?: string; label?: string };

export function fingerprintDomainSource(body: string | Buffer) {
  return crypto.createHash('sha256').update(body).digest('hex');
}
function safeSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

export function materializeDomainSources(input: {
  material_root: string;
  sources: DomainSourceInput[];
  apply?: boolean;
}) {
  if (input.sources.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'Domain source materialization requires at least one source.');
  }
  const root = path.resolve(input.material_root);
  const apply = input.apply !== false;
  const entries = input.sources.map((source, index) => {
    const role = safeSegment(source.role ?? 'source_material');
    const body = source.kind === 'file' ? fs.readFileSync(path.resolve(source.source_path)) : source.text;
    const sha256 = fingerprintDomainSource(body);
    const sourceName = source.kind === 'file' ? path.basename(source.source_path) : `${source.label ?? `text-${index + 1}`}.txt`;
    const relativePath = path.posix.join(role, `${sha256.slice(0, 16)}-${safeSegment(sourceName)}`);
    const target = path.join(root, relativePath);
    if (apply) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
    return {
      source_kind: source.kind,
      source_role: role,
      label: source.label ?? sourceName,
      source_path: source.kind === 'file' ? path.resolve(source.source_path) : null,
      material_ref: `source-material:sha256:${sha256}`,
      fingerprint_ref: `sha256:${sha256}`,
      relative_path: relativePath,
      path: target,
      bytes: Buffer.byteLength(body),
      sha256,
      copied: apply,
    };
  });
  return {
    surface_kind: 'opl_domain_source_materialization',
    material_root: root,
    status: apply ? 'applied' : 'dry_run_ready',
    entries,
    refs: entries.flatMap((entry) => [entry.material_ref, entry.fingerprint_ref, entry.relative_path]),
    authority_boundary: {
      framework_can_copy_and_hash_source: true,
      framework_can_extract_source_semantics: false,
      framework_can_decide_source_readiness: false,
      framework_can_create_domain_blocker: false,
    },
  };
}
