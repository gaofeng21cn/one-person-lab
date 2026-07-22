import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { StandardAgentStageQualityRuntimeBinding } from '../../src/modules/pack/index.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/modules/workspace/index.ts';
import { parseFamilyRuntimeCommand } from '../../src/modules/runway/family-runtime-command.ts';
import { runFamilyRuntime } from '../../src/modules/runway/family-runtime.ts';
import { buildPackBoundTemporalStageRunInput } from '../../src/modules/runway/family-runtime-pack-bound-stage-run.ts';
import { resolveStageRunAttemptExecutorContent } from '../../src/modules/runway/family-runtime-stage-run-attempt-content.ts';
import {
  buildCliStageRunInvocationId,
  buildHostedActionStageRunInvocationId,
  buildRouteStageRunInvocation,
  deriveStageRunId,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  revalidateStageRunImmutableSpecContent,
} from '../../src/modules/runway/family-runtime-stage-run-identity.ts';
import { launchRegisteredStageRun } from '../../src/modules/runway/family-runtime-stage-run-launch.ts';
import { materializeStageRunRoute } from '../../src/modules/runway/family-runtime-stage-run-route-launch.ts';
import {
  claimStageRunStart,
  findStageRunLaunch,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
} from '../../src/modules/runway/family-runtime-stage-run-launch-registry.ts';
import { requireTemporalStageRunWorkflowInputLaunchable } from '../../src/modules/runway/family-runtime-temporal.ts';
import { stageQualityAttemptMaterializeActivity } from '../../src/modules/runway/family-runtime-temporal-activities.ts';
import { createStageAttempt } from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { createFamilyRuntimeQueueTables, openQueueDb } from '../../src/modules/runway/family-runtime-store.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/modules/stagecraft/stage-quality-cycle.ts';
import { runWithWorkItemFileBoundaryInterlock } from './work-item-file-boundary-test-support.ts';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-launch-fixture-'));
const domainPackRoot = path.join(fixtureRoot, 'domain-pack');
const workspaceRoot = path.join(fixtureRoot, 'workspace');

function sha256(bytes: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeFixture(root: string, ref: string, bytes: string) {
  const filePath = path.join(root, ref);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return { ref, sha256: sha256(bytes), filePath };
}

function safeIdentityDirectory(value: string) {
  const readable = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    || 'domain';
  const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

const manifestFixture = writeFixture(
  domainPackRoot,
  'agent/stages/manifest.json',
  `${JSON.stringify({ stages: ['intake', 'draft', 'review'] })}\n`,
);
writeFixture(domainPackRoot, 'contracts/stage_quality_cycle_policy.json', '{"stages":{}}\n');
writeFixture(
  domainPackRoot,
  'agent/prompts/stage-quality.md',
  '# Stage quality roles\n\n## Producer\nProduce the artifact.\n\n## Reviewer\nReview the artifact.\n\n## Repairer\nRepair required findings.\n\n## Re-reviewer\nClose prior findings.\n',
);
writeFixture(domainPackRoot, 'agent/quality_gates/stage.md', '# Stage rubric\n');
writeFixture(domainPackRoot, 'agent/sources/request.md', '# Request source\n');
for (const stageId of ['intake', 'draft', 'review']) {
  writeFixture(domainPackRoot, `agent/prompts/${stageId}.md`, `# ${stageId} prompt\n`);
  writeFixture(domainPackRoot, `agent/goals/${stageId}.md`, `# ${stageId} goal\n`);
  writeFixture(domainPackRoot, `agent/lineage/${stageId}.json`, `${JSON.stringify({ stage_id: stageId })}\n`);
}
const artifactFixtures = Object.fromEntries(['request', 'a', 'b'].map((artifactId) => {
  const fixture = writeFixture(
    workspaceRoot,
    `artifacts/${artifactId}.json`,
    `${JSON.stringify({ artifact_id: artifactId })}\n`,
  );
  return [artifactId, fixture];
})) as Record<string, ReturnType<typeof writeFixture>>;

test.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

function binding(
  stageId = 'intake',
  sourceRefs: string[] = ['agent/sources/request.md'],
  declaredStageIds: string[] = ['intake', 'draft', 'review'],
): StandardAgentStageQualityRuntimeBinding {
  return {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: stageId,
    declared_stage_ids: declaredStageIds,
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
    stage_goal_refs: [`agent/goals/${stageId}.md`],
    source_refs: sourceRefs,
    lineage_refs: [`agent/lineage/${stageId}.json`],
    manifest_ref: 'agent/stages/manifest.json',
    manifest_sha256: manifestFixture.sha256.slice('sha256:'.length),
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
    target_root: input.targetRoot ?? workspaceRoot,
    core_skill_tree_digest: '1'.repeat(64),
    skill_tree_digest: '2'.repeat(64),
    core_readiness: { status: 'current' },
    specialty_exposure: { status: 'current' },
  };
}

function workspaceLocator(useBinding = packageUseBinding()) {
  return {
    workspace_root: workspaceRoot,
    domain_pack_root: domainPackRoot,
    package_use_binding: useBinding,
    checkout_currentness: { status: 'current', checked_at: '2026-07-14T00:00:00.000Z' },
    runtime_source_readiness: {
      checkout_path: domainPackRoot,
      checked_at: '2026-07-14T00:00:00.000Z',
    },
  };
}

function stageRunInput(input: {
  invocationId?: string;
  stageId?: string;
  sourceFingerprint?: string;
  locator?: Record<string, unknown>;
  artifactId?: 'request' | 'a' | 'b';
  sourceRefs?: string[];
  artifact?: {
    ref: string;
    sha256: string;
    identityReceiptRef?: string;
  };
  executionScope?: ReturnType<typeof createWorkItemExecutionScopeSnapshot>;
} = {}) {
  const stageId = input.stageId ?? 'intake';
  const fixtureArtifact = artifactFixtures[input.artifactId ?? 'request']!;
  const artifact = input.artifact ?? fixtureArtifact;
  const locator = input.locator ?? workspaceLocator();
  return buildPackBoundTemporalStageRunInput({
    binding: binding(stageId, input.sourceRefs),
    domainPackRoot,
    domainId: 'medautoscience',
    stageId,
    stageRunInvocationId: input.invocationId ?? 'sri_fixture',
    workspaceLocator: input.executionScope
      ? { ...locator, execution_scope: input.executionScope }
      : locator,
    scopeKind: input.executionScope ? 'work_item' : 'domain',
    executionScope: input.executionScope ?? null,
    sourceFingerprint: input.sourceFingerprint ?? artifact.sha256,
    actionId: 'draft-paper',
    taskId: 'task:one',
    artifactRefs: [artifact.ref],
    artifactHashes: [artifact.sha256],
    artifactIdentityReceiptRefs: input.artifact?.identityReceiptRef
      ? [input.artifact.identityReceiptRef]
      : undefined,
  });
}

function workItemExecutionScope(studyId = 'study-001') {
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'studies', studyId);
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  return createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:fixture',
    workspaceBindingId: 'binding:fixture',
    bindingVersionId: 'binding-version:fixture',
    domainId: 'medautoscience',
    workspaceRoot,
    payload: { study_id: studyId },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    canonicalWorkItemRoot,
    inventoryDigest: `sha256:${'9'.repeat(64)}`,
  });
}

function scopedStageRunInput(invocationId: string, studyId = 'study-001') {
  const scope = workItemExecutionScope(studyId);
  fs.mkdirSync(scope.canonical_work_item_root!, { recursive: true });
  const artifact = writeFixture(
    scope.canonical_work_item_root!,
    `artifacts/${invocationId}.json`,
    `${JSON.stringify({ artifact_id: invocationId, study_id: studyId })}\n`,
  );
  return {
    scope,
    input: stageRunInput({
      invocationId,
      executionScope: scope,
      artifact: {
        ref: pathToFileURL(artifact.filePath).href,
        sha256: artifact.sha256,
      },
    }),
  };
}

function registerStageRunInConfiguredState(stageRun: ReturnType<typeof stageRunInput>) {
  const { db } = openQueueDb();
  try {
    registerStageRunLaunch(db, stageRun, {
      scopeKind: stageRun.scope_kind,
      executionScope: stageRun.execution_scope,
    });
  } finally {
    db.close();
  }
}

function decisiveExecutionBinding(
  stageRun: ReturnType<typeof stageRunInput>,
  declaredStageIds = stageRun.declared_stage_ids,
) {
  const payload = {
    surface_kind: 'opl_stage_attempt_execution_content_binding' as const,
    version: 'opl-stage-attempt-execution-content-binding.v1' as const,
    parent_stage_run_spec_sha256: stageRun.stage_run_spec_sha256,
    use_boundary_id: `package-use:decisive:${stageRun.stage_run_id}`,
    spec_sha256: stageRunSpecSha256(stageRun.stage_run_spec),
    spec: stageRun.stage_run_spec,
    declared_stage_ids: [...new Set(declaredStageIds)].sort(),
  };
  return {
    ...payload,
    binding_sha256: stageAttemptExecutionContentBindingSha256(payload),
  };
}

function writeTrustedIdentityReceipt(input: {
  stateRoot: string;
  domainId: string;
  stageAttemptId: string;
  artifactRef: string;
  artifactSha256: string;
  sizeBytes: number;
  stageRunId: string | null;
  executionScope?: ReturnType<typeof createWorkItemExecutionScopeSnapshot> | null;
}) {
  const receipt = {
    surface_kind: 'domain_artifact_identity_receipt',
    version: 'domain-artifact-identity-receipt.v1',
    domain_id: input.domainId,
    stage_attempt_id: input.stageAttemptId,
    stage_run_id: input.stageRunId,
    scope_kind: input.executionScope ? 'work_item' : 'domain',
    work_item_scope_id: input.executionScope?.work_item_scope_id ?? null,
    scope_digest: input.executionScope?.scope_digest ?? null,
    artifact_ref: input.artifactRef,
    sha256: input.artifactSha256,
    size_bytes: input.sizeBytes,
  };
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  const receiptRoot = path.join(
    input.stateRoot,
    'runtime-state',
    'domain-artifact-identity-receipts',
    safeIdentityDirectory(input.domainId),
  );
  fs.mkdirSync(receiptRoot, { recursive: true });
  const receiptPath = path.join(receiptRoot, `${sha256(bytes).slice('sha256:'.length)}.json`);
  fs.writeFileSync(receiptPath, bytes);
  return { ref: pathToFileURL(receiptPath).href, filePath: receiptPath, bytes };
}

function temporalStartReceipt(
  input: ReturnType<typeof stageRunInput>,
  workflowStatus = 'RUNNING',
  extra: Record<string, unknown> = {},
) {
  return {
    workflow_id: input.workflow_id,
    first_execution_run_id: `run-${input.stage_run_id}`,
    workflow_status: workflowStatus,
    ...extra,
  };
}

function workerClaim(input: {
  dbPath: string;
  stageRunId: string;
  barrier: SharedArrayBuffer;
  claimToken: string;
}) {
  const registryModuleUrl = pathToFileURL(path.resolve(
    'src/modules/runway/family-runtime-stage-run-launch-registry.ts',
  )).href;
  const source = [
    "import { parentPort, workerData } from 'node:worker_threads';",
    "import { DatabaseSync } from 'node:sqlite';",
    `import { claimStageRunStart } from ${JSON.stringify(registryModuleUrl)};`,
    'const barrier = new Int32Array(workerData.barrier);',
    'Atomics.add(barrier, 0, 1);',
    'Atomics.notify(barrier, 0);',
    'Atomics.wait(barrier, 1, 0);',
    'const db = new DatabaseSync(workerData.dbPath);',
    'try {',
    '  const result = claimStageRunStart(db, {',
    '    stageRunId: workerData.stageRunId,',
    '    claimToken: workerData.claimToken,',
    '    now: new Date("2026-07-14T00:00:00.000Z"),',
    '    leaseMs: 30000,',
    '  });',
    '  parentPort.postMessage({ ok: true, result });',
    '} catch (error) {',
    '  parentPort.postMessage({',
    '    ok: false,',
    '    error: error instanceof Error ? error.message : String(error),',
    '    details: error && typeof error === "object" ? error.details : null,',
    '  });',
    '} finally {',
    '  db.close();',
    '}',
  ].join('\n');
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
    workerData: input,
  });
  const exited = new Promise<void>((resolve, reject) => {
    worker.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`StageRun claim worker exited with ${code}.`));
    });
  });
  return {
    worker,
    result: new Promise<Record<string, any>>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    }),
    exited,
  };
}

function workerClose(input: {
  dbPath: string;
  stageRunId: string;
  barrier: SharedArrayBuffer;
  terminalStatus: string;
}) {
  const registryModuleUrl = pathToFileURL(path.resolve(
    'src/modules/runway/family-runtime-stage-run-launch-registry.ts',
  )).href;
  const source = [
    "import { parentPort, workerData } from 'node:worker_threads';",
    "import { DatabaseSync } from 'node:sqlite';",
    `import { recordStageRunClosed } from ${JSON.stringify(registryModuleUrl)};`,
    'const barrier = new Int32Array(workerData.barrier);',
    'Atomics.add(barrier, 0, 1);',
    'Atomics.notify(barrier, 0);',
    'Atomics.wait(barrier, 1, 0);',
    'const db = new DatabaseSync(workerData.dbPath);',
    'try {',
    '  const result = recordStageRunClosed(db, {',
    '    stageRunId: workerData.stageRunId,',
    '    terminalStatus: workerData.terminalStatus,',
    '    now: new Date("2026-07-14T00:00:00.000Z"),',
    '  });',
    '  parentPort.postMessage({ ok: true, result });',
    '} catch (error) {',
    '  parentPort.postMessage({',
    '    ok: false,',
    '    error: error instanceof Error ? error.message : String(error),',
    '    details: error && typeof error === "object" ? error.details : null,',
    '  });',
    '} finally {',
    '  db.close();',
    '}',
  ].join('\n');
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
    workerData: input,
  });
  const exited = new Promise<void>((resolve, reject) => {
    worker.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`StageRun close worker exited with ${code}.`));
    });
  });
  return {
    worker,
    result: new Promise<Record<string, any>>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    }),
    exited,
  };
}

async function waitForBarrierCount(barrier: Int32Array, count: number) {
  const deadline = Date.now() + 5_000;
  while (Atomics.load(barrier, 0) < count) {
    if (Date.now() >= deadline) throw new Error('StageRun claim workers did not reach the barrier.');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
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
    stage_run_currentness_admission: {
      status: 'admitted',
      checked_at: '2026-07-14T01:00:00.000Z',
      stage_run_id: 'sr:observation-only',
      checkout_currentness_is_provenance_only: true,
      child_attempts_refresh_package_use: true,
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
  const routeCurrentPackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-route-current-pack-'));
  fs.cpSync(domainPackRoot, routeCurrentPackRoot, { recursive: true });
  writeFixture(routeCurrentPackRoot, 'agent/prompts/publication_followup.md', '# publication followup prompt\n');
  writeFixture(routeCurrentPackRoot, 'agent/goals/publication_followup.md', '# publication followup goal\n');
  writeFixture(
    routeCurrentPackRoot,
    'agent/lineage/publication_followup.json',
    `${JSON.stringify({ stage_id: 'publication_followup' })}\n`,
  );
  const currentDeclaredStageIds = ['intake', 'draft', 'review', 'publication_followup'];
  const launchedInputs: ReturnType<typeof stageRunInput>[] = [];
  let temporalStarts = 0;
  let packageReadinessCalls = 0;
  let hideNextPersistedLookup = false;
  const dependencies = {
    findTargetStageRun: (stageRunId: string) => {
      if (hideNextPersistedLookup) {
        hideNextPersistedLookup = false;
        return null;
      }
      return findStageRunLaunch(db, stageRunId)?.stage_run_input ?? null;
    },
    ensurePackageLaunchReady: async () => {
      packageReadinessCalls += 1;
      return {
        launch_allowed: true,
        runtime_source_readiness: { checkout_path: routeCurrentPackRoot },
        package_use_binding: packageUseBinding({
          packageVersion: packageReadinessCalls === 1 ? '0.2.1' : '0.2.2',
        }),
      } as any;
    },
    resolveStageBinding: (_root: string, stageId: string) => currentDeclaredStageIds.includes(stageId)
      ? binding(stageId, ['agent/sources/request.md'], currentDeclaredStageIds)
      : null,
    launchTargetStageRun: async (target: ReturnType<typeof stageRunInput>) => {
      launchedInputs.push(target);
      return await launchRegisteredStageRun({
        db,
        stageRunInput: target,
        start: true,
        startWorkflow: async () => {
          temporalStarts += 1;
          return temporalStartReceipt(target);
        },
      });
    },
  };
  try {
    const aToB = {
      parent_stage_run: parent,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-a',
      decisive_execution_content_binding: decisiveExecutionBinding(parent, currentDeclaredStageIds),
      decision: {
        decision_kind: 'advance' as const,
        target_stage_id: 'draft',
        evidence_refs: ['artifact:a'],
      },
      artifact_refs: [artifactFixtures.a!.ref],
      artifact_hashes: [artifactFixtures.a!.sha256],
      artifact_identity_receipt_refs: [],
    };
    const first = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(first.materialization_status, 'launched');
    assert.equal(first.decision.target_stage_id, 'draft');
    assert.equal(first.durable_launch?.start_status, 'started');
    assert.equal(temporalStarts, 1);
    assert.equal(packageReadinessCalls, 1);
    const stageRunB = launchedInputs.at(-1)!;
    assert.deepEqual(stageRunB.stage_run_spec.input_artifacts, [{
      ref: artifactFixtures.a!.ref,
      sha256: artifactFixtures.a!.sha256,
      identity_receipt_ref: null,
    }]);
    assert.equal(stageRunB.parent_route_decision_ref, first.parent_route_decision_ref);

    const replay = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(replay.materialization_status, 'existing');
    assert.equal(replay.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 1);
    assert.equal(packageReadinessCalls, 1);

    hideNextPersistedLookup = true;
    const concurrentReplay = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(concurrentReplay.materialization_status, 'existing');
    assert.equal(concurrentReplay.target_stage_run_spec_sha256, first.target_stage_run_spec_sha256);
    assert.equal(temporalStarts, 1);
    assert.equal(packageReadinessCalls, 2);
    assert.equal(
      launchedInputs.at(-1)?.stage_run_spec_sha256,
      first.target_stage_run_spec_sha256,
    );

    const bToA = await materializeStageRunRoute({
      parent_stage_run: stageRunB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-b',
      decisive_execution_content_binding: decisiveExecutionBinding(stageRunB, currentDeclaredStageIds),
      decision: {
        decision_kind: 'route_back',
        target_stage_id: 'intake',
        evidence_refs: ['artifact:b', 'finding:route-back'],
      },
      artifact_refs: [artifactFixtures.b!.ref],
      artifact_hashes: [artifactFixtures.b!.sha256],
      artifact_identity_receipt_refs: [],
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
      assert.equal(error.details?.failure_code, 'route_target_stage_not_declared_by_decisive_attempt');
      return true;
    });
    assert.equal(temporalStarts, 3);

    const newlyDeclared = await materializeStageRunRoute({
      ...aToB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-current-package',
      decision: {
        decision_kind: 'advance',
        target_stage_id: 'publication_followup',
        evidence_refs: ['artifact:a'],
      },
    }, dependencies);
    assert.equal(newlyDeclared.materialization_status, 'launched');
    assert.equal(newlyDeclared.target_stage_run_id, launchedInputs.at(-1)?.stage_run_id);
    assert.deepEqual(launchedInputs.at(-1)?.declared_stage_ids, currentDeclaredStageIds);
    assert.equal(temporalStarts, 4);
  } finally {
    db.close();
    fs.rmSync(routeCurrentPackRoot, { recursive: true, force: true });
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

test('registered StageRun replay does not refresh package readiness or resolve a new binding', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-readiness-replay-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let readinessCalls = 0;
  let bindingCalls = 0;
  const args = [
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'intake',
    '--provider',
    'temporal',
    '--workspace-locator',
    JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: domainPackRoot }),
    '--source-fingerprint',
    manifestFixture.sha256,
    '--stage-run-invocation-id',
    'sri_registered_readiness_replay',
    '--start',
  ];
  const runtime = {
    stageRunRuntime: {
      ensurePackageLaunchReady: (async () => {
        readinessCalls += 1;
        return {
          runtime_source_readiness: {
            checkout_path: domainPackRoot,
            operational_ready: true,
          },
          package_use_binding: packageUseBinding(),
        };
      }) as any,
      resolveStageBinding: () => {
        bindingCalls += 1;
        return binding();
      },
      startWorkflow: async (input: ReturnType<typeof stageRunInput>) => temporalStartReceipt(input),
      describeWorkflow: async (input: ReturnType<typeof stageRunInput>) => temporalStartReceipt(input),
    },
  };
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const first = await runFamilyRuntime(args, runtime) as any;
    assert.equal(first.family_runtime_stage_run.durable_launch.start_status, 'started');
    assert.equal(readinessCalls, 1);
    assert.equal(bindingCalls, 1);

    readinessCalls = 0;
    bindingCalls = 0;
    const replay = await runFamilyRuntime(args, runtime) as any;
    assert.equal(replay.family_runtime_stage_run.durable_launch.start_status, 'existing');
    assert.equal(readinessCalls, 0);
    assert.equal(bindingCalls, 0);
    assert.deepEqual(
      replay.family_runtime_stage_run.stage_run_input,
      first.family_runtime_stage_run.stage_run_input,
    );
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
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
        return temporalStartReceipt(workflowInput);
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
      startWorkflow: async () => temporalStartReceipt(postStartCompletedInput, 'COMPLETED', {
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
      startWorkflow: async () => temporalStartReceipt(postStartFailedInput, 'FAILED', {
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

test('two SQLite connections atomically claim one StageRun start without a lock error', async () => {
  const dbPath = path.join(fixtureRoot, `claim-race-${crypto.randomUUID()}.sqlite`);
  const input = stageRunInput({ invocationId: 'sri_real_sqlite_claim_race' });
  const setupDb = new DatabaseSync(dbPath);
  registerStageRunLaunch(setupDb, input);
  setupDb.close();

  const barrierBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const barrier = new Int32Array(barrierBuffer);
  const workers = ['claim-a', 'claim-b'].map((claimToken) => workerClaim({
    dbPath,
    stageRunId: input.stage_run_id,
    barrier: barrierBuffer,
    claimToken,
  }));
  await waitForBarrierCount(barrier, workers.length);
  Atomics.store(barrier, 1, 1);
  Atomics.notify(barrier, 1, workers.length);
  const results = await Promise.all(workers.map((entry) => entry.result));
  await Promise.all(workers.map((entry) => entry.exited));

  assert.equal(results.every((entry) => entry.ok), true, JSON.stringify(results));
  assert.deepEqual(
    results.map((entry) => entry.result.claimed).sort(),
    [false, true],
  );
  assert.deepEqual(
    results.map((entry) => entry.result.claim_status).sort(),
    ['active_starting', 'claimed'],
  );
  const readDb = new DatabaseSync(dbPath);
  try {
    const launch = inspectStageRunLaunch(readDb, input.stage_run_id);
    assert.equal(launch.launch_status, 'starting');
    assert.equal(launch.start_attempt_count, 1);
  } finally {
    readDb.close();
  }
});

test('two SQLite connections close one started StageRun atomically and idempotently', async () => {
  const dbPath = path.join(fixtureRoot, `close-race-${crypto.randomUUID()}.sqlite`);
  const input = stageRunInput({ invocationId: 'sri_real_sqlite_close_race' });
  const setupDb = new DatabaseSync(dbPath);
  registerStageRunLaunch(setupDb, input);
  recordStageRunTemporalStart(setupDb, {
    stageRunId: input.stage_run_id,
    temporalStartReceipt: temporalStartReceipt(input),
  });
  setupDb.close();

  const barrierBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const barrier = new Int32Array(barrierBuffer);
  const workers = Array.from({ length: 2 }, () => workerClose({
    dbPath,
    stageRunId: input.stage_run_id,
    barrier: barrierBuffer,
    terminalStatus: 'completed',
  }));
  await waitForBarrierCount(barrier, workers.length);
  Atomics.store(barrier, 1, 1);
  Atomics.notify(barrier, 1, workers.length);
  const results = await Promise.all(workers.map((entry) => entry.result));
  await Promise.all(workers.map((entry) => entry.exited));

  assert.equal(results.every((entry) => entry.ok), true, JSON.stringify(results));
  assert.equal(results.every((entry) => entry.result.launch_status === 'closed'), true);
  assert.equal(results.every((entry) => entry.result.terminal_status === 'completed'), true);
  const readDb = new DatabaseSync(dbPath);
  try {
    assert.throws(() => recordStageRunClosed(readDb, {
      stageRunId: input.stage_run_id,
      terminalStatus: 'failed',
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_terminal_status_conflict');
      return true;
    });
  } finally {
    readDb.close();
  }
});

test('concurrent launch callers expose one active starter and one idempotent existing result', async () => {
  const dbPath = path.join(fixtureRoot, `launch-race-${crypto.randomUUID()}.sqlite`);
  const firstDb = new DatabaseSync(dbPath);
  const secondDb = new DatabaseSync(dbPath);
  const input = stageRunInput({ invocationId: 'sri_launch_race' });
  let starts = 0;
  let releaseStart!: () => void;
  let markStarted!: () => void;
  const startReleased = new Promise<void>((resolve) => { releaseStart = resolve; });
  const startEntered = new Promise<void>((resolve) => { markStarted = resolve; });
  try {
    const first = launchRegisteredStageRun({
      db: firstDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        starts += 1;
        markStarted();
        await startReleased;
        return temporalStartReceipt(input);
      },
    });
    await startEntered;
    const second = await launchRegisteredStageRun({
      db: secondDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => assert.fail('active starting lease must suppress a duplicate start'),
    });
    assert.equal(second.start_status, 'starting');
    assert.equal(second.idempotent_replay, true);
    assert.equal(starts, 1);
    releaseStart();
    const started = await first;
    assert.equal(started.start_status, 'started');
    assert.equal(started.launch.launch_status, 'started');
    assert.equal(starts, 1);
  } finally {
    releaseStart?.();
    firstDb.close();
    secondDb.close();
  }
});

test('stale starting lease is recovered with the same deterministic workflow id', async () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_stale_starting_takeover' });
  try {
    registerStageRunLaunch(db, input);
    const firstClaim = claimStageRunStart(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'abandoned-claim',
      now: new Date('2026-07-14T00:00:00.000Z'),
      leaseMs: 10,
    });
    assert.equal(firstClaim.claimed, true);
    let starts = 0;
    const recovered = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      now: () => new Date('2026-07-14T00:00:00.020Z'),
      startLeaseMs: 10,
      describeWorkflow: async () => ({
        ...temporalStartReceipt(input, 'NOT_FOUND'),
        workflow_found: false,
        first_execution_run_id: null,
      }),
      startWorkflow: async () => {
        starts += 1;
        return temporalStartReceipt(input);
      },
    });
    assert.equal(recovered.start_status, 'recovered');
    assert.equal(recovered.launch.workflow_id, input.workflow_id);
    assert.equal(recovered.launch.start_attempt_count, 2);
    assert.equal(starts, 1);
  } finally {
    db.close();
  }
});

test('unknown-success start is retried idempotently without materializing a second workflow', async () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_unknown_start_success' });
  let materializedWorkflows = 0;
  try {
    await assert.rejects(launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        materializedWorkflows += 1;
        throw new Error('transport lost after Temporal accepted the deterministic workflow id');
      },
    }), /transport lost/);
    assert.equal(inspectStageRunLaunch(db, input.stage_run_id).launch_status, 'start_failed');

    const recovered = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => temporalStartReceipt(input, 'RUNNING', {
        recovered_existing_execution: true,
      }),
    });
    assert.equal(recovered.start_status, 'recovered');
    assert.equal(recovered.launch.launch_status, 'started');
    assert.equal(materializedWorkflows, 1);
    assert.equal(recovered.temporal_start?.first_execution_run_id, `run-${input.stage_run_id}`);
  } finally {
    db.close();
  }
});

test('provider observation closes post-start crash and late failures cannot downgrade started or closed', async () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_post_start_observation' });
  try {
    registerStageRunLaunch(db, input);
    const claim = claimStageRunStart(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'crashed-after-provider-start',
    });
    assert.equal(claim.claimed, true);
    const reconciled = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      describeWorkflow: async () => ({
        ...temporalStartReceipt(input),
        workflow_found: true,
      }),
      startWorkflow: async () => assert.fail('provider observation must prevent a duplicate start'),
    });
    assert.equal(reconciled.start_status, 'existing');
    assert.equal(reconciled.launch.launch_status, 'started');

    await assert.rejects(launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      describeWorkflow: async () => ({
        ...temporalStartReceipt(input),
        first_execution_run_id: 'conflicting-first-execution',
        workflow_found: true,
      }),
      startWorkflow: async () => assert.fail('identity conflict must fail before another start'),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_temporal_execution_identity_conflict');
      return true;
    });

    const afterLateFailure = recordStageRunStartFailure(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'crashed-after-provider-start',
      error: new Error('late callback failure'),
    });
    assert.equal(afterLateFailure.launch_status, 'started');
    recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'completed' });
    const afterClosedLateFailure = recordStageRunStartFailure(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'crashed-after-provider-start',
      error: new Error('even later callback failure'),
    });
    assert.equal(afterClosedLateFailure.launch_status, 'closed');
    assert.equal(afterClosedLateFailure.terminal_status, 'completed');
    assert.throws(() => recordStageRunTemporalStart(db, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: {
        ...temporalStartReceipt(input),
        first_execution_run_id: 'conflicting-closed-first-execution',
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_temporal_execution_identity_conflict');
      return true;
    });
  } finally {
    db.close();
  }
});

test('registry revalidates prompt, rubric, source, checkpoint, and artifact bytes before write', () => {
  const input = stageRunInput({ invocationId: 'sri_content_revalidation' });
  const cases = [
    path.join(domainPackRoot, 'agent/prompts/intake.md'),
    path.join(domainPackRoot, 'agent/quality_gates/stage.md'),
    path.join(domainPackRoot, 'agent/sources/request.md'),
    manifestFixture.filePath,
    artifactFixtures.request!.filePath,
  ];
  for (const filePath of cases) {
    const original = fs.readFileSync(filePath);
    const db = new DatabaseSync(':memory:');
    try {
      fs.appendFileSync(filePath, 'tampered-after-spec\n');
      assert.throws(() => registerStageRunLaunch(db, input), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_binding_stale');
        return true;
      });
    } finally {
      fs.writeFileSync(filePath, original);
      db.close();
    }
  }
});

test('immutable spec binds both role prompt backing file and effective Markdown section bytes', () => {
  const input = stageRunInput({ invocationId: 'sri_role_prompt_effective_section' });
  const producer = input.stage_run_spec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref.endsWith('#producer')
  ));
  const reviewer = input.stage_run_spec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref.endsWith('#reviewer')
  ));
  const rolePromptBytes = fs.readFileSync(path.join(domainPackRoot, 'agent/prompts/stage-quality.md'));
  assert.equal(producer?.sha256, sha256(rolePromptBytes));
  assert.equal(reviewer?.sha256, producer?.sha256);
  assert.equal(producer?.effective_content_sha256, sha256('## Producer\nProduce the artifact.'));
  assert.equal(reviewer?.effective_content_sha256, sha256('## Reviewer\nReview the artifact.'));
  assert.notEqual(producer?.effective_content_sha256, reviewer?.effective_content_sha256);
  assert.equal(producer?.effective_content_byte_size, Buffer.byteLength('## Producer\nProduce the artifact.'));

  const tamperedSpec = structuredClone(input.stage_run_spec);
  const tamperedProducer = tamperedSpec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref.endsWith('#producer')
  ))!;
  tamperedProducer.effective_content_sha256 = sha256('different extracted section');
  const tamperedInput = {
    ...input,
    stage_run_spec: tamperedSpec,
    stage_run_spec_sha256: stageRunSpecSha256(tamperedSpec),
  };
  const db = new DatabaseSync(':memory:');
  try {
    assert.throws(() => registerStageRunLaunch(db, tamperedInput), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_role_prompt_content_binding_stale');
      return true;
    });
  } finally {
    db.close();
  }
});

test('trusted content-addressed receipt binds an external source through the immutable spec', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-external-source-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const sourceRef = 'https://evidence.example.invalid/source/request.json';
    const sourceBytes = Buffer.from('{"question":"external evidence"}\n', 'utf8');
    const sourceSha256 = sha256(sourceBytes);
    const receipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-external-source-owner',
      stageRunId: 'sr-external-source-owner',
      artifactRef: sourceRef,
      artifactSha256: sourceSha256,
      sizeBytes: sourceBytes.length,
    });
    const input = stageRunInput({
      invocationId: 'sri_external_source_receipt',
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: {
        ref: sourceRef,
        sha256: sourceSha256,
        identityReceiptRef: receipt.ref,
      },
    });
    const sourceBinding = input.stage_run_spec.content_bindings.find((entry) => (
      entry.purpose === 'source' && entry.ref === sourceRef
    ));
    assert.equal(sourceBinding?.verification_kind, 'trusted_artifact_identity_receipt');
    assert.equal(sourceBinding?.identity_receipt_ref, receipt.ref);
    assert.equal(sourceBinding?.producing_stage_run_ref, 'opl://stage-runs/sr-external-source-owner');
    assert.equal(sourceBinding?.producing_attempt_ref, 'opl://stage-attempts/sat-external-source-owner');
    assert.equal(sourceBinding?.byte_size, sourceBytes.length);

    for (const [field, value] of [
      ['producing_stage_run_ref', 'opl://stage-runs/sr-other-owner'],
      ['producing_attempt_ref', 'opl://stage-attempts/sat-other-owner'],
      ['byte_size', sourceBytes.length + 1],
    ] as const) {
      const tamperedSpec = structuredClone(input.stage_run_spec);
      const tamperedBinding = tamperedSpec.content_bindings.find((entry) => (
        entry.purpose === 'source' && entry.ref === sourceRef
      ));
      assert.ok(tamperedBinding);
      (tamperedBinding as any)[field] = value;
      assert.throws(() => revalidateStageRunImmutableSpecContent({
        spec: tamperedSpec,
        domainPackRoot,
        workspaceLocator: input.workspace_locator,
        scopeKind: 'domain',
        executionScope: null,
      }), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_binding_mismatch');
        return true;
      }, field);
    }

    const missingStageRunReceipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-external-source-owner',
      stageRunId: null,
      artifactRef: sourceRef,
      artifactSha256: sourceSha256,
      sizeBytes: sourceBytes.length,
    });
    assert.throws(() => stageRunInput({
      invocationId: 'sri_external_source_receipt_without_stage_run',
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: {
        ref: sourceRef,
        sha256: sourceSha256,
        identityReceiptRef: missingStageRunReceipt.ref,
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_mismatch');
      return true;
    });

    const db = new DatabaseSync(':memory:');
    try {
      registerStageRunLaunch(db, input);
      fs.appendFileSync(receipt.filePath, 'tampered-after-spec\n');
      assert.throws(() => registerStageRunLaunch(db, input), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_digest_mismatch');
        return true;
      });
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('work-item content bindings reject local root escape and cross-study receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-work-item-content-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const studyOne = workItemExecutionScope('study-001');
    const studyTwo = workItemExecutionScope('study-002');
    fs.mkdirSync(studyOne.canonical_work_item_root!, { recursive: true });
    assert.throws(() => stageRunInput({
      invocationId: 'sri_work_item_root_escape',
      executionScope: studyOne,
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_outside_work_item_root');
      return true;
    });

    const localArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      '{"study_id":"study-001"}\n',
    );
    const localArtifactRef = pathToFileURL(localArtifact.filePath).href;
    const localInput = stageRunInput({
      invocationId: 'sri_work_item_local_artifact',
      executionScope: studyOne,
      artifact: { ...localArtifact, ref: localArtifactRef },
    });
    const localBinding = localInput.stage_run_spec.content_bindings.find((entry) => (
      entry.purpose === 'input_artifact' && entry.ref === localArtifactRef
    ));
    assert.equal(localBinding?.scope_kind, 'work_item');
    assert.equal(localBinding?.work_item_scope_id, studyOne.work_item_scope_id);
    assert.equal(localBinding?.scope_digest, studyOne.scope_digest);

    const localReceipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-study-001-local-owner',
      stageRunId: 'sr-study-001-local-owner',
      executionScope: studyOne,
      artifactRef: localArtifactRef,
      artifactSha256: localArtifact.sha256,
      sizeBytes: fs.statSync(localArtifact.filePath).size,
    });
    const receiptBoundLocalInput = stageRunInput({
      invocationId: 'sri_work_item_local_artifact_with_receipt',
      executionScope: studyOne,
      artifact: {
        ...localArtifact,
        ref: localArtifactRef,
        identityReceiptRef: localReceipt.ref,
      },
    });
    const receiptBoundLocalBinding = receiptBoundLocalInput.stage_run_spec.content_bindings.find((entry) => (
      entry.purpose === 'input_artifact' && entry.ref === localArtifactRef
    ));
    assert.equal(receiptBoundLocalBinding?.verification_kind, 'trusted_artifact_identity_receipt');
    assert.equal(receiptBoundLocalBinding?.identity_receipt_ref, localReceipt.ref);
    assert.equal(
      receiptBoundLocalBinding?.producing_stage_run_ref,
      'opl://stage-runs/sr-study-001-local-owner',
    );

    const sourceRef = 'https://evidence.example.invalid/study-001/source.json';
    const sourceBytes = Buffer.from('{"study_id":"study-001"}\n');
    const sourceSha256 = sha256(sourceBytes);
    const receipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-study-001-owner',
      stageRunId: 'sr-study-001-owner',
      executionScope: studyOne,
      artifactRef: sourceRef,
      artifactSha256: sourceSha256,
      sizeBytes: sourceBytes.length,
    });
    stageRunInput({
      invocationId: 'sri_work_item_receipt_same_scope',
      executionScope: studyOne,
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: { ref: sourceRef, sha256: sourceSha256, identityReceiptRef: receipt.ref },
    });
    assert.throws(() => stageRunInput({
      invocationId: 'sri_work_item_receipt_cross_scope',
      executionScope: studyTwo,
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: { ref: sourceRef, sha256: sourceSha256, identityReceiptRef: receipt.ref },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_mismatch');
      return true;
    });
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun build rejects a physical work-item root replacement by another Study', () => {
  const studyOne = workItemExecutionScope('study-root-rebind-build-001');
  const studyTwo = workItemExecutionScope('study-root-rebind-build-002');
  const displacedStudyOneRoot = `${studyOne.canonical_work_item_root}.displaced`;
  try {
    fs.mkdirSync(studyOne.canonical_work_item_root!, { recursive: true });
    fs.mkdirSync(studyTwo.canonical_work_item_root!, { recursive: true });
    const foreignArtifact = writeFixture(
      studyTwo.canonical_work_item_root!,
      'artifacts/rebound.json',
      '{"study_id":"study-root-rebind-build-002"}\n',
    );
    fs.renameSync(studyOne.canonical_work_item_root!, displacedStudyOneRoot);
    fs.renameSync(studyTwo.canonical_work_item_root!, studyOne.canonical_work_item_root!);
    const reboundArtifactRef = pathToFileURL(path.join(
      studyOne.canonical_work_item_root!,
      'artifacts/rebound.json',
    )).href;

    assert.throws(() => stageRunInput({
      invocationId: 'sri_work_item_root_rebind_build',
      executionScope: studyOne,
      artifact: { ref: reboundArtifactRef, sha256: foreignArtifact.sha256 },
    }), (error: any) => {
      assert.equal(
        error.details?.failure_code,
        'stage_run_artifact_work_item_root_identity_drift',
      );
      return true;
    });
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
    fs.rmSync(displacedStudyOneRoot, { recursive: true, force: true });
    fs.rmSync(studyTwo.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun revalidation rejects a physical work-item root replacement after spec creation', () => {
  const studyOne = workItemExecutionScope('study-root-rebind-revalidate-001');
  const studyTwo = workItemExecutionScope('study-root-rebind-revalidate-002');
  const displacedStudyOneRoot = `${studyOne.canonical_work_item_root}.displaced`;
  try {
    fs.mkdirSync(studyOne.canonical_work_item_root!, { recursive: true });
    fs.mkdirSync(studyTwo.canonical_work_item_root!, { recursive: true });
    const originalArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/rebound.json',
      '{"study_id":"study-root-rebind-revalidate-001"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_work_item_root_rebind_revalidate',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(originalArtifact.filePath).href,
        sha256: originalArtifact.sha256,
      },
    });
    writeFixture(
      studyTwo.canonical_work_item_root!,
      'artifacts/rebound.json',
      '{"study_id":"study-root-rebind-revalidate-001"}\n',
    );
    fs.renameSync(studyOne.canonical_work_item_root!, displacedStudyOneRoot);
    fs.renameSync(studyTwo.canonical_work_item_root!, studyOne.canonical_work_item_root!);

    assert.throws(() => revalidateStageRunImmutableSpecContent({
      spec: input.stage_run_spec,
      domainPackRoot,
      workspaceLocator: input.workspace_locator,
      scopeKind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
      executionScope: input.execution_scope ?? null,
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_scope_binding_mismatch');
      assert.equal(
        error.details?.boundary_failure_code,
        'work_item_file_boundary_root_attestation_mismatch',
      );
      return true;
    });
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
    fs.rmSync(displacedStudyOneRoot, { recursive: true, force: true });
    fs.rmSync(studyTwo.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun rejects an unknown verification kind before it can bypass cross-Study file scope', () => {
  const studyOne = workItemExecutionScope('study-unknown-kind-001');
  const studyTwo = workItemExecutionScope('study-unknown-kind-002');
  try {
    const sharedBytes = '{"content":"same bytes in two Studies"}\n';
    const studyOneArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      sharedBytes,
    );
    const studyTwoArtifact = writeFixture(
      studyTwo.canonical_work_item_root!,
      'artifacts/input.json',
      sharedBytes,
    );
    const input = stageRunInput({
      invocationId: 'sri_work_item_unknown_verification_kind',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(studyOneArtifact.filePath).href,
        sha256: studyOneArtifact.sha256,
      },
    });
    const tamperedSpec = structuredClone(input.stage_run_spec);
    const inputArtifactBinding = tamperedSpec.content_bindings.find((binding) => (
      binding.purpose === 'input_artifact'
    ));
    assert.ok(inputArtifactBinding);
    inputArtifactBinding.ref = pathToFileURL(studyTwoArtifact.filePath).href;
    (inputArtifactBinding as any).verification_kind = 'unregistered_workspace_bytes';
    tamperedSpec.input_artifacts = [{
      ref: pathToFileURL(studyTwoArtifact.filePath).href,
      sha256: studyTwoArtifact.sha256,
      identity_receipt_ref: null,
    }];
    const tamperedInput = {
      ...input,
      stage_run_spec: tamperedSpec,
      stage_run_spec_sha256: stageRunSpecSha256(tamperedSpec),
      artifact_refs: tamperedSpec.input_artifacts.map((artifact) => artifact.ref),
      artifact_hashes: tamperedSpec.input_artifacts.map((artifact) => artifact.sha256),
      artifact_identity_receipt_refs: [],
    };
    const db = new DatabaseSync(':memory:');
    try {
      assert.throws(() => registerStageRunLaunch(db, tamperedInput), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_verification_kind_invalid');
        return true;
      });
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
    fs.rmSync(studyTwo.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun input artifacts cannot be rebound as managed package bytes', () => {
  const studyOne = workItemExecutionScope('study-managed-kind-bypass-001');
  try {
    const localArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      '{"study_id":"study-managed-kind-bypass-001"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_input_artifact_managed_kind_bypass',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(localArtifact.filePath).href,
        sha256: localArtifact.sha256,
      },
    });
    const managedRef = 'agent/sources/request.md';
    const managedSha256 = sha256(fs.readFileSync(path.join(domainPackRoot, managedRef)));
    const tamperedSpec = structuredClone(input.stage_run_spec);
    const inputArtifactBinding = tamperedSpec.content_bindings.find((binding) => (
      binding.purpose === 'input_artifact'
    ));
    assert.ok(inputArtifactBinding);
    Object.assign(inputArtifactBinding, {
      ref: managedRef,
      sha256: managedSha256,
      verification_kind: 'managed_pack_file_bytes',
      identity_receipt_ref: null,
      producing_attempt_ref: null,
      scope_kind: null,
      work_item_scope_id: null,
      scope_digest: null,
    });
    tamperedSpec.input_artifacts = [{
      ref: managedRef,
      sha256: managedSha256,
      identity_receipt_ref: null,
    }];
    const tamperedInput = {
      ...input,
      stage_run_spec: tamperedSpec,
      stage_run_spec_sha256: stageRunSpecSha256(tamperedSpec),
      artifact_refs: [managedRef],
      artifact_hashes: [managedSha256],
      artifact_identity_receipt_refs: [],
    };
    const db = new DatabaseSync(':memory:');
    try {
      assert.throws(() => registerStageRunLaunch(db, tamperedInput), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_binding_authority_mismatch');
        return true;
      });
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun revalidation classifies file drift independently from root drift', async () => {
  const studyOne = workItemExecutionScope('study-content-file-drift-001');
  try {
    const artifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      '{"study_id":"study-content-file-drift-001"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_content_file_drift',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(artifact.filePath).href,
        sha256: artifact.sha256,
      },
    });
    await assert.rejects(() => runWithWorkItemFileBoundaryInterlock({
      temporaryRoot: workspaceRoot,
      point: 'after_file_open',
      mutation: { kind: 'append_file', file_path: artifact.filePath, bytes: 'changed during verification\n' },
      invoke: () => revalidateStageRunImmutableSpecContent({
        spec: input.stage_run_spec,
        domainPackRoot,
        workspaceLocator: input.workspace_locator,
        scopeKind: input.scope_kind ?? 'work_item',
        executionScope: input.execution_scope ?? null,
        skipManagedPackBytes: true,
      }),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_content_changed_during_verification');
      assert.equal(error.details?.boundary_failure_code, 'work_item_file_boundary_ref_drift');
      return true;
    });
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('every child Attempt preserves parent evidence and binds the latest execution snapshot', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-child-content-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const stagePromptPath = path.join(domainPackRoot, 'agent/prompts/intake.md');
  const rubricPath = path.join(domainPackRoot, 'agent/quality_gates/stage.md');
  const originalStagePrompt = fs.readFileSync(stagePromptPath);
  const originalRubric = fs.readFileSync(rubricPath);
  const executionPackRoot = path.join(stateRoot, 'current-pack');
  fs.cpSync(domainPackRoot, executionPackRoot, { recursive: true });
  const currentStagePromptPath = path.join(executionPackRoot, 'agent/prompts/intake.md');
  const currentRolePromptPath = path.join(executionPackRoot, 'agent/prompts/stage-quality.md');
  const currentRubricPath = path.join(executionPackRoot, 'agent/quality_gates/stage.md');
  fs.writeFileSync(currentStagePromptPath, '# intake prompt from current package\n');
  fs.writeFileSync(
    currentRolePromptPath,
    '# Stage quality roles\n\n## Producer\nUse the current producer policy.\n\n## Reviewer\nUse the current reviewer policy.\n\n## Repairer\nRepair current findings.\n\n## Re-reviewer\nClose current findings.\n',
  );
  const currentUseBinding = packageUseBinding({
    packageVersion: '0.2.2',
    useReceiptRef: 'opl://agent-package/use/fixture/current',
  });
  const materializationOptions = {
    ensurePackageLaunchReady: async () => ({
      runtime_source_readiness: {
        checkout_path: executionPackRoot,
        operational_ready: true,
      },
      package_use_binding: currentUseBinding,
    }),
    resolveStageBinding: () => binding(),
  };
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const input = stageRunInput({ invocationId: 'sri_child_executor_content' });
    registerStageRunInConfiguredState(input);
    const materialized = await stageQualityAttemptMaterializeActivity({
      stage_run: input,
      quality_cycle_id: 'sqc_child_executor_content',
      attempt_role: 'producer',
      quality_round_index: 0,
      artifact_refs: input.artifact_refs ?? [],
      artifact_hashes: input.artifact_hashes ?? [],
      artifact_identity_receipt_refs: input.artifact_identity_receipt_refs ?? [],
    }, materializationOptions);
    assert.equal(
      materialized.workflow_input.stage_run_content_binding_version,
      'opl-stage-run-attempt-content-binding.v1',
    );
    assert.deepEqual(materialized.workflow_input.stage_run_spec, input.stage_run_spec);
    assert.equal(materialized.workflow_input.stage_run_spec_sha256, input.stage_run_spec_sha256);
    assert.equal(materialized.workflow_input.domain_pack_root, executionPackRoot);
    assert.equal(
      materialized.workflow_input.execution_content_binding?.parent_stage_run_spec_sha256,
      input.stage_run_spec_sha256,
    );
    assert.equal(
      (materialized.workflow_input.execution_content_binding?.spec.package_closure as any)
        ?.root_package?.package_version,
      '0.2.2',
    );
    assert.deepEqual(
      materialized.workflow_input.execution_content_binding?.declared_stage_ids,
      ['draft', 'intake', 'review'],
    );
    assert.equal(
      materialized.workflow_input.execution_content_binding?.binding_sha256,
      stageAttemptExecutionContentBindingSha256(
        materialized.workflow_input.execution_content_binding!,
      ),
    );
    const { stage_run_content_binding_version: _bindingVersion, ...unboundChild } = materialized.workflow_input;
    assert.throws(() => resolveStageRunAttemptExecutorContent(unboundChild), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_child_content_binding_version_missing');
      return true;
    });
    const resolved = resolveStageRunAttemptExecutorContent(materialized.workflow_input);
    assert.equal(resolved.effectiveStagePrompt?.content, '# intake prompt from current package\n');
    assert.match(resolved.effectiveQualityRolePrompt?.content ?? '', /current producer policy/);
    assert.throws(() => resolveStageRunAttemptExecutorContent({
      ...materialized.workflow_input,
      execution_content_binding: {
        ...materialized.workflow_input.execution_content_binding!,
        declared_stage_ids: ['draft', 'intake', 'new-stage', 'review'],
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_attempt_execution_content_binding_mismatch');
      return true;
    });

    // Parent bytes are historical evidence. Their later availability or drift cannot invalidate this Attempt.
    fs.appendFileSync(stagePromptPath, 'changed-after-child-materialization\n');
    fs.appendFileSync(rubricPath, 'historical-parent-rubric-drift\n');
    assert.doesNotThrow(() => resolveStageRunAttemptExecutorContent(materialized.workflow_input));

    // The immutable snapshot selected for this Attempt must remain byte-stable while it executes.
    fs.appendFileSync(currentStagePromptPath, 'changed-after-child-materialization\n');
    assert.throws(() => resolveStageRunAttemptExecutorContent(materialized.workflow_input), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_content_binding_stale');
      assert.equal(error.details?.ref, 'agent/prompts/intake.md');
      assert.ok(['lineage', 'stage_prompt'].includes(error.details?.purpose));
      return true;
    });
    fs.writeFileSync(currentStagePromptPath, '# intake prompt from current package\n');

    // A newer package appearing before the next Attempt is captured as that Attempt's current truth.
    fs.appendFileSync(currentRubricPath, 'new rubric rule before next attempt\n');
    fs.writeFileSync(
      currentRolePromptPath,
      fs.readFileSync(currentRolePromptPath, 'utf8').replace(
        'Use the current producer policy.',
        'Use the newer producer policy.',
      ),
    );
    const next = await stageQualityAttemptMaterializeActivity({
      stage_run: input,
      quality_cycle_id: 'sqc_child_next_current_snapshot',
      attempt_role: 'producer',
      quality_round_index: 0,
      artifact_refs: input.artifact_refs ?? [],
      artifact_hashes: input.artifact_hashes ?? [],
      artifact_identity_receipt_refs: input.artifact_identity_receipt_refs ?? [],
    }, materializationOptions);
    const nextResolved = resolveStageRunAttemptExecutorContent(next.workflow_input);
    assert.match(nextResolved.effectiveQualityRolePrompt?.content ?? '', /newer producer policy/);
    assert.notEqual(
      next.workflow_input.execution_content_binding?.spec_sha256,
      materialized.workflow_input.execution_content_binding?.spec_sha256,
    );
  } finally {
    fs.writeFileSync(stagePromptPath, originalStagePrompt);
    fs.writeFileSync(rubricPath, originalRubric);
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal materialization retry reuses the first child Attempt and package-use binding', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-child-retry-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const firstPackRoot = path.join(stateRoot, 'first-pack');
  const laterPackRoot = path.join(stateRoot, 'later-pack');
  fs.cpSync(domainPackRoot, firstPackRoot, { recursive: true });
  fs.cpSync(domainPackRoot, laterPackRoot, { recursive: true });
  fs.writeFileSync(
    path.join(laterPackRoot, 'agent/prompts/stage-quality.md'),
    '# Stage quality roles\n\n## Producer\nUse the later producer policy.\n',
  );
  const firstUseBinding = {
    ...packageUseBinding({
      checkedAt: '2026-07-14T00:00:00.000Z',
      packageVersion: '0.2.2',
      useReceiptRef: 'opl://agent-package/use/fixture/retry-first',
    }),
    use_boundary_id: 'package-use:retry-first',
  };
  const laterUseBinding = {
    ...packageUseBinding({
      checkedAt: '2026-07-14T00:01:00.000Z',
      packageVersion: '0.2.3',
      useReceiptRef: 'opl://agent-package/use/fixture/retry-later',
    }),
    use_boundary_id: 'package-use:retry-later',
  };
  const firstStageBinding = binding();
  const laterStageBinding = {
    ...binding(),
    role_prompt_refs: {
      ...binding().role_prompt_refs,
      producer: 'agent/prompts/stage-quality.md#later-producer',
    },
  };
  let readinessCalls = 0;
  let bindingCalls = 0;
  const materializationOptions = {
    ensurePackageLaunchReady: async () => {
      const snapshot = readinessCalls === 0
        ? { checkoutRoot: firstPackRoot, useBinding: firstUseBinding }
        : { checkoutRoot: laterPackRoot, useBinding: laterUseBinding };
      readinessCalls += 1;
      return {
        runtime_source_readiness: {
          checkout_path: snapshot.checkoutRoot,
          operational_ready: true,
        },
        package_use_binding: snapshot.useBinding,
      };
    },
    resolveStageBinding: () => {
      const snapshot = bindingCalls === 0 ? firstStageBinding : laterStageBinding;
      bindingCalls += 1;
      return snapshot;
    },
  };
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const stageRun = stageRunInput({ invocationId: 'sri_child_temporal_retry' });
    registerStageRunInConfiguredState(stageRun);
    const materializationInput = {
      stage_run: stageRun,
      quality_cycle_id: 'sqc_child_temporal_retry',
      attempt_role: 'producer' as const,
      quality_round_index: 0,
      artifact_refs: stageRun.artifact_refs ?? [],
      artifact_hashes: stageRun.artifact_hashes ?? [],
      artifact_identity_receipt_refs: stageRun.artifact_identity_receipt_refs ?? [],
    };

    const first = await stageQualityAttemptMaterializeActivity(
      materializationInput,
      materializationOptions,
    );
    const retry = await stageQualityAttemptMaterializeActivity(
      materializationInput,
      materializationOptions,
    );

    assert.equal(readinessCalls, 1);
    assert.equal(bindingCalls, 1);
    assert.equal(retry.attempt_ref, first.attempt_ref);
    assert.deepEqual(
      retry.workflow_input.execution_content_binding,
      first.workflow_input.execution_content_binding,
    );
    assert.equal(
      retry.workflow_input.execution_content_binding?.use_boundary_id,
      firstUseBinding.use_boundary_id,
    );
    assert.equal(
      (retry.workflow_input.workspace_locator.package_use_binding as any)?.use_receipt_ref,
      firstUseBinding.use_receipt_ref,
    );

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE stage_run_id = ? AND quality_cycle_id = ?
      `).get(stageRun.stage_run_id, materializationInput.quality_cycle_id) as { count: number };
      assert.equal(count.count, 1);
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun creation records incomplete package provenance without blocking execution', () => {
  const useBinding: any = packageUseBinding();
  delete useBinding.root_package.package_version;
  delete useBinding.root_package.package_lock_ref;
  delete useBinding.root_package.manifest_sha256;
  delete useBinding.root_package.content_digest;
  delete useBinding.provider_packages[0].manifest_sha256;
  delete useBinding.provider_packages[0].content_digest;
  delete useBinding.dependency_closure_digest;
  const stageRun = stageRunInput({
    invocationId: 'sri_incomplete_package_provenance',
    locator: workspaceLocator(useBinding),
  });
  const closure = stageRun.stage_run_spec.package_closure as any;
  assert.equal(closure.root_package.package_id, 'mas');
  assert.equal(closure.root_package.package_version, null);
  assert.equal(closure.root_package.package_lock_ref, null);
  assert.equal(closure.root_package.manifest_sha256, null);
  assert.equal(closure.root_package.content_digest, null);
  assert.equal(closure.provider_packages[0].package_id, 'mas-scholar-skills');
  assert.equal(closure.provider_packages[0].manifest_sha256, null);
  assert.equal(closure.provider_packages[0].content_digest, null);
  assert.equal(closure.dependency_closure_digest, null);
});

test('StageRun creation still rejects a malformed package provenance digest when present', () => {
  const useBinding: any = packageUseBinding();
  useBinding.root_package.content_digest = 'not-a-sha256';
  assert.throws(() => stageRunInput({
    invocationId: 'sri_invalid_root_content_digest',
    locator: workspaceLocator(useBinding),
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_content_digest_invalid');
    return true;
  });
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

    const drift = stageRunInput({ sourceFingerprint: `sha256:${'8'.repeat(64)}` });
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

test('StageRun and StageAttempt persist one exact work-item execution scope', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    createFamilyRuntimeQueueTables(db);
    const scope = workItemExecutionScope();
    fs.mkdirSync(scope.canonical_work_item_root!, { recursive: true });
    const scopedArtifact = writeFixture(
      scope.canonical_work_item_root!,
      'artifacts/request.json',
      '{"artifact_id":"scoped-request"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_execution_scope_binding',
      executionScope: scope,
      artifact: {
        ref: pathToFileURL(scopedArtifact.filePath).href,
        sha256: scopedArtifact.sha256,
      },
    });
    assert.throws(() => registerStageRunLaunch(db, input, {
      scopeKind: 'work_item',
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'work_item_execution_scope_missing');
      return true;
    });

    const registered = registerStageRunLaunch(db, input, {
      scopeKind: 'work_item',
      executionScope: scope,
    });
    assert.equal(registered.launch.scope_kind, 'work_item');
    assert.equal(registered.launch.identity_state, 'resolved');
    assert.equal(registered.launch.work_item_scope_id, scope.work_item_scope_id);
    assert.equal(registered.launch.scope_digest, scope.scope_digest);
    assert.deepEqual(registered.launch.execution_scope, scope);

    const replayed = registerStageRunLaunch(db, input, {
      scopeKind: 'work_item',
      executionScope: scope,
    });
    assert.equal(replayed.idempotent_replay, true);
    assert.throws(() => registerStageRunLaunch(db, input, {
      scopeKind: 'work_item',
      executionScope: workItemExecutionScope('study-002'),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'runtime_execution_scope_conflict');
      return true;
    });

    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot, study_id: 'study-001' },
      sourceFingerprint: 'scope-attempt-one',
      stageRunId: input.stage_run_id,
      scopeKind: 'work_item',
      executionScope: scope,
    }).attempt;
    assert.equal(attempt.stage_run_id, input.stage_run_id);
    assert.equal(attempt.scope_kind, 'work_item');
    assert.equal(attempt.identity_state, 'resolved');
    assert.equal(attempt.scope_digest, scope.scope_digest);
    assert.deepEqual(attempt.execution_scope, scope);

    assert.throws(() => createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot, study_id: 'study-001' },
      sourceFingerprint: 'scope-attempt-missing-stage-run',
      scopeKind: 'work_item',
      executionScope: scope,
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'work_item_stage_attempt_stage_run_missing');
      return true;
    });

    assert.throws(() => createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot, study_id: 'study-002' },
      sourceFingerprint: 'scope-attempt-cross-study',
      stageRunId: input.stage_run_id,
      scopeKind: 'work_item',
      executionScope: workItemExecutionScope('study-002'),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_attempt_stage_run_scope_mismatch');
      return true;
    });

    const domainAttempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'runtime-maintenance',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot, study_id: 'legacy-display-only' },
      sourceFingerprint: 'domain-scope-attempt',
      scopeKind: 'domain',
    }).attempt;
    assert.equal(domainAttempt.scope_kind, 'domain');
    assert.equal(domainAttempt.identity_state, 'resolved');
    assert.equal(domainAttempt.execution_scope, null);
    assert.equal(domainAttempt.stage_run_id, null);
  } finally {
    db.close();
  }
});

test('scoped StageRun registration treats active unresolved runtime aliases as negative-only conflicts', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const legacyAttempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot, study_id: 'study-001' },
      sourceFingerprint: 'sha256:legacy-unresolved-attempt',
      scopeKind: 'domain',
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'running', scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_attempt_id = ?
    `).run(legacyAttempt.stage_attempt_id);

    const legacyStageRun = stageRunInput({ invocationId: 'sri_legacy_unresolved_release' });
    registerStageRunLaunch(db, legacyStageRun);
    db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'started', scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_run_id = ?
    `).run(legacyStageRun.stage_run_id);

    const candidate = scopedStageRunInput('sri_scoped_release_candidate', 'study-002');
    assert.throws(() => registerStageRunLaunch(db, candidate.input, {
      scopeKind: 'work_item',
      executionScope: candidate.scope,
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'active_unresolved_runtime_identity_conflict');
      assert.equal(error.details?.legacy_alias_policy, 'negative_admission_only');
      assert.equal(error.details?.positive_binding_allowed, false);
      assert.deepEqual(
        new Set(error.details?.legacy_conflicts.map((entry: any) => entry.runtime_kind)),
        new Set(['stage_attempt', 'stage_run']),
      );
      assert.equal(
        error.details?.legacy_conflicts.every((entry: any) => entry.workspace_match === 'same_workspace'),
        true,
      );
      return true;
    });
    assert.equal(findStageRunLaunch(db, candidate.input.stage_run_id), null);
    assert.equal(
      db.prepare('SELECT status FROM stage_attempts WHERE stage_attempt_id = ?')
        .get(legacyAttempt.stage_attempt_id)?.status,
      'running',
    );

    db.prepare("UPDATE stage_attempts SET status = 'completed' WHERE stage_attempt_id = ?")
      .run(legacyAttempt.stage_attempt_id);
    db.prepare("UPDATE stage_run_launches SET launch_status = 'closed' WHERE stage_run_id = ?")
      .run(legacyStageRun.stage_run_id);
    assert.equal(registerStageRunLaunch(db, candidate.input, {
      scopeKind: 'work_item',
      executionScope: candidate.scope,
    }).registered, true);
  } finally {
    db.close();
  }
});

test('pre-registered scoped work cannot start or materialize after an unresolved legacy conflict appears', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const candidate = scopedStageRunInput('sri_scoped_release_claim', 'study-002');
    registerStageRunLaunch(db, candidate.input, {
      scopeKind: 'work_item',
      executionScope: candidate.scope,
    });
    const legacyAttempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot, study_id: 'study-001' },
      sourceFingerprint: 'sha256:legacy-unresolved-after-registration',
      scopeKind: 'domain',
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'running', scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_attempt_id = ?
    `).run(legacyAttempt.stage_attempt_id);

    for (const operation of [
      () => claimStageRunStart(db, { stageRunId: candidate.input.stage_run_id }),
      () => createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: 'intake',
        providerKind: 'temporal',
        workspaceLocator: candidate.input.workspace_locator,
        sourceFingerprint: 'sha256:scoped-attempt-after-legacy-conflict',
        stageRunId: candidate.input.stage_run_id,
        scopeKind: 'work_item',
        executionScope: candidate.scope,
      }),
    ]) {
      assert.throws(operation, (error: any) => {
        assert.equal(error.details?.failure_code, 'active_unresolved_runtime_identity_conflict');
        return true;
      });
    }
    assert.equal(inspectStageRunLaunch(db, candidate.input.stage_run_id).launch_status, 'registered');
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM stage_attempts WHERE scope_kind = ?')
        .get('work_item')?.count,
      0,
    );
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
    recordStageRunTemporalStart(db, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: temporalStartReceipt(input),
    });
    recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'completed' });
    const afterLateStartReceipt = recordStageRunTemporalStart(db, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: {
        workflow_id: input.workflow_id,
        first_execution_run_id: `run-${input.stage_run_id}`,
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

test('legacy identity-unresolved StageRun cannot launch or recover from historical input', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const current = stageRunInput({ invocationId: 'sri_legacy_identity_unresolved' });
    const legacy = { ...current } as Record<string, unknown>;
    delete legacy.scope_kind;
    delete legacy.execution_scope;
    registerStageRunLaunch(db, legacy as unknown as ReturnType<typeof stageRunInput>);
    db.prepare(`
      UPDATE stage_run_launches
      SET scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_run_id = ?
    `).run(current.stage_run_id);
    await assert.rejects(() => launchRegisteredStageRun({
      db,
      stageRunInput: legacy as unknown as ReturnType<typeof stageRunInput>,
      start: false,
      startWorkflow: async () => ({ workflow_status: 'RUNNING' }),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'runtime_execution_identity_unresolved');
      return true;
    });
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
