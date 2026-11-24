import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assert, test, binding, packageUseBinding, domainPackRoot,
  scopedStageRunInput, registerStageRunInConfiguredState,
  stageQualityAttemptMaterializeActivity,
} from './family-runtime-stage-run-launch-cases/shared.ts';
import { openQueueDb } from '../../src/adapters/execution/family-runtime-store.ts';
import {
  ingestStageAttemptCloseout,
  inspectStageAttempt,
} from '../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner/artifact-identity-verification.ts';
import { deriveNormalizedStageQualityCloseout } from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-derivation.ts';
import { revalidateStageRunImmutableSpecContent } from '../../src/adapters/execution/family-runtime-stage-run-identity.ts';
import { stageQualityCycleProjectActivity } from '../../src/adapters/execution/family-runtime-temporal-activities.ts';

function digest(bytes: string) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function ingest(stageAttemptId: string, packet: unknown) {
  const { db } = openQueueDb();
  try {
    ingestStageAttemptCloseout(db, { stageAttemptId, packet: packet as Record<string, unknown> });
  } finally {
    db.close();
  }
}

test('real re-review materialization reads derived map, exact observations and original lineage', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-derived-re-review-materialization-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const { input: stageRun, scope } = scopedStageRunInput('sri_derived_re_review_materialization');
    registerStageRunInConfiguredState(stageRun);
    const useBinding = packageUseBinding();
    const options = {
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { status: 'current', checkout_path: domainPackRoot, operational_ready: true },
        configured_carrier: { status: 'installed', executor: { status: 'callable' }, plugin_source_path: domainPackRoot },
        package_use_binding: useBinding, native_package_closure: useBinding,
      }),
      resolveStageBinding: () => binding(),
    };
    const qualityCycleId = 'quality-cycle:derived-re-review-materialization';
    const producer = await stageQualityAttemptMaterializeActivity({
      stage_run: stageRun, quality_cycle_id: qualityCycleId,
      attempt_role: 'producer', quality_round_index: 0,
      artifact_refs: stageRun.artifact_refs ?? [], artifact_hashes: stageRun.artifact_hashes ?? [],
      artifact_identity_receipt_refs: stageRun.artifact_identity_receipt_refs ?? [],
    }, options);

    const producedBytes = '{"revision":"producer"}\n';
    const producedRef = 'artifacts/producer-output.json';
    const producedPath = path.join(scope.canonical_work_item_root!, producedRef);
    fs.writeFileSync(producedPath, producedBytes);
    const transportCopy = path.join(scope.workspace_root, producedRef);
    fs.mkdirSync(path.dirname(transportCopy), { recursive: true });
    const transportBytes = 'different transport workspace bytes';
    fs.writeFileSync(transportCopy, transportBytes);
    const producedHash = digest(producedBytes);
    const verifiedProducer = verifyStageQualityCloseoutArtifactIdentity({
      attempt: producer.workflow_input,
      workspaceRoot: scope.canonical_work_item_root!,
      closeoutPacket: {
        surface_kind: 'stage_attempt_closeout_packet',
        stage_attempt_id: producer.workflow_input.stage_attempt_id,
        stage_run_id: stageRun.stage_run_id,
        scope_digest: scope.scope_digest,
        closeout_refs: [producedRef],
        closeout_ref_metadata: [{ ref: producedRef, sha256: producedHash }],
        consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
        next_owner: null, domain_ready_verdict: null,
        authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' },
        route_impact: { stage_quality_cycle: {
          artifact_refs: [producedRef], artifact_hashes: [producedHash],
        } },
      },
    })!;
    const producerReceiptRefs = verifiedProducer.closeout_ref_metadata!
      .map((entry) => entry.artifact_identity_receipt_ref as string);
    ingest(producer.workflow_input.stage_attempt_id, {
      ...verifiedProducer,
      route_impact: { stage_quality_cycle: {
        ...verifiedProducer.route_impact!.stage_quality_cycle as Record<string, unknown>,
        artifact_identity_receipt_refs: producerReceiptRefs,
      } },
    });

    const findings = [
      {
        finding_id: 'F1', severity: 'critical' as const, required: true,
        evidence_refs: ['evidence:F1'], repair_expectation: 'Repair F1.',
      },
      {
        finding_id: 'F2', severity: 'minor' as const, required: false,
        evidence_refs: ['evidence:F2'], repair_expectation: 'Observe F2.',
      },
    ];
    const reviewer = await stageQualityAttemptMaterializeActivity({
      stage_run: stageRun, quality_cycle_id: qualityCycleId,
      attempt_role: 'reviewer', quality_round_index: 0,
      parent_attempt_ref: producer.attempt_ref, artifact_producer_attempt_ref: producer.attempt_ref,
      artifact_refs: [producedRef], artifact_hashes: [producedHash],
      artifact_identity_receipt_refs: producerReceiptRefs,
    }, options);
    const reviewerSpec = reviewer.workflow_input.execution_content_binding?.spec;
    assert.ok(reviewerSpec);
    revalidateStageRunImmutableSpecContent({
      spec: reviewerSpec,
      domainPackRoot,
      workspaceLocator: stageRun.workspace_locator,
      scopeKind: 'work_item',
      executionScope: scope,
    });
    const observe = (artifactHash: string, receiptRefs: string[]) => stageQualityCycleProjectActivity({
      artifact_identity_observation_only: true,
      stage_run: stageRun,
      state: {
        artifact_refs: [producedRef],
        artifact_hashes: [artifactHash],
        artifact_identity_receipt_refs: receiptRefs,
        artifact_identity_authority: { authoritative_attempt_ref: producer.attempt_ref },
      },
    } as Parameters<typeof stageQualityCycleProjectActivity>[0]);
    assert.equal((await observe(producedHash, producerReceiptRefs))
      .artifact_identity_observation?.live_bytes_status, 'matches');
    assert.equal((await observe(digest(transportBytes), []))
      .artifact_identity_observation?.live_bytes_status, 'matches');

    ingest(reviewer.workflow_input.stage_attempt_id, {
      surface_kind: 'stage_attempt_closeout_packet',
      stage_attempt_id: reviewer.workflow_input.stage_attempt_id,
      stage_run_id: stageRun.stage_run_id,
      scope_digest: scope.scope_digest,
      closeout_refs: [`review:${reviewer.workflow_input.stage_attempt_id}`],
      route_impact: { stage_quality_cycle: { outcome: 'repair_required', findings } },
    });

    const repairer = await stageQualityAttemptMaterializeActivity({
      stage_run: stageRun, quality_cycle_id: qualityCycleId,
      attempt_role: 'repairer', quality_round_index: 1,
      parent_attempt_ref: reviewer.attempt_ref, artifact_producer_attempt_ref: producer.attempt_ref,
      artifact_refs: [producedRef], artifact_hashes: [producedHash],
      artifact_identity_receipt_refs: producerReceiptRefs,
      findings,
    }, options);
    const repairedBytes = '{"revision":"repaired"}\n';
    const repairedPath = path.join(scope.canonical_work_item_root!, 'artifacts/repaired-output.json');
    fs.writeFileSync(repairedPath, repairedBytes);
    const repairedRef = `file://${repairedPath}`;
    const repairedHash = digest(repairedBytes);
    const repairEntry = (findingId: string) => ({
      finding_id: findingId,
      repair_status: 'repaired',
      changed_artifact_refs: [{
        kind: 'opl_reviewer_input_snapshot_member', ref: repairedRef,
        sha256: repairedHash, size_bytes: Buffer.byteLength(repairedBytes),
      }],
      repair_evidence_refs: [`evidence:${findingId}:repair`],
      note: `original:${findingId}`,
    });
    const verifiedRepairer = verifyStageQualityCloseoutArtifactIdentity({
      attempt: repairer.workflow_input,
      workspaceRoot: scope.workspace_root,
      closeoutPacket: {
        surface_kind: 'stage_attempt_closeout_packet',
        stage_attempt_id: repairer.workflow_input.stage_attempt_id,
        stage_run_id: stageRun.stage_run_id,
        scope_digest: scope.scope_digest,
        closeout_refs: [repairedRef],
        closeout_ref_metadata: [{ ref: repairedRef, sha256: repairedHash }],
        consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
        next_owner: null, domain_ready_verdict: null,
        authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' },
        route_impact: { stage_quality_cycle: {
          artifact_refs: [repairedRef], artifact_hashes: [repairedHash], findings,
          repair_map: findings.map((finding) => repairEntry(finding.finding_id)),
        } },
      },
    })!;
    const repairerReceiptRefs = verifiedRepairer.closeout_ref_metadata!
      .map((entry) => entry.artifact_identity_receipt_ref as string);
    const original = {
      ...verifiedRepairer,
      route_impact: { stage_quality_cycle: {
        ...verifiedRepairer.route_impact!.stage_quality_cycle as Record<string, unknown>,
        artifact_identity_receipt_refs: repairerReceiptRefs,
      } },
    };
    const normalized = deriveNormalizedStageQualityCloseout({
      closeoutPacket: original,
      attempt: repairer.workflow_input,
    });
    assert.ok(normalized);
    ingest(repairer.workflow_input.stage_attempt_id, normalized.derivedCloseout);
    const derivedQuality = normalized.derivedCloseout.route_impact!.stage_quality_cycle as Record<string, any>;

    const reReviewer = await stageQualityAttemptMaterializeActivity({
      stage_run: stageRun, quality_cycle_id: qualityCycleId,
      attempt_role: 're_reviewer', quality_round_index: 1,
      parent_attempt_ref: repairer.attempt_ref, artifact_producer_attempt_ref: repairer.attempt_ref,
      artifact_refs: [repairedRef], artifact_hashes: [repairedHash],
      artifact_identity_receipt_refs: repairerReceiptRefs,
      findings, repair_map: derivedQuality.repair_map,
    }, options);
    const context = reReviewer.workflow_input.quality_context!;
    assert.deepEqual(context.repair_map, [repairEntry('F1')]);
    assert.deepEqual(context.repair_observations, [repairEntry('F2')]);
    assert.deepEqual(context.repair_closeout_lineage, normalized.derivedCloseout.closeout_normalization);
    const lineage = context.repair_closeout_lineage as Record<string, any>;
    assert.equal(lineage.original_closeout_packet.route_impact.stage_quality_cycle.repair_map.length, 2);
    assert.equal(lineage.authority_status, 'pending_unreviewed');
    const { db } = openQueueDb();
    try {
      const count = db.prepare('SELECT COUNT(*) AS count FROM stage_attempts WHERE stage_run_id = ?')
        .get(stageRun.stage_run_id) as { count: number };
      assert.equal(count.count, 4);
      const persisted = inspectStageAttempt(db, reReviewer.workflow_input.stage_attempt_id);
      assert.deepEqual(persisted.quality_context.repair_closeout_lineage,
        normalized.derivedCloseout.closeout_normalization);
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
