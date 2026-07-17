import {
  buildStandardDomainAgentTemplateConsumptionReadModel,
} from '../../pack/index.ts';
import {
  listStandardAgentTemplateConsumptionReceipts,
} from '../../ledger/index.ts';

export function buildStandardAgentTemplateConsumptionProjection() {
  const receipts = listStandardAgentTemplateConsumptionReceipts();
  return {
    ...buildStandardDomainAgentTemplateConsumptionReadModel(),
    ledger_projection: {
      surface_kind: 'opl_standard_agent_template_consumption_ledger_projection',
      receipt_count: receipts.length,
      verified_receipt_ref_count: receipts.filter((receipt) =>
        receipt.receipt_status === 'verified'
      ).length,
      pending_verify_receipt_ref_count: receipts.filter((receipt) =>
        receipt.receipt_status === 'recorded').length,
      receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
      verified_receipt_refs: receipts
        .filter((receipt) => receipt.receipt_status === 'verified')
        .map((receipt) => receipt.receipt_ref),
      pending_verify_receipt_refs: receipts
        .filter((receipt) => receipt.receipt_status === 'recorded')
        .map((receipt) => receipt.receipt_ref),
      receipts,
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_mutate_artifact_body: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_artifact_authority: false,
        can_claim_production_ready: false,
      },
    },
  };
}
