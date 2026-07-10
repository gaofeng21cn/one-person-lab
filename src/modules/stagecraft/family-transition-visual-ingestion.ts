import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import type {
  FamilyTransitionGuardDefinition,
  FamilyTransitionMatrixCase,
  FamilyTransitionSpec,
} from './family-transition-runner.ts';

type JsonRecord = Record<string, unknown>;

export type VisualTransitionAdapterProfile = {
  profileId: string;
  profileRegistrySurfaceKind: 'opl_domain_transition_adapter_profile_registry';
  profileRegistryRole: 'registry_entry';
  targetDomainId: string;
  profileSurfaceKind: 'opl_domain_transition_adapter_profile';
  profileRole: 'domain_transition_profile_extension' | 'compatibility_projection';
  profileExtensionKind: 'visual_transition';
  compatibilitySurfaceKind: 'visual_transition_spec';
  guardOwnerLabel: string;
  workUnitRefPrefix: string;
  ownerRouteRefPrefix: string;
  ownerReceiptRefPrefix: string;
  oracleFixtureRefPrefix: string;
  stageRefPrefix: string;
};

export type VisualTransitionAdapterProfileRegistryEntry = {
  profile_id: string;
  target_domain_ids: string[];
  adapter_profile: {
    profile_id: string;
    profile_surface_kind: 'opl_domain_transition_adapter_profile';
    profile_role: 'domain_transition_profile_extension' | 'compatibility_projection';
    profile_registry_role: 'registry_entry';
    profile_extension_kind: 'visual_transition';
    compatibility_surface_kind: 'visual_transition_spec';
    target_domain_id: string;
    guard_owner_label: string;
    work_unit_ref_prefix: string;
    owner_route_ref_prefix: string;
    owner_receipt_ref_prefix: string;
    oracle_fixture_ref_prefix: string;
    stage_ref_prefix: string;
  };
};

export type VisualTransitionAdapterProfileRegistry = {
  surface_kind: 'opl_domain_transition_adapter_profile_registry';
  version: 'visual-transition-adapter-profile-registry.v1';
  owner: string;
  registry_role: 'domain_owned_transition_adapter_profile_registry';
  source_visual_transition_spec_ref: string;
  source_ref: string | null;
  profile_count: number;
  compatibility_profile_count: number;
  registry_entries: VisualTransitionAdapterProfileRegistryEntry[];
  authority_boundary: JsonRecord;
};

export type VisualTransitionSpec = {
  surface_kind: 'visual_transition_spec';
  spec_id: string;
  owner: string;
  status?: string;
  transition_model?: string;
  source_contract?: string;
  covered_family_stage_kinds: string[];
  transition_table: Array<{
    transition_id: string;
    from_stage: string;
    to_stage: string;
    required_guard_refs: string[];
    owner_action: string;
  }>;
  guard_contract: JsonRecord;
  oracle_fixture: {
    fixture_id: string;
    fixture_model?: string;
    covered_families: string[];
    expected_return_shapes: string[];
    forbidden_oracle_fields: string[];
  };
  runner_boundary: JsonRecord;
  repository_boundary: JsonRecord;
};

const DEFAULT_AUTHORITY_BOUNDARY = {
  opl: 'transition_runner_transport_projection_only',
  domain: 'domain_transition_truth_review_artifact_owner',
};

export const VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_SURFACE_KIND =
  'opl_domain_transition_adapter_profile_registry';
const VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_READBACK_SURFACE_KIND =
  'opl_domain_transition_adapter_profile_registry_readback';

function canonicalDomainId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required visual transition string field: ${field}`);
  }
  return text;
}

function requireStringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty string array.`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

const REQUIRED_FALSE_REGISTRY_AUTHORITY_FIELDS = [
  'domain_transition_profile_extension_is_core_ontology',
  'can_execute_domain_action',
  'can_write_domain_truth',
  'can_create_owner_receipt',
  'can_create_typed_blocker',
  'can_claim_domain_ready',
  'can_claim_visual_ready',
  'can_claim_exportable',
  'can_mutate_artifacts',
] as const;

export function normalizeVisualTransitionAdapterProfileRegistry(
  value: unknown,
): VisualTransitionAdapterProfileRegistry {
  if (!isRecord(value)
    || value.surface_kind !== VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_SURFACE_KIND
    || !Array.isArray(value.registry_entries)) {
    throw new Error('Visual transition adapter profile registry is invalid.');
  }
  if (value.version !== 'visual-transition-adapter-profile-registry.v1') {
    throw new Error('Visual transition adapter profile registry version is invalid.');
  }
  if (value.registry_role !== 'domain_owned_transition_adapter_profile_registry') {
    throw new Error('Visual transition adapter profile registry role is invalid.');
  }
  const owner = requireString(value.owner, 'owner');
  const sourceVisualTransitionSpecRef = requireString(
    value.source_visual_transition_spec_ref,
    'source_visual_transition_spec_ref',
  );
  if (!isRecord(value.authority_boundary)) {
    throw new Error('Visual transition adapter profile registry authority_boundary is required.');
  }
  if (value.authority_boundary.refs_only !== true) {
    throw new Error('Visual transition adapter profile registry authority_boundary.refs_only must be true.');
  }
  const forbidden = Object.entries(value.authority_boundary)
    .filter(([field, enabled]) => field.startsWith('can_') && enabled === true)
    .map(([field]) => field);
  if (forbidden.length > 0) {
    throw new Error(`Visual transition adapter profile registry grants forbidden authority: ${forbidden.join(', ')}`);
  }
  for (const field of REQUIRED_FALSE_REGISTRY_AUTHORITY_FIELDS) {
    if (value.authority_boundary[field] !== false) {
      throw new Error(`Visual transition adapter profile registry authority_boundary.${field} must be false.`);
    }
  }

  const profileIds = new Set<string>();
  const domainAliases = new Set<string>();
  const entries = value.registry_entries.map((rawEntry, index) => {
    if (!isRecord(rawEntry) || !isRecord(rawEntry.adapter_profile)) {
      throw new Error(`visual transition adapter registry_entries[${index}] is invalid.`);
    }
    const rawProfile = rawEntry.adapter_profile;
    const profileRole = requireString(
      rawProfile.profile_role,
      `registry_entries[${index}].adapter_profile.profile_role`,
    );
    if (profileRole !== 'domain_transition_profile_extension' && profileRole !== 'compatibility_projection') {
      throw new Error(`registry_entries[${index}].adapter_profile.profile_role is invalid.`);
    }
    const normalizedProfileRole = profileRole as VisualTransitionAdapterProfile['profileRole'];
    const profileId = requireString(rawEntry.profile_id, `registry_entries[${index}].profile_id`);
    if (profileIds.has(profileId)) {
      throw new Error(`visual transition adapter profile_id is duplicated: ${profileId}`);
    }
    profileIds.add(profileId);
    if (rawProfile.profile_id !== profileId) {
      throw new Error(`registry_entries[${index}].adapter_profile.profile_id must match profile_id.`);
    }
    const targetDomainIds = requireStringList(
      rawEntry.target_domain_ids,
      `registry_entries[${index}].target_domain_ids`,
    );
    const exactAliases = targetDomainIds.map((alias) => alias.toLowerCase());
    if (new Set(exactAliases).size !== exactAliases.length) {
      throw new Error(`registry_entries[${index}].target_domain_ids contains duplicate aliases.`);
    }
    const canonicalAliases = [...new Set(targetDomainIds.map(canonicalDomainId))];
    for (const alias of canonicalAliases) {
      if (domainAliases.has(alias)) {
        throw new Error(`visual transition adapter domain alias is ambiguous: ${alias}`);
      }
      domainAliases.add(alias);
    }
    const targetDomainId = requireString(
      rawProfile.target_domain_id,
      `registry_entries[${index}].adapter_profile.target_domain_id`,
    );
    if (!canonicalAliases.includes(canonicalDomainId(targetDomainId))) {
      throw new Error(`registry_entries[${index}].adapter_profile.target_domain_id must be listed in target_domain_ids.`);
    }
    if (!canonicalAliases.includes(canonicalDomainId(owner))) {
      throw new Error(`registry_entries[${index}].target_domain_ids must include the registry owner.`);
    }
    if (rawProfile.profile_surface_kind !== 'opl_domain_transition_adapter_profile'
      || rawProfile.profile_registry_role !== 'registry_entry'
      || rawProfile.profile_extension_kind !== 'visual_transition'
      || rawProfile.compatibility_surface_kind !== 'visual_transition_spec') {
      throw new Error(`registry_entries[${index}].adapter_profile has an invalid profile contract.`);
    }
    return {
      profile_id: profileId,
      target_domain_ids: targetDomainIds,
      adapter_profile: {
        profile_id: profileId,
        profile_surface_kind: 'opl_domain_transition_adapter_profile' as const,
        profile_role: normalizedProfileRole,
        profile_registry_role: 'registry_entry' as const,
        profile_extension_kind: 'visual_transition' as const,
        compatibility_surface_kind: 'visual_transition_spec' as const,
        target_domain_id: targetDomainId,
        guard_owner_label: requireString(rawProfile.guard_owner_label, `registry_entries[${index}].adapter_profile.guard_owner_label`),
        work_unit_ref_prefix: requireString(rawProfile.work_unit_ref_prefix, `registry_entries[${index}].adapter_profile.work_unit_ref_prefix`),
        owner_route_ref_prefix: requireString(rawProfile.owner_route_ref_prefix, `registry_entries[${index}].adapter_profile.owner_route_ref_prefix`),
        owner_receipt_ref_prefix: requireString(rawProfile.owner_receipt_ref_prefix, `registry_entries[${index}].adapter_profile.owner_receipt_ref_prefix`),
        oracle_fixture_ref_prefix: requireString(rawProfile.oracle_fixture_ref_prefix, `registry_entries[${index}].adapter_profile.oracle_fixture_ref_prefix`),
        stage_ref_prefix: requireString(rawProfile.stage_ref_prefix, `registry_entries[${index}].adapter_profile.stage_ref_prefix`),
      },
    };
  });
  const compatibilityProfileCount = entries.filter(
    (entry) => entry.adapter_profile.profile_role === 'compatibility_projection',
  ).length;
  if (value.profile_count !== entries.length) {
    throw new Error('Visual transition adapter profile registry profile_count is invalid.');
  }
  if (value.compatibility_profile_count !== compatibilityProfileCount) {
    throw new Error('Visual transition adapter profile registry compatibility_profile_count is invalid.');
  }
  return {
    surface_kind: VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_SURFACE_KIND,
    version: 'visual-transition-adapter-profile-registry.v1',
    owner,
    registry_role: 'domain_owned_transition_adapter_profile_registry',
    source_visual_transition_spec_ref: sourceVisualTransitionSpecRef,
    source_ref: optionalString(value.source_ref),
    profile_count: entries.length,
    compatibility_profile_count: compatibilityProfileCount,
    registry_entries: entries,
    authority_boundary: value.authority_boundary,
  };
}

function adapterProfile(entry: VisualTransitionAdapterProfileRegistryEntry): VisualTransitionAdapterProfile {
  return {
    profileId: entry.profile_id,
    profileRegistrySurfaceKind: VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_SURFACE_KIND,
    profileRegistryRole: entry.adapter_profile.profile_registry_role,
    targetDomainId: entry.adapter_profile.target_domain_id,
    profileSurfaceKind: entry.adapter_profile.profile_surface_kind,
    profileRole: entry.adapter_profile.profile_role,
    profileExtensionKind: entry.adapter_profile.profile_extension_kind,
    compatibilitySurfaceKind: entry.adapter_profile.compatibility_surface_kind,
    guardOwnerLabel: entry.adapter_profile.guard_owner_label,
    workUnitRefPrefix: entry.adapter_profile.work_unit_ref_prefix,
    ownerRouteRefPrefix: entry.adapter_profile.owner_route_ref_prefix,
    ownerReceiptRefPrefix: entry.adapter_profile.owner_receipt_ref_prefix,
    oracleFixtureRefPrefix: entry.adapter_profile.oracle_fixture_ref_prefix,
    stageRefPrefix: entry.adapter_profile.stage_ref_prefix,
  };
}

export function resolveVisualTransitionAdapterProfile(
  targetDomainId: string,
  registry: VisualTransitionAdapterProfileRegistry,
  specOwner?: string,
) {
  const canonicalTarget = canonicalDomainId(targetDomainId);
  const matches = registry.registry_entries.filter((candidate) =>
    candidate.target_domain_ids.some((domainId) => canonicalDomainId(domainId) === canonicalTarget)
  );
  if (matches.length === 0) {
    throw new Error(`No visual transition adapter profile is registered for domain: ${targetDomainId}`);
  }
  if (matches.length > 1) {
    throw new Error(`Visual transition adapter profile is ambiguous for domain: ${targetDomainId}`);
  }
  const entry = matches[0];
  if (specOwner && !entry.target_domain_ids.some(
    (domainId) => canonicalDomainId(domainId) === canonicalDomainId(specOwner)
  )) {
    throw new Error(`Visual transition spec owner does not match the adapter profile domain: ${specOwner}`);
  }
  return adapterProfile(entry);
}

export function buildVisualTransitionAdapterProfileRegistryReadback(
  registry?: VisualTransitionAdapterProfileRegistry,
) {
  const entries = (registry?.registry_entries ?? []).map((entry) => ({
    profile_id: entry.profile_id,
    registry_role: 'compatibility_profile',
    target_domain_ids: [...entry.target_domain_ids],
    adapter_profile: {
      ...entry.adapter_profile,
      compatibility_projection: entry.adapter_profile.profile_role === 'compatibility_projection',
    },
  }));
  return {
    surface_kind: VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_READBACK_SURFACE_KIND,
    version: 'visual-transition-adapter-profile-registry-readback.v1',
    registry_surface_kind: VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_SURFACE_KIND,
    registry_role: 'generic_domain_transition_adapter_profile_registry',
    profile_count: entries.length,
    compatibility_profile_count: entries.filter((entry) =>
      entry.adapter_profile.profile_role === 'compatibility_projection'
    ).length,
    registry_entries: entries,
    authority_boundary: {
      surface_kind: 'opl_domain_transition_adapter_profile_registry_authority_boundary',
      registry_surface_kind: VISUAL_TRANSITION_ADAPTER_PROFILE_REGISTRY_SURFACE_KIND,
      domain_transition_profile_extension_is_core_ontology: false,
      refs_only: true,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_visual_ready: false,
      can_claim_exportable: false,
      can_mutate_artifacts: false,
    },
  };
}

function requireVisualRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Missing required visual transition spec object field: ${field}`);
  }
  return value;
}

function requireVisualRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Missing required visual transition spec list field: ${field}`);
  }
  return value.map((entry, index) => requireVisualRecord(entry, `${field}[${index}]`));
}

function readVisualStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Missing required visual transition spec string list field: ${field}`);
  }
  return value.map((entry, index) =>
    requireString(entry, `${field}[${index}]`)
  );
}

function visualTransitionAuthorityBoundary(
  spec: VisualTransitionSpec,
  adapterProfile: VisualTransitionAdapterProfile,
) {
  return {
    ...DEFAULT_AUTHORITY_BOUNDARY,
    profile_surface_kind: adapterProfile.profileSurfaceKind,
    profile_registry_surface_kind: adapterProfile.profileRegistrySurfaceKind,
    profile_id: adapterProfile.profileId,
    profile_registry_role: adapterProfile.profileRegistryRole,
    profile_role: adapterProfile.profileRole,
    profile_extension_kind: adapterProfile.profileExtensionKind,
    compatibility_surface_kind: adapterProfile.compatibilitySurfaceKind,
    compatibility_projection: adapterProfile.profileRole === 'compatibility_projection',
    domain_transition_profile_owner: spec.owner,
    domain_transition_profile_extension_is_core_ontology: false,
    visual_transition_surface_kind: spec.surface_kind,
    visual_transition_status: spec.status ?? null,
    visual_transition_model: spec.transition_model ?? null,
    source_contract: spec.source_contract ?? null,
    oracle_fixture_id: spec.oracle_fixture.fixture_id,
    visual_export_verdict_owner: spec.owner,
    artifact_authority_owner: spec.owner,
    runner_boundary: spec.runner_boundary,
    repository_boundary: spec.repository_boundary,
    opl_can_execute_transition_spec: spec.runner_boundary.opl_can_execute_transition_spec === true,
    opl_can_retry_or_dead_letter: spec.runner_boundary.opl_can_retry_or_dead_letter === true,
    opl_can_store_transition_metadata: spec.runner_boundary.opl_can_store_transition_metadata === true,
    opl_can_declare_visual_ready: false,
    opl_can_declare_exportable: false,
    opl_can_mutate_artifacts: false,
  };
}

export function normalizeVisualTransitionSpec(value: unknown): VisualTransitionSpec {
  const spec = requireVisualRecord(value, 'visual_transition_spec');
  const surfaceKind = requireString(spec.surface_kind, 'visual_transition_spec.surface_kind');
  if (surfaceKind !== 'visual_transition_spec') {
    throw new Error('visual_transition_spec.surface_kind must be visual_transition_spec.');
  }
  const transitionTable = requireVisualRecordList(
    spec.transition_table,
    'visual_transition_spec.transition_table',
  ).map((entry, index) => ({
    transition_id: requireString(
      entry.transition_id,
      `visual_transition_spec.transition_table[${index}].transition_id`,
    ),
    from_stage: requireString(
      entry.from_stage,
      `visual_transition_spec.transition_table[${index}].from_stage`,
    ),
    to_stage: requireString(
      entry.to_stage,
      `visual_transition_spec.transition_table[${index}].to_stage`,
    ),
    required_guard_refs: readVisualStringList(
      entry.required_guard_refs,
      `visual_transition_spec.transition_table[${index}].required_guard_refs`,
    ),
    owner_action: requireString(
      entry.owner_action,
      `visual_transition_spec.transition_table[${index}].owner_action`,
    ),
  }));
  if (transitionTable.length === 0) {
    throw new Error('visual_transition_spec.transition_table must contain at least one transition.');
  }
  const oracleFixture = requireVisualRecord(spec.oracle_fixture, 'visual_transition_spec.oracle_fixture');

  return {
    surface_kind: 'visual_transition_spec',
    spec_id: requireString(spec.spec_id, 'visual_transition_spec.spec_id'),
    owner: requireString(spec.owner, 'visual_transition_spec.owner'),
    status: optionalString(spec.status) ?? undefined,
    transition_model: optionalString(spec.transition_model) ?? undefined,
    source_contract: optionalString(spec.source_contract) ?? undefined,
    covered_family_stage_kinds: readVisualStringList(
      spec.covered_family_stage_kinds,
      'visual_transition_spec.covered_family_stage_kinds',
    ),
    transition_table: transitionTable,
    guard_contract: requireVisualRecord(spec.guard_contract, 'visual_transition_spec.guard_contract'),
    oracle_fixture: {
      fixture_id: requireString(
        oracleFixture.fixture_id,
        'visual_transition_spec.oracle_fixture.fixture_id',
      ),
      fixture_model: optionalString(oracleFixture.fixture_model) ?? undefined,
      covered_families: readVisualStringList(
        oracleFixture.covered_families,
        'visual_transition_spec.oracle_fixture.covered_families',
      ),
      expected_return_shapes: readVisualStringList(
        oracleFixture.expected_return_shapes,
        'visual_transition_spec.oracle_fixture.expected_return_shapes',
      ),
      forbidden_oracle_fields: readVisualStringList(
        oracleFixture.forbidden_oracle_fields,
        'visual_transition_spec.oracle_fixture.forbidden_oracle_fields',
      ),
    },
    runner_boundary: requireVisualRecord(spec.runner_boundary, 'visual_transition_spec.runner_boundary'),
    repository_boundary: requireVisualRecord(
      spec.repository_boundary,
      'visual_transition_spec.repository_boundary',
    ),
  };
}

export function adaptVisualTransitionSpecToFamilyTransitionSpec(
  value: unknown,
  targetDomainId: string,
  adapterProfile: VisualTransitionAdapterProfile,
): FamilyTransitionSpec {
  const spec = normalizeVisualTransitionSpec(value);
  const boundary = visualTransitionAuthorityBoundary(spec, adapterProfile);
  const guards: Record<string, FamilyTransitionGuardDefinition> = {};
  for (const transition of spec.transition_table) {
    for (const guardRef of transition.required_guard_refs) {
      guards[guardRef] = {
        description: `${adapterProfile.guardOwnerLabel}-owned guard ref ${guardRef} for transition ${transition.transition_id}.`,
        owner: spec.owner,
        source_ref: `${spec.spec_id}:guard:${guardRef}`,
        authority_boundary: boundary,
      };
    }
  }

  return {
    surface_kind: 'family_transition_spec',
    version: 'family-transition-runner.v1',
    spec_id: spec.spec_id,
    target_domain_id: targetDomainId,
    owner: spec.owner,
    authority_boundary: boundary,
    guards,
    transitions: spec.transition_table.map((transition) => {
      const metadata = {
        owner_action: transition.owner_action,
        domain_transition_profile_surface_kind: adapterProfile.profileSurfaceKind,
        domain_transition_profile_registry: adapterProfile.profileRegistrySurfaceKind,
        domain_transition_profile_id: adapterProfile.profileId,
        domain_transition_profile_registry_role: adapterProfile.profileRegistryRole,
        domain_transition_profile_role: adapterProfile.profileRole,
        domain_transition_profile_extension_kind: adapterProfile.profileExtensionKind,
        compatibility_surface_kind: adapterProfile.compatibilitySurfaceKind,
        visual_transition_spec_id: spec.spec_id,
        visual_transition_status: spec.status ?? null,
        oracle_fixture_id: spec.oracle_fixture.fixture_id,
        covered_family_stage_kinds: spec.covered_family_stage_kinds,
        required_guard_refs: transition.required_guard_refs,
      };
      return {
        transition_id: transition.transition_id,
        current_state: transition.from_stage,
        event: 'domain_tick',
        required_guards: transition.required_guard_refs,
        next_state: transition.to_stage,
        next_work_unit: {
          work_unit_ref: `${adapterProfile.workUnitRefPrefix}:${transition.to_stage}`,
          action_refs: [transition.owner_action],
          metadata,
        },
        owner_route: {
          owner: spec.owner,
          route_ref: `${adapterProfile.ownerRouteRefPrefix}:${transition.transition_id}`,
          action_refs: [transition.owner_action],
          metadata,
        },
        receipt: {
          receipt_refs: [
            `${adapterProfile.ownerReceiptRefPrefix}:${transition.transition_id}`,
            `${adapterProfile.oracleFixtureRefPrefix}:${spec.oracle_fixture.fixture_id}`,
          ],
          metadata,
        },
        projection: {
          route_node_refs: [
            `${adapterProfile.stageRefPrefix}:${transition.from_stage}`,
            `${adapterProfile.stageRefPrefix}:${transition.to_stage}`,
          ],
          owner_action: transition.owner_action,
          expected_return_shapes: spec.oracle_fixture.expected_return_shapes,
          forbidden_oracle_fields: spec.oracle_fixture.forbidden_oracle_fields,
          visual_ready_claimed: false,
          exportable_claimed: false,
        },
        authority_boundary: boundary,
      };
    }),
  };
}

export function buildVisualTransitionMatrixCases(
  value: unknown,
  targetDomainId: string,
  adapterProfile: VisualTransitionAdapterProfile,
): FamilyTransitionMatrixCase[] {
  const spec = normalizeVisualTransitionSpec(value);
  return spec.transition_table.map((transition) => ({
    case_id: `${spec.oracle_fixture.fixture_id}:${transition.transition_id}`,
    domain_id: targetDomainId,
    current_state: transition.from_stage,
    event: 'domain_tick',
    guards: Object.fromEntries(transition.required_guard_refs.map((guardRef) => [guardRef, true])),
    context: {
      domain_transition_profile_surface_kind: 'opl_domain_transition_adapter_profile',
      domain_transition_profile_registry: adapterProfile.profileRegistrySurfaceKind,
      domain_transition_profile_id: adapterProfile.profileId,
      domain_transition_profile_registry_role: adapterProfile.profileRegistryRole,
      domain_transition_profile_role: adapterProfile.profileRole,
      domain_transition_profile_extension_kind: 'visual_transition',
      compatibility_surface_kind: 'visual_transition_spec',
      visual_transition_spec_id: spec.spec_id,
      oracle_fixture_id: spec.oracle_fixture.fixture_id,
      expected_transition_id: transition.transition_id,
      owner_action: transition.owner_action,
      source_contract: spec.source_contract ?? null,
    },
  }));
}
