import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import {
  buildStageReviewContextManifest,
  classifyCodexSessionContinuation,
  evaluateStageQualityFindingClosure,
  initialStageQualityCycleState,
  normalizeStageQualityCyclePolicy,
  reduceStageQualityCycleState,
  validateIndependentStageReviewReceipt,
} from '../../src/modules/stagecraft/stage-quality-cycle.ts';
import { buildFamilyStageConformanceReview } from '../../src/modules/stagecraft/family-stage-conformance.ts';
import {
  bindStageAttemptExecutionSession,
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
  validatePersistedStageReviewIsolation,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { buildCodexStageActivityInput } from '../../src/modules/runway/family-runtime-codex-stage-runner.ts';
import {
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageRunWorkflowState,
} from '../../src/modules/runway/family-runtime-temporal.ts';
import {
  createStageQualityCycle,
  projectTemporalStageRunQualityCycle,
} from '../../src/modules/runway/family-runtime-stage-quality-cycle.ts';
import { requireStageQualityAttemptBoundary } from '../../src/modules/runway/family-runtime-stage-quality-attempt-boundary.ts';
import {
  deriveStageRunId,
  stageRunSpecSha256,
  type StageRunImmutableSpec,
} from '../../src/modules/runway/family-runtime-stage-run-identity.ts';
import { OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE } from '../../src/modules/pack/standard-agent-stage-manifest.ts';
import {
  STANDARD_AGENT_REGISTRY,
} from '../../src/kernel/standard-agent-registry.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

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
  assert.deepEqual(contract.stage_attempt_roles, ['producer', 'reviewer', 'repairer', 're_reviewer']);
  assert.equal(contract.stage_run_controller.maximum_attempt_instances, 8);
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
  assert.equal(contract.cross_stage_route_selection.repair_required_review_may_select_terminal_route, false);
  assert.equal(contract.cross_stage_route_selection.hard_stop_attempt_may_select_terminal_route, false);
  assert.deepEqual(contract.cross_stage_route_selection.route_abi_rejection_conditions, [
    'non_decisive_attempt_writes_terminal_decision',
    'decision_and_recommendation_both_present',
    'route_output_shape_invalid',
    'legacy_terminal_route_field_present',
    'target_stage_not_declared',
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
  }), (error) => error instanceof FrameworkContractError
    && /new provider session/.test(error.message));
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
  assert.equal(closure.optional_observations_are_quality_debt_only, true);
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
  assert.match(prompt, /A hard stop returns the applicable typed blocker or human-gate closeout/);
  assert.match(prompt, /stage_route_contract is controller-owned validation metadata/);
});

test('every quality-cycle role launches through a fresh codex exec command', () => {
  for (const role of ['producer', 'reviewer', 'repairer', 're_reviewer'] as const) {
    const reviewRole = role === 'reviewer' || role === 're_reviewer';
    const activity = buildCodexStageActivityInput({
      attempt: {
        stage_attempt_id: `sat_${role}`,
        stage_run_id: 'stage-run:quality-cycle',
        quality_cycle_id: 'quality-cycle:quality-cycle',
        attempt_role: role,
        quality_round_index: role === 're_reviewer' ? 1 : 0,
        stage_id: 'quality-cycle-stage',
        workspace_locator: { workspace_root: '/tmp/quality-cycle' },
        checkpoint_refs: ['packet:quality-cycle'],
        ...(reviewRole
          ? {
              input_artifact_refs: [`artifact:${role}`],
              reviewed_artifact_hashes: [`sha256:${role}`],
              context_manifest_ref: `manifest:${role}`,
              no_context_inheritance: true,
            }
          : {}),
      },
    });
    assert.deepEqual(activity.runner_status.command_preview.slice(0, 2), ['codex', 'exec']);
    assert.equal(activity.runner_status.command_preview[2], '--skip-git-repo-check');
    assert.equal(activity.runner_status.command_preview.includes('resume'), false);
    const prompt = activity.runner_status.command_preview.join('\n');
    if (role === 'producer') {
      assert.match(prompt, /producer is the decisive cross-Stage semantic route selector only when this StageRun is primary-only/);
    }
    if (role === 'repairer') {
      assert.match(prompt, /Do not make a terminal Stage transition decision/);
    }
  }
});

test('persisted reviewer attempt proves separate session and isolated context', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const shared = {
      domainId: 'redcube' as const,
      stageId: 'artifact_creation',
      providerKind: 'temporal' as const,
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      sourceFingerprint: 'sha256:source',
      stageRunId: 'stage-run:rca/artifact-creation',
      qualityCycleId: 'quality-cycle:rca/artifact-creation',
      qualityRolePromptRef: 'prompt:quality-role',
      qualityRubricRefs: ['rubric:visual'],
      contextManifestRef: 'manifest:quality-context',
      noContextInheritance: true,
    };
    const producer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'producer',
      qualityRoundIndex: 0,
      newAttempt: true,
    }).attempt;
    const reviewer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'reviewer',
      qualityRoundIndex: 0,
      parentAttemptRef: `opl://stage_attempts/${producer.stage_attempt_id}`,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      contextManifestRef: 'manifest:review-context-v1',
      noContextInheritance: true,
      newAttempt: true,
    }).attempt;
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: producer.stage_attempt_id,
      executionSessionRef: 'codex://threads/producer',
    });
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: reviewer.stage_attempt_id,
      executionSessionRef: 'codex://threads/reviewer',
    });
    assert.deepEqual(validatePersistedStageReviewIsolation(db, {
      producerAttemptId: producer.stage_attempt_id,
      reviewerAttemptId: reviewer.stage_attempt_id,
      rubricRefs: ['rubric:visual'],
      verdict: 'pass',
    }), {
      valid: true,
      context_isolation_verified: true,
      reviewer_session_diff_verified: true,
    });
  } finally {
    db.close();
  }
});

test('persisted reviewer isolation rejects a shared producer session', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const shared = {
      domainId: 'redcube' as const,
      stageId: 'artifact_creation',
      providerKind: 'temporal' as const,
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      sourceFingerprint: 'sha256:source',
      stageRunId: 'stage-run:rca/artifact-creation',
      qualityCycleId: 'quality-cycle:rca/artifact-creation',
      newAttempt: true,
      qualityRolePromptRef: 'prompt:quality-role',
      qualityRubricRefs: ['rubric:visual'],
      contextManifestRef: 'manifest:quality-context',
      noContextInheritance: true,
    };
    const producer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'producer',
    }).attempt;
    const reviewer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'reviewer',
      parentAttemptRef: `opl://stage_attempts/${producer.stage_attempt_id}`,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      contextManifestRef: 'manifest:review-context-v1',
      noContextInheritance: true,
    }).attempt;
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: producer.stage_attempt_id,
      executionSessionRef: 'codex://threads/shared',
    });
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: reviewer.stage_attempt_id,
      executionSessionRef: 'codex://threads/shared',
    });
    assert.throws(() => validatePersistedStageReviewIsolation(db, {
      producerAttemptId: producer.stage_attempt_id,
      reviewerAttemptId: reviewer.stage_attempt_id,
      rubricRefs: ['rubric:visual'],
      verdict: 'pass',
    }), /new provider session/);
  } finally {
    db.close();
  }
});

test('Temporal terminal sync persists the observed Codex execution session identity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      sourceFingerprint: 'sha256:source',
      stageRunId: 'stage-run:rca/artifact-creation',
      qualityCycleId: 'quality-cycle:rca/artifact-creation',
      attemptRole: 'producer',
      qualityRolePromptRef: 'prompt:producer',
      qualityRubricRefs: ['rubric:visual'],
      contextManifestRef: 'manifest:producer-context',
      noContextInheritance: true,
      newAttempt: true,
    }).attempt;
    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'redcube',
        stage_id: 'artifact_creation',
        status: 'blocked',
        activity_events: [{
          activity_kind: 'codex_stage_activity',
          progress_summary: {
            thread_id: 'thread-temporal-producer',
            execution_session_ref: 'codex://threads/thread-temporal-producer',
          },
        }],
        checkpoint_refs: [], closeout_refs: [], consumed_refs: [], consumed_memory_refs: [],
        writeback_receipt_refs: [], rejected_writes: [], route_impact: {}, human_gate_refs: [], signals: [],
        closeout_packet: { blocked_reason: 'typed_closeout_packet_required' },
        completion_boundary: {
          provider_completion: 'not_completed',
          domain_ready_verdict: null,
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    assert.equal(
      inspectStageAttempt(db, attempt.stage_attempt_id).execution_session_ref,
      'codex://threads/thread-temporal-producer',
    );
  } finally {
    db.close();
  }
});

test('reviewer StageAttempt cannot launch without context isolation evidence', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const producer = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      sourceFingerprint: 'sha256:source',
      stageRunId: 'stage-run:rca/artifact-creation',
      qualityCycleId: 'quality-cycle:rca/artifact-creation',
      attemptRole: 'producer',
      qualityRolePromptRef: 'prompt:producer',
      qualityRubricRefs: ['rubric:visual'],
      contextManifestRef: 'context:producer',
      noContextInheritance: true,
      newAttempt: true,
    }).attempt;
    assert.throws(() => createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      sourceFingerprint: 'sha256:source',
      stageRunId: 'stage-run:rca/artifact-creation',
      qualityCycleId: 'quality-cycle:rca/artifact-creation',
      attemptRole: 'reviewer',
      parentAttemptRef: `opl://stage_attempts/${producer.stage_attempt_id}`,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      newAttempt: true,
    }), /fresh isolated context, role prompt, and quality rubric/);
  } finally {
    db.close();
  }
});

test('quality policy defaults to three rounds without making in-thread refinement authoritative', () => {
  const policy = normalizeStageQualityCyclePolicy({
    formal_review: { required: true, risk_tier: 'high' },
  });
  assert.equal(policy.formal_review.max_repair_rounds, 3);
  assert.equal(policy.formal_review.attempt_internal_parallel_review_facets_allowed, true);
  assert.equal(policy.in_thread_refinement.authoritative, false);
});

test('StageRun controller input rejects custom Attempt roles and quality budgets above three', () => {
  const invocationId = 'stage-run-invocation:bounded';
  const policy = normalizeStageQualityCyclePolicy({
    formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
  });
  const spec: StageRunImmutableSpec = {
    surface_kind: 'opl_stage_run_immutable_spec', version: 'opl-stage-run-immutable-spec.v1',
    domain_id: 'redcube', stage_id: 'artifact_creation', action_id: null, task_id: null,
    workspace_identity: { workspace_root: '/tmp/rca-quality-cycle' },
    stage_manifest: { ref: 'agent/stages/manifest.json', sha256: 'sha256:manifest' },
    quality_policy: {
      ref: 'contracts/stage_quality_cycle_policy.json#/stages/artifact_creation',
      body: policy as unknown as Record<string, unknown>,
    },
    stage_packet_ref: 'packet:artifact-creation', checkpoint_refs: [],
    source_fingerprint: 'sha256:source', source_refs: [], input_artifacts: [],
    role_prompt_refs: {
      producer: 'prompt:producer', reviewer: 'prompt:reviewer',
      repairer: 'prompt:repairer', re_reviewer: 'prompt:re-reviewer',
    },
    quality_rubric_refs: ['rubric:visual'], stage_goal_refs: [], lineage_refs: [],
    package_closure: null, executor_kind: 'codex_cli', stage_attempt_executor_policy: null,
    parent_route_decision_ref: null,
  };
  const base = {
    stage_run_id: deriveStageRunId({
      domainId: 'redcube', stageId: 'artifact_creation', stageRunInvocationId: invocationId,
    }),
    stage_run_invocation_id: invocationId,
    stage_run_spec_sha256: stageRunSpecSha256(spec),
    stage_run_spec: spec,
    parent_route_decision_ref: null,
    workflow_id: 'workflow:bounded',
    domain_id: 'redcube' as const,
    stage_id: 'artifact_creation',
    declared_stage_ids: ['artifact_creation', 'review_and_revision'],
    workspace_locator: { workspace_root: '/tmp/rca-quality-cycle' },
    source_fingerprint: 'sha256:source',
    executor_kind: 'codex_cli',
    stage_packet_ref: 'packet:artifact-creation',
    quality_policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/artifact_creation',
    domain_pack_root: '/tmp/rca-domain-pack',
    stage_manifest_ref: 'agent/stages/manifest.json',
    stage_manifest_sha256: 'sha256:manifest',
    stage_role: null,
    quality_policy: policy,
    role_prompt_refs: {
      producer: 'prompt:producer',
      reviewer: 'prompt:reviewer',
      repairer: 'prompt:repairer',
      re_reviewer: 'prompt:re-reviewer',
    },
    quality_rubric_refs: ['rubric:visual'],
  };
  assert.equal(requireTemporalStageRunWorkflowInputLaunchable(base), base);
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...base,
    role_prompt_refs: { ...base.role_prompt_refs, analysis_redesign: 'prompt:forbidden' },
  } as any), /bounded Framework Attempt roles/);
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...base,
    quality_policy: {
      ...base.quality_policy,
      formal_review: { ...base.quality_policy.formal_review, max_repair_rounds: 4 },
    },
  }), /between zero and three/);
});

test('StageAttempt cannot own Stage topology or transition authority', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    assert.throws(() => createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      next_stage_refs: ['review_and_revision'],
    } as any), /cannot own Stage semantics or transition authority/);
  } finally {
    db.close();
  }
});

test('Temporal child input independently enforces context isolation and finding lineage', () => {
  const base = {
    stage_run_id: 'stage-run:rca/artifact-creation',
    quality_cycle_id: 'quality-cycle:rca/artifact-creation',
    attempt_role: 'reviewer',
    quality_round_index: 0,
    parent_attempt_ref: 'opl://stage_attempts/producer',
    parent_attempt_lineage: {
      stage_run_id: 'stage-run:rca/artifact-creation',
      quality_cycle_id: 'quality-cycle:rca/artifact-creation',
    },
    quality_role_prompt_ref: 'prompt:reviewer',
    context_manifest_ref: 'context:reviewer',
    no_context_inheritance: true,
    quality_rubric_refs: ['rubric:visual'],
    input_artifact_refs: ['artifact:deck-v1'],
    reviewed_artifact_hashes: ['sha256:deck-v1'],
  };
  assert.equal(requireStageQualityAttemptBoundary(base), base);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    no_context_inheritance: false,
  }), /no_context_inheritance=true/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 're_reviewer',
    quality_round_index: 1,
  }), /prior finding and repair map refs/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    next_stage_refs: ['review_and_revision'],
  }), /cannot own Stage semantics/);
});

test('StageRun controller quality cycle id is preserved by the SQLite projection helper', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const input = {
      qualityCycleId: 'quality-cycle:stage-run:rca/artifact-creation',
      stageRunId: 'stage-run:rca/artifact-creation',
      domainId: 'redcube' as const,
      stageId: 'artifact_creation',
      policy: { formal_review: { required: true, risk_tier: 'high' } },
    };
    const first = createStageQualityCycle(db, input);
    const second = createStageQualityCycle(db, input);
    assert.equal(first.cycle.quality_cycle_id, input.qualityCycleId);
    assert.equal(second.created, false);
    assert.throws(() => createStageQualityCycle(db, {
      ...input,
      stageRunId: 'stage-run:rca/different-stage-run',
    }), /already bound to a different StageRun identity or policy/);
  } finally {
    db.close();
  }
});

test('Temporal StageRun terminal state idempotently refreshes the SQLite quality drilldown', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const cycle = createStageQualityCycle(db, {
      stageRunId: 'stage-run:rca/artifact-creation',
      domainId: 'redcube',
      stageId: 'artifact_creation',
      policy: { formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 } },
    }).cycle;
    const state: TemporalStageRunWorkflowState = {
      surface_kind: 'temporal_stage_run_query',
      provider_kind: 'temporal',
      stage_run_id: cycle.stage_run_id,
      workflow_id: 'workflow:rca/artifact-creation',
      quality_cycle_id: cycle.quality_cycle_id,
      domain_id: 'redcube',
      stage_id: 'artifact_creation',
      status: 'completed_with_quality_debt',
      current_role: null,
      repair_rounds_used: 3,
      max_repair_rounds: 3,
      attempts: [{
        attempt_role: 're_reviewer', quality_round_index: 3,
        stage_attempt_id: 'sat-rereview-3', workflow_id: 'wf-rereview-3',
        execution_session_ref: 'codex://threads/rereview-3', status: 'completed',
        artifact_refs: ['artifact:deck-v4'], artifact_hashes: ['sha256:deck-v4'],
        artifact_identity_receipt_refs: ['artifact:deck-v4'],
      }],
      findings: [{
        finding_id: 'finding:visual-clipping', severity: 'critical', required: true,
        evidence_refs: ['screenshot:slide-7-v4'], repair_expectation: 'Remove clipping.',
      }],
      repair_map: [], finding_closures: [], review_receipts: [],
      artifact_refs: ['artifact:deck-v4'], artifact_hashes: ['sha256:deck-v4'],
      artifact_identity_receipt_refs: ['artifact:deck-v4'],
      quality_debt_refs: ['quality-debt:finding:visual-clipping'],
      route_quality_debt_refs: [],
      decisive_attempt_role: 're_reviewer',
      decisive_attempt_ref: 'opl://stage_attempts/sat-rereview-3',
      selected_stage_route: {
        decision_kind: 'repeat',
        target_stage_id: 'artifact_creation',
        evidence_refs: ['finding:visual-clipping'],
      },
      route_evidence_refs: ['finding:visual-clipping'],
      route_recommendations: [],
      next_stage_run_launch: null,
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
  } finally {
    db.close();
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
