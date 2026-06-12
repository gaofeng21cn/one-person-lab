import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from '../framework-readiness-source-commands.ts';
import {
  booleanValue,
  numberValue,
  record,
  stringValue,
} from '../framework-readiness-values.ts';
import { buildAppReleaseUserPathEvidence } from '../runtime-tray-app-operator-drilldown-parts/app-release-user-path.ts';

export function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function unique(items: string[]) {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

export function appReleaseUserPathMaturity() {
  const evidence = record(buildAppReleaseUserPathEvidence({}));
  const releaseOwnerVerdictHandoff = record(evidence.release_owner_verdict_handoff);
  const productionUserPathReady = evidence.production_user_path_ready === true;
  const pendingVerifyCount = numberValue(evidence.pending_verify_receipt_ref_count);
  const typedBlockerCount = numberValue(evidence.typed_blocker_ref_count);
  const verifiedReceiptCount = numberValue(evidence.verified_ledger_receipt_ref_count);
  const releaseOwnerReceiptRefCount =
    stringListValue(releaseOwnerVerdictHandoff.observed_release_owner_receipt_refs).length;
  const releaseOwnerTypedBlockerRefCount =
    stringListValue(releaseOwnerVerdictHandoff.observed_typed_blocker_refs).length;
  const releaseOwnerVerdictObserved = releaseOwnerReceiptRefCount > 0;
  const verifiedReleaseOwnerTypedBlockerObserved =
    verifiedReceiptCount > 0 && pendingVerifyCount === 0 && releaseOwnerTypedBlockerRefCount > 0;
  const releaseOwnerVerdictStatus = releaseOwnerVerdictObserved
    ? 'release_owner_receipt_recorded_not_release_ready_claim'
    : verifiedReleaseOwnerTypedBlockerObserved
      ? 'release_owner_typed_blocker_recorded_not_release_ready_claim'
      : stringValue(releaseOwnerVerdictHandoff.status)
        ?? 'waiting_for_same_cohort_user_path_evidence_or_typed_blocker';
  const releaseOwnerVerdictClosureObserved =
    releaseOwnerVerdictObserved || verifiedReleaseOwnerTypedBlockerObserved;
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

export function providerLongSoakExecutionRunbook() {
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

export function appReleaseUserPathExecutionRunbook() {
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
      'app_release_user_path.release_owner_verdict_handoff.status',
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
