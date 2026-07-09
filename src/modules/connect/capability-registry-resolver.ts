export type CapabilityRegistrySourceFamily =
  | 'ars'
  | 'ark'
  | 'aris'
  | 'autosci'
  | 'co_scientist'
  | 'evo'
  | 'light'
  | 'omega_wiki'
  | 'open_auto_research'
  | 'paper_orchestra'
  | 'paper_spine'
  | 'opl_native'
  | string;

export type CapabilityBindingKind = 'optional' | 'route_required';

export type CapabilityHardBoundary =
  | 'source_data_evidence'
  | 'owner_route_identity'
  | 'forbidden_write'
  | 'irreversible_mutation'
  | 'reviewer_publication_hard_gate';

export interface CapabilityRegistryEntry {
  capability_ref: string;
  capability_id: string;
  owner: string;
  source_family: CapabilityRegistrySourceFamily;
  surface_ref: string;
  lifecycle: 'available' | 'candidate' | 'retired' | string;
}

export interface CapabilityRegistryCatalog {
  registry_id: string;
  owner_modules: string[];
  capabilities: CapabilityRegistryEntry[];
}

export interface CurrentOwnerDeltaCapabilityRequirement {
  capability_ref: string;
  binding_kind: CapabilityBindingKind;
  hard_boundary?: CapabilityHardBoundary | null;
  required_by_delta_ref?: string | null;
}

export interface CurrentOwnerDeltaCapabilityBinding {
  surface_kind?: string;
  schema_version?: string;
  default_planning_root?: string;
  delta_ref?: string;
  delta_id?: string;
  domain?: string;
  task_or_study_ref?: string | null;
  stage_ref?: string | null;
  domain_id?: string;
  work_unit_ref?: string;
  current_owner?: string;
  required_capability_refs?: CurrentOwnerDeltaCapabilityRequirement[];
}

export interface DomainPackExternalLearningCapabilityRef {
  capability_ref: string;
  source_family: CapabilityRegistrySourceFamily;
  task_or_study_ref?: string | null;
  stage_ref?: string | null;
  work_unit_ref?: string;
  binding_kind?: CapabilityBindingKind;
  surface_ref?: string | null;
}

export interface CapabilityResolutionRequest {
  registry: CapabilityRegistryCatalog;
  currentOwnerDelta: CurrentOwnerDeltaCapabilityBinding;
  capabilityRef: string;
  taskOrStudyRef?: string | null;
  stageRef?: string | null;
  workUnitRef?: string;
  bindingKind?: CapabilityBindingKind;
  declaredSourceFamily?: CapabilityRegistrySourceFamily | null;
  declaredSurfaceRef?: string | null;
}

export interface CapabilityRegistryAuthorityBoundary {
  can_execute_capability: false;
  can_write_domain_truth: false;
  can_sign_owner_receipt: false;
  can_create_domain_typed_blocker: false;
  can_claim_quality_or_export_verdict: false;
  can_create_domain_local_selector: false;
  can_create_always_on_sidecar: false;
  can_create_default_preflight: false;
  can_create_second_active_backlog: false;
}

export interface CapabilityRegistryBlockerCandidate {
  candidate_kind: 'typed_blocker_candidate';
  candidate_id: string;
  blocker_policy: 'route_required_current_owner_delta_hard_boundary_missing_ref';
  missing_capability_ref: string;
  current_owner_delta_ref: string;
  work_unit_ref: string;
  route_back_owner: string;
  may_create_domain_typed_blocker: false;
  repair_action: 'domain_or_gate_owner_must_supply_capability_ref_or_signed_typed_blocker';
}

export type CapabilityInvocationLifecycleLayerId = 'soft_discovery' | 'scored_fit' | 'hard_gate';

export interface CapabilityInvocationLifecycleLayer {
  layer_id: CapabilityInvocationLifecycleLayerId;
  owner_modules: string[];
  authority_role:
    | 'high_recall_advisory_discovery'
    | 'explainable_fit_advisory_not_authority'
    | 'fail_closed_current_owner_delta_gate';
  source_surfaces: string[];
  fail_closed_on: string[];
  forbidden_claims: string[];
  authority_surface: string | null;
  runway_can_write_domain_truth: false;
  runway_can_sign_owner_receipt: false;
  runway_can_create_typed_blocker: false;
}

export interface CapabilityInvocationLifecyclePolicy {
  surface_kind: 'opl_capability_invocation_lifecycle_policy';
  schema_version: 'capability-invocation-lifecycle.v1';
  soft_discovery: CapabilityInvocationLifecycleLayer;
  scored_fit: CapabilityInvocationLifecycleLayer;
  hard_gate: CapabilityInvocationLifecycleLayer;
}

export interface CapabilityRegistryResolution {
  surface_kind: 'opl_capability_registry_resolution';
  schema_version: 'capability-registry-resolver.v1';
  resolver_policy: 'current_delta_bound_jit_or_fail_open';
  capability_ref: string;
  task_or_study_ref: string | null;
  stage_ref: string | null;
  work_unit_ref: string;
  resolution_status: 'resolved' | 'fail_open' | 'route_required_blocker_candidate';
  current_owner_delta_binding: {
    bound: boolean;
    default_planning_root: 'current_owner_delta' | 'missing';
    current_owner_delta_ref: string | null;
    domain: string | null;
    task_or_study_ref: string | null;
    stage_ref: string | null;
    domain_id: string | null;
    current_owner: string | null;
  };
  selection: {
    action: 'select_capability_ref' | 'advisory_or_audit' | 'route_required_blocker_candidate';
    capability_found: boolean;
    capability_ref: string;
    source_family: string | null;
    surface_ref: string | null;
  };
  route_required_policy: {
    is_route_required: boolean;
    hard_boundary: CapabilityHardBoundary | null;
    policy: 'optional_missing_fail_open' | 'route_required_current_owner_delta_hard_boundary_missing_ref' | 'capability_ref_resolved';
  };
  blocker_candidate: CapabilityRegistryBlockerCandidate | null;
  authority_boundary: CapabilityRegistryAuthorityBoundary;
}

export interface CapabilityRegistryReadoutRequest {
  registry: CapabilityRegistryCatalog;
  currentOwnerDelta: CurrentOwnerDeltaCapabilityBinding;
  requestedCapabilities: Array<{
    capabilityRef: string;
    taskOrStudyRef?: string | null;
    stageRef?: string | null;
    workUnitRef?: string;
    bindingKind?: CapabilityBindingKind;
  }>;
  domainPackExternalLearningRefs?: DomainPackExternalLearningCapabilityRef[];
}

export interface CapabilityRegistryReadout {
  surface_kind: 'opl_capability_registry_readout';
  schema_version: 'capability-registry-resolver.v1';
  owner_modules: ['atlas', 'pack', 'stagecraft', 'runway'];
  default_behavior: 'current_owner_delta_bound_jit_or_fail_open';
  resolver_abi_ref: 'contracts/opl-framework/capability-registry-resolver.schema.json';
  lifecycle_layers: CapabilityInvocationLifecycleLayer[];
  invocation_lifecycle_policy: CapabilityInvocationLifecyclePolicy;
  source_families: string[];
  summary: {
    requested_count: number;
    resolved_count: number;
    fail_open_count: number;
    blocker_candidate_count: number;
  };
  domain_pack_external_learning_refs: {
    consumed_count: number;
    resolved_count: number;
    fail_open_count: number;
    blocker_candidate_count: number;
    source_families: string[];
  };
  resolutions: CapabilityRegistryResolution[];
  domain_local_selector_created: false;
  always_on_sidecar_created: false;
  default_preflight_created: false;
  second_active_backlog_created: false;
  authority_boundary: CapabilityRegistryAuthorityBoundary;
}

const AUTHORITY_BOUNDARY: CapabilityRegistryAuthorityBoundary = {
  can_execute_capability: false,
  can_write_domain_truth: false,
  can_sign_owner_receipt: false,
  can_create_domain_typed_blocker: false,
  can_claim_quality_or_export_verdict: false,
  can_create_domain_local_selector: false,
  can_create_always_on_sidecar: false,
  can_create_default_preflight: false,
  can_create_second_active_backlog: false,
};

const CAPABILITY_INVOCATION_LIFECYCLE: CapabilityInvocationLifecyclePolicy = {
  surface_kind: 'opl_capability_invocation_lifecycle_policy',
  schema_version: 'capability-invocation-lifecycle.v1',
  soft_discovery: {
    layer_id: 'soft_discovery',
    owner_modules: ['atlas', 'pack'],
    authority_role: 'high_recall_advisory_discovery',
    source_surfaces: [
      'contracts/opl-framework/brand-module-surfaces.json#modules.atlas',
      'contracts/opl-framework/brand-module-surfaces.json#modules.pack',
      'domain_contract:agent_tool_arsenal',
    ],
    fail_closed_on: [],
    forbidden_claims: [
      'catalog_executes_actions',
      'capability_registry_owns_domain_authority',
    ],
    authority_surface: null,
    runway_can_write_domain_truth: false,
    runway_can_sign_owner_receipt: false,
    runway_can_create_typed_blocker: false,
  },
  scored_fit: {
    layer_id: 'scored_fit',
    owner_modules: ['pack', 'stagecraft'],
    authority_role: 'explainable_fit_advisory_not_authority',
    source_surfaces: [
      'contracts/opl-framework/capability-registry-resolver.schema.json',
      'contracts/opl-framework/stage-run-kernel-contract.json',
      'contracts/opl-framework/brand-module-surfaces.json#modules.stagecraft',
    ],
    fail_closed_on: [],
    forbidden_claims: [
      'capability_use_policy_is_quality_verdict',
      'capability_registry_missing_optional_ref_blocks_stage',
    ],
    authority_surface: null,
    runway_can_write_domain_truth: false,
    runway_can_sign_owner_receipt: false,
    runway_can_create_typed_blocker: false,
  },
  hard_gate: {
    layer_id: 'hard_gate',
    owner_modules: ['current_owner_delta', 'stagecraft', 'runway'],
    authority_role: 'fail_closed_current_owner_delta_gate',
    source_surfaces: [
      'contracts/opl-framework/current-owner-delta.schema.json',
      'contracts/opl-framework/stage-run-kernel-contract.json',
      'contracts/opl-framework/brand-module-surfaces.json#modules.runway',
    ],
    fail_closed_on: [
      'route_required_missing_capability_ref',
      'current_owner_delta_missing',
      'owner_route_identity_mismatch',
      'forbidden_write_or_irreversible_mutation',
    ],
    forbidden_claims: [
      'runway_writes_domain_truth',
      'runway_signs_owner_receipt',
      'runway_creates_typed_blocker',
    ],
    authority_surface: 'current_owner_delta',
    runway_can_write_domain_truth: false,
    runway_can_sign_owner_receipt: false,
    runway_can_create_typed_blocker: false,
  },
};

const CAPABILITY_INVOCATION_LIFECYCLE_LAYERS = [
  CAPABILITY_INVOCATION_LIFECYCLE.soft_discovery,
  CAPABILITY_INVOCATION_LIFECYCLE.scored_fit,
  CAPABILITY_INVOCATION_LIFECYCLE.hard_gate,
];

const HARD_BOUNDARIES = new Set<CapabilityHardBoundary>([
  'source_data_evidence',
  'owner_route_identity',
  'forbidden_write',
  'irreversible_mutation',
  'reviewer_publication_hard_gate',
]);

function currentOwnerDeltaRef(delta: CurrentOwnerDeltaCapabilityBinding) {
  return nonEmptyString(delta.delta_ref) ?? nonEmptyString(delta.delta_id);
}

function nonEmptyString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function currentOwnerDeltaIdentity(delta: CurrentOwnerDeltaCapabilityBinding) {
  return {
    domain: nonEmptyString(delta.domain) ?? nonEmptyString(delta.domain_id),
    taskOrStudyRef: nonEmptyString(delta.task_or_study_ref) ?? nonEmptyString(delta.work_unit_ref),
    stageRef: nonEmptyString(delta.stage_ref),
    legacyWorkUnitRef: nonEmptyString(delta.work_unit_ref),
  };
}

function requestIdentity(request: Pick<
  CapabilityResolutionRequest,
  'taskOrStudyRef' | 'stageRef' | 'workUnitRef'
>) {
  const taskOrStudyRef = nonEmptyString(request.taskOrStudyRef) ?? nonEmptyString(request.workUnitRef);
  const stageRef = nonEmptyString(request.stageRef);
  const workUnitRef = taskOrStudyRef ?? stageRef;
  if (!workUnitRef) {
    throw new TypeError('Capability resolution requires taskOrStudyRef, stageRef, or legacy workUnitRef.');
  }
  return { taskOrStudyRef, stageRef, workUnitRef };
}

function matchingRequirement(
  delta: CurrentOwnerDeltaCapabilityBinding,
  capabilityRef: string,
): CurrentOwnerDeltaCapabilityRequirement | null {
  const deltaRef = currentOwnerDeltaRef(delta);
  return (delta.required_capability_refs ?? []).find((entry) => (
    entry.capability_ref === capabilityRef
    && (!nonEmptyString(entry.required_by_delta_ref) || nonEmptyString(entry.required_by_delta_ref) === deltaRef)
  )) ?? null;
}

function routeRequiredRequirement(
  delta: CurrentOwnerDeltaCapabilityBinding,
  capabilityRef: string,
  bindingKind: CapabilityBindingKind,
) {
  const requirement = matchingRequirement(delta, capabilityRef);
  if (requirement?.binding_kind === 'route_required') {
    return requirement;
  }
  if (bindingKind === 'route_required') {
    return requirement ?? {
      capability_ref: capabilityRef,
      binding_kind: 'route_required',
      hard_boundary: null,
      required_by_delta_ref: currentOwnerDeltaRef(delta),
    };
  }
  return null;
}

function hardBoundaryOf(requirement: CurrentOwnerDeltaCapabilityRequirement | null) {
  const hardBoundary = requirement?.hard_boundary ?? null;
  return hardBoundary && HARD_BOUNDARIES.has(hardBoundary) ? hardBoundary : null;
}

function isCurrentOwnerDeltaBound(
  delta: CurrentOwnerDeltaCapabilityBinding,
  identity: ReturnType<typeof requestIdentity>,
) {
  if (delta.default_planning_root !== 'current_owner_delta' || !currentOwnerDeltaRef(delta)) {
    return false;
  }
  const deltaIdentity = currentOwnerDeltaIdentity(delta);
  const hasCanonicalBinding = nonEmptyString(delta.task_or_study_ref) !== null
    || nonEmptyString(delta.stage_ref) !== null;
  if (!hasCanonicalBinding) {
    return !deltaIdentity.legacyWorkUnitRef || deltaIdentity.legacyWorkUnitRef === identity.workUnitRef;
  }
  const taskBound = !deltaIdentity.taskOrStudyRef
    || deltaIdentity.taskOrStudyRef === identity.taskOrStudyRef;
  const stageBound = !deltaIdentity.stageRef
    || deltaIdentity.stageRef === identity.stageRef
    || (!identity.stageRef && deltaIdentity.stageRef === identity.workUnitRef);
  return taskBound && stageBound;
}

function uniqSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry && entry.length > 0)))].sort();
}

function resolutionCounts(resolutions: CapabilityRegistryResolution[]) {
  return {
    requested_count: resolutions.length,
    resolved_count: resolutions.filter((entry) => entry.resolution_status === 'resolved').length,
    fail_open_count: resolutions.filter((entry) => entry.resolution_status === 'fail_open').length,
    blocker_candidate_count: resolutions.filter((entry) =>
      entry.resolution_status === 'route_required_blocker_candidate'
    ).length,
  };
}

function blockerCandidate(input: {
  capabilityRef: string;
  currentOwnerDelta: CurrentOwnerDeltaCapabilityBinding;
  workUnitRef: string;
}): CapabilityRegistryBlockerCandidate {
  return {
    candidate_kind: 'typed_blocker_candidate',
    candidate_id: `capability_ref_missing:${input.capabilityRef}`,
    blocker_policy: 'route_required_current_owner_delta_hard_boundary_missing_ref',
    missing_capability_ref: input.capabilityRef,
    current_owner_delta_ref: currentOwnerDeltaRef(input.currentOwnerDelta) ?? 'missing_current_owner_delta_ref',
    work_unit_ref: input.workUnitRef,
    route_back_owner: input.currentOwnerDelta.current_owner ?? input.currentOwnerDelta.domain_id ?? 'domain_or_gate_owner',
    may_create_domain_typed_blocker: false,
    repair_action: 'domain_or_gate_owner_must_supply_capability_ref_or_signed_typed_blocker',
  };
}

export function resolveCapabilityForCurrentDelta(
  request: CapabilityResolutionRequest,
): CapabilityRegistryResolution {
  const identity = requestIdentity(request);
  const deltaIdentity = currentOwnerDeltaIdentity(request.currentOwnerDelta);
  const bindingKind = request.bindingKind ?? 'optional';
  const found = request.registry.capabilities.find((entry) => entry.capability_ref === request.capabilityRef) ?? null;
  const routeRequirement = routeRequiredRequirement(request.currentOwnerDelta, request.capabilityRef, bindingKind);
  const hardBoundary = hardBoundaryOf(routeRequirement);
  const bound = isCurrentOwnerDeltaBound(request.currentOwnerDelta, identity);
  const missingRouteRequired = !found && bound && Boolean(routeRequirement) && Boolean(hardBoundary);
  const status = found
    ? 'resolved'
    : missingRouteRequired
      ? 'route_required_blocker_candidate'
      : 'fail_open';
  const action = found
    ? 'select_capability_ref'
    : missingRouteRequired
      ? 'route_required_blocker_candidate'
      : 'advisory_or_audit';

  return {
    surface_kind: 'opl_capability_registry_resolution',
    schema_version: 'capability-registry-resolver.v1',
    resolver_policy: 'current_delta_bound_jit_or_fail_open',
    capability_ref: request.capabilityRef,
    task_or_study_ref: identity.taskOrStudyRef,
    stage_ref: identity.stageRef,
    work_unit_ref: identity.workUnitRef,
    resolution_status: status,
    current_owner_delta_binding: {
      bound,
      default_planning_root: request.currentOwnerDelta.default_planning_root === 'current_owner_delta'
        ? 'current_owner_delta'
        : 'missing',
      current_owner_delta_ref: currentOwnerDeltaRef(request.currentOwnerDelta),
      domain: deltaIdentity.domain,
      task_or_study_ref: deltaIdentity.taskOrStudyRef,
      stage_ref: deltaIdentity.stageRef,
      domain_id: deltaIdentity.domain,
      current_owner: request.currentOwnerDelta.current_owner ?? null,
    },
    selection: {
      action,
      capability_found: Boolean(found),
      capability_ref: request.capabilityRef,
      source_family: found?.source_family ?? request.declaredSourceFamily ?? null,
      surface_ref: found?.surface_ref ?? request.declaredSurfaceRef ?? null,
    },
    route_required_policy: {
      is_route_required: Boolean(routeRequirement),
      hard_boundary: hardBoundary,
      policy: found
        ? 'capability_ref_resolved'
        : missingRouteRequired
          ? 'route_required_current_owner_delta_hard_boundary_missing_ref'
          : 'optional_missing_fail_open',
    },
    blocker_candidate: missingRouteRequired
      ? blockerCandidate({
        capabilityRef: request.capabilityRef,
        currentOwnerDelta: request.currentOwnerDelta,
        workUnitRef: identity.workUnitRef,
      })
      : null,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildCapabilityRegistryReadout(
  request: CapabilityRegistryReadoutRequest,
): CapabilityRegistryReadout {
  const requestedResolutions = request.requestedCapabilities.map((entry) =>
    resolveCapabilityForCurrentDelta({
      registry: request.registry,
      currentOwnerDelta: request.currentOwnerDelta,
      capabilityRef: entry.capabilityRef,
      taskOrStudyRef: entry.taskOrStudyRef,
      stageRef: entry.stageRef,
      workUnitRef: entry.workUnitRef,
      bindingKind: entry.bindingKind,
    })
  );
  const domainPackExternalLearningResolutions = (request.domainPackExternalLearningRefs ?? []).map((entry) =>
    resolveCapabilityForCurrentDelta({
      registry: request.registry,
      currentOwnerDelta: request.currentOwnerDelta,
      capabilityRef: entry.capability_ref,
      taskOrStudyRef: entry.task_or_study_ref,
      stageRef: entry.stage_ref,
      workUnitRef: entry.work_unit_ref,
      bindingKind: entry.binding_kind,
      declaredSourceFamily: entry.source_family,
      declaredSurfaceRef: entry.surface_ref,
    })
  );
  const resolutions = [
    ...requestedResolutions,
    ...domainPackExternalLearningResolutions,
  ];
  const summary = resolutionCounts(resolutions);
  const externalLearningSummary = resolutionCounts(domainPackExternalLearningResolutions);

  return {
    surface_kind: 'opl_capability_registry_readout',
    schema_version: 'capability-registry-resolver.v1',
    owner_modules: ['atlas', 'pack', 'stagecraft', 'runway'],
    default_behavior: 'current_owner_delta_bound_jit_or_fail_open',
    resolver_abi_ref: 'contracts/opl-framework/capability-registry-resolver.schema.json',
    lifecycle_layers: CAPABILITY_INVOCATION_LIFECYCLE_LAYERS,
    invocation_lifecycle_policy: CAPABILITY_INVOCATION_LIFECYCLE,
    source_families: uniqSorted([
      ...request.registry.capabilities.map((entry) => entry.source_family),
      ...domainPackExternalLearningResolutions.map((entry) => entry.selection.source_family),
    ]),
    summary,
    domain_pack_external_learning_refs: {
      consumed_count: externalLearningSummary.requested_count,
      resolved_count: externalLearningSummary.resolved_count,
      fail_open_count: externalLearningSummary.fail_open_count,
      blocker_candidate_count: externalLearningSummary.blocker_candidate_count,
      source_families: uniqSorted(domainPackExternalLearningResolutions.map((entry) => entry.selection.source_family)),
    },
    resolutions,
    domain_local_selector_created: false,
    always_on_sidecar_created: false,
    default_preflight_created: false,
    second_active_backlog_created: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
