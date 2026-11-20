import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { recoverStageRunCloseoutProjection } from '../../src/adapters/execution/family-runtime-stage-run-closeout-recovery.ts';
import { createStageAttempt, ingestStageAttemptCloseout, inspectStageAttempt, listStageAttemptCloseouts, materializePersistedStageReviewReceipt } from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { createStageQualityCycle } from '../../src/adapters/execution/family-runtime-stage-quality-cycle.ts';
import { normalizeTypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import { persistRawStageOutput } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';
import { requireTemporalStageRunRecoveryResume } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { deriveNormalizedStageQualityCloseout } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-derivation.ts';
import { createFamilyRuntimeQueueTables, recordStageRunClosed, recordStageRunTemporalStart, registerStageRunLaunch, scopedStageRunInput, temporalStartReceipt } from './family-runtime-stage-run-launch-cases/shared.ts';
import { buildStageReviewContextManifest } from '../../src/authority/stages/index.ts';
import { buildStageQualityContextManifestRef, buildStageReviewInputSnapshotContext } from '../../src/adapters/execution/family-runtime-stage-quality-context-manifest.ts';
import { resolveReviewerInputSnapshotMaterialization } from '../../src/adapters/execution/family-runtime-reviewer-input-snapshot.ts';

async function runRepairerRecoveryScenario(declaredReceiptRefs: 'omit' | 'empty') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl49-recovery-test-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const { input } = scopedStageRunInput('sri_p49_recovery_test');
    registerStageRunLaunch(db, input);
    const cycleId = `quality-cycle:${input.stage_run_id}`;
    createStageQualityCycle(db, { qualityCycleId: cycleId, stageRunId: input.stage_run_id, domainId: input.domain_id, stageId: input.stage_id, policy: input.quality_policy! });
    const create = (role: 'producer' | 'reviewer' | 'repairer', round: number, parentAttemptRef?: string, artifactProducerAttemptRef?: string) => {
      const artifactRefs = role === 'producer' ? [] : input.artifact_refs!;
      const artifactHashes = role === 'producer' ? [] : input.artifact_hashes!;
      const priorFindingRefs = role === 'repairer' ? ['F1'] : [];
      const contextManifest = role === 'reviewer'
        ? {
            ...buildStageReviewContextManifest({
              stageRunId: input.stage_run_id,
              qualityCycleId: cycleId,
              reviewerAttemptRole: role,
              stageGoalRefs: input.stage_goal_refs,
              artifactRefs,
              artifactHashes,
              sourceRefs: input.source_refs,
              qualityRubricRefs: input.quality_rubric_refs,
              knowledgeRefs: input.knowledge_refs,
              skillRefs: input.skill_refs,
              policyRefs: input.policy_refs,
              lineageRefs: input.lineage_refs,
            }),
            ...buildStageReviewInputSnapshotContext({
              stageRunId: input.stage_run_id,
              qualityCycleId: cycleId,
              reviewerAttemptRole: role,
              resolution: resolveReviewerInputSnapshotMaterialization(null),
            }),
            artifact_producer_attempt_ref: parentAttemptRef,
          }
        : {
            surface_kind: 'opl_stage_quality_attempt_context_manifest',
            version: 'stage-quality-attempt-context-manifest.v1',
            stage_run_id: input.stage_run_id,
            quality_cycle_id: cycleId,
            attempt_role: role,
            stage_goal_refs: input.stage_goal_refs,
            source_refs: input.source_refs,
            quality_rubric_refs: input.quality_rubric_refs,
            knowledge_refs: input.knowledge_refs,
            skill_refs: input.skill_refs,
            policy_refs: input.policy_refs,
            lineage_refs: input.lineage_refs,
            ...(artifactProducerAttemptRef ? { artifact_producer_attempt_ref: artifactProducerAttemptRef } : {}),
            artifact_refs: artifactRefs,
            artifact_hashes: artifactHashes,
            prior_finding_refs: priorFindingRefs,
            repair_map_refs: [],
            no_context_inheritance: true,
          };
      const created = createStageAttempt(db, {
        domainId: input.domain_id, stageId: input.stage_id, providerKind: 'temporal',
        workspaceLocator: input.workspace_locator, sourceFingerprint: `${role}-p49-recovery-test`,
        stageRunId: input.stage_run_id, qualityCycleId: cycleId, scopeKind: input.scope_kind,
        executionScope: input.execution_scope, attemptRole: role, qualityRoundIndex: round,
        parentAttemptRef, inputArtifactRefs: artifactRefs, reviewedArtifactHashes: artifactHashes,
        qualityStageGoalRefs: input.stage_goal_refs, qualitySourceRefs: input.source_refs,
        qualityKnowledgeRefs: input.knowledge_refs, qualitySkillRefs: input.skill_refs,
        qualityPolicyRefs: input.policy_refs, qualityLineageRefs: input.lineage_refs,
        qualityRubricRefs: input.quality_rubric_refs, priorFindingRefs,
        qualityRolePromptRef: `prompt:${role}`, noContextInheritance: true,
        contextManifest, contextManifestRef: buildStageQualityContextManifestRef(contextManifest),
        newAttempt: true,
      }).attempt;
      db.prepare('UPDATE stage_attempts SET execution_session_ref = ? WHERE stage_attempt_id = ?')
        .run(`codex://threads/${role}`, created.stage_attempt_id);
      return inspectStageAttempt(db, created.stage_attempt_id);
    };
    const basePacket = { surface_kind: 'stage_attempt_closeout_packet', stage_run_id: input.stage_run_id, scope_digest: input.execution_scope!.scope_digest, consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [], next_owner: null, domain_ready_verdict: null, authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' } };
    const artifactPath = new URL(input.artifact_refs![0]!);
    const findings = [
      { finding_id: 'F1', severity: 'critical' as const, required: true, evidence_refs: ['evidence:F1'], repair_expectation: 'Repair the artifact.' },
      { finding_id: 'F2', severity: 'minor' as const, required: false, evidence_refs: ['evidence:F2'], repair_expectation: 'Observe F2.' },
    ];
    const producer = create('producer', 0);
    const producerPacket = normalizeTypedStageCloseoutPacket({ ...basePacket, closeout_id: 'closeout:producer-p49-test', stage_attempt_id: producer.stage_attempt_id, closeout_refs: input.artifact_refs, closeout_ref_metadata: [{ ref: input.artifact_refs![0], ref_kind: 'artifact', kind: 'stage_artifact', sha256: input.artifact_hashes![0] }], route_impact: { stage_quality_cycle: { artifact_refs: input.artifact_refs, artifact_hashes: input.artifact_hashes } } });
    const verifiedProducer: any = verifyStageQualityCloseoutArtifactIdentity({ closeoutPacket: producerPacket, attempt: producer, workspaceRoot: input.execution_scope!.workspace_root })!;
    const producerReceiptRefs = verifiedProducer.closeout_ref_metadata.map((e: any) => e.artifact_identity_receipt_ref);
    ingestStageAttemptCloseout(db, { stageAttemptId: producer.stage_attempt_id, packet: { ...verifiedProducer, route_impact: { ...verifiedProducer.route_impact, stage_quality_cycle: { ...verifiedProducer.route_impact.stage_quality_cycle, artifact_hashes: input.artifact_hashes, artifact_identity_receipt_refs: producerReceiptRefs } } } });
    const producerRef = `opl://stage_attempts/${producer.stage_attempt_id}`;
    const reviewer = create('reviewer', 0, producerRef);
    const reviewerRef = `opl://stage_attempts/${reviewer.stage_attempt_id}`;
    db.prepare("UPDATE stage_attempts SET status = 'completed', route_impact_json = ? WHERE stage_attempt_id = ?")
      .run(JSON.stringify({ stage_quality_cycle: { outcome: 'repair_required', findings } }), reviewer.stage_attempt_id);
    const repairedBytes = `${fs.readFileSync(artifactPath, 'utf8')}{"repaired":true}\n`;
    const repairedArtifactPath = path.join(path.dirname(fileURLToPath(artifactPath)), 'repaired-closeout.json');
    fs.writeFileSync(repairedArtifactPath, repairedBytes);
    const repairedArtifactRefs = [pathToFileURL(repairedArtifactPath).href];
    const repairedHash = `sha256:${crypto.createHash('sha256').update(repairedBytes).digest('hex')}`;
    const repairer = create('repairer', 1, reviewerRef, producerRef);
    persistRawStageOutput({ attempt: inspectStageAttempt(db, repairer.stage_attempt_id), content: JSON.stringify({ closeout_packet_sha256: 'a'.repeat(64) }) });
    const repairEntry = (id: string) => ({ finding_id: id, repair_status: 'repaired', changed_artifact_refs: repairedArtifactRefs, repair_evidence_refs: [`evidence:repair:${id}`] });
    const originalRepairerPacket = normalizeTypedStageCloseoutPacket({ ...basePacket, closeout_id: 'closeout_zzzzzzzzzzzzzzzzzzzzzzzz', stage_attempt_id: repairer.stage_attempt_id, closeout_refs: repairedArtifactRefs, closeout_ref_metadata: [{ ref: repairedArtifactRefs[0], ref_kind: 'artifact', kind: 'stage_artifact', sha256: repairedHash }], route_impact: { stage_quality_cycle: { artifact_refs: repairedArtifactRefs, artifact_hashes: [repairedHash], findings, repair_map: findings.map((f) => repairEntry(f.finding_id)) } } });
    const verifiedRepairer: any = verifyStageQualityCloseoutArtifactIdentity({ closeoutPacket: originalRepairerPacket, attempt: inspectStageAttempt(db, repairer.stage_attempt_id), workspaceRoot: input.execution_scope!.workspace_root })!;
    const repairerReceiptRefs = verifiedRepairer.closeout_ref_metadata.map((e: any) => e.artifact_identity_receipt_ref);
    // Transport verification canonicalizes the OPL-owned receipt list; the
    // model's declared value never survives. To exercise the derivation-time
    // fill for the two declared shapes a model could emit, strip the canonical
    // list back to the declared shape before derivation.
    if (declaredReceiptRefs === 'empty') {
      (verifiedRepairer.route_impact as any).stage_quality_cycle.artifact_identity_receipt_refs = [];
    } else {
      delete (verifiedRepairer.route_impact as any).stage_quality_cycle.artifact_identity_receipt_refs;
    }
    const normalized = deriveNormalizedStageQualityCloseout({
      // The production runner has verified metadata receipts at derivation time;
      // it does not pre-fill the quality-envelope receipt list for recovery.
      closeoutPacket: verifiedRepairer,
      attempt: inspectStageAttempt(db, repairer.stage_attempt_id),
    })!;
    const derived = normalized.derivedCloseout;
    assert.deepEqual(
      (derived.route_impact!.stage_quality_cycle as any).artifact_identity_receipt_refs,
      repairerReceiptRefs,
      'the derived child always carries the canonical metadata-derived receipt list',
    );
    assert.deepEqual(
      ((derived.closeout_normalization as any).original_closeout_packet.route_impact.stage_quality_cycle as any)
        .artifact_identity_receipt_refs,
      declaredReceiptRefs === 'empty' ? [] : undefined,
      'the embedded original audit parent preserves the exact declared shape',
    );
    ingestStageAttemptCloseout(db, { stageAttemptId: repairer.stage_attempt_id, packet: derived });
    const receipt = materializePersistedStageReviewReceipt(db, {
      producerAttemptId: producer.stage_attempt_id,
      reviewerAttemptId: reviewer.stage_attempt_id,
      rubricRefs: input.quality_rubric_refs,
      verdict: 'repair_required',
    });
    const state = { status: 'running', repair_rounds_used: 1, max_repair_rounds: 3, findings, controller_readback: { attempts: [producer, reviewer, repairer].map((a) => ({ stage_attempt_id: a.stage_attempt_id })), review_receipts: [receipt] } };
    db.prepare('UPDATE stage_quality_cycles SET state_json = ? WHERE quality_cycle_id = ?').run(JSON.stringify(state), cycleId);
    db.prepare('UPDATE stage_attempt_closeouts SET created_at = ? WHERE stage_attempt_id = ?')
      .run('2026-11-20T00:00:00.000Z', repairer.stage_attempt_id);
    assert.ok(String(normalized.originalCloseout.closeout_id) > String(derived.closeout_id));
    recordStageRunTemporalStart(db, { stageRunId: input.stage_run_id, temporalStartReceipt: temporalStartReceipt(input, 'COMPLETED') });
    recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'failed' });
    let started: any = null;
    const options = { startWorkflow: async (workflow: any) => {
      requireTemporalStageRunRecoveryResume(workflow);
      started = workflow;
      return {
        ...temporalStartReceipt(workflow),
        stage_run_id: input.stage_run_id,
        workflow_id: input.workflow_id,
        quality_cycle_id: cycleId,
        producer_attempt_ref: `opl://stage_attempts/${repairer.stage_attempt_id}`,
        recovery_id: workflow.recovery_resume.recovery_id,
        recovery_run_id: 'recovery-run:p49-test',
      };
    } };
    await recoverStageRunCloseoutProjection(db, { stageRunId: input.stage_run_id, stageAttemptId: repairer.stage_attempt_id }, options as any);
    assert.equal(Boolean(started), true);
    const closeouts = listStageAttemptCloseouts(db, repairer.stage_attempt_id);
    assert.equal(closeouts.length, 2);
    assert.equal(closeouts[0]?.closeout_id, normalized.originalCloseout.closeout_id);
    assert.equal(closeouts[1]?.closeout_id, derived.closeout_id);
    assert.deepEqual(closeouts[1]?.packet, derived);
    const recoveredAttempt = inspectStageAttempt(db, repairer.stage_attempt_id);
    const recoveredQuality = recoveredAttempt.route_impact.stage_quality_cycle as any;
    assert.deepEqual(recoveredQuality.repair_map, [repairEntry('F1')]);
    assert.deepEqual(recoveredQuality.repair_observations, [repairEntry('F2')]);
    assert.deepEqual(recoveredQuality.artifact_identity_receipt_refs, repairerReceiptRefs);
    assert.deepEqual(recoveredAttempt.route_impact, {
      ...derived.route_impact,
      next_owner: derived.next_owner,
      domain_ready_verdict: derived.domain_ready_verdict,
    });
  } finally {
    db.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR; else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('recovery preserves a successfully normalized repairer closeout and its canonical lineage', () =>
  runRepairerRecoveryScenario('omit'));

test('recovery of a derived closeout whose runner envelope declares an empty receipt-ref list', () =>
  runRepairerRecoveryScenario('empty'));
