import {
  record,
  recordList,
  stringList,
  stringValue as optionalString,
  uniqueStringList,
} from '../../kernel/json-record.ts';
import {
  runtimeDomainAliases,
  type FamilyRuntimeDomainId,
} from './family-runtime-types.ts';

type CapabilityHardBoundary = import('../connect/index.ts').CapabilityHardBoundary;
type CapabilityRegistryReadout = import('../connect/index.ts').CapabilityRegistryReadout;
type CapabilityRegistryResolution = import('../connect/index.ts').CapabilityRegistryResolution;
type CurrentOwnerDeltaCapabilityBinding = import('../connect/index.ts').CurrentOwnerDeltaCapabilityBinding;
type CurrentOwnerDeltaCapabilityRequirement = import('../connect/index.ts').CurrentOwnerDeltaCapabilityRequirement;

const CAPABILITY_HARD_BOUNDARIES = new Set<CapabilityHardBoundary>([
  'source_data_evidence',
  'owner_route_identity',
  'forbidden_write',
  'irreversible_mutation',
  'reviewer_publication_hard_gate',
]);

const CAPABILITY_ACTION_BOUNDARIES = new Set<CapabilityHardBoundary>([
  'owner_route_identity',
  'forbidden_write',
  'irreversible_mutation',
]);

function normalize(value: string) {
  return value.trim().toLowerCase().replaceAll('_', '-');
}

function domainAliases(domainId: FamilyRuntimeDomainId) {
  return new Set(runtimeDomainAliases(domainId).map(normalize));
}

export type CapabilityRegistryStageContextInput = {
  lifecyclePhase: 'planning' | 'execution';
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  taskId?: string | null;
  currentOwnerDelta?: CurrentOwnerDeltaCapabilityBinding | null;
  rawRouteRequiredHardBoundaryCapabilityRefs?: string[];
  unprovenExplicitCapabilityBinding?: boolean;
  unprovenExplicitCapabilityRefs?: string[];
  capabilityRegistryReadout?: CapabilityRegistryReadout | null;
  capabilityRegistryResolutionReceipts?: CapabilityRegistryResolution[];
  capabilityRegistryReadoutRef?: string | null;
  capabilityRegistryResolutionReceiptRefs?: string[];
};

export type CapabilityRegistryStageContextReceipt = {
  surface_kind: 'opl_capability_registry_stage_context_receipt';
  version: 'opl-capability-registry-stage-context.v1';
  receipt_ref: string;
  observer_owner: 'opl_runtime';
  lifecycle_phase: 'planning' | 'execution';
  status: 'observed' | 'not_applicable';
  advisory_reason: string | null;
  typed_input_status: {
    current_owner_delta: 'consumed' | 'missing';
    capability_registry_readout: 'consumed' | 'missing';
    capability_registry_resolution_receipt_count: number;
    unproven_explicit_capability_binding: boolean;
  };
  input_refs: {
    current_owner_delta_ref: string | null;
    capability_registry_readout_ref: string | null;
    capability_registry_resolution_receipt_refs: string[];
  };
  route_required_hard_boundary_capability_refs: string[];
  resolved_capability_refs: string[];
  optional_fail_open_capability_refs: string[];
  unavailable_capability_refs: string[];
  binding_missing_capability_refs: string[];
  progression_effect: 'advisory_only_stage_may_start';
  authority_boundary: {
    opl: 'refs_only_stage_context_projection';
    registry: 'precomputed_typed_resolution_or_readout_input_only';
    can_execute_capability: false;
    can_write_domain_truth: false;
    can_sign_owner_receipt: false;
    can_create_domain_typed_blocker: false;
    can_claim_quality_or_export_verdict: false;
  };
};

function currentOwnerDeltaRef(delta: CurrentOwnerDeltaCapabilityBinding | null | undefined) {
  return optionalString(delta?.delta_ref) ?? optionalString(delta?.delta_id);
}

function hardBoundary(value: unknown): CapabilityHardBoundary | null {
  const boundary = optionalString(value) as CapabilityHardBoundary | null;
  return boundary && CAPABILITY_HARD_BOUNDARIES.has(boundary) ? boundary : null;
}

function launchBlockingBoundary(value: unknown): CapabilityHardBoundary | null {
  const boundary = hardBoundary(value);
  return boundary && CAPABILITY_ACTION_BOUNDARIES.has(boundary) ? boundary : null;
}

function typedCapabilityRequirement(value: unknown): value is CurrentOwnerDeltaCapabilityRequirement {
  const candidate = record(value);
  const bindingKind = optionalString(candidate.binding_kind);
  if (!optionalString(candidate.capability_ref)
    || (bindingKind !== 'optional' && bindingKind !== 'route_required')) {
    return false;
  }
  if (bindingKind === 'route_required') {
    return Boolean(hardBoundary(candidate.hard_boundary));
  }
  return candidate.hard_boundary === undefined
    || candidate.hard_boundary === null
    || Boolean(hardBoundary(candidate.hard_boundary));
}

function typedCurrentOwnerDelta(value: unknown): CurrentOwnerDeltaCapabilityBinding | null {
  const candidate = record(value);
  const domain = optionalString(candidate.domain) ?? optionalString(candidate.domain_id);
  const taskOrStudyRef = optionalString(candidate.task_or_study_ref) ?? optionalString(candidate.work_unit_ref);
  if (candidate.surface_kind !== 'opl_current_owner_delta'
    || candidate.schema_version !== 'current-owner-delta.v1'
    || candidate.default_planning_root !== 'current_owner_delta'
    || !(optionalString(candidate.delta_ref) ?? optionalString(candidate.delta_id))
    || !domain
    || !optionalString(candidate.current_owner)
    || (candidate.task_or_study_ref !== undefined
      && candidate.task_or_study_ref !== null
      && !optionalString(candidate.task_or_study_ref))
    || (candidate.stage_ref !== undefined
      && candidate.stage_ref !== null
      && !optionalString(candidate.stage_ref))
    || (candidate.work_unit_ref !== undefined
      && candidate.work_unit_ref !== null
      && !optionalString(candidate.work_unit_ref))
    || (!taskOrStudyRef && !optionalString(candidate.stage_ref))) {
    return null;
  }
  if (candidate.required_capability_refs !== undefined
    && (!Array.isArray(candidate.required_capability_refs)
      || !candidate.required_capability_refs.every(typedCapabilityRequirement))) {
    return null;
  }
  return candidate as CurrentOwnerDeltaCapabilityBinding;
}

function typedCapabilityResolution(value: unknown): CapabilityRegistryResolution | null {
  const candidate = record(value);
  const binding = record(candidate.current_owner_delta_binding);
  const selection = record(candidate.selection);
  const policy = record(candidate.route_required_policy);
  const status = optionalString(candidate.resolution_status);
  const capabilityRef = optionalString(candidate.capability_ref);
  const routeRequired = policy.is_route_required;
  const policyHardBoundary = hardBoundary(policy.hard_boundary);
  const nullableRef = (candidateValue: unknown) => (
    candidateValue === null || optionalString(candidateValue) !== null
  );
  if (candidate.surface_kind !== 'opl_capability_registry_resolution'
    || candidate.schema_version !== 'capability-registry-resolver.v1'
    || !capabilityRef
    || !['resolved', 'fail_open', 'route_required_blocker_candidate'].includes(status ?? '')
    || !nullableRef(candidate.task_or_study_ref)
    || !nullableRef(candidate.stage_ref)
    || !optionalString(candidate.work_unit_ref)
    || typeof binding.bound !== 'boolean'
    || !['current_owner_delta', 'missing'].includes(optionalString(binding.default_planning_root) ?? '')
    || !nullableRef(binding.current_owner_delta_ref)
    || !nullableRef(binding.domain)
    || !nullableRef(binding.domain_id)
    || !nullableRef(binding.task_or_study_ref)
    || !nullableRef(binding.stage_ref)
    || !nullableRef(binding.current_owner)
    || typeof selection.capability_found !== 'boolean'
    || optionalString(selection.capability_ref) !== capabilityRef
    || typeof routeRequired !== 'boolean'
    || (routeRequired ? !policyHardBoundary : policy.hard_boundary !== null)) {
    return null;
  }
  return candidate as unknown as CapabilityRegistryResolution;
}

function typedCapabilityReadout(value: unknown): CapabilityRegistryReadout | null {
  const candidate = record(value);
  if (candidate.surface_kind !== 'opl_capability_registry_readout'
    || candidate.schema_version !== 'capability-registry-resolver.v1'
    || !Array.isArray(candidate.resolutions)) {
    return null;
  }
  const resolutions = candidate.resolutions.map(typedCapabilityResolution);
  if (resolutions.some((entry) => entry === null)) {
    return null;
  }
  return candidate as unknown as CapabilityRegistryReadout;
}

function rawResolutionProvesOptionalOnly(value: unknown) {
  const candidate = record(value);
  const policy = record(candidate.route_required_policy);
  const status = optionalString(candidate.resolution_status);
  return Boolean(optionalString(candidate.capability_ref))
    && (status === 'resolved' || status === 'fail_open')
    && policy.is_route_required === false
    && (policy.hard_boundary === null || policy.hard_boundary === undefined)
    && (candidate.blocker_candidate === null || candidate.blocker_candidate === undefined);
}

function rawReadoutProvesOptionalOnly(value: unknown) {
  const resolutions = record(value).resolutions;
  return Array.isArray(resolutions) && resolutions.every(rawResolutionProvesOptionalOnly);
}

function rawCurrentOwnerDeltaUnprovenBinding(value: unknown) {
  const candidate = record(value);
  if (!Object.hasOwn(candidate, 'required_capability_refs')) {
    return { unproven: false, capabilityRefs: [] as string[] };
  }
  const requirements = candidate.required_capability_refs;
  if (!Array.isArray(requirements)) {
    return {
      unproven: true,
      capabilityRefs: uniqueStringList([optionalString(record(requirements).capability_ref)]).sort(),
    };
  }
  const unprovenRequirements = requirements.filter((requirement) => (
    optionalString(record(requirement).binding_kind) !== 'optional'
  ));
  return {
    unproven: unprovenRequirements.length > 0,
    capabilityRefs: uniqueStringList(
      unprovenRequirements.map((requirement) => optionalString(record(requirement).capability_ref)),
    ).sort(),
  };
}

function rawRouteRequiredHardBoundaryCapabilityRefs(value: unknown) {
  return uniqueStringList(
    recordList(record(value).required_capability_refs)
      .filter((requirement) => (
        requirement.binding_kind === 'route_required'
        && Boolean(launchBlockingBoundary(requirement.hard_boundary))
      ))
      .map((requirement) => optionalString(requirement.capability_ref)),
  ).sort();
}

export function capabilityRegistryStageContextInputFromPayload(
  payload: Record<string, unknown>,
  context: Pick<CapabilityRegistryStageContextInput, 'domainId' | 'stageId' | 'taskId'>,
): CapabilityRegistryStageContextInput | null {
  const explicitInputKeys = [
    'current_owner_delta',
    'capability_registry_readout',
    'capability_registry_resolution',
    'capability_registry_resolution_receipts',
    'capability_registry_readout_ref',
    'capability_registry_resolution_receipt_ref',
    'capability_registry_resolution_receipt_refs',
  ];
  if (!explicitInputKeys.some((key) => Object.hasOwn(payload, key))) {
    return null;
  }
  const hasCurrentOwnerDelta = Object.hasOwn(payload, 'current_owner_delta');
  const hasSingleResolution = Object.hasOwn(payload, 'capability_registry_resolution');
  const hasResolutionReceipts = Object.hasOwn(payload, 'capability_registry_resolution_receipts');
  const hasReadout = Object.hasOwn(payload, 'capability_registry_readout');
  const currentOwnerDelta = typedCurrentOwnerDelta(payload.current_owner_delta);
  const singleResolution = typedCapabilityResolution(payload.capability_registry_resolution);
  const readout = typedCapabilityReadout(payload.capability_registry_readout);
  const rawResolutionReceipts = payload.capability_registry_resolution_receipts;
  const resolutionReceiptValues = Array.isArray(rawResolutionReceipts) ? rawResolutionReceipts : [];
  const resolutionReceipts = resolutionReceiptValues
    .map(typedCapabilityResolution)
    .filter((entry): entry is CapabilityRegistryResolution => entry !== null);
  const currentOwnerDeltaUnproven = hasCurrentOwnerDelta && !currentOwnerDelta
    ? rawCurrentOwnerDeltaUnprovenBinding(payload.current_owner_delta)
    : { unproven: false, capabilityRefs: [] as string[] };
  const singleResolutionUnproven = hasSingleResolution
    && !singleResolution
    && !rawResolutionProvesOptionalOnly(payload.capability_registry_resolution);
  const readoutUnproven = hasReadout
    && !readout
    && !rawReadoutProvesOptionalOnly(payload.capability_registry_readout);
  const unprovenResolutionReceiptValues = hasResolutionReceipts
    ? Array.isArray(rawResolutionReceipts)
      ? resolutionReceiptValues.filter((entry) => (
          !typedCapabilityResolution(entry) && !rawResolutionProvesOptionalOnly(entry)
        ))
      : [rawResolutionReceipts]
    : [];
  const unprovenExplicitCapabilityRefs = uniqueStringList([
    ...currentOwnerDeltaUnproven.capabilityRefs,
    ...(singleResolutionUnproven
      ? [optionalString(record(payload.capability_registry_resolution).capability_ref)]
      : []),
    ...(readoutUnproven
      ? recordList(record(payload.capability_registry_readout).resolutions)
        .map((entry) => optionalString(entry.capability_ref))
      : []),
    ...unprovenResolutionReceiptValues
      .map((entry) => optionalString(record(entry).capability_ref)),
  ]).sort();
  return {
    lifecyclePhase: 'execution',
    ...context,
    currentOwnerDelta,
    rawRouteRequiredHardBoundaryCapabilityRefs: rawRouteRequiredHardBoundaryCapabilityRefs(
      payload.current_owner_delta,
    ),
    unprovenExplicitCapabilityBinding: currentOwnerDeltaUnproven.unproven
      || singleResolutionUnproven
      || readoutUnproven
      || unprovenResolutionReceiptValues.length > 0,
    unprovenExplicitCapabilityRefs,
    capabilityRegistryReadout: readout,
    capabilityRegistryResolutionReceipts: [
      ...(singleResolution ? [singleResolution] : []),
      ...resolutionReceipts,
    ],
    capabilityRegistryReadoutRef: optionalString(payload.capability_registry_readout_ref),
    capabilityRegistryResolutionReceiptRefs: uniqueStringList([
      optionalString(payload.capability_registry_resolution_receipt_ref),
      ...stringList(payload.capability_registry_resolution_receipt_refs),
    ]),
  };
}

function routeRequiredHardBoundaryRequirement(
  requirement: CurrentOwnerDeltaCapabilityRequirement,
) {
  return requirement.binding_kind === 'route_required'
    && Boolean(launchBlockingBoundary(requirement.hard_boundary));
}

function currentOwnerDeltaLaunchIdentity(
  delta: CurrentOwnerDeltaCapabilityBinding | null | undefined,
  input: Pick<CapabilityRegistryStageContextInput, 'domainId' | 'stageId'>,
) {
  if (!delta) {
    return null;
  }
  const deltaRefs = uniqueStringList([optionalString(delta.delta_ref), optionalString(delta.delta_id)]);
  const taskOrStudyRefs = uniqueStringList([
    optionalString(delta.task_or_study_ref),
    optionalString(delta.work_unit_ref),
  ]);
  const stageRef = optionalString(delta.stage_ref);
  const domains = uniqueStringList([optionalString(delta.domain), optionalString(delta.domain_id)]);
  if (deltaRefs.length !== 1
    || taskOrStudyRefs.length !== 1
    || !stageRef
    || stageRef !== input.stageId
    || domains.length === 0
    || !domains.every((domain) => domainAliases(input.domainId).has(normalize(domain)))) {
    return null;
  }
  return {
    deltaRef: deltaRefs[0],
    taskOrStudyRef: taskOrStudyRefs[0],
    stageRef,
  };
}

function resolutionMatchesCurrentDeltaLaunch(
  resolution: CapabilityRegistryResolution,
  identity: NonNullable<ReturnType<typeof currentOwnerDeltaLaunchIdentity>>,
  domainId: FamilyRuntimeDomainId,
) {
  const binding = resolution.current_owner_delta_binding;
  const bindingDomains = uniqueStringList([
    optionalString(binding.domain),
    optionalString(binding.domain_id),
  ]);
  return binding.bound
    && binding.default_planning_root === 'current_owner_delta'
    && optionalString(resolution.task_or_study_ref) === identity.taskOrStudyRef
    && optionalString(resolution.stage_ref) === identity.stageRef
    && optionalString(binding.current_owner_delta_ref) === identity.deltaRef
    && optionalString(binding.task_or_study_ref) === identity.taskOrStudyRef
    && optionalString(binding.stage_ref) === identity.stageRef
    && bindingDomains.length > 0
    && bindingDomains.every((domain) => domainAliases(domainId).has(normalize(domain)));
}

function capabilityGateAuthorityBoundary(): CapabilityRegistryStageContextReceipt['authority_boundary'] {
  return {
    opl: 'refs_only_stage_context_projection',
    registry: 'precomputed_typed_resolution_or_readout_input_only',
    can_execute_capability: false,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_domain_typed_blocker: false,
    can_claim_quality_or_export_verdict: false,
  };
}

export function buildCapabilityRegistryStageContextReceipt(
  input: CapabilityRegistryStageContextInput,
): CapabilityRegistryStageContextReceipt {
  const deltaRef = currentOwnerDeltaRef(input.currentOwnerDelta);
  const readoutResolutions = input.capabilityRegistryReadout?.resolutions ?? [];
  const resolutions = [
    ...readoutResolutions,
    ...(input.capabilityRegistryResolutionReceipts ?? []),
  ];
  const resolutionsByCapabilityRef = new Map<string, CapabilityRegistryResolution[]>();
  for (const resolution of resolutions) {
    const existing = resolutionsByCapabilityRef.get(resolution.capability_ref) ?? [];
    existing.push(resolution);
    resolutionsByCapabilityRef.set(resolution.capability_ref, existing);
  }
  const launchIdentity = currentOwnerDeltaLaunchIdentity(input.currentOwnerDelta, input);
  const requirements = input.currentOwnerDelta?.required_capability_refs ?? [];
  const rawRouteRequiredCapabilityRefs = uniqueStringList(
    input.rawRouteRequiredHardBoundaryCapabilityRefs ?? [],
  ).sort();
  const routeRequiredCapabilityRefs = uniqueStringList([
    ...rawRouteRequiredCapabilityRefs,
    ...requirements
      .filter(routeRequiredHardBoundaryRequirement)
      .map((requirement) => requirement.capability_ref),
    ...resolutions
      .filter((resolution) => (
        resolution.route_required_policy.is_route_required
        && Boolean(launchBlockingBoundary(resolution.route_required_policy.hard_boundary))
      ))
      .map((resolution) => resolution.capability_ref),
  ]).sort();
  const unprovenExplicitCapabilityRefs = uniqueStringList(
    input.unprovenExplicitCapabilityRefs ?? [],
  ).sort();
  const bindingMissingCapabilityRefs = uniqueStringList([
    ...unprovenExplicitCapabilityRefs,
    ...routeRequiredCapabilityRefs.filter((capabilityRef) => {
      if (!launchIdentity) {
        return true;
      }
      const matchingRequirements = requirements.filter((requirement) => (
        requirement.capability_ref === capabilityRef
        && routeRequiredHardBoundaryRequirement(requirement)
      ));
      if (matchingRequirements.length === 0) {
        return true;
      }
      if (matchingRequirements.some((requirement) => {
        const requiredByDeltaRef = optionalString(requirement.required_by_delta_ref);
        return Boolean(requiredByDeltaRef && requiredByDeltaRef !== launchIdentity.deltaRef);
      })) {
        return true;
      }
      const capabilityResolutions = resolutionsByCapabilityRef.get(capabilityRef) ?? [];
      if (rawRouteRequiredCapabilityRefs.includes(capabilityRef) && capabilityResolutions.length === 0) {
        return true;
      }
      if (capabilityResolutions.length === 0) {
        return false;
      }
      return capabilityResolutions.some((resolution) => (
        !resolution.route_required_policy.is_route_required
        || !launchBlockingBoundary(resolution.route_required_policy.hard_boundary)
        || !matchingRequirements.some((requirement) => (
          launchBlockingBoundary(requirement.hard_boundary)
            === launchBlockingBoundary(resolution.route_required_policy.hard_boundary)
        ))
        || !resolutionMatchesCurrentDeltaLaunch(resolution, launchIdentity, input.domainId)
      ));
    }),
  ]).sort();
  const unavailableCapabilityRefs = uniqueStringList([
    ...unprovenExplicitCapabilityRefs,
    ...routeRequiredCapabilityRefs.filter((capabilityRef) => {
      const capabilityResolutions = resolutionsByCapabilityRef.get(capabilityRef) ?? [];
      return capabilityResolutions.length === 0
        || bindingMissingCapabilityRefs.includes(capabilityRef)
        || !capabilityResolutions.some((resolution) => (
          resolution.resolution_status === 'resolved'
          && resolution.selection.capability_found
        ));
    }),
  ]).sort();
  const resolvedCapabilityRefs = uniqueStringList(
    resolutions
      .filter((resolution) => resolution.resolution_status === 'resolved' && resolution.selection.capability_found)
      .map((resolution) => resolution.capability_ref),
  ).sort();
  const optionalRequirementRefs = requirements
    .filter((requirement) => requirement.binding_kind === 'optional')
    .map((requirement) => requirement.capability_ref);
  const nonBlockingRouteRequirementRefs = requirements
    .filter((requirement) => (
      requirement.binding_kind === 'route_required'
      && Boolean(hardBoundary(requirement.hard_boundary))
      && !launchBlockingBoundary(requirement.hard_boundary)
    ))
    .map((requirement) => requirement.capability_ref);
  const optionalFailOpenCapabilityRefs = uniqueStringList([
    ...optionalRequirementRefs.filter((capabilityRef) => !resolvedCapabilityRefs.includes(capabilityRef)),
    ...nonBlockingRouteRequirementRefs.filter((capabilityRef) => !resolvedCapabilityRefs.includes(capabilityRef)),
    ...resolutions
      .filter((resolution) => (
        resolution.resolution_status === 'fail_open'
        && !routeRequiredCapabilityRefs.includes(resolution.capability_ref)
      ))
      .map((resolution) => resolution.capability_ref),
  ]).sort();
  const hasCapabilityScope = rawRouteRequiredCapabilityRefs.length > 0
    || requirements.length > 0
    || resolutions.length > 0
    || input.unprovenExplicitCapabilityBinding === true;
  const planningInputMissing = input.lifecyclePhase === 'planning'
    && (!input.currentOwnerDelta || resolutions.length === 0);
  const status = !hasCapabilityScope || planningInputMissing
    ? 'not_applicable'
    : 'observed';
  const receiptTaskRef = encodeURIComponent(input.taskId ?? 'unbound-task');

  return {
    surface_kind: 'opl_capability_registry_stage_context_receipt',
    version: 'opl-capability-registry-stage-context.v1',
    receipt_ref: `opl://stage-context-observation/${input.domainId}/${encodeURIComponent(input.stageId)}/${receiptTaskRef}/capability-registry`,
    observer_owner: 'opl_runtime',
    lifecycle_phase: input.lifecyclePhase,
    status,
    advisory_reason: null,
    typed_input_status: {
      current_owner_delta: input.currentOwnerDelta ? 'consumed' : 'missing',
      capability_registry_readout: input.capabilityRegistryReadout ? 'consumed' : 'missing',
      capability_registry_resolution_receipt_count: input.capabilityRegistryResolutionReceipts?.length ?? 0,
      unproven_explicit_capability_binding: input.unprovenExplicitCapabilityBinding === true,
    },
    input_refs: {
      current_owner_delta_ref: deltaRef,
      capability_registry_readout_ref: input.capabilityRegistryReadoutRef ?? null,
      capability_registry_resolution_receipt_refs: uniqueStringList(
        input.capabilityRegistryResolutionReceiptRefs ?? [],
      ).sort(),
    },
    route_required_hard_boundary_capability_refs: routeRequiredCapabilityRefs,
    resolved_capability_refs: resolvedCapabilityRefs,
    optional_fail_open_capability_refs: optionalFailOpenCapabilityRefs,
    unavailable_capability_refs: unavailableCapabilityRefs,
    binding_missing_capability_refs: bindingMissingCapabilityRefs,
    progression_effect: 'advisory_only_stage_may_start',
    authority_boundary: capabilityGateAuthorityBoundary(),
  };
}

export function attachCapabilityRegistryStageContext<T extends object>(
  observation: T,
  input: CapabilityRegistryStageContextInput | null | undefined,
) {
  if (!input) {
    return observation;
  }
  const receipt = buildCapabilityRegistryStageContextReceipt(input);
  return {
    ...observation,
    capability_registry_context_receipt: receipt,
  };
}
