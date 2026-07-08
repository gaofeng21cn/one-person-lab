import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { createMinimalFamilyWorkspaceRoot } from './family-runtime-evidence-worklist-helpers.ts';

test('family-runtime evidence-worklist reports safe-action evidence tail without authority claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-evidence-worklist-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const familyWorkspaceRoot = createMinimalFamilyWorkspaceRoot();
  const fixtures = loadFamilyManifestFixtures();

  try {
    for (const [project, manifest] of [
      ['medautoscience', fixtures.medautoscience],
      ['medautogrant', fixtures.medautogrant],
      ['redcube', fixtures.redcube],
    ] as const) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
    }

    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
    });
    const report = worklist.family_runtime_evidence_worklist;

    assert.equal(report.surface_kind, 'opl_family_runtime_evidence_worklist');
    assert.equal(report.command, 'evidence-worklist');
    assert.equal(report.worklist_summary_mode, 'dry_run_summary');
    assert.equal(report.worklist_mode, 'refs_only_summary');
    assert.equal(report.detail_level, 'summary');
    assert.equal(
      report.projection_detail_policy,
      'attention_first_default_full_refs_via_explicit_drilldown',
    );
    assert.equal(report.apply_supported, false);
    assert.equal(report.summary.domain_ready_authorized, false);
    assert.equal(report.summary.production_ready_authorized, false);
    assert.equal(report.summary.provider_scheduler_item_count, 3);
    assert.equal(report.summary.open_worklist_item_count > 0, true);
    assert.equal(report.summary.closed_refs_only_item_count, 0);
    assert.equal(report.summary.open_safe_action_item_count > 0, true);
    assert.equal(report.counts.open_safe_action_item_count, report.summary.open_safe_action_item_count);
    assert.equal(report.counts.open_worklist_item_count, report.summary.open_worklist_item_count);
    assert.equal(report.next_safe_actions.length > 0, true);
    assert.equal(report.next_safe_actions.length <= 5, true);
    assert.deepEqual(report.full_detail_args, ['--detail', 'full']);
    assert.equal(report.worklist_items, undefined);
    assert.equal(report.attention_queue, undefined);
    assert.equal(report.next_action_ledger, undefined);
    assert.equal(report.authority_boundary.can_write_domain_truth, false);
    assert.equal(report.authority_boundary.can_authorize_domain_ready, false);

    const fullWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
    }).family_runtime_evidence_worklist;
    assert.equal(fullWorklist.detail_level, 'full');
    assert.equal(fullWorklist.command, 'evidence-worklist');
    assert.equal(
      fullWorklist.worklist_items.some((item: { action_kind: string }) =>
        item.action_kind === 'provider_scheduler_status'
      ),
      true,
    );

  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
