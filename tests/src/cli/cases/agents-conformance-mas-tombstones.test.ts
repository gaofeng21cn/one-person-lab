import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  retargetReadyRepo,
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
