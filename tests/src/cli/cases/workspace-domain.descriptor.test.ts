import { spawnSync } from 'node:child_process';

import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return {
    ...payload,
    [field]: value,
  };
}

function withStandardSkeleton(payload: JsonRecord, agentId: string) {
  const withSkeleton = attachManifestSurface(payload, 'standard_domain_agent_skeleton', {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: agentId,
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    contracts: {
      descriptor_refs: ['contracts/domain-agent.json'],
      sidecar_refs: ['runtime/sidecar.ts'],
      quality_gate_refs: ['contracts/quality-gates.json'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  });
  return attachManifestSurface(withSkeleton, 'physical_skeleton_follow_through', {
    surface_kind: 'physical_skeleton_follow_through',
    status: 'low_risk_repo_source_follow_through_landed',
    physical_roots: [
      { boundary_id: 'agent', anchor_ref: 'agent/README.md', status: 'present_with_repo_source_entrypoint' },
      { boundary_id: 'contracts', anchor_ref: 'contracts/README.md', status: 'present_with_runtime_program_contracts' },
      { boundary_id: 'runtime', anchor_ref: 'runtime/README.md', status: 'present_with_repo_source_entrypoint' },
      { boundary_id: 'docs', anchor_ref: 'docs/status.md', status: 'present_with_owner_docs' },
    ],
    forbidden_moves: [
      'workspace_runtime_artifacts',
      'receipt_instances',
      'memory_content_body',
    ],
    direct_skill_parity_refs: [`proof:${agentId}:direct-skill-parity`],
    opl_hosted_parity_refs: [`proof:${agentId}:opl-hosted-parity`],
    replacement_parity_refs: [`proof:${agentId}:replacement-parity`],
    provenance_refs: [`docs/history/runtime-substrate/${agentId}-legacy-tombstone.md`],
    legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
    legacy_active_path_residue: [
      {
        path_family: `${agentId} legacy default path`,
        state: 'tombstone_only',
        evidence_ref: `docs/history/runtime-substrate/${agentId}-legacy-tombstone.md`,
      },
    ],
  });
}

function insertFreshProviderProof(stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], {
    OPL_STATE_DIR: stateRoot,
  });
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_descriptor_current',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    new Date().toISOString()
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

function withActionCatalog(payload: JsonRecord, targetDomainId: string, owner: string, actionId: string) {
  return attachManifestSurface(payload, 'family_action_catalog', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: {
      opl_role: 'descriptor_projection_only',
      domain_truth_owner: owner,
    },
    actions: [
      {
        action_id: actionId,
        title: actionId,
        summary: `Run ${actionId}.`,
        owner,
        effect: 'mutating',
        source_command: {
          command: `${owner} ${actionId}`,
          surface_kind: 'domain_cli',
        },
        input_schema_ref: 'contracts/input.schema.json',
        output_schema_ref: 'contracts/output.schema.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        supported_surfaces: {
          cli: {
            command: `${owner} ${actionId}`,
            surface_kind: 'domain_cli',
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
  });
}

function withStageControlPlane(payload: JsonRecord, targetDomainId: string, owner: string, stageId: string, actionId: string) {
  return attachManifestSurface(payload, 'family_stage_control_plane', {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: {
      domain_truth_owner: owner,
      opl_role: 'projection_consumer_only',
    },
    stages: [
      {
        stage_id: stageId,
        stage_kind: 'creation',
        title: stageId,
        summary: `${stageId} stage descriptor.`,
        goal: `Expose ${stageId} as a family descriptor.`,
        owner,
        domain_stage_refs: [stageId],
        inputs: [],
        knowledge_refs: [
          {
            ref_kind: 'domain_memory_ref',
            ref: `${targetDomainId}.domain_memory`,
            role: 'domain_owned_memory_locator',
          },
        ],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [actionId],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        authority_boundary: {
          domain_truth_owner: owner,
          opl_role: 'projection_consumer_only',
        },
      },
    ],
    notes: [],
  });
}

function withGrantTransitionOracle(payload: JsonRecord) {
  return attachManifestSurface(payload, 'grant_transition_oracle', {
    surface_kind: 'mag_grant_transition_oracle',
    version: 'mag-grant-transition-oracle.v1',
    oracle_id: 'mag.grant_transition.oracle.v1',
    target_domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    state: 'domain_spec_landed_external_runner_gate',
    runner_owner: 'one-person-lab',
    runner_contract_ref: 'contracts/opl-framework/family-transition-runner-contract.json',
    transition_table_status: 'landed',
    oracle_fixture_status: 'landed',
    stage_control_plane_ref: '/product_entry_manifest/family_stage_control_plane',
    action_catalog_ref: '/product_entry_manifest/family_action_catalog',
    authority_boundary: {
      domain_truth_owner: 'med-autogrant',
      fundability_verdict_owner: 'med-autogrant',
      authoring_quality_verdict_owner: 'med-autogrant',
      submission_ready_export_verdict_owner: 'med-autogrant',
      opl_role: 'generic_transition_runner_only',
      opl_can_infer_fundability_ready: false,
      opl_can_infer_authoring_quality_ready: false,
      opl_can_infer_submission_ready_export_ready: false,
      opl_can_write_grant_truth: false,
    },
    transition_table: [
      {
        transition_id: 'call_intake_complete_to_fundability_strategy',
        from_stage_id: 'call_and_candidate_intake',
        to_stage_id: 'fundability_strategy',
        guard_id: 'call_materials_and_profile_selected',
        owner_action: 'open_grant_user_loop',
        return_shape: 'domain_owner_receipt',
        receipt_requirement: 'intake_handoff_receipt',
        blocked_shape: 'typed_blocker',
      },
      {
        transition_id: 'fundability_blocked_to_human_gate',
        from_stage_id: 'fundability_strategy',
        to_stage_id: 'fundability_strategy',
        guard_id: 'fundability_blocker_requires_human_gate',
        owner_action: 'open_grant_user_loop',
        return_shape: 'typed_blocker',
        receipt_requirement: 'human_gate_receipt',
        blocked_shape: 'typed_blocker',
      },
    ],
    oracle_fixtures: [
      {
        fixture_id: 'call_intake_ready_to_fundability_strategy',
        source_stage_id: 'call_and_candidate_intake',
        input_state: {
          call_materials_status: 'complete',
          candidate_profile_status: 'selected',
        },
        expected_transition_id: 'call_intake_complete_to_fundability_strategy',
      },
      {
        fixture_id: 'fundability_blocked_requests_human_gate',
        source_stage_id: 'fundability_strategy',
        input_state: {
          fundability_verdict: 'blocked',
          human_gate: 'required',
        },
        expected_transition_id: 'fundability_blocked_to_human_gate',
      },
    ],
    validation: {
      status: 'ready_for_opl_runner_ingestion',
      transition_count: 2,
      oracle_fixture_count: 2,
      checked_stage_count: 6,
      checked_action_count: 5,
      missing_stage_refs: [],
      missing_action_refs: [],
      missing_fixture_transition_refs: [],
    },
  });
}

function withMemoryDescriptor(payload: JsonRecord, targetDomainId: string, owner: string, memoryRefId: string, family: string) {
  return attachManifestSurface(payload, 'domain_memory_descriptor', {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: memoryRefId,
    target_domain_id: targetDomainId,
    owner,
    memory_family: family,
    memory_pack_ref: {
      ref_kind: 'human_doc',
      ref: `docs/policies/${memoryRefId}.md`,
      role: 'markdown_first_memory_policy',
    },
    stage_applicability: ['idea', 'review'],
    retrieval_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_knowledge_packet',
    },
    writeback_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'stage_memory_closeout_packet',
    },
    receipt_contract_ref: {
      ref_kind: 'surface_kind',
      ref: 'memory_write_router_receipt',
    },
    writeback_receipt_locator_ref: {
      ref_kind: 'workspace_locator',
      ref: `portfolio/research_memory/${memoryRefId}/writeback_receipts`,
    },
    status: 'active',
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: owner,
      forbidden_opl_authority: [
        'memory_store_owner',
        'domain_truth_owner',
        'quality_verdict_owner',
        'artifact_authority',
      ],
      can_accept_memory_write: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_write_artifacts: false,
    },
  });
}

function withDescriptorSurfaces(payload: JsonRecord, options: {
  agentId: string;
  targetDomainId: string;
  owner: string;
  actionId: string;
  stageId: string;
  memoryRefId: string;
  memoryFamily: string;
}) {
  return withMemoryDescriptor(
    withStageControlPlane(
      withActionCatalog(
        withStandardSkeleton(payload, options.agentId),
        options.targetDomainId,
        options.owner,
        options.actionId,
      ),
      options.targetDomainId,
      options.owner,
      options.stageId,
      options.actionId,
    ),
    options.targetDomainId,
    options.owner,
    options.memoryRefId,
    options.memoryFamily,
  );
}

test('unified domain-agent descriptors aggregate entry, stage, action, memory, skill, and runtime refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-descriptor-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifests = {
    medautoscience: withDescriptorSurfaces(fixtures.medautoscience, {
      agentId: 'mas',
      targetDomainId: 'med-autoscience',
      owner: 'MedAutoScience',
      actionId: 'stage_knowledge_packet',
      stageId: 'idea',
      memoryRefId: 'mas_publication_route_memory',
      memoryFamily: 'publication_route_memory',
    }),
    medautogrant: withGrantTransitionOracle(
      withDescriptorSurfaces(fixtures.medautogrant, {
        agentId: 'mag',
        targetDomainId: 'med-autogrant',
        owner: 'MedAutoGrant',
        actionId: 'grant_strategy_packet',
        stageId: 'revision',
        memoryRefId: 'mag_grant_strategy_memory',
        memoryFamily: 'grant_strategy_memory',
      }),
    ),
    redcube: withDescriptorSurfaces(fixtures.redcube, {
      agentId: 'rca',
      targetDomainId: 'redcube_ai',
      owner: 'RedCubeAI',
      actionId: 'visual_pattern_packet',
      stageId: 'artifact_creation',
      memoryRefId: 'rca_visual_pattern_memory',
      memoryFamily: 'visual_pattern_memory',
    }),
  };

  try {
    insertFreshProviderProof(stateRoot);

    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    }

    const list = runCli(['agents', 'descriptors'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_agent_descriptors.summary.total_projects_count, 3);
    assert.equal(list.family_agent_descriptors.summary.descriptor_surfaces_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.memory_descriptor_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.stage_control_plane_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.action_catalog_resolved_count, 3);
    assert.equal(list.family_agent_descriptors.summary.physical_skeleton_evidence_observed_count, 3);
    assert.equal(list.family_agent_descriptors.summary.physical_skeleton_audit_pending_count, 0);
    assert.equal(list.family_agent_descriptors.summary.provider_temporal_residency_gap_status, 'closed_by_fresh_proven_proof');
    assert.equal(list.family_agent_descriptors.summary.production_closure_gap_count, 12);

    const mas = runCli(['agents', 'descriptor', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(mas.family_agent_descriptor.surface_kind, 'opl_domain_agent_descriptor_inspection');
    assert.equal(mas.family_agent_descriptor.descriptor_surface_kind, 'opl_domain_agent_descriptor');
    assert.equal(mas.family_agent_descriptor.descriptor_status, 'descriptor_surfaces_resolved');
    assert.equal(mas.family_agent_descriptor.entry.agent_id, 'mas');
    assert.equal(mas.family_agent_descriptor.standard_domain_agent_skeleton.status, 'aligned');
    assert.equal(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.physical_skeleton_layout_audit.status,
      'repo_source_anchor_evidence_observed',
    );
    assert.equal(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.physical_skeleton_follow_through_gate.status,
      'ready_for_supervised_physical_delete_or_history_tombstone',
    );
    assert.equal(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.physical_skeleton_follow_through_gate.delete_gate.can_execute_delete,
      false,
    );
    assert.equal(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.physical_skeleton_follow_through_gate.delete_gate.can_create_retained_legacy_entry,
      false,
    );
    assert.equal(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.physical_skeleton_follow_through_gate.checklist.retained_legacy_entries.status,
      'no_retained_legacy_entries',
    );
    assert.equal(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.production_closure_gaps.find((gap: { gap_id: string }) =>
        gap.gap_id === 'physical_repo_skeleton_reorganization'
      ).projection_status,
      'evidence_refs_observed',
    );
    assert.deepEqual(
      mas.family_agent_descriptor.standard_domain_agent_skeleton.provider_closure_evidence.external_temporal_production_residency_proof,
      {
        status: 'closed_by_fresh_proven_proof',
        provider_kind: 'temporal',
        proof_slo_status: 'proof_fresh',
        latest_closeout_status: 'production_residency_proven',
        provider_completion_is_domain_ready: false,
      },
    );
    assert.equal(mas.family_agent_descriptor.family_action_catalog.action_count, 1);
    assert.equal(mas.family_agent_descriptor.family_action_catalog.parity.status, 'aligned');
    assert.equal(mas.family_agent_descriptor.family_stage_control_plane.stage_count, 1);
    assert.equal(mas.family_agent_descriptor.family_stage_control_plane.parity.status, 'aligned');
    assert.equal(mas.family_agent_descriptor.domain_memory_descriptor.memory_ref_id, 'mas_publication_route_memory');
    assert.equal(mas.family_agent_descriptor.domain_memory_descriptor.memory_family, 'publication_route_memory');
    assert.equal(
      mas.family_agent_descriptor.domain_memory_descriptor.memory_pack_ref.ref,
      'docs/policies/mas_publication_route_memory.md',
    );
    assert.equal(mas.family_agent_descriptor.skill_catalog.skill_count, 2);
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.runtime_inventory.status, 'resolved');
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.session_continuity.status, 'resolved');
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.progress_projection.status, 'resolved');
    assert.equal(mas.family_agent_descriptor.runtime_surfaces.artifact_inventory.status, 'resolved');
    assert.equal(
      mas.family_agent_descriptor.descriptor_refs.domain_memory_descriptor.ref,
      '/domain_memory_descriptor',
    );
    assert.equal(
      mas.family_agent_descriptor.authority_boundary.descriptor_body_policy,
      'refs_and_status_only_not_memory_or_instruction_body',
    );
    assert.equal(mas.family_agent_descriptor.non_authority_flags.opl_owns_domain_memory_body, false);
    assert.equal(
      mas.family_agent_descriptor.non_authority_flags.opl_authorizes_publication_or_fundability_verdict,
      false,
    );
    assert.equal(mas.family_agent_descriptor.non_authority_flags.descriptor_embeds_longform_agent_context, false);

    const mag = runCli(['agents', 'descriptor', '--domain', 'mag'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(mag.family_agent_descriptor.grant_transition_oracle.status, 'resolved');
    assert.equal(mag.family_agent_descriptor.grant_transition_oracle.oracle_id, 'mag.grant_transition.oracle.v1');
    assert.equal(mag.family_agent_descriptor.grant_transition_oracle.runner_owner, 'one-person-lab');
    assert.equal(mag.family_agent_descriptor.grant_transition_oracle.transition_count, 2);
    assert.equal(mag.family_agent_descriptor.grant_transition_oracle.oracle_fixture_count, 2);
    assert.equal(mag.family_agent_descriptor.grant_transition_oracle.ingestion.matrix.summary.transition_applied, 2);
    assert.deepEqual(
      mag.family_agent_descriptor.grant_transition_oracle.ingestion.matrix.results.map(
        (entry: { result: { transition_id: string; next_state: string } }) => [
          entry.result.transition_id,
          entry.result.next_state,
        ],
      ),
      [
        ['call_intake_complete_to_fundability_strategy', 'fundability_strategy'],
        ['fundability_blocked_to_human_gate', 'fundability_strategy'],
      ],
    );
    assert.equal(
      mag.family_agent_descriptor.grant_transition_oracle.authority_boundary.opl_can_write_grant_truth,
      false,
    );
    assert.equal(
      mag.family_agent_descriptor.descriptor_refs.grant_transition_oracle.ref,
      '/grant_transition_oracle',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('unified domain-agent descriptor reports missing optional descriptor surfaces without failing discovery', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-descriptor-partial-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['agents', 'descriptor', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_agent_descriptor.descriptor_status, 'descriptor_surfaces_partial');
    assert.equal(inspect.family_agent_descriptor.domain_memory_descriptor.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.family_stage_control_plane.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.family_action_catalog.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.runtime_surfaces.runtime_inventory.status, 'resolved');
    assert.equal(inspect.family_agent_descriptor.non_authority_flags.opl_owns_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
