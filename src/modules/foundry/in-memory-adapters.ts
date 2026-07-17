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
  ActivationRuntime,
  ActivationRuntimeBindingVerification,
  ActivationRuntimePreflight,
  ActivationRuntimeReadback,
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
import {
  assertFoundryEventReplay,
  FOUNDRY_TERMINAL_STATES,
  snapshotFromEvents,
  verifyFoundryEventChain,
} from './state-machine.ts';
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
  readonly #policies = new Map<string, {
    policy_ref: string;
    authority_refs: string[];
  }>();
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  registerAuthorityPolicy(input: {
    policy_ref: string;
    target_agent_id: string;
    target_domain_id: string;
    authority_refs: string[];
  }) {
    const policyRef = input.policy_ref.trim();
    const targetAgentId = input.target_agent_id.trim();
    const targetDomainId = input.target_domain_id.trim();
    const authorityRefs = input.authority_refs.map((entry) => entry.trim()).filter(Boolean);
    if (!policyRef || !targetAgentId || !targetDomainId || authorityRefs.length === 0) {
      fail('In-memory OwnerGate authority policy is incomplete.');
    }
    if (authorityRefs.length !== input.authority_refs.length || new Set(authorityRefs).size !== authorityRefs.length) {
      fail('In-memory OwnerGate authority policy refs must be non-empty and unique.');
    }
    const key = `${targetAgentId}\u0000${targetDomainId}`;
    const policy = { policy_ref: policyRef, authority_refs: authorityRefs };
    const existing = this.#policies.get(key);
    if (existing && canonicalJsonText(existing) !== canonicalJsonText(policy)) {
      fail('In-memory OwnerGate target already has a different Framework authority policy.', {
        target_agent_id: targetAgentId,
        target_domain_id: targetDomainId,
      });
    }
    this.#policies.set(key, clone(policy));
    return clone(policy);
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
    const policy = this.#policies.get(`${context.target_agent_id}\u0000${context.target_domain_id}`)
      ?? fail('Framework-owned target authority policy is not registered with the in-memory OwnerGate.', {
        target_agent_id: context.target_agent_id,
        target_domain_id: context.target_domain_id,
      });
    if (!policy.authority_refs.includes(receipt.authority_ref)) {
      fail('Owner authority receipt is not allowed by the Framework-owned target authority policy.', {
        authority_ref: receipt.authority_ref,
        authority_policy_ref: policy.policy_ref,
      });
    }
    return validateOwnerGateVerification(context, {
      surface_kind: 'opl_foundry_owner_gate_verification',
      version: 'opl-foundry-owner-gate-verification.v1',
      verifier_id: 'foundry-owner-gate:in-memory',
      verification_ref: `opl://foundry/owner-gate-verifications/${internalDigest({
        verifier_id: 'foundry-owner-gate:in-memory',
        authority_policy_ref: policy.policy_ref,
        receipt_digest: receipt.receipt_digest,
      })}`,
      authority_policy_ref: policy.policy_ref,
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
    if (replay) return clone(assertFoundryEventReplay(replay, input.event, input.expected_revision));
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

function assertActivationRuntimeBindingVerification(input: {
  verification: ActivationRuntimeBindingVerification;
  transaction_kind: ActivationTransaction['transaction_kind'];
  expected_revision: number;
  version: AgentVersion;
}) {
  if (!input.verification || typeof input.verification !== 'object' || Array.isArray(input.verification)) {
    fail('Activation runtime binding verification must be an object.');
  }
  const verification = input.verification as ActivationRuntimeBindingVerification;
  const expectedFields = [
    'surface_kind', 'version', 'verification_phase', 'transaction_kind', 'target_agent_id',
    'target_domain_id', 'version_id', 'version_digest', 'candidate_digest', 'candidate_ref',
    'expected_activation_revision', 'preflight_ref', 'runtime_binding_ref',
  ].sort();
  if (canonicalJsonText(Object.keys(verification).sort()) !== canonicalJsonText(expectedFields)) {
    fail('Activation runtime binding verification fields are invalid.');
  }
  if (
    verification.surface_kind !== 'opl_foundry_activation_runtime_binding_verification'
    || verification.version !== 'opl-foundry-activation-runtime-binding-verification.v1'
    || verification.verification_phase !== 'pre_commit'
  ) {
    fail('Activation runtime binding verification surface is invalid.');
  }
  if (verification.transaction_kind !== input.transaction_kind) {
    fail('Activation runtime binding verification transaction kind is invalid.');
  }
  if (
    verification.target_agent_id !== input.version.target_agent_id
    || verification.target_domain_id !== input.version.target_domain_id
  ) {
    fail('Activation runtime binding verification target identity is invalid.');
  }
  if (
    verification.version_id !== input.version.version_id
    || verification.version_digest !== input.version.version_digest
    || verification.candidate_digest !== input.version.candidate_digest
    || verification.candidate_ref !== input.version.candidate_ref
  ) {
    fail('Activation runtime binding verification does not match the exact AgentVersion.');
  }
  if (verification.expected_activation_revision !== input.expected_revision) {
    fail('Activation runtime binding verification expected revision is invalid.');
  }
  if (
    typeof verification.preflight_ref !== 'string'
    || verification.preflight_ref.length === 0
    || typeof verification.runtime_binding_ref !== 'string'
    || verification.runtime_binding_ref.length === 0
  ) {
    fail('Activation runtime binding verification prepared runtime binding ref is invalid.');
  }
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

  async activationHistory(targetAgentId: string, targetDomainId: string) {
    return clone(this.#state(targetAgentId, targetDomainId).transactions);
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
    runtime_binding_verification: ActivationRuntimeBindingVerification;
    transaction_kind: 'activate' | 'rollback';
  }) {
    const state = this.#state(input.target_agent_id, input.target_domain_id);
    const targetVersion = state.versions.find((entry) => entry.version_digest === input.version_digest)
      ?? fail('Activation target version does not exist.', { version_digest: input.version_digest });
    assertActivationRuntimeBindingVerification({
      verification: input.runtime_binding_verification,
      transaction_kind: input.transaction_kind,
      expected_revision: input.expected_revision,
      version: targetVersion,
    });
    const replay = state.transactions.find((entry) => entry.previous_revision === input.expected_revision);
    if (replay) {
      if (
        replay.transaction_kind !== input.transaction_kind
        || replay.to_version_digest !== input.version_digest
        || replay.authority_receipt_ref !== input.authority_receipt_ref
        || canonicalJsonText(replay.runtime_binding_verification)
          !== canonicalJsonText(input.runtime_binding_verification)
      ) {
        fail('Activation transaction replay conflicts with immutable history.', {
          expected_revision: input.expected_revision,
          transaction_id: replay.transaction_id,
        });
      }
      return clone(replay);
    }
    if (state.activation.revision !== input.expected_revision) {
      fail('ActivationPointer compare-and-swap failed.', {
        expected_revision: input.expected_revision,
        actual_revision: state.activation.revision,
      });
    }
    if (input.transaction_kind === 'rollback') {
      if (state.activation.active_version_digest === input.version_digest) {
        fail('Rollback target version is already active.', { version_digest: input.version_digest });
      }
      if (!state.transactions.some((entry) => entry.to_version_digest === input.version_digest)) {
        fail('Rollback target version has never been active.', { version_digest: input.version_digest });
      }
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
      runtime_binding_verification: clone(input.runtime_binding_verification),
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

function assertExactAgentVersion(expected: AgentVersion, actual: AgentVersion | null, label: string) {
  if (!actual || canonicalJsonText(actual) !== canonicalJsonText(expected)) {
    fail(`${label} does not resolve the exact AgentVersion identity.`, {
      version_digest: expected.version_digest,
      target_agent_id: expected.target_agent_id,
      target_domain_id: expected.target_domain_id,
    });
  }
}

export class FailClosedActivationRuntime implements ActivationRuntime {
  async preflight(): Promise<ActivationRuntimePreflight> {
    return fail('Foundry activation requires an explicit hosted ActivationRuntime.');
  }

  async readback(): Promise<ActivationRuntimeReadback> {
    return fail('Foundry activation requires an explicit hosted ActivationRuntime.');
  }
}

export class InMemoryActivationRuntime implements ActivationRuntime {
  readonly #versions: VersionRegistry;

  constructor(versions: VersionRegistry) {
    this.#versions = versions;
  }

  async preflight(input: Parameters<ActivationRuntime['preflight']>[0]) {
    const resolved = await this.#versions.resolveVersion(
      input.version.version_digest,
      input.version.target_agent_id,
      input.version.target_domain_id,
    );
    assertExactAgentVersion(input.version, resolved, 'Activation runtime preflight');
    const record = {
      surface_kind: 'opl_foundry_activation_runtime_preflight' as const,
      version: 'opl-foundry-activation-runtime-preflight.v1' as const,
      transaction_kind: input.transaction_kind,
      target_agent_id: input.version.target_agent_id,
      target_domain_id: input.version.target_domain_id,
      version_id: input.version.version_id,
      version_digest: input.version.version_digest,
      candidate_digest: input.version.candidate_digest,
      candidate_ref: input.version.candidate_ref,
      expected_activation_revision: input.expected_activation_revision,
    };
    return {
      ...record,
      preflight_ref: `opl://foundry/in-memory-activation-preflights/${internalDigest(record)}`,
    };
  }

  async readback(input: Parameters<ActivationRuntime['readback']>[0]) {
    const resolved = await this.#versions.resolveVersion(
      input.version.version_digest,
      input.version.target_agent_id,
      input.version.target_domain_id,
    );
    assertExactAgentVersion(input.version, resolved, 'Activation runtime readback');
    const activation = await this.#versions.activation(
      input.version.target_agent_id,
      input.version.target_domain_id,
    );
    if (
      input.transaction.target_agent_id !== input.version.target_agent_id
      || input.transaction.target_domain_id !== input.version.target_domain_id
      || input.transaction.to_version_digest !== input.version.version_digest
      || activation.target_agent_id !== input.version.target_agent_id
      || activation.target_domain_id !== input.version.target_domain_id
      || activation.active_version_digest !== input.version.version_digest
      || activation.revision !== input.transaction.next_revision
      || activation.updated_at !== input.transaction.occurred_at
    ) {
      fail('Activation runtime readback does not match the exact committed transaction.', {
        transaction_id: input.transaction.transaction_id,
        expected_version_digest: input.version.version_digest,
        active_version_digest: activation.active_version_digest,
        expected_activation_revision: input.transaction.next_revision,
        actual_activation_revision: activation.revision,
      });
    }
    const record = {
      surface_kind: 'opl_foundry_activation_runtime_readback' as const,
      version: 'opl-foundry-activation-runtime-readback.v1' as const,
      transaction_kind: input.transaction.transaction_kind,
      target_agent_id: input.version.target_agent_id,
      target_domain_id: input.version.target_domain_id,
      active_version_id: input.version.version_id,
      active_version_digest: input.version.version_digest,
      candidate_digest: input.version.candidate_digest,
      candidate_ref: input.version.candidate_ref,
      activation_revision: input.transaction.next_revision,
    };
    return {
      ...record,
      runtime_binding_ref: `opl://foundry/in-memory-runtime-bindings/${internalDigest(record)}`,
    };
  }
}
