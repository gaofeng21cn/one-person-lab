import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import currentOwnerDeltaSchema from '../../../contracts/opl-framework/current-owner-delta.schema.json' with { type: 'json' };
import standardAgentCapabilityMapSchema from '../../../contracts/opl-framework/standard-agent-capability-map.schema.json' with { type: 'json' };
import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import {
  buildCapabilityRegistryReadout,
  type CapabilityBindingKind,
  type CapabilityRegistryCatalog,
  type CapabilityRegistryEntry,
  type CurrentOwnerDeltaCapabilityBinding,
  type CurrentOwnerDeltaCapabilityRequirement,
} from '../connect/index.ts';

type JsonRecord = Record<string, unknown>;

type CatalogProvenance = {
  catalog_repo: string;
  contract_ref: string;
  catalog_kind: 'standard_agent_capability_map';
  owner: string;
  source_fingerprint: string;
};

type PackOsDescriptorRef = {
  descriptor_ref: string;
  catalog_root: string;
};

type CapabilityPlanningMetadata = {
  catalog_root: string;
  capability_ref: string;
  dependency_refs: string[];
  environment_action_refs: string[];
  install_action_refs: string[];
  descriptor_refs: PackOsDescriptorRef[];
};

type CatalogCapability = {
  identity: string;
  entry: CapabilityRegistryEntry;
  metadata: CapabilityPlanningMetadata;
};

type LoadedCatalog = {
  provenance: CatalogProvenance;
  capabilities: CatalogCapability[];
};

type LoadedJsonRecord = {
  payload: JsonRecord;
  source_fingerprint: string;
};

type ProfileCapabilityPlanProjection = {
  surface_kind: 'opl_profile_capability_plan_input';
  schema_version: 'profile-capability-plan-input.v1';
  exact_capability_refs: string[];
  profile_requirement_refs: string[];
  authority_boundary: {
    refs_only: true;
    can_create_route_required_binding: false;
    can_execute_capability: false;
    can_write_domain_truth: false;
    can_sign_owner_receipt: false;
    can_create_typed_blocker: false;
    can_claim_target_ready: false;
  };
};

export type ProfileCapabilityPlanInput = {
  selectionFile: string;
  catalogRepos?: string[];
  currentOwnerDeltaFile?: string | null;
  capabilityRefs?: string[];
};

const PLAN_INPUT_KEYS = new Set([
  'surface_kind',
  'schema_version',
  'exact_capability_refs',
  'profile_requirement_refs',
  'authority_boundary',
]);

const PLAN_INPUT_AUTHORITY_KEYS = new Set([
  'refs_only',
  'can_create_route_required_binding',
  'can_execute_capability',
  'can_write_domain_truth',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_claim_target_ready',
]);

const CAPABILITY_REQUIREMENTS_SCHEMA = {
  $id: 'opl.profile-capability-plan.current-owner-delta-requirements.v1',
  type: 'array',
  items: {
    $ref: '#/$defs/current_owner_delta_capability_requirement',
  },
  uniqueItems: true,
  $defs: currentOwnerDeltaSchema.$defs,
};

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim()))].sort();
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value) : [];
}

function optionalStringList(value: unknown, label: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const normalized = stringList(value);
  if (normalized.length !== value.length) {
    throw new Error(`${label} must contain unique non-empty strings.`);
  }
  return normalized;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function fingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function readJsonRecord(filePath: string, label: string): LoadedJsonRecord {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
  let payload: unknown;
  try {
    payload = parseJsonText(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON: ${filePath}`);
  }
  if (!isRecord(payload)) {
    throw new Error(`${label} must contain a JSON object: ${filePath}`);
  }
  return {
    payload,
    source_fingerprint: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function assertExactKeys(value: JsonRecord, keys: Set<string>, label: string) {
  const unexpected = Object.keys(value).filter((key) => !keys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unexpected.sort().join(', ')}`);
  }
}

function profileRequirementRefs(input: {
  requiredCapabilityKinds?: unknown;
  requiredSurfaceRoles?: unknown;
}) {
  return uniqueStrings([
    ...stringList(input.requiredCapabilityKinds)
      .map((value) => `profile-capability-kind:${value}`),
    ...stringList(input.requiredSurfaceRoles)
      .map((value) => `profile-surface-role:${value}`),
  ]);
}

export function buildProfileCapabilityPlanInputProjection(input: {
  exactCapabilityRefs?: string[];
  requiredCapabilityKinds?: string[];
  requiredSurfaceRoles?: string[];
} = {}): ProfileCapabilityPlanProjection {
  return {
    surface_kind: 'opl_profile_capability_plan_input',
    schema_version: 'profile-capability-plan-input.v1',
    exact_capability_refs: uniqueStrings(input.exactCapabilityRefs ?? []),
    profile_requirement_refs: profileRequirementRefs(input),
    authority_boundary: {
      refs_only: true,
      can_create_route_required_binding: false,
      can_execute_capability: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_target_ready: false,
    },
  };
}

function validatePlanProjection(value: unknown): ProfileCapabilityPlanProjection {
  if (!isRecord(value)) {
    throw new Error('Profile selection file must contain profile_capability_plan_input.');
  }
  assertExactKeys(value, PLAN_INPUT_KEYS, 'profile_capability_plan_input');
  if (value.surface_kind !== 'opl_profile_capability_plan_input'
    || value.schema_version !== 'profile-capability-plan-input.v1') {
    throw new Error('profile_capability_plan_input has an unsupported contract identity.');
  }
  if (!Array.isArray(value.exact_capability_refs)
    || !Array.isArray(value.profile_requirement_refs)) {
    throw new Error('profile_capability_plan_input ref fields must be arrays.');
  }
  const exactCapabilityRefs = stringList(value.exact_capability_refs);
  const requirementRefs = stringList(value.profile_requirement_refs);
  if (exactCapabilityRefs.length !== value.exact_capability_refs.length
    || requirementRefs.length !== value.profile_requirement_refs.length) {
    throw new Error('profile_capability_plan_input refs must be unique non-empty strings.');
  }
  if (!isRecord(value.authority_boundary)) {
    throw new Error('profile_capability_plan_input.authority_boundary must be an object.');
  }
  assertExactKeys(
    value.authority_boundary,
    PLAN_INPUT_AUTHORITY_KEYS,
    'profile_capability_plan_input.authority_boundary',
  );
  const authority = value.authority_boundary;
  if (authority.refs_only !== true
    || [...PLAN_INPUT_AUTHORITY_KEYS]
      .filter((key) => key !== 'refs_only')
      .some((key) => authority[key] !== false)) {
    throw new Error('profile_capability_plan_input authority boundary is invalid.');
  }
  return value as ProfileCapabilityPlanProjection;
}

function selectionReceipt(payload: JsonRecord): JsonRecord {
  const receipt = isRecord(payload.profile_selection_receipt)
    ? payload.profile_selection_receipt
    : payload;
  if (receipt.surface_kind !== 'opl_profile_selection_receipt'
    || receipt.version !== 'profile-selection-receipt.v1') {
    throw new Error('Profile selection file must contain a canonical OPL profile-selection receipt.');
  }
  return receipt;
}

function planProjection(payload: JsonRecord, receipt: JsonRecord) {
  return validatePlanProjection(
    payload.profile_capability_plan_input ?? receipt.profile_capability_plan_input,
  );
}

function normalizedRepoRoot(repoRef: string) {
  const resolved = path.resolve(repoRef);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    throw new Error(`--catalog-repo does not exist: ${resolved}`);
  }
}

function containedRepoPath(repoDir: string, ref: string, label: string) {
  if (!ref.trim() || path.isAbsolute(ref) || ref.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    throw new Error(`${label} must be a repo-relative local JSON path: ${ref}`);
  }
  const resolved = path.resolve(repoDir, ref);
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(resolved);
  } catch {
    throw new Error(`${label} does not exist: ${ref}`);
  }
  const relative = path.relative(repoDir, realPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its catalog repo: ${ref}`);
  }
  if (path.extname(realPath).toLowerCase() !== '.json') {
    throw new Error(`${label} must reference a JSON Pack OS descriptor: ${ref}`);
  }
  return relative.split(path.sep).join('/');
}

function explicitPackOsDescriptorRefs(entry: JsonRecord, repoDir: string, label: string) {
  if (entry.pack_os_descriptor_refs === undefined) {
    return [];
  }
  if (!Array.isArray(entry.pack_os_descriptor_refs)) {
    throw new Error(`${label}.pack_os_descriptor_refs must be an array.`);
  }
  return entry.pack_os_descriptor_refs.map((value, index): PackOsDescriptorRef => {
    if (!isRecord(value)) {
      throw new Error(`${label}.pack_os_descriptor_refs[${index}] must be an object.`);
    }
    assertExactKeys(
      value,
      new Set(['surface_kind', 'descriptor_ref']),
      `${label}.pack_os_descriptor_refs[${index}]`,
    );
    if (value.surface_kind !== 'opl_pack_os_descriptor_ref'
      || typeof value.descriptor_ref !== 'string') {
      throw new Error(`${label}.pack_os_descriptor_refs[${index}] is not a typed Pack OS descriptor ref.`);
    }
    return {
      descriptor_ref: containedRepoPath(repoDir, value.descriptor_ref, `${label}.pack_os_descriptor_refs[${index}]`),
      catalog_root: repoDir,
    };
  });
}

function capabilitySurfaceRef(entry: JsonRecord, fallback: string): string {
  if (isRecord(entry.physical_source_ref) && typeof entry.physical_source_ref.ref === 'string') {
    return entry.physical_source_ref.ref;
  }
  return fallback;
}

function catalogCapability(input: {
  capabilityRef: string;
  capabilityId: string;
  owner: string;
  sourceFamily: string;
  surfaceRef: string;
  catalogIdentity: string;
  catalogRoot: string;
  dependencyRefs: string[];
  environmentActionRefs: string[];
  installActionRefs: string[];
  descriptorRefs: PackOsDescriptorRef[];
}) {
  return {
    identity: `${input.catalogIdentity}#${input.capabilityId}`,
    entry: {
      capability_ref: input.capabilityRef,
      capability_id: input.capabilityId,
      owner: input.owner,
      source_family: input.sourceFamily,
      surface_ref: input.surfaceRef,
      lifecycle: 'available',
    },
    metadata: {
      catalog_root: input.catalogRoot,
      capability_ref: input.capabilityRef,
      dependency_refs: input.dependencyRefs,
      environment_action_refs: input.environmentActionRefs,
      install_action_refs: input.installActionRefs,
      descriptor_refs: input.descriptorRefs,
    },
  } satisfies CatalogCapability;
}

function standardAgentCatalog(
  repoDir: string,
  filePath: string,
  loaded: LoadedJsonRecord,
): LoadedCatalog {
  assertJsonSchemaPayload({
    schemaId: 'opl.standard_agent_capability_map.v1',
    schema: standardAgentCapabilityMapSchema,
    sourceRef: 'contracts/opl-framework/standard-agent-capability-map.schema.json',
  }, loaded.payload);
  const payload = loaded.payload;
  const owner = String(payload.domain_id);
  const contractRef = path.relative(repoDir, filePath).split(path.sep).join('/');
  const catalogIdentity = `${repoDir}:${loaded.source_fingerprint}:${contractRef}`;
  const capabilities = records(payload.capabilities).flatMap((entry, index) => {
    const capabilityId = String(entry.capability_id);
    const pointerRef = `${contractRef}#/capabilities/${index}`;
    const descriptorRefs = explicitPackOsDescriptorRefs(
      entry,
      repoDir,
      `${contractRef}#/capabilities/${index}`,
    );
    const dependencyRefs = optionalStringList(
      entry.dependency_profile_refs,
      `${contractRef}#/capabilities/${index}/dependency_profile_refs`,
    );
    const environmentActionRefs = optionalStringList(
      entry.environment_action_refs,
      `${contractRef}#/capabilities/${index}/environment_action_refs`,
    );
    const installActionRefs = optionalStringList(
      entry.install_action_refs,
      `${contractRef}#/capabilities/${index}/install_action_refs`,
    );
    return uniqueStrings([capabilityId, pointerRef]).map((capabilityRef) => catalogCapability({
      capabilityRef,
      capabilityId,
      owner,
      sourceFamily: owner,
      surfaceRef: capabilitySurfaceRef(entry, pointerRef),
      catalogIdentity,
      catalogRoot: repoDir,
      dependencyRefs,
      environmentActionRefs,
      installActionRefs,
      descriptorRefs,
    }));
  });
  return {
    provenance: {
      catalog_repo: repoDir,
      contract_ref: contractRef,
      catalog_kind: 'standard_agent_capability_map',
      owner,
      source_fingerprint: loaded.source_fingerprint,
    },
    capabilities,
  };
}

function loadCatalogRepo(repoRef: string): LoadedCatalog[] {
  const repoDir = normalizedRepoRoot(repoRef);
  const candidates = [
    {
      filePath: path.join(repoDir, 'contracts', 'capability_map.json'),
      load: standardAgentCatalog,
    },
  ];
  const loaded = candidates
    .filter(({ filePath }) => fs.existsSync(filePath))
    .map(({ filePath, load }) => load(
      repoDir,
      filePath,
      readJsonRecord(filePath, 'Capability catalog'),
    ));
  if (loaded.length === 0) {
    throw new Error(`--catalog-repo has no supported capability contract: ${repoDir}`);
  }
  return loaded;
}

function currentOwnerDelta(input: {
  filePath?: string | null;
}) {
  if (!input.filePath) {
    return {
      binding: {
        default_planning_root: 'missing',
        required_capability_refs: [],
      } as CurrentOwnerDeltaCapabilityBinding,
      source_ref: null,
      source_fingerprint: null,
      binding_fingerprint: `sha256:${fingerprint({ default_planning_root: 'missing' })}`,
    };
  }
  const sourceRef = path.resolve(input.filePath);
  const loaded = readJsonRecord(sourceRef, 'Current owner delta');
  const candidate = isRecord(loaded.payload.current_owner_delta)
    ? loaded.payload.current_owner_delta
    : loaded.payload;
  const requirements = candidate.required_capability_refs ?? [];
  assertJsonSchemaPayload({
    schemaId: 'opl.profile-capability-plan.current-owner-delta-requirements.v1',
    schema: CAPABILITY_REQUIREMENTS_SCHEMA,
    sourceRef: 'contracts/opl-framework/current-owner-delta.schema.json#/$defs/current_owner_delta_capability_requirement',
  }, requirements);
  const typedRequirements = requirements as CurrentOwnerDeltaCapabilityRequirement[];
  const deltaRef = typeof candidate.delta_ref === 'string' && candidate.delta_ref.trim()
    ? candidate.delta_ref.trim()
    : typeof candidate.delta_id === 'string' && candidate.delta_id.trim()
      ? candidate.delta_id.trim()
      : null;
  const hasIdentity = candidate.surface_kind === 'opl_current_owner_delta'
    && candidate.schema_version === 'current-owner-delta.v1'
    && candidate.default_planning_root === 'current_owner_delta'
    && deltaRef !== null
    && (typeof candidate.domain === 'string' || typeof candidate.domain_id === 'string')
    && typeof candidate.current_owner === 'string'
    && [candidate.task_or_study_ref, candidate.stage_ref, candidate.work_unit_ref]
      .some((value) => typeof value === 'string' && value.trim().length > 0);
  if (!hasIdentity) {
    throw new Error('Current owner delta capability binding is not a canonical bound delta.');
  }
  const duplicateRefs = typedRequirements
    .map((entry) => entry.capability_ref)
    .filter((ref, index, all) => all.indexOf(ref) !== index);
  if (duplicateRefs.length > 0) {
    throw new Error(`Current owner delta repeats capability refs: ${uniqueStrings(duplicateRefs).join(', ')}`);
  }
  const mismatchedRefs = typedRequirements
    .filter((entry) => entry.required_by_delta_ref && entry.required_by_delta_ref !== deltaRef)
    .map((entry) => entry.capability_ref);
  if (mismatchedRefs.length > 0) {
    throw new Error(`Current owner delta requirement binding mismatch: ${mismatchedRefs.join(', ')}`);
  }
  return {
    binding: candidate as CurrentOwnerDeltaCapabilityBinding,
    source_ref: sourceRef,
    source_fingerprint: loaded.source_fingerprint,
    binding_fingerprint: `sha256:${fingerprint(candidate)}`,
  };
}

function capabilityGroups(catalogs: LoadedCatalog[]) {
  const groups = new Map<string, CatalogCapability[]>();
  for (const capability of catalogs.flatMap((catalog) => catalog.capabilities)) {
    const existing = groups.get(capability.entry.capability_ref) ?? [];
    existing.push(capability);
    groups.set(capability.entry.capability_ref, existing);
  }
  return groups;
}

function uniqueCatalogCapabilities(
  groups: Map<string, CatalogCapability[]>,
  requestedCapabilityRefs: string[],
) {
  for (const capabilityRef of requestedCapabilityRefs) {
    const matches = groups.get(capabilityRef) ?? [];
    if (new Set(matches.map((match) => match.identity)).size > 1) {
      throw new Error(`Ambiguous capability ref across catalogs: ${capabilityRef}`);
    }
  }
  return [...groups.values()]
    .filter((matches) => new Set(matches.map((match) => match.identity)).size === 1)
    .map((matches) => matches[0]);
}

function requirementBindingKind(
  capabilityRef: string,
  requirements: CurrentOwnerDeltaCapabilityRequirement[],
): CapabilityBindingKind {
  return requirements.find((entry) => entry.capability_ref === capabilityRef)?.binding_kind ?? 'optional';
}

function ownerCommandActions(
  metadata: CapabilityPlanningMetadata[],
  field: 'environment_action_refs' | 'install_action_refs',
) {
  const actions = metadata.flatMap((entry) => entry[field].map((commandRef) => ({
    command_ref: commandRef,
    cwd: entry.catalog_root,
  })));
  return [...new Map(actions.map((entry) => [
    `${entry.cwd}\0${entry.command_ref}`,
    entry,
  ])).values()];
}

function dependencyFeasibility(metadata: CapabilityPlanningMetadata[]) {
  const dependencyRefs = uniqueStrings(metadata.flatMap((entry) => entry.dependency_refs));
  const descriptorRefs = [...new Map(metadata
    .flatMap((entry) => entry.descriptor_refs)
    .map((entry) => [`${entry.catalog_root}:${entry.descriptor_ref}`, entry])).values()];
  const action = (kind: string, descriptor: PackOsDescriptorRef, suffix: string[]) => ({
    action_kind: kind,
    argv: ['opl', 'pack', 'os', kind, '--descriptor', descriptor.descriptor_ref, ...suffix, '--json'],
    cwd: descriptor.catalog_root,
    descriptor_ref: descriptor.descriptor_ref,
  });
  return {
    surface_kind: 'opl_profile_capability_dependency_feasibility',
    status: 'conditional_actions_not_executed',
    candidate_capability_count: metadata.length,
    candidate_dependency_refs: dependencyRefs,
    candidate_install_actions: ownerCommandActions(metadata, 'install_action_refs'),
    environment_preflight: {
      status: 'not_executed',
      candidate_actions: ownerCommandActions(metadata, 'environment_action_refs'),
      preflight_executed: false,
      dependencies_available_claimed: false,
      environment_ready_claimed: false,
    },
    descriptor_materialization: {
      status: 'not_inspected_or_materialized',
      candidate_descriptor_refs: descriptorRefs,
      candidate_inspect_actions: descriptorRefs.map((descriptor) => action('inspect', descriptor, [])),
      candidate_materialize_actions: descriptorRefs.map((descriptor) => action(
        'install',
        descriptor,
        ['--registry', '<registry>'],
      )),
      selected_capability_descriptor_ref: null,
      descriptor_inspected: false,
      descriptor_materialized: false,
    },
    pack_lock: {
      status: 'not_written',
      write_condition: 'selected_capability_descriptor_materialized',
      candidate_actions: descriptorRefs.map((descriptor) => action(
        'lock',
        descriptor,
        ['--output', '<lock>'],
      )),
      pack_lock_written: false,
    },
    default_side_effects: {
      network_accessed: false,
      sync_executed: false,
      install_executed: false,
      download_executed: false,
      cache_write_executed: false,
    },
    authority_boundary: {
      can_execute_preflight: false,
      can_materialize_descriptor: false,
      can_write_pack_lock: false,
      can_claim_dependency_availability: false,
      can_claim_environment_ready: false,
      can_claim_target_ready: false,
    },
  };
}

export function buildProfileCapabilityPlan(input: ProfileCapabilityPlanInput) {
  const selectionPath = path.resolve(input.selectionFile);
  const selectionSource = readJsonRecord(selectionPath, 'Profile selection file');
  const selection = selectionReceipt(selectionSource.payload);
  const projection = planProjection(selectionSource.payload, selection);
  const selectionFingerprint = fingerprint(selection);
  const projectionFingerprint = fingerprint(projection);
  const delta = currentOwnerDelta({ filePath: input.currentOwnerDeltaFile });
  const deltaRequirements = delta.binding.required_capability_refs ?? [];
  const requestedCapabilityRefs = uniqueStrings([
    ...(input.capabilityRefs ?? []),
    ...projection.exact_capability_refs,
    ...deltaRequirements.map((entry) => entry.capability_ref),
  ]);
  const catalogRepos = uniqueStrings(input.catalogRepos ?? []).map(normalizedRepoRoot);
  const catalogs = catalogRepos.flatMap(loadCatalogRepo);
  const catalogProvenance = catalogs.map((catalog) => catalog.provenance);
  const groups = capabilityGroups(catalogs);
  const uniqueCapabilities = uniqueCatalogCapabilities(groups, requestedCapabilityRefs);
  const registry: CapabilityRegistryCatalog = {
    registry_id: `profile-capability-plan:${fingerprint(catalogProvenance).slice(0, 16)}`,
    owner_modules: uniqueStrings(catalogProvenance.map((entry) => entry.owner)),
    capabilities: uniqueCapabilities.map((capability) => capability.entry),
  };
  const workUnitRef = typeof delta.binding.work_unit_ref === 'string' && delta.binding.work_unit_ref.trim()
    ? delta.binding.work_unit_ref
    : `profile-selection:${selectionFingerprint.slice(0, 16)}`;
  const exactReadout = buildCapabilityRegistryReadout({
    registry,
    currentOwnerDelta: delta.binding,
    requestedCapabilities: requestedCapabilityRefs.map((capabilityRef) => ({
      capabilityRef,
      taskOrStudyRef: typeof delta.binding.task_or_study_ref === 'string'
        ? delta.binding.task_or_study_ref
        : null,
      stageRef: typeof delta.binding.stage_ref === 'string' ? delta.binding.stage_ref : null,
      workUnitRef,
      bindingKind: requirementBindingKind(capabilityRef, deltaRequirements),
    })),
  });
  const resolvedCapabilityRefs = exactReadout.resolutions
    .filter((resolution) => resolution.resolution_status === 'resolved')
    .map((resolution) => resolution.capability_ref);
  const unresolvedOptionalRefs = exactReadout.resolutions
    .filter((resolution) => resolution.resolution_status === 'fail_open')
    .map((resolution) => resolution.capability_ref);
  const resolvedMetadata = resolvedCapabilityRefs.map((capabilityRef) => {
    const match = uniqueCapabilities.find((capability) => capability.entry.capability_ref === capabilityRef);
    if (!match) throw new Error(`Resolved capability metadata is missing: ${capabilityRef}`);
    return match.metadata;
  });
  const dependencyPlan = dependencyFeasibility(resolvedMetadata);
  const requirementBindings = exactReadout.resolutions.map((resolution) => ({
    requirement_ref: resolution.capability_ref,
    capability_ref: resolution.capability_ref,
    binding_kind: resolution.route_required_policy.is_route_required ? 'route_required' : 'optional',
    resolution_status: resolution.resolution_status,
    surface_ref: resolution.selection.surface_ref,
  }));
  const planFingerprint = fingerprint({
    selection_source_fingerprint: selectionSource.source_fingerprint,
    selection_fingerprint: selectionFingerprint,
    projection_fingerprint: projectionFingerprint,
    current_owner_delta: delta,
    catalog_provenance: catalogProvenance,
    requested_capability_refs: requestedCapabilityRefs,
    resolutions: exactReadout.resolutions,
    dependency_feasibility: dependencyPlan,
  });

  return {
    version: 'g2',
    capability_plan: {
      surface_kind: 'opl_profile_capability_plan',
      schema_version: 'profile-capability-plan.v1',
      plan_id: `profile-capability-plan:${planFingerprint.slice(0, 16)}`,
      selection_file_ref: selectionPath,
      selection_source_fingerprint: selectionSource.source_fingerprint,
      selection_fingerprint: `sha256:${selectionFingerprint}`,
      plan_input_fingerprint: `sha256:${projectionFingerprint}`,
      current_owner_delta_binding: delta,
      plan_fingerprint: `sha256:${planFingerprint}`,
      catalog_provenance: catalogProvenance,
      requirement_bindings: requirementBindings,
      missing_optional_requirements: uniqueStrings([
        ...projection.profile_requirement_refs,
        ...unresolvedOptionalRefs,
      ]),
      exact_capability_readout: {
        selected_profile_refs: stringList(selection.selected_profile_refs),
        requested_capability_refs: requestedCapabilityRefs,
        capability_refs: uniqueStrings(resolvedCapabilityRefs),
        resolver_policy: exactReadout.default_behavior,
        catalog_provenance: catalogProvenance,
        resolver_readout: exactReadout,
      },
      route_required_blocker_candidates: exactReadout.resolutions
        .map((resolution) => resolution.blocker_candidate)
        .filter((candidate) => candidate !== null),
      dependency_feasibility: dependencyPlan,
      authority_boundary: {
        refs_only: true,
        can_execute_capability: false,
        can_write_domain_truth: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker_instance: false,
        can_claim_quality_or_export_verdict: false,
        can_claim_target_ready: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}
