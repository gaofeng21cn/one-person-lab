import {
  runFamilyTransitionMatrix,
  type FamilyTransitionMatrixCase,
  type FamilyTransitionSpec,
} from '../../stagecraft/index.ts';
import {
  adaptVisualTransitionSpecToFamilyTransitionSpec,
  buildVisualTransitionMatrixCases,
  normalizeVisualTransitionAdapterProfileRegistry,
  normalizeVisualTransitionSpec,
  resolveVisualTransitionAdapterProfile,
  type VisualTransitionSpec,
} from '../../stagecraft/index.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { NormalizedFamilyTransitionProjection } from './types.ts';
import {
  isRecord,
  normalizeRecordList,
  requireRecord,
  requireString,
} from './shared-utils.ts';

type JsonRecord = Record<string, unknown>;

function normalizeAuthorityBoundary(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function normalizeTransitionSpec(value: unknown, field = 'family_transition_spec'): FamilyTransitionSpec | null {
  if (!isRecord(value)) {
    return null;
  }
  const surfaceKind = requireString(value.surface_kind, `${field}.surface_kind`);
  if (surfaceKind !== 'family_transition_spec') {
    throw new Error(`${field}.surface_kind must be family_transition_spec.`);
  }
  const version = requireString(value.version, `${field}.version`);
  if (version !== 'family-transition-runner.v1') {
    throw new Error(`${field}.version must be family-transition-runner.v1.`);
  }
  const guards = requireRecord(value.guards, `${field}.guards`);
  const transitions = normalizeRecordList(value.transitions, `${field}.transitions`);
  if (transitions.length === 0) {
    throw new Error(`${field}.transitions must contain at least one transition.`);
  }

  return {
    surface_kind: 'family_transition_spec',
    version: 'family-transition-runner.v1',
    spec_id: requireString(value.spec_id, `${field}.spec_id`),
    target_domain_id: requireString(value.target_domain_id, `${field}.target_domain_id`),
    owner: requireString(value.owner, `${field}.owner`),
    authority_boundary: normalizeAuthorityBoundary(value.authority_boundary),
    guards: Object.fromEntries(
      Object.entries(guards).map(([guardId, guard]) => {
        if (!isRecord(guard)) {
          throw new Error(`${field}.guards.${guardId} must be an object.`);
        }
        return [guardId, guard];
      }),
    ),
    transitions: transitions as FamilyTransitionSpec['transitions'],
  };
}

function normalizeMatrixCases(value: unknown, field = 'family_transition_matrix_cases'): FamilyTransitionMatrixCase[] {
  return normalizeRecordList(value, field).map((entry, index) => ({
    case_id: requireString(entry.case_id, `${field}[${index}].case_id`),
    domain_id: requireString(entry.domain_id, `${field}[${index}].domain_id`),
    current_state: requireString(entry.current_state, `${field}[${index}].current_state`),
    event: requireString(entry.event, `${field}[${index}].event`),
    guards: isRecord(entry.guards) ? entry.guards : {},
    context: isRecord(entry.context) ? entry.context : undefined,
  }));
}

function normalizeDescriptor(value: unknown): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const surfaceKind = requireString(value.surface_kind, 'family_transition_spec_descriptor.surface_kind');
  if (surfaceKind !== 'family_transition_spec_descriptor') {
    throw new Error('family_transition_spec_descriptor.surface_kind must be family_transition_spec_descriptor.');
  }
  return value;
}

function normalizeVisualSpec(value: unknown) {
  return isRecord(value) ? normalizeVisualTransitionSpec(value) : null;
}

function descriptorLocatorRefs(descriptor: JsonRecord | null): JsonRecord {
  return isRecord(descriptor?.locator_refs) ? descriptor.locator_refs : {};
}

function nonAuthorityFlags(): NormalizedFamilyTransitionProjection['non_authority_flags'] {
  return {
    opl_interprets_domain_quality: false,
    opl_executes_domain_action: false,
    opl_writes_domain_truth: false,
    opl_authorizes_publication_or_fundability_verdict: false,
  };
}

function transitionBoundary(
  spec: FamilyTransitionSpec | null,
  descriptor: JsonRecord | null,
  visualSpec: VisualTransitionSpec | null,
  adapterProfileRegistryRef: string | null,
) {
  const descriptorBoundary = normalizeAuthorityBoundary(descriptor?.authority_boundary);
  return {
    runner_owner: 'OPL Framework',
    domain_transition_owner:
      optionalString(descriptorBoundary.domain_transition_owner)
      ?? visualSpec?.owner
      ?? 'domain_agent',
    adapter_profile_registry_ref: adapterProfileRegistryRef,
    ...descriptorBoundary,
    ...(spec?.authority_boundary ?? {}),
    opl_interprets_domain_quality: false,
    opl_executes_domain_action: false,
    opl_writes_domain_truth: false,
  };
}

function canonicalDomainId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeFamilyTransitionSpec(value: unknown): FamilyTransitionSpec | null {
  return normalizeTransitionSpec(value);
}

function normalizeFamilyTransitionMatrixCases(value: unknown): FamilyTransitionMatrixCase[] {
  return normalizeMatrixCases(value);
}

function normalizeFamilyTransitionProjection(input: {
  manifestTargetDomainId: string;
  spec: FamilyTransitionSpec | null;
  cases: FamilyTransitionMatrixCase[];
  descriptor: JsonRecord | null;
  visualSpec: VisualTransitionSpec | null;
  adapterProfileRegistryRef: string | null;
  blockedReason: string | null;
}): NormalizedFamilyTransitionProjection {
  const {
    manifestTargetDomainId,
    spec,
    cases,
    descriptor,
    visualSpec,
    adapterProfileRegistryRef,
    blockedReason,
  } = input;
  const boundary = transitionBoundary(spec, descriptor, visualSpec, adapterProfileRegistryRef);
  const base = {
    surface_kind: 'family_transition_manifest_projection' as const,
    spec_id: spec?.spec_id ?? visualSpec?.spec_id ?? optionalString(descriptor?.spec_id) ?? null,
    target_domain_id:
      spec?.target_domain_id
      ?? (visualSpec ? manifestTargetDomainId : optionalString(descriptor?.target_domain_id))
      ?? null,
    owner: spec?.owner ?? visualSpec?.owner ?? null,
    transition_count: spec?.transitions.length ?? visualSpec?.transition_table.length ?? 0,
    case_count: cases.length,
    adapter_profile_registry_ref: adapterProfileRegistryRef,
    descriptor,
    locator_refs: descriptorLocatorRefs(descriptor),
    authority_boundary: boundary,
    non_authority_flags: nonAuthorityFlags(),
  };

  if (blockedReason) {
    return {
      ...base,
      status: 'blocked',
      refresh_required: true,
      blocked_reason: blockedReason,
      matrix_result: null,
    };
  }

  if (!spec) {
    return {
      ...base,
      status: descriptor ? 'descriptor_only' : 'missing',
      refresh_required: Boolean(descriptor),
      blocked_reason: null,
      matrix_result: null,
    };
  }

  if (canonicalDomainId(spec.target_domain_id) !== canonicalDomainId(manifestTargetDomainId)) {
    return {
      ...base,
      status: 'blocked',
      refresh_required: false,
      blocked_reason: 'transition_spec_domain_mismatch',
      matrix_result: null,
    };
  }

  if (cases.length === 0) {
    return {
      ...base,
      status: 'blocked',
      refresh_required: true,
      blocked_reason: 'transition_matrix_cases_missing',
      matrix_result: null,
    };
  }

  return {
    ...base,
    status: 'matrix_evaluated',
    refresh_required: false,
    blocked_reason: null,
    matrix_result: runFamilyTransitionMatrix({ spec, cases }),
  };
}

export function normalizeFamilyTransitionSurfaces(
  manifest: JsonRecord,
  manifestTargetDomainId: string,
) {
  const descriptor = normalizeDescriptor(manifest.family_transition_spec_descriptor);
  const visualTransitionSpec = normalizeVisualSpec(manifest.visual_transition_spec);
  const visualTransitionAdapterRegistryRef = optionalString(
    manifest.visual_transition_adapter_profile_registry_ref,
  ) ?? null;
  const hasVisualTransitionAdapterRegistry =
    manifest.visual_transition_adapter_profile_registry !== undefined
    && manifest.visual_transition_adapter_profile_registry !== null;
  const visualTransitionAdapterRegistry = hasVisualTransitionAdapterRegistry
    ? normalizeVisualTransitionAdapterProfileRegistry(manifest.visual_transition_adapter_profile_registry)
    : null;
  const explicitSpec = normalizeFamilyTransitionSpec(manifest.family_transition_spec);
  const explicitCases = normalizeFamilyTransitionMatrixCases(manifest.family_transition_matrix_cases);
  const needsVisualTransitionAdapter = Boolean(
    visualTransitionSpec && (!explicitSpec || explicitCases.length === 0),
  );
  const hasMatchingVisualTransitionAdapter = Boolean(
    visualTransitionAdapterRegistry?.registry_entries.some((entry) =>
      entry.target_domain_ids.some((domainId) =>
        canonicalDomainId(domainId) === canonicalDomainId(manifestTargetDomainId)
      )
    ),
  );
  const visualTransitionAdapterBlockedReason = !needsVisualTransitionAdapter
    ? null
    : !visualTransitionAdapterRegistry
      ? visualTransitionAdapterRegistryRef
        ? 'visual_transition_adapter_profile_registry_unmaterialized'
        : 'visual_transition_adapter_profile_registry_missing'
      : !hasMatchingVisualTransitionAdapter
        ? 'visual_transition_adapter_profile_not_registered_for_domain'
        : null;
  let visualTransitionAdapterProfile = null;
  if (visualTransitionSpec && needsVisualTransitionAdapter && !visualTransitionAdapterBlockedReason) {
    visualTransitionAdapterProfile = resolveVisualTransitionAdapterProfile(
      manifestTargetDomainId,
      visualTransitionAdapterRegistry!,
      visualTransitionSpec.owner,
    );
  }
  const spec = explicitSpec
    ?? (visualTransitionSpec && visualTransitionAdapterProfile
      ? adaptVisualTransitionSpecToFamilyTransitionSpec(
        visualTransitionSpec,
        manifestTargetDomainId,
        visualTransitionAdapterProfile,
      )
      : null);
  const cases = explicitCases.length > 0
    ? explicitCases
    : visualTransitionSpec && visualTransitionAdapterProfile
      ? buildVisualTransitionMatrixCases(
        visualTransitionSpec,
        manifestTargetDomainId,
        visualTransitionAdapterProfile,
      )
      : [];
  return {
    family_transition_spec_descriptor: descriptor,
    family_transition_spec: spec,
    family_transition_matrix_cases: cases,
    visual_transition_adapter_profile_registry: visualTransitionAdapterRegistry,
    visual_transition_adapter_profile_registry_ref: visualTransitionAdapterRegistryRef,
    visual_transition_spec: visualTransitionSpec,
    family_transition: normalizeFamilyTransitionProjection({
      manifestTargetDomainId,
      spec,
      cases,
      descriptor,
      visualSpec: visualTransitionSpec,
      adapterProfileRegistryRef: visualTransitionAdapterRegistryRef,
      blockedReason: visualTransitionAdapterBlockedReason,
    }),
  };
}
