import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { foundryContentDigest } from './protocol.ts';
import {
  materializeFoundryOperationResult,
  validateFoundryEvaluationOperationIdentity,
  validateFoundryOperationResult,
  type FoundryEvaluationOperationIdentity,
  type FoundryOperationResult,
  type FoundryOperationResultJournal,
} from './operation-result.ts';
import type {
  ActivationPointer,
  ActivationTransaction,
  AgentVersion,
  CandidateCompiler,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  OwnerAuthorityReceipt,
  OwnerGate,
  OwnerGateVerificationContext,
  QualificationRecord,
  VersionRegistry,
} from './ports.ts';
import {
  materializeOwnerAuthorityReceipt,
  validateOwnerGateVerification,
  validateOwnerGateVerificationContext,
} from './owner-gate.ts';
import { FOUNDRY_TERMINAL_STATES, snapshotFromEvents, verifyFoundryEventChain } from './state-machine.ts';
import type { FoundryRunEvent, FoundryRunSnapshot } from './state-machine.ts';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function internalDigest(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value), 'utf8').digest('hex')}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryFoundryObjectStore implements FoundryObjectStore {
  readonly #objects = new Map<string, unknown>();

  async put<T>(value: T) {
    const digest = foundryContentDigest(value);
    const existing = this.#objects.get(digest);
    if (existing !== undefined && canonicalJsonText(existing) !== canonicalJsonText(value)) {
      fail('Content-addressed Foundry object collision.', { digest });
    }
    this.#objects.set(digest, clone(value));
    return { digest, ref: `foundry-object:${digest}` };
  }

  async get<T>(digest: string) {
    const value = this.#objects.get(digest);
    return value === undefined ? null : clone(value as T);
  }
}

export class InMemoryFoundryOperationResultJournal implements FoundryOperationResultJournal {
  readonly #results = new Map<string, FoundryOperationResult>();

  async read(identity: FoundryEvaluationOperationIdentity) {
    const operation = validateFoundryEvaluationOperationIdentity(identity);
    const result = this.#results.get(operation.operation_key);
    return result ? clone(validateFoundryOperationResult(result, operation)) : null;
  }

  async commit(input: Parameters<FoundryOperationResultJournal['commit']>[0]) {
    const result = materializeFoundryOperationResult(input);
    const existing = this.#results.get(result.operation_key);
    if (existing && canonicalJsonText(existing) !== canonicalJsonText(result)) {
      fail('Foundry operation key is already committed with a different result.', {
        operation_key: result.operation_key,
      });
    }
    if (!existing) this.#results.set(result.operation_key, clone(result));
    return clone(existing ?? result);
  }
}

export class InMemoryOwnerGate implements OwnerGate {
  readonly #receipts = new Map<string, OwnerAuthorityReceipt>();
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  register(statement: Parameters<typeof materializeOwnerAuthorityReceipt>[0]) {
    const receipt = materializeOwnerAuthorityReceipt(statement);
    this.#receipts.set(receipt.receipt_ref, clone(receipt));
    return clone(receipt);
  }

  async verify(input: OwnerGateVerificationContext) {
    const context = validateOwnerGateVerificationContext(input);
    const receipt = this.#receipts.get(context.authority_receipt_ref)
      ?? fail('Owner authority receipt is not registered with the in-memory OwnerGate.', {
        authority_receipt_ref: context.authority_receipt_ref,
      });
    return validateOwnerGateVerification(context, {
      surface_kind: 'opl_foundry_owner_gate_verification',
      version: 'opl-foundry-owner-gate-verification.v1',
      verifier_id: 'foundry-owner-gate:in-memory',
      verification_ref: `opl://foundry/owner-gate-verifications/${internalDigest({
        verifier_id: 'foundry-owner-gate:in-memory',
        receipt_digest: receipt.receipt_digest,
      })}`,
      verified_at: this.#now(),
      covered_authority_ref: receipt.authority_ref,
      receipt,
    });
  }
}

export class InMemoryFoundryEventStore implements FoundryEventStore {
  readonly #runs = new Map<string, FoundryRunEvent[]>();
  readonly #targetLocks = new Map<string, string>();

  async create(input: { target_key: string; event: FoundryRunEvent }) {
    if (this.#runs.has(input.event.run_id)) fail('FoundryRun already exists.', { run_id: input.event.run_id });
    const lockedBy = this.#targetLocks.get(input.target_key);
    if (lockedBy) fail('Target Agent already has an active write FoundryRun.', { target_key: input.target_key, run_id: lockedBy });
    verifyFoundryEventChain([input.event]);
    this.#runs.set(input.event.run_id, [clone(input.event)]);
    this.#targetLocks.set(input.target_key, input.event.run_id);
  }

  async append(input: { target_key: string; expected_revision: number; event: FoundryRunEvent }) {
    const events = this.#runs.get(input.event.run_id) ?? fail('FoundryRun does not exist.', { run_id: input.event.run_id });
    const replay = events.find((entry) => entry.idempotency_key === input.event.idempotency_key);
    if (replay) return clone(replay);
    const current = events.at(-1)!;
    if (current.revision !== input.expected_revision) {
      fail('FoundryRun revision compare-and-swap failed.', {
        expected_revision: input.expected_revision,
        actual_revision: current.revision,
      });
    }
    const next = [...events, clone(input.event)];
    verifyFoundryEventChain(next);
    this.#runs.set(input.event.run_id, next);
    if (FOUNDRY_TERMINAL_STATES.has(input.event.to_state)) this.#targetLocks.delete(input.target_key);
    return clone(input.event);
  }

  async read(runId: string) {
    return clone(this.#runs.get(runId) ?? []);
  }

  async list(): Promise<FoundryRunSnapshot[]> {
    return [...this.#runs.values()].map((events) => snapshotFromEvents(clone(events)));
  }
}

export class DeterministicInMemoryCandidateCompiler implements CandidateCompiler {
  async materialize(input: {
    run_id: string;
    blueprint: Parameters<CandidateCompiler['materialize']>[0]['blueprint'];
    blueprint_digest: string;
  }): Promise<MaterializedCandidate> {
    const manifest = {
      surface_kind: 'opl_materialized_agent_manifest',
      target_agent_id: input.blueprint.target_agent_id,
      target_domain_id: input.blueprint.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      stages: input.blueprint.stage_graph.stages,
      actions: input.blueprint.actions,
      artifact_contracts: input.blueprint.artifact_contracts,
      content_refs: input.blueprint.content_refs,
      authority_policy: input.blueprint.authority_policy,
      memory_policy: input.blueprint.memory_policy,
    };
    const manifestDigest = internalDigest(manifest);
    const candidateDigest = internalDigest({ manifest_digest: manifestDigest, manifest });
    return {
      surface_kind: 'opl_foundry_materialized_candidate',
      target_agent_id: input.blueprint.target_agent_id,
      target_domain_id: input.blueprint.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: candidateDigest,
      candidate_ref: `foundry-candidate:${candidateDigest}`,
      manifest_digest: manifestDigest,
    };
  }
}

type RegistryState = {
  versions: AgentVersion[];
  qualifications: QualificationRecord[];
  activation: ActivationPointer;
  transactions: ActivationTransaction[];
};

function registryKey(agentId: string, domainId: string) {
  return `${agentId}\u0000${domainId}`;
}

export class InMemoryVersionRegistry implements VersionRegistry {
  readonly #targets = new Map<string, RegistryState>();

  #state(agentId: string, domainId: string) {
    const key = registryKey(agentId, domainId);
    let state = this.#targets.get(key);
    if (!state) {
      state = {
        versions: [],
        qualifications: [],
        transactions: [],
        activation: {
          surface_kind: 'opl_foundry_activation_pointer',
          target_agent_id: agentId,
          target_domain_id: domainId,
          active_version_digest: null,
          revision: 0,
          updated_at: null,
        },
      };
      this.#targets.set(key, state);
    }
    return state;
  }

  async register(input: Parameters<VersionRegistry['register']>[0]) {
    const state = this.#state(input.target_agent_id, input.target_domain_id);
    const qualificationBase = {
      surface_kind: 'opl_foundry_qualification_record' as const,
      qualification_id: `qualification:${input.target_agent_id}:${input.candidate.candidate_digest}`,
      target_agent_id: input.target_agent_id,
      target_domain_id: input.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      evidence_digest: input.evidence_digest,
      risk_tier: input.risk_tier,
      qualified_at: input.qualified_at,
    };
    const qualificationDigest = internalDigest(qualificationBase);
    const versionBase = {
      surface_kind: 'opl_foundry_agent_version' as const,
      version_id: `version:${input.target_agent_id}:${input.candidate.candidate_digest}`,
      target_agent_id: input.target_agent_id,
      target_domain_id: input.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      candidate_ref: input.candidate.candidate_ref,
      qualification_digest: qualificationDigest,
      created_at: input.qualified_at,
    };
    const version: AgentVersion = { ...versionBase, version_digest: internalDigest(versionBase) };
    const qualification: QualificationRecord = {
      ...qualificationBase,
      qualification_digest: qualificationDigest,
    };
    const existing = state.versions.find((entry) => entry.candidate_digest === input.candidate.candidate_digest);
    if (existing) {
      const existingQualification = state.qualifications.find(
        (entry) => entry.qualification_digest === existing.qualification_digest,
      ) ?? fail('Version qualification record is missing.', { version_digest: existing.version_digest });
      if (
        canonicalJsonText(existing) !== canonicalJsonText(version)
        || canonicalJsonText(existingQualification) !== canonicalJsonText(qualification)
      ) {
        fail('Candidate digest is already registered with different immutable metadata.', {
          candidate_digest: input.candidate.candidate_digest,
        });
      }
      return { version: clone(existing), qualification: clone(existingQualification) };
    }
    state.versions.push(version);
    state.qualifications.push(qualification);
    return { version: clone(version), qualification: clone(qualification) };
  }

  async list(targetAgentId: string, targetDomainId: string) {
    return clone(this.#state(targetAgentId, targetDomainId).versions);
  }

  async resolveVersion(ref: string | null, targetAgentId: string, targetDomainId: string) {
    const state = this.#state(targetAgentId, targetDomainId);
    if (!ref) {
      const active = state.activation.active_version_digest;
      return clone(state.versions.find((entry) => entry.version_digest === active) ?? null);
    }
    return clone(state.versions.find((entry) => entry.version_digest === ref) ?? null);
  }

  async activation(targetAgentId: string, targetDomainId: string) {
    return clone(this.#state(targetAgentId, targetDomainId).activation);
  }

  async compareAndSwapActivation(input: Parameters<VersionRegistry['compareAndSwapActivation']>[0]) {
    return this.#activate({ ...input, transaction_kind: 'activate' });
  }

  async rollback(input: Parameters<VersionRegistry['rollback']>[0]) {
    return this.#activate({ ...input, transaction_kind: 'rollback' });
  }

  #activate(input: {
    target_agent_id: string;
    target_domain_id: string;
    expected_revision: number;
    version_digest: string;
    occurred_at: string;
    authority_receipt_ref: string | null;
    transaction_kind: 'activate' | 'rollback';
  }) {
    const state = this.#state(input.target_agent_id, input.target_domain_id);
    const replay = state.transactions.find((entry) =>
      entry.transaction_kind === input.transaction_kind
      && entry.previous_revision === input.expected_revision
      && entry.to_version_digest === input.version_digest
      && entry.authority_receipt_ref === input.authority_receipt_ref);
    if (replay) return clone(replay);
    if (state.activation.revision !== input.expected_revision) {
      fail('ActivationPointer compare-and-swap failed.', {
        expected_revision: input.expected_revision,
        actual_revision: state.activation.revision,
      });
    }
    if (!state.versions.some((entry) => entry.version_digest === input.version_digest)) {
      fail('Activation target version does not exist.', { version_digest: input.version_digest });
    }
    const transaction: ActivationTransaction = {
      surface_kind: 'opl_foundry_activation_transaction',
      transaction_id: `activation:${input.target_agent_id}:${state.transactions.length + 1}`,
      transaction_kind: input.transaction_kind,
      target_agent_id: input.target_agent_id,
      target_domain_id: input.target_domain_id,
      from_version_digest: state.activation.active_version_digest,
      to_version_digest: input.version_digest,
      previous_revision: state.activation.revision,
      next_revision: state.activation.revision + 1,
      authority_receipt_ref: input.authority_receipt_ref,
      occurred_at: input.occurred_at,
    };
    state.activation = {
      ...state.activation,
      active_version_digest: input.version_digest,
      revision: transaction.next_revision,
      updated_at: input.occurred_at,
    };
    state.transactions.push(transaction);
    return clone(transaction);
  }
}
