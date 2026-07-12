import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from './contract-validation.ts';
import { parseJsonText } from './json-file.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

export const STANDARD_AGENT_INTERFACE_VERSION = 'opl_standard_agent_interface.v1' as const;
export const STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH = 'contracts/domain_descriptor.json' as const;

export type StandardAgentLocatorField =
  | 'workspace_root'
  | 'workspace_path'
  | 'profile_ref'
  | 'input_path';

export type StandardAgentInterface = {
  version: typeof STANDARD_AGENT_INTERFACE_VERSION;
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
  assertKnownKeys(value, ['version', 'workspace_binding', 'runtime', 'progress', 'routing'], 'root', sourceRef);
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
  const accepted = [expected.project, expected.domain_id ?? ''].map(normalizedIdentity).filter(Boolean);
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

function packageManagedStandardAgentDescriptors(
  packageIds?: readonly string[],
) {
  const lockPath = resolveOplStatePaths().agent_package_lock_file;
  if (!fs.existsSync(lockPath)) return [];
  const lockIndex = parseJsonText(fs.readFileSync(lockPath, 'utf8'));
  if (!isRecord(lockIndex) || !Array.isArray(lockIndex.packages)) return [];
  const accepted = packageIds ? new Set(packageIds.map(normalizedIdentity)) : null;
  const descriptors: StandardAgentDescriptorInterface[] = [];
  for (const value of lockIndex.packages) {
    if (!isRecord(value)) continue;
    const packageIdentity = [value.package_id, value.agent_id]
      .filter((entry): entry is string => typeof entry === 'string')
      .map(normalizedIdentity);
    if (accepted && !packageIdentity.some((entry) => accepted.has(entry))) continue;
    const managedSource = isRecord(value.managed_runtime_source) ? value.managed_runtime_source : null;
    const physicalSurface = isRecord(value.physical_surface) ? value.physical_surface : null;
    const candidates = [
      managedSource?.status === 'current' && typeof managedSource.checkout_path === 'string'
        ? managedSource.checkout_path
        : null,
      typeof physicalSurface?.plugin_source_path === 'string'
        ? physicalSurface.plugin_source_path
        : null,
    ].filter((entry): entry is string => Boolean(entry));
    for (const candidate of candidates) {
      const descriptor = readStandardAgentDescriptorInterface(candidate);
      if (descriptor) descriptors.push(descriptor);
    }
  }
  return descriptors;
}

export function readPackageManagedStandardAgentDescriptor(
  packageIds: readonly string[],
): StandardAgentDescriptorInterface | null {
  return packageManagedStandardAgentDescriptors(packageIds)[0] ?? null;
}

export function readStandardAgentDescriptorForDomain(
  domainId: string,
): StandardAgentDescriptorInterface | null {
  const target = normalizedIdentity(domainId);
  const managed = packageManagedStandardAgentDescriptors().find((descriptor) =>
    [descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id]
      .map(normalizedIdentity)
      .includes(target)
  );
  if (managed) return managed;

  const configuredRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim();
  if (!configuredRoot || !fs.existsSync(configuredRoot)) return null;
  for (const entry of fs.readdirSync(configuredRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const descriptor = readStandardAgentDescriptorInterface(path.join(configuredRoot, entry.name));
    if (
      descriptor
      && [descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id]
        .map(normalizedIdentity)
        .includes(target)
    ) return descriptor;
  }
  return null;
}

export function standardAgentProgressDeltaKeys(
  domainId: string,
  kind: 'deliverable' | 'platform',
) {
  const aliases = readStandardAgentDescriptorForDomain(domainId)?.interface.progress;
  return kind === 'deliverable'
    ? ['deliverable_progress_delta', ...(aliases?.deliverable_delta_aliases ?? [])]
    : ['platform_repair_delta', ...(aliases?.platform_delta_aliases ?? [])];
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
