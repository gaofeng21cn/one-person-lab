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
  domain_id?: string;
  work_unit_ref?: string;
  current_owner?: string;
  required_capability_refs?: CurrentOwnerDeltaCapabilityRequirement[];
}

export interface CapabilityResolutionRequest {
  registry: CapabilityRegistryCatalog;
  currentOwnerDelta: CurrentOwnerDeltaCapabilityBinding;
  capabilityRef: string;
  workUnitRef: string;
  bindingKind?: CapabilityBindingKind;
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

export interface CapabilityRegistryResolution {
  surface_kind: 'opl_capability_registry_resolution';
  schema_version: 'capability-registry-resolver.v1';
  resolver_policy: 'current_delta_bound_jit_or_fail_open';
  capability_ref: string;
  work_unit_ref: string;
  resolution_status: 'resolved' | 'fail_open' | 'route_required_blocker_candidate';
  current_owner_delta_binding: {
    bound: boolean;
    default_planning_root: 'current_owner_delta' | 'missing';
    current_owner_delta_ref: string | null;
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
    workUnitRef: string;
    bindingKind?: CapabilityBindingKind;
  }>;
}

export interface CapabilityRegistryReadout {
  surface_kind: 'opl_capability_registry_readout';
  schema_version: 'capability-registry-resolver.v1';
  owner_modules: ['atlas', 'pack', 'stagecraft'];
  default_behavior: 'current_owner_delta_bound_jit_or_fail_open';
  resolver_abi_ref: 'contracts/opl-framework/capability-registry-resolver.schema.json';
  source_families: string[];
  summary: {
    requested_count: number;
    resolved_count: number;
    fail_open_count: number;
    blocker_candidate_count: number;
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

const HARD_BOUNDARIES = new Set<CapabilityHardBoundary>([
  'source_data_evidence',
  'owner_route_identity',
  'forbidden_write',
  'irreversible_mutation',
  'reviewer_publication_hard_gate',
]);

function currentOwnerDeltaRef(delta: CurrentOwnerDeltaCapabilityBinding) {
  return delta.delta_ref ?? delta.delta_id ?? null;
}

function matchingRequirement(
  delta: CurrentOwnerDeltaCapabilityBinding,
  capabilityRef: string,
): CurrentOwnerDeltaCapabilityRequirement | null {
  return (delta.required_capability_refs ?? []).find((entry) => entry.capability_ref === capabilityRef) ?? null;
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

function isCurrentOwnerDeltaBound(delta: CurrentOwnerDeltaCapabilityBinding, workUnitRef: string) {
  return delta.default_planning_root === 'current_owner_delta'
    && Boolean(currentOwnerDeltaRef(delta))
    && (!delta.work_unit_ref || delta.work_unit_ref === workUnitRef);
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
  const bindingKind = request.bindingKind ?? 'optional';
  const found = request.registry.capabilities.find((entry) => entry.capability_ref === request.capabilityRef) ?? null;
  const routeRequirement = routeRequiredRequirement(request.currentOwnerDelta, request.capabilityRef, bindingKind);
  const hardBoundary = hardBoundaryOf(routeRequirement);
  const bound = isCurrentOwnerDeltaBound(request.currentOwnerDelta, request.workUnitRef);
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
    work_unit_ref: request.workUnitRef,
    resolution_status: status,
    current_owner_delta_binding: {
      bound,
      default_planning_root: request.currentOwnerDelta.default_planning_root === 'current_owner_delta'
        ? 'current_owner_delta'
        : 'missing',
      current_owner_delta_ref: currentOwnerDeltaRef(request.currentOwnerDelta),
      domain_id: request.currentOwnerDelta.domain_id ?? null,
      current_owner: request.currentOwnerDelta.current_owner ?? null,
    },
    selection: {
      action,
      capability_found: Boolean(found),
      capability_ref: request.capabilityRef,
      source_family: found?.source_family ?? null,
      surface_ref: found?.surface_ref ?? null,
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
        workUnitRef: request.workUnitRef,
      })
      : null,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildCapabilityRegistryReadout(
  request: CapabilityRegistryReadoutRequest,
): CapabilityRegistryReadout {
  const resolutions = request.requestedCapabilities.map((entry) =>
    resolveCapabilityForCurrentDelta({
      registry: request.registry,
      currentOwnerDelta: request.currentOwnerDelta,
      capabilityRef: entry.capabilityRef,
      workUnitRef: entry.workUnitRef,
      bindingKind: entry.bindingKind,
    })
  );

  return {
    surface_kind: 'opl_capability_registry_readout',
    schema_version: 'capability-registry-resolver.v1',
    owner_modules: ['atlas', 'pack', 'stagecraft'],
    default_behavior: 'current_owner_delta_bound_jit_or_fail_open',
    resolver_abi_ref: 'contracts/opl-framework/capability-registry-resolver.schema.json',
    source_families: [...new Set(
      request.registry.capabilities
        .map((entry) => entry.source_family)
        .filter((entry) => entry.length > 0),
    )].sort(),
    summary: {
      requested_count: resolutions.length,
      resolved_count: resolutions.filter((entry) => entry.resolution_status === 'resolved').length,
      fail_open_count: resolutions.filter((entry) => entry.resolution_status === 'fail_open').length,
      blocker_candidate_count: resolutions.filter((entry) =>
        entry.resolution_status === 'route_required_blocker_candidate'
      ).length,
    },
    resolutions,
    domain_local_selector_created: false,
    always_on_sidecar_created: false,
    default_preflight_created: false,
    second_active_backlog_created: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
