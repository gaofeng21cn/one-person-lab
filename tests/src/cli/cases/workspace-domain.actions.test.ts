import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

type JsonRecord = Record<string, unknown>;

function buildActionCatalog(targetDomainId: string, actionId: string, stageId: string, options: {
  owner: string;
  title: string;
  surfaceKind: string;
  effect: 'read_only' | 'mutating';
  mcpPublicRuntime?: boolean;
}) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner: options.owner,
    authority_boundary: {
      domain_truth_owner: options.owner,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [
      {
        action_id: actionId,
        title: options.title,
        summary: `${options.title} action shared by CLI, MCP, skill, and product-entry projections.`,
        owner: options.owner,
        effect: options.effect,
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'contracts/stage-1.input.schema.json',
        output_schema_ref: 'contracts/stage-1.output.schema.json',
        required_fields: [],
        optional_fields: ['workspace_root'],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: options.effect === 'mutating' ? [`${actionId}_operator_gate`] : [],
        stage_route: {
          entry_stage_ref: stageId,
          required_stage_refs: [stageId],
          optional_stage_refs: [],
          terminal_stage_refs: [stageId],
          route_policy: 'ai_selected_progress_route',
        },
        supported_surfaces: {
          cli: {
            surface_kind: options.surfaceKind,
          },
          mcp: {
            tool_name: actionId,
            surface_kind: 'domain_mcp_descriptor',
            public_runtime: options.mcpPublicRuntime ?? true,
            descriptor_only: !(options.mcpPublicRuntime ?? true),
          },
          skill: {
            command_contract_id: actionId,
            surface_kind: 'domain_skill_contract',
          },
          product_entry: {
            action_key: actionId,
            surface_kind: 'domain_product_entry',
          },
          openai: {
            tool_name: actionId,
          },
          ai_sdk: {
            tool_name: actionId,
          },
        },
        authority_boundary: {
          opl_can_write_domain_truth: false,
        },
      },
    ],
  };
}

function withFamilyActionCatalog(payload: JsonRecord, catalog: JsonRecord) {
  const actions = Array.isArray(catalog.actions) ? catalog.actions as JsonRecord[] : [];
  const actionContracts = actions.map((action) => ({
    action_id: action.action_id,
    command_contract_id:
      ((action.supported_surfaces as JsonRecord | undefined)?.skill as JsonRecord | undefined)?.command_contract_id
      ?? action.action_id,
  }));
  const attachCatalog = (manifest: JsonRecord) => {
    const {
      family_stage_control_plane: _retiredInlineStagePlane,
      family_stage_control_plane_ref: _staleGeneratedStagePlaneRef,
      ...declarativeManifest
    } = manifest;
    return {
      ...declarativeManifest,
      family_action_catalog: catalog,
      operator_loop_actions: Object.fromEntries(
        Object.entries((manifest.operator_loop_actions as JsonRecord | undefined) ?? {})
          .filter(([actionId]) => !actions.some((action) => action.action_id === actionId)),
      ),
      skill_catalog: {
        ...((manifest.skill_catalog as JsonRecord | undefined) ?? {}),
      surface_kind: ((manifest.skill_catalog as JsonRecord | undefined)?.surface_kind as string | undefined) ?? 'skill_catalog',
      summary: ((manifest.skill_catalog as JsonRecord | undefined)?.summary as string | undefined) ?? 'Fixture skill catalog',
      skills: ((manifest.skill_catalog as JsonRecord | undefined)?.skills as unknown[] | undefined) ?? [],
      supported_commands: ((manifest.skill_catalog as JsonRecord | undefined)?.supported_commands as unknown[] | undefined) ?? [],
      command_contracts: [
        ...(((manifest.skill_catalog as JsonRecord | undefined)?.command_contracts as unknown[] | undefined) ?? []),
        ...actionContracts,
      ],
      },
    };
  };

  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: attachCatalog(payload.product_entry_manifest as JsonRecord),
    };
  }

  return attachCatalog(payload);
}

function withSkillDomainProjectionOnly(payload: JsonRecord, catalog: JsonRecord) {
  const attachCatalog = (manifest: JsonRecord) => {
    const {
      family_stage_control_plane: _retiredInlineStagePlane,
      family_stage_control_plane_ref: _staleGeneratedStagePlaneRef,
      ...declarativeManifest
    } = manifest;
    return {
      ...declarativeManifest,
      family_action_catalog: catalog,
      operator_loop_actions: Object.fromEntries(
        Object.entries((manifest.operator_loop_actions as JsonRecord | undefined) ?? {})
          .filter(([actionId]) => actionId !== 'start_deliverable'),
      ),
      skill_catalog: {
        ...((manifest.skill_catalog as JsonRecord | undefined) ?? {}),
      surface_kind: ((manifest.skill_catalog as JsonRecord | undefined)?.surface_kind as string | undefined) ?? 'skill_catalog',
      summary: ((manifest.skill_catalog as JsonRecord | undefined)?.summary as string | undefined) ?? 'Fixture skill catalog',
      skills: [
        ...(((manifest.skill_catalog as JsonRecord | undefined)?.skills as unknown[] | undefined) ?? []),
        {
          surface_kind: 'skill_descriptor',
          skill_id: 'redcube',
          title: 'RedCube AI',
          owner: 'redcube_ai',
          distribution_mode: 'codex_plugin',
          target_surface_kind: 'product_entry',
          description: 'Fixture RedCube skill descriptor.',
          command: 'redcube product status',
          readiness: 'ready',
          tags: ['fixture'],
          domain_projection: {
            action_catalog_ref: '/family_action_catalog',
            action_catalog_projection: [
              {
                action_id: 'start_deliverable',
                command_contract_id: 'start_deliverable',
              },
            ],
          },
        },
      ],
      supported_commands: ((manifest.skill_catalog as JsonRecord | undefined)?.supported_commands as unknown[] | undefined) ?? [],
      command_contracts: [],
      },
    };
  };

  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: attachCatalog(payload.product_entry_manifest as JsonRecord),
    };
  }

  return attachCatalog(payload);
}

test('family action catalog is resolved from domain manifests and exported as derived tool surfaces', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-actions-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const redcubeManifest = withFamilyActionCatalog(
    fixtures.redcube,
    buildActionCatalog(
      'redcube_ai',
      'start_deliverable',
      'stage_1',
      {
        owner: 'redcube_ai',
        title: 'Start RedCube deliverable',
        surfaceKind: 'product_entry',
        effect: 'mutating',
      },
    ),
  );
  const masManifest = withFamilyActionCatalog(
    fixtures.medautoscience,
    buildActionCatalog(
      'med-autoscience',
      'inspect_study_progress',
      'stage_1',
      {
        owner: 'med-autoscience',
        title: 'Inspect MAS study progress',
        surfaceKind: 'study_progress',
        effect: 'read_only',
      },
    ),
  );
  const masPack = createAdmittedStagePackFixture(
    masManifest,
    'med-autoscience',
    'MedAutoScience',
    { stageCount: 1 },
  );
  const magManifest = withFamilyActionCatalog(
    fixtures.medautogrant,
    buildActionCatalog(
      'med-autogrant',
      'open_grant_user_loop',
      'stage_1',
      {
        owner: 'med-autogrant',
        title: 'Open MAG user loop',
        surfaceKind: 'grant_user_loop',
        effect: 'mutating',
        mcpPublicRuntime: false,
      },
    ),
  );
  const redcubePack = createAdmittedStagePackFixture(
    redcubeManifest,
    'redcube_ai',
    'RedCubeAI',
    { stageCount: 1 },
  );
  const magPack = createAdmittedStagePackFixture(
    magManifest,
    'med-autogrant',
    'MedAutoGrant',
    { stageCount: 1 },
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      redcubePack.repoDir,
      '--manifest-command',
      buildManifestCommand(redcubePack.manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      buildManifestCommand(masPack.manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      magPack.repoDir,
      '--manifest-command',
      buildManifestCommand(magPack.manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const manifests = runCli(['domain', 'manifests'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const redcubeEntry = manifests.domain_manifests.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(redcubeEntry.status, 'resolved', JSON.stringify(redcubeEntry.error));
    assert.equal(redcubeEntry.manifest.family_action_catalog.actions[0].action_id, 'start_deliverable');

    const list = runCli(['actions', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_actions.summary.resolved_catalogs_count, 3);
    assert.equal(list.family_actions.summary.actions_count, 3);
    assert.deepEqual(
      list.family_actions.actions.map((entry: { action_id: string }) => entry.action_id).sort(),
      ['inspect_study_progress', 'open_grant_user_loop', 'start_deliverable'],
    );

    const inspect = runCli(['actions', 'inspect', '--domain', 'redcube', '--action', 'start_deliverable'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_action.action.action_id, 'start_deliverable');
    assert.equal(
      inspect.family_action.projections.cli.command,
      `opl agents run --domain redcube_ai --action start_deliverable --workspace ${redcubePack.repoDir}`,
    );
    assert.equal(inspect.family_action.projections.openai.type, 'function');
    assert.equal(inspect.family_action.parity.status, 'aligned');

    const mcpExport = runCli(['actions', 'export', '--domain', 'medautogrant', '--format', 'mcp'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(mcpExport.family_action_export.format, 'mcp');
    assert.equal(mcpExport.family_action_export.descriptors[0].name, 'open_grant_user_loop');
    assert.equal(mcpExport.family_action_export.descriptors[0].descriptor_only, true);
    assert.equal(mcpExport.family_action_export.descriptors[0].public_runtime, false);

    const openaiExport = runCli(['actions', 'export', '--domain', 'redcube', '--format', 'openai'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(openaiExport.family_action_export.descriptors[0].type, 'function');
    assert.equal(openaiExport.family_action_export.descriptors[0].function.name, 'start_deliverable');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
    fs.rmSync(magPack.repoDir, { recursive: true, force: true });
    fs.rmSync(redcubePack.repoDir, { recursive: true, force: true });
  }
});

test('family action parity accepts skill domain projection and product-entry action keys', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-actions-projection-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const redcubeManifest = withSkillDomainProjectionOnly(
    fixtures.redcube,
    buildActionCatalog(
      'redcube_ai',
      'start_deliverable',
      'stage_1',
      {
        owner: 'redcube_ai',
        title: 'Start RedCube deliverable',
        surfaceKind: 'product_entry',
        effect: 'mutating',
      },
    ),
  );
  const redcubePack = createAdmittedStagePackFixture(
    redcubeManifest,
    'redcube_ai',
    'RedCubeAI',
    { stageCount: 1 },
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      redcubePack.repoDir,
      '--manifest-command',
      buildManifestCommand(redcubePack.manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['actions', 'inspect', '--domain', 'redcube', '--action', 'start_deliverable'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(inspect.family_action.parity.status, 'aligned');
    assert.deepEqual(inspect.family_action.parity.issues, []);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(redcubePack.repoDir, { recursive: true, force: true });
  }
});
