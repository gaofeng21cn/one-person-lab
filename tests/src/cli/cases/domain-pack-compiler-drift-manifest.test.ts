import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
  runCliInCwd,
  test,
} from '../helpers.ts';
import {
  attachManifestSurface,
  bindFamilyManifests,
  withPackCompilerReadySurfaces,
  writeManifestContractOverrides,
} from './domain-pack-compiler-fixtures.ts';
import {
  assertReadyPackCompilerSummary,
  PACK_COMPILER_DEFAULT_DOMAIN_ALIASES,
} from './domain-pack-compiler-assertions.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

test('domain pack compiler emits aligned generated artifact drift manifests for admitted packs', () => {
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-drift-state-'));
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: fixtureRoot,
    OPL_STATE_DIR: stateRoot,
  };

  bindFamilyManifests(env, { includeOma: false });

  const list = runCliInCwd(['agents', 'pack-compiler'], fixtureRoot, env);
  assert.equal(
    list.domain_pack_compiler.summary.generated_artifact_drift_aligned_count,
    PACK_COMPILER_DEFAULT_DOMAIN_ALIASES.length,
  );
  assert.equal(list.domain_pack_compiler.summary.generated_artifact_drift_detected_count, 0);

  const mas = runCliInCwd(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], fixtureRoot, env);
  const driftManifest = mas.domain_pack_compiler.generated_artifact_drift_manifest;
  assert.equal(driftManifest.surface_kind, 'opl_generated_artifact_drift_manifest');
  assert.equal(driftManifest.status, 'aligned');
  assert.equal(driftManifest.domain_pack_source_inputs_fingerprint.startsWith('sha256:'), true);
  assert.equal(driftManifest.generated_bundle_fingerprint.startsWith('sha256:'), true);
  assert.deepEqual(driftManifest.generated_from, mas.domain_pack_compiler.generated_interface_bundle.generated_from);
  assert.deepEqual(driftManifest.drift_findings, []);
  assert.equal(driftManifest.authority_boundary.opl_owns_generated_surfaces, true);
  assert.equal(driftManifest.authority_boundary.opl_owns_domain_truth, false);
  assert.equal(driftManifest.authority_boundary.opl_can_write_domain_truth, false);
});

test('default domain pack compiler surface treats admitted generated artifacts as aligned', () => {
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-default-state-'));
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: fixtureRoot,
    OPL_STATE_DIR: stateRoot,
  };

  bindFamilyManifests(env, { includeOma: false });

  const list = runCliInCwd(['agents', 'pack-compiler'], fixtureRoot, env);
  assertReadyPackCompilerSummary(list.domain_pack_compiler.summary);

  const mag = runCliInCwd(['agents', 'pack-compiler', 'inspect', '--domain', 'mag'], fixtureRoot, env);
  assert.equal(mag.domain_pack_compiler.compiler_status, 'ready');
  assert.deepEqual(mag.domain_pack_compiler.blocker_reasons, []);
  assert.equal(
    mag.domain_pack_compiler.pack_compiler_input_projection.declarative_pack_refs.transition_status,
    'oracle_evidence_gate',
  );
  assert.equal(
    mag.domain_pack_compiler.pack_compiler_input_projection.declarative_pack_refs.transition_evidence_gate_status,
    'grant_transition_oracle_matrix_passed',
  );
  assert.equal(mag.domain_pack_compiler.generated_artifact_drift_manifest.status, 'aligned');
  assert.deepEqual(mag.domain_pack_compiler.generated_artifact_drift_manifest.drift_findings, []);
});

test('domain pack compiler marks generated artifact drift when blockers remain', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-drift-blocked-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const blockedMas = attachManifestSurface(
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
          module_id: 'repo_owned_generic_scheduler',
          classification: 'generic_scheduler_or_daemon',
          owner: 'med-autoscience',
          code_paths: ['agent/stages/manifest.json'],
          active_callers: ['legacy negative guard fixture'],
          active_caller_status: 'legacy_negative_guard_active_fixture',
          migration_action: 'must stay tombstone/provenance and never re-enter active generated surface',
        },
      ],
    },
  );
  const masPack = createAdmittedStagePackFixture(blockedMas, 'med-autoscience', 'MedAutoScience');
  writeManifestContractOverrides(masPack.repoDir, blockedMas);

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

    const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
    assert.equal(mas.domain_pack_compiler.generated_artifact_drift_manifest.status, 'drift_detected');
    assert.equal(
      mas.domain_pack_compiler.generated_artifact_drift_manifest.drift_findings.includes(
        'compiler_blocker:functional_privatization_audit_has_generic_residue_or_blocker',
      ),
      true,
    );
  } finally {
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});
