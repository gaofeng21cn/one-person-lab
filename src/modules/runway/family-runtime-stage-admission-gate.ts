import type { DatabaseSync } from 'node:sqlite';

import { loadFrameworkContracts } from '../charter/index.ts';
import {
  buildDomainManifestCatalog,
  withOplMetaAgentDescriptorEntry,
} from '../atlas/index.ts';
import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import { buildFamilyConflictOrBlockerEnvelope, buildFamilyConflictSubject } from '../stagecraft/index.ts';
import { buildFamilyStageAdmissionReview } from '../stagecraft/index.ts';
import { buildFamilyStageCohortLoopProjection } from '../stagecraft/index.ts';
import { buildFamilyStageRuntimeBudgetProjection } from '../stagecraft/index.ts';
import type {
  FamilyStageAdmissionReview,
  FamilyStageAdmissionStageResult,
} from '../stagecraft/index.ts';
import type { FamilyStageCohortLoopStage } from '../stagecraft/index.ts';
import type { FamilyStageControlPlane } from '../stagecraft/index.ts';
import type { FamilyStageDescriptor } from '../stagecraft/index.ts';
import {
  record,
  recordList,
  stringList,
  stringValue as optionalString,
  uniqueStringList,
} from '../../kernel/json-record.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import {
  runtimeDomainAliases,
  type FamilyRuntimeDomainId,
} from './family-runtime-types.ts';

type CapabilityHardBoundary = import('../connect/index.ts').CapabilityHardBoundary;
type CapabilityRegistryReadout = import('../connect/index.ts').CapabilityRegistryReadout;
type CapabilityRegistryResolution = import('../connect/index.ts').CapabilityRegistryResolution;
type CurrentOwnerDeltaCapabilityBinding = import('../connect/index.ts').CurrentOwnerDeltaCapabilityBinding;
type CurrentOwnerDeltaCapabilityRequirement = import('../connect/index.ts').CurrentOwnerDeltaCapabilityRequirement;

const STAGE_KERNEL_LAUNCH_BLOCKER_CODES = new Set([
  'missing_stage_contract',
  'missing_requires_contract',
  'missing_ensures_contract',
  'missing_scope_refs',
  'missing_authority_boundary_role',
  'invalid_opl_authority_role',
  'forbidden_opl_authority',
  'missing_tool_affordance_boundary',
  'invalid_tool_affordance_boundary',
  'effect_boundary_without_event_recording',
  'runtime_guard_without_event_recording',
  'effect_boundary_missing_runtime_event_refs',
  'runtime_guard_missing_runtime_event_refs',
  'human_review_gate_budget_blocked',
]);

const CAPABILITY_HARD_BOUNDARIES = new Set<CapabilityHardBoundary>([
  'source_data_evidence',
  'owner_route_identity',
  'forbidden_write',
  'irreversible_mutation',
  'reviewer_publication_hard_gate',
]);

export type CapabilityRegistryLaunchGateInput = {
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

export type CapabilityRegistryLaunchGateReceipt = {
  surface_kind: 'opl_capability_registry_launch_gate_receipt';
  version: 'opl-capability-registry-launch-gate.v1';
  receipt_ref: string;
  gate_owner: 'opl_runtime';
  lifecycle_phase: 'planning' | 'execution';
  status: 'allowed' | 'blocked' | 'not_applicable';
  blocked_reason:
    | 'capability_registry_route_required_hard_boundary_missing'
    | 'capability_registry_route_required_binding_missing'
    | null;
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
  blocked_capability_refs: string[];
  binding_missing_capability_refs: string[];
  authority_boundary: {
    opl: 'refs_only_launch_gate_projection';
    registry: 'precomputed_typed_resolution_or_readout_input_only';
    can_execute_capability: false;
    can_write_domain_truth: false;
    can_sign_owner_receipt: false;
    can_create_domain_typed_blocker: false;
    can_claim_quality_or_export_verdict: false;
  };
};

export type StageAdmissionLaunchGateInput = {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  taskKind?: string | null;
  taskId?: string | null;
  sourceFingerprint?: string | null;
  idempotencyKey?: string | null;
  requireAdmission?: boolean;
  capabilityRegistryGate?: CapabilityRegistryLaunchGateInput | null;
};

export type StageAdmissionLaunchGateResult = {
  surface_kind: 'opl_stage_launch_admission_gate';
  version: 'opl-stage-launch-admission-gate.v1';
  gate_owner: 'opl_runtime';
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  required: boolean;
  status: 'allowed' | 'blocked' | 'not_applicable';
  blocked_reason: string | null;
  admission_status: FamilyStageAdmissionReview['status'] | null;
  plane_id: string | null;
  target_domain_id: string | null;
  inspected_stage: FamilyStageAdmissionStageResult | null;
  inspected_cohort_loop_stage: FamilyStageCohortLoopStage | null;
  findings: FamilyStageAdmissionReview['findings'];
  blocker_findings: FamilyStageAdmissionReview['findings'];
  recommendation_findings: FamilyStageAdmissionReview['findings'];
  conflict_or_blocker_envelopes: ReturnType<typeof buildFamilyConflictOrBlockerEnvelope>[];
  capability_registry_gate_receipt?: CapabilityRegistryLaunchGateReceipt;
  authority_boundary: {
    opl: 'launch_gate_and_blocker_projection_only';
    domain: 'truth_quality_artifact_gate_owner';
    executor: 'selected_executor_runs_only_after_admission';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
};

function currentOwnerDeltaRef(delta: CurrentOwnerDeltaCapabilityBinding | null | undefined) {
  return optionalString(delta?.delta_ref) ?? optionalString(delta?.delta_id);
}

function hardBoundary(value: unknown): CapabilityHardBoundary | null {
  const boundary = optionalString(value) as CapabilityHardBoundary | null;
  return boundary && CAPABILITY_HARD_BOUNDARIES.has(boundary) ? boundary : null;
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
        && Boolean(hardBoundary(requirement.hard_boundary))
      ))
      .map((requirement) => optionalString(requirement.capability_ref)),
  ).sort();
}

export function capabilityRegistryLaunchGateInputFromPayload(
  payload: Record<string, unknown>,
  context: Pick<CapabilityRegistryLaunchGateInput, 'domainId' | 'stageId' | 'taskId'>,
): CapabilityRegistryLaunchGateInput | null {
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
    && Boolean(hardBoundary(requirement.hard_boundary));
}

function currentOwnerDeltaLaunchIdentity(
  delta: CurrentOwnerDeltaCapabilityBinding | null | undefined,
  input: Pick<CapabilityRegistryLaunchGateInput, 'domainId' | 'stageId'>,
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

function capabilityGateAuthorityBoundary(): CapabilityRegistryLaunchGateReceipt['authority_boundary'] {
  return {
    opl: 'refs_only_launch_gate_projection',
    registry: 'precomputed_typed_resolution_or_readout_input_only',
    can_execute_capability: false,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_domain_typed_blocker: false,
    can_claim_quality_or_export_verdict: false,
  };
}

export function buildCapabilityRegistryLaunchGateReceipt(
  input: CapabilityRegistryLaunchGateInput,
): CapabilityRegistryLaunchGateReceipt {
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
        && Boolean(hardBoundary(resolution.route_required_policy.hard_boundary))
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
        || !hardBoundary(resolution.route_required_policy.hard_boundary)
        || !matchingRequirements.some((requirement) => (
          hardBoundary(requirement.hard_boundary)
            === hardBoundary(resolution.route_required_policy.hard_boundary)
        ))
        || !resolutionMatchesCurrentDeltaLaunch(resolution, launchIdentity, input.domainId)
      ));
    }),
  ]).sort();
  const blockedCapabilityRefs = uniqueStringList([
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
  const optionalFailOpenCapabilityRefs = uniqueStringList([
    ...optionalRequirementRefs.filter((capabilityRef) => !resolvedCapabilityRefs.includes(capabilityRef)),
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
  const shouldBlock = input.lifecyclePhase === 'execution'
    && (blockedCapabilityRefs.length > 0 || input.unprovenExplicitCapabilityBinding === true);
  const status = !hasCapabilityScope || planningInputMissing
    ? 'not_applicable'
    : shouldBlock
      ? 'blocked'
      : 'allowed';
  const blockedReason = status !== 'blocked'
    ? null
    : bindingMissingCapabilityRefs.length > 0 || input.unprovenExplicitCapabilityBinding === true
      ? 'capability_registry_route_required_binding_missing'
      : 'capability_registry_route_required_hard_boundary_missing';
  const receiptTaskRef = encodeURIComponent(input.taskId ?? 'unbound-task');

  return {
    surface_kind: 'opl_capability_registry_launch_gate_receipt',
    version: 'opl-capability-registry-launch-gate.v1',
    receipt_ref: `opl://stage-launch-admission/${input.domainId}/${encodeURIComponent(input.stageId)}/${receiptTaskRef}/capability-registry`,
    gate_owner: 'opl_runtime',
    lifecycle_phase: input.lifecyclePhase,
    status,
    blocked_reason: blockedReason,
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
    blocked_capability_refs: blockedCapabilityRefs,
    binding_missing_capability_refs: bindingMissingCapabilityRefs,
    authority_boundary: capabilityGateAuthorityBoundary(),
  };
}

function withCapabilityRegistryGate(
  result: StageAdmissionLaunchGateResult,
  input: CapabilityRegistryLaunchGateInput | null | undefined,
): StageAdmissionLaunchGateResult {
  if (!input) {
    return result;
  }
  const receipt = buildCapabilityRegistryLaunchGateReceipt(input);
  return {
    ...result,
    ...(receipt.status === 'blocked'
      ? {
          status: 'blocked' as const,
          blocked_reason: result.status === 'blocked' ? result.blocked_reason : receipt.blocked_reason,
        }
      : {}),
    capability_registry_gate_receipt: receipt,
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replaceAll('_', '-');
}

function domainAliases(domainId: FamilyRuntimeDomainId) {
  return new Set(runtimeDomainAliases(domainId).map(normalize));
}

function resolvePlane(entry: DomainManifestCatalogEntry): FamilyStageControlPlane | null {
  return entry.status === 'resolved' ? entry.manifest?.family_stage_control_plane ?? null : null;
}

function entryMatchesDomain(entry: DomainManifestCatalogEntry, domainId: FamilyRuntimeDomainId) {
  const aliases = domainAliases(domainId);
  const plane = resolvePlane(entry);
  const agentId = optionalString(entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id);
  return [
    entry.project_id,
    entry.project,
    plane?.target_domain_id,
    entry.manifest?.target_domain_id,
    agentId,
  ].some((value) => typeof value === 'string' && aliases.has(normalize(value)));
}

function stageResult(review: FamilyStageAdmissionReview, stageId: string) {
  return review.stage_results.find((stage) => stage.stage_id === stageId) ?? null;
}

function stageLaunchBlockerFindings(findings: FamilyStageAdmissionReview['findings']) {
  return findings.filter((finding) => (
    finding.severity === 'blocker'
    && STAGE_KERNEL_LAUNCH_BLOCKER_CODES.has(finding.code)
  ));
}

function scopeRefFindings(stage: FamilyStageDescriptor): FamilyStageAdmissionReview['findings'] {
  const contract = stage.stage_contract;
  if (!contract) {
    return [];
  }
  if (contract.source_scope_refs.length + contract.artifact_scope_refs.length + contract.workspace_scope_refs.length > 0) {
    return [];
  }
  return [{
    severity: 'blocker',
    code: 'missing_scope_refs',
    message: 'Stage launch requires at least one source, artifact, or workspace scope ref.',
    stage_id: stage.stage_id,
    failure_lane: 'source',
    source_ref: `family_stage:${stage.stage_id}`,
    minimal_counterexample: {
      stage_id: stage.stage_id,
      missing_field: 'source_scope_refs_or_artifact_scope_refs_or_workspace_scope_refs',
    },
  }];
}

function statusForMissing(input: StageAdmissionLaunchGateInput, reason: string): StageAdmissionLaunchGateResult {
  const required = input.requireAdmission === true;
  const status = required ? 'blocked' : 'not_applicable';
  const subject = buildFamilyConflictSubject({
    domain: input.domainId,
    stageId: input.stageId,
    taskKind: input.taskKind,
    sourceFingerprint: input.sourceFingerprint,
    idempotencyKey: input.idempotencyKey,
    taskId: input.taskId,
  });
  return {
    surface_kind: 'opl_stage_launch_admission_gate',
    version: 'opl-stage-launch-admission-gate.v1',
    gate_owner: 'opl_runtime',
    domain_id: input.domainId,
    stage_id: input.stageId,
    required,
    status,
    blocked_reason: required ? reason : null,
    admission_status: null,
    plane_id: null,
    target_domain_id: null,
    inspected_stage: null,
    inspected_cohort_loop_stage: null,
    findings: [],
    blocker_findings: [],
    recommendation_findings: [],
    conflict_or_blocker_envelopes: required
      ? [
          buildFamilyConflictOrBlockerEnvelope({
            subject,
            classification: 'evidence_blocker',
            owner: 'opl_runtime',
            authority: 'opl_runtime',
            status: 'blocked',
            reason,
            allowedNextActions: ['repair_stage_control_plane', 'retry_after_admission'],
            forbiddenActions: ['start_executor_without_stage_admission', 'fallback_complete'],
            failClosed: true,
          }),
        ]
      : [],
    authority_boundary: launchGateAuthorityBoundary(),
  };
}

function launchGateAuthorityBoundary(): StageAdmissionLaunchGateResult['authority_boundary'] {
  return {
    opl: 'launch_gate_and_blocker_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    executor: 'selected_executor_runs_only_after_admission',
    can_execute_stage: false,
    can_write_domain_truth: false,
    can_authorize_quality_verdict: false,
    can_mutate_artifact_body: false,
  };
}

function buildStageAdmissionLaunchGateFromReview(
  input: StageAdmissionLaunchGateInput & {
    plane: FamilyStageControlPlane;
    review: FamilyStageAdmissionReview;
  },
): StageAdmissionLaunchGateResult {
  const inspectedStage = stageResult(input.review, input.stageId);
  if (!inspectedStage) {
    return statusForMissing(input, 'stage_admission_stage_missing');
  }
  const inspectedDescriptor = input.plane.stages.find((stage) => stage.stage_id === input.stageId) ?? null;
  const cohortLoop = buildFamilyStageCohortLoopProjection(input.plane);
  const inspectedCohortLoopStage = cohortLoop.stages.find((stage) => stage.stage_id === input.stageId) ?? null;
  const runtimeBudget = buildFamilyStageRuntimeBudgetProjection(input.plane);
  const inspectedRuntimeBudgetStage = runtimeBudget.stages.find((stage) => stage.stage_id === input.stageId) ?? null;
  const stageFindings = input.review.findings.filter((finding) => finding.stage_id === input.stageId);
  const cohortLoopNeedsAttention = input.requireAdmission === true
    && inspectedCohortLoopStage !== null
    && inspectedCohortLoopStage.closure_status !== 'closed_loop_ready';
  const cohortLoopFindings: FamilyStageAdmissionReview['findings'] = cohortLoopNeedsAttention
    ? inspectedCohortLoopStage.blockers.map((cohortBlocker) => ({
        severity: 'warning' as const,
        code: cohortBlocker.blocker_id,
        message: cohortBlocker.minimal_counterexample.reason,
        stage_id: input.stageId,
        failure_lane: cohortBlocker.blocker_id === 'cohort_monitor_or_metric_missing' ? 'monitor' as const : 'source' as const,
        source_ref: `family_stage_cohort_loop:${input.stageId}`,
        minimal_counterexample: cohortBlocker.minimal_counterexample,
      }))
    : [];
  const runtimeBudgetFindings: FamilyStageAdmissionReview['findings'] = input.requireAdmission === true
    && inspectedRuntimeBudgetStage !== null
    && inspectedRuntimeBudgetStage.reliability_budget_status !== 'ready'
    ? inspectedRuntimeBudgetStage.minimal_counterexamples.map((budgetCounterexample) => ({
        severity: 'warning' as const,
        code: `runtime_budget_${budgetCounterexample.missing_field}_missing`,
        message: budgetCounterexample.reason,
        stage_id: input.stageId,
        failure_lane: budgetCounterexample.missing_field === 'monitor_refs' ? 'monitor' as const : 'runtime' as const,
        source_ref: `family_stage_runtime_budget:${input.stageId}`,
        minimal_counterexample: { ...budgetCounterexample },
      }))
    : [];
  const findings = [
    ...stageFindings,
    ...(input.requireAdmission === true && inspectedDescriptor ? scopeRefFindings(inspectedDescriptor) : []),
    ...cohortLoopFindings,
    ...runtimeBudgetFindings,
  ];
  const blockerFindings = stageLaunchBlockerFindings(findings);
  const recommendationFindings = findings.filter((finding) => !blockerFindings.includes(finding));
  const blockedReason = blockerFindings.length > 0
    ? inspectedStage.status === 'admitted'
      ? 'stage_admission_stage_kernel_blocked'
      : `stage_admission_${inspectedStage.status}`
    : null;
  const subject = buildFamilyConflictSubject({
    domain: input.domainId,
    stageId: input.stageId,
    taskKind: input.taskKind,
    sourceFingerprint: input.sourceFingerprint,
    idempotencyKey: input.idempotencyKey,
    taskId: input.taskId,
    sourceRefs: [
      `opl://family_stage_control_planes/${input.plane.plane_id}`,
      `opl://family_stage_admission/${input.review.plane_id}`,
    ],
  });
  return {
    surface_kind: 'opl_stage_launch_admission_gate',
    version: 'opl-stage-launch-admission-gate.v1',
    gate_owner: 'opl_runtime',
    domain_id: input.domainId,
    stage_id: input.stageId,
    required: input.requireAdmission === true,
    status: blockedReason ? 'blocked' : 'allowed',
    blocked_reason: blockedReason,
    admission_status: input.review.status,
    plane_id: input.plane.plane_id,
    target_domain_id: input.plane.target_domain_id,
    inspected_stage: inspectedStage,
    inspected_cohort_loop_stage: inspectedCohortLoopStage,
    findings,
    blocker_findings: blockerFindings,
    recommendation_findings: recommendationFindings,
    conflict_or_blocker_envelopes: blockedReason
      ? [
          buildFamilyConflictOrBlockerEnvelope({
            subject,
            classification: 'evidence_blocker',
            owner: 'opl_runtime',
            authority: 'opl_runtime',
            status: 'blocked',
            reason: blockedReason,
            evidenceRefs: blockerFindings.map((finding) => `finding:${finding.code}`),
            allowedNextActions: ['repair_stage_contract', 'retry_after_admission'],
            forbiddenActions: ['start_executor_without_stage_admission', 'fallback_complete'],
            failClosed: true,
          }),
        ]
      : [],
    authority_boundary: launchGateAuthorityBoundary(),
  };
}

export function buildStageAdmissionLaunchGate(
  input: StageAdmissionLaunchGateInput,
  options: {
    domainManifests?: { projects: DomainManifestCatalogEntry[] };
  } = {},
): StageAdmissionLaunchGateResult {
  const catalog = options.domainManifests
    ?? withOplMetaAgentDescriptorEntry(
      buildDomainManifestCatalog(loadFrameworkContracts()).domain_manifests,
    );
  const entry = catalog.projects.find((candidate) => entryMatchesDomain(candidate, input.domainId));
  if (!entry) {
    return withCapabilityRegistryGate(
      statusForMissing(input, 'stage_admission_manifest_missing'),
      input.capabilityRegistryGate,
    );
  }
  const plane = resolvePlane(entry);
  if (!plane) {
    return withCapabilityRegistryGate(
      statusForMissing(input, 'stage_admission_manifest_missing'),
      input.capabilityRegistryGate,
    );
  }
  const review = buildFamilyStageAdmissionReview(plane, entry.manifest);
  return withCapabilityRegistryGate(
    buildStageAdmissionLaunchGateFromReview({
      ...input,
      plane,
      review,
    }),
    input.capabilityRegistryGate,
  );
}

export function blockTaskForStageAdmissionGate(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  attempt: {
    stage_attempt_id: string;
    stage_id: string;
    blocked_reason: string | null;
  },
) {
  const blockedReason = attempt.blocked_reason ?? 'stage_admission_blocked';
  const updatedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    'Stage attempt blocked by OPL stage admission gate before executor launch.',
    blockedReason,
    updatedAt,
    row.task_id,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_blocked_by_stage_admission_gate',
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: attempt.stage_attempt_id,
      stage_id: attempt.stage_id,
      blocked_reason: blockedReason,
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'error',
    title: 'Family runtime task blocked by stage admission',
    body: blockedReason,
    payload: {
      stage_attempt_id: attempt.stage_attempt_id,
      stage_id: attempt.stage_id,
      reason: blockedReason,
    },
  });
  return {
    task_id: row.task_id,
    status: 'blocked',
    reason: blockedReason,
    stage_attempts: [attempt],
  };
}
