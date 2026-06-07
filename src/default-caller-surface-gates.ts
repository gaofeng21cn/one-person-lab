import {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from './default-caller-retirement-guard.ts';

export type JsonRecord = Record<string, unknown>;

const DEFAULT_CALLER_TARGET_KINDS = [
  'opl_generated_surface',
  'opl_hosted_surface',
  'domain_handler_target',
  'refs_only_domain_adapter_target',
] as const;

export const DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS = [
  'domain_repo_physical_delete_authorization',
  'default_caller_delete_ready',
  'domain_ready',
  'production_ready',
  'quality_verdict',
  'artifact_authority',
] as const;

export const DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS = [
  'generated_default_caller_readiness_is_not_delete_authority',
  'docs_foldback_is_not_delete_authority',
  'delete_gate_read_model_is_not_delete_authority',
  'physical_delete_requires_domain_owner_delete_keep_or_blocker_decision_after_structural_evidence',
] as const;

const DEFAULT_CALLER_CANONICAL_TARGET_IDS: Record<string, string[]> = {
  product_entry: ['product_entry', 'product_entry_manifest'],
  product_status: ['product_status', 'status_read_model'],
  product_session: ['product_session', 'product_entry_manifest', 'status_read_model'],
  domain_handler: ['domain_action_adapter_export_dispatch', 'domain_action_adapter', 'domain_handler'],
  workbench: ['workbench', 'workbench_drilldown'],
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function readRefsFromFields(source: JsonRecord | null | undefined, fields: string[]) {
  if (!isRecord(source)) {
    return [];
  }
  return unique(fields.flatMap((field) => {
    const value = source[field];
    if (Array.isArray(value)) {
      return stringList(value);
    }
    const single = optionalString(value);
    return single ? [single] : [];
  }));
}

function defaultCallerTargetAllowed(targetKind: string) {
  return (DEFAULT_CALLER_TARGET_KINDS as readonly string[]).includes(targetKind);
}

function noActiveCallerProofRefs(input: {
  ready: boolean;
  surfaceId: string;
  canonicalTargetIds: string[];
  targetSurfaceId: string | null;
  activeCallerProofStatus: string | null;
  activeCallerTargetKind: string | null;
  observedNoActiveCallerRefs: string[];
}) {
  if (input.observedNoActiveCallerRefs.length > 0) {
    return input.observedNoActiveCallerRefs;
  }
  if (
    !input.ready
    || !input.activeCallerProofStatus
    || input.activeCallerProofStatus.startsWith('blocked')
    || !input.activeCallerTargetKind
    || !defaultCallerTargetAllowed(input.activeCallerTargetKind)
  ) {
    return [];
  }
  const targetRefs = input.targetSurfaceId
    ? [`active_caller_target_proof.surface_targets.${input.targetSurfaceId}`]
    : input.canonicalTargetIds.map((targetId) => `active_caller_target_proof.surface_targets.${targetId}`);
  return unique([
    `generated_wrapper_bundle.descriptor_scope.${input.surfaceId}`,
    ...targetRefs,
  ]);
}

export function generatedSurfaceTargetAllowed(targetKind: string) {
  return defaultCallerTargetAllowed(targetKind);
}

export function defaultCallerSurfaceGates(bundle: JsonRecord) {
  const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : {};
  const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : {};
  const targetBySurface = new Map(
    recordList(targetProof.surface_targets).map((target) => [
      optionalString(target.surface_id) ?? '',
      target,
    ]),
  );
  return recordList(wrapperBundle.descriptor_scope).map((scope) => {
    const surfaceId = optionalString(scope.surface_id) ?? 'unknown_surface';
    const canonicalTargetIds = DEFAULT_CALLER_CANONICAL_TARGET_IDS[surfaceId] ?? [surfaceId];
    const candidateTargets = canonicalTargetIds
      .map((targetId) => targetBySurface.get(targetId))
      .filter((candidate): candidate is JsonRecord => isRecord(candidate));
    const readyTargets = candidateTargets.filter((candidate) => (
      !optionalString(candidate.proof_status)?.startsWith('blocked')
      && defaultCallerTargetAllowed(optionalString(candidate.target_kind) ?? '')
    ));
    const target = readyTargets.find((candidate) => (
      optionalString(candidate.active_caller_module_id)
      || stringList(candidate.current_surface_refs).length > 0
      || isRecord(candidate.bridge_exit_gate)
    ))
      ?? readyTargets[0]
      ?? candidateTargets[0];
    const activeCallerProofStatus =
      optionalString(scope.active_caller_proof_status)
      ?? optionalString(target?.proof_status);
    const activeCallerTargetKind =
      optionalString(scope.active_caller_target_kind)
      ?? optionalString(target?.target_kind);
    const activeCallerModuleId =
      optionalString(scope.active_caller_module_id)
      ?? optionalString(target?.active_caller_module_id);
    const activeCallerTargetSurfaceId = optionalString(target?.surface_id);
    const blockers = stringList(scope.blockers);
    const descriptorStatus = optionalString(scope.descriptor_status);
    const ready = optionalString(scope.status) === 'ready'
      && blockers.length === 0
      && Boolean(activeCallerProofStatus)
      && !activeCallerProofStatus?.startsWith('blocked')
      && Boolean(activeCallerTargetKind)
      && defaultCallerTargetAllowed(activeCallerTargetKind ?? '');
    const bridgeExitGate = isRecord(target?.bridge_exit_gate) ? target.bridge_exit_gate : null;
    const observedTombstoneOrProvenanceRefs = unique([
      ...readRefsFromFields(bridgeExitGate, [
        'tombstone_refs',
        'provenance_refs',
        'history_refs',
        'source_refs',
      ]),
      ...stringList(target?.current_surface_refs),
    ]);
    const observedDomainReceiptOrBlockerRefs = readRefsFromFields(bridgeExitGate, [
      'owner_receipt_refs',
      'owner_receipt_ref',
      'domain_owner_receipt_refs',
      'domain_owner_receipt_ref',
      'typed_blocker_refs',
      'typed_blocker_ref',
    ]);
    const observedNoActiveCallerRefs = readRefsFromFields(bridgeExitGate, [
      'no_active_caller_refs',
      'no_active_caller_ref',
      'no_active_default_caller_refs',
      'no_active_default_caller_ref',
    ]);
    const observedNoActiveCallerProofRefs = noActiveCallerProofRefs({
      ready,
      surfaceId,
      canonicalTargetIds,
      targetSurfaceId: activeCallerTargetSurfaceId,
      activeCallerProofStatus,
      activeCallerTargetKind,
      observedNoActiveCallerRefs,
    });
    const observedNoForbiddenWriteRefs = readRefsFromFields(bridgeExitGate, [
      'no_forbidden_write_refs',
      'no_forbidden_write_ref',
      'no_forbidden_write_evidence_refs',
      'no_forbidden_write_evidence_ref',
    ]);
    const deleteOrKeepPrerequisitesObserved =
      ready
      && observedNoActiveCallerProofRefs.length > 0
      && observedNoForbiddenWriteRefs.length > 0
      && observedTombstoneOrProvenanceRefs.length > 0;
    const allDeletionEvidenceRequirementsObserved =
      deleteOrKeepPrerequisitesObserved
      && observedDomainReceiptOrBlockerRefs.length > 0;
    const deletionEvidenceWorklist = {
      surface_kind: 'opl_default_caller_surface_deletion_evidence_worklist',
      surface_id: surfaceId,
      status: ready ? 'domain_evidence_required' : 'blocked_until_replacement_ready',
      requirement_ids: DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
      replacement_parity: {
        status: ready ? 'observed' : 'blocked',
        source_refs: [
          `generated_wrapper_bundle.descriptor_scope.${surfaceId}`,
          ...canonicalTargetIds.map((targetId) => `active_caller_target_proof.surface_targets.${targetId}`),
        ],
      },
      active_caller_cutover: {
        status: ready ? 'observed' : 'blocked',
        proof_status: activeCallerProofStatus,
        target_kind: activeCallerTargetKind,
        active_caller_module_id: activeCallerModuleId,
      },
      no_active_caller_proof: {
        status: observedNoActiveCallerProofRefs.length > 0 ? 'observed' : 'required_before_physical_delete',
        evidence_refs: observedNoActiveCallerProofRefs,
        observed_from_active_caller_target_proof:
          observedNoActiveCallerRefs.length === 0 && observedNoActiveCallerProofRefs.length > 0,
        active_caller_cutover_status: ready ? 'observed' : 'blocked',
        active_caller_proof_status: activeCallerProofStatus,
        active_caller_module_id: activeCallerModuleId,
        active_caller_target_kind: activeCallerTargetKind,
        active_caller_target_surface_id: activeCallerTargetSurfaceId,
      },
      domain_owner_receipt_or_typed_blocker: {
        status: observedDomainReceiptOrBlockerRefs.length > 0 ? 'observed' : 'required_from_domain_owner',
        accepted_result_shapes: [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES],
        evidence_refs: observedDomainReceiptOrBlockerRefs,
      },
      no_forbidden_write_proof: {
        status: observedNoForbiddenWriteRefs.length > 0 ? 'observed' : 'required_before_physical_delete',
        evidence_refs: observedNoForbiddenWriteRefs,
      },
      tombstone_or_provenance_ref: {
        status: observedTombstoneOrProvenanceRefs.length > 0 ? 'observed' : 'required_before_physical_delete',
        evidence_refs: observedTombstoneOrProvenanceRefs,
      },
      bridge_exit_gate: bridgeExitGate,
      retention_reason: optionalString(target?.retention_reason),
      cannot_absorb_reason: optionalString(target?.cannot_absorb_reason),
      audit_visibility: optionalString(target?.audit_visibility),
      audit_reason: optionalString(target?.audit_reason),
      semantic_equivalence_status: optionalString(target?.semantic_equivalence_status),
      semantic_equivalence_reason: optionalString(target?.semantic_equivalence_reason),
      physical_delete_authorized: false,
      default_caller_delete_ready: false,
      generated_default_caller_readiness_can_authorize_physical_delete: false,
      physical_delete_blocked_by: [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS],
      worklist_item_is_completion_claim: false,
      physical_delete_authorization_status: 'not_authorized_by_opl_projection',
      delete_or_keep_prerequisites_observed: deleteOrKeepPrerequisitesObserved,
      owner_decision_required_after_prerequisites_observed: deleteOrKeepPrerequisitesObserved,
      next_required_owner_action: deleteOrKeepPrerequisitesObserved
        ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
        : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
      accepted_refs_only_result_shapes: deleteOrKeepPrerequisitesObserved
        ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
        : ['typed_blocker_ref'],
      owner_decision_required_after_all_refs_observed: allDeletionEvidenceRequirementsObserved,
      not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
      retirement_guard: {
        target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        physical_delete_authorized: false,
        refs_only_receipt_can_authorize_physical_delete: false,
      },
      authority_boundary: {
        worklist_can_write_domain_truth: false,
        worklist_can_sign_domain_owner_receipt: false,
        worklist_can_authorize_quality_or_export: false,
        worklist_can_mutate_domain_artifacts: false,
        worklist_can_authorize_domain_repo_physical_delete: false,
      },
    };
    return {
      surface_id: surfaceId,
      descriptor_kind: optionalString(scope.descriptor_kind),
      owner: 'one-person-lab',
      generated_surface_owner: optionalString(scope.generated_surface_owner) ?? 'one-person-lab',
      status: ready ? 'ready_for_default_caller_cutover' : 'blocked',
      descriptor_status: descriptorStatus,
      active_caller_target_kind: activeCallerTargetKind,
      active_caller_proof_status: activeCallerProofStatus,
      active_caller_module_id: activeCallerModuleId,
      canonical_target_surface_ids: canonicalTargetIds,
      blockers,
      domain_repo_role: optionalString(scope.domain_repo_role),
      domain_repo_can_own_generated_surface: false,
      default_caller_owner: 'one-person-lab',
      deletion_evidence_worklist: deletionEvidenceWorklist,
    };
  });
}
