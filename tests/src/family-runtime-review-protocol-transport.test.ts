import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MockActivityEnvironment } from '@temporalio/testing';
import { domainHandlerDispatchActivity, stageQualityAttemptSyncActivity } from '../../src/adapters/execution/family-runtime-temporal-activities.ts';
import { openQueueDb } from '../../src/adapters/execution/family-runtime-store.ts';
import { createPersistedTemporalStageAttemptInput } from './family-runtime-temporal-provider-cases/persisted-attempt.ts';
import type { TemporalStageAttemptWorkflowState } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { persistRawStageOutput } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';
import { buildRawArtifactProgressCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';

test('verified raw producer identity survives real dispatch without becoming a semantic verdict', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-raw-dispatch-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  t.after(() => { if (previous === undefined) delete process.env.OPL_STATE_DIR; else process.env.OPL_STATE_DIR = previous; fs.rmSync(root, {recursive:true,force:true}); });
  const input = createPersistedTemporalStageAttemptInput({fixtureId:'raw-dispatch'});
  input.attempt_role = 'producer';
  const {db} = openQueueDb();
  db.prepare('UPDATE stage_attempts SET attempt_role = ? WHERE stage_attempt_id = ?').run('producer',input.stage_attempt_id);
  db.close();
  const attempt = input as unknown as Record<string, unknown>;
  const raw = persistRawStageOutput({attempt,content:'{"summary":"Original incomplete closeout"}'})!;
  const packet = buildRawArtifactProgressCloseoutPacket({attempt,stagePacketRef:input.stage_packet_ref!,rawArtifact:raw,normalizationFindings:['typed_closeout_not_required_raw_artifact_advanced']});
  input.closeout_packet = verifyStageQualityCloseoutArtifactIdentity({closeoutPacket:packet,attempt,workspaceRoot:root});
  const environment = new MockActivityEnvironment({activityType:'domainHandlerDispatchActivity',activityId:'raw-dispatch',workflowExecution:{workflowId:input.workflow_id,runId:'raw-dispatch-run'}});
  const dispatch = await environment.run(domainHandlerDispatchActivity,input) as Awaited<ReturnType<typeof domainHandlerDispatchActivity>>;
  assert.equal(dispatch.authority_boundary.opl,'raw_executor_output_progress_envelope_only');
  assert.deepEqual(dispatch.closeout_refs,[raw.output_ref]);
  assert.ok('closeout_ref_metadata' in dispatch);
  assert.deepEqual(dispatch.closeout_ref_metadata,input.closeout_packet!.closeout_ref_metadata);
  assert.equal((dispatch.route_impact as Record<string, unknown>).stage_quality_cycle,undefined);
  assert.equal(dispatch.domain_ready_verdict,'completed_with_quality_debt');
  const state = {...input,status:'completed',closeout_packet:dispatch,activity_events:[],closeout_refs:dispatch.closeout_refs,
    route_impact:dispatch.route_impact,completion_boundary:{provider_completion:'completed',domain_ready_verdict:null,provider_completion_is_domain_ready:false}} as unknown as TemporalStageAttemptWorkflowState;
  await stageQualityAttemptSyncActivity({attempt_ref:`opl://stage_attempts/${input.stage_attempt_id}`,workflow_state:state});
  const persisted = openQueueDb();
  try { assert.equal((persisted.db.prepare('SELECT status FROM stage_attempts WHERE stage_attempt_id = ?').get(input.stage_attempt_id) as {status:string}).status,'completed'); }
  finally { persisted.db.close(); }
  const corrupted = structuredClone(packet);
  corrupted.closeout_ref_metadata![0]!.sha256 = '0'.repeat(64);
  assert.throws(() => verifyStageQualityCloseoutArtifactIdentity({closeoutPacket:corrupted,attempt,workspaceRoot:root}));
});

for (const role of ['reviewer', 're_reviewer'] as const) {
  for (const withCloseout of [false, true, 'completed-missing', 'failed'] as const) {
    test(`${role} runtime protocol blocker survives real dispatch and terminal ledger sync (${withCloseout})`, async (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-protocol-'));
      const previousState = process.env.OPL_STATE_DIR;
      process.env.OPL_STATE_DIR = root;
      t.after(() => {
        if (previousState === undefined) delete process.env.OPL_STATE_DIR;
        else process.env.OPL_STATE_DIR = previousState;
        fs.rmSync(root, { recursive: true, force: true });
      });
      const input = createPersistedTemporalStageAttemptInput({ fixtureId: `${role}-${withCloseout}` });
      // Seed a role on the persisted fixture identity to test transport, without invoking a model or review authority.
      const { db } = openQueueDb();
      db.prepare('UPDATE stage_attempts SET attempt_role = ?, status = ? WHERE stage_attempt_id = ?')
        .run(role, 'running', input.stage_attempt_id);
      db.close();
      input.attempt_role = role;
      const reason = 'stage_quality_review_outcome_missing';
      input.provider_blocker = { blocked_reason: reason, route_impact: {} };
      if (withCloseout === true) input.closeout_packet = {
        surface_kind: 'stage_attempt_closeout_packet', closeout_refs: ['diagnostic:review'],
        route_impact: { provider_blocker_reason: reason },
        authority_boundary: { opl: 'provider_runtime_closeout_transport_only' },
        consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
      };
      const environment = new MockActivityEnvironment({
        activityType: 'domainHandlerDispatchActivity', activityId: 'review-protocol',
        workflowExecution: { workflowId: input.workflow_id, runId: 'review-protocol-run' },
      });
      const dispatch = await environment.run(domainHandlerDispatchActivity, input) as Awaited<ReturnType<typeof domainHandlerDispatchActivity>>;
      assert.equal(dispatch.activity_status, 'blocked');
      assert.ok('blocked_reason' in dispatch);
      assert.equal(dispatch.blocked_reason, reason);
      assert.equal(dispatch.domain_ready_verdict, null);
      assert.equal((dispatch.route_impact as Record<string, unknown>).stage_quality_cycle, undefined);
      const state = {
        ...input, status: withCloseout === 'completed-missing' ? 'completed' : withCloseout === 'failed' ? 'failed' : 'blocked',
        closeout_packet: withCloseout === 'completed-missing' ? { route_impact: {} } : dispatch, activity_events: [],
        closeout_refs: dispatch.closeout_refs, route_impact: dispatch.route_impact,
        completion_boundary: { provider_completion: 'not_completed', domain_ready_verdict: null, provider_completion_is_domain_ready: false },
      } as unknown as TemporalStageAttemptWorkflowState;
      await stageQualityAttemptSyncActivity({ attempt_ref: `opl://stage_attempts/${input.stage_attempt_id}`, workflow_state: state });
      const read = openQueueDb();
      try {
        const row = read.db.prepare('SELECT status, blocked_reason, provider_run_json FROM stage_attempts WHERE stage_attempt_id = ?')
          .get(input.stage_attempt_id) as { status: string; blocked_reason: string; provider_run_json: string };
        assert.equal(row.status, withCloseout === 'failed' ? 'failed' : 'blocked');
        assert.equal(row.blocked_reason, withCloseout === 'failed' ? 'temporal_stage_attempt_query_failed' : reason);
        assert.equal(JSON.parse(row.provider_run_json).terminal_observation.query_status, state.status);
      } finally { read.db.close(); }
    });
  }
}
