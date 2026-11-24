import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { resolveOplStatePaths, ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText, writeJsonPayloadFile } from '../../../kernel/json-file.ts';
import { deriveLegacyProjectScopeId } from '../execution-scope.ts';
import type {
  BoundWorkspaceLocator,
  WorkspaceBinding,
  WorkspaceRegistryFile,
} from './types.ts';

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeWorkspaceLocator(value: unknown): BoundWorkspaceLocator | null {
  if (!isRecord(value)) {
    return null;
  }

  const surfaceKind = normalizeOptionalString(
    typeof value.surface_kind === 'string' ? value.surface_kind : null,
  );
  if (!surfaceKind) {
    return null;
  }

  return {
    surface_kind: surfaceKind,
    workspace_root: normalizeOptionalString(
      typeof value.workspace_root === 'string' ? value.workspace_root : null,
    ),
    profile_ref: normalizeOptionalString(
      typeof value.profile_ref === 'string' ? value.profile_ref : null,
    ),
    input_path: normalizeOptionalString(
      typeof value.input_path === 'string' ? value.input_path : null,
    ),
  };
}

function normalizeWorkspaceBinding(binding: Partial<WorkspaceBinding>): WorkspaceBinding {
  const bindingId = String(binding.binding_id);
  const projectId = String(binding.project_id);
  const normalized: WorkspaceBinding = {
    binding_id: bindingId,
    project_scope_id: typeof binding.project_scope_id === 'string' && binding.project_scope_id.trim()
      ? binding.project_scope_id.trim()
      : deriveLegacyProjectScopeId({ bindingId, projectId }),
    project_id: projectId,
    project: String(binding.project),
    workspace_path: String(binding.workspace_path),
    label: normalizeOptionalString(String(binding.label ?? '')),
    status:
      binding.status === 'active' || binding.status === 'inactive' || binding.status === 'archived'
        ? binding.status
        : 'inactive',
    direct_entry: {
      command: normalizeOptionalString(binding.direct_entry?.command),
      manifest_command: normalizeOptionalString(binding.direct_entry?.manifest_command),
      url: normalizeOptionalString(binding.direct_entry?.url),
      workspace_locator: normalizeWorkspaceLocator(binding.direct_entry?.workspace_locator),
    },
    created_at: String(binding.created_at),
    updated_at: String(binding.updated_at),
    archived_at: binding.archived_at ? String(binding.archived_at) : null,
  };

  return normalized;
}

export function readWorkspaceRegistryFile(): WorkspaceRegistryFile {
  const paths = resolveOplStatePaths();
  if (!fs.existsSync(paths.workspace_registry_file)) {
    return {
      version: 'g2',
      bindings: [],
    };
  }

  try {
    const parsed = parseJsonText(fs.readFileSync(paths.workspace_registry_file, 'utf8')) as Partial<WorkspaceRegistryFile>;
    if (parsed.version !== 'g2' || !Array.isArray(parsed.bindings)) {
      throw new Error('Invalid workspace registry shape.');
    }

    return {
      version: 'g2',
      bindings: parsed.bindings.map(normalizeWorkspaceBinding),
    };
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing workspace registry file is invalid JSON or has an invalid shape.',
      {
        file: paths.workspace_registry_file,
        cause: error instanceof Error ? error.message : 'Unknown workspace registry parse failure.',
      },
    );
  }
}

export function writeWorkspaceRegistryFile(payload: WorkspaceRegistryFile) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.workspace_registry_file, payload);
}

export function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}
