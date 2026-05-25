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
import { buildReadyAgentRepo } from './agents-conformance-fixtures.ts';

test('family-runtime evidence-worklist uses repo-native default-caller readiness before manifest projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-caller-repo-native-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const repoDir = buildReadyAgentRepo();
  const manifest = withEvidenceWorklistSurfaces(
    baseManifests.medautogrant,
    ['package_and_submit_ready'],
    { defaultCallerDeletionEvidence: true },
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoDir,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));

    const defaultCallers = runCli([
      'agents',
      'default-callers',
      '--agent',
      `mag=${repoDir}`,
    ]).agent_default_caller_readiness;
    assert.equal(defaultCallers.summary.deletion_evidence_worklist_count, 8);
    assert.equal(defaultCallers.summary.missing_domain_owner_receipt_or_typed_blocker_count, 8);
    assert.equal(defaultCallers.summary.missing_no_forbidden_write_proof_count, 8);
    assert.equal(defaultCallers.summary.missing_tombstone_or_provenance_ref_count, 8);

    const drilldown = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const refs = drilldown.app_operator_drilldown.default_caller_deletion_evidence_refs;
    assert.equal(refs.summary.deletion_evidence_worklist_count, 8);
    assert.equal(refs.summary.open_deletion_evidence_requirement_count, 24);
    assert.equal(refs.summary.missing_domain_owner_receipt_or_typed_blocker_count, 8);
    assert.equal(refs.summary.missing_no_forbidden_write_proof_count, 8);
    assert.equal(refs.summary.missing_tombstone_or_provenance_ref_count, 8);
    assert.equal(refs.domains[0].source, 'agent_default_caller_readiness_repo_projection');
    assert.equal(refs.summary.default_caller_delete_ready, false);
    assert.equal(refs.summary.not_authorized_claims.includes('default_caller_delete_ready'), true);

    const fullOutput = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const fullWorklist = fullOutput.family_runtime_evidence_worklist;
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, 24);
    assert.equal(
      fullWorklist.summary.default_caller_deletion_domain_owner_receipt_or_typed_blocker_missing_count,
      8,
    );
    assert.equal(fullWorklist.summary.default_caller_deletion_no_forbidden_write_missing_count, 8);
    assert.equal(fullWorklist.summary.default_caller_deletion_tombstone_or_provenance_missing_count, 8);
    assert.equal(
      fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
        item.claim_scope === 'default_caller_deletion_evidence'
      ).length,
      24,
    );
    assert.equal(fullWorklist.summary.not_authorized_claims.includes('default_caller_delete_ready'), true);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
