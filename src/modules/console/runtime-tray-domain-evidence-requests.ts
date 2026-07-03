import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import {
  listExternalEvidenceReceipts,
  type ExternalEvidenceReceipt,
} from '../ledger/index.ts';
import {
  classifyExternalEvidenceReceiptRefs,
} from '../ledger/index.ts';
import { canonicalOwnerId } from '../ledger/index.ts';
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

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function domainIdCandidates(...values: Array<string | null | undefined>) {
  const candidates = uniqueStrings(values.flatMap((value) => {
    const text = stringValue(value);
    if (!text) {
      return [];
    }
    const key = text.toLowerCase().replace(/[\s_]+/g, '-');
    const compact = key.replace(/-/g, '');
    const canonical = canonicalOwnerId(text);
    const canonicalKey = canonical.toLowerCase().replace(/[\s_]+/g, '-');
    const canonicalCompact = canonicalKey.replace(/-/g, '');
    return [
      text,
      key,
      compact,
      key.replace(/-/g, '_'),
      canonical,
      canonicalKey,
      canonicalCompact,
      canonicalKey.replace(/-/g, '_'),
    ];
  }));
  return candidates;
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

function externalEvidenceReceiptsForDomain(domainId: string) {
  return listExternalEvidenceReceipts({
    domain_id: domainId,
  });
}

function externalEvidenceReceiptsForDomainCandidates(domainIds: string[]) {
  const seen = new Set<string>();
  return domainIds.flatMap(externalEvidenceReceiptsForDomain).filter((receipt) => {
    const key = `${receipt.domain_id}:${receipt.request_id}:${receipt.receipt_ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedicatedRuntimeReceiptRequestId(requestId: string) {
  return requestId.startsWith('domain_dispatch:')
    || requestId.startsWith('stage_production_evidence:');
}

function hasStandaloneExternalReceiptRefs(receipt: ExternalEvidenceReceipt) {
  return receipt.memory_writeback_receipt_refs.length > 0
    || receipt.artifact_mutation_receipt_refs.length > 0
    || receipt.package_lifecycle_receipt_refs.length > 0
    || receipt.lifecycle_receipt_refs.length > 0
    || receipt.restore_proof_refs.length > 0
    || receipt.no_regression_refs.length > 0;
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
    memory_writeback_receipt_refs: uniqueStrings(receipts.flatMap((receipt) => (
      receipt.memory_writeback_receipt_refs
    ))),
    artifact_mutation_receipt_refs: uniqueStrings(receipts.flatMap((receipt) => (
      receipt.artifact_mutation_receipt_refs
    ))),
    package_lifecycle_receipt_refs: uniqueStrings(receipts.flatMap((receipt) => (
      receipt.package_lifecycle_receipt_refs
    ))),
    lifecycle_receipt_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.lifecycle_receipt_refs)),
    restore_proof_refs: uniqueStrings(receipts.flatMap((receipt) => receipt.restore_proof_refs)),
  };
}

function classifyReceipt(receipt: ExternalEvidenceReceipt, domainWorkspacePath: string | null, requestId: string) {
  return classifyExternalEvidenceReceiptRefs({
    receipt: receipt as unknown as JsonRecord,
    domainWorkspacePath,
    requestId,
  });
}

function externalReceiptRef(input: {
  receipt: ExternalEvidenceReceipt;
  role: 'external_evidence_receipt' | 'evidence_gate_receipt' | 'standalone_external_evidence_receipt';
  domainId: string;
  domainWorkspacePath: string | null;
  requestId: string;
  requestPackId?: string | null;
  gateId?: string | null;
}) {
  const classification = classifyReceipt(
    input.receipt,
    input.domainWorkspacePath,
    input.requestId,
  );
  return {
    ref: input.receipt.receipt_ref,
    role: input.role,
    domain_id: input.domainId,
    domain_workspace_path: input.domainWorkspacePath,
    ...(input.gateId ? { gate_id: input.gateId } : {}),
    request_id: input.requestId,
    request_pack_id: input.requestPackId ?? input.receipt.request_pack_id,
    receipt_status: input.receipt.receipt_status,
    evidence_refs: input.receipt.evidence_refs,
    domain_receipt_refs: classification.receipt_refs,
    typed_blocker_refs: classification.typed_blocker_refs,
    reclassified_typed_blocker_refs: classification.reclassified_typed_blocker_refs,
    receipt_semantics: input.receipt.receipt_semantics ?? classification.receipt_semantics,
    no_regression_refs: input.receipt.no_regression_refs,
    release_dist_refs: input.receipt.release_dist_refs,
    direct_hosted_parity_refs: input.receipt.direct_hosted_parity_refs,
    owner_chain_refs: input.receipt.owner_chain_refs,
    memory_writeback_receipt_refs: input.receipt.memory_writeback_receipt_refs,
    artifact_mutation_receipt_refs: input.receipt.artifact_mutation_receipt_refs,
    package_lifecycle_receipt_refs: input.receipt.package_lifecycle_receipt_refs,
    lifecycle_receipt_refs: input.receipt.lifecycle_receipt_refs,
    restore_proof_refs: input.receipt.restore_proof_refs,
    authority_boundary: refsOnlyAuthorityBoundary(),
    can_execute: false,
  };
}

function ledgerReceiptKey(receipt: {
  ref: string;
  domain_id?: string | null;
  request_id?: string | null;
}) {
  return `${receipt.domain_id ?? ''}:${receipt.request_id ?? ''}:${receipt.ref}`;
}

function functionalAuditModules(audit: JsonRecord | null | undefined) {
  return [
    ...recordList(audit?.modules),
    ...recordList(isRecord(audit?.privatized_functional_module_audit)
      ? audit.privatized_functional_module_audit.modules
      : []),
  ];
}

function bridgeModuleRecord(audit: JsonRecord | null | undefined, moduleId: string) {
  return functionalAuditModules(audit).find((module) =>
    stringValue(module.module_id) === moduleId
  ) ?? {};
}

function bridgeModuleAuthorityBoundary(module: JsonRecord, bridgeExitGate: JsonRecord) {
  const flags = isRecord(module.forbidden_generic_owner_flags)
    ? module.forbidden_generic_owner_flags
    : {};
  return {
    ...refsOnlyAuthorityBoundary(),
    domain_bridge_can_own_replacement_runtime: bridgeExitGate.rca_can_own_replacement_runtime === true,
    replacement_owner: stringValue(bridgeExitGate.replacement_owner),
    replacement_surface: stringValue(bridgeExitGate.replacement_surface),
    forbidden_generic_owner_flags: flags,
    domain_may_keep_only_retained_authority_refs: true,
    opl_can_issue_domain_owner_receipt: bridgeExitGate.opl_can_issue_owner_receipt === true,
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
        domain_workspace_path: project.workspace_path,
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
    request.observed_receipts.map((receipt) =>
      externalReceiptRef({
        receipt,
        role: 'external_evidence_receipt',
        domainId: request.domain_id,
        domainWorkspacePath: request.domain_workspace_path,
        requestId: request.request_id,
        requestPackId: request.request_pack_id,
      })
    )
  ));
  const evidenceGates = resolvedProjects.flatMap((project) => {
    const audit = project.manifest?.functional_privatization_audit;
    const gates = audit?.evidence_gate_projection;
    if (!gates) {
      return [];
    }
    return gates.remaining_evidence_gate_ids.map((gateId) => {
      const domainId = audit.target_domain_id ?? project.project_id;
      const receipts = externalEvidenceReceiptsForRequest(domainId, gateId);
      const receiptSummary = summarizeExternalEvidenceReceipts(receipts);
      const receiptStatus = receiptSummary.verified_receipt_count > 0
        ? 'verified'
        : receiptSummary.receipt_count > 0
          ? 'recorded'
          : 'missing';
      return {
        ref: gateId,
        role: 'remaining_evidence_gate',
        domain_id: domainId,
        gate_id: gateId,
        request_id: gateId,
        request_pack_id: `${domainId}.evidence_gate_projection`,
        gate_status: receiptStatus === 'verified' ? 'verified' : 'open',
        external_receipt_status: receiptStatus,
        source_refs: gates.source_refs,
        domain_workspace_path: project.workspace_path,
        evidence_apply_command:
          `opl agents evidence apply --domain ${domainId} --request-id ${gateId}`,
        evidence_verify_command:
          `opl agents evidence apply --domain ${domainId} --request-id ${gateId} --mode verify`,
        observed_receipts: receipts,
        observed_receipt_summary: receiptSummary,
        can_execute: false,
      };
    });
  });
  const remainingEvidenceGates = evidenceGates.filter((gate) =>
    gate.external_receipt_status !== 'verified'
  );
  const evidenceGateReceiptRefs = uniqueRefs(evidenceGates.flatMap((gate) =>
    gate.observed_receipts.map((receipt) =>
      externalReceiptRef({
        receipt,
        role: 'evidence_gate_receipt',
        domainId: gate.domain_id,
        domainWorkspacePath: gate.domain_workspace_path,
        requestId: gate.request_id,
        requestPackId: gate.request_pack_id,
        gateId: gate.gate_id,
      })
    )
  ));
  const projectedReceiptRefs = new Set([
    ...externalReceiptRefs.map(ledgerReceiptKey),
    ...evidenceGateReceiptRefs.map(ledgerReceiptKey),
  ]);
  const standaloneExternalReceiptRefs = uniqueRefs(resolvedProjects.flatMap((project) => {
    const audit = project.manifest?.functional_privatization_audit;
    const domainId = audit?.target_domain_id ?? project.project_id;
    const domainIds = domainIdCandidates(domainId, project.project_id, project.project);
    return externalEvidenceReceiptsForDomainCandidates(domainIds)
      .filter((receipt) =>
        hasStandaloneExternalReceiptRefs(receipt)
        && !dedicatedRuntimeReceiptRequestId(receipt.request_id)
      )
      .filter((receipt) => !projectedReceiptRefs.has(ledgerReceiptKey({
        ref: receipt.receipt_ref,
        domain_id: receipt.domain_id,
        request_id: receipt.request_id,
      })))
      .map((receipt) => externalReceiptRef({
        receipt,
        role: 'standalone_external_evidence_receipt',
        domainId: receipt.domain_id,
        domainWorkspacePath: project.workspace_path,
        requestId: receipt.request_id,
        requestPackId: receipt.request_pack_id,
      }));
  }));
  const allExternalReceiptRefs = uniqueRefs([
    ...externalReceiptRefs,
    ...standaloneExternalReceiptRefs,
  ]);
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
    return gates.remaining_bridge_module_ids.map((moduleId) => {
      const module = bridgeModuleRecord(audit, moduleId);
      const bridgeExitGate = isRecord(module.bridge_exit_gate) ? module.bridge_exit_gate : {};
      return {
        ref: moduleId,
        role: 'remaining_bridge_module',
        domain_id: audit.target_domain_id ?? project.project_id,
        module_id: moduleId,
        module_status: 'allowed_refs_only_or_minimal_authority_until_evidence_gate_closes',
        classification: stringValue(module.classification) ?? stringValue(module.migration_class),
        migration_class: stringValue(module.migration_class),
        owner: stringValue(module.owner),
        bridge_owner: stringValue(bridgeExitGate.bridge_owner),
        bridge_role: stringValue(bridgeExitGate.bridge_role),
        replacement_owner: stringValue(bridgeExitGate.replacement_owner),
        replacement_surface: stringValue(bridgeExitGate.replacement_surface),
        exit_gate_ref: stringValue(bridgeExitGate.exit_gate_ref),
        bridge_exit_gate_status: stringValue(bridgeExitGate.current_status),
        required_before_retire: stringList(bridgeExitGate.required_before_retire),
        retained_domain_authority: stringList(bridgeExitGate.retained_rca_authority),
        after_exit_domain_surface: stringValue(bridgeExitGate.after_exit_rca_surface),
        can_delete_without_no_active_caller_proof:
          bridgeExitGate.can_delete_without_no_active_caller_proof === true,
        declares_replacement_complete: bridgeExitGate.declares_replacement_complete === true,
        domain_can_own_replacement_runtime: bridgeExitGate.rca_can_own_replacement_runtime === true,
        forbidden_generic_owner_flags: isRecord(module.forbidden_generic_owner_flags)
          ? module.forbidden_generic_owner_flags
          : {},
        source_refs: gates.source_refs,
        authority_boundary: bridgeModuleAuthorityBoundary(module, bridgeExitGate),
        can_execute: false,
      };
    });
  });
  return {
    surface_kind: 'opl_app_drilldown_domain_evidence_request_refs',
    projection_policy:
      'domain_declared_requests_and_standalone_external_proof_receipts_refs_only_no_domain_truth_or_verdict',
    external_requests: uniqueRefs(externalRequests),
    external_receipts: allExternalReceiptRefs,
    evidence_gates: uniqueRefs(remainingEvidenceGates),
    evidence_gate_receipts: evidenceGateReceiptRefs,
    replacement_expectations: uniqueRefs(replacementExpectations),
    remaining_bridge_modules: uniqueRefs(remainingBridgeModules),
    summary: {
      external_evidence_request_count: externalRequests.length,
      evidence_gate_count: evidenceGates.length,
      remaining_evidence_gate_count: remainingEvidenceGates.length,
      open_evidence_gate_request_count: remainingEvidenceGates.length,
      recorded_evidence_gate_request_count: evidenceGates.filter((gate) =>
        gate.external_receipt_status === 'recorded'
      ).length,
      verified_evidence_gate_request_count: evidenceGates.filter((gate) =>
        gate.external_receipt_status === 'verified'
      ).length,
      evidence_gate_receipt_count: evidenceGateReceiptRefs.length,
      evidence_gate_verified_receipt_count: evidenceGateReceiptRefs.filter((receipt) =>
        receipt.receipt_status === 'verified'
      ).length,
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
      external_evidence_receipt_count: allExternalReceiptRefs.length,
      external_verified_receipt_count: allExternalReceiptRefs.filter((receipt) =>
        receipt.receipt_status === 'verified'
      ).length,
      external_verified_memory_writeback_receipt_ref_count: uniqueStrings(
        allExternalReceiptRefs
          .filter((receipt) => receipt.receipt_status === 'verified')
          .flatMap((receipt) => receipt.memory_writeback_receipt_refs),
      ).length,
      external_verified_artifact_mutation_receipt_ref_count: uniqueStrings(
        allExternalReceiptRefs
          .filter((receipt) => receipt.receipt_status === 'verified')
          .flatMap((receipt) => receipt.artifact_mutation_receipt_refs),
      ).length,
      external_verified_package_lifecycle_receipt_ref_count: uniqueStrings(
        allExternalReceiptRefs
          .filter((receipt) => receipt.receipt_status === 'verified')
          .flatMap((receipt) => receipt.package_lifecycle_receipt_refs),
      ).length,
      external_verified_lifecycle_receipt_ref_count: uniqueStrings(
        allExternalReceiptRefs
          .filter((receipt) => receipt.receipt_status === 'verified')
          .flatMap((receipt) => receipt.lifecycle_receipt_refs),
      ).length,
      external_verified_restore_proof_ref_count: uniqueStrings(
        allExternalReceiptRefs
          .filter((receipt) => receipt.receipt_status === 'verified')
          .flatMap((receipt) => receipt.restore_proof_refs),
      ).length,
      external_verified_no_regression_ref_count: uniqueStrings(
        allExternalReceiptRefs
          .filter((receipt) => receipt.receipt_status === 'verified')
          .flatMap((receipt) => receipt.no_regression_refs),
      ).length,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
