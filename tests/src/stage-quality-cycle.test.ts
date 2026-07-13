import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import {
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
  buildPackBoundTemporalStageRunInput,
} from '../../src/modules/runway/family-runtime-pack-bound-stage-run.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../src/modules/pack/index.ts';
import { buildStageQualityContextManifestRef } from '../../src/modules/runway/family-runtime-stage-quality-context-manifest.ts';
import { OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE } from '../../src/modules/pack/standard-agent-stage-manifest.ts';
import {
  STANDARD_AGENT_REGISTRY,
} from '../../src/kernel/standard-agent-registry.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function qualityContextBinding(input: {
  role: 'producer' | 'reviewer' | 'repairer' | 're_reviewer';
  stageRunId: string;
  qualityCycleId: string;
  rubricRefs: string[];
  artifactRefs?: string[];
  artifactHashes?: string[];
  priorFindingRefs?: string[];
  repairMapRefs?: string[];
}) {
  const artifactIdentity = {
    artifact_refs: input.artifactRefs ?? [],
    artifact_hashes: input.artifactHashes ?? [],
  };
  const contextManifest = input.role === 'reviewer' || input.role === 're_reviewer'
    ? buildStageReviewContextManifest({
        stageRunId: input.stageRunId,
        qualityCycleId: input.qualityCycleId,
        reviewerAttemptRole: input.role,
        artifactRefs: artifactIdentity.artifact_refs,
        artifactHashes: artifactIdentity.artifact_hashes,
        qualityRubricRefs: input.rubricRefs,
        priorFindingRefs: input.priorFindingRefs,
        repairMapRefs: input.repairMapRefs,
      })
    : {
        surface_kind: 'opl_stage_quality_attempt_context_manifest',
        version: 'stage-quality-attempt-context-manifest.v1',
        stage_run_id: input.stageRunId,
        quality_cycle_id: input.qualityCycleId,
        attempt_role: input.role,
        stage_goal_refs: [],
        source_refs: [],
        lineage_refs: [],
        quality_rubric_refs: input.rubricRefs,
        prior_finding_refs: input.priorFindingRefs ?? [],
        repair_map_refs: input.repairMapRefs ?? [],
        ...artifactIdentity,
        no_context_inheritance: true,
      };
  return {
    contextManifest,
    contextManifestRef: buildStageQualityContextManifestRef(contextManifest),
  };
}

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

function reviewReceipt(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'opl_stage_review_receipt',
    version: 'stage-review-receipt.v1',
    stage_run_id: 'stage-run:receipt-runtime',
    quality_cycle_id: 'quality-cycle:receipt-runtime',
    producer_attempt_ref: 'opl://stage_attempts/producer',
    reviewer_attempt_ref: 'opl://stage_attempts/reviewer',
    producer_session_ref: 'codex://threads/producer',
    reviewer_session_ref: 'codex://threads/reviewer',
    no_context_inheritance: true,
    reviewed_artifact_refs: ['artifact:reviewed'],
    reviewed_artifact_hashes: ['sha256:reviewed'],
    rubric_refs: ['rubric:quality'],
    verdict: 'pass',
    finding_lineage: {
      review_kind: 'initial_review',
      finding_ids: [],
      findings_sha256: `sha256:${'0'.repeat(64)}`,
      repair_map_sha256: null,
      re_review_result_sha256: null,
    },
    ...overrides,
  } as any;
}

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
  assert.match(prompt, /blocked or human_gate reviewer outcome must return blocked_reason, a canonical hard_stop_class/);
  assert.match(prompt, /stage_route_contract is controller-owned validation metadata/);
  assert.match(prompt, /stage_quality_cycle\.outcome, with exactly one of: pass, repair_required, quality_debt, blocked, human_gate/);
  assert.match(prompt, /For a non-hard-stop reviewer outcome, required route_impact\.stage_quality_cycle fields are outcome and findings/);
  assert.match(prompt, /or fabricate findings, finding closures, or a Re-review result/);
  assert.match(prompt, /Review receipt verdict is generated by the OPL StageRun controller/);
  assert.match(prompt, /cannot write a Stage current pointer or materialize a Stage transition/);
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
      noContextInheritance: true,
    };
    const producer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'producer',
      qualityRoundIndex: 0,
      newAttempt: true,
      ...qualityContextBinding({
        role: 'producer',
        stageRunId: shared.stageRunId,
        qualityCycleId: shared.qualityCycleId,
        rubricRefs: shared.qualityRubricRefs,
      }),
    }).attempt;
    const reviewer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'reviewer',
      qualityRoundIndex: 0,
      parentAttemptRef: `opl://stage_attempts/${producer.stage_attempt_id}`,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      noContextInheritance: true,
      newAttempt: true,
      ...qualityContextBinding({
        role: 'reviewer',
        stageRunId: shared.stageRunId,
        qualityCycleId: shared.qualityCycleId,
        rubricRefs: shared.qualityRubricRefs,
        artifactRefs: ['artifact:deck-v1'],
        artifactHashes: ['sha256:deck-v1'],
      }),
    }).attempt;
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: producer.stage_attempt_id,
      executionSessionRef: 'codex://threads/producer',
    });
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: reviewer.stage_attempt_id,
      executionSessionRef: 'codex://threads/reviewer',
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
    `).run(JSON.stringify({ stage_quality_cycle: { outcome: 'pass', findings: [] } }), reviewer.stage_attempt_id);
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
      noContextInheritance: true,
    };
    const producer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'producer',
      ...qualityContextBinding({
        role: 'producer',
        stageRunId: shared.stageRunId,
        qualityCycleId: shared.qualityCycleId,
        rubricRefs: shared.qualityRubricRefs,
      }),
    }).attempt;
    const reviewer = createStageAttempt(db, {
      ...shared,
      attemptRole: 'reviewer',
      parentAttemptRef: `opl://stage_attempts/${producer.stage_attempt_id}`,
      inputArtifactRefs: ['artifact:deck-v1'],
      reviewedArtifactHashes: ['sha256:deck-v1'],
      noContextInheritance: true,
      ...qualityContextBinding({
        role: 'reviewer',
        stageRunId: shared.stageRunId,
        qualityCycleId: shared.qualityCycleId,
        rubricRefs: shared.qualityRubricRefs,
        artifactRefs: ['artifact:deck-v1'],
        artifactHashes: ['sha256:deck-v1'],
      }),
    }).attempt;
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: producer.stage_attempt_id,
      executionSessionRef: 'codex://threads/shared',
    });
    bindStageAttemptExecutionSession(db, {
      stageAttemptId: reviewer.stage_attempt_id,
      executionSessionRef: 'codex://threads/shared',
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
    `).run(JSON.stringify({ stage_quality_cycle: { outcome: 'pass', findings: [] } }), reviewer.stage_attempt_id);
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
      noContextInheritance: true,
      newAttempt: true,
      ...qualityContextBinding({
        role: 'producer',
        stageRunId: 'stage-run:rca/artifact-creation',
        qualityCycleId: 'quality-cycle:rca/artifact-creation',
        rubricRefs: ['rubric:visual'],
      }),
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
      noContextInheritance: true,
      newAttempt: true,
      ...qualityContextBinding({
        role: 'producer',
        stageRunId: 'stage-run:rca/artifact-creation',
        qualityCycleId: 'quality-cycle:rca/artifact-creation',
        rubricRefs: ['rubric:visual'],
      }),
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

test('StageRun controller input rejects custom Attempt roles and quality budgets above three', (t) => {
  const invocationId = 'stage-run-invocation:bounded';
  const policy = normalizeStageQualityCyclePolicy({
    formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
  });
  const domainPackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-boundary-'));
  t.after(() => fs.rmSync(domainPackRoot, { recursive: true, force: true }));
  const fixtureRef = 'agent/stages/manifest.json';
  const fixturePath = path.join(domainPackRoot, fixtureRef);
  const fixtureBytes = Buffer.from('{"stages":["artifact_creation","review_and_revision"]}\n');
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, fixtureBytes);
  const rolePromptRef = 'agent/prompts/stage-quality-cycle-roles.md';
  const rolePromptPath = path.join(domainPackRoot, rolePromptRef);
  fs.mkdirSync(path.dirname(rolePromptPath), { recursive: true });
  fs.writeFileSync(rolePromptPath, [
    '## Producer', 'Produce the artifact.',
    '## Reviewer', 'Review exact artifact bytes.',
    '## Repairer', 'Repair required findings.',
    '## Re Reviewer', 'Close prior findings.',
    '',
  ].join('\n'));
  const fixtureSha256 = crypto.createHash('sha256').update(fixtureBytes).digest('hex');
  const binding: StandardAgentStageQualityRuntimeBinding = {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: 'artifact_creation',
    declared_stage_ids: ['artifact_creation', 'review_and_revision'],
    enabled: true,
    stage_role: null,
    policy_ref: `${fixtureRef}#/policy`,
    stage_prompt_ref: `${fixtureRef}#/stage-prompt`,
    quality_policy: policy,
    handoff_review_boundary: null,
    role_prompt_refs: {
      producer: `${rolePromptRef}#producer`,
      reviewer: `${rolePromptRef}#reviewer`,
      repairer: `${rolePromptRef}#repairer`,
      re_reviewer: `${rolePromptRef}#re-reviewer`,
    },
    quality_rubric_refs: [`${fixtureRef}#/rubric`],
    stage_goal_refs: [`${fixtureRef}#/goal`],
    source_refs: [`${fixtureRef}#/source`],
    lineage_refs: [],
    manifest_ref: fixtureRef,
    manifest_sha256: fixtureSha256,
  };
  const base = buildPackBoundTemporalStageRunInput({
    binding,
    domainPackRoot,
    domainId: 'redcube',
    stageId: 'artifact_creation',
    stageRunInvocationId: invocationId,
    workspaceLocator: {
      workspace_root: '/tmp/rca-quality-cycle',
      package_use_binding: {
        root_package: {
          package_id: 'redcube',
          package_version: '0.0.0-test',
          owner_language_version: { scheme: 'semver', value: '0.0.0-test' },
          package_lock_ref: 'opl://package-lock/redcube/test',
          manifest_sha256: fixtureSha256,
          content_digest: 'a'.repeat(64),
        },
        provider_packages: [],
        dependency_closure_digest: 'b'.repeat(64),
      },
    },
    sourceFingerprint: null,
    executorKind: 'codex_cli',
  });
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
        artifact_producer_attempt_ref: 'opl://stage_attempts/sat-repair-3',
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
      hard_stop_class: null,
      typed_blocker_refs: [],
      human_gate_refs: [],
      source_attempt_ref: null,
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
    const humanGate = projectTemporalStageRunQualityCycle(db, {
      ...state,
      status: 'human_gate',
      hard_stop_class: 'human_decision_required',
      typed_blocker_refs: [],
      human_gate_refs: ['human-gate:publication-owner'],
      source_attempt_ref: 'opl://stage_attempts/sat-rereview-3',
      blocked_reason: 'publication owner decision required',
    });
    const readback = (humanGate.state as any).controller_readback;
    assert.equal(readback.hard_stop_class, 'human_decision_required');
    assert.deepEqual(readback.typed_blocker_refs, []);
    assert.deepEqual(readback.human_gate_refs, ['human-gate:publication-owner']);
    assert.equal(readback.source_attempt_ref, 'opl://stage_attempts/sat-rereview-3');
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
