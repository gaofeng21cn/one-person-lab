type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function defaultCallerDeletionEvidenceRoutes(
  drilldown: JsonRecord,
  notAuthorizedClaims: string[],
) {
  const projection = record(drilldown.default_caller_deletion_evidence_refs);
  const domains = recordList(projection.domains);
  return domains.flatMap((domain) => {
    const domainId = stringValue(domain.domain_id) ?? stringValue(domain.project_id);
    return recordList(domain.deletion_evidence_worklists).flatMap((worklist) => {
      if (stringValue(worklist.status) !== 'domain_evidence_required') {
        return [];
      }
      const surfaceId = stringValue(worklist.surface_id) ?? 'unknown_surface';
      return stringList(worklist.missing_requirement_ids)
        .filter((requirementId) => [
          'domain_owner_receipt_or_typed_blocker',
          'no_active_caller_proof',
          'no_forbidden_write_proof',
          'tombstone_or_provenance_ref',
        ].includes(requirementId))
        .map((requirementId) => {
          const actionId =
            `default-caller-deletion:${domainId ?? 'domain'}:${surfaceId}:${requirementId}`;
          return {
            action_id: actionId,
            action_kind: `default_caller_deletion_${requirementId}_request`,
            owner: domainId ?? 'domain_repository_or_app_live_operator',
            domain_id: domainId,
            stage_id: null,
            route_status: 'domain_evidence_required',
            route_status_detail: requirementId,
            ref: stringValue(worklist.ref)
              ?? `opl agents default-callers --agent ${domainId ?? 'domain'}=<repo> --json`,
            freshness_refs: [
              '/runtime_tray_snapshot/app_operator_drilldown/default_caller_deletion_evidence_refs',
            ],
            expected_receipt_refs: [
              requirementId,
              ...stringList(record(record(worklist.requirements)[requirementId]).evidence_refs),
            ],
            open_reason:
              'OPL generated/hosted default caller replacement is structurally available, but physical domain private control-plane deletion still requires domain-owned evidence refs.',
            payload_requirement: requirementId === 'domain_owner_receipt_or_typed_blocker'
              ? 'domain_owner_receipt_ref_or_typed_blocker_ref'
              : requirementId,
            payload_owner: 'domain_repository_or_app_live_operator',
            route_requires_domain_or_app_payload: true,
            can_close_without_domain_or_app_payload: false,
            opl_generated_receipt_policy:
              'opl_may_project_requirement_but_must_not_sign_domain_receipt_or_authorize_physical_delete',
            execution_surface: 'opl runtime action execute',
            route_target_kind: 'domain_owned_delete_evidence_refs',
            not_authorized_claims: [...notAuthorizedClaims],
            retirement_guard: record(worklist.retirement_guard),
          };
        });
    });
  });
}
