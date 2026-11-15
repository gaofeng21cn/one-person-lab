import path from 'node:path';
import { isRecord } from '../contract-validation.ts';
import type { StandardAgentLocatorField } from '../standard-agent-interface-types.ts';
import { invalid, stringValue, workspaceRelativePath, stringArray } from './validation-values.ts';

const LOCATOR_FIELDS = new Set<StandardAgentLocatorField>([
  'workspace_root',
  'workspace_path',
  'profile_ref',
  'input_path',
]);

export function parseWorkspaceSharedResources(value: unknown, sourceRef: string) {
  if (!Array.isArray(value)) {
    invalid('Standard Agent workspace shared_resources must be an array.', sourceRef);
  }
  const resources = value.map((entry, index) => {
    if (!isRecord(entry)) {
      invalid('Standard Agent workspace shared resource must be an object.', sourceRef, { index });
    }
    return {
      ...entry,
      path: workspaceRelativePath(entry.path, `workspace_binding.shared_resources[${index}].path`, sourceRef),
      role: stringValue(entry.role, `workspace_binding.shared_resources[${index}].role`, sourceRef),
    };
  });
  if (new Set(resources.map((entry) => entry.path)).size !== resources.length) {
    invalid('Standard Agent workspace shared resource paths must be unique.', sourceRef);
  }
  const memoryRoots = resources.filter((entry) => entry.role === 'memory_root');
  if (memoryRoots.length > 1) {
    invalid('Standard Agent workspace may declare at most one shared memory_root.', sourceRef, {
      memory_roots: memoryRoots.map((entry) => entry.path),
    });
  }
  return resources;
}

export function locatorFields(value: unknown, field: string, sourceRef: string) {
  const fields = stringArray(value, field, sourceRef);
  for (const locatorField of fields) {
    if (!LOCATOR_FIELDS.has(locatorField as StandardAgentLocatorField)) {
      invalid(`Standard Agent interface field ${field} contains an unsupported locator field.`, sourceRef, {
        field,
        locator_field: locatorField,
        allowed: [...LOCATOR_FIELDS],
      });
    }
  }
  return fields as StandardAgentLocatorField[];
}
