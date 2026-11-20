import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import { recoverStageRunCloseoutProjection } from '../../src/adapters/execution/family-runtime-stage-run-closeout-recovery.ts';
import {
  createStageAttempt,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
} from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { createStageQualityCycle } from '../../src/adapters/execution/family-runtime-stage-quality-cycle.ts';
import { normalizeTypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import { persistRawStageOutput } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';
import { requireTemporalStageRunRecoveryResume } from '../../src/adapters/execution/family-runtime-temporal.ts';
import {
  createFamilyRuntimeQueueTables,
  recordStageRunClosed,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
  scopedStageRunInput,
  temporalStartReceipt,
} from './family-runtime-stage-run-launch-cases/shared.ts';

for (const invalid of ['missing_receipt', 'mismatched_receipt', 'ambiguous_receipt', 'missing_producer_summary'] as const) {
  test(`recoverStageRunCloseoutProjection rejects ${invalid} without selecting repairer bytes`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-repairer-recovery-lineage-'));
    const previousStateDir = process.env.OPL_STATE_DIR;
    process.env.OPL_STATE_DIR = root;
    const db = new DatabaseSync(':memory:');
    try {
      createFamilyRuntimeQueueTables(db);
      const { input } = scopedStageRunInput(`sri_repairer_lineage_${invalid}`);
      registerStageRunLaunch(db, input);
      const cycleId = `quality-cycle:${input.stage_run_id}`;
      createStageQualityCycle(db, {
        qualityCycleId: cycleId,
        stageRunId: input.stage_run_id,
        domainId: input.domain_id,
        stageId: input.stage_id,
        policy: input.quality_policy!,
      });
      const create = (role: 'producer' | 'reviewer' | 'repairer', round: number) => {
        const created = createStageAttempt(db, {
          domainId: input.domain_id,
          stageId: input.stage_id,
          providerKind: 'temporal',
          workspaceLocator: input.workspace_locator,
          sourceFingerprint: `${role}-recovery-lineage`,
          stageRunId: input.stage_run_id,
          scopeKind: input.scope_kind,
          executionScope: input.execution_scope,
        }).attempt;
        db.prepare(`UPDATE stage_attempts
          SET attempt_role = ?, quality_cycle_id = ?, quality_round_index = ?, execution_session_ref = ?
          WHERE stage_attempt_id = ?`).run(
          role,
          cycleId,
          round,
          `codex://threads/${role}`,
          created.stage_attempt_id,
        );
        return inspectStageAttempt(db, created.stage_attempt_id);
      };
      const basePacket = {
        surface_kind: 'stage_attempt_closeout_packet',
        stage_run_id: input.stage_run_id,
        scope_digest: input.execution_scope!.scope_digest,
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: null,
        domain_ready_verdict: null,
        authority_boundary: {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
      const artifactPath = new URL(input.artifact_refs![0]!);
      const producer = create('producer', 0);
      const producerPacket = normalizeTypedStageCloseoutPacket({
        ...basePacket,
        closeout_id: 'closeout:producer-lineage',
        stage_attempt_id: producer.stage_attempt_id,
        closeout_refs: input.artifact_refs,
        closeout_ref_metadata: [{
          ref: input.artifact_refs![0],
          ref_kind: 'artifact',
          kind: 'stage_artifact',
          sha256: input.artifact_hashes![0],
        }],
        route_impact: {
          stage_quality_cycle: {
            artifact_refs: input.artifact_refs,
            artifact_hashes: input.artifact_hashes,
          },
        },
      });
      const verifiedProducer: any = verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: producerPacket,
        attempt: producer,
        workspaceRoot: input.execution_scope!.workspace_root,
      })!;
      const producerReceiptRefs = verifiedProducer.closeout_ref_metadata
        .map((entry: any) => entry.artifact_identity_receipt_ref);
      ingestStageAttemptCloseout(db, {
        stageAttemptId: producer.stage_attempt_id,
        packet: {
          ...verifiedProducer,
          route_impact: {
            ...verifiedProducer.route_impact,
            stage_quality_cycle: {
              ...verifiedProducer.route_impact.stage_quality_cycle,
              artifact_identity_receipt_refs: producerReceiptRefs,
            },
          },
        },
      });
      const producerRef = `opl://stage_attempts/${producer.stage_attempt_id}`;
      const reviewer = create('reviewer', 0);
      const reviewerRef = `opl://stage_attempts/${reviewer.stage_attempt_id}`;
      db.prepare(`UPDATE stage_attempts
        SET context_manifest_json = ?, parent_attempt_ref = ?, status = 'completed'
        WHERE stage_attempt_id = ?`).run(
        JSON.stringify({ artifact_producer_attempt_ref: producerRef }),
        producerRef,
        reviewer.stage_attempt_id,
      );
      const repairedBytes = `${fs.readFileSync(artifactPath, 'utf8')}{"repaired":true}\n`;
      fs.writeFileSync(artifactPath, repairedBytes);
      const repairedHash = `sha256:${crypto.createHash('sha256').update(repairedBytes).digest('hex')}`;
      const repairer = create('repairer', 1);
      db.prepare(`UPDATE stage_attempts
        SET context_manifest_json = ?, parent_attempt_ref = ? WHERE stage_attempt_id = ?`).run(
        JSON.stringify({ artifact_producer_attempt_ref: producerRef }),
        reviewerRef,
        repairer.stage_attempt_id,
      );
      const repairerAttempt = inspectStageAttempt(db, repairer.stage_attempt_id);
      persistRawStageOutput({
        attempt: repairerAttempt,
        content: JSON.stringify({ closeout_packet_sha256: 'a'.repeat(64) }),
      });
      const findings = [{
        finding_id: 'F1',
        severity: 'critical' as const,
        required: true,
        evidence_refs: ['evidence:F1'],
        repair_expectation: 'Repair the artifact.',
      }];
      const repairerPacket = normalizeTypedStageCloseoutPacket({
        ...basePacket,
        closeout_id: 'closeout:repairer-lineage',
        stage_attempt_id: repairer.stage_attempt_id,
        closeout_refs: input.artifact_refs,
        closeout_ref_metadata: [{
          ref: input.artifact_refs![0],
          ref_kind: 'artifact',
          kind: 'stage_artifact',
          sha256: repairedHash,
        }],
        route_impact: {
          stage_quality_cycle: {
            artifact_refs: input.artifact_refs,
            artifact_hashes: [repairedHash],
            findings,
            repair_map: [{
              finding_id: 'F1',
              repair_status: 'repaired',
              changed_artifact_refs: input.artifact_refs,
              repair_evidence_refs: ['evidence:repair'],
            }],
          },
        },
      });
      const verifiedRepairer = verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: repairerPacket,
        attempt: inspectStageAttempt(db, repairer.stage_attempt_id),
        workspaceRoot: input.execution_scope!.workspace_root,
      })!;
      ingestStageAttemptCloseout(db, {
        stageAttemptId: repairer.stage_attempt_id,
        packet: verifiedRepairer,
      });
      const receipt: any = {
        surface_kind: 'opl_stage_review_receipt',
        version: 'stage-review-receipt.v1',
        stage_run_id: input.stage_run_id,
        quality_cycle_id: cycleId,
        producer_attempt_ref: producerRef,
        reviewer_attempt_ref: reviewerRef,
        producer_session_ref: producer.execution_session_ref,
        reviewer_session_ref: reviewer.execution_session_ref,
        no_context_inheritance: true,
        reviewed_artifact_refs: input.artifact_refs,
        reviewed_artifact_hashes: input.artifact_hashes,
        rubric_refs: input.quality_rubric_refs,
        verdict: 'repair_required',
        review_input_snapshot_status: 'quality_debt',
        review_input_snapshot_binding: null,
        opl_reviewer_input_snapshot_manifest_ref: null,
        opl_reviewer_input_snapshot_manifest: null,
        review_input_snapshot_quality_debt_receipt_ref: 'snapshot-debt:F1',
        review_input_snapshot_quality_debt_receipt: { stage_transition_allowed: true },
        opl_review_evidence_artifact_receipt_ref: null,
        opl_review_evidence_artifact_receipt: null,
        finding_lineage: {
          review_kind: 'initial_review',
          finding_ids: ['F1'],
          findings_sha256: `sha256:${crypto.createHash('sha256').update(canonicalJsonText(findings)).digest('hex')}`,
          repair_map_sha256: null,
          re_review_result_sha256: null,
        },
      };
      if (invalid === 'mismatched_receipt') receipt.reviewed_artifact_hashes = [repairedHash];
      const receipts = invalid === 'missing_receipt'
        ? []
        : invalid === 'ambiguous_receipt'
          ? [receipt, structuredClone(receipt)]
          : [receipt];
      const state = {
        status: 'running',
        repair_rounds_used: 1,
        max_repair_rounds: 3,
        findings,
        controller_readback: {
          attempts: (invalid === 'missing_producer_summary'
            ? [reviewer, repairer]
            : [producer, reviewer, repairer]
          ).map((attempt) => ({
            stage_attempt_id: attempt.stage_attempt_id,
          })),
          review_receipts: receipts,
        },
      };
      db.prepare('UPDATE stage_quality_cycles SET state_json = ? WHERE quality_cycle_id = ?')
        .run(JSON.stringify(state), cycleId);
      recordStageRunTemporalStart(db, {
        stageRunId: input.stage_run_id,
        temporalStartReceipt: temporalStartReceipt(input, 'COMPLETED'),
      });
      recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'failed' });
      let started: any = null;
      const options = {
        startWorkflow: async (workflow: any) => {
          requireTemporalStageRunRecoveryResume(workflow);
          started = workflow;
          return {
            ...temporalStartReceipt(workflow),
            recovery_id: workflow.recovery_resume.recovery_id,
            recovery_run_id: 'recovery-run:repairer-lineage',
          };
        },
      };
      const invoke = () => recoverStageRunCloseoutProjection(db, {
        stageRunId: input.stage_run_id,
        stageAttemptId: repairer.stage_attempt_id,
      }, options);
      await assert.rejects(invoke, (error: any) => {
        assert.equal(error.name, 'FrameworkContractError');
        assert.equal(error.details.failure_code, 'stage_run_recovery_previous_reviewed_lineage_invalid');
        return true;
      });
      assert.equal(started, null);
    } finally {
      db.close();
      if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
      else process.env.OPL_STATE_DIR = previousStateDir;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
