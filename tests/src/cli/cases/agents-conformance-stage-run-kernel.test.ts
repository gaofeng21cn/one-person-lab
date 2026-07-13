import { assert, fs, parseJsonText, path, runCliReadOnly, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance blocks missing StageRun kernel profile', async () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json'));

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_run_kernel_profile_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_run_kernel_profile_not_declared'),
    true,
  );
});

test('agents conformance blocks missing controlled StageRun canary evidence', async () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json'));

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_run_canary_evidence_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_run_canary_evidence_not_declared'),
    true,
  );
});

test('agents conformance keeps StageRun strategy refs advisory and current owner delta as default surface', async () => {
  const repoDir = buildReadyAgentRepo();
  const profilePath = path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json');
  const profile = parseJsonText(fs.readFileSync(profilePath, 'utf8')) as Record<string, any>;
  profile.stage_context_policy = {
    hard_blockers: [
      'identity',
      'owner',
      'scope',
      'selected_executor',
      'authority_boundary',
      'forbidden_write',
      'currentness',
      'permission_or_credential',
      'irreversible_action',
      'explicit_human_gate',
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

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_kernel_profile_checks;

  assert.equal(report.status, 'passed');
  assert.equal(checks.status, 'passed');
  assert.equal(checks.stage_context_policy.advisory_refs_can_block_launch, false);
  assert.deepEqual(checks.stage_context_policy.advisory_refs, [
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

test('agents conformance blocks StageRun profile that turns strategy refs or raw worklist into launch authority', async () => {
  const repoDir = buildReadyAgentRepo();
  const profilePath = path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json');
  const profile = parseJsonText(fs.readFileSync(profilePath, 'utf8')) as Record<string, any>;
  profile.stage_context_policy = {
    hard_blockers: [
      'identity',
      'owner',
      'scope',
      'selected_executor',
      'authority_boundary',
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

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
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

test('agents conformance rejects a second transition authority plane and keeps quality budgets non-blocking', async () => {
  const repoDir = buildReadyAgentRepo();
  const profilePath = path.join(repoDir, 'contracts', 'stage_run_kernel_profile.json');
  const profile = parseJsonText(fs.readFileSync(profilePath, 'utf8')) as Record<string, any>;
  profile.codex_semantic_route_policy.quality_budget_exhaustion_blocks_route = true;
  profile.codex_semantic_route_policy.owner_receipt_required_for_quality_or_ready_claim = false;
  profile.transition_authority = { terminal_transition_authority: 'program_oracle' };
  writeJson(profilePath, profile);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_kernel_profile_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.status, 'blocked');
  assert.equal(
    checks.blockers.includes(
      'stage_run_kernel_profile_quality_budget_exhaustion_must_not_block_route',
    ),
    true,
  );
  assert.equal(
    checks.blockers.includes(
      'stage_run_kernel_profile_owner_receipt_required_for_quality_or_ready_claim',
    ),
    true,
  );
  assert.equal(
    checks.blockers.includes('stage_run_kernel_profile_second_transition_authority_plane_forbidden'),
    true,
  );
});

test('agents conformance blocks controlled StageRun canary evidence missing strategy layers', async () => {
  const repoDir = buildReadyAgentRepo();
  const evidencePath = path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json');
  const evidence = parseJsonText(fs.readFileSync(evidencePath, 'utf8')) as Record<string, any>;
  evidence.strategy_trace = {
    candidate_generation: evidence.strategy_trace.candidate_generation,
  };
  writeJson(evidencePath, evidence);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
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

test('agents conformance blocks controlled StageRun canary evidence that claims authority', async () => {
  const repoDir = buildReadyAgentRepo();
  const evidencePath = path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json');
  const evidence = parseJsonText(fs.readFileSync(evidencePath, 'utf8')) as Record<string, any>;
  evidence.authority_boundary.controlled_canary_claims_live_domain_progress = true;
  evidence.authority_boundary.provider_completion_counts_as_closeout = true;
  evidence.closeout.same_attempt_self_review = true;
  writeJson(evidencePath, evidence);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
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

test('agents conformance projects controlled StageRun canary evidence for operator reading', async () => {
  const repoDir = buildReadyAgentRepo();

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const summary = report.reports[0].stage_run_canary_evidence_checks.operator_summary;

  assert.equal(summary.surface_kind, 'opl_stage_run_controlled_canary_operator_summary');
  assert.equal(summary.status, 'ready');
  assert.equal(summary.domain_id, 'sample-brief-agent');
  assert.equal(summary.read_model_role, 'operator_visible_cognitive_work_refs_without_domain_progress_claim');
  assert.equal(summary.cognitive_work.strategy_layer_count, 6);
  assert.equal(summary.role_artifacts.required_role_count, 6);
  assert.equal(summary.role_artifacts.resolved_role_count, 6);
  assert.equal(summary.visible_progress_policy.controlled_fixture_counts_as_live_domain_progress, false);
  assert.equal(summary.visible_progress_policy.conformance_pass_counts_as_domain_ready, false);
  assert.equal(summary.authority_boundary.can_claim_domain_ready, false);
  assert.equal(summary.authority_boundary.can_claim_quality_or_export_ready, false);
  assert.equal(summary.authority_boundary.can_claim_production_ready, false);
});

test('agents conformance blocks controlled StageRun canary evidence overclaim fields', async () => {
  const repoDir = buildReadyAgentRepo();
  const evidencePath = path.join(repoDir, 'contracts', 'stage_run_canary_evidence.json');
  const evidence = parseJsonText(fs.readFileSync(evidencePath, 'utf8')) as Record<string, any>;
  evidence.operator_projection = {
    domain_ready: true,
    quality_verdict: 'approved',
    export_ready: 'ready',
    production_ready: 'complete',
  };
  writeJson(evidencePath, evidence);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const checks = report.reports[0].stage_run_canary_evidence_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(checks.forbidden_claim_scan.status, 'blocked');
  assert.equal(checks.forbidden_claim_scan.forbidden_claim_count, 4);
  assert.equal(
    checks.blockers.some((blocker: string) =>
      blocker.startsWith('stage_run_canary_evidence_forbidden_claim:domain_ready:')
    ),
    true,
  );
  assert.equal(
    checks.blockers.some((blocker: string) =>
      blocker.startsWith('stage_run_canary_evidence_forbidden_claim:quality_verdict:')
    ),
    true,
  );
});
