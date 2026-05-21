import type { DomainManifestCatalogEntry } from '../domain-manifest/types.ts';
import {
  compactFunctionalPrivatizationAuditEnvelope,
} from '../functional-privatization-envelope.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

type FunctionalPrivatizationSummaryRecord = {
  total_module_count?: unknown;
  opl_owned_replacement_count?: unknown;
  opl_hosted_surface_count?: unknown;
  opl_generated_surface_count?: unknown;
  declarative_pack_count?: unknown;
  minimal_authority_function_count?: unknown;
  refs_only_domain_adapter_count?: unknown;
  temporary_migration_bridge_count?: unknown;
  diagnostic_cleanup_path_count?: unknown;
  provenance_or_fixture_count?: unknown;
  domain_authority_count?: unknown;
  retire_tombstone_count?: unknown;
  default_watchlist_count?: unknown;
  default_hidden_cleared_count?: unknown;
  default_watchlist_module_ids?: unknown;
  active_private_generic_residue_count?: unknown;
  semantic_equivalence_review_count?: unknown;
  semantic_equivalence_review_module_ids?: unknown;
  standard_domain_pack_inventory_count?: unknown;
  standard_domain_pack_module_ids?: unknown;
  authority_function_inventory_count?: unknown;
  authority_function_module_ids?: unknown;
  private_platform_residue_inventory_count?: unknown;
  private_platform_residue_module_ids?: unknown;
  blocker_count?: unknown;
};

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

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'app_operator_drilldown_refs_only',
    domain: 'truth_memory_artifact_quality_export_owner',
    provider: 'runtime_slo_receipt_owner',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_submission_readiness: false,
    can_authorize_export_verdict: false,
    can_execute_domain_action: false,
    can_execute_provider_signal: false,
    provider_completion_is_domain_ready: false,
  };
}

export function functionalPrivatizationSummary(projects: DomainManifestCatalogEntry[]) {
  const summaries: FunctionalPrivatizationSummaryRecord[] = projects.flatMap((project) => {
    if (project.status !== 'resolved' || !project.manifest) {
      return [];
    }
    return [record(project.manifest.functional_privatization_audit.summary)];
  });
  const sum = (field: keyof FunctionalPrivatizationSummaryRecord) =>
    summaries.reduce((count, summary) => count + numberValue(summary[field]), 0);
  return {
    surface_kind: 'opl_app_drilldown_functional_privatization_audit_summary',
    projection_policy: 'summary_only_no_domain_code_mutation',
    resolved_domain_count: summaries.length,
    total_module_count: sum('total_module_count'),
    by_migration_class: {
      opl_owned_replacement_count: sum('opl_owned_replacement_count'),
      opl_hosted_surface_count: sum('opl_hosted_surface_count'),
      opl_generated_surface_count: sum('opl_generated_surface_count'),
      declarative_pack_count: sum('declarative_pack_count'),
      minimal_authority_function_count: sum('minimal_authority_function_count'),
      refs_only_domain_adapter_count: sum('refs_only_domain_adapter_count'),
      temporary_migration_bridge_count: sum('temporary_migration_bridge_count'),
      diagnostic_cleanup_path_count: sum('diagnostic_cleanup_path_count'),
      provenance_or_fixture_count: sum('provenance_or_fixture_count'),
      domain_authority_count: sum('domain_authority_count'),
      retire_tombstone_count: sum('retire_tombstone_count'),
    },
    default_watchlist_count: sum('default_watchlist_count'),
    default_hidden_cleared_count: sum('default_hidden_cleared_count'),
    default_watchlist_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.default_watchlist_module_ids)
    )),
    active_private_generic_residue_count: sum('active_private_generic_residue_count'),
    semantic_equivalence_review_count: sum('semantic_equivalence_review_count'),
    semantic_equivalence_review_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.semantic_equivalence_review_module_ids)
    )),
    standard_domain_pack_inventory_count: sum('standard_domain_pack_inventory_count'),
    standard_domain_pack_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.standard_domain_pack_module_ids)
    )),
    authority_function_inventory_count: sum('authority_function_inventory_count'),
    authority_function_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.authority_function_module_ids)
    )),
    private_platform_residue_inventory_count: sum('private_platform_residue_inventory_count'),
    private_platform_residue_module_ids: uniqueStrings(summaries.flatMap((summary) =>
      stringList(summary.private_platform_residue_module_ids)
    )),
    blocker_count: sum('blocker_count'),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function compactFunctionalPrivatizationModule(module: JsonRecord) {
  const moduleId = stringValue(module.module_id);
  const sourceRefs = stringList(module.current_surface_refs);
  const codePaths = stringList(module.code_paths);
  const activeCallers = stringList(module.active_callers);
  const expectedOplPrimitives = stringList(module.expected_opl_primitives);
  const retainedDomainAuthority = stringList(module.retained_domain_authority);
  const bridgeExitGate = record(module.bridge_exit_gate);
  return {
    ref: moduleId
      ? `/functional_privatization_audit/modules/${moduleId}`
      : '/functional_privatization_audit/modules/unknown',
    role: 'functional_privatization_module_ref',
    module_id: moduleId,
    source: stringValue(module.source),
    migration_class: stringValue(module.migration_class),
    standardization_layer: stringValue(module.standardization_layer),
    current_owner: stringValue(module.current_owner),
    opl_replacement_owner: stringValue(module.opl_replacement_owner),
    domain_allowed_role: stringValue(module.domain_allowed_role),
    active_caller_status: stringValue(module.active_caller_status),
    active_caller_allowed: module.active_caller_allowed === true,
    active_caller_count: activeCallers.length,
    active_callers: activeCallers,
    current_surface_refs: sourceRefs,
    expected_opl_primitives: expectedOplPrimitives,
    retained_domain_authority: retainedDomainAuthority,
    code_paths: codePaths,
    migration_action: stringValue(module.migration_action),
    retention_reason: stringValue(module.retention_reason),
    cannot_absorb_reason: stringValue(module.cannot_absorb_reason),
    tombstone_required: module.tombstone_required === true,
    blocker: stringValue(module.blocker),
    bridge_exit_gate: Object.keys(bridgeExitGate).length > 0
      ? {
          gate_id: stringValue(bridgeExitGate.gate_id),
          current_status: stringValue(bridgeExitGate.current_status),
          replacement_owner: stringValue(bridgeExitGate.replacement_owner),
          replacement_surface: stringValue(bridgeExitGate.replacement_surface),
          exit_gate_ref: stringValue(bridgeExitGate.exit_gate_ref),
          required_before_retire: stringList(bridgeExitGate.required_before_retire),
          can_delete_without_no_active_caller_proof:
            bridgeExitGate.can_delete_without_no_active_caller_proof === true,
          declares_replacement_complete:
            bridgeExitGate.declares_replacement_complete === true,
          opl_can_issue_owner_receipt: bridgeExitGate.opl_can_issue_owner_receipt === true,
        }
      : null,
    forbidden_generic_owner_flags: record(module.forbidden_generic_owner_flags),
    audit_visibility: stringValue(module.audit_visibility),
    audit_reason: stringValue(module.audit_reason),
    semantic_equivalence_status: stringValue(module.semantic_equivalence_status),
    semantic_equivalence_reason: stringValue(module.semantic_equivalence_reason),
  };
}

export function functionalPrivatizationAuditRefs(projects: DomainManifestCatalogEntry[]) {
  const domains = projects.flatMap((project) => {
    if (project.status !== 'resolved' || !project.manifest) {
      return [];
    }
    const audit = record(project.manifest.functional_privatization_audit);
    if (Object.keys(audit).length === 0) {
      return [];
    }
    const summary = record(audit.summary);
    const targetDomainId =
      stringValue(audit.target_domain_id)
      ?? stringValue(project.manifest.target_domain_id)
      ?? project.project_id;
    const domainId = project.project_id ?? targetDomainId;
    const modules = recordList(audit.modules).map(compactFunctionalPrivatizationModule);
    const privatePlatformResidueInventory =
      recordList(audit.private_platform_residue_inventory).map(compactFunctionalPrivatizationModule);
    const authorityFunctionInventory =
      recordList(audit.authority_function_inventory).map(compactFunctionalPrivatizationModule);
    const standardDomainPackInventory =
      recordList(audit.standard_domain_pack_inventory).map(compactFunctionalPrivatizationModule);
    return [{
      ref: `opl://agents/${domainId}/functional-privatization-audit`,
      role: 'functional_privatization_audit_domain_refs',
      domain_id: domainId,
      target_domain_id: targetDomainId,
      project_id: project.project_id,
      binding_id: project.binding_id,
      status: stringValue(audit.status) ?? project.status,
      envelope: compactFunctionalPrivatizationAuditEnvelope(audit.envelope),
      source_field: stringValue(audit.source_field),
      summary,
      required_opl_replacement_primitives:
        stringList(audit.required_opl_replacement_primitives),
      blockers: stringList(audit.blockers),
      module_refs: modules,
      private_platform_residue_inventory: privatePlatformResidueInventory,
      authority_function_inventory: authorityFunctionInventory,
      standard_domain_pack_inventory: standardDomainPackInventory,
      declared_authority_boundary: record(audit.authority_boundary),
      authority_boundary: refsOnlyAuthorityBoundary(),
    }];
  });
  const summary = functionalPrivatizationSummary(projects);
  return {
    surface_kind: 'opl_app_drilldown_functional_privatization_audit_refs',
    projection_policy:
      'refs_only_private_functional_surface_audit_no_domain_truth_memory_artifact_body_or_verdict',
    domains,
    summary: {
      resolved_domain_count: domains.length,
      envelope_version: 'opl-functional-privatization-audit-envelope.v1',
      total_module_count: summary.total_module_count,
      standard_domain_pack_inventory_count: summary.standard_domain_pack_inventory_count,
      authority_function_inventory_count: summary.authority_function_inventory_count,
      private_platform_residue_inventory_count: summary.private_platform_residue_inventory_count,
      active_private_generic_residue_count: summary.active_private_generic_residue_count,
      semantic_equivalence_review_count: summary.semantic_equivalence_review_count,
      default_watchlist_count: summary.default_watchlist_count,
      blocker_count: summary.blocker_count,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
