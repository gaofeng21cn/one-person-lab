import { canonicalOwnerId } from '../../kernel/owner-id.ts';
import {
  isRecord,
  optionalString,
  readJsonFile,
  recordList,
  unique,
} from './standard-domain-agent-conformance-utils.ts';

interface StageRunAdoptionTailItem {
  status?: unknown;
}

interface StageRunAdoptionReport {
  repo_dir: string;
  requested_agent_id: string | null;
  domain_id: string;
  status: string;
  stage_run_kernel_profile_checks: {
    status: string;
    profile_source: unknown;
    default_read_surface: {
      root: unknown;
    };
    codex_semantic_route_policy: {
      semantic_owner: unknown;
    };
  };
  stage_run_canary_evidence_checks: {
    status: string;
    evidence_scope: unknown;
    operator_summary: {
      status: string;
    };
    stage_id: unknown;
    canary_id: unknown;
    stage_run_ref: unknown;
    stage_manifest_ref: unknown;
    current_pointer_ref: unknown;
  };
  stage_operating_principle_checks: {
    status: string;
    policy_source: unknown;
    management_boundary: {
      stage_unit: unknown;
    };
    speed_policy: {
      executor_autonomy_inside_stage: unknown;
      quality_gaps_block_ordinary_progress_by_default: unknown;
    };
    default_read_surface: {
      root: unknown;
    };
    demoted_default_surfaces: unknown;
  };
  evidence_tail_classification: {
    status: string;
    tail_items: StageRunAdoptionTailItem[];
  };
}

interface LiveStageRunProgressEvidence {
  status: string;
  evidence_contract_ref: string;
  evidence_contract_status: string;
  observed_receipt_refs: string[];
  observed_ref_shapes: string[];
  observed_ref_counts: Record<string, number>;
  doc_refs: string[];
  next_verification_refs: string[];
  typed_blocker_kind: string | null;
  next_required_owner_action: string;
  open: boolean;
}

const LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES = [
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'quality_or_export_receipt_ref',
  'no_regression_ref',
  'long_soak_ref',
];

const LIVE_STAGE_RUN_PROGRESS_FORBIDDEN_OPL_CLAIMS = [
  'live_domain_progress_complete',
  'domain_ready',
  'production_ready',
  'quality_or_export_ready',
  'owner_receipt_signed_by_opl',
  'typed_blocker_created_by_opl',
];

const LIVE_STAGE_RUN_PROGRESS_NON_CLOSING_INPUTS = [
  'structural_conformance_pass',
  'controlled_canary_pass',
  'production_acceptance_tail_present',
  'docs_foldback',
  'verified_refs_only_ledger_without_live_stage_run_progress_binding',
  'zero_open_worklist_count',
];

const LIVE_STAGE_RUN_PROGRESS_STOP_LOSS = [
  'if status is owner_typed_blocker_recorded_not_ready_claim, wait for domain owner route-back, no_regression_ref, or updated live progress evidence before treating the lane as complete',
  'if verification commands fail, keep the domain in required_from_domain_owner or owner_typed_blocker_recorded_not_ready_claim and do not claim domain_ready',
  'if observed refs are not bound to contracts/live_stage_run_progress_evidence.json, request a domain-owned contract update instead of synthesizing an owner receipt',
];

const LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT =
  'contracts/live_stage_run_progress_evidence.json';

const LIVE_STAGE_RUN_PROGRESS_EVIDENCE_SURFACE_KIND =
  'domain_live_stage_run_progress_evidence';

const LIVE_STAGE_RUN_PROGRESS_EVIDENCE_ACCEPTED_STATUSES = [
  'owner_evidence_recorded_not_ready_claim',
  'owner_typed_blocker_recorded_not_ready_claim',
  'owner_evidence_required',
];

const LIVE_STAGE_RUN_PROGRESS_REF_FIELDS = [
  'domain_owner_receipt_refs',
  'owner_receipt_refs',
  'domain_receipt_refs',
  'typed_blocker_refs',
  'human_gate_refs',
  'quality_or_export_receipt_refs',
  'quality_gate_receipt_refs',
  'export_receipt_refs',
  'reviewer_receipt_refs',
  'no_regression_refs',
  'long_soak_refs',
  'owner_acceptance_refs',
];

const LIVE_STAGE_RUN_PROGRESS_REF_SHAPES: Record<string, string> = {
  domain_owner_receipt_refs: 'domain_owner_receipt_ref',
  owner_receipt_refs: 'domain_owner_receipt_ref',
  domain_receipt_refs: 'domain_owner_receipt_ref',
  typed_blocker_refs: 'typed_blocker_ref',
  human_gate_refs: 'human_gate_ref',
  quality_or_export_receipt_refs: 'quality_or_export_receipt_ref',
  quality_gate_receipt_refs: 'quality_or_export_receipt_ref',
  export_receipt_refs: 'quality_or_export_receipt_ref',
  reviewer_receipt_refs: 'quality_or_export_receipt_ref',
  no_regression_refs: 'no_regression_ref',
  long_soak_refs: 'long_soak_ref',
  owner_acceptance_refs: 'domain_owner_receipt_ref',
};

function countTailItems(report: StageRunAdoptionReport, status: string) {
  return report.evidence_tail_classification.tail_items
    .filter((item) => optionalString(item.status) === status)
    .length;
}

function refString(value: unknown) {
  if (isRecord(value)) {
    return optionalString(value.ref);
  }
  return optionalString(value);
}

function refList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => refString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  const direct = refString(value);
  return direct ? [direct] : [];
}

function nestedRecord(value: unknown, field: string) {
  return isRecord(value) && isRecord(value[field]) ? value[field] : {};
}

function falseFlag(record: Record<string, unknown>, field: string) {
  return record[field] === false;
}

function validLiveStageRunProgressEvidenceContract(payload: Record<string, unknown>) {
  const authorityBoundary = nestedRecord(payload, 'authority_boundary');
  return payload.surface_kind === LIVE_STAGE_RUN_PROGRESS_EVIDENCE_SURFACE_KIND
    && LIVE_STAGE_RUN_PROGRESS_EVIDENCE_ACCEPTED_STATUSES.includes(
      optionalString(payload.status) ?? '',
    )
    && authorityBoundary.refs_only === true
    && falseFlag(authorityBoundary, 'opl_can_sign_owner_receipt')
    && falseFlag(authorityBoundary, 'opl_can_create_typed_blocker')
    && falseFlag(authorityBoundary, 'opl_can_claim_domain_ready')
    && falseFlag(authorityBoundary, 'opl_can_claim_production_ready');
}

function collectLiveProgressRefs(payload: unknown) {
  const refs = isRecord(payload) ? nestedRecord(payload, 'refs') : {};
  const evidenceItems = isRecord(payload) ? recordList(payload.evidence_items) : [];
  const shapeRefs = LIVE_STAGE_RUN_PROGRESS_REF_FIELDS
    .flatMap((field) => [
      ...refList(isRecord(payload) ? payload[field] : null).map((ref) => ({
        ref,
        shape: LIVE_STAGE_RUN_PROGRESS_REF_SHAPES[field],
      })),
      ...refList(refs[field]).map((ref) => ({
        ref,
        shape: LIVE_STAGE_RUN_PROGRESS_REF_SHAPES[field],
      })),
    ]);
  const itemRefs = evidenceItems.flatMap((item) => {
    const shape = optionalString(item.result_shape)
      ?? optionalString(item.ref_shape)
      ?? optionalString(item.accepted_ref_shape);
    const ref = refString(item.ref)
      ?? refString(item.receipt_ref)
      ?? refString(item.evidence_ref)
      ?? refString(item.typed_blocker_ref);
    if (!shape || !ref || !LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES.includes(shape)) {
      return [];
    }
    return [{ ref, shape }];
  });
  const seen = new Set<string>();
  return [...shapeRefs, ...itemRefs].filter((entry) => {
    const key = `${entry.ref}\0${entry.shape}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function countShapes(refs: Array<{ shape: string }>) {
  return LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES.reduce<Record<string, number>>(
    (counts, shape) => {
      counts[`${shape}_count`] = refs.filter((entry) => entry.shape === shape).length;
      return counts;
    },
    {},
  );
}

function readLiveStageRunProgressEvidence(report: StageRunAdoptionReport): LiveStageRunProgressEvidence {
  const file = readJsonFile(report.repo_dir, LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT);
  if (file.status === 'missing') {
    return {
      status: 'required_from_domain_owner',
      evidence_contract_ref: LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT,
      evidence_contract_status: 'missing',
      observed_receipt_refs: [],
      observed_ref_shapes: [],
      observed_ref_counts: countShapes([]),
      doc_refs: [],
      next_verification_refs: [],
      typed_blocker_kind: null,
      next_required_owner_action: stageRunDomainNextAction(report, true, false),
      open: true,
    };
  }
  if (file.status !== 'resolved' || !isRecord(file.payload)) {
    return {
      status: 'blocked_invalid_domain_live_progress_evidence',
      evidence_contract_ref: LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT,
      evidence_contract_status: file.status,
      observed_receipt_refs: [],
      observed_ref_shapes: [],
      observed_ref_counts: countShapes([]),
      doc_refs: [],
      next_verification_refs: [],
      typed_blocker_kind: null,
      next_required_owner_action: 'repair_domain_live_stage_run_progress_evidence_contract',
      open: true,
    };
  }
  if (!validLiveStageRunProgressEvidenceContract(file.payload)) {
    return {
      status: 'blocked_invalid_domain_live_progress_evidence',
      evidence_contract_ref: LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT,
      evidence_contract_status: 'resolved_invalid_standard_contract',
      observed_receipt_refs: [],
      observed_ref_shapes: [],
      observed_ref_counts: countShapes([]),
      doc_refs: [],
      next_verification_refs: [],
      typed_blocker_kind: null,
      next_required_owner_action: 'repair_domain_live_stage_run_progress_evidence_contract',
      open: true,
    };
  }
  const refs = collectLiveProgressRefs(file.payload);
  const observedRefShapes = unique(refs.map((entry) => entry.shape)).sort();
  const typedBlockerKind = optionalString(file.payload.typed_blocker_kind)
    ?? optionalString(nestedRecord(file.payload, 'typed_blocker').blocker_kind);
  const hasTypedBlocker = observedRefShapes.includes('typed_blocker_ref');
  const hasClosingRef = observedRefShapes.some((shape) =>
    LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES.includes(shape)
  );
  const docRefs = unique([
    ...refList(file.payload.doc_refs),
    ...refList(nestedRecord(file.payload, 'refs').doc_refs),
  ]);
  const nextVerificationRefs = unique([
    ...refList(file.payload.next_verification_command_refs),
    ...refList(file.payload.next_verification_refs),
    ...refList(file.payload.verification_refs),
    ...refList(nestedRecord(file.payload, 'refs').next_verification_command_refs),
    ...refList(nestedRecord(file.payload, 'refs').next_verification_refs),
    ...refList(nestedRecord(file.payload, 'refs').verification_refs),
  ]);
  if (!hasClosingRef) {
    return {
      status: 'required_from_domain_owner',
      evidence_contract_ref: LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT,
      evidence_contract_status: 'resolved_without_accepted_refs',
      observed_receipt_refs: [],
      observed_ref_shapes: [],
      observed_ref_counts: countShapes([]),
      doc_refs: docRefs,
      next_verification_refs: nextVerificationRefs,
      typed_blocker_kind: typedBlockerKind,
      next_required_owner_action: stageRunDomainNextAction(report, true, false),
      open: true,
    };
  }
  const status = hasTypedBlocker
    ? 'owner_typed_blocker_recorded_not_ready_claim'
    : 'owner_evidence_recorded_not_ready_claim';
  return {
    status,
    evidence_contract_ref: LIVE_STAGE_RUN_PROGRESS_EVIDENCE_CONTRACT,
    evidence_contract_status: 'resolved_with_domain_owner_refs',
    observed_receipt_refs: unique(refs.map((entry) => entry.ref)),
    observed_ref_shapes: observedRefShapes,
    observed_ref_counts: countShapes(refs),
    doc_refs: docRefs,
    next_verification_refs: nextVerificationRefs,
    typed_blocker_kind: typedBlockerKind,
    next_required_owner_action: stageRunDomainNextAction(report, false, hasTypedBlocker),
    open: false,
  };
}

function stageRunDomainNextAction(
  report: StageRunAdoptionReport,
  liveProgressEvidenceOpen = true,
  liveProgressTypedBlockerObserved = false,
) {
  if (
    report.stage_run_kernel_profile_checks.status !== 'passed'
    || report.stage_run_canary_evidence_checks.status !== 'passed'
    || report.stage_run_canary_evidence_checks.operator_summary.status !== 'ready'
  ) {
    return 'repair_stage_run_profile_canary_or_structural_conformance_blockers';
  }
  if (!liveProgressEvidenceOpen) {
    if (liveProgressTypedBlockerObserved) {
      return 'domain_owner_typed_blocker_ref_recorded_wait_for_owner_resolution_route_back_or_no_regression_ref';
    }
    return 'domain_owner_live_progress_evidence_recorded_not_domain_or_production_ready';
  }
  if (countTailItems(report, 'open') > 0) {
    return 'domain_owner_live_receipt_typed_blocker_no_regression_or_long_soak_ref_required';
  }
  if (countTailItems(report, 'domain_owned_typed_blocker') > 0) {
    return 'domain_owner_typed_blocker_ref_observed_wait_for_owner_resolution_or_no_regression_ref';
  }
  return 'domain_owner_live_progress_evidence_still_required_before_domain_or_production_ready';
}

function conformanceCommandForDomain(domain: {
  requested_agent_id: string | null;
  repo_dir: string;
  domain_id: string;
}) {
  const agentId = domain.requested_agent_id ?? domain.domain_id;
  return `opl agents conformance --agent ${agentId}=${domain.repo_dir} --json`;
}

function liveStageRunProgressClosingRefSource(evidenceContractRef: string) {
  return `${evidenceContractRef}#domain_owner_receipt_refs|typed_blocker_refs|human_gate_refs|quality_or_export_receipt_refs|no_regression_refs|long_soak_refs`;
}

export function buildStageRunDomainAdoptionReadModel(reports: StageRunAdoptionReport[]) {
  const domains = reports.map((report) => {
    const profile = report.stage_run_kernel_profile_checks;
    const canary = report.stage_run_canary_evidence_checks;
    const domainId = canonicalOwnerId(report.domain_id);
    const liveProgressEvidence = readLiveStageRunProgressEvidence(report);
    return {
      domain_id: domainId,
      ...(domainId !== report.domain_id ? { source_domain_id: report.domain_id } : {}),
      requested_agent_id: report.requested_agent_id,
      repo_dir: report.repo_dir,
      status: report.status,
      stage_run_kernel_profile_status: profile.status,
      stage_run_kernel_profile_source: profile.profile_source,
      stage_run_default_read_surface_root: profile.default_read_surface.root,
      stage_run_semantic_route_owner:
        profile.codex_semantic_route_policy.semantic_owner,
      stage_run_canary_evidence_status: canary.status,
      stage_run_canary_evidence_scope: canary.evidence_scope,
      stage_run_canary_operator_status: canary.operator_summary.status,
      stage_run_canary_stage_id: canary.stage_id,
      stage_run_canary_id: canary.canary_id,
      stage_operating_principles_status: report.stage_operating_principle_checks.status,
      stage_operating_principles_source:
        report.stage_operating_principle_checks.policy_source,
      management_boundary_stage_unit:
        report.stage_operating_principle_checks.management_boundary.stage_unit,
      speed_policy_executor_autonomy_inside_stage:
        report.stage_operating_principle_checks.speed_policy.executor_autonomy_inside_stage,
      speed_policy_quality_gaps_block_ordinary_progress_by_default:
        report.stage_operating_principle_checks.speed_policy
          .quality_gaps_block_ordinary_progress_by_default,
      stage_operating_default_read_surface_root:
        report.stage_operating_principle_checks.default_read_surface.root,
      stage_operating_demoted_default_surfaces:
        report.stage_operating_principle_checks.demoted_default_surfaces,
      stage_run_ref: canary.stage_run_ref,
      stage_manifest_ref: canary.stage_manifest_ref,
      current_pointer_ref: canary.current_pointer_ref,
      controlled_canary_claims_live_domain_progress: false,
      domain_production_acceptance_tail_status: report.evidence_tail_classification.status,
      domain_production_acceptance_tail_count: report.evidence_tail_classification.tail_items.length,
      domain_production_acceptance_tail_open_count: countTailItems(report, 'open'),
      domain_production_acceptance_tail_typed_blocker_count: countTailItems(
        report,
        'domain_owned_typed_blocker',
      ),
      domain_production_acceptance_tail_scope:
        'domain_owned_acceptance_refs_not_live_stage_run_progress_evidence',
      production_evidence_tail_status: report.evidence_tail_classification.status,
      production_evidence_tail_count: report.evidence_tail_classification.tail_items.length,
      production_evidence_tail_open_count: countTailItems(report, 'open'),
      production_evidence_tail_typed_blocker_count: countTailItems(report, 'domain_owned_typed_blocker'),
      live_stage_run_progress_evidence_status: liveProgressEvidence.status,
      live_stage_run_progress_evidence_required_from: 'domain_owner',
      live_stage_run_progress_evidence_contract_ref:
        liveProgressEvidence.evidence_contract_ref,
      live_stage_run_progress_evidence_contract_status:
        liveProgressEvidence.evidence_contract_status,
      live_stage_run_progress_observed_receipt_refs:
        liveProgressEvidence.observed_receipt_refs,
      live_stage_run_progress_observed_ref_shapes:
        liveProgressEvidence.observed_ref_shapes,
      live_stage_run_progress_observed_ref_counts:
        liveProgressEvidence.observed_ref_counts,
      live_stage_run_progress_doc_refs: liveProgressEvidence.doc_refs,
      live_stage_run_progress_next_verification_refs:
        liveProgressEvidence.next_verification_refs,
      live_stage_run_progress_typed_blocker_kind:
        liveProgressEvidence.typed_blocker_kind,
      live_stage_run_progress_evidence_open: liveProgressEvidence.open,
      structural_conformance_is_domain_ready: false,
      next_required_owner_action: liveProgressEvidence.next_required_owner_action,
      authority_boundary: {
        can_claim_live_domain_progress: false,
        can_claim_domain_ready: false,
        can_claim_quality_or_export_ready: false,
        can_claim_artifact_ready: false,
        can_claim_production_ready: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_physical_delete: false,
      },
    };
  });
  const profilePassedCount = domains
    .filter((domain) => domain.stage_run_kernel_profile_status === 'passed')
    .length;
  const canaryPassedCount = domains
    .filter((domain) => domain.stage_run_canary_evidence_status === 'passed')
    .length;
  const productionEvidenceTailCount = domains.reduce(
    (total, domain) => total + domain.production_evidence_tail_count,
    0,
  );
  const openProductionEvidenceTailCount = domains.reduce(
    (total, domain) => total + domain.production_evidence_tail_open_count,
    0,
  );
  const domainProductionAcceptanceTailCount = domains.reduce(
    (total, domain) => total + domain.domain_production_acceptance_tail_count,
    0,
  );
  const openDomainProductionAcceptanceTailCount = domains.reduce(
    (total, domain) => total + domain.domain_production_acceptance_tail_open_count,
    0,
  );
  const liveStageRunProgressEvidenceOpenDomains = domains
    .filter((domain) => domain.live_stage_run_progress_evidence_open);
  const liveStageRunProgressEvidenceStatus =
    liveStageRunProgressEvidenceOpenDomains.length === 0
      ? 'owner_evidence_recorded_not_ready_claim'
      : 'required_from_domain_owner';
  const liveStageRunProgressEvidenceWorklist = {
    surface_kind: 'opl_live_stage_run_progress_evidence_worklist',
    owner: 'domain_owner',
    status: liveStageRunProgressEvidenceStatus,
    open_domain_count: liveStageRunProgressEvidenceOpenDomains.length,
    required_from: 'domain_owner',
    accepted_refs_only_result_shapes: LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES,
    domains: domains.map((domain) => ({
      domain_id: domain.domain_id,
      requested_agent_id: domain.requested_agent_id,
      repo_dir: domain.repo_dir,
      status: domain.live_stage_run_progress_evidence_status,
      evidence_contract_ref: domain.live_stage_run_progress_evidence_contract_ref,
      evidence_contract_status: domain.live_stage_run_progress_evidence_contract_status,
      observed_receipt_refs: domain.live_stage_run_progress_observed_receipt_refs,
      observed_ref_shapes: domain.live_stage_run_progress_observed_ref_shapes,
      observed_ref_counts: domain.live_stage_run_progress_observed_ref_counts,
      doc_refs: domain.live_stage_run_progress_doc_refs,
      next_verification_refs: domain.live_stage_run_progress_next_verification_refs,
      verification_commands: unique([
        ...domain.live_stage_run_progress_next_verification_refs,
        conformanceCommandForDomain(domain),
      ]),
      source_command: conformanceCommandForDomain(domain),
      owner_repo: domain.repo_dir,
      next_owner_repo: domain.repo_dir,
      closing_ref_source:
        liveStageRunProgressClosingRefSource(domain.live_stage_run_progress_evidence_contract_ref),
      typed_blocker_source:
        `${domain.live_stage_run_progress_evidence_contract_ref}#typed_blocker_refs`,
      forbidden_opl_claims: LIVE_STAGE_RUN_PROGRESS_FORBIDDEN_OPL_CLAIMS,
      non_closing_inputs: LIVE_STAGE_RUN_PROGRESS_NON_CLOSING_INPUTS,
      stop_loss: LIVE_STAGE_RUN_PROGRESS_STOP_LOSS,
      ready_claim_authorized: false,
      typed_blocker_kind: domain.live_stage_run_progress_typed_blocker_kind,
      next_required_owner_action: domain.next_required_owner_action,
      accepted_refs_only_result_shapes: LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES,
      structural_conformance_is_domain_ready: domain.structural_conformance_is_domain_ready,
      conformance_can_claim_live_domain_progress: false,
      conformance_can_claim_domain_ready: false,
      conformance_can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    })),
    authority_boundary: {
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
  return {
    surface_kind: 'opl_stage_run_domain_adoption_read_model',
    owner: 'one-person-lab',
    read_model_role:
      'top_level_operator_projection_from_standard_domain_agent_conformance_reports',
    status: profilePassedCount === reports.length && canaryPassedCount === reports.length
      ? 'passed'
      : 'blocked',
    domain_count: reports.length,
    stage_run_kernel_profile_passed_count: profilePassedCount,
    stage_run_canary_evidence_passed_count: canaryPassedCount,
    controlled_canary_evidence_scope: domains.every((domain) =>
      domain.stage_run_canary_evidence_scope === 'controlled_fixture_not_live_domain_progress'
    )
      ? 'controlled_fixture_not_live_domain_progress'
      : 'mixed_or_blocked',
    production_evidence_tail_count: productionEvidenceTailCount,
    open_production_evidence_tail_count: openProductionEvidenceTailCount,
    production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
    domain_production_acceptance_tail_count: domainProductionAcceptanceTailCount,
    open_domain_production_acceptance_tail_count: openDomainProductionAcceptanceTailCount,
    domain_production_acceptance_tail_policy:
      'domain_owned_acceptance_refs_are_reported_separately_from_live_stage_run_progress',
    live_stage_run_progress_evidence_status: liveStageRunProgressEvidenceStatus,
    live_stage_run_progress_evidence_policy:
      'controlled_canary_and_structural_conformance_do_not_close_live_domain_progress_evidence_domain_owner_refs_or_typed_blockers_required',
    live_stage_run_progress_evidence_worklist: liveStageRunProgressEvidenceWorklist,
    controlled_canary_claims_live_domain_progress: false,
    conformance_pass_counts_as_domain_ready: false,
    conformance_pass_counts_as_production_ready: false,
    domains,
    authority_boundary: {
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
}
