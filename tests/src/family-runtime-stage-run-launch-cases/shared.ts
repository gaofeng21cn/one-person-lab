import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { StandardAgentStageQualityRuntimeBinding } from '../../../src/authority/packages/index.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../../src/authority/workspace/index.ts';
import { parseFamilyRuntimeCommand } from '../../../src/adapters/execution/family-runtime-command.ts';
import { runFamilyRuntime } from '../../../src/adapters/execution/family-runtime.ts';
import { buildPackBoundTemporalStageRunInput } from '../../../src/adapters/execution/family-runtime-pack-bound-stage-run.ts';
import { resolveStageRunAttemptExecutorContent } from '../../../src/adapters/execution/family-runtime-stage-run-attempt-content.ts';
import {
  buildCliStageRunInvocationId,
  buildHostedActionStageRunInvocationId,
  buildRouteStageRunInvocation,
  deriveStageRunId,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  revalidateStageRunImmutableSpecContent,
} from '../../../src/adapters/execution/family-runtime-stage-run-identity.ts';
import { launchRegisteredStageRun } from '../../../src/adapters/execution/family-runtime-stage-run-launch.ts';
import { materializeStageRunRoute } from '../../../src/adapters/execution/family-runtime-stage-run-route-launch.ts';
import {
  claimStageRunStart,
  claimStageRunRecoveryStart,
  findStageRunLaunch,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunRecoveryStartFailure,
  recordStageRunTemporalRecoveryStart,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
} from '../../../src/adapters/execution/family-runtime-stage-run-launch-registry.ts';
import { requireTemporalStageRunWorkflowInputLaunchable } from '../../../src/adapters/execution/family-runtime-temporal.ts';
import { stageQualityAttemptMaterializeActivity } from '../../../src/adapters/execution/family-runtime-temporal-activities.ts';
import { createStageAttempt } from '../../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { createFamilyRuntimeQueueTables, openQueueDb } from '../../../src/adapters/execution/family-runtime-store.ts';
import { normalizeStageQualityCyclePolicy } from '../../../src/authority/stages/stage-quality-cycle.ts';
import { runWithWorkItemFileBoundaryInterlock } from '../work-item-file-boundary-test-support.ts';

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
  targetRoot?: string;
  packageVersion?: string;
} = {}) {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:fixture',
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
  routeBudget?: { max_route_back_rounds: number; route_back_rounds_used: number } | null;
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
    routeBudget: input.routeBudget,
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
    'src/adapters/execution/family-runtime-stage-run-launch-registry.ts',
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
    'src/adapters/execution/family-runtime-stage-run-launch-registry.ts',
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


export {
  assert,
  crypto,
  fs,
  os,
  path,
  DatabaseSync,
  test,
  pathToFileURL,
  Worker,
  createWorkItemExecutionScopeSnapshot,
  parseFamilyRuntimeCommand,
  runFamilyRuntime,
  buildPackBoundTemporalStageRunInput,
  resolveStageRunAttemptExecutorContent,
  buildCliStageRunInvocationId,
  buildHostedActionStageRunInvocationId,
  buildRouteStageRunInvocation,
  deriveStageRunId,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  revalidateStageRunImmutableSpecContent,
  launchRegisteredStageRun,
  materializeStageRunRoute,
  claimStageRunStart,
  claimStageRunRecoveryStart,
  findStageRunLaunch,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunRecoveryStartFailure,
  recordStageRunTemporalRecoveryStart,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
  requireTemporalStageRunWorkflowInputLaunchable,
  stageQualityAttemptMaterializeActivity,
  createStageAttempt,
  createFamilyRuntimeQueueTables,
  openQueueDb,
  normalizeStageQualityCyclePolicy,
  runWithWorkItemFileBoundaryInterlock,
  fixtureRoot,
  domainPackRoot,
  workspaceRoot,
  sha256,
  writeFixture,
  safeIdentityDirectory,
  manifestFixture,
  artifactFixtures,
  binding,
  packageUseBinding,
  workspaceLocator,
  stageRunInput,
  workItemExecutionScope,
  scopedStageRunInput,
  registerStageRunInConfiguredState,
  decisiveExecutionBinding,
  writeTrustedIdentityReceipt,
  temporalStartReceipt,
  workerClaim,
  workerClose,
  waitForBarrierCount,
};
export type { StandardAgentStageQualityRuntimeBinding };
