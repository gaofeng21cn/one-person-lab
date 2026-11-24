import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type ProofDirectoryIndexEntry = {
  relative_path: string;
  bytes: number;
  sha256: string;
};

export type ProofDirectoryIndexOptions = {
  excludePaths?: string[];
  surfaceKind?: string;
  status?: string;
  authorityBoundary?: Record<string, unknown>;
};

export type RunPackProofIndexInput = {
  outputDir: string;
  excludePaths?: string[];
  writePath?: string;
};

const DEFAULT_AUTHORITY_BOUNDARY = {
  can_write_domain_truth: false,
  can_authorize_review_or_export: false,
  can_sign_owner_receipt: false,
  can_claim_domain_ready: false,
};

function normalizePosixRelative(rawPath: string): string {
  return rawPath.replaceAll('\\', '/').replace(/^\.\//, '');
}

/** Deterministically walk regular non-symlink files under rootDir and digest each file. */
export function buildProofDirectoryIndex(
  rootDir: string,
  options: ProofDirectoryIndexOptions = {},
) {
  const resolvedRoot = path.resolve(rootDir);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new FrameworkContractError('contract_shape_invalid', `Proof output directory does not exist: ${resolvedRoot}.`, {
      surface: 'opl_pack_proof_index',
      output_dir: resolvedRoot,
    });
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const excluded = new Set((options.excludePaths ?? []).map(normalizePosixRelative));
  const entries: ProofDirectoryIndexEntry[] = [];

  const visit = (directory: string) => {
    const dirEntries = fs.readdirSync(directory, { withFileTypes: true });
    dirEntries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of dirEntries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(realRoot, absolutePath).split(path.sep).join('/');
      if (excluded.has(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const bytes = fs.readFileSync(absolutePath);
      entries.push({
        relative_path: relativePath,
        bytes: bytes.byteLength,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      });
    }
  };

  visit(realRoot);
  entries.sort((left, right) =>
    left.relative_path < right.relative_path ? -1 : left.relative_path > right.relative_path ? 1 : 0,
  );

  return {
    surface_kind: options.surfaceKind ?? 'opl_proof_directory_index',
    status: options.status ?? 'developer_evidence_only',
    root_dir: realRoot,
    entries,
    entry_count: entries.length,
    authority_boundary: options.authorityBoundary ?? { ...DEFAULT_AUTHORITY_BOUNDARY },
  };
}

function writeJsonAtomic(filePath: string, payload: unknown) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/** Build a deterministic proof directory SHA-256 index and optionally persist it atomically. */
export function runPackProofIndex(input: RunPackProofIndexInput) {
  const resolvedRoot = path.resolve(input.outputDir);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new FrameworkContractError('contract_shape_invalid', `Proof output directory does not exist: ${resolvedRoot}.`, {
      surface: 'opl_pack_proof_index',
      output_dir: resolvedRoot,
    });
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const excludes = new Set((input.excludePaths ?? []).map(normalizePosixRelative));
  let writtenPath: string | null = null;
  if (input.writePath) {
    writtenPath = path.resolve(input.writePath);
    const parentReal = fs.existsSync(path.dirname(writtenPath))
      ? fs.realpathSync(path.dirname(writtenPath))
      : path.dirname(writtenPath);
    const normalizedWriteTarget = path.join(parentReal, path.basename(writtenPath));
    const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
    if (normalizedWriteTarget.startsWith(rootWithSep)) {
      const rel = path.relative(realRoot, normalizedWriteTarget).split(path.sep).join('/');
      excludes.add(rel);
    }
  }
  const excludedPaths = [...excludes].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const indexPayload = buildProofDirectoryIndex(realRoot, { excludePaths: excludedPaths });
  if (writtenPath) {
    writeJsonAtomic(writtenPath, indexPayload);
  }
  return {
    version: 'g2',
    pack_proof_index: {
      ...indexPayload,
      excluded_paths: excludedPaths,
      written_path: writtenPath,
    },
  };
}
