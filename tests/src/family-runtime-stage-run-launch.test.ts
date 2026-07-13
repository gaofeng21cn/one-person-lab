import assert from 'node:assert/strict';
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
} from '../../src/modules/runway/family-runtime-stage-run-identity.ts';
import { launchRegisteredStageRun } from '../../src/modules/runway/family-runtime-stage-run-launch.ts';
import { materializeStageRunRoute } from '../../src/modules/runway/family-runtime-stage-run-route-launch.ts';
import {
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
} from '../../src/modules/runway/family-runtime-stage-run-launch-registry.ts';
import { requireTemporalStageRunWorkflowInputLaunchable } from '../../src/modules/runway/family-runtime-temporal.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/modules/stagecraft/stage-quality-cycle.ts';

function binding(stageId = 'intake'): StandardAgentStageQualityRuntimeBinding {
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
    stage_goal_refs: [`goal:${stageId}`],
    source_refs: ['source:request'],
    lineage_refs: [`lineage:${stageId}`],
    manifest_ref: 'agent/stages/manifest.json',
    manifest_sha256: 'a'.repeat(64),
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
} = {}) {
  const stageId = input.stageId ?? 'intake';
  return buildPackBoundTemporalStageRunInput({
    binding: binding(stageId),
    domainPackRoot: '/tmp/managed-checkout-one',
    domainId: 'medautoscience',
    stageId,
    stageRunInvocationId: input.invocationId ?? 'sri_fixture',
    workspaceLocator: input.locator ?? workspaceLocator(),
    sourceFingerprint: input.sourceFingerprint ?? 'sha256:source-one',
    actionId: 'draft-paper',
    taskId: 'task:one',
    artifactRefs: ['artifact:request'],
    artifactHashes: ['sha256:request'],
  });
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
      runtime_source_readiness: { checkout_path: '/tmp/managed-checkout-one' },
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
          return { workflow_id: target.workflow_id, workflow_status: 'RUNNING' };
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
      artifact_hashes: ['sha256:a'],
    };
    const first = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(first.materialization_status, 'launched');
    assert.equal(first.decision.target_stage_id, 'draft');
    assert.equal(first.durable_launch?.start_status, 'started');
    assert.equal(temporalStarts, 1);
    const stageRunB = launchedInputs.at(-1)!;
    assert.deepEqual(stageRunB.stage_run_spec.input_artifacts, [{
      ref: 'artifact:a', sha256: 'sha256:a',
    }]);
    assert.equal(stageRunB.parent_route_decision_ref, first.parent_route_decision_ref);

    const replay = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(replay.materialization_status, 'existing');
    assert.equal(replay.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 1);

    const bToA = await materializeStageRunRoute({
      parent_stage_run: stageRunB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-b',
      decision: {
        decision_kind: 'route_back',
        target_stage_id: 'intake',
        evidence_refs: ['artifact:b', 'finding:route-back'],
      },
      artifact_refs: ['artifact:b'],
      artifact_hashes: ['sha256:b'],
    }, dependencies);
    assert.equal(bToA.materialization_status, 'launched');
    assert.notEqual(bToA.target_stage_run_id, parent.stage_run_id);
    assert.equal(temporalStarts, 2);

    const laterDecision = await materializeStageRunRoute({
      ...aToB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-a-later',
      decision: { ...aToB.decision, evidence_refs: ['artifact:a-v2'] },
    }, dependencies);
    assert.notEqual(laterDecision.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 3);

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
    assert.equal(temporalStarts, 3);

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
    assert.equal(temporalStarts, 3);
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

test('launch registry recovers pre-start and post-start crash windows without duplicate starts', async () => {
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
        return { workflow_id: workflowInput.workflow_id, workflow_status: 'RUNNING' };
      },
    });
    assert.equal(recoveredPreStart.start_status, 'recovered');
    assert.equal(recoveredPreStart.launch.launch_status, 'started');
    assert.equal(starts, 1);

    const runningReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => assert.fail('running replay must not issue another start'),
    });
    assert.equal(runningReplay.start_status, 'existing');
    assert.equal(starts, 1);

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
    const recoveredPostStartCompleted = await launchRegisteredStageRun({
      db,
      stageRunInput: postStartCompletedInput,
      start: true,
      startWorkflow: async () => ({
        workflow_id: postStartCompletedInput.workflow_id,
        workflow_status: 'COMPLETED',
        recovered_existing_execution: true,
      }),
    });
    assert.equal(recoveredPostStartCompleted.start_status, 'recovered');
    assert.equal(recoveredPostStartCompleted.launch.launch_status, 'closed');
    assert.equal(recoveredPostStartCompleted.launch.terminal_status, 'completed');

    const postStartFailedInput = stageRunInput({ invocationId: 'sri_post_start_failed_crash' });
    registerStageRunLaunch(db, postStartFailedInput);
    const recoveredPostStartFailed = await launchRegisteredStageRun({
      db,
      stageRunInput: postStartFailedInput,
      start: true,
      startWorkflow: async () => ({
        workflow_id: postStartFailedInput.workflow_id,
        workflow_status: 'FAILED',
        recovered_existing_execution: true,
      }),
    });
    assert.equal(recoveredPostStartFailed.start_status, 'recovered');
    assert.equal(recoveredPostStartFailed.launch.launch_status, 'closed');
    assert.equal(recoveredPostStartFailed.launch.terminal_status, 'failed');
  } finally {
    db.close();
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
    assert.deepEqual(replayed.launch.stage_run_input, first);

    const drift = stageRunInput({ sourceFingerprint: 'sha256:source-two' });
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
        workflow_id: input.workflow_id,
        workflow_status: 'RUNNING',
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
