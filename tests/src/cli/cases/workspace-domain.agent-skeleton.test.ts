import { spawnSync } from 'node:child_process';

import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

type JsonRecord = Record<string, unknown>;

function withStandardSkeleton(payload: JsonRecord, overrides: JsonRecord = {}) {
  const physicalSkeletonFollowThrough = {
    surface_kind: 'physical_skeleton_follow_through',
    status: 'low_risk_repo_source_follow_through_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
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
  };
  const skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    contracts: {
      descriptor_refs: ['contracts/domain-agent.json'],
      sidecar_refs: ['runtime/sidecar.py'],
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
    ...overrides,
  };
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        standard_domain_agent_skeleton: skeleton,
        physical_skeleton_follow_through: physicalSkeletonFollowThrough,
      },
    };
  }
  return {
    ...payload,
    standard_domain_agent_skeleton: skeleton,
    physical_skeleton_follow_through: physicalSkeletonFollowThrough,
  };
}

test('standard domain-agent skeleton inspection requires repo-source dirs and artifact locator boundaries', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agents-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const alignedManifest = withStandardSkeleton(fixtures.medautoscience);
  const driftManifest = withStandardSkeleton(fixtures.redcube, {
    agent_id: 'rca',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs', 'artifacts'],
      forbidden_dirs: [],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: true,
      artifact_roots_are_locators: false,
      workspace_artifact_locator_refs: [],
      runtime_artifact_locator_refs: [],
    },
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
      buildManifestCommand(alignedManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(driftManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['agents', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const inspect = runCli(['agents', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const drift = runCli(['agents', 'inspect', '--domain', 'redcube'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(list.family_agents.summary.aligned_count, 1);
    assert.equal(list.family_agents.summary.drift_detected_count, 1);
    assert.equal(inspect.family_agent.skeleton_status, 'aligned');
    assert.deepEqual(inspect.family_agent.required_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
    assert.equal(inspect.family_agent.artifact_boundary.repo_contains_real_artifacts, false);
    assert.equal(drift.family_agent.skeleton_status, 'drift_detected');
    assert.ok(drift.family_agent.issues.includes('repo_source_skeleton_must_not_include_real_artifacts_dir'));
    assert.ok(drift.family_agent.issues.includes('domain_repo_must_not_contain_real_artifacts'));
    assert.ok(drift.family_agent.issues.includes('artifact_roots_must_be_locators'));
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain-agent skeleton inspection accepts only the canonical MAS MAG RCA surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-canonical-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = {
    ...(fixtures.medautoscience as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      version: 'standard-domain-agent-skeleton.v1',
      skeleton_id: 'mas.standard_domain_agent_skeleton.v1',
      target_domain_id: 'med-autoscience',
      mapping_mode: 'contract_only_no_physical_artifact_move',
      repo_tracks_real_workspace_artifacts: false,
      physical_skeleton_layout_audit: {
        surface_kind: 'standard_domain_agent_physical_skeleton_layout_audit',
        status: 'slot_audit_landed',
        source_refs: [
          'agent/stages',
          'contracts/runtime/sidecar',
          'runtime/sidecar.py',
          'docs/active/stage_surface_standardization_program.md',
        ],
      },
      skeleton: {
        'agent/stages': ['agent/stages/stage_route_contract.yaml'],
        'agent/prompts': ['MAS app skill command contracts'],
        'agent/skills': ['medautosci domain-handler export --format json'],
        'agent/knowledge': ['stage_knowledge_packet'],
        'agent/quality_gates': ['publication_eval/latest.json'],
        'contracts/runtime/sidecar': ['mas_family_domain_handler_export'],
        'contracts/runtime/projection_builders': ['product-entry manifest provider-ready contract'],
        'contracts/runtime/lifecycle_adapters': ['workspace_runtime_artifact_root_locator'],
      },
    },
    workspace_runtime_artifact_root_locator: {
      surface_kind: 'workspace_runtime_artifact_root_locator',
      repo_root_tracks_real_artifacts: false,
      locators: {
        study_artifact_root: 'studies/<study_id>/artifacts',
        dispatch_receipts: 'artifacts/runtime/opl_family_domain_handler/dispatch_receipts',
      },
    },
  };
  const magManifest = {
    ...(fixtures.medautogrant.product_entry_manifest as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      skeleton_id: 'mag.standard_domain_agent_skeleton.v1',
      repo_source_boundary: {
        agent: { source_refs: ['src/med_autogrant/domain_entry.py'] },
        contracts: { source_refs: ['contracts/runtime-program/current-program.json'] },
        runtime: { source_refs: ['src/med_autogrant/product_entry_parts/sidecar.py'] },
        docs: { source_refs: ['docs/status.md'] },
      },
      artifact_locator_ref: '/product_entry_manifest/artifact_locator_contract',
      controlled_stage_attempt_ref: '/product_entry_manifest/controlled_stage_attempt_projection',
      artifact_locator_contract: {
        surface_kind: 'domain_artifact_locator_contract',
        locator_model: 'workspace_runtime_artifact_root_refs_only',
        repo_tracks_artifact_blobs: false,
      },
    },
    physical_skeleton_follow_through: {
      surface_kind: 'mag_physical_skeleton_follow_through',
      state: 'minimum_repo_source_anchors_landed',
      roots: {
        agent: { anchor_ref: 'agent/README.md', state: 'physical_root_present' },
        contracts: { anchor_ref: 'contracts/README.md', state: 'physical_root_present' },
        runtime: { anchor_ref: 'runtime/README.md', state: 'physical_root_present' },
        docs: { anchor_ref: 'docs/status.md', state: 'physical_root_present' },
      },
      root_status: [
        { root: 'agent', anchor_ref: 'agent/README.md', exists: true },
        { root: 'contracts', anchor_ref: 'contracts/README.md', exists: true },
        { root: 'runtime', anchor_ref: 'runtime/README.md', exists: true },
        { root: 'docs', anchor_ref: 'docs/status.md', exists: true },
      ],
      moves_workspace_artifacts: false,
      moves_runtime_receipt_instances: false,
      moves_memory_body: false,
      direct_skill_parity_refs: ['proof:mag:direct-skill-parity'],
      opl_hosted_parity_refs: ['proof:mag:opl-hosted-parity'],
      replacement_parity_refs: ['proof:mag:replacement-parity'],
      provenance_refs: ['docs/history/runtime-substrate/mag-gateway-tombstone.md'],
      legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
      legacy_active_path_residue: [
        {
          path_family: 'default Gateway active path',
          state: 'tombstone_only',
          evidence_ref: 'docs/history/runtime-substrate/mag-gateway-tombstone.md',
        },
      ],
    },
  };
  const rcaManifest = {
    ...(fixtures.redcube as JsonRecord),
    standard_domain_agent_skeleton: {
      surface_kind: 'standard_domain_agent_skeleton',
      adapter_id: 'rca.domain-agent.skeleton.adapter.v1',
      repo_source_boundary: {
        allowed_roots: [
          { boundary_id: 'agent', repo_refs: ['packages/redcube-domain-entry/src/actions/family-action-catalog.ts'] },
          { boundary_id: 'contracts', repo_refs: ['contracts/runtime-program/current-program.json'] },
          { boundary_id: 'runtime', repo_refs: ['packages/redcube-domain-entry/src/actions/domain-action-adapter.ts'] },
          { boundary_id: 'docs', repo_refs: ['docs/status.md'] },
        ],
        repo_tracks_runtime_artifact_blobs: false,
        repo_tracks_receipt_instances: false,
      },
      artifact_locator_contract: {
        surface_kind: 'artifact_locator_contract',
        locator_model: 'workspace_runtime_artifact_root_refs_only',
        repo_source_boundary: {
          repo_tracks_visual_or_export_artifact_blobs: false,
        },
      },
    },
    physical_skeleton_follow_through: {
      surface_kind: 'physical_skeleton_follow_through',
      status: 'low_risk_repo_source_follow_through_landed',
      physical_roots: [
        { boundary_id: 'agent', anchor_ref: 'agent/README.md', status: 'present_with_repo_source_entrypoint' },
        { boundary_id: 'contracts', anchor_ref: 'contracts/runtime-program/current-program.json', status: 'present_with_runtime_program_contracts' },
        { boundary_id: 'runtime', anchor_ref: 'packages/redcube-domain-entry/src/actions/domain-action-adapter.ts', status: 'present_with_repo_source_entrypoint' },
        { boundary_id: 'docs', anchor_ref: 'docs/status.md', status: 'present_with_owner_docs' },
      ],
      forbidden_moves: [
        'workspace_runtime_artifacts',
        'receipt_instances',
        'memory_content_body',
        'png_pptx_pdf_exports',
      ],
    },
  };
  const masPack = createAdmittedStagePackFixture(
    masManifest,
    'med-autoscience',
    'MedAutoScience',
  );

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
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand({ product_entry_manifest: magManifest }),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(rcaManifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const list = runCli(['agents', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const mas = runCli(['agents', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const mag = runCli(['agents', 'inspect', '--domain', 'mag'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const rca = runCli(['agents', 'inspect', '--domain', 'rca'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(list.family_agents.summary.aligned_count, 3);
    assert.equal(list.family_agents.summary.missing_count, 0);
    assert.equal(list.family_agents.summary.descriptor_aligned_count, 3);
    assert.equal(list.family_agents.summary.physical_skeleton_audit_pending_count, 0);
    assert.equal(list.family_agents.summary.physical_skeleton_evidence_observed_count, 3);
    assert.equal(list.family_agents.summary.production_closure_gap_count, 15);
    assert.equal(mas.family_agent.skeleton_status, 'aligned');
    assert.equal(mas.family_agent.skeleton_source_field, 'standard_domain_agent_skeleton');
    assert.equal(mas.family_agent.descriptor_readiness.status, 'descriptor_aligned');
    assert.equal(mas.family_agent.physical_skeleton_layout_audit.status, 'repo_source_anchor_evidence_observed');
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.required_dirs, ['agent', 'contracts', 'runtime', 'docs']);
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.missing_declared_dirs, []);
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.forbidden_declared_dirs, []);
    assert.deepEqual(mas.family_agent.physical_skeleton_layout_audit.evidence_refs, [
      'agent/stages',
      'contracts/runtime/sidecar',
      'runtime/sidecar.py',
      'docs/active/stage_surface_standardization_program.md',
    ]);
    assert.equal(
      mas.family_agent.production_closure_gaps.find((gap: { gap_id: string }) =>
        gap.gap_id === 'physical_repo_skeleton_reorganization'
      ).projection_status,
      'evidence_refs_observed',
    );
    assert.equal(mas.family_agent.physical_skeleton_layout_audit.authority_boundary.opl_role, 'read_only_layout_audit');
    assert.equal(
      mag.family_agent.physical_skeleton_follow_through_gate.status,
      'ready_for_supervised_physical_delete_or_history_tombstone',
    );
    assert.equal(
      mag.family_agent.physical_skeleton_follow_through_gate.checklist.replacement_parity.status,
      'observed',
    );
    assert.equal(mag.family_agent.physical_skeleton_follow_through_gate.delete_gate.delete_ready, true);
    assert.equal(mag.family_agent.physical_skeleton_follow_through_gate.delete_gate.can_execute_delete, false);
    assert.equal(
      mag.family_agent.physical_skeleton_follow_through_gate.delete_gate.can_execute_domain_physical_delete,
      false,
    );
    assert.equal(
      mag.family_agent.physical_skeleton_follow_through_gate.delete_gate.opl_cleanup_apply_can_execute,
      true,
    );
    assert.deepEqual(
      mas.family_agent.production_closure_gaps.map((gap: { gap_id: string }) => gap.gap_id),
      [
        'external_temporal_production_residency_proof',
        'provider_hosted_domain_soak',
        'workspace_runtime_memory_apply_receipt',
        'physical_repo_skeleton_reorganization',
        'legacy_surface_physical_retirement',
      ],
    );
    assert.equal(mag.family_agent.skeleton_source_field, 'standard_domain_agent_skeleton');
    assert.equal(rca.family_agent.skeleton_source_field, 'standard_domain_agent_skeleton');
    assert.deepEqual(rca.family_agent.declared_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
    assert.deepEqual(rca.family_agent.physical_skeleton_layout_audit.evidence_refs, [
      'agent/README.md',
      'contracts/runtime-program/current-program.json',
      'packages/redcube-domain-entry/src/actions/domain-action-adapter.ts',
      'docs/status.md',
    ]);
    assert.equal(rca.family_agent.artifact_boundary.artifact_roots_are_locators, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});

test('domain-agent skeleton read model closes provider residency gap only with fresh proven Temporal proof', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-provider-gap-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifests = [
    fixtures.medautoscience,
    { product_entry_manifest: fixtures.medautogrant },
    fixtures.redcube,
  ];

  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
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
    'evt_provider_proof_current',
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

    for (const [index, manifest] of manifests.entries()) {
      const project = ['medautoscience', 'medautogrant', 'redcube'][index];
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

    const list = runCli(['agents', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const mas = runCli(['agents', 'inspect', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(list.family_agents.summary.provider_temporal_residency_gap_status, 'closed_by_fresh_proven_proof');
    assert.equal(list.family_agents.summary.production_closure_gap_count, 12);
    assert.deepEqual(
      mas.family_agent.production_closure_gaps.map((gap: { gap_id: string }) => gap.gap_id),
      [
        'provider_hosted_domain_soak',
        'workspace_runtime_memory_apply_receipt',
        'physical_repo_skeleton_reorganization',
        'legacy_surface_physical_retirement',
      ],
    );
    assert.deepEqual(mas.family_agent.provider_closure_evidence, {
      external_temporal_production_residency_proof: {
        status: 'closed_by_fresh_proven_proof',
        provider_kind: 'temporal',
        proof_slo_status: 'proof_fresh',
        latest_closeout_status: 'production_residency_proven',
        provider_completion_is_domain_ready: false,
      },
    });
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
