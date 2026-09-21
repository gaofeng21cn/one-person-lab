import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { recoverStageRunCloseoutProjection } from '../../src/adapters/execution/family-runtime-stage-run-closeout-recovery.ts';
import { createStageAttempt, ingestStageAttemptCloseout, inspectStageAttempt, syncStageAttemptFromTemporalTerminalObservation } from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { createStageQualityCycle } from '../../src/adapters/execution/family-runtime-stage-quality-cycle.ts';
import { normalizeTypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import { requireTemporalStageRunRecoveryResume } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { createFamilyRuntimeQueueTables, registerStageRunLaunch, recordStageRunTemporalStart, recordStageRunClosed, scopedStageRunInput, temporalStartReceipt } from './family-runtime-stage-run-launch-cases/shared.ts';

for (const invalid of [null, 'human_gate', 'foreign_producer', 'later_attempt', 'changed_artifact', 'running_execution'] as const) {
  test(`provider-blocked review retries through its original producer: ${invalid ?? 'valid and idempotent'}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-retry-'));
    const previous = process.env.OPL_STATE_DIR;
    process.env.OPL_STATE_DIR = root;
    const db = new DatabaseSync(':memory:');
    try {
      createFamilyRuntimeQueueTables(db);
      const { input } = scopedStageRunInput(`sri_review_retry_${invalid ?? 'valid'}`);
      registerStageRunLaunch(db, input);
      const cycleId = `quality-cycle:${input.stage_run_id}`;
      createStageQualityCycle(db, { qualityCycleId: cycleId, stageRunId: input.stage_run_id,
        domainId: input.domain_id, stageId: input.stage_id, policy: input.quality_policy! });
      const create = (role: string) => {
        const created = createStageAttempt(db, { domainId: input.domain_id, stageId: input.stage_id,
          providerKind: 'temporal', workspaceLocator: input.workspace_locator, sourceFingerprint: role,
          stageRunId: input.stage_run_id, scopeKind: input.scope_kind, executionScope: input.execution_scope }).attempt;
        db.prepare('UPDATE stage_attempts SET attempt_role = ?, quality_cycle_id = ?, quality_round_index = 0, execution_session_ref = ? WHERE stage_attempt_id = ?')
          .run(role, cycleId, `codex://threads/${role}`, created.stage_attempt_id);
        return inspectStageAttempt(db, created.stage_attempt_id);
      };
      const producer = create('producer');
      const basePacket = { surface_kind: 'stage_attempt_closeout_packet', stage_run_id: input.stage_run_id,
        scope_digest: input.execution_scope!.scope_digest, consumed_refs: [], consumed_memory_refs: [],
        writeback_receipt_refs: [], rejected_writes: [], next_owner: null, domain_ready_verdict: null,
        authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' } };
      const producerPacket = normalizeTypedStageCloseoutPacket({
        ...basePacket, closeout_id: 'closeout:producer', stage_attempt_id: producer.stage_attempt_id,
        closeout_refs: input.artifact_refs,
        closeout_ref_metadata: [{ ref: input.artifact_refs![0], ref_kind: 'artifact', kind: 'stage_artifact', sha256: input.artifact_hashes![0] }],
        route_impact: { stage_quality_cycle: { artifact_refs: input.artifact_refs, artifact_hashes: input.artifact_hashes } },
      });
      const verifiedProducer = verifyStageQualityCloseoutArtifactIdentity({ closeoutPacket: producerPacket, attempt: producer, workspaceRoot: input.execution_scope!.workspace_root });
      ingestStageAttemptCloseout(db, { stageAttemptId: producer.stage_attempt_id, packet: verifiedProducer! });
      const reviewer = create('reviewer');
      const producerRef = `opl://stage_attempts/${producer.stage_attempt_id}`;
      db.prepare('UPDATE stage_attempts SET context_manifest_json = ?, parent_attempt_ref = ? WHERE stage_attempt_id = ?')
        .run(JSON.stringify({ artifact_producer_attempt_ref: producerRef }), producerRef, reviewer.stage_attempt_id);
      const blockedPacket = { ...basePacket, closeout_id: 'closeout:blocked-review', stage_attempt_id: reviewer.stage_attempt_id,
        activity_status: 'blocked', blocked_reason: 'codex_cli_provider_unavailable', closeout_refs: ['provider:quota'], closeout_ref_metadata: [],
        rejected_writes: [{ surface_kind: 'opl_provider_runtime_typed_blocker_ref', blocker_ref: 'provider:quota' }],
        authority_boundary: { ...basePacket.authority_boundary, provider_runtime_blocker_ref_only: true },
        route_impact: { hard_stop_class: invalid === 'human_gate' ? 'human_decision_required' : 'permission_or_credential_boundary' } };
      syncStageAttemptFromTemporalTerminalObservation(db, {
        surface_kind: 'temporal_stage_attempt_query_receipt', provider_kind: 'temporal',
        stage_attempt_id: reviewer.stage_attempt_id, workflow_id: reviewer.workflow_id, workflow_status: 'COMPLETED',
        query: { stage_attempt_id: reviewer.stage_attempt_id, workflow_id: reviewer.workflow_id,
          status: 'blocked', blocked_reason: 'codex_cli_provider_unavailable', closeout_packet: blockedPacket,
          closeout_refs: blockedPacket.closeout_refs, route_impact: blockedPacket.route_impact, rejected_writes: blockedPacket.rejected_writes },
      });
      if (invalid === 'foreign_producer') db.prepare("UPDATE stage_attempts SET stage_run_id = 'foreign' WHERE stage_attempt_id = ?").run(producer.stage_attempt_id);
      const state = { status: 'blocked', repair_rounds_used: 0, max_repair_rounds: 3, findings: [],
        controller_readback: { attempts: [{ stage_attempt_id: producer.stage_attempt_id }, { stage_attempt_id: invalid === 'later_attempt' ? 'newer' : reviewer.stage_attempt_id }], review_receipts: [] } };
      db.prepare('UPDATE stage_quality_cycles SET state_json = ? WHERE quality_cycle_id = ?').run(JSON.stringify(state), cycleId);
      recordStageRunTemporalStart(db, { stageRunId: input.stage_run_id, temporalStartReceipt: temporalStartReceipt(input, 'COMPLETED') });
      recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'blocked' });
      if (invalid === 'changed_artifact') fs.appendFileSync(new URL(input.artifact_refs![0]), 'changed');
      const before = JSON.stringify(inspectStageAttempt(db, reviewer.stage_attempt_id));
      let starts = 0;
      const options = { retryReviewer: true,
        describeWorkflow: async (workflow: any) => ({ ...temporalStartReceipt(workflow, invalid === 'running_execution' ? 'RUNNING' : 'COMPLETED'),
          workflow_found: true, ...(workflow.recovery_resume ? {
            first_execution_run_id: 'retry-run', recovery_id: workflow.recovery_resume.recovery_id,
          } : {}) }),
        startWorkflow: async (workflow: any) => {
        starts++;
        requireTemporalStageRunRecoveryResume(workflow);
        assert.equal(workflow.stage_run_id, input.stage_run_id);
        assert.equal(workflow.recovery_resume.repair_rounds_used, 0);
        assert.deepEqual(workflow.recovery_resume.prior_attempt_summaries.map((entry: any) => entry.attempt_role), ['producer', 'reviewer']);
        assert.equal(workflow.recovery_resume.prior_attempt_summaries.at(-1).status, 'blocked');
        assert.equal(workflow.recovery_resume.prior_attempt_summaries[0].stage_attempt_id, producer.stage_attempt_id);
        return { ...temporalStartReceipt(workflow), stage_run_id: workflow.stage_run_id, recovery_id: workflow.recovery_resume.recovery_id,
          recovery_run_id: 'retry-run', quality_cycle_id: cycleId, producer_attempt_ref: producerRef };
      } };
      const invoke = () => recoverStageRunCloseoutProjection(db, { stageRunId: input.stage_run_id, stageAttemptId: reviewer.stage_attempt_id }, options);
      if (invalid) {
        await assert.rejects(invoke, (error: any) => {
          if (invalid === 'changed_artifact') assert.equal(error.details.blocked_reason, 'artifact_byte_identity_mismatch');
          else if (invalid === 'running_execution') assert.equal(error.details.failure_code, 'stage_run_recovery_reviewer_retry_execution_not_terminal');
          else assert.equal(error.details.failure_code, invalid === 'foreign_producer'
            ? 'stage_run_recovery_reviewer_retry_lineage_invalid' : 'stage_run_recovery_reviewer_retry_not_admitted');
          return true;
        });
        assert.equal(starts, 0);
      }
      else {
        await assert.rejects(() => recoverStageRunCloseoutProjection(db, {
          stageRunId: input.stage_run_id, stageAttemptId: reviewer.stage_attempt_id,
        }, { startWorkflow: options.startWorkflow }), (error: any) => {
          assert.equal(error.details.failure_code, 'stage_run_recovery_reviewer_closeout_missing');
          assert.match(error.details.recovery_command, /--retry-reviewer$/);
          return true;
        });
        const result = await invoke();
        assert.equal(result.new_stage_run_created, false);
        assert.equal(result.quality_budget_consumed_by_recovery, false);
        assert.equal(result.reviewer_retry_requested, true);
        await invoke();
        assert.equal(starts, 1);
      }
      assert.equal(JSON.stringify(inspectStageAttempt(db, reviewer.stage_attempt_id)), before);
    } finally {
      db.close();
      if (previous === undefined) delete process.env.OPL_STATE_DIR; else process.env.OPL_STATE_DIR = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
