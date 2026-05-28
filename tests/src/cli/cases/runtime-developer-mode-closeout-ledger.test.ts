import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
} from '../helpers.ts';
import test from 'node:test';

const completePayload = {
  target_repo_id: 'med-autoscience',
  route_decision: 'direct-fix',
  route_eligibility: 'eligible_direct_fix',
  patrol_observation_ref: 'patrol-observation-ref:mas/live-direct-fix',
  diff_ref: 'diff-ref:mas/live-direct-fix',
  verification_refs: ['test-result-ref:mas/live-direct-fix'],
  no_forbidden_write_ref: 'no-forbidden-write-ref:mas/live-direct-fix',
  commit_ref: 'git-commit-ref:mas/live-direct-fix',
  owner_acceptance_ref: 'external-owner-ref:mas/live-direct-fix-accepted',
};

test('runtime Developer Mode closeout CLI records and verifies refs-only live closeout evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-closeout-state-'));
  try {
    const recorded = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify(completePayload),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.recorded_receipt_count, 1);
    assert.equal(recorded.receipts[0].receipt_status, 'recorded');
    assert.equal(recorded.receipts[0].target_repo_id, 'med-autoscience');
    assert.equal(recorded.receipts[0].route_decision, 'direct-fix');
    assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recorded.receipts[0].authority_boundary.can_write_domain_truth, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_modify_managed_runtime, false);
    assert.equal(
      recorded.ledger_file,
      path.join(stateRoot, 'developer-mode-closeout-ledger.json'),
    );

    const recordedReadModel = runCli(['agent-lab', 'complete', '--json'], {
      OPL_STATE_DIR: stateRoot,
    }).agent_lab_complete.developer_mode_repair_routes.live_closeout_evidence;
    assert.equal(recordedReadModel.summary.ledger_receipt_ref_count, 1);
    assert.equal(recordedReadModel.summary.ledger_verified_receipt_ref_count, 0);
    assert.equal(recordedReadModel.summary.pending_verify_receipt_ref_count, 1);
    assert.equal(recordedReadModel.summary.live_ledger_closeout_ready_count, 0);
    assert.equal(recordedReadModel.status, 'closeout_refs_incomplete');
    assert.equal(recordedReadModel.ledger_evidence_status, 'ledger_refs_recorded_verify_pending');

    const verified = runCli([
      'runtime',
      'developer-mode-closeout',
      'verify',
      '--receipt-ref',
      recorded.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_verify;

    assert.equal(verified.status, 'verified');
    assert.equal(verified.verified_receipt_count, 1);
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.equal(verified.receipt.authority_boundary.can_write_owner_receipt, false);

    const listed = runCli(['runtime', 'developer-mode-closeout', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger;
    assert.equal(listed.receipt_count, 1);
    assert.equal(listed.verified_receipt_ref_count, 1);
    assert.equal(listed.authority_boundary.can_write_domain_truth, false);

    const readModel = runCli(['agent-lab', 'complete', '--json'], {
      OPL_STATE_DIR: stateRoot,
    }).agent_lab_complete.developer_mode_repair_routes.live_closeout_evidence;
    assert.equal(readModel.summary.ledger_receipt_ref_count, 1);
    assert.equal(readModel.summary.ledger_verified_receipt_ref_count, 1);
    assert.equal(readModel.summary.pending_verify_receipt_ref_count, 0);
    assert.equal(readModel.summary.live_ledger_closeout_ready_count, 1);
    assert.equal(readModel.summary.external_owner_closeout_refs_ready_count, 2);
    assert.equal(readModel.summary.fixture_drill_owner_acceptance_open_count, 1);
    assert.equal(readModel.status, 'closeout_refs_incomplete');
    assert.equal(
      readModel.evidence_scope,
      'developer_mode_agent_lab_repair_closeout_drills_and_verified_live_ledger_receipts',
    );
    assert.equal(readModel.ledger_evidence_status, 'verified_direct_fix_closeout_refs_observed');
    assert.equal(readModel.verified_ledger_receipt_refs[0], recorded.receipt_refs[0]);
    const liveLedgerRoute = readModel.drills.find(
      (drill: { evidence_source: string }) => drill.evidence_source === 'developer_mode_closeout_ledger',
    );
    assert.ok(liveLedgerRoute);
    assert.equal(liveLedgerRoute.route_status, 'closeout_refs_ready');
    assert.equal(liveLedgerRoute.closeout_claim_status, 'external_owner_closeout_refs_ready');
    assert.equal(liveLedgerRoute.closeout_refs.owner_acceptance_is_owner_receipt, false);
    assert.equal(liveLedgerRoute.authority_boundary.writes_owner_receipt, false);
    assert.equal(readModel.non_authority_outputs.writes_owner_receipt, false);
    assert.equal(readModel.non_authority_outputs.modifies_managed_runtime, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Developer Mode closeout help exposes the ledger command group boundary', () => {
  const help = runCli(['help', 'runtime', 'developer-mode-closeout']).help;

  assert.equal(help.command, 'runtime developer-mode-closeout');
  assert.match(help.summary, /Developer Mode live repair closeout/);
  assert.deepEqual(help.subcommands.map((entry: { command: string }) => entry.command), [
    'runtime developer-mode-closeout record',
    'runtime developer-mode-closeout verify',
    'runtime developer-mode-closeout list',
  ]);
  assert.match(help.summary, /GitHub PR-backed owner acceptance/);
});

test('runtime Developer Mode closeout command group rejects unknown subcommands', () => {
  const { payload, status } = runCliFailure([
    'runtime',
    'developer-mode-closeout',
    'unknown',
  ]);

  assert.equal(status, 2);
  assert.equal(payload.error.code, 'cli_usage_error');
});

test('runtime Developer Mode closeout CLI blocks owner receipt or incomplete closeout payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-closeout-blocked-state-'));
  try {
    const invalidOwner = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        ...completePayload,
        owner_acceptance_ref: 'owner-receipt-ref:mas/forbidden',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;
    assert.equal(invalidOwner.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(invalidOwner.blocked_receipts[0].blocker.blocker_id, 'developer_mode_owner_acceptance_ref_not_external');

    const directFixPrOwnerAcceptance = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        ...completePayload,
        owner_acceptance_ref:
          'github-pr-owner-acceptance-ref:https://github.com/gaofeng21cn/med-autoscience/pull/42#pullrequestreview-123',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;
    assert.equal(directFixPrOwnerAcceptance.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(
      directFixPrOwnerAcceptance.blocked_receipts[0].blocker.blocker_id,
      'developer_mode_owner_acceptance_ref_not_external',
    );

    const incomplete = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'med-autoscience',
        route_decision: 'direct-fix',
        route_eligibility: 'eligible_direct_fix',
        patrol_observation_ref: 'patrol-observation-ref:mas/incomplete',
        owner_acceptance_ref: 'external-owner-ref:mas/incomplete',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;
    assert.equal(incomplete.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.ok(incomplete.blocked_receipts[0].missing_closeout_refs.includes('diff_ref'));
    assert.ok(incomplete.blocked_receipts[0].missing_closeout_refs.includes('verification_refs'));

    const listed = runCli(['runtime', 'developer-mode-closeout', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger;
    assert.equal(listed.receipt_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Developer Mode closeout CLI blocks fork PR fixture refs from live ledger intake', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-closeout-fixture-state-'));
  try {
    const fixtureForkPr = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'redcube-ai',
        route_decision: 'fork-PR',
        route_eligibility: 'eligible_fork_pr',
        patrol_observation_ref: 'patrol-observation-ref:rca/fixture-fork-pr',
        diff_ref: 'diff-ref:rca/fixture-fork-pr',
        verification_refs: ['test-result-ref:rca/fixture-fork-pr'],
        no_forbidden_write_ref: 'no-forbidden-write-ref:rca/fixture-fork-pr',
        fork_repo_ref: 'fixture://redcube-ai/developer-mode-fork-pr-drill',
        pr_review_ref: 'repo-contract-fixture-ref:redcube-ai/fork-pr-drill',
        owner_acceptance_ref: 'external-owner-acceptance-ref:rca/fixture-fork-pr',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(fixtureForkPr.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(
      fixtureForkPr.blocked_receipts[0].blocker.blocker_id,
      'developer_mode_fork_pr_refs_not_live_external_refs',
    );
    assert.deepEqual(fixtureForkPr.blocked_receipts[0].missing_closeout_refs, [
      'live_fork_repo_ref',
      'live_pr_review_ref',
    ]);

    const listed = runCli(['runtime', 'developer-mode-closeout', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger;
    assert.equal(listed.receipt_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Developer Mode closeout CLI requires fork PR owner acceptance to be PR-backed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-closeout-live-fork-pr-state-'));
  try {
    const weakOwnerAcceptance = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'redcube-ai',
        route_decision: 'fork-PR',
        route_eligibility: 'eligible_fork_pr',
        patrol_observation_ref: 'patrol-observation-ref:rca/live-fork-pr',
        diff_ref: 'diff-ref:rca/live-fork-pr',
        verification_refs: ['test-result-ref:rca/live-fork-pr'],
        no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-fork-pr',
        fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
        pr_review_ref: 'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
        owner_acceptance_ref: 'external-owner-acceptance-ref:rca/live-fork-pr',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(weakOwnerAcceptance.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(
      weakOwnerAcceptance.blocked_receipts[0].blocker.blocker_id,
      'developer_mode_fork_pr_owner_acceptance_not_pr_backed',
    );
    assert.deepEqual(weakOwnerAcceptance.blocked_receipts[0].missing_closeout_refs, [
      'github_pr_owner_acceptance_ref',
    ]);

    const plainPrOwnerAcceptance = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'redcube-ai',
        route_decision: 'fork-PR',
        route_eligibility: 'eligible_fork_pr',
        patrol_observation_ref: 'patrol-observation-ref:rca/live-fork-pr-plain-pr',
        diff_ref: 'diff-ref:rca/live-fork-pr-plain-pr',
        verification_refs: ['test-result-ref:rca/live-fork-pr-plain-pr'],
        no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-fork-pr-plain-pr',
        fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
        pr_review_ref: 'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
        owner_acceptance_ref: 'github-pr-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(plainPrOwnerAcceptance.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(
      plainPrOwnerAcceptance.blocked_receipts[0].blocker.blocker_id,
      'developer_mode_fork_pr_owner_acceptance_not_pr_backed',
    );
    assert.deepEqual(plainPrOwnerAcceptance.blocked_receipts[0].missing_closeout_refs, [
      'github_pr_owner_acceptance_ref',
    ]);

    const plainUrlOwnerAcceptance = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'redcube-ai',
        route_decision: 'fork-PR',
        route_eligibility: 'eligible_fork_pr',
        patrol_observation_ref: 'patrol-observation-ref:rca/live-fork-pr-plain-url',
        diff_ref: 'diff-ref:rca/live-fork-pr-plain-url',
        verification_refs: ['test-result-ref:rca/live-fork-pr-plain-url'],
        no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-fork-pr-plain-url',
        fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
        pr_review_ref: 'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
        owner_acceptance_ref: 'https://github.com/gaofeng21cn/redcube-ai/pull/42',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(plainUrlOwnerAcceptance.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(
      plainUrlOwnerAcceptance.blocked_receipts[0].blocker.blocker_id,
      'developer_mode_fork_pr_owner_acceptance_not_pr_backed',
    );
    assert.deepEqual(plainUrlOwnerAcceptance.blocked_receipts[0].missing_closeout_refs, [
      'github_pr_owner_acceptance_ref',
    ]);

    const liveForkPr = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'redcube-ai',
        route_decision: 'fork-PR',
        route_eligibility: 'eligible_fork_pr',
        patrol_observation_ref: 'patrol-observation-ref:rca/live-fork-pr',
        diff_ref: 'diff-ref:rca/live-fork-pr',
        verification_refs: ['test-result-ref:rca/live-fork-pr'],
        no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-fork-pr',
        fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
        pr_review_ref: 'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
        owner_acceptance_ref: 'github-pr-owner-acceptance-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42#pullrequestreview-123',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(liveForkPr.status, 'recorded');
    assert.equal(liveForkPr.recorded_receipt_count, 1);
    assert.equal(liveForkPr.receipts[0].route_decision, 'fork-PR');
    assert.equal(
      liveForkPr.receipts[0].fork_repo_ref,
      'github-fork-ref:https://github.com/developer/redcube-ai',
    );
    assert.equal(
      liveForkPr.receipts[0].pr_review_ref,
      'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
    );
    assert.equal(
      liveForkPr.receipts[0].owner_acceptance_ref,
      'github-pr-owner-acceptance-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42#pullrequestreview-123',
    );
    assert.equal(liveForkPr.receipts[0].authority_boundary.can_write_owner_receipt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Developer Mode closeout CLI blocks non-locator fork PR refs from live ledger intake', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-closeout-weak-fork-pr-state-'));
  try {
    const weakForkPr = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify({
        target_repo_id: 'redcube-ai',
        route_decision: 'fork-PR',
        route_eligibility: 'eligible_fork_pr',
        patrol_observation_ref: 'patrol-observation-ref:rca/weak-fork-pr',
        diff_ref: 'diff-ref:rca/weak-fork-pr',
        verification_refs: ['test-result-ref:rca/weak-fork-pr'],
        no_forbidden_write_ref: 'no-forbidden-write-ref:rca/weak-fork-pr',
        fork_repo_ref: 'github-fork-ref:developer/redcube-ai',
        pr_review_ref: 'github-pr-review-ref:rca/developer-mode-fork-pr',
        owner_acceptance_ref: 'external-owner-acceptance-ref:rca/weak-fork-pr',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger_record;

    assert.equal(weakForkPr.status, 'no_eligible_developer_mode_closeout_receipts');
    assert.equal(
      weakForkPr.blocked_receipts[0].blocker.blocker_id,
      'developer_mode_fork_pr_refs_not_live_external_refs',
    );
    assert.deepEqual(weakForkPr.blocked_receipts[0].missing_closeout_refs, [
      'live_fork_repo_ref',
      'live_pr_review_ref',
    ]);

    const listed = runCli(['runtime', 'developer-mode-closeout', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).developer_mode_closeout_ledger;
    assert.equal(listed.receipt_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
