import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import { canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import { buildStageReviewContextManifest } from '../../src/modules/stagecraft/index.ts';
import {
  buildStageQualityContextManifestRef,
  buildStageReviewInputSnapshotContext,
} from '../../src/modules/runway/family-runtime-stage-quality-context-manifest.ts';
import {
  materializeReviewerInputSnapshot,
  resolveReviewerInputSnapshotMaterialization,
} from '../../src/modules/runway/family-runtime-reviewer-input-snapshot.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  materializePersistedStageReviewReceipt,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { openQueueDb } from '../../src/modules/runway/family-runtime-store.ts';
import { stageQualityReviewReceiptActivity } from '../../src/modules/runway/family-runtime-temporal-activities.ts';

const rubricRefs = ['rubric:quality'];
const artifactRefs = ['artifact:document-v1'];
const artifactHashes = ['sha256:document-v1'];

function contextBinding(input: {
  role: 'producer' | 'reviewer' | 'repairer' | 're_reviewer';
  stageRunId: string;
  qualityCycleId: string;
  artifactRefs?: string[];
  artifactHashes?: string[];
  priorFindingRefs?: string[];
  repairMapRefs?: string[];
  rubricRefs?: string[];
  reviewInputSnapshotContext?: Record<string, unknown>;
}) {
  const attemptRubricRefs = input.rubricRefs ?? rubricRefs;
  const artifactIdentity = {
    artifact_refs: input.artifactRefs ?? [],
    artifact_hashes: input.artifactHashes ?? [],
  };
  const manifest = input.role === 'reviewer' || input.role === 're_reviewer'
    ? {
        ...buildStageReviewContextManifest({
        stageRunId: input.stageRunId,
        qualityCycleId: input.qualityCycleId,
        reviewerAttemptRole: input.role,
        artifactRefs: artifactIdentity.artifact_refs,
        artifactHashes: artifactIdentity.artifact_hashes,
        qualityRubricRefs: attemptRubricRefs,
        priorFindingRefs: input.priorFindingRefs,
        repairMapRefs: input.repairMapRefs,
        }),
        ...(input.reviewInputSnapshotContext ?? buildStageReviewInputSnapshotContext({
            stageRunId: input.stageRunId,
            qualityCycleId: input.qualityCycleId,
            reviewerAttemptRole: input.role,
            resolution: resolveReviewerInputSnapshotMaterialization(null),
          })),
      }
    : {
        surface_kind: 'opl_stage_quality_attempt_context_manifest',
        version: 'stage-quality-attempt-context-manifest.v1',
        stage_run_id: input.stageRunId,
        quality_cycle_id: input.qualityCycleId,
        attempt_role: input.role,
        stage_goal_refs: [],
        source_refs: [],
        lineage_refs: [],
        quality_rubric_refs: attemptRubricRefs,
        prior_finding_refs: input.priorFindingRefs ?? [],
        repair_map_refs: input.repairMapRefs ?? [],
        ...artifactIdentity,
        no_context_inheritance: true,
      };
  return {
    contextManifest: manifest,
    contextManifestRef: buildStageQualityContextManifestRef(manifest),
  };
}

function completeAttempt(
  db: DatabaseSync,
  attemptId: string,
  sessionRef: string,
  stageQualityCycle: Record<string, unknown>,
) {
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'completed', execution_session_ref = ?, route_impact_json = ?
    WHERE stage_attempt_id = ?
  `).run(sessionRef, JSON.stringify({ stage_quality_cycle: stageQualityCycle }), attemptId);
}

function validInitialReviewPair(db: DatabaseSync, input: {
  producerRubricRefs?: string[];
  reviewerRubricRefs?: string[];
  reviewInputSnapshotContext?: Record<string, unknown>;
} = {}) {
  createStageAttemptTable(db);
  const shared = {
    domainId: 'redcube' as const,
    stageId: 'review',
    providerKind: 'temporal' as const,
    workspaceLocator: { workspace_root: '/tmp/stage-quality-review-receipt' },
    sourceFingerprint: 'sha256:source',
    stageRunId: 'stage-run:review-receipt',
    qualityCycleId: 'quality-cycle:review-receipt',
    qualityRolePromptRef: 'prompt:quality-role',
    noContextInheritance: true,
    newAttempt: true,
  };
  const producer = createStageAttempt(db, {
    ...shared,
    qualityRubricRefs: input.producerRubricRefs ?? rubricRefs,
    attemptRole: 'producer',
    qualityRoundIndex: 0,
    ...contextBinding({
      role: 'producer',
      stageRunId: shared.stageRunId,
      qualityCycleId: shared.qualityCycleId,
      rubricRefs: input.producerRubricRefs,
    }),
  }).attempt;
  const reviewer = createStageAttempt(db, {
    ...shared,
    qualityRubricRefs: input.reviewerRubricRefs ?? rubricRefs,
    attemptRole: 'reviewer',
    qualityRoundIndex: 0,
    parentAttemptRef: `opl://stage_attempts/${producer.stage_attempt_id}`,
    inputArtifactRefs: artifactRefs,
    reviewedArtifactHashes: artifactHashes,
    ...contextBinding({
      role: 'reviewer',
      stageRunId: shared.stageRunId,
      qualityCycleId: shared.qualityCycleId,
      artifactRefs,
      artifactHashes,
      rubricRefs: input.reviewerRubricRefs,
      reviewInputSnapshotContext: input.reviewInputSnapshotContext,
    }),
  }).attempt;
  completeAttempt(db, producer.stage_attempt_id, 'codex://threads/producer', {
    artifact_refs: artifactRefs,
    artifact_hashes: artifactHashes,
  });
  completeAttempt(db, reviewer.stage_attempt_id, 'codex://threads/reviewer', {
    outcome: 'pass',
    findings: [],
  });
  return { producer, reviewer };
}

function materializeInitialReceipt(db: DatabaseSync, pair: ReturnType<typeof validInitialReviewPair>) {
  return materializePersistedStageReviewReceipt(db, {
    producerAttemptId: pair.producer.stage_attempt_id,
    reviewerAttemptId: pair.reviewer.stage_attempt_id,
    rubricRefs,
    verdict: 'pass',
  });
}

function validReReviewPair(db: DatabaseSync, input: {
  outcome?: 'pass' | 'repair_required' | 'quality_debt' | 'blocked' | 'human_gate';
  closureStatus?: 'closed' | 'partially_closed' | 'still_open';
} = {}) {
  const initial = validInitialReviewPair(db);
  const findings = [{
    finding_id: 'finding:required',
    severity: 'major' as const,
    required: true,
    evidence_refs: ['evidence:finding-required'],
    repair_expectation: 'Close the required finding.',
  }];
  const repairMap = [{
    finding_id: 'finding:required',
    repair_status: 'repaired' as const,
    changed_artifact_refs: ['artifact:document-v2'],
    repair_evidence_refs: ['evidence:finding-required-repair'],
  }];
  const shared = {
    domainId: 'redcube' as const,
    stageId: 'review',
    providerKind: 'temporal' as const,
    workspaceLocator: { workspace_root: '/tmp/stage-quality-review-receipt' },
    sourceFingerprint: 'sha256:source',
    stageRunId: 'stage-run:review-receipt',
    qualityCycleId: 'quality-cycle:review-receipt',
    qualityRolePromptRef: 'prompt:quality-role',
    qualityRubricRefs: rubricRefs,
    noContextInheritance: true,
    priorFindingRefs: ['finding:required'],
    newAttempt: true,
  };
  const repairer = createStageAttempt(db, {
    ...shared,
    attemptRole: 'repairer',
    qualityRoundIndex: 1,
    parentAttemptRef: `opl://stage_attempts/${initial.reviewer.stage_attempt_id}`,
    qualityContext: { findings, repair_map: [] },
    ...contextBinding({
      role: 'repairer',
      stageRunId: shared.stageRunId,
      qualityCycleId: shared.qualityCycleId,
      priorFindingRefs: shared.priorFindingRefs,
    }),
  }).attempt;
  const reReviewer = createStageAttempt(db, {
    ...shared,
    attemptRole: 're_reviewer',
    qualityRoundIndex: 1,
    parentAttemptRef: `opl://stage_attempts/${repairer.stage_attempt_id}`,
    inputArtifactRefs: ['artifact:document-v2'],
    reviewedArtifactHashes: ['sha256:document-v2'],
    repairMapRefs: ['repair-map:finding:required'],
    qualityContext: { findings, repair_map: repairMap },
    ...contextBinding({
      role: 're_reviewer',
      stageRunId: shared.stageRunId,
      qualityCycleId: shared.qualityCycleId,
      artifactRefs: ['artifact:document-v2'],
      artifactHashes: ['sha256:document-v2'],
      priorFindingRefs: shared.priorFindingRefs,
      repairMapRefs: ['repair-map:finding:required'],
    }),
  }).attempt;
  completeAttempt(db, repairer.stage_attempt_id, 'codex://threads/repairer', {
    artifact_refs: ['artifact:document-v2'],
    artifact_hashes: ['sha256:document-v2'],
    repair_map: repairMap,
  });
  completeAttempt(db, reReviewer.stage_attempt_id, 'codex://threads/re-reviewer', {
    outcome: input.outcome ?? 'quality_debt',
    finding_closures: [{
      finding_id: 'finding:required',
      status: input.closureStatus ?? 'closed',
      evidence_refs: ['evidence:finding-required-closure'],
    }],
    repair_regressions: [],
    critical_new_findings: [],
    optional_observations: [],
  });
  return { initial, repairer, reReviewer };
}

test('ledger materializes an initial review receipt only from exact persisted Attempt truth', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const pair = validInitialReviewPair(db);
    const receipt = materializeInitialReceipt(db, pair);
    assert.equal(receipt.producer_attempt_ref, `opl://stage_attempts/${pair.producer.stage_attempt_id}`);
    assert.equal(receipt.reviewer_attempt_ref, `opl://stage_attempts/${pair.reviewer.stage_attempt_id}`);
    assert.deepEqual(receipt.reviewed_artifact_refs, artifactRefs);
    assert.deepEqual(receipt.reviewed_artifact_hashes, artifactHashes);
    assert.deepEqual(receipt.rubric_refs, rubricRefs);
    assert.equal(receipt.verdict, 'pass');
  } finally {
    db.close();
  }
});

test('persisted review receipt keeps immutable reviewer bytes after the live source mutates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-receipt-snapshot-'));
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const sourcePath = path.join(workspaceRoot, 'paper.txt');
  const original = Buffer.from('reviewed immutable bytes\n');
  fs.writeFileSync(sourcePath, original);
  const digest = `sha256:${crypto.createHash('sha256').update(original).digest('hex')}`;
  const member = {
    member_id: 'manuscript',
    role: 'manuscript_file',
    owner_ref: 'workspace://submission/paper.txt',
    source_ref: 'paper.txt',
    sha256: digest,
    size_bytes: original.length,
  };
  const reviewScopeSha256 = `sha256:${crypto.createHash('sha256').update(canonicalJsonText({
    scope_policy_id: 'mas_review_scope_dependency_map',
    scope_policy_version: 1,
    review_lane: 'medical',
    reviewed_members: [{
      member_id: member.member_id,
      role: member.role,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
    }],
  })).digest('hex')}`;
  const authorityRecord = {
    surface_kind: 'mas_review_input_snapshot_authority' as const,
    schema_version: 1 as const,
    generation_ref: 'mas-generation:receipt-mutation',
    review_lane: 'medical' as const,
    review_scope_sha256: reviewScopeSha256,
    members: [{
      member_id: member.member_id,
      role: member.role,
      owner_ref: member.owner_ref,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
    }],
  };
  const authorityBytes = Buffer.from(canonicalJsonText(authorityRecord), 'utf8');
  const authoritySha256 = `sha256:${crypto.createHash('sha256').update(authorityBytes).digest('hex')}`;
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  const db = new DatabaseSync(':memory:');
  try {
    const snapshot = materializeReviewerInputSnapshot({
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
      schema_version: 1,
      generation_ref: 'mas-generation:receipt-mutation',
      review_lane: 'medical',
      review_scope_sha256: reviewScopeSha256,
      workspace_root: workspaceRoot,
      members: [member],
      mas_authority_record_ref: {
        kind: 'mas_review_input_snapshot_authority',
        ref: `mas-review-input-snapshot-authority:${authoritySha256.slice('sha256:'.length)}`,
        size_bytes: authorityBytes.length,
        sha256: authoritySha256,
      },
      mas_authority_record: authorityRecord,
    });
    const snapshotContext = buildStageReviewInputSnapshotContext({
      stageRunId: 'stage-run:review-receipt',
      qualityCycleId: 'quality-cycle:review-receipt',
      reviewerAttemptRole: 'reviewer',
      resolution: snapshot,
    });
    fs.writeFileSync(sourcePath, 'mutated live bytes must not replace reviewed input\n');
    const pair = validInitialReviewPair(db, {
      reviewInputSnapshotContext: snapshotContext,
    });
    const receipt = materializeInitialReceipt(db, pair);
    assert.equal(receipt.review_input_snapshot_status, 'materialized');
    assert.deepEqual(receipt.mas_review_input_snapshot_binding, snapshot.review_input_snapshot_binding);
    assert.deepEqual(receipt.opl_reviewer_input_snapshot_manifest_ref, snapshot.manifest_ref);
    const immutableRef = snapshot.manifest.members[0]!.immutable_ref.ref;
    assert.deepEqual(fs.readFileSync(fileURLToPath(immutableRef)), original);
    assert.notDeepEqual(fs.readFileSync(sourcePath), original);
  } finally {
    db.close();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ledger binds the receipt to the reviewer Attempt rubric across a package generation change', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const reviewerRubricRefs = ['rubric:quality-v2'];
    const pair = validInitialReviewPair(db, {
      producerRubricRefs: ['rubric:quality-v1'],
      reviewerRubricRefs,
    });
    const receipt = materializePersistedStageReviewReceipt(db, {
      producerAttemptId: pair.producer.stage_attempt_id,
      reviewerAttemptId: pair.reviewer.stage_attempt_id,
      rubricRefs: reviewerRubricRefs,
      verdict: 'pass',
    });
    assert.deepEqual(receipt.rubric_refs, reviewerRubricRefs);
  } finally {
    db.close();
  }
});

test('ledger accepts only repairer(round n) -> re_reviewer(round n) for re-review receipts', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const { repairer, reReviewer } = validReReviewPair(db);
    const receipt = materializePersistedStageReviewReceipt(db, {
      producerAttemptId: repairer.stage_attempt_id,
      reviewerAttemptId: reReviewer.stage_attempt_id,
      rubricRefs,
      verdict: 'quality_debt',
    });
    assert.equal(receipt.verdict, 'quality_debt');
    assert.deepEqual(receipt.reviewed_artifact_refs, ['artifact:document-v2']);
    assert.match(String(receipt.finding_lineage.repair_map_sha256), /^sha256:[a-f0-9]{64}$/);
    assert.match(String(receipt.finding_lineage.re_review_result_sha256), /^sha256:[a-f0-9]{64}$/);
  } finally {
    db.close();
  }
});

const invalidPersistedCases: Array<{
  name: string;
  mutate(db: DatabaseSync, pair: ReturnType<typeof validInitialReviewPair>): void;
  message: RegExp;
}> = [
  {
    name: 'shared execution session',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET execution_session_ref = ? WHERE stage_attempt_id = ?')
      .run('codex://threads/producer', pair.reviewer.stage_attempt_id),
    message: /new provider session/,
  },
  {
    name: 'producer context inheritance not proven',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET no_context_inheritance = 0 WHERE stage_attempt_id = ?')
      .run(pair.producer.stage_attempt_id),
    message: /both persisted Attempts to prove no context inheritance/,
  },
  {
    name: 'reviewer context inheritance not proven',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET no_context_inheritance = 0 WHERE stage_attempt_id = ?')
      .run(pair.reviewer.stage_attempt_id),
    message: /both persisted Attempts to prove no context inheritance/,
  },
  {
    name: 'repairer to reviewer role pair',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET attempt_role = 'repairer', quality_round_index = 1 WHERE stage_attempt_id = ?")
      .run(pair.producer.stage_attempt_id),
    message: /role pair must be producer.*reviewer.*or repairer.*re_reviewer/,
  },
  {
    name: 'StageRun mismatch',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET stage_run_id = 'stage-run:other' WHERE stage_attempt_id = ?")
      .run(pair.reviewer.stage_attempt_id),
    message: /share exact domain, Stage, StageRun, and quality-cycle identity/,
  },
  {
    name: 'domain mismatch',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET domain_id = 'other-domain' WHERE stage_attempt_id = ?")
      .run(pair.reviewer.stage_attempt_id),
    message: /share exact domain, Stage, StageRun, and quality-cycle identity/,
  },
  {
    name: 'Stage mismatch',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET stage_id = 'other-stage' WHERE stage_attempt_id = ?")
      .run(pair.reviewer.stage_attempt_id),
    message: /share exact domain, Stage, StageRun, and quality-cycle identity/,
  },
  {
    name: 'quality-cycle mismatch',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET quality_cycle_id = 'quality-cycle:other' WHERE stage_attempt_id = ?")
      .run(pair.reviewer.stage_attempt_id),
    message: /share exact domain, Stage, StageRun, and quality-cycle identity/,
  },
  {
    name: 'parent Attempt mismatch',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET parent_attempt_ref = 'opl://stage_attempts/other' WHERE stage_attempt_id = ?")
      .run(pair.reviewer.stage_attempt_id),
    message: /exact producer or repairer Attempt as parent/,
  },
  {
    name: 'review round mismatch',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET quality_round_index = 1 WHERE stage_attempt_id = ?')
      .run(pair.reviewer.stage_attempt_id),
    message: /role pair must be producer.*reviewer.*or repairer.*re_reviewer/,
  },
  {
    name: 'producer not completed',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?")
      .run(pair.producer.stage_attempt_id),
    message: /both persisted Attempts to be completed/,
  },
  {
    name: 'reviewer not completed',
    mutate: (db, pair) => db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?")
      .run(pair.reviewer.stage_attempt_id),
    message: /both persisted Attempts to be completed/,
  },
  {
    name: 'producer session missing',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET execution_session_ref = NULL WHERE stage_attempt_id = ?')
      .run(pair.producer.stage_attempt_id),
    message: /requires observed execution sessions/,
  },
  {
    name: 'reviewer session missing',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET execution_session_ref = NULL WHERE stage_attempt_id = ?')
      .run(pair.reviewer.stage_attempt_id),
    message: /requires observed execution sessions/,
  },
  {
    name: 'artifact ref mismatch',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET input_artifact_refs_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify(['artifact:other']), pair.reviewer.stage_attempt_id),
    message: /context manifest artifact identity must exactly match the Attempt/,
  },
  {
    name: 'artifact hash mismatch',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET reviewed_artifact_hashes_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify(['sha256:other']), pair.reviewer.stage_attempt_id),
    message: /context manifest artifact identity must exactly match the Attempt/,
  },
  {
    name: 'reviewer rubric mismatch',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET quality_rubric_refs_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify(['rubric:other']), pair.reviewer.stage_attempt_id),
    message: /rubric refs must exactly match/,
  },
  {
    name: 'producer returns reviewer-only outcome',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({
        stage_quality_cycle: {
          outcome: 'pass',
          artifact_refs: artifactRefs,
          artifact_hashes: artifactHashes,
        },
      }), pair.producer.stage_attempt_id),
    message: /must not return outcome or verdict/,
  },
  {
    name: 'initial repair_required without required findings',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: { outcome: 'repair_required', findings: [] } }), pair.reviewer.stage_attempt_id),
    message: /requires at least one required finding/,
  },
  {
    name: 'initial pass with an open required finding',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: {
        outcome: 'pass',
        findings: [{
          finding_id: 'finding:required',
          severity: 'major',
          required: true,
          evidence_refs: ['evidence:required'],
          repair_expectation: 'Close the required finding.',
        }],
      } }), pair.reviewer.stage_attempt_id),
    message: /cannot carry an open required finding/,
  },
  {
    name: 'initial quality_debt with an open required finding',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: {
        outcome: 'quality_debt',
        findings: [{
          finding_id: 'finding:required',
          severity: 'major',
          required: true,
          evidence_refs: ['evidence:required'],
          repair_expectation: 'Close the required finding.',
        }],
      } }), pair.reviewer.stage_attempt_id),
    message: /cannot carry an open required finding/,
  },
  {
    name: 'blocked outcome without canonical hard-stop evidence',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: {
        outcome: 'blocked',
        blocked_reason: 'domain-blocked',
      } }), pair.reviewer.stage_attempt_id),
    message: /requires a declared canonical hard_stop_class/,
  },
  {
    name: 'blocked outcome without typed blocker ref',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: {
        outcome: 'blocked',
        blocked_reason: 'domain-blocked',
        hard_stop_class: 'safety_or_compliance',
      } }), pair.reviewer.stage_attempt_id),
    message: /requires a domain-owned typed blocker ref/,
  },
  {
    name: 'human_gate outcome without human-decision class',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: {
        outcome: 'human_gate',
        blocked_reason: 'owner-decision-required',
        hard_stop_class: 'safety_or_compliance',
        human_gate_ref: 'human-gate:owner',
      } }), pair.reviewer.stage_attempt_id),
    message: /requires hard_stop_class=human_decision_required/,
  },
  {
    name: 'reviewer outcome and requested verdict mismatch',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: { outcome: 'quality_debt', findings: [] } }), pair.reviewer.stage_attempt_id),
    message: /verdict does not match the persisted reviewer outcome/,
  },
  {
    name: 'legacy reviewer verdict field',
    mutate: (db, pair) => db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify({ stage_quality_cycle: { verdict: 'pass', findings: [] } }), pair.reviewer.stage_attempt_id),
    message: /verdict is reserved for controller-generated review receipts/,
  },
];

for (const invalidCase of invalidPersistedCases) {
  test(`ledger rejects ${invalidCase.name} without materializing a receipt`, () => {
    const db = new DatabaseSync(':memory:');
    try {
      const pair = validInitialReviewPair(db);
      invalidCase.mutate(db, pair);
      assert.throws(
        () => materializeInitialReceipt(db, pair),
        (error) => error instanceof FrameworkContractError && invalidCase.message.test(error.message),
      );
    } finally {
      db.close();
    }
  });
}

const invalidReReviewCases = [
  {
    name: 'repair_required with closed finding closure',
    outcome: 'repair_required',
    closureStatus: 'closed',
    verdict: 'repair_required',
    message: /requires an open required finding, repair regression, or critical new finding/,
  },
  {
    name: 'pass with open finding closure',
    outcome: 'pass',
    closureStatus: 'still_open',
    verdict: 'pass',
    message: /must return outcome repair_required/,
  },
  {
    name: 'quality_debt with open finding closure',
    outcome: 'quality_debt',
    closureStatus: 'partially_closed',
    verdict: 'quality_debt',
    message: /must return outcome repair_required/,
  },
  {
    name: 'blocked without canonical hard-stop evidence',
    outcome: 'blocked',
    closureStatus: 'closed',
    verdict: 'hard_stop',
    message: /requires a declared canonical hard_stop_class/,
  },
] as const;

for (const invalidCase of invalidReReviewCases) {
  test(`ledger rejects re-review ${invalidCase.name} without materializing a receipt`, () => {
    const db = new DatabaseSync(':memory:');
    try {
      const { repairer, reReviewer } = validReReviewPair(db, {
        outcome: invalidCase.outcome,
        closureStatus: invalidCase.closureStatus,
      });
      assert.throws(
        () => materializePersistedStageReviewReceipt(db, {
          producerAttemptId: repairer.stage_attempt_id,
          reviewerAttemptId: reReviewer.stage_attempt_id,
          rubricRefs,
          verdict: invalidCase.verdict,
        }),
        (error) => error instanceof FrameworkContractError && invalidCase.message.test(error.message),
      );
    } finally {
      db.close();
    }
  });
}

test('ledger validates re-review hard stop before requiring finding closure', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const { repairer, reReviewer } = validReReviewPair(db);
    completeAttempt(db, reReviewer.stage_attempt_id, 'codex://threads/re-reviewer', {
      outcome: 'blocked',
      blocked_reason: 'domain-review-blocked',
      hard_stop_class: 'safety_or_compliance',
      typed_blocker_ref: 'typed-blocker:domain-review',
    });
    const receipt = materializePersistedStageReviewReceipt(db, {
      producerAttemptId: repairer.stage_attempt_id,
      reviewerAttemptId: reReviewer.stage_attempt_id,
      rubricRefs,
      verdict: 'hard_stop',
    });
    assert.equal(receipt.verdict, 'hard_stop');
    assert.match(String(receipt.finding_lineage.repair_map_sha256), /^sha256:[a-f0-9]{64}$/);
    assert.equal(receipt.finding_lineage.re_review_result_sha256, null);
  } finally {
    db.close();
  }
});

test('ledger rejects reviewer-only outcome on the persisted repairer', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const { repairer, reReviewer } = validReReviewPair(db);
    completeAttempt(db, repairer.stage_attempt_id, 'codex://threads/repairer', {
      outcome: 'pass',
      artifact_refs: ['artifact:document-v2'],
      artifact_hashes: ['sha256:document-v2'],
    });
    assert.throws(() => materializePersistedStageReviewReceipt(db, {
      producerAttemptId: repairer.stage_attempt_id,
      reviewerAttemptId: reReviewer.stage_attempt_id,
      rubricRefs,
      verdict: 'quality_debt',
    }), /must not return outcome or verdict/);
  } finally {
    db.close();
  }
});

test('ledger rejects re-review without exact persisted prior-finding repair lineage', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const { repairer, reReviewer } = validReReviewPair(db);
    db.prepare('UPDATE stage_attempts SET repair_map_refs_json = ? WHERE stage_attempt_id = ?')
      .run(JSON.stringify([]), reReviewer.stage_attempt_id);
    assert.throws(() => materializePersistedStageReviewReceipt(db, {
      producerAttemptId: repairer.stage_attempt_id,
      reviewerAttemptId: reReviewer.stage_attempt_id,
      rubricRefs,
      verdict: 'quality_debt',
    }), /context manifest repair_map_refs must exactly match the Attempt lineage/);
  } finally {
    db.close();
  }
});

test('ledger rejects a context manifest ref or body that no longer binds exact persisted bytes', () => {
  const mutations = [
    {
      name: 'ref',
      apply(db: DatabaseSync, reviewerId: string) {
        db.prepare('UPDATE stage_attempts SET context_manifest_ref = ? WHERE stage_attempt_id = ?')
          .run('opl://stage-quality-context/ctx_tampered', reviewerId);
      },
    },
    {
      name: 'body',
      apply(db: DatabaseSync, reviewerId: string) {
        const row = db.prepare('SELECT context_manifest_json FROM stage_attempts WHERE stage_attempt_id = ?')
          .get(reviewerId) as { context_manifest_json: string };
        const manifest = JSON.parse(row.context_manifest_json) as Record<string, unknown>;
        db.prepare('UPDATE stage_attempts SET context_manifest_json = ? WHERE stage_attempt_id = ?')
          .run(JSON.stringify({ ...manifest, tampered_binding: true }), reviewerId);
      },
    },
  ];
  for (const mutation of mutations) {
    const db = new DatabaseSync(':memory:');
    try {
      const pair = validInitialReviewPair(db);
      mutation.apply(db, pair.reviewer.stage_attempt_id);
      assert.throws(
        () => materializeInitialReceipt(db, pair),
        (error) => error instanceof FrameworkContractError
          && /context manifest ref must bind the exact persisted manifest body/.test(error.message),
        mutation.name,
      );
    } finally {
      db.close();
    }
  }
});

test('ledger rejects repairer and Re-reviewer finding or repair-map body drift', () => {
  const mutations = [
    {
      name: 'finding body',
      apply(db: DatabaseSync, repairerId: string) {
        const row = db.prepare('SELECT quality_context_json FROM stage_attempts WHERE stage_attempt_id = ?')
          .get(repairerId) as { quality_context_json: string };
        const context = JSON.parse(row.quality_context_json) as Record<string, any>;
        context.findings[0].repair_expectation = 'Tampered repair expectation.';
        db.prepare('UPDATE stage_attempts SET quality_context_json = ? WHERE stage_attempt_id = ?')
          .run(JSON.stringify(context), repairerId);
      },
      message: /share the exact persisted finding bodies/,
    },
    {
      name: 'repair-map body',
      apply(db: DatabaseSync, repairerId: string) {
        const row = db.prepare('SELECT route_impact_json FROM stage_attempts WHERE stage_attempt_id = ?')
          .get(repairerId) as { route_impact_json: string };
        const routeImpact = JSON.parse(row.route_impact_json) as Record<string, any>;
        routeImpact.stage_quality_cycle.repair_map[0].repair_evidence_refs = ['evidence:tampered-repair'];
        db.prepare('UPDATE stage_attempts SET route_impact_json = ? WHERE stage_attempt_id = ?')
          .run(JSON.stringify(routeImpact), repairerId);
      },
      message: /repair_map must exactly match the persisted repairer output/,
    },
  ];
  for (const mutation of mutations) {
    const db = new DatabaseSync(':memory:');
    try {
      const { repairer, reReviewer } = validReReviewPair(db);
      mutation.apply(db, repairer.stage_attempt_id);
      assert.throws(
        () => materializePersistedStageReviewReceipt(db, {
          producerAttemptId: repairer.stage_attempt_id,
          reviewerAttemptId: reReviewer.stage_attempt_id,
          rubricRefs,
          verdict: 'quality_debt',
        }),
        (error) => error instanceof FrameworkContractError && mutation.message.test(error.message),
        mutation.name,
      );
    } finally {
      db.close();
    }
  }
});

test('review receipt activity propagates typed ledger failure and returns no receipt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-review-receipt-activity-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  let pair: ReturnType<typeof validInitialReviewPair>;
  try {
    const { db } = openQueueDb();
    try {
      pair = validInitialReviewPair(db);
      db.prepare('UPDATE stage_attempts SET reviewed_artifact_hashes_json = ? WHERE stage_attempt_id = ?')
        .run(JSON.stringify(['sha256:mismatch']), pair.reviewer.stage_attempt_id);
    } finally {
      db.close();
    }
    await assert.rejects(
      () => stageQualityReviewReceiptActivity({
        producer_attempt_ref: `opl://stage_attempts/${pair.producer.stage_attempt_id}`,
        reviewer_attempt_ref: `opl://stage_attempts/${pair.reviewer.stage_attempt_id}`,
        rubric_refs: rubricRefs,
        verdict: 'pass',
      }),
      (error) => error instanceof FrameworkContractError
        && /context manifest artifact identity must exactly match the Attempt/.test(error.message),
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
