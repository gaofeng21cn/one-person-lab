import type { FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import { isRecord, optionalString } from './values.ts';

type TaskIdentity = Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>;

export function declaredProviderHostedTaskStageId(
  row: TaskIdentity,
  payload: Record<string, unknown>,
) {
  const productEntryManifest = isRecord(payload.product_entry_manifest)
    ? payload.product_entry_manifest
    : null;
  const contractCandidates = [
    payload,
    isRecord(payload.owner_receipt_contract) ? payload.owner_receipt_contract : null,
    isRecord(payload.domain_owner_receipt_contract) ? payload.domain_owner_receipt_contract : null,
    isRecord(productEntryManifest?.owner_receipt_contract)
      ? productEntryManifest.owner_receipt_contract
      : null,
    isRecord(productEntryManifest?.domain_owner_receipt_contract)
      ? productEntryManifest.domain_owner_receipt_contract
      : null,
  ];
  for (const contract of contractCandidates) {
    if (!contract) continue;
    const bindings = isRecord(contract.provider_hosted_task_stage_bindings)
      ? contract.provider_hosted_task_stage_bindings
      : null;
    const bindingCandidate = bindings?.[row.task_kind];
    const binding = isRecord(bindingCandidate) ? bindingCandidate : null;
    if (!binding || binding.provider_hosted_stage_attempt_required !== true) continue;
    const runtimeDomainId = optionalString(binding.runtime_domain_id);
    if (runtimeDomainId && runtimeDomainId !== row.domain_id) continue;
    const stageId = optionalString(binding.stage_id);
    if (stageId) return stageId;
  }
  return null;
}

export function legacyPersistedProviderHostedTaskStageId(row: TaskIdentity) {
  // RCA tasks persisted before owner-receipt bindings were carried in payloads still need replay support.
  return row.domain_id === 'redcube' && row.task_kind === 'emit_no_regression_evidence'
    ? 'controlled_visual_stage_attempt'
    : null;
}
