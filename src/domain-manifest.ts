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
  frontdesk_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  operator_loop_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  operator_loop_actions: Record<string, JsonRecord>;
  recommended_shell: string | null;
  recommended_command: string | null;
  product_entry_shell: Record<string, JsonRecord>;
  shared_handoff: Record<string, JsonRecord>;
  product_entry_overview: {
    surface_kind: string;
    summary: string | null;
    frontdesk_command: string | null;
    recommended_command: string | null;
    operator_loop_command: string | null;
    progress_surface: {
      surface_kind: string | null;
      command: string | null;
      step_id: string | null;
    } | null;
    resume_surface: {
      surface_kind: string | null;
      command: string | null;
      session_locator_field: string | null;
      checkpoint_locator_field: string | null;
    } | null;
    recommended_step_id: string | null;
    next_focus: string[];
    remaining_gaps_count: number | null;
    human_gate_ids: string[];
  } | null;
  product_entry_preflight: {
    surface_kind: string;
    summary: string | null;
    ready_to_try_now: boolean | null;
    recommended_check_command: string | null;
    recommended_start_command: string | null;
    blocking_check_ids: string[];
    checks: Array<{
      check_id: string;
      title: string | null;
      status: string | null;
      blocking: boolean | null;
      summary: string | null;
      command: string | null;
    }>;
  } | null;
  product_entry_readiness: {
    surface_kind: string;
    verdict: string | null;
    usable_now: boolean | null;
    good_to_use_now: boolean | null;
    fully_automatic: boolean | null;
    summary: string | null;
    recommended_start_surface: string | null;
    recommended_start_command: string | null;
    recommended_loop_surface: string | null;
    recommended_loop_command: string | null;
    blocking_gaps: string[];
  } | null;
  product_entry_start: {
    surface_kind: string;
    summary: string | null;
    recommended_mode_id: string | null;
    modes: Array<{
      mode_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
      summary: string | null;
      requires: string[];
    }>;
    resume_surface: {
      surface_kind: string | null;
      command: string | null;
      session_locator_field: string | null;
      checkpoint_locator_field: string | null;
    } | null;
    human_gate_ids: string[];
  } | null;
  product_entry_quickstart: {
    surface_kind: string;
    summary: string | null;
    recommended_step_id: string | null;
    steps: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
      summary: string | null;
      requires: string[];
    }>;
    resume_contract: JsonRecord | null;
    human_gate_ids: string[];
  } | null;
  family_orchestration: {
    action_graph_ref: JsonRecord | null;
    action_graph: JsonRecord | null;
    human_gates: JsonRecord[];
    resume_contract: JsonRecord | null;
    event_envelope_surface: JsonRecord | null;
    checkpoint_lineage_surface: JsonRecord | null;
  } | null;
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

function normalizeRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Field ${field}[${index}] must be an object.`);
    }
    return entry;
  });
}

function unwrapManifestPayload(payload: JsonRecord) {
  if (isRecord(payload.product_entry_manifest)) {
    return payload.product_entry_manifest;
  }
  return payload;
}

function normalizeShellSurface(
  value: unknown,
  options: {
    field: string;
    productEntryShell: Record<string, JsonRecord>;
  },
) {
  const { field, productEntryShell } = options;

  if (!isRecord(value)) {
    return null;
  }

  const shellKey = requireString(value.shell_key, `${field}.shell_key`);
  if (!productEntryShell[shellKey]) {
    throw new Error(`${field}.shell_key points at unknown shell key: ${shellKey}`);
  }

  const explicitCommand = optionalString(value.command);
  const derivedCommand = optionalString(productEntryShell[shellKey]?.command);
  if (explicitCommand && derivedCommand && explicitCommand !== derivedCommand) {
    throw new Error(`${field}.command must match the command declared by ${field}.shell_key.`);
  }

  return {
    shell_key: shellKey,
    command: explicitCommand ?? derivedCommand,
    surface_kind:
      optionalString(value.surface_kind)
      ?? optionalString(productEntryShell[shellKey]?.surface_kind),
    summary: optionalString(value.summary),
    continuation_shell_key: optionalString(value.continuation_shell_key),
    continuation_command: optionalString(value.continuation_command),
  };
}

function normalizeProductEntryQuickstart(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const steps = normalizeRecordList(value.steps, 'product_entry_quickstart.steps').map((step, index) => ({
    step_id: requireString(step.step_id, `product_entry_quickstart.steps[${index}].step_id`),
    title: optionalString(step.title),
    command: optionalString(step.command),
    surface_kind: optionalString(step.surface_kind),
    summary: optionalString(step.summary),
    requires: readStringList(step.requires),
  }));
  const recommendedStepId = optionalString(value.recommended_step_id);

  if (recommendedStepId && !steps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error('product_entry_quickstart.recommended_step_id must reference an existing step_id.');
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_quickstart',
    summary: optionalString(value.summary),
    recommended_step_id: recommendedStepId,
    steps,
    resume_contract: isRecord(value.resume_contract) ? value.resume_contract : null,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

function normalizeProductEntryOverview(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const progressSurface = isRecord(value.progress_surface)
    ? {
        surface_kind: optionalString(value.progress_surface.surface_kind),
        command: optionalString(value.progress_surface.command),
        step_id: optionalString(value.progress_surface.step_id),
      }
    : null;
  const resumeSurface = isRecord(value.resume_surface)
    ? {
        surface_kind: optionalString(value.resume_surface.surface_kind),
        command: optionalString(value.resume_surface.command),
        session_locator_field: optionalString(value.resume_surface.session_locator_field),
        checkpoint_locator_field: optionalString(value.resume_surface.checkpoint_locator_field),
      }
    : null;

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_overview',
    summary: optionalString(value.summary),
    frontdesk_command: optionalString(value.frontdesk_command),
    recommended_command: optionalString(value.recommended_command),
    operator_loop_command: optionalString(value.operator_loop_command),
    progress_surface: progressSurface,
    resume_surface: resumeSurface,
    recommended_step_id: optionalString(value.recommended_step_id),
    next_focus: readStringList(value.next_focus),
    remaining_gaps_count: typeof value.remaining_gaps_count === 'number' ? value.remaining_gaps_count : null,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
}

function normalizeProductEntryPreflight(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const checks = normalizeRecordList(value.checks, 'product_entry_preflight.checks').map((check, index) => ({
    check_id: requireString(check.check_id, `product_entry_preflight.checks[${index}].check_id`),
    title: optionalString(check.title),
    status: optionalString(check.status),
    blocking: typeof check.blocking === 'boolean' ? check.blocking : null,
    summary: optionalString(check.summary),
    command: optionalString(check.command),
  }));

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_preflight',
    summary: optionalString(value.summary),
    ready_to_try_now: typeof value.ready_to_try_now === 'boolean' ? value.ready_to_try_now : null,
    recommended_check_command: optionalString(value.recommended_check_command),
    recommended_start_command: optionalString(value.recommended_start_command),
    blocking_check_ids: readStringList(value.blocking_check_ids),
    checks,
  };
}

function normalizeProductEntryReadiness(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_readiness',
    verdict: optionalString(value.verdict),
    usable_now: typeof value.usable_now === 'boolean' ? value.usable_now : null,
    good_to_use_now: typeof value.good_to_use_now === 'boolean' ? value.good_to_use_now : null,
    fully_automatic: typeof value.fully_automatic === 'boolean' ? value.fully_automatic : null,
    summary: optionalString(value.summary),
    recommended_start_surface: optionalString(value.recommended_start_surface),
    recommended_start_command: optionalString(value.recommended_start_command),
    recommended_loop_surface: optionalString(value.recommended_loop_surface),
    recommended_loop_command: optionalString(value.recommended_loop_command),
    blocking_gaps: readStringList(value.blocking_gaps),
  };
}

function normalizeProductEntryStart(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const modes = normalizeRecordList(value.modes, 'product_entry_start.modes').map((mode, index) => ({
    mode_id: requireString(mode.mode_id, `product_entry_start.modes[${index}].mode_id`),
    title: optionalString(mode.title),
    command: optionalString(mode.command),
    surface_kind: optionalString(mode.surface_kind),
    summary: optionalString(mode.summary),
    requires: readStringList(mode.requires),
  }));
  const recommendedModeId = optionalString(value.recommended_mode_id);

  if (recommendedModeId && !modes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error('product_entry_start.recommended_mode_id must reference an existing mode_id.');
  }

  const resumeSurface = isRecord(value.resume_surface)
    ? {
        surface_kind: optionalString(value.resume_surface.surface_kind),
        command: optionalString(value.resume_surface.command),
        session_locator_field: optionalString(value.resume_surface.session_locator_field),
        checkpoint_locator_field: optionalString(value.resume_surface.checkpoint_locator_field),
      }
    : null;

  return {
    surface_kind: optionalString(value.surface_kind) ?? 'product_entry_start',
    summary: optionalString(value.summary),
    recommended_mode_id: recommendedModeId,
    modes,
    resume_surface: resumeSurface,
    human_gate_ids: readStringList(value.human_gate_ids),
  };
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
  const frontdeskSurface = normalizeShellSurface(manifest.frontdesk_surface, {
    field: 'frontdesk_surface',
    productEntryShell,
  });
  const operatorLoopSurface = normalizeShellSurface(manifest.operator_loop_surface, {
    field: 'operator_loop_surface',
    productEntryShell,
  });
  const operatorLoopActions = isRecord(manifest.operator_loop_actions)
    ? normalizeRecordMap(manifest.operator_loop_actions, 'operator_loop_actions')
    : {};
  const productEntryOverview = normalizeProductEntryOverview(manifest.product_entry_overview);
  const productEntryPreflight = normalizeProductEntryPreflight(manifest.product_entry_preflight);
  const productEntryReadiness = normalizeProductEntryReadiness(manifest.product_entry_readiness);
  const productEntryStart = normalizeProductEntryStart(manifest.product_entry_start);
  const productEntryQuickstart = normalizeProductEntryQuickstart(manifest.product_entry_quickstart);
  const rawFamilyOrchestration = isRecord(manifest.family_orchestration)
    ? manifest.family_orchestration
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
    frontdesk_surface: frontdeskSurface,
    operator_loop_surface: operatorLoopSurface,
    operator_loop_actions: operatorLoopActions,
    recommended_shell: recommendedShell,
    recommended_command: explicitRecommendedCommand ?? derivedRecommendedCommand,
    product_entry_shell: productEntryShell,
    shared_handoff: sharedHandoff,
    product_entry_overview: productEntryOverview,
    product_entry_preflight: productEntryPreflight,
    product_entry_readiness: productEntryReadiness,
    product_entry_start: productEntryStart,
    product_entry_quickstart: productEntryQuickstart,
    family_orchestration: rawFamilyOrchestration
      ? {
          action_graph_ref: isRecord(rawFamilyOrchestration.action_graph_ref)
            ? rawFamilyOrchestration.action_graph_ref
            : null,
          action_graph: isRecord(rawFamilyOrchestration.action_graph)
            ? rawFamilyOrchestration.action_graph
            : null,
          human_gates: normalizeRecordList(rawFamilyOrchestration.human_gates, 'family_orchestration.human_gates'),
          resume_contract: isRecord(rawFamilyOrchestration.resume_contract)
            ? rawFamilyOrchestration.resume_contract
            : null,
          event_envelope_surface: isRecord(rawFamilyOrchestration.event_envelope_surface)
            ? rawFamilyOrchestration.event_envelope_surface
            : null,
          checkpoint_lineage_surface: isRecord(rawFamilyOrchestration.checkpoint_lineage_surface)
            ? rawFamilyOrchestration.checkpoint_lineage_surface
            : null,
        }
      : null,
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

  const result = spawnSync('/bin/bash', ['-lc', manifestCommand], {
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
