import { validateSharedHandoff, validateSharedHandoffBuilder } from '../family-entry-contracts.ts';
import type {
  BuildFamilyFrontdeskEntrySurfacesInput,
  BuildOperatorLoopActionInput,
  BuildProductEntryShellLinkedSurfaceInput,
  BuildProductEntryShellSurfaceInput,
  BuildReturnSurfaceContractInput,
  BuildRuntimeSessionContractInput,
  BuildProductEntryContinuationSnapshotInput,
  BuildEntrySessionSurfaceInput,
  BuildDeliveryIdentitySurfaceInput,
  EntrySessionSurface,
  FamilyFrontdeskEntrySurfaces,
  JsonRecord,
  OperatorLoopActionSurface,
  ProductEntryContinuationSnapshotSurface,
  ProductEntryShellLinkedSurface,
  ProductEntryShellSurface,
  ReturnSurfaceContractSurface,
  RuntimeSessionContractSurface,
  DeliveryIdentitySurface,
} from './types.ts';
import {
  FRONTDESK_SHARED_HANDOFF_KEYS,
  requireBoolean,
  requireRecord,
  cloneRecord,
  mergeExtraPayload,
  normalizeOperatorLoopAction,
  normalizeProductEntryShellSurface,
  optionalString,
  optionalStringList,
  readStringList,
  requireString,
} from './internal.ts';

export function validateFamilyFrontdeskEntrySurfaces(
  value: unknown,
  field: string,
): FamilyFrontdeskEntrySurfaces {
  const payload = requireRecord(value, field);
  const normalized = {} as FamilyFrontdeskEntrySurfaces;

  for (const [key, entry] of Object.entries(payload)) {
    normalized[key] = cloneRecord(entry, `${field}.${key}`);
  }
  for (const key of FRONTDESK_SHARED_HANDOFF_KEYS) {
    if (payload[key] !== undefined) {
      normalized[key] = validateSharedHandoffBuilder(payload[key], `${field}.${key}`);
    }
  }

  return normalized;
}

export function buildFamilyFrontdeskEntrySurfaces(
  input: BuildFamilyFrontdeskEntrySurfacesInput,
): FamilyFrontdeskEntrySurfaces {
  const productEntryShell = cloneRecord(input.product_entry_shell, 'product_entry_shell');
  const shellAliases = cloneRecord(input.shell_aliases, 'shell_aliases');
  const payload: JsonRecord = {};

  for (const [entryKey, rawShellKey] of Object.entries(shellAliases)) {
    const shellKey = requireString(rawShellKey, `shell_aliases.${entryKey}`);
    payload[entryKey] = cloneRecord(
      productEntryShell[shellKey],
      `product_entry_shell.${shellKey}`,
    );
  }

  if (input.shared_handoff !== undefined && input.shared_handoff !== null) {
    const sharedHandoff = validateSharedHandoff(input.shared_handoff, 'shared_handoff');
    for (const key of FRONTDESK_SHARED_HANDOFF_KEYS) {
      if (sharedHandoff[key] !== undefined) {
        payload[key] = sharedHandoff[key];
      }
    }
  }

  return validateFamilyFrontdeskEntrySurfaces(payload, 'entry_surfaces');
}

export function buildProductEntryShellSurface(
  input: BuildProductEntryShellSurfaceInput,
): ProductEntryShellSurface {
  const payload: JsonRecord = {
    command: requireString(input.command, 'command'),
    surface_kind: requireString(input.surface_kind, 'surface_kind'),
  };
  const summary = optionalString(input.summary);
  if (summary) {
    payload.summary = summary;
  }
  const purpose = optionalString(input.purpose);
  if (purpose) {
    payload.purpose = purpose;
  }
  const commandTemplate = optionalString(input.command_template);
  if (commandTemplate) {
    payload.command_template = commandTemplate;
  }
  const requires = input.requires === undefined || input.requires === null
    ? null
    : readStringList(input.requires, 'requires');
  if (requires) {
    payload.requires = requires;
  }
  return normalizeProductEntryShellSurface(
    mergeExtraPayload(payload, input.extra_payload, 'product entry shell surface'),
    'product_entry_shell_surface',
  );
}

export function buildProductEntryShellCatalog(
  input: Record<string, BuildProductEntryShellSurfaceInput | JsonRecord>,
): Record<string, ProductEntryShellSurface> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      buildProductEntryShellSurface(
        normalizeProductEntryShellSurface(value, `product_entry_shell.${key}`),
      ),
    ]),
  );
}

export function buildProductEntryShellLinkedSurface(
  input: BuildProductEntryShellLinkedSurfaceInput,
): ProductEntryShellLinkedSurface {
  const shellSurface = normalizeProductEntryShellSurface(input.shell_surface, 'shell_surface');
  return mergeExtraPayload(
    {
      shell_key: requireString(input.shell_key, 'shell_key'),
      command: shellSurface.command,
      surface_kind: shellSurface.surface_kind,
      summary: requireString(input.summary, 'summary'),
    },
    input.extra_payload,
    'product entry shell linked surface',
  ) as ProductEntryShellLinkedSurface;
}

export function buildOperatorLoopAction(
  input: BuildOperatorLoopActionInput,
): OperatorLoopActionSurface {
  return normalizeOperatorLoopAction(
    mergeExtraPayload(
      {
        command: requireString(input.command, 'command'),
        surface_kind: requireString(input.surface_kind, 'surface_kind'),
        summary: requireString(input.summary, 'summary'),
        requires: readStringList(input.requires, 'requires'),
      },
      input.extra_payload,
      'operator loop action',
    ),
    'operator_loop_action',
  );
}

export function buildOperatorLoopActionCatalog(
  input: Record<string, BuildOperatorLoopActionInput | JsonRecord>,
): Record<string, OperatorLoopActionSurface> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      buildOperatorLoopAction(normalizeOperatorLoopAction(value, `operator_loop_actions.${key}`)),
    ]),
  );
}

export function buildRuntimeSessionContract(
  input: BuildRuntimeSessionContractInput,
): RuntimeSessionContractSurface {
  const runtimeOwner = requireString(input.runtime_owner, 'runtime_owner');
  const expectedRuntimeOwner = optionalString(input.expected_runtime_owner);
  if (expectedRuntimeOwner && runtimeOwner !== expectedRuntimeOwner) {
    throw new Error(
      `product entry companion runtime_owner 必须是 ${expectedRuntimeOwner}，当前为 ${runtimeOwner}`,
    );
  }

  const payload: JsonRecord = {
    runtime_owner: runtimeOwner,
  };
  const adapterSurface = optionalString(input.adapter_surface)
    || optionalString(input.default_adapter_surface);
  if (adapterSurface) {
    payload.adapter_surface = adapterSurface;
  }
  const sessionMode = optionalString(input.session_mode)
    || optionalString(input.default_session_mode);
  if (sessionMode) {
    payload.session_mode = sessionMode;
  }
  return mergeExtraPayload(
    payload,
    input.extra_payload,
    'runtime session contract',
  ) as RuntimeSessionContractSurface;
}

export function buildReturnSurfaceContract(
  input: BuildReturnSurfaceContractInput,
): ReturnSurfaceContractSurface {
  const requestedSurfaceKind = requireString(
    input.requested_surface_kind,
    'requested_surface_kind',
  );
  const expectedSurfaceKind = optionalString(input.expected_surface_kind);
  if (expectedSurfaceKind && requestedSurfaceKind !== expectedSurfaceKind) {
    throw new Error(
      `product entry companion requested_surface_kind 必须是 ${expectedSurfaceKind}，当前为 ${requestedSurfaceKind}`,
    );
  }

  const payload: JsonRecord = {
    requested_surface_kind: requestedSurfaceKind,
  };
  const actualSurfaceKind = optionalString(input.actual_surface_kind);
  if (actualSurfaceKind) {
    payload.actual_surface_kind = actualSurfaceKind;
  }
  const durableTruthSurfaces = input.durable_truth_surfaces === undefined || input.durable_truth_surfaces === null
    ? null
    : readStringList(input.durable_truth_surfaces, 'durable_truth_surfaces');
  if (durableTruthSurfaces) {
    payload.durable_truth_surfaces = durableTruthSurfaces;
  }
  return mergeExtraPayload(
    payload,
    input.extra_payload,
    'return surface contract',
  ) as ReturnSurfaceContractSurface;
}

export function buildProductEntryContinuationSnapshot(
  input: BuildProductEntryContinuationSnapshotInput,
): ProductEntryContinuationSnapshotSurface {
  return mergeExtraPayload(
    {
      latest_managed_run_id: optionalString(input.latest_managed_run_id) ?? null,
      latest_run_id: optionalString(input.latest_run_id) ?? null,
      managed_progress_projection: input.managed_progress_projection
        ? cloneRecord(input.managed_progress_projection, 'managed_progress_projection')
        : null,
      runtime_supervision: input.runtime_supervision
        ? cloneRecord(input.runtime_supervision, 'runtime_supervision')
        : null,
    },
    input.extra_payload,
    'product entry continuation snapshot',
  ) as ProductEntryContinuationSnapshotSurface;
}

export function buildEntrySessionSurface(
  input: BuildEntrySessionSurfaceInput,
): EntrySessionSurface {
  const payload: JsonRecord = {
    entry_session_id: requireString(input.entry_session_id, 'entry_session_id'),
    session_file: requireString(input.session_file, 'session_file'),
    runtime_owner: requireString(input.runtime_owner, 'runtime_owner'),
  };
  if (input.resumed_from_session !== undefined && input.resumed_from_session !== null) {
    payload.resumed_from_session = requireBoolean(input.resumed_from_session, 'resumed_from_session');
  }
  if (input.created_deliverable !== undefined && input.created_deliverable !== null) {
    payload.created_deliverable = requireBoolean(input.created_deliverable, 'created_deliverable');
  }
  return mergeExtraPayload(
    payload,
    input.extra_payload,
    'entry session surface',
  ) as EntrySessionSurface;
}

export function buildDeliveryIdentitySurface(
  input: BuildDeliveryIdentitySurfaceInput,
): DeliveryIdentitySurface {
  const payload: JsonRecord = {
    deliverable_family: requireString(input.deliverable_family, 'deliverable_family'),
    topic_id: requireString(input.topic_id, 'topic_id'),
    deliverable_id: requireString(input.deliverable_id, 'deliverable_id'),
  };
  const profileId = optionalString(input.profile_id);
  if (profileId) {
    payload.profile_id = profileId;
  }
  return mergeExtraPayload(
    payload,
    input.extra_payload,
    'delivery identity surface',
  ) as DeliveryIdentitySurface;
}

