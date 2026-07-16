import crypto from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type {
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
  EvolutionProposal,
  FoundryRiskTier,
} from './protocol.ts';
import {
  assertSameTarget,
  foundryContentDigest,
  validateAgentBlueprint,
  validateDesignRequest,
  validateEvidenceBundle,
  validateEvolutionProposal,
} from './protocol.ts';
import type {
  AgentVersion,
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryClock,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  OwnerGate,
  OwnerGateAction,
  OwnerGateDecision,
  OwnerGateVerification,
  OwnerGateVerificationContext,
  VersionRegistry,
} from './ports.ts';
import {
  FailClosedOwnerGate,
  ownerAuthorityReceiptRef,
  validateOwnerGateVerification,
  validateOwnerGateVerificationContext,
} from './owner-gate.ts';
import {
  assertEvaluationPolicyNonWeakening,
  maximumRiskTier,
  ownerGatePolicy,
  recomputeBlueprintRisk,
} from './risk-policy.ts';
import {
  buildFoundryEvent,
  FOUNDRY_TERMINAL_STATES,
  snapshotFromEvents,
} from './state-machine.ts';
import type { FoundryRunSnapshot, FoundryRunState } from './state-machine.ts';
import {
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  foundryFrozenEvaluationPlanDigest,
} from './evaluation-runtime.ts';
import {
  foundryEvaluationOperationIdentity,
  type FoundryOperationResult,
  type FoundryOperationResultJournal,
} from './operation-result.ts';
import { InMemoryFoundryOperationResultJournal } from './in-memory-adapters.ts';

type KernelDependencies = {
  designer: DesignerPort;
  compiler: CandidateCompiler;
  evaluator: EvaluationExecutor;
  objects: FoundryObjectStore;
  events: FoundryEventStore;
  versions: VersionRegistry;
  operationResults?: FoundryOperationResultJournal;
  ownerGate?: OwnerGate;
  clock?: FoundryClock;
  createRunId?: () => string;
  activityMaxAttempts?: number;
  propagateTransientActivityFailures?: boolean;
};

export type FoundryRunInspection = {
  run: FoundryRunSnapshot;
  request: DesignRequest;
  activation: Awaited<ReturnType<VersionRegistry['activation']>>;
};

export type OwnerDecision = {
  run_id: string;
  expected_revision: number;
  decision: 'approve' | 'reject';
  authority_receipt_ref: string;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function systemClock(): FoundryClock {
  return { now: () => new Date().toISOString() };
}

function targetKey(request: Pick<DesignRequest, 'target_agent_id' | 'target_domain_id'>) {
  return `${request.target_agent_id}\u0000${request.target_domain_id}`;
}

function requiredRef(value: unknown, field: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) fail(`${field} must be a non-empty authority ref.`);
  return normalized;
}

function expectedRevision(value: unknown, field = 'expected_revision') {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${field} must be a non-negative safe integer.`, { actual: value });
  }
  return Number(value);
}

function requiredDigest(value: unknown, field: string) {
  const digest = requiredRef(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail(`${field} must be a SHA-256 digest.`);
  return digest;
}

function isContractFailure(error: unknown) {
  return error instanceof FrameworkContractError;
}

export class FoundryTransientActivityError extends Error {
  readonly retryable = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FoundryTransientActivityError';
  }
}

export class FoundryOperationResultUnavailableError extends Error {
  readonly operation_key: string;

  constructor(operationKey: string) {
    super(`Foundry operation result ${operationKey} is not durably journaled.`);
    this.name = 'FoundryOperationResultUnavailableError';
    this.operation_key = operationKey;
  }
}

export type FoundryAdvanceRunStepOptions = {
  operation_key?: string;
  replay_only?: boolean;
};

function isTransientActivityFailure(error: unknown): error is FoundryTransientActivityError {
  return error instanceof FoundryTransientActivityError;
}

export class FoundryKernel {
  readonly #designer: DesignerPort;
  readonly #compiler: CandidateCompiler;
  readonly #evaluator: EvaluationExecutor;
  readonly #objects: FoundryObjectStore;
  readonly #events: FoundryEventStore;
  readonly #versions: VersionRegistry;
  readonly #operationResults: FoundryOperationResultJournal;
  readonly #ownerGate: OwnerGate;
  readonly #clock: FoundryClock;
  readonly #createRunId: () => string;
  readonly #activityMaxAttempts: number;
  readonly #propagateTransientActivityFailures: boolean;

  constructor(dependencies: KernelDependencies) {
    if (dependencies.designer.producer_id === dependencies.evaluator.evaluator_id) {
      fail('Foundry designer and evaluator must use independent producer identities.');
    }
    this.#designer = dependencies.designer;
    this.#compiler = dependencies.compiler;
    this.#evaluator = dependencies.evaluator;
    this.#objects = dependencies.objects;
    this.#events = dependencies.events;
    this.#versions = dependencies.versions;
    this.#operationResults = dependencies.operationResults ?? new InMemoryFoundryOperationResultJournal();
    this.#ownerGate = dependencies.ownerGate ?? new FailClosedOwnerGate();
    this.#clock = dependencies.clock ?? systemClock();
    this.#createRunId = dependencies.createRunId ?? (() => `foundry_${crypto.randomUUID()}`);
    this.#activityMaxAttempts = dependencies.activityMaxAttempts ?? 3;
    this.#propagateTransientActivityFailures = dependencies.propagateTransientActivityFailures ?? false;
    if (!Number.isSafeInteger(this.#activityMaxAttempts) || this.#activityMaxAttempts < 1 || this.#activityMaxAttempts > 3) {
      fail('Foundry activity retry budget must be an integer from 1 to 3.');
    }
  }

  async startRun(input: { request: unknown; run_id?: string }): Promise<FoundryRunSnapshot> {
    const request = validateDesignRequest(input.request);
    const requestDigest = foundryContentDigest(request);
    const stored = await this.#objects.put(request);
    if (stored.digest !== requestDigest) fail('Foundry object store changed DesignRequest bytes.');
    const runId = input.run_id?.trim() || this.#createRunId();
    if (!runId) fail('FoundryRun id must not be empty.');
    const existingEvents = await this.#events.read(runId);
    if (existingEvents.length > 0) {
      const existing = snapshotFromEvents(existingEvents);
      if (existing.request_digest !== requestDigest) {
        fail('FoundryRun id is already bound to a different DesignRequest.', {
          run_id: runId,
          expected_request_digest: requestDigest,
          actual_request_digest: existing.request_digest,
        });
      }
      return existing;
    }
    const baseline = await this.#resolveBaseline(request);
    const activation = await this.#versions.activation(request.target_agent_id, request.target_domain_id);
    if (request.mode === 'create' && baseline) fail('Create mode must not bind a baseline version.');
    if (request.mode !== 'create' && !baseline) {
      fail('Takeover and improve modes require an existing exact target version.', {
        target_version_ref: request.target_version_ref,
      });
    }
    const event = buildFoundryEvent({
      runId,
      revision: 1,
      eventType: 'foundry_run_accepted',
      fromState: null,
      toState: 'accepted',
      occurredAt: this.#clock.now(),
      idempotencyKey: `${runId}/0/accepted/${requestDigest}`,
      previousEventHash: null,
      payload: {
        target_agent_id: request.target_agent_id,
        target_domain_id: request.target_domain_id,
        request_digest: requestDigest,
        activation_revision_at_start: activation.revision,
        generation: 0,
      },
    });
    await this.#events.create({ target_key: targetKey(request), event });
    return snapshotFromEvents([event]);
  }

  async inspectRun(runId: string): Promise<FoundryRunInspection> {
    const events = await this.#events.read(runId);
    if (events.length === 0) fail('FoundryRun does not exist.', { run_id: runId });
    const run = snapshotFromEvents(events);
    const request = await this.#object<DesignRequest>(run.request_digest, 'DesignRequest');
    return {
      run,
      request,
      activation: await this.#versions.activation(request.target_agent_id, request.target_domain_id),
    };
  }

  async advanceUntilPause(runId: string): Promise<FoundryRunInspection> {
    for (let transitions = 0; transitions < 64; transitions += 1) {
      const inspection = await this.inspectRun(runId);
      if (
        FOUNDRY_TERMINAL_STATES.has(inspection.run.state)
        || inspection.run.state === 'awaiting_owner_canary'
        || inspection.run.state === 'awaiting_owner_active'
      ) {
        return inspection;
      }
      await this.advanceRunStep(runId);
    }
    fail('FoundryRun exceeded the bounded transition loop.', { run_id: runId });
  }

  async advanceRunStep(
    runId: string,
    options: FoundryAdvanceRunStepOptions = {},
  ): Promise<FoundryRunInspection> {
    const inspection = await this.inspectRun(runId);
    if (
      FOUNDRY_TERMINAL_STATES.has(inspection.run.state)
      || inspection.run.state === 'awaiting_owner_canary'
      || inspection.run.state === 'awaiting_owner_active'
    ) {
      return inspection;
    }
    try {
      await this.#advanceOne(inspection, options);
    } catch (error) {
      if (error instanceof FoundryOperationResultUnavailableError) throw error;
      if (this.#propagateTransientActivityFailures && isTransientActivityFailure(error)) {
        throw error;
      }
      await this.#terminateAfterFailure(inspection, error);
    }
    return this.inspectRun(runId);
  }

  async submitOwnerDecision(
    input: OwnerDecision,
    options: { advance?: boolean } = {},
  ): Promise<FoundryRunInspection> {
    if (input.decision !== 'approve' && input.decision !== 'reject') {
      fail('Foundry Owner decision must be approve or reject.');
    }
    const expected = expectedRevision(input.expected_revision);
    const authorityRef = requiredRef(input.authority_receipt_ref, 'authority_receipt_ref');
    const inspection = await this.inspectRun(input.run_id);
    if (inspection.run.revision !== expected) {
      const replay = (await this.#events.read(input.run_id)).find((event) =>
        event.revision === expected + 1
        && event.event_type === (input.decision === 'reject' ? 'owner_rejected' : 'owner_approved')
        && event.payload.owner_authority_receipt_ref === authorityRef
        && typeof event.payload.owner_authority_receipt_digest === 'string');
      if (replay) {
        return input.decision === 'approve' && options.advance !== false
          ? this.advanceUntilPause(input.run_id)
          : this.inspectRun(input.run_id);
      }
      fail('FoundryRun owner decision revision compare-and-swap failed.', {
        expected_revision: expected,
        actual_revision: inspection.run.revision,
      });
    }
    if (inspection.run.state !== 'awaiting_owner_canary' && inspection.run.state !== 'awaiting_owner_active') {
      fail('FoundryRun is not waiting for an Owner decision.', { state: inspection.run.state });
    }
    const blueprint = await this.#blueprint(inspection);
    const version = await this.#version(inspection);
    if (version.blueprint_digest !== inspection.run.blueprint_digest) {
      fail('Owner decision AgentVersion does not bind the current AgentBlueprint.');
    }
    const action = this.#ownerDecisionAction(inspection.run.state, input.decision);
    const verification = await this.#verifyOwnerAuthority({
      authority_receipt_ref: authorityRef,
      action,
      decision: input.decision,
      target_agent_id: inspection.request.target_agent_id,
      target_domain_id: inspection.request.target_domain_id,
      run_id: inspection.run.run_id,
      version_digest: version.version_digest,
      expected_revision: expected,
      allowed_authority_refs: this.#ownerGateRefs(blueprint),
    });
    const toState = input.decision === 'reject'
      ? 'rejected'
      : inspection.run.state === 'awaiting_owner_canary' ? 'canary' : 'activating';
    await this.#append(inspection, {
      eventType: input.decision === 'reject' ? 'owner_rejected' : 'owner_approved',
      toState,
      phase: `owner_${input.decision}`,
      inputDigest: verification.receipt.receipt_digest,
      payload: this.#ownerVerificationPayload(verification),
    });
    return input.decision === 'approve' && options.advance !== false
      ? this.advanceUntilPause(input.run_id)
      : this.inspectRun(input.run_id);
  }

  async cancelRun(input: {
    run_id: string;
    expected_revision: number;
    authority_receipt_ref: string;
  }): Promise<FoundryRunInspection> {
    const expected = expectedRevision(input.expected_revision);
    const authorityRef = requiredRef(input.authority_receipt_ref, 'authority_receipt_ref');
    const inspection = await this.inspectRun(input.run_id);
    if (inspection.run.revision !== expected) {
      const replay = (await this.#events.read(input.run_id)).find((event) =>
        event.revision === expected + 1
        && event.event_type === 'foundry_run_cancelled'
        && event.payload.owner_authority_receipt_ref === authorityRef
        && typeof event.payload.owner_authority_receipt_digest === 'string');
      if (replay) return this.inspectRun(input.run_id);
      fail('FoundryRun cancellation revision compare-and-swap failed.', {
        expected_revision: expected,
        actual_revision: inspection.run.revision,
      });
    }
    if (FOUNDRY_TERMINAL_STATES.has(inspection.run.state)) {
      fail('A terminal FoundryRun cannot be cancelled.', { state: inspection.run.state });
    }
    const blueprint = await this.#blueprint(inspection);
    const verification = await this.#verifyOwnerAuthority({
      authority_receipt_ref: authorityRef,
      action: 'cancel',
      decision: 'cancel',
      target_agent_id: inspection.request.target_agent_id,
      target_domain_id: inspection.request.target_domain_id,
      run_id: inspection.run.run_id,
      version_digest: inspection.run.version_digest,
      expected_revision: expected,
      allowed_authority_refs: this.#ownerGateRefs(blueprint),
    });
    await this.#append(inspection, {
      eventType: 'foundry_run_cancelled',
      toState: 'cancelled',
      phase: 'cancel',
      inputDigest: verification.receipt.receipt_digest,
      payload: this.#ownerVerificationPayload(verification),
    });
    return this.inspectRun(input.run_id);
  }

  async failRun(input: {
    run_id: string;
    failure_code: string;
    failure_message: string;
  }): Promise<FoundryRunInspection> {
    const inspection = await this.inspectRun(input.run_id);
    if (FOUNDRY_TERMINAL_STATES.has(inspection.run.state)) return inspection;
    await this.#append(inspection, {
      eventType: 'foundry_run_failed',
      toState: 'failed',
      phase: 'failure',
      inputDigest: foundryContentDigest({
        surface_kind: 'opl_foundry_failure_identity',
        target_agent_id: inspection.request.target_agent_id,
        target_domain_id: inspection.request.target_domain_id,
        target_version_ref: inspection.request.target_version_ref,
        error_kind: 'runtime',
        state: inspection.run.state,
      }),
      payload: {
        failure_code: requiredRef(input.failure_code, 'failure_code'),
        failure_message: requiredRef(input.failure_message, 'failure_message'),
      },
    });
    return this.inspectRun(input.run_id);
  }

  async listVersions(targetAgentId: string, targetDomainId: string) {
    return this.#versions.list(targetAgentId, targetDomainId);
  }

  async rollbackActivation(input: {
    target_agent_id: string;
    target_domain_id: string;
    version_digest: string;
    expected_revision: number;
    authority_receipt_ref: string;
  }) {
    const targetAgentId = requiredRef(input.target_agent_id, 'target_agent_id');
    const targetDomainId = requiredRef(input.target_domain_id, 'target_domain_id');
    const versionDigest = requiredDigest(input.version_digest, 'version_digest');
    const expected = expectedRevision(input.expected_revision);
    const authorityRef = requiredRef(input.authority_receipt_ref, 'authority_receipt_ref');
    const version = await this.#versions.resolveVersion(versionDigest, targetAgentId, targetDomainId)
      ?? fail('Rollback target AgentVersion does not exist.', { version_digest: versionDigest });
    if (version.version_digest !== versionDigest
      || version.target_agent_id !== targetAgentId
      || version.target_domain_id !== targetDomainId) {
      fail('Rollback target AgentVersion identity is invalid.');
    }
    const blueprint = validateAgentBlueprint(
      await this.#object<AgentBlueprint>(version.blueprint_digest, 'rollback AgentBlueprint'),
    );
    if (foundryContentDigest(blueprint) !== version.blueprint_digest
      || blueprint.target_agent_id !== targetAgentId
      || blueprint.target_domain_id !== targetDomainId) {
      fail('Rollback AgentBlueprint does not bind the exact target AgentVersion.');
    }
    const verification = await this.#verifyOwnerAuthority({
      authority_receipt_ref: authorityRef,
      action: 'rollback',
      decision: 'rollback',
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      run_id: null,
      version_digest: versionDigest,
      expected_revision: expected,
      allowed_authority_refs: this.#ownerGateRefs(blueprint),
    });
    return this.#versions.rollback({
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      version_digest: versionDigest,
      expected_revision: expected,
      authority_receipt_ref: verification.receipt.receipt_ref,
      occurred_at: this.#clock.now(),
    });
  }

  async #advanceOne(inspection: FoundryRunInspection, options: FoundryAdvanceRunStepOptions) {
    switch (inspection.run.state) {
      case 'accepted':
        return this.#append(inspection, {
          eventType: 'design_started',
          toState: 'designing',
          phase: 'design',
          inputDigest: inspection.run.request_digest,
        });
      case 'designing':
        return this.#design(inspection);
      case 'materializing':
        return this.#materialize(inspection);
      case 'evaluating':
        return this.#evaluate(inspection, false, options);
      case 'evidence_ready':
        return this.#append(inspection, {
          eventType: 'diagnosis_started',
          toState: 'diagnosing',
          phase: 'diagnose',
          inputDigest: inspection.run.evidence_digest ?? inspection.run.last_event_hash,
        });
      case 'diagnosing':
        return this.#diagnose(inspection);
      case 'qualified':
        return this.#afterQualification(inspection);
      case 'canary':
        return this.#evaluate(inspection, true, options);
      case 'activating':
        return this.#activate(inspection);
      default:
        fail('FoundryRun state cannot be advanced automatically.', { state: inspection.run.state });
    }
  }

  async #design(inspection: FoundryRunInspection) {
    const blueprint = validateAgentBlueprint(await this.#activity('design', () => this.#designer.design(
      inspection.request,
      {
        run_id: inspection.run.run_id,
        iteration: 0,
        phase: 'design',
        input_digest: inspection.run.request_digest,
      },
    )));
    assertSameTarget(inspection.request, blueprint, 'AgentBlueprint');
    if (blueprint.design_request_digest !== inspection.run.request_digest || blueprint.generation !== 0) {
      fail('Initial AgentBlueprint is stale or has the wrong generation.');
    }
    assertBlueprintSatisfiesDesignRequest(inspection.request, blueprint);
    const stored = await this.#objects.put(blueprint);
    const previous = await this.#baselineBlueprint(inspection.request);
    const risk = recomputeBlueprintRisk(previous, blueprint);
    return this.#append(inspection, {
      eventType: 'blueprint_admitted',
      toState: 'materializing',
      phase: 'blueprint',
      inputDigest: inspection.run.request_digest,
      payload: {
        blueprint_digest: stored.digest,
        previous_blueprint_digest: previous ? foundryContentDigest(previous) : null,
        risk_tier: inspection.run.risk_tier
          ? maximumRiskTier(inspection.run.risk_tier, risk.risk_tier)
          : risk.risk_tier,
        risk_reasons: risk.reasons,
        generation: 0,
      },
    });
  }

  async #materialize(inspection: FoundryRunInspection) {
    const blueprint = await this.#blueprint(inspection);
    const candidate = await this.#activity('materialize', () => this.#compiler.materialize({
      run_id: inspection.run.run_id,
      blueprint,
      blueprint_digest: inspection.run.blueprint_digest!,
    }));
    this.#assertCandidate(inspection, candidate);
    const storedCandidate = await this.#objects.put(candidate);
    if (storedCandidate.digest !== foundryContentDigest(candidate)) {
      fail('Foundry object store changed the materialized candidate record.');
    }
    return this.#append(inspection, {
      eventType: 'candidate_materialized',
      toState: 'evaluating',
      phase: 'materialize',
      inputDigest: inspection.run.blueprint_digest!,
      payload: {
        candidate_digest: candidate.candidate_digest,
        candidate_record_digest: storedCandidate.digest,
      },
    });
  }

  async #evaluate(
    inspection: FoundryRunInspection,
    canary: boolean,
    options: FoundryAdvanceRunStepOptions,
  ) {
    const blueprint = await this.#blueprint(inspection);
    const candidate = await this.#candidate(inspection);
    this.#assertCandidate(inspection, candidate);
    const baseline = await this.#resolveBaseline(inspection.request);
    const qualifiedVersion = canary ? await this.#version(inspection) : null;
    if (qualifiedVersion && (
      qualifiedVersion.target_agent_id !== candidate.target_agent_id
      || qualifiedVersion.target_domain_id !== candidate.target_domain_id
      || qualifiedVersion.blueprint_digest !== candidate.blueprint_digest
      || qualifiedVersion.candidate_digest !== candidate.candidate_digest
      || qualifiedVersion.candidate_ref !== candidate.candidate_ref
    )) {
      fail('Canary AgentVersion does not bind the qualified materialized candidate.');
    }
    const operation = foundryEvaluationOperationIdentity({
      run_id: inspection.run.run_id,
      generation: inspection.run.generation,
      phase: canary ? 'canary' : 'evaluate',
      input_digest: inspection.run.last_event_hash,
    });
    if (options.operation_key && options.operation_key !== operation.operation_key) {
      fail('Foundry advance operation key does not match the current evaluation input.', {
        operation_key: options.operation_key,
        expected_operation_key: operation.operation_key,
      });
    }
    let result = await this.#operationResults.read(operation);
    let evidence: EvidenceBundle;
    if (result) {
      evidence = validateEvidenceBundle(
        await this.#object<EvidenceBundle>(result.evidence_digest, 'journaled EvidenceBundle'),
      );
      if (foundryContentDigest(evidence) !== result.evidence_digest) {
        fail('Journaled EvidenceBundle bytes do not match the operation result digest.');
      }
      this.#assertEvidence(inspection, blueprint, evidence, candidate, baseline);
    } else {
      if (options.replay_only) throw new FoundryOperationResultUnavailableError(operation.operation_key);
      evidence = validateEvidenceBundle(canary
        ? await this.#activity('canary', () => this.#evaluator.canary({
            operation_identity: operation,
            run_id: inspection.run.run_id,
            request: inspection.request,
            blueprint,
            blueprint_digest: inspection.run.blueprint_digest!,
            candidate,
            version: qualifiedVersion!,
            baseline_version: baseline,
          }))
        : await this.#activity('evaluate', () => this.#evaluator.evaluate({
            operation_identity: operation,
            run_id: inspection.run.run_id,
            request: inspection.request,
            blueprint,
            blueprint_digest: inspection.run.blueprint_digest!,
            candidate,
            baseline_version: baseline,
          })));
      this.#assertEvidence(inspection, blueprint, evidence, candidate, baseline);
      const storedEvidence = await this.#objects.put(evidence);
      if (storedEvidence.digest !== foundryContentDigest(evidence)) {
        fail('Foundry object store changed the validated EvidenceBundle bytes.');
      }
      result = await this.#operationResults.commit({
        identity: operation,
        evidence_digest: storedEvidence.digest,
        evidence_ref: storedEvidence.ref,
        completed_at: evidence.provenance.evaluated_at,
      });
    }
    const evidenceDigest = result.evidence_digest;
    if (canary && evidence.qualified) {
      const gate = ownerGatePolicy(inspection.run.risk_tier!);
      return this.#appendJournaledResult(inspection, result, {
        eventType: 'canary_passed',
        toState: gate.active_owner_required ? 'awaiting_owner_active' : 'activating',
        phase: 'canary',
        inputDigest: evidenceDigest,
        payload: {
          evidence_digest: evidenceDigest,
          frozen_test_plan_digest: evidence.frozen_test_plan_digest,
          gate_score: evidence.gate_score,
        },
      });
    }
    if (!canary && evidence.qualified) {
      const registered = await this.#activity('register_version', async () => {
        try {
          return await this.#versions.register({
            target_agent_id: inspection.request.target_agent_id,
            target_domain_id: inspection.request.target_domain_id,
            blueprint_digest: inspection.run.blueprint_digest!,
            candidate,
            evidence_digest: evidenceDigest,
            risk_tier: inspection.run.risk_tier!,
            qualified_at: result.completed_at,
          });
        } catch (error) {
          if (isContractFailure(error) || isTransientActivityFailure(error)) throw error;
          throw new FoundryTransientActivityError(
            'Version registration completion is unknown after the durable evaluation result commit.',
            { cause: error },
          );
        }
      });
      this.#assertRegisteredCandidate(inspection, candidate, registered);
      return this.#appendJournaledResult(inspection, result, {
        eventType: 'candidate_qualified',
        toState: 'qualified',
        phase: 'evaluate',
        inputDigest: evidenceDigest,
        payload: {
          evidence_digest: evidenceDigest,
          frozen_test_plan_digest: evidence.frozen_test_plan_digest,
          gate_score: evidence.gate_score,
          version_digest: registered.version.version_digest,
        },
      });
    }
    const noImprovement = inspection.run.gate_score === null || evidence.gate_score > inspection.run.gate_score
      ? 0
      : inspection.run.no_improvement_generations + 1;
    const exhausted = inspection.run.generation >= inspection.request.delivery_policy.max_generations
      || noImprovement >= 2;
    return this.#appendJournaledResult(inspection, result, {
      eventType: exhausted
        ? 'evolution_budget_exhausted'
        : canary ? 'canary_regression_rolled_back' : 'evaluation_failed',
      toState: exhausted ? 'completed_unqualified' : 'evidence_ready',
      phase: canary ? 'canary' : 'evaluate',
      inputDigest: evidenceDigest,
      payload: {
        evidence_digest: evidenceDigest,
        frozen_test_plan_digest: evidence.frozen_test_plan_digest,
        gate_score: evidence.gate_score,
        no_improvement_generations: noImprovement,
        ...(canary ? {
          rollback_to_version_digest: inspection.activation.active_version_digest,
          activation_revision_preserved: inspection.activation.revision,
        } : {}),
      },
    });
  }

  async #diagnose(inspection: FoundryRunInspection) {
    const blueprint = await this.#blueprint(inspection);
    const evidence = await this.#object<EvidenceBundle>(inspection.run.evidence_digest!, 'EvidenceBundle');
    const proposal = validateEvolutionProposal(await this.#activity('diagnose', () => this.#designer.diagnose({
      request: inspection.request,
      blueprint,
      evidence,
      activity: {
        run_id: inspection.run.run_id,
        iteration: inspection.run.generation,
        phase: 'diagnose',
        input_digest: foundryContentDigest({
          blueprint_digest: inspection.run.blueprint_digest,
          evidence_digest: inspection.run.evidence_digest,
        }),
      },
    })));
    assertSameTarget(inspection.request, proposal, 'EvolutionProposal');
    assertSameTarget(inspection.request, proposal.next_blueprint, 'EvolutionProposal.next_blueprint');
    if (
      proposal.blueprint_digest !== inspection.run.blueprint_digest
      || proposal.evidence_digest !== inspection.run.evidence_digest
      || proposal.next_blueprint.design_request_digest !== inspection.run.request_digest
    ) {
      fail('EvolutionProposal is stale.');
    }
    assertBlueprintSatisfiesDesignRequest(inspection.request, proposal.next_blueprint);
    assertEvaluationPolicyNonWeakening(blueprint, proposal.next_blueprint);
    const previousPublicCases = new Set(blueprint.eval_spec.public_cases.map((entry) => entry.case_id));
    const addedPublicCases = proposal.next_blueprint.eval_spec.public_cases.filter((entry) =>
      !previousPublicCases.has(entry.case_id));
    const declaredNewTests = new Map(proposal.new_tests.map((entry) => [entry.case_id, entry]));
    if (
      declaredNewTests.size !== addedPublicCases.length
      || addedPublicCases.some((entry) => declaredNewTests.get(entry.case_id)?.test_ref !== entry.test_ref)
    ) {
      fail('EvolutionProposal.new_tests must exactly describe newly admitted public evaluation cases.');
    }
    const proposalDigest = (await this.#objects.put(proposal)).digest;
    const nextBlueprintDigest = foundryContentDigest(proposal.next_blueprint);
    const noChange = nextBlueprintDigest === inspection.run.blueprint_digest;
    if (noChange) {
      if (
        proposal.next_blueprint.generation !== inspection.run.generation
        || proposal.semantic_diff.length !== 0
        || proposal.new_tests.length !== 0
      ) {
        fail('A no-change EvolutionProposal must preserve the exact blueprint and declare no semantic or test changes.');
      }
      return this.#append(inspection, {
        eventType: 'evolution_no_change',
        toState: 'completed_unqualified',
        phase: 'evolve_no_change',
        inputDigest: proposalDigest,
        payload: {
          proposal_digest: proposalDigest,
          no_improvement_generations: inspection.run.no_improvement_generations + 1,
        },
      });
    }
    if (proposal.next_blueprint.generation !== inspection.run.generation + 1) {
      fail('A changed EvolutionProposal must increment generation exactly once.');
    }
    if (proposal.semantic_diff.length === 0) {
      fail('A changed EvolutionProposal must declare a non-empty semantic diff.');
    }
    const nextDigest = (await this.#objects.put(proposal.next_blueprint)).digest;
    const risk = recomputeBlueprintRisk(blueprint, proposal.next_blueprint);
    const proposalRisk = maximumRiskTier(...proposal.risk_hints);
    const admittedRisk = maximumRiskTier(risk.risk_tier, proposalRisk);
    return this.#append(inspection, {
      eventType: 'evolution_proposal_admitted',
      toState: 'materializing',
      phase: 'evolve',
      inputDigest: proposalDigest,
      payload: {
        previous_blueprint_digest: inspection.run.blueprint_digest,
        blueprint_digest: nextDigest,
        proposal_digest: proposalDigest,
        candidate_digest: null,
        candidate_record_digest: null,
        evidence_digest: null,
        frozen_test_plan_digest: null,
        version_digest: null,
        generation: inspection.run.generation + 1,
        risk_tier: inspection.run.risk_tier
          ? maximumRiskTier(inspection.run.risk_tier, admittedRisk)
          : admittedRisk,
        risk_reasons: admittedRisk === risk.risk_tier
          ? risk.reasons
          : [...risk.reasons, 'evolution_proposal_risk_hint_elevated'],
      },
    });
  }

  async #afterQualification(inspection: FoundryRunInspection) {
    if (inspection.request.delivery_policy.activation_mode === 'qualify_only') {
      return this.#append(inspection, {
        eventType: 'qualification_completed',
        toState: 'completed_qualified',
        phase: 'qualify',
        inputDigest: inspection.run.version_digest!,
      });
    }
    const gate = ownerGatePolicy(inspection.run.risk_tier!);
    return this.#append(inspection, {
      eventType: gate.canary_owner_required ? 'owner_canary_required' : 'canary_started',
      toState: gate.canary_owner_required ? 'awaiting_owner_canary' : 'canary',
      phase: 'qualification_route',
      inputDigest: inspection.run.version_digest!,
    });
  }

  async #activate(inspection: FoundryRunInspection) {
    const authority = this.#latestOwnerAuthority(await this.#events.read(inspection.run.run_id));
    if (ownerGatePolicy(inspection.run.risk_tier!).active_owner_required && !authority) {
      fail('Owner-gated activation has no verified active approval receipt.');
    }
    const transaction = await this.#activity('activate', () => this.#versions.compareAndSwapActivation({
      target_agent_id: inspection.request.target_agent_id,
      target_domain_id: inspection.request.target_domain_id,
      expected_revision: inspection.run.activation_revision_at_start,
      version_digest: inspection.run.version_digest!,
      occurred_at: this.#clock.now(),
      authority_receipt_ref: authority?.ref ?? null,
    }));
    return this.#append(inspection, {
      eventType: 'activation_completed',
      toState: 'completed_active',
      phase: 'activate',
      inputDigest: inspection.run.version_digest!,
      payload: {
        activation_transaction_id: transaction.transaction_id,
        ...(authority ? {
          owner_authority_receipt_ref: authority.ref,
          owner_authority_receipt_digest: authority.digest,
        } : {}),
      },
    });
  }

  async #appendJournaledResult(
    inspection: FoundryRunInspection,
    result: FoundryOperationResult,
    input: {
      eventType: string;
      toState: FoundryRunState;
      phase: string;
      inputDigest: string;
      payload?: Record<string, unknown>;
    },
  ) {
    try {
      return await this.#append(inspection, input);
    } catch (error) {
      if (isContractFailure(error) || isTransientActivityFailure(error)) throw error;
      throw new FoundryTransientActivityError(
        `Foundry event append completion is unknown after durable operation ${result.operation_key}.`,
        { cause: error },
      );
    }
  }

  async #append(
    inspection: FoundryRunInspection,
    input: {
      eventType: string;
      toState: FoundryRunState;
      phase: string;
      inputDigest: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const event = buildFoundryEvent({
      runId: inspection.run.run_id,
      revision: inspection.run.revision + 1,
      eventType: input.eventType,
      fromState: inspection.run.state,
      toState: input.toState,
      occurredAt: this.#clock.now(),
      idempotencyKey: `${inspection.run.run_id}/${inspection.run.generation}/${input.phase}/${input.inputDigest}`,
      previousEventHash: inspection.run.last_event_hash,
      payload: input.payload,
    });
    return this.#events.append({
      target_key: targetKey(inspection.request),
      expected_revision: inspection.run.revision,
      event,
    });
  }

  async #terminateAfterFailure(inspection: FoundryRunInspection, error: unknown) {
    const latest = await this.inspectRun(inspection.run.run_id);
    if (FOUNDRY_TERMINAL_STATES.has(latest.run.state)) return;
    const quarantined = isContractFailure(error);
    await this.#append(latest, {
      eventType: quarantined ? 'foundry_output_quarantined' : 'foundry_run_failed',
      toState: quarantined ? 'quarantined' : 'failed',
      phase: quarantined ? 'quarantine' : 'failure',
      inputDigest: foundryContentDigest({
        surface_kind: 'opl_foundry_failure_identity',
        target_agent_id: latest.request.target_agent_id,
        target_domain_id: latest.request.target_domain_id,
        target_version_ref: latest.request.target_version_ref,
        error_kind: quarantined ? 'contract' : 'runtime',
        state: latest.run.state,
      }),
      payload: {
        failure_code: error instanceof FrameworkContractError ? error.code : 'foundry_runtime_failed',
        failure_message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  async #resolveBaseline(request: DesignRequest): Promise<AgentVersion | null> {
    return this.#versions.resolveVersion(
      request.target_version_ref,
      request.target_agent_id,
      request.target_domain_id,
    );
  }

  async #baselineBlueprint(request: DesignRequest) {
    const version = await this.#resolveBaseline(request);
    return version ? this.#object<AgentBlueprint>(version.blueprint_digest, 'baseline AgentBlueprint') : null;
  }

  async #blueprint(inspection: FoundryRunInspection) {
    if (!inspection.run.blueprint_digest) fail('FoundryRun has no admitted AgentBlueprint.');
    return this.#object<AgentBlueprint>(inspection.run.blueprint_digest, 'AgentBlueprint');
  }

  async #candidate(inspection: FoundryRunInspection) {
    if (!inspection.run.candidate_digest || !inspection.run.candidate_record_digest) {
      fail('FoundryRun has no admitted materialized candidate.');
    }
    const candidate = await this.#object<MaterializedCandidate>(
      inspection.run.candidate_record_digest,
      'materialized candidate record',
    );
    if (foundryContentDigest(candidate) !== inspection.run.candidate_record_digest) {
      fail('Materialized candidate record bytes do not match the admitted content digest.');
    }
    return candidate;
  }

  async #version(inspection: FoundryRunInspection) {
    if (!inspection.run.version_digest) fail('FoundryRun has no qualified AgentVersion.');
    return await this.#versions.resolveVersion(
      inspection.run.version_digest,
      inspection.request.target_agent_id,
      inspection.request.target_domain_id,
    ) ?? fail('FoundryRun AgentVersion is missing.', { version_digest: inspection.run.version_digest });
  }

  async #object<T>(digest: string, label: string): Promise<T> {
    return await this.#objects.get<T>(digest) ?? fail(`${label} is missing from the Foundry object store.`, { digest });
  }

  #assertCandidate(inspection: FoundryRunInspection, candidate: MaterializedCandidate) {
    if (
      candidate.surface_kind !== 'opl_foundry_materialized_candidate'
      || candidate.target_agent_id !== inspection.request.target_agent_id
      || candidate.target_domain_id !== inspection.request.target_domain_id
      || candidate.blueprint_digest !== inspection.run.blueprint_digest
      || (inspection.run.candidate_digest !== null
        && candidate.candidate_digest !== inspection.run.candidate_digest)
      || !/^sha256:[a-f0-9]{64}$/.test(candidate.candidate_digest)
      || !/^sha256:[a-f0-9]{64}$/.test(candidate.manifest_digest)
      || !candidate.candidate_ref.trim()
    ) {
      fail('Materialized candidate identity does not match the FoundryRun.');
    }
  }

  #assertEvidence(
    inspection: FoundryRunInspection,
    blueprint: AgentBlueprint,
    evidence: EvidenceBundle,
    candidate: MaterializedCandidate,
    baseline: AgentVersion | null,
  ) {
    assertSameTarget(inspection.request, evidence, 'EvidenceBundle');
    const expectedFrozenPlanDigest = foundryFrozenEvaluationPlanDigest(blueprint.eval_spec);
    const reviewerRef = evidence.independent_review.evaluator_ref.trim();
    const evaluationExecutionRef = evidence.independent_review.evaluation_execution_ref.trim();
    const reviewExecutionRef = evidence.independent_review.review_execution_ref.trim();
    if (
      evidence.blueprint_digest !== inspection.run.blueprint_digest
      || evidence.candidate_digest !== candidate.candidate_digest
      || evidence.baseline_version_digest !== (baseline?.version_digest ?? null)
      || evidence.frozen_test_plan_digest !== expectedFrozenPlanDigest
      || evidence.provenance.foundry_run_id !== inspection.run.run_id
      || evidence.provenance.generation !== inspection.run.generation
      || evidence.provenance.producer_id !== this.#evaluator.evaluator_id
      || reviewerRef === this.#designer.producer_id.trim()
      || reviewerRef === this.#evaluator.evaluator_id.trim()
      || evaluationExecutionRef === reviewExecutionRef
    ) {
      fail('EvidenceBundle provenance or content binding is stale.');
    }
    if (
      inspection.run.frozen_test_plan_digest
      && evidence.frozen_test_plan_digest !== inspection.run.frozen_test_plan_digest
    ) {
      fail('EvidenceBundle changed the frozen test plan during a FoundryRun.');
    }
    assertEvaluationEvidenceFacts({
      request: inspection.request,
      spec: blueprint.eval_spec,
      evidence,
      baseline_present: baseline !== null,
    });
  }

  #assertRegisteredCandidate(
    inspection: FoundryRunInspection,
    candidate: MaterializedCandidate,
    registered: Awaited<ReturnType<VersionRegistry['register']>>,
  ) {
    const { version, qualification } = registered;
    const { version_digest: versionDigest, ...versionBase } = version;
    const { qualification_digest: qualificationDigest, ...qualificationBase } = qualification;
    if (
      version.surface_kind !== 'opl_foundry_agent_version'
      || qualification.surface_kind !== 'opl_foundry_qualification_record'
      || version.target_agent_id !== inspection.request.target_agent_id
      || version.target_domain_id !== inspection.request.target_domain_id
      || version.blueprint_digest !== inspection.run.blueprint_digest
      || version.candidate_digest !== candidate.candidate_digest
      || version.candidate_ref !== candidate.candidate_ref
      || qualification.target_agent_id !== inspection.request.target_agent_id
      || qualification.target_domain_id !== inspection.request.target_domain_id
      || qualification.blueprint_digest !== inspection.run.blueprint_digest
      || qualification.candidate_digest !== candidate.candidate_digest
      || version.qualification_digest !== qualification.qualification_digest
      || foundryContentDigest(versionBase) !== versionDigest
      || foundryContentDigest(qualificationBase) !== qualificationDigest
    ) {
      fail('Version registry changed the qualified materialized candidate binding.');
    }
  }

  #ownerDecisionAction(
    state: 'awaiting_owner_canary' | 'awaiting_owner_active',
    decision: 'approve' | 'reject',
  ): OwnerGateAction {
    return `${decision}_${state === 'awaiting_owner_canary' ? 'canary' : 'active'}`;
  }

  #ownerGateRefs(blueprint: AgentBlueprint) {
    const refs = Array.isArray(blueprint.authority_policy.owner_gate_refs)
      ? blueprint.authority_policy.owner_gate_refs.map((entry) => requiredRef(entry, 'authority_policy.owner_gate_refs'))
      : [];
    if (refs.length === 0) fail('Current AgentBlueprint has no OwnerGate authority refs.');
    if (new Set(refs).size !== refs.length) fail('Current AgentBlueprint OwnerGate authority refs must be unique.');
    return refs;
  }

  async #verifyOwnerAuthority(
    input: Omit<OwnerGateVerificationContext, 'surface_kind' | 'version'>,
  ) {
    const context = validateOwnerGateVerificationContext({
      surface_kind: 'opl_foundry_owner_gate_verification_context',
      version: 'opl-foundry-owner-gate-verification-context.v1',
      ...input,
    });
    return validateOwnerGateVerification(context, await this.#ownerGate.verify(context));
  }

  #ownerVerificationPayload(verification: OwnerGateVerification) {
    return {
      owner_authority_receipt_ref: verification.receipt.receipt_ref,
      owner_authority_receipt_digest: verification.receipt.receipt_digest,
      owner_authority_ref: verification.covered_authority_ref,
      owner_authority_verifier_id: verification.verifier_id,
      owner_authority_verification_ref: verification.verification_ref,
      owner_gate_action: verification.receipt.action,
      owner_gate_decision: verification.receipt.decision,
    };
  }

  #latestOwnerAuthority(events: Awaited<ReturnType<FoundryEventStore['read']>>) {
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

  async #activity<T>(operation: string, run: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.#activityMaxAttempts; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (isContractFailure(error) || !isTransientActivityFailure(error)) throw error;
        lastError = error;
      }
    }
    if (this.#propagateTransientActivityFailures && isTransientActivityFailure(lastError)) {
      throw lastError;
    }
    const error = new Error(`Foundry ${operation} exhausted the transient infrastructure retry budget.`);
    Object.assign(error, {
      failure_code: 'foundry_activity_retry_exhausted',
      operation,
      attempts: this.#activityMaxAttempts,
      last_error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw error;
  }
}
