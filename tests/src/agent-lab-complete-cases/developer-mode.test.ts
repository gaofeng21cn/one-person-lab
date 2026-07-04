import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import {
  buildDeveloperModeAgentLabRepairRoute,
  buildDeveloperModeAgentLabRepairRouteReadModel,
} from '../../../src/modules/foundry-lab/agent-lab-complete.ts';

const agentLabStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-complete-devmode-state-'));
const previousOplStateDir = process.env.OPL_STATE_DIR;
process.env.OPL_STATE_DIR = agentLabStateRoot;

after(() => {
  if (previousOplStateDir === undefined) {
    delete process.env.OPL_STATE_DIR;
  } else {
    process.env.OPL_STATE_DIR = previousOplStateDir;
  }
  fs.rmSync(agentLabStateRoot, { recursive: true, force: true });
});

function assertStringRef(value: unknown, pattern: RegExp) {
  if (typeof value !== 'string') {
    assert.fail(`Expected string ref, got ${typeof value}`);
  }
  assert.match(value, pattern);
}

test('Agent Lab Developer Mode repair route projects patrol fixes as refs only', () => {
  const result = buildDeveloperModeAgentLabRepairRouteReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.equal(result.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_required, true);
  assert.equal(result.refs_only, true);
  assert.deepEqual(result.patrol_projection.route_outputs, [
    'issue_ref',
    'blocker_ref',
    'owner_route_ref',
    'candidate_fix_ref',
    'repo_worktree_ref',
    'branch_ref',
    'pr_ref',
    'acceptance_evidence_ref',
    'follow_up_queue_item_ref',
  ]);
  assert.equal(result.summary.route_count, 2);
  assert.equal(result.summary.direct_owner_route_count, 1);
  assert.equal(result.summary.fork_pr_route_count, 1);
  assert.equal(result.summary.live_closeout_drill_count, 2);
  assert.equal(result.summary.live_closeout_ready_count, 1);
  assert.equal(result.summary.follow_up_queue_item_ref_count, 2);
  assert.equal(result.route_policy.owner_acceptance_ref,
    'direct_fix_external_owner_ref_fork_pr_github_pr_owner_acceptance_ref_fixture_refs_do_not_close_owner_acceptance');
  assert.equal(result.live_closeout_evidence.surface_kind,
    'opl_agent_lab_developer_mode_live_closeout_evidence_read_model');
  assert.equal(result.live_closeout_evidence.status, 'closeout_refs_incomplete');
  assert.equal(result.live_closeout_evidence.refs_only, true);
  assert.equal(result.live_closeout_evidence.summary.direct_fix_drill_count, 1);
  assert.equal(result.live_closeout_evidence.summary.fork_pr_drill_count, 1);
  assert.equal(result.live_closeout_evidence.summary.live_external_owner_acceptance_count, 0);
  assert.equal(result.live_closeout_evidence.summary.repo_contract_fixture_drill_count, 1);
  assert.equal(result.live_closeout_evidence.summary.repo_contract_fixture_not_live_repo_count, 1);
  assert.equal(result.live_closeout_evidence.summary.external_owner_acceptance_missing_count, 0);
  assert.equal(
    result.live_closeout_evidence.summary.fixture_drill_external_owner_acceptance_missing_count,
    1,
  );
  assert.equal(result.live_closeout_evidence.summary.fixture_drill_owner_acceptance_open_count, 1);
  assert.equal(result.live_closeout_evidence.summary.external_owner_closeout_refs_ready_count, 1);
  assert.equal(result.live_closeout_evidence.summary.forbidden_owner_receipt_write_count, 0);
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('route_eligibility'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('patrol_observation_ref'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('diff_ref'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('verification_refs'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('no_forbidden_write_ref'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes('commit_ref_or_fork_pr_refs'));
  assert.ok(result.live_closeout_evidence.required_closeout_ref_groups.includes(
    'external_owner_acceptance_ref',
  ));

  for (const route of result.routes) {
    assert.match(route.issue_ref, /^issue-ref:/);
    assert.match(route.blocker_ref, /^blocker-ref:/);
    assert.match(route.owner_route_ref, /^owner-route:/);
    assert.match(route.candidate_fix_ref, /^candidate-fix-ref:/);
    assert.match(route.repo_worktree_ref, /^repo-worktree-ref:/);
    assert.match(route.branch_ref, /^git-branch-ref:/);
    assert.match(route.pr_ref, /^github-pr-ref:/);
    assert.match(route.acceptance_evidence_ref, /^acceptance-evidence-ref:/);
    assert.match(route.follow_up_queue_item_ref, /^queue-item-ref:/);
    assert.equal(route.authority_boundary.writes_domain_truth, false);
    assert.equal(route.authority_boundary.writes_domain_artifact, false);
    assert.equal(route.authority_boundary.writes_memory_body, false);
    assert.equal(route.authority_boundary.writes_quality_verdict, false);
    assert.equal(route.authority_boundary.writes_owner_receipt, false);
    assert.equal(route.authority_boundary.modifies_managed_runtime, false);
  }

  const directRoute = result.routes.find((route) => route.route_mode === 'repo_developer_direct_fix');
  const forkRoute = result.routes.find((route) => route.route_mode === 'fork_pull_request');
  assert.ok(directRoute);
  assert.ok(forkRoute);
  assert.equal(directRoute.repo_developer_match_required, true);
  assert.equal(forkRoute.repo_developer_match_required, false);

  const directDrill = result.live_closeout_evidence.drills.find((drill: any) =>
    drill.route_decision === 'direct-fix');
  const forkPrDrill = result.live_closeout_evidence.drills.find((drill: any) =>
    drill.route_decision === 'fork-PR');
  assert.ok(directDrill);
  assert.ok(forkPrDrill);
  assert.equal(directDrill.route_status, 'closeout_refs_ready');
  assert.equal(directDrill.closeout_claim_status, 'external_owner_closeout_refs_ready');
  assert.equal(directDrill.closeout_refs.route_eligibility, 'eligible_direct_fix');
  assertStringRef(directDrill.closeout_refs.patrol_observation_ref, /^patrol-observation-ref:/);
  assertStringRef(directDrill.closeout_refs.diff_ref, /^diff-ref:/);
  assert.ok(directDrill.closeout_refs.verification_refs.every((ref: string) =>
    ref.startsWith('test-result-ref:')));
  assertStringRef(directDrill.closeout_refs.no_forbidden_write_ref, /^no-forbidden-write-ref:/);
  assertStringRef(directDrill.closeout_refs.commit_ref, /^git-commit-ref:/);
  assert.equal(directDrill.closeout_refs.fork_repo_ref, null);
  assert.equal(directDrill.closeout_refs.pr_review_ref, null);
  assertStringRef(directDrill.closeout_refs.owner_acceptance_ref, /^external-owner-ref:/);
  assert.equal(directDrill.closeout_refs.owner_acceptance_ref_kind, 'live_external_owner_ref');
  assert.equal(directDrill.closeout_refs.owner_acceptance_status, 'external_owner_acceptance_observed');
  assert.equal(directDrill.closeout_refs.owner_acceptance_is_owner_receipt, false);
  assert.equal(directDrill.closeout_refs.evidence_source, 'live_external_owner_evidence');
  assert.equal(forkPrDrill.route_status, 'closeout_refs_incomplete');
  assert.equal(forkPrDrill.closeout_claim_status, 'fixture_drill_owner_acceptance_open');
  assert.equal(forkPrDrill.closeout_refs.route_eligibility, 'eligible_fork_pr');
  assertStringRef(forkPrDrill.closeout_refs.patrol_observation_ref, /^patrol-observation-ref:/);
  assertStringRef(forkPrDrill.closeout_refs.diff_ref, /^diff-ref:/);
  assert.ok(forkPrDrill.closeout_refs.verification_refs.every((ref: string) =>
    ref.startsWith('test-result-ref:')));
  assertStringRef(forkPrDrill.closeout_refs.no_forbidden_write_ref, /^no-forbidden-write-ref:/);
  assert.equal(forkPrDrill.closeout_refs.commit_ref, null);
  assertStringRef(forkPrDrill.closeout_refs.fork_repo_ref, /^repo-contract-fixture-ref:/);
  assertStringRef(forkPrDrill.closeout_refs.pr_review_ref, /^repo-contract-fixture-ref:/);
  assertStringRef(forkPrDrill.closeout_refs.owner_acceptance_ref, /^repo-contract-fixture-ref:/);
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_ref_kind,
    'repo_contract_fixture_not_owner_receipt');
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_status, 'fixture_drill_not_owner_acceptance');
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_is_owner_receipt, false);
  assert.equal(forkPrDrill.closeout_refs.evidence_source, 'repo_contract_test_fixture');
  assert.equal(forkPrDrill.fixture_repo_currentness.status, 'repo_contract_fixture_not_live_repo');
  assert.equal(
    forkPrDrill.fixture_repo_currentness.reason,
    'fixture_repo_ref_requires_real_external_fork_pr_before_closeout',
  );
  assert.equal(forkPrDrill.repo_permission.repo, 'fixture:redcube-ai/fork-pr-drill');
  assert.equal(forkPrDrill.closeout_refs.owner_acceptance_ref_is_external_owner_ref, false);
  assert.ok(forkPrDrill.missing_closeout_refs.includes('external_owner_acceptance_ref'));
  assert.equal(result.live_closeout_evidence.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(result.live_closeout_evidence.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(result.non_authority_outputs.writes_domain_truth, false);
  assert.equal(result.non_authority_outputs.writes_domain_artifact, false);
  assert.equal(result.non_authority_outputs.writes_memory_body, false);
  assert.equal(result.non_authority_outputs.writes_quality_verdict, false);
  assert.equal(result.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(result.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_write_owner_receipt, false);
  assert.equal(result.authority_boundary.can_modify_managed_runtime, false);
});

test('Agent Lab Developer Mode repair route builder classifies live closeout routes from projection and repo permission', () => {
  const projection = {
    surface_id: 'opl_developer_mode',
    status: 'limited',
    enabled: 'on',
    effective_state: 'active_mixed_routes',
    mode: 'developer_apply_safe',
    config_source: 'test',
    auto_enable_github_login: 'gaofeng21cn',
    allowed_route: 'mixed_direct_and_pr',
    github_identity: {
      status: 'ready',
      login: 'gaofeng21cn',
      source: 'env_fixture',
      reason: null,
    },
    repo_authority: {
      status: 'limited',
      required_repo_count: 2,
      direct_write_repo_count: 1,
      pr_route_repo_count: 1,
      blocked_repo_count: 0,
      repos: [],
    },
  } as any;

  const direct = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: {
      target_id: 'med-autoscience',
      repo: 'gaofeng21cn/med-autoscience',
      repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
      status: 'ready',
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:mas/live-blocker',
      issue_ref: 'issue-ref:mas/live-blocker',
      blocker_ref: 'blocker-ref:mas/live-blocker',
      diff_ref: 'diff-ref:mas/live-blocker',
      verification_refs: ['test-result-ref:mas/live-blocker'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:mas/live-blocker',
      commit_ref: 'git-commit-ref:mas/live-blocker',
      owner_acceptance_ref: 'external-owner-ref:mas/live-blocker-accepted',
    },
  });

  assert.equal(direct.surface_kind, 'opl_agent_lab_developer_mode_dynamic_repair_route');
  assert.equal(direct.route_decision, 'direct-fix');
  assert.equal(direct.route_status, 'closeout_refs_ready');
  assert.equal(direct.closeout_claim_status, 'external_owner_closeout_refs_ready');
  assert.equal(direct.closeout_refs.developer_mode_projection_ref, direct.developer_mode_projection_ref);
  assert.equal(direct.closeout_refs.route_eligibility, 'eligible_direct_fix');
  assert.equal(direct.closeout_refs.patrol_observation_ref, 'patrol-observation-ref:mas/live-blocker');
  assert.equal(direct.closeout_refs.diff_ref, 'diff-ref:mas/live-blocker');
  assert.deepEqual(direct.closeout_refs.verification_refs, ['test-result-ref:mas/live-blocker']);
  assert.equal(direct.closeout_refs.no_forbidden_write_ref, 'no-forbidden-write-ref:mas/live-blocker');
  assert.equal(direct.closeout_refs.commit_ref, 'git-commit-ref:mas/live-blocker');
  assert.equal(direct.closeout_refs.fork_repo_ref, null);
  assert.equal(direct.closeout_refs.pr_review_ref, null);
  assert.equal(direct.closeout_refs.owner_acceptance_ref, 'external-owner-ref:mas/live-blocker-accepted');
  assert.deepEqual(direct.missing_closeout_refs, []);
  assert.equal(direct.authority_boundary.writes_owner_receipt, false);
  assert.equal(direct.authority_boundary.writes_domain_truth, false);
  assert.equal(direct.authority_boundary.modifies_managed_runtime, false);

  const fork = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: {
      target_id: 'redcube-ai',
      repo: 'redcube-ai/redcube-ai',
      repo_url: 'https://github.com/redcube-ai/redcube-ai.git',
      permission: 'read',
      direct_write_allowed: false,
      allowed_route: 'fork_pull_request',
      status: 'limited',
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:rca/live-blocker',
      diff_ref: 'diff-ref:rca/live-blocker',
      verification_refs: ['test-result-ref:rca/live-blocker'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-blocker',
      fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
      pr_review_ref: 'github-pr-review-ref:https://github.com/redcube-ai/redcube-ai/pull/42',
      owner_acceptance_ref: 'external-owner-ref:rca/live-blocker-reviewed',
    },
  });

  assert.equal(fork.route_decision, 'fork-PR');
  assert.equal(fork.route_status, 'closeout_refs_ready');
  assert.equal(fork.closeout_claim_status, 'external_owner_closeout_refs_ready');
  assert.equal(fork.closeout_refs.route_eligibility, 'eligible_fork_pr');
  assert.equal(fork.closeout_refs.commit_ref, null);
  assert.equal(fork.closeout_refs.fork_repo_ref, 'github-fork-ref:https://github.com/developer/redcube-ai');
  assert.equal(fork.closeout_refs.pr_review_ref, 'github-pr-review-ref:https://github.com/redcube-ai/redcube-ai/pull/42');
  assert.deepEqual(fork.missing_closeout_refs, []);

  const observeOnly = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...projection,
      status: 'ready',
      effective_state: 'observe_only',
      mode: 'external_observe',
      allowed_route: 'observe_only',
    },
    repo_permission: {
      target_id: 'med-autogrant',
      repo: 'gaofeng21cn/med-autogrant',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
      status: 'ready',
    },
    patrol_observation_refs: ['patrol-observation-ref:mag/observe-only'],
  });

  assert.equal(observeOnly.route_decision, 'observe-only');
  assert.equal(observeOnly.route_status, 'closeout_refs_incomplete');
  assert.equal(observeOnly.closeout_claim_status, 'external_owner_acceptance_missing');
  assert.equal(observeOnly.closeout_refs.route_eligibility, 'eligible_observe_only');
  assert.ok(observeOnly.missing_closeout_refs.includes('diff_ref'));
  assert.ok(observeOnly.missing_closeout_refs.includes('external_owner_acceptance_ref'));

  const blocked = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: {
      ...projection,
      status: 'blocked',
      effective_state: 'blocked',
      allowed_route: 'blocked',
    },
    repo_permission: {
      target_id: 'med-autogrant',
      repo: 'gaofeng21cn/med-autogrant',
      permission: null,
      direct_write_allowed: false,
      allowed_route: 'blocked',
      status: 'blocked',
    },
    patrol_observation_refs: ['patrol-observation-ref:mag/blocked'],
  });

  assert.equal(blocked.route_decision, 'blocked');
  assert.equal(blocked.route_status, 'blocked');
  assert.equal(blocked.closeout_claim_status, 'blocked');
  assert.equal(blocked.closeout_refs.route_eligibility, 'blocked_developer_mode_projection');

  const mixed = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: projection.repo_authority,
    patrol_observation_refs: ['patrol-observation-ref:family/mixed'],
  });

  assert.equal(mixed.route_decision, 'mixed');
  assert.equal(mixed.route_status, 'closeout_refs_ready');
  assert.equal(mixed.closeout_claim_status, 'route_eligibility_only_not_route_closeout');
  assert.equal(mixed.closeout_refs.route_eligibility, 'eligible_mixed_routes');

  const invalidOwnerAcceptance = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection,
    repo_permission: {
      target_id: 'med-autoscience',
      repo: 'gaofeng21cn/med-autoscience',
      permission: 'write',
      direct_write_allowed: true,
      allowed_route: 'direct_repo_fix',
      status: 'ready',
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:mas/invalid-owner-receipt',
      diff_ref: 'diff-ref:mas/invalid-owner-receipt',
      verification_refs: ['test-result-ref:mas/invalid-owner-receipt'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:mas/invalid-owner-receipt',
      commit_ref: 'git-commit-ref:mas/invalid-owner-receipt',
      owner_acceptance_ref: 'owner-receipt-ref:mas/forbidden-opl-written',
    },
  });

  assert.equal(invalidOwnerAcceptance.route_decision, 'blocked');
  assert.equal(invalidOwnerAcceptance.route_status, 'blocked');
  assert.equal(invalidOwnerAcceptance.closeout_claim_status, 'blocked');
  assert.equal(invalidOwnerAcceptance.closeout_refs.route_eligibility,
    'blocked_owner_acceptance_ref_must_be_external_owner_ref');
  assert.equal(invalidOwnerAcceptance.closeout_refs.owner_acceptance_ref, null);
  assert.ok(invalidOwnerAcceptance.missing_closeout_refs.includes('external_owner_acceptance_ref'));
});
