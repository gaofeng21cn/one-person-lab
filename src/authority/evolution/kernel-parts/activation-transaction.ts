import type {
  ActivationRuntime,
  ActivationRuntimeTransactionResult,
  ActivationTransactionKind,
  AgentVersion,
  FoundryClock,
  VersionRegistry,
} from '../ports.ts';
import {
  assertActivationPreflight,
  assertActivationTransaction,
  buildRuntimeBindingVerification,
} from './activation-verification.ts';
import { fail } from './validation.ts';

type FoundryActivityRunner = <T>(
  operation: string,
  run: () => Promise<T>,
) => Promise<T>;

export async function commitFoundryActivation(input: {
  transaction_kind: ActivationTransactionKind;
  version: AgentVersion;
  expected_activation_revision: number;
  authority_receipt_ref: string | null;
  activationRuntime: ActivationRuntime;
  versions: VersionRegistry;
  clock: FoundryClock;
  activity: FoundryActivityRunner;
}): Promise<ActivationRuntimeTransactionResult> {
  if (input.transaction_kind === 'rollback' && !input.authority_receipt_ref) {
    fail('Rollback activation transaction requires an Owner authority receipt.');
  }
  const preflight = await input.activity(
    `${input.transaction_kind}_runtime_preflight`,
    () => input.activationRuntime.preflight({
      transaction_kind: input.transaction_kind,
      version: input.version,
      expected_activation_revision: input.expected_activation_revision,
    }),
  );
  assertActivationPreflight(preflight, input);
  const runtimeBindingVerification = buildRuntimeBindingVerification(preflight);
  const occurredAt = input.clock.now();
  const transaction = await input.activity(input.transaction_kind, () => (
    input.transaction_kind === 'activate'
      ? input.versions.compareAndSwapActivation({
          target_agent_id: input.version.target_agent_id,
          target_domain_id: input.version.target_domain_id,
          expected_revision: input.expected_activation_revision,
          version_digest: input.version.version_digest,
          occurred_at: occurredAt,
          authority_receipt_ref: input.authority_receipt_ref,
          runtime_binding_verification: runtimeBindingVerification,
        })
      : input.versions.rollback({
          target_agent_id: input.version.target_agent_id,
          target_domain_id: input.version.target_domain_id,
          expected_revision: input.expected_activation_revision,
          version_digest: input.version.version_digest,
          occurred_at: occurredAt,
          authority_receipt_ref: input.authority_receipt_ref!,
          runtime_binding_verification: runtimeBindingVerification,
        })
  ));
  assertActivationTransaction(transaction, {
    ...input,
    runtime_binding_verification: runtimeBindingVerification,
  });
  return {
    ...transaction,
    runtime_preflight: preflight,
  };
}
