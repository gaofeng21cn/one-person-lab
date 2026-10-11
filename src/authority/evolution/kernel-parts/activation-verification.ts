import type {
  ActivationRuntimeBindingVerification,
  ActivationRuntimePreflight,
  ActivationTransaction,
  ActivationTransactionKind,
  AgentVersion,
} from '../ports.ts';
import { foundryContentDigest } from '../protocol.ts';
import { fail } from './validation.ts';

export function assertActivationPreflight(
  preflight: ActivationRuntimePreflight,
  input: {
    transaction_kind: ActivationTransactionKind;
    version: AgentVersion;
    expected_activation_revision: number;
  },
) {
  if (
    preflight.surface_kind !== 'opl_foundry_activation_runtime_preflight'
    || preflight.version !== 'opl-foundry-activation-runtime-preflight.v1'
    || preflight.transaction_kind !== input.transaction_kind
    || preflight.target_agent_id !== input.version.target_agent_id
    || preflight.target_domain_id !== input.version.target_domain_id
    || preflight.version_id !== input.version.version_id
    || preflight.version_digest !== input.version.version_digest
    || preflight.candidate_digest !== input.version.candidate_digest
    || preflight.candidate_ref !== input.version.candidate_ref
    || preflight.expected_activation_revision !== input.expected_activation_revision
    || !preflight.preflight_ref.trim()
    || (preflight.runtime_binding_ref !== undefined && !preflight.runtime_binding_ref.trim())
  ) {
    fail('Activation runtime preflight does not bind the exact target AgentVersion and revision.', {
      expected_version_digest: input.version.version_digest,
      expected_candidate_digest: input.version.candidate_digest,
      expected_activation_revision: input.expected_activation_revision,
    });
  }
}

export function buildRuntimeBindingVerification(
  preflight: ActivationRuntimePreflight,
): ActivationRuntimeBindingVerification {
  return {
    surface_kind: 'opl_foundry_activation_runtime_binding_verification',
    version: 'opl-foundry-activation-runtime-binding-verification.v1',
    verification_phase: 'pre_commit',
    transaction_kind: preflight.transaction_kind,
    target_agent_id: preflight.target_agent_id,
    target_domain_id: preflight.target_domain_id,
    version_id: preflight.version_id,
    version_digest: preflight.version_digest,
    candidate_digest: preflight.candidate_digest,
    candidate_ref: preflight.candidate_ref,
    expected_activation_revision: preflight.expected_activation_revision,
    preflight_ref: preflight.preflight_ref,
    runtime_binding_ref: preflight.runtime_binding_ref ?? preflight.preflight_ref,
  };
}

export function assertActivationTransaction(
  transaction: ActivationTransaction,
  input: {
    transaction_kind: ActivationTransactionKind;
    version: AgentVersion;
    expected_activation_revision: number;
    authority_receipt_ref: string | null;
    runtime_binding_verification: ActivationRuntimeBindingVerification;
  },
) {
  if (
    transaction.surface_kind !== 'opl_foundry_activation_transaction'
    || transaction.transaction_kind !== input.transaction_kind
    || transaction.target_agent_id !== input.version.target_agent_id
    || transaction.target_domain_id !== input.version.target_domain_id
    || transaction.to_version_digest !== input.version.version_digest
    || transaction.previous_revision !== input.expected_activation_revision
    || transaction.next_revision !== input.expected_activation_revision + 1
    || transaction.authority_receipt_ref !== input.authority_receipt_ref
    || foundryContentDigest(transaction.runtime_binding_verification)
      !== foundryContentDigest(input.runtime_binding_verification)
    || !transaction.transaction_id.trim()
    || !Number.isFinite(Date.parse(transaction.occurred_at))
  ) {
    fail('Version registry returned an invalid activation transaction.', {
      expected_transaction_kind: input.transaction_kind,
      expected_version_digest: input.version.version_digest,
      expected_activation_revision: input.expected_activation_revision,
    });
  }
}
