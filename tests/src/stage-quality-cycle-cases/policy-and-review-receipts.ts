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
test('official quality profile is explicit without adding per-agent registry policy', () => {
  const bound = STANDARD_AGENT_REGISTRY
    .filter((entry) => 'quality_governance_profile' in entry)
    .map((entry) => entry.agent_id);
  assert.deepEqual(bound, []);
  assert.equal(OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE.profile_id,
    'official_high_value_knowledge_deliverable.v1');
  const contract = JSON.parse(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/stage-quality-cycle-contract.json',
  ), 'utf8'));
  assert.equal(contract.terminology.in_thread_refinement.includes('not Stage Review'), true);
  assert.equal(contract.policy.protocol_closeout_resume_consumes_quality_budget, false);
  assert.equal(contract.policy.repair_failure_with_prior_consumable_artifact, 'completed_with_quality_debt');
  assert.equal(contract.policy.literal_zero_consumable_artifact, 'hard_stop');
  assert.deepEqual(contract.stage_attempt_roles, ['producer', 'reviewer', 'repairer', 're_reviewer']);
  assert.deepEqual(contract.attempt_outcome_contract.canonical_values, STAGE_QUALITY_OUTCOMES);
  assert.equal(contract.attempt_outcome_contract.attempt_verdict_field_forbidden, true);
  assert.deepEqual(
    contract.attempt_outcome_contract.role_required_fields.re_reviewer,
    ['outcome'],
  );
  assert.deepEqual(
    contract.attempt_outcome_contract.review_outcome_dependent_fields.non_hard_stop_re_reviewer,
    ['finding_closures', 'repair_regressions', 'critical_new_findings', 'optional_observations'],
  );
  assert.equal(contract.attempt_outcome_contract.hard_stop_review_must_not_fabricate_finding_closure_result, true);
  assert.equal(contract.stage_run_controller.maximum_attempt_instances, 8);
  assert.equal(
    contract.stage_run_controller
      .stage_run_spec_quality_policy_and_declared_stage_ids_are_historical_after_creation,
    true,
  );
  assert.equal(contract.stage_run_controller.new_attempt_execution_content_binding_is_effective_control_policy, true);
  assert.equal(
    contract.stage_run_controller.formal_review_requirement_source,
    'producer_attempt_execution_content_binding',
  );
  assert.equal(contract.cross_stage_route_selection.primary_only_decisive_attempt_role, 'producer');
  assert.deepEqual(
    contract.cross_stage_route_selection.formal_review_decisive_attempt_roles,
    ['reviewer', 're_reviewer'],
  );
  assert.equal(contract.cross_stage_route_selection.repairer_can_make_terminal_route_selection, false);
  assert.equal(contract.cross_stage_route_selection.opl_transition_approval_or_rejection_authority, false);
  assert.equal(contract.cross_stage_route_selection.opl_domain_semantic_route_judgment_authority, false);
  assert.equal(contract.cross_stage_route_selection.opl_route_output_abi_validation_required, true);
  assert.equal(contract.cross_stage_route_selection.runtime_closeout_guard_required, true);
  assert.equal(
    contract.cross_stage_route_selection.attempt_route_context_declared_stage_ids_source,
    'attempt_execution_content_binding',
  );
  assert.equal(
    contract.cross_stage_route_selection.route_launch_declared_stage_validation_source,
    'decisive_attempt_execution_content_binding',
  );
  assert.equal(
    contract.cross_stage_route_selection.historical_parent_declared_stage_ids_can_reject_current_target,
    false,
  );
  assert.equal(contract.review_receipt.review_receipt_rubric_source,
    'reviewer_attempt_execution_content_binding');
  assert.equal(contract.review_receipt.producer_and_reviewer_rubric_equality_required, false);
  assert.equal(
    contract.context_isolation.review_input_snapshot
      .present_invalid_request_fails_closed_before_reviewer_attempt_creation,
    true,
  );
  assert.equal(
    contract.context_isolation.review_input_snapshot
      .missing_request_adds_quality_debt_without_overwriting_reviewer_outcome_findings_or_hard_stop,
    true,
  );
  assert.equal(
    contract.review_receipt.review_transport_binding
      .review_evidence_artifact_defines_cache_reuse_or_domain_verdict,
    false,
  );
  assert.equal(
    contract.cross_stage_route_selection
      .repair_required_review_or_re_review_may_select_cross_stage_route_back_before_budget_exhaustion,
    true,
  );
  assert.equal(
    contract.cross_stage_route_selection
      .repair_required_cross_stage_route_back_requires_target_different_from_current_stage,
    true,
  );
  assert.equal(
    contract.cross_stage_route_selection
      .repair_required_review_or_re_review_may_select_other_terminal_route_before_budget_exhaustion,
    false,
  );
  assert.equal(
    contract.cross_stage_route_selection
      .repair_required_review_or_re_review_may_select_terminal_route_after_budget_exhaustion,
    true,
  );
  assert.equal(
    contract.cross_stage_route_selection
      .same_stage_repair_required_with_budget_remaining_continues_quality_loop,
    true,
  );
  assert.equal(
    contract.cross_stage_route_selection
      .cross_stage_route_back_requires_narrowest_canonical_owner_stage,
    true,
  );
  assert.deepEqual(
    contract.cross_stage_route_selection.domain_prompt_conformance
      .reviewer_and_re_reviewer_required_markers,
    [],
  );
  assert.equal(
    contract.cross_stage_route_selection.domain_prompt_conformance
      .repair_required_prompt_refs_must_carry_both_markers,
    false,
  );
  assert.deepEqual(
    contract.cross_stage_route_selection.domain_prompt_conformance
      .scoped_route_authority_fields_required,
    [
      'primary_only_decisive_attempt_role',
      'formal_review_decisive_attempt_roles',
      'repairer_can_be_decisive_attempt',
    ],
  );
  assert.deepEqual(
    contract.cross_stage_route_selection.domain_prompt_conformance
      .ambiguous_policy_fields_forbidden,
    [
      'repair_required_with_budget_remaining_route_output',
      'producer_or_repairer_may_return_terminal_route_decision',
    ],
  );
  assert.equal(contract.cross_stage_route_selection.hard_stop_attempt_may_select_terminal_route, false);
  assert.equal(
    contract.policy.content_addressed_no_output_or_failure_diagnostic_counts_as_consumable_progress_artifact,
    true,
  );
  assert.equal(
    contract.policy.content_addressed_no_output_or_failure_diagnostic_counts_as_stage_quality_candidate,
    true,
  );
  assert.equal(contract.policy.literal_zero_stage_quality_candidate_ignores_progress_diagnostic, false);
  assert.deepEqual(contract.cross_stage_route_selection.route_abi_rejection_conditions, [
    'non_decisive_attempt_writes_terminal_decision',
    'decision_and_recommendation_both_present',
    'route_output_shape_invalid',
    'legacy_terminal_route_field_present',
    'target_stage_not_declared',
    'producer_or_repairer_writes_reviewer_only_outcome',
    'hard_stop_attempt_writes_terminal_decision',
    'review_or_re_review_not_terminal',
  ]);
  assert.deepEqual(contract.cross_stage_route_selection.legacy_terminal_route_fields_forbidden, [
    'route_back_stage_ref',
    'selected_next_stage_ref',
    'next_stage_ref',
    'workflow_complete',
  ]);
  assert.deepEqual(contract.cross_stage_route_selection.route_output_contract.decision_kind_values, [
    'advance', 'skip', 'repeat', 'reverse', 'route_back', 'complete',
  ]);
  assert.equal(
    contract.cross_stage_route_selection.invalid_route_output_is_rejected_without_discarding_consumable_progress,
    true,
  );
  assert.equal(contract.handoff_review_boundary.required_for_stage_kind, 'packaging');
  assert.deepEqual(contract.handoff_review_boundary.formal_review_required_if_any_true, [
    'artifact_effect=new_or_transformed_reviewable_bytes',
    'freezes_canonical_artifact_bytes',
    'issues_quality_export_publication_or_ready_claim',
  ]);
  assert.equal(contract.handoff_review_boundary.formal_review_required_implies_quality_cycle_enabled, true);
  const attemptContract = JSON.parse(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/family-runtime-attempt-contract.json',
  ), 'utf8'));
  for (const field of [
    'stage_run_id', 'quality_cycle_id', 'attempt_role', 'quality_round_index',
    'parent_attempt_ref', 'input_artifact_refs', 'reviewed_artifact_hashes',
    'quality_source_refs', 'quality_rubric_refs', 'prior_finding_refs', 'repair_map_refs',
    'quality_role_prompt_ref', 'execution_session_ref', 'context_manifest_ref',
    'no_context_inheritance',
  ]) {
    assert.ok(attemptContract.required_ledger_fields.includes(field), field);
  }
  assert.equal(attemptContract.stage_quality_cycle_contract.stage_run_workflow_is_stage_attempt_alias, false);
});

test('review context manifest permits exact refs and forbids conversation inheritance', () => {
  const manifest = buildStageReviewContextManifest({
    stageRunId: 'stage-run:deck/artifact-creation',
    qualityCycleId: 'quality-cycle:deck/artifact-creation',
    reviewerAttemptRole: 'reviewer',
    stageGoalRefs: ['goal:deck'],
    artifactRefs: ['artifact:deck-v1'],
    artifactHashes: ['sha256:deck-v1'],
    sourceRefs: ['source:brief'],
    qualityRubricRefs: ['rubric:visual'],
  });
  assert.equal(manifest.no_context_inheritance, true);
  assert.ok(manifest.forbidden_context_kinds.includes('producer_conversation_history'));
  assert.deepEqual(manifest.artifact_refs, ['artifact:deck-v1']);
});

test('artifact identity preserves distinct refs that share the same content hash', () => {
  const identity = normalizeStageQualityArtifactIdentity({
    artifactRefs: ['artifact:copy-a', 'artifact:copy-b'],
    artifactHashes: ['sha256:shared', 'sha256:shared'],
  });
  assert.deepEqual(identity, {
    artifact_refs: ['artifact:copy-a', 'artifact:copy-b'],
    artifact_hashes: ['sha256:shared', 'sha256:shared'],
  });
  assert.doesNotThrow(() => buildStageReviewContextManifest({
    stageRunId: 'stage-run:shared-hash',
    qualityCycleId: 'quality-cycle:shared-hash',
    reviewerAttemptRole: 'reviewer',
    artifactRefs: identity.artifact_refs,
    artifactHashes: identity.artifact_hashes,
    qualityRubricRefs: ['rubric:quality'],
  }));
  assert.throws(() => normalizeStageQualityArtifactIdentity({
    artifactRefs: ['artifact:duplicate', 'artifact:duplicate'],
    artifactHashes: ['sha256:v1', 'sha256:v2'],
  }), /artifact_refs contains a duplicate id/);
});

test('formal review rejects shared provider sessions even when the same model is allowed', () => {
  assert.throws(() => validateIndependentStageReviewReceipt({
    surface_kind: 'opl_stage_review_receipt',
    version: 'stage-review-receipt.v1',
    stage_run_id: 'stage-run:1',
    quality_cycle_id: 'quality-cycle:1',
    producer_attempt_ref: 'attempt:producer',
    reviewer_attempt_ref: 'attempt:reviewer',
    producer_session_ref: 'codex://threads/shared',
    reviewer_session_ref: 'codex://threads/shared',
    no_context_inheritance: true,
    reviewed_artifact_refs: ['artifact:v1'],
    reviewed_artifact_hashes: ['sha256:v1'],
    rubric_refs: ['rubric:quality'],
    verdict: 'pass',
    review_input_snapshot_status: 'quality_debt',
    review_input_snapshot_binding: null,
    opl_reviewer_input_snapshot_manifest_ref: null,
    opl_reviewer_input_snapshot_manifest: null,
    review_input_snapshot_quality_debt_receipt_ref: 'quality-debt:snapshot',
    review_input_snapshot_quality_debt_receipt: {
      surface_kind: 'opl_review_input_snapshot_quality_debt_receipt',
    },
    opl_review_evidence_artifact_receipt_ref: null,
    opl_review_evidence_artifact_receipt: null,
    finding_lineage: {
      review_kind: 'initial_review',
      finding_ids: [],
      findings_sha256: `sha256:${'0'.repeat(64)}`,
      repair_map_sha256: null,
      re_review_result_sha256: null,
    },
  }), (error) => error instanceof FrameworkContractError
    && /new provider session/.test(error.message));
});

test('review receipt runtime rejects invalid identity, surface, verdict, and lineage digests', () => {
  assert.doesNotThrow(() => validateIndependentStageReviewReceipt(reviewReceipt()));
  const invalidCases = [
    { overrides: { surface_kind: 'wrong' }, message: /surface kind and version/ },
    { overrides: { version: 'wrong' }, message: /surface kind and version/ },
    { overrides: { stage_run_id: '' }, message: /stage_run_id must be a non-empty string/ },
    {
      overrides: { reviewer_attempt_ref: 'opl://stage_attempts/producer' },
      message: /distinct producer and reviewer Attempts/,
    },
    { overrides: { verdict: 'blocked' }, message: /verdict is invalid/ },
    {
      overrides: {
        finding_lineage: {
          review_kind: 'initial_review',
          finding_ids: [],
          findings_sha256: null,
          repair_map_sha256: null,
          re_review_result_sha256: null,
        },
      },
      message: /findings_sha256 must be a canonical SHA-256 digest/,
    },
  ];
  for (const invalidCase of invalidCases) {
    assert.throws(
      () => validateIndependentStageReviewReceipt(reviewReceipt(invalidCase.overrides)),
      (error) => error instanceof FrameworkContractError && invalidCase.message.test(error.message),
    );
  }
});

test('re-review receipt binds a result digest only for non-hard-stop outcomes', () => {
  const findingLineage = {
    review_kind: 'finding_closure_review',
    finding_ids: ['finding:required'],
    findings_sha256: `sha256:${'1'.repeat(64)}`,
    repair_map_sha256: `sha256:${'2'.repeat(64)}`,
    re_review_result_sha256: `sha256:${'3'.repeat(64)}`,
  };
  assert.doesNotThrow(() => validateIndependentStageReviewReceipt(reviewReceipt({ finding_lineage: findingLineage })));
  assert.throws(() => validateIndependentStageReviewReceipt(reviewReceipt({
    finding_lineage: { ...findingLineage, re_review_result_sha256: null },
  })), /Non-hard-stop finding-closure Review receipt requires/);
  assert.doesNotThrow(() => validateIndependentStageReviewReceipt(reviewReceipt({
    verdict: 'hard_stop',
    finding_lineage: { ...findingLineage, re_review_result_sha256: null },
  })));
  assert.throws(() => validateIndependentStageReviewReceipt(reviewReceipt({
    verdict: 'hard_stop',
    finding_lineage: findingLineage,
  })), /Hard-stop Re-review receipt cannot bind/);
});

test('quality cycle counts repair plus fresh re-review rounds and carries debt after round three', () => {
  let state = initialStageQualityCycleState({
    stageRunId: 'stage-run:1',
    qualityCycleId: 'quality-cycle:1',
  });
  state = reduceStageQualityCycleState(state, { kind: 'producer_completed', artifact_refs: ['artifact:v0'] });
  for (let round = 1; round <= 3; round += 1) {
    state = reduceStageQualityCycleState(state, {
      kind: 'review_completed',
      verdict: 'repair_required',
      quality_debt_refs: [`finding:round-${round}`],
    });
    state = reduceStageQualityCycleState(state, {
      kind: 'repair_completed',
      artifact_refs: [`artifact:v${round}`],
    });
  }
  state = reduceStageQualityCycleState(state, {
    kind: 'review_completed',
    verdict: 'repair_required',
    quality_debt_refs: ['finding:remaining'],
  });
  assert.equal(state.status, 'quality_debt');
  assert.equal(state.repair_rounds_used, 3);
  assert.deepEqual(state.selected_artifact_refs, ['artifact:v3']);
});

test('re-review closes stable findings and does not reopen the loop for optional observations', () => {
  const finding = {
    finding_id: 'finding:claim-overreach',
    severity: 'major' as const,
    required: true,
    evidence_refs: ['evidence:claim-12'],
    repair_expectation: 'Narrow claim 12 to the supported population.',
  };
  const closure = evaluateStageQualityFindingClosure({
    findings: [finding],
    repairMap: [{
      finding_id: finding.finding_id,
      repair_status: 'repaired',
      changed_artifact_refs: ['artifact:manuscript-v2'],
      repair_evidence_refs: ['diff:claim-12'],
    }],
    reReview: {
      finding_closures: [{
        finding_id: finding.finding_id,
        status: 'closed',
        evidence_refs: ['evidence:claim-12-v2'],
      }],
      repair_regressions: [],
      critical_new_findings: [],
      optional_observations: [{
        observation_id: 'observation:wording',
        evidence_refs: ['artifact:manuscript-v2'],
        summary: 'A later editorial pass could shorten one sentence.',
      }],
    },
  });
  assert.equal(closure.trigger_repair, false);
  assert.equal(closure.optional_observations_do_not_trigger_repair, true);
  assert.deepEqual(closure.optional_observation_ids, ['observation:wording']);
});

test('initial reviewer outcome agrees with required finding state', () => {
  const requiredFinding = {
    finding_id: 'finding:required',
    severity: 'major' as const,
    required: true,
    evidence_refs: ['evidence:required'],
    repair_expectation: 'Repair the required finding.',
  };
  assert.throws(() => validateInitialStageQualityReviewOutcome({
    outcome: 'repair_required',
    findings: [],
  }), /requires at least one required finding/);
  for (const outcome of ['pass', 'quality_debt'] as const) {
    assert.throws(() => validateInitialStageQualityReviewOutcome({
      outcome,
      findings: [requiredFinding],
    }), /cannot carry an open required finding/);
  }
  assert.deepEqual(validateInitialStageQualityReviewOutcome({
    outcome: 'quality_debt',
    findings: [{ ...requiredFinding, finding_id: 'finding:optional', required: false }],
  }).map((finding) => finding.finding_id), ['finding:optional']);
});

test('producer and repairer cannot return reviewer outcome or receipt verdict fields', () => {
  for (const attemptRole of ['producer', 'repairer'] as const) {
    assert.equal(stageQualityAttemptOutcomeFromEnvelope({ attemptRole, envelope: {} }), null);
    for (const forbiddenField of ['outcome', 'verdict'] as const) {
      assert.throws(() => stageQualityAttemptOutcomeFromEnvelope({
        attemptRole,
        envelope: { [forbiddenField]: 'pass' },
      }), /must not return outcome or verdict/);
    }
  }
});

test('repair-trigger findings are required and unique across closure collections', () => {
  const finding = {
    finding_id: 'finding:prior',
    severity: 'major' as const,
    required: true,
    evidence_refs: ['evidence:prior'],
    repair_expectation: 'Close the prior finding.',
  };
  const base = {
    findings: [finding],
    repairMap: [{
      finding_id: finding.finding_id,
      repair_status: 'repaired' as const,
      changed_artifact_refs: ['artifact:v2'],
      repair_evidence_refs: ['diff:v2'],
    }],
  };
  const closed = [{
    finding_id: finding.finding_id,
    status: 'closed' as const,
    evidence_refs: ['evidence:closed'],
  }];
  const regression = {
    ...finding,
    finding_id: 'finding:regression',
    required: false,
  };
  assert.throws(() => evaluateStageQualityFindingClosure({
    ...base,
    reReview: {
      finding_closures: closed,
      repair_regressions: [regression],
      critical_new_findings: [],
      optional_observations: [],
    },
  }), /repair_regressions.*required=true/);
  assert.throws(() => evaluateStageQualityFindingClosure({
    ...base,
    reReview: {
      finding_closures: closed,
      repair_regressions: [],
      critical_new_findings: [{
        ...regression,
        finding_id: 'finding:critical-new',
        severity: 'critical',
      }],
      optional_observations: [],
    },
  }), /critical_new_findings.*required=true/);
  assert.throws(() => evaluateStageQualityFindingClosure({
    ...base,
    reReview: {
      finding_closures: closed,
      repair_regressions: [{ ...finding }],
      critical_new_findings: [],
      optional_observations: [],
    },
  }), /finding_ids_across_prior_regression_and_critical_new_collections contains a duplicate id/);
});

test('re-review triggers another repair only for open required findings, regressions, or critical findings', () => {
  const finding = {
    finding_id: 'finding:visual-clipping',
    severity: 'critical' as const,
    required: true,
    evidence_refs: ['screenshot:slide-7-v1'],
    repair_expectation: 'Remove clipping without changing the approved claim.',
  };
  const closure = evaluateStageQualityFindingClosure({
    findings: [finding],
    repairMap: [{
      finding_id: finding.finding_id,
      repair_status: 'repaired',
      changed_artifact_refs: ['artifact:slide-7-v2'],
      repair_evidence_refs: ['screenshot:slide-7-v2'],
    }],
    reReview: {
      finding_closures: [{
        finding_id: finding.finding_id,
        status: 'partially_closed',
        evidence_refs: ['screenshot:slide-7-v2'],
      }],
      repair_regressions: [],
      critical_new_findings: [],
      optional_observations: [],
    },
  });
  assert.equal(closure.trigger_repair, true);
  assert.deepEqual(closure.open_required_finding_ids, [finding.finding_id]);
});

test('same-thread closeout resume is protocol completion rather than review', () => {
  assert.deepEqual(classifyCodexSessionContinuation({
    attemptRole: 'reviewer',
    resumedThreadId: 'thread:reviewer',
  }), {
    continuation_kind: 'protocol_closeout_resume',
    counts_as_review_attempt: false,
    consumes_quality_revision_budget: false,
  });
});

test('formal reviewer prompt binds isolated context and exact artifact identity', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_review_prompt',
      stage_run_id: 'stage-run:rca/artifact-creation',
      quality_cycle_id: 'quality-cycle:rca/artifact-creation',
      attempt_role: 'reviewer',
      quality_round_index: 0,
      stage_id: 'artifact_creation',
      workspace_locator: { workspace_root: '/tmp/rca-quality-cycle' },
      checkpoint_refs: ['packet:artifact-creation'],
      input_artifact_refs: ['artifact:deck-v1'],
      reviewed_artifact_hashes: ['sha256:deck-v1'],
      context_manifest_ref: 'manifest:review-context-v1',
      no_context_inheritance: true,
      quality_context: {
        context_manifest: buildStageReviewInputSnapshotContext({
          stageRunId: 'stage-run:rca/artifact-creation',
          qualityCycleId: 'quality-cycle:rca/artifact-creation',
          reviewerAttemptRole: 'reviewer',
          resolution: resolveReviewerInputSnapshotMaterialization(null),
        }),
      },
    },
  });
  const prompt = activity.runner_status.command_preview.join('\n');
  assert.match(prompt, /formal context-isolated review attempt in a new provider thread/);
  assert.match(prompt, /Do not resume, recover, inspect, or inherit the producer or repairer conversation/);
  assert.match(prompt, /Context manifest ref: manifest:review-context-v1/);
  assert.match(prompt, /Exact artifact refs: \["artifact:deck-v1"\]/);
  assert.match(prompt, /Expected artifact hashes: \["sha256:deck-v1"\]/);
  assert.match(prompt, /Do not produce a repair_map/);
  assert.match(prompt, /terminal reviewer or re-reviewer/);
  assert.match(prompt, /decisive Codex Attempt for cross-Stage semantic route selection/);
  assert.match(prompt, /progress-terminal decisive Attempt/);
  assert.match(prompt, /only terminal route allowed before repair-budget exhaustion for repair_required/);
  assert.match(prompt, /blocked or human_gate reviewer outcome must return blocked_reason, a canonical hard_stop_class/);
  assert.match(prompt, /stage_route_contract is controller-owned validation metadata/);
  assert.match(prompt, /stage_quality_cycle\.outcome, with exactly one of: pass, repair_required, quality_debt, blocked, human_gate/);
  assert.match(prompt, /For a non-hard-stop reviewer outcome, required route_impact\.stage_quality_cycle fields are outcome and findings/);
  assert.match(prompt, /or fabricate findings, finding closures, or a Re-review result/);
  assert.match(prompt, /Review receipt verdict is generated by the OPL StageRun controller/);
  assert.match(prompt, /cannot write a Stage current pointer or materialize a Stage transition/);
  assert.match(prompt, /live artifact refs and source refs above are identity\/provenance checks only/);
  assert.match(prompt, /Read review content only from opl_reviewer_input_snapshot_manifest\.members\[\]\.immutable_ref/);
  assert.match(prompt, /controller attaches snapshot quality debt independently/);
  assert.doesNotMatch(prompt, /return outcome=quality_debt/);
});

test('Re-review prompt requires closure fields only for non-hard-stop outcomes', () => {
  const activity = buildCodexStageActivityInput({
    attempt: {
      stage_attempt_id: 'sat_re_review_prompt',
      stage_run_id: 'stage-run:re-review-prompt',
      quality_cycle_id: 'quality-cycle:re-review-prompt',
      attempt_role: 're_reviewer',
      quality_round_index: 1,
      stage_id: 'review',
      workspace_locator: { workspace_root: '/tmp/re-review-prompt' },
      checkpoint_refs: ['packet:re-review'],
      input_artifact_refs: ['artifact:repaired'],
      reviewed_artifact_hashes: ['sha256:repaired'],
      prior_finding_refs: ['finding:required'],
      repair_map_refs: ['repair-map:finding:required'],
      context_manifest_ref: 'manifest:re-review-context',
      no_context_inheritance: true,
    },
  });
  const prompt = activity.runner_status.command_preview.join('\n');
  assert.match(prompt, /For a non-hard-stop re_reviewer outcome, required route_impact\.stage_quality_cycle fields are outcome, finding_closures/);
  assert.match(prompt, /For outcome=blocked or outcome=human_gate, return only outcome plus the required hard-stop evidence; do not fabricate a finding-closure result/);
});
