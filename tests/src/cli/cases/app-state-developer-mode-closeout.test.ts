import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../helpers.ts';

const developerModeDirectFixCloseoutPayload = {
  target_repo_id: 'med-autoscience',
  route_decision: 'direct-fix',
  route_eligibility: 'eligible_direct_fix',
  patrol_observation_ref: 'patrol-observation-ref:mas/app-state-direct-fix',
  diff_ref: 'diff-ref:mas/app-state-direct-fix',
  verification_refs: ['test-result-ref:mas/app-state-direct-fix'],
  no_forbidden_write_ref: 'no-forbidden-write-ref:mas/app-state-direct-fix',
  commit_ref: 'git-commit-ref:mas/app-state-direct-fix',
  owner_acceptance_ref: 'external-owner-ref:mas/app-state-direct-fix-accepted',
};

test('app state fast exposes Developer Mode live closeout evidence summary from the ledger', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-devmode-closeout-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const env = {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    };
    const recorded = runCli([
      'runtime',
      'developer-mode-closeout',
      'record',
      '--payload',
      JSON.stringify(developerModeDirectFixCloseoutPayload),
    ], env).developer_mode_closeout_ledger_record;
    const verified = runCli([
      'runtime',
      'developer-mode-closeout',
      'verify',
      '--receipt-ref',
      recorded.receipt_refs[0],
    ], env).developer_mode_closeout_ledger_verify;

    assert.equal(verified.status, 'verified');

    const output = runCli(['app', 'state', '--profile', 'fast'], env) as {
      app_state: {
        developer_mode: {
          live_closeout_evidence?: {
            surface_kind: string;
            source_surface_kind: string;
            status: string;
            ledger_evidence_status: string;
            refs_only: boolean;
            summary: {
              ledger_receipt_ref_count: number;
              ledger_verified_receipt_ref_count: number;
              pending_verify_receipt_ref_count: number;
              live_ledger_closeout_ready_count: number;
              verified_direct_fix_ledger_receipt_ref_count: number;
              verified_fork_pr_ledger_receipt_ref_count: number;
              route_repetition_ref_count: number;
              risk_tier_auto_promotion_ref_count: number;
              app_patrol_mount_ref_count: number;
              scaleout_followthrough_open_gate_count: number;
              fixture_drill_owner_acceptance_open_count: number;
              fixture_drill_external_owner_acceptance_missing_count: number;
              external_owner_acceptance_missing_count: number;
              forbidden_owner_receipt_write_count: number;
            };
            scaleout_followthrough: {
              status: string;
              open_gate_count: number;
            };
            authority_boundary: {
              refs_only: boolean;
              can_write_domain_truth: boolean;
              can_write_owner_receipt: boolean;
              can_modify_managed_runtime: boolean;
              can_claim_release_ready: boolean;
              can_claim_production_ready: boolean;
              can_close_developer_mode_live_route: boolean;
            };
          };
        };
      };
    };
    const evidence = output.app_state.developer_mode.live_closeout_evidence;

    assert.ok(evidence);
    assert.equal(evidence.surface_kind, 'opl_app_state_developer_mode_live_closeout_evidence_summary');
    assert.equal(
      evidence.source_surface_kind,
      'opl_agent_lab_developer_mode_live_closeout_evidence_read_model',
    );
    assert.equal(evidence.status, 'closeout_refs_incomplete');
    assert.equal(evidence.ledger_evidence_status, 'verified_direct_fix_closeout_refs_observed');
    assert.equal(evidence.refs_only, true);
    assert.equal(evidence.summary.ledger_receipt_ref_count, 1);
    assert.equal(evidence.summary.ledger_verified_receipt_ref_count, 1);
    assert.equal(evidence.summary.pending_verify_receipt_ref_count, 0);
    assert.equal(evidence.summary.live_ledger_closeout_ready_count, 1);
    assert.equal(evidence.summary.verified_direct_fix_ledger_receipt_ref_count, 1);
    assert.equal(evidence.summary.verified_fork_pr_ledger_receipt_ref_count, 0);
    assert.equal(evidence.summary.route_repetition_ref_count, 0);
    assert.equal(evidence.summary.risk_tier_auto_promotion_ref_count, 0);
    assert.equal(evidence.summary.app_patrol_mount_ref_count, 0);
    assert.equal(evidence.summary.scaleout_followthrough_open_gate_count, 0);
    assert.equal(
      evidence.scaleout_followthrough.status,
      'waiting_for_base_live_route_closeout_refs',
    );
    assert.equal(evidence.scaleout_followthrough.open_gate_count, 0);
    assert.equal(evidence.summary.fixture_drill_owner_acceptance_open_count, 0);
    assert.equal(evidence.summary.fixture_drill_external_owner_acceptance_missing_count, 0);
    assert.equal(evidence.summary.external_owner_acceptance_missing_count, 0);
    assert.equal(evidence.summary.forbidden_owner_receipt_write_count, 0);
    assert.equal(evidence.authority_boundary.refs_only, true);
    assert.equal(evidence.authority_boundary.can_write_domain_truth, false);
    assert.equal(evidence.authority_boundary.can_write_owner_receipt, false);
    assert.equal(evidence.authority_boundary.can_modify_managed_runtime, false);
    assert.equal(evidence.authority_boundary.can_claim_release_ready, false);
    assert.equal(evidence.authority_boundary.can_claim_production_ready, false);
    assert.equal(evidence.authority_boundary.can_close_developer_mode_live_route, false);
    assert.equal('drills' in evidence, false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
