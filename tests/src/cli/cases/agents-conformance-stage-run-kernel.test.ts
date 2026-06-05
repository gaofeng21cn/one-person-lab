import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks missing StageRun kernel profile', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_run_kernel_profile_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_run_kernel_profile_not_declared'),
    true,
  );
});

test('agents conformance blocks missing controlled StageRun canary evidence', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_run_canary_evidence_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_run_canary_evidence_not_declared'),
    true,
  );
});

test('agents conformance keeps StageRun strategy refs advisory and current owner delta as default surface', () => {
  const repoDir = buildReadyAgentRepo();
  const profilePath = path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  profile.launch_admission_policy = {
    hard_blockers: [
      'identity',
      'owner',
      'scope',
      'selected_executor',
      'authority_boundary',
      'required_role_artifacts',
      'receipt_or_blocker_shape',
      'forbidden_write',
      'replay_audit_lineage',
    ],
    advisory_refs: [
      'prompt_refs',
      'skill_refs',
      'tool_affordance_refs',
      'knowledge_refs',
      'rubric_refs',
      'evaluation_refs',
    ],
    advisory_refs_can_block_launch: false,
  };
  profile.default_read_surface = {
    root: 'stage_run_current_owner_delta',
    raw_worklist_default: false,
    readiness_default: false,
    replay_packet_default: false,
  };
  writeJson(profilePath, profile);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_kernel_profile_checks;

  assert.equal(report.status, 'passed');
  assert.equal(checks.status, 'passed');
  assert.equal(checks.launch_admission_policy.advisory_refs_can_block_launch, false);
  assert.deepEqual(checks.launch_admission_policy.advisory_refs, [
    'prompt_refs',
    'skill_refs',
    'tool_affordance_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
  ]);
  assert.equal(checks.default_read_surface.root, 'stage_run_current_owner_delta');
  assert.equal(checks.default_read_surface.raw_worklist_default, false);
  assert.equal(checks.default_read_surface.readiness_default, false);
  assert.equal(checks.default_read_surface.replay_packet_default, false);
});

test('agents conformance blocks StageRun profile that turns strategy refs or raw worklist into launch authority', () => {
  const repoDir = buildReadyAgentRepo();
  const profilePath = path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  profile.launch_admission_policy = {
    hard_blockers: [
      'identity',
      'owner',
      'scope',
      'selected_executor',
      'authority_boundary',
      'required_role_artifacts',
      'receipt_or_blocker_shape',
      'prompt_refs',
      'skill_refs',
      'knowledge_refs',
    ],
    advisory_refs: [],
    advisory_refs_can_block_launch: true,
  };
  profile.default_read_surface = {
    root: 'raw_worklist',
    raw_worklist_default: true,
    readiness_default: true,
    replay_packet_default: true,
  };
  writeJson(profilePath, profile);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_kernel_profile_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_advisory_refs_can_block_launch'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_strategy_ref_promoted_to_launch_blocker:prompt_refs'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_strategy_ref_promoted_to_launch_blocker:skill_refs'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_strategy_ref_promoted_to_launch_blocker:knowledge_refs'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_default_read_surface_invalid'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_raw_worklist_default_forbidden'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_readiness_default_forbidden'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_replay_packet_default_forbidden'),
    true,
  );
});

test('agents conformance blocks controlled StageRun canary evidence missing strategy layers', () => {
  const repoDir = buildReadyAgentRepo();
  const evidencePath = path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  evidence.strategy_trace = {
    candidate_generation: evidence.strategy_trace.candidate_generation,
  };
  writeJson(evidencePath, evidence);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_canary_evidence_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.includes('stage_run_canary_evidence_strategy_layer_missing:grounded_reflection'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_canary_evidence_strategy_layer_missing:independent_quality_gate'),
    true,
  );
});

test('agents conformance blocks controlled StageRun canary evidence that claims authority', () => {
  const repoDir = buildReadyAgentRepo();
  const evidencePath = path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  evidence.authority_boundary.controlled_canary_claims_live_domain_progress = true;
  evidence.authority_boundary.provider_completion_counts_as_closeout = true;
  evidence.closeout.same_attempt_self_review = true;
  writeJson(evidencePath, evidence);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_canary_evidence_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.includes('stage_run_canary_evidence_same_attempt_self_review_forbidden'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_canary_evidence_authority_flag_must_be_false:controlled_canary_claims_live_domain_progress'),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_canary_evidence_authority_flag_must_be_false:provider_completion_counts_as_closeout'),
    true,
  );
});
