import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  assertStandardAgentDescriptorIdentity,
  readStandardAgentDescriptorInterface,
  type StandardAgentInterface,
  type StandardAgentLocatorField,
} from '../../../kernel/standard-agent-interface.ts';
import { readAgentPackageReadinessPort } from '../../../kernel/agent-package-readiness-port.ts';
import { normalizeOptionalString } from './registry-io.ts';
import type { BoundWorkspaceLocator } from './types.ts';

export function normalizeWorkspaceBindingPath(workspacePath: string) {
  return path.resolve(workspacePath);
}

export function normalizeWorkspacePath(workspacePath: string) {
  const absolutePath = normalizeWorkspaceBindingPath(workspacePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Workspace registry commands require an existing workspace directory.',
      {
        workspace_path: absolutePath,
      },
    );
  }

  return absolutePath;
}

function normalizeExistingFilePath(filePath: string | undefined, field: string) {
  const normalized = normalizeOptionalString(filePath);
  if (!normalized) {
    return null;
  }

  const absolutePath = path.resolve(normalized);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Workspace registry locator field ${field} requires an existing file path.`,
      {
        field,
        value: absolutePath,
      },
    );
  }

  return absolutePath;
}

function normalizeExistingDirectoryPath(directoryPath: string | undefined, field: string) {
  const normalized = normalizeOptionalString(directoryPath);
  if (!normalized) {
    return null;
  }

  const absolutePath = path.resolve(normalized);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Workspace registry locator field ${field} requires an existing directory.`,
      {
        field,
        value: absolutePath,
      },
    );
  }

  return absolutePath;
}

export function resolveStandardAgentInterfaceForWorkspace(
  projectId: string,
  project: string,
  workspacePath: string | null | undefined,
  workspaceRoot?: string | null,
) {
  const packageManaged = readAgentPackageReadinessPort()
    ?.readPackageManagedStandardAgentDescriptor?.([projectId, project]) ?? null;
  if (packageManaged) {
    const descriptor = assertStandardAgentDescriptorIdentity(packageManaged, {
      project,
      domain_id: projectId,
    });
    return { descriptor: descriptor.interface, repo_dir: descriptor.repo_dir, source: 'package_lock' as const };
  }
  const configuredFamilyRoot = normalizeOptionalString(process.env.OPL_FAMILY_WORKSPACE_ROOT);
  const candidates = [
    normalizeOptionalString(workspaceRoot),
    normalizeOptionalString(workspacePath),
    configuredFamilyRoot ? path.join(configuredFamilyRoot, project) : null,
  ].filter((entry): entry is string => Boolean(entry));

  for (const candidate of [...new Set(candidates.map((entry) => path.resolve(entry)))]) {
    const candidateDescriptor = readStandardAgentDescriptorInterface(candidate);
    if (candidateDescriptor) {
      const descriptor = assertStandardAgentDescriptorIdentity(candidateDescriptor, {
        project,
        domain_id: projectId,
      });
      return { descriptor: descriptor.interface, repo_dir: candidate, source: 'explicit_workspace' as const };
    }
  }
  return null;
}

function validateProjectLocatorOptions(
  standardInterface: StandardAgentInterface | null,
  locatorOptions: {
    workspaceRoot?: string;
    profileRef?: string;
    inputPath?: string;
  },
) {
  const provided: Record<StandardAgentLocatorField, boolean> = {
    workspace_root: Boolean(normalizeOptionalString(locatorOptions.workspaceRoot)),
    workspace_path: false,
    profile_ref: Boolean(normalizeOptionalString(locatorOptions.profileRef)),
    input_path: Boolean(normalizeOptionalString(locatorOptions.inputPath)),
  };
  const accepted = new Set([
    ...(standardInterface?.workspace_binding.required_locator_fields ?? []),
    ...(standardInterface?.workspace_binding.optional_locator_fields ?? []),
    ...(!standardInterface ? ['workspace_root' as const] : []),
  ]);
  const unsupportedLocatorFields = Object.entries(provided)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .filter((key) => !accepted.has(key as StandardAgentLocatorField));

  if (unsupportedLocatorFields.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'The requested workspace locator fields are not supported for this project surface.',
      {
        descriptor_available: Boolean(standardInterface),
        unsupported_locator_fields: unsupportedLocatorFields,
      },
    );
  }
}

export function buildWorkspaceLocator(
  standardInterface: StandardAgentInterface | null,
  workspacePath: string,
  options: {
    workspaceRoot?: string;
    profileRef?: string;
    inputPath?: string;
  },
): BoundWorkspaceLocator | null {
  validateProjectLocatorOptions(standardInterface, options);
  if (!standardInterface) {
    const workspaceRoot = normalizeExistingDirectoryPath(options.workspaceRoot, 'workspace_root');
    return workspaceRoot
      ? {
          surface_kind: 'opl_standard_agent_workspace',
          workspace_root: workspaceRoot,
          profile_ref: null,
          input_path: null,
        }
      : null;
  }
  const accepted = new Set([
    ...standardInterface.workspace_binding.required_locator_fields,
    ...standardInterface.workspace_binding.optional_locator_fields,
  ]);
  const values: Record<StandardAgentLocatorField, string | null> = {
    workspace_path: workspacePath,
    workspace_root: accepted.has('workspace_root')
      ? normalizeExistingDirectoryPath(options.workspaceRoot, 'workspace_root') ?? workspacePath
      : null,
    profile_ref: accepted.has('profile_ref')
      ? normalizeExistingFilePath(options.profileRef, 'profile_ref')
      : null,
    input_path: accepted.has('input_path')
      ? normalizeExistingFilePath(options.inputPath, 'input_path')
      : null,
  };
  if (standardInterface.workspace_binding.required_locator_fields.some((field) => !values[field])) {
    return null;
  }
  return {
    surface_kind: standardInterface.workspace_binding.locator_surface_kind,
    workspace_root: values.workspace_root,
    profile_ref: values.profile_ref,
    input_path: values.input_path,
  };
}
