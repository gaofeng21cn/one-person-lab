import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type PackageExportAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  route_impact: JsonRecord;
  artifact_refs: string[];
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function routeRefs(routeImpact: JsonRecord, listField: string, singleFields: string[]) {
  return uniqueStrings([
    ...stringList(routeImpact[listField]),
    ...singleFields.map((field) => optionalString(routeImpact[field])).filter((entry): entry is string => Boolean(entry)),
  ]);
}

function packageRefs(attempt: PackageExportAttempt) {
  return routeRefs(attempt.route_impact, 'package_refs', ['package_ref', 'delivery_package_ref']);
}

function exportRefs(attempt: PackageExportAttempt) {
  return routeRefs(attempt.route_impact, 'export_refs', ['export_ref', 'export_attempt_ref']);
}

function gapReportRefs(attempt: PackageExportAttempt) {
  return routeRefs(attempt.route_impact, 'gap_report_refs', ['gap_report_ref', 'readiness_gap_ref']);
}

function handoffRefs(attempt: PackageExportAttempt) {
  return routeRefs(attempt.route_impact, 'handoff_refs', ['handoff_ref', 'manual_submission_ref']);
}

export function buildAttemptPackageExportLifecycle(attempt: PackageExportAttempt) {
  const packages = packageRefs(attempt);
  const exports = exportRefs(attempt);
  const gapReports = gapReportRefs(attempt);
  const handoffs = handoffRefs(attempt);
  const externalSubmissionStatusRef = optionalString(attempt.route_impact.external_submission_status_ref)
    ?? optionalString(attempt.route_impact.portal_status_ref);
  const hasLifecycleEvidence = packages.length > 0
    || exports.length > 0
    || gapReports.length > 0
    || handoffs.length > 0
    || Boolean(externalSubmissionStatusRef);
  return {
    surface_kind: 'opl_package_export_lifecycle_projection',
    projection_scope: 'stage_attempt',
    shell_role: 'generic_package_export_lifecycle_shell',
    availability: hasLifecycleEvidence ? 'package_export_refs_observed' : 'no_package_export_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    package_refs: packages,
    export_refs: exports,
    gap_report_refs: gapReports,
    handoff_refs: handoffs,
    artifact_refs: attempt.artifact_refs,
    external_submission_status_ref: externalSubmissionStatusRef,
    summary: {
      package_ref_count: packages.length,
      export_ref_count: exports.length,
      gap_report_ref_count: gapReports.length,
      handoff_ref_count: handoffs.length,
      artifact_ref_count: attempt.artifact_refs.length,
      projection_policy: 'package_export_refs_only_no_readiness_or_export_authority',
    },
    authority_boundary: {
      opl: 'package_export_locator_gap_report_and_handoff_projection_only',
      domain: 'package_readiness_export_and_artifact_authority',
      can_authorize_package_readiness: false,
      can_authorize_export_verdict: false,
      can_mutate_artifact: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildWorkbenchPackageExportLifecycle(attempts: PackageExportAttempt[]) {
  const perAttempt = attempts.map(buildAttemptPackageExportLifecycle);
  const packages = uniqueStrings(perAttempt.flatMap((projection) => projection.package_refs));
  const exports = uniqueStrings(perAttempt.flatMap((projection) => projection.export_refs));
  const gapReports = uniqueStrings(perAttempt.flatMap((projection) => projection.gap_report_refs));
  const handoffs = uniqueStrings(perAttempt.flatMap((projection) => projection.handoff_refs));
  return {
    surface_kind: 'opl_package_export_lifecycle_projection',
    projection_scope: 'stage_attempt_workbench',
    shell_role: 'generic_package_export_lifecycle_shell',
    availability: perAttempt.some((projection) => projection.availability === 'package_export_refs_observed')
      ? 'package_export_refs_observed'
      : 'no_package_export_refs',
    attempts: perAttempt,
    package_refs: packages,
    export_refs: exports,
    gap_report_refs: gapReports,
    handoff_refs: handoffs,
    summary: {
      attempt_count: attempts.length,
      attempt_with_package_export_ref_count: perAttempt.filter((projection) =>
        projection.availability === 'package_export_refs_observed'
      ).length,
      package_ref_count: packages.length,
      export_ref_count: exports.length,
      gap_report_ref_count: gapReports.length,
      handoff_ref_count: handoffs.length,
      artifact_ref_count: uniqueStrings(perAttempt.flatMap((projection) => projection.artifact_refs)).length,
      projection_policy: 'package_export_refs_only_no_readiness_or_export_authority',
    },
    authority_boundary: {
      opl: 'package_export_locator_gap_report_and_handoff_projection_only',
      domain: 'package_readiness_export_and_artifact_authority',
      can_authorize_package_readiness: false,
      can_authorize_export_verdict: false,
      can_mutate_artifact: false,
      can_write_domain_truth: false,
    },
  };
}
