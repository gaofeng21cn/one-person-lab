import { FrameworkContractError } from '../../charter/index.ts';
import type { FamilyRuntimeDomainId } from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertDomainId, parsePayload, parsePayloadFile } from './shared.ts';

export function parseLifecycleApplyArgs(rest: string[]): FamilyRuntimeCommandInput {
  let applyMode: 'dry-run' | 'apply' | 'verify' = 'dry-run';
  let domainId = '';
  let sourceRef: string | undefined;
  let manifestRef: string | undefined;
  let receiptRef: string | undefined;
  const actions: Record<string, unknown>[] = [];
  const handoffs: Record<string, unknown>[] = [];
  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--mode' && (value === 'dry-run' || value === 'apply' || value === 'verify')) {
      applyMode = value;
      index += 1;
    } else if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      index += 1;
    } else if (token === '--source-ref' && value) {
      sourceRef = value;
      index += 1;
    } else if (token === '--manifest-ref' && value) {
      manifestRef = value;
      index += 1;
    } else if (token === '--receipt-ref' && value) {
      receiptRef = value;
      index += 1;
    } else if (token === '--action' && value) {
      actions.push(parsePayload(value));
      index += 1;
    } else if (token === '--action-file' && value) {
      actions.push(parsePayloadFile(value));
      index += 1;
    } else if (token === '--handoff' && value) {
      handoffs.push(parsePayload(value));
      index += 1;
    } else if (token === '--handoff-file' && value) {
      handoffs.push(parsePayloadFile(value));
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime lifecycle apply option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime lifecycle apply --mode dry-run|apply|verify --domain <domain_id> [--action <json>|--handoff <json>] [--receipt-ref <ref>]',
      });
    }
  }
  if (!domainId) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime lifecycle apply requires --domain.', {
      required: ['--domain'],
    });
  }
  if (applyMode !== 'verify' && actions.length === 0 && handoffs.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime lifecycle apply requires at least one --action or --handoff outside verify mode.', {
      required: ['--action', '--handoff'],
    });
  }
  if (applyMode === 'verify' && (actions.length > 0 || handoffs.length > 0)) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime lifecycle apply --mode verify reads receipts and cannot include --action or --handoff.', {
      mutually_exclusive: ['--mode verify', '--action', '--handoff'],
    });
  }
  return {
    mode: 'lifecycle_apply',
    input: {
      mode: applyMode,
      target_domain_id: domainId,
      source_ref: sourceRef,
      manifest_ref: manifestRef,
      receipt_ref: receiptRef,
      actions,
      handoffs,
    },
  };
}

export function parseLifecycleReconcileArgs(rest: string[]): FamilyRuntimeCommandInput {
  let domainId: FamilyRuntimeDomainId | undefined;
  let maxAgeMs: number | null | undefined;
  const expectedSourceRefs: string[] = [];
  const expectedReceiptRefs: string[] = [];
  const expectedRestoreProofRefs: string[] = [];
  const expectedDomainArtifactMutationReceiptRefs: string[] = [];
  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      index += 1;
    } else if (token === '--expected-source-ref' && value) {
      expectedSourceRefs.push(value);
      index += 1;
    } else if (token === '--expected-receipt-ref' && value) {
      expectedReceiptRefs.push(value);
      index += 1;
    } else if (token === '--expected-restore-proof-ref' && value) {
      expectedRestoreProofRefs.push(value);
      index += 1;
    } else if (token === '--expected-domain-artifact-mutation-receipt-ref' && value) {
      expectedDomainArtifactMutationReceiptRefs.push(value);
      index += 1;
    } else if (token === '--max-age-ms' && value) {
      maxAgeMs = Number.parseInt(value, 10);
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime lifecycle reconcile option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime lifecycle reconcile [--domain <domain_id>] [--expected-source-ref <ref>] [--expected-receipt-ref <ref>] [--expected-restore-proof-ref <ref>] [--expected-domain-artifact-mutation-receipt-ref <ref>] [--max-age-ms <n>]',
      });
    }
  }
  if (maxAgeMs !== undefined && maxAgeMs !== null && (!Number.isInteger(maxAgeMs) || maxAgeMs < 0)) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime lifecycle reconcile --max-age-ms must be a non-negative integer.', {
      max_age_ms: maxAgeMs,
    });
  }
  return {
    mode: 'lifecycle_reconcile',
    input: {
      target_domain_id: domainId,
      expected_source_refs: expectedSourceRefs,
      expected_receipt_refs: expectedReceiptRefs,
      expected_restore_proof_refs: expectedRestoreProofRefs,
      expected_domain_artifact_mutation_receipt_refs: expectedDomainArtifactMutationReceiptRefs,
      max_age_ms: maxAgeMs ?? null,
    },
  };
}
