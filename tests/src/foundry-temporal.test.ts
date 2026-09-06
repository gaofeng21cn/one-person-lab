import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import temporalProto from '@temporalio/proto';
import { Worker } from '@temporalio/worker';

import {
  DeterministicInMemoryCandidateCompiler,
  InMemoryFoundryEventStore,
  InMemoryFoundryObjectStore,
  InMemoryOwnerGate,
  InMemoryVersionRegistry,
} from '../../src/authority/evolution/in-memory-adapters.ts';
import {
  FoundryKernel,
  FoundryTransientActivityError,
} from '../../src/authority/evolution/kernel.ts';
import { foundryFrozenEvaluationPlanDigest } from '../../src/authority/evolution/evaluation-runtime.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryContentDigest,
  type AgentBlueprint,
  type DesignRequest,
  type EvidenceBundle,
} from '../../src/authority/evolution/protocol.ts';
import type {
  DesignerPort,
  EvaluationExecutor,
  FoundryEventStore,
  MaterializedCandidate,
} from '../../src/authority/evolution/ports.ts';
import type { FoundryProviderManifest } from '../../src/authority/evolution/index.ts';
import * as registeredActivities from '../../src/adapters/execution/family-runtime-temporal-activities.ts';
import { buildFoundryTemporalActivities } from '../../src/adapters/execution/foundry-temporal-activities.ts';
import {
  cancelTemporalFoundryRun,
  foundryTemporalWorkflowId,
  queryTemporalFoundryRunWorkflow,
  startTemporalFoundryRunWorkflow,
  submitTemporalFoundryOwnerDecision,
} from '../../src/adapters/execution/foundry-temporal-control.ts';
import type {
  FoundryRunWorkflowInput,
  FoundryRunWorkflowState,
} from '../../src/adapters/execution/foundry-temporal.ts';
import type { FoundryProviderOperationCursor } from '../../src/adapters/execution/foundry-provider-stage-run.ts';
import { createTemporalTestWorkflowEnvironment } from './temporal-test-environment.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowsPath = path.join(repoRoot, 'src/adapters/execution/family-runtime-temporal-workflows.ts');
const ownerGate = new InMemoryOwnerGate(() => '2026-07-16T00:00:00.000Z');
const temporalProviderManifest: FoundryProviderManifest = {
  surface_kind: 'opl_foundry_provider',
  version: 'opl-foundry-provider.v1',
  provider_id: 'oma',
  agent_id: 'oma',
  package_id: 'oma',
  domain_id: 'agent_engineering',
  carrier_slug: 'opl-meta-agent',
  operations: {
    design: {
      input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
      output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
      entry_stage_ref: 'mission-intake',
      required_stage_refs: ['mission-intake', 'evaluation-design'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evaluation-design',
    },
    diagnose: {
      input_schema_refs: [
        'opl://foundry-protocol/DesignRequest',
        'opl://foundry-protocol/AgentBlueprint',
        'opl://foundry-protocol/EvidenceBundle',
      ],
      output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
      entry_stage_ref: 'evidence-diagnosis',
      required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evolution-proposal',
    },
  },
  projection_policy: {
    public_action_ids: ['engineer-agent'],
    internal_operations_are_public_actions: false,
    internal_operations_are_cli_commands: false,
    internal_operations_are_mcp_tools: false,
  },
  authority_boundary: {
    provider_owns_design_semantics: true,
    provider_owns_evaluation_semantics: true,
    provider_owns_evidence_diagnosis: true,
    provider_owns_evolution_proposals: true,
    provider_owns_foundry_run_state: false,
    provider_owns_candidate_materialization: false,
    provider_owns_evaluation_execution: false,
    provider_owns_versions_or_activation: false,
    provider_can_return_patch_or_work_order: false,
    provider_can_view_protected_test_bodies: false,
    opl_can_write_target_domain_truth: false,
  },
};

function authorizeTemporalMutation(input: {
  inspection: NonNullable<FoundryRunWorkflowState['inspection']>;
  action: 'approve_canary' | 'approve_active' | 'cancel';
  decision: 'approve' | 'cancel';
}) {
  ownerGate.registerAuthorityPolicy({
    policy_ref: 'opl://foundry/authority-policy/temporal-fixture',
    target_agent_id: input.inspection.request.target_agent_id,
    target_domain_id: input.inspection.request.target_domain_id,
    authority_refs: ['opl://owner-gate/temporal-fixture'],
  });
  return ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: `receipt:${input.inspection.run.run_id}:${input.action}:${input.inspection.run.revision}`,
    authority_ref: 'opl://owner-gate/temporal-fixture',
    action: input.action,
    decision: input.decision,
    target_agent_id: input.inspection.request.target_agent_id,
    target_domain_id: input.inspection.request.target_domain_id,
    run_id: input.inspection.run.run_id,
    version_digest: input.inspection.run.version_digest,
    expected_revision: input.inspection.run.revision,
    issued_at: '2026-07-16T00:00:00.000Z',
  }).receipt_ref;
}

function designRequest(target = 'temporal-fixture-agent'): DesignRequest {
  return {
    surface_kind: 'opl_foundry_design_request',
    version: FOUNDRY_PROTOCOL_VERSION,
    request_id: `request:${target}`,
    mode: 'create',
    target_agent_id: target,
    target_domain_id: 'temporal_fixture',
    target_version_ref: null,
    objective: 'Build a Temporal fixture Agent.',
    acceptance_criteria: ['The required evaluation gate passes.'],
    non_goals: ['No self-activation.'],
    source_refs: ['opl://source/temporal-fixture'],
    constraints: {
      capability_refs: ['opl://capability/text'],
      permission_refs: [],
      privacy_requirements: ['privacy:no-protected-body-transport'],
      cost_limits: { usd: 1 },
      latency_limits: { milliseconds: 1000 },
    },
    delivery_policy: { activation_mode: 'activate', max_generations: 3 },
  };
}

function workflowInput(runId: string, request: DesignRequest): FoundryRunWorkflowInput {
  return {
    run_id: runId,
    request,
    request_digest: foundryContentDigest(request),
  };
}

function agentBlueprint(request: DesignRequest): AgentBlueprint {
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: `blueprint:${request.request_id}`,
    target_agent_id: request.target_agent_id,
    target_domain_id: request.target_domain_id,
    target_version_ref: request.target_version_ref,
    design_request_digest: foundryContentDigest(request),
    generation: 0,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'semantic',
        goal: 'Deliver the accepted result.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: 'opl-content://sha256/1111111111111111111111111111111111111111111111111111111111111111',
        skill_refs: [],
        knowledge_refs: [],
        capability_refs: ['opl://capability/text'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the result.',
      entry_stage_id: 'deliver',
      input_schema_ref: `opl-content://sha256/${'2'.repeat(64)}`,
      output_schema_ref: `opl-content://sha256/${'3'.repeat(64)}`,
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: `opl-content://sha256/${'3'.repeat(64)}`,
      authority_owner_ref: 'opl://owner/temporal-fixture',
    }],
    content_refs: {
      prompt_refs: ['opl-content://sha256/1111111111111111111111111111111111111111111111111111111111111111'],
      skill_refs: [],
      knowledge_refs: [],
      helper_refs: [],
      model_refs: ['opl://model/default'],
      tool_refs: [],
      schema_refs: [
        `opl-content://sha256/${'2'.repeat(64)}`,
        `opl-content://sha256/${'3'.repeat(64)}`,
      ],
    },
    capability_requirements: ['opl://capability/text'],
    authority_policy: {
      truth_owner_ref: 'opl://owner/temporal-fixture',
      artifact_owner_ref: 'opl://owner/temporal-fixture',
      quality_owner_ref: 'opl://owner/temporal-fixture',
      permission_refs: [],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: ['observation'],
      retention_refs: ['opl://retention/temporal-fixture'],
      write_authority_refs: ['opl://owner/temporal-fixture'],
    },
    assumptions: ['The test runtime is available.'],
    design_evidence_refs: ['opl://evidence/temporal-fixture-design'],
    eval_spec: {
      eval_spec_id: 'eval:temporal-fixture',
      public_cases: [{ case_id: 'required', test_ref: 'opl://test/required', weight: 1, required: true }],
      protected_requirements: [{ category: 'privacy:no-protected-body-transport', minimum_case_count: 1 }],
      gates: [{ gate_id: 'quality', metric: 'score', operator: 'gte', threshold: 1, required: true }],
      baseline_comparison: { required: false, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

function passingEvidence(input: {
  runId: string;
  request: DesignRequest;
  blueprint: AgentBlueprint;
  candidate: MaterializedCandidate;
}): EvidenceBundle {
  return {
    surface_kind: 'opl_foundry_evidence_bundle',
    version: FOUNDRY_PROTOCOL_VERSION,
    evidence_id: `evidence:${input.runId}:${input.blueprint.generation}`,
    target_agent_id: input.request.target_agent_id,
    target_domain_id: input.request.target_domain_id,
    target_version_ref: input.request.target_version_ref,
    blueprint_digest: foundryContentDigest(input.blueprint),
    candidate_digest: input.candidate.candidate_digest,
    baseline_version_digest: null,
    frozen_test_plan_digest: foundryFrozenEvaluationPlanDigest(input.blueprint.eval_spec),
    public_results: [{ case_id: 'required', status: 'pass', score: 1, evidence_refs: ['opl://evidence/public'] }],
    baseline_public_results: null,
    baseline_protected_aggregates: null,
    protected_aggregates: [{
      category: 'privacy:no-protected-body-transport',
      total: 1,
      passed: 1,
      failed: 0,
      score: 1,
    }],
    independent_review: {
      evaluator_ref: 'reviewer:independent',
      evaluation_execution_ref: `opl://evaluation/${input.runId}/${input.blueprint.generation}`,
      review_execution_ref: `opl://review/${input.runId}/${input.blueprint.generation}`,
      verdict: 'pass',
      findings: [],
      evidence_refs: ['opl://evidence/review'],
    },
    candidate_cost_observations: { usd: 0 },
    candidate_latency_observations: { milliseconds: 0 },
    safety_observations: [],
    safety_delta: { incidents: 0 },
    cost_delta: { usd: 0 },
    latency_delta: { milliseconds: 0 },
    failure_classification: [],
    qualified: true,
    gate_score: 1,
    provenance: {
      foundry_run_id: input.runId,
      generation: input.blueprint.generation,
      producer_id: 'evaluator:temporal-fixture',
      evaluated_at: '2026-07-16T00:00:00.000Z',
      source_refs: ['opl://evaluation/frozen-plan'],
    },
  };
}

function passingKernelDependencies(input: {
  events?: FoundryEventStore;
  evaluator?: EvaluationExecutor;
  versions?: InMemoryVersionRegistry;
} = {}) {
  const events = input.events ?? new InMemoryFoundryEventStore();
  const designer: DesignerPort = {
    producer_id: 'designer:temporal-fixture',
    design: async (request) => agentBlueprint(request),
    diagnose: async () => { throw new Error('diagnose should not run'); },
  };
  const evaluator: EvaluationExecutor = input.evaluator ?? {
    evaluator_id: 'evaluator:temporal-fixture',
    evaluate: async (input) => passingEvidence({
      runId: input.run_id,
      request: input.request,
      blueprint: input.blueprint,
      candidate: input.candidate,
    }),
    canary: async (input) => passingEvidence({
      runId: input.run_id,
      request: input.request,
      blueprint: input.blueprint,
      candidate: input.candidate,
    }),
  };
  const versions = input.versions ?? new InMemoryVersionRegistry();
  return {
    designer,
    evaluator,
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions,
    ownerGate,
    activityMaxAttempts: 1,
    propagateTransientActivityFailures: true,
  };
}

function passingKernel() {
  const dependencies = passingKernelDependencies();
  return { kernel: new FoundryKernel(dependencies), events: dependencies.events };
}

class FailOnceBeforeQualificationAppendStore implements FoundryEventStore {
  readonly #delegate = new InMemoryFoundryEventStore();
  #failed = false;

  create(input: Parameters<FoundryEventStore['create']>[0]) {
    return this.#delegate.create(input);
  }

  append(input: Parameters<FoundryEventStore['append']>[0]) {
    if (!this.#failed && input.event.event_type === 'candidate_qualified') {
      this.#failed = true;
      throw new FoundryTransientActivityError('qualification append completion is unknown');
    }
    return this.#delegate.append(input);
  }

  read(runId: string) {
    return this.#delegate.read(runId);
  }

  list() {
    return this.#delegate.list();
  }
}

class LoseFirstEvaluationActivityCompletionKernel extends FoundryKernel {
  #lost = false;

  override async advanceRunStep(
    runId: string,
    options?: Parameters<FoundryKernel['advanceRunStep']>[1],
  ) {
    const before = await this.inspectRun(runId);
    const after = await super.advanceRunStep(runId, options);
    if (!this.#lost && before.run.state === 'evaluating') {
      this.#lost = true;
      throw new FoundryTransientActivityError('activity completion was lost after ledger append');
    }
    return after;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function advanceActivityIds(history: unknown) {
  const root = record(history);
  const events = Array.isArray(root?.events) ? root.events : [];
  return events.flatMap((event) => {
    const scheduled = record(record(event)?.activityTaskScheduledEventAttributes);
    const activityType = record(scheduled?.activityType);
    return activityType?.name === 'foundryAdvanceRunActivity'
      && typeof scheduled?.activityId === 'string'
      ? [scheduled.activityId]
      : [];
  });
}

async function waitForState(
  runId: string,
  expected: FoundryRunWorkflowState['workflow_status'],
  address: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await queryTemporalFoundryRunWorkflow(runId, { addressOverride: address, rpcTimeoutMs: 10_000 });
    if (state.workflow_status === expected) return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Foundry workflow ${runId} did not reach ${expected}.`);
}

async function within<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function providerCursor(
  operationKey: string,
  input: Partial<Extract<
    FoundryProviderOperationCursor,
    { version: 'opl-foundry-provider-operation-cursor.v2' }
  >> = {},
): FoundryProviderOperationCursor {
  const providerManifest = input.provider_manifest ?? temporalProviderManifest;
  return {
    surface_kind: 'opl_foundry_provider_operation_cursor',
    version: 'opl-foundry-provider-operation-cursor.v2',
    operation_key: operationKey,
    operation: 'design',
    provider_id: 'oma',
    activity_key: 'b'.repeat(64),
    required_stage_refs: ['mission-intake', 'evaluation-design'],
    optional_stage_refs: [],
    terminal_stage_ref: 'evaluation-design',
    entry_workflow_id: 'workflow:mission-intake',
    current_workflow_id: 'workflow:mission-intake',
    current_stage_id: null,
    visited_path: [],
    continuation: null,
    active_attempts: [],
    artifact_refs: [],
    artifact_hashes: [],
    status: 'pending',
    ...input,
    provider_manifest: providerManifest,
    provider_manifest_digest: input.provider_manifest_digest ?? foundryContentDigest(providerManifest),
    provider_source_digest: input.provider_source_digest ?? `sha256:${'c'.repeat(64)}`,
    checkout_root: input.checkout_root ?? '/tmp',
  };
}

test('current bundle replays pre-durable-provider Foundry cancellation history', async () => {
  const fixture = fs.readFileSync(path.join(
    repoRoot,
    'tests/fixtures/temporal-history/foundry-cancel-pre-durable-provider-v1.json',
  ));
  assert.equal(
    crypto.createHash('sha256').update(fixture).digest('hex'),
    'cda3a03ef98cb30a2d6dbb85c4031d252b09448c3d1271f9ac144340633934e0',
  );
  const parsed = JSON.parse(fixture.toString('utf8')) as { events?: Array<Record<string, any>> };
  const acceptedUpdates = (parsed.events ?? []).flatMap((event) =>
    event.workflowExecutionUpdateAcceptedEventAttributes?.acceptedRequest?.input?.name ?? []);
  const scheduledActivities = (parsed.events ?? []).flatMap((event) =>
    event.activityTaskScheduledEventAttributes?.activityType?.name ?? []);
  assert.ok(acceptedUpdates.includes('FoundryCancelUpdate'));
  assert.equal(scheduledActivities.at(-1), 'foundryCancelRunActivity');
  assert.equal(scheduledActivities.includes('foundryAuthorizeCancelRunActivity'), false);

  const history = temporalProto.temporal.api.history.v1.History.fromObject(parsed);
  await Worker.runReplayHistory({ workflowsPath }, history);
});

test('Temporal FoundryRun survives worker restart and applies query, Update, CAS, and cancel semantics', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-control-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const { kernel } = passingKernel();
  const activities = { ...registeredActivities, ...buildFoundryTemporalActivities(() => kernel) };
  const options = { addressOverride: testEnv.address, rpcTimeoutMs: 10_000 };
  try {
    const firstWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    const firstGate = await firstWorker.runUntil(async () => {
      const request = designRequest();
      const receipt = await startTemporalFoundryRunWorkflow({
        run_id: 'run-temporal-restart',
        request,
      }, options);
      assert.equal(receipt.provider_kind, 'temporal');
      assert.equal(receipt.request_digest, foundryContentDigest(request));
      const gate = await waitForState('run-temporal-restart', 'awaiting_owner_canary', testEnv.address);
      const replay = await startTemporalFoundryRunWorkflow({
        run_id: 'run-temporal-restart',
        request: structuredClone(request),
      }, options);
      assert.equal(replay.state.request_digest, foundryContentDigest(request));
      await assert.rejects(
        startTemporalFoundryRunWorkflow({
          run_id: 'run-temporal-restart',
          request: { ...request, objective: 'Conflicting objective for the same run id.' },
        }, options),
        /USE_EXISTING resolved a different DesignRequest/,
      );
      return gate;
    });
    assert.equal(firstGate.inspection?.run.generation, 0);

    const secondWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await secondWorker.runUntil(async () => {
      await assert.rejects(submitTemporalFoundryOwnerDecision({
        run_id: 'run-temporal-restart',
        expected_revision: firstGate.inspection!.run.revision - 1,
        decision: 'approve',
        authority_receipt_ref: 'opl://owner-receipt/stale',
      }, options));
      await submitTemporalFoundryOwnerDecision({
        run_id: 'run-temporal-restart',
        expected_revision: firstGate.inspection!.run.revision,
        decision: 'approve',
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: firstGate.inspection!,
          action: 'approve_canary',
          decision: 'approve',
        }),
      }, options);
      const activeGate = await waitForState('run-temporal-restart', 'awaiting_owner_active', testEnv.address);
      await submitTemporalFoundryOwnerDecision({
        run_id: 'run-temporal-restart',
        expected_revision: activeGate.inspection!.run.revision,
        decision: 'approve',
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: activeGate.inspection!,
          action: 'approve_active',
          decision: 'approve',
        }),
      }, options);
      const terminal = await waitForState('run-temporal-restart', 'terminal', testEnv.address);
      assert.equal(terminal.inspection?.run.state, 'completed_active');

      await startTemporalFoundryRunWorkflow({
        run_id: 'run-temporal-cancel',
        request: designRequest('temporal-cancel-agent'),
      }, options);
      const cancelGate = await waitForState('run-temporal-cancel', 'awaiting_owner_canary', testEnv.address);
      const cancelled = await cancelTemporalFoundryRun({
        run_id: 'run-temporal-cancel',
        expected_revision: cancelGate.inspection!.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: cancelGate.inspection!,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, options);
      assert.equal(cancelled.inspection?.run.state, 'cancelled');
    });
  } finally {
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal durably resumes a provider StageRun cursor after worker restart without relaunch', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-provider-resume-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const { kernel, events } = passingKernel();
  const base = buildFoundryTemporalActivities(() => kernel);
  let allowProgress = false;
  let launchCalls = 0;
  let observeCalls = 0;
  let readCalls = 0;
  let transientObserveFailuresRemaining = 3;
  const activities = {
    ...registeredActivities,
    ...base,
    async foundryLaunchProviderOperationActivity(operation: { operation_key: string; phase: string }) {
      if (operation.phase !== 'design') return null;
      launchCalls += 1;
      return providerCursor(operation.operation_key);
    },
    async foundryObserveProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      observeCalls += 1;
      if (!allowProgress) return input.cursor;
      if (transientObserveFailuresRemaining > 0) {
        transientObserveFailuresRemaining -= 1;
        throw new FoundryTransientActivityError('transient provider query failure');
      }
      if (input.cursor.version !== 'opl-foundry-provider-operation-cursor.v2') {
        throw new Error('Expected the generation-bound provider cursor.');
      }
      if (input.cursor.current_workflow_id === 'workflow:mission-intake') {
        return providerCursor(input.cursor.operation_key, {
          ...input.cursor,
          current_workflow_id: 'workflow:evaluation-design',
          visited_path: [{
            workflow_id: 'workflow:mission-intake',
            stage_id: 'mission-intake',
          }],
          continuation: {
            from_workflow_id: 'workflow:mission-intake',
            target_workflow_id: 'workflow:evaluation-design',
          },
        });
      }
      return providerCursor(input.cursor.operation_key, {
        ...input.cursor,
        current_stage_id: 'evaluation-design',
        visited_path: [
          ...input.cursor.visited_path,
          { workflow_id: 'workflow:evaluation-design', stage_id: 'evaluation-design' },
        ],
        status: 'terminal',
      });
    },
    async foundryReadProviderOperationTerminalActivity(input: { cursor: FoundryProviderOperationCursor }) {
      readCalls += 1;
      return input.cursor;
    },
  };
  const options = { addressOverride: testEnv.address, rpcTimeoutMs: 10_000 };
  const request = designRequest('temporal-provider-resume-agent');
  request.delivery_policy = { ...request.delivery_policy, activation_mode: 'qualify_only' };
  try {
    const firstWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await firstWorker.runUntil(async () => {
      await startTemporalFoundryRunWorkflow({
        run_id: 'run-temporal-provider-resume',
        request,
      }, options);
      for (let attempt = 0; attempt < 100 && observeCalls === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const pending = await queryTemporalFoundryRunWorkflow(
        'run-temporal-provider-resume',
        options,
      );
      assert.equal(pending.provider_operation_cursor?.status, 'pending');
      assert.equal(pending.provider_operation_cursor?.current_workflow_id, 'workflow:mission-intake');
    });

    allowProgress = true;
    const secondWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    const { result, history } = await secondWorker.runUntil(async () => {
      const handle = testEnv.client.workflow.getHandle(
        foundryTemporalWorkflowId('run-temporal-provider-resume'),
      );
      return { result: await handle.result(), history: await handle.fetchHistory() };
    });
    assert.equal((result as FoundryRunWorkflowState).inspection?.run.state, 'completed_qualified');
    assert.equal(launchCalls, 1);
    assert.equal(readCalls, 1);
    assert.ok(observeCalls >= 5);
    assert.equal(transientObserveFailuresRemaining, 0);
    assert.equal(
      (await events.read('run-temporal-provider-resume'))
        .filter((event) => event.event_type === 'blueprint_admitted').length,
      1,
    );
    await Worker.runReplayHistory({ workflowsPath }, history);
  } finally {
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal unlocks after provider cancellation failure and commits ledger cancellation only after provider stop', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-provider-cancel-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const dependencies = passingKernelDependencies();
  const kernel = new FoundryKernel(dependencies);
  const base = buildFoundryTemporalActivities(() => kernel);
  const order: string[] = [];
  let releaseLaunch = () => {};
  let reportLaunch = () => {};
  const launchGate = new Promise<void>((resolve) => { releaseLaunch = resolve; });
  const launchEntered = new Promise<void>((resolve) => { reportLaunch = resolve; });
  let reportAuthorized = () => {};
  const authorized = new Promise<void>((resolve) => { reportAuthorized = resolve; });
  let reportObservationAfterFailedCancel = () => {};
  const observationAfterFailedCancel = new Promise<void>((resolve) => {
    reportObservationAfterFailedCancel = resolve;
  });
  let providerCancelCalls = 0;
  let failProviderCancel = true;
  const activities = {
    ...registeredActivities,
    ...base,
    async foundryLaunchProviderOperationActivity(operation: { operation_key: string; phase: string }) {
      if (operation.phase !== 'design') return null;
      reportLaunch();
      await launchGate;
      return providerCursor(operation.operation_key);
    },
    async foundryObserveProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      reportObservationAfterFailedCancel();
      return input.cursor;
    },
    async foundryAuthorizeCancelRunActivity(input: Parameters<typeof base.foundryAuthorizeCancelRunActivity>[0]) {
      const result = await base.foundryAuthorizeCancelRunActivity(input);
      order.push('authorized');
      reportAuthorized();
      return result;
    },
    async foundryCancelProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      providerCancelCalls += 1;
      if (failProviderCancel) {
        throw new FoundryTransientActivityError('simulated provider cancellation transport failure');
      }
      order.push('provider_cancelled');
      return input.cursor;
    },
    async foundryCancelRunActivity(input: Parameters<typeof base.foundryCancelRunActivity>[0]) {
      order.push('ledger_cancelled');
      return base.foundryCancelRunActivity(input);
    },
  };
  const options = { addressOverride: testEnv.address, rpcTimeoutMs: 10_000 };
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await worker.runUntil(async () => {
      const request = designRequest('temporal-provider-cancel-agent');
      await startTemporalFoundryRunWorkflow({
        run_id: 'run-temporal-provider-cancel',
        request,
      }, options);
      await within(launchEntered, 2_000, 'Provider launch did not start.');
      const designing = await queryTemporalFoundryRunWorkflow(
        'run-temporal-provider-cancel',
        options,
      );
      await assert.rejects(cancelTemporalFoundryRun({
        run_id: 'run-temporal-provider-cancel',
        expected_revision: designing.inspection!.run.revision - 1,
        authority_receipt_ref: 'opl://owner-receipt/unauthorized',
      }, options));
      assert.equal(providerCancelCalls, 0);

      const cancellation = cancelTemporalFoundryRun({
        run_id: 'run-temporal-provider-cancel',
        expected_revision: designing.inspection!.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: designing.inspection!,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, options);
      await within(authorized, 2_000, 'Cancellation was not authorized.');
      assert.equal(providerCancelCalls, 0);
      releaseLaunch();
      await assert.rejects(cancellation);
      assert.equal(providerCancelCalls, 3);
      await within(
        observationAfterFailedCancel,
        5_000,
        'Provider observation did not resume after cancellation failure.',
      );
      const resumed = await queryTemporalFoundryRunWorkflow(
        'run-temporal-provider-cancel',
        options,
      );
      assert.equal(resumed.inspection?.run.state, 'designing');
      assert.deepEqual(
        (await dependencies.events.read('run-temporal-provider-cancel'))
          .map((event) => event.event_type),
        ['foundry_run_accepted', 'design_started'],
      );

      failProviderCancel = false;
      const cancelled = await cancelTemporalFoundryRun({
        run_id: 'run-temporal-provider-cancel',
        expected_revision: resumed.inspection!.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: resumed.inspection!,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, options);
      assert.equal(cancelled.inspection?.run.state, 'cancelled');
      assert.equal(providerCancelCalls, 4);
      assert.deepEqual(order, ['authorized', 'authorized', 'provider_cancelled', 'ledger_cancelled']);
      assert.deepEqual(
        (await dependencies.events.read('run-temporal-provider-cancel'))
          .map((event) => event.event_type),
        ['foundry_run_accepted', 'design_started', 'foundry_run_cancelled'],
      );
    });
  } finally {
    releaseLaunch();
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal terminalizes the FoundryRun when ledger cancellation fails after provider stop', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-cancel-commit-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const dependencies = passingKernelDependencies();
  const kernel = new FoundryKernel(dependencies);
  const base = buildFoundryTemporalActivities(() => kernel);
  let providerCancelled = false;
  let providerCancelCalls = 0;
  let ledgerCancelCalls = 0;
  let observationsAfterProviderCancel = 0;
  const activities = {
    ...registeredActivities,
    ...base,
    async foundryLaunchProviderOperationActivity(operation: { operation_key: string; phase: string }) {
      return operation.phase === 'design' ? providerCursor(operation.operation_key) : null;
    },
    async foundryObserveProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      if (providerCancelled) observationsAfterProviderCancel += 1;
      return input.cursor;
    },
    async foundryCancelProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      providerCancelCalls += 1;
      providerCancelled = true;
      return input.cursor;
    },
    async foundryCancelRunActivity() {
      ledgerCancelCalls += 1;
      throw new FoundryTransientActivityError('simulated ledger cancellation transport failure');
    },
  };
  const options = { addressOverride: testEnv.address, rpcTimeoutMs: 10_000 };
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await worker.runUntil(async () => {
      const request = designRequest('temporal-provider-cancel-commit-agent');
      await startTemporalFoundryRunWorkflow({
        run_id: 'run-temporal-provider-cancel-commit',
        request,
      }, options);
      let designing: FoundryRunWorkflowState | null = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const observed = await queryTemporalFoundryRunWorkflow(
          'run-temporal-provider-cancel-commit',
          options,
        );
        if (
          observed.inspection?.run.state === 'designing'
          && observed.provider_operation_cursor?.status === 'pending'
        ) {
          designing = observed;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(designing, 'Provider operation did not reach a cancellable pending cursor.');
      await assert.rejects(cancelTemporalFoundryRun({
        run_id: 'run-temporal-provider-cancel-commit',
        expected_revision: designing.inspection!.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: designing.inspection!,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, options));

      const terminal = await waitForState(
        'run-temporal-provider-cancel-commit',
        'terminal',
        testEnv.address,
      );
      assert.equal(terminal.inspection?.run.state, 'failed');
      assert.equal(providerCancelCalls, 1);
      assert.equal(ledgerCancelCalls, 3);
      assert.equal(observationsAfterProviderCancel, 0);
      const history = await dependencies.events.read('run-temporal-provider-cancel-commit');
      assert.deepEqual(history.map((event) => event.event_type), [
        'foundry_run_accepted',
        'design_started',
        'foundry_run_failed',
      ]);
      assert.equal(
        history.at(-1)?.payload.failure_code,
        'foundry_cancel_commit_failed_after_provider_cancel',
      );
    });
  } finally {
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal does not advance a terminal provider result while cancellation is waiting', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-provider-read-cancel-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const dependencies = passingKernelDependencies();
  const kernel = new FoundryKernel(dependencies);
  const base = buildFoundryTemporalActivities(() => kernel);
  let reportReadStarted = () => {};
  let releaseRead = () => {};
  let reportAuthorized = () => {};
  let reportProviderCancelStarted = () => {};
  let releaseProviderCancel = () => {};
  const readStarted = new Promise<void>((resolve) => { reportReadStarted = resolve; });
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  const authorized = new Promise<void>((resolve) => { reportAuthorized = resolve; });
  const providerCancelStarted = new Promise<void>((resolve) => {
    reportProviderCancelStarted = resolve;
  });
  const providerCancelGate = new Promise<void>((resolve) => { releaseProviderCancel = resolve; });
  let designAdvanceCalls = 0;
  const activities = {
    ...registeredActivities,
    ...base,
    async foundryAdvanceRunActivity(input: Parameters<typeof base.foundryAdvanceRunActivity>[0]) {
      if (input.phase === 'design') designAdvanceCalls += 1;
      return base.foundryAdvanceRunActivity(input);
    },
    async foundryLaunchProviderOperationActivity(operation: { operation_key: string; phase: string }) {
      return operation.phase === 'design' ? providerCursor(operation.operation_key) : null;
    },
    async foundryObserveProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      if (input.cursor.version !== 'opl-foundry-provider-operation-cursor.v2') {
        throw new Error('Expected the generation-bound provider cursor.');
      }
      return providerCursor(input.cursor.operation_key, {
        ...input.cursor,
        current_stage_id: 'evaluation-design',
        visited_path: [
          { workflow_id: 'workflow:mission-intake', stage_id: 'mission-intake' },
          { workflow_id: 'workflow:evaluation-design', stage_id: 'evaluation-design' },
        ],
        status: 'terminal',
      });
    },
    async foundryReadProviderOperationTerminalActivity(input: { cursor: FoundryProviderOperationCursor }) {
      reportReadStarted();
      await readGate;
      return input.cursor;
    },
    async foundryAuthorizeCancelRunActivity(input: Parameters<typeof base.foundryAuthorizeCancelRunActivity>[0]) {
      const result = await base.foundryAuthorizeCancelRunActivity(input);
      reportAuthorized();
      return result;
    },
    async foundryCancelProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      reportProviderCancelStarted();
      await providerCancelGate;
      return input.cursor;
    },
  };
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await worker.runUntil(async () => {
      const runId = 'run-temporal-provider-read-cancel';
      const request = designRequest('temporal-provider-read-cancel-agent');
      await startTemporalFoundryRunWorkflow({ run_id: runId, request }, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      await within(readStarted, 2_000, 'Provider terminal read did not start.');
      const designing = await queryTemporalFoundryRunWorkflow(runId, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      const cancellation = cancelTemporalFoundryRun({
        run_id: runId,
        expected_revision: designing.inspection!.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: designing.inspection!,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      await within(authorized, 2_000, 'Cancellation was not authorized during provider read.');
      releaseRead();
      await within(providerCancelStarted, 2_000, 'Provider cancellation did not start after read.');
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(designAdvanceCalls, 0);
      releaseProviderCancel();
      const cancelled = await cancellation;
      assert.equal(cancelled.inspection?.run.state, 'cancelled');
      assert.equal(designAdvanceCalls, 0);
    });
  } finally {
    releaseRead();
    releaseProviderCancel();
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal completes an overlapping cancel Update before provider continue-as-new', async (t) => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  if (!testEnv.supportsTimeSkipping) {
    await testEnv.teardown();
    t.skip('The continue-as-new Update race proof requires Temporal time skipping.');
    return;
  }
  const taskQueue = `opl-foundry-temporal-provider-continue-cancel-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const dependencies = passingKernelDependencies();
  const kernel = new FoundryKernel(dependencies);
  const base = buildFoundryTemporalActivities(() => kernel);
  let reportBoundaryObserve = () => {};
  let releaseBoundaryObserve = () => {};
  let reportAuthorized = () => {};
  let reportProviderCancel = () => {};
  let releaseProviderCancel = () => {};
  const boundaryObserve = new Promise<void>((resolve) => { reportBoundaryObserve = resolve; });
  const boundaryObserveGate = new Promise<void>((resolve) => { releaseBoundaryObserve = resolve; });
  const authorized = new Promise<void>((resolve) => { reportAuthorized = resolve; });
  const providerCancel = new Promise<void>((resolve) => { reportProviderCancel = resolve; });
  const providerCancelGate = new Promise<void>((resolve) => { releaseProviderCancel = resolve; });
  let observeCalls = 0;
  const activities = {
    ...registeredActivities,
    ...base,
    async foundryLaunchProviderOperationActivity(operation: { operation_key: string; phase: string }) {
      return operation.phase === 'design' ? providerCursor(operation.operation_key) : null;
    },
    async foundryObserveProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      observeCalls += 1;
      if (observeCalls === 64) {
        reportBoundaryObserve();
        await boundaryObserveGate;
      }
      return input.cursor;
    },
    async foundryAuthorizeCancelRunActivity(input: Parameters<typeof base.foundryAuthorizeCancelRunActivity>[0]) {
      const result = await base.foundryAuthorizeCancelRunActivity(input);
      reportAuthorized();
      return result;
    },
    async foundryCancelProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      reportProviderCancel();
      await providerCancelGate;
      return input.cursor;
    },
  };
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await worker.runUntil(async () => {
      const runId = 'run-temporal-provider-continue-cancel';
      const request = designRequest('temporal-provider-continue-cancel-agent');
      const workflowId = foundryTemporalWorkflowId(runId);
      const handle = await testEnv.client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput(runId, request)],
        taskQueue,
        workflowId,
      });
      await testEnv.sleep('6 minutes');
      await within(boundaryObserve, 2_000, 'The 64th provider observation did not start.');
      const pending = await queryTemporalFoundryRunWorkflow(runId, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      const cancellation = cancelTemporalFoundryRun({
        run_id: runId,
        expected_revision: pending.inspection!.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: pending.inspection!,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      await within(authorized, 2_000, 'Cancellation was not authorized at the history boundary.');
      releaseBoundaryObserve();
      await within(providerCancel, 2_000, 'Provider cancellation did not start at the history boundary.');
      const activeHistory = await handle.fetchHistory();
      assert.equal(
        (activeHistory.events ?? []).some((event) =>
          Boolean(record(event)?.workflowExecutionContinuedAsNewEventAttributes)),
        false,
      );
      releaseProviderCancel();
      const cancelled = await cancellation;
      assert.equal(cancelled.inspection?.run.state, 'cancelled');
      const finalHistory = await handle.fetchHistory();
      assert.equal(
        (finalHistory.events ?? []).some((event) =>
          Boolean(record(event)?.workflowExecutionContinuedAsNewEventAttributes)),
        false,
      );
    });
  } finally {
    releaseBoundaryObserve();
    releaseProviderCancel();
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal bounds provider observation history with continue-as-new and preserves query and cancel', async (t) => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  if (!testEnv.supportsTimeSkipping) {
    await testEnv.teardown();
    t.skip('The bounded-history proof requires Temporal time skipping.');
    return;
  }
  const taskQueue = `opl-foundry-temporal-provider-history-${Date.now()}`;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  const dependencies = passingKernelDependencies();
  const kernel = new FoundryKernel(dependencies);
  const base = buildFoundryTemporalActivities(() => kernel);
  let launchCalls = 0;
  let observeCalls = 0;
  let providerCancelCalls = 0;
  let startCalls = 0;
  let reportResumedStart = () => {};
  let releaseResumedStart = () => {};
  const resumedStart = new Promise<void>((resolve) => { reportResumedStart = resolve; });
  const resumedStartGate = new Promise<void>((resolve) => { releaseResumedStart = resolve; });
  const activities = {
    ...registeredActivities,
    ...base,
    async foundryStartRunActivity(input: Parameters<typeof base.foundryStartRunActivity>[0]) {
      startCalls += 1;
      if (startCalls === 2) {
        reportResumedStart();
        await resumedStartGate;
      }
      return base.foundryStartRunActivity(input);
    },
    async foundryLaunchProviderOperationActivity(operation: { operation_key: string; phase: string }) {
      if (operation.phase !== 'design') return null;
      launchCalls += 1;
      return providerCursor(operation.operation_key);
    },
    async foundryObserveProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      observeCalls += 1;
      return input.cursor;
    },
    async foundryCancelProviderOperationActivity(input: { cursor: FoundryProviderOperationCursor }) {
      providerCancelCalls += 1;
      return input.cursor;
    },
  };
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath,
      activities,
    });
    await worker.runUntil(async () => {
      const runId = 'run-temporal-provider-history';
      const request = designRequest('temporal-provider-history-agent');
      const workflowId = foundryTemporalWorkflowId(runId);
      const handle = await testEnv.client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput(runId, request)],
        taskQueue,
        workflowId,
      });
      const firstExecutionRunId = handle.firstExecutionRunId;
      await testEnv.sleep('6 minutes');
      await within(resumedStart, 2_000, 'Continued execution did not enter its start readback.');

      const firstExecution = testEnv.client.workflow.getHandle(workflowId, firstExecutionRunId);
      const firstHistory = await firstExecution.fetchHistory();
      const firstEvents = firstHistory.events ?? [];
      assert.ok(
        record(firstEvents.at(-1))?.workflowExecutionContinuedAsNewEventAttributes,
        `The first provider observation execution did not continue as new: ${JSON.stringify({
          count: firstEvents.length,
          last: Object.keys(record(firstEvents.at(-1)) ?? {}),
          launchCalls,
          observeCalls,
        })}`,
      );
      assert.ok(firstEvents.length < 1_024, `Unbounded history length: ${firstEvents.length}`);
      assert.equal(launchCalls, 1);
      assert.ok(observeCalls >= 64);

      const pending = await queryTemporalFoundryRunWorkflow(runId, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      assert.equal(pending.workflow_status, 'starting');
      assert.equal(pending.provider_operation_cursor?.status, 'pending');
      assert.equal(pending.provider_operation_cursor?.operation_key.startsWith('opl-foundry-step.v1/'), true);

      const durableInspection = await kernel.inspectRun(runId);
      const cancellation = cancelTemporalFoundryRun({
        run_id: runId,
        expected_revision: durableInspection.run.revision,
        authority_receipt_ref: authorizeTemporalMutation({
          inspection: durableInspection,
          action: 'cancel',
          decision: 'cancel',
        }),
      }, {
        addressOverride: testEnv.address,
        rpcTimeoutMs: 10_000,
      });
      releaseResumedStart();
      const cancelled = await cancellation;
      assert.equal(cancelled.inspection?.run.state, 'cancelled');
      assert.equal(providerCancelCalls, 1);
      assert.equal(launchCalls, 1);
      assert.equal(startCalls, 2);
      assert.deepEqual(
        (await dependencies.events.read(runId)).map((event) => event.event_type),
        ['foundry_run_accepted', 'design_started', 'foundry_run_cancelled'],
      );
    });
  } finally {
    releaseResumedStart();
    if (previousTaskQueue === undefined) delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    else process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    await testEnv.teardown();
  }
});

test('Temporal retries a transient Foundry activity three times without Kernel retry or generation consumption', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-retry-${Date.now()}`;
  let designCalls = 0;
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: {
      producer_id: 'designer:transient',
      design: async () => {
        designCalls += 1;
        throw new FoundryTransientActivityError('temporary designer transport failure');
      },
      diagnose: async () => { throw new Error('diagnose should not run'); },
    },
    evaluator: {
      evaluator_id: 'evaluator:transient-fixture',
      evaluate: async () => { throw new Error('evaluate should not run'); },
      canary: async () => { throw new Error('canary should not run'); },
    },
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
    activityMaxAttempts: 1,
    propagateTransientActivityFailures: true,
  });
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: testEnv.namespace,
    taskQueue,
    workflowsPath,
    activities: { ...registeredActivities, ...buildFoundryTemporalActivities(() => kernel) },
  });
  try {
    const result = await worker.runUntil(async () => {
      const request = designRequest('temporal-retry-agent');
      const handle = await testEnv.client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput('run-temporal-retry', request)],
        taskQueue,
        workflowId: `wf-foundry-retry-${Date.now()}`,
      });
      return handle.result() as Promise<FoundryRunWorkflowState>;
    });
    assert.equal(result.inspection?.run.state, 'failed');
    assert.equal(result.inspection?.run.generation, 0);
    assert.equal(designCalls, 3);
    const history = await events.read('run-temporal-retry');
    assert.deepEqual(history.map((event) => event.event_type), [
      'foundry_run_accepted',
      'design_started',
      'foundry_run_failed',
    ]);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal replays a journaled evaluation to repair qualification append without an orphan version', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-evaluation-unknown-${Date.now()}`;
  const events = new FailOnceBeforeQualificationAppendStore();
  const versions = new InMemoryVersionRegistry();
  let evaluationCalls = 0;
  const operationKeys: string[] = [];
  const evaluator: EvaluationExecutor = {
    evaluator_id: 'evaluator:temporal-fixture',
    evaluate: async (input) => {
      evaluationCalls += 1;
      operationKeys.push(input.operation_identity?.operation_key ?? '');
      return passingEvidence({
        runId: input.run_id,
        request: input.request,
        blueprint: input.blueprint,
        candidate: input.candidate,
      });
    },
    canary: async () => { throw new Error('canary should not run'); },
  };
  const kernel = new FoundryKernel(passingKernelDependencies({ events, evaluator, versions }));
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: testEnv.namespace,
    taskQueue,
    workflowsPath,
    activities: { ...registeredActivities, ...buildFoundryTemporalActivities(() => kernel) },
  });
  const request = designRequest('temporal-evaluation-unknown-agent');
  request.delivery_policy = { ...request.delivery_policy, activation_mode: 'qualify_only' };
  try {
    const { result, temporalHistory } = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput('run-temporal-evaluation-unknown', request)],
        taskQueue,
        workflowId: `wf-foundry-evaluation-unknown-${Date.now()}`,
      });
      const result = await handle.result() as FoundryRunWorkflowState;
      return { result, temporalHistory: await handle.fetchHistory() };
    });

    const foundryHistory = await events.read('run-temporal-evaluation-unknown');
    assert.equal(
      result.inspection?.run.state,
      'completed_qualified',
      JSON.stringify(foundryHistory.map((event) => ({ type: event.event_type, payload: event.payload }))),
    );
    assert.equal(evaluationCalls, 1);
    assert.equal(operationKeys.length, 1);
    assert.match(operationKeys[0]!, /^opl-foundry-evaluation\.v1\/run-temporal-evaluation-unknown\/0\/evaluate\/sha256:/);
    assert.equal((await versions.list('temporal-evaluation-unknown-agent', 'temporal_fixture')).length, 1);
    assert.equal(foundryHistory.filter((event) => event.event_type === 'candidate_qualified').length, 1);
    assert.equal(foundryHistory.at(-1)?.event_type, 'qualification_completed');
    const evaluateIds = advanceActivityIds(temporalHistory).filter((id) => id.includes('/evaluate/'));
    assert.equal(evaluateIds.length, 1);
    assert.match(evaluateIds[0]!, /^opl-foundry-step\.v1\/run-temporal-evaluation-unknown\/4\/evaluate\/sha256:/);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal fails closed before registration when evaluator completion is unknown without a journal result', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-evaluation-unjournaled-${Date.now()}`;
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  let evaluationCalls = 0;
  const evaluator: EvaluationExecutor = {
    evaluator_id: 'evaluator:temporal-fixture',
    evaluate: async (input) => {
      evaluationCalls += 1;
      passingEvidence({
        runId: input.run_id,
        request: input.request,
        blueprint: input.blueprint,
        candidate: input.candidate,
      });
      throw new FoundryTransientActivityError('evaluator completion was lost before journal commit');
    },
    canary: async () => { throw new Error('canary should not run'); },
  };
  const kernel = new FoundryKernel(passingKernelDependencies({ events, evaluator, versions }));
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: testEnv.namespace,
    taskQueue,
    workflowsPath,
    activities: { ...registeredActivities, ...buildFoundryTemporalActivities(() => kernel) },
  });
  try {
    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput(
          'run-temporal-evaluation-unjournaled',
          designRequest('temporal-evaluation-unjournaled-agent'),
        )],
        taskQueue,
        workflowId: `wf-foundry-evaluation-unjournaled-${Date.now()}`,
      });
      return handle.result() as Promise<FoundryRunWorkflowState>;
    });

    const foundryHistory = await events.read('run-temporal-evaluation-unjournaled');
    assert.equal(result.inspection?.run.state, 'failed');
    assert.equal(evaluationCalls, 1);
    assert.equal((await versions.list('temporal-evaluation-unjournaled-agent', 'temporal_fixture')).length, 0);
    assert.equal(foundryHistory.at(-1)?.payload.failure_code, 'foundry_activity_unknown_outcome');
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal recovers the ledger result when evaluation Activity completion is lost after append', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-evaluation-recovery-${Date.now()}`;
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  let evaluationCalls = 0;
  const evaluator: EvaluationExecutor = {
    evaluator_id: 'evaluator:temporal-fixture',
    evaluate: async (input) => {
      evaluationCalls += 1;
      return passingEvidence({
        runId: input.run_id,
        request: input.request,
        blueprint: input.blueprint,
        candidate: input.candidate,
      });
    },
    canary: async () => { throw new Error('canary should not run'); },
  };
  const kernel = new LoseFirstEvaluationActivityCompletionKernel(
    passingKernelDependencies({ events, evaluator, versions }),
  );
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: testEnv.namespace,
    taskQueue,
    workflowsPath,
    activities: { ...registeredActivities, ...buildFoundryTemporalActivities(() => kernel) },
  });
  const request = designRequest('temporal-evaluation-recovery-agent');
  request.delivery_policy = { ...request.delivery_policy, activation_mode: 'qualify_only' };
  try {
    const { result, temporalHistory } = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput('run-temporal-evaluation-recovery', request)],
        taskQueue,
        workflowId: `wf-foundry-evaluation-recovery-${Date.now()}`,
      });
      const result = await handle.result() as FoundryRunWorkflowState;
      return { result, temporalHistory: await handle.fetchHistory() };
    });

    const foundryHistory = await events.read('run-temporal-evaluation-recovery');
    assert.equal(
      result.inspection?.run.state,
      'completed_qualified',
      JSON.stringify(foundryHistory.map((event) => ({ type: event.event_type, payload: event.payload }))),
    );
    assert.equal(evaluationCalls, 1);
    assert.equal((await versions.list('temporal-evaluation-recovery-agent', 'temporal_fixture')).length, 1);
    assert.equal(foundryHistory.filter((event) => event.event_type === 'candidate_qualified').length, 1);
    assert.equal(foundryHistory.at(-1)?.event_type, 'qualification_completed');
    const evaluateIds = advanceActivityIds(temporalHistory).filter((id) => id.includes('/evaluate/'));
    assert.equal(evaluateIds.length, 1);
    assert.match(evaluateIds[0]!, /^opl-foundry-step\.v1\/run-temporal-evaluation-recovery\/4\/evaluate\/sha256:/);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal cancel bypasses a long design Activity and closes one authoritative event chain', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-foundry-temporal-cancel-race-${Date.now()}`;
  let enterDesign!: () => void;
  let releaseDesign!: () => void;
  let designReleased = false;
  const designEntered = new Promise<void>((resolve) => { enterDesign = resolve; });
  const designRelease = new Promise<void>((resolve) => {
    releaseDesign = () => {
      designReleased = true;
      resolve();
    };
  });
  const dependencies = passingKernelDependencies();
  const designer: DesignerPort = {
    producer_id: 'designer:long-temporal-fixture',
    design: async (request) => {
      enterDesign();
      await designRelease;
      return agentBlueprint(request);
    },
    diagnose: async () => { throw new Error('diagnose should not run'); },
  };
  const kernel = new FoundryKernel({ ...dependencies, designer });
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: testEnv.namespace,
    taskQueue,
    workflowsPath,
    activities: { ...registeredActivities, ...buildFoundryTemporalActivities(() => kernel) },
  });
  const options = { addressOverride: testEnv.address, rpcTimeoutMs: 10_000 };
  try {
    await worker.runUntil(async () => {
      try {
        const request = designRequest('temporal-cancel-race-agent');
        await testEnv.client.workflow.start('FoundryRunWorkflow', {
          args: [workflowInput('run-temporal-cancel-race', request)],
          taskQueue,
          workflowId: foundryTemporalWorkflowId('run-temporal-cancel-race'),
        });
        await within(designEntered, 2_000, 'Long design Activity did not start.');
        const designing = await queryTemporalFoundryRunWorkflow('run-temporal-cancel-race', options);
        assert.equal(designing.inspection?.run.state, 'designing');
        const cancelled = await within(cancelTemporalFoundryRun({
          run_id: 'run-temporal-cancel-race',
          expected_revision: designing.inspection!.run.revision,
          authority_receipt_ref: authorizeTemporalMutation({
            inspection: designing.inspection!,
            action: 'cancel',
            decision: 'cancel',
          }),
        }, options), 2_000, 'Cancel waited for the long design Activity.');
        assert.equal(cancelled.inspection?.run.state, 'cancelled');
        assert.equal(designReleased, false);
        releaseDesign();
        const terminal = await waitForState('run-temporal-cancel-race', 'terminal', testEnv.address);
        assert.equal(terminal.inspection?.run.state, 'cancelled');
        const history = await dependencies.events.read('run-temporal-cancel-race');
        assert.deepEqual(history.map((event) => event.event_type), [
          'foundry_run_accepted',
          'design_started',
          'foundry_run_cancelled',
        ]);
        assert.deepEqual(history.map((event) => event.revision), [1, 2, 3]);
      } finally {
        releaseDesign();
      }
    });
  } finally {
    releaseDesign();
    await testEnv.teardown();
  }
});
