import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';

const readJsonArtifact = (filePath: string): any => parseJsonText(fs.readFileSync(filePath, 'utf8'));

test('agent-lab workflow-template run materializes deterministic executable workflow artifacts', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-workflow-run-'));
  const projectDir = path.join(fixtureRoot, 'project');
  const outputRoot = path.join(fixtureRoot, 'workflow-output');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    name: 'workflow-runner-fixture',
    private: true,
  }), 'utf8');

  try {
    const patternExpectations: Record<string, { lanes: string[]; verifierKinds: string[] }> = {
      fan_out_and_synthesize: {
        lanes: ['analysis_lane', 'implementation_lane', 'verification_lane'],
        verifierKinds: ['synthesis_ref_integrity', 'lane_disjointness'],
      },
      adversarial_verification: {
        lanes: ['candidate_lane', 'adversary_lane', 'arbiter_lane'],
        verifierKinds: ['adversarial_independence', 'candidate_ref_binding'],
      },
      loop_until_done: {
        lanes: ['iteration_lane', 'evaluator_lane', 'resume_lane'],
        verifierKinds: ['loop_stop_condition', 'resume_token_consistency'],
      },
      worktree_isolation: {
        lanes: ['base_checkout_lane', 'candidate_worktree_lane', 'merge_review_lane'],
        verifierKinds: ['write_set_disjointness', 'worktree_cleanup_gate'],
      },
    };

    for (const [templateId, expectation] of Object.entries(patternExpectations)) {
      const outputDir = path.join(outputRoot, templateId);
      const output = runCli([
        'agent-lab',
        'workflow-template',
        'run',
        '--template',
        templateId,
        '--project',
        projectDir,
        '--output',
        outputDir,
        '--json',
      ]);

      assert.equal(output.version, 'g2');
      const run = output.agent_lab_workflow_template_run;
      assert.equal(run.surface_kind, 'opl_agent_lab_workflow_template_run');
      assert.equal(run.template_id, templateId);
      assert.equal(run.status, 'planned_no_subagents_executed');
      assert.equal(run.project_dir, path.resolve(projectDir));
      assert.equal(run.output_dir, path.resolve(outputDir));
      assert.match(run.resume_token, /^workflow-resume-token:agent-lab\//);
      assert.equal(run.authority_boundary.can_define_runtime_substrate, false);
      assert.equal(run.authority_boundary.can_write_domain_truth, false);
      assert.equal(run.authority_boundary.can_write_owner_receipt, false);
      assert.equal(run.final_proof.no_subagents_executed, true);
      assert.equal(run.final_proof.no_domain_truth_written, true);
      assert.equal(run.final_proof.no_owner_receipt_written, true);
      assert.equal(run.required_artifact_status.suite_topology_ref, true);
      assert.equal(run.required_artifact_status.verifier_ref, true);
      assert.equal(run.required_artifact_status.work_order_draft_ref, true);
      assert.equal(run.required_artifact_status.work_order_sequence_ref, true);
      assert.equal(run.required_artifact_status.runner_execution_receipt_ref, true);
      assert.equal(run.required_artifact_status.typed_blocker_ref_or_acceptance_ref, true);
      assert.match(run.suite_topology_ref, /^workflow-template-run-ref:agent-lab\//);
      assert.match(run.work_order_sequence_ref, /^workflow-template-run-ref:agent-lab\//);
      assert.match(run.runner_execution_receipt_ref, /^workflow-template-run-ref:agent-lab\//);
      assert.match(run.typed_blocker_ref_or_acceptance_ref, /^workflow-template-run-ref:agent-lab\//);
      assert.deepEqual(run.workflow_spec.lanes.map((lane: any) => lane.lane_kind), expectation.lanes);
      assert.deepEqual(run.workflow_spec.verifier_refs.map((verifier: any) => verifier.verifier_kind),
        expectation.verifierKinds);
      assert.equal(run.workflow_spec.progress_event_refs.length >= 4, true);
      assert.equal(run.workflow_spec.work_order_draft_refs.length, expectation.lanes.length);
      assert.equal(run.runner_execution_receipt.status, 'runner_receipt_emitted');
      assert.equal(run.runner_execution_receipt.required_artifact_status.runner_execution_receipt_ref, true);
      assert.equal(run.typed_blocker_or_acceptance.status, 'accepted_no_blocker_for_draft_runner');

      const files = run.artifact_files as Record<string, string>;
      assert.deepEqual(Object.keys(files).sort(), [
        'final_proof',
        'lane_refs',
        'progress_events',
        'resume_token',
        'runner_execution_receipt',
        'suite_topology',
        'typed_blocker_or_acceptance',
        'verifier_refs',
        'work_order_draft_refs',
        'work_order_sequence',
        'workflow_spec',
      ]);
      for (const file of Object.values(files)) {
        assert.equal(fs.existsSync(file), true);
      }

      const workflowSpec = readJsonArtifact(files.workflow_spec);
      const suiteTopology = readJsonArtifact(files.suite_topology);
      const laneRefs = readJsonArtifact(files.lane_refs);
      const verifierRefs = readJsonArtifact(files.verifier_refs);
      const workOrderDraftRefs = readJsonArtifact(files.work_order_draft_refs);
      const workOrderSequence = readJsonArtifact(files.work_order_sequence);
      const progressEvents = readJsonArtifact(files.progress_events);
      const finalProof = readJsonArtifact(files.final_proof);
      const typedBlockerOrAcceptance = readJsonArtifact(files.typed_blocker_or_acceptance);
      const runnerExecutionReceipt = readJsonArtifact(files.runner_execution_receipt);
      const resumeToken = fs.readFileSync(files.resume_token, 'utf8').trim();

      assert.equal(workflowSpec.template_id, templateId);
      assert.equal(suiteTopology.suite_topology_ref, run.suite_topology_ref);
      assert.deepEqual(suiteTopology.lane_refs, run.lane_refs);
      assert.deepEqual(laneRefs.map((lane: any) => lane.lane_kind), expectation.lanes);
      assert.deepEqual(verifierRefs.map((verifier: any) => verifier.verifier_kind), expectation.verifierKinds);
      assert.equal(workOrderDraftRefs.length, expectation.lanes.length);
      assert.equal(workOrderSequence.work_order_sequence_ref, run.work_order_sequence_ref);
      assert.deepEqual(
        workOrderSequence.ordered_work_order_draft_refs.map((entry: any) => entry.work_order_draft_ref),
        run.work_order_draft_refs,
      );
      assert.deepEqual(progressEvents.map((event: any) => event.event_kind), [
        'workflow_spec_written',
        'suite_topology_written',
        'lane_refs_written',
        'verifier_refs_written',
        'work_order_draft_refs_written',
        'work_order_sequence_written',
        'resume_token_written',
        'final_synthesis_written',
        'typed_acceptance_written',
        'runner_execution_receipt_written',
      ]);
      assert.equal(finalProof.proof_kind, 'workflow_template_run_noop_proof');
      assert.equal(typedBlockerOrAcceptance.typed_blocker_ref_or_acceptance_ref,
        run.typed_blocker_ref_or_acceptance_ref);
      assert.equal(runnerExecutionReceipt.runner_execution_receipt_ref, run.runner_execution_receipt_ref);
      assert.equal(runnerExecutionReceipt.required_artifact_status.runner_execution_receipt_ref, true);
      assert.equal(resumeToken, run.resume_token);

      const artifactBody = JSON.stringify({
        workflowSpec,
        suiteTopology,
        laneRefs,
        verifierRefs,
        workOrderDraftRefs,
        workOrderSequence,
        progressEvents,
        finalProof,
        typedBlockerOrAcceptance,
        runnerExecutionReceipt,
      });
      assert.equal(artifactBody.includes('"runtime_substrate"'), false);
      assert.equal(artifactBody.includes('"domain_truth"'), false);
      assert.equal(artifactBody.includes('"quality_verdict"'), false);
      assert.equal(artifactBody.includes('"owner_receipt"'), false);
      assert.equal(artifactBody.includes('"release_ready"'), false);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent-lab rho run materializes no-apply RHO artifacts and work-order draft from sessions', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-rho-run-'));
  const projectDir = path.join(fixtureRoot, 'target-agent');
  const sessionsDir = path.join(fixtureRoot, 'sessions', '2026', '06', '13');
  const outputDir = path.join(fixtureRoot, 'rho-output');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), 'Original target harness\n', 'utf8');
  const beforeHarness = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8');
  const rolloutPath = path.join(sessionsDir, 'rollout-2026-06-13T00-00-00-test.jsonl');
  const events = [
    { type: 'session_meta', payload: { cwd: projectDir } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'Fix failing Agent Lab workflow tests and verify no forbidden writes.' } },
    { type: 'response_item', payload: { type: 'function_call', arguments: { cmd: 'npm test', workdir: projectDir } } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'Implemented a focused patch but one verification command failed before retry.' } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'Final answer: tests pass after adding verifier evidence.' } },
  ];
  fs.writeFileSync(rolloutPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');

  try {
    const output = runCli([
      'agent-lab',
      'rho',
      'run',
      '--project',
      projectDir,
      '--sessions',
      path.join(fixtureRoot, 'sessions'),
      '--output',
      outputDir,
      '--max-trajectories',
      '4',
      '--json',
    ]);
    const run = output.agent_lab_rho_run;
    const receipt = run.execution_receipt;

    assert.equal(output.version, 'g2');
    assert.equal(run.surface_kind, 'opl_agent_lab_rho_backend_run');
    assert.equal(run.status, 'executable_no_apply_receipt_emitted');
    assert.equal(receipt.surface_kind, 'opl_agent_lab_rho_execution_receipt');
    assert.equal(receipt.apply_mode, 'no_apply');
    assert.equal(receipt.no_apply_proof.target_repo_mutated, false);
    assert.equal(receipt.no_apply_proof.direct_apply_executed, false);
    assert.equal(receipt.required_artifact_status.trajectory_digest_ref, true);
    assert.equal(receipt.required_artifact_status.work_order_draft_ref, true);
    assert.equal(receipt.trajectory_digest_refs.length, 1);
    assert.equal(receipt.diagnosis_refs.length, 1);
    assert.equal(receipt.candidate_harness_refs.length, 3);
    assert.equal(receipt.self_preference_score_refs.length, 3);
    assert.equal(receipt.candidate_diff_refs.length, 1);
    assert.equal(receipt.work_order_draft_refs.length, 1);
    assert.equal(receipt.no_forbidden_write_refs.length, 1);
    assert.equal(run.authority_boundary.can_direct_apply, false);
    assert.equal(run.authority_boundary.can_write_domain_truth, false);
    assert.equal(run.authority_boundary.can_write_owner_receipt, false);

    const files = run.artifact_files as Record<string, string>;
    assert.deepEqual(Object.keys(files).sort(), [
      'backend_plan',
      'candidate_diff',
      'candidate_harnesses',
      'diagnosis',
      'execution_receipt',
      'no_forbidden_write',
      'promotion_evidence',
      'self_preference_scores',
      'trajectory_digests',
      'winner',
      'work_order_draft',
    ]);
    for (const file of Object.values(files)) {
      assert.equal(fs.existsSync(file), true);
    }

    const workOrder = readJsonArtifact(files.work_order_draft);
    const digests = readJsonArtifact(files.trajectory_digests);
    const noForbiddenWrite = readJsonArtifact(files.no_forbidden_write);
    assert.equal(workOrder.status, 'ready_for_target_agent_source_patch');
    assert.match(workOrder.executor_lease_ref, /^executor-lease:codex-cli\/rho\//);
    assert.equal(workOrder.authority_boundary.can_write_target_domain_truth, false);
    assert.equal(workOrder.authority_boundary.can_authorize_target_domain_quality_or_export, false);
    assert.equal(digests[0].source_file, rolloutPath);
    assert.equal(noForbiddenWrite.target_repo_mutated, false);
    assert.equal(fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8'), beforeHarness);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
