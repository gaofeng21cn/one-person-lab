import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

const directFixPayload = {
  target_repo_id: 'one-person-lab',
  route_decision: 'direct-fix',
  route_eligibility: 'eligible_direct_fix',
  patrol_observation_ref: 'patrol-observation-ref:opl/developer-mode-direct-fix',
  diff_ref: 'diff-ref:opl/developer-mode-direct-fix',
  verification_refs: ['test-result-ref:opl/developer-mode-direct-fix'],
  no_forbidden_write_ref: 'no-forbidden-write-ref:opl/developer-mode-direct-fix',
  commit_ref: 'git-commit-ref:opl/developer-mode-direct-fix',
  owner_acceptance_ref: 'external-owner-ref:opl/developer-mode-direct-fix-accepted',
};

const forkPrPayload = {
  target_repo_id: 'redcube-ai',
  route_decision: 'fork-PR',
  route_eligibility: 'eligible_fork_pr',
  patrol_observation_ref: 'patrol-observation-ref:rca/developer-mode-fork-pr',
  diff_ref: 'diff-ref:rca/developer-mode-fork-pr',
  verification_refs: ['test-result-ref:rca/developer-mode-fork-pr'],
  no_forbidden_write_ref: 'no-forbidden-write-ref:rca/developer-mode-fork-pr',
  fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
  pr_review_ref: 'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
  owner_acceptance_ref:
    'github-pr-owner-acceptance-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42#pullrequestreview-123',
};

function recordAndVerifyDeveloperModeCloseout(stateRoot: string, payload: Record<string, unknown>) {
  const recorded = runCli([
    'runtime',
    'developer-mode-closeout',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], {
    OPL_STATE_DIR: stateRoot,
  }).developer_mode_closeout_ledger_record;
  assert.equal(recorded.status, 'recorded');
  runCli([
    'runtime',
    'developer-mode-closeout',
    'verify',
    '--receipt-ref',
    recorded.receipt_refs[0],
  ], {
    OPL_STATE_DIR: stateRoot,
  });
  return recorded.receipt_refs[0] as string;
}

test('runtime app-operator-drilldown projects Developer Mode live closeout evidence into App attention payload', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-devmode-live-closeout-state-'));
  try {
    const summaryDrilldown = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summaryDrilldown.developer_mode_live_closeout_evidence, undefined);
    assert.equal(summaryDrilldown.summary.developer_mode_live_closeout_status, 'closeout_refs_incomplete');
    assert.equal(
      summaryDrilldown.summary.developer_mode_live_closeout_ledger_evidence_status,
      'no_live_ledger_closeout_refs_observed',
    );
    assert.equal(summaryDrilldown.summary.developer_mode_live_closeout_verified_direct_fix_ledger_receipt_ref_count, 0);
    assert.equal(summaryDrilldown.summary.developer_mode_live_closeout_verified_fork_pr_ledger_receipt_ref_count, 0);
    assert.equal(summaryDrilldown.summary.developer_mode_live_closeout_missing_live_ledger_route_count, 2);
    assert.equal(summaryDrilldown.summary.developer_mode_live_closeout_attention_count, 2);

    const attention =
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .developer_mode_live_closeout_evidence;
    assert.equal(
      attention.surface_kind,
      'opl_app_drilldown_developer_mode_live_closeout_evidence_attention',
    );
    assert.equal(attention.status, 'closeout_refs_incomplete');
    assert.equal(attention.ledger_evidence_status, 'no_live_ledger_closeout_refs_observed');
    assert.equal(attention.attention_count, 2);
    assert.deepEqual(attention.missing_live_ledger_route_kinds, ['direct-fix', 'fork-PR']);
    assert.equal(attention.route_requires_domain_or_app_payload, true);
    assert.equal(attention.can_close_without_domain_or_app_payload, false);
    assert.equal(
      attention.payload_ref_hints.fork_pr_ref_policy,
      'fork_repo_ref_must_be_resolvable_github_repo_url_or_url_backed_github_fork_ref_and_pr_review_ref_and_owner_acceptance_ref_must_be_github_pull_request_url_or_url_backed_github_pr_refs',
    );
    assert.equal(
      attention.payload_template.owner_acceptance_ref,
      '<github-pr-owner-acceptance-ref>',
    );
    assert.deepEqual(attention.required_return_shapes, [
      'developer_mode_closeout_verified_receipt_ref',
      'developer_mode_direct_fix_closeout_receipt_ref',
      'external_owner_acceptance_ref',
      'developer_mode_fork_pr_closeout_receipt_ref',
      'github_pr_owner_acceptance_ref',
    ]);
    assert.deepEqual(attention.payload_workorder.required_return_shapes, [
      'developer_mode_closeout_verified_receipt_ref',
      'developer_mode_direct_fix_closeout_receipt_ref',
      'external_owner_acceptance_ref',
      'developer_mode_fork_pr_closeout_receipt_ref',
      'github_pr_owner_acceptance_ref',
    ]);
    assert.equal(
      attention.payload_workorder.payload_template.owner_acceptance_ref,
      '<github-pr-owner-acceptance-ref>',
    );
    assert.deepEqual(attention.payload_ref_hints.fork_repo_ref_accepted_prefixes, [
      'https://github.com/',
      'git@github.com:',
      'github-fork-ref:https://github.com/',
      'github-fork-ref:git@github.com:',
    ]);
    assert.deepEqual(attention.payload_ref_hints.pr_review_ref_accepted_prefixes, [
      'https://github.com/',
      'github-pr-review-ref:https://github.com/',
      'github-pr-ref:https://github.com/',
    ]);
    assert.deepEqual(attention.payload_ref_hints.fork_pr_ref_rejected_prefixes, [
      'fixture://',
      'repo-contract-fixture-ref:',
    ]);
    assert.equal(
      attention.payload_workorder.accepted_payload_paths.fork_pr_path.live_github_fork_ref_required,
      true,
    );
    assert.equal(
      attention.payload_workorder.accepted_payload_paths.fork_pr_path.live_github_pr_review_ref_required,
      true,
    );
    assert.equal(
      attention.payload_workorder.accepted_payload_paths.fork_pr_path
        .live_github_pr_owner_acceptance_ref_required,
      true,
    );
    assert.equal(
      attention.payload_workorder.accepted_payload_paths.fork_pr_path
        .owner_acceptance_ref_must_be_github_pr_backed,
      true,
    );
    assert.equal(attention.payload_workorder.empty_payload_template_is_success_evidence, false);
    assert.equal(attention.authority_boundary.can_create_owner_receipt, false);
    assert.equal(attention.authority_boundary.can_write_owner_receipt, false);
    assert.equal(attention.authority_boundary.can_modify_managed_runtime, false);
    assert.equal(attention.authority_boundary.can_claim_production_ready, false);

    const nextStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind?: string }) =>
        item.step_kind === 'developer_mode_live_closeout_evidence',
    );
    assert.equal(Boolean(nextStep), true);
    assert.equal(nextStep.can_create_owner_receipt, false);
    assert.equal(nextStep.can_write_owner_receipt, false);
    assert.equal(nextStep.can_modify_managed_runtime, false);
    assert.equal(nextStep.can_close_developer_mode_live_route, false);
    assert.equal(
      nextStep.payload_ref_hints.fork_pr_ref_policy,
      'fork_repo_ref_must_be_resolvable_github_repo_url_or_url_backed_github_fork_ref_and_pr_review_ref_and_owner_acceptance_ref_must_be_github_pull_request_url_or_url_backed_github_pr_refs',
    );

    assert.equal(
      summaryDrilldown.attention_first_payload.lazy_load_targets.some(
        (target: { section: string; detail_args: string[] }) =>
          target.section === 'developer_mode_live_closeout_evidence'
          && target.detail_args.join(' ') === '--detail full',
      ),
      true,
    );

    const sourceRefs = summaryDrilldown.source_refs as Array<{ role: string; ref: string }>;
    assert.equal(
      sourceRefs.some((sourceRef) =>
        sourceRef.role === 'developer_mode_live_closeout_evidence'
        && sourceRef.ref ===
          '/runtime_tray_snapshot/app_operator_drilldown/developer_mode_live_closeout_evidence'
      ),
      true,
    );

    const directReceiptRef = recordAndVerifyDeveloperModeCloseout(stateRoot, directFixPayload);
    const forkPrReceiptRef = recordAndVerifyDeveloperModeCloseout(stateRoot, forkPrPayload);

    const fullDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const fullEvidence = fullDrilldown.developer_mode_live_closeout_evidence;
    assert.equal(fullEvidence.status, 'closeout_refs_ready');
    assert.equal(
      fullEvidence.ledger_evidence_status,
      'verified_direct_fix_and_fork_pr_closeout_refs_observed',
    );
    assert.equal(fullEvidence.summary.ledger_verified_receipt_ref_count, 2);
    assert.equal(fullEvidence.summary.verified_direct_fix_ledger_receipt_ref_count, 1);
    assert.equal(fullEvidence.summary.verified_fork_pr_ledger_receipt_ref_count, 1);
    assert.equal(fullEvidence.summary.live_external_owner_acceptance_count, 2);
    assert.equal(fullEvidence.summary.pending_verify_receipt_ref_count, 0);
    assert.deepEqual(fullEvidence.verified_ledger_receipt_refs.sort(), [
      directReceiptRef,
      forkPrReceiptRef,
    ].sort());
    assert.equal(fullDrilldown.summary.developer_mode_live_closeout_status, 'closeout_refs_ready');
    assert.equal(fullDrilldown.summary.developer_mode_live_closeout_missing_live_ledger_route_count, 0);
    assert.equal(fullDrilldown.summary.developer_mode_live_closeout_attention_count, 0);
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract
        .developer_mode_live_closeout_evidence.attention_count,
      0,
    );
    assert.equal(fullEvidence.non_authority_outputs.writes_owner_receipt, false);
    assert.equal(fullEvidence.non_authority_outputs.modifies_managed_runtime, false);
    assert.equal(fullEvidence.authority_boundary.writes_owner_receipt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime app-operator-drilldown counts live Developer Mode owner acceptance from verified ledger receipts only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-devmode-live-owner-acceptance-state-'));
  try {
    recordAndVerifyDeveloperModeCloseout(stateRoot, directFixPayload);

    const fullDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const fullEvidence = fullDrilldown.developer_mode_live_closeout_evidence;

    assert.equal(fullEvidence.status, 'closeout_refs_incomplete');
    assert.equal(fullEvidence.summary.verified_direct_fix_ledger_receipt_ref_count, 1);
    assert.equal(fullEvidence.summary.verified_fork_pr_ledger_receipt_ref_count, 0);
    assert.equal(fullEvidence.summary.live_external_owner_acceptance_count, 1);
    assert.equal(fullEvidence.summary.repo_contract_fixture_drill_count, 1);
    assert.equal(fullEvidence.summary.repo_contract_fixture_not_live_repo_count, 1);
    assert.equal(fullEvidence.summary.fixture_drill_owner_acceptance_open_count, 1);
    assert.equal(fullEvidence.summary.external_owner_acceptance_missing_count, 1);
    assert.equal(fullDrilldown.summary.developer_mode_live_closeout_live_external_owner_acceptance_count, 1);
    assert.equal(fullDrilldown.summary.developer_mode_live_closeout_missing_live_ledger_route_count, 1);
    assert.equal(
      fullDrilldown.summary.developer_mode_live_closeout_repo_contract_fixture_not_live_repo_count,
      1,
    );
    assert.deepEqual(
      fullDrilldown.attention_first_payload.evidence_after_contract
        .developer_mode_live_closeout_evidence.missing_live_ledger_route_kinds,
      ['fork-PR'],
    );
    assert.deepEqual(
      fullDrilldown.attention_first_payload.evidence_after_contract
        .developer_mode_live_closeout_evidence.required_return_shapes,
      [
        'developer_mode_closeout_verified_receipt_ref',
        'developer_mode_fork_pr_closeout_receipt_ref',
        'github_pr_owner_acceptance_ref',
      ],
    );
    assert.deepEqual(
      fullDrilldown.attention_first_payload.evidence_after_contract
        .developer_mode_live_closeout_evidence.payload_workorder.required_return_shapes,
      [
        'developer_mode_closeout_verified_receipt_ref',
        'developer_mode_fork_pr_closeout_receipt_ref',
        'github_pr_owner_acceptance_ref',
      ],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework readiness consumes Developer Mode live closeout evidence without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-devmode-live-closeout-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).framework_readiness;
    const evidence = readiness.attention_first_payload.developer_mode_live_closeout_evidence;
    assert.equal(
      evidence.surface_kind,
      'opl_app_drilldown_developer_mode_live_closeout_evidence_attention',
    );
    assert.equal(evidence.attention_count, 2);
    assert.deepEqual(evidence.missing_live_ledger_route_kinds, ['direct-fix', 'fork-PR']);
    assert.equal(evidence.authority_boundary.can_create_owner_receipt, false);
    assert.equal(evidence.authority_boundary.can_claim_production_ready, false);
    assert.equal(
      evidence.payload_ref_hints.fork_pr_ref_policy,
      'fork_repo_ref_must_be_resolvable_github_repo_url_or_url_backed_github_fork_ref_and_pr_review_ref_and_owner_acceptance_ref_must_be_github_pull_request_url_or_url_backed_github_pr_refs',
    );
    assert.equal(
      evidence.payload_workorder.accepted_payload_paths.fork_pr_path.live_github_fork_ref_required,
      true,
    );
    assert.equal(
      evidence.payload_workorder.accepted_payload_paths.fork_pr_path
        .live_github_pr_owner_acceptance_ref_required,
      true,
    );
    assert.equal(readiness.developer_mode_live_closeout_evidence.source_command,
      'opl runtime app-operator-drilldown --json');
    assert.equal(readiness.developer_mode_live_closeout_evidence.attention_count, 2);
    assert.equal(
      readiness.diagnostic_drilldowns.some(
        (lens: { lens_id: string; embedded_payload_ref: string }) =>
          lens.lens_id === 'developer_mode_live_closeout_evidence'
          && lens.embedded_payload_ref ===
            '/framework_readiness/developer_mode_live_closeout_evidence',
      ),
      true,
    );
    assert.equal(
      readiness.attention_first_payload.warnings.some(
        (warning: { warning_id?: string; count?: number }) =>
          warning.warning_id === 'developer_mode_live_closeout_evidence'
          && warning.count === 2,
      ),
      true,
    );
    if (readiness.attention_first_payload.blockers.length === 0) {
      const action = readiness.attention_first_payload.next_safe_actions.find(
        (item: { action_kind?: string }) =>
          item.action_kind === 'developer_mode_live_closeout_evidence_review',
      );
      assert.equal(Boolean(action), true);
      assert.equal(action.can_create_owner_receipt, false);
      assert.equal(action.can_claim_production_ready, false);
    }

    recordAndVerifyDeveloperModeCloseout(stateRoot, directFixPayload);
    recordAndVerifyDeveloperModeCloseout(stateRoot, forkPrPayload);
    const verifiedReadiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).framework_readiness;
    assert.equal(
      verifiedReadiness.attention_first_payload
        .developer_mode_live_closeout_evidence.attention_count,
      0,
    );
    assert.equal(
      verifiedReadiness.developer_mode_live_closeout_evidence.status,
      'closeout_refs_ready',
    );
    assert.equal(
      verifiedReadiness.developer_mode_live_closeout_evidence.can_claim_production_ready,
      undefined,
    );
    assert.equal(
      verifiedReadiness.developer_mode_live_closeout_evidence.authority_boundary
        .can_claim_production_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
