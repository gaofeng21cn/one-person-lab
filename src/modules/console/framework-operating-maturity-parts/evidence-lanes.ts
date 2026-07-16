import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from '../framework-readiness-source-commands.ts';
import {
  booleanValue,
  numberValue,
  record,
  stringValue,
} from '../framework-readiness-values.ts';
import { QUEUE_PROJECTION_VOCABULARY } from '../../../kernel/queue-projection-vocabulary.ts';

export function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function unique(items: string[]) {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

const PROVIDER_CAPABILITY_REQUIREMENTS = [
  {
    requirement_id: 'restart_requery_ready',
    summary_field: 'provider_slo_capability_restart_requery_ready',
    required_ref_shape: 'recovery_ref',
    owner_action: 'record restart/requery recovery evidence or provider blocker',
  },
  {
    requirement_id: 'signal_history_ready',
    summary_field: 'provider_slo_capability_signal_history_ready',
    required_ref_shape: 'long_soak_ref',
    owner_action: 'record signal-history long-soak evidence or provider blocker',
  },
  {
    requirement_id: 'typed_closeout_claim_evidence_ready',
    summary_field: 'provider_slo_capability_typed_closeout_claim_evidence_ready',
    required_ref_shape: 'owner_or_quality_claim_evidence_ref',
    owner_action: 'record typed closeout claim evidence without making it a stage-progress prerequisite',
  },
  {
    requirement_id: 'missing_closeout_diagnostic_ready',
    summary_field: 'provider_slo_capability_missing_closeout_diagnostic_ready',
    required_ref_shape: 'progress_diagnostic_ref',
    owner_action: 'record missing-closeout diagnostic advancement evidence',
  },
  {
    requirement_id: 'no_output_diagnostic_boundary_ready',
    summary_field: 'provider_slo_capability_no_output_diagnostic_ready',
    required_ref_shape: 'progress_diagnostic_ref',
    owner_action: 'record no-output diagnostic boundary evidence',
  },
  {
    requirement_id: 'domain_truth_boundary_preserved',
    summary_field: 'provider_slo_capability_domain_truth_boundary_preserved',
    required_ref_shape: 'provider_blocker_ref',
    owner_action: 'record domain-truth boundary preservation evidence or provider blocker',
  },
];

function providerCapabilityChecklist(
  summary: Record<string, unknown>,
  providerEvidence: Record<string, unknown>,
) {
  const evidenceRequirementIds = stringListValue(
    providerEvidence.capability_requirement_ids,
  );
  return PROVIDER_CAPABILITY_REQUIREMENTS.map((requirement) => {
    const observed = booleanValue(summary[requirement.summary_field]) === true;
    const refsObserved = evidenceRequirementIds.includes(requirement.requirement_id);
    return {
      ...requirement,
      observed,
      refs_observed: refsObserved,
      status: observed
        ? 'observed'
        : refsObserved
          ? 'refs_observed_not_ready_claim'
          : 'evidence_required',
      closes_production_ready: false,
      authority_boundary: {
        refs_only: true,
        can_claim_provider_production_ready: false,
        can_claim_production_ready: false,
        can_claim_domain_ready: false,
      },
    };
  });
}

export function appReleaseUserPathMaturity(appReleaseUserPathEvidence: unknown) {
  const evidence = record(appReleaseUserPathEvidence);
  const releaseOwnerVerdictHandoff = record(evidence.release_owner_verdict_handoff);
  const productionUserPathReady = evidence.production_user_path_ready === true;
  const pendingVerifyCount = numberValue(evidence.pending_verify_receipt_ref_count);
  const typedBlockerCount = numberValue(evidence.typed_blocker_ref_count);
  const verifiedReceiptCount = numberValue(evidence.verified_ledger_receipt_ref_count);
  const releaseOwnerReceiptRefCount =
    stringListValue(releaseOwnerVerdictHandoff.observed_release_owner_receipt_refs).length;
  const releaseOwnerTypedBlockerRefCount =
    stringListValue(releaseOwnerVerdictHandoff.observed_typed_blocker_refs).length;
  const ownerAcceptanceRefs =
    stringListValue(releaseOwnerVerdictHandoff.observed_owner_acceptance_refs);
  const ownerAcceptanceRefCount = ownerAcceptanceRefs.length;
  const releaseOwnerVerdictObserved = releaseOwnerReceiptRefCount > 0;
  const verifiedReleaseOwnerTypedBlockerObserved =
    verifiedReceiptCount > 0 && pendingVerifyCount === 0 && releaseOwnerTypedBlockerRefCount > 0;
  const ownerAcceptanceEvidenceRecorded =
    ownerAcceptanceRefCount > 0 && verifiedReceiptCount > 0 && pendingVerifyCount === 0;
  const releaseOwnerVerdictStatus = releaseOwnerVerdictObserved
    ? 'release_owner_receipt_recorded_not_release_ready_claim'
    : ownerAcceptanceEvidenceRecorded
      ? 'release_owner_acceptance_recorded_not_release_ready_claim'
      : verifiedReleaseOwnerTypedBlockerObserved
        ? 'release_owner_typed_blocker_recorded_not_release_ready_claim'
      : stringValue(releaseOwnerVerdictHandoff.status)
        ?? 'waiting_for_same_cohort_user_path_evidence_or_typed_blocker';
  const releaseOwnerVerdictClosureObserved =
    releaseOwnerVerdictObserved
    || verifiedReleaseOwnerTypedBlockerObserved
    || ownerAcceptanceEvidenceRecorded;
  const openEvidenceCount =
    (
      productionUserPathReady && pendingVerifyCount === 0 && typedBlockerCount === 0
    ) || releaseOwnerVerdictClosureObserved
      ? 0
      : 1;

  return {
    evidence,
    releaseOwnerVerdictHandoff: {
      ...releaseOwnerVerdictHandoff,
      status: releaseOwnerVerdictStatus,
    },
    releaseOwnerVerdictClosureObserved,
    releaseOwnerVerdictStatus,
    ownerAcceptanceEvidenceRecorded,
    ownerAcceptanceRefs,
    ownerAcceptanceRefCount,
    openEvidenceCount,
    productionUserPathReady,
  };
}

export function appOperatorDrilldownMaturity(drilldown: Record<string, unknown>) {
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
  const providerOwnerAcceptanceRefs =
    stringListValue(providerEvidence.owner_acceptance_refs);
  const providerOwnerAcceptanceRefCount =
    providerOwnerAcceptanceRefs.length;
  const providerVerifiedReceiptRefs = stringListValue(providerEvidence.verified_receipt_refs);
  const providerPendingVerifyReceiptRefs =
    stringListValue(providerEvidence.pending_verify_receipt_refs);
  const providerCapabilityStatus =
    stringValue(summary.provider_slo_capability_status);
  const capabilityChecklist = providerCapabilityChecklist(summary, providerEvidence);
  const capabilityMissingRequirementIds = capabilityChecklist
    .filter((entry) => entry.observed !== true && entry.refs_observed !== true)
    .map((entry) => entry.requirement_id);
  const capabilityEvidenceObservedRequirementIds = capabilityChecklist
    .filter((entry) => entry.observed !== true && entry.refs_observed === true)
    .map((entry) => entry.requirement_id);
  const providerOwnerBlockerEvidenceRecorded =
    providerEvidenceBlockerRefCount > 0
    && providerVerifiedReceiptRefs.length > 0
    && providerPendingVerifyReceiptRefs.length === 0
    && capabilityMissingRequirementIds.length === 0;
  const providerOwnerAcceptanceEvidenceRecorded =
    providerOwnerAcceptanceRefCount > 0
    && providerVerifiedReceiptRefs.length > 0
    && providerPendingVerifyReceiptRefs.length === 0;
  const providerOpenCount =
    providerLongEvidenceReady
      || providerOwnerBlockerEvidenceRecorded
      || providerOwnerAcceptanceEvidenceRecorded
      ? 0
      : 1;
  const lifecycleObservedRefCount = numberValue(lifecycleEvidence.observed_ref_count);
  const lifecycleLedgerProjection = record(lifecycleEvidence.ledger_projection);
  const lifecycleOwnerWorkOrder = record(lifecycleEvidence.lifecycle_owner_work_order);
  const lifecycleTypedBlockerWorkOrder = record(
    lifecycleOwnerWorkOrder.typed_blocker_work_order,
  );
  const lifecycleLatestTypedBlockerRefs = stringListValue(
    lifecycleTypedBlockerWorkOrder.latest_typed_blocker_refs,
  );
  const lifecycleLedgerVerifiedReceiptRefs =
    stringListValue(lifecycleEvidence.ledger_verified_receipt_refs);
  const lifecycleLedgerPendingVerifyReceiptRefs =
    stringListValue(lifecycleEvidence.ledger_pending_verify_receipt_refs);
  const lifecycleLedgerTypedBlockerRefs =
    stringListValue(lifecycleEvidence.ledger_latest_typed_blocker_refs);
  const lifecycleLedgerOwnerAcceptanceRefs =
    stringListValue(lifecycleEvidence.ledger_owner_acceptance_refs);
  const lifecycleVerifiedOwnerEvidenceRecorded =
    lifecycleLedgerVerifiedReceiptRefs.length > 0
    && lifecycleLedgerPendingVerifyReceiptRefs.length === 0
    && (
      numberValue(lifecycleEvidence.ledger_memory_receipt_ref_count) > 0
      || numberValue(lifecycleEvidence.ledger_memory_writeback_receipt_ref_count) > 0
      || numberValue(lifecycleEvidence.ledger_artifact_mutation_receipt_ref_count) > 0
      || numberValue(lifecycleEvidence.ledger_package_lifecycle_receipt_ref_count) > 0
      || numberValue(lifecycleEvidence.ledger_export_lifecycle_receipt_ref_count) > 0
      || numberValue(lifecycleEvidence.ledger_cleanup_restore_retention_receipt_ref_count) > 0
      || lifecycleLedgerTypedBlockerRefs.length > 0
      || lifecycleLedgerOwnerAcceptanceRefs.length > 0
    );
  const lifecycleReconcileIssueCount =
    numberValue(lifecycleEvidence.lifecycle_reconcile_missing_ref_count)
    + numberValue(lifecycleEvidence.lifecycle_reconcile_extra_ref_count)
    + numberValue(lifecycleEvidence.lifecycle_reconcile_stale_ref_count);
  const lifecycleOpenCount = lifecycleReconcileIssueCount > 0
    ? lifecycleReconcileIssueCount
    : lifecycleVerifiedOwnerEvidenceRecorded || lifecycleObservedRefCount > 0
      ? 0
      : 1;
  const lifecycleNextEvidenceAction =
    stringValue(lifecycleOwnerWorkOrder.next_required_owner_action)
    ?? 'memory_artifact_lifecycle_receipt_or_typed_blocker_ref';
  const lifecycleOwnerActionChecklist = [
    {
      requirement_id: 'memory_artifact_lifecycle_owner_followthrough',
      status:
        stringValue(lifecycleOwnerWorkOrder.status)
        ?? stringValue(lifecycleEvidence.readiness_status)
        ?? 'owner_receipt_or_typed_blocker_required_not_ready',
      observed_ref_count: lifecycleObservedRefCount,
      open_count: numberValue(lifecycleOwnerWorkOrder.open_count),
      next_required_owner_action: lifecycleNextEvidenceAction,
      accepted_refs_only_result_shapes: stringListValue(
        lifecycleOwnerWorkOrder.accepted_refs_only_result_shapes,
      ),
      typed_blocker_work_order_status:
        stringValue(lifecycleTypedBlockerWorkOrder.status),
      selected_payload_path:
        stringValue(lifecycleTypedBlockerWorkOrder.selected_payload_path),
      blocked_decision_count:
        numberValue(lifecycleTypedBlockerWorkOrder.blocked_decision_count),
      safe_decision_count:
        numberValue(lifecycleTypedBlockerWorkOrder.safe_decision_count),
      latest_typed_blocker_refs: lifecycleLatestTypedBlockerRefs,
      ledger_verified_receipt_refs: lifecycleLedgerVerifiedReceiptRefs,
      ledger_pending_verify_receipt_refs: lifecycleLedgerPendingVerifyReceiptRefs,
      ledger_typed_blocker_refs: lifecycleLedgerTypedBlockerRefs,
      ledger_owner_acceptance_refs: lifecycleLedgerOwnerAcceptanceRefs,
      owner_evidence_recorded:
        lifecycleVerifiedOwnerEvidenceRecorded || lifecycleObservedRefCount > 0,
      verified_refs_only_ledger_counts_as_memory_ready: false,
      verified_refs_only_ledger_counts_as_artifact_ready: false,
      verified_refs_only_ledger_counts_as_package_ready: false,
      verified_refs_only_ledger_counts_as_export_ready: false,
      closes_memory_or_artifact_ready: false,
      closes_production_ready: false,
      ready_claim_authorized: false,
      authority_boundary: record(lifecycleOwnerWorkOrder.authority_boundary),
    },
  ];
  const lifecycleMissingOwnerActionIds = lifecycleOpenCount > 0
    ? ['memory_artifact_lifecycle_owner_receipt_or_typed_blocker_required']
    : [];

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
      capabilityChecklist,
      capabilityMissingRequirementIds,
      capabilityEvidenceObservedRequirementIds,
      capabilityOpenRequirementCount: capabilityMissingRequirementIds.length,
      capabilityNextEvidenceAction: capabilityMissingRequirementIds.length > 0
        ? 'record_provider_capability_slo_evidence_or_blocker_for_missing_requirements'
        : 'capability_slo_requirements_observed_not_production_ready_claim',
      ownerAcceptanceEvidenceRecorded: providerOwnerAcceptanceEvidenceRecorded,
      ownerAcceptanceRefs: providerOwnerAcceptanceRefs,
      ownerAcceptanceRefCount: providerOwnerAcceptanceRefCount,
      ownerEvidenceMissingActionIds: providerOwnerAcceptanceEvidenceRecorded
        ? []
        : capabilityMissingRequirementIds,
      ownerEvidenceNextAction: providerOwnerAcceptanceEvidenceRecorded
        ? 'provider_owner_acceptance_observed_not_production_ready_claim'
        : capabilityMissingRequirementIds.length > 0
          ? 'record_provider_capability_slo_evidence_or_blocker_for_missing_requirements'
          : 'capability_slo_requirements_observed_not_production_ready_claim',
      evidence: providerEvidence,
      observedReceiptRefs: stringListValue(providerEvidence.receipt_refs),
      verifiedReceiptRefs: providerVerifiedReceiptRefs,
      pendingVerifyReceiptRefs: providerPendingVerifyReceiptRefs,
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
      ownerWorkOrder: lifecycleOwnerWorkOrder,
      typedBlockerWorkOrder: lifecycleTypedBlockerWorkOrder,
      ownerActionChecklist: lifecycleOwnerActionChecklist,
      missingOwnerActionIds: lifecycleMissingOwnerActionIds,
      nextEvidenceAction: lifecycleNextEvidenceAction,
      latestTypedBlockerRefs: lifecycleLatestTypedBlockerRefs,
      ledgerProjection: lifecycleLedgerProjection,
      ledgerVerifiedReceiptRefs: lifecycleLedgerVerifiedReceiptRefs,
      ledgerPendingVerifyReceiptRefs: lifecycleLedgerPendingVerifyReceiptRefs,
      ledgerTypedBlockerRefs: lifecycleLedgerTypedBlockerRefs,
      ledgerOwnerAcceptanceRefs: lifecycleLedgerOwnerAcceptanceRefs,
      verifiedOwnerEvidenceRecorded: lifecycleVerifiedOwnerEvidenceRecorded,
    },
  };
}

export function providerLongSoakExecutionRunbook() {
  return {
    surface_kind: 'opl_provider_long_soak_execution_runbook',
    owner: 'one-person-lab runtime owner',
    record_command:
      'opl runtime provider-long-soak-evidence record --payload \'{"long_soak_refs":["provider-long-soak:temporal/<window>"],"recovery_refs":["provider-recovery:temporal/<event>"],"dead_letter_refs":["provider-dead-letter:temporal/<queue>"],"provider_blocker_refs":["provider-blocker:temporal/<capability>"],"typed_blocker_refs":["typed-blocker:provider/<reason>"],"owner_acceptance_refs":["owner-acceptance:provider/<window>"]}\'',
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
      'owner_acceptance_ref',
    ],
    accepted_paths: [
      'long_soak_recovery_dead_letter_evidence_path',
      'provider_or_typed_blocker_path',
      'provider_owner_acceptance_path',
    ],
    readback_fields: [
      'provider_long_soak.open_evidence_count',
      'provider_long_soak.long_evidence_ready',
      'provider_long_soak.capability_status',
      'provider_long_soak.capability_missing_requirement_ids',
      'provider_long_soak.capability_next_evidence_action',
      'provider_long_soak.provider_completion_counts_as_production_ready',
      'foundry_agent_os_production_evidence_gate.owner_route_work_orders[lane=provider_long_soak]',
    ],
    stop_loss: [
      `if capability_status remains capability_slo_blocked, use capability_missing_requirement_ids to record specific long_soak/recovery/${QUEUE_PROJECTION_VOCABULARY.deadLetter}/provider_blocker/typed_blocker evidence instead of rerunning evidence accounting`,
      'if long_evidence_ready remains false after a claimed window and capability_missing_requirement_ids is not empty, preserve open_evidence_count=1 and route to runtime owner',
      'if verified provider_blocker_ref or typed_blocker_ref covers every capability owner action, close the owner-evidence work order but keep long_evidence_ready=false and production ready claims unauthorized',
      'if verified owner_acceptance_ref is observed, record owner follow-through but keep provider production ready claims unauthorized',
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

export function appReleaseUserPathExecutionRunbook() {
  return {
    surface_kind: 'opl_app_release_user_path_execution_runbook',
    owner: 'one-person-lab-app release owner',
    record_command:
      'opl runtime app-release-evidence record --payload \'{"release_package_refs":["release:pkg"],"screenshot_refs":["screenshot:first-run"],"reload_prompt_user_path_refs":["first-run:log"],"provider_state_linkage_refs":["provider:state"],"long_operator_evidence_refs":["operator:long-window"]}\'',
    typed_blocker_record_command:
      'opl runtime app-release-evidence record --payload \'{"typed_blocker_refs":["typed-blocker:app-release/<reason>"]}\'',
    owner_acceptance_record_command:
      'opl runtime app-release-evidence record --payload \'{"owner_acceptance_refs":["owner-acceptance:app-release/<cohort>"]}\'',
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
      'owner_acceptance_ref',
    ],
    accepted_paths: [
      'same_cohort_release_user_path_refs_path',
      'release_owner_typed_blocker_path',
      'release_owner_verdict_path',
      'release_owner_acceptance_path',
    ],
    readback_fields: [
      'app_release_user_path.open_gate_count',
      'app_release_user_path.production_user_path_ready',
      'app_release_user_path.release_ready_authorized',
      'app_release_user_path.next_required_delta',
      'app_release_user_path.release_owner_verdict_handoff.status',
      'app_release_user_path.owner_acceptance_ref_count',
      'foundry_agent_os_production_evidence_gate.owner_route_work_orders[lane=app_release_user_path]',
    ],
    stop_loss: [
      'if open_gate_count is zero but release_ready_authorized is false, stop recording OPL evidence and request release owner verdict or typed blocker',
      'if success refs and typed_blocker_refs are mixed in one payload, split the path before recording',
      'if cohort_guard selects a newer incomplete cohort, keep release_ready_authorized=false',
      'if verified owner_acceptance_ref is observed, record release owner follow-through but keep release-ready and production-ready claims unauthorized',
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
