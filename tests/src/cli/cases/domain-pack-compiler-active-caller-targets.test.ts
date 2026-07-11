import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';
import {
  attachManifestSurface,
  createFamilyDefaultContractWorkspace,
  writeManifestContractOverrides,
  withPackCompilerReadySurfaces,
} from './domain-pack-compiler-fixtures.ts';

test('generated interfaces fail closed when active caller target kind is not proven', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-unknown-target-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const fixtures = loadFamilyManifestFixtures();
  const unknownTargetMas = attachManifestSurface(
    attachManifestSurface(
      withPackCompilerReadySurfaces(fixtures.medautoscience, {
        agentId: 'mas',
        targetDomainId: 'med-autoscience',
        owner: 'MedAutoScience',
        actionId: 'study_packet',
        stageId: 'study_stage',
        memoryRefId: 'mas_publication_route_memory',
      }),
      'functional_privatization_audit',
      {
        surface_kind: 'functional_privatization_audit',
        target_domain_id: 'med-autoscience',
        modules: [
          {
            module_id: 'ambiguous_status_module',
            classification: 'declarative_pack_generated_surface',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/status.py'],
            active_callers: ['status readout'],
            active_caller_status: 'declared active caller',
            migration_action: 'declared active caller target',
          },
        ],
      },
    ),
    'generated_surface_handoff',
    {
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'med-autoscience',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      handoff_surfaces: [
        {
          surface_id: 'status_read_model',
          current_paths: ['src/med_autoscience/status.py'],
          current_role: 'declared active caller',
          target_role: 'unclassified_status_sink',
        },
      ],
    },
  );
  const repoDir = path.join(workspaceRoot, 'med-autoscience');
  writeManifestContractOverrides(repoDir, unknownTargetMas);

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoDir,
    '--manifest-command',
    buildManifestCommand(unknownTargetMas),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(bundle.active_caller_target_proof.status, 'blocked');
  assert.equal(
    bundle.active_caller_cutover_proof.blocked_surface_ids.includes('status_read_model'),
    true,
  );
  const statusTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  );
  assert.equal(statusTarget.proof_status, 'blocked_active_caller_target_not_proven');
  assert.equal(statusTarget.target_kind, 'descriptor_declared_target');
});
