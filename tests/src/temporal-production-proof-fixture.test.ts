import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { historyFromJSON } from '@temporalio/common/proto-utils';
import { readTemporalHistoryFixture } from './temporal-history-fixture.ts';

import { readTemporalStableCohort } from '../../src/adapters/integration/temporal-stable-cohort.ts';
import { buildTemporalStageAttemptReplayGateForTest } from '../../src/adapters/execution/family-runtime-temporal-provider.ts';
import { buildTemporalStageAttemptWorkerOptions } from '../../src/adapters/execution/family-runtime-temporal-provider-parts/workflow-bundle.ts';
import {
  syncTemporalProductionProbeAttemptProjection,
  temporalProductionProbeInput,
  temporalProductionTypedCloseoutPacket,
  temporalProductionWorkerRestartPlan,
} from '../../src/adapters/execution/family-runtime-temporal-provider-parts/production-proof.ts';
import {
  createStageAttempt,
  recordStageAttemptActivityHeartbeat,
} from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import type {
  TemporalStageAttemptWorkflowState,
} from '../../src/adapters/execution/family-runtime-temporal.ts';
import {
  completedTemporalObservation,
  withStageAttemptDb,
} from './family-runtime-temporal-terminal-sync-cases/helpers.ts';

test('Temporal production proof uses a generic example-domain fixture', () => {
  const closeout = temporalProductionTypedCloseoutPacket();
  const input = temporalProductionProbeInput('test', closeout);
  const serialized = JSON.stringify(input);

  assert.equal(input.domain_id, 'example-domain');
  assert.equal(closeout.next_owner, 'example-domain');
  assert.deepEqual(closeout.consumed_memory_refs, ['memory:example-domain-production-residency']);
  assert.doesNotMatch(serialized, /medauto|publication/i);
});

test('Temporal production proof materializes its worker workspace before dispatch', (t) => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-production-proof-test-'));
  t.after(() => fs.rmSync(testRoot, { recursive: true, force: true }));
  const workspaceRoot = path.join(testRoot, 'missing-workspace');

  assert.equal(fs.existsSync(workspaceRoot), false);

  const input = temporalProductionProbeInput('workspace', null, { workspaceRoot });
  const artifactRoot = path.join(workspaceRoot, 'artifacts');

  assert.deepEqual(input.workspace_locator, {
    workspace_root: workspaceRoot,
    artifact_root: artifactRoot,
  });
  assert.equal(fs.statSync(workspaceRoot).isDirectory(), true);
  assert.equal(fs.statSync(artifactRoot).isDirectory(), true);
});

test('Temporal production proof never races a KeepAlive supervisor with a manual worker start', () => {
  const supervised = temporalProductionWorkerRestartPlan(true);
  const manual = temporalProductionWorkerRestartPlan(false);

  assert.equal(supervised.restart_strategy, 'supervisor_keepalive_stop_only');
  assert.equal(supervised.manual_start_allowed, false);
  assert.ok(supervised.timeout_ms > 60_000);
  assert.equal(manual.restart_strategy, 'manual_stop_then_start');
  assert.equal(manual.manual_start_allowed, true);
  assert.equal(manual.timeout_ms, 30_000);
});

test('Temporal production proof persists terminal Attempt projection through the owner sync path', () => {
  withStageAttemptDb((db) => {
    const completedAttempt = createStageAttempt(db, {
      domainId: 'example-domain',
      stageId: 'production-residency-proof',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/opl-temporal-proof-completed' },
      sourceFingerprint: 'sha256:temporal-production-proof-completed',
      executorKind: 'codex_cli',
      checkpointRefs: ['checkpoint:temporal-production-proof-completed'],
    }).attempt;
    recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: completedAttempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_started',
      namespace: 'opl-foundry',
    });
    const completed = completedTemporalObservation({
      stageAttemptId: completedAttempt.stage_attempt_id,
      workflowId: completedAttempt.workflow_id,
      createdAt: completedAttempt.created_at,
      domainId: completedAttempt.domain_id,
      stageId: completedAttempt.stage_id,
      checkpointRef: 'checkpoint:temporal-production-proof-completed',
      nextOwner: completedAttempt.domain_id,
    }).query as unknown as TemporalStageAttemptWorkflowState;
    const completedProjection = syncTemporalProductionProbeAttemptProjection(db, completed);

    assert.equal(completedProjection.status, 'completed');
    assert.equal(completedProjection.provider_run.provider_status, 'completed');
    assert.equal(completedProjection.provider_run.namespace, 'opl-foundry');
    assert.equal(completedProjection.closeout_receipt_status, 'accepted_typed_closeout');
    assert.ok(completedProjection.closeout_refs.includes('receipt:domain-closeout'));

    const diagnosticAttempt = createStageAttempt(db, {
      domainId: 'example-domain',
      stageId: 'production-residency-proof',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/opl-temporal-proof-diagnostic' },
      sourceFingerprint: 'sha256:temporal-production-proof-diagnostic',
      executorKind: 'codex_cli',
      checkpointRefs: ['checkpoint:temporal-production-proof-diagnostic'],
    }).attempt;
    recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: diagnosticAttempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_started',
      namespace: 'opl-foundry',
    });
    const diagnosticRef = `opl://stage-attempts/${diagnosticAttempt.stage_attempt_id}/no-output-diagnostic`;
    const diagnosticBase = completedTemporalObservation({
      stageAttemptId: diagnosticAttempt.stage_attempt_id,
      workflowId: diagnosticAttempt.workflow_id,
      createdAt: diagnosticAttempt.created_at,
      domainId: diagnosticAttempt.domain_id,
      stageId: diagnosticAttempt.stage_id,
      checkpointRef: 'checkpoint:temporal-production-proof-diagnostic',
      nextOwner: diagnosticAttempt.domain_id,
    }).query;
    const diagnostic = {
      ...diagnosticBase,
      closeout_refs: [diagnosticRef],
      route_impact: {
        progression_effect: 'next_stage_may_start',
        quality_debt_refs: [diagnosticRef],
        no_output_diagnostic_ref: diagnosticRef,
      },
      closeout_packet: {
        surface_kind: 'temporal_domain_handler_dispatch_receipt',
        closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: [diagnosticRef],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: diagnosticAttempt.domain_id,
        domain_ready_verdict: null,
        route_impact: {
          progression_effect: 'next_stage_may_start',
          quality_debt_refs: [diagnosticRef],
          no_output_diagnostic_ref: diagnosticRef,
        },
        authority_boundary: {
          opl: 'provider_quality_debt_diagnostic_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    } as unknown as TemporalStageAttemptWorkflowState;
    const diagnosticProjection = syncTemporalProductionProbeAttemptProjection(db, diagnostic);

    assert.equal(diagnosticProjection.status, 'completed');
    assert.equal(diagnosticProjection.provider_run.namespace, 'opl-foundry');
    assert.equal(diagnosticProjection.closeout_receipt_status, 'accepted_typed_closeout');
    assert.ok(diagnosticProjection.closeout_refs.includes(diagnosticRef));
    assert.equal(diagnosticProjection.route_impact.no_output_diagnostic_ref, diagnosticRef);
  });
});

test('current workflow bundle replays every immutable stable-cohort history fixture', async () => {
  const cohort = readTemporalStableCohort();
  for (const [index, fixture] of cohort.replay.fixtures.entries()) {
    const { replayHistory } = readTemporalHistoryFixture(path.basename(fixture.path));
    const workflowId = `stable-cohort-replay-${index}`;
    const gate = await buildTemporalStageAttemptReplayGateForTest(replayHistory, workflowId);
    assert.equal(gate.replay_status, 'passed', fixture.path);
    assert.equal(gate.workflow_id, workflowId, fixture.path);
    assert.ok(gate.worker_options.workflowBundle && 'codePath' in gate.worker_options.workflowBundle);
  }
});

test('legacy fixture normalization does not relax the official JSON history parser', () => {
  const { history } = readTemporalHistoryFixture('stage-attempt-hard-stop-pre-runtime-evidence-v1.json');
  assert.throws(() => historyFromJSON(history), /Header: expected object/);
});

test('a new bundle preserves previous bytes even when the source version is unchanged', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-bundle-retention-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.symlinkSync(path.resolve(import.meta.dirname, '../../node_modules'), path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir');
  const workflowsPath = path.join(root, 'workflows.ts');
  const input = { paths: { root }, workflowsPath, activities: {}, sourceVersion: 'same-source-version' };
  fs.writeFileSync(workflowsPath, 'export async function RetainedWorkflow() { return 1; }\n');
  const previous = await buildTemporalStageAttemptWorkerOptions(input);
  const previousBytes = fs.readFileSync(previous.workflow_bundle.code_path);
  fs.writeFileSync(workflowsPath, 'export async function RetainedWorkflow() { return 2; }\n');
  const current = await buildTemporalStageAttemptWorkerOptions(input);

  assert.notEqual(current.workflow_bundle.code_path, previous.workflow_bundle.code_path);
  assert.notEqual(current.workflow_bundle.workflow_bundle_version, previous.workflow_bundle.workflow_bundle_version);
  assert.deepEqual(fs.readFileSync(previous.workflow_bundle.code_path), previousBytes);
  assert.equal(JSON.parse(fs.readFileSync(current.workflow_bundle.manifest_path, 'utf8')).code_path,
    current.workflow_bundle.code_path);
});

test('history replay fails closed when a recorded workflow type is not exported by the current bundle', async () => {
  const fixture = readTemporalStableCohort().replay.fixtures[0];
  const { replayHistory: history } = readTemporalHistoryFixture(path.basename(fixture.path));
  const started = history.events?.find((event) => event.workflowExecutionStartedEventAttributes)
    ?.workflowExecutionStartedEventAttributes;
  assert.ok(started?.workflowType);
  started.workflowType.name = 'RemovedStableCohortWorkflow';

  await assert.rejects(
    buildTemporalStageAttemptReplayGateForTest(history, 'stable-cohort-corrupt-workflow-type'),
  );
});
