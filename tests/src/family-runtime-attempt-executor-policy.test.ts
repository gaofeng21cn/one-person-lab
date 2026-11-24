import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { normalizeStageQualityCyclePolicy } from '../../src/authority/stages/stage-quality-cycle.ts';
import { stageAttemptExecutorPolicyWithReviewLane } from '../../src/authority/packages/index.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../src/authority/packages/index.ts';
import { canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import { buildPackBoundTemporalStageRunInput } from '../../src/adapters/execution/family-runtime-pack-bound-stage-run.ts';
import { stageRunSpecSha256 } from '../../src/adapters/execution/family-runtime-stage-run-identity.ts';
import { runFamilyRuntime } from '../../src/adapters/execution/family-runtime.ts';
import {
  stageRunReplayBusinessIdentity,
  stageRunReplayRequestBusinessIdentity,
  workspaceLocatorStageAttemptExecutorPolicy,
} from '../../src/adapters/execution/family-runtime-command/attempt-shared.ts';

// The command path must never read implicit shared OPL state. Every fixture
// below lives under a temporary state/workspace root owned by this file.
const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-executor-policy-state-'));
const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-executor-policy-family-'));
process.env.OPL_STATE_DIR = stateRoot;
process.env.OPL_FAMILY_WORKSPACE_ROOT = familyRoot;

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-executor-policy-pack-'));
const domainPackRoot = path.join(fixtureRoot, 'domain-pack');
const workspaceRoot = path.join(fixtureRoot, 'workspace');
fs.mkdirSync(domainPackRoot, { recursive: true });
fs.mkdirSync(workspaceRoot, { recursive: true });

after(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.rmSync(stateRoot, { recursive: true, force: true });
  fs.rmSync(familyRoot, { recursive: true, force: true });
});

function sha256(bytes: string) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeFixture(ref: string, bytes: string) {
  const file = path.join(domainPackRoot, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { ref, sha256: sha256(bytes) };
}

const manifest = writeFixture('agent/stages/manifest.json', `${JSON.stringify({ stages: ['draft'] })}\n`);
writeFixture('contracts/stage_quality_cycle_policy.json', '{"stages":{}}\n');
writeFixture(
  'agent/prompts/draft.md',
  '# Draft\n\n## Producer\nDraft.\n\n## Reviewer\nReview.\n\n## Repairer\nRepair.\n\n## Re Reviewer\nRe-review.\n',
);
writeFixture('agent/quality_gates/quality.md', '# Quality\n');
writeFixture('agent/knowledge/domain.md', '# Domain knowledge\n');
writeFixture('contracts/durable_knowledge_catalog.json', `${JSON.stringify({
  surface_kind: 'opl_durable_knowledge_catalog',
  version: 'durable-knowledge-catalog.v2',
  owner: 'one-person-lab',
  items: [{
    surface_kind: 'opl_durable_knowledge_item',
    version: 'durable-knowledge-item.v2',
    knowledge_id: 'fixture.domain',
    title: 'Domain knowledge',
    scope: { kind: 'product', id: 'fixture' },
    content_kind: 'mechanism',
    owner: 'fixture',
    body_ref: { kind: 'repo_path', ref: 'agent/knowledge/domain.md' },
    applicability: { domains: ['medautoscience'], stages: ['draft'] },
    status: 'active',
    reviewed_at: '2020-01-01T00:00:00Z',
    next_review_at: '2099-01-01T00:00:00Z',
    authority_boundary: { semantic_body_owner: 'fixture', opl_role: 'catalog_recall_and_receipt_projection_only' },
  }],
})}\n`);

const binding = {
  surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
  version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
  stage_id: 'draft',
  declared_stage_ids: ['draft'],
  enabled: true,
  stage_role: null,
  policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/draft',
  stage_prompt_ref: 'agent/prompts/draft.md',
  quality_policy: normalizeStageQualityCyclePolicy({
    formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
  }),
  handoff_review_boundary: null,
  role_prompt_refs: {
    producer: 'agent/prompts/draft.md#producer',
    reviewer: 'agent/prompts/draft.md#reviewer',
    repairer: 'agent/prompts/draft.md#repairer',
    re_reviewer: 'agent/prompts/draft.md#re-reviewer',
  },
  quality_rubric_refs: ['agent/quality_gates/quality.md'],
  knowledge_refs: ['agent/knowledge/domain.md'],
  skill_refs: [],
  policy_refs: [],
  stage_goal_refs: [],
  source_refs: [],
  lineage_refs: [],
  manifest_ref: 'agent/stages/manifest.json',
  manifest_sha256: manifest.sha256.slice('sha256:'.length),
  allowed_review_lanes: ['medical'],
  executor_may_select_lane: false,
  lane_fallback: false,
  review_lane_binding: null,
} as unknown as StandardAgentStageQualityRuntimeBinding;

const packageUseBinding = {
  surface_kind: 'opl_agent_package_use_binding.v1',
  binding_origin: 'installed_native_carrier',
  scope: 'workspace',
  target_root: workspaceRoot,
  root_package: {
    package_id: 'fixture-agent',
    package_version: '0.0.1',
    package_lock_ref: 'opl://foundry/candidate/sha256:fixture',
    manifest_sha256: 'a'.repeat(64),
    content_digest: `sha256:${'b'.repeat(64)}`,
    source_artifact_ref: domainPackRoot,
    artifact_digest: `sha256:${'c'.repeat(64)}`,
  },
  provider_packages: [],
  dependency_closure_digest: 'd'.repeat(64),
  core_skill_tree_digest: null,
  skill_tree_digest: null,
  use_boundary_id: 'package-use:fixture',
};

const DECLARED_POLICY = {
  executor_kind: 'codex_cli',
  model: 'deepseek-flash',
  provider: 'deepseek',
  reasoning_effort: 'high',
};

function workspaceLocator(executorPolicy?: Record<string, unknown>) {
  return {
    workspace_root: workspaceRoot,
    domain_pack_root: domainPackRoot,
    package_use_binding: packageUseBinding,
    ...(executorPolicy ? { stage_attempt_executor_policy: executorPolicy } : {}),
  };
}

function buildStageRunInput(locator: Record<string, unknown>, executorKind = 'codex_cli') {
  const declared = workspaceLocatorStageAttemptExecutorPolicy(locator);
  return buildPackBoundTemporalStageRunInput({
    binding,
    domainPackRoot,
    domainId: 'medautoscience',
    stageId: 'draft',
    stageRunInvocationId: 'sri_executor_policy_fixture',
    workspaceLocator: locator,
    scopeKind: 'domain',
    executionScope: null,
    sourceFingerprint: `sha256:${'e'.repeat(64)}`,
    executorKind: executorKind ?? declared.executor_kind,
    stageAttemptExecutorPolicy: stageAttemptExecutorPolicyWithReviewLane({
      ...declared,
      invocation_mode: 'invocation',
    }, 'medical') ?? {},
    checkpointRefs: [`agent/stages/manifest.json@${manifest.sha256}#stage=draft`],
    artifactRefs: [],
    artifactHashes: [],
    actionId: 'draft-paper',
    taskId: 'task:policy',
  });
}

function replayRequestIdentity(locator: Record<string, unknown>, executorKind = 'codex_cli') {
  return stageRunReplayRequestBusinessIdentity({
    domainId: 'medautoscience',
    stageId: 'draft',
    actionId: 'draft-paper',
    taskId: 'task:policy',
    workspaceLocator: locator,
    sourceFingerprint: `sha256:${'e'.repeat(64)}`,
    executorKind,
    invocationMode: 'invocation',
    reviewLane: 'medical',
    checkpointRefs: [`agent/stages/manifest.json@${manifest.sha256}#stage=draft`],
    inputArtifactRefs: [],
    inputArtifactHashes: [],
    scopeKind: 'domain',
    executionScope: null,
  });
}

function failIfStarted() {
  throw new Error('the Stage executor must not start in this fixture');
}

function attemptCreateRuntime() {
  return {
    stageRunRuntime: {
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { checkout_path: null },
      }),
      stageBindingService: {
        resolve: () => ({ enabled: false, review_lane_binding: null }),
      },
      stageContextService: {
        observe: () => ({
          plane_id: 'plane:attempt-executor-policy',
          selected_action_id: null,
          selected_stage_route: null,
        }),
      },
      startWorkflow: async () => failIfStarted(),
    },
  } as any;
}

function packBoundRuntime() {
  return {
    stageRunRuntime: {
      ensurePackageLaunchReady: async (input: any) => ({
        effective_runtime_checkout_path: domainPackRoot,
        installed_carrier_readback: { lifecycle_authority: 'carrier_owned', source_ref: domainPackRoot },
        installed_readiness: { installed: true, physical_status: 'available', callability: 'callable' },
        native_package_closure: packageUseBinding,
        package_use_binding: { ...packageUseBinding, target_root: input.workspaceLocator.workspace_root },
      }),
      resolveStageBinding: () => binding,
      stageBindingService: { resolve: () => binding },
      stageContextService: {
        observe: () => ({
          plane_id: 'plane:attempt-executor-policy-pack-bound',
          selected_action_id: null,
          selected_stage_route: null,
        }),
      },
      startWorkflow: async () => failIfStarted(),
      describeWorkflow: async () => ({ status: 'scheduled', workflow_id: 'synthetic' }),
    },
  } as any;
}

function freshWorkspace(label: string) {
  const root = path.join(fixtureRoot, label);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function runAttemptCreate(locator: Record<string, unknown>, extraArgs: string[] = []) {
  return runFamilyRuntime([
    'attempt', 'create',
    '--domain', 'redcube',
    '--stage', 'artifact_creation',
    '--provider', 'temporal',
    '--workspace-locator', canonicalJsonText(locator),
    '--scope-kind', 'domain',
    ...extraArgs,
  ], attemptCreateRuntime());
}

function runPackBoundAttemptCreate(locator: Record<string, unknown>, extraArgs: string[] = []) {
  return runFamilyRuntime([
    'attempt', 'create',
    '--domain', 'medautoscience',
    '--stage', 'draft',
    '--provider', 'temporal',
    '--workspace-locator', canonicalJsonText(locator),
    '--scope-kind', 'domain',
    ...extraArgs,
  ], packBoundRuntime());
}

test('the locator executor policy merges nested and top-level declarations', () => {
  assert.deepEqual(
    workspaceLocatorStageAttemptExecutorPolicy({
      stage_attempt_executor_policy: {
        executor_kind: 'hermes-agent',
        model: '  hermes-model  ',
        provider: 'hermes',
        reasoning_effort: 'high',
      },
    }),
    {
      executor_kind: 'hermes_agent',
      model: 'hermes-model',
      provider: 'hermes',
      reasoning_effort: 'high',
    },
  );
  assert.deepEqual(
    workspaceLocatorStageAttemptExecutorPolicy({
      model: 'deepseek-flash',
      provider: 'deepseek',
      stage_attempt_executor_policy: { model: 'deepseek-flash' },
    }),
    { model: 'deepseek-flash', provider: 'deepseek' },
  );
  assert.deepEqual(workspaceLocatorStageAttemptExecutorPolicy(undefined), {});
  assert.deepEqual(workspaceLocatorStageAttemptExecutorPolicy({}), {});
});

test('equivalent nested and top-level executor aliases agree after normalization', () => {
  for (const [nestedKind, topLevelKind] of [
    ['hermes-agent', 'hermes_agent'],
    ['hermes_agent', 'hermes-agent'],
  ]) {
    assert.deepEqual(workspaceLocatorStageAttemptExecutorPolicy({
      executor_kind: topLevelKind,
      stage_attempt_executor_policy: { executor_kind: nestedKind },
    }), { executor_kind: 'hermes_agent' });
  }
});

test('conflicting or unknown locator executor policies fail closed', () => {
  assert.throws(
    () => workspaceLocatorStageAttemptExecutorPolicy({
      model: 'deepseek-flash',
      stage_attempt_executor_policy: { model: 'other-model' },
    }),
    (error: any) => error?.details?.failure_code === 'stage_attempt_executor_policy_conflict',
  );
  assert.throws(
    () => workspaceLocatorStageAttemptExecutorPolicy({
      provider: 'deepseek',
      stage_attempt_executor_policy: { provider: 'other' },
    }),
    (error: any) => error?.details?.failure_code === 'stage_attempt_executor_policy_conflict',
  );
  assert.throws(
    () => workspaceLocatorStageAttemptExecutorPolicy({
      stage_attempt_executor_policy: { executor_kind: 'not_an_executor' },
    }),
    (error: any) => error?.details?.failure_code === 'stage_attempt_executor_policy_invalid',
  );
  assert.throws(
    () => workspaceLocatorStageAttemptExecutorPolicy({ executor_kind: 'not_an_executor' }),
    (error: any) => error?.details?.failure_code === 'stage_attempt_executor_policy_invalid',
  );
});

test('the declared executor policy reaches the durable StageRun spec identity', () => {
  const stageRunInput = buildStageRunInput(workspaceLocator(DECLARED_POLICY));
  assert.deepEqual(stageRunInput.stage_run_spec.stage_attempt_executor_policy, {
    executor_kind: 'codex_cli',
    model: 'deepseek-flash',
    provider: 'deepseek',
    reasoning_effort: 'high',
    invocation_mode: 'invocation',
    review_lane_binding: 'medical',
  });
  assert.equal(stageRunInput.stage_run_spec.executor_kind, 'codex_cli');
  assert.deepEqual(
    stageRunInput.stage_attempt_executor_policy,
    stageRunInput.stage_run_spec.stage_attempt_executor_policy,
  );
});

test('a different declared model changes the StageRun spec identity', () => {
  const first = buildStageRunInput(workspaceLocator(DECLARED_POLICY));
  const second = buildStageRunInput(workspaceLocator({ ...DECLARED_POLICY, model: 'other-model' }));
  assert.notEqual(
    stageRunSpecSha256(first.stage_run_spec),
    stageRunSpecSha256(second.stage_run_spec),
  );
  assert.notEqual(first.stage_run_spec_sha256, second.stage_run_spec_sha256);
});

test('replay business identity matches the exact declared policy and rejects drift', () => {
  const stageRunInput = buildStageRunInput(workspaceLocator(DECLARED_POLICY));
  assert.equal(
    canonicalJsonText(stageRunReplayBusinessIdentity(stageRunInput)),
    canonicalJsonText(replayRequestIdentity(workspaceLocator(DECLARED_POLICY))),
  );
  assert.notEqual(
    canonicalJsonText(stageRunReplayBusinessIdentity(stageRunInput)),
    canonicalJsonText(replayRequestIdentity(workspaceLocator({ ...DECLARED_POLICY, model: 'other-model' }))),
  );
  assert.notEqual(
    canonicalJsonText(stageRunReplayBusinessIdentity(stageRunInput)),
    canonicalJsonText(replayRequestIdentity(workspaceLocator(DECLARED_POLICY), 'hermes_agent')),
  );
});

test('attempt-create persists the locator policy into the Attempt row and launch invocation', async () => {
  const root = freshWorkspace('locator-policy');
  const created: any = await runAttemptCreate({
    workspace_root: root,
    stage_attempt_executor_policy: {
      executor_kind: 'hermes_agent',
      model: 'hermes-model',
      provider: 'hermes',
      reasoning_effort: 'high',
    },
  });
  const attempt = created.family_runtime_stage_attempt.attempt;
  const launch = created.family_runtime_stage_attempt.launch_invocation;
  assert.equal(attempt.executor_kind, 'hermes_agent');
  assert.deepEqual(attempt.stage_attempt_executor_policy, {
    executor_kind: 'hermes_agent',
    model: 'hermes-model',
    provider: 'hermes',
    reasoning_effort: 'high',
  });
  assert.equal(launch.selected_executor_kind, attempt.executor_kind);
  assert.equal(launch.blocker_reason, 'non_default_executor_binding_ref_missing');
  assert.equal(attempt.status, 'blocked');
  assert.equal(attempt.blocked_reason, 'non_default_executor_binding_ref_missing');
});

test('an equal CLI and locator executor kind is accepted after normalization', async () => {
  const root = freshWorkspace('locator-equal');
  const created: any = await runAttemptCreate({
    workspace_root: root,
    stage_attempt_executor_policy: {
      executor_kind: 'hermes_agent',
      model: 'hermes-model',
      provider: 'hermes',
      reasoning_effort: 'high',
    },
  }, ['--executor-kind', 'hermes-agent']);
  const attempt = created.family_runtime_stage_attempt.attempt;
  assert.equal(attempt.executor_kind, 'hermes_agent');
  assert.equal(attempt.stage_attempt_executor_policy.executor_kind, 'hermes_agent');
  assert.equal(
    created.family_runtime_stage_attempt.launch_invocation.selected_executor_kind,
    attempt.executor_kind,
  );
});

test('attempt-create rejects a CLI and locator executor kind conflict', async () => {
  const root = freshWorkspace('locator-conflict');
  await assert.rejects(
    () => runAttemptCreate({
      workspace_root: root,
      stage_attempt_executor_policy: {
        executor_kind: 'hermes_agent',
        model: 'hermes-model',
        provider: 'hermes',
        reasoning_effort: 'high',
      },
    }, ['--executor-kind', 'codex_cli']),
    (error: any) => error?.details?.failure_code === 'stage_attempt_executor_kind_conflict',
  );
});

test('attempt-create rejects an unknown CLI executor kind before creating the Attempt', async () => {
  const root = freshWorkspace('cli-unknown-kind');
  await assert.rejects(
    () => runAttemptCreate({ workspace_root: root }, ['--executor-kind', 'not_an_executor']),
    (error: any) => error?.details?.failure_code === 'stage_attempt_executor_policy_invalid',
  );
});

test('a non-default executor without a binding hard-stops before any start call', async () => {
  const root = freshWorkspace('nondefault-start');
  const created: any = await runAttemptCreate({
    workspace_root: root,
    stage_attempt_executor_policy: {
      executor_kind: 'hermes_agent',
      model: 'hermes-model',
      provider: 'hermes',
      reasoning_effort: 'high',
    },
  }, ['--start']);
  const attempt = created.family_runtime_stage_attempt.attempt;
  assert.equal(attempt.status, 'blocked');
  assert.equal(attempt.blocked_reason, 'non_default_executor_binding_ref_missing');
  assert.equal(
    created.family_runtime_stage_attempt.launch_invocation.blocker_reason,
    attempt.blocked_reason,
  );
  assert.equal(created.family_runtime_stage_attempt.temporal_start, null);
});

test('the pack-bound launch invocation matches the durable StageRun spec executor identity', async () => {
  const root = freshWorkspace('pack-bound-launch');
  const created: any = await runPackBoundAttemptCreate({
    workspace_root: root,
    domain_pack_root: domainPackRoot,
    package_use_binding: { ...packageUseBinding, target_root: root },
    stage_attempt_executor_policy: {
      executor_kind: 'hermes_agent',
      model: 'hermes-model',
      provider: 'hermes',
      reasoning_effort: 'high',
    },
  }, ['--start']);
  const stageRun = created.family_runtime_stage_run;
  assert.ok(stageRun, 'expected a pack-bound StageRun result');
  const spec = stageRun.stage_run_input.stage_run_spec;
  assert.equal(spec.executor_kind, 'hermes_agent');
  assert.deepEqual(spec.stage_attempt_executor_policy, {
    executor_kind: 'hermes_agent',
    model: 'hermes-model',
    provider: 'hermes',
    reasoning_effort: 'high',
  });
  assert.deepEqual(stageRun.stage_run_input.stage_attempt_executor_policy, spec.stage_attempt_executor_policy);
  assert.equal(stageRun.launch_invocation.selected_executor_kind, spec.executor_kind);
  assert.equal(stageRun.launch_invocation.blocker_reason, 'non_default_executor_binding_ref_missing');
  assert.equal(stageRun.blocked_reason, stageRun.launch_invocation.blocker_reason);
  assert.equal(stageRun.temporal_start, null);
});

test('replaying the same locator policy is an idempotent StageRun replay', async () => {
  const root = freshWorkspace('pack-bound-replay');
  const locator = {
    workspace_root: root,
    domain_pack_root: domainPackRoot,
    package_use_binding: { ...packageUseBinding, target_root: root },
    stage_attempt_executor_policy: {
      executor_kind: 'hermes_agent',
      model: 'hermes-model',
      provider: 'hermes',
      reasoning_effort: 'high',
    },
  };
  const args = ['--stage-run-invocation-id', 'sri_executor_policy_replay'];
  const first: any = await runPackBoundAttemptCreate(locator, args);
  const second: any = await runPackBoundAttemptCreate(locator, args);
  assert.equal(first.family_runtime_stage_run.durable_launch.registered, true);
  assert.equal(second.family_runtime_stage_run.durable_launch.idempotent_replay, true);
  assert.equal(
    second.family_runtime_stage_run.stage_run_input.stage_run_spec_sha256,
    first.family_runtime_stage_run.stage_run_input.stage_run_spec_sha256,
  );
  assert.equal(
    second.family_runtime_stage_run.stage_run_input.stage_run_spec.executor_kind,
    'hermes_agent',
  );
});
