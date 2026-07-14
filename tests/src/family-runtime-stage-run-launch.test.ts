import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import type { StandardAgentStageQualityRuntimeBinding } from '../../src/modules/pack/index.ts';
import { parseFamilyRuntimeCommand } from '../../src/modules/runway/family-runtime-command.ts';
import { buildPackBoundTemporalStageRunInput } from '../../src/modules/runway/family-runtime-pack-bound-stage-run.ts';
import {
  buildCliStageRunInvocationId,
  buildHostedActionStageRunInvocationId,
  buildRouteStageRunInvocation,
  deriveStageRunId,
  stageRunSpecSha256,
} from '../../src/modules/runway/family-runtime-stage-run-identity.ts';
import { launchRegisteredStageRun } from '../../src/modules/runway/family-runtime-stage-run-launch.ts';
import { materializeStageRunRoute } from '../../src/modules/runway/family-runtime-stage-run-route-launch.ts';
import { openQueueDb } from '../../src/modules/runway/family-runtime-store.ts';
import { stageQualityAttemptMaterializeActivity } from '../../src/modules/runway/family-runtime-temporal-activities.ts';
import {
  claimStageRunStart,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
} from '../../src/modules/runway/family-runtime-stage-run-launch-registry.ts';
import { requireTemporalStageRunWorkflowInputLaunchable } from '../../src/modules/runway/family-runtime-temporal.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/modules/stagecraft/stage-quality-cycle.ts';

function digest(label: string) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function createPackFixture(rolePrompt = '# Stage quality roles\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-pack-'));
  const stages = ['intake', 'draft', 'review'];
  const write = (ref: string, bytes: string) => {
    const file = path.join(root, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, 'utf8');
  };
  write('agent/stages/manifest.json', `${JSON.stringify({
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    stages: stages.map((stage_id) => ({ stage_id, goal: `Complete ${stage_id}.` })),
  })}\n`);
  write('contracts/stage_quality_cycle_policy.json', `${JSON.stringify({
    surface_kind: 'opl_domain_stage_quality_cycle_profile',
    stages: Object.fromEntries(stages.map((stageId) => [stageId, { enabled: true }])),
  })}\n`);
  write('agent/prompts/stage-quality.md', rolePrompt);
  write('agent/quality_gates/stage.md', '# Stage quality rubric\n');
  for (const stageId of stages) {
    write(`agent/prompts/${stageId}.md`, `# ${stageId} prompt\n`);
    write(`agent/stages/${stageId}.md`, `# ${stageId} policy\n`);
  }
  return root;
}

const defaultPackRoot = createPackFixture();
test.after(() => fs.rmSync(defaultPackRoot, { recursive: true, force: true }));

function binding(
  stageId = 'intake',
  domainPackRoot = defaultPackRoot,
): StandardAgentStageQualityRuntimeBinding {
  const manifestRef = 'agent/stages/manifest.json';
  const stageIndex = ['intake', 'draft', 'review'].indexOf(stageId);
  return {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: stageId,
    declared_stage_ids: ['intake', 'draft', 'review'],
    enabled: true,
    stage_role: null,
    policy_ref: `contracts/stage_quality_cycle_policy.json#/stages/${stageId}`,
    stage_prompt_ref: `agent/prompts/${stageId}.md`,
    quality_policy: normalizeStageQualityCyclePolicy({
      formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
    }),
    handoff_review_boundary: null,
    role_prompt_refs: {
      producer: 'agent/prompts/stage-quality.md#producer',
      reviewer: 'agent/prompts/stage-quality.md#reviewer',
      repairer: 'agent/prompts/stage-quality.md#repairer',
      re_reviewer: 'agent/prompts/stage-quality.md#re-reviewer',
    },
    quality_rubric_refs: ['agent/quality_gates/stage.md'],
    stage_goal_refs: [`${manifestRef}#/stages/${stageIndex}/goal`],
    source_refs: [`agent/stages/${stageId}.md`],
    lineage_refs: [`${manifestRef}#/stages/${stageIndex}`],
    manifest_ref: manifestRef,
    manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(domainPackRoot, manifestRef)))
      .digest('hex'),
  };
}

function packageUseBinding(input: {
  checkedAt?: string;
  useReceiptRef?: string;
  targetRoot?: string;
  packageVersion?: string;
} = {}) {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:fixture',
    use_receipt_ref: input.useReceiptRef ?? 'opl://agent-package/use/fixture/one',
    root_package: {
      package_id: 'mas',
      package_version: input.packageVersion ?? '0.2.1',
      owner_language_version: { scheme: 'pep440', value: input.packageVersion ?? '0.2.1' },
      package_lock_ref: 'opl://agent-package-lock/mas/0.2.1',
      manifest_sha256: 'b'.repeat(64),
      content_digest: `sha256:${'3'.repeat(64)}`,
      source_artifact_ref: 'oci://opl/mas@sha256:fixture',
      artifact_digest: `sha256:${'4'.repeat(64)}`,
    },
    provider_packages: [{
      package_id: 'mas-scholar-skills',
      package_version: '0.1.1',
      owner_language_version: { scheme: 'semver', value: '0.1.1' },
      package_lock_ref: 'opl://agent-package-lock/mas-scholar-skills/0.1.1',
      manifest_sha256: 'c'.repeat(64),
      content_digest: `sha256:${'d'.repeat(64)}`,
      source_artifact_ref: 'oci://opl/mas-scholar-skills@sha256:fixture',
      artifact_digest: `sha256:${'e'.repeat(64)}`,
    }],
    dependency_closure_digest: 'f'.repeat(64),
    freshness_mode: 'channel_verified',
    latest_verified: true,
    checked_at: input.checkedAt ?? '2026-07-14T00:00:00.000Z',
    refresh_outcome: 'current',
    channel_ref: 'channel:stable',
    channel_digest: 'channel-digest:one',
    scope: 'workspace',
    target_root: input.targetRoot ?? '/tmp/stage-run-workspace',
    core_skill_tree_digest: '1'.repeat(64),
    skill_tree_digest: '2'.repeat(64),
    core_readiness: { status: 'current' },
    specialty_exposure: { status: 'current' },
  };
}

function workspaceLocator(useBinding = packageUseBinding()) {
  return {
    workspace_root: '/tmp/stage-run-workspace',
    domain_pack_root: '/tmp/managed-checkout-one',
    package_use_binding: useBinding,
    checkout_currentness: { status: 'current', checked_at: '2026-07-14T00:00:00.000Z' },
    runtime_source_readiness: {
      checkout_path: '/tmp/managed-checkout-one',
      checked_at: '2026-07-14T00:00:00.000Z',
    },
  };
}

function stageRunInput(input: {
  invocationId?: string;
  stageId?: string;
  sourceFingerprint?: string;
  locator?: Record<string, unknown>;
  domainPackRoot?: string;
  artifactHash?: string;
} = {}) {
  const stageId = input.stageId ?? 'intake';
  const domainPackRoot = input.domainPackRoot ?? defaultPackRoot;
  return buildPackBoundTemporalStageRunInput({
    binding: binding(stageId, domainPackRoot),
    domainPackRoot,
    domainId: 'medautoscience',
    stageId,
    stageRunInvocationId: input.invocationId ?? 'sri_fixture',
    workspaceLocator: input.locator ?? workspaceLocator(),
    sourceFingerprint: input.sourceFingerprint ?? digest('source-one'),
    actionId: 'draft-paper',
    taskId: 'task:one',
    artifactRefs: ['artifact:request'],
    artifactHashes: [input.artifactHash ?? digest('request')],
  });
}

function temporalStartReceipt(
  input: ReturnType<typeof stageRunInput>,
  firstExecutionRunId: string,
  workflowStatus = 'RUNNING',
  extra: Record<string, unknown> = {},
) {
  return {
    stage_run_id: input.stage_run_id,
    stage_run_invocation_id: input.stage_run_invocation_id,
    stage_run_spec_sha256: input.stage_run_spec_sha256,
    workflow_id: input.workflow_id,
    workflow_status: workflowStatus,
    first_execution_run_id: firstExecutionRunId,
    ...extra,
  };
}

test('StageRun identity ignores currentness observations but binds immutable package bytes', () => {
  const firstLocator = workspaceLocator();
  const refreshedLocator = {
    ...workspaceLocator(packageUseBinding({
      checkedAt: '2026-07-14T01:00:00.000Z',
      useReceiptRef: 'opl://agent-package/use/fixture/two',
      targetRoot: '/tmp/other-materialization-path',
    })),
    domain_pack_root: '/tmp/managed-checkout-two',
    checkout_currentness: { status: 'current', checked_at: '2026-07-14T01:00:00.000Z' },
    runtime_source_readiness: {
      checkout_path: '/tmp/managed-checkout-two',
      checked_at: '2026-07-14T01:00:00.000Z',
    },
  };
  const firstInvocation = buildCliStageRunInvocationId({
    domainId: 'medautoscience', stageId: 'intake', actionId: 'draft-paper',
    workspaceLocator: firstLocator, taskId: 'task:one',
  });
  const refreshedInvocation = buildCliStageRunInvocationId({
    domainId: 'medautoscience', stageId: 'intake', actionId: 'draft-paper',
    workspaceLocator: refreshedLocator, taskId: 'task:one',
  });
  assert.equal(refreshedInvocation, firstInvocation);

  const first = stageRunInput({ invocationId: firstInvocation, locator: firstLocator });
  const refreshed = stageRunInput({ invocationId: refreshedInvocation, locator: refreshedLocator });
  assert.equal(refreshed.stage_run_id, first.stage_run_id);
  assert.equal(refreshed.stage_run_spec_sha256, first.stage_run_spec_sha256);

  const packageDrift = stageRunInput({
    invocationId: firstInvocation,
    locator: workspaceLocator(packageUseBinding({ packageVersion: '0.2.2' })),
  });
  assert.equal(packageDrift.stage_run_id, first.stage_run_id);
  assert.notEqual(packageDrift.stage_run_spec_sha256, first.stage_run_spec_sha256);
});

test('route invocation makes A-B-A a new Run while replaying the same decision idempotently', () => {
  const initialInvocation = buildCliStageRunInvocationId({
    domainId: 'medautoscience', stageId: 'intake', actionId: 'draft-paper',
    workspaceLocator: workspaceLocator(), taskId: 'task:one',
  });
  const initialStageRunId = deriveStageRunId({
    domainId: 'medautoscience', stageId: 'intake', stageRunInvocationId: initialInvocation,
  });
  const aToBInput = {
    parentStageRunId: initialStageRunId,
    decisiveAttemptRef: 'opl://stage_attempts/reviewer-a',
    decision: {
      decision_kind: 'advance',
      target_stage_id: 'draft',
      evidence_refs: ['artifact:a'],
    },
    targetStageId: 'draft',
  } as const;
  const aToB = buildRouteStageRunInvocation(aToBInput);
  assert.deepEqual(buildRouteStageRunInvocation(aToBInput), aToB);
  const stageRunB = deriveStageRunId({
    domainId: 'medautoscience', stageId: 'draft', stageRunInvocationId: aToB.stage_run_invocation_id,
  });
  const bToA = buildRouteStageRunInvocation({
    parentStageRunId: stageRunB,
    decisiveAttemptRef: 'opl://stage_attempts/reviewer-b',
    decision: {
      decision_kind: 'route_back',
      target_stage_id: 'intake',
      evidence_refs: ['artifact:b', 'finding:route-back'],
    },
    targetStageId: 'intake',
  });
  assert.notEqual(bToA.stage_run_invocation_id, initialInvocation);
  assert.notEqual(bToA.stage_run_invocation_id, aToB.stage_run_invocation_id);

  const laterDecision = buildRouteStageRunInvocation({
    ...aToBInput,
    decisiveAttemptRef: 'opl://stage_attempts/reviewer-a-later',
  });
  assert.notEqual(laterDecision.stage_run_invocation_id, aToB.stage_run_invocation_id);
});

test('controller route materialization starts targets, replays idempotently, and creates a new A-B-A Run', async () => {
  const db = new DatabaseSync(':memory:');
  const parent = stageRunInput({ invocationId: 'sri_initial_a', stageId: 'intake' });
  const launchedInputs: ReturnType<typeof stageRunInput>[] = [];
  let temporalStarts = 0;
  const dependencies = {
    ensurePackageLaunchReady: async () => ({
      launch_allowed: true,
      runtime_source_readiness: { checkout_path: defaultPackRoot },
      package_use_binding: packageUseBinding(),
    } as any),
    resolveStageBinding: (_root: string, stageId: string) => binding(stageId),
    launchTargetStageRun: async (target: ReturnType<typeof stageRunInput>) => {
      launchedInputs.push(target);
      return await launchRegisteredStageRun({
        db,
        stageRunInput: target,
        start: true,
        startWorkflow: async () => {
          temporalStarts += 1;
          return temporalStartReceipt(target, `temporal-run-route-${target.stage_run_id}`);
        },
      });
    },
  };
  try {
    const aToB = {
      parent_stage_run: parent,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-a',
      decision: {
        decision_kind: 'advance' as const,
        target_stage_id: 'draft',
        evidence_refs: ['artifact:a'],
      },
      artifact_refs: ['artifact:a'],
      artifact_hashes: [digest('artifact-a')],
    };
    const first = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(first.materialization_status, 'launched');
    assert.equal(first.decision.target_stage_id, 'draft');
    assert.equal(first.durable_launch?.start_status, 'started');
    assert.equal(temporalStarts, 1);
    const stageRunB = launchedInputs.at(-1)!;
    assert.deepEqual(stageRunB.stage_run_spec.input_artifacts, [{
      ref: 'artifact:a', sha256: digest('artifact-a'),
    }]);
    assert.equal(stageRunB.parent_route_decision_ref, first.parent_route_decision_ref);

    const replay = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(replay.materialization_status, 'existing');
    assert.equal(replay.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 2);

    const bToA = await materializeStageRunRoute({
      parent_stage_run: stageRunB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-b',
      decision: {
        decision_kind: 'route_back',
        target_stage_id: 'intake',
        evidence_refs: ['artifact:b', 'finding:route-back'],
      },
      artifact_refs: ['artifact:b'],
      artifact_hashes: [digest('artifact-b')],
    }, dependencies);
    assert.equal(bToA.materialization_status, 'launched');
    assert.notEqual(bToA.target_stage_run_id, parent.stage_run_id);
    assert.equal(temporalStarts, 3);

    const laterDecision = await materializeStageRunRoute({
      ...aToB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-a-later',
      decision: { ...aToB.decision, evidence_refs: ['artifact:a-v2'] },
    }, dependencies);
    assert.notEqual(laterDecision.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 4);

    const complete = await materializeStageRunRoute({
      ...aToB,
      decision: { decision_kind: 'complete', evidence_refs: ['artifact:final'] },
    }, {
      launchTargetStageRun: async () => assert.fail('complete must not start another StageRun'),
      ensurePackageLaunchReady: async () => assert.fail('complete must not refresh a package binding'),
      resolveStageBinding: () => assert.fail('complete must not resolve a target binding'),
    });
    assert.equal(complete.materialization_status, 'workflow_complete');
    assert.equal(complete.target_stage_run_id, null);
    assert.equal(temporalStarts, 4);

    await assert.rejects(materializeStageRunRoute({
      ...aToB,
      decision: {
        decision_kind: 'advance',
        target_stage_id: 'undeclared-stage',
        evidence_refs: ['artifact:a'],
      },
    }, dependencies), (error: any) => {
      assert.equal(error.details?.failure_code, 'route_target_stage_not_declared');
      return true;
    });
    assert.equal(temporalStarts, 4);
  } finally {
    db.close();
  }
});

test('Hosted action invocation replays one action run and separates later runs', () => {
  const input = {
    domainId: 'mas',
    stageId: 'intake',
    actionId: 'draft-paper',
    runId: 'hosted-run-one',
    actionRunRef: 'file:///tmp/workspace/.opl/action-runs/hosted-run-one',
  };
  const first = buildHostedActionStageRunInvocationId(input);
  assert.equal(buildHostedActionStageRunInvocationId(input), first);
  assert.notEqual(buildHostedActionStageRunInvocationId({
    ...input,
    runId: 'hosted-run-two',
    actionRunRef: 'file:///tmp/workspace/.opl/action-runs/hosted-run-two',
  }), first);
});

test('launch registry recovers pre-start and unknown-success crash windows through deterministic start replay', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const workflowInput = stageRunInput();
    const planned = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: false,
      startWorkflow: async () => assert.fail('planning must not start Temporal'),
    });
    assert.equal(planned.start_status, 'registered');
    assert.equal(planned.launch.launch_status, 'registered');

    const plannedReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: false,
      startWorkflow: async () => assert.fail('replayed planning must not start Temporal'),
    });
    assert.equal(plannedReplay.start_status, 'existing');
    assert.equal(plannedReplay.launch.launch_status, 'registered');

    let starts = 0;
    const recoveredPreStart = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => {
        starts += 1;
        return temporalStartReceipt(workflowInput, 'temporal-run-pre-start');
      },
    });
    assert.equal(recoveredPreStart.start_status, 'recovered');
    assert.equal(recoveredPreStart.launch.launch_status, 'started');
    assert.equal(starts, 1);

    const runningReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => {
        starts += 1;
        return temporalStartReceipt(workflowInput, 'temporal-run-pre-start', 'RUNNING', {
          recovered_existing_execution: true,
        });
      },
    });
    assert.equal(runningReplay.start_status, 'recovered');
    assert.equal(starts, 2);

    recordStageRunClosed(db, { stageRunId: workflowInput.stage_run_id, terminalStatus: 'completed' });
    const closedReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => assert.fail('closed replay must not issue another start'),
    });
    assert.equal(closedReplay.start_status, 'existing');
    assert.equal(closedReplay.launch.launch_status, 'closed');

    const closedPlanReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: false,
      startWorkflow: async () => assert.fail('closed planning replay must not start Temporal'),
    });
    assert.equal(closedPlanReplay.start_status, 'existing');
    assert.equal(closedPlanReplay.launch.launch_status, 'closed');

    const postStartCompletedInput = stageRunInput({ invocationId: 'sri_post_start_completed_crash' });
    registerStageRunLaunch(db, postStartCompletedInput);
    assert.equal(claimStageRunStart(db, postStartCompletedInput.stage_run_id).launch.launch_status, 'starting');
    const recoveredPostStartCompleted = await launchRegisteredStageRun({
      db,
      stageRunInput: postStartCompletedInput,
      start: true,
      startWorkflow: async () => temporalStartReceipt(
        postStartCompletedInput,
        'temporal-run-post-start-completed',
        'COMPLETED',
        { recovered_existing_execution: true },
      ),
    });
    assert.equal(recoveredPostStartCompleted.start_status, 'recovered');
    assert.equal(recoveredPostStartCompleted.launch.launch_status, 'closed');
    assert.equal(recoveredPostStartCompleted.launch.terminal_status, 'completed');

    const postStartFailedInput = stageRunInput({ invocationId: 'sri_post_start_failed_crash' });
    registerStageRunLaunch(db, postStartFailedInput);
    assert.equal(claimStageRunStart(db, postStartFailedInput.stage_run_id).launch.launch_status, 'starting');
    const recoveredPostStartFailed = await launchRegisteredStageRun({
      db,
      stageRunInput: postStartFailedInput,
      start: true,
      startWorkflow: async () => temporalStartReceipt(
        postStartFailedInput,
        'temporal-run-post-start-failed',
        'FAILED',
        { recovered_existing_execution: true },
      ),
    });
    assert.equal(recoveredPostStartFailed.start_status, 'recovered');
    assert.equal(recoveredPostStartFailed.launch.launch_status, 'closed');
    assert.equal(recoveredPostStartFailed.launch.terminal_status, 'failed');
  } finally {
    db.close();
  }
});

test('two SQLite callers redeliver one deterministic Temporal execution and persist one identity', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-start-claim-'));
  const databasePath = path.join(stateRoot, 'launches.sqlite');
  const firstDb = new DatabaseSync(databasePath);
  const secondDb = new DatabaseSync(databasePath);
  let startCalls = 0;
  const observedExecutionIds = new Set<string>();
  let releaseStart!: () => void;
  let observeClaim!: () => void;
  const startReleased = new Promise<void>((resolve) => { releaseStart = resolve; });
  const claimObserved = new Promise<void>((resolve) => { observeClaim = resolve; });
  try {
    const input = stageRunInput({ invocationId: 'sri_concurrent_start_claim' });
    const first = launchRegisteredStageRun({
      db: firstDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        startCalls += 1;
        observedExecutionIds.add('temporal-run-concurrent');
        observeClaim();
        await startReleased;
        return temporalStartReceipt(input, 'temporal-run-concurrent', 'RUNNING', {
          recovered_existing_execution: false,
        });
      },
    });
    await claimObserved;
    const second = await launchRegisteredStageRun({
      db: secondDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        startCalls += 1;
        observedExecutionIds.add('temporal-run-concurrent');
        return temporalStartReceipt(input, 'temporal-run-concurrent', 'RUNNING', {
          recovered_existing_execution: true,
        });
      },
    });
    assert.equal(second.start_status, 'recovered');
    assert.equal(second.launch.launch_status, 'started');
    assert.equal(startCalls, 2);
    assert.deepEqual([...observedExecutionIds], ['temporal-run-concurrent']);

    releaseStart();
    const started = await first;
    assert.equal(started.launch.launch_status, 'started');
    assert.equal(started.launch.temporal_start_receipt?.first_execution_run_id, 'temporal-run-concurrent');
    assert.equal(startCalls, 2);
  } finally {
    firstDb.close();
    secondDb.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun start transitions are retryable and monotonic after started', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const input = stageRunInput({ invocationId: 'sri_start_retry' });
    await assert.rejects(launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => { throw new Error('provider start unavailable'); },
    }), /provider start unavailable/);
    assert.equal(inspectStageRunLaunch(db, input.stage_run_id).launch_status, 'start_failed');

    let retryStarts = 0;
    const retried = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        retryStarts += 1;
        return temporalStartReceipt(input, 'temporal-run-retry');
      },
    });
    assert.equal(retried.start_status, 'recovered');
    assert.equal(retried.launch.launch_status, 'started');
    assert.equal(retryStarts, 1);

    const afterLateFailure = recordStageRunStartFailure(db, {
      stageRunId: input.stage_run_id,
      error: new Error('late callback failure'),
    });
    assert.equal(afterLateFailure.launch_status, 'started');
    assert.equal(afterLateFailure.last_start_error, null);
    assert.equal(claimStageRunStart(db, input.stage_run_id).claimed, false);
  } finally {
    db.close();
  }
});

test('a concurrent start success repairs start_failed while late failures cannot downgrade it', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-start-race-'));
  const databasePath = path.join(stateRoot, 'launches.sqlite');
  const successDb = new DatabaseSync(databasePath);
  const failureDb = new DatabaseSync(databasePath);
  let releaseSuccess!: () => void;
  let observeClaim!: () => void;
  const successReleased = new Promise<void>((resolve) => { releaseSuccess = resolve; });
  const claimObserved = new Promise<void>((resolve) => { observeClaim = resolve; });
  try {
    const input = stageRunInput({ invocationId: 'sri_concurrent_success_failure' });
    const eventualSuccess = launchRegisteredStageRun({
      db: successDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        observeClaim();
        await successReleased;
        return temporalStartReceipt(input, 'temporal-run-eventual-success');
      },
    });
    await claimObserved;
    await assert.rejects(launchRegisteredStageRun({
      db: failureDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => { throw new Error('unknown concurrent transport failure'); },
    }), /unknown concurrent transport failure/);
    assert.equal(inspectStageRunLaunch(failureDb, input.stage_run_id).launch_status, 'start_failed');

    releaseSuccess();
    const started = await eventualSuccess;
    assert.equal(started.launch.launch_status, 'started');
    assert.equal(started.launch.last_start_error, null);
    assert.equal(recordStageRunStartFailure(failureDb, {
      stageRunId: input.stage_run_id,
      error: new Error('late failure after durable success'),
    }).launch_status, 'started');
  } finally {
    successDb.close();
    failureDb.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('closed wins races with late StageRun start receipts and failures', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-close-race-'));
  const databasePath = path.join(stateRoot, 'launches.sqlite');
  const startDb = new DatabaseSync(databasePath);
  const closeDb = new DatabaseSync(databasePath);
  let releaseStart!: () => void;
  let observeClaim!: () => void;
  const startReleased = new Promise<void>((resolve) => { releaseStart = resolve; });
  const claimObserved = new Promise<void>((resolve) => { observeClaim = resolve; });
  try {
    const input = stageRunInput({ invocationId: 'sri_closed_start_race' });
    const starting = launchRegisteredStageRun({
      db: startDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        observeClaim();
        await startReleased;
        return temporalStartReceipt(input, 'temporal-run-close-race');
      },
    });
    await claimObserved;
    assert.equal(recordStageRunClosed(closeDb, {
      stageRunId: input.stage_run_id,
      terminalStatus: 'canceled',
    })?.launch_status, 'closed');
    releaseStart();

    const completedCallback = await starting;
    assert.equal(completedCallback.launch.launch_status, 'closed');
    assert.equal(completedCallback.launch.terminal_status, 'canceled');
    assert.equal(completedCallback.launch.temporal_start_receipt?.workflow_status, 'RUNNING');
    const afterLateFailure = recordStageRunStartFailure(startDb, {
      stageRunId: input.stage_run_id,
      error: new Error('late start failure'),
    });
    assert.equal(afterLateFailure.launch_status, 'closed');
    assert.equal(afterLateFailure.terminal_status, 'canceled');
    assert.throws(() => recordStageRunTemporalStart(startDb, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: {
        stage_run_id: input.stage_run_id,
        stage_run_invocation_id: input.stage_run_invocation_id,
        stage_run_spec_sha256: input.stage_run_spec_sha256,
        workflow_id: input.workflow_id,
        workflow_status: 'RUNNING',
        first_execution_run_id: 'different-temporal-execution',
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_temporal_execution_identity_conflict');
      return true;
    });
  } finally {
    startDb.close();
    closeDb.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('one invocation rejects immutable spec drift and preserves the original registered input', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const first = stageRunInput();
    const registered = registerStageRunLaunch(db, first);
    assert.equal(registered.registered, true);
    const volatileReplay = {
      ...first,
      workspace_locator: {
        ...first.workspace_locator,
        checkout_currentness: { status: 'current', checked_at: '2026-07-14T02:00:00.000Z' },
      },
    };
    const replayed = registerStageRunLaunch(db, volatileReplay);
    assert.equal(replayed.idempotent_replay, true);
    assert.deepEqual(replayed.launch.stage_run_input.workspace_locator, volatileReplay.workspace_locator);
    assert.equal(replayed.launch.stage_run_input.stage_run_spec_sha256, first.stage_run_spec_sha256);

    const drift = stageRunInput({ sourceFingerprint: digest('source-two') });
    assert.throws(() => registerStageRunLaunch(db, drift), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_invocation_spec_conflict');
      return true;
    });
    assert.equal(inspectStageRunLaunch(db, first.stage_run_id).stage_run_spec_sha256,
      first.stage_run_spec_sha256);
  } finally {
    db.close();
  }
});

test('one ref with changed prompt bytes changes the immutable spec and fails closed on replay', () => {
  const firstPackRoot = createPackFixture('# Stage quality roles\nfirst bytes\n');
  const changedPackRoot = createPackFixture('# Stage quality roles\nchanged bytes\n');
  const db = new DatabaseSync(':memory:');
  try {
    const invocationId = 'sri_same_ref_changed_prompt_bytes';
    const first = stageRunInput({ invocationId, domainPackRoot: firstPackRoot });
    const changed = stageRunInput({ invocationId, domainPackRoot: changedPackRoot });
    const firstPrompt = first.stage_run_spec.content_bindings.find((entry) =>
      entry.purpose === 'role_prompt' && entry.ref.endsWith('#producer'));
    const changedPrompt = changed.stage_run_spec.content_bindings.find((entry) =>
      entry.purpose === 'role_prompt' && entry.ref.endsWith('#producer'));
    assert.equal(firstPrompt?.ref, changedPrompt?.ref);
    assert.notEqual(firstPrompt?.sha256, changedPrompt?.sha256);
    assert.notEqual(first.stage_run_spec_sha256, changed.stage_run_spec_sha256);

    registerStageRunLaunch(db, first);
    assert.throws(() => registerStageRunLaunch(db, changed), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_invocation_spec_conflict');
      return true;
    });
  } finally {
    db.close();
    fs.rmSync(firstPackRoot, { recursive: true, force: true });
    fs.rmSync(changedPackRoot, { recursive: true, force: true });
  }
});

test('registered StageRun fails closed before replay when managed prompt bytes drift in place', () => {
  const packRoot = createPackFixture('# Stage quality roles\nregistered bytes\n');
  const db = new DatabaseSync(':memory:');
  try {
    const input = stageRunInput({
      invocationId: 'sri_registered_prompt_bytes_drift',
      domainPackRoot: packRoot,
    });
    registerStageRunLaunch(db, input);
    fs.writeFileSync(
      path.join(packRoot, 'agent/prompts/stage-quality.md'),
      '# Stage quality roles\nmutated after registration\n',
      'utf8',
    );
    assert.throws(() => registerStageRunLaunch(db, input), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_content_digest_mismatch');
      assert.equal(error.details?.purpose, 'role_prompt');
      return true;
    });
    assert.equal(inspectStageRunLaunch(db, input.stage_run_id).launch_status, 'registered');
  } finally {
    db.close();
    fs.rmSync(packRoot, { recursive: true, force: true });
  }
});

test('Attempt materialization rejects pack byte drift after the StageRun has started', async () => {
  const packRoot = createPackFixture('# Stage quality roles\nstarted bytes\n');
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-materialization-state-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const input = stageRunInput({
      invocationId: 'sri_attempt_materialization_prompt_drift',
      domainPackRoot: packRoot,
    });
    const { db } = openQueueDb();
    try {
      registerStageRunLaunch(db, input);
    } finally {
      db.close();
    }
    fs.writeFileSync(
      path.join(packRoot, 'agent/prompts/stage-quality.md'),
      '# Stage quality roles\nchanged before next Attempt\n',
      'utf8',
    );
    await assert.rejects(stageQualityAttemptMaterializeActivity({
      stage_run: input,
      quality_cycle_id: 'sqc_attempt_materialization_prompt_drift',
      attempt_role: 'producer',
      quality_round_index: 0,
      artifact_refs: input.artifact_refs ?? [],
      artifact_hashes: input.artifact_hashes ?? [],
      artifact_identity_receipt_refs: [],
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_content_digest_mismatch');
      assert.equal(error.details?.purpose, 'role_prompt');
      return true;
    });
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(packRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun immutable input artifacts require canonical SHA-256 digests', () => {
  assert.throws(() => stageRunInput({
    invocationId: 'sri_invalid_input_artifact_digest',
    artifactHash: 'sha256:not-a-digest',
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_content_digest_invalid');
    assert.equal(error.details?.field, 'input_artifact_hashes[0]');
    return true;
  });
});

test('StageRun creation fails closed when root package content_digest is missing', () => {
  const useBinding: any = packageUseBinding();
  delete useBinding.root_package.content_digest;
  assert.throws(() => stageRunInput({
    invocationId: 'sri_missing_root_content_digest',
    locator: workspaceLocator(useBinding),
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_root_package_content_digest_missing');
    return true;
  });
});

test('registry validates exact input before write and start receipt cannot reopen a closed Run', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const input = stageRunInput({ invocationId: 'sri_registry_validation' });
    assert.throws(() => registerStageRunLaunch(db, {
      ...input,
      stage_run_id: 'sr_tampered_before_write',
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_identity_mismatch');
      return true;
    });
    const table = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_run_launches'
    `).get();
    assert.equal(table, undefined);

    registerStageRunLaunch(db, input);
    recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'completed' });
    const afterLateStartReceipt = recordStageRunTemporalStart(db, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: {
        stage_run_id: input.stage_run_id,
        stage_run_invocation_id: input.stage_run_invocation_id,
        stage_run_spec_sha256: input.stage_run_spec_sha256,
        workflow_id: input.workflow_id,
        workflow_status: 'RUNNING',
        first_execution_run_id: 'temporal-run-closed-late-receipt',
      },
    });
    assert.equal(afterLateStartReceipt.launch_status, 'closed');
    assert.equal(afterLateStartReceipt.terminal_status, 'completed');
    assert.equal(afterLateStartReceipt.temporal_start_receipt?.workflow_status, 'RUNNING');
  } finally {
    db.close();
  }
});

test('StageRun launch validation rejects id and envelope drift', () => {
  const input = stageRunInput();
  assert.equal(requireTemporalStageRunWorkflowInputLaunchable(input), input);
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...input,
    stage_run_id: 'sr_tampered',
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_identity_mismatch');
    return true;
  });
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...input,
    workspace_locator: { ...input.workspace_locator, workspace_root: '/tmp/wrong-target' },
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_spec_envelope_mismatch');
    return true;
  });
  const missingReviewerPrompt = {
    ...input.stage_run_spec,
    content_bindings: input.stage_run_spec.content_bindings.filter((entry) =>
      !(entry.purpose === 'role_prompt' && entry.ref.endsWith('#reviewer'))),
  };
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...input,
    stage_run_spec: missingReviewerPrompt,
    stage_run_spec_sha256: stageRunSpecSha256(missingReviewerPrompt),
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_content_ref_coverage_incomplete');
    return true;
  });
});

test('CLI parser exposes explicit new StageRun and exact input artifact identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-parser-state-'));
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-parser-family-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const previousFamilyRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = familyRoot;
    const parsed = parseFamilyRuntimeCommand([
      'attempt', 'create', '--domain', 'medautoscience', '--stage', 'intake',
      '--workspace-locator', JSON.stringify({ workspace_root: '/tmp/workspace' }),
      '--new-stage-run',
      '--input-artifact-ref', 'artifact:request',
      '--input-artifact-sha256', 'sha256:request',
    ]);
    assert.equal(parsed.mode, 'attempt_create');
    if (parsed.mode !== 'attempt_create') assert.fail('expected attempt_create');
    assert.equal(parsed.input.newStageRun, true);
    assert.deepEqual(parsed.input.inputArtifactRefs, ['artifact:request']);
    assert.deepEqual(parsed.input.inputArtifactHashes, ['sha256:request']);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    if (previousFamilyRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousFamilyRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyRoot, { recursive: true, force: true });
  }
});
