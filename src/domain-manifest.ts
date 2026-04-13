import { spawnSync } from 'node:child_process';

import type { GatewayContracts } from './types.ts';
import { getActiveWorkspaceBinding, type WorkspaceBinding } from './workspace-registry.ts';

type JsonRecord = Record<string, unknown>;

export type DomainManifestStatus =
  | 'not_bound'
  | 'manifest_not_configured'
  | 'command_failed'
  | 'invalid_json'
  | 'invalid_manifest'
  | 'resolved';

export interface NormalizedDomainManifest {
  surface_kind: string;
  manifest_version: number | string | null;
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: {
    default: string;
    supported_protocols: string[];
    internal_surface: string | null;
  };
  workspace_locator: JsonRecord;
  runtime: JsonRecord | null;
  repo_mainline: JsonRecord | null;
  product_entry_status: {
    summary: string | null;
    next_focus: string[];
    remaining_gaps_count: number | null;
  } | null;
  operator_loop_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  recommended_shell: string | null;
  recommended_command: string | null;
  product_entry_shell: Record<string, JsonRecord>;
  shared_handoff: Record<string, JsonRecord>;
  remaining_gaps: string[];
  notes: string[];
}

export interface DomainManifestCatalogEntry {
  project_id: string;
  project: string;
  binding_id: string | null;
  workspace_path: string | null;
  manifest_command: string | null;
  status: DomainManifestStatus;
  manifest: NormalizedDomainManifest | null;
  error: {
    code: string;
    message: string;
    stdout: string | null;
    stderr: string | null;
  } | null;
}

type DomainManifestErrorCode = 'command_failed' | 'invalid_json' | 'invalid_manifest';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Missing required object field: ${field}`);
  }
  return value;
}

function normalizeRecordMap(value: unknown, field: string) {
  const record = requireRecord(value, field);
  const normalized: Record<string, JsonRecord> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (!isRecord(entry)) {
      throw new Error(`Field ${field}.${key} must be an object.`);
    }
    normalized[key] = entry;
  }

  return normalized;
}

function unwrapManifestPayload(payload: JsonRecord) {
  if (isRecord(payload.product_entry_manifest)) {
    return payload.product_entry_manifest;
  }
  return payload;
}

function normalizeManifest(payload: JsonRecord): NormalizedDomainManifest {
  const manifest = unwrapManifestPayload(payload);
  const formalEntry = requireRecord(manifest.formal_entry, 'formal_entry');
  const productEntryShell = normalizeRecordMap(manifest.product_entry_shell, 'product_entry_shell');
  const sharedHandoff = normalizeRecordMap(manifest.shared_handoff, 'shared_handoff');
  const recommendedShell = optionalString(manifest.recommended_shell);
  const explicitRecommendedCommand = optionalString(manifest.recommended_command);
  const derivedRecommendedCommand = recommendedShell
    ? optionalString(productEntryShell[recommendedShell]?.command)
    : null;
  const rawOperatorLoopSurface = isRecord(manifest.operator_loop_surface)
    ? manifest.operator_loop_surface
    : null;
  const operatorLoopShellKey = rawOperatorLoopSurface
    ? requireString(rawOperatorLoopSurface.shell_key, 'operator_loop_surface.shell_key')
    : null;
  const explicitOperatorLoopCommand = rawOperatorLoopSurface
    ? optionalString(rawOperatorLoopSurface.command)
    : null;
  const derivedOperatorLoopCommand = operatorLoopShellKey
    ? optionalString(productEntryShell[operatorLoopShellKey]?.command)
    : null;

  if (recommendedShell && !productEntryShell[recommendedShell]) {
    throw new Error(`recommended_shell points at unknown shell key: ${recommendedShell}`);
  }
  if (
    recommendedShell
    && explicitRecommendedCommand
    && derivedRecommendedCommand
    && explicitRecommendedCommand !== derivedRecommendedCommand
  ) {
    throw new Error('recommended_command must match the command declared by recommended_shell.');
  }
  if (operatorLoopShellKey && !productEntryShell[operatorLoopShellKey]) {
    throw new Error(`operator_loop_surface.shell_key points at unknown shell key: ${operatorLoopShellKey}`);
  }
  if (
    operatorLoopShellKey
    && explicitOperatorLoopCommand
    && derivedOperatorLoopCommand
    && explicitOperatorLoopCommand !== derivedOperatorLoopCommand
  ) {
    throw new Error('operator_loop_surface.command must match the command declared by operator_loop_surface.shell_key.');
  }
  const remainingGaps = readStringList(manifest.remaining_gaps);
  const rawProductEntryStatus = isRecord(manifest.product_entry_status) ? manifest.product_entry_status : null;

  return {
    surface_kind: optionalString(manifest.surface_kind) ?? 'product_entry_manifest',
    manifest_version:
      typeof manifest.manifest_version === 'number' || typeof manifest.manifest_version === 'string'
        ? manifest.manifest_version
        : typeof manifest.schema_version === 'number' || typeof manifest.schema_version === 'string'
          ? manifest.schema_version
          : null,
    manifest_kind: requireString(manifest.manifest_kind, 'manifest_kind'),
    target_domain_id: requireString(manifest.target_domain_id, 'target_domain_id'),
    formal_entry: {
      default: requireString(formalEntry.default, 'formal_entry.default'),
      supported_protocols: readStringList(formalEntry.supported_protocols),
      internal_surface: optionalString(formalEntry.internal_surface),
    },
    workspace_locator: requireRecord(manifest.workspace_locator, 'workspace_locator'),
    runtime: isRecord(manifest.runtime) ? manifest.runtime : null,
    repo_mainline: isRecord(manifest.repo_mainline) ? manifest.repo_mainline : null,
    product_entry_status: rawProductEntryStatus
      ? {
          summary: optionalString(rawProductEntryStatus.summary),
          next_focus: readStringList(rawProductEntryStatus.next_focus),
          remaining_gaps_count:
            typeof rawProductEntryStatus.remaining_gaps_count === 'number'
              ? rawProductEntryStatus.remaining_gaps_count
              : remainingGaps.length,
        }
      : null,
    operator_loop_surface: rawOperatorLoopSurface && operatorLoopShellKey
      ? {
          shell_key: operatorLoopShellKey,
          command: explicitOperatorLoopCommand ?? derivedOperatorLoopCommand,
          surface_kind:
            optionalString(rawOperatorLoopSurface.surface_kind)
            ?? optionalString(productEntryShell[operatorLoopShellKey]?.surface_kind),
          summary: optionalString(rawOperatorLoopSurface.summary),
          continuation_shell_key: optionalString(rawOperatorLoopSurface.continuation_shell_key),
          continuation_command: optionalString(rawOperatorLoopSurface.continuation_command),
        }
      : null,
    recommended_shell: recommendedShell,
    recommended_command: explicitRecommendedCommand ?? derivedRecommendedCommand,
    product_entry_shell: productEntryShell,
    shared_handoff: sharedHandoff,
    remaining_gaps: remainingGaps,
    notes: readStringList(manifest.notes),
  };
}

function buildCommandFailureEntry(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  code: DomainManifestErrorCode,
  message: string,
  stdout: string,
  stderr: string,
): DomainManifestCatalogEntry {
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: binding.direct_entry.manifest_command,
    status:
      code === 'invalid_json'
        ? 'invalid_json'
        : code === 'invalid_manifest'
          ? 'invalid_manifest'
          : 'command_failed',
    manifest: null,
    error: {
      code,
      message,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
    },
  };
}

function resolveBindingManifest(projectId: string, project: string, binding: WorkspaceBinding): DomainManifestCatalogEntry {
  const manifestCommand = binding.direct_entry.manifest_command;
  if (!manifestCommand) {
    return {
      project_id: projectId,
      project,
      binding_id: binding.binding_id,
      workspace_path: binding.workspace_path,
      manifest_command: null,
      status: 'manifest_not_configured',
      manifest: null,
      error: null,
    };
  }

  const result = spawnSync('/bin/zsh', ['-lc', manifestCommand], {
    cwd: binding.workspace_path,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error || (result.status ?? 1) !== 0) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'command_failed',
      'Domain manifest command failed.',
      result.stdout ?? '',
      result.stderr ?? result.error?.message ?? '',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout ?? '');
  } catch (error) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'invalid_json',
      error instanceof Error ? error.message : 'Manifest command did not return valid JSON.',
      result.stdout ?? '',
      result.stderr ?? '',
    );
  }

  try {
    if (!isRecord(parsed)) {
      throw new Error('Manifest payload must be a JSON object.');
    }

    return {
      project_id: projectId,
      project,
      binding_id: binding.binding_id,
      workspace_path: binding.workspace_path,
      manifest_command: manifestCommand,
      status: 'resolved',
      manifest: normalizeManifest(parsed),
      error: null,
    };
  } catch (error) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'invalid_manifest',
      error instanceof Error ? error.message : 'Manifest payload does not satisfy the minimum discovery contract.',
      result.stdout ?? '',
      result.stderr ?? '',
    );
  }
}

export function buildDomainManifestCatalog(contracts: GatewayContracts) {
  const projects = contracts.domains.domains.map((domain) => {
    const binding = getActiveWorkspaceBinding(domain.domain_id);
    if (!binding) {
      return {
        project_id: domain.domain_id,
        project: domain.project,
        binding_id: null,
        workspace_path: null,
        manifest_command: null,
        status: 'not_bound' as const,
        manifest: null,
        error: null,
      };
    }

    return resolveBindingManifest(domain.domain_id, domain.project, binding);
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    domain_manifests: {
      summary: {
        total_projects_count: projects.length,
        active_bindings_count: projects.filter((entry) => entry.binding_id !== null).length,
        manifest_configured_count: projects.filter((entry) => entry.manifest_command !== null).length,
        resolved_count: projects.filter((entry) => entry.status === 'resolved').length,
        failed_count: projects.filter((entry) =>
          entry.status === 'command_failed' || entry.status === 'invalid_json' || entry.status === 'invalid_manifest'
        ).length,
      },
      projects,
      notes: [
        'This surface executes the domain-owned manifest_command for active admitted-domain bindings only.',
        'workspace-catalog remains the non-executing registry; domain-manifests is the sibling discovery surface that resolves machine-readable product-entry manifests.',
      ],
    },
  };
}
