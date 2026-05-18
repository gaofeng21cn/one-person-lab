import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import {
  listExternalEvidenceReceipts,
  type ExternalEvidenceReceipt,
} from './external-evidence-ledger.ts';
import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'external_evidence_receipt_ledger_refs_only',
    domain: 'truth_memory_artifact_quality_export_owner',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_export_verdict: false,
    can_execute_domain_action: false,
  };
}

function externalEvidenceReceiptsForRequest(domainId: string, requestId: string) {
  return listExternalEvidenceReceipts({
    domain_id: domainId,
    request_id: requestId,
  });
}

function summarizeExternalEvidenceReceipts(receipts: ExternalEvidenceReceipt[]) {
  return {
    receipt_count: receipts.length,
    verified_receipt_count: receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
    receipt_refs: uniqueStrings(receipts.map((receipt) => receipt.receipt_ref)),
    verified_receipt_refs: uniqueStrings(receipts
      .filter((receipt) => receipt.receipt_status === 'verified')
      .map((receipt) => receipt.receipt_ref)),
    evidence_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.evidence_refs)),
    domain_receipt_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.receipt_refs)),
    typed_blocker_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.typed_blocker_refs)),
    no_regression_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.no_regression_refs)),
    release_dist_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.release_dist_refs)),
    direct_hosted_parity_refs: uniqueStrings(receipts.flatMap((receipt) => (
      receipt.direct_hosted_parity_refs
    ))),
    owner_chain_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.owner_chain_refs)),
  };
}

export function buildDomainEvidenceRequestRefs(
  projects: DomainManifestCatalogEntry[],
  replacementCoverage: (primitiveId: string) => JsonRecord,
) {
  const resolvedProjects = projects.filter((project) => (
    project.status === 'resolved' && project.manifest
  ));
  const externalRequests = resolvedProjects.flatMap((project) => {
    const audit = project.manifest?.functional_privatization_audit;
    const pack = audit?.external_evidence_request_pack;
    if (!pack) {
      return [];
    }
    return pack.requests.map((request) => {
      const domainId = audit.target_domain_id ?? project.project_id;
      const receipts = externalEvidenceReceiptsForRequest(domainId, request.request_id);
      const receiptSummary = summarizeExternalEvidenceReceipts(receipts);
      const receiptStatus = receiptSummary.verified_receipt_count > 0
        ? 'verified'
        : receiptSummary.receipt_count > 0
          ? 'recorded'
          : 'missing';
      return {
        ref: request.source_pointer
          ?? `${pack.request_pack_id ?? 'external_evidence_request_pack'}:${request.request_id}`,
        role: 'external_evidence_request',
        domain_id: domainId,
        request_pack_id: pack.request_pack_id,
        request_id: request.request_id,
        request_status: request.status,
        external_receipt_status: receiptStatus,
        requested_from: pack.requested_from,
        required_evidence_refs: request.required_evidence_refs,
        required_return_shapes: request.required_return_shapes,
        required_receipt_shapes: request.required_receipt_shapes,
        forbidden_payload_classes: request.forbidden_payload_classes,
        accepted_payload_policy: request.accepted_payload_policy,
        source_field: audit.source_field,
        evidence_apply_command:
          `opl agents evidence apply --domain ${domainId} --request-id ${request.request_id}`,
        evidence_verify_command:
          `opl agents evidence apply --domain ${domainId} --request-id ${request.request_id} --mode verify`,
        observed_receipts: receipts,
        observed_receipt_summary: receiptSummary,
        can_execute: false,
      };
    });
  });
  const externalReceiptRefs = uniqueRefs(externalRequests.flatMap((request) =>
    request.observed_receipts.map((receipt) => ({
      ref: receipt.receipt_ref,
      role: 'external_evidence_receipt',
      domain_id: request.domain_id,
      request_id: request.request_id,
      request_pack_id: request.request_pack_id,
      receipt_status: receipt.receipt_status,
      evidence_refs: receipt.evidence_refs,
      domain_receipt_refs: receipt.receipt_refs,
      typed_blocker_refs: receipt.typed_blocker_refs,
      no_regression_refs: receipt.no_regression_refs,
      release_dist_refs: receipt.release_dist_refs,
      direct_hosted_parity_refs: receipt.direct_hosted_parity_refs,
      owner_chain_refs: receipt.owner_chain_refs,
      authority_boundary: refsOnlyAuthorityBoundary(),
      can_execute: false,
    }))
  ));
  const evidenceGates = resolvedProjects.flatMap((project) => {
    const audit = project.manifest?.functional_privatization_audit;
    const gates = audit?.evidence_gate_projection;
    if (!gates) {
      return [];
    }
    return gates.remaining_evidence_gate_ids.map((gateId) => ({
      ref: gateId,
      role: 'remaining_evidence_gate',
      domain_id: audit.target_domain_id ?? project.project_id,
      gate_status: 'open',
      source_refs: gates.source_refs,
      can_execute: false,
    }));
  });
  const replacementExpectations = resolvedProjects.flatMap((project) => {
    const audit = project.manifest?.functional_privatization_audit;
    return (audit?.opl_replacement_expectations ?? []).map((expectation) => ({
      ref: expectation.primitive_id,
      role: 'opl_replacement_expectation',
      domain_id: audit?.target_domain_id ?? project.project_id,
      owner: expectation.owner,
      state: expectation.state,
      opl_provides: expectation.opl_provides,
      domain_keeps: expectation.domain_keeps,
      implemented_in_domain: expectation.implemented_in_domain,
      source_pointer: expectation.source_pointer,
      coverage: replacementCoverage(expectation.primitive_id),
      can_execute: false,
    }));
  });
  const remainingBridgeModules = resolvedProjects.flatMap((project) => {
    const audit = project.manifest?.functional_privatization_audit;
    const gates = audit?.evidence_gate_projection;
    if (!gates) {
      return [];
    }
    return gates.remaining_bridge_module_ids.map((moduleId) => ({
      ref: moduleId,
      role: 'remaining_bridge_module',
      domain_id: audit.target_domain_id ?? project.project_id,
      module_status: 'allowed_refs_only_or_minimal_authority_until_evidence_gate_closes',
      source_refs: gates.source_refs,
      can_execute: false,
    }));
  });
  return {
    surface_kind: 'opl_app_drilldown_domain_evidence_request_refs',
    projection_policy: 'domain_declared_requests_refs_only_no_domain_truth_or_verdict',
    external_requests: uniqueRefs(externalRequests),
    external_receipts: externalReceiptRefs,
    evidence_gates: uniqueRefs(evidenceGates),
    replacement_expectations: uniqueRefs(replacementExpectations),
    remaining_bridge_modules: uniqueRefs(remainingBridgeModules),
    summary: {
      external_evidence_request_count: externalRequests.length,
      remaining_evidence_gate_count: evidenceGates.length,
      opl_replacement_expectation_count: replacementExpectations.length,
      remaining_bridge_module_count: remainingBridgeModules.length,
      replacement_surface_available_count: replacementExpectations.filter((expectation) =>
        isRecord(expectation.coverage)
        && expectation.coverage.coverage_status === 'opl_replacement_surface_available'
      ).length,
      open_request_count: externalRequests.filter((request) => (
        request.request_status !== 'received'
        && request.request_status !== 'complete'
        && request.request_status !== 'verified'
        && request.external_receipt_status !== 'verified'
      )).length,
      recorded_receipt_request_count: externalRequests.filter((request) =>
        request.external_receipt_status === 'recorded'
      ).length,
      verified_receipt_request_count: externalRequests.filter((request) =>
        request.external_receipt_status === 'verified'
      ).length,
      external_evidence_receipt_count: externalReceiptRefs.length,
      external_verified_receipt_count: externalReceiptRefs.filter((receipt) =>
        receipt.receipt_status === 'verified'
      ).length,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
