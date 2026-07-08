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
  createMinimalFamilyWorkspaceRoot,
  familyRuntimeEnv,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMetaMorphology,
  retargetReadyRepo,
} from './agents-conformance-fixtures.ts';
import { MINIMAL_SCHOLAR_SKILLS_CAPABILITY_MODULES_CONTRACT } from './agent-workspace-norm-fixture.ts';

function addScholarSkillsCapabilityPackage(workspaceRoot: string) {
  const repoDir = path.join(workspaceRoot, 'mas-scholar-skills');
  fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'skills', 'mas-scholar-skills'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'contracts', 'scholar-skills-capability-modules.json'),
    `${JSON.stringify(MINIMAL_SCHOLAR_SKILLS_CAPABILITY_MODULES_CONTRACT, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoDir, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: 'mas-scholar-skills', skills: './skills/' }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoDir, 'skills', 'mas-scholar-skills', 'SKILL.md'),
    '---\nname: mas-scholar-skills\ndescription: MAS Scholar Skills fixture capability plugin pack.\n---\n\n# MAS Scholar Skills\n',
    'utf8',
  );
  return repoDir;
}

function familyWorkspace() {
  return createMinimalFamilyWorkspaceRoot({
    includeOplMetaAgent: true,
    buildRepo: (domainId, domainLabel) => {
      const repoDir = buildReadyAgentRepo();
      retargetReadyRepo(repoDir, domainId, domainLabel);
      if (domainId === 'opl-meta-agent') {
        configureReadyMetaMorphology(repoDir);
      }
      return repoDir;
    },
  });
}

test('family-runtime evidence-worklist consumes repo-native default-caller readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-caller-repo-native-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const repoDir = buildReadyAgentRepo();
  const manifest = withEvidenceWorklistSurfaces(
    loadFamilyManifestFixtures().medautogrant,
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
    assert.equal(defaultCallers.summary.missing_no_active_caller_proof_count, 0);
    assert.equal(defaultCallers.summary.missing_no_forbidden_write_proof_count, 8);
    assert.equal(defaultCallers.summary.missing_tombstone_or_provenance_ref_count, 8);
    assert.equal(defaultCallers.physical_delete_authority_read_model.delete_or_keep_prerequisites_observed, false);
    assert.equal(defaultCallers.physical_delete_authority_read_model.accepted_refs_only_result_shapes[0], 'typed_blocker_ref');

    const drilldown = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const refs = drilldown.app_operator_drilldown.default_caller_deletion_evidence_refs;
    assert.equal(refs.summary.deletion_evidence_worklist_count, 8);
    assert.equal(refs.summary.open_deletion_evidence_requirement_count, 24);
    assert.equal(refs.domains[0].source, 'agent_default_caller_readiness_repo_projection');
    assert.equal(refs.summary.default_caller_delete_ready, false);
    assert.equal(refs.summary.not_authorized_claims.includes('default_caller_delete_ready'), true);

    const fullWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).family_runtime_evidence_worklist;
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, 24);
    assert.equal(fullWorklist.summary.default_caller_deletion_no_active_caller_missing_count, 0);
    assert.equal(
      fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
        item.claim_scope === 'default_caller_deletion_evidence'
      ).length,
      24,
    );
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family defaults keep OMA default-caller cleanup out of runtime worklist items', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-default-caller-oma-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const familyWorkspaceRoot = familyWorkspace();
  const env = familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
    OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
  });

  try {
    const defaultCallers = runCli(['agents', 'default-callers', '--family-defaults'], env);
    assert.equal(defaultCallers.physical_delete_authority_read_model.total_repo_count, 4);
    assert.equal(defaultCallers.deletion_evidence_worklist_count, 32);
    assert.equal(defaultCallers.physical_delete_authorized, false);
    assert.equal(defaultCallers.default_caller_delete_ready, false);
    assert.equal(
      defaultCallers.repo_deletion_gate_summary.some((repo: { domain_id: string; repo_id: string }) =>
        repo.domain_id === 'opl-meta-agent' && repo.repo_id === repo.domain_id
      ),
      true,
    );

    const fullWorklist = runCli([
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
    assert.equal(fullWorklist.summary.default_caller_deletion_evidence_item_count, 0);
    assert.equal(
      fullWorklist.worklist_items.some((item: { claim_scope: string; owner: string }) =>
        item.claim_scope === 'default_caller_deletion_evidence' && item.owner === 'opl-meta-agent'
      ),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

test('ScholarSkills capability packages stay outside family default-caller deletion gates', () => {
  const familyWorkspaceRoot = familyWorkspace();
  const scholarSkillsRepo = addScholarSkillsCapabilityPackage(familyWorkspaceRoot);
  const env = { OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot };

  try {
    const conformance = runCli(['agents', 'conformance', '--family-defaults'], env).standard_domain_agent_conformance;
    assert.deepEqual(
      conformance.framework_capability_packages.map((entry: { canonical_agent_id: string }) =>
        entry.canonical_agent_id
      ),
      ['mas-scholar-skills'],
    );
    assert.equal(conformance.framework_capability_packages[0].repo_dir, scholarSkillsRepo);

    const defaultCallers = runCli(['agents', 'default-callers', '--family-defaults'], env);
    assert.deepEqual(
      defaultCallers.physical_delete_authority_read_model.owner_decision_gate_by_repo.map(
        (repo: { repo_id: string }) => repo.repo_id,
      ),
      ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent'],
    );
    assert.equal(defaultCallers.physical_delete_authority_read_model.total_repo_count, 4);
    assert.equal(defaultCallers.active_deletion_evidence_worklist_count, 32);
  } finally {
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});
