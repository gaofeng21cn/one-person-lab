import { buildAgentDefaultCallerReadinessReport } from '../workspace/index.ts';
import { buildBrandModuleL5Status } from '../charter/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { OBSERVABILITY_EVIDENCE_LEDGER_FIELD } from '../../kernel/observability-projection-vocabulary.ts';
import { buildFoundryAgentOsOwnerEvidenceIntake } from './foundry-agent-os-owner-evidence-intake.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import {
  booleanValue,
  numberValue,
  record,
  recordList,
  stringValue,
} from './framework-readiness-values.ts';
import { currentOwnerDeltaBridge } from './framework-operating-maturity-parts/current-owner-delta-bridge.ts';
import {
  foundryAgentOsProductionEvidenceGate,
  nextOwnerActions,
} from './framework-operating-maturity-parts/production-evidence-gate.ts';
import {
  appOperatorDrilldownMaturity,
  appReleaseUserPathExecutionRunbook,
  appReleaseUserPathMaturity,
  providerLongSoakExecutionRunbook,
  stringListValue,
  unique,
} from './framework-operating-maturity-parts/evidence-lanes.ts';
import { buildStandardDomainAgentConformanceReport } from '../workspace/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  requireRuntimeTraySnapshotProvider,
  type RuntimeTraySnapshotProvider,
} from '../runway/index.ts';

type OperatingMaturityArgs = {
  familyDefaults: boolean;
};

type OperatingMaturityOptions = {
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
};

const AUTHORITY_BOUNDARY = {
  can_claim_domain_ready: false,
  can_claim_app_release_ready: false,
  can_claim_l5: false,
  can_claim_production_ready: false,
  can_claim_quality_or_export_ready: false,
  can_claim_artifact_ready: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_physical_delete: false,
};

const COMPACT_READBACK_AUTHORITY_BOUNDARY = {
  refs_only: true,
  derived_from_full_readback: true,
  can_claim_domain_ready: false,
  can_claim_app_release_ready: false,
  can_claim_l5: false,
  can_claim_production_ready: false,
  can_claim_quality_or_export_ready: false,
  can_claim_artifact_ready: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_physical_delete: false,
};

function evidenceRequiredStatus(openCounts: number[]) {
  return openCounts.some((count) => count > 0) ? 'evidence_required' : 'evidence_recorded_not_ready_claim';
}

function domainKey(value: unknown) {
  const raw = typeof value === 'string' ? value : '';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    redcubeai: 'redcube',
  };
  return aliases[compact] ?? compact;
}

const DOMAIN_OWNER_CHAIN_FORBIDDEN_OPL_CLAIMS = [
  'live_domain_progress_complete',
  'domain_ready',
  'production_ready',
  'quality_or_export_ready',
  'owner_receipt_signed_by_opl',
  'typed_blocker_created_by_opl',
];

const DOMAIN_OWNER_CHAIN_NON_CLOSING_INPUTS = [
  'structural_conformance_pass',
  'controlled_canary_pass',
  'production_acceptance_tail_present',
  'docs_foldback',
  'verified_refs_only_ledger_without_live_stage_run_progress_binding',
  'zero_open_worklist_count',
];

const DOMAIN_OWNER_CHAIN_STOP_LOSS = [
  'if status is owner_typed_blocker_recorded_not_ready_claim, wait for domain owner route-back, no_regression_ref, or updated live progress evidence before treating the lane as complete',
  'if verification commands fail, keep the domain in required_from_domain_owner or owner_typed_blocker_recorded_not_ready_claim and do not claim domain_ready',
  'if observed refs are not bound to contracts/live_stage_run_progress_evidence.json, request a domain-owned contract update instead of synthesizing an owner receipt',
];

function domainOwnerChainSourceCommand(domain: Record<string, unknown>) {
  const sourceCommand = stringValue(domain.source_command);
  if (sourceCommand) {
    return sourceCommand;
  }
  const requestedAgentId = stringValue(domain.requested_agent_id)
    ?? stringValue(domain.domain_id)
    ?? '<domain>';
  const repoDir = stringValue(domain.repo_dir) ?? '<repo-dir>';
  return `opl agents conformance --agent ${requestedAgentId}=${repoDir} --json`;
}

function domainOwnerEvidenceRoutes(
  domainOwnerChain: Record<string, unknown>,
  ownerEvidenceIntake: Record<string, unknown>,
) {
  const observedDomainById = new Map(
    recordList(
      recordList(ownerEvidenceIntake.lane_evidence)
        .find((entry) => stringValue(entry.lane) === 'domain_owner_chain_scaleout')
        ?.observed_domains,
    ).map((entry) => [domainKey(stringValue(entry.domain_id)), entry]),
  );
  return recordList(domainOwnerChain.domains).map((domain) => {
    const observed = observedDomainById.get(domainKey(domain.domain_id));
    const sourceCommand = domainOwnerChainSourceCommand(domain);
    const nextVerificationRefs = stringListValue(domain.next_verification_refs);
    return {
      domain_id: stringValue(domain.domain_id),
      requested_agent_id: stringValue(domain.requested_agent_id),
      repo_dir: stringValue(domain.repo_dir),
      owner_repo:
        stringValue(domain.owner_repo) ?? stringValue(domain.repo_dir),
      next_owner_repo:
        stringValue(domain.next_owner_repo)
        ?? stringValue(domain.owner_repo)
        ?? stringValue(domain.repo_dir),
      owner_route_status:
        stringValue(observed?.status)
        ?? 'owner_evidence_required',
      observed_receipt_refs:
        stringListValue(observed?.observed_receipt_refs),
      observed_ref_shapes:
        stringListValue(observed?.observed_ref_shapes),
      observed_ref_counts:
        record(observed?.observed_ref_counts),
      next_owner_action: 'domain_owner_record_live_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref',
      accepted_ref_shapes: stringListValue(domain.accepted_refs_only_result_shapes),
      closing_ref_source:
        stringValue(domain.closing_ref_source)
        ?? 'contracts/live_stage_run_progress_evidence.json#domain_owner_receipt_refs|typed_blocker_refs|human_gate_refs|quality_or_export_receipt_refs|no_regression_refs|long_soak_refs',
      typed_blocker_source:
        stringValue(domain.typed_blocker_source)
        ?? 'contracts/live_stage_run_progress_evidence.json#typed_blocker_refs',
      verification_commands: unique([
        ...stringListValue(domain.verification_commands),
        ...nextVerificationRefs,
        sourceCommand,
      ]),
      next_verification_refs: nextVerificationRefs,
      source_command: sourceCommand,
      forbidden_opl_claims:
        stringListValue(domain.forbidden_opl_claims).length > 0
          ? stringListValue(domain.forbidden_opl_claims)
          : DOMAIN_OWNER_CHAIN_FORBIDDEN_OPL_CLAIMS,
      non_closing_inputs:
        stringListValue(domain.non_closing_inputs).length > 0
          ? stringListValue(domain.non_closing_inputs)
          : DOMAIN_OWNER_CHAIN_NON_CLOSING_INPUTS,
      stop_loss:
        stringListValue(domain.stop_loss).length > 0
          ? stringListValue(domain.stop_loss)
          : DOMAIN_OWNER_CHAIN_STOP_LOSS,
      ready_claim_authorized: false,
      conformance_can_close_production: false,
      authority_boundary: {
        route_is_refs_only: true,
        route_can_claim_domain_ready: false,
        route_can_claim_production_ready: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
      },
    };
  });
}

function oneShotPlanLandingReadout(contracts: FrameworkContracts) {
  const model = contracts.targetOperatingArchitecture.one_shot_plan_landing_model;
  return {
    surface_kind: 'opl_one_shot_plan_landing_readout',
    source_contract_ref:
      'contracts/opl-framework/target-operating-architecture-contract.json#one_shot_plan_landing_model',
    model_id: model.model_id,
    status: model.summary.external_owner_evidence_still_required
      ? 'opl_surfaces_landed_external_owner_evidence_required'
      : 'opl_surfaces_landed_no_external_owner_gate_observed',
    summary: model.summary,
    implementation_slices: model.implementation_slices,
    owner_gated_plan_ids: model.implementation_slices
      .filter((slice) => slice.status !== 'opl_landed')
      .map((slice) => slice.plan_id),
    remaining_owner_gates: model.implementation_slices
      .filter((slice) => slice.remaining_owner_gate !== 'none')
      .map((slice) => ({
        plan_id: slice.plan_id,
        title: slice.title,
        status: slice.status,
        remaining_owner_gate: slice.remaining_owner_gate,
      })),
    non_closing_inputs: [
      'contract_validation',
      'docs_foldback',
      'generated_descriptor_ready',
      'provider_completion',
      'verified_refs_only_ledger',
      'zero_worklist_count',
    ],
    authority_boundary: model.authority_boundary,
  };
}

function ownerGateStopLoss() {
  return [
    'do not add more OPL projection evidence to claim ready',
    'request owner-native receipt, verdict, acceptance, or typed blocker from the listed owner',
    'keep ready_claim_authorized=false until the owner ref is observed and verified',
  ];
}

function unresolvedOwnerGates(input: {
  ownerDeltaBridge: Record<string, unknown>;
  productionEvidenceGate: Record<string, unknown>;
}) {
  const gates = [];
  const ownerAnswerClosureHandoff = record(
    input.ownerDeltaBridge.owner_answer_closure_handoff,
  );
  const ownerAnswerStillRequired =
    input.ownerDeltaBridge.owner_answer_still_required === true
    || input.ownerDeltaBridge.owner_answer_missing === true;
  if (ownerAnswerStillRequired) {
    const observedOwnerAnswerRefs =
      stringListValue(input.ownerDeltaBridge.observed_owner_answer_refs);
    const observedOwnerPayloadSummaryReceiptRefs =
      stringListValue(input.ownerDeltaBridge.observed_owner_payload_summary_receipt_refs);
    const verifiedOwnerPayloadSummaryReceiptRefs =
      stringListValue(input.ownerDeltaBridge.verified_owner_payload_summary_receipt_refs);
    gates.push({
      gate_id: 'owner-gate:current_owner_delta_owner_answer',
      lane: 'current_owner_delta_owner_answer',
      owner: stringValue(input.ownerDeltaBridge.current_owner),
      owner_repo: stringValue(input.ownerDeltaBridge.current_owner)
        ?? 'current_owner_domain_repository',
      status: 'owner_answer_or_typed_blocker_required',
      required_delta:
        stringValue(input.ownerDeltaBridge.desired_delta_description)
        ?? 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      accepted_ref_shapes:
        stringListValue(input.ownerDeltaBridge.required_owner_answer_shapes),
      observed_ref_shapes:
        stringListValue(input.ownerDeltaBridge.observed_owner_answer_ref_shapes),
      observed_owner_answer_refs: observedOwnerAnswerRefs,
      observed_owner_payload_summary_receipt_refs: observedOwnerPayloadSummaryReceiptRefs,
      verified_owner_payload_summary_receipt_refs: verifiedOwnerPayloadSummaryReceiptRefs,
      owner_payload_summary_closure_state:
        stringValue(input.ownerDeltaBridge.owner_payload_summary_closure_state),
      current_pointer_update_still_required:
        ownerAnswerClosureHandoff.current_pointer_update_still_required === true,
      observed_refs_are_current_pointer_closeout: false,
      missing_input_refs:
        stringListValue(input.ownerDeltaBridge.missing_input_refs),
      closing_ref_source: 'current_owner_domain_owned_answer_ref_bound_to_current_owner_delta',
      typed_blocker_source: 'current_owner_domain_owned_typed_blocker_ref_bound_to_current_owner_delta',
      source_command: 'opl framework readiness --family-defaults --json',
      record_command: stringValue(ownerAnswerClosureHandoff.record_command),
      verify_command: stringValue(ownerAnswerClosureHandoff.verify_command),
      stop_loss: ownerGateStopLoss(),
      ready_claim_authorized: false,
      can_be_completed_by_opl: false,
    });
  }

  for (const workOrder of recordList(input.productionEvidenceGate.owner_route_work_orders)) {
    const lane = stringValue(workOrder.lane) ?? 'unknown_owner_gate';
    gates.push({
      gate_id: `owner-gate:${lane}`,
      lane,
      owner: stringValue(workOrder.owner),
      owner_repo: stringValue(workOrder.owner_repo),
      status: stringValue(workOrder.owner_evidence_closure_state)
        ?? 'owner_gate_required',
      required_delta: stringValue(workOrder.next_owner_action),
      accepted_ref_shapes: stringListValue(workOrder.accepted_ref_shapes),
      observed_ref_shapes: stringListValue(workOrder.observed_ref_shapes),
      observed_receipt_refs: stringListValue(workOrder.observed_receipt_refs),
      observed_ref_counts: record(workOrder.observed_ref_counts),
      open_count: numberValue(workOrder.open_count),
      open_count_semantics: stringValue(workOrder.open_count_semantics),
      closing_ref_source: stringValue(workOrder.closing_ref_source),
      typed_blocker_source: stringValue(workOrder.typed_blocker_source),
      forbidden_opl_claims: stringListValue(workOrder.forbidden_opl_claims),
      source_command: stringValue(workOrder.source_command),
      verification_command: stringValue(workOrder.verification_command),
      stop_loss: ownerGateStopLoss(),
      ready_claim_authorized: false,
      can_be_completed_by_opl: false,
    });
  }

  return {
    surface_kind: 'opl_unresolved_owner_gate_inventory',
    status: gates.length > 0
      ? 'owner_gates_required'
      : 'no_unresolved_owner_gate_observed',
    gate_count: gates.length,
    gates,
    gate_ids: gates.map((gate) => gate.gate_id),
    owner_repos: unique(gates.map((gate) => gate.owner_repo ?? '')),
    ready_claim_authorized: false,
    completion_policy: {
      owner_native_refs_required: true,
      open_count_zero_closes_ready: false,
      refs_only_projection_closes_ready: false,
      opl_can_close_owner_gate: false,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_l5: false,
      can_claim_production_ready: false,
      can_authorize_physical_delete: false,
    },
  };
}

export async function buildFrameworkOperatingMaturityReadout(
  contracts: FrameworkContracts,
  args: OperatingMaturityArgs,
  options: OperatingMaturityOptions = {},
) {
  if (!args.familyDefaults) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'framework operating-maturity requires --family-defaults.',
      {
        required: ['--family-defaults'],
      },
    );
  }

  const conformance = record(
    buildStandardDomainAgentConformanceReport(['--family-defaults'], contracts)
      .standard_domain_agent_conformance,
  );
  const domainOwnerChain = record(
    record(conformance.stage_run_domain_adoption_read_model)
      .live_stage_run_progress_evidence_worklist,
  );
  const brandModuleL5 = record(
    buildBrandModuleL5Status(contracts).brand_module_l5_status,
  );
  const defaultCallers = buildAgentDefaultCallerReadinessReport(['--family-defaults']);
  const runtimeSnapshotProvider = requireRuntimeTraySnapshotProvider(
    options.runtimeSnapshotProvider,
    'framework operating-maturity',
  );
  const runtimeSnapshot = await runtimeSnapshotProvider(contracts, {
    appOperatorDrilldownDetailLevel: 'summary',
    providerKind: 'temporal',
  });
  const appOperatorDrilldown = record(
    record(runtimeSnapshot.runtime_tray_snapshot).app_operator_drilldown,
  );
  const ownerDeltaBridge = currentOwnerDeltaBridge(appOperatorDrilldown);
  const appEvidenceAfterContract = record(
    record(appOperatorDrilldown.attention_first_payload).evidence_after_contract,
  );
  const appReleaseUserPath = appReleaseUserPathMaturity(
    record(appEvidenceAfterContract.app_release_user_path_evidence),
  );
  const ownerEvidenceIntake = buildFoundryAgentOsOwnerEvidenceIntake({
    contracts,
    appReleaseEvidence: appReleaseUserPath.evidence,
    domainOwnerChain,
    physicalDeleteAuthority: record(defaultCallers.physical_delete_authority_read_model),
    lifecycleEvidence: record(appEvidenceAfterContract.memory_artifact_lifecycle_evidence),
  });
  const drilldownMaturity = appOperatorDrilldownMaturity(appOperatorDrilldown);
  const physicalDeleteAuthority = record(defaultCallers.physical_delete_authority_read_model);
  const providerOpenCount = drilldownMaturity.provider.openEvidenceCount;
  const lifecycleOpenCount = drilldownMaturity.lifecycle.openEvidenceCount;
  const appReleaseRunbook = appReleaseUserPathExecutionRunbook();
  const providerLongSoakRunbook = providerLongSoakExecutionRunbook();
  const cleanupEvidenceWorklistCount = numberValue(defaultCallers.deletion_evidence_worklist_count);
  const cleanupOpenDecisionCount = numberValue(
    physicalDeleteAuthority.structural_prerequisites_observed_but_domain_owner_decision_missing_count,
  );
  const l5RequiredModuleCount = numberValue(brandModuleL5.evidence_required_module_count);
  const domainOpenCount = numberValue(domainOwnerChain.open_domain_count);
  const appReleaseOpenCount = appReleaseUserPath.openEvidenceCount;
  const openCounts = [
    domainOpenCount,
    l5RequiredModuleCount,
    appReleaseOpenCount,
    providerOpenCount,
    cleanupOpenDecisionCount,
    lifecycleOpenCount,
  ];
  const productionEvidenceGate = foundryAgentOsProductionEvidenceGate({
    domainOpenCount,
    l5RequiredModuleCount,
    brandModuleL5,
    appReleaseOpenCount,
    providerOpenCount,
    providerLongSoakOwnerActionChecklist:
      drilldownMaturity.provider.capabilityChecklist,
    providerLongSoakMissingOwnerActionIds:
      drilldownMaturity.provider.ownerEvidenceMissingActionIds,
    providerLongSoakNextEvidenceAction:
      drilldownMaturity.provider.ownerEvidenceNextAction,
    cleanupOpenDecisionCount,
    lifecycleOpenCount,
    lifecycleOwnerActionChecklist:
      drilldownMaturity.lifecycle.ownerActionChecklist,
    lifecycleMissingOwnerActionIds:
      drilldownMaturity.lifecycle.missingOwnerActionIds,
    lifecycleNextEvidenceAction:
      drilldownMaturity.lifecycle.nextEvidenceAction,
    ownerEvidenceIntake,
  });
  const oneShotPlanLanding = oneShotPlanLandingReadout(contracts);
  const ownerGateInventory = unresolvedOwnerGates({
    ownerDeltaBridge,
    productionEvidenceGate,
  });

  return {
    version: 'g2',
    framework_operating_maturity: {
      surface_kind: 'opl_family_operating_maturity_readout',
      owner: 'one-person-lab',
      status: evidenceRequiredStatus(openCounts),
      baseline_level: 'L4_executable_baseline',
      target_level: 'L5_production_operating_maturity',
      source_commands: {
        framework_readiness: 'opl framework readiness --family-defaults --json',
        agents_conformance: 'opl agents conformance --family-defaults --json',
        brand_module_l5_status: 'opl brand-modules l5-status --json',
        agents_default_callers: 'opl agents default-callers --family-defaults --json',
        app_operator_drilldown: SOURCE_COMMANDS.app_operator_drilldown,
      },
      summary: {
        current_owner: ownerDeltaBridge.current_owner,
        current_owner_stage_id: ownerDeltaBridge.stage_id,
        current_owner_delta_owner_answer_missing:
          ownerDeltaBridge.owner_answer_missing,
        current_owner_delta_owner_answer_still_required:
          ownerDeltaBridge.owner_answer_still_required,
        domain_owner_chain_open_domain_count: domainOpenCount,
        brand_module_l5_evidence_required_module_count: l5RequiredModuleCount,
        brand_module_l5_verified_receipt_count:
          numberValue(record(brandModuleL5[OBSERVABILITY_EVIDENCE_LEDGER_FIELD]).verified_receipt_count),
        app_release_user_path_open_count: appReleaseOpenCount,
        provider_long_soak_open_count: providerOpenCount,
        cleanup_retirement_open_decision_count: cleanupOpenDecisionCount,
        memory_artifact_lifecycle_open_count: lifecycleOpenCount,
        ready_claim_authorized: false,
      },
      current_owner_delta_bridge: ownerDeltaBridge,
      one_shot_plan_landing: oneShotPlanLanding,
      unresolved_owner_gates: ownerGateInventory,
      owner_evidence_intake: ownerEvidenceIntake,
      foundry_agent_os_production_evidence_gate: productionEvidenceGate,
      domain_owner_chain_scaleout: {
        source_command: 'opl agents conformance --family-defaults --json',
        status: stringValue(domainOwnerChain.status) ?? 'required_from_domain_owner',
        open_domain_count: domainOpenCount,
        required_from: stringValue(domainOwnerChain.required_from) ?? 'domain_owner',
        accepted_refs_only_result_shapes:
          stringListValue(domainOwnerChain.accepted_refs_only_result_shapes),
        domains: recordList(domainOwnerChain.domains),
        domain_owner_evidence_routes:
          domainOwnerEvidenceRoutes(domainOwnerChain, ownerEvidenceIntake),
        authority_boundary: record(domainOwnerChain.authority_boundary),
      },
      brand_module_l5: {
        source_command: 'opl brand-modules l5-status --json',
        status: stringValue(brandModuleL5.status) ?? 'evidence_required',
        baseline_level: brandModuleL5.baseline_level,
        target_level: brandModuleL5.target_level,
        evidence_required_module_count: l5RequiredModuleCount,
        evidence_required_module_ids: stringListValue(brandModuleL5.evidence_required_module_ids),
        l5_complete_module_count: numberValue(brandModuleL5.l5_complete_module_count),
        l5_complete_module_ids: stringListValue(brandModuleL5.l5_complete_module_ids),
        [OBSERVABILITY_EVIDENCE_LEDGER_FIELD]: record(brandModuleL5[OBSERVABILITY_EVIDENCE_LEDGER_FIELD]),
        l5_claim_policy: record(brandModuleL5.l5_claim_policy),
        owner_route_work_order_policy: record(brandModuleL5.owner_route_work_order_policy),
        authority_boundary: record(brandModuleL5.authority_boundary),
      },
      app_release_user_path: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: appReleaseOpenCount > 0
          ? 'evidence_required'
          : appReleaseUserPath.releaseOwnerVerdictClosureObserved
            ? appReleaseUserPath.releaseOwnerVerdictStatus
            : 'evidence_recorded_not_release_ready_claim',
        latest_release_tag: null,
        next_required_delta: appReleaseOpenCount > 0
          ? 'same_cohort_app_release_user_path_evidence_or_release_owner_typed_blocker'
          : appReleaseUserPath.ownerAcceptanceEvidenceRecorded
            ? 'release_owner_acceptance_recorded_no_release_ready_claim'
          : appReleaseUserPath.releaseOwnerVerdictClosureObserved
            ? 'release_owner_verdict_recorded_no_release_ready_claim'
            : 'release_owner_verdict_still_not_claimed_by_opl',
        production_user_path_ready: appReleaseUserPath.productionUserPathReady,
        evidence_ledger_status: stringValue(appReleaseUserPath.evidence.evidence_ledger_status),
        open_gate_count: numberValue(appReleaseUserPath.evidence.open_gate_count),
        pending_verify_receipt_ref_count:
          numberValue(appReleaseUserPath.evidence.pending_verify_receipt_ref_count),
        typed_blocker_ref_count: numberValue(appReleaseUserPath.evidence.typed_blocker_ref_count),
        verified_ledger_receipt_ref_count:
          numberValue(appReleaseUserPath.evidence.verified_ledger_receipt_ref_count),
        owner_acceptance_evidence_recorded:
          appReleaseUserPath.ownerAcceptanceEvidenceRecorded,
        owner_acceptance_ref_count:
          appReleaseUserPath.ownerAcceptanceRefCount,
        owner_acceptance_refs:
          appReleaseUserPath.ownerAcceptanceRefs,
        release_owner_verdict_handoff:
          appReleaseUserPath.releaseOwnerVerdictHandoff,
        selected_cohort_id:
          stringValue(record(appReleaseUserPath.evidence.cohort_guard).selected_cohort_id),
        accepted_refs_only_result_shapes: [
          'release_evidence_ref',
          'install_evidence_ref',
          'operator_evidence_ref',
          'release_owner_receipt_ref',
          'typed_blocker_ref',
          'owner_acceptance_ref',
        ],
        execution_runbook: appReleaseRunbook,
        owner: appReleaseRunbook.owner,
        record_command: appReleaseRunbook.record_command,
        verify_command: appReleaseRunbook.verify_command,
        readback_commands: appReleaseRunbook.readback_commands,
        stop_loss: appReleaseRunbook.stop_loss,
        details_stay_out_of_ordinary_cockpit: true,
        release_ready_authorized: false,
      },
      provider_long_soak: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: drilldownMaturity.provider.status,
        open_evidence_count: providerOpenCount,
        cadence_window_status: drilldownMaturity.provider.cadenceWindowStatus,
        long_evidence_ready: drilldownMaturity.provider.longEvidenceReady,
        expected_receipt_count: drilldownMaturity.provider.expectedReceiptCount,
        observed_receipt_count: drilldownMaturity.provider.observedReceiptCount,
        missing_receipt_count: drilldownMaturity.provider.missingReceiptCount,
        blocked_repair_receipt_count:
          drilldownMaturity.provider.blockedRepairReceiptCount,
        capability_status: drilldownMaturity.provider.capabilityStatus,
        capability_checklist: drilldownMaturity.provider.capabilityChecklist,
        capability_missing_requirement_ids:
          drilldownMaturity.provider.capabilityMissingRequirementIds,
        capability_evidence_observed_requirement_ids:
          drilldownMaturity.provider.capabilityEvidenceObservedRequirementIds,
        capability_open_requirement_count:
          drilldownMaturity.provider.capabilityOpenRequirementCount,
        capability_next_evidence_action:
          drilldownMaturity.provider.capabilityNextEvidenceAction,
        owner_acceptance_evidence_recorded:
          drilldownMaturity.provider.ownerAcceptanceEvidenceRecorded,
        owner_acceptance_ref_count:
          drilldownMaturity.provider.ownerAcceptanceRefCount,
        owner_acceptance_refs:
          drilldownMaturity.provider.ownerAcceptanceRefs,
        owner_evidence_missing_action_ids:
          drilldownMaturity.provider.ownerEvidenceMissingActionIds,
        owner_evidence_next_action:
          drilldownMaturity.provider.ownerEvidenceNextAction,
        evidence_ledger_status:
          stringValue(drilldownMaturity.provider.evidence.evidence_ledger_status),
        observed_receipt_ref_count:
          drilldownMaturity.provider.observedReceiptRefs.length,
        observed_receipt_refs: drilldownMaturity.provider.observedReceiptRefs,
        verified_receipt_ref_count:
          drilldownMaturity.provider.verifiedReceiptRefs.length,
        verified_receipt_refs: drilldownMaturity.provider.verifiedReceiptRefs,
        pending_verify_receipt_ref_count:
          drilldownMaturity.provider.pendingVerifyReceiptRefs.length,
        pending_verify_receipt_refs:
          drilldownMaturity.provider.pendingVerifyReceiptRefs,
        observed_ref_shapes: drilldownMaturity.provider.observedRefShapes,
        observed_ref_counts: drilldownMaturity.provider.observedRefCounts,
        accepted_refs_only_result_shapes: [
          'long_soak_ref',
          'recovery_ref',
          'dead_letter_ref',
          'provider_blocker_ref',
          'typed_blocker_ref',
          'owner_acceptance_ref',
        ],
        execution_runbook: providerLongSoakRunbook,
        owner: providerLongSoakRunbook.owner,
        record_command: providerLongSoakRunbook.record_command,
        verify_command: providerLongSoakRunbook.verify_command,
        readback_commands: providerLongSoakRunbook.readback_commands,
        stop_loss: providerLongSoakRunbook.stop_loss,
        ready_claim_authorized: false,
        production_ready_claim_status:
          stringValue(
            drilldownMaturity.provider.evidence.production_ready_claim_status,
          ) ?? 'provider_long_soak_evidence_observed_not_production_ready_claim',
        provider_completion_counts_as_production_ready: false,
        verified_refs_only_ledger_counts_as_production_ready: false,
        long_evidence_ready_counts_as_production_ready: false,
        capability_slo_satisfied_counts_as_production_ready: false,
        authority_boundary: drilldownMaturity.provider.authorityBoundary,
      },
      cleanup_retirement: {
        source_command: 'opl agents default-callers --family-defaults --json',
        status: booleanValue(physicalDeleteAuthority.no_further_opl_default_caller_delete_work)
          ? 'owner_decision_observed_no_further_opl_delete_work'
          : (stringValue(physicalDeleteAuthority.owner_decision_status)
            ?? (cleanupOpenDecisionCount > 0
            ? 'owner_decision_required'
            : 'owner_decision_observed_refs_only_not_delete_authorized')),
        deletion_evidence_worklist_count: cleanupEvidenceWorklistCount,
        owner_decision_missing_count: cleanupOpenDecisionCount,
        structural_prerequisites_observed:
          physicalDeleteAuthority.all_repos_delete_or_keep_prerequisites_observed === true,
        all_deletion_evidence_requirements_observed:
          physicalDeleteAuthority.all_repos_all_deletion_evidence_requirements_observed === true,
        owner_decision_status: stringValue(physicalDeleteAuthority.owner_decision_status),
        owner_decision_closeout_status:
          stringValue(physicalDeleteAuthority.owner_decision_closeout_status),
        no_further_opl_default_caller_delete_work:
          booleanValue(physicalDeleteAuthority.no_further_opl_default_caller_delete_work),
        next_opl_default_caller_delete_action:
          stringValue(physicalDeleteAuthority.next_opl_default_caller_delete_action),
        default_caller_delete_ready: booleanValue(defaultCallers.default_caller_delete_ready),
        physical_delete_authorized: booleanValue(defaultCallers.physical_delete_authorized),
        physical_delete_authorization_status:
          stringValue(defaultCallers.physical_delete_authorization_status),
        next_required_owner_action:
          booleanValue(physicalDeleteAuthority.no_further_opl_default_caller_delete_work)
            ? 'no_further_opl_default_caller_delete_work'
            : 'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
        accepted_refs_only_result_shapes: [
          'physical_delete_authorization_ref',
          'keep_as_authority_adapter_ref',
          'typed_blocker_ref',
        ],
      },
      memory_artifact_lifecycle: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: drilldownMaturity.lifecycle.status,
        open_evidence_count: lifecycleOpenCount,
        lifecycle_evidence_status:
          stringValue(drilldownMaturity.lifecycle.evidence.status),
        observed_ref_count: drilldownMaturity.lifecycle.observedRefCount,
        reconcile_issue_count: drilldownMaturity.lifecycle.reconcileIssueCount,
        lifecycle_reconcile_missing_ref_count:
          numberValue(drilldownMaturity.lifecycle.evidence.lifecycle_reconcile_missing_ref_count),
        lifecycle_reconcile_extra_ref_count:
          numberValue(drilldownMaturity.lifecycle.evidence.lifecycle_reconcile_extra_ref_count),
        lifecycle_reconcile_stale_ref_count:
          numberValue(drilldownMaturity.lifecycle.evidence.lifecycle_reconcile_stale_ref_count),
        lifecycle_apply_handoff_attempt_count:
          numberValue(drilldownMaturity.lifecycle.evidence.lifecycle_apply_handoff_attempt_count),
        lifecycle_apply_handoff_blocked_decision_count:
          numberValue(drilldownMaturity.lifecycle.evidence.lifecycle_apply_handoff_blocked_decision_count),
        lifecycle_apply_handoff_safe_decision_count:
          numberValue(drilldownMaturity.lifecycle.evidence.lifecycle_apply_handoff_safe_decision_count),
        lifecycle_owner_work_order_status:
          stringValue(drilldownMaturity.lifecycle.ownerWorkOrder.status),
        lifecycle_owner_work_order_open_count:
          numberValue(drilldownMaturity.lifecycle.ownerWorkOrder.open_count),
        lifecycle_owner_work_order_next_required_owner_action:
          stringValue(drilldownMaturity.lifecycle.ownerWorkOrder.next_required_owner_action),
        lifecycle_typed_blocker_work_order_status:
          stringValue(drilldownMaturity.lifecycle.typedBlockerWorkOrder.status),
        lifecycle_typed_blocker_selected_payload_path:
          stringValue(drilldownMaturity.lifecycle.typedBlockerWorkOrder.selected_payload_path),
        lifecycle_typed_blocker_ref_count:
          drilldownMaturity.lifecycle.latestTypedBlockerRefs.length
          + drilldownMaturity.lifecycle.ledgerTypedBlockerRefs.length,
        lifecycle_latest_typed_blocker_refs:
          unique([
            ...drilldownMaturity.lifecycle.latestTypedBlockerRefs,
            ...drilldownMaturity.lifecycle.ledgerTypedBlockerRefs,
          ]),
        ledger_evidence_status:
          stringValue(drilldownMaturity.lifecycle.evidence.evidence_ledger_status),
        ledger_receipt_ref_count:
          numberValue(drilldownMaturity.lifecycle.evidence.ledger_receipt_ref_count),
        ledger_recorded_receipt_ref_count:
          numberValue(drilldownMaturity.lifecycle.evidence.ledger_recorded_receipt_ref_count),
        ledger_verified_receipt_ref_count:
          drilldownMaturity.lifecycle.ledgerVerifiedReceiptRefs.length,
        ledger_verified_receipt_refs:
          drilldownMaturity.lifecycle.ledgerVerifiedReceiptRefs,
        ledger_pending_verify_receipt_ref_count:
          drilldownMaturity.lifecycle.ledgerPendingVerifyReceiptRefs.length,
        ledger_pending_verify_receipt_refs:
          drilldownMaturity.lifecycle.ledgerPendingVerifyReceiptRefs,
        ledger_memory_receipt_ref_count:
          numberValue(drilldownMaturity.lifecycle.evidence.ledger_memory_receipt_ref_count),
        ledger_memory_writeback_receipt_ref_count:
          numberValue(
            drilldownMaturity.lifecycle.evidence.ledger_memory_writeback_receipt_ref_count,
          ),
        ledger_artifact_mutation_receipt_ref_count:
          numberValue(
            drilldownMaturity.lifecycle.evidence.ledger_artifact_mutation_receipt_ref_count,
          ),
        ledger_package_lifecycle_receipt_ref_count:
          numberValue(
            drilldownMaturity.lifecycle.evidence.ledger_package_lifecycle_receipt_ref_count,
          ),
        ledger_export_lifecycle_receipt_ref_count:
          numberValue(
            drilldownMaturity.lifecycle.evidence.ledger_export_lifecycle_receipt_ref_count,
          ),
        ledger_cleanup_restore_retention_receipt_ref_count:
          numberValue(
            drilldownMaturity.lifecycle.evidence
              .ledger_cleanup_restore_retention_receipt_ref_count,
          ),
        ledger_typed_blocker_ref_count:
          drilldownMaturity.lifecycle.ledgerTypedBlockerRefs.length,
        ledger_typed_blocker_refs:
          drilldownMaturity.lifecycle.ledgerTypedBlockerRefs,
        ledger_owner_acceptance_ref_count:
          drilldownMaturity.lifecycle.ledgerOwnerAcceptanceRefs.length,
        ledger_owner_acceptance_refs:
          drilldownMaturity.lifecycle.ledgerOwnerAcceptanceRefs,
        verified_owner_evidence_recorded:
          drilldownMaturity.lifecycle.verifiedOwnerEvidenceRecorded,
        owner_action_checklist:
          drilldownMaturity.lifecycle.ownerActionChecklist,
        missing_owner_action_ids:
          drilldownMaturity.lifecycle.missingOwnerActionIds,
        next_evidence_action:
          drilldownMaturity.lifecycle.nextEvidenceAction,
        lifecycle_blockers_count_as_missing_evidence: false,
        accepted_refs_only_result_shapes: [
          'memory_receipt_ref',
          'artifact_mutation_receipt_ref',
          'package_export_lifecycle_receipt_ref',
          'cleanup_restore_retention_receipt_ref',
          'typed_blocker_ref',
          'owner_acceptance_ref',
        ],
        opl_stores_body_or_verdict: false,
        ready_claim_authorized: false,
        verified_refs_only_ledger_counts_as_memory_ready: false,
        verified_refs_only_ledger_counts_as_artifact_ready: false,
        verified_refs_only_ledger_counts_as_package_ready: false,
        verified_refs_only_ledger_counts_as_export_ready: false,
      },
      next_owner_actions: nextOwnerActions(),
      not_claims: [
        'domain_ready',
        'app_release_ready',
        'brand_module_l5_complete',
        'production_ready',
        'physical_delete_authorized',
      ],
      authority_boundary: AUTHORITY_BOUNDARY,
      machine_boundary:
        'Read-only operating maturity aggregation; it consumes existing read models and refs-only ledgers, but does not write domain truth, App release truth, owner receipts, typed blockers, artifact bodies, memory bodies, physical delete authorization, L5 completion, or production readiness.',
    },
  };
}

export function buildFrameworkOperatingMaturityCompactReadback(
  fullMaturityPayload: unknown,
) {
  const maturity = record(fullMaturityPayload);
  const summary = record(maturity.summary);
  const ownerDeltaBridge = record(maturity.current_owner_delta_bridge);
  const unresolvedOwnerGates = record(maturity.unresolved_owner_gates);
  const productionEvidenceGate = record(maturity.foundry_agent_os_production_evidence_gate);
  const domainOwnerChain = record(maturity.domain_owner_chain_scaleout);
  const brandModuleL5 = record(maturity.brand_module_l5);
  const appReleaseUserPath = record(maturity.app_release_user_path);
  const providerLongSoak = record(maturity.provider_long_soak);
  const cleanupRetirement = record(maturity.cleanup_retirement);
  const memoryArtifactLifecycle = record(maturity.memory_artifact_lifecycle);
  return {
    version: 'g2',
    framework_operating_maturity_compact: {
      surface_kind: 'opl_family_operating_maturity_compact_readback',
      owner: 'one-person-lab',
      source_command: 'opl framework operating-maturity --family-defaults --json',
      full_detail_command: 'opl framework operating-maturity --family-defaults --json',
      source_surface_ref: '/framework_operating_maturity',
      compact_readback_role:
        'operator_owner_gate_summary_projection_from_full_operating_maturity_not_second_truth',
      status: stringValue(maturity.status),
      baseline_level: stringValue(maturity.baseline_level),
      target_level: stringValue(maturity.target_level),
      detail_level: 'compact',
      summary: {
        current_owner: stringValue(summary.current_owner),
        current_owner_stage_id: stringValue(summary.current_owner_stage_id),
        current_owner_delta_owner_answer_missing:
          summary.current_owner_delta_owner_answer_missing === true,
        current_owner_delta_owner_answer_still_required:
          summary.current_owner_delta_owner_answer_still_required === true,
        domain_owner_chain_open_domain_count:
          numberValue(summary.domain_owner_chain_open_domain_count),
        brand_module_l5_evidence_required_module_count:
          numberValue(summary.brand_module_l5_evidence_required_module_count),
        brand_module_l5_verified_receipt_count:
          numberValue(summary.brand_module_l5_verified_receipt_count),
        app_release_user_path_open_count:
          numberValue(summary.app_release_user_path_open_count),
        provider_long_soak_open_count:
          numberValue(summary.provider_long_soak_open_count),
        cleanup_retirement_open_decision_count:
          numberValue(summary.cleanup_retirement_open_decision_count),
        memory_artifact_lifecycle_open_count:
          numberValue(summary.memory_artifact_lifecycle_open_count),
        ready_claim_authorized: false,
      },
      current_owner_delta_bridge: {
        delta_id: stringValue(ownerDeltaBridge.delta_id),
        default_planning_root:
          stringValue(ownerDeltaBridge.default_planning_root),
        current_owner: stringValue(ownerDeltaBridge.current_owner),
        domain_id: stringValue(ownerDeltaBridge.domain_id),
        stage_id: stringValue(ownerDeltaBridge.stage_id),
        desired_delta_kind: stringValue(ownerDeltaBridge.desired_delta_kind),
        desired_delta_description:
          stringValue(ownerDeltaBridge.desired_delta_description),
        latest_owner_answer_ref:
          stringValue(ownerDeltaBridge.latest_owner_answer_ref),
        latest_owner_answer_kind:
          stringValue(ownerDeltaBridge.latest_owner_answer_kind),
        owner_answer_missing: ownerDeltaBridge.owner_answer_missing === true,
        owner_answer_still_required:
          ownerDeltaBridge.owner_answer_still_required === true,
        domain_ready_authorized:
          record(ownerDeltaBridge.hard_gate).domain_ready_authorized === true,
      },
      unresolved_owner_gates: {
        status: stringValue(unresolvedOwnerGates.status),
        gate_count: numberValue(unresolvedOwnerGates.gate_count),
        gate_ids: stringListValue(unresolvedOwnerGates.gate_ids),
        ready_claim_authorized:
          unresolvedOwnerGates.ready_claim_authorized === true,
        completion_policy: record(unresolvedOwnerGates.completion_policy),
      },
      evidence_lane_summary: {
        domain_owner_chain_status: stringValue(domainOwnerChain.status),
        domain_owner_chain_open_domain_count:
          numberValue(domainOwnerChain.open_domain_count),
        brand_module_l5_status: stringValue(brandModuleL5.status),
        brand_module_l5_evidence_required_module_ids:
          stringListValue(brandModuleL5.evidence_required_module_ids),
        app_release_user_path_status: stringValue(appReleaseUserPath.status),
        provider_long_soak_status: stringValue(providerLongSoak.status),
        cleanup_retirement_status: stringValue(cleanupRetirement.status),
        cleanup_physical_delete_authorized:
          cleanupRetirement.physical_delete_authorized === true,
        memory_artifact_lifecycle_status:
          stringValue(memoryArtifactLifecycle.status),
        memory_artifact_lifecycle_open_evidence_count:
          numberValue(memoryArtifactLifecycle.open_evidence_count),
      },
      production_evidence_gate_summary: {
        status: stringValue(productionEvidenceGate.status),
        owner_evidence_closure_state:
          stringValue(productionEvidenceGate.owner_evidence_closure_state),
        ready_claim_authorized:
          productionEvidenceGate.ready_claim_authorized === true,
      },
      next_owner_actions: recordList(maturity.next_owner_actions).map((action) => ({
        lane: stringValue(action.lane),
        owner: stringValue(action.owner),
        required_delta: stringValue(action.required_delta),
        source_command: stringValue(action.source_command),
      })),
      not_claims: stringListValue(maturity.not_claims),
      omitted_sections: [
        'owner_evidence_intake',
        'domain_owner_chain_scaleout.domains',
        'domain_owner_chain_scaleout.domain_owner_evidence_routes',
        ['brand_module_l5.', OBSERVABILITY_EVIDENCE_LEDGER_FIELD].join(''),
        'app_release_user_path.execution_runbook',
        'provider_long_soak.capability_checklist',
        'memory_artifact_lifecycle.owner_action_checklist',
      ],
      false_ready_guard: {
        compact_readback_can_claim_domain_ready: false,
        compact_readback_can_claim_app_release_ready: false,
        compact_readback_can_claim_l5: false,
        compact_readback_can_claim_production_ready: false,
        compact_readback_can_authorize_physical_delete: false,
        compact_readback_can_sign_owner_receipt: false,
        compact_readback_can_create_typed_blocker: false,
        default_full_readback_unchanged: true,
      },
      authority_boundary: {
        ...COMPACT_READBACK_AUTHORITY_BOUNDARY,
        source_authority_boundary: record(maturity.authority_boundary),
      },
    },
  };
}
