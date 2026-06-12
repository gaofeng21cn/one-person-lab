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
  const providerEvidence = record(drilldown.provider_long_soak_evidence);
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
  const providerEvidenceBlockerRefCount =
    stringListValue(providerEvidence.provider_blocker_refs).length
    + stringListValue(providerEvidence.typed_blocker_refs).length;
  const providerCapabilityStatus =
    stringValue(summary.provider_slo_capability_status);
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
      capabilityStatus:
        providerCapabilityStatus === 'capability_slo_not_observed'
          && providerEvidenceBlockerRefCount > 0
          ? 'capability_slo_blocked'
          : providerCapabilityStatus,
      evidence: providerEvidence,
      observedReceiptRefs: stringListValue(providerEvidence.receipt_refs),
      verifiedReceiptRefs: stringListValue(providerEvidence.verified_receipt_refs),
      pendingVerifyReceiptRefs: stringListValue(providerEvidence.pending_verify_receipt_refs),
      observedRefShapes: stringListValue(providerEvidence.observed_ref_shapes),
      observedRefCounts: record(providerEvidence.observed_ref_counts),
      authorityBoundary: record(providerEvidence.authority_boundary),
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

function providerLongSoakExecutionRunbook() {
  return {
    surface_kind: 'opl_provider_long_soak_execution_runbook',
    owner: 'one-person-lab runtime owner',
    record_command:
      'opl runtime provider-long-soak-evidence record --payload \'{"long_soak_refs":["provider-long-soak:temporal/<window>"],"recovery_refs":["provider-recovery:temporal/<event>"],"dead_letter_refs":["provider-dead-letter:temporal/<queue>"],"provider_blocker_refs":["provider-blocker:temporal/<capability>"],"typed_blocker_refs":["typed-blocker:provider/<reason>"]}\'',
    verify_command:
      'opl runtime provider-long-soak-evidence verify --receipt-ref <receipt_ref>',
    readback_commands: [
      'opl runtime provider-long-soak-evidence list --json',
      SOURCE_COMMANDS.app_operator_drilldown,
      'opl framework operating-maturity --family-defaults --json',
    ],
    accepted_ref_shapes: [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ],
    accepted_paths: [
      'long_soak_recovery_dead_letter_evidence_path',
      'provider_or_typed_blocker_path',
    ],
    readback_fields: [
      'provider_long_soak.open_evidence_count',
      'provider_long_soak.long_evidence_ready',
      'provider_long_soak.capability_status',
      'provider_long_soak.provider_completion_counts_as_production_ready',
      'foundry_agent_os_production_evidence_gate.owner_route_work_orders[lane=provider_long_soak]',
    ],
    stop_loss: [
      'if capability_status remains capability_slo_blocked, record provider_blocker_ref or typed_blocker_ref instead of rerunning evidence accounting',
      'if long_evidence_ready remains false after a claimed window, preserve open_evidence_count=1 and route to runtime owner',
      'if provider completion is the only proof, keep provider_completion_counts_as_production_ready=false',
    ],
    false_authority_guard: {
      refs_only: true,
      can_claim_provider_production_ready: false,
      can_claim_production_ready: false,
      can_claim_domain_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    },
  };
}

function appReleaseUserPathExecutionRunbook() {
  return {
    surface_kind: 'opl_app_release_user_path_execution_runbook',
    owner: 'one-person-lab-app release owner',
    record_command:
      'opl runtime app-release-evidence record --payload \'{"release_package_refs":["release:pkg"],"screenshot_refs":["screenshot:first-run"],"reload_prompt_user_path_refs":["first-run:log"],"provider_state_linkage_refs":["provider:state"],"long_operator_evidence_refs":["operator:long-window"]}\'',
    typed_blocker_record_command:
      'opl runtime app-release-evidence record --payload \'{"typed_blocker_refs":["typed-blocker:app-release/<reason>"]}\'',
    verify_command:
      'opl runtime app-release-evidence verify --receipt-ref <receipt_ref>',
    long_operator_commands: [
      'opl runtime app-release-evidence long-operator start --cohort <version> --minimum-duration-minutes <n> --evidence-dir <path>',
      'opl runtime app-release-evidence long-operator event --workorder-file <path> --event-kind <kind> --evidence-ref <ref>',
      'opl runtime app-release-evidence long-operator finish --workorder-file <path>',
    ],
    readback_commands: [
      'opl runtime app-release-evidence list --json',
      SOURCE_COMMANDS.app_operator_drilldown,
      'opl framework operating-maturity --family-defaults --json',
    ],
    accepted_ref_shapes: [
      'release_evidence_ref',
      'install_evidence_ref',
      'operator_evidence_ref',
      'release_owner_receipt_ref',
      'typed_blocker_ref',
    ],
    accepted_paths: [
      'same_cohort_release_user_path_refs_path',
      'release_owner_typed_blocker_path',
      'release_owner_verdict_path',
    ],
    readback_fields: [
      'app_release_user_path.open_gate_count',
      'app_release_user_path.production_user_path_ready',
      'app_release_user_path.release_ready_authorized',
      'app_release_user_path.next_required_delta',
      'foundry_agent_os_production_evidence_gate.owner_route_work_orders[lane=app_release_user_path]',
    ],
    stop_loss: [
      'if open_gate_count is zero but release_ready_authorized is false, stop recording OPL evidence and request release owner verdict or typed blocker',
      'if success refs and typed_blocker_refs are mixed in one payload, split the path before recording',
      'if cohort_guard selects a newer incomplete cohort, keep release_ready_authorized=false',
    ],
    false_authority_guard: {
      refs_only: true,
      open_count_zero_is_not_release_ready: true,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
      can_create_owner_receipt: false,
    },
  };
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

function ownerPayloadFieldForAnswerShape(shape: string) {
  const shapeToPayloadField: Record<string, string> = {
    domain_owner_receipt_ref: 'domain_owner_receipt_refs',
    domain_receipt_ref: 'domain_receipt_refs',
    quality_gate_receipt_ref: 'quality_or_export_receipt_refs',
    quality_or_export_receipt_ref: 'quality_or_export_receipt_refs',
    human_gate_ref: 'human_gate_refs',
    no_regression_ref: 'no_regression_evidence_refs',
    reviewer_receipt_ref: 'reviewer_receipt_refs',
    long_soak_ref: 'long_soak_refs',
    owner_chain_ref: 'owner_chain_refs',
    runtime_event_ref: 'runtime_event_refs',
    typed_blocker_ref: 'typed_blocker_refs',
  };
  return shapeToPayloadField[shape];
}

function ownerRouteWorkOrderPolicy(lane: string) {
  const commonForbiddenClaims = [
    'domain_ready',
    'app_release_ready',
    'brand_module_l5_complete',
    'production_ready',
    'physical_delete_authorized',
    'owner_receipt_signed_by_opl',
    'typed_blocker_created_by_opl',
    'quality_or_export_ready',
  ];
  const policies: Record<string, {
    owner_repo: string;
    closing_ref_source: string;
    typed_blocker_source: string;
    verification_command: string;
  }> = {
    domain_owner_chain_scaleout: {
      owner_repo: 'MAS/MAG/RCA/OMA domain repositories',
      closing_ref_source: 'domain_owner_live_owner_receipt_human_gate_quality_export_no_regression_or_long_soak_ref',
      typed_blocker_source: 'domain_owner_live_progress_typed_blocker_ref',
      verification_command: 'opl agents conformance --family-defaults --json',
    },
    brand_module_l5_operating_maturity: {
      owner_repo: 'brand module owner surfaces',
      closing_ref_source: 'brand_module_owner_evidence_ref_or_owner_acceptance_ref',
      typed_blocker_source: 'brand_module_owner_l5_typed_blocker_ref',
      verification_command: 'opl brand-modules l5-status --json',
    },
    app_release_user_path: {
      owner_repo: '/Users/gaofeng/workspace/one-person-lab-app',
      closing_ref_source: 'one_person_lab_app_release_owner_receipt_or_same_cohort_release_evidence_ref',
      typed_blocker_source: 'one_person_lab_app_release_owner_typed_blocker_ref',
      verification_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    provider_long_soak: {
      owner_repo: '/Users/gaofeng/workspace/one-person-lab',
      closing_ref_source: 'opl_runtime_owner_long_soak_recovery_dead_letter_or_provider_blocker_ref',
      typed_blocker_source: 'opl_runtime_owner_provider_typed_blocker_ref',
      verification_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    private_platform_retirement: {
      owner_repo: 'domain repositories',
      closing_ref_source: 'domain_owner_physical_delete_authorization_keep_or_typed_blocker',
      typed_blocker_source: 'domain_owner_private_platform_retirement_typed_blocker_ref',
      verification_command: 'opl agents default-callers --family-defaults --json',
    },
    memory_artifact_lifecycle_apply: {
      owner_repo: 'domain repositories',
      closing_ref_source: 'domain_owner_memory_artifact_lifecycle_receipt_ref',
      typed_blocker_source: 'domain_owner_memory_artifact_lifecycle_typed_blocker_ref',
      verification_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
  };
  return {
    ...(policies[lane] ?? {
      owner_repo: 'owner repository',
      closing_ref_source: 'owner_receipt_or_typed_blocker_ref',
      typed_blocker_source: 'owner_typed_blocker_ref',
      verification_command: 'owner-native verification command',
    }),
    forbidden_opl_claims: commonForbiddenClaims,
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
    const policy = ownerRouteWorkOrderPolicy(action.lane);
    return {
      work_order_id: workOrderIds[action.lane] ?? `w7-${action.lane.replace(/_/g, '-')}`,
      lane: action.lane,
      owner: action.owner,
      owner_repo: policy.owner_repo,
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
      owner_evidence_closure_state: lane?.open_count && lane.open_count > 0
        ? 'owner_evidence_required'
        : ownerEvidenceObserved
          ? 'owner_evidence_recorded_not_ready_claim'
          : 'owner_acceptance_or_typed_blocker_required',
      owner_acceptance_required: true,
      ready_claim_authorized: false,
      open_count_semantics:
        'open_count_tracks_lane_specific_missing_evidence_only_zero_does_not_authorize_ready_claim',
      accepted_ref_shapes: unique([
        ...(lane?.accepted_closing_ref_shapes ?? []),
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ]),
      source_command: action.source_command,
      closing_ref_source: policy.closing_ref_source,
      typed_blocker_source: policy.typed_blocker_source,
      forbidden_opl_claims: policy.forbidden_opl_claims,
      verification_command: policy.verification_command,
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
  brandModuleL5: Record<string, unknown>;
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
  const brandModules = recordList(input.brandModuleL5.modules);
  const brandL5RequirementWorkOrders = brandModules.flatMap((module) =>
    recordList(module.owner_evidence_routes).map((route) => ({
      module_id: stringValue(module.module_id),
      brand_name: stringValue(module.brand_name),
      work_order_id: stringValue(route.work_order_id),
      class_id: stringValue(route.class_id),
      owner: stringValue(route.owner),
      owner_route_status: stringValue(route.owner_route_status),
      blocker_state: stringValue(route.blocker_state),
      owner_evidence_closure_state: stringValue(route.owner_evidence_closure_state),
      owner_acceptance_required: route.owner_acceptance_required === true,
      ready_claim_authorized: route.ready_claim_authorized === true,
      existing_evidence_refs: stringListValue(route.existing_evidence_refs),
      existing_blocker_refs: stringListValue(route.existing_blocker_refs),
      observed_evidence_refs: stringListValue(route.observed_evidence_refs),
      observed_ref_shapes: stringListValue(route.observed_ref_shapes),
      observed_ref_count: numberValue(route.observed_ref_count),
      observed_receipt_refs: stringListValue(route.observed_receipt_refs),
      observed_receipt_count: numberValue(route.observed_receipt_count),
      verified_receipt_count: numberValue(route.verified_receipt_count),
      l5_claim_status: stringValue(route.l5_claim_status),
      typed_blocker_payload_template: record(route.typed_blocker_payload_template),
      evidence_payload_template: record(route.evidence_payload_template),
      owner_route_command_examples: record(route.owner_route_command_examples),
      verification_command: stringValue(route.verification_command),
      authority_boundary: record(route.authority_boundary),
    }))
  );
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
    final_scaleout_gate: {
      surface_kind: 'opl_final_scaleout_gate',
      status: openLaneCount > 0
        ? 'external_owner_evidence_required'
        : 'owner_verdict_refs_required_before_ready_claim',
      open_lane_count: openLaneCount,
      blocker_refs: [],
      owner_verdict_refs: [],
      release_verdict_refs: [],
      long_soak_refs: [],
      owner_route_work_order_count: workOrders.length,
      ready_claim_authorized: false,
      non_closing_inputs: [
        'zero_worklist_count',
        'same_cohort_diagnostic',
        'long_soak_workorder',
        'verified_refs_only_ledger',
      ],
      authority_boundary: {
        can_claim_domain_ready: false,
        can_claim_app_release_ready: false,
        can_claim_l5: false,
        can_claim_production_ready: false,
      },
    },
    owner_route_work_orders: workOrders,
    brand_module_l5_requirement_work_orders: brandL5RequirementWorkOrders,
    summary: {
      open_lane_count: openLaneCount,
      owner_route_work_order_count: workOrders.length,
      brand_module_l5_requirement_work_order_count:
        brandL5RequirementWorkOrders.length,
      brand_module_l5_typed_blocker_ready_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          Object.keys(record(entry.typed_blocker_payload_template)).length > 0
        ).length,
      brand_module_l5_owner_acceptance_required_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.owner_acceptance_required === true
        ).length,
      brand_module_l5_existing_evidence_ref_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.existing_evidence_refs.length > 0
        ).length,
      brand_module_l5_existing_blocker_ref_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.existing_blocker_refs.length > 0
        ).length,
      brand_module_l5_observed_ref_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.observed_ref_count > 0 || entry.observed_evidence_refs.length > 0
        ).length,
      open_owner_route_work_order_count: workOrders.filter((entry) => entry.status === 'open').length,
      owner_evidence_required_work_order_count: workOrders.filter((entry) =>
        entry.owner_evidence_closure_state === 'owner_evidence_required'
      ).length,
      owner_evidence_recorded_not_ready_claim_work_order_count: workOrders.filter((entry) =>
        entry.owner_evidence_closure_state === 'owner_evidence_recorded_not_ready_claim'
      ).length,
      owner_acceptance_required_work_order_count: workOrders.filter((entry) =>
        entry.owner_acceptance_required === true
      ).length,
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
  const deltaId = stringValue(currentOwnerDelta.delta_id);
  const domainId = stringValue(currentOwnerDelta.domain_id);
  const stageId = stringValue(currentOwnerDelta.stage_id);
  const acceptedAnswerShape = stringListValue(currentOwnerDelta.accepted_answer_shape);
  const acceptedSuccessAnswerShapes = acceptedAnswerShape.filter((shape) =>
    shape !== 'typed_blocker_ref'
  );
  const acceptedSuccessPayloadRefs = unique(
    acceptedSuccessAnswerShapes
      .map(ownerPayloadFieldForAnswerShape)
      .filter((entry): entry is string => Boolean(entry)),
  );
  const unsupportedSuccessAnswerShapes = acceptedSuccessAnswerShapes.filter((shape) =>
    ownerPayloadFieldForAnswerShape(shape) === undefined
  );
  const usesDomainOwnerPayloadSummary = acceptedSuccessPayloadRefs.length > 0;
  const recordCommand = usesDomainOwnerPayloadSummary
    ? 'opl runtime domain-owner-payload-summary record --target-identity <json> --payload <json>'
    : 'owner-native refs-only record command for current_owner_delta accepted answer shape';
  const verifyCommand = usesDomainOwnerPayloadSummary
    ? 'opl runtime domain-owner-payload-summary verify --receipt-ref <receipt-ref>'
    : 'owner-native verify command for current_owner_delta owner answer ref';
  const ownerAnswerMissing =
    ownerAnswerRef === null
    && acceptedAnswerShape.length > 0;
  const ownerAnswerStillRequired =
    ownerAnswerRef === null
    && hardGate.human_or_domain_owner_required === true;
  const targetIdentity = {
    domain_id: domainId,
    current_owner: stringValue(currentOwnerDelta.current_owner),
    stage_id: stageId,
    task_or_study_ref: stringValue(currentOwnerDelta.task_or_study_ref),
    lineage_ref: stringValue(currentOwnerDelta.lineage_ref),
    current_owner_delta_id: deltaId,
    source_fingerprint: stringValue(currentOwnerDelta.source_fingerprint),
    stage_run_closeout_binding_ref:
      stringValue(currentOwnerDelta.stage_run_closeout_binding_ref),
    stage_run_closeout_binding_policy:
      stringValue(currentOwnerDelta.stage_run_closeout_binding_policy),
  };

  return {
    surface_kind: 'opl_operating_maturity_current_owner_delta_bridge',
    source_command: 'opl framework readiness --family-defaults --json',
    source_read_model_ref:
      '/framework_readiness/attention_first_payload/current_owner_delta',
    delta_id: deltaId,
    default_planning_root:
      stringValue(currentOwnerDelta.default_planning_root) ?? 'current_owner_delta',
    current_owner: stringValue(currentOwnerDelta.current_owner),
    domain_id: domainId,
    stage_id: stageId,
    task_or_study_ref: stringValue(currentOwnerDelta.task_or_study_ref),
    lineage_ref: stringValue(currentOwnerDelta.lineage_ref),
    source_fingerprint: stringValue(currentOwnerDelta.source_fingerprint),
    desired_delta_kind: stringValue(currentOwnerDelta.desired_delta_kind),
    desired_delta_description:
      stringValue(currentOwnerDelta.desired_delta_description),
    payload_requirement: stringValue(currentOwnerDelta.payload_requirement),
    accepted_answer_shape: acceptedAnswerShape,
    required_return_shapes: stringListValue(currentOwnerDelta.required_return_shapes),
    missing_input_refs: stringListValue(currentOwnerDelta.missing_input_refs),
    required_ref_shape: record(currentOwnerDelta.required_ref_shape),
    stage_run_closeout_binding_ref:
      stringValue(currentOwnerDelta.stage_run_closeout_binding_ref),
    stage_run_closeout_binding_policy:
      stringValue(currentOwnerDelta.stage_run_closeout_binding_policy),
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
    owner_answer_missing: ownerAnswerMissing,
    owner_answer_still_required: ownerAnswerStillRequired,
    owner_answer_closure_handoff: {
      surface_kind: 'opl_current_owner_delta_owner_answer_closure_handoff',
      status: ownerAnswerMissing || ownerAnswerStillRequired
        ? 'domain_owner_payload_required'
        : 'owner_answer_ref_observed_not_ready_claim',
      route_kind: usesDomainOwnerPayloadSummary
        ? 'refs_only_domain_owner_payload_summary'
        : 'owner_native_refs_only_payload',
      target_identity: targetIdentity,
      missing_binding_checklist: [
        'domain_id_matches_current_owner_delta',
        'current_owner_matches_current_owner_delta',
        'stage_or_work_unit_matches_current_owner_delta',
        'source_fingerprint_matches_current_owner_delta',
        'stage_run_closeout_binding_policy_satisfied_when_present',
        'idempotency_key_matches_owner_work_unit_or_stage_run',
      ],
      accepted_return_shape: {
        success_refs_path: {
          accepted_answer_shapes: acceptedSuccessAnswerShapes,
          required_any_payload_refs: acceptedSuccessPayloadRefs,
          unsupported_by_domain_owner_payload_summary: unsupportedSuccessAnswerShapes,
          typed_blocker_refs_must_be_absent: true,
          closes_domain_ready: false,
          can_claim_production_ready: false,
        },
        typed_blocker_path: {
          accepted_answer_shapes: ['typed_blocker_ref'],
          required_payload_refs: ['typed_blocker_refs'],
          success_claimed: false,
          closes_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      record_command: recordCommand,
      verify_command: verifyCommand,
      record_target_identity_template: {
        domain_id: domainId,
        source_surface: 'current_owner_delta_bridge',
        summary_kind: 'owner_payload_item',
        item_id: deltaId ?? stageId ?? 'current-owner-delta',
        payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
        current_owner_delta_ref:
          '/framework_readiness/attention_first_payload/current_owner_delta',
      },
      success_refs_payload_template: {
        domain_owner_receipt_refs: ['<domain-owned-owner-receipt-ref>'],
        quality_or_export_receipt_refs: ['<domain-owned-quality-or-export-receipt-ref>'],
        human_gate_refs: ['<human-gate-ref>'],
        no_regression_evidence_refs: ['<no-regression-ref>'],
        long_soak_refs: ['<long-soak-ref>'],
      },
      typed_blocker_payload_template: {
        typed_blocker_refs: ['<domain-owned-typed-blocker-ref>'],
      },
      non_closing_inputs: [
        'docs_foldback',
        'conformance_pass',
        'provider_completion',
        'verified_refs_only_ledger_without_current_owner_delta_binding',
        'stale_attempt_owner_answer_ref',
      ],
      ready_claim_authorized: false,
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
        handoff_is_payload_route_only: true,
      },
    },
    evidence_lanes_are_audit_sidecar: true,
    evidence_lanes_can_generate_default_next_action: false,
    required_owner_answer_shapes:
      acceptedAnswerShape,
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
    physicalDeleteAuthority: record(defaultCallers.physical_delete_authority_read_model),
    lifecycleEvidence: record(
      record(record(appOperatorDrilldown.attention_first_payload).evidence_after_contract)
        .memory_artifact_lifecycle_evidence,
    ),
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
    cleanupOpenDecisionCount,
    lifecycleOpenCount,
    ownerEvidenceIntake,
  });
  const oneShotPlanLanding = oneShotPlanLandingReadout(contracts);

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
      one_shot_plan_landing: oneShotPlanLanding,
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
        ],
        execution_runbook: providerLongSoakRunbook,
        owner: providerLongSoakRunbook.owner,
        record_command: providerLongSoakRunbook.record_command,
        verify_command: providerLongSoakRunbook.verify_command,
        readback_commands: providerLongSoakRunbook.readback_commands,
        stop_loss: providerLongSoakRunbook.stop_loss,
        provider_completion_counts_as_production_ready: false,
        authority_boundary: drilldownMaturity.provider.authorityBoundary,
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
