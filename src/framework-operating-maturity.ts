import { buildAgentDefaultCallerReadinessReport } from './agent-platform-surface-ownership.ts';
import { buildBrandModuleL5Status } from './brand-module-l5-evidence.ts';
import { FrameworkContractError } from './contracts.ts';
import { buildFoundryAgentOsOwnerEvidenceIntake } from './foundry-agent-os-owner-evidence-intake.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import {
  booleanValue,
  numberValue,
  record,
  recordList,
  stringValue,
} from './framework-readiness-values.ts';
import { buildAppReleaseUserPathEvidence } from './runtime-tray-app-operator-drilldown-parts/app-release-user-path.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import { buildStandardDomainAgentConformanceReport } from './standard-domain-agent-conformance.ts';
import type { FrameworkContracts } from './types.ts';

type OperatingMaturityArgs = {
  familyDefaults: boolean;
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

function evidenceRequiredStatus(openCounts: number[]) {
  return openCounts.some((count) => count > 0) ? 'evidence_required' : 'evidence_recorded_not_ready_claim';
}

function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function unique(items: string[]) {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

function appReleaseUserPathMaturity() {
  const evidence = record(buildAppReleaseUserPathEvidence({}));
  const productionUserPathReady = evidence.production_user_path_ready === true;
  const pendingVerifyCount = numberValue(evidence.pending_verify_receipt_ref_count);
  const typedBlockerCount = numberValue(evidence.typed_blocker_ref_count);
  const openGateCount = numberValue(evidence.open_gate_count);
  const openEvidenceCount =
    productionUserPathReady && pendingVerifyCount === 0 && typedBlockerCount === 0
      ? 0
      : 1;

  return {
    evidence,
    openEvidenceCount,
    productionUserPathReady,
  };
}

function appOperatorDrilldownMaturity(drilldown: Record<string, unknown>) {
  const summary = record(drilldown.summary);
  const evidenceAfterContract = record(
    record(drilldown.attention_first_payload).evidence_after_contract,
  );
  const lifecycleEvidence = record(evidenceAfterContract.memory_artifact_lifecycle_evidence);
  const providerLongEvidenceReady =
    booleanValue(summary.provider_slo_cadence_window_long_evidence_ready) === true;
  const providerObservedReceiptCount =
    numberValue(summary.provider_slo_cadence_window_observed_receipt_count);
  const providerMissingReceiptCount =
    numberValue(summary.provider_slo_cadence_window_missing_receipt_count);
  const providerBlockedRepairReceiptCount =
    numberValue(summary.provider_slo_cadence_window_blocked_repair_receipt_count);
  const providerOpenCount = providerLongEvidenceReady ? 0 : 1;
  const lifecycleObservedRefCount = numberValue(lifecycleEvidence.observed_ref_count);
  const lifecycleReconcileIssueCount =
    numberValue(lifecycleEvidence.lifecycle_reconcile_missing_ref_count)
    + numberValue(lifecycleEvidence.lifecycle_reconcile_extra_ref_count)
    + numberValue(lifecycleEvidence.lifecycle_reconcile_stale_ref_count);
  const lifecycleOpenCount = lifecycleReconcileIssueCount > 0
    ? lifecycleReconcileIssueCount
    : lifecycleObservedRefCount > 0
      ? 0
      : 1;

  return {
    provider: {
      openEvidenceCount: providerOpenCount,
      status: providerOpenCount > 0
        ? 'evidence_required'
        : 'evidence_recorded_not_production_ready_claim',
      longEvidenceReady: providerLongEvidenceReady,
      cadenceWindowStatus: stringValue(summary.provider_slo_cadence_window_status),
      observedReceiptCount: providerObservedReceiptCount,
      expectedReceiptCount:
        numberValue(summary.provider_slo_cadence_window_expected_receipt_count),
      missingReceiptCount: providerMissingReceiptCount,
      blockedRepairReceiptCount: providerBlockedRepairReceiptCount,
      capabilityStatus: stringValue(summary.provider_slo_capability_status),
    },
    lifecycle: {
      evidence: lifecycleEvidence,
      openEvidenceCount: lifecycleOpenCount,
      status: lifecycleOpenCount > 0
        ? 'evidence_required'
        : 'evidence_recorded_not_artifact_or_memory_ready_claim',
      observedRefCount: lifecycleObservedRefCount,
      reconcileIssueCount: lifecycleReconcileIssueCount,
    },
  };
}

function nextOwnerActions() {
  return [
    {
      lane: 'domain_owner_chain_scaleout',
      owner: 'MAS/MAG/RCA/OMA domain owners',
      required_delta: 'domain_owned_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref',
      source_command: 'opl agents conformance --family-defaults --json',
    },
    {
      lane: 'brand_module_l5_operating_maturity',
      owner: 'brand module owners',
      required_delta: 'live_user_path_cross_agent_scaleout_long_soak_release_install_operator_repair_owner_acceptance_no_second_truth_refs',
      source_command: 'opl brand-modules l5-status --json',
    },
    {
      lane: 'app_release_user_path',
      owner: 'one-person-lab-app release owner',
      required_delta: 'same_cohort_release_user_path_receipt_or_release_owner_typed_blocker',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    {
      lane: 'provider_long_soak',
      owner: 'one-person-lab runtime owner',
      required_delta: 'long_soak_recovery_dead_letter_or_provider_blocker_refs',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    {
      lane: 'private_platform_retirement',
      owner: 'domain owners',
      required_delta: 'physical_delete_authorization_keep_as_authority_adapter_or_typed_blocker_ref',
      source_command: 'opl agents default-callers --family-defaults --json',
    },
    {
      lane: 'memory_artifact_lifecycle_apply',
      owner: 'domain owners',
      required_delta: 'memory_artifact_lifecycle_receipt_or_typed_blocker_ref',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
  ];
}

function ownerRouteWorkOrderAuthorityBoundary() {
  return {
    work_order_is_refs_only: true,
    work_order_can_close_production: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    can_claim_l5: false,
    can_claim_production_ready: false,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_quality_or_export: false,
  };
}

function ownerRouteWorkOrders(
  laneStatuses: Array<{
    lane: string;
    open_count: number;
    accepted_closing_ref_shapes: string[];
  }>,
  ownerEvidenceIntake: Record<string, unknown>,
) {
  const laneStatusById = new Map(laneStatuses.map((lane) => [lane.lane, lane]));
  const laneEvidenceById = new Map(
    recordList(ownerEvidenceIntake.lane_evidence).map((entry) => [stringValue(entry.lane), entry]),
  );
  const workOrderIds: Record<string, string> = {
    domain_owner_chain_scaleout: 'w7-domain-owner-chain-scaleout',
    brand_module_l5_operating_maturity: 'w7-brand-module-l5-operating-maturity',
    app_release_user_path: 'w7-app-release-user-path',
    provider_long_soak: 'w7-provider-long-soak',
    private_platform_retirement: 'w7-private-platform-retirement',
    memory_artifact_lifecycle_apply: 'w7-memory-artifact-lifecycle-apply',
  };

  return nextOwnerActions().map((action) => {
    const lane = laneStatusById.get(action.lane);
    const observed = laneEvidenceById.get(action.lane);
    const observedReceiptRefs = stringListValue(observed?.observed_receipt_refs);
    const observedRefShapes = stringListValue(observed?.observed_ref_shapes);
    const ownerEvidenceObserved =
      stringValue(observed?.status) === 'owner_evidence_observed_not_ready_claim'
      || observedReceiptRefs.length > 0
      || observedRefShapes.length > 0;
    return {
      work_order_id: workOrderIds[action.lane] ?? `w7-${action.lane.replace(/_/g, '-')}`,
      lane: action.lane,
      owner: action.owner,
      status: 'open',
      blocker_state: ownerEvidenceObserved
        ? 'owner_route_refs_observed_not_production_claim'
        : 'owner_route_evidence_missing',
      open_count: lane?.open_count ?? 1,
      next_owner_action: action.required_delta,
      observed_owner_evidence_status:
        stringValue(observed?.status) ?? 'owner_evidence_required',
      observed_receipt_refs: observedReceiptRefs,
      observed_ref_shapes: observedRefShapes,
      observed_ref_counts: record(observed?.observed_ref_counts),
      owner_evidence_route:
        stringValue(observed?.evidence_route) ?? action.source_command,
      accepted_ref_shapes: unique([
        ...(lane?.accepted_closing_ref_shapes ?? []),
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ]),
      source_command: action.source_command,
      non_closing_inputs: [
        'conformance_pass',
        'docs_foldback',
        'contract_validation',
        'generated_descriptor_ready',
        'provider_completion',
        'app_projection',
        'verified_refs_only_ledger',
        'zero_worklist_count',
      ],
      authority_boundary: ownerRouteWorkOrderAuthorityBoundary(),
    };
  });
}

function foundryAgentOsProductionEvidenceGate(input: {
  domainOpenCount: number;
  l5RequiredModuleCount: number;
  appReleaseOpenCount: number;
  providerOpenCount: number;
  cleanupOpenDecisionCount: number;
  lifecycleOpenCount: number;
  ownerEvidenceIntake: Record<string, unknown>;
}) {
  const laneStatuses = [
    {
      lane: 'domain_owner_chain_scaleout',
      open_count: input.domainOpenCount,
      accepted_closing_ref_shapes: [
        'domain_owner_receipt_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'quality_or_export_receipt_ref',
        'reviewer_receipt_ref',
        'no_regression_ref',
      ],
    },
    {
      lane: 'brand_module_l5_operating_maturity',
      open_count: input.l5RequiredModuleCount,
      accepted_closing_ref_shapes: [
        'live_user_path_ref',
        'cross_agent_scaleout_ref',
        'owner_acceptance_ref',
        'typed_blocker_ref',
      ],
    },
    {
      lane: 'app_release_user_path',
      open_count: input.appReleaseOpenCount,
      accepted_closing_ref_shapes: [
        'release_evidence_ref',
        'install_evidence_ref',
        'release_owner_receipt_ref',
        'release_owner_typed_blocker_ref',
        'typed_blocker_ref',
      ],
    },
    {
      lane: 'provider_long_soak',
      open_count: input.providerOpenCount,
      accepted_closing_ref_shapes: [
        'long_soak_ref',
        'recovery_ref',
        'dead_letter_ref',
        'provider_blocker_ref',
        'typed_blocker_ref',
      ],
    },
    {
      lane: 'private_platform_retirement',
      open_count: input.cleanupOpenDecisionCount,
      accepted_closing_ref_shapes: [
        'physical_delete_authorization_ref',
        'keep_as_authority_adapter_ref',
        'typed_blocker_ref',
      ],
    },
    {
      lane: 'memory_artifact_lifecycle_apply',
      open_count: input.lifecycleOpenCount,
      accepted_closing_ref_shapes: [
        'memory_receipt_ref',
        'artifact_mutation_receipt_ref',
        'package_export_lifecycle_receipt_ref',
        'typed_blocker_ref',
      ],
    },
  ];
  const workOrders = ownerRouteWorkOrders(laneStatuses, input.ownerEvidenceIntake);
  const openLaneCount = laneStatuses.filter((lane) => lane.open_count > 0).length;
  return {
    surface_kind: 'foundry_agent_os_production_evidence_gate',
    owner: 'one-person-lab',
    status: openLaneCount > 0
      ? 'evidence_required'
      : 'evidence_intake_ready_not_production_ready_claim',
    w7_status: 'production_evidence_not_closed_by_opl',
    source_commands: [
      'opl agents conformance --family-defaults --json',
      'opl brand-modules l5-status --json',
      SOURCE_COMMANDS.app_operator_drilldown,
    ],
    required_closing_ref_shapes: [
      'domain_owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'reviewer_receipt_ref',
      'long_soak_ref',
      'release_evidence_ref',
      'install_evidence_ref',
      'owner_acceptance_ref',
    ],
    non_closing_inputs: [
      'conformance_pass',
      'docs_foldback',
      'contract_validation',
      'generated_descriptor_ready',
      'provider_completion',
      'app_projection',
      'verified_refs_only_ledger',
      'zero_worklist_count',
    ],
    lane_statuses: laneStatuses.map((lane) => ({
      ...lane,
      observed_owner_evidence_status:
        stringValue(
          recordList(input.ownerEvidenceIntake.lane_evidence)
            .find((entry) => stringValue(entry.lane) === lane.lane)?.status,
        ) ?? 'owner_evidence_required',
      status: lane.open_count > 0
        ? 'evidence_required'
        : 'refs_observed_not_production_ready_claim',
    })),
    owner_route_work_orders: workOrders,
    summary: {
      open_lane_count: openLaneCount,
      owner_route_work_order_count: workOrders.length,
      open_owner_route_work_order_count: workOrders.filter((entry) => entry.status === 'open').length,
      observed_owner_evidence_lane_count: workOrders.filter((entry) =>
        entry.observed_owner_evidence_status === 'owner_evidence_observed_not_ready_claim'
      ).length,
      closed_by_opl: false,
      production_ready_claim_authorized: false,
      requires_owner_acceptance: true,
    },
    authority_boundary: {
      gate_is_intake_and_projection_only: true,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_l5: false,
      can_claim_production_ready: false,
    },
  };
}

function domainKey(value: unknown) {
  const raw = typeof value === 'string' ? value : '';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    redcubeai: 'redcube',
  };
  return aliases[compact] ?? compact;
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
  return recordList(domainOwnerChain.domains).map((domain) => ({
    domain_id: stringValue(domain.domain_id),
    requested_agent_id: stringValue(domain.requested_agent_id),
    repo_dir: stringValue(domain.repo_dir),
    owner_route_status:
      stringValue(observedDomainById.get(domainKey(domain.domain_id))?.status)
      ?? 'owner_evidence_required',
    observed_receipt_refs:
      stringListValue(observedDomainById.get(domainKey(domain.domain_id))?.observed_receipt_refs),
    observed_ref_shapes:
      stringListValue(observedDomainById.get(domainKey(domain.domain_id))?.observed_ref_shapes),
    observed_ref_counts:
      record(observedDomainById.get(domainKey(domain.domain_id))?.observed_ref_counts),
    next_owner_action: 'domain_owner_record_live_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref',
    accepted_ref_shapes: stringListValue(domain.accepted_refs_only_result_shapes),
    conformance_can_close_production: false,
    authority_boundary: {
      route_is_refs_only: true,
      route_can_claim_domain_ready: false,
      route_can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    },
  }));
}

function currentOwnerDeltaBridge(appOperatorDrilldown: Record<string, unknown>) {
  const attentionFirstPayload = record(appOperatorDrilldown.attention_first_payload);
  const currentOwnerDelta = record(attentionFirstPayload.current_owner_delta);
  const currentOwnerDeltaReadModel = record(attentionFirstPayload.current_owner_delta_read_model);
  const nextSafeAction = record(currentOwnerDeltaReadModel.next_safe_action_or_none);
  const hardGate = record(currentOwnerDelta.hard_gate);
  const ownerAnswerRef =
    stringValue(currentOwnerDelta.latest_owner_answer_ref)
    ?? stringValue(hardGate.owner_answer_ref);

  return {
    surface_kind: 'opl_operating_maturity_current_owner_delta_bridge',
    source_command: 'opl framework readiness --family-defaults --json',
    source_read_model_ref:
      '/framework_readiness/attention_first_payload/current_owner_delta',
    default_planning_root:
      stringValue(currentOwnerDelta.default_planning_root) ?? 'current_owner_delta',
    current_owner: stringValue(currentOwnerDelta.current_owner),
    domain_id: stringValue(currentOwnerDelta.domain_id),
    stage_id: stringValue(currentOwnerDelta.stage_id),
    lineage_ref: stringValue(currentOwnerDelta.lineage_ref),
    desired_delta_kind: stringValue(currentOwnerDelta.desired_delta_kind),
    desired_delta_description:
      stringValue(currentOwnerDelta.desired_delta_description),
    payload_requirement: stringValue(currentOwnerDelta.payload_requirement),
    accepted_answer_shape: stringListValue(currentOwnerDelta.accepted_answer_shape),
    required_return_shapes: stringListValue(currentOwnerDelta.required_return_shapes),
    hard_gate: {
      state: stringValue(hardGate.state),
      human_or_domain_owner_required:
        hardGate.human_or_domain_owner_required === true,
      provider_liveness_required:
        hardGate.provider_liveness_required === true,
      owner_answer_ref: ownerAnswerRef,
      owner_answer_kind:
        stringValue(currentOwnerDelta.latest_owner_answer_kind)
        ?? stringValue(hardGate.owner_answer_kind),
      domain_ready_authorized: hardGate.domain_ready_authorized === true,
      quality_or_export_authorized: hardGate.quality_or_export_authorized === true,
      audit_sidecar_hard_gate_upgrade_required:
        hardGate.audit_sidecar_hard_gate_upgrade_required === true,
    },
    latest_owner_answer_ref: ownerAnswerRef,
    latest_owner_answer_kind: stringValue(currentOwnerDelta.latest_owner_answer_kind),
    next_safe_action_or_none: Object.keys(nextSafeAction).length > 0
      ? nextSafeAction
      : null,
    owner_answer_missing:
      ownerAnswerRef === null
      && stringListValue(currentOwnerDelta.accepted_answer_shape).length > 0,
    owner_answer_still_required:
      ownerAnswerRef === null
      && hardGate.human_or_domain_owner_required === true,
    evidence_lanes_are_audit_sidecar: true,
    evidence_lanes_can_generate_default_next_action: false,
    required_owner_answer_shapes:
      stringListValue(currentOwnerDelta.accepted_answer_shape),
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_l5: false,
      can_claim_production_ready: false,
      bridge_is_projection_only: true,
    },
  };
}

export async function buildFrameworkOperatingMaturityReadout(
  contracts: FrameworkContracts,
  args: OperatingMaturityArgs,
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
  const runtimeSnapshot = await buildRuntimeTraySnapshot(contracts, {
    appOperatorDrilldownDetailLevel: 'summary',
    providerKind: 'temporal',
  });
  const appOperatorDrilldown = record(
    record(runtimeSnapshot.runtime_tray_snapshot).app_operator_drilldown,
  );
  const ownerDeltaBridge = currentOwnerDeltaBridge(appOperatorDrilldown);
  const appReleaseUserPath = appReleaseUserPathMaturity();
  const ownerEvidenceIntake = buildFoundryAgentOsOwnerEvidenceIntake({
    contracts,
    appReleaseEvidence: appReleaseUserPath.evidence,
    domainOwnerChain,
  });
  const drilldownMaturity = appOperatorDrilldownMaturity(appOperatorDrilldown);
  const physicalDeleteAuthority = record(defaultCallers.physical_delete_authority_read_model);
  const providerOpenCount = drilldownMaturity.provider.openEvidenceCount;
  const lifecycleOpenCount = drilldownMaturity.lifecycle.openEvidenceCount;
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
    appReleaseOpenCount,
    providerOpenCount,
    cleanupOpenDecisionCount,
    lifecycleOpenCount,
    ownerEvidenceIntake,
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
          numberValue(record(brandModuleL5.evidence_ledger).verified_receipt_count),
        app_release_user_path_open_count: appReleaseOpenCount,
        provider_long_soak_open_count: providerOpenCount,
        cleanup_retirement_open_decision_count: cleanupOpenDecisionCount,
        memory_artifact_lifecycle_open_count: lifecycleOpenCount,
        ready_claim_authorized: false,
      },
      current_owner_delta_bridge: ownerDeltaBridge,
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
        evidence_ledger: record(brandModuleL5.evidence_ledger),
        l5_claim_policy: record(brandModuleL5.l5_claim_policy),
        owner_route_work_order_policy: record(brandModuleL5.owner_route_work_order_policy),
        authority_boundary: record(brandModuleL5.authority_boundary),
      },
      app_release_user_path: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: appReleaseOpenCount > 0
          ? 'evidence_required'
          : 'evidence_recorded_not_release_ready_claim',
        latest_release_tag: null,
        next_required_delta: appReleaseOpenCount > 0
          ? 'same_cohort_app_release_user_path_evidence_or_release_owner_typed_blocker'
          : 'release_owner_verdict_still_not_claimed_by_opl',
        production_user_path_ready: appReleaseUserPath.productionUserPathReady,
        evidence_ledger_status: stringValue(appReleaseUserPath.evidence.evidence_ledger_status),
        open_gate_count: numberValue(appReleaseUserPath.evidence.open_gate_count),
        pending_verify_receipt_ref_count:
          numberValue(appReleaseUserPath.evidence.pending_verify_receipt_ref_count),
        typed_blocker_ref_count: numberValue(appReleaseUserPath.evidence.typed_blocker_ref_count),
        verified_ledger_receipt_ref_count:
          numberValue(appReleaseUserPath.evidence.verified_ledger_receipt_ref_count),
        selected_cohort_id:
          stringValue(record(appReleaseUserPath.evidence.cohort_guard).selected_cohort_id),
        accepted_refs_only_result_shapes: [
          'release_evidence_ref',
          'install_evidence_ref',
          'operator_evidence_ref',
          'release_owner_receipt_ref',
          'typed_blocker_ref',
        ],
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
        accepted_refs_only_result_shapes: [
          'long_soak_ref',
          'recovery_ref',
          'dead_letter_ref',
          'provider_blocker_ref',
          'typed_blocker_ref',
        ],
        provider_completion_counts_as_production_ready: false,
      },
      cleanup_retirement: {
        source_command: 'opl agents default-callers --family-defaults --json',
        status: stringValue(physicalDeleteAuthority.owner_decision_status)
          ?? (cleanupOpenDecisionCount > 0
            ? 'owner_decision_required'
            : 'owner_decision_observed_refs_only_not_delete_authorized'),
        deletion_evidence_worklist_count: cleanupEvidenceWorklistCount,
        owner_decision_missing_count: cleanupOpenDecisionCount,
        structural_prerequisites_observed:
          physicalDeleteAuthority.all_repos_delete_or_keep_prerequisites_observed === true,
        all_deletion_evidence_requirements_observed:
          physicalDeleteAuthority.all_repos_all_deletion_evidence_requirements_observed === true,
        owner_decision_status: stringValue(physicalDeleteAuthority.owner_decision_status),
        default_caller_delete_ready: booleanValue(defaultCallers.default_caller_delete_ready),
        physical_delete_authorized: booleanValue(defaultCallers.physical_delete_authorized),
        physical_delete_authorization_status:
          stringValue(defaultCallers.physical_delete_authorization_status),
        next_required_owner_action: 'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
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
        lifecycle_blockers_count_as_missing_evidence: false,
        accepted_refs_only_result_shapes: [
          'memory_receipt_ref',
          'artifact_mutation_receipt_ref',
          'package_export_lifecycle_receipt_ref',
          'cleanup_restore_retention_receipt_ref',
          'typed_blocker_ref',
        ],
        opl_stores_body_or_verdict: false,
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
