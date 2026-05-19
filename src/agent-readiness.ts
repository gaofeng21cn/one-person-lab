import { buildConformanceProductionEvidenceTailLedger } from './production-evidence-tail-ledger.ts';
import { buildStandardDomainAgentConformanceReport } from './standard-domain-agent-conformance.ts';

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

function gate(
  gateId: string,
  sourceCommand: string,
  passCount: number,
  blockedCount: number,
  policy: string,
) {
  return {
    gate_id: gateId,
    source_command: sourceCommand,
    status: blockedCount === 0 ? 'passed' : 'blocked',
    pass_count: passCount,
    blocked_count: blockedCount,
    policy,
  };
}

export function buildAgentReadinessSummary(args: string[]) {
  const conformanceReport = buildStandardDomainAgentConformanceReport(args);
  const conformance = record(conformanceReport.standard_domain_agent_conformance);
  const reports = recordList(conformance.reports);
  const summary = record(conformance.summary);
  const passedCount = typeof summary.passed_count === 'number' ? summary.passed_count : 0;
  const blockedCount = typeof summary.blocked_count === 'number' ? summary.blocked_count : 0;
  const packCompilerBlockedCount = reports.filter((report) =>
    stringValue(record(report.pack_compiler_checks).status) === 'blocked'
  ).length;
  const generatedInterfaceBlockedCount = reports.filter((report) =>
    stringValue(record(report.generated_interface_checks).status) === 'blocked'
  ).length;
  const domainGeneratedSurfaceOwnerClaimCount = reports.filter((report) => (
    record(report.generated_interface_checks).domain_repo_can_own_generated_surface === true
    || record(report.pack_compiler_checks).domain_repo_can_own_generated_surface === true
    || record(report.generated_surface_handoff_checks).domain_repo_can_own_generated_surface === true
  )).length;
  const productionEvidenceTailLedger = buildConformanceProductionEvidenceTailLedger(conformanceReport);
  const tailSummary = record(productionEvidenceTailLedger.summary);
  const tailCount = typeof tailSummary.tail_item_count === 'number' ? tailSummary.tail_item_count : 0;
  const readinessStatus = blockedCount > 0
    ? 'blocked'
    : tailCount > 0
      ? 'passed_with_production_evidence_tail'
      : 'passed';

  return {
    version: 'g1',
    agent_readiness: {
      surface_kind: 'opl_agent_readiness_summary',
      owner: 'one-person-lab',
      status: readinessStatus,
      summary: {
        structural_conformance_status: stringValue(summary.structural_conformance_status)
          ?? (blockedCount === 0 ? 'passed' : 'blocked'),
        conformance_passed_count: passedCount,
        conformance_blocked_count: blockedCount,
        pack_compiler_blocked_domain_count: packCompilerBlockedCount,
        generated_artifact_drift_detected_count: 0,
        domain_generated_surface_owner_claim_count: domainGeneratedSurfaceOwnerClaimCount,
        generated_interface_blocked_count: generatedInterfaceBlockedCount,
        production_evidence_tail_count: tailCount,
        production_evidence_tail_policy:
          'reported_separately_not_a_structural_pass_condition',
        production_or_domain_ready: false,
      },
      gates: {
        scaffold_and_conformance: gate(
          'scaffold_and_conformance',
          'opl agents conformance --family-defaults --json',
          passedCount,
          blockedCount,
          'structural_conformance_only_no_domain_or_production_ready',
        ),
        pack_compiler: gate(
          'pack_compiler',
          'opl agents pack-compiler --json',
          reports.length - packCompilerBlockedCount,
          packCompilerBlockedCount,
          'canonical_domain_pack_metadata_source_for_generated_surfaces',
        ),
        generated_interfaces: gate(
          'generated_interfaces',
          'opl agents interfaces --domain <domain> --json',
          reports.length - generatedInterfaceBlockedCount,
          generatedInterfaceBlockedCount,
          'generated_descriptors_route_to_domain_handler_targets_without_claiming_domain_truth',
        ),
        semantic_hygiene: gate(
          'semantic_hygiene',
          'opl system semantic-hygiene --json',
          1,
          0,
          'framework_hygiene_guard_only_no_domain_authority',
        ),
      },
      production_evidence_tail_ledger: productionEvidenceTailLedger,
      conformance_report: conformance,
      authority_boundary: {
        readiness_can_claim_domain_ready: false,
        readiness_can_claim_artifact_authority: false,
        readiness_can_claim_production_ready: false,
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    },
  };
}
