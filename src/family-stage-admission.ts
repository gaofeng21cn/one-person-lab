import type { FamilyActionCatalog, FamilyActionCatalogAction } from './family-action-catalog-contract.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageTrustLane,
} from './family-stage-control-plane-contract.ts';
import type { NormalizedDomainManifest } from './domain-manifest/types.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyStageAdmissionStatus = 'admitted' | 'needs_contracts' | 'blocked';
export type FamilyStageAdmissionFindingSeverity = 'blocker' | 'warning';

export interface FamilyStageAdmissionFinding {
  severity: FamilyStageAdmissionFindingSeverity;
  code: string;
  message: string;
  stage_id?: string;
  target_stage_id?: string;
  action_id?: string;
  runtime_event_refs_missing_reason?: string;
}

export interface FamilyStageAdmissionStageResult {
  stage_id: string;
  status: FamilyStageAdmissionStatus;
  trust_lane: FamilyStageTrustLane | null;
  static_check_eligible: boolean;
  effect_boundary: boolean;
  runtime_event_refs: string[];
  finding_count: number;
  blocker_count: number;
  warning_count: number;
}

export interface FamilyStageAdmissionReview {
  surface_kind: 'family_stage_admission_review';
  version: 'family-stage-admission-review.v1';
  plane_id: string;
  target_domain_id: string;
  status: FamilyStageAdmissionStatus;
  summary: {
    stages_count: number;
    admitted_stages_count: number;
    blocked_stages_count: number;
    needs_contracts_stages_count: number;
    blockers_count: number;
    warnings_count: number;
  };
  stage_results: FamilyStageAdmissionStageResult[];
  findings: FamilyStageAdmissionFinding[];
  authority_boundary: {
    opl_role: 'admission_projection_and_contract_checker';
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pushFinding(
  findings: FamilyStageAdmissionFinding[],
  finding: FamilyStageAdmissionFinding,
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

function inspectAuthorityBoundary(stage: FamilyStageDescriptor, findings: FamilyStageAdmissionFinding[]) {
  const oplRole = optionalString(stage.authority_boundary.opl_role);
  if (oplRole && !ALLOWED_OPL_ROLES.has(oplRole)) {
    pushFinding(findings, {
      severity: 'blocker',
      code: 'invalid_opl_authority_role',
      message: 'OPL admission can only project, discover, or check contract metadata for a stage.',
      stage_id: stage.stage_id,
    });
  }
  for (const flag of FORBIDDEN_AUTHORITY_FLAGS) {
    if (stage.authority_boundary[flag] === true) {
      pushFinding(findings, {
        severity: 'blocker',
        code: 'forbidden_opl_authority',
        message: `Stage authority_boundary sets forbidden OPL authority flag: ${flag}.`,
        stage_id: stage.stage_id,
      });
    }
  }
}

function inspectTrustBoundary(stage: FamilyStageDescriptor, findings: FamilyStageAdmissionFinding[]) {
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
      severity: 'blocker',
      code: 'effect_boundary_without_event_recording',
      message: 'Effect boundary stages must record runtime events for replay, audit, and route-back.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'records_runtime_events is not true',
    });
  }
  if (!effectBoundary && runtimeGuardRequired && trust.records_runtime_events !== true) {
    pushFinding(findings, {
      severity: 'blocker',
      code: 'runtime_guard_without_event_recording',
      message: 'Runtime-guarded stages must record runtime events before OPL can launch or advance the stage.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'runtime_guard_required is true but records_runtime_events is not true',
    });
  }
  if (effectBoundary && runtimeEventRefs.length === 0) {
    pushFinding(findings, {
      severity: 'blocker',
      code: 'effect_boundary_missing_runtime_event_refs',
      message: 'Effect boundary stages must declare machine-readable runtime_event_refs for audit and replay.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'runtime_event_refs is empty on trust_boundary and stage_contract',
    });
  }
  if (!effectBoundary && runtimeEventDeclarationRequired && runtimeEventRefs.length === 0) {
    pushFinding(findings, {
      severity: 'blocker',
      code: 'runtime_guard_missing_runtime_event_refs',
      message: 'Runtime-guarded stages must declare machine-readable runtime_event_refs for audit, retry, and handoff.',
      stage_id: stage.stage_id,
      runtime_event_refs_missing_reason: 'runtime_guard_required is true but runtime_event_refs is empty on trust_boundary and stage_contract',
    });
  }
  if (effectBoundary && trust.static_check_eligible === true) {
    pushFinding(findings, {
      severity: 'blocker',
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

function inspectStageContract(stage: FamilyStageDescriptor, findings: FamilyStageAdmissionFinding[]) {
  const contract = stage.stage_contract;
  const staticCheckEligible = stage.trust_boundary?.static_check_eligible === true;
  if (!contract) {
    pushFinding(findings, {
      severity: staticCheckEligible ? 'blocker' : 'warning',
      code: 'missing_stage_contract',
      message: 'Stage has no requires/ensures contract metadata.',
      stage_id: stage.stage_id,
    });
    return;
  }
  if (contract.requires.length === 0) {
    pushFinding(findings, {
      severity: staticCheckEligible ? 'blocker' : 'warning',
      code: 'missing_requires_contract',
      message: 'Stage contract should declare required input conditions.',
      stage_id: stage.stage_id,
    });
  }
  if (contract.ensures.length === 0) {
    pushFinding(findings, {
      severity: staticCheckEligible ? 'blocker' : 'warning',
      code: 'missing_ensures_contract',
      message: 'Stage contract should declare output conditions for downstream composition checks.',
      stage_id: stage.stage_id,
    });
  }
}

function inspectActions(
  stage: FamilyStageDescriptor,
  findings: FamilyStageAdmissionFinding[],
  actionsById: Map<string, FamilyActionCatalogAction>,
) {
  for (const actionRef of stage.allowed_action_refs) {
    const action = actionsById.get(actionRef);
    if (!action && actionsById.size > 0) {
      pushFinding(findings, {
        severity: 'blocker',
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
      severity: 'blocker',
      code: 'human_gate_required_without_gate_ref',
      message: 'Stage requires a human gate but has no owner receipt flag or action human gate ref.',
      stage_id: stage.stage_id,
    });
  }
}

function inspectReviewGate(stage: FamilyStageDescriptor, findings: FamilyStageAdmissionFinding[]) {
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

function inspectComposition(plane: FamilyStageControlPlane, findings: FamilyStageAdmissionFinding[]) {
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
          severity: 'blocker',
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
            severity: 'blocker',
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

function inspectStaticCycles(plane: FamilyStageControlPlane, findings: FamilyStageAdmissionFinding[]) {
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
        severity: 'blocker',
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

function statusFromCounts(blockerCount: number, warningCount: number): FamilyStageAdmissionStatus {
  if (blockerCount > 0) {
    return 'blocked';
  }
  if (warningCount > 0) {
    return 'needs_contracts';
  }
  return 'admitted';
}

function stageResult(stage: FamilyStageDescriptor, findings: FamilyStageAdmissionFinding[]): FamilyStageAdmissionStageResult {
  const stageFindings = findings.filter((finding) => finding.stage_id === stage.stage_id);
  const blockerCount = stageFindings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = stageFindings.filter((finding) => finding.severity === 'warning').length;
  const effectBoundary =
    stage.trust_boundary?.effect_boundary === true
    || (stage.trust_boundary ? EFFECT_BOUNDARY_LANES.has(stage.trust_boundary.lane) : false);
  return {
    stage_id: stage.stage_id,
    status: statusFromCounts(blockerCount, warningCount),
    trust_lane: stage.trust_boundary?.lane ?? null,
    static_check_eligible: stage.trust_boundary?.static_check_eligible === true,
    effect_boundary: effectBoundary,
    runtime_event_refs: readRuntimeEventRefs(stage),
    finding_count: stageFindings.length,
    blocker_count: blockerCount,
    warning_count: warningCount,
  };
}

export function buildFamilyStageAdmissionReview(
  plane: FamilyStageControlPlane,
  manifest: Pick<NormalizedDomainManifest, 'family_action_catalog'> | null = null,
): FamilyStageAdmissionReview {
  const findings: FamilyStageAdmissionFinding[] = [];
  const actionsById = actionMap(manifest?.family_action_catalog);

  for (const stage of plane.stages) {
    inspectAuthorityBoundary(stage, findings);
    inspectTrustBoundary(stage, findings);
    inspectStageContract(stage, findings);
    inspectActions(stage, findings, actionsById);
    inspectReviewGate(stage, findings);
  }
  inspectComposition(plane, findings);
  inspectStaticCycles(plane, findings);

  const stageResults = plane.stages.map((stage) => stageResult(stage, findings));
  const blockersCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningsCount = findings.filter((finding) => finding.severity === 'warning').length;

  return {
    surface_kind: 'family_stage_admission_review',
    version: 'family-stage-admission-review.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    status: statusFromCounts(blockersCount, warningsCount),
    summary: {
      stages_count: stageResults.length,
      admitted_stages_count: stageResults.filter((result) => result.status === 'admitted').length,
      blocked_stages_count: stageResults.filter((result) => result.status === 'blocked').length,
      needs_contracts_stages_count: stageResults.filter((result) => result.status === 'needs_contracts').length,
      blockers_count: blockersCount,
      warnings_count: warningsCount,
    },
    stage_results: stageResults,
    findings,
    authority_boundary: {
      opl_role: 'admission_projection_and_contract_checker',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
