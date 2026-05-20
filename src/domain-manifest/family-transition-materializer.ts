import { spawnSync } from 'node:child_process';

import {
  buildManagedShellCommandEnv,
  prepareManagedShellCommandCwd,
} from '../managed-shell-command-env.ts';
import type { WorkspaceBinding } from '../workspace-registry.ts';
import { unwrapManifestPayload } from './entry-surfaces.ts';
import { isRecord, optionalString } from './shared-utils.ts';

type JsonRecord = Record<string, unknown>;

function rootPayload(payload: JsonRecord) {
  return unwrapManifestPayload(payload);
}

function updateRootPayload(payload: JsonRecord, root: JsonRecord) {
  if (isRecord(payload.product_entry_manifest)) {
    return {
      ...payload,
      product_entry_manifest: root,
    };
  }
  return root;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function transitionDescriptor(root: JsonRecord) {
  const descriptor = isRecord(root.family_transition_spec_descriptor)
    ? root.family_transition_spec_descriptor
    : null;
  if (
    !descriptor
    || descriptor.surface_kind !== 'family_transition_spec_descriptor'
    || descriptor.spec_surface_kind !== 'family_transition_spec'
    || descriptor.refresh_policy !== 'rebuild_study_state_matrix_before_opl_runner'
  ) {
    return null;
  }
  const materializedSurfaces = isRecord(descriptor.materialized_surfaces)
    ? descriptor.materialized_surfaces
    : {};
  if (stringList(materializedSurfaces.study_state_matrix).length === 0) {
    return null;
  }
  return descriptor;
}

function commandDescriptorFromProductEntryShell(root: JsonRecord) {
  const shell = isRecord(root.product_entry_shell) ? root.product_entry_shell : {};
  const entry = isRecord(shell.study_state_matrix) ? shell.study_state_matrix : null;
  const command = optionalString(entry?.command);
  if (!entry || entry.surface_kind !== 'study_state_matrix' || !command) {
    return null;
  }
  return {
    command,
    source: 'product_entry_shell.study_state_matrix',
  };
}

function commandDescriptorFromActionCatalog(root: JsonRecord) {
  const catalog = isRecord(root.family_action_catalog) ? root.family_action_catalog : null;
  const actions = Array.isArray(catalog?.actions) ? catalog.actions : [];
  for (const entry of actions) {
    if (!isRecord(entry)) {
      continue;
    }
    const sourceCommand = isRecord(entry.source_command) ? entry.source_command : {};
    if (
      entry.action_id !== 'study_state_matrix'
      && sourceCommand.surface_kind !== 'study_state_matrix'
    ) {
      continue;
    }
    if (entry.effect !== 'read_only') {
      return {
        command: null,
        blocked_reason: 'study_state_matrix_action_must_be_read_only',
        source: 'family_action_catalog.study_state_matrix',
      };
    }
    const cli = isRecord(isRecord(entry.supported_surfaces) ? entry.supported_surfaces.cli : null)
      ? (entry.supported_surfaces as JsonRecord).cli as JsonRecord
      : {};
    const command = optionalString(cli.command) ?? optionalString(sourceCommand.command);
    if (!command) {
      return {
        command: null,
        blocked_reason: 'study_state_matrix_action_missing_command',
        source: 'family_action_catalog.study_state_matrix',
      };
    }
    return {
      command,
      source: 'family_action_catalog.study_state_matrix',
    };
  }
  return null;
}

function pickStudyStateMatrixCommand(root: JsonRecord) {
  return commandDescriptorFromActionCatalog(root) ?? commandDescriptorFromProductEntryShell(root);
}

function jsonPointerGet(root: unknown, pointer: string) {
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  return pointer
    .split('/')
    .slice(1)
    .reduce<unknown>((value, rawPart) => {
      if (!isRecord(value) && !Array.isArray(value)) {
        return undefined;
      }
      const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
      if (Array.isArray(value)) {
        const index = Number.parseInt(part, 10);
        return Number.isInteger(index) ? value[index] : undefined;
      }
      return value[part];
    }, root);
}

function executeMaterializationCommand(binding: WorkspaceBinding, command: string, timeoutMs: number) {
  const commandCwd = prepareManagedShellCommandCwd(binding.workspace_path, command);
  try {
    return spawnSync('/bin/bash', ['-lc', command], {
      cwd: commandCwd.cwd,
      encoding: 'utf8',
      env: buildManagedShellCommandEnv(binding.workspace_path),
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
    });
  } finally {
    commandCwd.cleanup();
  }
}

function commandTimedOut(result: ReturnType<typeof spawnSync>) {
  const errorRecord = result.error && typeof result.error === 'object' && 'code' in result.error
    ? result.error as Error & { code?: unknown }
    : null;
  return errorRecord?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
}

function compactOutput(value: string | undefined) {
  const text = (value ?? '').trim();
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text || null;
}

function failureSurface(input: {
  status: 'skipped' | 'failed';
  command: string | null;
  commandSource: string | null;
  reason: string;
  stdout?: string;
  stderr?: string;
  timeoutMs?: number;
}) {
  return {
    surface_kind: 'family_transition_materialization',
    status: input.status,
    source_surface_kind: 'study_state_matrix',
    source_action_id: 'study_state_matrix',
    source_command: input.command,
    command_source: input.commandSource,
    blocked_reason: input.reason,
    stdout: compactOutput(input.stdout),
    stderr: compactOutput(input.stderr),
    timeout_ms: input.timeoutMs ?? null,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_executes_domain_action: false,
      opl_authorizes_publication_or_fundability_verdict: false,
      domain_transition_owner: 'domain_agent',
    },
  };
}

function buildLocatorRoot(output: JsonRecord) {
  return output.surface === 'study_state_matrix' || output.surface_kind === 'study_state_matrix'
    ? { study_state_matrix: output }
    : output;
}

function materializeFromStudyStateMatrix(
  root: JsonRecord,
  output: JsonRecord,
  descriptor: JsonRecord,
  command: string,
  commandSource: string,
) {
  const locatorRefs = isRecord(descriptor.locator_refs) ? descriptor.locator_refs : {};
  const specRef = optionalString(locatorRefs.study_state_matrix_spec)
    ?? '/study_state_matrix/domain_transition_table/family_transition_spec';
  const casesRef = optionalString(locatorRefs.study_state_matrix_cases)
    ?? '/study_state_matrix/domain_transition_table/family_transition_matrix_cases';
  const locatorRoot = buildLocatorRoot(output);
  const spec = jsonPointerGet(locatorRoot, specRef);
  const cases = jsonPointerGet(locatorRoot, casesRef);
  if (!isRecord(spec) || !Array.isArray(cases)) {
    return {
      ...root,
      family_transition_materialization: failureSurface({
        status: 'failed',
        command,
        commandSource,
        reason: 'study_state_matrix_missing_transition_spec_or_cases',
      }),
    };
  }
  return {
    ...root,
    family_transition_spec: spec,
    family_transition_matrix_cases: cases,
    family_transition_materialization: {
      surface_kind: 'family_transition_materialization',
      status: 'materialized',
      source_surface_kind: 'study_state_matrix',
      source_action_id: 'study_state_matrix',
      source_command: command,
      command_source: commandSource,
      spec_ref: specRef,
      cases_ref: casesRef,
      case_count: cases.length,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_executes_domain_action: false,
        opl_authorizes_publication_or_fundability_verdict: false,
        domain_transition_owner: optionalString(isRecord(descriptor.authority_boundary)
          ? descriptor.authority_boundary.domain_transition_owner
          : null) ?? 'domain_agent',
      },
    },
  };
}

export function materializeFamilyTransitionSurfaces(
  payload: JsonRecord,
  input: {
    binding: WorkspaceBinding;
    timeoutMs: number;
  },
) {
  const root = rootPayload(payload);
  const descriptor = transitionDescriptor(root);
  if (!descriptor || (isRecord(root.family_transition_spec) && Array.isArray(root.family_transition_matrix_cases))) {
    return payload;
  }

  const commandDescriptor = pickStudyStateMatrixCommand(root);
  if (!commandDescriptor || !commandDescriptor.command) {
    return updateRootPayload(payload, {
      ...root,
      family_transition_materialization: failureSurface({
        status: 'skipped',
        command: commandDescriptor?.command ?? null,
        commandSource: commandDescriptor?.source ?? null,
        reason: commandDescriptor?.blocked_reason ?? 'study_state_matrix_materialization_command_missing',
      }),
    });
  }

  const result = executeMaterializationCommand(
    input.binding,
    commandDescriptor.command,
    input.timeoutMs,
  );
  if (commandTimedOut(result)) {
    return updateRootPayload(payload, {
      ...root,
      family_transition_materialization: failureSurface({
        status: 'failed',
        command: commandDescriptor.command,
        commandSource: commandDescriptor.source,
        reason: 'study_state_matrix_materialization_timeout',
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        timeoutMs: input.timeoutMs,
      }),
    });
  }
  if (result.error || (result.status ?? 1) !== 0) {
    return updateRootPayload(payload, {
      ...root,
      family_transition_materialization: failureSurface({
        status: 'failed',
        command: commandDescriptor.command,
        commandSource: commandDescriptor.source,
        reason: 'study_state_matrix_materialization_command_failed',
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? result.error?.message ?? '',
      }),
    });
  }

  try {
    const output = JSON.parse(result.stdout ?? '');
    if (!isRecord(output)) {
      throw new Error('study_state_matrix output must be a JSON object.');
    }
    return updateRootPayload(
      payload,
      materializeFromStudyStateMatrix(
        root,
        output,
        descriptor,
        commandDescriptor.command,
        commandDescriptor.source,
      ),
    );
  } catch (error) {
    return updateRootPayload(payload, {
      ...root,
      family_transition_materialization: failureSurface({
        status: 'failed',
        command: commandDescriptor.command,
        commandSource: commandDescriptor.source,
        reason: error instanceof Error ? error.message : 'study_state_matrix_materialization_invalid_json',
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      }),
    });
  }
}
