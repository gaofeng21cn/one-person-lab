import crypto from 'node:crypto';
import { after } from 'node:test';

import { assert, fs, os, path, repoRoot, runCli, runCliInCwd, test } from '../helpers.ts';
import './agent-lab-cases/export-and-cost.ts';
import './agent-lab-loop-risk.test.ts';
import {
  buildOmaTakeoverEvaluationFixture,
  retargetOmaTakeoverEvaluationFixture,
  writeBoundEvaluationRequest,
  writeEvaluationJson,
} from './agent-lab-evaluation-work-order-fixtures.ts';

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
    closeout_packet_required: false,
    raw_artifact_sufficient_for_progress: true,
    provider_completion_is_domain_completion: false,
    opl_content_judgment_allowed: false,
    next_stage_transition_owner: 'codex_cli',
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

test('agent-lab sample and generic longline expose refs-only read models', () => {
  const sample = runCli(['agent-lab', 'sample', '--json']).agent_lab_sample;
  const longline = runCli(['agent-lab', 'longline', '--json']).agent_lab_longline;

  assert.equal(sample.surface_id, 'opl_agent_lab_framework_sample');
  assert.equal(sample.sample_result.status, 'passed');
  assert.equal(sample.sample_result.summary.task_count, 3);
  assert.equal(sample.sample_result.summary.stage_completion_policy_blocker_count, 0);
  assert.equal(sample.sample_result.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assertBlockedAuthority(sample.authority_boundary);

  assert.equal(longline.surface_id, 'opl_agent_lab_longline_suite');
  assert.equal(longline.suite_result.status, 'blocked');
  assert.equal(longline.suite_result.longline_summary.ready_to_reduce_domain_longline_tests, false);
  assert.deepEqual(longline.suite_result.longline_summary.domain_ids, ['example-domain']);
  assertBlockedAuthority(longline.authority_boundary);
});

test('agent-lab longline resolves its default suite from the framework root', () => {
  const externalCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-external-cwd-'));
  try {
    const longline = runCliInCwd(['agent-lab', 'longline', '--json'], externalCwd).agent_lab_longline;

    assert.equal(longline.surface_id, 'opl_agent_lab_longline_suite');
    assert.equal(longline.suite_result.status, 'blocked');
    assert.deepEqual(longline.suite_result.longline_summary.domain_ids, ['example-domain']);
  } finally {
    fs.rmSync(externalCwd, { recursive: true, force: true });
  }
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

test('agent-lab run rejects evaluation provenance without a complete target identity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-public-target-guard-'));
  try {
    const suite = {
      suite_id: 'public-evaluation-target-guard-suite',
      suite_kind: 'agent_lab_external_suite',
      tasks: [agentLabTask({
        domain_id: 'opl-meta-agent',
        task_id: 'agent-lab-task:opl-meta-agent/public-target-guard',
      })],
    };
    const invalidCases: Array<Record<string, any>> = [
      { evaluation_provenance_refs: ['evaluation-receipt:public-cli/without-target'] },
      {
        evaluation_provenance_bindings: [{
          receipt_role: 'evaluation_packet',
          receipt_ref: 'evaluation-receipt:public-cli/without-target',
        }],
      },
      {
        evaluation_target_agent: {
          domain_id: 'target-agent',
          target_agent_ref: 'domain-agent:target-agent',
        },
      },
      {
        evaluation_target_agent: {
          domain_id: 'target-agent',
          target_agent_ref: ' ',
          descriptor_ref: '/tmp/target-agent/contracts/domain_descriptor.json',
        },
      },
      {
        evaluation_target_agent: {
          domain_id: 'target-agent',
          target_agent_ref: 'domain-agent:target-agent',
          descriptor_ref: '/tmp/target-agent/contracts/domain_descriptor.json',
        },
        evaluation_provenance_refs: ['evaluation-receipt:public-cli/paired'],
      },
      {
        evaluation_target_agent: {
          domain_id: 'target-agent',
          target_agent_ref: 'domain-agent:target-agent',
          descriptor_ref: '/tmp/target-agent/contracts/domain_descriptor.json',
        },
        evaluation_provenance_refs: ['evaluation-receipt:public-cli/raw'],
        evaluation_provenance_bindings: [{
          receipt_role: 'evaluation_packet',
          receipt_ref: 'evaluation-receipt:public-cli/binding',
        }],
      },
    ];

    for (const invalid of invalidCases) {
      assert.throws(
        () => runCli([
          'agent-lab', 'run', '--suite', suitePathFor(tmpDir, { ...suite, ...invalid }), '--json',
        ]),
        /evaluation_(target_agent|provenance)/,
      );
    }
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

test('agent-lab evaluation-work-order accepts OMA-owned takeover identity and keeps candidate outputs typed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-oma-producer-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    writeEvaluationJson(fixture.workOrderPath, fixture.workOrder);
    const result = runCli([
      'agent-lab',
      'evaluation-work-order',
      'execute',
      '--work-order', fixture.workOrderPath,
      '--output', fixture.outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;

    assert.equal(result.status, 'blocked_missing_evaluation_observations');
    assert.equal(result.suite_result, null);
    assert.deepEqual(result.receipt.improvement_candidate_refs, [fixture.ids.improvementCandidateRef]);
    assert.deepEqual(result.receipt.input_candidate_refs, fixture.workOrder.candidate_refs);
    assert.equal(result.receipt.target_agent.target_agent_ref, fixture.ids.targetAgentRef);
    assert.equal(result.receipt.target_agent.authority_boundary, undefined);
    assert.deepEqual(result.receipt.downstream_pending_outputs.mechanism_candidate_refs, [
      fixture.ids.mechanismCandidateRef,
    ]);
    assert.deepEqual(result.receipt.downstream_pending_outputs.other_candidate_refs, [
      fixture.ids.otherCandidateRef,
    ]);
    assert.deepEqual(result.receipt.mechanism_proposal_refs, []);
    assert.equal(fs.existsSync(path.join(fixture.outputDir, 'agent-lab-suite.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.outputDir, 'agent-lab-suite-result.json')), false);
    assert.throws(
      () => runCli([
        'agent-lab',
        'evaluation-work-order',
        'execute',
        '--work-order', fixture.workOrderPath,
        '--output', fixture.outputDir,
        '--json',
      ]),
      /already contains Foundry Lab evaluation artifacts/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects producer authority, locator, and ledger drift before compilation', async (t) => {
  const cases: Array<[
    string,
    (fixture: ReturnType<typeof buildOmaTakeoverEvaluationFixture>) => void,
    RegExp,
  ]> = [
    ['unknown authority owner', (fixture) => {
      (fixture.workOrder.authority_boundary as Record<string, any>).quality_verdict_owner = 'opl-meta-agent';
    }, /authority_boundary/],
    ['unknown false authority capability', (fixture) => {
      (fixture.workOrder.authority_boundary as Record<string, any>).oma_can_read_future_ledger = false;
    }, /authority_boundary/],
    ['nested target authority owner', (fixture) => {
      (fixture.workOrder.target_agent as Record<string, any>).authority_boundary = {
        quality_verdict_owner: 'opl-meta-agent',
      };
    }, /unsupported fields at work_order\.target_agent/],
    ['escaped target repository locator', (fixture) => {
      (fixture.workOrder.target_agent as Record<string, any>).repo_dir = '/tmp/untrusted-second-scheduler';
    }, /repo_dir/],
    ['alternate result ledger', (fixture) => {
      (fixture.workOrder as Record<string, any>).result_ledger = { ref: 'untrusted://second-ledger' };
    }, /unsupported fields at work_order/],
    ['alternate suite alias', (fixture) => {
      (fixture.workOrder as Record<string, any>).agent_lab_suite = { ref: 'untrusted://second-suite' };
    }, /unsupported fields at work_order/],
    ['nested request result ledger', (fixture) => {
      (fixture.workOrder.evaluation_request as Record<string, any>).result_ledger = {
        owner: 'opl-meta-agent',
      };
    }, /unsupported fields at work_order\.evaluation_request/],
    ['missing request digest', (fixture) => {
      delete (fixture.workOrder.evaluation_request as Record<string, any>).sha256;
    }, /evaluation_request\.sha256/],
    ['non-canonical request digest', (fixture) => {
      (fixture.workOrder.evaluation_request as Record<string, any>).sha256 = 'A'.repeat(64);
    }, /evaluation_request\.sha256/],
    ['nested target result ledger', (fixture) => {
      (fixture.workOrder.target_agent as Record<string, any>).result_ledger = {
        owner: 'opl-meta-agent',
      };
    }, /unsupported fields at work_order\.target_agent/],
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(name, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-work-order-boundary-'));
      try {
        const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
        mutate(fixture);
        writeEvaluationJson(fixture.workOrderPath, fixture.workOrder);
        assert.throws(
          () => runCli([
            'agent-lab', 'evaluation-work-order', 'execute',
            '--work-order', fixture.workOrderPath,
            '--output', fixture.outputDir,
            '--json',
          ]),
          expected,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
});

test('agent-lab evaluation-work-order compiles a thin OMA evaluation request into its own suite plan', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-oma-evaluation-request-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const evaluationRequestPath = path.join(tmpDir, 'oma-evaluation-request.json');
    const workOrder = fixture.workOrder as Record<string, any>;
    const request = {
      surface_kind: 'opl_meta_agent_foundry_evaluation_request',
      version: 'opl-meta-agent.foundry-evaluation-request.v1',
      request_id: 'oma-evaluation-request:target-agent/takeover',
      suite_id: fixture.ids.suiteId,
      suite_kind: 'agent_lab_external_suite',
      task_intents: [{
        task_id: fixture.ids.taskId,
        domain_id: fixture.ids.taskDomainId,
        task_family: 'agent_testing_takeover',
        instructions_ref: 'instructions:opl-meta-agent/target-agent/takeover',
        agent_entry_ref: 'domain-agent-entry:target-agent',
        stage_refs: ['stage:target-agent/external-agent-lab-evaluation-request'],
        oracle_refs: ['oracle:opl-meta-agent/target-agent/authority-boundary-preserved'],
        scorer_refs: ['scorer:opl-meta-agent/target-agent/takeover-acceptance'],
        metric_refs: ['metric-ref:descriptor-valid'],
        evidence_refs: ['evidence-ref:target-agent/descriptor-contract-read'],
        review_refs: ['review:target-agent/takeover'],
        quality_gate_refs: ['quality-gate:opl-meta-agent/target-agent/domain-owner-boundary'],
        trajectory_ref: fixture.ids.trajectoryRef,
        requested_run_ref: 'run:opl-meta-agent/target-agent/testing-takeover',
        artifact_refs: ['artifact-ref:target-agent/external-agent-package'],
        receipt_refs: ['owner-receipt:opl-meta-agent/target-agent/testing-takeover'],
        scorecard_ref: fixture.ids.scorecardRef,
        improvement_candidate: {
          candidate_ref: fixture.ids.improvementCandidateRef,
          candidate_kind: 'gated_self_evolution',
          target_ref: 'quality-gate:opl-meta-agent/target-agent/domain-owner-boundary',
          allowed_change_scope: 'branch_only',
        },
        promotion_gate_ref: fixture.ids.gateRef,
        regression_suite_refs: ['regression-suite:opl-meta-agent/target-agent/takeover'],
      }],
      authority_boundary: {
        refs_only: true,
        oma_can_execute_agent_lab_suite: false,
        oma_can_write_agent_lab_result: false,
        oma_can_write_owner_receipt_body: false,
        oma_can_write_promotion_gate: false,
        oma_can_claim_target_domain_ready: false,
        oma_can_claim_target_production_ready: false,
      },
    };
    workOrder.evaluation_request = {
      ref: path.basename(evaluationRequestPath),
      request_id: request.request_id,
      suite_id: request.suite_id,
      suite_kind: request.suite_kind,
    };
    Object.assign(fixture.evaluationRequest, request);
    writeBoundEvaluationRequest(fixture);

    const result = runCli([
      'agent-lab',
      'evaluation-work-order',
      'execute',
      '--work-order', fixture.workOrderPath,
      '--output', fixture.outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const suitePlan = JSON.parse(fs.readFileSync(result.artifacts.evaluation_suite_plan_path, 'utf8'));

    assert.equal(result.status, 'blocked_missing_evaluation_observations');
    assert.equal(result.evaluation_request_path, evaluationRequestPath);
    assert.equal(Object.hasOwn(result, 'suite_seed_path'), false);
    assert.equal(suitePlan.surface_kind, 'opl_foundry_lab_evaluation_suite_plan');
    assert.equal(suitePlan.producer, 'one-person-lab/OPL Foundry Lab');
    assert.equal(suitePlan.tasks[0].task_id, fixture.ids.taskId);
    assert.equal(
      suitePlan.tasks[0].environment.workspace_locator_ref,
      'workspace-locator:/tmp/target-agent',
    );
    assert.deepEqual(result.receipt.improvement_candidate_refs, [fixture.ids.improvementCandidateRef]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order binds canonical identity to request raw bytes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-request-byte-identity-'));
  try {
    const firstFixture = buildOmaTakeoverEvaluationFixture(path.join(tmpDir, 'first'));
    const secondFixture = buildOmaTakeoverEvaluationFixture(path.join(tmpDir, 'second'));
    (secondFixture.evaluationRequest.task_intents[0] as Record<string, any>).instructions_ref =
      'instructions:opl-meta-agent/target-agent/takeover/revised';
    writeBoundEvaluationRequest(secondFixture);

    const execute = (fixture: ReturnType<typeof buildOmaTakeoverEvaluationFixture>) => runCli([
      'agent-lab', 'evaluation-work-order', 'execute',
      '--work-order', fixture.workOrderPath,
      '--output', fixture.outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const first = execute(firstFixture);
    const second = execute(secondFixture);

    assert.notEqual(firstFixture.workOrder.work_order_id, secondFixture.workOrder.work_order_id);
    assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects request byte drift before parsing or output writes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-request-digest-mismatch-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    fs.writeFileSync(fixture.evaluationRequestPath, '{ invalid-json-after-signed-bytes\n', 'utf8');

    assert.throws(
      () => runCli([
        'agent-lab', 'evaluation-work-order', 'execute',
        '--work-order', fixture.workOrderPath,
        '--output', fixture.outputDir,
        '--json',
      ]),
      /evaluation request sha256 mismatch/,
    );
    assert.equal(fs.existsSync(fixture.outputDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects a refreshed digest with a stale work-order identity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-stale-request-identity-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    (fixture.evaluationRequest.task_intents[0] as Record<string, any>).instructions_ref =
      'instructions:opl-meta-agent/target-agent/takeover/revised';
    writeEvaluationJson(fixture.evaluationRequestPath, fixture.evaluationRequest);
    (fixture.workOrder.evaluation_request as Record<string, any>).sha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(fixture.evaluationRequestPath))
      .digest('hex');
    writeEvaluationJson(fixture.workOrderPath, fixture.workOrder);

    assert.throws(
      () => runCli([
        'agent-lab', 'evaluation-work-order', 'execute',
        '--work-order', fixture.workOrderPath,
        '--output', fixture.outputDir,
        '--json',
      ]),
      /canonical work_order_id must bind/,
    );
    assert.equal(fs.existsSync(fixture.outputDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects legacy producer suite seeds', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-legacy-suite-seed-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    (fixture.workOrder as Record<string, any>).suite_seed = {
      ref: 'agent-lab-suite-seed.json',
      suite_id: fixture.ids.suiteId,
      suite_kind: 'agent_lab_external_suite',
    };
    writeEvaluationJson(fixture.workOrderPath, fixture.workOrder);

    assert.throws(
      () => runCli([
        'agent-lab',
        'evaluation-work-order',
        'execute',
        '--work-order', fixture.workOrderPath,
        '--output', fixture.outputDir,
        '--json',
      ]),
      /must not carry producer-owned suite seeds or suite plans/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects OMA request authority owner and unknown capability fields', async (t) => {
  const cases: Array<[string, (request: Record<string, any>) => void]> = [
    ['quality verdict owner', (request) => {
      request.authority_boundary.quality_verdict_owner = 'opl-meta-agent';
    }],
    ['unknown false capability', (request) => {
      request.authority_boundary.oma_can_read_future_ledger = false;
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-request-authority-'));
      try {
        const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
        mutate(fixture.evaluationRequest as Record<string, any>);
        writeBoundEvaluationRequest(fixture);
        assert.throws(
          () => runCli([
            'agent-lab',
            'evaluation-work-order',
            'execute',
            '--work-order', fixture.workOrderPath,
            '--output', fixture.outputDir,
            '--json',
          ]),
          /authority_boundary/,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
});

test('agent-lab evaluation-work-order rejects producer-supplied observation gate fields', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-observation-binding-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const evaluationRequest = fixture.evaluationRequest as Record<string, any>;
    evaluationRequest.required_observations = ['task_manifests_observed'];
    evaluationRequest.production_evidence_gate = {
      gate_ids: ['seed-only-gate'],
      no_forbidden_write_proof_refs: ['seed-only-proof-must-not-be-observed'],
    };
    writeBoundEvaluationRequest(fixture);

    assert.throws(
      () => runCli([
        'agent-lab',
        'evaluation-work-order',
        'execute',
        '--work-order', fixture.workOrderPath,
        '--observations', fixture.observationsPath,
        '--output', fixture.outputDir,
        '--json',
      ]),
      /unsupported fields at evaluation_request/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects canonical target identity and framework owner drift', async (t) => {
  const otherOwner = 'other/Foundry Lab';
  const cases: Array<[
    string,
    (fixture: ReturnType<typeof buildOmaTakeoverEvaluationFixture>) => void,
    RegExp,
  ]> = [
    ['work-order target ref mismatch', (fixture) => {
      (fixture.workOrder.target_agent as Record<string, any>).target_agent_ref = 'domain-agent:other';
    }, /target_agent_ref/],
    ['work-order descriptor mismatch', (fixture) => {
      (fixture.workOrder.target_agent as Record<string, any>).descriptor_ref = '/tmp/other/descriptor.json';
    }, /descriptor_ref/],
    ['producer target ref is rejected', (fixture) => {
      (fixture.evaluationRequest as Record<string, any>).target_agent_ref = 'domain-agent:other';
    }, /unsupported fields at evaluation_request/],
    ['producer task descriptor is rejected', (fixture) => {
      (fixture.evaluationRequest.task_intents[0] as Record<string, any>).target_agent_descriptor_ref = '/tmp/other/descriptor.json';
    }, /producer-owned suite plan fields/],
    ['packet target ref mismatch', (fixture) => {
      (fixture.observations as Record<string, any>).target_agent_ref = 'domain-agent:other';
    }, /observations.*target_agent_ref/],
    ['observation descriptor mismatch', (fixture) => {
      (fixture.observations.tasks[0] as Record<string, any>).target_agent_descriptor_ref = '/tmp/other/descriptor.json';
    }, /observations.*target_agent_descriptor_ref/],
    ['all evaluation owners drift together', (fixture) => {
      const workOrder = fixture.workOrder as Record<string, any>;
      const observations = fixture.observations as Record<string, any>;
      workOrder.execution_owner = otherOwner;
      workOrder.consumer_dependency.owner = otherOwner;
      workOrder.execution_aperture.work_order_lifecycle_owner = otherOwner;
      workOrder.execution_aperture.result_ledger_owner = otherOwner;
      observations.evaluation_owner = otherOwner;
      observations.tasks[0].recovery_probe_observations[0].observation_owner = otherOwner;
      observations.tasks[0].trajectory_observation.observation_owner = otherOwner;
      observations.tasks[0].promotion_gate_observation.evaluation_owner = otherOwner;
    }, /canonical evaluation owner/],
    ['consumer owner mismatch', (fixture) => {
      (fixture.workOrder.consumer_dependency as Record<string, any>).owner = otherOwner;
    }, /consumer_dependency.owner/],
    ['producer suite execution owner is rejected', (fixture) => {
      (fixture.evaluationRequest as Record<string, any>).execution_owner = otherOwner;
    }, /unsupported fields at evaluation_request/],
    ['lifecycle owner mismatch', (fixture) => {
      (fixture.workOrder.execution_aperture as Record<string, any>).work_order_lifecycle_owner = otherOwner;
    }, /work_order_lifecycle_owner/],
    ['result ledger owner mismatch', (fixture) => {
      (fixture.workOrder.execution_aperture as Record<string, any>).result_ledger_owner = otherOwner;
    }, /result_ledger_owner/],
    ['target closeout owner mismatch', (fixture) => {
      (fixture.workOrder.execution_aperture as Record<string, any>).target_owner_closeout_owner = otherOwner;
    }, /target_owner_closeout_owner/],
    ['producer promotion evaluator is rejected', (fixture) => {
      (fixture.evaluationRequest.task_intents[0] as Record<string, any>).promotion_gate_request = {
        evaluation_owner: otherOwner,
      };
      (fixture.observations.tasks[0].promotion_gate_observation as Record<string, any>).evaluation_owner = otherOwner;
    }, /producer-owned suite plan fields/],
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(name, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-owner-identity-'));
      try {
        const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
        mutate(fixture);
        writeBoundEvaluationRequest(fixture);
        assert.throws(
          () => runCli([
            'agent-lab', 'evaluation-work-order', 'execute',
            '--work-order', fixture.workOrderPath,
            '--observations', fixture.observationsPath,
            '--output', fixture.outputDir,
            '--json',
          ]),
          expected,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
});

test('agent-lab evaluation provenance changes suite-result and execution-receipt identity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-provenance-identity-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const execute = (outputDir: string) => runCli([
      'agent-lab', 'evaluation-work-order', 'execute',
      '--work-order', fixture.workOrderPath,
      '--observations', fixture.observationsPath,
      '--output', outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const first = execute(path.join(tmpDir, 'first'));
    (fixture.observations as Record<string, any>).evaluation_receipt_ref =
      'evaluation-receipt:opl-foundry-lab/target-agent/takeover/revised';
    writeEvaluationJson(fixture.observationsPath, fixture.observations);
    const second = execute(path.join(tmpDir, 'second'));

    assert.notEqual(first.suite_result.result_id, second.suite_result.result_id);
    assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation provenance role swap changes identities without changing raw refs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-provenance-role-identity-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const execute = (outputDir: string) => runCli([
      'agent-lab', 'evaluation-work-order', 'execute',
      '--work-order', fixture.workOrderPath,
      '--observations', fixture.observationsPath,
      '--output', outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const first = execute(path.join(tmpDir, 'first'));
    const observations = fixture.observations as Record<string, any>;
    const policy = observations.tasks[0].stage_completion_policy;
    [observations.evaluation_receipt_ref, policy.policy_receipt_ref] = [
      policy.policy_receipt_ref,
      observations.evaluation_receipt_ref,
    ];
    writeEvaluationJson(fixture.observationsPath, observations);
    const second = execute(path.join(tmpDir, 'second'));

    assert.deepEqual(first.receipt.evaluation_provenance_refs, second.receipt.evaluation_provenance_refs);
    assert.notDeepEqual(
      first.receipt.evaluation_provenance_bindings,
      second.receipt.evaluation_provenance_bindings,
    );
    assert.notEqual(first.suite_result.result_id, second.suite_result.result_id);
    assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab consistent evaluation target swap changes compiled result and receipt identities', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-target-identity-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const execute = (outputDir: string) => runCli([
      'agent-lab', 'evaluation-work-order', 'execute',
      '--work-order', fixture.workOrderPath,
      '--observations', fixture.observationsPath,
      '--output', outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const first = execute(path.join(tmpDir, 'first'));
    const target = retargetOmaTakeoverEvaluationFixture(fixture, 'other-target-agent');
    const second = execute(path.join(tmpDir, 'second'));
    const compiledSuite = JSON.parse(fs.readFileSync(second.artifacts.compiled_suite_path, 'utf8'));

    assert.deepEqual(compiledSuite.evaluation_target_agent, target);
    assert.deepEqual(second.suite_result.evaluation_target_agent, target);
    assert.deepEqual(second.receipt.evaluation_target_agent, target);
    assert.deepEqual(first.receipt.evaluation_provenance_refs, second.receipt.evaluation_provenance_refs);
    assert.notEqual(first.suite_result.result_id, second.suite_result.result_id);
    assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab blocked evaluation target swap changes platform blocker and receipt identities', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-blocked-target-identity-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const execute = (outputDir: string) => runCli([
      'agent-lab', 'evaluation-work-order', 'execute',
      '--work-order', fixture.workOrderPath,
      '--output', outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const first = execute(path.join(tmpDir, 'first'));
    const target = retargetOmaTakeoverEvaluationFixture(fixture, 'other-target-agent');
    const second = execute(path.join(tmpDir, 'second'));

    assert.deepEqual(second.evaluation_result.evaluation_target_agent, target);
    assert.deepEqual(second.typed_blocker.evaluation_target_agent, target);
    assert.deepEqual(second.receipt.evaluation_target_agent, target);
    assert.notEqual(first.typed_blocker.blocker_id, second.typed_blocker.blocker_id);
    assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab domain evaluation outcomes remain target-owner pending without platform blockers', async (t) => {
  const cases: Array<[string, (observations: Record<string, any>) => void]> = [
    ['domain scorecard blocked', (observations) => {
      observations.tasks[0].scorecard_observation.passed = false;
    }],
    ['promotion gate blocked', (observations) => {
      observations.tasks[0].promotion_gate_observation.gate_status = 'blocked';
    }],
    ['recovery outcome blocked', (observations) => {
      observations.tasks[0].recovery_probe_observations[0].observed_status = 'blocked';
    }],
    ['domain stage policy blocked', (observations) => {
      observations.tasks[0].stage_completion_policy.closeout_packet_required = true;
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-domain-blocked-'));
      try {
        const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
        const observations = fixture.observations as Record<string, any>;
        mutate(observations);
        writeEvaluationJson(fixture.observationsPath, observations);
        const result = runCli([
          'agent-lab', 'evaluation-work-order', 'execute',
          '--work-order', fixture.workOrderPath,
          '--observations', fixture.observationsPath,
          '--output', fixture.outputDir,
          '--json',
        ]).agent_lab_evaluation_work_order_execution;

        assert.equal(result.status, 'blocked');
        assert.equal(result.typed_blocker, null);
        assert.equal(result.artifacts.typed_blocker_path, null);
        assert.equal(result.receipt.platform_blocker_ref, null);
        assert.equal(
          result.receipt.downstream_pending_outputs.reason,
          'target_owner_closeout_required_for_blocked_domain_evaluation',
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
});

test('agent-lab evaluation-work-order rejects unknown improvement allowed_change_scope', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-invalid-change-scope-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    (fixture.evaluationRequest.task_intents[0].improvement_candidate as Record<string, any>).allowed_change_scope =
      'future_automatic_scope';
    writeBoundEvaluationRequest(fixture);
    assert.throws(
      () => runCli([
        'agent-lab', 'evaluation-work-order', 'execute',
        '--work-order', fixture.workOrderPath,
        '--output', fixture.outputDir,
        '--json',
      ]),
      /allowed_change_scope/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evaluation-work-order rejects unbound identity, provenance, and unknown true authority', async (t) => {
  const cases: Array<[string, (observations: Record<string, any>) => void, RegExp]> = [
    ['packet evaluator mismatch', (observations) => {
      observations.evaluation_owner = 'other-evaluator';
    }, /evaluation_owner/],
    ['missing packet evaluation receipt', (observations) => {
      delete observations.evaluation_receipt_ref;
    }, /evaluation_receipt_ref/],
    ['task domain mismatch', (observations) => {
      observations.tasks[0].domain_id = 'target-agent';
    }, /observations.*domain_id/],
    ['target agent mismatch', (observations) => {
      observations.tasks[0].target_agent_ref = 'domain-agent:other-agent';
    }, /target_agent_ref/],
    ['scorecard owner mismatch', (observations) => {
      observations.tasks[0].scorecard_observation.scorecard_owner = 'target-agent';
    }, /scorecard_owner/],
    ['missing scorecard receipt', (observations) => {
      delete observations.tasks[0].scorecard_observation.scorecard_receipt_ref;
    }, /scorecard_receipt_ref/],
    ['missing trajectory receipt', (observations) => {
      delete observations.tasks[0].trajectory_observation.observation_receipt_ref;
    }, /trajectory_observation.*observation_receipt_ref/],
    ['promotion evaluator mismatch', (observations) => {
      observations.tasks[0].promotion_gate_observation.evaluation_owner = 'other-evaluator';
    }, /promotion_gate_observation.*evaluation_owner/],
    ['stage policy owner mismatch', (observations) => {
      observations.tasks[0].stage_completion_policy.policy_owner = 'target-agent';
    }, /stage_completion_policy.*policy_owner/],
    ['undeclared recovery probe', (observations) => {
      observations.tasks[0].recovery_probe_observations.push({
        probe_ref: 'recovery-probe:undeclared',
        observed_status: 'passed',
        observation_owner: observations.evaluation_owner,
        observation_receipt_ref: 'probe-observation-receipt:undeclared',
      });
    }, /undeclared recovery probe observation/],
    ['unknown true authority', (observations) => {
      observations.tasks[0].stage_completion_policy.authority_boundary.can_generate_target_domain_owner_receipt = true;
    }, /forbidden authority claims/],
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(name, () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-invalid-observation-'));
      try {
        const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
        const observations = structuredClone(fixture.observations) as Record<string, any>;
        mutate(observations);
        writeEvaluationJson(fixture.observationsPath, observations);
        assert.throws(
          () => runCli([
            'agent-lab',
            'evaluation-work-order',
            'execute',
            '--work-order', fixture.workOrderPath,
            '--observations', fixture.observationsPath,
            '--output', fixture.outputDir,
            '--json',
          ]),
          expected,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
});

test('agent-lab production evaluation materializes gate evidence only from the observation packet', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-production-observation-'));
  try {
    const fixture = buildOmaTakeoverEvaluationFixture(tmpDir);
    const evaluationRequest = fixture.evaluationRequest as Record<string, any>;
    const workOrder = fixture.workOrder as Record<string, any>;
    const observations = fixture.observations as Record<string, any>;
    evaluationRequest.suite_kind = 'agent_production_evidence_suite';
    evaluationRequest.production_evidence_gate_ids = ['production_acceptance_contract_read'];
    workOrder.evaluation_request.suite_kind = evaluationRequest.suite_kind;
    writeBoundEvaluationRequest(fixture);
    assert.throws(
      () => runCli([
        'agent-lab',
        'evaluation-work-order',
        'execute',
        '--work-order', fixture.workOrderPath,
        '--observations', fixture.observationsPath,
        '--output', path.join(tmpDir, 'missing-production-gate-observation'),
        '--json',
      ]),
      /production_evidence_gate_observation/,
    );

    observations.production_evidence_gate_observation = {
      evaluation_owner: fixture.ids.evaluationOwner,
      evaluation_receipt_ref: 'production-gate-evaluation-receipt:opl-foundry-lab/target-agent',
      gate_ids: ['production_acceptance_contract_read'],
      owner_route_refs: ['owner-route:opl-meta-agent/target-agent'],
      no_forbidden_write_proof_refs: ['observed-no-forbidden-write-proof:target-agent'],
      typed_blocker_refs: [],
      required_owner_receipt_refs: ['observed-required-owner-receipt:target-agent'],
      gate_result_refs: ['observed-production-gate-result:target-agent'],
      domain_verdict_claimed: false,
    };
    writeEvaluationJson(fixture.observationsPath, observations);
    const result = runCli([
      'agent-lab',
      'evaluation-work-order',
      'execute',
      '--work-order', fixture.workOrderPath,
      '--observations', fixture.observationsPath,
      '--output', fixture.outputDir,
      '--json',
    ]).agent_lab_evaluation_work_order_execution;
    const compiledSuite = JSON.parse(fs.readFileSync(result.artifacts.compiled_suite_path, 'utf8'));
    const expectedProvenanceRefs = [
      ...fixture.evaluationProvenanceRefs,
      observations.production_evidence_gate_observation.evaluation_receipt_ref,
    ].sort();

    assert.deepEqual(compiledSuite.production_evidence_gate.no_forbidden_write_proof_refs, [
      'observed-no-forbidden-write-proof:target-agent',
    ]);
    assert.deepEqual(compiledSuite.evaluation_provenance_refs, expectedProvenanceRefs);
    assert.deepEqual(result.suite_result.refs.evaluation_provenance_refs, expectedProvenanceRefs);
    assert.equal(
      compiledSuite.production_evidence_gate.no_forbidden_write_proof_refs.includes(
        'seed-only-proof-must-not-be-observed',
      ),
      false,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
