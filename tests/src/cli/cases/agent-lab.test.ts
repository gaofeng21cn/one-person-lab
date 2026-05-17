import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('agent-lab sample exposes a minimal framework read-model sample', () => {
  const output = runCli(['agent-lab', 'sample', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_sample.surface_id, 'opl_agent_lab_framework_sample');
  assert.equal(output.agent_lab_sample.sample_result.surface_kind, 'opl_agent_lab_suite_result');
  assert.equal(output.agent_lab_sample.sample_result.status, 'passed');
  assert.equal(output.agent_lab_sample.sample_result.summary.task_count, 3);
  assert.equal(output.agent_lab_sample.sample_result.summary.recovery_probe_count, 5);
  assert.deepEqual(output.agent_lab_sample.ref_summary.scorecard_refs, [
    'quality-scorecard:mas/paper-repair-smoke',
    'quality-scorecard:mag/grant-section-smoke',
    'quality-scorecard:rca/visual-deliverable-smoke',
  ]);
  assert.equal(output.agent_lab_sample.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_sample.authority_boundary.can_write_memory_body, false);
});

test('agent-lab longline exposes the central cross-domain longline suite and repo test reduction guidance', () => {
  const output = runCli(['agent-lab', 'longline', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_longline.surface_id, 'opl_agent_lab_longline_suite');
  assert.equal(output.agent_lab_longline.suite_result.status, 'passed');
  assert.equal(output.agent_lab_longline.suite_result.suite_kind, 'agent_lab_longline_suite');
  assert.equal(output.agent_lab_longline.suite_result.longline_summary.longline_task_count, 3);
  assert.equal(output.agent_lab_longline.suite_result.longline_summary.ready_to_reduce_domain_longline_tests, true);
  assert.deepEqual(output.agent_lab_longline.suite_result.longline_summary.domain_ids, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);
  assert.equal(output.agent_lab_longline.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_longline.authority_boundary.can_write_domain_truth, false);
});

test('agent-lab complete exposes the complete eval, observability, and optimizer control plane', () => {
  const output = runCli(['agent-lab', 'complete', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_complete.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.equal(output.agent_lab_complete.status, 'ready_for_opl_native_use');
  assert.equal(output.agent_lab_complete.readiness.ready_to_connect_inspect_ai_adapter, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_optimizer_candidate_refs, true);
  assert.equal(output.agent_lab_complete.readiness.automatic_model_training_ready, false);
  assert.equal(output.agent_lab_complete.readiness.automatic_default_agent_promotion_ready, false);
  assert.equal(output.agent_lab_complete.readiness.app_workbench_consumption_ready, true);
  assert.ok(output.agent_lab_complete.eval_adapters.some((entry: any) => entry.adapter_id === 'inspect-ai'));
  assert.ok(output.agent_lab_complete.observability_exports.some((entry: any) => entry.export_id === 'phoenix'));
});

test('agent-lab workbench exposes the App-ready read model', () => {
  const output = runCli(['agent-lab', 'workbench', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_workbench.surface_kind, 'opl_agent_lab_workbench_read_model');
  assert.equal(output.agent_lab_workbench.app_workbench_consumption_ready, true);
  assert.equal(output.agent_lab_workbench.observability_export_readiness.upload_external_service, false);
  assert.equal(output.agent_lab_workbench.observability_export_readiness.reads_domain_body, false);
  assert.equal(output.agent_lab_workbench.optimizer_candidates.length, 6);
  assert.equal(output.agent_lab_workbench.promotion_gates.length, 6);
  assert.equal(output.agent_lab_workbench.online_learning_refs.transitions.length, 6);
  assert.equal(output.agent_lab_workbench.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(output.agent_lab_workbench.authority_boundary.can_write_domain_truth, false);
});

test('agent-lab mechanism exposes a first-class refs-only mechanism object', () => {
  const output = runCli(['agent-lab', 'mechanism', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_mechanism.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(output.agent_lab_mechanism.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(output.agent_lab_mechanism.mechanism_version, 'opl-agent-lab-mechanism.v1');
  assert.equal(output.agent_lab_mechanism.editable_surfaces.length, 4);
  assert.equal(output.agent_lab_mechanism.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(output.agent_lab_mechanism.meta_edit_receipt.writes_memory_body, false);
  assert.equal(output.agent_lab_mechanism.meta_edit_receipt.mutates_artifact, false);
  assert.equal(output.agent_lab_mechanism.evolution_segment.segment_kind, 'mechanism_baseline_segment_ref');
  assert.equal(output.agent_lab_mechanism.evidence_delta.domain_truth_delta_written, false);
  assert.equal(output.agent_lab_mechanism.next_mechanism_candidate.default_promotion, false);
  assert.equal(output.agent_lab_mechanism.refs_only, true);
});

test('agent-lab export emits refs-only connector envelopes for optional targets', () => {
  const inspect = runCli(['agent-lab', 'export', '--target', 'inspect-ai', '--json']);
  const openinference = runCli(['agent-lab', 'export', '--target', 'openinference', '--json']);
  const langfuse = runCli(['agent-lab', 'export', '--target', 'langfuse', '--json']);
  const phoenix = runCli(['agent-lab', 'export', '--target', 'phoenix', '--json']);
  const json = runCli(['agent-lab', 'export', '--target', 'json', '--json']);

  assert.equal(inspect.agent_lab_export.surface_kind, 'opl_agent_lab_export_envelope');
  assert.equal(inspect.agent_lab_export.target, 'inspect-ai');
  assert.equal(inspect.agent_lab_export.upload_external_service, false);
  assert.equal(inspect.agent_lab_export.reads_domain_body, false);
  assert.equal(inspect.agent_lab_export.connector_payload.tasks.length, 6);
  assert.equal(openinference.agent_lab_export.connector_payload.traces.length, 4);
  assert.equal(langfuse.agent_lab_export.connector_payload.datasets.length, 2);
  assert.equal(phoenix.agent_lab_export.connector_payload.experiments.length, 2);
  assert.equal(json.agent_lab_export.connector_payload.suite_results.length, 2);
});

test('agent-lab run accepts an external OPL-compatible suite generated by an OPL meta-agent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-external-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'opl-meta-agent-self-bootstrap-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:opl-meta-agent/sample-brief-agent-baseline',
        domain_id: 'opl-meta-agent',
        task_family: 'agent_building_baseline',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:opl-meta-agent/sample-brief-agent',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:opl-meta-agent/sample-brief-agent',
        agent_entry_ref: 'domain-agent-entry:sample-brief-agent',
        stage_refs: ['stage:sample-brief-agent/intake', 'stage:sample-brief-agent/draft'],
        oracle_refs: ['oracle:opl-meta-agent/baseline-contract-valid'],
        scorer_refs: ['scorer:opl-meta-agent/baseline-acceptance'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:opl-meta-agent/resume-after-interruption',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:opl-meta-agent/resume-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:opl-meta-agent/sample-brief-agent-baseline',
          run_ref: 'run:opl-meta-agent/sample-brief-agent-baseline',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:opl-meta-agent/sample-brief-agent-baseline'],
          tool_call_refs: ['tool-call:opl-agents-scaffold'],
          artifact_refs: ['artifact-ref:sample-brief-agent/package'],
          receipt_refs: ['owner-receipt:opl-meta-agent/baseline-delivery'],
          repair_refs: ['repair-ref:opl-meta-agent/no-current-repair'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:opl-meta-agent/baseline-acceptance',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:descriptor-valid', 'metric-ref:agent-lab-suite-valid'],
          evidence_refs: ['evidence-ref:sample-brief-agent/scaffold-validation'],
          review_refs: ['review-ref:opl-meta-agent/baseline-review'],
          quality_gate_refs: ['quality-gate:opl-meta-agent/baseline-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:opl-meta-agent/rubric-gap-tightening',
          candidate_kind: 'rubric_gap',
          target_ref: 'quality-gate:opl-meta-agent/baseline-owner',
          evidence_refs: ['failure-taxonomy:opl-meta-agent/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:opl-meta-agent/sample-brief-agent',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:opl-meta-agent/sample-brief-agent',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:opl-meta-agent/baseline-acceptance'],
          regression_suite_refs: ['regression-suite:opl-meta-agent/self-bootstrap'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:opl-meta-agent/self-bootstrap'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'run', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_run.surface_id, 'opl_agent_lab_external_suite_run');
    assert.equal(output.agent_lab_run.suite_result.status, 'passed');
    assert.equal(output.agent_lab_run.suite_result.suite_kind, 'agent_lab_external_suite');
    assert.deepEqual(output.agent_lab_run.suite_result.domain_summary.map((entry: any) => entry.domain_id), [
      'opl-meta-agent',
    ]);
    assert.ok(output.agent_lab_run.ref_summary.improvement_candidate_refs.includes(
      'improvement-candidate:opl-meta-agent/rubric-gap-tightening',
    ));
    assert.equal(output.agent_lab_run.authority_boundary.can_write_memory_body, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab optimize runs an external suite into gated candidate and RL transition refs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-optimize-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'opl-meta-agent-optimizer-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:opl-meta-agent/optimizer-candidate',
        domain_id: 'opl-meta-agent',
        task_family: 'agent_optimizer_candidate',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:opl-meta-agent/optimizer',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:opl-meta-agent/optimizer',
        agent_entry_ref: 'domain-agent-entry:optimizer-agent',
        stage_refs: ['stage:optimizer/baseline'],
        oracle_refs: ['oracle:optimizer/baseline-valid'],
        scorer_refs: ['scorer:optimizer/acceptance'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:optimizer/resume',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:optimizer/resume'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:optimizer/candidate',
          run_ref: 'run:optimizer/candidate',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:optimizer/candidate'],
          tool_call_refs: ['tool-call:optimizer/run-suite'],
          artifact_refs: ['artifact-ref:optimizer/config-locator'],
          receipt_refs: ['owner-receipt:optimizer/baseline'],
          repair_refs: ['repair-ref:optimizer/no-current-repair'],
          trace_refs: ['trace-ref:optimizer/candidate'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:optimizer/baseline',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:optimizer/pass'],
          evidence_refs: ['evidence-ref:optimizer/baseline'],
          review_refs: ['review-ref:optimizer/domain-owner'],
          quality_gate_refs: ['quality-gate:optimizer/owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:optimizer/prompt',
          candidate_kind: 'prompt',
          target_ref: 'prompt-ref:optimizer/default',
          evidence_refs: ['failure-taxonomy:optimizer/no-current-failure'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:optimizer/candidate',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:optimizer/candidate',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:optimizer/baseline'],
          regression_suite_refs: ['regression-suite:optimizer/baseline'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:optimizer/baseline'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'optimize', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_optimize.surface_kind, 'opl_agent_lab_optimize_result');
    assert.equal(output.agent_lab_optimize.status, 'gated_candidate_set_ready');
    assert.equal(output.agent_lab_optimize.gated_optimizer_candidate_set.candidate_count, 1);
    assert.equal(output.agent_lab_optimize.rl_transition_refs.transition_count, 1);
    assert.equal(output.agent_lab_optimize.automatic_model_training_ready, false);
    assert.equal(output.agent_lab_optimize.automatic_default_agent_promotion_ready, false);
    assert.equal(output.agent_lab_optimize.authority_boundary.can_promote_default_agent_without_gate, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab evolve runs an external suite into a refs-only mechanism evolution segment', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-evolve-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'opl-meta-agent-evolution-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:opl-meta-agent/evolution-candidate',
        domain_id: 'opl-meta-agent',
        task_family: 'agent_mechanism_evolution',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:opl-meta-agent/evolution',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:opl-meta-agent/evolution',
        agent_entry_ref: 'domain-agent-entry:evolution-agent',
        stage_refs: ['stage:evolution/baseline'],
        oracle_refs: ['oracle:evolution/baseline-valid'],
        scorer_refs: ['scorer:evolution/acceptance'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:evolution/resume',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:evolution/resume'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:evolution/candidate',
          run_ref: 'run:evolution/candidate',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:evolution/candidate'],
          tool_call_refs: ['tool-call:evolution/run-suite'],
          artifact_refs: ['artifact-ref:evolution/config-locator'],
          receipt_refs: ['owner-receipt:evolution/baseline'],
          repair_refs: ['repair-ref:evolution/no-current-repair'],
          trace_refs: ['trace-ref:evolution/candidate'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:evolution/baseline',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:evolution/pass'],
          evidence_refs: ['evidence-ref:evolution/baseline'],
          review_refs: ['review-ref:evolution/domain-owner'],
          quality_gate_refs: ['quality-gate:evolution/owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:evolution/stage-policy',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:evolution/default',
          evidence_refs: ['failure-taxonomy:evolution/no-current-failure'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:evolution/candidate',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:evolution/candidate',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:evolution/baseline'],
          regression_suite_refs: ['regression-suite:evolution/baseline'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:evolution/baseline'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'evolve', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_evolve.surface_kind, 'opl_agent_lab_evolution_result');
    assert.equal(output.agent_lab_evolve.status, 'next_mechanism_candidate_ready');
    assert.equal(output.agent_lab_evolve.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
    assert.equal(output.agent_lab_evolve.editable_surfaces.length, 4);
    assert.equal(output.agent_lab_evolve.meta_edit_receipt.writes_domain_truth, false);
    assert.equal(output.agent_lab_evolve.meta_edit_receipt.writes_memory_body, false);
    assert.equal(output.agent_lab_evolve.meta_edit_receipt.mutates_artifact, false);
    assert.equal(output.agent_lab_evolve.evolution_segment.segment_kind, 'mechanism_suite_evolution_segment_ref');
    assert.equal(output.agent_lab_evolve.evidence_delta.domain_truth_delta_written, false);
    assert.equal(output.agent_lab_evolve.evidence_delta.memory_body_delta_written, false);
    assert.equal(output.agent_lab_evolve.evidence_delta.artifact_delta_written, false);
    assert.equal(output.agent_lab_evolve.next_mechanism_candidate.default_promotion, false);
    assert.equal(output.agent_lab_evolve.automatic_model_training_ready, false);
    assert.equal(output.agent_lab_evolve.automatic_default_agent_promotion_ready, false);
    assert.equal(output.agent_lab_evolve.refs_only, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('bin/opl routes agent-lab commands into the OPL CLI instead of Codex passthrough', () => {
  const result = spawnSync(
    path.join(repoRoot, 'bin', 'opl'),
    ['agent-lab', 'complete', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_SKIP_SKILL_SYNC: '1',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.agent_lab_complete.surface_kind, 'opl_agent_lab_complete_control_plane');
});

test('agent-lab command surface does not embed the independent meta-agent product', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];

  assert.equal(commands.some((command: string) => command.includes('meta-builder')), false);
  assert.equal(commands.some((command: string) => command.includes('meta-agent')), false);
  assert.equal(examples.some((example) => example.includes('meta-builder')), false);
  assert.equal(examples.some((example) => example.includes('meta-agent')), false);
});
