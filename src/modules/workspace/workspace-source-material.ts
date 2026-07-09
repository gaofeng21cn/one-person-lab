import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { writeJsonArtifact } from './workspace-artifacts.ts';
import { readValidatedWorkspaceIndex } from './workspace-lifecycle.ts';

export type WorkspaceSourceIngestOptions = {
  workspacePath?: string;
  filePath?: string;
  projectId?: string;
  role?: string;
  title?: string;
  note?: string;
  dryRun?: boolean;
  apply?: boolean;
};

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizeSegment(value: string) {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'source-material';
}

function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function mimeTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.csv': 'text/csv',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[ext] ?? 'application/octet-stream';
}

export function ingestWorkspaceSourceMaterial(
  contracts: FrameworkContracts,
  options: WorkspaceSourceIngestOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const sourcePath = normalizeOptionalString(options.filePath);
  if (!sourcePath) {
    throw new FrameworkContractError('cli_usage_error', 'workspace source ingest requires --file.', {
      required: ['--file'],
    });
  }
  const absoluteSourcePath = path.resolve(sourcePath);
  if (!fs.existsSync(absoluteSourcePath) || !fs.statSync(absoluteSourcePath).isFile()) {
    throw new FrameworkContractError('cli_usage_error', 'workspace source ingest requires an existing file.', {
      file: absoluteSourcePath,
    });
  }

  const role = sanitizeSegment(normalizeOptionalString(options.role) ?? 'source_material');
  const projectId = normalizeOptionalString(options.projectId);
  const project = projectId
    ? context.projects.find((entry) => entry.project_id === projectId)
    : null;
  if (projectId && !project) {
    throw new FrameworkContractError('cli_usage_error', 'workspace source ingest project id is not indexed.', {
      project_id: projectId,
    });
  }

  const stat = fs.statSync(absoluteSourcePath);
  const digest = sha256File(absoluteSourcePath);
  const basename = sanitizeSegment(path.basename(absoluteSourcePath));
  const sourceCopyRef = path.posix.join('shared/sources/source_materials', role, `${digest.slice(0, 16)}-${basename}`);
  const receiptRef = path.posix.join('control/opl/source_materials', `${digest}.json`);
  const sourceCopyPath = path.join(context.workspacePath, sourceCopyRef);
  const receiptPath = path.join(context.workspacePath, receiptRef);
  const apply = options.apply === true && options.dryRun !== true;
  const payload = {
    surface_kind: 'opl_workspace_source_material_receipt',
    version: 'workspace-source-material.v1',
    source_material_ref: `source-material:sha256:${digest}`,
    source_material_role: role,
    title: normalizeOptionalString(options.title) ?? path.basename(absoluteSourcePath),
    note: normalizeOptionalString(options.note),
    workspace_path: context.workspacePath,
    workspace_index_path: context.workspaceIndexPath,
    project_id: projectId,
    project_root: project?.project_root ?? null,
    original_file: {
      path: absoluteSourcePath,
      basename: path.basename(absoluteSourcePath),
      mime_type: mimeTypeFor(absoluteSourcePath),
      bytes: stat.size,
      sha256: digest,
      mtime: stat.mtime.toISOString(),
    },
    stored_file: {
      ref: sourceCopyRef,
      path: sourceCopyPath,
      copied: apply,
    },
    receipt_ref: receiptRef,
    receipt_path: receiptPath,
    handoff_refs: [
      `source-material:sha256:${digest}`,
      receiptRef,
      sourceCopyRef,
    ],
    extraction_policy: {
      codex_cli_can_read_source_ref: true,
      extraction_can_be_requested_by_domain_stage: true,
      extraction_owner: 'stage_or_domain_agent',
      framework_extracts_semantics: false,
    },
    authority_boundary: {
      source_ingest_is_refs_only: true,
      opl_can_copy_source_file: true,
      opl_can_hash_source_file: true,
      opl_can_extract_source_semantics: false,
      opl_can_write_domain_truth: false,
      opl_can_mutate_artifact_body: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
      receipt_is_not_domain_acceptance: true,
    },
  };

  if (apply) {
    fs.mkdirSync(path.dirname(sourceCopyPath), { recursive: true });
    fs.copyFileSync(absoluteSourcePath, sourceCopyPath);
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    writeJsonArtifact(receiptPath, payload);
  }

  const { surface_kind: receiptSurfaceKind, ...receiptPayload } = payload;
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_source_ingest: {
      status: apply ? 'applied' : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      ...receiptPayload,
      receipt_surface_kind: receiptSurfaceKind,
      surface_kind: 'opl_workspace_source_ingest',
    },
  };
}
