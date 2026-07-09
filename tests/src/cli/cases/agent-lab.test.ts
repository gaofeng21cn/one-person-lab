import { after } from 'node:test';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import './agent-lab-cases/export-and-cost.ts';
import './agent-lab-loop-risk.test.ts';

const agentLabCliStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-cli-state-'));
const previousOplStateDir = process.env.OPL_STATE_DIR;
process.env.OPL_STATE_DIR = agentLabCliStateRoot;
after(() => {
  if (previousOplStateDir === undefined) {
    delete process.env.OPL_STATE_DIR;
  } else {
    process.env.OPL_STATE_DIR = previousOplStateDir;
  }
  fs.rmSync(agentLabCliStateRoot, { recursive: true, force: true });
});

function stageCompletionPolicy(policyRef: string) {
  return {
    surface_kind: 'domain_stage_completion_policy',
    policy_ref: policyRef,
    completion_judgment_owner: 'domain_stage',
    closeout_packet_required: true,
    provider_completion_is_domain_completion: false,
    opl_content_judgment_allowed: false,
    next_stage_transition_owner: 'opl_runtime',
    required_closeout_outcomes: ['completed_and_continue', 'completed_and_wait_owner', 'route_back', 'blocked', 'rejected'],
    accepted_closeout_ref_fields: ['owner_receipt_ref', 'typed_blocker_ref', 'human_gate_ref', 'route_back_ref'],
    authority_boundary: {
      opl_can_decide_domain_completion: false,
      provider_completion_counts_as_stage_complete: false,
    },
  };
}

function assertBlockedAuthority(boundary: Record<string, unknown>) {
  for (const key of [
    'can_write_domain_truth',
    'can_write_memory_body',
    'can_authorize_quality_verdict',
    'can_write_owner_receipt',
    'can_mutate_domain_artifact',
    'can_promote_default_agent',
    'can_train_or_deploy_model_weights',
    'can_mutate_artifact_body',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

function agentLabTask(overrides: Record<string, any> = {}, includeStagePolicy = true) {
  const task: Record<string, any> = {
    task_id: 'agent-lab-task:sample/baseline',
    domain_id: 'sample-domain-agent',
    task_family: 'agent_lab_baseline',
    environment: {
      environment_kind: 'fixture',
      workspace_locator_ref: 'workspace-locator:sample/baseline',
      sandbox_policy: 'fixture_only_no_artifact_mutation',
      network_policy: 'offline',
    },
    instructions_ref: 'instructions:sample/baseline',
    agent_entry_ref: 'domain-agent-entry:sample-domain-agent',
    stage_refs: ['stage:sample/draft'],
    stage_completion_policy: stageCompletionPolicy('stage-completion-policy:sample/baseline'),
    oracle_refs: ['oracle:sample/baseline'],
    scorer_refs: ['scorer:sample/baseline'],
    recovery_probes: [
      {
        probe_ref: 'recovery-probe:sample/resume',
        probe_kind: 'resume_after_interruption',
        expected_status: 'passed',
        observed_status: 'passed',
        source_refs: ['receipt:sample/resume'],
      },
    ],
    trajectory: {
      trajectory_ref: 'trajectory:sample/baseline',
      run_ref: 'run:sample/baseline',
      agent_executor: 'codex_cli',
      stage_attempt_refs: ['stage-attempt:sample/baseline'],
      tool_call_refs: ['tool-call:sample/run'],
      artifact_refs: ['artifact-ref:sample/package'],
      receipt_refs: ['owner-receipt:sample/baseline'],
      repair_refs: ['repair-ref:sample/no-current-repair'],
      trace_refs: ['trace-ref:sample/baseline'],
    },
    scorecard: {
      scorecard_ref: 'quality-scorecard:sample/baseline',
      domain_owned: true,
      opl_scorecard_role: 'scorecard_ref_projection_only',
      passed: true,
      metric_refs: ['metric-ref:sample/pass'],
      evidence_refs: ['evidence-ref:sample/pass'],
      review_refs: ['review-ref:sample/domain-owner'],
      quality_gate_refs: ['quality-gate:sample/owner'],
    },
    improvement_candidate: {
      candidate_ref: 'improvement-candidate:sample/prompt',
      candidate_kind: 'prompt',
      target_ref: 'prompt-ref:sample/default',
      evidence_refs: ['failure-taxonomy:sample/no-current-failure'],
      allowed_change_scope: 'branch_only',
      promotion_gate_ref: 'promotion-gate:sample/baseline',
    },
    promotion_gate: {
      gate_ref: 'promotion-gate:sample/baseline',
      gate_status: 'passed',
      required_refs: ['quality-scorecard:sample/baseline'],
      regression_suite_refs: ['regression-suite:sample/baseline'],
      no_forbidden_write_proof_refs: ['no-forbidden-write:sample/baseline'],
    },
  };
  if (!includeStagePolicy) delete task.stage_completion_policy;
  return { ...task, ...overrides };
}

function suitePathFor(tmpDir: string, suite: Record<string, any>) {
  const suitePath = path.join(tmpDir, 'suite.json');
  fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
  return suitePath;
}

test('agent-lab sample longline and MAG external run expose refs-only read models', () => {
  const sample = runCli(['agent-lab', 'sample', '--json']).agent_lab_sample;
  const longline = runCli(['agent-lab', 'longline', '--json']).agent_lab_longline;
  const suitePath = path.join(repoRoot, 'contracts/opl-framework/external-suites/mag-live-acceptance-suite.json');
  const magRun = runCli(['agent-lab', 'run', '--suite', suitePath, '--json']).agent_lab_run;

  assert.equal(sample.surface_id, 'opl_agent_lab_framework_sample');
  assert.equal(sample.sample_result.status, 'passed');
  assert.equal(sample.sample_result.summary.task_count, 3);
  assert.equal(sample.sample_result.summary.stage_completion_policy_blocker_count, 0);
  assert.equal(sample.sample_result.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assertBlockedAuthority(sample.authority_boundary);

  assert.equal(longline.surface_id, 'opl_agent_lab_longline_suite');
  assert.equal(longline.suite_result.status, 'passed');
  assert.equal(longline.suite_result.longline_summary.ready_to_reduce_domain_longline_tests, true);
  assert.deepEqual(longline.suite_result.longline_summary.domain_ids, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);
  assertBlockedAuthority(longline.authority_boundary);

  assert.equal(magRun.surface_id, 'opl_agent_lab_external_suite_run');
  assert.equal(magRun.suite_result.status, 'passed');
  assert.equal(magRun.suite_result.summary.owner_or_human_gate_required_count, 1);
  assert.deepEqual(magRun.suite_result.domain_summary.map((entry: any) => entry.domain_id), ['med-autogrant']);
  assert.ok(magRun.ref_summary.improvement_candidate_refs.includes(
    'improvement-candidate:mag/owner-live-acceptance-receipt-scaleout',
  ));
  assertBlockedAuthority(magRun.authority_boundary);
});

test('agent-lab complete workbench efficiency and policy surfaces keep automatic authority closed', () => {
  const complete = runCli(['agent-lab', 'complete', '--json']).agent_lab_complete;
  const workbench = runCli(['agent-lab', 'workbench', '--json']).agent_lab_workbench;
  const efficiency = runCli(['agent-lab', 'efficiency', '--json']).agent_lab_efficiency;
  const policy = runCli(['agent-lab', 'stage-executor-policy', '--json']).agent_lab_stage_executor_policy;

  assert.equal(complete.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.equal(complete.status, 'ready_for_opl_native_use');
  assert.equal(complete.readiness.app_workbench_consumption_ready, true);
  assert.equal(complete.readiness.automatic_mechanism_promotion_ready, false);
  assert.equal(complete.readiness.automatic_model_training_ready, false);
  assert.equal(complete.executor_capability_aperture.summary.runtime_issued_lease_count, 3);
  assertBlockedAuthority(complete.executor_capability_aperture.authority_boundary);
  assertBlockedAuthority(complete.codex_attempt_trace_flywheel.authority_boundary);

  assert.equal(workbench.surface_kind, 'opl_agent_lab_workbench_read_model');
  assert.equal(workbench.app_workbench_consumption_ready, true);
  assert.equal(workbench.stage_executor_policy.default_executor_kind, 'codex_cli');
  assert.equal(workbench.codex_attempt_trace_flywheel.summary.trace_ready_count, 3);
  assertBlockedAuthority(workbench.authority_boundary);

  assert.equal(efficiency.read_model.surface_kind, 'opl_agent_lab_efficiency_nonregression_read_model');
  assert.equal(efficiency.read_model.status, 'ready');
  assert.equal(efficiency.read_model.evidence_groups.owner_route_refs.length > 0, true);
  assertBlockedAuthority(efficiency.authority_boundary);

  assert.equal(policy.surface_kind, 'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(policy.default_executor_kind, 'codex_cli');
  assert.equal(policy.trial_ready_candidate_count, 1);
  assert.equal(policy.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(policy.authority_boundary.can_claim_quality_equivalence, false);
});

test('agent-lab mechanism workflow-template and rho stay refs-only', () => {
  const mechanism = runCli(['agent-lab', 'mechanism', '--json']).agent_lab_mechanism;
  const template = runCli(['agent-lab', 'workflow-template', '--json']).agent_lab_workflow_template;
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-rho-project-'));
  try {
    const rho = runCli(['agent-lab', 'rho', '--project', fixtureRoot, '--json']).agent_lab_rho.backend_plan;

    assert.equal(mechanism.surface_kind, 'opl_agent_lab_mechanism_read_model');
    assert.equal(mechanism.status, 'review_pending');
    assert.equal(mechanism.refs_only, true);
    assert.equal(mechanism.mechanism_promotion_policy.automatic_mechanism_promotion_ready, false);
    assert.equal(mechanism.meta_edit_receipt.writes_domain_truth, false);
    assert.equal(template.surface_kind, 'opl_agent_lab_workflow_template_catalog');
    assert.equal(template.refs_only, true);
    assert.equal(template.template_catalog.template_count, 8);
    assert.ok(template.forbidden_claims.includes('domain_truth'));
    assertBlockedAuthority(template.authority_boundary);
    assert.equal(rho.surface_kind, 'opl_agent_lab_rho_backend_plan');
    assert.equal(rho.apply_mode, 'no_apply');
    assert.equal(rho.refs_only, true);
    assert.match(rho.winner_ref, /^rho-winner-ref:/);
    assertBlockedAuthority(rho.authority_boundary);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent-lab run accepts external suites and blocks missing stage completion policy', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-external-suite-'));
  try {
    const acceptedSuite = {
      suite_id: 'opl-meta-agent-self-bootstrap-suite',
      suite_kind: 'agent_lab_external_suite',
      authority_boundary: {
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_authorize_quality_verdict: false,
        can_promote_default_agent_without_gate: false,
      },
      tasks: [agentLabTask({
        domain_id: 'opl-meta-agent',
        task_id: 'agent-lab-task:opl-meta-agent/sample-brief-agent-baseline',
      })],
    };
    const accepted = runCli(['agent-lab', 'run', '--suite', suitePathFor(tmpDir, acceptedSuite), '--json'])
      .agent_lab_run;
    assert.equal(accepted.suite_result.status, 'passed');
    assert.deepEqual(accepted.suite_result.refs.stage_completion_policy_refs, [
      'stage-completion-policy:sample/baseline',
    ]);
    assert.deepEqual(accepted.suite_result.domain_summary.map((entry: any) => entry.domain_id), ['opl-meta-agent']);
    assertBlockedAuthority(accepted.authority_boundary);

    const blockedSuite = {
      suite_id: 'stage-completion-gap-suite',
      suite_kind: 'agent_lab_external_suite',
      authority_boundary: acceptedSuite.authority_boundary,
      tasks: [agentLabTask({}, false)],
    };
    const blocked = runCli(['agent-lab', 'run', '--suite', suitePathFor(tmpDir, blockedSuite), '--json'])
      .agent_lab_run.suite_result;
    assert.equal(blocked.status, 'blocked');
    assert.deepEqual(blocked.missing_observations, ['domain_stage_completion_policies_observed']);
    assert.equal(blocked.summary.stage_completion_policy_blocker_count, 1);
    assert.deepEqual(blocked.refs.stage_completion_policy_blocker_refs, [
      'stage-completion-policy-blocker:stage_completion_policy_missing',
    ]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab run and optimize project evidence and candidate refs without owner authority', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-production-evidence-suite-'));
  try {
    const productionSuite = {
      suite_id: 'domain-agent-production-evidence-suite',
      suite_kind: 'agent_production_evidence_suite',
      authority_boundary: {
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_authorize_quality_verdict: false,
        can_write_owner_receipt: false,
      },
      production_evidence_gate: {
        surface_kind: 'production_evidence_gate_refs',
        gate_ids: ['production-evidence-gate:domain-agent/runtime-watch'],
        gate_result_refs: ['gate-result-ref:domain-agent/production-evidence/agent-lab-run'],
        owner_route_ref: 'owner-route:domain-agent/quality-owner',
        no_forbidden_write_proof_refs: ['no-forbidden-write:domain-agent/agent-lab-production-evidence'],
        typed_blocker_refs: ['typed-blocker-ref:domain-agent/owner-receipt-required'],
        required_owner_receipt_refs: ['required-owner-receipt-ref:domain-agent/production-evidence-closeout'],
        domain_verdict_claimed: false,
      },
      tasks: [agentLabTask({ task_family: 'production_evidence_gate' })],
    };
    const gateRun = runCli(['agent-lab', 'run', '--suite', suitePathFor(tmpDir, productionSuite), '--json'])
      .agent_lab_run;
    const gate = gateRun.suite_result.production_evidence_gate_result;
    assert.equal(gateRun.suite_result.status, 'passed');
    assert.equal(gate.surface_kind, 'opl_agent_lab_production_evidence_gate_result');
    assert.equal(gate.domain_verdict_claimed, false);
    assert.equal(gate.writes_domain_truth, false);
    assert.equal(gate.writes_owner_receipt, false);
    assert.deepEqual(gate.owner_route_refs, ['owner-route:domain-agent/quality-owner']);
    assert.deepEqual(gate.typed_blocker_refs, ['typed-blocker-ref:domain-agent/owner-receipt-required']);
    assertBlockedAuthority(gateRun.authority_boundary);

    const optimizeSuite = {
      suite_id: 'opl-meta-agent-optimizer-suite',
      suite_kind: 'agent_lab_external_suite',
      authority_boundary: {
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_authorize_quality_verdict: false,
        can_promote_default_agent_without_gate: false,
      },
      tasks: [agentLabTask({ domain_id: 'opl-meta-agent', task_family: 'agent_optimizer_candidate' })],
    };
    const optimize = runCli(['agent-lab', 'optimize', '--suite', suitePathFor(tmpDir, optimizeSuite), '--json'])
      .agent_lab_optimize;
    assert.equal(optimize.surface_kind, 'opl_agent_lab_optimize_result');
    assert.equal(optimize.status, 'review_pending');
    assert.equal(optimize.gated_optimizer_candidate_set.candidate_count, 1);
    assert.equal(optimize.gated_optimizer_candidate_set.auto_promotable_candidate_count, 0);
    assert.equal(optimize.automatic_mechanism_promotion_ready, false);
    assert.equal(optimize.automatic_model_training_ready, false);
    assert.equal(optimize.authority_boundary.can_promote_default_agent_without_gate, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
