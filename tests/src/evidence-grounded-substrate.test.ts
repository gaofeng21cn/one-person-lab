import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEvidenceGroundedConnectSubstrate } from '../../src/modules/connect/index.ts';
import { buildEvidenceGroundedLedgerSubstrate } from '../../src/modules/ledger/index.ts';
import { buildEvidenceGroundedWorkspaceSubstrate } from '../../src/modules/workspace/index.ts';

function hasKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasKey(entry, key));
  }
  return Object.entries(value).some(
    ([entryKey, entryValue]) => entryKey === key || hasKey(entryValue, key),
  );
}

test('Evidence-grounded Ledger/Connect/Workspace substrate stays refs-only and fail-closed', () => {
  const sourceContent = 'raw patient note should never appear';
  const toolResultContent = 'external tool result body should never appear';

  const ledger = buildEvidenceGroundedLedgerSubstrate({
    evidenceRef: 'evidence-ref:case-001/lab-summary',
    sourceRef: 'source-ref:workspace/case-001',
    provenanceRef: 'provenance-ref:workspace/case-001/import',
    retrievalReceiptRef: 'retrieval-receipt-ref:connect/pubmed/001',
    toolReceiptRef: 'tool-receipt-ref:connect/calculator/001',
    freshnessRef: 'freshness-ref:workspace/case-001/2026-07-09',
    confidenceLabel: 'low',
    conflictStatus: 'routes_to_human_gate',
    sourceContent,
  });

  assert.equal(ledger.evidence_packet.object_name, 'EvidencePacket');
  assert.equal(ledger.evidence_packet.refs_only, true);
  assert.equal(ledger.evidence_packet.confidence_label, 'low');
  assert.equal(ledger.evidence_packet.conflict_status, 'routes_to_human_gate');
  assert.equal(ledger.evidence_packet.owner_receipt_ref, null);
  assert.equal(ledger.evidence_packet.creates_domain_typed_blocker_instance, false);
  assert.deepEqual(ledger.evidence_trace.trace_refs, [
    'evidence-ref:case-001/lab-summary',
    'source-ref:workspace/case-001',
    'provenance-ref:workspace/case-001/import',
    'retrieval-receipt-ref:connect/pubmed/001',
    'tool-receipt-ref:connect/calculator/001',
    'freshness-ref:workspace/case-001/2026-07-09',
  ]);
  assert.deepEqual(ledger.unsupported_evidence_blocker.reason_ids, [
    'low_confidence',
    'evidence_conflict',
  ]);
  assert.equal(ledger.unsupported_evidence_blocker.success_closeout_allowed, false);
  assert.equal(ledger.unsupported_evidence_blocker.creates_domain_typed_blocker_instance, false);
  assert.equal(ledger.evidence_requirement.can_claim_domain_ready, false);
  assert.equal(ledger.evidence_requirement.can_claim_production_ready, false);

  const connectBlocked = buildEvidenceGroundedConnectSubstrate({
    retrievalReceiptRef: 'retrieval-receipt-ref:connect/external/blocked',
    sourceRef: 'source-ref:workspace/case-001',
    connectorRef: 'connector-ref:external-api',
    toolReceiptRef: 'tool-receipt-ref:external-api/analyze',
    toolRef: 'tool-ref:external-api/analyze',
    sensitiveExternalEgressRequested: true,
    resultContent: toolResultContent,
  });

  assert.equal(connectBlocked.retrieval_packet.object_name, 'RetrievalPacket');
  assert.equal(connectBlocked.tool_result_envelope.object_name, 'ToolResultEnvelope');
  assert.equal(connectBlocked.data_sharing.status, 'blocked');
  assert.equal(connectBlocked.data_sharing.external_egress_allowed, false);
  assert.deepEqual(connectBlocked.fail_closed_reason_ids, [
    'sensitive_external_egress_unapproved',
  ]);
  assert.equal(
    connectBlocked.tool_result_envelope.tool_result_envelope_can_share_unsafe_data,
    false,
  );

  const connectApproved = buildEvidenceGroundedConnectSubstrate({
    retrievalReceiptRef: 'retrieval-receipt-ref:connect/external/approved',
    sourceRef: 'source-ref:workspace/case-001',
    connectorRef: 'connector-ref:external-api',
    toolReceiptRef: 'tool-receipt-ref:external-api/analyze-approved',
    toolRef: 'tool-ref:external-api/analyze',
    sensitiveExternalEgressRequested: true,
    externalEgressApprovalRef: 'human-gate-ref:egress/approved',
  });

  assert.equal(connectApproved.data_sharing.status, 'approved');
  assert.equal(connectApproved.data_sharing.external_egress_allowed, true);
  assert.deepEqual(connectApproved.fail_closed_reason_ids, []);

  const workspace = buildEvidenceGroundedWorkspaceSubstrate({
    structuredInputRef: 'structured-input-ref:workspace/case-001',
    sourceRef: 'source-ref:workspace/case-001',
    sourceLocatorRef: 'source-locator-ref:workspace/case-001',
    sourceLocatorKind: 'workspace_source_ref',
    sourceContent,
    deidentificationPolicyRef: 'policy-ref:workspace/deidentification/no-inline-content',
    accessAuditPolicyRef: 'policy-ref:workspace/access-audit/ref-only',
  });

  assert.equal(workspace.structured_input.object_name, 'StructuredInput');
  assert.equal(workspace.structured_input.refs_only, true);
  assert.deepEqual(workspace.structured_input.source_locator, {
    source_ref: 'source-ref:workspace/case-001',
    source_locator_ref: 'source-locator-ref:workspace/case-001',
    source_locator_kind: 'workspace_source_ref',
  });
  assert.equal(
    workspace.sensitive_source_lifecycle.deidentification_policy_ref,
    'policy-ref:workspace/deidentification/no-inline-content',
  );
  assert.equal(
    workspace.sensitive_source_lifecycle.access_audit_policy_ref,
    'policy-ref:workspace/access-audit/ref-only',
  );
  assert.equal(workspace.structured_input_readback.inline_source_content_included, false);

  const allJson = JSON.stringify({ ledger, connectBlocked, connectApproved, workspace });
  assert.equal(allJson.includes(sourceContent), false);
  assert.equal(allJson.includes(toolResultContent), false);
  assert.equal(hasKey({ ledger, connectBlocked, connectApproved, workspace }, 'body'), false);
  assert.deepEqual(
    buildEvidenceGroundedWorkspaceSubstrate({
      structuredInputRef: 'structured-input-ref:workspace/case-001',
      sourceRef: 'source-ref:workspace/case-001',
      sourceLocatorRef: 'source-locator-ref:workspace/case-001',
      sourceLocatorKind: 'workspace_source_ref',
      sourceContent,
      deidentificationPolicyRef: 'policy-ref:workspace/deidentification/no-inline-content',
      accessAuditPolicyRef: 'policy-ref:workspace/access-audit/ref-only',
    }),
    workspace,
  );
});
