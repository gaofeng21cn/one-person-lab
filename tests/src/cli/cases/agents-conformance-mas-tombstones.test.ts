import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  retargetReadyRepo,
  retargetReadyRepoToMag,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('agents conformance allows MAS runtime tombstone contract to name retired private-control surfaces', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');
  fs.mkdirSync(path.join(masRepo, 'contracts', 'runtime'), { recursive: true });
  writeJson(path.join(masRepo, 'contracts', 'runtime', 'legacy-active-path-tombstones.json'), {
    surface_kind: 'mas_legacy_active_path_tombstone_contract',
    status: 'legacy_active_paths_tombstoned',
    legacy_control_receipt_exclusion_policy: {
      status: 'active_tombstone_provenance_filter',
      legacy_markers: [
        'runtime_supervisor',
        'supervision_scheduler',
        'mas_supervision_scheduler',
      ],
      authority_boundary: {
        history_provenance_only: true,
        can_claim_generic_runtime_owner: false,
      },
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${masRepo}`,
  ]).standard_domain_agent_conformance;
  const morphologyChecks = report.reports[0].physical_morphology_checks;

  assert.equal(report.status, 'passed');
  assert.equal(morphologyChecks.residue_classification_summary.status, 'no_active_forbidden_name_residue');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 0);
  assert.equal(morphologyChecks.residue_classification_summary.allowed_name_residue_count, 3);
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, []);
  assert.deepEqual(
    morphologyChecks.allowed_name_residue.map(
      (entry: { path: string; allowance_classification: string }) => ({
        path: entry.path,
        allowance_classification: entry.allowance_classification,
      }),
    ),
    [
      {
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
      {
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
      {
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
    ],
  );
  assert.deepEqual(report.reports[0].blockers, []);
});

test('agents conformance allows MAS legacy active path tombstone contract markers', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'med-autoscience', 'Med Auto Science');
  fs.mkdirSync(path.join(repoDir, 'contracts', 'runtime'), { recursive: true });
  writeJson(path.join(repoDir, 'contracts', 'runtime', 'legacy-active-path-tombstones.json'), {
    surface_kind: 'mas_legacy_active_path_tombstone_contract',
    status: 'legacy_active_paths_tombstoned',
    legacy_control_receipt_exclusion_policy: {
      status: 'active_tombstone_provenance_filter',
      legacy_markers: [
        'runtime_supervisor',
        'supervision_scheduler',
        'mas_supervision_scheduler',
      ],
      authority_boundary: {
        read_only: true,
        history_provenance_only: true,
        can_create_runtime_entrypoint: false,
        can_claim_generic_runtime_owner: false,
        can_write_domain_truth: false,
      },
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const morphologyChecks = report.reports[0].physical_morphology_checks;

  assert.equal(report.status, 'passed');
  assert.equal(morphologyChecks.status, 'passed');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 0);
  assert.equal(morphologyChecks.residue_classification_summary.allowed_name_residue_count, 3);
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, []);
  assert.deepEqual(
    morphologyChecks.allowed_name_residue.map((entry: { token: string; path: string; allowance_classification: string }) => ({
      token: entry.token,
      path: entry.path,
      allowance_classification: entry.allowance_classification,
    })),
    [
      {
        token: 'runtime_supervisor',
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
      {
        token: 'supervision_scheduler',
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
      {
        token: 'mas_supervision_scheduler',
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
    ],
  );
});

test('agents conformance blocks exact MAG legacy residue tokens', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(repoDir);
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.notes.push('old attempt_ledger exact token must stay out of active paths');
  writeJson(actionCatalogPath, actionCatalog);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  const morphologyChecks = report.reports[0].physical_morphology_checks;
  assert.equal(morphologyChecks.residue_classification_summary.status, 'active_forbidden_name_residue_present');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 1);
  assert.equal(morphologyChecks.residue_classification_summary.allowed_name_residue_count, 0);
  assert.deepEqual(morphologyChecks.allowed_name_residue, []);
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, [
    { token: 'attempt_ledger', path: 'contracts/action_catalog.json', allowed: false },
  ]);
  assert.equal(
    report.reports[0].blockers.includes('active_forbidden_name_residue:attempt_ledger:contracts/action_catalog.json'),
    true,
  );
});
