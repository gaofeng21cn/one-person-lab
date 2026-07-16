import type { JsonRecord } from '../../../kernel/json-record.ts';
import {
  countValue,
  record,
  recordList,
  stringList,
  stringValue,
} from '../../../kernel/json-record.ts';

type EvidenceWorklistFamilyScopeInput = {
  familyDefaults: boolean;
  defaultCallerReadinessReportBuilder?: (args: string[]) => JsonRecord;
};

function hasDefaultCallerProjection(drilldown: JsonRecord) {
  return drilldown.default_caller_deletion_evidence_refs !== undefined;
}

function compactDefaultCallerReadinessWorklist(worklist: JsonRecord) {
  const requirementIds = stringList(worklist.requirement_ids);
  const missingRequirementIds = requirementIds.filter((requirementId) =>
    stringValue(record(worklist[requirementId]).status) !== 'observed'
  );
  return {
    ref: stringValue(worklist.ref),
    surface_kind: stringValue(worklist.surface_kind),
    surface_id: stringValue(worklist.surface_id),
    status: stringValue(worklist.status),
    requirement_ids: requirementIds,
    missing_requirement_ids: missingRequirementIds,
    requirements: Object.fromEntries(requirementIds.map((requirementId) => [
      requirementId,
      {
        status: stringValue(record(worklist[requirementId]).status),
        evidence_refs: stringList(record(worklist[requirementId]).evidence_refs),
      },
    ])),
    retirement_guard: record(worklist.retirement_guard),
  };
}

function familyDefaultCallerDeletionEvidenceDomains(input: EvidenceWorklistFamilyScopeInput) {
  if (input.familyDefaults !== true) {
    return [];
  }
  if (!input.defaultCallerReadinessReportBuilder) {
    return [];
  }
  const readModel = input.defaultCallerReadinessReportBuilder(['--family-defaults']);
  const report = record(readModel.agent_default_caller_readiness);
  return recordList(report.reports).map((repoReport) => {
    const summary = record(repoReport.summary);
    const domainId = stringValue(repoReport.domain_id)
      ?? stringValue(repoReport.requested_agent_id)
      ?? stringValue(repoReport.repo_dir)
      ?? 'domain';
    const worklists = recordList(repoReport.deletion_evidence_worklists)
      .map(compactDefaultCallerReadinessWorklist);
    const missingCount = (requirementId: string) => worklists.filter((worklist) =>
      stringList(worklist.missing_requirement_ids).includes(requirementId)
    ).length;
    return {
      ref: `opl://agents/${domainId}/default-caller-deletion-evidence`,
      role: 'default_caller_deletion_evidence_domain_refs',
      domain_id: domainId,
      project_id: domainId,
      workspace_path: stringValue(repoReport.repo_dir),
      status: stringValue(repoReport.status),
      source: 'agents_default_callers_family_defaults_repo_projection',
      source_command: 'opl agents default-callers --family-defaults --json',
      generated_interface_status: stringValue(repoReport.generated_interface_status),
      active_caller_cutover_proof_status:
        stringValue(repoReport.active_caller_cutover_proof_status),
      active_caller_target_proof_status:
        stringValue(repoReport.active_caller_target_proof_status),
      generated_wrapper_bundle_status:
        stringValue(repoReport.generated_wrapper_bundle_status),
      deletion_evidence_worklists: worklists,
      summary: {
        deletion_evidence_worklist_count:
          countValue(summary.deletion_evidence_worklist_count) || worklists.length,
        ready_domain_evidence_worklist_count:
          stringValue(repoReport.status) === 'ready_domain_evidence_required'
            ? worklists.length
            : 0,
        open_deletion_evidence_requirement_count:
          worklists.reduce((total, worklist) =>
            total + stringList(worklist.missing_requirement_ids).length, 0),
        missing_domain_owner_receipt_or_typed_blocker_count:
          missingCount('domain_owner_receipt_or_typed_blocker'),
        missing_no_active_caller_proof_count:
          missingCount('no_active_caller_proof'),
        missing_no_forbidden_write_proof_count:
          missingCount('no_forbidden_write_proof'),
        missing_tombstone_or_provenance_ref_count:
          missingCount('tombstone_or_provenance_ref'),
        physical_delete_authorized: false,
        default_caller_delete_ready: false,
      },
    };
  });
}

export function familyDefaultCallerFallbackDomains(
  input: EvidenceWorklistFamilyScopeInput,
  drilldown: JsonRecord,
) {
  if (hasDefaultCallerProjection(drilldown)) return [];
  return familyDefaultCallerDeletionEvidenceDomains(input);
}
