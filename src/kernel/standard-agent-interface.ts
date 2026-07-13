import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from './contract-validation.ts';
import { parseJsonText } from './json-file.ts';
import { resolveStandardAgent } from './standard-agent-registry.ts';

export const STANDARD_AGENT_INTERFACE_VERSION = 'opl_standard_agent_interface.v1' as const;
export const STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH = 'contracts/domain_descriptor.json' as const;

export type StandardAgentLocatorField =
  | 'workspace_root'
  | 'workspace_path'
  | 'profile_ref'
  | 'input_path';

export type StandardAgentInventoryProjection = {
  source_kind: 'workspace_relative_json';
  relative_path: string;
  items_pointer: string;
  field_map: {
    display_name?: string;
    work_item_id: string;
    work_item_root: string;
    business_status: string;
    current_stage_id: string;
    current_stage_status: string;
    package_status: string;
    lifecycle_ref: string;
  };
};

export type StandardAgentInterface = {
  version: typeof STANDARD_AGENT_INTERFACE_VERSION;
  inventory_projection: StandardAgentInventoryProjection | null;
  workspace_binding: {
    locator_surface_kind: string;
    default_profile_id: 'one_off' | 'series' | 'portfolio';
    workspace_kind: string;
    project_kind: string;
    project_collection_label: string;
    default_workspace_id: string;
    default_project_id: string;
    required_locator_fields: StandardAgentLocatorField[];
    optional_locator_fields: StandardAgentLocatorField[];
    entry_command_template: string[] | null;
    manifest_command_template: string[] | null;
  };
  runtime: {
    runtime_domain_id: string;
    dispatch_command: string[] | null;
    registration_ref: string | null;
  };
  progress: {
    deliverable_delta_aliases: string[];
    platform_delta_aliases: string[];
  };
  routing: {
    explicit_aliases: string[];
    workstream_ids: string[];
    intent_signals: string[];
    ambiguity_policy: string;
  };
};

export type StandardAgentDescriptorInterface = {
  repo_dir: string;
  domain_id: string;
  interface: StandardAgentInterface;
};

const LOCATOR_FIELDS = new Set<StandardAgentLocatorField>([
  'workspace_root',
  'workspace_path',
  'profile_ref',
  'input_path',
]);
const TEMPLATE_PLACEHOLDER = /^\{(workspace_root|workspace_path|profile_ref|input_path)\}$/;
const INVENTORY_FIELD_KEYS = [
  'work_item_id',
  'work_item_root',
  'business_status',
  'current_stage_id',
  'current_stage_status',
  'package_status',
  'lifecycle_ref',
] as const;
const OPTIONAL_INVENTORY_FIELD_KEYS = ['display_name'] as const;

function invalid(message: string, sourceRef: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    source_ref: sourceRef,
    ...details,
  });
}

function stringValue(value: unknown, field: string, sourceRef: string) {
  if (typeof value !== 'string' || !value.trim()) {
    invalid(`Standard Agent interface field ${field} must be a non-empty string.`, sourceRef, { field });
  }
  return value.trim();
}

function stringArray(value: unknown, field: string, sourceRef: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    invalid(`Standard Agent interface field ${field} must be an array of non-empty strings.`, sourceRef, { field });
  }
  return [...new Set(value.map((entry) => String(entry).trim()))];
}

function locatorFields(value: unknown, field: string, sourceRef: string) {
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

function commandTemplate(value: unknown, field: string, sourceRef: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    invalid(`Standard Agent interface field ${field} must be an array of non-empty command tokens.`, sourceRef, { field });
  }
  const tokens = value.map((entry) => String(entry).trim());
  if (tokens.length === 0) {
    invalid(`Standard Agent interface field ${field} must contain at least one command token.`, sourceRef, { field });
  }
  for (const token of tokens) {
    if (token.includes('{') || token.includes('}')) {
      if (!TEMPLATE_PLACEHOLDER.test(token)) {
        invalid(`Standard Agent interface field ${field} contains an unsupported placeholder.`, sourceRef, {
          field,
          token,
        });
      }
    } else if (!/^[A-Za-z0-9_./:@%+=,-]+$/.test(token)) {
      invalid(`Standard Agent interface field ${field} contains an unsafe literal command token.`, sourceRef, {
        field,
        token,
      });
    }
  }
  return tokens;
}

function optionalCommandTemplate(value: unknown, field: string, sourceRef: string) {
  return value === null ? null : commandTemplate(value, field, sourceRef);
}

function inventoryProjection(value: unknown, sourceRef: string): StandardAgentInventoryProjection | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    invalid('Standard Agent interface field inventory_projection must be an object.', sourceRef, {
      field: 'inventory_projection',
    });
  }
  assertKnownKeys(
    value,
    ['source_kind', 'relative_path', 'items_pointer', 'field_map'],
    'inventory_projection',
    sourceRef,
  );
  if (value.source_kind !== 'workspace_relative_json') {
    invalid('Standard Agent interface inventory_projection source_kind is unsupported.', sourceRef, {
      field: 'inventory_projection.source_kind',
      actual: value.source_kind ?? null,
    });
  }
  const relativePath = stringValue(
    value.relative_path,
    'inventory_projection.relative_path',
    sourceRef,
  );
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
    invalid('Standard Agent interface inventory_projection relative_path must stay inside the workspace.', sourceRef, {
      field: 'inventory_projection.relative_path',
      relative_path: relativePath,
    });
  }
  const itemsPointer = stringValue(
    value.items_pointer,
    'inventory_projection.items_pointer',
    sourceRef,
  );
  if (!itemsPointer.startsWith('/')) {
    invalid('Standard Agent interface inventory_projection items_pointer must be an absolute JSON Pointer.', sourceRef, {
      field: 'inventory_projection.items_pointer',
      items_pointer: itemsPointer,
    });
  }
  const fieldMap = value.field_map;
  if (!isRecord(fieldMap)) {
    invalid('Standard Agent interface inventory_projection field_map must be an object.', sourceRef, {
      field: 'inventory_projection.field_map',
    });
  }
  assertKnownKeys(
    fieldMap,
    [...INVENTORY_FIELD_KEYS, ...OPTIONAL_INVENTORY_FIELD_KEYS],
    'inventory_projection.field_map',
    sourceRef,
  );
  const missing = INVENTORY_FIELD_KEYS.filter((field) => !(field in fieldMap));
  if (missing.length > 0) {
    invalid('Standard Agent interface inventory_projection field_map is incomplete.', sourceRef, {
      field: 'inventory_projection.field_map',
      missing,
    });
  }
  return {
    source_kind: 'workspace_relative_json',
    relative_path: relativePath,
    items_pointer: itemsPointer,
    field_map: {
      ...Object.fromEntries(INVENTORY_FIELD_KEYS.map((field) => [
        field,
        stringValue(fieldMap[field], `inventory_projection.field_map.${field}`, sourceRef),
      ])),
      ...(fieldMap.display_name === undefined
        ? {}
        : {
            display_name: stringValue(
              fieldMap.display_name,
              'inventory_projection.field_map.display_name',
              sourceRef,
            ),
          }),
    } as StandardAgentInventoryProjection['field_map'],
  };
}

export function parseStandardAgentInterface(value: unknown, sourceRef: string): StandardAgentInterface {
  if (!isRecord(value)) invalid('Standard Agent interface must be an object.', sourceRef);
  if (value.version !== STANDARD_AGENT_INTERFACE_VERSION) {
    invalid('Standard Agent interface version is unsupported.', sourceRef, {
      expected: STANDARD_AGENT_INTERFACE_VERSION,
      actual: value.version ?? null,
    });
  }
  const workspaceBinding = value.workspace_binding;
  const runtime = value.runtime;
  const progress = value.progress;
  const routing = value.routing;
  if (!isRecord(workspaceBinding) || !isRecord(runtime) || !isRecord(progress) || !isRecord(routing)) {
    invalid('Standard Agent interface must declare workspace_binding, runtime, progress, and routing objects.', sourceRef);
  }
  assertKnownKeys(
    value,
    ['version', 'inventory_projection', 'workspace_binding', 'runtime', 'progress', 'routing'],
    'root',
    sourceRef,
  );
  assertKnownKeys(workspaceBinding, [
    'locator_surface_kind',
    'default_profile_id',
    'workspace_kind',
    'project_kind',
    'project_collection_label',
    'default_workspace_id',
    'default_project_id',
    'required_locator_fields',
    'optional_locator_fields',
    'entry_command_template',
    'manifest_command_template',
  ], 'workspace_binding', sourceRef);
  assertKnownKeys(runtime, ['runtime_domain_id', 'dispatch_command', 'registration_ref'], 'runtime', sourceRef);
  assertKnownKeys(progress, ['deliverable_delta_aliases', 'platform_delta_aliases'], 'progress', sourceRef);
  assertKnownKeys(routing, [
    'explicit_aliases',
    'workstream_ids',
    'intent_signals',
    'ambiguity_policy',
  ], 'routing', sourceRef);

  const requiredLocatorFields = locatorFields(
    workspaceBinding.required_locator_fields,
    'workspace_binding.required_locator_fields',
    sourceRef,
  );
  const optionalLocatorFields = locatorFields(
    workspaceBinding.optional_locator_fields,
    'workspace_binding.optional_locator_fields',
    sourceRef,
  );
  const overlap = requiredLocatorFields.filter((field) => optionalLocatorFields.includes(field));
  if (overlap.length > 0) {
    invalid('Standard Agent interface locator fields cannot be both required and optional.', sourceRef, { overlap });
  }

  const dispatchCommand = runtime.dispatch_command === null
    ? null
    : commandTemplate(runtime.dispatch_command, 'runtime.dispatch_command', sourceRef);
  const registrationRef = runtime.registration_ref === null
    ? null
    : stringValue(runtime.registration_ref, 'runtime.registration_ref', sourceRef);
  const defaultProfileId = stringValue(
    workspaceBinding.default_profile_id,
    'workspace_binding.default_profile_id',
    sourceRef,
  );
  if (!['one_off', 'series', 'portfolio'].includes(defaultProfileId)) {
    invalid('Standard Agent interface workspace default_profile_id is unsupported.', sourceRef, {
      default_profile_id: defaultProfileId,
    });
  }
  const declaredLocatorFields = new Set([
    ...requiredLocatorFields,
    ...optionalLocatorFields,
    'workspace_path' as const,
  ]);
  for (const [field, template] of [
    ['workspace_binding.entry_command_template', workspaceBinding.entry_command_template],
    ['workspace_binding.manifest_command_template', workspaceBinding.manifest_command_template],
  ] as const) {
    if (!Array.isArray(template)) continue;
    for (const token of template) {
      const match = TEMPLATE_PLACEHOLDER.exec(String(token));
      if (match && !declaredLocatorFields.has(match[1] as StandardAgentLocatorField)) {
        invalid(`Standard Agent interface field ${field} references an undeclared locator field.`, sourceRef, {
          field,
          locator_field: match[1],
        });
      }
    }
  }

  const workstreamIds = stringArray(routing.workstream_ids, 'routing.workstream_ids', sourceRef);
  if (workstreamIds.length > 1) {
    invalid('Standard Agent interface v1 supports at most one admitted workstream per Agent.', sourceRef, {
      workstream_ids: workstreamIds,
    });
  }
  return {
    version: STANDARD_AGENT_INTERFACE_VERSION,
    inventory_projection: inventoryProjection(value.inventory_projection, sourceRef),
    workspace_binding: {
      locator_surface_kind: stringValue(
        workspaceBinding.locator_surface_kind,
        'workspace_binding.locator_surface_kind',
        sourceRef,
      ),
      default_profile_id: defaultProfileId as StandardAgentInterface['workspace_binding']['default_profile_id'],
      workspace_kind: stringValue(workspaceBinding.workspace_kind, 'workspace_binding.workspace_kind', sourceRef),
      project_kind: stringValue(workspaceBinding.project_kind, 'workspace_binding.project_kind', sourceRef),
      project_collection_label: stringValue(
        workspaceBinding.project_collection_label,
        'workspace_binding.project_collection_label',
        sourceRef,
      ),
      default_workspace_id: stringValue(
        workspaceBinding.default_workspace_id,
        'workspace_binding.default_workspace_id',
        sourceRef,
      ),
      default_project_id: stringValue(
        workspaceBinding.default_project_id,
        'workspace_binding.default_project_id',
        sourceRef,
      ),
      required_locator_fields: requiredLocatorFields,
      optional_locator_fields: optionalLocatorFields,
      entry_command_template: optionalCommandTemplate(
        workspaceBinding.entry_command_template,
        'workspace_binding.entry_command_template',
        sourceRef,
      ),
      manifest_command_template: optionalCommandTemplate(
        workspaceBinding.manifest_command_template,
        'workspace_binding.manifest_command_template',
        sourceRef,
      ),
    },
    runtime: {
      runtime_domain_id: stringValue(runtime.runtime_domain_id, 'runtime.runtime_domain_id', sourceRef),
      dispatch_command: dispatchCommand,
      registration_ref: registrationRef,
    },
    progress: {
      deliverable_delta_aliases: stringArray(
        progress.deliverable_delta_aliases,
        'progress.deliverable_delta_aliases',
        sourceRef,
      ),
      platform_delta_aliases: stringArray(
        progress.platform_delta_aliases,
        'progress.platform_delta_aliases',
        sourceRef,
      ),
    },
    routing: {
      explicit_aliases: stringArray(routing.explicit_aliases, 'routing.explicit_aliases', sourceRef),
      workstream_ids: workstreamIds,
      intent_signals: stringArray(routing.intent_signals, 'routing.intent_signals', sourceRef),
      ambiguity_policy: stringValue(routing.ambiguity_policy, 'routing.ambiguity_policy', sourceRef),
    },
  };
}

function assertKnownKeys(
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

function descriptorInterfacePayload(
  repoDir: string,
  descriptorPath: string,
  descriptor: Record<string, unknown>,
) {
  const declared = descriptor.standard_agent_interface;
  if (declared === undefined) return null;
  if (
    isRecord(declared)
    && declared.ref_kind === 'repo_json_pointer'
    && typeof declared.ref === 'string'
  ) {
    const [relativePath, pointer = ''] = declared.ref.split('#', 2);
    const interfacePath = path.resolve(repoDir, relativePath);
    const resolvedRepoDir = path.resolve(repoDir);
    if (interfacePath !== resolvedRepoDir && !interfacePath.startsWith(`${resolvedRepoDir}${path.sep}`)) {
      invalid('Standard Agent interface ref must stay inside the domain repo.', descriptorPath, {
        ref: declared.ref,
      });
    }
    if (!fs.existsSync(interfacePath)) {
      invalid('Standard Agent interface ref does not resolve to a file.', descriptorPath, {
        ref: declared.ref,
      });
    }
    let payload: unknown = parseJsonText(fs.readFileSync(interfacePath, 'utf8'));
    for (const segment of pointer.replace(/^\//, '').split('/').filter(Boolean)) {
      const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!isRecord(payload) || !(key in payload)) {
        invalid('Standard Agent interface JSON pointer does not resolve.', descriptorPath, {
          ref: declared.ref,
          segment: key,
        });
      }
      payload = payload[key];
    }
    return { payload, source_ref: `${interfacePath}#${pointer}` };
  }
  return { payload: declared, source_ref: `${descriptorPath}#/standard_agent_interface` };
}

export function readStandardAgentDescriptorInterface(repoDir: string): StandardAgentDescriptorInterface | null {
  const descriptorPath = path.join(repoDir, STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH);
  if (!fs.existsSync(descriptorPath)) return null;
  const descriptor = parseJsonText(fs.readFileSync(descriptorPath, 'utf8'));
  if (!isRecord(descriptor)) return null;
  const resolved = descriptorInterfacePayload(repoDir, descriptorPath, descriptor);
  if (!resolved) return null;
  return {
    repo_dir: path.resolve(repoDir),
    domain_id: stringValue(descriptor.domain_id, 'domain_id', descriptorPath),
    interface: parseStandardAgentInterface(resolved.payload, resolved.source_ref),
  };
}

export function readStandardAgentInterface(repoDir: string): StandardAgentInterface | null {
  return readStandardAgentDescriptorInterface(repoDir)?.interface ?? null;
}

function normalizedIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function assertStandardAgentDescriptorIdentity(
  descriptor: StandardAgentDescriptorInterface,
  expected: { project: string; domain_id?: string | null },
) {
  const registryEntry = resolveStandardAgent(expected.domain_id ?? '')
    ?? resolveStandardAgent(expected.project);
  const accepted = [
    expected.project,
    expected.domain_id ?? '',
    ...(registryEntry
      ? [
          registryEntry.agent_id,
          registryEntry.domain_id,
          registryEntry.target_domain_id,
          registryEntry.project,
          registryEntry.plugin_name,
          registryEntry.canonical_plugin_name,
          ...registryEntry.aliases,
        ]
      : []),
  ].map(normalizedIdentity).filter(Boolean);
  if (!accepted.includes(normalizedIdentity(descriptor.domain_id))) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Standard Agent descriptor identity does not match the selected project.',
      {
        descriptor_domain_id: descriptor.domain_id,
        expected_project: expected.project,
        expected_domain_id: expected.domain_id ?? null,
        repo_dir: descriptor.repo_dir,
      },
    );
  }
  return descriptor;
}

export function materializeStandardAgentCommand(
  template: readonly string[],
  locator: Partial<Record<StandardAgentLocatorField, string | null>>,
) {
  return template.map((token) => {
    const match = TEMPLATE_PLACEHOLDER.exec(token);
    if (!match) return token;
    const field = match[1] as StandardAgentLocatorField;
    const value = locator[field]?.trim();
    if (!value) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Standard Agent command template requires a missing workspace locator field.',
        { field, template },
      );
    }
    return value;
  });
}
