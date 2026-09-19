import {
  test,
  assert,
  crypto,
  fs,
  os,
  path,
  DatabaseSync,
  FrameworkContractError,
  buildStageReviewContextManifest,
  classifyCodexSessionContinuation,
  evaluateStageQualityFindingClosure,
  initialStageQualityCycleState,
  normalizeStageQualityArtifactIdentity,
  normalizeStageQualityCyclePolicy,
  reduceStageQualityCycleState,
  stageQualityAttemptOutcomeFromEnvelope,
  STAGE_QUALITY_OUTCOMES,
  validateInitialStageQualityReviewOutcome,
  validateIndependentStageReviewReceipt,
  buildFamilyStageConformanceReview,
  bindStageAttemptExecutionSession,
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  materializePersistedStageReviewReceipt,
  syncStageAttemptFromTemporalTerminalObservation,
  validatePersistedStageReviewIsolation,
  buildCodexStageActivityInput,
  requireTemporalStageRunWorkflowInputLaunchable,
  createStageQualityCycle,
  projectTemporalStageRunQualityCycle,
  requireStageQualityAttemptBoundary,
  buildPackBoundTemporalStageRunInput,
  buildStageQualityContextManifestRef,
  buildStageReviewInputSnapshotContext,
  resolveReviewerInputSnapshotMaterialization,
  OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE,
  STANDARD_AGENT_REGISTRY,
  createWorkItemExecutionScopeSnapshot,
  createStageRunLaunchTable,
  buildStageRouteDecisionIdentity,
  normalizeRuntimeExecutionScopeWrite,
  persistRuntimeExecutionScope,
  repoRoot,
  qualityContextBinding,
  persistReviewExecutionScope,
  persistDomainStageRun,
  reviewReceipt,
} from './shared.ts';
import type { StandardAgentStageQualityRuntimeBinding, TemporalStageRunWorkflowState } from './shared.ts';
test('Temporal StageRun terminal state idempotently refreshes the SQLite quality drilldown', () => {
  const db = new DatabaseSync(':memory:');
  const projectionWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-projection-'));
  const crossScopeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-cross-scope-'));
  try {
    createStageAttemptTable(db);
    const executionScope = persistReviewExecutionScope(db, {
      stageRunId: 'stage-run:rca/artifact-creation',
      domainId: 'redcube_ai',
      stageId: 'artifact_creation',
      workspaceRoot: projectionWorkspaceRoot,
    });
    const cycle = createStageQualityCycle(db, {
      stageRunId: 'stage-run:rca/artifact-creation',
      domainId: 'redcube_ai',
      stageId: 'artifact_creation',
      policy: { formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 } },
    }).cycle;
    const sharedAttempt = {
      domainId: 'redcube_ai' as const,
      stageId: 'artifact_creation',
      providerKind: 'temporal' as const,
      workspaceLocator: { workspace_root: projectionWorkspaceRoot },
      sourceFingerprint: 'sha256:projection-source',
      stageRunId: cycle.stage_run_id,
      qualityCycleId: cycle.quality_cycle_id,
      qualityRolePromptRef: 'prompt:quality-role',
      qualityRubricRefs: ['rubric:visual'],
      noContextInheritance: true,
      scopeKind: 'work_item' as const,
      executionScope,
      newAttempt: true,
    };
    const producer = createStageAttempt(db, {
      ...sharedAttempt,
      attemptRole: 'producer',
      qualityRoundIndex: 0,
      ...qualityContextBinding({
        role: 'producer',
        stageRunId: cycle.stage_run_id,
        qualityCycleId: cycle.quality_cycle_id,
        rubricRefs: sharedAttempt.qualityRubricRefs,
      }),
    }).attempt;
    const producerRef = `opl://stage_attempts/${producer.stage_attempt_id}`;
    const reviewer = createStageAttempt(db, {
      ...sharedAttempt,
      attemptRole: 'reviewer',
      qualityRoundIndex: 0,
      parentAttemptRef: producerRef,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      ...qualityContextBinding({
        role: 'reviewer',
        stageRunId: cycle.stage_run_id,
        qualityCycleId: cycle.quality_cycle_id,
        rubricRefs: sharedAttempt.qualityRubricRefs,
        artifactRefs: ['artifact:deck-v1'],
        artifactHashes: ['sha256:deck-v1'],
        artifactProducerAttemptRef: producerRef,
      }),
    }).attempt;
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: producer.stage_attempt_id,
      executionSessionRef: 'codex://threads/projection-producer',
    });
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: reviewer.stage_attempt_id,
      executionSessionRef: 'codex://threads/projection-reviewer',
    });
    db.prepare(`
      UPDATE stage_attempts SET status = 'completed', route_impact_json = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify({
      stage_quality_cycle: {
        artifact_refs: ['artifact:deck-v1'],
        artifact_hashes: ['sha256:deck-v1'],
      },
    }), producer.stage_attempt_id);
    db.prepare(`
      UPDATE stage_attempts SET status = 'completed', route_impact_json = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify({
      stage_quality_cycle: { outcome: 'pass', findings: [] },
    }), reviewer.stage_attempt_id);
    const initialReviewReceipt = materializePersistedStageReviewReceipt(db, {
      producerAttemptId: producer.stage_attempt_id,
      reviewerAttemptId: reviewer.stage_attempt_id,
      rubricRefs: sharedAttempt.qualityRubricRefs,
      verdict: 'pass',
    });
    const repairer = createStageAttempt(db, {
      ...sharedAttempt,
      attemptRole: 'repairer',
      qualityRoundIndex: 1,
      parentAttemptRef: `opl://stage_attempts/${reviewer.stage_attempt_id}`,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      priorFindingRefs: ['finding:visual-clipping'],
      ...qualityContextBinding({
        role: 'repairer',
        stageRunId: cycle.stage_run_id,
        qualityCycleId: cycle.quality_cycle_id,
        rubricRefs: sharedAttempt.qualityRubricRefs,
        artifactRefs: ['artifact:deck-v1'],
        artifactHashes: ['sha256:deck-v1'],
        priorFindingRefs: ['finding:visual-clipping'],
        artifactProducerAttemptRef: producerRef,
      }),
    }).attempt;
    const repairerRef = `opl://stage_attempts/${repairer.stage_attempt_id}`;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed', route_impact_json = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify({
      stage_quality_cycle: {
        artifact_refs: ['artifact:deck-v4'],
        artifact_hashes: ['sha256:deck-v4'],
        artifact_identity_receipt_refs: ['receipt:deck-v4'],
      },
    }), repairer.stage_attempt_id);
    db.prepare(`
      INSERT INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      'closeout:repairer-projection',
      repairer.stage_attempt_id,
      JSON.stringify({
        closeout_ref_metadata: [{
          ref: 'artifact:deck-v4',
          sha256: 'sha256:deck-v4',
          artifact_identity_receipt_ref: 'receipt:deck-v4',
        }],
      }),
      '2026-07-13T00:00:30.000Z',
    );
    const decisiveExecutionContentBindingSha256 = `sha256:${'6'.repeat(64)}`;
    const reReviewer = createStageAttempt(db, {
      ...sharedAttempt,
      attemptRole: 're_reviewer',
      qualityRoundIndex: 1,
      parentAttemptRef: repairerRef,
      inputArtifactRefs: ['artifact:deck-v4'],
      reviewedArtifactHashes: ['sha256:deck-v4'],
      priorFindingRefs: ['finding:visual-clipping'],
      repairMapRefs: ['repair-map:finding:visual-clipping'],
      qualityContext: {
        execution_content_binding: {
          binding_sha256: decisiveExecutionContentBindingSha256,
        },
      },
      ...qualityContextBinding({
        role: 're_reviewer',
        stageRunId: cycle.stage_run_id,
        qualityCycleId: cycle.quality_cycle_id,
        rubricRefs: sharedAttempt.qualityRubricRefs,
        artifactRefs: ['artifact:deck-v4'],
        artifactHashes: ['sha256:deck-v4'],
        priorFindingRefs: ['finding:visual-clipping'],
        repairMapRefs: ['repair-map:finding:visual-clipping'],
        artifactProducerAttemptRef: repairerRef,
      }),
    }).attempt;
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: reReviewer.stage_attempt_id,
      executionSessionRef: 'codex://threads/rereview-3',
    });
    db.prepare("UPDATE stage_attempts SET status = 'completed' WHERE stage_attempt_id = ?")
      .run(reReviewer.stage_attempt_id);
    const reReviewerRef = `opl://stage_attempts/${reReviewer.stage_attempt_id}`;
    const selectedStageRoute = {
      decision_kind: 'repeat' as const,
      target_stage_id: 'artifact_creation',
      evidence_refs: ['finding:visual-clipping'],
    };
    const routeDecisionIdentity = buildStageRouteDecisionIdentity({
      parentStageRunId: cycle.stage_run_id,
      decisiveAttemptRef: reReviewerRef,
      decision: selectedStageRoute,
    });
    const targetStageRunId = 'stage-run:rca/artifact-creation-repeat';
    persistReviewExecutionScope(db, {
      stageRunId: targetStageRunId,
      domainId: 'redcube_ai',
      stageId: 'artifact_creation',
      workspaceRoot: projectionWorkspaceRoot,
    });
    db.prepare(`
      UPDATE stage_run_launches SET parent_route_decision_ref = ? WHERE stage_run_id = ?
    `).run(routeDecisionIdentity.parent_route_decision_ref, targetStageRunId);
    const routeLaunchReceiptForTarget = (targetId: string) => {
      const target = db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?')
        .get(targetId) as Record<string, unknown> | undefined;
      assert.ok(target);
      return {
        surface_kind: 'opl_stage_run_route_launch_receipt' as const,
        version: 'opl-stage-run-route-launch-receipt.v1' as const,
        materialization_status: 'launched' as const,
        parent_stage_run_id: cycle.stage_run_id,
        decisive_attempt_ref: reReviewerRef,
        decisive_execution_content_binding_sha256: decisiveExecutionContentBindingSha256,
        parent_route_decision_ref: routeDecisionIdentity.parent_route_decision_ref,
        route_decision_sha256: routeDecisionIdentity.route_decision_sha256,
        decision: selectedStageRoute,
        target_stage_run_id: String(target.stage_run_id),
        target_stage_run_invocation_id: String(target.stage_run_invocation_id),
        target_stage_run_spec_sha256: String(target.stage_run_spec_sha256),
        target_workflow_id: String(target.workflow_id),
        durable_launch: {
          start_status: 'registered',
          launch: {
            domain_id: target.domain_id,
            scope_digest: target.scope_digest ?? null,
          },
        },
        authority_boundary: {
          semantic_route_decision_owner: 'decisive_codex_attempt' as const,
          stage_transition_materialization_owner: 'opl_stage_run_controller' as const,
          opl_can_select_semantic_stage_route: false as const,
        },
      };
    };
    const routeLaunchReceipt = routeLaunchReceiptForTarget(targetStageRunId);
    const state: TemporalStageRunWorkflowState = {
      surface_kind: 'temporal_stage_run_query',
      provider_kind: 'temporal',
      stage_run_id: cycle.stage_run_id,
      workflow_id: 'workflow:rca/artifact-creation',
      quality_cycle_id: cycle.quality_cycle_id,
      domain_id: 'redcube_ai',
      stage_id: 'artifact_creation',
      status: 'completed_with_quality_debt',
      current_role: null,
      repair_rounds_used: 3,
      max_repair_rounds: 3,
      attempts: [{
        attempt_role: 're_reviewer', quality_round_index: 1,
        stage_attempt_id: reReviewer.stage_attempt_id, workflow_id: reReviewer.workflow_id,
        execution_session_ref: 'codex://threads/rereview-3', status: 'completed',
        artifact_producer_attempt_ref: repairerRef,
        artifact_refs: ['artifact:deck-v4'], artifact_hashes: ['sha256:deck-v4'],
        artifact_identity_receipt_refs: ['receipt:deck-v4'],
      }],
      findings: [{
        finding_id: 'finding:visual-clipping', severity: 'critical', required: true,
        evidence_refs: ['screenshot:slide-7-v4'], repair_expectation: 'Remove clipping.',
      }],
      repair_map: [], finding_closures: [], review_receipts: [initialReviewReceipt],
      artifact_refs: ['artifact:deck-v4'], artifact_hashes: ['sha256:deck-v4'],
      artifact_identity_receipt_refs: ['receipt:deck-v4'],
      quality_debt_refs: ['quality-debt:finding:visual-clipping'],
      route_quality_debt_refs: [],
      hard_stop_class: null,
      typed_blocker_refs: [],
      human_gate_refs: [],
      source_attempt_ref: null,
      decisive_attempt_role: 're_reviewer',
      decisive_attempt_ref: reReviewerRef,
      selected_stage_route: selectedStageRoute,
      route_evidence_refs: ['finding:visual-clipping'],
      route_recommendations: [],
      next_stage_run_launch: routeLaunchReceipt,
      blocked_reason: null,
      sqlite_projection: { status: 'pending', error: null },
      started_at: '2026-07-13T00:00:00.000Z', updated_at: '2026-07-13T00:01:00.000Z',
      authority_boundary: {
        opl: 'durable_quality_loop_orchestration_and_refs_transport_only',
        domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
        provider_completion_is_domain_ready: false,
      },
    };
    const first = projectTemporalStageRunQualityCycle(db, state);
    const second = projectTemporalStageRunQualityCycle(db, state);
    assert.equal(first.state.status, 'quality_debt');
    assert.equal(first.state.repair_rounds_used, 3);
    assert.deepEqual(first.state.selected_artifact_refs, ['artifact:deck-v4']);
    assert.equal((first.state as any).controller_readback.decisive_attempt_role, 're_reviewer');
    assert.equal((first.state as any).controller_readback.selected_stage_route.target_stage_id, 'artifact_creation');
    assert.equal(first.current_attempt_ref, null);
    assert.deepEqual(second.state, first.state);
    assert.equal((second.state as any).controller_readback.controller_status, 'completed_with_quality_debt');
    assert.equal((second.state as any).controller_readback.attempts[0].attempt_role, 're_reviewer');
    db.prepare("UPDATE stage_attempts SET route_impact_json = '{}' WHERE stage_attempt_id = ?")
      .run(repairer.stage_attempt_id);
    db.prepare('UPDATE stage_attempt_closeouts SET packet_json = ? WHERE closeout_id = ?').run(JSON.stringify({
      authority_boundary: { opl: 'raw_executor_output_progress_envelope_only' },
      closeout_ref_metadata: [{
        ref: 'artifact:deck-v4', ref_kind: 'raw_executor_output',
        sha256: 'sha256:deck-v4', artifact_identity_receipt_ref: 'receipt:deck-v4',
      }],
    }), 'closeout:repairer-projection');
    assert.deepEqual(projectTemporalStageRunQualityCycle(db, state).state, first.state);
    // The Temporal transport projection re-issues the same framework progress
    // envelope under a transport-only authority marker. The durable readback
    // must still agree with the projected Attempt artifact identity.
    db.prepare('UPDATE stage_attempt_closeouts SET packet_json = ? WHERE closeout_id = ?').run(JSON.stringify({
      authority_boundary: {
        opl: 'temporal_closeout_transport_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
      closeout_ref_metadata: [{
        ref: 'artifact:deck-v4', ref_kind: 'raw_executor_output',
        sha256: 'sha256:deck-v4', artifact_identity_receipt_ref: 'receipt:deck-v4',
      }],
    }), 'closeout:repairer-projection');
    assert.deepEqual(projectTemporalStageRunQualityCycle(db, state).state, first.state);
    const persistedCycleRow = () => ({
      ...db.prepare(`
        SELECT *
        FROM stage_quality_cycles WHERE quality_cycle_id = ?
      `).get(cycle.quality_cycle_id) as Record<string, unknown>,
    });
    const expectProjectionRejectedWithoutCycleMutation = (
      candidate: TemporalStageRunWorkflowState,
      failureCode: string,
    ) => {
      const before = persistedCycleRow();
      assert.throws(
        () => projectTemporalStageRunQualityCycle(db, candidate),
        (error) => error instanceof FrameworkContractError
          && error.details?.failure_code === failureCode,
      );
      assert.deepEqual(persistedCycleRow(), before);
    };

    const tamperedSummary = structuredClone(state);
    tamperedSummary.attempts[0]!.artifact_hashes = ['sha256:forged-deck-v4'];
    expectProjectionRejectedWithoutCycleMutation(
      tamperedSummary,
      'stage_quality_cycle_attempt_artifact_identity_mismatch',
    );

    const forgedReviewReceipt = structuredClone(state);
    forgedReviewReceipt.review_receipts[0]!.producer_session_ref = 'codex://threads/forged-producer';
    expectProjectionRejectedWithoutCycleMutation(
      forgedReviewReceipt,
      'stage_quality_cycle_review_receipt_content_mismatch',
    );

    const missingTarget = structuredClone(state);
    missingTarget.next_stage_run_launch!.target_stage_run_id = 'stage-run:missing-target';
    expectProjectionRejectedWithoutCycleMutation(
      missingTarget,
      'stage_quality_cycle_route_launch_target_mismatch',
    );

    const crossScopeTargetStageRunId = 'stage-run:rca/cross-scope-target';
    persistReviewExecutionScope(db, {
      stageRunId: crossScopeTargetStageRunId,
      stageId: 'artifact_creation',
      domainId: 'redcube_ai',
      studyId: 'study-002',
      workspaceRoot: crossScopeWorkspaceRoot,
    });
    db.prepare(`
      UPDATE stage_run_launches SET parent_route_decision_ref = ? WHERE stage_run_id = ?
    `).run(routeDecisionIdentity.parent_route_decision_ref, crossScopeTargetStageRunId);
    const crossScopeTarget = structuredClone(state);
    crossScopeTarget.next_stage_run_launch = routeLaunchReceiptForTarget(crossScopeTargetStageRunId);
    expectProjectionRejectedWithoutCycleMutation(
      crossScopeTarget,
      'stage_quality_cycle_route_launch_target_mismatch',
    );

    const forgedRouteEnvelope = structuredClone(state);
    forgedRouteEnvelope.next_stage_run_launch!.surface_kind = 'forged_route_launch_receipt' as never;
    expectProjectionRejectedWithoutCycleMutation(
      forgedRouteEnvelope,
      'stage_quality_cycle_route_launch_envelope_mismatch',
    );

    const conflictingCompleteDecision = {
      decision_kind: 'complete' as const,
      evidence_refs: ['finding:visual-clipping'],
    };
    const conflictingCompleteIdentity = buildStageRouteDecisionIdentity({
      parentStageRunId: cycle.stage_run_id,
      decisiveAttemptRef: reReviewerRef,
      decision: conflictingCompleteDecision,
    });
    const conflictingCompleteRoute = structuredClone(state);
    conflictingCompleteRoute.next_stage_run_launch = {
      ...routeLaunchReceipt,
      materialization_status: 'workflow_complete',
      parent_route_decision_ref: conflictingCompleteIdentity.parent_route_decision_ref,
      route_decision_sha256: conflictingCompleteIdentity.route_decision_sha256,
      decision: conflictingCompleteDecision,
      target_stage_run_id: null,
      target_stage_run_invocation_id: null,
      target_stage_run_spec_sha256: null,
      target_workflow_id: null,
      durable_launch: null,
    };
    expectProjectionRejectedWithoutCycleMutation(
      conflictingCompleteRoute,
      'stage_quality_cycle_route_launch_envelope_mismatch',
    );

    const humanGate = projectTemporalStageRunQualityCycle(db, {
      ...state,
      status: 'human_gate',
      hard_stop_class: 'human_decision_required',
      typed_blocker_refs: [],
      human_gate_refs: ['human-gate:publication-owner'],
      source_attempt_ref: reReviewerRef,
      blocked_reason: 'publication owner decision required',
    });
    const readback = (humanGate.state as any).controller_readback;
    assert.equal(readback.hard_stop_class, 'human_decision_required');
    assert.deepEqual(readback.typed_blocker_refs, []);
    assert.deepEqual(readback.human_gate_refs, ['human-gate:publication-owner']);
    assert.equal(readback.source_attempt_ref, reReviewerRef);
  } finally {
    db.close();
    fs.rmSync(projectionWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(crossScopeWorkspaceRoot, { recursive: true, force: true });
  }
});

test('official profile conformance requires isolated review policies and a Meta Review path without affecting generic Agents', () => {
  const stage = (stageId: string, nextStageRefs: string[], extras: Record<string, unknown> = {}) => ({
    stage_id: stageId,
    stage_kind: 'creation',
    title: stageId,
    summary: stageId,
    goal: stageId,
    owner: 'sample',
    domain_stage_refs: [], inputs: [], knowledge_refs: [], skills: [], prompt_refs: [],
    allowed_action_refs: [], outputs: [], evaluation: [], source_refs: [],
    handoff: { next_stage_refs: nextStageRefs }, freshness: null, action_parity: null,
    stage_contract: null, trust_boundary: null,
    independent_gate_policy: { execution_review_separation_required: true },
    authority_boundary: { opl_role: 'projection_consumer_only' },
    ...extras,
  });
  const generic = {
    surface_kind: 'family_stage_control_plane' as const,
    version: 'family-stage-control-plane.v1' as const,
    plane_id: 'generic', target_domain_id: 'generic', owner: 'generic',
    authority_boundary: {}, notes: [],
    stages: [stage('produce', [])],
  };
  const genericCodes = buildFamilyStageConformanceReview(generic as any).findings.map((finding) => finding.code);
  assert.equal(genericCodes.some((code) => code.startsWith('official_quality_profile_')), false);

  const official = {
    ...generic,
    quality_governance_profile_ref:
      'contracts/opl-framework/official-knowledge-deliverable-quality-profile.json',
    meta_review_policy_ref: 'contracts/stage_quality_cycle_policy.json#/meta_review_policy',
    stages: [
      stage('produce', ['meta'], { stage_quality_cycle_policy_ref: 'policy:produce' }),
      stage('meta', ['handoff'], {
        stage_kind: 'review',
        stage_role: 'cross_stage_meta_review',
        stage_quality_cycle_policy_ref: 'policy:meta',
      }),
      stage('handoff', [], { stage_kind: 'operator_gate', trust_boundary: { lane: 'human_gate' } }),
    ],
  };
  const officialCodes = buildFamilyStageConformanceReview(official as any).findings.map((finding) => finding.code);
  assert.equal(officialCodes.some((code) => code.startsWith('official_quality_profile_')), false);
});
