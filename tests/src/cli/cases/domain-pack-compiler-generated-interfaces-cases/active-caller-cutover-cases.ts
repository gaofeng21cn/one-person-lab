import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, runCliFailure, test } from '../../helpers.ts';
import { buildReadyAgentRepo, writeJson } from '../agents-conformance-fixtures.ts';
import {
  attachManifestSurface,
  bindFamilyContractModulePaths,
  bindFamilyManifests,
  createFamilyDefaultContractWorkspace,
  writeManifestContractOverrides,
  withPackCompilerReadySurfaces,
} from '../domain-pack-compiler-fixtures.ts';

test('generated interfaces keep active caller cutover blocked while repo-local migration bridges remain', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-bridge-blocked-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  bindFamilyContractModulePaths(env, workspaceRoot);
  const fixtures = loadFamilyManifestFixtures();
  const bridgeMas = attachManifestSurface(
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
            module_id: 'repo_local_product_wrapper_bridge',
            classification: 'temporary_migration_bridge',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/cli.py'],
            active_callers: ['medautosci product-status'],
            active_caller_status: 'repo-local wrapper migration_bridge_pending',
            migration_action: 'cut over active caller to OPL generated product status surface',
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
          current_paths: ['src/med_autoscience/cli.py'],
          current_role: 'repo-local wrapper migration bridge',
          target_role: 'opl_generated_product_status_surface',
        },
      ],
    },
  );
  const repoDir = path.join(workspaceRoot, 'med-autoscience');
  writeManifestContractOverrides(repoDir, bridgeMas);

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoDir,
    '--manifest-command',
    buildManifestCommand(bridgeMas),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.standard_agent_contract_resolution.status, 'resolved');
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.generated_blocks_ready, true);
  assert.equal(bundle.active_caller_cutover_proof.blocked_target_count >= 1, true);
  assert.equal(bundle.active_caller_cutover_proof.blocked_surface_ids.includes('status_read_model'), true);
  assert.equal(bundle.active_caller_cutover_proof.domain_handler_targets_only, false);
  assert.equal(bundle.active_caller_target_proof.status, 'blocked');
  assert.equal(bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  ).proof_status, 'blocked_active_caller_not_cut_over');
});

test('generated interfaces reject retired wrapper names as implicit canonical surface aliases', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-no-wrapper-alias-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  bindFamilyContractModulePaths(env, workspaceRoot);
  const fixtures = loadFamilyManifestFixtures();
  const wrapperOnlyMas = attachManifestSurface(
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
            module_id: 'legacy_wrapper_status_projection',
            classification: 'refs_only_adapter',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/product_status.py'],
            current_surface_refs: ['product_status', 'workbench'],
            active_callers: ['wrapper-only status/workbench read model'],
            active_caller_status: 'refs_only_domain_adapter_target',
            migration_action: 'domain projection consumed by historical wrapper names only',
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
      generated_surfaces: [
        { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'product_status', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'workbench', owner: 'one-person-lab', status: 'descriptor_source_available' },
      ],
    },
  );
  const repoDir = path.join(workspaceRoot, 'med-autoscience');
  writeManifestContractOverrides(repoDir, wrapperOnlyMas);

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoDir,
    '--manifest-command',
    buildManifestCommand(wrapperOnlyMas),
  ], env);

  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(bundle.active_caller_target_proof.status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(
    bundle.active_caller_cutover_proof.blocked_surface_ids.includes('status_read_model'),
    true,
  );
  assert.equal(
    bundle.active_caller_cutover_proof.blocked_surface_ids.includes('workbench_drilldown'),
    true,
  );
  const statusTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'status_read_model',
  );
  const workbenchTarget = bundle.active_caller_target_proof.surface_targets.find(
    (target: { surface_id: string }) => target.surface_id === 'workbench_drilldown',
  );
  assert.equal(statusTarget.proof_status, 'blocked_missing_handoff_and_active_caller_proof');
  assert.equal(workbenchTarget.proof_status, 'blocked_missing_handoff_and_active_caller_proof');
});

test('generated interfaces expose active legacy caller deletion gate refs without authorizing delete', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-delete-gate-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  bindFamilyContractModulePaths(env, workspaceRoot);
  const fixtures = loadFamilyManifestFixtures();
  const bridgeExitGate = {
    no_forbidden_write_refs: ['no-forbidden-write:mas/status-read-model'],
    tombstone_refs: ['tombstone:mas/status-read-model'],
    provenance_refs: ['provenance:mas/status-read-model'],
    physical_delete_authorized: false,
  };
  const bridgedMas = attachManifestSurface(
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
            module_id: 'legacy_progress_portal_status',
            classification: 'refs_only_adapter',
            owner: 'med-autoscience',
            code_paths: ['src/med_autoscience/progress_portal.py'],
            current_surface_refs: ['status_read_model'],
            active_callers: ['OPL generated status read model'],
            active_caller_status: 'refs_only_domain_adapter_target',
            migration_action: 'keep progress portal as refs-only domain adapter until owner delete decision',
            bridge_exit_gate: bridgeExitGate,
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
          current_paths: ['src/med_autoscience/progress_portal.py'],
          current_role: 'refs_only_domain_adapter_target',
          target_role: 'refs_only_domain_adapter_target',
        },
      ],
    },
  );
  const repoDir = path.join(workspaceRoot, 'med-autoscience');
  writeManifestContractOverrides(repoDir, bridgedMas);

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoDir,
    '--manifest-command',
    buildManifestCommand(bridgedMas),
  ], env);

  const readout = runCli(['agents', 'interfaces', '--domain', 'mas'], env)
    .generated_agent_interfaces.active_legacy_caller_deletion_gate_readout;
  const statusGate = readout.surfaces.find(
    (surface: { surface_id: string }) => surface.surface_id === 'product_status',
  );

  assert.equal(readout.surface_kind, 'opl_active_legacy_caller_deletion_gate_readout');
  assert.equal(readout.readout_can_authorize_domain_repo_physical_delete, false);
  assert.equal(readout.physical_delete_authorized, false);
  assert.equal(readout.next_required_owner_action, 'domain_owner_choose_delete_authorize_keep_or_typed_blocker');
  assert.deepEqual(readout.accepted_refs_only_result_shapes, [
    'physical_delete_authorization_ref',
    'keep_as_authority_adapter_ref',
    'typed_blocker_ref',
  ]);
  assert.ok(statusGate);
  assert.equal(statusGate.active_caller_module_id, 'legacy_progress_portal_status');
  assert.equal(statusGate.replacement_parity, 'observed');
  assert.deepEqual(statusGate.no_active_caller_proof_refs, [
    'generated_wrapper_bundle.descriptor_scope.product_status',
    'active_caller_target_proof.surface_targets.status_read_model',
  ]);
  assert.deepEqual(statusGate.no_forbidden_write_refs, ['no-forbidden-write:mas/status-read-model']);
  assert.deepEqual(statusGate.tombstone_or_provenance_refs, [
    'tombstone:mas/status-read-model',
    'provenance:mas/status-read-model',
    'status_read_model',
  ]);
  assert.equal(statusGate.structural_prerequisites_observed, true);
  assert.equal(statusGate.owner_decision_required, true);
  assert.deepEqual(statusGate.owner_decision_refs, []);
  assert.equal(statusGate.physical_delete_authorized, false);
});
