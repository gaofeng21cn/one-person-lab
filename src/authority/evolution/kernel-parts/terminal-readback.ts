import { isRecord } from '../../../kernel/contract-validation.ts';
import type {
  ActivationPointer,
  ActivationRuntimeBindingVerification,
  ActivationTransaction,
  AgentVersion,
  FoundryEventStore,
  OwnerGateAction,
  OwnerGateDecision,
  VersionRegistry,
} from '../ports.ts';
import { ownerAuthorityReceiptRef } from '../owner-gate.ts';
import { ownerGatePolicy } from '../risk-policy.ts';
import { foundryContentDigest } from '../protocol.ts';
import {
  FOUNDRY_TERMINAL_STATES,
  type FoundryRunEvent,
  type FoundryRunSnapshot,
  type FoundryRunState,
} from '../state-machine.ts';
import { fail, requiredDigest, requiredRef } from './validation.ts';

export type FoundryOwnerDecisionReadback = {
  surface_kind: 'opl_foundry_owner_decision_readback';
  version: 'opl-foundry-owner-decision-readback.v1';
  event_id: string;
  event_revision: number;
  expected_revision: number;
  action: OwnerGateAction;
  decision: OwnerGateDecision;
  receipt_ref: string;
  receipt_digest: string;
  authority_ref: string;
  verifier_id: string;
  verification_ref: string;
  authority_policy_ref: string;
};

export type FoundryRunTerminalReadback = {
  surface_kind: 'opl_foundry_run_terminal_readback';
  version: 'opl-foundry-run-terminal-readback.v1';
  terminal: boolean;
  state: FoundryRunState;
  qualified_agent_version: AgentVersion | null;
  owner_decisions: FoundryOwnerDecisionReadback[];
  activation_transaction: ActivationTransaction | null;
  runtime_binding_verification: ActivationRuntimeBindingVerification | null;
  current_activation: ActivationPointer;
  active_version_matches_run: boolean | null;
};

export function ownerDecisionReadbacks(events: FoundryRunEvent[]): FoundryOwnerDecisionReadback[] {
  return events.flatMap((event) => {
    if (!['owner_approved', 'owner_rejected', 'foundry_run_cancelled'].includes(event.event_type)) return [];
    const action = requiredRef(event.payload.owner_gate_action, 'owner_gate_action') as OwnerGateAction;
    const decision = requiredRef(event.payload.owner_gate_decision, 'owner_gate_decision') as OwnerGateDecision;
    const validDecision = event.event_type === 'owner_approved'
      ? decision === 'approve' && ['approve_canary', 'approve_active'].includes(action)
      : event.event_type === 'owner_rejected'
        ? decision === 'reject' && ['reject_canary', 'reject_active'].includes(action)
        : decision === 'cancel' && action === 'cancel';
    if (!validDecision) {
      fail('FoundryRun owner decision event does not match its verified action.', {
        event_id: event.event_id,
        event_type: event.event_type,
        action,
        decision,
      });
    }
    const receiptDigest = requiredDigest(
      event.payload.owner_authority_receipt_digest,
      'owner_authority_receipt_digest',
    );
    const receiptRef = requiredRef(
      event.payload.owner_authority_receipt_ref,
      'owner_authority_receipt_ref',
    );
    if (ownerAuthorityReceiptRef(receiptDigest) !== receiptRef) {
      fail('FoundryRun owner decision receipt ref does not match its verified digest.', {
        event_id: event.event_id,
        receipt_ref: receiptRef,
        receipt_digest: receiptDigest,
      });
    }
    return [{
      surface_kind: 'opl_foundry_owner_decision_readback' as const,
      version: 'opl-foundry-owner-decision-readback.v1' as const,
      event_id: event.event_id,
      event_revision: event.revision,
      expected_revision: event.revision - 1,
      action,
      decision,
      receipt_ref: receiptRef,
      receipt_digest: receiptDigest,
      authority_ref: requiredRef(event.payload.owner_authority_ref, 'owner_authority_ref'),
      verifier_id: requiredRef(event.payload.owner_authority_verifier_id, 'owner_authority_verifier_id'),
      verification_ref: requiredRef(
        event.payload.owner_authority_verification_ref,
        'owner_authority_verification_ref',
      ),
      authority_policy_ref: requiredRef(
        event.payload.owner_authority_policy_ref,
        'owner_authority_policy_ref',
      ),
    }];
  });
}

export function latestOwnerAuthority(events: Awaited<ReturnType<FoundryEventStore['read']>>) {
  for (const event of [...events].reverse()) {
    if (
      event.event_type === 'owner_approved'
      && typeof event.payload.owner_authority_receipt_ref === 'string'
      && typeof event.payload.owner_authority_receipt_digest === 'string'
    ) {
      const digest = requiredDigest(
        event.payload.owner_authority_receipt_digest,
        'owner_authority_receipt_digest',
      );
      const ref = requiredRef(event.payload.owner_authority_receipt_ref, 'owner_authority_receipt_ref');
      if (ownerAuthorityReceiptRef(digest) !== ref) {
        fail('Owner approval event receipt ref does not match its verified digest.');
      }
      return { ref, digest };
    }
  }
  return null;
}

export async function buildFoundryRunTerminalReadback(input: {
  run: FoundryRunSnapshot;
  events: FoundryRunEvent[];
  activation: ActivationPointer;
  versions: VersionRegistry;
}): Promise<FoundryRunTerminalReadback> {
  const qualifiedAgentVersion = input.run.version_digest
    ? await input.versions.resolveVersion(
        input.run.version_digest,
        input.run.target_agent_id,
        input.run.target_domain_id,
      )
    : null;
  if (input.run.version_digest && (
    !qualifiedAgentVersion
    || qualifiedAgentVersion.version_digest !== input.run.version_digest
    || qualifiedAgentVersion.target_agent_id !== input.run.target_agent_id
    || qualifiedAgentVersion.target_domain_id !== input.run.target_domain_id
  )) {
    fail('FoundryRun terminal readback cannot resolve its exact qualified AgentVersion.', {
      run_id: input.run.run_id,
      version_digest: input.run.version_digest,
    });
  }

  const ownerDecisions = ownerDecisionReadbacks(input.events);
  const activationEvents = input.events.filter((event) => event.event_type === 'activation_completed');
  if (activationEvents.length > 1) {
    fail('FoundryRun has more than one activation completion event.', { run_id: input.run.run_id });
  }
  const activationEvent = activationEvents[0] ?? null;
  if ((input.run.state === 'completed_active') !== Boolean(activationEvent)) {
    fail('FoundryRun terminal state and activation completion receipt disagree.', {
      run_id: input.run.run_id,
      state: input.run.state,
      activation_event_count: activationEvents.length,
    });
  }

  let activationTransaction: ActivationTransaction | null = null;
  if (activationEvent) {
    const transactionId = requiredRef(
      activationEvent.payload.activation_transaction_id,
      'activation_transaction_id',
    );
    const history = await input.versions.activationHistory(
      input.run.target_agent_id,
      input.run.target_domain_id,
    );
    activationTransaction = history.find((transaction) => transaction.transaction_id === transactionId) ?? null;
    if (!activationTransaction
      || activationTransaction.to_version_digest !== input.run.version_digest
      || activationTransaction.target_agent_id !== input.run.target_agent_id
      || activationTransaction.target_domain_id !== input.run.target_domain_id) {
      fail('FoundryRun activation receipt does not resolve to its exact activation transaction.', {
        run_id: input.run.run_id,
        transaction_id: transactionId,
        version_digest: input.run.version_digest,
      });
    }
    if (!isRecord(activationEvent.payload.activation_runtime_binding_verification)
      || foundryContentDigest(activationEvent.payload.activation_runtime_binding_verification)
        !== foundryContentDigest(activationTransaction.runtime_binding_verification)
      || activationEvent.payload.activation_runtime_preflight_ref
        !== activationTransaction.runtime_binding_verification.preflight_ref
      || activationEvent.payload.activation_runtime_binding_ref
        !== activationTransaction.runtime_binding_verification.runtime_binding_ref) {
      fail('FoundryRun activation receipt does not bind its exact runtime verification.', {
        run_id: input.run.run_id,
        transaction_id: transactionId,
      });
    }
    const activeApproval = [...ownerDecisions].reverse().find((decision) => decision.action === 'approve_active');
    if (ownerGatePolicy(input.run.risk_tier!).active_owner_required
      && activationTransaction.authority_receipt_ref !== activeApproval?.receipt_ref) {
      fail('FoundryRun activation transaction does not bind its verified active approval receipt.', {
        run_id: input.run.run_id,
        transaction_id: transactionId,
      });
    }
  }

  return {
    surface_kind: 'opl_foundry_run_terminal_readback',
    version: 'opl-foundry-run-terminal-readback.v1',
    terminal: FOUNDRY_TERMINAL_STATES.has(input.run.state),
    state: input.run.state,
    qualified_agent_version: qualifiedAgentVersion,
    owner_decisions: ownerDecisions,
    activation_transaction: activationTransaction,
    runtime_binding_verification: activationTransaction?.runtime_binding_verification ?? null,
    current_activation: input.activation,
    active_version_matches_run: input.run.version_digest
      ? input.activation.active_version_digest === input.run.version_digest
      : null,
  };
}
