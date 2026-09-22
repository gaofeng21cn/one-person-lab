import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MockActivityEnvironment } from '@temporalio/testing';

import {
  foundryContentDigest,
  FrozenPlanEvaluationRuntime,
  type EvaluationExecutor,
  readFoundryProviderManifest,
  type AgentBlueprint,
  type DesignRequest,
} from '../../src/authority/evolution/index.ts';
import { FileFoundryContentStore, foundryStoragePaths } from '../../src/authority/evidence/index.ts';
import { createProductionFoundryKernel } from '../../src/adapters/execution/foundry-production-runtime.ts';
import type {
  FoundryProviderOperationCursorV2,
} from '../../src/adapters/execution/foundry-provider-stage-run.ts';
import {
  foundryAdvanceOperationForInspection,
  type FoundryTemporalActivities,
} from '../../src/adapters/execution/foundry-temporal.ts';
import { buildCordisTemporalActivities } from '../../src/host/temporal-activity-projection.ts';
import { canonicalJsonBytes, canonicalJsonText } from '../../src/kernel/canonical-json.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const omaFixtureRoot = path.join(repoRoot, 'tests/fixtures/oma-0.4.0');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('Cordis Temporal projection registers every activity used by runtime workflows', () => {
  const activities = buildCordisTemporalActivities();
  const requiredActivityNames = [
    'codexStageActivity',
    'domainHandlerDispatchActivity',
    'schedulerTickActivity',
    'stageQualityAttemptMaterializeActivity',
    'stageQualityAttemptSyncActivity',
    'stageQualityCycleProjectActivity',
    'stageQualityReviewReceiptActivity',
    'stageRunRouteLaunchActivity',
    'foundryAuthorizeCancelRunActivity',
    'foundryLaunchProviderOperationActivity',
    'foundryObserveProviderOperationActivity',
    'foundryReadProviderOperationTerminalActivity',
    'foundryCancelProviderOperationActivity',
  ];

  for (const activityName of requiredActivityNames) {
    assert.equal(typeof activities[activityName as keyof typeof activities], 'function', activityName);
  }
});

test('Cordis Foundry advance replays a frozen v2 provider result through the production kernel', async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cordis-foundry-replay-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  t.after(() => {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const provider = readFoundryProviderManifest(omaFixtureRoot, 'foundry_provider.json');
  const request = readJson<DesignRequest>(path.join(
    omaFixtureRoot,
    'foundry-protocol/design-request.json',
  ));
  const fixtureBlueprint = readJson<AgentBlueprint>(path.join(
    omaFixtureRoot,
    'foundry-protocol/agent-blueprint.json',
  ));
  const content = new FileFoundryContentStore();
  const schemaRef = content.put(Buffer.from('{"type":"object"}')).ref;
  const textRef = content.put(Buffer.from('Synthetic worker wiring fixture.')).ref;
  const schemaRefs = new Set(fixtureBlueprint.content_refs.schema_refs);
  const blueprint: AgentBlueprint = JSON.parse(JSON.stringify(fixtureBlueprint), (_key, value) =>
    typeof value === 'string' && value.startsWith('opl-content://sha256/')
      ? (schemaRefs.has(value) ? schemaRef : textRef)
      : value);
  for (const key of Object.keys(blueprint.content_refs) as Array<keyof AgentBlueprint['content_refs']>) {
    blueprint.content_refs[key] = [...new Set(blueprint.content_refs[key])];
  }
  const operation = provider.operations.design;
  const sourceDigest = `sha256:${'a'.repeat(64)}`;
  const cursorBase: Omit<
    FoundryProviderOperationCursorV2,
    'operation_key' | 'activity_key'
  > = {
    surface_kind: 'opl_foundry_provider_operation_cursor',
    version: 'opl-foundry-provider-operation-cursor.v2',
    operation: 'design',
    provider_id: provider.provider_id,
    provider_manifest: provider,
    provider_manifest_digest: foundryContentDigest(provider),
    provider_source_digest: sourceDigest,
    checkout_root: omaFixtureRoot,
    required_stage_refs: [...operation.required_stage_refs],
    optional_stage_refs: [...operation.optional_stage_refs],
    terminal_stage_ref: operation.terminal_stage_ref,
    entry_workflow_id: 'workflow:design:entry',
    current_workflow_id: 'workflow:design:terminal',
    current_stage_id: operation.terminal_stage_ref,
    visited_path: operation.required_stage_refs.map((stageId) => ({
      workflow_id: `workflow:design:${stageId}`,
      stage_id: stageId,
    })),
    continuation: null,
    active_attempts: [],
    artifact_refs: [],
    artifact_hashes: [],
    status: 'terminal',
  };
  const bootstrapCursor: FoundryProviderOperationCursorV2 = {
    ...cursorBase,
    operation_key: 'bootstrap:design',
    activity_key: 'b'.repeat(64),
  };
  const runId = 'run:cordis-frozen-provider-replay';
  const bootstrapKernel = await createProductionFoundryKernel({
    provider_operation_cursor: bootstrapCursor,
  });
  await bootstrapKernel.startRun({ run_id: runId, request });
  const designing = await bootstrapKernel.advanceRunStep(runId);
  assert.equal(designing.run.state, 'designing');

  const advance = foundryAdvanceOperationForInspection(designing);
  const activityKey = sha256(canonicalJsonText({
    run_id: runId,
    iteration: 0,
    phase: 'design',
    input_digest: designing.run.request_digest,
  }));
  const cursor: FoundryProviderOperationCursorV2 = {
    ...cursorBase,
    operation_key: advance.operation_key,
    activity_key: activityKey,
  };
  const resultFile = path.join(
    foundryStoragePaths().root,
    'provider-results',
    `${activityKey}.json`,
  );
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, canonicalJsonBytes({
    surface_kind: 'opl_foundry_provider_operation_result',
    version: 'opl-foundry-provider-operation-result.v2',
    operation_key: advance.operation_key,
    operation: 'design',
    provider_id: provider.provider_id,
    provider_manifest_digest: cursor.provider_manifest_digest,
    provider_source_digest: sourceDigest,
    checkout_root: omaFixtureRoot,
    activity_key: activityKey,
    result_digest: foundryContentDigest(blueprint),
    result: blueprint,
  }), { flag: 'wx' });

  const environment = new MockActivityEnvironment({
    activityType: 'foundryAdvanceRunActivity',
    activityId: advance.operation_key,
    workflowExecution: {
      workflowId: 'workflow:cordis-frozen-provider-replay',
      runId: 'temporal-run:cordis-frozen-provider-replay',
    },
  });
  let evaluatedCandidate: string | null = null;
  const runtime = new FrozenPlanEvaluationRuntime({
    evaluator_id: 'evaluator:worker-wiring',
    executor: {
      executor_id: 'executor:worker-wiring',
      executionRef: () => 'execution:worker-wiring',
      async runPublicCase(input) {
        assert.equal(input.subject.kind, 'candidate');
        if (input.subject.kind === 'candidate') {
          evaluatedCandidate = input.subject.candidate.candidate_digest;
        }
        throw new Error('Fixture executor deliberately refuses domain qualification');
      },
      async runProtectedRequirement() { throw new Error('Unexpected protected execution'); },
      async observeResourceObservations() { throw new Error('Unexpected resource observation'); },
    },
    reviewer: {
      reviewer_id: 'reviewer:worker-wiring',
      async review() { throw new Error('Unexpected independent review'); },
    },
  });
  const activities: FoundryTemporalActivities = buildCordisTemporalActivities({
    trusted_evaluation_runtime: runtime,
  });
  type AdvanceActivity = FoundryTemporalActivities['foundryAdvanceRunActivity'];
  const result = await environment.run<
    Parameters<AdvanceActivity>,
    Awaited<ReturnType<AdvanceActivity>>,
    AdvanceActivity
  >(
    activities.foundryAdvanceRunActivity,
    { ...advance, provider_operation_cursor: cursor },
  );
  assert.equal(result.run.state, 'materializing');
  assert.equal(result.run.blueprint_digest, foundryContentDigest(blueprint));

  async function advanceWithCursor(inspection: typeof result) {
    const next = foundryAdvanceOperationForInspection(inspection);
    const nextEnvironment = new MockActivityEnvironment({
      activityType: 'foundryAdvanceRunActivity', activityId: next.operation_key,
    });
    return nextEnvironment.run<Parameters<AdvanceActivity>, Awaited<ReturnType<AdvanceActivity>>, AdvanceActivity>(activities.foundryAdvanceRunActivity, {
      ...next, provider_operation_cursor: cursor,
    });
  }
  const materialized = await advanceWithCursor(result);
  assert.equal(materialized.run.state, 'evaluating');
  const evaluated = await advanceWithCursor(materialized);
  assert.equal(evaluatedCandidate, materialized.run.candidate_digest);
  assert.equal(evaluated.run.state, 'failed');
  assert.equal(evaluated.run.evidence_digest, null);
  assert.equal(evaluated.run.version_digest, null);
  assert.equal(evaluated.run.candidate_digest, materialized.run.candidate_digest);
});

test('Cordis worker rejects a claimed qualification runtime without Framework provenance', async () => {
  const forged: EvaluationExecutor = {
    evaluator_id: 'evaluator:forged',
    qualification_capability: {
      status: 'qualification_grade',
      execution_mode: 'frozen_plan_evaluation_runtime.v1',
      protected_fact_authority: 'framework_owned_case_executor',
    },
    async evaluate() { throw new Error('Must not run'); },
    async canary() { throw new Error('Must not run'); },
  };
  const activities = buildCordisTemporalActivities({ trusted_evaluation_runtime: forged });
  await assert.rejects(activities.foundryFailRunActivity({
    run_id: 'run:forged', failure_code: 'test', failure_message: 'test',
  }), /Framework-owned FrozenPlan Evaluation Runtime/);
});
