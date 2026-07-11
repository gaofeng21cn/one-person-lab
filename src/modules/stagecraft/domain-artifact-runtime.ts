import fs from 'node:fs';
import path from 'node:path';

import {
  fileHash,
  listRelativeFiles,
  openStageArtifactAttemptRuntime,
  safeRelativePath,
  type StageArtifactAttemptLocator,
} from './stage-artifact-runtime-core.ts';

export type DomainArtifactRole = 'output' | 'evidence' | 'receipt';

function roleDir(opened: ReturnType<typeof openStageArtifactAttemptRuntime>, role: DomainArtifactRole) {
  if (role === 'output') return opened.attempt_workspace.outputs_dir;
  if (role === 'evidence') return opened.attempt_workspace.evidence_dir;
  return opened.attempt_workspace.receipts_dir;
}

export function writeDomainArtifact(input: StageArtifactAttemptLocator & {
  role: DomainArtifactRole;
  relative_path: string;
  body: string | Uint8Array;
}) {
  const opened = openStageArtifactAttemptRuntime(input);
  const relativePath = safeRelativePath(input.relative_path, 'relative_path');
  const file = path.join(roleDir(opened, input.role), relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, input.body);
  return {
    surface_kind: 'opl_domain_artifact_write_receipt',
    role: input.role,
    relative_path: relativePath,
    file,
    sha256: fileHash(file),
    bytes: fs.statSync(file).size,
    attempt: opened,
    authority_boundary: {
      write_requires_domain_authorization: true,
      framework_writes_bytes_only: true,
      framework_can_claim_domain_quality: false,
    },
  };
}

export function readDomainArtifact(input: StageArtifactAttemptLocator & {
  role: DomainArtifactRole;
  relative_path: string;
  encoding?: BufferEncoding | null;
}) {
  const opened = openStageArtifactAttemptRuntime(input);
  const relativePath = safeRelativePath(input.relative_path, 'relative_path');
  const file = path.join(roleDir(opened, input.role), relativePath);
  const body = input.encoding === null ? fs.readFileSync(file) : fs.readFileSync(file, input.encoding ?? 'utf8');
  return { file, relative_path: relativePath, role: input.role, body, sha256: fileHash(file) };
}

export function buildDomainArtifactIndex(locator: StageArtifactAttemptLocator) {
  const opened = openStageArtifactAttemptRuntime(locator);
  const entries = (['output', 'evidence', 'receipt'] as const).flatMap((role) => {
    const root = roleDir(opened, role);
    return listRelativeFiles(root).map((relativePath) => {
      const file = path.join(root, relativePath);
      return { role, relative_path: relativePath, file, sha256: fileHash(file), bytes: fs.statSync(file).size };
    });
  });
  return {
    surface_kind: 'opl_domain_artifact_index',
    locator: opened.locator,
    entries,
    refs: entries.map((entry) => `${entry.role}:${entry.relative_path}`),
    authority_boundary: {
      index_is_refs_only: true,
      index_is_not_domain_verdict: true,
      index_is_not_owner_receipt: true,
    },
  };
}
