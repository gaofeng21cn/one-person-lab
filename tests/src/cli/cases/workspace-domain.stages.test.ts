import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/standard-domain-agent-scaffold-constants.ts';

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
        knowledge_refs: [
          {
            ref_kind: 'domain_memory_ref',
            ref: `${targetDomainId}.domain_memory`,
            role: 'domain_owned_memory_locator',
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
        stage_contract: {
          requires: [
            `${stageId}:input-ready`,
          ],
          ensures: [
            `${stageId}:owner-receipt-or-typed-blocker`,
          ],
          boundary_assumptions: ['domain judgment remains domain-owned'],
          properties: ['free-text-closeout-not-accepted'],
          runtime_event_refs: [],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          expected_receipt_refs: [
            {
              ref_kind: 'stage_attempt_receipt_ref',
              ref: `stage-attempt-receipt-ref:${stageId}`,
            },
          ],
          monitor_freshness_refs: [],
          replay_evidence_refs: [
            {
              ref_kind: 'replay_evidence_ref',
              ref: `replay-evidence-ref:${stageId}`,
            },
          ],
          runtime_assumptions: ['source_freshness_within_domain_policy', 'provider_slo_current_before_launch'],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: '/product_entry_manifest/runtime_inventory', role: 'runtime_assumption_monitor' }],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/product_entry_manifest/source_provenance', role: 'launch_source_scope' }],
          artifact_scope_refs: [{ ref_kind: 'json_pointer', ref: '/product_entry_manifest/artifact_inventory', role: 'launch_artifact_scope' }],
          workspace_scope_refs: [{ ref_kind: 'json_pointer', ref: '/product_entry_manifest/workspace_locator', role: 'launch_workspace_scope' }],
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
    assert.equal(list.family_stages.summary.resolved_planes_count, 4);
    assert.equal(list.family_stages.summary.stages_count, 4);
    assert.equal(list.family_stages.summary.admitted_stages_count, 1);
    assert.equal(list.family_stages.summary.needs_contracts_stages_count, 3);
    assert.deepEqual(
      list.family_stages.stages.map((entry: { stage_id: string }) => entry.stage_id).sort(),
      ['artifact_creation', 'manuscript_authoring', 'proposal_authoring', 'stage-decomposition'],
    );
    const omaStage = list.family_stages.stages.find((entry: { stage_id: string }) => entry.stage_id === 'stage-decomposition');
    assert.equal(omaStage?.project_id, 'opl-meta-agent');
    assert.equal(omaStage?.admission_status, 'admitted');
    const manuscriptStage = list.family_stages.stages.find((entry: { stage_id: string }) => entry.stage_id === 'manuscript_authoring');
    assert.equal(manuscriptStage?.admission_status, 'needs_contracts');
    assert.equal(manuscriptStage?.runtime_assumption_count, 2);
    assert.equal(manuscriptStage?.monitor_ref_count, 1);
    assert.equal(manuscriptStage?.source_scope_ref_count, 1);
    assert.equal(manuscriptStage?.artifact_scope_ref_count, 1);
    assert.equal(manuscriptStage?.workspace_scope_ref_count, 1);
    assert.equal(manuscriptStage?.guarantee_mode, 'static_admission_only');

    const inspect = runCli(['stages', 'inspect', '--domain', 'mas', '--stage', 'manuscript_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_stage.stage.stage_id, 'manuscript_authoring');
    assert.deepEqual(inspect.family_stage.stage.domain_stage_refs, ['write']);
    assert.deepEqual(inspect.family_stage.workbench_projection.knowledge_refs, [
      {
        ref_kind: 'domain_memory_ref',
        ref: 'med-autoscience.domain_memory',
        role: 'domain_owned_memory_locator',
      },
    ]);
    assert.equal(inspect.family_stage.stage.authority_boundary.opl_role, 'projection_consumer_only');
    const projection = inspect.family_stage.workbench_projection;
    assert.deepEqual(projection.scope_refs.summary, { source_scope_ref_count: 1, artifact_scope_ref_count: 1, workspace_scope_ref_count: 1 });
    assert.deepEqual(projection.runtime_assumptions, ['source_freshness_within_domain_policy', 'provider_slo_current_before_launch']);
    assert.deepEqual(projection.monitor_refs, [{ ref_kind: 'json_pointer', ref: '/product_entry_manifest/runtime_inventory', role: 'runtime_assumption_monitor' }]);
    assert.deepEqual(projection.guarantee_summary.modes, ['static_admission_only', 'domain_owned_judgment', 'observability_only']);
    assert.deepEqual(projection.monitor_summary, { runtime_assumption_count: 2, monitor_ref_count: 1, assumption_blocker_count: 0, authority_boundary: 'projection_only_no_domain_verdict_authority' });
    assert.equal(inspect.family_stage.parity.status, 'aligned');
    assert.equal(inspect.family_stage.admission.status, 'needs_contracts');
    assert.equal(inspect.family_stage.admission.inspected_stage.status, 'needs_contracts');

    const proofBundle = runCli(['stages', 'proof-bundle', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(
      proofBundle.family_stage_proof_bundle.proof_bundle.surface_kind,
      'opl_stage_pack_proof_bundle',
    );
    assert.equal(proofBundle.family_stage_proof_bundle.proof_bundle.identity.target_domain_id, 'med-autoscience');
    assert.equal(proofBundle.family_stage_proof_bundle.proof_bundle.admission_status, 'needs_contracts');
    assert.equal(
      proofBundle.family_stage_proof_bundle.proof_bundle.authority_boundary.can_write_domain_truth,
      false,
    );
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

test('family-runtime attempt create applies family stage launch admission gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-launch-gate-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
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
  const blockedRcaManifest = withFamilyStageControlPlane(
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
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(blockedRcaManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const admitted = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'manuscript_authoring',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    const admittedGate = admitted.family_runtime_stage_attempt.stage_launch_admission_gate;
    assert.equal(admitted.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(admittedGate.status, 'needs_contracts');
    assert.equal(admittedGate.gate_action, 'allow_stage_launch');
    assert.equal(
      admitted.family_runtime_stage_attempt.attempt.activity_events[0].event_kind,
      'stage_launch_admission_gate',
    );
    assert.equal(
      admitted.family_runtime_stage_attempt.attempt.activity_events[0].gate.stage_id,
      'manuscript_authoring',
    );
    assert.equal(admitted.family_runtime_stage_attempt.launch_invocation.surface_kind, 'opl_stage_launch_invocation');
    assert.equal(admitted.family_runtime_stage_attempt.launch_invocation.selected_executor_kind, 'codex_cli');
    assert.equal(admitted.family_runtime_stage_attempt.launch_invocation.executor_binding_status, 'default_codex_cli');
    assert.equal(
      admitted.family_runtime_stage_attempt.attempt.activity_events[1].event_kind,
      'stage_launch_invocation',
    );
    assert.equal(
      admitted.family_runtime_stage_attempt.attempt.activity_events[1].invocation.authority_boundary.executor_behavior_equivalence_claim,
      false,
    );

    const blocked = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'artifact_creation',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    const blockedGate = blocked.family_runtime_stage_attempt.stage_launch_admission_gate;
    assert.equal(blocked.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(blockedGate.gate_action, 'block_stage_launch');
    assert.match(blocked.family_runtime_stage_attempt.attempt.blocked_reason, /missing_action_catalog_ref/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
