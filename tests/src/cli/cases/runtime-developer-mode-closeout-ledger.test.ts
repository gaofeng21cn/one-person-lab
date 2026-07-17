import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { buildDeveloperModeRepairRouteReadModel } from '../../../../src/modules/console/developer-mode-repair-route.ts';

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

const foundryActivationTransactionRef =
  'opl://foundry/activation-transaction/mas/sha256-20260716';

function withStateRoot(prefix: string, run: (stateRoot: string) => void) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    run(stateRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

function recordCloseout(stateRoot: string, payload: Record<string, unknown>) {
  return runCli([
    'runtime',
    'developer-mode-closeout',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], { OPL_STATE_DIR: stateRoot }).developer_mode_closeout_ledger_record;
}

function verifyCloseout(stateRoot: string, receiptRef: string) {
  return runCli([
    'runtime',
    'developer-mode-closeout',
    'verify',
    '--receipt-ref',
    receiptRef,
  ], { OPL_STATE_DIR: stateRoot }).developer_mode_closeout_ledger_verify;
}

function readCloseoutEvidence(stateRoot: string) {
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    return buildDeveloperModeRepairRouteReadModel().live_closeout_evidence;
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
  }
}

test('Developer Mode closeout records and verifies refs-only current evidence', () => {
  withStateRoot('opl-developer-mode-closeout-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const recorded = recordCloseout(stateRoot, completePayload);
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.receipts[0].receipt_status, 'recorded');
    assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recorded.receipts[0].authority_boundary.can_write_domain_truth, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_modify_managed_runtime, false);

    const verified = verifyCloseout(stateRoot, recorded.receipt_refs[0]);
    assert.equal(verified.status, 'verified');
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.equal(verified.receipt.authority_boundary.can_write_owner_receipt, false);

    const listed = runCli(['runtime', 'developer-mode-closeout', 'list'], env)
      .developer_mode_closeout_ledger;
    assert.equal(listed.receipt_count, 1);
    assert.equal(listed.verified_receipt_ref_count, 1);
    assert.equal(listed.authority_boundary.can_write_domain_truth, false);

    const readModel = readCloseoutEvidence(stateRoot);
    assert.equal(readModel.summary.ledger_verified_receipt_ref_count, 1);
    assert.equal(readModel.ledger_evidence_status, 'verified_direct_fix_closeout_refs_observed');
    assert.equal(readModel.non_authority_outputs.writes_owner_receipt, false);
    assert.equal(readModel.authority_boundary.can_claim_production_ready, false);
  });
});

test('Developer Mode scaleout projects immutable Foundry activation transaction refs', () => {
  withStateRoot('opl-developer-mode-scaleout-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const scaleoutPayload = {
      ...completePayload,
      receipt_ref: 'opl://developer-mode-closeout/med-autoscience/scaleout-followthrough',
      route_repetition_refs: ['developer-mode-route-repetition-ref:mas/direct-fix-repeat'],
      foundry_activation_transaction_refs: [foundryActivationTransactionRef],
      app_patrol_mount_refs: ['app-patrol-mount-ref:one-person-lab-app/developer-mode-patrol'],
    };
    const recorded = recordCloseout(stateRoot, scaleoutPayload);
    assert.equal(recorded.status, 'recorded');
    assert.deepEqual(recorded.receipts[0].foundry_activation_transaction_refs, [
      foundryActivationTransactionRef,
    ]);
    assert.equal(recorded.receipts[0].authority_boundary.can_write_owner_receipt, false);
    verifyCloseout(stateRoot, recorded.receipt_refs[0]);
    const readModel = readCloseoutEvidence(stateRoot);
    assert.equal(readModel.summary.foundry_activation_transaction_ref_count, 1);
    assert.deepEqual(readModel.foundry_activation_transaction_receipt_refs, [
      foundryActivationTransactionRef,
    ]);
  });
});

test('Developer Mode derives route repetition only from verified live receipts', () => {
  withStateRoot('opl-developer-mode-repetition-', (stateRoot) => {
    const first = recordCloseout(stateRoot, completePayload).receipt_refs[0] as string;
    verifyCloseout(stateRoot, first);
    const second = recordCloseout(stateRoot, {
      ...completePayload,
      target_repo_id: 'one-person-lab',
      patrol_observation_ref: 'patrol-observation-ref:opl/live-direct-fix-repeat',
      diff_ref: 'diff-ref:opl/live-direct-fix-repeat',
      verification_refs: ['test-result-ref:opl/live-direct-fix-repeat'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:opl/live-direct-fix-repeat',
      commit_ref: 'git-commit-ref:opl/live-direct-fix-repeat',
      owner_acceptance_ref: 'external-owner-ref:opl/live-direct-fix-repeat-accepted',
    }).receipt_refs[0] as string;
    verifyCloseout(stateRoot, second);

    const readModel = readCloseoutEvidence(stateRoot);
    assert.equal(readModel.scaleout_followthrough.derived_route_repetition_ref_count, 1);
    assert.match(
      readModel.scaleout_followthrough.derived_route_repetition_refs[0],
      /^developer-mode-route-repetition-ref:dmrr_[a-f0-9]{24}$/,
    );
    assert.deepEqual(
      readModel.scaleout_followthrough.derived_route_repetition_source_receipt_refs.sort(),
      [first, second].sort(),
    );
    assert.equal(readModel.authority_boundary.can_claim_production_ready, false);
  });
});

test('Developer Mode fails closed for incomplete, non-owner, or non-live fork PR evidence', () => {
  withStateRoot('opl-developer-mode-invalid-', (stateRoot) => {
    const invalidDirect = [
      {
        payload: { ...completePayload, owner_acceptance_ref: 'owner-receipt-ref:mas/forbidden' },
        blocker: 'developer_mode_owner_acceptance_ref_not_external',
      },
      {
        payload: {
          target_repo_id: 'med-autoscience',
          route_decision: 'direct-fix',
          route_eligibility: 'eligible_direct_fix',
          patrol_observation_ref: 'patrol-observation-ref:mas/incomplete',
          owner_acceptance_ref: 'external-owner-ref:mas/incomplete',
        },
        blocker: null,
      },
    ];
    for (const entry of invalidDirect) {
      const blocked = recordCloseout(stateRoot, entry.payload);
      assert.equal(blocked.status, 'no_eligible_developer_mode_closeout_receipts');
      if (entry.blocker) {
        assert.equal(blocked.blocked_receipts[0].blocker.blocker_id, entry.blocker);
      } else {
        assert.equal(blocked.blocked_receipts[0].missing_closeout_refs.includes('diff_ref'), true);
      }
    }

    const forkBase = {
      target_repo_id: 'redcube-ai',
      route_decision: 'fork-PR',
      route_eligibility: 'eligible_fork_pr',
      patrol_observation_ref: 'patrol-observation-ref:rca/live-fork-pr',
      diff_ref: 'diff-ref:rca/live-fork-pr',
      verification_refs: ['test-result-ref:rca/live-fork-pr'],
      no_forbidden_write_ref: 'no-forbidden-write-ref:rca/live-fork-pr',
      fork_repo_ref: 'github-fork-ref:https://github.com/developer/redcube-ai',
      pr_review_ref: 'github-pr-review-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42',
      owner_acceptance_ref:
        'github-pr-owner-acceptance-ref:https://github.com/gaofeng21cn/redcube-ai/pull/42#pullrequestreview-123',
    };
    const invalidForks = [
      {
        overrides: {
          fork_repo_ref: 'fixture://redcube-ai/developer-mode-fork-pr-drill',
          pr_review_ref: 'repo-contract-fixture-ref:redcube-ai/fork-pr-drill',
        },
        blocker: 'developer_mode_fork_pr_refs_not_live_external_refs',
      },
      {
        overrides: {
          fork_repo_ref: 'github-fork-ref:developer/redcube-ai',
          pr_review_ref: 'github-pr-review-ref:rca/developer-mode-fork-pr',
        },
        blocker: 'developer_mode_fork_pr_refs_not_live_external_refs',
      },
      {
        overrides: { owner_acceptance_ref: 'external-owner-acceptance-ref:rca/live-fork-pr' },
        blocker: 'developer_mode_fork_pr_owner_acceptance_not_pr_backed',
      },
    ];
    for (const entry of invalidForks) {
      const blocked = recordCloseout(stateRoot, { ...forkBase, ...entry.overrides });
      assert.equal(blocked.status, 'no_eligible_developer_mode_closeout_receipts');
      assert.equal(blocked.blocked_receipts[0].blocker.blocker_id, entry.blocker);
    }

    const recorded = recordCloseout(stateRoot, forkBase);
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.receipts[0].route_decision, 'fork-PR');
    assert.equal(recorded.receipts[0].authority_boundary.can_write_owner_receipt, false);
  });
});
