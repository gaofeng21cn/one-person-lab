import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import {
  familyRuntimeEnv,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

test('evidence worklist carries default-caller deletion gates without delete authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-default-caller-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = withEvidenceWorklistSurfaces(
    loadFamilyManifestFixtures().medautoscience,
    ['direction_and_route_selection'],
    { defaultCallerDeletionEvidence: true },
  );
  const env = familyRuntimeEnv(stateRoot, fixtureContractsRoot);
  const masPack = createAdmittedStagePackFixture(manifest, 'med-autoscience', 'MedAutoScience');

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      buildManifestCommand(masPack.manifest),
    ], env);
    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], env).family_runtime_evidence_worklist;
    const items = worklist.worklist_items.filter(
      (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
    );

    assert.equal(items.length, 24);
    assert.equal(worklist.summary.default_caller_deletion_evidence_item_count, 24);
    assert.equal(worklist.summary.default_caller_deletion_open_safe_action_item_count, 0);
    assert.equal(worklist.summary.default_caller_deletion_audit_lane_item_count, 24);
    for (const item of items) {
      assert.equal(item.status, 'open_safe_action_request_route_available');
      assert.equal(item.route_requires_domain_or_app_payload, true);
      assert.equal(item.worklist_item_is_completion_claim, false);
      assert.equal(
        item.not_authorized_claims.includes('domain_repo_physical_delete_authorization'),
        true,
      );
      assert.equal(item.evidence_requirement.can_claim_domain_ready, false);
      assert.equal(item.evidence_requirement.can_claim_production_ready, false);
    }
    assert.equal(
      worklist.attention_queue.some(
        (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
      ),
      false,
    );
    assert.equal(
      worklist.next_safe_actions.some(
        (item: { claim_scope: string }) => item.claim_scope === 'default_caller_deletion_evidence',
      ),
      false,
    );
    assert.equal(worklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(worklist.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(worklist.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});
