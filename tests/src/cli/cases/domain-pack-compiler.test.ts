import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, loadFrameworkContracts, os, path, repoRoot, runCli, shellSingleQuote, test } from '../helpers.ts';
import { buildFamilyAgentDescriptorList } from '../../../../src/family-domain-agent-descriptor.ts';
import {
  assertReadyPackCompilerSummary,
  PACK_COMPILER_GENERATED_SURFACE_COUNT_PER_DOMAIN,
  PACK_COMPILER_READY_DOMAIN_ALIASES,
} from './domain-pack-compiler-assertions.ts';
import {
  attachManifestSurface,
  bindFamilyManifests,
  withPackCompilerReadySurfaces,
} from './domain-pack-compiler-fixtures.ts';

function buildDelayedManifestCommand(payload: Record<string, unknown>, delayMs: number) {
  return `${process.execPath} -e ${
    shellSingleQuote(`setTimeout(() => process.stdout.write(process.argv[1]), ${delayMs});`)
  } ${shellSingleQuote(JSON.stringify(payload))}`;
}

test('domain pack compiler projects OPL-owned generated surfaces for admitted domain packs', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  bindFamilyManifests(env);

  const list = runCli(['agents', 'pack-compiler'], env);
  assert.equal(list.domain_pack_compiler.surface_kind, 'opl_domain_pack_compiler_index');
  assert.equal(list.domain_pack_compiler.owner, 'one-person-lab');
  assertReadyPackCompilerSummary(list.domain_pack_compiler.summary);
  assert.equal(list.domain_pack_compiler.authority_boundary.opl_owns_generated_surfaces, true);
  assert.equal(list.domain_pack_compiler.authority_boundary.domain_repo_can_own_generated_surface, false);
  assert.equal(list.domain_pack_compiler.authority_boundary.opl_can_write_domain_truth, false);

  const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
  assert.equal(mas.domain_pack_compiler.surface_kind, 'opl_domain_pack_compiler_inspection');
  assert.equal(mas.domain_pack_compiler.compiler_status, 'ready');
  assert.deepEqual(mas.domain_pack_compiler.blocker_reasons, []);
  assert.equal(mas.domain_pack_compiler.pack_compiler_input_projection.generated_surface_owner, 'one-person-lab');
  assert.equal(mas.domain_pack_compiler.pack_compiler_input_projection.domain_repo_can_own_generated_surface, false);
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.surface_kind, 'opl_generated_agent_interface_bundle');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.owner, 'one-person-lab');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.status, 'ready');
  assert.deepEqual(mas.domain_pack_compiler.generated_interface_bundle.generated_from, [
    'family_action_catalog',
    'family_stage_control_plane',
    'domain_memory_descriptor',
    'runtime_surfaces',
    'functional_privatization_audit',
    'generated_surface_handoff',
    'product_entry_manifest_descriptor',
    'domain_handler_descriptor',
  ]);
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.cli.descriptors[0].command, 'MedAutoScience study_packet');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.mcp.descriptors[0].name, 'study_packet');
  assert.equal(mas.domain_pack_compiler.generated_interface_bundle.skill.descriptors[0].command_contract_id, 'study_packet');
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.product_entry.descriptors[0].command,
    'MedAutoScience product study_packet',
  );
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.openai_tool.descriptors[0].function.name,
    'study_packet',
  );
  assert.deepEqual(
    mas.domain_pack_compiler.generated_interface_bundle.stage_routes[0],
    {
      stage_id: 'study_stage',
      allowed_action_refs: ['study_packet'],
      authority_owner: 'MedAutoScience',
    },
  );
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.authority_boundary.generated_interface_can_write_domain_truth,
    false,
  );
  assert.equal(
    mas.domain_pack_compiler.generated_interface_bundle.authority_boundary
      .generated_interface_can_authorize_quality_or_export,
    false,
  );
  assert.equal(
    mas.domain_pack_compiler.generated_surface_handoff.generated_surfaces.some(
      (surface: { surface_id: string; status: string }) =>
        surface.surface_id === 'domain_handler' && surface.status === 'ready_from_descriptor',
    ),
    true,
  );
  assert.equal(
    mas.domain_pack_compiler.pack_compiler_input_projection.minimal_authority_function_refs[0].cannot_absorb_reason,
    'OPL cannot authorize domain quality, export, or truth verdicts.',
  );
  assert.equal(mas.domain_pack_compiler.authority_boundary.opl_can_authorize_quality_or_export, false);
  assert.equal(mas.domain_pack_compiler.authority_boundary.provider_completion_is_domain_ready, false);
});

test('domain pack compiler index keeps generated surfaces ready, aligned, and OPL-owned', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-readiness-state-'));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  try {
    bindFamilyManifests(env);

    const list = runCli(['agents', 'pack-compiler'], env);
    assertReadyPackCompilerSummary(list.domain_pack_compiler.summary);
    assert.equal(list.domain_pack_compiler.authority_boundary.opl_owns_generated_surfaces, true);
    assert.equal(list.domain_pack_compiler.authority_boundary.domain_repo_can_own_generated_surface, false);

    for (const domain of PACK_COMPILER_READY_DOMAIN_ALIASES) {
      const inspection = runCli(['agents', 'pack-compiler', 'inspect', '--domain', domain], env)
        .domain_pack_compiler;
      assert.equal(inspection.compiler_status, 'ready');
      assert.equal(inspection.generated_interface_bundle.owner, 'one-person-lab');
      assert.equal(inspection.generated_interface_bundle.status, 'ready');
      assert.equal(inspection.generated_interface_bundle.domain_repo_can_own_generated_surface, false);
      assert.equal(
        inspection.generated_surface_handoff.generated_surfaces.length,
        PACK_COMPILER_GENERATED_SURFACE_COUNT_PER_DOMAIN,
      );
      assert.equal(inspection.generated_artifact_drift_manifest.status, 'aligned');
      assert.deepEqual(inspection.generated_artifact_drift_manifest.drift_findings, []);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain pack compiler uses an extended manifest discovery budget without changing descriptor default timeout', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-timeout-state-'));
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
  };
  const fixtures = loadFamilyManifestFixtures();
  const slowMas = withPackCompilerReadySurfaces(fixtures.medautoscience, {
    agentId: 'mas',
    targetDomainId: 'med-autoscience',
    owner: 'MedAutoScience',
    actionId: 'study_packet',
    stageId: 'study_stage',
    memoryRefId: 'mas_publication_route_memory',
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildDelayedManifestCommand(slowMas, 500),
    ], env);

    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    const previousStateDir = process.env.OPL_STATE_DIR;
    let descriptors;
    try {
      process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
      process.env.OPL_STATE_DIR = stateRoot;
      descriptors = buildFamilyAgentDescriptorList(loadFrameworkContracts(), {
        manifestCommandTimeoutMs: 100,
      });
    } finally {
      if (previousContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = previousContractsDir;
      }
      if (previousStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousStateDir;
      }
    }
    const masDescriptor = descriptors.family_agent_descriptors.descriptors.find(
      (descriptor: { project_id: string }) => descriptor.project_id === 'medautoscience',
    );
    assert.ok(masDescriptor);
    assert.equal(masDescriptor.manifest_status, 'command_timeout');

    const packCompiler = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
    assert.equal(packCompiler.domain_pack_compiler.compiler_status, 'ready');
    assert.deepEqual(packCompiler.domain_pack_compiler.blocker_reasons, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain pack compiler blocks generated handoff when a domain still declares generic residue', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-blocked-state-'));
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
          code_paths: ['docs/history/runtime-substrate/mas-supervision-scheduler-tombstone.md'],
          active_callers: ['legacy negative guard fixture'],
          active_caller_status: 'legacy_negative_guard_active_fixture',
          migration_action: 'must stay tombstone/provenance and never re-enter active generated surface',
        },
      ],
    },
  );

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(blockedMas),
  ], env);

  const mas = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'mas'], env);
  assert.equal(mas.domain_pack_compiler.compiler_status, 'blocked');
  assert.equal(
    mas.domain_pack_compiler.blocker_reasons.includes(
      'functional_privatization_audit_has_generic_residue_or_blocker',
    ),
    true,
  );
  assert.equal(
    mas.domain_pack_compiler.pack_compiler_input_projection.functional_privatization_summary
      .active_private_generic_residue_count,
    1,
  );
});
