import { stableId } from './family-runtime-ids.ts';

type JsonRecord = Record<string, unknown>;

type AgentLabDomainId = 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | string;
type AgentLabStatus = 'passed' | 'blocked';

export type AgentLabTaskManifest = {
  task_id: string;
  domain_id: AgentLabDomainId;
  task_family: string;
  environment: {
    environment_kind: 'fixture' | 'local_workspace' | 'provider_hosted' | string;
    workspace_locator_ref: string;
    sandbox_policy: string;
    network_policy: string;
    resource_limits?: JsonRecord;
  };
  instructions_ref: string;
  agent_entry_ref: string;
  stage_refs: string[];
  oracle_refs: string[];
  scorer_refs: string[];
  recovery_probes: AgentLabRecoveryProbe[];
  trajectory: AgentLabTrajectory;
  scorecard: AgentLabScorecard;
  improvement_candidate: AgentLabImprovementCandidate;
  promotion_gate: AgentLabPromotionGate;
  authority_boundary?: JsonRecord;
};

export type AgentLabRecoveryProbe = {
  probe_ref: string;
  probe_kind:
    | 'resume_after_interruption'
    | 'retry_after_tool_failure'
    | 'dead_letter_repair'
    | 'human_gate_resume'
    | 'artifact_restore'
    | string;
  expected_status: 'passed' | 'blocked';
  observed_status: 'passed' | 'blocked';
  source_refs: string[];
};

export type AgentLabTrajectory = {
  trajectory_ref: string;
  run_ref: string;
  agent_executor: string;
  stage_attempt_refs: string[];
  tool_call_refs: string[];
  artifact_refs: string[];
  receipt_refs: string[];
  repair_refs: string[];
  trace_refs?: string[];
  authority_boundary?: JsonRecord;
  [key: string]: unknown;
};

export type AgentLabScorecard = {
  scorecard_ref: string;
  domain_owned: boolean;
  opl_scorecard_role: 'scorecard_ref_projection_only';
  passed: boolean;
  metric_refs: string[];
  evidence_refs: string[];
  review_refs: string[];
  quality_gate_refs: string[];
  authority_boundary?: JsonRecord;
};

export type AgentLabImprovementCandidate = {
  candidate_ref: string;
  candidate_kind: 'prompt' | 'skill' | 'stage_policy' | 'tool_policy' | string;
  target_ref: string;
  evidence_refs: string[];
  allowed_change_scope: 'candidate_config_only' | 'branch_only' | 'manual_review_required';
  promotion_gate_ref: string;
  authority_boundary?: JsonRecord;
};

export type AgentLabPromotionGate = {
  gate_ref: string;
  gate_status: 'passed' | 'blocked';
  required_refs: string[];
  regression_suite_refs: string[];
  no_forbidden_write_proof_refs: string[];
  authority_boundary?: JsonRecord;
};

export type AgentLabSuite = {
  suite_id: string;
  suite_kind?: 'agent_lab_sample_suite' | 'agent_lab_longline_suite' | string;
  tasks: AgentLabTaskManifest[];
  required_observations?: AgentLabObservationKey[];
  longline_summary?: AgentLabLonglineSummaryInput;
  authority_boundary?: JsonRecord;
};

export type AgentLabRepoTestDisposition = {
  domain_id: AgentLabDomainId;
  keep_in_domain_repo: string[];
  move_to_opl_agent_lab: string[];
};

export type AgentLabLonglineSummaryInput = {
  recommended_repo_test_disposition: AgentLabRepoTestDisposition[];
};

export type AgentLabObservationKey =
  | 'task_manifests_observed'
  | 'agent_trajectories_observed'
  | 'recovery_probes_observed'
  | 'domain_quality_scorecard_refs_observed'
  | 'failure_taxonomy_observed'
  | 'improvement_candidates_observed'
  | 'promotion_gates_observed'
  | 'no_memory_body_observed'
  | 'forbidden_authority_flags_all_false';

const REQUIRED_OBSERVATIONS: AgentLabObservationKey[] = [
  'task_manifests_observed',
  'agent_trajectories_observed',
  'recovery_probes_observed',
  'domain_quality_scorecard_refs_observed',
  'failure_taxonomy_observed',
  'improvement_candidates_observed',
  'promotion_gates_observed',
  'no_memory_body_observed',
  'forbidden_authority_flags_all_false',
];

const AGENT_LAB_AUTHORITY_BOUNDARY = {
  opl: 'agent_lab_eval_improvement_control_plane_refs_only',
  domain: 'truth_quality_artifact_memory_body_and_owner_receipt_authority',
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_accept_or_reject_memory_writeback: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_authorize_export_verdict: false,
  can_mutate_domain_artifact: false,
  can_promote_default_agent_without_gate: false,
};

const FORBIDDEN_TRUE_AUTHORITY_FLAGS = [
  'can_write_domain_truth',
  'can_write_memory_body',
  'can_accept_or_reject_memory_writeback',
  'can_authorize_domain_ready',
  'can_authorize_quality_verdict',
  'can_authorize_export_verdict',
  'can_mutate_domain_artifact',
  'can_promote_default_agent_without_gate',
  'opl_can_write_domain_truth',
  'opl_can_write_memory_body',
  'opl_can_authorize_domain_ready',
  'opl_can_authorize_quality_verdict',
  'opl_can_authorize_export_verdict',
];

const FORBIDDEN_MEMORY_BODY_KEYS = [
  'memory_body',
  'memory_content',
  'memory_payload',
  'accepted_memory_body',
  'rejected_memory_body',
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function hasForbiddenMemoryBody(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, entry]) =>
    FORBIDDEN_MEMORY_BODY_KEYS.includes(key)
    || (isRecord(entry) && hasForbiddenMemoryBody(entry))
    || (Array.isArray(entry) && entry.some(hasForbiddenMemoryBody)));
}

function collectForbiddenAuthorityFlags(records: Array<{ label: string; value: unknown }>) {
  const flags: string[] = [];
  for (const record of records) {
    if (!isRecord(record.value)) {
      continue;
    }
    for (const flag of FORBIDDEN_TRUE_AUTHORITY_FLAGS) {
      if (record.value[flag] === true) {
        flags.push(`${record.label}.${flag}`);
      }
    }
  }
  return unique(flags);
}

function authorityRecordsForTask(task: AgentLabTaskManifest) {
  return [
    { label: `task:${task.task_id}:authority_boundary`, value: task.authority_boundary },
    { label: `task:${task.task_id}:trajectory.authority_boundary`, value: task.trajectory.authority_boundary },
    { label: `task:${task.task_id}:scorecard.authority_boundary`, value: task.scorecard.authority_boundary },
    {
      label: `task:${task.task_id}:improvement_candidate.authority_boundary`,
      value: task.improvement_candidate.authority_boundary,
    },
    { label: `task:${task.task_id}:promotion_gate.authority_boundary`, value: task.promotion_gate.authority_boundary },
  ];
}

function recoveryPassed(task: AgentLabTaskManifest) {
  return task.recovery_probes.filter((probe) => probe.observed_status === probe.expected_status);
}

function buildRun(task: AgentLabTaskManifest) {
  const recoveryPassedCount = recoveryPassed(task).length;
  const recoveryProbeCount = task.recovery_probes.length;
  const failureTaxonomy = [
    recoveryPassedCount === recoveryProbeCount ? null : 'recovery_probe_mismatch',
    task.scorecard.passed ? null : 'domain_scorecard_blocked',
    task.promotion_gate.gate_status === 'passed' ? null : 'promotion_gate_blocked',
  ].filter((entry): entry is string => Boolean(entry));
  const status: AgentLabStatus = failureTaxonomy.length === 0 ? 'passed' : 'blocked';
  return {
    surface_kind: 'opl_agent_lab_run_result',
    run_id: stableId('oalr', [
      task.task_id,
      task.trajectory,
      task.scorecard,
      task.recovery_probes,
      task.improvement_candidate,
      task.promotion_gate,
    ]),
    task_id: task.task_id,
    domain_id: task.domain_id,
    task_family: task.task_family,
    status,
    failure_taxonomy: failureTaxonomy,
    environment: task.environment,
    instructions_ref: task.instructions_ref,
    agent_entry_ref: task.agent_entry_ref,
    stage_refs: task.stage_refs,
    oracle_refs: task.oracle_refs,
    scorer_refs: task.scorer_refs,
    trajectory: task.trajectory,
    recovery: {
      probe_count: recoveryProbeCount,
      passed_count: recoveryPassedCount,
      blocked_count: recoveryProbeCount - recoveryPassedCount,
      probe_refs: task.recovery_probes.map((probe) => probe.probe_ref),
    },
    scorecard: task.scorecard,
    improvement_candidate: task.improvement_candidate,
    promotion_gate: task.promotion_gate,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function buildObservations(input: AgentLabSuite, runs: ReturnType<typeof buildRun>[]) {
  const recoveryProbeRefs = unique(input.tasks.flatMap((task) =>
    task.recovery_probes.map((probe) => probe.probe_ref)));
  const scorecardRefs = unique(input.tasks.map((task) => task.scorecard.scorecard_ref));
  const improvementCandidateRefs = unique(input.tasks.map((task) => task.improvement_candidate.candidate_ref));
  const promotionGateRefs = unique(input.tasks.map((task) => task.promotion_gate.gate_ref));
  const forbiddenAuthorityFlags = collectForbiddenAuthorityFlags([
    { label: 'suite:authority_boundary', value: input.authority_boundary },
    ...input.tasks.flatMap(authorityRecordsForTask),
  ]);
  const memoryBodyObserved = input.tasks.some(hasForbiddenMemoryBody);
  const allRunsHaveFailureTaxonomy = runs.every((run) => Array.isArray(run.failure_taxonomy));

  return {
    observations: {
      task_manifests_observed: input.tasks.length > 0,
      agent_trajectories_observed: input.tasks.every((task) =>
        Boolean(task.trajectory.trajectory_ref) && task.trajectory.stage_attempt_refs.length > 0),
      recovery_probes_observed: recoveryProbeRefs.length > 0,
      domain_quality_scorecard_refs_observed: input.tasks.every((task) =>
        task.scorecard.domain_owned && task.scorecard.opl_scorecard_role === 'scorecard_ref_projection_only'),
      failure_taxonomy_observed: allRunsHaveFailureTaxonomy,
      improvement_candidates_observed: improvementCandidateRefs.length > 0,
      promotion_gates_observed: promotionGateRefs.length > 0
        && input.tasks.every((task) => task.promotion_gate.no_forbidden_write_proof_refs.length > 0),
      no_memory_body_observed: !memoryBodyObserved,
      forbidden_authority_flags_all_false: forbiddenAuthorityFlags.length === 0,
    } satisfies Record<AgentLabObservationKey, boolean>,
    refs: {
      task_refs: unique(input.tasks.map((task) => task.task_id)),
      trajectory_refs: unique(input.tasks.map((task) => task.trajectory.trajectory_ref)),
      recovery_probe_refs: recoveryProbeRefs,
      domain_quality_scorecard_refs: scorecardRefs,
      scorer_refs: unique(input.tasks.flatMap((task) => task.scorer_refs)),
      oracle_refs: unique(input.tasks.flatMap((task) => task.oracle_refs)),
      improvement_candidate_refs: improvementCandidateRefs,
      promotion_gate_refs: promotionGateRefs,
      artifact_refs: unique(input.tasks.flatMap((task) => task.trajectory.artifact_refs)),
      receipt_refs: unique(input.tasks.flatMap((task) => task.trajectory.receipt_refs)),
      forbidden_authority_flags: forbiddenAuthorityFlags,
    },
    counters: {
      memory_body_observed: memoryBodyObserved,
      forbidden_authority_flag_count: forbiddenAuthorityFlags.length,
    },
  };
}

function domainSummary(runs: ReturnType<typeof buildRun>[]) {
  const domainIds = unique(runs.map((run) => run.domain_id));
  return domainIds.map((domainId) => {
    const domainRuns = runs.filter((run) => run.domain_id === domainId);
    return {
      domain_id: domainId,
      run_count: domainRuns.length,
      passed_run_count: domainRuns.filter((run) => run.status === 'passed').length,
      blocked_run_count: domainRuns.filter((run) => run.status === 'blocked').length,
      scorecard_refs: domainRuns.map((run) => run.scorecard.scorecard_ref),
      improvement_candidate_refs: domainRuns.map((run) => run.improvement_candidate.candidate_ref),
      promotion_gate_refs: domainRuns.map((run) => run.promotion_gate.gate_ref),
    };
  });
}

export function runAgentLabSuite(input: AgentLabSuite) {
  const runs = input.tasks.map(buildRun);
  const requiredObservations = input.required_observations ?? REQUIRED_OBSERVATIONS;
  const observationResult = buildObservations(input, runs);
  const missingObservations = requiredObservations.filter(
    (observation) => !observationResult.observations[observation],
  );
  const blockedRuns = runs.filter((run) => run.status === 'blocked');
  const status: AgentLabStatus = missingObservations.length === 0 && blockedRuns.length === 0 ? 'passed' : 'blocked';

  return {
    surface_kind: 'opl_agent_lab_suite_result',
    version: 'opl-agent-lab.v1',
    suite_id: input.suite_id,
    suite_kind: input.suite_kind ?? 'agent_lab_sample_suite',
    result_id: stableId('oals', [
      input.suite_id,
      runs.map((run) => run.run_id),
      observationResult.observations,
      observationResult.refs,
    ]),
    status,
    required_observations: requiredObservations,
    missing_observations: missingObservations,
    observations: observationResult.observations,
    summary: {
      task_count: input.tasks.length,
      run_count: runs.length,
      passed_run_count: runs.filter((run) => run.status === 'passed').length,
      blocked_run_count: blockedRuns.length,
      recovery_probe_count: input.tasks.reduce((total, task) => total + task.recovery_probes.length, 0),
      recovery_passed_count: input.tasks.reduce((total, task) => total + recoveryPassed(task).length, 0),
      scorecard_passed_count: input.tasks.filter((task) => task.scorecard.passed).length,
      improvement_candidate_count: input.tasks.length,
      promotable_candidate_count: input.tasks.filter((task) => task.promotion_gate.gate_status === 'passed').length,
      memory_body_observed: observationResult.counters.memory_body_observed,
      forbidden_authority_flag_count: observationResult.counters.forbidden_authority_flag_count,
    },
    refs: observationResult.refs,
    runs,
    domain_summary: domainSummary(runs),
    longline_summary: buildLonglineSummary(input),
    authority_boundary: {
      ...AGENT_LAB_AUTHORITY_BOUNDARY,
      ...(input.authority_boundary ?? {}),
    },
  };
}

function buildLonglineSummary(input: AgentLabSuite) {
  const disposition = input.longline_summary?.recommended_repo_test_disposition ?? [];
  const domainIds = unique(input.tasks.map((task) => task.domain_id));
  const longlineTaskCount = input.suite_kind === 'agent_lab_longline_suite'
    ? input.tasks.length
    : 0;
  return {
    surface_kind: 'opl_agent_lab_longline_summary',
    longline_task_count: longlineTaskCount,
    domain_ids: domainIds,
    repo_test_replacement_candidate_count: disposition.length,
    ready_to_reduce_domain_longline_tests: longlineTaskCount > 0
      && disposition.length === domainIds.length
      && input.tasks.every((task) => task.promotion_gate.gate_status === 'passed'),
    recommended_repo_test_disposition: disposition,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function commonAuthorityBoundary() {
  return {
    ...AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function task(input: Omit<AgentLabTaskManifest, 'authority_boundary'>): AgentLabTaskManifest {
  return {
    ...input,
    authority_boundary: commonAuthorityBoundary(),
    trajectory: {
      ...input.trajectory,
      authority_boundary: commonAuthorityBoundary(),
    },
    scorecard: {
      ...input.scorecard,
      authority_boundary: commonAuthorityBoundary(),
    },
    improvement_candidate: {
      ...input.improvement_candidate,
      authority_boundary: commonAuthorityBoundary(),
    },
    promotion_gate: {
      ...input.promotion_gate,
      authority_boundary: commonAuthorityBoundary(),
    },
  };
}

export function buildSampleAgentLabSuite(): AgentLabSuite {
  return {
    suite_id: 'opl-agent-lab-sample-suite',
    authority_boundary: commonAuthorityBoundary(),
    tasks: [
      task({
        task_id: 'agent-lab-task:mas/paper-repair-smoke',
        domain_id: 'med-autoscience',
        task_family: 'research_foundry_paper_repair',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:mas/sample-paper-repair',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
          resource_limits: { max_minutes: 15, max_stage_attempts: 3 },
        },
        instructions_ref: 'instructions:mas/paper-repair-smoke',
        agent_entry_ref: 'domain-agent-entry:med-autoscience',
        stage_refs: ['stage:mas/review-repair', 'stage:mas/guarded-apply'],
        oracle_refs: ['oracle:mas/publication-eval-fixture'],
        scorer_refs: ['scorer:mas/publication-quality-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:common/resume-after-interruption',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:mas/resume-fixture'],
          },
          {
            probe_ref: 'recovery-probe:mas/human-gate-resume',
            probe_kind: 'human_gate_resume',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['human-gate:mas/reviewer-decision-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:mas/paper-repair-smoke',
          run_ref: 'run:mas/paper-repair-smoke',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:mas/paper-repair-smoke'],
          tool_call_refs: ['tool-call:mas/study-state-read'],
          artifact_refs: ['artifact-ref:mas/revision-package-fixture'],
          receipt_refs: ['owner-receipt:mas/publication-eval-fixture'],
          repair_refs: ['repair-ref:mas/reviewer-recheck'],
          trace_refs: ['trace-ref:inspect/mas-paper-repair'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:mas/paper-repair-smoke',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mas/evidence-backed-claims'],
          evidence_refs: ['evidence-ref:mas/publication-eval-fixture'],
          review_refs: ['review-ref:mas/ai-reviewer-fixture'],
          quality_gate_refs: ['quality-gate:mas/publication-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:mas/reviewer-repair-prompt',
          candidate_kind: 'prompt',
          target_ref: 'prompt-ref:mas/reviewer-repair',
          evidence_refs: ['failure-taxonomy:mas/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:mas/paper-repair-smoke',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:mas/paper-repair-smoke',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:mas/paper-repair-smoke'],
          regression_suite_refs: ['regression-suite:mas/paper-autonomy-smoke'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:mas/agent-lab-fixture'],
        },
      }),
      task({
        task_id: 'agent-lab-task:mag/grant-section-smoke',
        domain_id: 'med-autogrant',
        task_family: 'grant_foundry_section_revision',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:mag/sample-grant-section',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:mag/grant-section-smoke',
        agent_entry_ref: 'domain-agent-entry:med-autogrant',
        stage_refs: ['stage:mag/strategy-review', 'stage:mag/section-revision'],
        oracle_refs: ['oracle:mag/fundability-fixture'],
        scorer_refs: ['scorer:mag/fundability-quality-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:mag/retry-after-tool-failure',
            probe_kind: 'retry_after_tool_failure',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:mag/retry-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:mag/grant-section-smoke',
          run_ref: 'run:mag/grant-section-smoke',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:mag/grant-section-smoke'],
          tool_call_refs: ['tool-call:mag/intake-read'],
          artifact_refs: ['artifact-ref:mag/section-draft-fixture'],
          receipt_refs: ['owner-receipt:mag/fundability-fixture'],
          repair_refs: ['repair-ref:mag/strategy-tightening'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:mag/grant-section-smoke',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mag/specific-aim-fit'],
          evidence_refs: ['evidence-ref:mag/fundability-fixture'],
          review_refs: ['review-ref:mag/domain-review-fixture'],
          quality_gate_refs: ['quality-gate:mag/fundability-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:mag/stage-policy-tightening',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:mag/section-revision',
          evidence_refs: ['failure-taxonomy:mag/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:mag/grant-section-smoke',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:mag/grant-section-smoke',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:mag/grant-section-smoke'],
          regression_suite_refs: ['regression-suite:mag/grant-stage-smoke'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:mag/agent-lab-fixture'],
        },
      }),
      task({
        task_id: 'agent-lab-task:rca/visual-deliverable-smoke',
        domain_id: 'redcube-ai',
        task_family: 'presentation_foundry_visual_delivery',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:rca/sample-visual-deliverable',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:rca/visual-deliverable-smoke',
        agent_entry_ref: 'domain-agent-entry:redcube-ai',
        stage_refs: ['stage:rca/source-intake', 'stage:rca/render-review'],
        oracle_refs: ['oracle:rca/no-regression-fixture'],
        scorer_refs: ['scorer:rca/visual-quality-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:rca/artifact-restore',
            probe_kind: 'artifact_restore',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['restore-proof:rca/visual-fixture'],
          },
          {
            probe_ref: 'recovery-probe:rca/dead-letter-repair',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['repair-receipt:rca/render-retry-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:rca/visual-deliverable-smoke',
          run_ref: 'run:rca/visual-deliverable-smoke',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:rca/visual-deliverable-smoke'],
          tool_call_refs: ['tool-call:rca/render-html'],
          artifact_refs: ['artifact-ref:rca/visual-package-fixture'],
          receipt_refs: ['owner-receipt:rca/no-regression-fixture'],
          repair_refs: ['repair-ref:rca/render-review-retry'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:rca/visual-deliverable-smoke',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:rca/block-content-fit'],
          evidence_refs: ['evidence-ref:rca/screenshot-review-fixture'],
          review_refs: ['review-ref:rca/visual-review-fixture'],
          quality_gate_refs: ['quality-gate:rca/visual-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:rca/render-policy-tightening',
          candidate_kind: 'tool_policy',
          target_ref: 'tool-policy-ref:rca/render-review',
          evidence_refs: ['failure-taxonomy:rca/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:rca/visual-route-smoke',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:rca/visual-route-smoke',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:rca/visual-deliverable-smoke'],
          regression_suite_refs: ['regression-suite:rca/visual-no-regression-smoke'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:rca/agent-lab-fixture'],
        },
      }),
    ],
  };
}

export function buildSampleAgentLabResult() {
  return runAgentLabSuite(buildSampleAgentLabSuite());
}

export function buildLonglineAgentLabSuite(): AgentLabSuite {
  return {
    suite_id: 'opl-agent-lab-longline-suite',
    suite_kind: 'agent_lab_longline_suite',
    authority_boundary: commonAuthorityBoundary(),
    longline_summary: {
      recommended_repo_test_disposition: [
        {
          domain_id: 'med-autoscience',
          keep_in_domain_repo: [
            'publication-quality scorer',
            'owner receipt fixture',
            'paper artifact authority checks',
          ],
          move_to_opl_agent_lab: [
            'provider-hosted guarded apply soak orchestration',
            'resume/retry/dead-letter recovery probe',
            'no-forbidden-write cross-domain regression',
          ],
        },
        {
          domain_id: 'med-autogrant',
          keep_in_domain_repo: [
            'fundability scorer',
            'grant owner receipt fixture',
            'proposal artifact authority checks',
          ],
          move_to_opl_agent_lab: [
            'controlled grant-stage soak orchestration',
            'receipt reconciliation projection',
            'no-forbidden-write cross-domain regression',
          ],
        },
        {
          domain_id: 'redcube-ai',
          keep_in_domain_repo: [
            'visual quality scorer',
            'render/export owner receipt fixture',
            'artifact authority checks',
          ],
          move_to_opl_agent_lab: [
            'controlled visual-stage soak orchestration',
            'hosted-attempt reconciliation projection',
            'no-forbidden-write cross-domain regression',
          ],
        },
      ],
    },
    tasks: [
      task({
        task_id: 'agent-lab-longline-task:mas/paper-owner-chain',
        domain_id: 'med-autoscience',
        task_family: 'longline_research_foundry_owner_chain_soak',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:mas/real-paper-lines',
          sandbox_policy: 'provider_hosted_no_forbidden_write_guard',
          network_policy: 'domain_owner_policy',
          resource_limits: { max_hours: 24, max_stage_attempts: 9 },
        },
        instructions_ref: 'instructions:longline/mas-paper-owner-chain',
        agent_entry_ref: 'domain-agent-entry:med-autoscience',
        stage_refs: ['stage:mas/guarded-apply', 'stage:mas/reviewer-recheck', 'stage:mas/owner-receipt'],
        oracle_refs: ['oracle:mas/study-state-matrix-owner-chain'],
        scorer_refs: ['scorer:mas/publication-quality-owner-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:longline/temporal-worker-restart-requery',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['provider-proof:temporal/restart-requery'],
          },
          {
            probe_ref: 'recovery-probe:longline/mas-human-gate-resume',
            probe_kind: 'human_gate_resume',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['human-gate:mas/paper-owner-chain'],
          },
          {
            probe_ref: 'recovery-probe:longline/mas-dead-letter-repair',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['repair-receipt:mas/owner-chain-redrive'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:longline/mas-paper-owner-chain',
          run_ref: 'run:longline/mas-paper-owner-chain',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:longline/mas-paper-owner-chain'],
          tool_call_refs: ['tool-call:mas/study-state-matrix', 'tool-call:opl/family-runtime-hydrate'],
          artifact_refs: ['artifact-ref:mas/current-package-locator-only'],
          receipt_refs: ['owner-receipt:mas/stable-blocker-or-progress-delta'],
          repair_refs: ['repair-ref:mas/owner-chain-repair'],
          trace_refs: ['trace-ref:agent-lab/mas-longline'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:longline/mas-publication-owner-chain',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mas/progress-delta-or-stable-blocker'],
          evidence_refs: ['evidence-ref:mas/owner-receipt-chain'],
          review_refs: ['review-ref:mas/publication-eval-owner'],
          quality_gate_refs: ['quality-gate:mas/publication-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:longline/mas-owner-chain-routing',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:mas/guarded-apply-owner-chain',
          evidence_refs: ['failure-taxonomy:mas/longline-owner-chain'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:longline/mas-paper-owner-chain',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:longline/mas-paper-owner-chain',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:longline/mas-publication-owner-chain'],
          regression_suite_refs: ['regression-suite:agent-lab/mas-paper-longline'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:longline/mas-paper-owner-chain'],
        },
      }),
      task({
        task_id: 'agent-lab-longline-task:mag/grant-controlled-soak',
        domain_id: 'med-autogrant',
        task_family: 'longline_grant_foundry_controlled_soak',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:mag/grant-controlled-soak',
          sandbox_policy: 'provider_hosted_no_forbidden_write_guard',
          network_policy: 'domain_owner_policy',
          resource_limits: { max_hours: 12, max_stage_attempts: 6 },
        },
        instructions_ref: 'instructions:longline/mag-grant-controlled-soak',
        agent_entry_ref: 'domain-agent-entry:med-autogrant',
        stage_refs: ['stage:mag/strategy-review', 'stage:mag/controlled-apply', 'stage:mag/owner-receipt'],
        oracle_refs: ['oracle:mag/grant-transition-oracle'],
        scorer_refs: ['scorer:mag/fundability-owner-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:longline/mag-retry-after-tool-failure',
            probe_kind: 'retry_after_tool_failure',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:mag/controlled-soak-retry'],
          },
          {
            probe_ref: 'recovery-probe:longline/mag-receipt-reconciliation',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt-reconciliation:mag/controlled-soak'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:longline/mag-grant-controlled-soak',
          run_ref: 'run:longline/mag-grant-controlled-soak',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:longline/mag-grant-controlled-soak'],
          tool_call_refs: ['tool-call:mag/receipt-reconciliation-proof'],
          artifact_refs: ['artifact-ref:mag/proposal-package-locator-only'],
          receipt_refs: ['owner-receipt:mag/grant-controlled-soak'],
          repair_refs: ['repair-ref:mag/controlled-soak-retry'],
          trace_refs: ['trace-ref:agent-lab/mag-longline'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:longline/mag-fundability-owner-chain',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mag/fundability-evidence'],
          evidence_refs: ['evidence-ref:mag/controlled-soak-receipt'],
          review_refs: ['review-ref:mag/grant-owner'],
          quality_gate_refs: ['quality-gate:mag/fundability-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:longline/mag-controlled-soak-routing',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:mag/controlled-soak',
          evidence_refs: ['failure-taxonomy:mag/longline-controlled-soak'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:longline/mag-grant-controlled-soak',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:longline/mag-grant-controlled-soak',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:longline/mag-fundability-owner-chain'],
          regression_suite_refs: ['regression-suite:agent-lab/mag-controlled-soak'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:longline/mag-controlled-soak'],
        },
      }),
      task({
        task_id: 'agent-lab-longline-task:rca/visual-controlled-soak',
        domain_id: 'redcube-ai',
        task_family: 'longline_presentation_foundry_visual_soak',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:rca/visual-controlled-soak',
          sandbox_policy: 'provider_hosted_no_forbidden_write_guard',
          network_policy: 'domain_owner_policy',
          resource_limits: { max_hours: 12, max_stage_attempts: 6 },
        },
        instructions_ref: 'instructions:longline/rca-visual-controlled-soak',
        agent_entry_ref: 'domain-agent-entry:redcube-ai',
        stage_refs: ['stage:rca/render-review', 'stage:rca/no-regression', 'stage:rca/owner-receipt'],
        oracle_refs: ['oracle:rca/visual-transition-spec'],
        scorer_refs: ['scorer:rca/visual-quality-owner-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:longline/rca-artifact-restore',
            probe_kind: 'artifact_restore',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['restore-proof:rca/visual-controlled-soak'],
          },
          {
            probe_ref: 'recovery-probe:longline/rca-hosted-attempt-reconciliation',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['hosted-attempt-reconciliation:rca/visual-controlled-soak'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:longline/rca-visual-controlled-soak',
          run_ref: 'run:longline/rca-visual-controlled-soak',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:longline/rca-visual-controlled-soak'],
          tool_call_refs: ['tool-call:rca/hosted-attempt-reconciliation'],
          artifact_refs: ['artifact-ref:rca/visual-package-locator-only'],
          receipt_refs: ['owner-receipt:rca/visual-no-regression'],
          repair_refs: ['repair-ref:rca/render-retry'],
          trace_refs: ['trace-ref:agent-lab/rca-longline'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:longline/rca-visual-no-regression',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:rca/block-content-fit'],
          evidence_refs: ['evidence-ref:rca/hosted-attempt-no-regression'],
          review_refs: ['review-ref:rca/visual-owner'],
          quality_gate_refs: ['quality-gate:rca/visual-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:longline/rca-visual-soak-routing',
          candidate_kind: 'tool_policy',
          target_ref: 'tool-policy-ref:rca/visual-controlled-soak',
          evidence_refs: ['failure-taxonomy:rca/longline-visual-soak'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:longline/rca-visual-controlled-soak',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:longline/rca-visual-controlled-soak',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:longline/rca-visual-no-regression'],
          regression_suite_refs: ['regression-suite:agent-lab/rca-visual-soak'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:longline/rca-visual-soak'],
        },
      }),
    ],
  };
}

export function buildLonglineAgentLabResult() {
  return runAgentLabSuite(buildLonglineAgentLabSuite());
}

export function agentLabRefSummary(result: ReturnType<typeof runAgentLabSuite>) {
  return {
    surface_kind: 'opl_agent_lab_ref_summary',
    suite_id: result.suite_id,
    status: result.status,
    task_refs: result.refs.task_refs,
    scorecard_refs: result.refs.domain_quality_scorecard_refs,
    recovery_probe_refs: result.refs.recovery_probe_refs,
    improvement_candidate_refs: result.refs.improvement_candidate_refs,
    promotion_gate_refs: result.refs.promotion_gate_refs,
    blocked_run_count: result.summary.blocked_run_count,
    authority_boundary: result.authority_boundary,
  };
}
