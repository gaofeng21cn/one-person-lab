import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeveloperModeAgentLabRepairRoute } from '../../../src/modules/foundry-lab/agent-lab-complete.ts';

const projection = {
  surface_id: 'opl_developer_mode',
  status: 'limited',
  effective_state: 'active_mixed_routes',
  allowed_route: 'mixed_direct_and_pr',
  mode: 'developer_apply_safe',
};

test('Developer Mode classifies routes and scopes write authority to the target repo', () => {
  const cases = [
    {
      name: 'direct',
      projection,
      permission: { status: 'ready', allowed_route: 'direct_repo_fix', direct_write_allowed: true },
      decision: 'direct-fix',
      eligibility: 'eligible_direct_fix',
    },
    {
      name: 'fork',
      projection,
      permission: { status: 'limited', allowed_route: 'fork_pull_request', direct_write_allowed: false },
      decision: 'fork-PR',
      eligibility: 'eligible_fork_pr',
    },
    {
      name: 'observe',
      projection: { ...projection, effective_state: 'observe_only', allowed_route: 'observe_only' },
      permission: { status: 'ready', allowed_route: 'direct_repo_fix', direct_write_allowed: true },
      decision: 'observe-only',
      eligibility: 'eligible_observe_only',
    },
    {
      name: 'mixed',
      projection,
      permission: { status: 'limited', direct_write_repo_count: 1, pr_route_repo_count: 1 },
      decision: 'mixed',
      eligibility: 'eligible_mixed_routes',
    },
    {
      name: 'blocked',
      projection: { ...projection, status: 'blocked', allowed_route: 'blocked' },
      permission: { status: 'blocked', allowed_route: 'blocked', direct_write_allowed: false },
      decision: 'blocked',
      eligibility: 'blocked_developer_mode_projection',
    },
  ];

  for (const entry of cases) {
    const route = buildDeveloperModeAgentLabRepairRoute({
      developer_mode_projection: entry.projection as any,
      repo_permission: entry.permission,
      patrol_observation_refs: [`patrol-observation-ref:${entry.name}`],
    });
    assert.equal(route.route_decision, entry.decision, entry.name);
    assert.equal(route.closeout_refs.route_eligibility, entry.eligibility, entry.name);
    assert.equal(route.authority_boundary.writes_domain_truth, false);
    assert.equal(route.authority_boundary.writes_owner_receipt, false);
  }

  const targetScoped = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: { ...projection, status: 'blocked', allowed_route: 'blocked' } as any,
    repo_permission: { status: 'blocked', allowed_route: 'blocked', direct_write_allowed: false },
    target_authority: {
      target_agent_id: 'mas',
      target_repo_id: 'gaofeng21cn/med-autoscience',
      status: 'ready',
      allowed_route: 'direct_repo_fix',
      direct_write_allowed: true,
    },
    patrol_observation_refs: ['patrol-observation-ref:mas/target-scoped'],
  });

  assert.equal(targetScoped.route_decision, 'direct-fix');
  assert.equal(targetScoped.closeout_refs.route_eligibility, 'eligible_direct_fix');
  assert.equal(targetScoped.repo_permission.target_repo_id, 'gaofeng21cn/med-autoscience');
});

test('Developer Mode keeps incomplete closeout refs and fixtures out of live acceptance', () => {
  const incomplete = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection as any,
    repo_permission: { status: 'ready', allowed_route: 'direct_repo_fix', direct_write_allowed: true },
    patrol_observation_refs: ['patrol-observation-ref:mas/incomplete'],
  });
  assert.equal(incomplete.route_status, 'closeout_refs_incomplete');
  assert.equal(incomplete.closeout_claim_status, 'external_owner_acceptance_missing');
  assert.deepEqual(incomplete.missing_closeout_refs, [
    'diff_ref',
    'verification_refs',
    'no_forbidden_write_ref',
    'commit_ref',
    'external_owner_acceptance_ref',
  ]);

  const fixture = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection as any,
    repo_permission: {
      repo: 'fixture:redcube-ai/fork-pr-drill',
      status: 'limited',
      allowed_route: 'fork_pull_request',
      direct_write_allowed: false,
    },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:rca/fixture',
      diff_ref: 'diff-ref:rca/fixture',
      verification_refs: ['test-result-ref:rca/fixture'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:rca/fixture',
      fork_repo_ref: 'repo-contract-fixture-ref:rca/fork',
      pr_review_ref: 'repo-contract-fixture-ref:rca/pr-review',
      owner_acceptance_ref: 'repo-contract-fixture-ref:rca/owner-acceptance',
    },
  });
  assert.equal(fixture.route_status, 'closeout_refs_incomplete');
  assert.equal(fixture.closeout_claim_status, 'fixture_drill_owner_acceptance_open');
  assert.equal(fixture.closeout_refs.owner_acceptance_ref_kind, 'repo_contract_fixture_not_owner_receipt');
  assert.equal(fixture.closeout_refs.owner_acceptance_ref_is_external_owner_ref, false);
  assert.equal(fixture.fixture_repo_currentness.status, 'repo_contract_fixture_not_live_repo');
  assert.ok(fixture.missing_closeout_refs.includes('external_owner_acceptance_ref'));
});

test('Developer Mode blocks an OPL-forged owner receipt ref', () => {
  const route = buildDeveloperModeAgentLabRepairRoute({
    developer_mode_projection: projection as any,
    repo_permission: { status: 'ready', allowed_route: 'direct_repo_fix', direct_write_allowed: true },
    patrol_observation_refs: {
      patrol_observation_ref: 'patrol-observation-ref:mas/forged-owner-receipt',
      diff_ref: 'diff-ref:mas/forged-owner-receipt',
      verification_refs: ['test-result-ref:mas/forged-owner-receipt'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:mas/forged-owner-receipt',
      commit_ref: 'git-commit-ref:mas/forged-owner-receipt',
      owner_acceptance_ref: 'owner-receipt-ref:mas/forged-by-opl',
    },
  });

  assert.equal(route.route_decision, 'blocked');
  assert.equal(route.route_status, 'blocked');
  assert.equal(route.closeout_claim_status, 'blocked');
  assert.equal(route.closeout_refs.route_eligibility, 'blocked_owner_acceptance_ref_must_be_external_owner_ref');
  assert.equal(route.closeout_refs.owner_acceptance_ref, null);
  assert.ok(route.missing_closeout_refs.includes('external_owner_acceptance_ref'));
});
