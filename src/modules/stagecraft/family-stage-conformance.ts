import type { FamilyActionCatalog, FamilyActionCatalogAction } from '../../kernel/family-action-catalog-contract.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageTrustLane,
} from './family-stage-control-plane-contract.ts';
import type { FamilyStageDomainManifest } from './family-stage-domain-manifest.ts';
import {
  buildFamilyStageAssumptionLifecycleProjection,
} from './family-stage-assumption-lifecycle.ts';
import {
  buildStagePackHumanReviewBurdenBudget,
} from './family-human-review-budget.ts';
import type { FamilyHumanReviewBurdenBudget } from './family-human-review-budget.ts';
import {
  buildToolAffordanceBoundaryProjection,
  inspectToolAffordanceBoundary,
  stageUsesStandardStagePackV2,
  type FamilyStageToolAffordanceBoundaryProjection,
} from './family-stage-tool-affordance-boundary.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyStageConformanceStatus = 'conformant' | 'quality_debt' | 'nonconformant';
export type FamilyStageConformanceFindingSeverity = 'nonconformance' | 'warning';

export interface FamilyStageConformanceFinding {
  severity: FamilyStageConformanceFindingSeverity;
  code: string;
  message: string;
  stage_id?: string;
  target_stage_id?: string;
  action_id?: string;
  assumption_id?: string;
  failure_lane?: FamilyStageFailureLane;
  source_ref?: string;
  runtime_event_refs_missing_reason?: string;
  minimal_counterexample?: JsonRecord;
}

export type FamilyStageFailureLane =
  | 'ai'
  | 'human'
  | 'external'
  | 'provider'
  | 'runtime'
  | 'domain'
  | 'artifact'
  | 'source'
  | 'monitor'
  | 'executor';

export interface FamilyStageModeTags {
  verified_core_eligible: boolean;
  durable_runtime_only: boolean;
  runtime_boundary_required: boolean;
}

export interface FamilyStageFailureLocalization {
  lane: FamilyStageFailureLane;
  severity: FamilyStageConformanceFindingSeverity;
  code: string;
  stage_id: string | null;
  target_stage_id: string | null;
  action_id: string | null;
  assumption_id: string | null;
  source_ref: string | null;
  minimal_counterexample: JsonRecord;
}

export interface FamilyStageConformanceStageResult {
  stage_id: string;
  status: FamilyStageConformanceStatus;
  trust_lane: FamilyStageTrustLane | null;
  static_check_eligible: boolean;
  effect_boundary: boolean;
  mode_tags: FamilyStageModeTags;
  runtime_event_refs: string[];
  tool_affordance_boundary: FamilyStageToolAffordanceBoundaryProjection;
  finding_count: number;
  blocker_count: number;
  warning_count: number;
}

export interface FamilyStageConformanceReview {
  surface_kind: 'family_stage_conformance_review';
  version: 'family-stage-conformance-review.v1';
  plane_id: string;
  target_domain_id: string;
  status: FamilyStageConformanceStatus;
  summary: {
    stages_count: number;
    conformant_stages_count: number;
    nonconformant_stages_count: number;
    quality_debt_stages_count: number;
    nonconformances_count: number;
    warnings_count: number;
    verified_core_eligible_count: number;
    durable_runtime_only_count: number;
    runtime_boundary_required_count: number;
    human_review_gate_count: number;
    blocked_human_review_gate_count: number;
  };
  stage_results: FamilyStageConformanceStageResult[];
  findings: FamilyStageConformanceFinding[];
  failure_localization: FamilyStageFailureLocalization[];
  human_review_burden_budget: FamilyHumanReviewBurdenBudget;
  authority_boundary: {
    opl_role: 'static_conformance_projection_only';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

const EFFECT_BOUNDARY_LANES = new Set<FamilyStageTrustLane>([
  'ai_decision',
  'human_gate',
  'external_system',
]);

const ALLOWED_OPL_ROLES = new Set([
  'projection_consumer_only',
  'descriptor_only',
  'discovery_only',
  'framework_metadata_projection_owner',
]);

const FORBIDDEN_AUTHORITY_FLAGS = [
  'can_write_domain_truth',
  'can_authorize_domain_ready',
  'can_authorize_quality_verdict',
  'can_authorize_publication_verdict',
  'can_authorize_fundability_verdict',
  'can_authorize_visual_quality_verdict',
  'can_mutate_artifact_body',
  'can_accept_or_reject_memory_writeback',
];

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function readStringListFromRecord(record: unknown, key: string) {
  return isRecord(record) ? readStringList(record[key]) : [];
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function inspectProgressFirstPolicies(stage: FamilyStageDescriptor, findings: FamilyStageConformanceFinding[]) {
  const contract = stage.stage_contract;
  if (!contract) {
    return;
  }
  const progressDeltaPolicy = isRecord(contract.progress_delta_policy)
    ? contract.progress_delta_policy
    : null;
  const blockerLineagePolicy = isRecord(contract.typed_blocker_lineage_policy)
    ? contract.typed_blocker_lineage_policy
    : null;
  const progressFields = readStringListFromRecord(progressDeltaPolicy, 'required_fields');
  const blockerFields = readStringListFromRecord(blockerLineagePolicy, 'required_fields');
  const requiredProgressFields = [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ];
  const requiredBlockerFields = [
    'blocker_family',
    'source_fingerprint',
    'repeat_count',
    'next_forced_delta',
    'escalation_owner',
  ];

  if (!progressDeltaPolicy) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'missing_progress_delta_policy',
      message: 'Stage contract must declare how domain closeout classifies deliverable progress versus platform repair.',
      stage_id: stage.stage_id,
      failure_lane: 'domain',
      minimal_counterexample: {
        required_surface_kind: 'opl_stage_progress_delta_policy',
        required_fields: requiredProgressFields,
      },
    });
  } else {
    const missing = requiredProgressFields.filter((field) => !progressFields.includes(field));
    if (optionalString(progressDeltaPolicy.surface_kind) !== 'opl_stage_progress_delta_policy' || missing.length > 0) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'invalid_progress_delta_policy',
        message: 'Stage progress_delta_policy must expose standard Progress-First delta fields.',
        stage_id: stage.stage_id,
        failure_lane: 'domain',
        minimal_counterexample: {
          required_surface_kind: 'opl_stage_progress_delta_policy',
          missing_fields: missing,
          required_fields: requiredProgressFields,
        },
      });
    }
  }

  if (!blockerLineagePolicy) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'missing_typed_blocker_lineage_policy',
      message: 'Stage contract must declare typed blocker lineage and repeat-budget escalation semantics.',
      stage_id: stage.stage_id,
      failure_lane: 'domain',
      minimal_counterexample: {
        required_surface_kind: 'family-stall-lineage.v1',
        required_fields: requiredBlockerFields,
      },
    });
  } else {
    const missing = requiredBlockerFields.filter((field) => !blockerFields.includes(field));
    if (optionalString(blockerLineagePolicy.surface_kind) !== 'family-stall-lineage.v1' || missing.length > 0) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'invalid_typed_blocker_lineage_policy',
        message: 'Stage typed_blocker_lineage_policy must expose standard stall lineage fields.',
        stage_id: stage.stage_id,
        failure_lane: 'domain',
        minimal_counterexample: {
          required_surface_kind: 'family-stall-lineage.v1',
          missing_fields: missing,
          required_fields: requiredBlockerFields,
        },
      });
    }
  }
}

function pushFinding(
  findings: FamilyStageConformanceFinding[],
  finding: FamilyStageConformanceFinding,
) {
  findings.push(finding);
}

function actionMap(catalog: FamilyActionCatalog | null | undefined) {
  return new Map<string, FamilyActionCatalogAction>(
    catalog?.actions.map((action) => [action.action_id, action]) ?? [],
  );
}

function readNextStageRefs(stage: FamilyStageDescriptor) {
  if (!isRecord(stage.handoff)) {
    return [];
  }
  return [
    ...readStringList(stage.handoff.next_stage_refs),
    ...readStringList(stage.handoff.next_stage_ids),
    ...readStringList(stage.handoff.allowed_next_stage_refs),
  ];
}

function readStageProvides(stage: FamilyStageDescriptor) {
  if (!isRecord(stage.handoff)) {
    return [];
  }
  return readStringList(stage.handoff.provides);
}

function hasRequiredGate(stage: FamilyStageDescriptor, actionsById: Map<string, FamilyActionCatalogAction>) {
  if (stage.trust_boundary?.owner_receipt_required === true) {
    return true;
  }
  if (stage.authority_boundary.independent_gate_receipt_required === true) {
    return true;
  }
  return stage.allowed_action_refs.some((actionRef) => {
    const action = actionsById.get(actionRef);
    return action ? action.human_gate_ids.length > 0 : false;
  });
}

function inspectAuthorityBoundary(stage: FamilyStageDescriptor, findings: FamilyStageConformanceFinding[]) {
  const oplRole = optionalString(stage.authority_boundary.opl_role);
  if (!oplRole) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'missing_authority_boundary_role',
      message: 'Stage authority_boundary must declare the OPL role before runtime launch.',
      stage_id: stage.stage_id,
    });
    return;
  }
  if (oplRole && !ALLOWED_OPL_ROLES.has(oplRole)) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'invalid_opl_authority_role',
      message: 'OPL admission can only project, discover, or check contract metadata for a stage.',
      stage_id: stage.stage_id,
    });
  }
  for (const flag of FORBIDDEN_AUTHORITY_FLAGS) {
    if (stage.authority_boundary[flag] === true) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'forbidden_opl_authority',
        message: `Stage authority_boundary sets forbidden OPL authority flag: ${flag}.`,
        stage_id: stage.stage_id,
      });
    }
  }
}

function inspectTrustBoundary(stage: FamilyStageDescriptor, findings: FamilyStageConformanceFinding[]) {
  const trust = stage.trust_boundary;
  if (!trust) {
    pushFinding(findings, {
      severity: 'warning',
      code: 'missing_trust_boundary',
      message: 'Stage has no trust_boundary lane, so OPL can only treat it as descriptor-level metadata.',
      stage_id: stage.stage_id,
    });
    return;
  }

  const laneIsEffectBoundary = EFFECT_BOUNDARY_LANES.has(trust.lane);
  const effectBoundary = readBoolean(trust.effect_boundary) || laneIsEffectBoundary;
  const runtimeGuardRequired = trust.runtime_guard_required === true;
  const runtimeEventDeclarationRequired = effectBoundary || runtimeGuardRequired;
  const runtimeEventRefs = readRuntimeEventRefs(stage);
  if (effectBoundary && trust.records_runtime_events !== true) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'effect_boundary_without_event_recording',
      message: 'Effect boundary stages must record runtime events for replay, audit, and route-back.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'records_runtime_events is not true',
    });
  }
  if (!effectBoundary && runtimeGuardRequired && trust.records_runtime_events !== true) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'runtime_guard_without_event_recording',
      message: 'Runtime-guarded stages must record runtime events before OPL can launch or advance the stage.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'runtime_guard_required is true but records_runtime_events is not true',
    });
  }
  if (effectBoundary && runtimeEventRefs.length === 0) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'effect_boundary_missing_runtime_event_refs',
      message: 'Effect boundary stages must declare machine-readable runtime_event_refs for audit and replay.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'runtime_event_refs is empty on trust_boundary and stage_contract',
    });
  }
  if (!effectBoundary && runtimeEventDeclarationRequired && runtimeEventRefs.length === 0) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'runtime_guard_missing_runtime_event_refs',
      message: 'Runtime-guarded stages must declare machine-readable runtime_event_refs for audit, retry, and handoff.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'runtime_guard_required is true but runtime_event_refs is empty on trust_boundary and stage_contract',
    });
  }
  if (effectBoundary && trust.static_check_eligible === true) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'effect_boundary_marked_static_core',
      message: 'Human, AI, and external-system boundaries cannot be admitted as statically checkable core logic.',
      stage_id: stage.stage_id,
    });
  }
}

function readRuntimeEventRefs(stage: FamilyStageDescriptor) {
  return Array.from(new Set([
    ...readStringList(stage.trust_boundary?.runtime_event_refs),
    ...readStringList(stage.stage_contract?.runtime_event_refs),
  ]));
}

function stageRuntimeBoundaryRequired(stage: FamilyStageDescriptor) {
  const trust = stage.trust_boundary;
  return trust?.effect_boundary === true
    || trust?.runtime_guard_required === true
    || (trust ? EFFECT_BOUNDARY_LANES.has(trust.lane) : false);
}

export function buildFamilyStageModeTags(stage: FamilyStageDescriptor): FamilyStageModeTags {
  const runtimeBoundaryRequired = stageRuntimeBoundaryRequired(stage);
  const verifiedCoreEligible = stage.trust_boundary?.static_check_eligible === true && !runtimeBoundaryRequired;
  return {
    verified_core_eligible: verifiedCoreEligible,
    durable_runtime_only: runtimeBoundaryRequired && !verifiedCoreEligible,
    runtime_boundary_required: runtimeBoundaryRequired,
  };
}

function stageById(plane: FamilyStageControlPlane) {
  return new Map(plane.stages.map((stage) => [stage.stage_id, stage]));
}

function classifyFailureLane(
  finding: FamilyStageConformanceFinding,
  stagesById: Map<string, FamilyStageDescriptor>,
): FamilyStageFailureLane {
  const code = finding.code;
  const stage = finding.stage_id ? stagesById.get(finding.stage_id) : null;
  const trustLane = stage?.trust_boundary?.lane ?? null;

  if (code.includes('assumption_missing_monitor') || code.includes('missing_monitor')) {
    return 'monitor';
  }
  if (code.includes('assumption_stale') || code.includes('runtime_guard') || code.includes('runtime_event')) {
    return 'runtime';
  }
  if (code.includes('source')) {
    return 'source';
  }
  if (code.includes('artifact')) {
    return 'artifact';
  }
  if (code.includes('provider') || code.includes('temporal')) {
    return 'provider';
  }
  if (code.includes('action') || code.includes('composition') || code.includes('handoff')) {
    return 'domain';
  }
  if (code.includes('human_gate')) {
    return 'human';
  }
  if (code.includes('executor')) {
    return 'executor';
  }
  if (trustLane === 'ai_decision') {
    return 'ai';
  }
  if (trustLane === 'human_gate') {
    return 'human';
  }
  if (trustLane === 'external_system') {
    return 'external';
  }
  if (trustLane === 'codex_executor') {
    return 'executor';
  }
  if (trustLane === 'domain_agent') {
    return 'domain';
  }
  return 'runtime';
}

function sourceRefForFailure(
  finding: FamilyStageConformanceFinding,
  lane: FamilyStageFailureLane,
  stagesById: Map<string, FamilyStageDescriptor>,
) {
  if (finding.source_ref) {
    return finding.source_ref;
  }
  if (finding.action_id) {
    return `family_action_catalog:${finding.action_id}`;
  }
  if (finding.assumption_id) {
    return `runtime_assumption:${finding.assumption_id}`;
  }
  if (finding.target_stage_id) {
    return `family_stage:${finding.target_stage_id}`;
  }
  if (finding.stage_id) {
    const stage = stagesById.get(finding.stage_id);
    if (lane === 'monitor') {
      const ref = stage?.stage_contract?.monitor_refs[0]?.ref;
      return typeof ref === 'string' ? ref : null;
    }
    if (lane === 'source') {
      const ref = stage?.stage_contract?.source_scope_refs[0]?.ref ?? stage?.source_refs[0]?.ref;
      return typeof ref === 'string' ? ref : null;
    }
    if (lane === 'artifact') {
      const ref = stage?.stage_contract?.artifact_scope_refs[0]?.ref ?? stage?.outputs[0]?.ref;
      return typeof ref === 'string' ? ref : null;
    }
    return `family_stage:${finding.stage_id}`;
  }
  return null;
}

function minimalCounterexampleForFinding(
  finding: FamilyStageConformanceFinding,
  lane: FamilyStageFailureLane,
  sourceRef: string | null,
): JsonRecord {
  return finding.minimal_counterexample ?? {
    lane,
    code: finding.code,
    ...(finding.stage_id ? { stage_id: finding.stage_id } : {}),
    ...(finding.target_stage_id ? { target_stage_id: finding.target_stage_id } : {}),
    ...(finding.action_id ? { action_id: finding.action_id } : {}),
    ...(finding.assumption_id ? { assumption_id: finding.assumption_id } : {}),
    ...(sourceRef ? { source_ref: sourceRef } : {}),
  };
}

function localizeFindings(
  findings: FamilyStageConformanceFinding[],
  stagesById: Map<string, FamilyStageDescriptor>,
): FamilyStageConformanceFinding[] {
  return findings.map((finding) => {
    const lane = finding.failure_lane ?? classifyFailureLane(finding, stagesById);
    const sourceRef = sourceRefForFailure(finding, lane, stagesById);
    return {
      ...finding,
      failure_lane: lane,
      source_ref: sourceRef ?? undefined,
      minimal_counterexample: minimalCounterexampleForFinding(finding, lane, sourceRef),
    };
  });
}

function buildFailureLocalization(
  findings: FamilyStageConformanceFinding[],
): FamilyStageFailureLocalization[] {
  return findings.map((finding) => ({
    lane: finding.failure_lane ?? 'runtime',
    severity: finding.severity,
    code: finding.code,
    stage_id: finding.stage_id ?? null,
    target_stage_id: finding.target_stage_id ?? null,
    action_id: finding.action_id ?? null,
    assumption_id: finding.assumption_id ?? null,
    source_ref: finding.source_ref ?? null,
    minimal_counterexample: finding.minimal_counterexample ?? { code: finding.code },
  }));
}

function inspectStageContract(stage: FamilyStageDescriptor, findings: FamilyStageConformanceFinding[]) {
  const contract = stage.stage_contract;
  const staticCheckEligible = stage.trust_boundary?.static_check_eligible === true;
  if (!contract) {
    pushFinding(findings, {
      severity: staticCheckEligible ? 'nonconformance' : 'warning',
      code: 'missing_stage_contract',
      message: 'Stage has no requires/ensures contract metadata.',
      stage_id: stage.stage_id,
    });
    return;
  }
  if (contract.requires.length === 0) {
    pushFinding(findings, {
      severity: staticCheckEligible ? 'nonconformance' : 'warning',
      code: 'missing_requires_contract',
      message: 'Stage contract should declare required input conditions.',
      stage_id: stage.stage_id,
    });
  }
  if (contract.ensures.length === 0) {
    pushFinding(findings, {
      severity: staticCheckEligible ? 'nonconformance' : 'warning',
      code: 'missing_ensures_contract',
      message: 'Stage contract should declare output conditions for downstream composition checks.',
      stage_id: stage.stage_id,
    });
  }
  inspectProgressFirstPolicies(stage, findings);
}

function inspectRuntimeAssumptions(
  plane: FamilyStageControlPlane,
  findings: FamilyStageConformanceFinding[],
) {
  const lifecycle = buildFamilyStageAssumptionLifecycleProjection(plane);
  for (const assumption of lifecycle.assumptions) {
    if (assumption.status === 'current') {
      continue;
    }
    pushFinding(findings, {
      severity: 'warning',
      code: assumption.status === 'stale'
        ? 'runtime_assumption_stale'
        : assumption.status === 'missing_monitor'
          ? 'runtime_assumption_missing_monitor_ref'
          : 'runtime_assumption_missing_owner',
      message: assumption.status === 'stale'
        ? 'Runtime assumption has invalidation refs and should be repaired before production launch.'
        : assumption.status === 'missing_monitor'
          ? 'Runtime assumption should declare at least one monitor ref for operator observability.'
          : 'Runtime assumption should declare an owner for operator route-back.',
      stage_id: assumption.stage_id,
      assumption_id: assumption.assumption_id,
      minimal_counterexample: assumption.minimal_counterexample ?? undefined,
    });
  }
}

function inspectActions(
  stage: FamilyStageDescriptor,
  findings: FamilyStageConformanceFinding[],
  actionsById: Map<string, FamilyActionCatalogAction>,
) {
  for (const actionRef of stage.allowed_action_refs) {
    const action = actionsById.get(actionRef);
    if (!action && actionsById.size > 0) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'missing_action_catalog_ref',
        message: 'Stage references an action that is not present in the family action catalog.',
        stage_id: stage.stage_id,
        action_id: actionRef,
      });
      continue;
    }
    if (action?.effect === 'mutating' && stage.trust_boundary?.owner_receipt_required !== true) {
      pushFinding(findings, {
        severity: 'warning',
        code: 'mutating_action_without_owner_receipt_requirement',
        message: 'Mutating action refs should require an owner receipt before OPL projects the stage as admissible.',
        stage_id: stage.stage_id,
        action_id: actionRef,
      });
    }
  }

  if (stage.trust_boundary?.human_gate_required === true && !hasRequiredGate(stage, actionsById)) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'human_gate_required_without_gate_ref',
      message: 'Stage requires a human gate but has no owner receipt flag or action human gate ref.',
      stage_id: stage.stage_id,
    });
  }
}

function inspectHumanReviewBurdenBudget(
  budget: FamilyHumanReviewBurdenBudget,
  findings: FamilyStageConformanceFinding[],
) {
  for (const gate of budget.gates) {
    if (gate.status !== 'blocked') {
      continue;
    }
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'human_review_gate_budget_blocked',
      message: `Human review gate ${gate.gate_id} is missing required typed refs: ${gate.missing_refs.join(', ')}.`,
      stage_id: gate.stage_id ?? undefined,
      minimal_counterexample: {
        gate_id: gate.gate_id,
        gate_type: gate.gate_type,
        owner: gate.owner,
        missing_refs: gate.missing_refs,
      },
    });
  }
}

function inspectReviewGate(stage: FamilyStageDescriptor, findings: FamilyStageConformanceFinding[]) {
  if (!['review', 'publish', 'operator_gate'].includes(stage.stage_kind)) {
    return;
  }
  if (hasRequiredGate(stage, new Map())) {
    return;
  }
  pushFinding(findings, {
    severity: 'warning',
    code: 'review_stage_without_independent_gate_receipt',
    message: 'Review, publish, and operator-gate stages should declare an independent gate or owner receipt requirement.',
    stage_id: stage.stage_id,
  });
}

function inspectComposition(plane: FamilyStageControlPlane, findings: FamilyStageConformanceFinding[]) {
  const byStageId = new Map(plane.stages.map((stage) => [stage.stage_id, stage]));
  for (const stage of plane.stages) {
    const nextStageRefs = readNextStageRefs(stage);
    if (nextStageRefs.length === 0) {
      continue;
    }
    const sourceEnsures = new Set([
      ...(stage.stage_contract?.ensures ?? []),
      ...readStageProvides(stage),
    ]);
    for (const targetStageId of nextStageRefs) {
      const target = byStageId.get(targetStageId);
      if (!target) {
        pushFinding(findings, {
          severity: 'nonconformance',
          code: 'handoff_target_missing',
          message: 'Stage handoff points to a stage that is not present in the same control plane.',
          stage_id: stage.stage_id,
          target_stage_id: targetStageId,
        });
        continue;
      }
      for (const requirement of target.stage_contract?.requires ?? []) {
        if (!sourceEnsures.has(requirement)) {
          pushFinding(findings, {
            severity: 'nonconformance',
            code: 'composition_obligation_not_satisfied',
            message: `Upstream stage does not ensure downstream requirement: ${requirement}.`,
            stage_id: stage.stage_id,
            target_stage_id: targetStageId,
          });
        }
      }
    }
  }
}

function inspectStaticCycles(plane: FamilyStageControlPlane, findings: FamilyStageConformanceFinding[]) {
  const staticStageIds = new Set(
    plane.stages
      .filter((stage) => stage.trust_boundary?.static_check_eligible === true)
      .map((stage) => stage.stage_id),
  );
  const edges = new Map<string, string[]>();
  for (const stage of plane.stages) {
    if (!staticStageIds.has(stage.stage_id)) {
      continue;
    }
    edges.set(
      stage.stage_id,
      readNextStageRefs(stage).filter((targetStageId) => staticStageIds.has(targetStageId)),
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (stageId: string, path: string[]): boolean => {
    if (visiting.has(stageId)) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'static_core_cycle_detected',
        message: `Static-check-eligible stage handoff graph contains a cycle: ${[...path, stageId].join(' -> ')}.`,
        stage_id: stageId,
      });
      return true;
    }
    if (visited.has(stageId)) {
      return false;
    }
    visiting.add(stageId);
    for (const next of edges.get(stageId) ?? []) {
      if (walk(next, [...path, stageId])) {
        return true;
      }
    }
    visiting.delete(stageId);
    visited.add(stageId);
    return false;
  };

  for (const stageId of staticStageIds) {
    if (walk(stageId, [])) {
      return;
    }
  }
}

function statusFromCounts(blockerCount: number, warningCount: number): FamilyStageConformanceStatus {
  if (blockerCount > 0) {
    return 'nonconformant';
  }
  if (warningCount > 0) {
    return 'quality_debt';
  }
  return 'conformant';
}

function inspectOfficialQualityGovernance(
  plane: FamilyStageControlPlane,
  findings: FamilyStageConformanceFinding[],
) {
  if (!plane.quality_governance_profile_ref) return;
  if (!plane.meta_review_policy_ref) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'official_quality_profile_missing_meta_review_policy',
      message: 'Official knowledge-deliverable profile requires a Meta Review policy ref.',
    });
  }
  const metaReviewStages = plane.stages.filter((stage) => stage.stage_role === 'cross_stage_meta_review');
  if (metaReviewStages.length !== 1) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'official_quality_profile_meta_review_stage_count_invalid',
      message: 'Official knowledge-deliverable profile requires exactly one cross-stage Meta Review Stage.',
    });
  }
  for (const stage of plane.stages) {
    const reviewExempt = stage.stage_kind === 'operator_gate' || stage.trust_boundary?.lane === 'human_gate';
    if (!reviewExempt && !stage.stage_quality_cycle_policy_ref) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'official_quality_profile_stage_review_policy_missing',
        message: 'AI-executed official knowledge-deliverable stages require an isolated Stage Review policy.',
        stage_id: stage.stage_id,
      });
    }
  }
  const metaReview = metaReviewStages[0];
  if (!metaReview) return;
  if (
    metaReview.stage_kind !== 'review'
    || metaReview.independent_gate_policy?.execution_review_separation_required !== true
  ) {
    pushFinding(findings, {
      severity: 'nonconformance',
      code: 'official_quality_profile_meta_review_not_independent',
      message: 'Cross-stage Meta Review must be an independent review Stage.',
      stage_id: metaReview.stage_id,
    });
  }
  const inbound = new Set(plane.stages.flatMap((stage) => readNextStageRefs(stage)));
  const roots = plane.stages.filter((stage) => !inbound.has(stage.stage_id));
  const byId = stageById(plane);
  const visited = new Set<string>();
  const walk = (stageId: string, seenMetaReview: boolean, path: string[]) => {
    const key = `${stageId}:${seenMetaReview}`;
    if (visited.has(key)) return;
    visited.add(key);
    const stage = byId.get(stageId);
    if (!stage) return;
    const nextSeen = seenMetaReview || stage.stage_id === metaReview.stage_id;
    const next = readNextStageRefs(stage);
    if (next.length === 0 && !nextSeen) {
      pushFinding(findings, {
        severity: 'nonconformance',
        code: 'official_quality_profile_terminal_path_bypasses_meta_review',
        message: 'Terminal knowledge handoff path bypasses cross-stage Meta Review.',
        stage_id: stage.stage_id,
        minimal_counterexample: { path: [...path, stage.stage_id] },
      });
      return;
    }
    for (const nextStageId of next) walk(nextStageId, nextSeen, [...path, stage.stage_id]);
  };
  for (const root of roots) walk(root.stage_id, false, []);
}

function stageResult(stage: FamilyStageDescriptor, findings: FamilyStageConformanceFinding[]): FamilyStageConformanceStageResult {
  const stageFindings = findings.filter((finding) => finding.stage_id === stage.stage_id);
  const blockerCount = stageFindings.filter((finding) => finding.severity === 'nonconformance').length;
  const warningCount = stageFindings.filter((finding) => finding.severity === 'warning').length;
  const effectBoundary = stage.trust_boundary?.effect_boundary === true
    || (stage.trust_boundary ? EFFECT_BOUNDARY_LANES.has(stage.trust_boundary.lane) : false);
  return {
    stage_id: stage.stage_id,
    status: statusFromCounts(blockerCount, warningCount),
    trust_lane: stage.trust_boundary?.lane ?? null,
    static_check_eligible: stage.trust_boundary?.static_check_eligible === true,
    effect_boundary: effectBoundary,
    mode_tags: buildFamilyStageModeTags(stage),
    runtime_event_refs: readRuntimeEventRefs(stage),
    tool_affordance_boundary: buildToolAffordanceBoundaryProjection(stage),
    finding_count: stageFindings.length,
    blocker_count: blockerCount,
    warning_count: warningCount,
  };
}

export function buildFamilyStageConformanceReview(
  plane: FamilyStageControlPlane,
  manifest: Pick<FamilyStageDomainManifest, 'family_action_catalog'> | null = null,
): FamilyStageConformanceReview {
  const findings: FamilyStageConformanceFinding[] = [];
  const actionsById = actionMap(manifest?.family_action_catalog);
  const humanReviewBurdenBudget = buildStagePackHumanReviewBurdenBudget(
    plane,
    manifest?.family_action_catalog ?? null,
  );

  for (const stage of plane.stages) {
    inspectAuthorityBoundary(stage, findings);
    inspectTrustBoundary(stage, findings);
    inspectStageContract(stage, findings);
    inspectToolAffordanceBoundary(stage, findings, stageUsesStandardStagePackV2(plane, stage));
    inspectActions(stage, findings, actionsById);
    inspectReviewGate(stage, findings);
  }
  inspectComposition(plane, findings);
  inspectStaticCycles(plane, findings);
  inspectRuntimeAssumptions(plane, findings);
  inspectHumanReviewBurdenBudget(humanReviewBurdenBudget, findings);
  inspectOfficialQualityGovernance(plane, findings);

  const localizedFindings = localizeFindings(findings, stageById(plane));
  const stageResults = plane.stages.map((stage) => stageResult(stage, localizedFindings));
  const blockersCount = localizedFindings.filter((finding) => finding.severity === 'nonconformance').length;
  const warningsCount = localizedFindings.filter((finding) => finding.severity === 'warning').length;

  return {
    surface_kind: 'family_stage_conformance_review',
    version: 'family-stage-conformance-review.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    status: statusFromCounts(blockersCount, warningsCount),
    summary: {
      stages_count: stageResults.length,
      conformant_stages_count: stageResults.filter((result) => result.status === 'conformant').length,
      nonconformant_stages_count: stageResults.filter((result) => result.status === 'nonconformant').length,
      quality_debt_stages_count: stageResults.filter((result) => result.status === 'quality_debt').length,
      nonconformances_count: blockersCount,
      warnings_count: warningsCount,
      verified_core_eligible_count: stageResults.filter((result) => result.mode_tags.verified_core_eligible).length,
      durable_runtime_only_count: stageResults.filter((result) => result.mode_tags.durable_runtime_only).length,
      runtime_boundary_required_count: stageResults.filter((result) => result.mode_tags.runtime_boundary_required).length,
      human_review_gate_count: humanReviewBurdenBudget.summary.gate_count,
      blocked_human_review_gate_count: humanReviewBurdenBudget.summary.blocked_gate_count,
    },
    stage_results: stageResults,
    findings: localizedFindings,
    failure_localization: buildFailureLocalization(localizedFindings),
    human_review_burden_budget: humanReviewBurdenBudget,
    authority_boundary: {
      opl_role: 'static_conformance_projection_only',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
