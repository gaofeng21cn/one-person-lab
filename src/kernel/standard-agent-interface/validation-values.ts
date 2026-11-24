import path from 'node:path';
import { FrameworkContractError } from '../contract-validation.ts';

export const STANDARD_AGENT_INTERFACE_VERSION = 'opl_standard_agent_interface.v1' as const;
export const STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH = 'contracts/domain_descriptor.json' as const;

export function invalid(message: string, sourceRef: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    source_ref: sourceRef,
    ...details,
  });
}

export function stringValue(value: unknown, field: string, sourceRef: string) {
  if (typeof value !== 'string' || !value.trim()) {
    invalid(`Standard Agent interface field ${field} must be a non-empty string.`, sourceRef, { field });
  }
  return value.trim();
}

export function workspaceRelativePath(value: unknown, field: string, sourceRef: string) {
  const relativePath = stringValue(value, field, sourceRef);
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    invalid(`Standard Agent interface field ${field} must be a canonical workspace-relative path.`, sourceRef, {
      field,
      relative_path: relativePath,
    });
  }
  return relativePath;
}

export function stringArray(value: unknown, field: string, sourceRef: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    invalid(`Standard Agent interface field ${field} must be an array of non-empty strings.`, sourceRef, { field });
  }
  return [...new Set(value.map((entry) => String(entry).trim()))];
}

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
  sourceRef: string,
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    invalid(`Standard Agent interface field ${field} contains unknown properties.`, sourceRef, {
      field,
      unknown,
    });
  }
}
