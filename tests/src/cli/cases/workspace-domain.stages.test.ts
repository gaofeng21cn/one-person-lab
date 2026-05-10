import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function buildStageControlPlane(targetDomainId: string, stageId: string, options: {
  owner: string;
  title: string;
  stageKind: string;
  domainStageRefs: string[];
  allowedActionRefs?: string[];
}) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner: options.owner,
    authority_boundary: {
      domain_truth_owner: options.owner,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    stages: [
      {
        stage_id: stageId,
        stage_kind: options.stageKind,
        title: options.title,
        summary: `${options.title} is projected as a descriptor-only family stage.`,
        goal: `Expose ${options.title} as a family-level stage descriptor without changing domain route truth.`,
        owner: options.owner,
        domain_stage_refs: options.domainStageRefs,
        inputs: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/progress_projection',
            role: 'read_model',
          },
        ],
        skills: [
          {
            ref_kind: 'skill_id',
            ref: options.owner,
          },
        ],
        prompt_refs: [
          {
            ref_kind: 'repo_path',
            ref: 'prompts/stage.md',
          },
        ],
        allowed_action_refs: options.allowedActionRefs ?? [],
        outputs: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/session_continuity',
            role: 'handoff',
          },
        ],
        evaluation: [
          {
            ref_kind: 'json_pointer',
            ref: '/product_entry_manifest/product_entry_readiness',
            role: 'descriptor_parity',
          },
        ],
        handoff: {
          next_owner: options.owner,
          resume_surface_ref: '/product_entry_manifest/session_continuity',
        },
        authority_boundary: {
          domain_truth_owner: options.owner,
          opl_role: 'projection_consumer_only',
          no_quality_verdict: true,
        },
      },
    ],
    notes: [
      'Stage descriptors are read-only family projections.',
    ],
  };
}

function withFamilyStageControlPlane(payload: JsonRecord, plane: JsonRecord) {
  const attachPlane = (manifest: JsonRecord) => ({
    ...manifest,
    family_stage_control_plane: plane,
  });

  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: attachPlane(payload.product_entry_manifest as JsonRecord),
    };
  }

  return attachPlane(payload);
}

test('family stage control plane is resolved from domain manifests as read-only stage descriptors', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stages-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const redcubeManifest = withFamilyStageControlPlane(
    fixtures.redcube,
    buildStageControlPlane(
      'redcube_ai',
      'artifact_creation',
      {
        owner: 'redcube_ai',
        title: 'Artifact creation',
        stageKind: 'creation',
        domainStageRefs: ['author_image_pages', 'render_html', 'author_pptx_native'],
      },
    ),
  );
  const masManifest = withFamilyStageControlPlane(
    fixtures.medautoscience,
    buildStageControlPlane(
      'med-autoscience',
      'manuscript_authoring',
      {
        owner: 'med-autoscience',
        title: 'Manuscript authoring',
        stageKind: 'creation',
        domainStageRefs: ['write'],
      },
    ),
  );
  const magManifest = withFamilyStageControlPlane(
    fixtures.medautogrant,
    buildStageControlPlane(
      'med-autogrant',
      'proposal_authoring',
      {
        owner: 'med-autogrant',
        title: 'Proposal authoring',
        stageKind: 'creation',
        domainStageRefs: ['outline', 'drafting'],
      },
    ),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(redcubeManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(magManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_stages.summary.resolved_planes_count, 3);
    assert.equal(list.family_stages.summary.stages_count, 3);
    assert.deepEqual(
      list.family_stages.stages.map((entry: { stage_id: string }) => entry.stage_id).sort(),
      ['artifact_creation', 'manuscript_authoring', 'proposal_authoring'],
    );

    const inspect = runCli(['stages', 'inspect', '--domain', 'mas', '--stage', 'manuscript_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_stage.stage.stage_id, 'manuscript_authoring');
    assert.deepEqual(inspect.family_stage.stage.domain_stage_refs, ['write']);
    assert.equal(inspect.family_stage.stage.authority_boundary.opl_role, 'projection_consumer_only');
    assert.equal(inspect.family_stage.parity.status, 'aligned');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage parity detects allowed action refs missing from the action catalog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stages-drift-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withFamilyStageControlPlane(
    {
      ...(fixtures.redcube as JsonRecord),
      family_action_catalog: {
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: 'redcube_action_catalog',
        target_domain_id: 'redcube_ai',
        owner: 'redcube_ai',
        authority_boundary: {
          opl_role: 'projection_consumer_only',
        },
        actions: [
          {
            action_id: 'start_deliverable',
            title: 'Start deliverable',
            summary: 'Start the RedCube product-entry deliverable loop.',
            owner: 'redcube_ai',
            effect: 'mutating',
            source_command: {
              command: 'redcube product invoke',
              surface_kind: 'product_entry',
            },
            input_schema_ref: 'schemas/start.input.schema.json',
            output_schema_ref: 'schemas/start.output.schema.json',
            workspace_locator_fields: ['workspace_root'],
            human_gate_ids: [],
            supported_surfaces: {
              cli: {
                command: 'redcube product invoke',
                surface_kind: 'product_entry',
              },
              mcp: null,
              skill: null,
              product_entry: null,
              openai: null,
              ai_sdk: null,
            },
          },
        ],
        notes: [],
      },
    },
    buildStageControlPlane(
      'redcube_ai',
      'artifact_creation',
      {
        owner: 'redcube_ai',
        title: 'Artifact creation',
        stageKind: 'creation',
        domainStageRefs: ['author_image_pages'],
        allowedActionRefs: ['missing_action'],
      },
    ),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['stages', 'inspect', '--domain', 'redcube', '--stage', 'artifact_creation'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_stage.parity.status, 'drift_detected');
    assert.match(inspect.family_stage.parity.issues[0], /missing_action/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
